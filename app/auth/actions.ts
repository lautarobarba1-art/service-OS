"use server";

import { after } from "next/server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { ActionState } from "@/lib/action-state";
import { canonicalAuthOrigin, safeAuthRedirectPath } from "@/lib/auth-callback";
import { sendWelcomeEmail } from "@/lib/email";
import { ACTIVE_MEMBERSHIP_COOKIE } from "@/lib/organization-context";
import { createClient } from "@/lib/supabase/server";

const credentialsSchema = z.object({
  email: z.email("Ingresá un email válido."),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres."),
});

const registerSchema = credentialsSchema.extend({
  name: z.string().trim().min(2, "Ingresá tu nombre."),
});

function firstError(error: z.ZodError) {
  return error.issues[0]?.message ?? "Revisá los datos ingresados.";
}

export async function loginAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) return { error: firstError(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "Email o contraseña incorrectos." };

  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_MEMBERSHIP_COOKIE);

  const requestedPath = formData.get("next");
  const safePath = safeAuthRedirectPath(typeof requestedPath === "string" ? requestedPath : null);
  redirect(safePath);
}

export async function registerAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) return { error: firstError(parsed.error) };

  const requestHeaders = await headers();
  const origin = canonicalAuthOrigin(requestHeaders.get("origin"));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { name: parsed.data.name },
      emailRedirectTo: origin ? `${origin}/auth/callback?next=/onboarding` : undefined,
    },
  });

  if (error) return { error: error.message };

  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_MEMBERSHIP_COOKIE);

  after(async () => {
    try {
      await sendWelcomeEmail(parsed.data.email, parsed.data.name);
    } catch (emailError) {
      console.error("No se pudo enviar el email de bienvenida:", emailError);
    }
  });

  if (data.session) redirect("/onboarding");
  return { message: "Cuenta creada. Revisá tu email para confirmar el registro." };
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_MEMBERSHIP_COOKIE);
  redirect("/login");
}
