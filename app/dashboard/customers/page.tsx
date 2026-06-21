import { CustomerForm } from "@/components/customer-form";
import { CustomerTable } from "@/components/customer-table";
import { getOrganizationContext } from "@/lib/organization-context";
import { prisma } from "@/lib/prisma";

export default async function CustomersPage() {
  const { activeMembership } = await getOrganizationContext();
  if (!activeMembership) return null;
  const canEdit = activeMembership.role !== "VIEWER";
  const canDelete = activeMembership.role === "OWNER" || activeMembership.role === "ADMIN";
  const customers = await prisma.customer.findMany({ where: { organizationId: activeMembership.organizationId }, orderBy: { createdAt: "desc" } });
  const rows = customers.map((customer) => ({ id: customer.id, fullName: customer.fullName, email: customer.email ?? "", phone: customer.phone ?? "", notes: customer.notes }));

  return (
    <div className="management-page">
      <header className="management-heading"><div><p className="eyebrow">RELACIONES</p><h1>Clientes</h1><p>Mantené los datos de contacto y notas operativas en un solo lugar.</p></div></header>
      {canEdit ? <section className="creation-panel"><div><p className="eyebrow">NUEVO CLIENTE</p><h2>Agregá un contacto</h2></div><CustomerForm /></section> : <p className="permission-note">Tu rol permite ver clientes, pero no modificarlos.</p>}
      <section className="list-panel"><CustomerTable canDelete={canDelete} canEdit={canEdit} data={rows} /></section>
    </div>
  );
}
