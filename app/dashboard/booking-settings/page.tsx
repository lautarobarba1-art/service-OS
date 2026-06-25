import { PublicBookingSettingsForm } from "@/components/public-booking-settings-form";
import { ServicePublicationForm } from "@/components/service-publication-form";
import { getOrganizationContext } from "@/lib/organization-context";
import { withAuthenticatedRls } from "@/lib/prisma";

export default async function BookingSettingsPage() {
  const { user, activeMembership } = await getOrganizationContext();
  if (!activeMembership) return null;
  const canManage = activeMembership.role === "OWNER" || activeMembership.role === "ADMIN";
  const data = await withAuthenticatedRls(user.id, async (transaction) => {
    const [organization, resources, services] = await Promise.all([
      transaction.organization.findUniqueOrThrow({ where: { id: activeMembership.organizationId } }),
      transaction.resource.findMany({
        where: { organizationId: activeMembership.organizationId, isActive: true },
        select: { id: true, name: true, type: true, isDefault: true },
        orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      }),
      transaction.service.findMany({
        where: { organizationId: activeMembership.organizationId },
        include: { serviceResources: { select: { resourceId: true } } },
        orderBy: { name: "asc" },
      }),
    ]);
    return { organization, resources, services };
  });

  const publicUrl = `/reservar/${data.organization.slug}`;
  return (
    <div className="management-page public-booking-page">
      <header className="management-heading"><p className="eyebrow">AUTOMATIZACIÓN</p><h1>Auto-reserva</h1><p>Configurá qué servicios pueden reservar tus clientes y bajo qué reglas.</p></header>
      <section className="public-booking-summary">
        <div><span>URL prevista</span><strong>{publicUrl}</strong></div>
        <span className={data.organization.publicBookingEnabled ? "active-pill" : "inactive-pill"}>{data.organization.publicBookingEnabled ? "Habilitada" : "Deshabilitada"}</span>
      </section>
      {canManage ? (
        <>
          <section className="detail-card"><h2>Reglas públicas</h2><PublicBookingSettingsForm settings={data.organization} /></section>
          <section className="publication-section"><div className="section-title"><p className="eyebrow">CATÁLOGO PÚBLICO</p><h2>Servicios y recursos</h2><p>El cliente elegirá el servicio; ServiceOS asignará el primer recurso disponible de forma determinista.</p></div><div className="publication-grid">{data.services.map((service) => <ServicePublicationForm key={service.id} resources={data.resources} service={{ id: service.id, name: service.name, isActive: service.isActive, isPublic: service.isPublic, resourceIds: service.serviceResources.map((item) => item.resourceId) }} />)}</div></section>
        </>
      ) : <p className="permission-note">Solo OWNER y ADMIN pueden modificar la auto-reserva.</p>}
    </div>
  );
}
