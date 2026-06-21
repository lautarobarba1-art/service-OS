"use client";

import type { ColumnDef } from "@tanstack/react-table";

import { toggleServiceAction } from "@/app/dashboard/services/actions";
import { DataTable } from "@/components/data-table";
import { ServiceForm } from "@/components/service-form";

export type ServiceRow = {
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  price: string;
  capacity: number;
  isActive: boolean;
};

export function ServiceTable({ data, canManage }: { data: ServiceRow[]; canManage: boolean }) {
  const columns: ColumnDef<ServiceRow>[] = [
    { accessorKey: "name", header: "Servicio", cell: ({ row }) => <div className="primary-cell"><strong>{row.original.name}</strong><span>{row.original.description || "Sin descripción"}</span></div> },
    { accessorKey: "durationMinutes", header: "Duración", cell: ({ row }) => `${row.original.durationMinutes} min` },
    { accessorKey: "price", header: "Precio", cell: ({ row }) => `$ ${row.original.price}` },
    { accessorKey: "capacity", header: "Capacidad" },
    { accessorKey: "isActive", header: "Estado", cell: ({ row }) => <span className={row.original.isActive ? "active-pill" : "inactive-pill"}>{row.original.isActive ? "Activo" : "Inactivo"}</span> },
  ];

  if (canManage) columns.push({
    id: "actions", header: "", enableGlobalFilter: false, cell: ({ row }) => (
      <div className="row-actions">
        <details className="row-editor"><summary>Editar</summary><div><button aria-label="Cerrar editor" className="close-editor" onClick={(event) => { const details = event.currentTarget.closest("details"); if (details) details.open = false; }} type="button">×</button><ServiceForm compact initial={row.original} /></div></details>
        <form action={toggleServiceAction}><input name="id" type="hidden" value={row.original.id} /><button className="text-button" type="submit">{row.original.isActive ? "Desactivar" : "Activar"}</button></form>
      </div>
    ),
  });

  return <DataTable columns={columns} data={data} emptyMessage="Todavía no cargaste servicios." searchPlaceholder="Buscar servicios…" />;
}
