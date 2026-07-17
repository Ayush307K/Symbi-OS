import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/marketplace";

export async function GET() {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;

  const notifications = await prisma.notification.findMany({
    where: { userId: guard.auth.userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({
    notifications,
    unreadCount: notifications.filter((item) => !item.readAt).length,
  });
}

export async function PATCH(request: NextRequest) {
  const guard = await requireAuth();
  if ("response" in guard) return guard.response;

  const body = await request.json().catch(() => null);
  if (body?.id) {
    await prisma.notification.updateMany({
      where: { id: String(body.id), userId: guard.auth.userId },
      data: { readAt: new Date() },
    });
  } else {
    await prisma.notification.updateMany({
      where: { userId: guard.auth.userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
  return NextResponse.json({ success: true });
}
