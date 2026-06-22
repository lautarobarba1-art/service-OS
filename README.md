# ServiceOS — Fases 1 a 5

Base técnica del SaaS y gestión operativa: autenticación, multi-tenancy, catálogo, disponibilidad, reservas con capacidad transaccional, calendario, emails, auditoría y dashboard de métricas.

## Configuración local

1. Copiá `.env.example` a `.env.local` y completá las credenciales. Los scripts Prisma del proyecto también cargan ese archivo.
2. Usá `DATABASE_URL` para el pooler de Supabase (runtime) y `DIRECT_URL` para la conexión directa (migraciones).
3. Instalá dependencias con `npm install`.
4. Aplicá las migraciones con `npm run prisma:migrate` en desarrollo o `npm run prisma:deploy` en un entorno desplegado.
5. En Supabase Auth, agregá `http://localhost:3000/auth/callback` entre las redirect URLs.
6. Iniciá con `npm run dev`.

El remitente de bienvenida usa `onboarding@resend.dev` para desarrollo. En producción debe reemplazarse por un dominio verificado en Resend.

## Seguridad del tenant

El navegador nunca envía un `organizationId`. El selector envía un `membershipId`; el servidor comprueba que pertenece al usuario autenticado y recién entonces resuelve la organización activa. El alta inicial de `Organization`, membresía `OWNER` y `Resource` default ocurre en una transacción.

Las mutaciones de servicios, clientes y recursos vuelven a resolver esa membresía en servidor, validan el rol y escriben la operación junto con su `AuditLog` dentro de una misma transacción.

`DATABASE_URL` usa el rol privilegiado de Supabase requerido por Prisma y migraciones. Para que ese privilegio no anule la segunda capa de seguridad, toda consulta autenticada se ejecuta mediante `withAuthenticatedRls()`: dentro de una transacción se cargan `auth.uid()` y el rol `authenticated` con alcance local a la transacción. El pooler no reutiliza esa identidad fuera de la operación.

El onboarding es la única excepción porque todavía no existe una membresía. Su transacción privilegiada deriva el usuario desde Supabase Auth y crea organización, OWNER y recurso default de forma atómica.

## Tests de disponibilidad

`npm test` ejecuta los casos obligatorios de Fase 3: slots válidos e inválidos, bloqueos globales y por recurso, conversiones entre UTC y hora local, y cambios de DST.

También cubre las reglas críticas de Fase 4: capacidad, dos intentos concurrentes para capacity=1, máquina de estados, RBAC y aislamiento de tenant.

Los tests de métricas verifican rangos diarios y semanales en la timezone del negocio, incluyendo DST, además de agrupaciones y tasas operativas.

## Tests de integración con Postgres

La suite `tests/integration` valida RLS real, RBAC de pagos y dos inserts concurrentes sobre el último lugar. Nunca usa `DATABASE_URL` implícitamente: requiere una `TEST_DATABASE_URL` dedicada.

1. Levantá Supabase local con Docker mediante Supabase CLI (`supabase start`).
2. Copiá `.env.test.example` a `.env.test.local`.
3. Aplicá el schema descartable con `npm run prisma:test:deploy`.
4. Ejecutá `npm run test:integration`.

Sin `.env.test.local`, los tests de integración se omiten. Una URL remota se rechaza salvo que `ALLOW_REMOTE_TEST_DATABASE=true`; esa opción debe usarse únicamente con una base descartable, nunca producción.
