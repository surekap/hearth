import { Client } from "pg";

const connectionString = process.env.DATABASE_URL;
const waitMs = Number(process.env.DB_WAIT_INTERVAL_MS ?? 2000);
const maxAttempts = Number(process.env.DB_WAIT_MAX_ATTEMPTS ?? 60);

if (!connectionString) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

async function waitForDatabase() {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const client = new Client({ connectionString });
    try {
      await client.connect();
      await client.query("select 1");
      await client.end();
      console.log(`Postgres is ready after ${attempt} attempt${attempt === 1 ? "" : "s"}.`);
      return;
    } catch (error) {
      await client.end().catch(() => {});
      if (attempt === maxAttempts) {
        console.error("Postgres did not become ready in time.");
        console.error(error);
        process.exit(1);
      }
      console.log(
        `Postgres not ready yet (attempt ${attempt}/${maxAttempts}); retrying in ${waitMs}ms.`
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

waitForDatabase().catch((error) => {
  console.error("Unexpected database wait failure.");
  console.error(error);
  process.exit(1);
});
