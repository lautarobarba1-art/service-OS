-- Phase 4 only: bookings, capacity protection and state transitions.
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PAID', 'WAIVED');

CREATE TABLE "Booking" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "serviceId" UUID NOT NULL,
  "resourceId" UUID NOT NULL,
  "startDateTime" TIMESTAMPTZ(6) NOT NULL,
  "endDateTime" TIMESTAMPTZ(6) NOT NULL,
  "attendeesCount" INTEGER NOT NULL DEFAULT 1,
  "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
  "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Booking_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Booking_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE,
  CONSTRAINT "Booking_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT,
  CONSTRAINT "Booking_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT,
  CONSTRAINT "Booking_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE RESTRICT,
  CONSTRAINT "Booking_attendeesCount_check" CHECK ("attendeesCount" >= 1),
  CONSTRAINT "Booking_time_range_check" CHECK ("endDateTime" > "startDateTime")
);

CREATE INDEX "Booking_organizationId_startDateTime_idx" ON "Booking"("organizationId", "startDateTime");
CREATE INDEX "Booking_resourceId_startDateTime_endDateTime_idx" ON "Booking"("resourceId", "startDateTime", "endDateTime");
CREATE INDEX "Booking_serviceId_resourceId_startDateTime_idx" ON "Booking"("serviceId", "resourceId", "startDateTime");
CREATE INDEX "Booking_customerId_idx" ON "Booking"("customerId");

CREATE TRIGGER booking_set_updated_at BEFORE UPDATE ON "Booking"
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- This trigger is the final capacity guard. The advisory transaction lock
-- serializes overlapping attempts for one service/resource/day, including
-- inserts that bypass the Next.js application and arrive through PostgREST.
CREATE OR REPLACE FUNCTION public.enforce_booking_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  service_capacity INTEGER;
  service_duration INTEGER;
  service_active BOOLEAN;
  resource_active BOOLEAN;
  used_capacity INTEGER;
  organization_timezone TEXT;
BEGIN
  SELECT o."timezone" INTO organization_timezone
  FROM public."Organization" o WHERE o."id" = NEW."organizationId";
  IF NOT FOUND THEN RAISE EXCEPTION 'La organización no existe.'; END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      NEW."organizationId"::text || ':' || NEW."serviceId"::text || ':' || NEW."resourceId"::text || ':' || (NEW."startDateTime" AT TIME ZONE organization_timezone)::date::text,
      0
    )
  );

  SELECT s."capacity", s."durationMinutes", s."isActive"
  INTO service_capacity, service_duration, service_active
  FROM public."Service" s
  WHERE s."id" = NEW."serviceId" AND s."organizationId" = NEW."organizationId";
  IF NOT FOUND THEN RAISE EXCEPTION 'El servicio no pertenece a la organización.'; END IF;

  SELECT r."isActive" INTO resource_active
  FROM public."Resource" r
  WHERE r."id" = NEW."resourceId" AND r."organizationId" = NEW."organizationId";
  IF NOT FOUND THEN RAISE EXCEPTION 'El recurso no pertenece a la organización.'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public."Customer" c
    WHERE c."id" = NEW."customerId" AND c."organizationId" = NEW."organizationId"
  ) THEN RAISE EXCEPTION 'El cliente no pertenece a la organización.'; END IF;
  IF NOT service_active THEN RAISE EXCEPTION 'El servicio está inactivo.'; END IF;
  IF NOT resource_active THEN RAISE EXCEPTION 'El recurso está inactivo.'; END IF;
  IF NEW."endDateTime" <> NEW."startDateTime" + make_interval(mins => service_duration) THEN
    RAISE EXCEPTION 'La duración de la reserva no coincide con el servicio.';
  END IF;

  SELECT COALESCE(SUM(b."attendeesCount"), 0)::INTEGER INTO used_capacity
  FROM public."Booking" b
  WHERE b."organizationId" = NEW."organizationId"
    AND b."serviceId" = NEW."serviceId"
    AND b."resourceId" = NEW."resourceId"
    AND b."status" IN ('PENDING', 'CONFIRMED')
    AND b."startDateTime" < NEW."endDateTime"
    AND b."endDateTime" > NEW."startDateTime";

  IF used_capacity + NEW."attendeesCount" > service_capacity THEN
    RAISE EXCEPTION 'La capacidad del slot está agotada.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER booking_enforce_insert BEFORE INSERT ON "Booking"
FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_insert();

CREATE OR REPLACE FUNCTION public.enforce_booking_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW."status" = OLD."status" THEN RETURN NEW; END IF;
  IF NOT (
    (OLD."status" = 'PENDING' AND NEW."status" IN ('CONFIRMED', 'CANCELLED')) OR
    (OLD."status" = 'CONFIRMED' AND NEW."status" IN ('COMPLETED', 'CANCELLED', 'NO_SHOW'))
  ) THEN
    RAISE EXCEPTION 'Transición de estado de reserva inválida.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER booking_enforce_status_transition BEFORE UPDATE OF "status" ON "Booking"
FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_status_transition();

ALTER TABLE "Booking" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "Booking" FROM anon;
GRANT SELECT, INSERT ON "Booking" TO authenticated;
GRANT UPDATE ("notes", "status") ON "Booking" TO authenticated;
GRANT ALL ON "Booking" TO service_role;

CREATE POLICY "booking_select_member" ON "Booking"
FOR SELECT TO authenticated USING (public.is_organization_member("organizationId"));
CREATE POLICY "booking_insert_operator" ON "Booking"
FOR INSERT TO authenticated WITH CHECK (
  public.has_organization_role("organizationId", ARRAY['OWNER', 'ADMIN', 'STAFF']::public."MembershipRole"[])
  AND EXISTS (SELECT 1 FROM "Customer" c WHERE c."id" = "Booking"."customerId" AND c."organizationId" = "Booking"."organizationId")
  AND EXISTS (SELECT 1 FROM "Service" s WHERE s."id" = "Booking"."serviceId" AND s."organizationId" = "Booking"."organizationId")
  AND EXISTS (SELECT 1 FROM "Resource" r WHERE r."id" = "Booking"."resourceId" AND r."organizationId" = "Booking"."organizationId")
);
CREATE POLICY "booking_update_operator" ON "Booking"
FOR UPDATE TO authenticated
USING (public.has_organization_role("organizationId", ARRAY['OWNER', 'ADMIN', 'STAFF']::public."MembershipRole"[]))
WITH CHECK (public.has_organization_role("organizationId", ARRAY['OWNER', 'ADMIN', 'STAFF']::public."MembershipRole"[]));
