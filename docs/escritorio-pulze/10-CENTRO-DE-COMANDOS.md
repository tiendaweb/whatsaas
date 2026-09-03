# Centro de Comandos — plan consolidado

**Origen:** workflow `centro-de-comandos` (4 agentes exploradores + 1 de diseño + 3 críticos).
El agente de producto y el consolidador no llegaron a devolver; la consolidación se hizo acá
a mano sobre el diseño y las dos críticas completas (**daño irreversible** y **datos/permisos**).

**Pedido literal del usuario:** *"El centro de mando podría dejarme botones para responder con
también opción personalizada, checkbox, sugerida las respuestas mismas por la IA de cada cosa a
atender para dejar listo todo a realizarse".*

## Regla de consolidación

Donde una crítica de gravedad **alta** contradice al diseño, **gana la crítica**. Se listan abajo
las que efectivamente cambiaron el diseño.

## Decisiones cerradas

| # | Decisión | Por qué (crítica que la impuso) |
|---|---|---|
| 1 | **`send-message` NO lleva `remoteJid`.** El cliente manda sólo `chatId`; el servidor resuelve el destinatario con `chats ⋈ contacts` bajo `chatScope(ctx)` y usa el `remoteJid` de la base | `sendTeamTextMessage` rutea por `recipientJid`: validar el `chatId` y enviar al jid del cliente es un chequeo decorativo. Un agente podía escribirle a cualquier número |
| 2 | **Vista previa y ejecución son rutas distintas.** `/validar` no importa `sendTeamTextMessage`; `/ejecutar` exige `confirm: 'EJECUTAR'` literal | `dryRun?: boolean` opcional es fail-open sobre lo irreversible: perder el campo manda los mensajes de verdad |
| 3 | **Un solo `send-message` por request.** Los reversibles van en lote; los envíos los dispara el cliente de a uno, en serie, con `AbortController` | Da el botón **Detener** (único "undo" posible), hace imposible el duplicado por destinatario dentro de un lote y evita el request monolítico sin cancelación |
| 4 | **La `idempotencyKey` la deriva el servidor**: `cc:{batchId}:{chatId}`, con `batchId` = uuid creado al abrir la revisión y reusado en el reintento | La clave por contenido (`sha1(text)`) nunca caduca: el recordatorio mensual con el mismo texto se traga en silencio y la UI lo pinta "ya enviado". Y una clave provista por el cliente no garantiza ningún invariante |
| 5 | **`send_unknown` ≠ `send_failed`.** Timeout/abort ⇒ entrega indeterminada: no se ofrece reintento, se enlaza al chat | El botón "reintentar" duplicaba exactamente en el caso para el que existía |
| 6 | **El chip muestra el texto real truncado**, no un `label` que la IA inventa aparte | El modelo puede etiquetar "Confirmar turno" un cuerpo que dice otra cosa, y el chip es un clic |
| 7 | **Acuse por fila en la revisión**: cada envío tiene su checkbox *revisado* y el botón queda deshabilitado hasta que estén todos. La fila encabeza con **destinatario resuelto en el servidor** (nombre + número enmascarado) y la firma que se va a aplicar | El modo de falla de un lote de IA no es el texto malo: es el texto bueno a la persona equivocada, y el diálogo no mostraba a quién |
| 8 | **`reply` de todos los kinds pasa por `chatScope`.** Sin scope: `reply: null` y el ítem se ve sin canal. El teléfono **nunca** viaja al cliente | `deal`/`membership`/`event` se gateaban sólo por su permiso de lectura: filtraban teléfono, nombre y borrador de contactos que la bandeja de chats le oculta a ese agente |
| 9 | **`move-deal-stage` sólo acepta etapas abiertas** (`qualified`/`proposal`/`negotiation`) en el zod | `DEAL_STAGES` incluye `closed_won`: cerrar desde el lote saltea `salesWrite`, y `moveDeal` no escribe `closedAt`, así que el KPI de ganadas quedaría mintiendo |
| 10 | **Dedupe por destinatario.** Dos ítems del mismo contacto no pueden planificar dos envíos: la revisión los colapsa y el servidor rechaza el segundo | Un cliente con chat sin leer + membresía vencida + deal estancado son 3 ítems: un clic le mandaba 3 mensajes seguidos |
| 11 | **El plan es derivado, no estado paralelo.** Sólo se ejecuta lo que está seleccionado Y sigue presente tras revalidar; el chip planifica y entra en modo selección | Un clic de curiosidad quedaba planificado y salía media hora después junto con otra cosa |
| 12 | **`snooze` = `max(now, dueDate) + días`**, `días` 1..90, y la fecha anterior queda en `activityLogs` | `now + days` **adelanta** el vencimiento de una tarea que vencía la semana que viene, y pisaba 25 fechas sin registro |
| 13 | **`teamId` explícito en el body; 409 si no coincide** con el contexto | `getUserPermissionContext` resuelve el equipo con un `findFirst` por `userId`: con un usuario en dos equipos, el mensaje sale por el WhatsApp de la otra empresa |
| 14 | **Fingerprint de caché con `contactId`** y validación del contacto antes de servirla; claim con `ON CONFLICT DO NOTHING` antes de generar | Reasignar el contacto de un deal servía 30 minutos un borrador dirigido al contacto anterior. Y sin claim, el scroll dispara N generaciones pagas para la misma fila |
| 15 | **El extracto de conversación se declara dato hostil** en el prompt, y el borrador se marca `warning` si trae importes, porcentajes o fechas que no están en el contexto | "No prometas descuentos" es una instrucción, no un control: un cliente puede dictar la respuesta del equipo |
| 16 | **`message_drafts` se filtra por `contactId`/`assignedUserId`/`departmentId`**, y un borrador con `[[variable]]` sin resolver **no se puede planificar**: abre el editor | El fallback sin IA ofrecía en un clic el borrador escrito para Juan en la fila de María |
| 17 | **Auditoría completa en `metadata`**: `{ itemId, chatId, contactName, textPreview, textHash, source, provider, model, editedByHuman, batchId }` | Cuando el cliente reclame "me prometieron la devolución", es el único registro que distingue si lo escribió la persona o el modelo |
| 18 | `counts` se inicializa con las 5 claves en 0 y cuenta **antes** del corte, para que el badge diga "8 de 60" | Un kind apagado sin clave revienta el render; un `counts` post-corte hace creer que se terminó |

