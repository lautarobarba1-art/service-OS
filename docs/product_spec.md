# ServiceOS — Product Spec

## Concepto

ServiceOS es una plataforma SaaS multi-tenant para negocios de servicios que necesitan gestionar reservas, clientes, disponibilidad, pagos y métricas operativas desde un único panel.

## Problema

Muchos negocios de servicios gestionan su operación diaria usando WhatsApp, planillas, notas sueltas y mensajes dispersos. Esto genera pérdida de reservas, errores de disponibilidad, pagos pendientes sin seguimiento, falta de historial de clientes y poca visibilidad sobre el rendimiento del negocio.

## Usuario objetivo

Negocios pequeños o medianos que trabajan con turnos, clases, sesiones o reservas.

Ejemplos:
- Peluquerías y centros de estética
- Consultorios y clínicas
- Estudios de cocina y academias
- Gimnasios boutique y estudios de yoga
- Espacios de alquiler (salas, boxes, canchas)

## Objetivo del MVP

Construir una primera versión funcional que permita:

- Registrar usuario y autenticar vía Supabase Auth
- Crear una organización con timezone configurada
- Crear y gestionar recursos reservables (staff, salas, equipos)
- Gestionar servicios con duración y capacidad
- Gestionar clientes
- Configurar disponibilidad semanal por recurso
- Bloquear fechas específicas
- Crear reservas con validación completa server-side
- Evitar solapamientos y respetar capacidad por slot
- Cambiar estados de reserva según máquina de estados definida
- Registrar el estado de pago manualmente por reserva
- Visualizar calendario de reservas
- Ver dashboard con métricas operativas básicas
- Enviar emails transaccionales básicos (confirmación y cancelación)
- Registrar acciones importantes en auditoría

## Fuera del MVP

- Integración con pasarelas de pago reales (Stripe, MercadoPago, etc.)
- IA y recomendaciones automáticas
- Webhooks
- API pública
- App mobile
- Chatbot
- Automatizaciones complejas
- Integraciones externas avanzadas
- Portal de auto-reserva para clientes finales

## Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js App Router (TypeScript) |
| Estilos | Tailwind CSS |
| Auth | Supabase Auth |
| Base de datos | Supabase Postgres (PostgreSQL) |
| Seguridad adicional | Row-Level Security (RLS) de Supabase |
| ORM | Prisma |
| Validación | Zod |
| Formularios | React Hook Form |
| Tablas | TanStack Table |
| Gráficos | Recharts |
| Emails transaccionales | Resend |
| Deploy | Vercel |

## Criterio de éxito del MVP

El MVP se considera terminado cuando un usuario puede:

1. Registrarse e iniciar sesión.
2. Crear su negocio con timezone correctamente configurada.
3. Ver el recurso default creado automáticamente para su organización.
4. Crear servicios con duración y capacidad.
5. Crear clientes.
6. Configurar disponibilidad semanal para su recurso default.
7. Crear una reserva válida que pase todas las validaciones.
8. Ver esa reserva en el calendario con horario correcto en la timezone del negocio.
9. Cambiar el estado de la reserva según transiciones permitidas.
10. Registrar manualmente el pago de una reserva.
11. Confirmar que el sistema rechaza reservas fuera de horario, en fechas bloqueadas o con capacidad agotada.
12. Ver métricas básicas en el dashboard.
13. Confirmar que el cliente recibe un email de confirmación.
14. Confirmar que el aislamiento multi-tenant es correcto: un usuario no accede a datos de otra organización.
