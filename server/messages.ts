import prisma from "@/lib/prisma";
import type { JWTPayload } from "@/lib/auth";
import { ApiError } from "@/server/http";

export function cleanMessage(value: string, max = 4000) {
  const text = value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
  if (text.length < 2) {
    throw new ApiError(422, "Message body is required.", "MESSAGE_REQUIRED");
  }
  if (text.length > max) {
    throw new ApiError(
      422,
      `Message must be at most ${max} characters.`,
      "MESSAGE_TOO_LONG",
    );
  }
  return text;
}

export async function requireThreadParticipant(
  threadId: string,
  auth: JWTPayload,
) {
  const thread = await prisma.messageThread.findFirst({
    where: {
      id: threadId,
      OR: [
        { buyerUserId: auth.userId },
        { sellerUserId: auth.userId },
        ...(auth.companyId ? [{ sellerCompanyId: auth.companyId }] : []),
      ],
    },
  });
  if (!thread) {
    throw new ApiError(404, "Message thread not found.", "THREAD_NOT_FOUND");
  }
  return thread;
}

export function threadRecipient(
  thread: {
    buyerUserId: string;
    sellerUserId: string | null;
  },
  actorUserId: string,
) {
  return thread.buyerUserId === actorUserId
    ? thread.sellerUserId
    : thread.buyerUserId;
}