## Descartado (y por qué)

- **Widget del Escritorio.** El centro de comandos es una pantalla propia con su nav. Un widget
  compacto que "sugiere pero no ejecuta" duplica el código de sugerencias en la superficie donde
  el usuario menos revisa. Se puede agregar después sin tocar el backend.
- **Cerrar oportunidad como ganada / registrar venta desde la bandeja.** Emite venta y exige
  `salesWrite` + idempotencia propia. Un clic en una bandeja no es el lugar para facturar.
- **`kind: 'event'` con canal de respuesta.** `listEvents` no trae `contactId`; el evento entra
  como ítem informativo (abrir), sin sugerencias.
- **Reutilizar `BarraSeleccion.tsx` / `Confirmacion.tsx` del plugin Tareas.** Diccionario `es`
  hardcodeado (el Escritorio es trilingüe), `fixed bottom-8 z-30` debajo de la barra móvil que es
  z-50, y sin focus trap. La barra va sticky dentro del Card y el diálogo es el de shadcn.
- **`processAIMessage` para redactar.** Muta `ai_sessions.history` y ejecuta tools con efectos
  reales (manda media, cambia etapa, hace handover). Redacción pura = `generateStructuredObjectForTeam`.

## Riesgos que quedan abiertos

1. **`sendTeamTextMessage` reclama la clave idempotente DESPUÉS del envío.** La ventana de carrera
   es todo el llamado a Evolution (10 s). Se mitiga acá con un envío por request y el botón
   deshabilitado durante el vuelo, pero el arreglo real es invertir el orden en `lib/messaging/send.ts`
   (INSERT ... ON CONFLICT DO NOTHING antes del fetch). No se toca en este PR: afecta a todas las
   superficies que envían.
