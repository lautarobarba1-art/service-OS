import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard-shell";
import { getOrganizationContext } from "@/lib/organization-context";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, memberships, activeMembership } = await getOrganizationContext();
  if (!activeMembership) redirect("/onboarding");

  const userName =
    typeof user.user_metadata.name === "string" && user.user_metadata.name.trim()
      ? user.user_metadata.name
      : user.email?.split("@")[0] ?? "Usuario";

  return (
    <DashboardShell activeId={activeMembership.id} memberships={memberships} userName={userName}>
      {children}
    </DashboardShell>
  );
}
