import { ResourceForm } from "@/components/resource-form";
import { ResourceTable } from "@/components/resource-table";
import { getOrganizationContext } from "@/lib/organization-context";
import { withAuthenticatedRls } from "@/lib/prisma";

export default async function ResourcesPage() {
  const { user, activeMembership } = await getOrganizationContext();
  if (!activeMembership) return null;
  const canManage = activeMembership.role === "OWNER" || activeMembership.role === "ADMIN";
  const resources = await withAuthenticatedRls(user.id, (transaction) =>
    transaction.resource.findMany({
      where: { organizationId: activeMembership.organizationId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      include: { _count: { select: { availabilityRules: true } } },
    }),
  );
  const rows = resources.map((resource) => ({
    id: resource.id,
    name: resource.name,
    type: resource.type,
    isDefault: resource.isDefault,
    isActive: resource.isActive,
    availabilityRuleCount: resource._count.availabilityRules,
  }));

  return (
    <div className="management-page">
      <header className="management-heading">
        <div>
          <p className="eyebrow">CAPACIDAD OPERATIVA</p>
          <h1>Recursos</h1>
          <p>Un recurso es algo cuya disponibilidad se consume al reservar: una persona, sala o equipo.</p>
        </div>
      </header>
      <section className="detail-card">
        <h2>Cómo se usan</h2>
        <p>Para que un recurso aparezca al crear reservas, debe estar activo y tener al menos un horario cargado en Disponibilidad.</p>
      </section>
      {canManage ? (
        <section className="creation-panel">
          <div>
            <p className="eyebrow">NUEVO RECURSO</p>
            <h2>Ampliá tu operación</h2>
          </div>
          <ResourceForm />
        </section>
      ) : (
        <p className="permission-note">Tu rol permite ver recursos, pero no modificarlos.</p>
      )}
      <section className="list-panel">
        <ResourceTable canManage={canManage} data={rows} />
      </section>
    </div>
  );
}
