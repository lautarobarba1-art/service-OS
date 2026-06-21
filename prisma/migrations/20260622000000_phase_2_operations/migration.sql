-- Phase 2 only: operational catalog and its audit trail.
CREATE TABLE "Service" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "durationMinutes" INTEGER NOT NULL,
  "price" DECIMAL(12,2) NOT NULL,
  "capacity" INTEGER NOT NULL DEFAULT 1,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Service_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Service_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE,
  CONSTRAINT "Service_durationMinutes_check" CHECK ("durationMinutes" > 0),
  CONSTRAINT "Service_price_check" CHECK ("price" >= 0),
  CONSTRAINT "Service_capacity_check" CHECK ("capacity" >= 1)
);

CREATE TABLE "Customer" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "fullName" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "notes" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Customer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Customer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE
);

CREATE TABLE "AuditLog" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" UUID NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE,
  CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT
);

CREATE INDEX "Service_organizationId_idx" ON "Service"("organizationId");
CREATE INDEX "Customer_organizationId_idx" ON "Customer"("organizationId");
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

CREATE TRIGGER service_set_updated_at BEFORE UPDATE ON "Service"
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER customer_set_updated_at BEFORE UPDATE ON "Customer"
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE "Service" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Customer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON "Service", "Customer", "AuditLog" FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Service", "Customer" TO authenticated;
GRANT SELECT, INSERT ON "AuditLog" TO authenticated;
GRANT ALL ON "Service", "Customer", "AuditLog" TO service_role;

-- Tenant keys and the default-resource marker are server-owned and cannot be
-- reassigned through PostgREST, even by a user who belongs to multiple tenants.
REVOKE UPDATE ON "Service", "Customer", "Resource" FROM authenticated;
GRANT UPDATE ("name", "description", "durationMinutes", "price", "capacity", "isActive") ON "Service" TO authenticated;
GRANT UPDATE ("fullName", "email", "phone", "notes") ON "Customer" TO authenticated;
GRANT UPDATE ("name", "type", "isActive") ON "Resource" TO authenticated;

CREATE POLICY "service_select_member" ON "Service"
FOR SELECT TO authenticated USING (public.is_organization_member("organizationId"));
CREATE POLICY "service_insert_admin" ON "Service"
FOR INSERT TO authenticated
WITH CHECK (public.has_organization_role("organizationId", ARRAY['OWNER', 'ADMIN']::public."MembershipRole"[]));
CREATE POLICY "service_update_admin" ON "Service"
FOR UPDATE TO authenticated
USING (public.has_organization_role("organizationId", ARRAY['OWNER', 'ADMIN']::public."MembershipRole"[]))
WITH CHECK (public.has_organization_role("organizationId", ARRAY['OWNER', 'ADMIN']::public."MembershipRole"[]));
CREATE POLICY "service_delete_admin" ON "Service"
FOR DELETE TO authenticated
USING (public.has_organization_role("organizationId", ARRAY['OWNER', 'ADMIN']::public."MembershipRole"[]));

CREATE POLICY "customer_select_member" ON "Customer"
FOR SELECT TO authenticated USING (public.is_organization_member("organizationId"));
CREATE POLICY "customer_insert_operator" ON "Customer"
FOR INSERT TO authenticated
WITH CHECK (public.has_organization_role("organizationId", ARRAY['OWNER', 'ADMIN', 'STAFF']::public."MembershipRole"[]));
CREATE POLICY "customer_update_operator" ON "Customer"
FOR UPDATE TO authenticated
USING (public.has_organization_role("organizationId", ARRAY['OWNER', 'ADMIN', 'STAFF']::public."MembershipRole"[]))
WITH CHECK (public.has_organization_role("organizationId", ARRAY['OWNER', 'ADMIN', 'STAFF']::public."MembershipRole"[]));
CREATE POLICY "customer_delete_admin" ON "Customer"
FOR DELETE TO authenticated
USING (public.has_organization_role("organizationId", ARRAY['OWNER', 'ADMIN']::public."MembershipRole"[]));

CREATE POLICY "audit_log_select_admin" ON "AuditLog"
FOR SELECT TO authenticated
USING (public.has_organization_role("organizationId", ARRAY['OWNER', 'ADMIN']::public."MembershipRole"[]));
CREATE POLICY "audit_log_insert_actor" ON "AuditLog"
FOR INSERT TO authenticated
WITH CHECK ("userId" = auth.uid() AND public.is_organization_member("organizationId"));

DROP POLICY "resource_delete_admin" ON "Resource";
CREATE POLICY "resource_delete_admin" ON "Resource"
FOR DELETE TO authenticated
USING (
  NOT "isDefault"
  AND public.has_organization_role("organizationId", ARRAY['OWNER', 'ADMIN']::public."MembershipRole"[])
);
