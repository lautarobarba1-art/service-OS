# Technical Decisions

---

## Decisión 1 — Autenticación: Supabase Auth

El sistema usa Supabase Auth para gestionar autenticación (registro, login, sesión, tokens JWT).

### Motivo

Supabase Auth está integrado nativamente con Supabase Postgres y RLS. Los JWT emitidos por Supabase incluyen el `user.id`, que se usa directamente en las políticas de RLS sin necesidad de lookups adicionales. Elimina la necesidad de manejar hashing de contraseñas y gestión de sesiones.

### Consecuencia en el modelo de datos

`auth.users` vive en el schema `auth` de Supabase (gestionado internamente). Se mantiene una tabla `public.User` (perfil) donde `id` es el mismo UUID que `auth.users.id`. Esta tabla se crea automáticamente al registrarse mediante un trigger o Function de Supabase.

### Trade-off

El modelo de usuario queda atado a Supabase. Migrar a otro proveedor de auth en el futuro requeriría reemplazar el sistema de sesión y las políticas de RLS que dependen del JWT de Supabase.

---

## Decisión 2 — Base de datos: Supabase Postgres

La base de datos es PostgreSQL gestionado por Supabase.

### Motivo

Unifica base de datos, autenticación y RLS en una sola plataforma. Simplifica el setup inicial y el deploy. Ofrece acceso directo a PostgreSQL para queries complejas, funciones, triggers y políticas de RLS.

### Trade-off

Dependencia de Supabase como plataforma. Las queries avanzadas del dashboard y disponibilidad pueden requerir SQL raw o vistas de Postgres para evitar los límites de Prisma en agregaciones complejas.

---

## Decisión 3 — Multi-tenancy por organizationId

El sistema usa un modelo multi-tenant con una única base de datos y separación lógica de datos por `organizationId`.

### Alternativas consideradas

- Una base de datos por tenant: máximo aislamiento, complejidad operativa inviable para MVP.
- Un schema por tenant: mayor aislamiento, complejo de gestionar con Prisma y migraciones.

### Motivo

Para un MVP SaaS, `organizationId` permite menor complejidad operativa, velocidad de desarrollo y arquitectura suficiente para demostrar separación de datos.

### Regla de implementación

El `organizationId` nunca se acepta desde el cliente. Se resuelve siempre en servidor a partir de la sesión autenticada y la membresía del usuario.

---

## Decisión 4 — Seguridad: RLS + validaciones server-side

Se aplican dos capas de seguridad independientes:

1. **Validaciones server-side:** toda lógica de negocio y control de acceso se valida en el servidor (Server Actions o API Routes). El frontend puede ser manipulado.
2. **Row-Level Security (RLS) de Supabase:** políticas de acceso a nivel de base de datos que restringen las operaciones por `organizationId`, usando el JWT del usuario autenticado.

### Motivo

RLS actúa como red de seguridad si una validación server-side falla o es omitida. La combinación de ambas capas elimina la posibilidad de data leaks entre tenants por error de programación.

### Consecuencia

Toda tabla operativa requiere una política de RLS explícita antes de estar en producción. No se habilitan tablas sin política definida.

La URL de Prisma conecta con el rol privilegiado de Supabase, que normalmente tiene `BYPASSRLS`. Por eso las operaciones autenticadas no usan el cliente global directamente: `withAuthenticatedRls()` abre una transacción, carga `request.jwt.claim.sub`, asume `authenticated` con `SET LOCAL ROLE` y ejecuta allí la operación. Tanto el rol como los claims desaparecen al cerrar la transacción, lo que lo hace compatible con el transaction pooler.

El onboarding conserva una transacción privilegiada explícita porque todavía no existe una membresía contra la cual evaluar RLS. Es un caso acotado: la identidad proviene de `supabase.auth.getUser()` y todos los registros iniciales se crean atómicamente.

---

## Decisión 5 — Timezone: UTC en base de datos, conversión en servidor

Todos los `TIMESTAMPTZ` se almacenan en UTC. Cada organización define su timezone con un identificador IANA (ej: `"America/Argentina/Buenos_Aires"`).

### Motivo

Almacenar en UTC evita ambigüedades de DST (horario de verano), facilita comparaciones y ordenamiento en base de datos, y permite servir a negocios en cualquier timezone sin cambiar el modelo de datos.

### Consecuencia en disponibilidad

