"use server";

import { after } from "next/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { ActionState } from "@/lib/action-state";
import { sendWelcomeEmail } from "@/lib/email";
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

  const requestedPath = formData.get("next");
  const safePath =
    typeof requestedPath === "string" && requestedPath.startsWith("/") && !requestedPath.startsWith("//")
      ? requestedPath
      : "/dashboard";
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
  const origin = requestHeaders.get("origin");
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
  redirect("/login");
}
