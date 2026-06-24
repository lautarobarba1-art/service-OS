import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { parseEmailOtpType, safeAuthRedirectPath } from "@/lib/auth-callback";
import { ACTIVE_MEMBERSHIP_COOKIE } from "@/lib/organization-context";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const otpType = parseEmailOtpType(request.nextUrl.searchParams.get("type"));
  const safePath = safeAuthRedirectPath(request.nextUrl.searchParams.get("next"));
  const supabase = await createClient();

  let verified = false;
  if (tokenHash && otpType) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: otpType });
    verified = !error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    verified = !error;
  }

  if (verified) {
    const cookieStore = await cookies();
    cookieStore.delete(ACTIVE_MEMBERSHIP_COOKIE);
    return NextResponse.redirect(new URL(safePath, request.url));
  }

  return NextResponse.redirect(new URL("/login?error=callback", request.url));
}
