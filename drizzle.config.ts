import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // Health Bridge owns these profile-schema tables. They are intentionally
  // outside the Hearth schema and must never be rename/drop candidates.
  tablesFilter: ["!health_daily", "!health_samples"],
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
