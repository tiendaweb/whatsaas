# Plan de ejecución para la próxima sesión (Opus) — 2026-09-06

Todo lo de abajo está pensado para ejecutarse **sin volver a relevar**: cada tarea dice qué archivo tocar, qué patrón copiar y cómo se verifica. Leer antes: `docs/command-center-comercial/ESTADO.md` (§2026-09-06), `AUDITORIA-2026-09-06.md` y `docs/produccion/00-PLAN.md`. Reglas de trabajo que ya rigen: typecheck aparte (`NODE_OPTIONS=--max-old-space-size=6144 pnpm exec tsc --noEmit -p tsconfig.json`), matar `processChild.js` huérfanos, desplegar UNA vez al final con `NEXT_SKIP_TYPECHECK=1 pnpm run deploy:saasfy`, migraciones con `psql` y registradas en `_journal.json`, tools MCP verificadas con `NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-connector-tools.mts`. Rama `feat/tareas-rediseno`; **hay ~140 archivos sin commitear** desde hace días: conviene commitear al arrancar (`git add -A && git commit`), después de correr el typecheck.

## Estado en producción (desplegado el 2026-09-06)

- Cobros end-to-end (`server/cobros.ts`), radar que propone cobros, `register_sale` ejecutable al aprobar, tools `whatspro_sales_register_payment` / `_contact_money`.
- Producción OS: migración 0108, contrato, servidor, rutas, vistas `ProduccionOS` y `ProductionFocusView`, **enganchado en Tareas OS (nav "Producción", ícono fábrica en el pie del sidebar) y en Command Center › Producción**.
- Banco Gemini con día de Google y tope 20; check "Usar Gemini para transcribir audios" en la vista Audios; motor de automatizaciones cierra sesiones muertas; housekeeping vence corridas sin conector a las 72 h; skills `qa.*` v2 y `sales-ops.classify` v2 sembrados.

## Bloque A — Producción OS (prioridad 1)

### A1. Cola de trabajo de producción para conectores
- Crear `lib/plugins/tasks/server/production-work-queue.ts` copiando la forma de `lib/plugins/sales-ops/server/work-queue.ts` (`WorkItem` con `tools` y `steps`, `RULES`, `listWorkQueue`, `skip`). Fuente: `loadProductionOs(teamId)` → pedidos con `workStatus in ('pedido','aceptado','cambios')` (y `en_curso` asignados al conector, si `assigneeId` es el usuario del conector). Orden: familia demo primero, después cambios, después producción; dentro, por `dueDate` y antigüedad.
- `tools`/`steps` por `workKind` (definir en un mapa `CADENA_POR_TIPO` en `lib/plugins/tasks/shared/produccion.ts` para que la UI también los muestre):
  - `demo_sitio_aapp` / `sitio_aapp`: `gobiz_catalog_get` → `gobiz_sites_create` (una página) → `gobiz_sites_update`/`sections_set` → `whatspro_production_update {work_status:'entregado', delivery_url}`.
  - `demo_tienda_aapp` / `tienda_aapp`: `gobiz_stores_create` → `gobiz_store_products_create` (productos del chat) → `gobiz_stores_layout_install_preset` → entregar.
  - `demo_prosite` / `prosite`: `gobiz_prosites_create` → `gobiz_prosites_pages_create` (Inicio, Servicios, Contacto) → `gobiz_prosites_publish` → entregar.
  - `demo_html` / `sitio_html`: `gobiz_html_create` con el HTML completo → entregar.
  - `tienda_custom` / `desarrollo`: `whatspro_sales_tareas_from_chat action:"project"` o `whatspro_manage_task` (checklist), `whatspro_manage_document` (brief); estado `en_curso`.
  - `cambio`: leer `delivery_url` del pedido original (relación en `team_task_relations`), aplicar con la tool del producto (`gobiz_sites_update` / `gobiz_html_patch` / `gobiz_prosites_pages_patch`), entregar.
