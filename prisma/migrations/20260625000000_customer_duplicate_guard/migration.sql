-- Prevent new organization-scoped customer duplicates without deleting or
-- rewriting existing production records. Server Actions provide friendly
-- messages; this trigger is the final guard for direct PostgREST writes.
CREATE OR REPLACE FUNCTION public.prevent_customer_duplicates()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  normalized_email TEXT := lower(btrim(COALESCE(NEW."email", '')));
  normalized_phone TEXT := regexp_replace(COALESCE(NEW."phone", ''), '\D', '', 'g');
  normalized_name TEXT := lower(regexp_replace(btrim(NEW."fullName"), '\s+', ' ', 'g'));
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
      AND lower(regexp_replace(btrim(c."fullName"), '\s+', ' ', 'g')) = normalized_name
  ) THEN
    RAISE EXCEPTION 'Ya existe un cliente sin contacto con ese nombre.' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER customer_prevent_duplicates
BEFORE INSERT OR UPDATE OF "fullName", "email", "phone" ON "Customer"
FOR EACH ROW EXECUTE FUNCTION public.prevent_customer_duplicates();
