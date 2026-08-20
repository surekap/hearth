import "server-only";

import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db, pool, schema } from "@/db";
import { decryptString, encryptString } from "@/lib/crypto";
import {
  externalConnectionDetails,
  healthBridgeIdentifiers,
  quoteIdentifier,
  quoteLiteral,
  type HealthBridgeConnectionDetails,
} from "./config";

export type HealthBridgeConnectionView = HealthBridgeConnectionDetails & {
  lastSyncedAt: Date | null;
  lastError: string | null;
};

export async function getHealthBridgeConnection(
  profileId: string
): Promise<HealthBridgeConnectionView | null> {
  const connection = await db.query.healthBridgeConnections.findFirst({
    where: eq(schema.healthBridgeConnections.profileId, profileId),
  });
  if (!connection) return null;

  return {
    ...externalConnectionDetails({
      schemaName: connection.schemaName,
      databaseRole: connection.databaseRole,
      password: decryptString(connection.encryptedPassword),
    }),
    lastSyncedAt: connection.lastSyncedAt,
    lastError: connection.lastError,
  };
}

/**
 * Create or repair the profile's private Health Bridge schema and login.
 * The encrypted password is generated once, so repeated calls return the
 * same credentials and also reconcile any missing PostgreSQL objects.
 */
export async function provisionHealthBridge(
  profileId: string
): Promise<HealthBridgeConnectionView> {
  const identifiers = healthBridgeIdentifiers(profileId);
  const client = await pool.connect();

  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [
      `hearth:health-bridge:${profileId}`,
    ]);

    const existing = await client.query<{
      encrypted_password: string;
    }>(
      `select encrypted_password
         from health_bridge_connections
        where profile_id = $1
        for update`,
      [profileId]
    );

    let encryptedPassword = existing.rows[0]?.encrypted_password;
    if (!encryptedPassword) {
      const password = randomBytes(24).toString("base64url");
      encryptedPassword = encryptString(password);
      await client.query(
        `insert into health_bridge_connections
          (profile_id, schema_name, database_role, encrypted_password)
         values ($1, $2, $3, $4)`,
        [profileId, identifiers.schemaName, identifiers.databaseRole, encryptedPassword]
      );
    } else {
      await client.query(
        `update health_bridge_connections
            set schema_name = $2,
                database_role = $3,
                updated_at = now()
          where profile_id = $1`,
        [profileId, identifiers.schemaName, identifiers.databaseRole]
      );
    }

    const password = decryptString(encryptedPassword);
    const role = quoteIdentifier(identifiers.databaseRole);
    const privateSchema = quoteIdentifier(identifiers.schemaName);
    const databaseResult = await client.query<{ database_name: string }>(
      "select current_database() as database_name"
    );
    const databaseName = databaseResult.rows[0].database_name;
    const database = quoteIdentifier(databaseName);

    const roleExists = await client.query("select 1 from pg_roles where rolname = $1", [
      identifiers.databaseRole,
    ]);
    if (!roleExists.rowCount) {
      await client.query(`create role ${role} login`);
    }

    await client.query(
      `alter role ${role} with login password ${quoteLiteral(password)} nosuperuser nocreatedb nocreaterole noinherit noreplication`
    );
    await client.query(`grant connect on database ${database} to ${role}`);
    await client.query(`create schema if not exists ${privateSchema} authorization ${role}`);
    await client.query(`alter schema ${privateSchema} owner to ${role}`);
    await client.query(`grant usage, create on schema ${privateSchema} to ${role}`);
    await client.query(`revoke all privileges on all tables in schema public from ${role}`);
    await client.query(`revoke all privileges on all sequences in schema public from ${role}`);
    await client.query(`revoke all privileges on all functions in schema public from ${role}`);
    await client.query(`revoke usage, create on schema public from ${role}`);
    await client.query(
      `alter role ${role} in database ${database} set search_path to ${privateSchema}, pg_catalog`
    );

    const exposedTables = await client.query<{ table_name: string }>(
      `select c.relname as table_name
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind in ('r', 'p', 'v', 'm')
          and (
            has_table_privilege($1, c.oid, 'SELECT')
            or has_table_privilege($1, c.oid, 'INSERT')
            or has_table_privilege($1, c.oid, 'UPDATE')
            or has_table_privilege($1, c.oid, 'DELETE')
          )
        order by c.relname`,
      [identifiers.databaseRole]
    );
    if (exposedTables.rowCount) {
      throw new Error(
        `Health Bridge role would inherit access to public tables: ${exposedTables.rows
          .map((row) => row.table_name)
          .join(", ")}`
      );
    }

    await client.query("commit");
    return {
      ...externalConnectionDetails({
        schemaName: identifiers.schemaName,
        databaseRole: identifiers.databaseRole,
        password,
      }),
      lastSyncedAt: null,
      lastError: null,
    };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
