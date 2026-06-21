"use client";

import { deleteBlockedDateAction } from "@/app/dashboard/availability/actions";
import { BlockedDateForm } from "@/components/blocked-date-form";

export type BlockedDateRow = { id: string; resourceId: string; resourceName: string; date: string; reason: string };

export function BlockedDateList({ items, resources, canManage }: { items: BlockedDateRow[]; resources: Array<{ id: string; name: string }>; canManage: boolean }) {
  if (!items.length) return <p className="empty-blocks">No hay fechas bloqueadas.</p>;
  return (
    <div className="blocked-list">
      {items.map((item) => (
        <div className="blocked-item" key={item.id}>
          <div className="blocked-date-number"><strong>{item.date.slice(8, 10)}</strong><span>{item.date.slice(5, 7)}</span></div>
          <div><strong>{item.reason || "Sin motivo"}</strong><span>{item.resourceName || "Toda la organización"} · {item.date}</span></div>
          {canManage ? <div className="row-actions"><details className="row-editor"><summary>Editar</summary><div><button aria-label="Cerrar editor" className="close-editor" onClick={(event) => { const details = event.currentTarget.closest("details"); if (details) details.open = false; }} type="button">×</button><BlockedDateForm compact initial={item} resources={resources} /></div></details><form action={deleteBlockedDateAction}><input name="id" type="hidden" value={item.id} /><button className="text-button danger" type="submit">Eliminar</button></form></div> : null}
        </div>
      ))}
    </div>
  );
}
