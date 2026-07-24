import { and, asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { AiContext } from "./context";

export const MAX_CONVERSATION_TURNS = 12;

export async function listConversations(profileId: string, userId: string) {
  return db.query.aiConversations.findMany({
    where: and(
      eq(schema.aiConversations.profileId, profileId),
      eq(schema.aiConversations.userId, userId)
    ),
    orderBy: [desc(schema.aiConversations.updatedAt)],
    limit: 100,
  });
}

export async function getConversation(
  conversationId: string,
  profileId: string,
  userId: string
) {
  return db.query.aiConversations.findFirst({
    where: and(
      eq(schema.aiConversations.id, conversationId),
      eq(schema.aiConversations.profileId, profileId),
      eq(schema.aiConversations.userId, userId)
    ),
  });
}

export async function getConversationTurns(conversationId: string) {
  return db.query.aiContextLogs.findMany({
    where: eq(schema.aiContextLogs.conversationId, conversationId),
    orderBy: [asc(schema.aiContextLogs.createdAt)],
  });
}

export async function getRecentConversationHistory(conversationId: string) {
  const newestFirst = await db.query.aiContextLogs.findMany({
    where: eq(schema.aiContextLogs.conversationId, conversationId),
    orderBy: [desc(schema.aiContextLogs.createdAt)],
    limit: MAX_CONVERSATION_TURNS,
  });
  return newestFirst.reverse().flatMap((turn) =>
    turn.answer
      ? [{ question: turn.question, answer: turn.answer }]
      : []
  );
}

export function conversationMessages(
  turns: Awaited<ReturnType<typeof getConversationTurns>>
) {
  return turns.flatMap((turn) => {
    const context = turn.contextJson as Partial<AiContext>;
    const messages: Array<{
      role: "user" | "assistant";
      content: string;
      meta?: {
        model: string;
        observationCount: number;
        reportCount: number;
        snippetCount: number;
        timeRange: { from: string | null; to: string | null };
      };
    }> = [{ role: "user", content: turn.question }];

    if (turn.answer) {
      messages.push({
        role: "assistant",
        content: turn.answer,
        meta: {
          model: turn.model,
          observationCount: context.observations?.length ?? 0,
          reportCount: context.reports?.length ?? 0,
          snippetCount: context.documentSnippets?.length ?? 0,
          timeRange: context.timeRange ?? { from: null, to: null },
        },
      });
    }
    return messages;
  });
}