- RULES: nunca `entregado` sin `delivery_url`; si falta logo/textos/acceso → `espera_cliente` + `blocked_reason` (y NO escribirle al cliente: eso lo pide por el Command Center); un pedido por vez; cerrar siempre con `whatspro_production_update`; si el pedido trae `aiPrompt`, usarlo tal cual como brief.
- Tools (nuevo `lib/plugins/tasks/tools/production-tools.ts`, patrón `lib/plugins/sales-ops/tools/cobros-tools.ts`, JSON Schema puro): `whatspro_production_work_queue` (read), `whatspro_production_order_create` (→ `createProductionOrder`, `source:'connector'`), `whatspro_production_update` (→ `updateProductionOrder`, valida transición; acepta `work_status`, `delivery_url`, `blocked_reason`, `checklist_done: string[]`, `summary`), `whatspro_production_get` (un pedido con partes, chat y prompt). Registrar en un agregador nuevo `lib/plugins/grok-connector/server/production-actions.ts` y sumarlo donde se concatenan `salesOpsReadTools`/`salesOpsActionTools` en `app/api/plugins/grok-connector/mcp/route.ts` (buscar `salesOpsActionTools`), más `PRIORITY_TOOLS` (`whatspro_production_work_queue`, `_update`). Permiso `tasksRead`/`tasksWrite` con `assertPermission(context, 'tasksWrite', 'tasks')`.
- Federar en `lib/work-queue/service.ts` (`whatspro_work_queue`): source `production` con sus reglas (concatenar `queue.rules` como se hizo con `sales`).
- Verificación: `verify-connector-tools.mts`; smoke `scripts/smoke-production-queue.mts` (lista la cola del equipo 2 y hace un `update` dry-run inválido `pedido → entregado` que debe fallar por transición).

### A2. Del Command Center a Producción
- `lib/plugins/sales-ops/server/demos.ts` ya recibe `workKind`; en `execute.ts` (`request_demo`) y en `tools/tareas-tools.ts` mapear la necesidad del análisis (`need` en `team_commercial_analysis`: `sitio_web`→`demo_sitio_aapp`, `tienda_online`→`demo_tienda_aapp`, `tienda_profesional`→`demo_tienda_custom`, `sitio_profesional`→`demo_prosite`, `desarrollo_medida`→`desarrollo`) y pasar `requestedBy = userId`.
- Acción **Producción** en `lib/plugins/sales-ops/ui/focus/acciones.ts` (tools `whatspro_production_order_create`) + `deducirAccion`.
- Hoy (`ui/hoy/PanelHoy.tsx`): tarjeta "Producción pendiente" con conteo por estado (`loadProductionOs` ya devuelve todo; agregar `GET /api/plugins/tasks/production?summary=1` liviano).

### A3. Prompts por tipo de sitio (skills `prod.*`)
- `scripts/seed-production-skills.ts` copiando `scripts/seed-sales-ops-quick-actions.ts` (versionado idéntico). Una skill por `workKind` con `variables` (rubro, nombre, paleta, secciones, productos, tono) y `recommend_for` por tipo. Variante **con imágenes** para `demo_html`, `sitio_html`, `tienda_custom`, `prosite`: la salida incluye una lista `imagenes[]` (`{donde, prompt_de_imagen, tamaño}`) y el brief dice que primero se generan/eligen las imágenes y después el sitio. `executeProductionPromptWithBank` corre el `ai_prompt` de la tarea; la skill lo llena vía `updateProductionOrder({aiPrompt})`.
- En `ProductionFocusView` botón "Elegir skill" → `GET /api/plugins/sales-ops/prompts/recommended?workKind=` (extender la ruta para aceptar `workKind`).

