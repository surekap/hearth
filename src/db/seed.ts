import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import * as schema from "./schema";
import { OBSERVATION_TYPE_SEEDS } from "./seed-data";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  // Observation types (idempotent upsert by canonical name)
  for (const t of OBSERVATION_TYPE_SEEDS) {
    await db
      .insert(schema.observationTypes)
      .values({
        canonicalName: t.canonicalName,
        aliases: t.aliases,
        category: t.category,
        loincCode: t.loincCode ?? null,
        normalUnit: t.normalUnit ?? null,
        ucumUnit: t.normalUnit ?? null,
        description: t.description ?? null,
      })
      .onConflictDoUpdate({
        target: schema.observationTypes.canonicalName,
        set: { aliases: t.aliases, category: t.category },
      });
  }
  console.log(`Seeded ${OBSERVATION_TYPE_SEEDS.length} observation types`);

  // Initial user
  const email = process.env.SEED_USER_EMAIL ?? "surekap@gmail.com";
  const password = process.env.SEED_USER_PASSWORD ?? "hearth-dev";
  const name = process.env.SEED_USER_NAME ?? "Prateek";

  const existing = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
  if (!existing) {
    const [user] = await db
      .insert(schema.users)
      .values({ email, name, passwordHash: await bcrypt.hash(password, 12) })
      .returning();
    await db.insert(schema.profiles).values({
      userId: user.id,
      displayName: name,
      relationship: "self",
    });
    console.log(`Created user ${email} (password from SEED_USER_PASSWORD) with a "self" profile`);
  } else {
    console.log(`User ${email} already exists, skipping`);
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
