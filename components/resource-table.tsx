"use client";

import type { ColumnDef } from "@tanstack/react-table";

import { deleteResourceAction, toggleResourceAction } from "@/app/dashboard/resources/actions";
import { DataTable } from "@/components/data-table";
import { ResourceForm } from "@/components/resource-form";
import { resourceDisplayName, resourceTypeLabel, type ResourceType } from "@/lib/resource-labels";

export type ResourceRow = {
  id: string;
  name: string;
  type: ResourceType;
  isDefault: boolean;
  isActive: boolean;
  availabilityRuleCount: number;
};

export function ResourceTable({ data, canManage }: { data: ResourceRow[]; canManage: boolean }) {
  const columns: ColumnDef<ResourceRow>[] = [
    {
      accessorKey: "name",
      header: "Recurso",
      cell: ({ row }) => (
        <div className="primary-cell">
          <strong>{resourceDisplayName(row.original)}</strong>
          {row.original.isDefault ? <span>Recurso default</span> : null}
        </div>
      ),
    },
    { accessorKey: "type", header: "Tipo", cell: ({ row }) => resourceTypeLabel(row.original.type) },
    {
      accessorKey: "availabilityRuleCount",
      header: "Disponibilidad",
      cell: ({ row }) => row.original.availabilityRuleCount > 0 ? `${row.original.availabilityRuleCount} horario${row.original.availabilityRuleCount === 1 ? "" : "s"}` : <span className="inactive-pill">Sin disponibilidad</span>,
    },
    { accessorKey: "isActive", header: "Estado", cell: ({ row }) => <span className={row.original.isActive ? "active-pill" : "inactive-pill"}>{row.original.isActive ? "Activo" : "Inactivo"}</span> },
  ];
  if (canManage) columns.push({
    id: "actions", header: "", enableGlobalFilter: false, cell: ({ row }) => (
      <div className="row-actions">
        <details className="row-editor"><summary>Editar</summary><div><button aria-label="Cerrar editor" className="close-editor" onClick={(event) => { const details = event.currentTarget.closest("details"); if (details) details.open = false; }} type="button">×</button><ResourceForm compact initial={row.original} /></div></details>
        {!row.original.isDefault ? (
          <>
            <form action={toggleResourceAction}><input name="id" type="hidden" value={row.original.id} /><button className="text-button" type="submit">{row.original.isActive ? "Desactivar" : "Activar"}</button></form>
            <form action={deleteResourceAction} onSubmit={(event) => { if (!window.confirm("¿Eliminar este recurso?")) event.preventDefault(); }}><input name="id" type="hidden" value={row.original.id} /><button className="text-button danger" type="submit">Eliminar</button></form>
          </>
        ) : <span className="locked-label">Protegido</span>}
      </div>
    ),
  });
  return <DataTable columns={columns} data={data} emptyMessage="No hay recursos para mostrar." searchPlaceholder="Buscar recursos…" />;
}
