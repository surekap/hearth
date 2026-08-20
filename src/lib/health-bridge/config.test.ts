import { afterEach, describe, expect, it } from "vitest";
import {
  externalConnectionDetails,
  healthBridgeIdentifiers,
  quoteIdentifier,
  quoteLiteral,
} from "./config";

const ENV_KEYS = [
  "HEALTH_BRIDGE_DATABASE_HOST",
  "HEALTH_BRIDGE_DATABASE_PORT",
  "HEALTH_BRIDGE_DATABASE_NAME",
  "HEALTH_BRIDGE_DATABASE_SSLMODE",
] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("Health Bridge connection configuration", () => {
  it("derives stable, valid identifiers from a profile UUID", () => {
    expect(healthBridgeIdentifiers("123e4567-e89b-12d3-a456-426614174000")).toEqual({
      schemaName: "health_bridge_123e4567e89b12d3a456426614174000",
      databaseRole: "hearth_hb_123e4567e89b12d3a456426614174000",
    });
  });

  it("rejects values that are not UUID-shaped", () => {
    expect(() => healthBridgeIdentifiers("profile-one")).toThrow("Invalid profile ID");
  });

  it("escapes PostgreSQL identifiers and string literals", () => {
    expect(quoteIdentifier('a"b')).toBe('"a""b"');
    expect(quoteLiteral("a'b")).toBe("'a''b'");
  });

  it("builds a percent-encoded TLS connection URL", () => {
    process.env.HEALTH_BRIDGE_DATABASE_HOST = "db.example.test";
    process.env.HEALTH_BRIDGE_DATABASE_PORT = "5444";
    process.env.HEALTH_BRIDGE_DATABASE_NAME = "health data";
    process.env.HEALTH_BRIDGE_DATABASE_SSLMODE = "verify-full";

    expect(
      externalConnectionDetails({
        schemaName: "health_bridge_abc",
        databaseRole: "profile user",
        password: "p@ss:/word",
      })
    ).toMatchObject({
      host: "db.example.test",
      port: 5444,
      database: "health data",
      connectionUrl:
        "postgresql://profile%20user:p%40ss%3A%2Fword@db.example.test:5444/health%20data?sslmode=verify-full",
    });
  });
});