### A4. Pantalla para humanos e IA con navegador
- En `ProduccionOS.tsx`: `data-testid="produccion-pedido-{id}"` en cada fila, `data-testid="produccion-accion-{estado}"` en cada botón de transición, filtro por familia/tipo/responsable/cliente, contadores por estado en la cabecera, sin drag & drop obligatorio. Panel plegable "Estado en JSON" con el pedido seleccionado (`<pre>`), para que una IA con Chrome lo lea sin adivinar.
- En `ProductionFocusView.tsx`: reusar `useBloque` de `lib/plugins/sales-ops/ui/focus/useBloque.ts` con clave `LS_BLOQUE_PRODUCCION`; barra de progreso = pedidos resueltos en la tanda; confeti al vaciar una familia (`Confeti.tsx` ya existe).
- Muro/historial: auditar `PRODUCCION_*` en `updateProductionOrder` (ya audita? verificar `activityLogs` en `production-os.ts`) y sumar familia `produccion` en `server/history.ts`, `shared/api-types.ts` y `ui/components/historial-meta.ts` (mismo patrón que `cobro`).

## Bloque B — Command Center, pendientes concretos (prioridad 2)

| # | Tarea | Archivo | Cómo |
|---|---|---|---|
| B1 | Nuevo lote sin campos para `assign_owner`/`schedule_call` | `ui/cola/NuevoLoteDialog.tsx` | selector de `OWNERS` → `payloadTemplate.extra.owner`; `datetime-local` (default `mananaALas10`) → `extra.at` ISO (`parsearLocal`). |
| B2 | Etiqueta "En cola" para corridas sin aprobar | `server/prompt-queue.ts` `rowToRun` (exponer `approved`), `ui/skills/skill-meta.ts`, `ui/cola/PromptsEnCola.tsx`, `tools/prompt-tools.ts` (`include_runs`) | `queued && !metadata.approvedAt` → "En revisión". |
| B3 | `blocked` sin `human_request` | `tools/prompt-tools.ts` (`resultSchema`), `server/prompt-queue.ts` `completePromptRun` | exigir `human_request` si `blocked`; si falta, guardar `failed`. |
| B4 | Cancelar `completed` desde la UI | `server/prompt-queue.ts` `completePromptRun` | rechazar `cancelled` desde `completed`. |
| B5 | Dos mapas de etiquetas | `ui/cola/api.ts` vs `ui/components/format.ts` | dejar uno; verbo por kind para `executed`. |
| B6 | `convertirProgramadoEnPedido` sin `approved` | `server/programados.ts` | `approved: true`. |
| B7 | `BarraPrompt` usa `ChipsAtajos` y `tituloDePedido` | `ui/focus/BarraPrompt.tsx`, `tipos.ts` | ya existen `ChipsAtajos.tsx`, `useAtajosTeclado.ts`; separar `LS_BLOQUE_SUPERVISION` en `useBloque`. |
| B8 | Cliente canónico en listas y UI | `server/queries.ts anotarClientes` → `resolverClientes`; `app/api/plugins/customers/by-contact/route.ts` (devolver `fuente`); `ContactRow`, `FichaView`, `PanelResumen`, `ClienteYMembresia` | misma regla `isExistingCustomer || customerId`, tooltip con la fuente. Smoke `scripts/smoke-es-cliente.mts` (contar por fuente; `vincularSiCoincide` sobre los 3 por teléfono). |
| B9 | Focus "Ejecutar ahora" modo `cobro` | `server/focus.ts` (5.ª salida `{"modo":"cobro","cobro":{importe,moneda,medio,fecha,concepto}}`), `ui/focus/api.ts`, `BarraPrompt.tsx` (tarjeta como la de CRM → `POST /contacts/{chatId}/cobros`) | la IA propone, la persona confirma. |
| B10 | Asientos 185/186/187 del equipo 2 en pesos | Finanzas | confirmar con el usuario y multiplicar por 100 (`UPDATE team_financial_entries SET amount = amount*100 WHERE id IN (185,186,187)`). |
| B11 | `whatspro_finance_list_entries` por `chat_id`; `customers_pending_payment` sumando asientos y suscripciones; `getContactMoney` mirando asientos por `customer_id` | `grok-connector/server/finance-actions.ts`, `lib/plugins/customers/server/pending-payment.ts`, `lib/contacts/graph.ts` | resolver `customer_id` con `resolverCliente`. |
| B12 | `meta-ads-sync` | PM2 + token Meta | renovar token (System User); `pm2 restart meta-ads-sync --update-env` con `CRON_SECRET`/`APP_URL` del `.env`. |
| B13 | Pusher 413 | `app/api/webhook/evolution/route.ts` `safePusherTrigger` | emitir `{chatId, messageId}` y que el cliente pida el mensaje. |
| B14 | Notas de vigencia en docs 00/05/07/08 y `idempotency_key` correcto en doc 07/06 | `docs/command-center-comercial/*.md` | texto en AUDITORIA §C. |
| B15 | Doble aprobación en acción "Mensaje" del Focus | decisión de producto | si se quiere más automático: la fila nace aprobada y la ejecuta el servidor. |

