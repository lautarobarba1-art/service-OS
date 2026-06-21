# ServiceOS — Fase 1

Base técnica del SaaS: autenticación con Supabase, onboarding multi-tenant, RLS y shell protegido del dashboard.

## Configuración local

1. Copiá `.env.example` a `.env` y completá las credenciales (Next.js y Prisma cargan ese archivo).
2. Usá `DATABASE_URL` para el pooler de Supabase (runtime) y `DIRECT_URL` para la conexión directa (migraciones).
3. Instalá dependencias con `npm install`.
4. Aplicá la migración con `npm run prisma:migrate` o `npx prisma migrate deploy`.
5. En Supabase Auth, agregá `http://localhost:3000/auth/callback` entre las redirect URLs.
6. Iniciá con `npm run dev`.

El remitente de bienvenida usa `onboarding@resend.dev` para desarrollo. En producción debe reemplazarse por un dominio verificado en Resend.

## Seguridad del tenant

El navegador nunca envía un `organizationId`. El selector envía un `membershipId`; el servidor comprueba que pertenece al usuario autenticado y recién entonces resuelve la organización activa. El alta inicial de `Organization`, membresía `OWNER` y `Resource` default ocurre en una transacción.
