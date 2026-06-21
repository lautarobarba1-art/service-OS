"use client";

import { deleteAvailabilityRuleAction } from "@/app/dashboard/availability/actions";
import { AvailabilityRuleForm, DAY_NAMES } from "@/components/availability-rule-form";

export type AvailabilityRuleRow = { id: string; resourceId: string; dayOfWeek: number; startTime: string; endTime: string };

export function WeeklyAvailability({ rules, resourceId, canManage }: { rules: AvailabilityRuleRow[]; resourceId: string; canManage: boolean }) {
  return (
    <div className="week-grid">
      {DAY_NAMES.map((day, dayOfWeek) => {
        const dayRules = rules.filter((rule) => rule.dayOfWeek === dayOfWeek);
        return (
          <div className="day-row" key={day}>
            <strong>{day}</strong>
            <div className="day-slots">
              {dayRules.length ? dayRules.map((rule) => (
                <div className="time-slot" key={rule.id}>
                  <span>{rule.startTime} — {rule.endTime}</span>
                  {canManage ? (
                    <div className="slot-actions">
                      <details className="row-editor"><summary>Editar</summary><div><button aria-label="Cerrar editor" className="close-editor" onClick={(event) => { const details = event.currentTarget.closest("details"); if (details) details.open = false; }} type="button">×</button><AvailabilityRuleForm compact initial={rule} resourceId={resourceId} /></div></details>
                      <form action={deleteAvailabilityRuleAction}><input name="id" type="hidden" value={rule.id} /><button aria-label="Eliminar horario" className="slot-delete" type="submit">×</button></form>
                    </div>
                  ) : null}
                </div>
              )) : <span className="closed-day">Sin disponibilidad</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
