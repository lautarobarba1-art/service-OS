import type { MembershipRole } from "@prisma/client";

import { getOrganizationContext } from "@/lib/organization-context";

export class AuthorizationError extends Error {}

export async function requireOrganizationRole(allowedRoles: MembershipRole[]) {
  const { user, activeMembership } = await getOrganizationContext();

  if (!activeMembership || !allowedRoles.includes(activeMembership.role)) {
    throw new AuthorizationError("No tenés permisos para realizar esta acción.");
  }

  return {
    userId: user.id,
    organizationId: activeMembership.organizationId,
    role: activeMembership.role,
    organization: activeMembership.organization,
  };
}

export function actionError(error: unknown) {
  if (error instanceof AuthorizationError) return error.message;
  console.error("Error en operación de Fase 2:", error);
  return "No pudimos completar la operación. Intentá nuevamente.";
}
