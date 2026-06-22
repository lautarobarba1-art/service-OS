import { ResourceForm } from "@/components/resource-form";
import { ResourceTable } from "@/components/resource-table";
import { getOrganizationContext } from "@/lib/organization-context";
import { withAuthenticatedRls } from "@/lib/prisma";

export default async function ResourcesPage() {
  const { user, activeMembership } = await getOrganizationContext();
  if (!activeMembership) return null;
  const canManage = activeMembership.role === "OWNER" || activeMembership.role === "ADMIN";
  const resources = await withAuthenticatedRls(user.id, (transaction) =>
    transaction.resource.findMany({ where: { organizationId: activeMembership.organizationId }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] }),
  );
  const rows = resources.map((resource) => ({ id: resource.id, name: resource.name, type: resource.type, isDefault: resource.isDefault, isActive: resource.isActive }));

  return (
    <div className="management-page">
      <header className="management-heading"><div><p className="eyebrow">CAPACIDAD OPERATIVA</p><h1>Recursos</h1><p>Personas, salas y equipos que podrán recibir reservas.</p></div></header>
      {canManage ? <section className="creation-panel"><div><p className="eyebrow">NUEVO RECURSO</p><h2>Ampliá tu operación</h2></div><ResourceForm /></section> : <p className="permission-note">Tu rol permite ver recursos, pero no modificarlos.</p>}
      <section className="list-panel"><ResourceTable canManage={canManage} data={rows} /></section>
    </div>
  );
}
