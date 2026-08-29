# Mensajes programados desde Seguimiento

## Qué existe

- Tabla `teamScheduledMessages` (`lib/db/schema.ts:4553-4586`): `name, status(active|paused|completed|failed), instanceId, targetNumbers jsonb string[], scheduleType(once|daily|weekly), scheduledAt, hour, minute, weekdays, actionType(message|automation), message, mediaUrl, automationId, nextRunAt, runCount, maxRuns, lastError`.
- `GET/POST /api/plugins/scheduled-messages` (`route.ts`, zod `createSchema` en 16-31). El POST calcula `nextRunAt` con `computeNextRunAt` y, si `instanceId` viene vacío, resuelve la instancia con `resolveSendingInstance(teamId)`; 400 si no hay ninguna.
- `PATCH/DELETE /api/plugins/scheduled-messages/[id]`, `POST …/[id]/toggle`.
- Formulario completo `MessageFormDialog` y selector `RecipientPicker` en `lib/plugins/scheduled-messages/ui/ScheduledMessagesDashboard.tsx` (420-437 y 176-182). Son privados.
- El plugin Tareas ya hizo algo casi igual: `lib/plugins/tasks/ui-nueva/views/ProgramadosCliente.tsx` (CRUD filtrado por teléfono del contacto). Sirve de referencia, no se reusa porque usa tokens de Tareas.
- Permisos: `scheduledMessagesRead` para ver, `scheduledMessagesWrite` para crear/pausar/borrar. Plugin `scheduled-messages` debe estar activo para el equipo (`activationMode: 'global'`).

## Cambios

1. Extraer a `lib/plugins/scheduled-messages/ui/MessageFormDialog.tsx` y `RecipientPicker.tsx`, exportando también `FormState`, `defaultForm()`, `formToPayload()` (hoy la conversión está inline en `GeneralScheduledMessagesDashboard` 798-810; se saca a una función pura). El dashboard importa de ahí. Cero cambios visibles en `/plugins/scheduled-messages`.
2. Hook `useProgramadosDeContacto(numero)` en `components/seguimiento/ProgramadosContacto.tsx`: SWR de `GET /api/plugins/scheduled-messages` y filtro en cliente `targetNumbers.some(n => normalizar(n) === normalizar(numero))`. Con 214 filas es instantáneo; si el equipo llegara a miles, se agrega `?number=` al GET.

## "Programar mensaje" desde la tarjeta o el panel

Abre `MessageFormDialog` con:

```
form = {
  ...defaultForm(),
  name: `Seguimiento · ${nombre}`,
  targetNumbers: [numero],
  instanceId: String(instanceId ?? ''),   // la del chat; si vacío el server resuelve
  scheduleType: 'once',
  scheduledAt: mañana 09:00 en hora local (formato datetime-local),
}
```

El `RecipientPicker` queda visible pero ya trae el número: el usuario puede agregar más si quiere. Al guardar, `POST`, `toast.success("Programado para {fecha}")`, `mutate` del listado.

## Pestaña Programados del panel lateral

Lista compacta, sin card por ítem:

```
⏱ Mañana 09:00 · una vez                                   [⏸] [🗑]
   "Hola Juan, te escribo para…"
⏱ Lunes y jueves 10:30 · semanal · 3 envíos                 [▶] [🗑]
   "Recordatorio de…"
```

- Fila `py-2 border-b border-border/60 last:border-0`; fecha en `text-sm`, cadencia en `text-xs text-muted-foreground`, texto del mensaje en `text-xs text-muted-foreground line-clamp-2`.
- Estado `failed`: punto rojo y `lastError` en `title`.
- `completed`: gris, sin acciones.
- Botón arriba a la derecha "Programar" (`size="sm"`), oculto sin `scheduledMessagesWrite`.
- Vacío: "Sin mensajes programados" + el botón.
- Fecha con `Intl.DateTimeFormat('es-AR', …)` dentro de try/catch; para `daily`/`weekly` se arma el texto con los `weekdays` (0 = domingo).

## Lo que no se hace en la v1

- No se edita un programado desde el panel (sólo pausar/reanudar/borrar). Editar = link a `/plugins/scheduled-messages`.
- No se programan automatizaciones desde acá (`actionType: 'automation'` sigue en el dashboard del plugin).
