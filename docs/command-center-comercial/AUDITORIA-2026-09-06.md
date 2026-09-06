# Auditoría integral del Command Center — 2026-09-06

Cinco relevamientos de sólo lectura, hechos el mismo día. Cada hallazgo tiene archivo:línea del momento del relevamiento; lo marcado **[hecho]** se corrigió ese día, lo marcado **[pendiente]** queda para la siguiente sesión. Los números son del equipo 2.

## A. Flujo Cola / Focus / conectores

| # | Hallazgo | Estado |
|---|---|---|
| A1 | `proposeBatch` aplanaba `extra` en la raíz del payload y `execute.ts` leía `payload.extra` (inexistente): `schedule_call` perdía la hora, pre-descarte perdía el motivo | **[hecho]** payload lleva `extra` aplanado y anidado; `extraDe()` lee ambos |
| A2 | Nuevo lote ofrece `assign_owner` y `schedule_call` sin campos (responsable / fecha) → al aprobar fallan `sin_responsable` o agendan "mañana 10" | **[pendiente]** `NuevoLoteDialog`: selector de `OWNERS` → `extra.owner`, `datetime-local` → `extra.at` |
| A3 | Focus de supervisión marcaba "aprobado" al editar una fila del lote (`onChanged`) | **[hecho]** `RevisarLote.onDecidido` sólo al aprobar/rechazar; estado `supervisado` |
| A4 | Reintentar una corrida duplicaba (la original quedaba `failed` y se volvía a ofrecer) | **[hecho parcial]** `metadata.relaunchedAs`; verificar guard de estado en `relaunchRun` y filtro en `ColaView`/`ReintentarFallidas` |
| A5 | Regla del conector pedía `status:"skipped"`, que la tool rechaza | **[hecho]** `failed` + `result.error:"customer_replied"` |
| A6 | `skipped` significaba dos cosas (cliente respondió / register_sale sin ejecutar) | **[hecho]** register_sale ya se ejecuta; queda el `skipped` de "respondió" |
| A7 | "Ejecutar N" ejecutaba 25 | **[hecho]** ruta `execute` acepta 200 |
| A8 | Contador del dashboard contaba corridas sin aprobar | **[hecho]** |
| A9 | "Ejecutados" de la sesión del Focus siempre 0 | **[hecho]** `onEjecutado` en `BarraPrompt` → `FocusView` |
| B1 | Los dos Focus no compartían título de pedido, prompt vacío, atajos, tecla S, reloj (`LS_BLOQUE` compartido), etiquetas de solapas | **[parcial]** `ChipsAtajos`, `useAtajosTeclado`, `tituloDePedido` creados; falta usarlos desde `BarraPrompt` y separar `LS_BLOQUE_SUPERVISION` |
| B2 | "Aprobado" en corridas es metadata y las etiquetas lo ignoran ("En cola" para lo que espera revisión) | **[pendiente]** `rowToRun.approved`, `etiquetaDeCorrida` |
| B3 | Dos rutas para lanzar corridas con defaults distintos; `convertirProgramadoEnPedido` sin `approved` | **[pendiente]** |
| B4 | `blocked` sin `human_request` se dibuja como falla | **[pendiente]** exigir `human_request` en `prompt-tools` |
| B5 | Textos de tools con "aprobar no envía", "no tocar el CRM", "cuatro tipos" | **[hecho]** queue/manage/work-tools, MCP route, seed |
| B6 | Dos mapas de etiquetas (`cola/api.ts` vs `components/format.ts`) | **[pendiente]** |
| B7 | Cancelar corridas: UI cancela `completed`, tool no | **[pendiente]** guard en `completePromptRun` |
| C | Estados `pending_approval`/`executing` que nadie escribe; código muerto en `acciones.ts` (`plantilla`, `tituloDeAccion`), `PanelResumen`, `FinDeEtapa` `<dd>`/`<dt>` | **[parcial]** |

## B. ¿Es cliente?

Cinco criterios distintos en código: vínculo `team_customer_contacts` (137), teléfono coincidente con `team_customers` (+3, sólo la UI lo veía), `custom_data.cliente` (102, 98 ya vinculados), etiqueta de producto (332; 241 sin vínculo), venta pagada / suscripción activa (1 / 65, y el dossier no miraba suscripciones por `customer_id`). 103 análisis G11, todos por vínculo; 33 vinculados sin análisis (el prefiltro los excluía); 87 clientes con suscripción activa sin contacto vinculado; 124 con etiqueta de producto y gate G8/G9 que entraban a lotes de envío.

