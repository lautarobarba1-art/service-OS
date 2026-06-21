"use client";

import Link from "next/link";
import { useActionState } from "react";

import type { ActionState } from "@/lib/action-state";
import { initialActionState } from "@/lib/action-state";
import { SubmitButton } from "@/components/submit-button";

type AuthFormProps = {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  mode: "login" | "register";
  nextPath?: string;
};

export function AuthForm({ action, mode, nextPath }: AuthFormProps) {
  const [state, formAction] = useActionState(action, initialActionState);
  const isRegister = mode === "register";

  return (
    <form action={formAction} className="auth-form">
      {isRegister ? (
        <label>
          Nombre
          <input autoComplete="name" name="name" placeholder="Tu nombre" required />
        </label>
      ) : null}
      <label>
        Email
        <input autoComplete="email" name="email" placeholder="vos@negocio.com" required type="email" />
      </label>
      <label>
        Contraseña
        <input autoComplete={isRegister ? "new-password" : "current-password"} minLength={8} name="password" required type="password" />
      </label>
      {nextPath ? <input name="next" type="hidden" value={nextPath} /> : null}
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      {state.message ? <p className="form-success" role="status">{state.message}</p> : null}
      <SubmitButton>{isRegister ? "Crear cuenta" : "Ingresar"}</SubmitButton>
      <p className="auth-switch">
        {isRegister ? "¿Ya tenés cuenta?" : "¿Primera vez en ServiceOS?"}{" "}
        <Link href={isRegister ? "/login" : "/register"}>
          {isRegister ? "Ingresá" : "Creá una cuenta"}
        </Link>
      </p>
    </form>
  );
}