2. **`getUserPermissionContext` con `findFirst` sin `teamId`.** Se cubre acá con la guarda del
   punto 13; el arreglo global sigue pendiente.
3. **Sin techo de gasto de IA.** Hay caché con TTL y claim, y las sugerencias se piden sólo para lo
   visible en tandas de ≤6. No hay tabla de uso: si hace falta un tope duro, va después.
4. **Tres definiciones de "qué chat puede ver este usuario"** (`chatScope`, `userCanAccessChat`,
   `findAccessibleChat`). `lib/desktop/scope.ts` unifica la variante permisiva
   (`assignedUserId` **o** departamento) y el Escritorio pasa a usarla; migrar improve-reply y
   ai-summary queda pendiente.

## Implementado

| Archivo | Responsabilidad |
|---|---|
| `lib/desktop/scope.ts` | `chatScope` unificado (permisivo) + `resolveScopedChats`, que devuelve el `remoteJid` de la base |
| `lib/chats/reply-context.ts` | `buildSavedContext` / `buildConversationExcerpt`, sacadas de `improve-reply` para no escribir la tercera copia |
| `lib/chats/mark-read.ts` | `markChatsRead(teamId, ids)`: un UPDATE + un solo trigger de Pusher |
| `lib/desktop/command-center/types.ts` | Contrato de ítem, acción, sugerencia y resultado; `maskJid` |
| `lib/desktop/command-center/service.ts` | La bandeja: 5 kinds, cuota por kind, `counts` pre-corte, `reply` bajo scope |
| `lib/desktop/command-center/suggestions.ts` | IA + caché con reserva + degradación a `quick_replies` / `message_drafts` |
| `lib/desktop/command-center/execute.ts` | Permiso por acción, destinatario resuelto en el servidor, idempotencia derivada, auditoría |
| `lib/desktop/command-center/schema.ts` | zod de `/validar` y `/ejecutar` (`confirm: 'EJECUTAR'`, un envío por request) |
| `app/api/escritorio/bandeja/{,sugerencias,validar,ejecutar}/route.ts` | Las cuatro rutas |
| `components/escritorio/command/*` | `CommandCenter`, `useCommandPlan`, `CommandItemRow`, `SuggestionChips`, `CustomReplyPopover`, `ReviewDialog`, `ResultDialog`, `KindBadge` |
| `app/[locale]/(dashboard)/escritorio/bandeja/page.tsx` | La pantalla, con su ítem en la nav del Escritorio |
| `lib/db/migrations/0090_command_center_suggestions.sql` | `team_command_suggestions`, **registrada en `_journal.json`** y aplicada con `psql` |
| `scripts/smoke-command-center.mts` | Smoke contra la base real |

### Verificación

```bash
NODE_OPTIONS="--max-old-space-size=6144" npx tsc --noEmit -p tsconfig.json   # limpio
pnpm build                                                                   # verde
SMOKE_TEAM=2 SMOKE_USER=3 NODE_OPTIONS="--conditions=react-server" \
  npx tsx scripts/smoke-command-center.mts
pnpm run deploy:saasfy
```

Resultado del smoke sobre el equipo 2 (datos reales): 273 conversaciones sin leer, 382 tareas y
10 membresías pendientes; 24 ítems servidos con la cuota por kind; el payload del agente con
visibilidad acotada **no contiene ningún `remoteJid`**; las sugerencias caen a plantillas porque
ese equipo no tiene IA activa; la validación resuelve destinatarios enmascarados
(`+5492 *****4341`); el lote con dos envíos al mismo chat se rechaza con `duplicate_recipient`; y
un usuario sin `messagesSend` no recibe ni sugerencias.

### Lo que falta para una v2

1. Widget compacto en el Escritorio que enlace a la bandeja.
2. Tope de gasto de IA por equipo/día (hoy hay caché con TTL y reserva, no un techo).
3. Migrar `improve-reply` y `ai-summary` a `lib/desktop/scope.ts` para que las tres definiciones
   de visibilidad de chat sean una sola.
4. Invertir el orden del reclamo de la clave idempotente en `lib/messaging/send.ts`.
