import { NextResponse } from "next/server";
import { z } from "zod";
import { getAssistantConversation } from "@/server/assistant";
import { apiError, ApiError, requireUser } from "@/server/http";

const idSchema = z.string().uuid();

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireUser();
    const parsed = idSchema.safeParse((await params).id);
    if (!parsed.success) {
      throw new ApiError(
        404,
        "Assistant conversation not found.",
        "ASSISTANT_CONVERSATION_NOT_FOUND",
      );
    }
    const id = parsed.data;
    const result = await getAssistantConversation(auth.userId, id);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
