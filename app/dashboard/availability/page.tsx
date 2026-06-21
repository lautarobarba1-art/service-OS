import { AvailabilityRuleForm } from "@/components/availability-rule-form";
import { BlockedDateForm } from "@/components/blocked-date-form";
import { BlockedDateList } from "@/components/blocked-date-list";
import { ResourceAvailabilitySelector } from "@/components/resource-availability-selector";
import { WeeklyAvailability } from "@/components/weekly-availability";
import { getOrganizationContext } from "@/lib/organization-context";
import { prisma } from "@/lib/prisma";
import { databaseDateToLocalDateString, databaseTimeToString } from "@/lib/timezone";

export default async function AvailabilityPage({ searchParams }: { searchParams: Promise<{ resource?: string }> }) {
  const { activeMembership } = await getOrganizationContext();
  if (!activeMembership) return null;
  const canManage = activeMembership.role === "OWNER" || activeMembership.role === "ADMIN";
  const resources = await prisma.resource.findMany({ where: { organizationId: activeMembership.organizationId }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }], select: { id: true, name: true } });
  const requestedResource = (await searchParams).resource;
  const selectedResource = resources.find((resource) => resource.id === requestedResource) ?? resources[0];
  if (!selectedResource) return <div className="management-page"><p>No hay recursos configurados.</p></div>;

  const [rules, blockedDates] = await Promise.all([
    prisma.availabilityRule.findMany({ where: { organizationId: activeMembership.organizationId, resourceId: selectedResource.id }, orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] }),
    prisma.blockedDate.findMany({ where: { organizationId: activeMembership.organizationId }, include: { resource: { select: { name: true } } }, orderBy: { date: "asc" } }),
  ]);
  const ruleRows = rules.map((rule) => ({ id: rule.id, resourceId: rule.resourceId, dayOfWeek: rule.dayOfWeek, startTime: databaseTimeToString(rule.startTime), endTime: databaseTimeToString(rule.endTime) }));
  const blockedRows = blockedDates.map((item) => ({ id: item.id, resourceId: item.resourceId ?? "", resourceName: item.resource?.name ?? "", date: databaseDateToLocalDateString(item.date), reason: item.reason ?? "" }));

  return (
    <div className="management-page availability-page">
      <header className="management-heading availability-heading"><div><p className="eyebrow">AGENDA BASE</p><h1>Disponibilidad</h1><p>Los horarios se interpretan en <strong>{activeMembership.organization.timezone}</strong>.</p></div><ResourceAvailabilitySelector resources={resources} selectedId={selectedResource.id} /></header>
      {canManage ? <section className="creation-panel"><div><p className="eyebrow">NUEVO HORARIO</p><h2>{selectedResource.name}</h2></div><AvailabilityRuleForm resourceId={selectedResource.id} /></section> : <p className="permission-note">Tu rol permite ver la disponibilidad, pero no modificarla.</p>}
      <section className="availability-panel"><div className="section-title"><p className="eyebrow">SEMANA TÍPICA</p><h2>Horarios de {selectedResource.name}</h2></div><WeeklyAvailability canManage={canManage} resourceId={selectedResource.id} rules={ruleRows} /></section>
      <section className="blocked-panel"><div><div className="section-title"><p className="eyebrow">EXCEPCIONES</p><h2>Fechas bloqueadas</h2></div>{canManage ? <BlockedDateForm resources={resources} /> : null}</div><BlockedDateList canManage={canManage} items={blockedRows} resources={resources} /></section>
    </div>
  );
}
