# Business Rules

## Multi-tenancy

- Cada entidad operativa pertenece a una organización mediante `organizationId`.
- Un usuario solo puede acceder a organizaciones donde tenga una membresía activa.
- Toda query de datos operativos debe filtrar por `organizationId`.
- La UI no es fuente de seguridad. Todas las validaciones críticas ocurren en servidor.
- El `organizationId` nunca se toma del cliente: se resuelve en servidor a partir de la sesión autenticada y la membresía del usuario.

---

## Seguridad — Row-Level Security (RLS)

- RLS está habilitado en todas las tablas del schema `public`.
- Las políticas de RLS permiten SELECT, INSERT, UPDATE y DELETE únicamente sobre filas donde `organizationId` corresponde a una organización en la que el usuario tiene membresía activa.
- RLS actúa como segunda capa de defensa: incluso si una query del servidor omite el filtro por `organizationId`, RLS lo aplica a nivel de base de datos.
- Las políticas de RLS se definen explícitamente por tabla y operación. No se usa `permissive` sin revisión.

---

## Roles y permisos (RBAC)

Cada membresía tiene un rol que determina qué acciones puede realizar el usuario dentro de esa organización.

### Roles

| Rol | Descripción |
|---|---|
| OWNER | Propietario del negocio. Acceso total. Solo uno por organización |
| ADMIN | Administrador delegado. Acceso operativo completo, sin gestión de membresías |
| STAFF | Operador. Gestiona reservas y clientes en el día a día |
| VIEWER | Solo lectura. Puede ver calendario y listados sin modificar nada |

### Matriz de permisos

| Acción | OWNER | ADMIN | STAFF | VIEWER |
|---|:---:|:---:|:---:|:---:|
| Gestionar membresías (invitar, remover, cambiar roles) | ✓ | ✗ | ✗ | ✗ |
| Eliminar organización | ✓ | ✗ | ✗ | ✗ |
| Crear / editar / eliminar recursos | ✓ | ✓ | ✗ | ✗ |
| Crear / editar / desactivar servicios | ✓ | ✓ | ✗ | ✗ |
| Configurar disponibilidad semanal | ✓ | ✓ | ✗ | ✗ |
| Gestionar fechas bloqueadas | ✓ | ✓ | ✗ | ✗ |
| Ver dashboard y métricas | ✓ | ✓ | ✗ | ✗ |
| Ver audit log | ✓ | ✓ | ✗ | ✗ |
| Crear clientes | ✓ | ✓ | ✓ | ✗ |
| Editar clientes | ✓ | ✓ | ✓ | ✗ |
| Eliminar clientes | ✓ | ✓ | ✗ | ✗ |
| Crear reservas | ✓ | ✓ | ✓ | ✗ |
| Editar notas de reserva | ✓ | ✓ | ✓ | ✗ |
| Cambiar estado de reserva | ✓ | ✓ | ✓* | ✗ |
| Cancelar reserva | ✓ | ✓ | ✓ | ✗ |
| Cambiar estado de pago (paymentStatus) | ✓ | ✓ | ✗ | ✗ |
| Ver calendario | ✓ | ✓ | ✓ | ✓ |
| Ver listado de clientes | ✓ | ✓ | ✓ | ✓ |
| Ver listado de servicios | ✓ | ✓ | ✓ | ✓ |

*STAFF solo puede ejecutar las transiciones de estado marcadas como permitidas para su rol (ver sección "Máquina de estados").

---

## Timezone

- Cada organización define su timezone con un identificador IANA (ej: `"America/Argentina/Buenos_Aires"`).
- Toda fecha y hora se almacena en UTC en la base de datos.
- Los tiempos de disponibilidad (`AvailabilityRule.startTime`, `endTime`) y las fechas bloqueadas (`BlockedDate.date`) se expresan en hora local del negocio.
- La validación de disponibilidad convierte el `startDateTime` UTC de la reserva a la timezone de la organización antes de comparar con las reglas de disponibilidad.
- La UI muestra siempre los horarios convertidos a la timezone de la organización.
- No se acepta reserva si la conversión del `startDateTime` a hora local no cae dentro de una `AvailabilityRule` activa del recurso asignado.

---

## Recursos

- Cada recurso pertenece a una organización.
- Al crear una organización se crea automáticamente un recurso default (`isDefault = true`) con `type = PERSON`.
- Solo puede existir un recurso con `isDefault = true` por organización.
- Un recurso inactivo (`isActive = false`) no puede recibir nuevas reservas.
- No se puede eliminar un recurso si tiene reservas activas (PENDING o CONFIRMED). Se desactiva en su lugar.
- Las reglas de disponibilidad y las reservas siempre se asocian a un recurso específico.

---

## Servicios

- Un servicio pertenece a una organización.
- Un servicio inactivo (`isActive = false`) no puede recibir nuevas reservas.
- `durationMinutes` define el bloque horario de la reserva y es inmutable para reservas ya creadas.
- `capacity` define el máximo de asistentes que pueden acumularse en el mismo recurso y slot horario para ese servicio.
- `capacity = 1` significa turnos individuales: no puede haber dos reservas activas del mismo servicio que solapen para el mismo recurso.
- `price` es un valor de referencia. En el MVP no hay facturación real.
- No se puede modificar `durationMinutes` de un servicio sin advertir que afecta la interpretación de reservas futuras (no las existentes).

---

## Clientes

- Un cliente pertenece a una organización.
- Un cliente solo puede usarse en reservas de su misma organización.
- No se puede eliminar un cliente si tiene reservas activas o históricas. Los registros deben conservarse para trazabilidad.
- Si el cliente tiene email, se le envían notificaciones de confirmación y cancelación.

---

## Disponibilidad

