# Roadmap

## Principios del roadmap

- Cada fase entrega valor funcional verificable antes de pasar a la siguiente.
- Los tests de reglas críticas se escriben en la misma fase en que se implementa la feature, no al final.
- Las fases posteriores pueden construir sobre las anteriores sin reescribir lo anterior.

---

## Fase 1 — Base técnica y autenticación

**Objetivo:** Tener el proyecto inicializado, con auth funcional y el shell del dashboard protegido.

Incluye:
- Setup del proyecto: Next.js App Router + TypeScript + Tailwind
- Configuración de Supabase: proyecto, base de datos, Auth
- Modelo de datos inicial: migraciones para User, Organization, Membership, Resource
- RLS policies para las tablas de Fase 1
- Auth con Supabase Auth: registro, login, logout, sesión persistente
- Creación de perfil de usuario en `public` al registrarse (trigger o webhook de Supabase)
- Flujo de onboarding: crear organización + timezone + recurso default automático
- Middleware Next.js: protección de rutas autenticadas
- Selector de organización activa (context/session) para usuarios con múltiples membresías
- Email de bienvenida al registrarse
- Dashboard shell: estructura de navegación sin contenido real aún

**Resultado esperado:**
Un usuario puede registrarse, crear su negocio con timezone, ver el recurso default creado automáticamente y acceder a su panel protegido.

---

## Fase 2 — Gestión operativa básica

**Objetivo:** El negocio puede cargar su catálogo de servicios, clientes y recursos.

Incluye:
- CRUD de servicios (con validaciones: duración > 0, capacidad >= 1, precio >= 0)
- CRUD de clientes
- CRUD de recursos (sin permitir eliminar el recurso default)
- Tablas administrativas con paginación y filtros (TanStack Table)
- Validaciones Zod en todos los formularios y en server actions
- Feedback visual de errores de validación
- Auditoría: registro de creación y edición de servicios, clientes y recursos
- RLS policies para Service, Customer, Resource

**Resultado esperado:**
El negocio tiene servicios, clientes y recursos cargados. Todo con validación y auditoría activa.

---

## Fase 3 — Disponibilidad (con tests)

**Objetivo:** El negocio puede definir cuándo acepta reservas.

Incluye:
- CRUD de reglas de disponibilidad semanal por recurso
- CRUD de fechas bloqueadas (por organización o por recurso)
- Helpers de timezone: conversión UTC ↔ hora local, chequeo si un datetime UTC cae en una regla de disponibilidad
- Validación server-side: un slot es válido solo si cae en una AvailabilityRule del recurso asignado y no está en un BlockedDate
- UI de configuración de disponibilidad por recurso (semanal)
- RLS policies para AvailabilityRule y BlockedDate
- Auditoría de cambios de disponibilidad

**Tests obligatorios en esta fase:**
- Slot dentro de disponibilidad → válido
- Slot fuera de disponibilidad → rechazado
- Slot en fecha bloqueada → rechazado
- Conversión de UTC a hora local correcta para distintas timezones
- Conversión correcta en DST (horario de verano) si aplica

**Resultado esperado:**
El negocio puede definir cuándo acepta reservas por recurso. Los helpers de disponibilidad están validados con tests antes de usarse en reservas.

---

## Fase 4 — Reservas (con tests)

**Objetivo:** El sistema permite crear y gestionar reservas reales con todas las reglas de negocio aplicadas.

Incluye:
- Crear reserva con validación completa server-side (disponibilidad, solapamiento, capacidad, estado del servicio y recurso)
- Locking transaccional para prevenir race conditions en el slot de capacidad
- `attendeesCount` por reserva, validado contra `service.capacity` sumando reservas activas del mismo slot
- Cambiar estado de reserva con máquina de estados (transiciones válidas por rol)
- Cambiar `paymentStatus` manualmente (solo OWNER y ADMIN)
- Editar notas de reserva
- Vista de calendario mensual con reservas de la organización
- Detalle de reserva
- Email al cliente al crear la reserva (si tiene email)
- Email al cliente al cancelar la reserva (si tiene email)
- RLS policies para Booking
- Auditoría completa de reservas

**Tests obligatorios en esta fase:**
- Reserva válida → creada correctamente
- Reserva fuera de disponibilidad → rechazada
- Reserva en fecha bloqueada → rechazada
- Reserva que supera capacidad → rechazada
- Segunda reserva simultánea en slot con capacity=1 → una aceptada, una rechazada (race condition)
- Transición de estado válida → ejecutada
- Transición de estado inválida → rechazada
- Transición por rol no autorizado → rechazada
- Multi-tenancy: usuario sin membresía no puede crear ni ver reservas de otra org

**Resultado esperado:**
El sistema permite gestionar reservas reales con todas las reglas de negocio activas y testeadas.

---

## Fase 5 — Dashboard y métricas

**Objetivo:** El negocio puede visualizar el estado operativo de su actividad.

Incluye:
- Reservas por período (día, semana, mes) con gráfico de barras
- Reservas por estado (PENDING, CONFIRMED, COMPLETED, CANCELLED, NO_SHOW)
- Reservas COMPLETED con `paymentStatus = UNPAID` (cobros pendientes)
- Clientes nuevos por período
- Servicios más reservados
- Tasa de cancelación (CANCELLED / total)
- Tasa de no-show (NO_SHOW / total)
- Todas las queries del dashboard filtradas por `organizationId` y validadas en servidor
- KPIs en cards de resumen

**Notas:**
- No hay métricas de pagos reales. Los "cobros pendientes" se calculan con `Booking.paymentStatus`.
- Las queries de agregación se implementan con SQL raw o vistas de Postgres donde Prisma genere N+1 innecesarios.

**Resultado esperado:**
El negocio tiene visibilidad sobre sus operaciones sin salir del panel.

---

## Fase 6 — API pública y extensibilidad

**Objetivo:** Permitir integraciones externas y automatizaciones.

Incluye:
- API REST pública con autenticación por API Key
- Endpoints iniciales: listar servicios, listar disponibilidad, crear reserva
- Rate limiting por API Key
- Documentación de la API
- Webhooks para eventos de reserva (creación, cancelación, cambio de estado)

**Resultado esperado:**
Terceros pueden integrarse con ServiceOS sin acceder al panel.

---

## Fuera del roadmap actual

- Integración con pasarelas de pago (Stripe, MercadoPago)
- Portal de auto-reserva para clientes finales
- App mobile
- IA operativa
- Automatizaciones complejas
- Chatbot
