import { z } from "zod";

const commonPasswords = new Set([
  "password",
  "password123",
  "password1234",
  "qwerty123",
  "qwerty12345",
  "admin123",
  "letmein123",
  "welcome123",
  "changeme123",
  "123456789012",
]);

export const passwordSchema = z
  .string()
  .min(12, "Password must contain at least 12 characters.")
  .max(128)
  .regex(/[a-z]/, "Password must contain a lowercase letter.")
  .regex(/[A-Z]/, "Password must contain an uppercase letter.")
  .regex(/[0-9]/, "Password must contain a number.")
  .refine(
    (value) => !commonPasswords.has(value.toLowerCase()),
    "Choose a password that is not commonly used.",
  )
  .refine(
    (value) => !/(.)\1{5,}/.test(value),
    "Password contains too many repeated characters.",
  );

export const registerSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: passwordSchema,
    companyName: z.string().trim().min(2).max(160),
    industry: z.string().trim().min(2).max(120).default("General"),
    role: z.enum(["BUYER", "SELLER", "BOTH"]),
  })
  .superRefine((value, context) => {
    const password = value.password.toLowerCase();
    const emailLocal = value.email.split("@")[0];
    const companyToken = value.companyName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    if (
      (emailLocal.length >= 4 && password.includes(emailLocal)) ||
      (companyToken.length >= 4 && password.includes(companyToken))
    ) {
      context.addIssue({
        code: "custom",
        path: ["password"],
        message: "Password must not contain your email name or company name.",
      });
    }
  });

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
});

export const requestTokenSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});

export const consumeTokenSchema = z.object({
  token: z.string().min(20).max(200),
});

export const resetPasswordSchema = consumeTokenSchema.extend({
  password: passwordSchema,
});
