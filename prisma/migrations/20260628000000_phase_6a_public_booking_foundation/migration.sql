-- Phase 6A: public-booking contract, safe defaults and tenant configuration.
CREATE TYPE "BookingConfirmationMode" AS ENUM ('AUTO_CONFIRM', 'MANUAL_APPROVAL');
CREATE TYPE "BookingSource" AS ENUM ('INTERNAL', 'PUBLIC');

ALTER TABLE "Organization"
  ADD COLUMN "publicBookingEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "bookingConfirmationMode" "BookingConfirmationMode" NOT NULL DEFAULT 'AUTO_CONFIRM',
  ADD COLUMN "slotIntervalMinutes" INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN "minimumBookingNoticeMinutes" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN "bookingWindowDays" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN "cancellationNoticeMinutes" INTEGER NOT NULL DEFAULT 1440,
  ADD CONSTRAINT "Organization_slotIntervalMinutes_check" CHECK ("slotIntervalMinutes" BETWEEN 5 AND 120),
  ADD CONSTRAINT "Organization_minimumBookingNoticeMinutes_check" CHECK ("minimumBookingNoticeMinutes" BETWEEN 0 AND 43200),
  ADD CONSTRAINT "Organization_bookingWindowDays_check" CHECK ("bookingWindowDays" BETWEEN 1 AND 365),
  ADD CONSTRAINT "Organization_cancellationNoticeMinutes_check" CHECK ("cancellationNoticeMinutes" BETWEEN 0 AND 43200);

ALTER TABLE "Service" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "ServiceResource" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "serviceId" UUID NOT NULL,
  "resourceId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceResource_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ServiceResource_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE,
  CONSTRAINT "ServiceResource_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE,
  CONSTRAINT "ServiceResource_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "ServiceResource_serviceId_resourceId_key" ON "ServiceResource"("serviceId", "resourceId");
CREATE INDEX "ServiceResource_organizationId_idx" ON "ServiceResource"("organizationId");
CREATE INDEX "ServiceResource_resourceId_idx" ON "ServiceResource"("resourceId");

CREATE OR REPLACE FUNCTION public.enforce_service_resource_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public."Service" s
    WHERE s."id" = NEW."serviceId" AND s."organizationId" = NEW."organizationId"
  ) THEN
    RAISE EXCEPTION 'El servicio no pertenece a la organización.' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public."Resource" r
    WHERE r."id" = NEW."resourceId" AND r."organizationId" = NEW."organizationId"
  ) THEN
    RAISE EXCEPTION 'El recurso no pertenece a la organización.' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_service_resource_tenant() FROM PUBLIC;

CREATE TRIGGER service_resource_enforce_tenant
BEFORE INSERT OR UPDATE OF "organizationId", "serviceId", "resourceId" ON "ServiceResource"
FOR EACH ROW EXECUTE FUNCTION public.enforce_service_resource_tenant();

CREATE TABLE "PublicRateLimit" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "keyHash" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "windowStart" TIMESTAMPTZ(6) NOT NULL,
  "requestCount" INTEGER NOT NULL DEFAULT 1,
  "expiresAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "PublicRateLimit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PublicRateLimit_requestCount_check" CHECK ("requestCount" >= 1),
  CONSTRAINT "PublicRateLimit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "PublicRateLimit_organizationId_keyHash_action_windowStart_key"
ON "PublicRateLimit"("organizationId", "keyHash", "action", "windowStart");
CREATE INDEX "PublicRateLimit_expiresAt_idx" ON "PublicRateLimit"("expiresAt");

CREATE OR REPLACE FUNCTION public.generate_booking_reference()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
DECLARE
  alphabet CONSTANT TEXT := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  -- Use PostgreSQL core UUID entropy instead of pgcrypto's schema-dependent
  -- gen_random_bytes (public locally, extensions on hosted Supabase).
  random_bytes BYTEA :=
    substring(pg_catalog.uuid_send(pg_catalog.gen_random_uuid()) FROM 1 FOR 6) ||
    substring(pg_catalog.uuid_send(pg_catalog.gen_random_uuid()) FROM 1 FOR 6);
  result TEXT := '';
  position INTEGER;
