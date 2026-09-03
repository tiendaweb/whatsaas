# Eventos y notificaciones

## Qué hay hoy

Fase 1 no introdujo ningún mecanismo nuevo de eventos de dominio. Reutiliza exactamente lo que ya existía en el repositorio:

| Pieza | Uso en Fase 1 |
|---|---|
| `activity_logs` | Auditoría de acciones de agentes IA vía el helper `audit()` de `lib/plugins/grok-connector/server/actions.ts`. Solo se audita una acción nueva: `GROK_NOTE_TASKS_GENERATED`, disparada por la tool MCP `whatspro_generate_tasks_from_note`. |
| `team_notifications` | No se tocó en Fase 1. Sigue disponible (usada hoy por `calendar/events` y `calendar/notifications`) para futuras alertas de vencimientos financieros o recordatorios de reunión. |
| Pusher | No se usó para finanzas/reuniones/notas en esta fase. |
| Polling/SWR | Las UIs de Finance/Notes/Calendar leen estado por refetch normal, sin push de eventos. |

### `audit()` — cómo funciona

```ts
// lib/plugins/grok-connector/server/actions.ts
export async function audit(context: GrokActionContext, action: string, entityId: number | string) {
  await db.insert(activityLogs).values({
    teamId: context.teamId,
    userId: context.userId,
    action,
    ipAddress: String(entityId).slice(0, 45), // reutiliza la columna existente para guardar el id de entidad
  });
}
```

Es un registro de auditoría (quién hizo qué), no un evento de dominio: no dispara side-effects ni tiene consumidores. Los endpoints REST nuevos de finance/calendar/notes (fuera del conector MCP) **no llaman a `audit()`** — no hay `audit(` en `app/api/plugins/finance/**`, `app/api/plugins/calendar/events/**` ni `app/api/plugins/notes/**`. Solo la acción ejecutada por un agente IA (`generateTasksFromNote`) queda auditada.

## Qué falta para eventos de dominio reales

No existe hoy un event bus ni una cola durable. `docs/business-platform/80-integracion-eventos.md` es el diseño más riguroso disponible en el repo (auditoría del 2026-08-14) y propone, sin añadir infraestructura nueva (nada de Kafka/RabbitMQ/Redis-BullMQ):

- Un **outbox transaccional en PostgreSQL**: al cambiar un agregado (ej. una `team_financial_entry` pasa a `paid`, o se agenda una reunión) se inserta un hecho de dominio en la misma transacción.
- Un **dispatcher** que materializa una entrega inbox por consumidor registrado.
- **Workers** que reclaman entregas con lease + `FOR UPDATE SKIP LOCKED`, procesan fuera de la transacción de claim, y registran éxito/retry/dead-letter.
- Semántica **at-least-once**: todo handler debe ser idempotente (relevante porque Evolution/Meta/pagos ya se comportan así).
- Orden garantizado solo por consumidor y agregado, nunca global.
- `team_notifications` seguiría informando personas; el outbox/inbox es para que otros módulos reaccionen a hechos, son cosas distintas.
- `activity_logs` seguiría respondiendo "quién hizo qué"; los eventos de dominio responderían "qué hecho ocurrió".

Esto **no se implementó** en Fase 1 (decisión explícita del 2026-08-14, ver `README.md`). Ejemplos concretos de lo que hoy no puede pasar sin este outbox:

- Que al marcar una `team_financial_entry` como `paid` se dispare automáticamente una notificación o una tarea de seguimiento.
- Que una reunión con `outcome` cargado dispare la generación de tareas sin que un agente IA la invoque manualmente.
- Que un webhook de pago (Stripe/Mercado Pago) alimente el estado financiero de Fase 1 en vez de solo el módulo de pagos original.

Referencia completa del diseño propuesto: `docs/business-platform/80-integracion-eventos.md` §1-§2 y siguientes.
