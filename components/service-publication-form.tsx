"use client";

import { startTransition, useActionState } from "react";

import { updateServicePublicationAction } from "@/app/dashboard/booking-settings/actions";
import { OperationFormFeedback } from "@/components/operation-form-feedback";
import { initialActionState } from "@/lib/action-state";
import { resourceDisplayName, type ResourceType } from "@/lib/resource-labels";

type ResourceOption = { id: string; name: string; type: ResourceType; isDefault: boolean };

export function ServicePublicationForm({
  service,
  resources,
}: {
  service: { id: string; name: string; isActive: boolean; isPublic: boolean; resourceIds: string[] };
  resources: ResourceOption[];
}) {
  const [state, action, pending] = useActionState(updateServicePublicationAction, initialActionState);
  return (
    <form action={(formData) => startTransition(() => action(formData))} className="publication-card">
      <input name="serviceId" type="hidden" value={service.id} />
      <div className="publication-card-heading">
        <div><strong>{service.name}</strong><span>{service.isActive ? "Servicio activo" : "Servicio inactivo"}</span></div>
        <label className="compact-toggle"><input defaultChecked={service.isPublic} disabled={!service.isActive} name="isPublic" type="checkbox" /><span>Publicar</span></label>
      </div>
      <fieldset disabled={!service.isActive || pending}>
        <legend>Recursos elegibles</legend>
        {resources.length ? resources.map((resource) => (
          <label key={resource.id}>
            <input defaultChecked={service.resourceIds.includes(resource.id)} name="resourceIds" type="checkbox" value={resource.id} />
            <span>{resourceDisplayName(resource)}{resource.isDefault ? " · predeterminado" : ""}</span>
          </label>
        )) : <p>No hay recursos activos disponibles.</p>}
      </fieldset>
      <OperationFormFeedback state={state} />
      <button className="button-secondary" disabled={!service.isActive || pending} type="submit">{pending ? "Guardando…" : "Guardar publicación"}</button>
    </form>
  );
}
