import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  ApiError,
  requireUser,
  requireProfile,
  handleApiError,
  logAudit,
} from "@/lib/api";
import { getAccessibleProfiles } from "@/lib/profile-access";
import { buildAiContext } from "@/lib/ai/context";
import { answerWithOpenAI, answerWithMock } from "@/lib/ai/answer";
import { tryRuleAnswer } from "@/lib/ai/rules";
import { findDocumentSnippets } from "@/lib/ai/snippets";
import { extractDatapoints, storeDatapoints } from "@/lib/ai/datapoints";
import { REDACTION_VERSION, redactPII } from "@/lib/ai/redact";
import {
  getConversation,
  getRecentConversationHistory,
} from "@/lib/ai/conversations";
import { conversationTitle } from "@/lib/ai/conversation-title";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  profileId: z.string().uuid(),
  conversationId: z.string().uuid().optional(),
  question: z.string().min(3).max(2000),
});

// Simple per-user in-memory rate limit (resets on redeploy; fine for a family app).
const lastAsk = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;

export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireUser();
    const body = bodySchema.parse(await req.json());
    await requireProfile(userId, body.profileId);
    const existingConversation = body.conversationId
      ? await getConversation(body.conversationId, body.profileId, userId)
      : null;
    if (body.conversationId && !existingConversation) {
      throw new ApiError(404, "Conversation not found");
    }

    const now = Date.now();
    const recent = (lastAsk.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
    if (recent.length >= MAX_PER_WINDOW) {
      return NextResponse.json(
        { error: "Too many questions — wait a minute and try again." },
        { status: 429 }
      );
    }
    recent.push(now);
    lastAsk.set(userId, recent);

    // Names of all family members + account holder are redaction targets.
    const [user, familyProfiles] = await Promise.all([
      db.query.users.findFirst({
        where: (u, { eq }) => eq(u.id, userId),
      }),
      getAccessibleProfiles(userId),
    ]);
    const knownNames = [
      user?.name ?? "",
      ...familyProfiles.flatMap((p) => p.displayName.split(/\s+/)),
    ].filter(Boolean);

    // Profile isolation happens inside buildAiContext, before any retrieval.
    const context = await buildAiContext(body.profileId, knownNames);
    const question = redactPII(body.question, knownNames);
    const history = existingConversation
      ? await getRecentConversationHistory(existingConversation.id)
      : [];

    // 1. Rules engine: numeric trend/latest/abnormal questions never hit the LLM.
    let result = tryRuleAnswer(question, context);

    // 2. Otherwise: attach raw-text snippets the structured data may not cover,
    //    then ask the reasoning model.
    if (!result) {
      const snippets = await findDocumentSnippets(body.profileId, question, knownNames);
      if (snippets.length > 0) context.documentSnippets = snippets;
      result = process.env.OPENAI_API_KEY
        ? await answerWithOpenAI(question, context, history)
        : answerWithMock(question, context);
    }
    const { answer, model } = result;

    // Log the exact context packet the model (or rules engine) saw.
    const persisted = await db.transaction(async (tx) => {
      let conversation = existingConversation;
      if (!conversation) {
        [conversation] = await tx
          .insert(schema.aiConversations)
          .values({
            profileId: body.profileId,
            userId,
            title: conversationTitle(question),
          })
          .returning();
      } else {
        [conversation] = await tx
          .update(schema.aiConversations)
          .set({ updatedAt: new Date() })
          .where(eq(schema.aiConversations.id, conversation.id))
          .returning();
      }

      const [contextLog] = await tx
        .insert(schema.aiContextLogs)
        .values({
          conversationId: conversation.id,
          profileId: body.profileId,
          userId,
          question,
          contextJson: context,
          redactionVersion: REDACTION_VERSION,
          model,
          answer,
        })
        .returning();

      return { conversation, contextLog };
    });

    // 3. Capture patient-reported data points from the user's message
    //    (symptoms, mood, sleep…) so they become part of the record.
    const captured = await extractDatapoints(body.question);
    const storedDatapoints = await storeDatapoints(
      body.profileId,
      persisted.contextLog.id,
      captured
    );

    await logAudit({
      userId,
      profileId: body.profileId,
      action: "ai_ask",
      detail: {
        model,
        conversationId: persisted.conversation.id,
        observations: context.observations.length,
        healthRollups: context.healthRollups.length,
        healthEvents: context.healthEvents.length,
        snippets: context.documentSnippets?.length ?? 0,
        datapointsCaptured: storedDatapoints.length,
      },
    });

    return NextResponse.json({
      answer,
      conversation: {
        id: persisted.conversation.id,
        title: persisted.conversation.title,
        updatedAt: persisted.conversation.updatedAt.toISOString(),
      },
      capturedDatapoints: storedDatapoints.map((d) => ({
        kind: d.kind,
        label: d.label,
        severity: d.severity,
      })),
      meta: {
        model,
        observationCount: context.observations.length,
        healthRollupCount: context.healthRollups.length,
        healthEventCount: context.healthEvents.length,
        reportCount: context.reports.length,
        snippetCount: context.documentSnippets?.length ?? 0,
        timeRange: context.timeRange,
        redactionVersion: REDACTION_VERSION,
      },
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues }, { status: 400 });
    }
    return handleApiError(e);
  }
}
