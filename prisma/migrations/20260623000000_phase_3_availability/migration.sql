-- Phase 3 only: weekly availability and local blocked dates.
CREATE TABLE "AvailabilityRule" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "resourceId" UUID NOT NULL,
  "dayOfWeek" INTEGER NOT NULL,
  "startTime" TIME(0) NOT NULL,
  "endTime" TIME(0) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AvailabilityRule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AvailabilityRule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE,
  CONSTRAINT "AvailabilityRule_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE,
  CONSTRAINT "AvailabilityRule_dayOfWeek_check" CHECK ("dayOfWeek" BETWEEN 0 AND 6),
  CONSTRAINT "AvailabilityRule_time_range_check" CHECK ("startTime" < "endTime")
);

CREATE TABLE "BlockedDate" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "resourceId" UUID,
  "date" DATE NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BlockedDate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BlockedDate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE,
  CONSTRAINT "BlockedDate_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE
);

CREATE INDEX "AvailabilityRule_organizationId_idx" ON "AvailabilityRule"("organizationId");
CREATE INDEX "AvailabilityRule_resourceId_dayOfWeek_idx" ON "AvailabilityRule"("resourceId", "dayOfWeek");
CREATE INDEX "BlockedDate_organizationId_date_idx" ON "BlockedDate"("organizationId", "date");
CREATE INDEX "BlockedDate_resourceId_idx" ON "BlockedDate"("resourceId");

CREATE TRIGGER availability_rule_set_updated_at BEFORE UPDATE ON "AvailabilityRule"
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE "AvailabilityRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BlockedDate" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON "AvailabilityRule", "BlockedDate" FROM anon;
GRANT SELECT, INSERT, DELETE ON "AvailabilityRule", "BlockedDate" TO authenticated;
GRANT UPDATE ("dayOfWeek", "startTime", "endTime") ON "AvailabilityRule" TO authenticated;
GRANT UPDATE ("resourceId", "date", "reason") ON "BlockedDate" TO authenticated;
GRANT ALL ON "AvailabilityRule", "BlockedDate" TO service_role;

CREATE POLICY "availability_rule_select_member" ON "AvailabilityRule"
FOR SELECT TO authenticated USING (public.is_organization_member("organizationId"));
CREATE POLICY "availability_rule_insert_admin" ON "AvailabilityRule"
FOR INSERT TO authenticated WITH CHECK (
  public.has_organization_role("organizationId", ARRAY['OWNER', 'ADMIN']::public."MembershipRole"[])
  AND EXISTS (
    SELECT 1 FROM "Resource" r
    WHERE r."id" = "AvailabilityRule"."resourceId"
      AND r."organizationId" = "AvailabilityRule"."organizationId"
  )
);
CREATE POLICY "availability_rule_update_admin" ON "AvailabilityRule"
FOR UPDATE TO authenticated
USING (public.has_organization_role("organizationId", ARRAY['OWNER', 'ADMIN']::public."MembershipRole"[]))
WITH CHECK (
  public.has_organization_role("organizationId", ARRAY['OWNER', 'ADMIN']::public."MembershipRole"[])
  AND EXISTS (
    SELECT 1 FROM "Resource" r
    WHERE r."id" = "AvailabilityRule"."resourceId"
      AND r."organizationId" = "AvailabilityRule"."organizationId"
  )
);
CREATE POLICY "availability_rule_delete_admin" ON "AvailabilityRule"
FOR DELETE TO authenticated
USING (public.has_organization_role("organizationId", ARRAY['OWNER', 'ADMIN']::public."MembershipRole"[]));

CREATE POLICY "blocked_date_select_member" ON "BlockedDate"
FOR SELECT TO authenticated USING (public.is_organization_member("organizationId"));
CREATE POLICY "blocked_date_insert_admin" ON "BlockedDate"
FOR INSERT TO authenticated WITH CHECK (
  public.has_organization_role("organizationId", ARRAY['OWNER', 'ADMIN']::public."MembershipRole"[])
  AND (
    "resourceId" IS NULL OR EXISTS (
      SELECT 1 FROM "Resource" r
      WHERE r."id" = "BlockedDate"."resourceId"
        AND r."organizationId" = "BlockedDate"."organizationId"
    )
  )
);
CREATE POLICY "blocked_date_update_admin" ON "BlockedDate"
FOR UPDATE TO authenticated
USING (public.has_organization_role("organizationId", ARRAY['OWNER', 'ADMIN']::public."MembershipRole"[]))
WITH CHECK (
  public.has_organization_role("organizationId", ARRAY['OWNER', 'ADMIN']::public."MembershipRole"[])
  AND (
    "resourceId" IS NULL OR EXISTS (
      SELECT 1 FROM "Resource" r
      WHERE r."id" = "BlockedDate"."resourceId"
        AND r."organizationId" = "BlockedDate"."organizationId"
    )
  )
);
CREATE POLICY "blocked_date_delete_admin" ON "BlockedDate"
FOR DELETE TO authenticated
USING (public.has_organization_role("organizationId", ARRAY['OWNER', 'ADMIN']::public."MembershipRole"[]));