**[hecho]** `lib/customers/es-cliente.ts` (`resolverCliente`: vínculo → suscripción activa → venta pagada → teléfono; lo débil nunca decide), usado por dossier/rules/classifier/fingerprint; `cliente-hook.ts` marca stale al vincular. Un cobro registrado vincula solo.
**[pendiente]** listas (`queries.ts anotarClientes`), `by-contact` route, UI, `vincularSiCoincide` en housekeeping, quitar exclusión de vinculados en el prefiltro (verificar), smoke `scripts/smoke-es-cliente.mts`.

## C. Contradicciones en instrucciones (resueltas hacia la versión más automática)

1. "No tocar el CRM" seguía en: descripción de `whatspro_sales_work_queue`, instrucciones del servidor MCP, `lib/work-queue/service.ts`, las 12 skills `qa.*` (REGLAS del seed), Ayuda (contenido.ts 69/73/472), docs 00/04/05/07/08. **[hecho]** en código y seed; **[pendiente]** re-sembrar (`npx tsx scripts/seed-sales-ops-quick-actions.ts`) y notas de vigencia en docs.
2. P9 en tres versiones (ConectoresCard, seed, doc 07). **[hecho]** `shared/prompt-p9.ts` única fuente.
3. `idempotency_key` = `sales-ops:{actionId}` (docs decían `{fecha}:{chatId}`). **[pendiente docs]**
4. `execute` apagado por defecto en la tool de aprobar. **[hecho]** default true.
5. "Focus no toca el CRM" en Ayuda y doc 08 (tiene modo `crm` desde el 05-09). **[pendiente]**
6. `crm_catalog` vs `crmCatalog`. **[pendiente]** en `prompts.ts` y `acciones.ts`.
7. El conector no puede leer `sales-ops.classify` (la lista de skills lo excluye). **[pendiente]** `whatspro_sales_dossier` debe devolver `prompt.systemPrompt`; el step ya lo pide.
8. `team_prompts` v1 de `sales-ops.classify` sin `crm_fix` en el contrato. **[pendiente]** script v2.
9. Doble aprobación en la acción "Mensaje" del Focus (pedido aprobado → propuesta → aprobar de nuevo). Decisión pendiente.

## D. Finanzas por MCP

Modelo: `team_sales` (1 fila) vs `team_financial_entries` (55 ingresos) vs suscripciones (251) — tres verdades; `getContactMoney` sólo mira ventas; unidades mezcladas (asientos 185/186/187 en pesos, el resto en centavos); 0 pagos parciales, 0 cuentas; asientos sin vínculo a chat salvo por comprobante. Un conector no podía "registrar que Juan pagó" en una llamada ni cobrar contra una venta pendiente ni listar deudas por chat.

**[hecho]** `registrarCobro` + tools + kind ejecutable + radar que propone. **[pendiente]** corregir a mano los 3 asientos en pesos; `whatspro_finance_list_entries` por `chat_id`; `customers_pending_payment` sumando asientos y suscripciones; que `getContactMoney` mire también asientos por `customer_id`.

## E. Salud operativa (2026-09-06)

| Componente | Estado | Acción |
|---|---|---|
| Banco Gemini | roto: `limit_rpd` 200 vs 20 real; día UTC vs reset de Google 07:00 UTC → 17 h apagado por día | **[hecho]** `diaDeGoogle`, keys a 20, contadores liberados |
| Cron `/api/cron?secret` | 404 cada 5 min (165 `ResponseAborted`/día) | **[hecho]** línea quitada, backup en `/root/crontab.backup-2026-09-06` |
| `meta-ads-sync` | Unauthorized desde 2026-07-13 (sin env) + token Meta vencido | **[pendiente]** re-registrar con `CRON_SECRET`/`APP_URL`; renovar token (System User) |
| Automatizaciones | 214 sesiones activas, 76 en "PRIMER MENU" desactivado; flujo apagado mandó 10 mensajes | **[hecho]** engine cierra sesiones de flujos inactivos o >14 días; 212 cerradas |
| Cola de audios | parada por el banco; 482 `queued` | se destraba con el banco; check `transcribirAudios` **[hecho]** (UI pendiente) |
| Corridas `queued` viejas (31) | nada las expira | **[pendiente]** housekeeping 72 h |
| Disco 87 % | build cache 5,9 GB, sin logrotate | **[pendiente]** `docker builder prune -f`, `pm2-logrotate` |
| Pusher 413 | evento con payload > 10 KB se traga | **[pendiente]** emitir sólo ids |
| Instancias de otros equipos | team 4 `connecting` desde 08-18 | avisar al equipo |
| OK | entrada/salida WhatsApp, send-scheduled, notifications, radar, classify, housekeeping, aapp-sync | — |
