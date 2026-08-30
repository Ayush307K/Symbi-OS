import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { JWTPayload } from "@/lib/auth";
import type { ExtendedPrismaClient } from "@/lib/prisma";
import { sellerOrderItemInclude } from "@/server/orders/seller-order-view";
import {
  assertSafeApiResponse,
  authenticatedUserDto,
  sensitiveApiResponsePaths,
} from "@/server/security/api-response";
import { revokeAllSessions } from "@/server/security/session-revocation";

const auth: JWTPayload = {
  userId: "user-1",
  email: "buyer@example.test",
  role: "BUYER",
  companyName: "Circular Buyer",
  companyId: "company-1",
  sessionId: "session-id.session-secret",
  tokenVersion: 7,
  isAdmin: false,
};

function routeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return entry.name === "route.ts" ? [path] : [];
  });
}

describe("authenticated API response contracts", () => {
  it("serializes public identity without session validation fields", () => {
    const user = authenticatedUserDto(auth);
    expect(user).toEqual({
      userId: "user-1",
      email: "buyer@example.test",
      role: "BUYER",
      companyName: "Circular Buyer",
      companyId: "company-1",
      isAdmin: false,
    });
    expect(sensitiveApiResponsePaths(user)).toEqual([]);
  });

  it("finds sensitive keys recursively in objects and arrays", () => {
    const payload = {
      user: { passwordHash: "hash" },
      orders: [{ buyer: { sessionId: "id.secret", tokenVersion: 2 } }],
      demo: { demoPasswordResetToken: "opaque" },
    };
    expect(sensitiveApiResponsePaths(payload)).toEqual([
      "$.user.passwordHash",
      "$.orders[0].buyer.sessionId",
      "$.orders[0].buyer.tokenVersion",
      "$.demo.demoPasswordResetToken",
    ]);
    expect(() => assertSafeApiResponse(payload)).toThrow(
      "Refusing to serialize sensitive API fields",
    );
  });

  it("selects only the seller-visible buyer identity on order queries", () => {
    expect(sellerOrderItemInclude.order.select.buyer.select).toEqual({
      id: true,
      companyName: true,
    });
    expect(
      "passwordHash" in sellerOrderItemInclude.order.select.buyer.select,
    ).toBe(false);
  });

  it("does not use broad user relations or raw auth payloads in API routes", () => {
    const violations = routeFiles(join(process.cwd(), "app", "api")).flatMap(
      (file) => {
        const source = readFileSync(file, "utf8");
        const relative = file.slice(process.cwd().length + 1);
        const findings: string[] = [];
        if (/\b(?:buyer|user|requester|assignedTo):\s*true\b/.test(source)) {
          findings.push(`${relative}: broad user relation`);
        }
        if (/user:\s*(?:guard\.auth|auth)\b/.test(source)) {
          findings.push(`${relative}: raw authentication payload`);
        }
        return findings;
      },
    );
    expect(violations).toEqual([]);
  });
});

describe("global session revocation", () => {
  it("revokes session rows and increments every user token version", async () => {
    const updateSessions = vi.fn().mockResolvedValue({ count: 4 });
    const updateUsers = vi.fn().mockResolvedValue({ count: 3 });
    const db = {
      $transaction: async (
        operation: (tx: {
          session: { updateMany: typeof updateSessions };
          user: { updateMany: typeof updateUsers };
        }) => Promise<unknown>,
      ) =>
        operation({
          session: { updateMany: updateSessions },
          user: { updateMany: updateUsers },
        }),
    } as unknown as ExtendedPrismaClient;

    const result = await revokeAllSessions(db);

    expect(result).toMatchObject({ revokedSessions: 4, invalidatedUsers: 3 });
    expect(updateSessions).toHaveBeenCalledWith({
      where: { revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(updateUsers).toHaveBeenCalledWith({
      data: { tokenVersion: { increment: 1 } },
    });
  });
});
