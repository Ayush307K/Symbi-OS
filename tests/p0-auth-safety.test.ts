import { SignJWT } from "jose";
import { afterEach, describe, expect, it } from "vitest";
import { hasRole, verifyToken, type JWTPayload } from "@/lib/auth";
import { passwordSchema, registerSchema } from "@/server/auth/schemas";
import { classifyMaterialSafety } from "@/server/safety";

const secret = "0123456789abcdef0123456789abcdef";

afterEach(() => {
  delete process.env.JWT_SECRET;
});

describe("P0 account safety", () => {
  const auth = (role: JWTPayload["role"]): JWTPayload => ({
    userId: "user",
    email: "user@example.com",
    role,
    companyName: "Company",
    companyId: "company",
    sessionId: "session.secret",
    tokenVersion: 0,
  });

  it("applies the explicit role inheritance matrix", () => {
    expect(hasRole(auth("BUYER"), "BUYER")).toBe(true);
    expect(hasRole(auth("BUYER"), "SELLER")).toBe(false);
    expect(hasRole(auth("SELLER"), "BUYER")).toBe(false);
    expect(hasRole(auth("BOTH"), "BUYER")).toBe(true);
    expect(hasRole(auth("BOTH"), "SELLER")).toBe(true);
    expect(hasRole(auth("ADMIN"), "ADMIN")).toBe(true);
    expect(hasRole(auth("ADMIN"), "BUYER")).toBe(false);
  });

  it("rejects common and identity-derived passwords", () => {
    expect(passwordSchema.safeParse("Password1234").success).toBe(false);
    expect(
      registerSchema.safeParse({
        email: "ayush@example.com",
        password: "Ayush-Secure-2026",
        companyName: "Circular Works",
        industry: "Recycling",
        role: "SELLER",
      }).success,
    ).toBe(false);
  });

  it("requires an explicit role", () => {
    expect(
      registerSchema.safeParse({
        email: "buyer@example.com",
        password: "Strong-Unique-2026",
        companyName: "Buyer Works",
        industry: "Manufacturing",
      }).success,
    ).toBe(false);
  });

  it("rejects malformed, forged, and expired tokens", async () => {
    process.env.JWT_SECRET = secret;
    expect(await verifyToken("malformed")).toBeNull();
    const forged = await new SignJWT({
      email: "a@example.com",
      role: "BUYER",
      companyName: "A",
      sid: "session.secret",
      ver: 0,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user")
      .setIssuer("symbi-os")
      .setAudience("symbi-os-web")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("different-secret-different-secret-123"));
    expect(await verifyToken(forged)).toBeNull();
    const expired = await new SignJWT({
      email: "a@example.com",
      role: "BUYER",
      companyName: "A",
      sid: "session.secret",
      ver: 0,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user")
      .setIssuer("symbi-os")
      .setAudience("symbi-os-web")
      .setExpirationTime(1)
      .setIssuedAt(1)
      .sign(new TextEncoder().encode(secret));
    expect(await verifyToken(expired)).toBeNull();
  });
});

describe("P0 safety triage", () => {
  it("blocks prohibited material and flags ambiguity for manual review", () => {
    expect(
      classifyMaterialSafety({
        name: "Radioactive resin",
        category: "Plastic Scrap",
      }).outcome,
    ).toBe("BLOCKED");
    expect(
      classifyMaterialSafety({
        name: "Mixed process residue",
        category: "Non-hazardous Chemicals",
      }).outcome,
    ).toBe("MANUAL_REVIEW");
    expect(
      classifyMaterialSafety({
        name: "Clean HDPE flakes",
        category: "Plastic Scrap",
      }).outcome,
    ).toBe("ALLOWED");
  });
});