- Una reserva solo puede crearse si el slot solicitado cae dentro de una `AvailabilityRule` activa del recurso asignado, evaluada en la timezone de la organización.
- Una regla de disponibilidad puede existir sin reservas. Una reserva no puede existir sin disponibilidad válida.
- Si la fecha de la reserva corresponde a un `BlockedDate` de la organización (con `resourceId = null`) o del recurso específico asignado, la reserva se rechaza.
- La disponibilidad se calcula exclusivamente en servidor.
- Un recurso puede tener múltiples reglas para el mismo día (ej: 9:00–13:00 y 15:00–19:00).

---

## Reservas — Condiciones de creación

Una reserva no puede crearse si:

1. El usuario no pertenece a la organización.
2. El usuario no tiene permiso para crear reservas (rol VIEWER).
3. El servicio no pertenece a la organización.
4. El cliente no pertenece a la organización.
5. El recurso no pertenece a la organización.
6. El servicio está inactivo.
7. El recurso está inactivo.
8. `startDateTime` está en el pasado (evaluado en UTC).
9. La fecha en timezone local de la organización está en un `BlockedDate`.
10. El slot no cae dentro de ninguna `AvailabilityRule` del recurso asignado.
11. La suma de `attendeesCount` de las reservas activas (PENDING o CONFIRMED) del mismo servicio, recurso y slot horario sumada a `attendeesCount` de la nueva reserva supera `service.capacity`.

La verificación de solapamiento y capacidad se ejecuta dentro de una transacción con bloqueo para evitar race conditions.

---

## Reservas — Máquina de estados

### Estados

| Estado | Descripción |
|---|---|
| PENDING | Reserva creada, aún no confirmada explícitamente |
| CONFIRMED | Reserva confirmada por el negocio |
| COMPLETED | El servicio fue realizado |
| CANCELLED | Reserva cancelada |
| NO_SHOW | El cliente no se presentó |

### Transiciones válidas

| Desde | Hacia | Quién puede ejecutar |
|---|---|---|
| PENDING | CONFIRMED | STAFF, ADMIN, OWNER |
| PENDING | CANCELLED | STAFF, ADMIN, OWNER |
| CONFIRMED | COMPLETED | STAFF, ADMIN, OWNER |
| CONFIRMED | CANCELLED | STAFF, ADMIN, OWNER |
| CONFIRMED | NO_SHOW | STAFF, ADMIN, OWNER |

COMPLETED, CANCELLED y NO_SHOW son estados terminales. No admiten transición salida.

Cualquier intento de ejecutar una transición no listada debe rechazarse en servidor con un error descriptivo.

---

## Estado de pago (paymentStatus)

- `paymentStatus` vive dentro de `Booking`. No hay entidad `Payment` en el MVP.
- El staff registra el pago manualmente actualizando este campo.
- Solo OWNER y ADMIN pueden modificar `paymentStatus`.

| Estado | Descripción |
|---|---|
| UNPAID | Sin pago registrado. Estado inicial |
| PAID | Pago registrado manualmente |
| WAIVED | Pago eximido (cortesía, error, etc.) |

- `paymentStatus` es independiente del `status` de la reserva. Una reserva CANCELLED puede estar PAID (si hubo cobro antes de cancelar).
- El dashboard puede mostrar reservas COMPLETED con `paymentStatus = UNPAID` como cobros pendientes.

---

## Emails transaccionales

Los emails se envían de forma asíncrona y no bloquean la respuesta de la API.

| Evento | Destinatario | Condición |
|---|---|---|
| Registro exitoso | Usuario (staff/owner) | Siempre |
| Reserva creada | Cliente | Solo si `Customer.email` no es null |
| Reserva cancelada | Cliente | Solo si `Customer.email` no es null |

El contenido del email incluye: nombre del cliente, nombre del servicio, fecha/hora en timezone local del negocio, nombre del negocio.

Los errores de envío de email no deben afectar el resultado de la operación principal. Se registran en el `AuditLog`.

---

## Auditoría

Se registra en `AuditLog` toda acción relevante sobre entidades operativas:

| Acción | `action` |
|---|---|
| Reserva creada | `booking.created` |
| Reserva modificada | `booking.updated` |
| Estado de reserva cambiado | `booking.status_changed` |
| Estado de pago cambiado | `booking.payment_status_changed` |
| Reserva cancelada | `booking.cancelled` |
| Servicio creado | `service.created` |
| Servicio editado | `service.updated` |
| Servicio desactivado | `service.deactivated` |
| Cliente creado | `customer.created` |
| Cliente editado | `customer.updated` |
| Recurso creado | `resource.created` |
| Recurso editado | `resource.updated` |
| Recurso desactivado | `resource.deactivated` |
| Disponibilidad configurada | `availability.updated` |
| Fecha bloqueada creada | `blocked_date.created` |
| Fecha bloqueada eliminada | `blocked_date.deleted` |

El campo `metadata` almacena el estado anterior y el nuevo cuando corresponde.

---

## Tests de reglas críticas

Los tests de las reglas de negocio más importantes no se dejan para el final del proyecto. Se escriben en la misma fase en que se implementa la feature correspondiente.

Cobertura mínima requerida:

- Validación de disponibilidad: que un slot válido sea aceptado y uno inválido rechazado.
- Validación de timezone: que la conversión UTC ↔ hora local sea correcta.
- Validación de solapamiento: que se rechace una reserva que supere la capacidad del slot.
- Prevención de race condition: que dos reservas simultáneas para el mismo slot con capacity=1 resulten en una aceptada y una rechazada.
- Máquina de estados: que las transiciones inválidas sean rechazadas.
- Multi-tenancy: que un usuario no pueda acceder a entidades de otra organización.
