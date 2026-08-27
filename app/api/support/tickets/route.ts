import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { apiError, requireUser } from "@/server/http";

export async function GET() {
  try {
    const auth = await requireUser();
    const tickets = await prisma.supportTicket.findMany({
      where: { requesterId: auth.userId },
      orderBy: { updatedAt: "desc" },
      take: 50,
      include: {
        assignedTo: { select: { companyName: true } },
        events: {
          orderBy: { createdAt: "asc" },
          select: { id: true, type: true, note: true, createdAt: true },
        },
      },
    });
    return NextResponse.json({ tickets });
  } catch (error) {
    return apiError(error);
  }
}
