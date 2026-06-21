# Database Model

## Notas generales

- La base de datos es Supabase Postgres (PostgreSQL).
- La autenticación la maneja Supabase Auth en el schema `auth`. El schema operativo es `public`.
- Todas las entidades operativas tienen `organizationId` para soportar multi-tenancy lógico.
- Todas las tablas tienen RLS habilitado. Las políticas restringen acceso por membresía a la organización.
- Las fechas y horas se almacenan en UTC. La conversión a la timezone local de la organización ocurre en la capa de presentación.
- Los tiempos de disponibilidad (`startTime`, `endTime` en `AvailabilityRule`) representan hora local del negocio y se interpretan en función de `Organization.timezone`.

---

## Entidades

### User

Perfil interno del usuario, vinculado 1:1 a `auth.users` de Supabase.

| Campo | Tipo | Notas |
|---|---|---|
| id | UUID | Mismo valor que `auth.users.id` |
| name | TEXT | |
| email | TEXT | Único global, sincronizado desde auth |
| avatarUrl | TEXT | Opcional |
| createdAt | TIMESTAMPTZ | |
| updatedAt | TIMESTAMPTZ | |

---

### Organization

Representa un negocio dentro de la plataforma.

| Campo | Tipo | Notas |
|---|---|---|
| id | UUID | |
| name | TEXT | |
| slug | TEXT | Único global. Usado para URLs futuras |
| email | TEXT | Email de contacto del negocio |
| phone | TEXT | Opcional |
| timezone | TEXT | Identificador IANA (ej: "America/Argentina/Buenos_Aires") |
| createdAt | TIMESTAMPTZ | |
| updatedAt | TIMESTAMPTZ | |

---

### Membership

Relaciona usuarios con organizaciones y define su rol.

| Campo | Tipo | Notas |
|---|---|---|
| id | UUID | |
| userId | UUID | Referencia a User |
| organizationId | UUID | Referencia a Organization |
| role | ENUM | OWNER \| ADMIN \| STAFF \| VIEWER |
| createdAt | TIMESTAMPTZ | |

Un mismo usuario puede tener membresías en múltiples organizaciones con distintos roles.

---

### Resource

Representa un recurso reservable dentro de una organización: una persona (staff), una sala, un box, un equipo, etc.

| Campo | Tipo | Notas |
|---|---|---|
| id | UUID | |
| organizationId | UUID | Referencia a Organization |
| name | TEXT | Ej: "Sala A", "Dr. García", "Box 1" |
| type | ENUM | PERSON \| ROOM \| EQUIPMENT |
| isDefault | BOOLEAN | Exactamente uno por organización. Se crea automáticamente al crear la org |
| isActive | BOOLEAN | Default: true |
| createdAt | TIMESTAMPTZ | |
| updatedAt | TIMESTAMPTZ | |

**Restricción:** Solo puede existir un `Resource` con `isDefault = true` por organización.

---

### Service

Representa un servicio ofrecido por una organización.

| Campo | Tipo | Notas |
|---|---|---|
| id | UUID | |
| organizationId | UUID | Referencia a Organization |
| name | TEXT | |
| description | TEXT | Opcional |
| durationMinutes | INTEGER | Define el bloque horario que ocupa la reserva |
| price | DECIMAL | Precio de referencia. No se cobra por esta plataforma en el MVP |
| capacity | INTEGER | Máximo de asistentes por slot. Default: 1 |
| isActive | BOOLEAN | Default: true |
| createdAt | TIMESTAMPTZ | |
| updatedAt | TIMESTAMPTZ | |

---

### Customer

Representa un cliente de un negocio. No tiene acceso al sistema (entidad pasiva en el MVP).

| Campo | Tipo | Notas |
|---|---|---|
| id | UUID | |
| organizationId | UUID | Referencia a Organization |
| fullName | TEXT | |
| email | TEXT | Opcional. Usado para enviar emails de confirmación |
| phone | TEXT | Opcional |
| notes | TEXT | Notas internas del negocio sobre el cliente |
| createdAt | TIMESTAMPTZ | |
| updatedAt | TIMESTAMPTZ | |

---

### AvailabilityRule

Define los horarios disponibles de un recurso para un día de la semana.

| Campo | Tipo | Notas |
|---|---|---|
| id | UUID | |
| organizationId | UUID | Para RLS. Referencia a Organization |
| resourceId | UUID | Referencia a Resource |
| dayOfWeek | INTEGER | 0 = domingo, 6 = sábado |
| startTime | TIME | Hora de inicio en timezone local de la organización |
| endTime | TIME | Hora de fin en timezone local de la organización |
| createdAt | TIMESTAMPTZ | |
| updatedAt | TIMESTAMPTZ | |

Un recurso puede tener múltiples reglas para el mismo día (ej: mañana y tarde).

---

### BlockedDate

Representa una fecha bloqueada donde no se aceptan reservas.

| Campo | Tipo | Notas |
|---|---|---|
| id | UUID | |
| organizationId | UUID | Referencia a Organization |
| resourceId | UUID | Opcional. Si es null, aplica a todos los recursos de la organización |
| date | DATE | Fecha local del negocio |
| reason | TEXT | Opcional. Descripción del motivo |
| createdAt | TIMESTAMPTZ | |

---

### Booking

Representa una reserva de un cliente para un servicio en un recurso.

| Campo | Tipo | Notas |
|---|---|---|
| id | UUID | |
| organizationId | UUID | Para RLS |
| customerId | UUID | Referencia a Customer |
| serviceId | UUID | Referencia a Service |
| resourceId | UUID | Referencia a Resource asignado |
| startDateTime | TIMESTAMPTZ | En UTC |
| endDateTime | TIMESTAMPTZ | En UTC. Calculado al crear: startDateTime + service.durationMinutes. No se recalcula si cambia el servicio |
| attendeesCount | INTEGER | Número de asistentes incluidos en esta reserva. Default: 1 |
| status | ENUM | PENDING \| CONFIRMED \| COMPLETED \| CANCELLED \| NO_SHOW |
| paymentStatus | ENUM | UNPAID \| PAID \| WAIVED |
| notes | TEXT | Opcional. Notas internas |
| createdAt | TIMESTAMPTZ | |
| updatedAt | TIMESTAMPTZ | |

**Nota sobre `endDateTime`:** Representa el fin de la reserva en el momento de su creación, calculado con la duración del servicio vigente. Si la duración del servicio se modifica posteriormente, las reservas existentes conservan su `endDateTime` original. Las nuevas reservas usarán la duración actualizada.

**Nota sobre `paymentStatus`:** En el MVP no hay integración con pasarelas de pago. El staff actualiza este campo manualmente para reflejar si una reserva fue cobrada.

---

### AuditLog

Registra acciones importantes dentro del sistema para trazabilidad.

| Campo | Tipo | Notas |
|---|---|---|
| id | UUID | |
| organizationId | UUID | |
| userId | UUID | Usuario que realizó la acción |
| action | TEXT | Identificador de la acción (ej: "booking.created") |
| entityType | TEXT | Tipo de entidad afectada (ej: "Booking") |
| entityId | UUID | ID de la entidad afectada |
| metadata | JSONB | Datos adicionales del contexto de la acción |
| createdAt | TIMESTAMPTZ | |

---

## Entidades fuera del MVP

### Payment

La tabla de pagos no se implementa en el MVP. El estado de pago se maneja con el campo `Booking.paymentStatus`. La entidad `Payment` se incorporará en una fase posterior cuando se integre un procesador de pagos real.
