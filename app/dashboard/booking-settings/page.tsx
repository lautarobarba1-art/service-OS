import { headers } from "next/headers";

import { PublicBookingSettingsForm } from "@/components/public-booking-settings-form";
import { PublicBookingSharePanel } from "@/components/public-booking-share-panel";
import { ServicePublicationForm } from "@/components/service-publication-form";
import { getOrganizationContext } from "@/lib/organization-context";
import { withAuthenticatedRls } from "@/lib/prisma";

function absolutePublicUrl(path: string, requestHeaders: Headers) {
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  if (!host) return path;
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${protocol}://${host}${path}`;
}

export default async function BookingSettingsPage() {
  const { user, activeMembership } = await getOrganizationContext();
  if (!activeMembership) return null;
  const canManage = activeMembership.role === "OWNER" || activeMembership.role === "ADMIN";
  const requestHeaders = await headers();
  const data = await withAuthenticatedRls(user.id, async (transaction) => {
    const [organization, resources, services] = await Promise.all([
      transaction.organization.findUniqueOrThrow({ where: { id: activeMembership.organizationId } }),
      transaction.resource.findMany({
        where: { organizationId: activeMembership.organizationId, isActive: true },
        select: { id: true, name: true, type: true, isDefault: true, _count: { select: { availabilityRules: true } } },
        orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      }),
      transaction.service.findMany({
        where: { organizationId: activeMembership.organizationId },
        include: {
          serviceResources: {
            include: {
              resource: { select: { id: true, isActive: true, _count: { select: { availabilityRules: true } } } },
            },
          },
        },
        orderBy: { name: "asc" },
      }),
    ]);
    return { organization, resources, services };
  });

  const publicPath = `/reservar/${data.organization.slug}`;
  const publicUrl = absolutePublicUrl(publicPath, requestHeaders);
  const activePublicServices = data.services.filter((service) => service.isActive && service.isPublic);
  const publicServicesWithResources = activePublicServices.filter((service) => service.serviceResources.length > 0);
  const publicServicesWithAvailableResources = activePublicServices.filter((service) =>
    service.serviceResources.some(({ resource }) => resource.isActive && resource._count.availabilityRules > 0),
  );
  const checklist = [
    {
      label: "Página pública habilitada",
      detail: data.organization.publicBookingEnabled ? "Los clientes pueden acceder al portal público." : "Activá la página pública desde Reglas públicas.",
      complete: data.organization.publicBookingEnabled,
    },
    {
      label: "Servicios publicados",
      detail: activePublicServices.length ? `${activePublicServices.length} servicio${activePublicServices.length === 1 ? "" : "s"} activo${activePublicServices.length === 1 ? "" : "s"} publicado${activePublicServices.length === 1 ? "" : "s"}.` : "Publicá al menos un servicio activo.",
      complete: activePublicServices.length > 0,
    },
    {
      label: "Recursos elegibles asignados",
      detail: publicServicesWithResources.length ? `${publicServicesWithResources.length} servicio${publicServicesWithResources.length === 1 ? "" : "s"} publicado${publicServicesWithResources.length === 1 ? "" : "s"} con recursos asignados.` : "Asigná al menos un recurso elegible a un servicio publicado.",
      complete: publicServicesWithResources.length > 0,
    },
    {
      label: "Disponibilidad cargada",
      detail: publicServicesWithAvailableResources.length ? "Hay recursos con horarios disponibles para generar slots." : "Cargá disponibilidad en los recursos asignados a servicios públicos.",
      complete: publicServicesWithAvailableResources.length > 0,
    },
  ];

  return (
    <div className="management-page public-booking-page">
      <header className="management-heading">
        <p className="eyebrow">AUTOMATIZACIÓN</p>
        <h1>Auto-reserva</h1>
        <p>Configurá qué servicios pueden reservar tus clientes y bajo qué reglas.</p>
      </header>
      <PublicBookingSharePanel
        checklist={checklist}
        enabled={data.organization.publicBookingEnabled}
        publicPath={publicPath}
        publicUrl={publicUrl}
      />
      {canManage ? (
        <>
          <section className="detail-card">
            <h2>Reglas públicas</h2>
            <PublicBookingSettingsForm settings={data.organization} />
          </section>
          <section className="publication-section">
            <div className="section-title">
              <p className="eyebrow">CATÁLOGO PÚBLICO</p>
              <h2>Servicios y recursos</h2>
              <p>El cliente elegirá el servicio; ServiceOS asignará el primer recurso disponible de forma determinista.</p>
            </div>
            <div className="publication-grid">
              {data.services.map((service) => (
                <ServicePublicationForm
                  key={service.id}
                  resources={data.resources}
                  service={{
                    id: service.id,
                    name: service.name,
                    isActive: service.isActive,
                    isPublic: service.isPublic,
                    resourceIds: service.serviceResources.map((item) => item.resourceId),
                  }}
                />
              ))}
            </div>
          </section>
        </>
      ) : (
        <p className="permission-note">Solo OWNER y ADMIN pueden modificar la auto-reserva.</p>
      )}
    </div>
  );
}
