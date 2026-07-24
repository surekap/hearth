import { sql } from "drizzle-orm";
import { db } from "../src/db";

async function main() {
  const inserted = await db.execute(sql`
    insert into ai_conversations (
      id,
      profile_id,
      user_id,
      title,
      created_at,
      updated_at
    )
    select
      logs.id,
      logs.profile_id,
      logs.user_id,
      coalesce(
        nullif(
          left(regexp_replace(trim(logs.question), '[[:space:]]+', ' ', 'g'), 64),
          ''
        ),
        'Previous AI question'
      ),
      logs.created_at,
      logs.created_at
    from ai_context_logs logs
    where logs.conversation_id is null
    on conflict (id) do nothing
  `);

  const linked = await db.execute(sql`
    update ai_context_logs logs
    set conversation_id = logs.id
    from ai_conversations conversations
    where logs.conversation_id is null
      and conversations.id = logs.id
  `);

  console.log(
    `AI conversation backfill: ${inserted.rowCount ?? 0} topics created, ` +
      `${linked.rowCount ?? 0} turns linked`
  );
}

main().catch((error) => {
  console.error("AI conversation backfill failed");
  console.error(error);
  process.exit(1);
});