Los tiempos de `AvailabilityRule` (`startTime`, `endTime`) se expresan en hora local del negocio. Cuando se valida una reserva, el servidor convierte `Booking.startDateTime` (UTC) a la timezone de la organización y lo compara contra las reglas de disponibilidad locales. La UI siempre muestra horarios en la timezone de la organización.

---

## Decisión 6 — Modelo de recurso (Resource)

Se introduce la entidad `Resource` desde el inicio del proyecto para representar cualquier cosa que se pueda reservar: una persona (staff), una sala, un box, un equipo.

### Motivo

Sin `Resource`, la disponibilidad queda asociada a la organización completa, lo que impide modelar negocios con múltiples operadores o espacios independientes. Incorporar `Resource` después de construir disponibilidad y reservas requeriría un refactor de esquema y lógica.

### Recurso default

Al crear una organización se crea automáticamente un recurso default (`isDefault = true`, `type = PERSON`). Esto mantiene el flujo del MVP simple: la mayoría de los negocios en etapa inicial operan con un solo recurso y no necesitan configurarlo explícitamente. Los negocios que necesiten múltiples recursos pueden agregar más sin cambiar el modelo.

### Consecuencia

`AvailabilityRule` y `Booking` siempre referencian un `resourceId`. No existe disponibilidad ni reserva "de la organización" sin un recurso asignado.

---

## Decisión 7 — Reservas grupales: attendeesCount en Booking

Para modelar clases o servicios grupales, se agrega el campo `attendeesCount` en `Booking` (default: 1). Una reserva puede representar a múltiples asistentes (ej: una familia que reserva 3 lugares en una clase).

### Validación de capacidad

Al crear una reserva, el servidor suma el `attendeesCount` de todas las reservas activas (PENDING o CONFIRMED) para el mismo servicio, recurso y slot horario. Si la suma más el `attendeesCount` de la nueva reserva supera `service.capacity`, la reserva se rechaza.

### Alternativa descartada

Crear una entidad `BookingParticipant` para relaciones N:M entre `Booking` y `Customer`. Descartada para el MVP por complejidad: el caso común es un cliente por reserva. `attendeesCount` cubre el caso grupal sin necesidad de múltiples registros de `Customer`.

---

## Decisión 8 — Payment fuera del MVP

La entidad `Payment` y toda integración con pasarelas de pago queda fuera del MVP.

### Estado de pago en Booking

Se usa el campo `Booking.paymentStatus` (UNPAID | PAID | WAIVED) que el staff actualiza manualmente. Esto cubre la necesidad operativa básica de saber si una reserva fue cobrada, sin la complejidad de integrar un procesador de pagos.

### Motivo

Integrar pagos reales requiere manejo de webhooks de pasarela, estados de transacción, reembolsos, conciliación y cumplimiento PCI. Esto está fuera del alcance de un MVP enfocado en validar la gestión operativa central del negocio.

### Consecuencia

Las métricas del dashboard relacionadas a cobros (ej: "reservas sin cobrar") se calculan con `Booking.paymentStatus`. No hay flujo de pago automatizado.

---

## Decisión 9 — IA fuera del MVP

No se implementa ninguna funcionalidad de inteligencia artificial en la primera versión.

### Motivo

La IA tiene más valor cuando opera sobre datos reales del negocio. El MVP necesita primero construir el núcleo de datos: reservas, clientes, servicios, estados y métricas. Sin ese núcleo, la IA no tiene contexto suficiente para generar valor. Se evaluará después de validar la auto-reserva pública.

---

## Decisión 10 — Emails básicos en el MVP

Se incluyen emails transaccionales esenciales en el MVP: bienvenida al registrarse, confirmación de reserva al cliente y notificación de cancelación al cliente.

### Motivo

Sin confirmación de reserva por email, el negocio no puede operar de forma confiable. Es el canal mínimo para que el cliente tenga constancia de su turno sin que el staff deba contactarlo manualmente.

### Implementación

Emails enviados de forma asíncrona mediante un adaptador propio sobre SMTP genérico. Los errores de envío no bloquean la operación principal y se registran en `AuditLog`. No hay sistema de plantillas avanzado en el MVP.

---

## Decisión 11 — Tests de reglas críticas desde la fase de implementación

Los tests de las reglas de negocio más importantes se escriben en la misma fase en que se implementa la feature, no en una fase posterior.

### Motivo

