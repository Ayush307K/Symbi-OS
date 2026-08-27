import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { apiError, requireAdmin } from "@/server/http";

export async function GET() {
  try {
    await requireAdmin();
    const activeTickets = await prisma.supportTicket.findMany({
      where: {
        status: { in: ["OPEN", "IN_PROGRESS", "WAITING_ON_USER"] },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
      include: {
        requester: {
          select: { id: true, email: true, companyName: true, role: true },
        },
        assignedTo: { select: { id: true, companyName: true, email: true } },
        events: {
          orderBy: { createdAt: "asc" },
          select: { id: true, type: true, note: true, createdAt: true },
        },
      },
    });
    const priorityRank: Record<string, number> = {
      URGENT: 0,
      HIGH: 1,
      NORMAL: 2,
      LOW: 3,
    };
    const tickets = activeTickets.sort(
      (left, right) =>
        (priorityRank[left.priority] ?? 4) -
          (priorityRank[right.priority] ?? 4) ||
        right.updatedAt.getTime() - left.updatedAt.getTime(),
    );
    return NextResponse.json({ tickets });
  } catch (error) {
    return apiError(error);
  }
}
