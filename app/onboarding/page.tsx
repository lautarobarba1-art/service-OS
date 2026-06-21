import { redirect } from "next/navigation";

import { OnboardingForm } from "@/components/onboarding-form";
import { getOrganizationContext } from "@/lib/organization-context";

export default async function OnboardingPage() {
  const { activeMembership } = await getOrganizationContext();
  if (activeMembership) redirect("/dashboard");

  const timezones = Intl.supportedValuesOf("timeZone");

  return (
    <main className="onboarding-page">
      <div className="onboarding-card">
        <span className="step-badge">PASO 1 DE 1</span>
        <h1>Contanos sobre tu negocio</h1>
        <p>Crearemos tu espacio de trabajo y un recurso principal para que puedas empezar.</p>
        <OnboardingForm timezones={timezones} />
      </div>
    </main>
  );
}
