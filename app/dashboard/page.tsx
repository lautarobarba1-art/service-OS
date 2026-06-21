import { getOrganizationContext } from "@/lib/organization-context";
import { prisma } from "@/lib/prisma";

export default async function DashboardPage() {
  const { activeMembership } = await getOrganizationContext();
  if (!activeMembership) return null;

  const defaultResource = await prisma.resource.findFirst({
    where: { organizationId: activeMembership.organizationId, isDefault: true },
  });

  return (
    <div className="dashboard-content">
      <div className="page-heading">
        <div><p className="eyebrow">RESUMEN</p><h1>{activeMembership.organization.name}</h1></div>
        <span className="role-badge">{activeMembership.role}</span>
      </div>
      <section className="welcome-card">
        <div><span className="checkmark">✓</span><p className="eyebrow">CONFIGURACIÓN COMPLETA</p></div>
        <h2>La base de tu espacio está lista.</h2>
        <p>Tu cuenta está protegida y vinculada a la organización. Las funciones operativas se incorporarán en las próximas fases.</p>
      </section>
      <section className="resource-card">
        <div><p className="eyebrow">RECURSO DEFAULT</p><h3>{defaultResource?.name ?? "Recurso principal"}</h3></div>
        <div className="resource-meta"><span>{defaultResource?.type ?? "PERSON"}</span><span className="active-pill">Activo</span></div>
      </section>
    </div>
  );
}
