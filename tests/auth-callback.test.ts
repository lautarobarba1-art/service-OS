import { describe, expect, it } from "vitest";

import { parseEmailOtpType, safeAuthRedirectPath } from "@/lib/auth-callback";

describe("auth callback validation", () => {
  it("accepts only local redirect paths", () => {
    expect(safeAuthRedirectPath("/onboarding?from=email")).toBe("/onboarding?from=email");
    expect(safeAuthRedirectPath("https://example.com")).toBe("/dashboard");
    expect(safeAuthRedirectPath("//example.com")).toBe("/dashboard");
    expect(safeAuthRedirectPath("/\\example.com")).toBe("/dashboard");
    expect(safeAuthRedirectPath(null)).toBe("/dashboard");
  });

  it("accepts supported Supabase email OTP types", () => {
    expect(parseEmailOtpType("email")).toBe("email");
    expect(parseEmailOtpType("signup")).toBe("signup");
    expect(parseEmailOtpType("sms")).toBeNull();
    expect(parseEmailOtpType(null)).toBeNull();
  });
});
