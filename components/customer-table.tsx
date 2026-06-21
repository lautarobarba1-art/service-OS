"use client";

import type { ColumnDef } from "@tanstack/react-table";

import { deleteCustomerAction } from "@/app/dashboard/customers/actions";
import { CustomerForm } from "@/components/customer-form";
import { DataTable } from "@/components/data-table";

export type CustomerRow = { id: string; fullName: string; email: string; phone: string; notes: string };

export function CustomerTable({ data, canEdit, canDelete }: { data: CustomerRow[]; canEdit: boolean; canDelete: boolean }) {
  const columns: ColumnDef<CustomerRow>[] = [
    { accessorKey: "fullName", header: "Cliente", cell: ({ row }) => <div className="primary-cell"><strong>{row.original.fullName}</strong><span>{row.original.notes || "Sin notas"}</span></div> },
    { accessorKey: "email", header: "Email", cell: ({ row }) => row.original.email || "—" },
    { accessorKey: "phone", header: "Teléfono", cell: ({ row }) => row.original.phone || "—" },
  ];
  if (canEdit || canDelete) columns.push({
    id: "actions", header: "", enableGlobalFilter: false, cell: ({ row }) => (
      <div className="row-actions">
        {canEdit ? <details className="row-editor"><summary>Editar</summary><div><button aria-label="Cerrar editor" className="close-editor" onClick={(event) => { const details = event.currentTarget.closest("details"); if (details) details.open = false; }} type="button">×</button><CustomerForm compact initial={row.original} /></div></details> : null}
        {canDelete ? (
          <form action={deleteCustomerAction} onSubmit={(event) => { if (!window.confirm("¿Eliminar este cliente?")) event.preventDefault(); }}>
            <input name="id" type="hidden" value={row.original.id} /><button className="text-button danger" type="submit">Eliminar</button>
          </form>
        ) : null}
      </div>
    ),
  });
  return <DataTable columns={columns} data={data} emptyMessage="Todavía no cargaste clientes." searchPlaceholder="Buscar clientes…" />;
}
