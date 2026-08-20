export type HealthBridgeConnectionDetails = {
  host: string;
  port: number;
  database: string;
  schema: string;
  username: string;
  password: string;
  sslMode: string;
  connectionUrl: string;
};

export function healthBridgeIdentifiers(profileId: string) {
  const suffix = profileId.replaceAll("-", "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(suffix)) {
    throw new Error("Invalid profile ID");
  }
  return {
    schemaName: `health_bridge_${suffix}`,
    databaseRole: `hearth_hb_${suffix}`,
  };
}

export function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

export function quoteLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

export function externalConnectionDetails(input: {
  schemaName: string;
  databaseRole: string;
  password: string;
}): HealthBridgeConnectionDetails {
  const host = process.env.HEALTH_BRIDGE_DATABASE_HOST ?? "hetzner-docker.tail95d995.ts.net";
  const parsedPort = Number(process.env.HEALTH_BRIDGE_DATABASE_PORT ?? "5432");
  const port = Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : 5432;
  const database = process.env.HEALTH_BRIDGE_DATABASE_NAME ?? "hearth";
  const sslMode = process.env.HEALTH_BRIDGE_DATABASE_SSLMODE ?? "verify-full";
  const auth = `${encodeURIComponent(input.databaseRole)}:${encodeURIComponent(input.password)}`;
  const connectionUrl = `postgresql://${auth}@${host}:${port}/${encodeURIComponent(database)}?sslmode=${encodeURIComponent(sslMode)}`;

  return {
    host,
    port,
    database,
    schema: input.schemaName,
    username: input.databaseRole,
    password: input.password,
    sslMode,
    connectionUrl,
  };
}
