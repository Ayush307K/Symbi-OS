import { createHash } from "node:crypto";
import { ApiError } from "@/server/http";

export async function assertPasswordNotBreached(password: string) {
  if (process.env.PASSWORD_BREACH_CHECK_ENABLED !== "true") return;
  const hash = createHash("sha1")
    .update(password)
    .digest("hex")
    .toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  let response: Response;
  try {
    response = await fetch(
      `https://api.pwnedpasswords.com/range/${prefix}`,
      {
        headers: {
          "Add-Padding": "true",
          "User-Agent": "Symbi-OS password-safety-check",
        },
        signal: AbortSignal.timeout(2500),
        cache: "no-store",
      },
    );
  } catch {
    throw new ApiError(
      503,
      "Password safety validation is temporarily unavailable. Try again.",
      "PASSWORD_BREACH_CHECK_UNAVAILABLE",
    );
  }
  if (!response.ok) {
    throw new ApiError(
      503,
      "Password safety validation is temporarily unavailable. Try again.",
      "PASSWORD_BREACH_CHECK_UNAVAILABLE",
    );
  }
  const found = (await response.text())
    .split(/\r?\n/)
    .some((line) => line.split(":")[0] === suffix);
  if (found) {
    throw new ApiError(
      422,
      "This password appears in a known breach. Choose a different password.",
      "PASSWORD_BREACHED",
      { fields: { password: "Choose a password not found in known breaches." } },
    );
  }
}
