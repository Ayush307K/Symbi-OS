import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import type { NextRequest } from "next/server";
import prisma from "@/lib/prisma";

/** What a user does in the market. Platform administration is separate. */
export type UserRole = "BUYER" | "SELLER" | "BOTH" | "ADMIN";

export interface JWTPayload {
  userId: string;
  email: string;
  role: UserRole;
  companyName: string;
  companyId: string | null;
  sessionId: string;
  tokenVersion: number;
  /**
   * Platform operator. Deliberately orthogonal to `role`: an admin still has to
   * be a BUYER or SELLER to transact, and folding the two into one string meant
   * granting admin silently revoked the ability to buy or sell.
   */
  isAdmin: boolean;
}

export function hasRole(auth: JWTPayload, role: "BUYER" | "SELLER" | "ADMIN") {
  if (role === "ADMIN") return auth.isAdmin;
  if (auth.role === "BOTH") return role === "BUYER" || role === "SELLER";
  return auth.role === role;
}

const COOKIE_NAME = "symbi_session";
const SESSION_SECONDS = 60 * 60 * 24;
const SALT_ROUNDS = 12;

function jwtSecret() {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) {
    throw new Error("JWT_SECRET must be configured with at least 32 characters.");
  }
  return new TextEncoder().encode(value);
}

function tokenHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function hashOpaqueToken(value: string) {
  return tokenHash(value);
}

export function newOpaqueToken() {
  return randomBytes(32).toString("base64url");
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function signToken(payload: JWTPayload) {
  return new SignJWT({
    email: payload.email,
    role: payload.role,
    companyName: payload.companyName,
    companyId: payload.companyId,
    sid: payload.sessionId,
    ver: payload.tokenVersion,
    adm: payload.isAdmin,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(payload.userId)
    .setIssuer("symbi-os")
    .setAudience("symbi-os-web")
    .setIssuedAt()
    .setExpirationTime(`${SESSION_SECONDS}s`)
    .sign(jwtSecret());
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, jwtSecret(), {
      issuer: "symbi-os",
      audience: "symbi-os-web",
      algorithms: ["HS256"],
    });
    if (
      !payload.sub ||
      typeof payload.email !== "string" ||
      typeof payload.role !== "string" ||
      typeof payload.companyName !== "string" ||
      typeof payload.sid !== "string" ||
      typeof payload.ver !== "number"
    ) {
      return null;
    }
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role as UserRole,
      companyName: payload.companyName,
      companyId:
        typeof payload.companyId === "string" ? payload.companyId : null,
      sessionId: payload.sid,
      // Absent on tokens issued before admin was split out; those are not admins.
      isAdmin: payload.adm === true,
      tokenVersion: payload.ver,
    };
  } catch {
    return null;
  }
}

export async function createSession(
  user: {
    id: string;
    email: string;
    role: string;
    companyName: string;
    companyId: string | null;
    tokenVersion: number;
    isAdmin?: boolean;
  },
  request?: NextRequest
) {
  const sessionSecret = newOpaqueToken();
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000);
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: tokenHash(sessionSecret),
      userAgent: request?.headers.get("user-agent")?.slice(0, 500) ?? null,
      ipHash: hashRequestIp(request),
      expiresAt,
    },
  });
  const token = await signToken({
    userId: user.id,
    email: user.email,
    role: user.role as UserRole,
    companyName: user.companyName,
    companyId: user.companyId,
    sessionId: `${session.id}.${sessionSecret}`,
    tokenVersion: user.tokenVersion,
    isAdmin: user.isAdmin === true,
  });
  await setAuthCookie(token);
  return session;
}

export async function setAuthCookie(token: string) {
  const cookieStore = await cookies();
  const configuredDomain = process.env.COOKIE_DOMAIN?.trim();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_SECONDS,
    priority: "high",
    ...(configuredDomain ? { domain: configuredDomain } : {}),
  });
}

export async function getAuthFromCookie(): Promise<JWTPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload) return null;

  const [sessionId, secret] = payload.sessionId.split(".");
  if (!sessionId || !secret) return null;
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { user: true },
  });
  if (
    !session ||
    session.revokedAt ||
    session.expiresAt <= new Date() ||
    session.tokenHash !== tokenHash(secret) ||
    session.user.accountStatus !== "ACTIVE" ||
    session.user.tokenVersion !== payload.tokenVersion
  ) {
    return null;
  }
  return payload;
}

export async function clearAuthCookie() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (token) {
    const payload = await verifyToken(token);
    const sessionId = payload?.sessionId.split(".")[0];
    if (sessionId) {
      await prisma.session
        .update({ where: { id: sessionId }, data: { revokedAt: new Date() } })
        .catch(() => undefined);
    }
  }
  cookieStore.delete(COOKIE_NAME);
}

export function hashRequestIp(request?: NextRequest) {
  if (!request) return null;
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip");
  if (!ip) return null;
  const pepper = process.env.IP_HASH_PEPPER || process.env.JWT_SECRET;
  return pepper ? tokenHash(`${pepper}:${ip}`) : null;
}
