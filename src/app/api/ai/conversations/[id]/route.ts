import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, requireProfile, handleApiError, ApiError } from "@/lib/api";
import {
  conversationMessages,
  getConversation,
  getConversationTurns,
} from "@/lib/ai/conversations";

const querySchema = z.object({
  profileId: z.string().uuid(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await requireUser();
    const { id } = await params;
    const { profileId } = querySchema.parse({
      profileId: req.nextUrl.searchParams.get("profileId"),
    });
    await requireProfile(userId, profileId);

    const conversation = await getConversation(id, profileId, userId);
    if (!conversation) throw new ApiError(404, "Conversation not found");

    const turns = await getConversationTurns(conversation.id);
    return NextResponse.json({
      conversation: {
        id: conversation.id,
        title: conversation.title,
        updatedAt: conversation.updatedAt.toISOString(),
      },
      messages: conversationMessages(turns),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return handleApiError(error);
  }
}
