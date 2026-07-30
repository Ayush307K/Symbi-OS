import { describe, expect, it } from "vitest";
import { loginSchema, registerSchema } from "@/server/auth/schemas";

describe("account validation", () => {
  it("normalizes email and accepts a strong password", () => {
    const value = registerSchema.parse({
      email: " OWNER@EXAMPLE.COM ",
      password: "LongEnoughPassword1",
      companyName: "Example Circular",
      industry: "Recycling",
      role: "SELLER",
    });
    expect(value.email).toBe("owner@example.com");
  });

  it.each(["short1A", "alllowercase123", "ALLUPPERCASE123", "NoNumberPassword"])(
    "rejects weak password %s",
    (password) => {
      expect(() =>
        registerSchema.parse({
          email: "owner@example.com",
          password,
          companyName: "Example Circular",
        })
      ).toThrow();
    }
  );

  it("does not require password policy during login", () => {
    expect(loginSchema.parse({ email: "a@b.com", password: "legacy" })).toBeTruthy();
  });
});
