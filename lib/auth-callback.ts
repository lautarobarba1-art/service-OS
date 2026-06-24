import type { EmailOtpType } from "@supabase/supabase-js";

const emailOtpTypes = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

export function safeAuthRedirectPath(value: string | null | undefined, fallback = "/dashboard") {
  if (!value?.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  try {
    const base = "https://serviceos.invalid";
    const parsed = new URL(value, base);
    return parsed.origin === base ? `${parsed.pathname}${parsed.search}${parsed.hash}` : fallback;
  } catch {
    return fallback;
  }
}

export function parseEmailOtpType(value: string | null): EmailOtpType | null {
  return value && emailOtpTypes.has(value as EmailOtpType) ? value as EmailOtpType : null;
}

export function canonicalAuthOrigin(requestOrigin: string | null) {
  const candidate = process.env.APP_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "")
    || requestOrigin
    || "";
  try {
    const url = new URL(candidate);
    return ["http:", "https:"].includes(url.protocol) ? url.origin : null;
  } catch {
    return null;
  }
}
