import "dotenv/config";
import prisma from "@/lib/prisma";
import { revokeAllSessions } from "@/server/security/session-revocation";

const CONFIRMATION = "REVOKE_ALL_SESSIONS";

async function main() {
  if (process.env.CONFIRM_REVOKE_ALL_SESSIONS !== CONFIRMATION) {
    throw new Error(
      `Refusing to revoke sessions. Set CONFIRM_REVOKE_ALL_SESSIONS=${CONFIRMATION} to confirm.`,
    );
  }
  const result = await revokeAllSessions(prisma);
  console.log(
    JSON.stringify({
      event: "all_sessions_revoked",
      revokedAt: result.revokedAt.toISOString(),
      revokedSessions: result.revokedSessions,
      invalidatedUsers: result.invalidatedUsers,
    }),
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
