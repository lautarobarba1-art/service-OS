-- Prisma uses the privileged postgres connection for migrations, but the
-- application assumes the authenticated role inside tenant transactions.
-- Keep payment updates available to that role while enforcing the narrower
-- OWNER/ADMIN rule at the database boundary.
GRANT UPDATE ("paymentStatus") ON "Booking" TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_booking_payment_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user = 'authenticated'
     AND NEW."paymentStatus" IS DISTINCT FROM OLD."paymentStatus"
     AND NOT public.has_organization_role(
       OLD."organizationId",
       ARRAY['OWNER', 'ADMIN']::public."MembershipRole"[]
     ) THEN
    RAISE EXCEPTION 'Only OWNER or ADMIN can update booking payment status'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_booking_payment_role() FROM PUBLIC;

CREATE TRIGGER booking_enforce_payment_role
BEFORE UPDATE OF "paymentStatus" ON "Booking"
FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_payment_role();

-- Public actors introduced in Phase 6 do not have a public.User row.
ALTER TABLE "AuditLog" ALTER COLUMN "userId" DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.normalize_customer_name(value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT translate(
    lower(regexp_replace(btrim(COALESCE(value, '')), '\s+', ' ', 'g')),
    'áéíóúüñ',
    'aeiouun'
  )
$$;

CREATE OR REPLACE FUNCTION public.prevent_customer_duplicates()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  normalized_email TEXT := lower(btrim(COALESCE(NEW."email", '')));
  normalized_phone TEXT := regexp_replace(COALESCE(NEW."phone", ''), '\D', '', 'g');
  normalized_name TEXT := public.normalize_customer_name(NEW."fullName");
BEGIN
  IF normalized_email <> '' AND EXISTS (
    SELECT 1 FROM public."Customer" c
    WHERE c."organizationId" = NEW."organizationId"
      AND c."id" <> NEW."id"
      AND lower(btrim(COALESCE(c."email", ''))) = normalized_email
  ) THEN
    RAISE EXCEPTION 'Ya existe un cliente con ese email.' USING ERRCODE = '23505';
  END IF;

  IF normalized_phone <> '' AND EXISTS (
    SELECT 1 FROM public."Customer" c
    WHERE c."organizationId" = NEW."organizationId"
      AND c."id" <> NEW."id"
      AND regexp_replace(COALESCE(c."phone", ''), '\D', '', 'g') = normalized_phone
  ) THEN
    RAISE EXCEPTION 'Ya existe un cliente con ese teléfono.' USING ERRCODE = '23505';
  END IF;

  IF normalized_email = '' AND normalized_phone = '' AND EXISTS (
    SELECT 1 FROM public."Customer" c
    WHERE c."organizationId" = NEW."organizationId"
      AND c."id" <> NEW."id"
      AND btrim(COALESCE(c."email", '')) = ''
      AND regexp_replace(COALESCE(c."phone", ''), '\D', '', 'g') = ''
      AND public.normalize_customer_name(c."fullName") = normalized_name
  ) THEN
    RAISE EXCEPTION 'Ya existe un cliente sin contacto con ese nombre.' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;

-- The duplicate trigger and friendly application checks use these normalized
-- expressions. Non-unique indexes are safe even if legacy duplicates exist.
CREATE INDEX "Customer_organizationId_normalizedEmail_idx"
ON "Customer" ("organizationId", lower(btrim(COALESCE("email", ''))))
WHERE btrim(COALESCE("email", '')) <> '';

CREATE INDEX "Customer_organizationId_normalizedPhone_idx"
ON "Customer" ("organizationId", regexp_replace(COALESCE("phone", ''), '\D', '', 'g'))
WHERE regexp_replace(COALESCE("phone", ''), '\D', '', 'g') <> '';

CREATE INDEX "Customer_organizationId_noContactName_idx"
ON "Customer" ("organizationId", public.normalize_customer_name("fullName"))
WHERE btrim(COALESCE("email", '')) = ''
  AND regexp_replace(COALESCE("phone", ''), '\D', '', 'g') = '';
