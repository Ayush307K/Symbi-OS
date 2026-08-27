import { NextResponse } from "next/server";
import { listAssistantConversations } from "@/server/assistant";
import { apiError, requireUser } from "@/server/http";

export async function GET() {
  try {
    const auth = await requireUser();
    const items = await listAssistantConversations(auth.userId);
    return NextResponse.json(
      { items },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
