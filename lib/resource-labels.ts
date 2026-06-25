export type ResourceType = "PERSON" | "ROOM" | "EQUIPMENT";

export const resourceTypeLabels: Record<ResourceType, string> = {
  PERSON: "Persona",
  ROOM: "Sala",
  EQUIPMENT: "Equipo",
};

export function resourceTypeLabel(type: ResourceType) {
  return resourceTypeLabels[type];
}

export function resourceDisplayName(resource: { name: string; type: ResourceType }) {
  return `${resource.name} · ${resourceTypeLabel(resource.type)}`;
}
