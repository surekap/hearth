import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // Health Bridge owns this legacy table. It is intentionally outside the
  // Hearth schema and must never be treated as a rename/drop candidate.
  tablesFilter: ["!health_daily"],
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
