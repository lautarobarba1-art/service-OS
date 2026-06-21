import { ServiceForm } from "@/components/service-form";
import { ServiceTable } from "@/components/service-table";
import { getOrganizationContext } from "@/lib/organization-context";
import { prisma } from "@/lib/prisma";

export default async function ServicesPage() {
  const { activeMembership } = await getOrganizationContext();
  if (!activeMembership) return null;
  const canManage = activeMembership.role === "OWNER" || activeMembership.role === "ADMIN";
  const services = await prisma.service.findMany({ where: { organizationId: activeMembership.organizationId }, orderBy: { createdAt: "desc" } });
  const rows = services.map((service) => ({
    id: service.id, name: service.name, description: service.description ?? "", durationMinutes: service.durationMinutes,
    price: service.price.toFixed(2), capacity: service.capacity, isActive: service.isActive,
  }));

  return (
    <div className="management-page">
      <header className="management-heading"><div><p className="eyebrow">CATÁLOGO</p><h1>Servicios</h1><p>Configurá qué ofrece tu negocio, su duración, precio y capacidad.</p></div></header>
      {canManage ? <section className="creation-panel"><div><p className="eyebrow">NUEVO SERVICIO</p><h2>Sumá una propuesta</h2></div><ServiceForm /></section> : <p className="permission-note">Tu rol permite ver servicios, pero no modificarlos.</p>}
      <section className="list-panel"><ServiceTable canManage={canManage} data={rows} /></section>
    </div>
  );
}