BEGIN
  FOR position IN 0..11 LOOP
    result := result || substr(alphabet, (get_byte(random_bytes, position) % 32) + 1, 1);
  END LOOP;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_booking_reference() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_booking_reference() TO authenticated, service_role;

ALTER TABLE "Booking"
  ADD COLUMN "source" "BookingSource" NOT NULL DEFAULT 'INTERNAL',
  ADD COLUMN "referenceCode" TEXT,
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "idempotencyPayloadHash" TEXT,
  ADD COLUMN "manageTokenHash" TEXT,
  ADD COLUMN "manageTokenExpiresAt" TIMESTAMPTZ(6);

UPDATE "Booking" SET "referenceCode" = public.generate_booking_reference() WHERE "referenceCode" IS NULL;
ALTER TABLE "Booking" ALTER COLUMN "referenceCode" SET NOT NULL;
ALTER TABLE "Booking" ALTER COLUMN "referenceCode" SET DEFAULT public.generate_booking_reference();

CREATE UNIQUE INDEX "Booking_referenceCode_key" ON "Booking"("referenceCode");
CREATE UNIQUE INDEX "Booking_manageTokenHash_key" ON "Booking"("manageTokenHash");
CREATE UNIQUE INDEX "Booking_organizationId_idempotencyKey_key" ON "Booking"("organizationId", "idempotencyKey");

CREATE OR REPLACE FUNCTION public.enforce_internal_booking_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user = 'authenticated' THEN
    NEW."source" := 'INTERNAL';
    NEW."createdAt" := now();
    NEW."updatedAt" := now();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_internal_booking_metadata() FROM PUBLIC;

CREATE TRIGGER booking_enforce_internal_metadata
BEFORE INSERT ON "Booking"
FOR EACH ROW EXECUTE FUNCTION public.enforce_internal_booking_metadata();

ALTER TABLE "ServiceResource" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PublicRateLimit" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON "ServiceResource", "PublicRateLimit" FROM anon;
REVOKE ALL ON "PublicRateLimit" FROM authenticated;
GRANT SELECT, INSERT, DELETE ON "ServiceResource" TO authenticated;
GRANT ALL ON "ServiceResource", "PublicRateLimit" TO service_role;
GRANT UPDATE ("isPublic") ON "Service" TO authenticated;

-- Restrict authenticated inserts to the internal booking contract. Public
-- metadata remains owned by trusted server code in later phases.
REVOKE INSERT ON "Booking" FROM authenticated;
GRANT INSERT (
  "organizationId", "customerId", "serviceId", "resourceId",
  "startDateTime", "endDateTime", "attendeesCount", "status",
  "paymentStatus", "notes", "source", "createdAt", "updatedAt"
) ON "Booking" TO authenticated;

CREATE POLICY "service_resource_select_member" ON "ServiceResource"
FOR SELECT TO authenticated
USING (public.is_organization_member("organizationId"));

CREATE POLICY "service_resource_insert_admin" ON "ServiceResource"
FOR INSERT TO authenticated
WITH CHECK (
  public.has_organization_role("organizationId", ARRAY['OWNER', 'ADMIN']::public."MembershipRole"[])
  AND EXISTS (
    SELECT 1 FROM "Service" s
    WHERE s."id" = "ServiceResource"."serviceId" AND s."organizationId" = "ServiceResource"."organizationId"
  )
  AND EXISTS (
    SELECT 1 FROM "Resource" r
    WHERE r."id" = "ServiceResource"."resourceId" AND r."organizationId" = "ServiceResource"."organizationId"
  )
);

CREATE POLICY "service_resource_delete_admin" ON "ServiceResource"
FOR DELETE TO authenticated
USING (public.has_organization_role("organizationId", ARRAY['OWNER', 'ADMIN']::public."MembershipRole"[]));
