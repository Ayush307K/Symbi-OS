import prisma, { type ExtendedPrismaClient } from "@/lib/prisma";

/**
 * Invalidate every issued session after a credential/session exposure.
 * Revoking rows stops active cookies immediately; incrementing tokenVersion is
 * defence in depth for any signed token whose session row was missed.
 */
export async function revokeAllSessions(
  db: ExtendedPrismaClient = prisma,
) {
  const revokedAt = new Date();
  return db.$transaction(async (tx) => {
    const [sessions, users] = await Promise.all([
      tx.session.updateMany({
        where: { revokedAt: null },
        data: { revokedAt },
      }),
      tx.user.updateMany({
        data: { tokenVersion: { increment: 1 } },
      }),
    ]);
    return {
      revokedAt,
      revokedSessions: sessions.count,
      invalidatedUsers: users.count,
    };
  });
}