Poner tests al final del roadmap significa que no se escriben. Las reglas de validación de disponibilidad, solapamiento, capacidad y multi-tenancy son demasiado críticas para quedar sin cobertura durante el desarrollo.

### Alcance mínimo obligatorio

- Fase 3 (Disponibilidad): tests de helpers de timezone y validación de slots.
- Fase 4 (Reservas): tests de validación completa de creación, máquina de estados, y aislamiento multi-tenant.

Los tests del dashboard, UI y flujos de email tienen menor prioridad y pueden incorporarse progresivamente.

---

## Decisión 12 — Auto-reserva antes que API pública

La Fase 6 prioriza un portal público para clientes finales. La API por API Key y los webhooks pasan a una fase posterior.

### Motivo

El panel interno ordena la operación, pero no elimina la carga manual. El mayor incremento de valor inmediato es permitir que el cliente cree una reserva válida por sí mismo usando el motor ya construido.

### Consecuencia

La superficie inicial es producto final (`/reservar/[slug]`), no una API genérica. Reglas y servicios de dominio se diseñan reutilizables para una API futura.

---

## Decisión 13 — Cliente invitado sin Supabase Auth

El cliente final reserva con nombre, email y teléfono opcional. No crea contraseña, sesión ni fila en `auth.users`.

### Motivo

Obligar a crear cuenta agrega fricción. `Customer` sigue siendo una entidad pasiva del tenant y se reutiliza por contacto normalizado.

### Seguridad

La autogestión usa un enlace bearer aleatorio. Solo se guarda el hash y vencimiento del token, nunca su valor plano.

---

## Decisión 14 — Elegibilidad explícita y asignación automática de recurso

Se incorpora `ServiceResource` para declarar qué recursos pueden prestar cada servicio. El cliente público no elige recurso.

### Motivo

Exponer staff/salas aumenta complejidad y filtra estructura interna. Sin relación explícita, el sistema podría asignar un servicio a un recurso incompatible.

### Algoritmo inicial

El motor agrega slots de los recursos elegibles. Al confirmar, prueba primero el recurso default elegible y luego por UUID, siempre bajo lock y revalidación completa. La estrategia podrá evolucionar sin cambiar el contrato público.

---

## Decisión 15 — Confirmación pública configurable

`Organization.bookingConfirmationMode` admite `AUTO_CONFIRM` y `MANUAL_APPROVAL`, con default `AUTO_CONFIRM`.

### Motivo

Auto-confirmar entrega la automatización buscada cuando disponibilidad y capacidad son autoritativas. El modo PENDING cubre negocios que necesitan aprobación.

---

## Decisión 16 — Idempotencia y referencias no secuenciales

Cada submit público usa una key UUID y un hash canónico del payload. La combinación (`organizationId`, `idempotencyKey`) es única. Toda reserva recibe además un `referenceCode` aleatorio.

### Motivo

Reintentos de red y dobles clicks son normales. Idempotencia evita duplicar cliente, reserva, auditoría y email. Una referencia aleatoria evita enumerar volumen o IDs internos.

---

## Decisión 17 — Rate limiting persistente en Postgres

Los límites públicos usan buckets en `PublicRateLimit`, actualizados atómicamente. La IP se transforma con HMAC usando un secreto de entorno antes de persistirla.

El secreto se configura como `PUBLIC_RATE_LIMIT_SECRET`; es independiente de las claves de Supabase y del proveedor SMTP y debe existir en local y Vercel antes de habilitar el portal.

### Motivo

La memoria de una Function de Vercel no es compartida ni durable. Postgres ya está disponible y evita sumar otro proveedor en esta release.

### Trade-off

Agrega escrituras. Los buckets expiran y la implementación queda detrás de una interfaz para migrarla a Redis si el tráfico lo justifica.

---

## Decisión 18 — Auditoría de actores públicos

`AuditLog.userId` pasa a ser opcional. Acciones del portal usan `userId = null` y `metadata.source = "PUBLIC"`.

### Motivo

Inventar un usuario interno o compartir una service account falsearía la trazabilidad. El actor público no equivale a un `User` autenticado.

### Privacidad

La auditoría nunca almacena token plano, IP, HMAC de rate limit ni datos de contacto completos.

Las páginas autenticadas por enlace se sirven sin caché y con política `no-referrer`. El token no se integra en analytics ni se escribe en logs de aplicación.