## Bloque C — Verificación final de la sesión
1. `tsc` en verde → `verify-connector-tools.mts` → smokes (`smoke-cobros.mts`, `smoke-focus-directo.mts`, `smoke-crm-fix.mts`, el nuevo de producción) → `deploy:saasfy` una vez → `git commit`.
2. Actualizar `ESTADO.md` (tabla de fases 22 en adelante) y la memoria `project_produccion_os.md`.
## Lo que queda después de la tanda del 2026-09-06/07

Orden sugerido. Todo lo demás del plan anterior está hecho.

1. **Asientos en pesos (plata, pedir confirmación primero).** `team_financial_entries` 185, 186 y 187 del equipo 2 están cargados en pesos y no en centavos: se ven 100 veces más chicos que el resto (la mediana de los otros ingresos pagos es 3.000.000 = $30.000). Son "Sur Bohemio — Tienda Online anual" (40000), "Raul Maurel — Saldo" (100000) y "Raul Maurel — Seña" (100000). Con el OK del usuario: `UPDATE team_financial_entries SET amount = amount * 100 WHERE team_id = 2 AND id IN (185,186,187);`.
2. **Token de Meta.** `meta_ad_accounts.id=10` tiene `last_error` "Session has expired on 13-Jul-26". El proceso PM2 ya tiene `CRON_SECRET` y `APP_URL`; falta un System User token nuevo cargado desde la app.
3. **`scripts/seed-sales-ops-quick-actions.ts` no es idempotente.** Compara la huella del texto contra la fila guardada, pero `variables` y `recommend_for` son `jsonb` y Postgres reordena las claves: cada corrida crea 12 versiones nuevas. `scripts/seed-production-skills.ts` ya tiene la solución (serializar con las claves ordenadas): copiarla.
4. **`ListaClientes.tsx`** rotula "ventas pendientes" un número que ahora suma ventas, asientos y suscripciones impagas (`listCustomersPendingPayment` devuelve `sources`). Cambiar el rótulo a "pendiente de cobro" y mostrar el detalle.
5. **`Enfoque.tsx` de Tareas OS** debería aceptar un pedido de producción: hoy hay dos relojes de 25 minutos (`LS_BLOQUE` de Tareas y `sales-ops:focus:bloque-produccion`).
6. **B15, decisión de producto.** La acción "Mensaje" del Focus comercial hace que la persona apruebe dos veces: aprueba el pedido y después la fila. Si se quiere más automático, que la fila nazca aprobada y la ejecute el servidor; se dejó como está porque un mensaje a un cliente es lo único que conviene mirar dos veces.
7. **Suscripciones `cancelled` impagas** quedaron fuera de cobranzas a propósito (no es plata que vaya a entrar). Confirmar con el usuario.
