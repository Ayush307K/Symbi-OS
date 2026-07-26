import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import {
  apiError,
  ApiError,
  assertTrustedOrigin,
  parseJson,
  requireUser,
} from "@/server/http";
import { requireThreadParticipant } from "@/server/messages";

const actionSchema = z
  .object({
    action: z.enum(["MARK_READ", "CLOSE", "REOPEN", "BLOCK", "REPORT"]),
    reasonCode: z
      .enum(["SPAM", "HARASSMENT", "FRAUD", "UNSAFE_MATERIAL", "OTHER"])
      .optional(),
    details: z.string().trim().max(1000).optional(),
  })
  .strict();

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireUser();
    const { id } = await context.params;
    const thread = await requireThreadParticipant(id, auth);
    const limit = Math.min(
      100,
      Math.max(1, Number(request.nextUrl.searchParams.get("limit") ?? 40)),
    );
    const cursor = request.nextUrl.searchParams.get("cursor");
    const rows = await prisma.message.findMany({
      where: { threadId: id },
      include: {
        sender: { select: { id: true, companyName: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const nextCursor = hasMore ? page[page.length - 1]?.id ?? null : null;
    return NextResponse.json({
      thread,
      messages: page.reverse(),
      pageInfo: {
        hasMore,
        nextCursor,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertTrustedOrigin(request);
    const auth = await requireUser();
    const { id } = await context.params;
    const thread = await requireThreadParticipant(id, auth);
    const body = await parseJson(request, actionSchema);
    if (body.action === "MARK_READ") {
      await prisma.message.updateMany({
        where: {
          threadId: id,
          senderUserId: { not: auth.userId },
          readAt: null,
        },
        data: { readAt: new Date(), status: "READ" },
      });
    } else if (body.action === "CLOSE") {
      if (thread.status === "BLOCKED") {
        throw new ApiError(409, "Blocked threads cannot be changed.", "THREAD_BLOCKED");
      }
      await prisma.messageThread.update({
        where: { id },
        data: { status: "CLOSED" },
      });
    } else if (body.action === "REOPEN") {
      if (thread.status !== "CLOSED") {
        throw new ApiError(409, "Only closed threads can be reopened.", "INVALID_STATE");
      }
      await prisma.messageThread.update({
        where: { id },
        data: { status: "OPEN" },
      });
    } else {
      if (body.action === "REPORT" && !body.reasonCode) {
        throw new ApiError(422, "Choose a report reason.", "REPORT_REASON_REQUIRED");
      }
      await prisma.$transaction(async (tx) => {
        await tx.messageReport.create({
          data: {
            threadId: id,
            reporterUserId: auth.userId,
            reasonCode: body.reasonCode ?? "OTHER",
            details: body.details,
          },
        });
        if (body.action === "BLOCK") {
          await tx.messageThread.update({
            where: { id },
            data: { status: "BLOCKED" },
          });
        }
      });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
