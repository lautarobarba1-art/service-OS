-- Phase 1 only: identity profiles, tenants, memberships and reservable resources.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'ADMIN', 'STAFF', 'VIEWER');
CREATE TYPE "ResourceType" AS ENUM ('PERSON', 'ROOM', 'EQUIPMENT');

CREATE TABLE "User" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "avatarUrl" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "User_id_auth_fkey" FOREIGN KEY ("id") REFERENCES auth.users("id") ON DELETE CASCADE
);

CREATE TABLE "Organization" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "timezone" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Membership" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "role" "MembershipRole" NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Membership_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE
);

CREATE TABLE "Resource" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "type" "ResourceType" NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Resource_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Resource_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");
CREATE UNIQUE INDEX "Membership_userId_organizationId_key" ON "Membership"("userId", "organizationId");
CREATE INDEX "Membership_organizationId_idx" ON "Membership"("organizationId");
CREATE INDEX "Resource_organizationId_idx" ON "Resource"("organizationId");
CREATE UNIQUE INDEX "Resource_one_default_per_organization" ON "Resource"("organizationId") WHERE "isDefault" = true;
CREATE UNIQUE INDEX "Membership_one_owner_per_organization" ON "Membership"("organizationId") WHERE "role" = 'OWNER';

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW."updatedAt" = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_set_updated_at BEFORE UPDATE ON "User"
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER organization_set_updated_at BEFORE UPDATE ON "Organization"
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER resource_set_updated_at BEFORE UPDATE ON "Resource"
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Supabase Auth profile synchronization. The UUID is shared with auth.users.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public."User" ("id", "name", "email", "avatarUrl")
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'name', ''), split_part(COALESCE(NEW.email, ''), '@', 1), 'Usuario'),
    COALESCE(NEW.email, NEW.id::text || '@invalid.local'),
    NULLIF(NEW.raw_user_meta_data ->> 'avatar_url', '')
  )
  ON CONFLICT ("id") DO UPDATE SET
    "name" = EXCLUDED."name",
    "email" = EXCLUDED."email",
    "avatarUrl" = EXCLUDED."avatarUrl",
    "updatedAt" = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

CREATE TRIGGER on_auth_user_updated
AFTER UPDATE OF email, raw_user_meta_data ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- SECURITY DEFINER avoids recursive RLS while evaluating membership policies.
CREATE OR REPLACE FUNCTION public.is_organization_member(target_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."Membership" m
    WHERE m."organizationId" = target_organization_id
      AND m."userId" = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.has_organization_role(target_organization_id UUID, allowed_roles public."MembershipRole"[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."Membership" m
    WHERE m."organizationId" = target_organization_id
      AND m."userId" = auth.uid()
      AND m."role" = ANY(allowed_roles)
  );
$$;

REVOKE ALL ON FUNCTION public.is_organization_member(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_organization_role(UUID, public."MembershipRole"[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_organization_member(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_organization_role(UUID, public."MembershipRole"[]) TO authenticated, service_role;

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Organization" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Resource" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON "User", "Organization", "Membership", "Resource" FROM anon;
GRANT SELECT ON "User" TO authenticated;
GRANT UPDATE ("name", "avatarUrl") ON "User" TO authenticated;
GRANT SELECT, UPDATE, DELETE ON "Organization" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Membership" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Resource" TO authenticated;
GRANT ALL ON "User", "Organization", "Membership", "Resource" TO service_role;

CREATE POLICY "user_select_self" ON "User"
FOR SELECT TO authenticated USING ("id" = auth.uid());
CREATE POLICY "user_update_self" ON "User"
FOR UPDATE TO authenticated USING ("id" = auth.uid()) WITH CHECK ("id" = auth.uid());

CREATE POLICY "organization_select_member" ON "Organization"
FOR SELECT TO authenticated USING (public.is_organization_member("id"));
CREATE POLICY "organization_update_admin" ON "Organization"
FOR UPDATE TO authenticated
USING (public.has_organization_role("id", ARRAY['OWNER', 'ADMIN']::public."MembershipRole"[]))
WITH CHECK (public.has_organization_role("id", ARRAY['OWNER', 'ADMIN']::public."MembershipRole"[]));
CREATE POLICY "organization_delete_owner" ON "Organization"
FOR DELETE TO authenticated
USING (public.has_organization_role("id", ARRAY['OWNER']::public."MembershipRole"[]));

CREATE POLICY "membership_select_self_or_owner" ON "Membership"
FOR SELECT TO authenticated
USING ("userId" = auth.uid() OR public.has_organization_role("organizationId", ARRAY['OWNER']::public."MembershipRole"[]));
CREATE POLICY "membership_insert_owner" ON "Membership"
FOR INSERT TO authenticated
WITH CHECK (public.has_organization_role("organizationId", ARRAY['OWNER']::public."MembershipRole"[]));
CREATE POLICY "membership_update_owner" ON "Membership"
FOR UPDATE TO authenticated
USING (public.has_organization_role("organizationId", ARRAY['OWNER']::public."MembershipRole"[]))
WITH CHECK (public.has_organization_role("organizationId", ARRAY['OWNER']::public."MembershipRole"[]));
CREATE POLICY "membership_delete_owner" ON "Membership"
FOR DELETE TO authenticated
USING (public.has_organization_role("organizationId", ARRAY['OWNER']::public."MembershipRole"[]));

CREATE POLICY "resource_select_member" ON "Resource"
FOR SELECT TO authenticated USING (public.is_organization_member("organizationId"));
CREATE POLICY "resource_insert_admin" ON "Resource"
FOR INSERT TO authenticated
WITH CHECK (public.has_organization_role("organizationId", ARRAY['OWNER', 'ADMIN']::public."MembershipRole"[]));
CREATE POLICY "resource_update_admin" ON "Resource"
FOR UPDATE TO authenticated
USING (public.has_organization_role("organizationId", ARRAY['OWNER', 'ADMIN']::public."MembershipRole"[]))
WITH CHECK (public.has_organization_role("organizationId", ARRAY['OWNER', 'ADMIN']::public."MembershipRole"[]));
CREATE POLICY "resource_delete_admin" ON "Resource"
FOR DELETE TO authenticated
USING (public.has_organization_role("organizationId", ARRAY['OWNER', 'ADMIN']::public."MembershipRole"[]));

-- Organization insertion and the first OWNER membership are intentionally not
-- available to authenticated SQL clients. The validated onboarding server action
-- performs both plus the default Resource atomically through the trusted DB role.
