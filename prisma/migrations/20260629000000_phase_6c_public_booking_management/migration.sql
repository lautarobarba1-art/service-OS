-- Phase 6C: protect capacity and tenant invariants when an existing booking
-- is rescheduled. The original INSERT trigger remains in place.
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
  excluded_booking_id UUID;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    excluded_booking_id := OLD."id";
  END IF;

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
    AND b."endDateTime" > NEW."startDateTime"
    AND (excluded_booking_id IS NULL OR b."id" <> excluded_booking_id);

  IF used_capacity + NEW."attendeesCount" > service_capacity THEN
    RAISE EXCEPTION 'La capacidad del slot está agotada.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS booking_enforce_update ON "Booking";
CREATE TRIGGER booking_enforce_update
BEFORE UPDATE OF
  "organizationId", "customerId", "serviceId", "resourceId",
  "startDateTime", "endDateTime", "attendeesCount"
ON "Booking"
FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_insert();
