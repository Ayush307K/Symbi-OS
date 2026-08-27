import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import {
  apiError,
  ApiError,
  assertTrustedOrigin,
  parseJson,
  requireAdmin,
} from "@/server/http";

const schema = z
  .object({
    status: z
      .enum(["OPEN", "IN_PROGRESS", "WAITING_ON_USER", "RESOLVED", "CLOSED"])
      .optional(),
    resolutionNote: z.string().trim().min(3).max(3000).optional(),
    assignToSelf: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Choose a support ticket update.",
  });

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertTrustedOrigin(request);
    const auth = await requireAdmin();
    const body = await parseJson(request, schema);
    const { id } = await params;
    const current = await prisma.supportTicket.findUnique({ where: { id } });
    if (!current)
      throw new ApiError(404, "Support ticket not found.", "TICKET_NOT_FOUND");
    if (
      (body.status === "RESOLVED" || body.status === "CLOSED") &&
      !body.resolutionNote &&
      !current.resolutionNote
    ) {
      throw new ApiError(
        422,
        "Add a resolution note before resolving the ticket.",
        "RESOLUTION_REQUIRED",
      );
    }

    const nextStatus = body.status ?? current.status;
    const ticket = await prisma.$transaction(async (tx) => {
      const updated = await tx.supportTicket.update({
        where: { id },
        data: {
          status: nextStatus,
          ...(body.assignToSelf ? { assignedToId: auth.userId } : {}),
          ...(body.resolutionNote
            ? { resolutionNote: body.resolutionNote }
            : {}),
          resolvedAt:
            nextStatus === "RESOLVED" || nextStatus === "CLOSED"
              ? (current.resolvedAt ?? new Date())
              : null,
          events: {
            create: {
              actorUserId: auth.userId,
              type: body.resolutionNote ? "SUPPORT_RESPONSE" : "STATUS_CHANGED",
              note:
                body.resolutionNote ??
                `${current.status} → ${nextStatus}${body.assignToSelf ? " · assigned to self" : ""}`,
            },
          },
        },
      });
      await tx.notification.create({
        data: {
          userId: current.requesterId,
          type: "SUPPORT_TICKET_UPDATED",
          title: `Support ticket ${current.ticketNumber} updated`,
          body:
            body.resolutionNote ??
            `Your support ticket is now ${nextStatus.toLowerCase().replaceAll("_", " ")}.`,
          actionUrl: `/support?ticket=${id}`,
        },
      });
      return updated;
    });

    return NextResponse.json({ ticket });
  } catch (error) {
    return apiError(error);
  }
}
