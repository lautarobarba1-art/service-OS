"use client";

import { useActionState } from "react";

import { createOrganizationAction } from "@/app/onboarding/actions";
import { initialActionState } from "@/lib/action-state";
import { SubmitButton } from "@/components/submit-button";

export function OnboardingForm({ timezones }: { timezones: string[] }) {
  const [state, formAction] = useActionState(createOrganizationAction, initialActionState);
  const guessedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <form action={formAction} className="onboarding-form">
      <label>
        Nombre del negocio
        <input autoFocus maxLength={100} name="name" placeholder="Ej. Estudio Norte" required />
      </label>
      <label>
        Zona horaria
        <select defaultValue={timezones.includes(guessedTimezone) ? guessedTimezone : "America/Argentina/Buenos_Aires"} name="timezone" required>
          {timezones.map((timezone) => <option key={timezone} value={timezone}>{timezone.replaceAll("_", " ")}</option>)}
        </select>
      </label>
      <p className="field-help">La usaremos para mostrar correctamente reservas y disponibilidad.</p>
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      <SubmitButton>Crear organización</SubmitButton>
    </form>
  );
}
