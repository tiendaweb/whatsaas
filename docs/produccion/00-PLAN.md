# Producción OS — plan (2026-09-06)

Pedido del usuario: el equivalente del Command Center Comercial para **producción**, dentro de Tareas OS (tareas, proyectos, Focus), ultra intuitivo para personas pero pensado **principalmente para pasadas de conectores MCP** (Claude/ChatGPT/Grok) y para IA que maneja Chrome o la PC. Flujo: Noelia manda a hacer demos y producción de clientes (o cambios), o el conector los genera cuando lo considera; producción supervisa y ve qué está pendiente, hecho y por hacer; bloques de trabajo de 25 minutos por proyecto; prompts separados por tipo de sitio (incluidos los que necesitan diseño de imágenes).

Productos: demos en sitios HTML, tiendas custom, tiendas y sitios de AAPP SPACE (`gobiz_stores_create` / `gobiz_sites_create`), sitios profesionales (`gobiz_prosites_create`); producción de lo vendido; cambios de clientes.

## Backup del diseño actual de Tareas OS

- Tag de git `tareas-os-diseno-2026-09-06` (HEAD antes de tocar la UI).
- `/root/backups/tareas-os-ui-nueva-2026-09-06.tar.gz` = `lib/plugins/tasks/ui-nueva` de ese commit.
- Restaurar: `git checkout tareas-os-diseno-2026-09-06 -- lib/plugins/tasks/ui-nueva` (o descomprimir el tarball sobre el repo).

## Lo que ya existe (hecho el 2026-09-06 con ChatGPT, verificado con `tsc` y migración aplicada)

| Pieza | Dónde | Qué hace |
|---|---|---|
| Migración `0108_produccion_os` (aplicada, en `_journal.json`) | `lib/db/migrations/0108_produccion_os.sql` | `work_kind`, `work_status`, `requested_by`, `delivery_url`, `blocked_reason` sobre `team_task_items` + índice; relleno desde los títulos de las tareas de Demos / Producción / Clientes (379 tareas tipadas: 205 desarrollo en curso, 106 entregadas, 30 aceptadas; demos 7 pedidas…). El `status` genérico de Tareas sigue al operativo. |
| Contrato compartido | `lib/plugins/tasks/shared/produccion.ts` | 12 `WORK_KINDS` (demo_html, demo_tienda_custom, demo_tienda_aapp, demo_sitio_aapp, demo_prosite, sitio_html, tienda_custom, tienda_aapp, sitio_aapp, prosite, desarrollo, cambio) en 3 familias (demo / produccion / cambio); 7 `WORK_STATUSES` (pedido → aceptado → en_curso → espera_cliente → entregado → cambios; descartado) con transiciones válidas (`puedeTransicionar`); `estadoTareaPara`; `checklistPorDefecto` por tipo. |
| Servidor | `lib/plugins/tasks/server/production-os.ts` | `loadProductionOs` (pedidos con progreso, partes, prompt y última corrida IA; miembros; destinos), `createProductionOrder` (idempotente, vincula contacto/cliente/chat), `updateProductionOrder` (valida transición; `source` user/connector/command-center), `executeProductionPromptWithBank` (corre el `ai_prompt` de la tarea con el banco Gemini). |
| Rutas | `app/api/plugins/tasks/production/route.ts` (GET/POST), `[id]/route.ts` (PATCH), `[id]/execute/route.ts` | permisos `tasksRead`/`tasksWrite` vía `getPluginRequestContext` (arreglado para mezclar el preset del rol). |
| Vistas | `lib/plugins/tasks/ui-nueva/views/ProduccionOS.tsx`, `ProductionFocusView.tsx` | Tablero/cola por estado y familia + Focus de producción (bloque de 25 min por pedido, checklist, prompt, link de entrega, chat del cliente). |
| Enganche | `lib/plugins/sales-ops/ui/views/ProduccionView.tsx` (vista `os`) + botón **Focus de producción** en la barra del Command Center (`SalesOpsApp.tsx`) | Se usa desde el Command Center › Producción. |
| Tests | `tests/connectors/production-os-contract.test.ts` | contrato de tipos/estados. |
| Gemini | setting `transcribirAudios` del plugin Gemini (`lib/plugins/gemini/manifest.ts`) honrado por `runAudioInsightsBatch` | apagado, el banco queda para el Command Center / Producción y lo manual. Falta el check en la cabecera de la vista Audios. |

## Hecho el 2026-09-06, tanda 3

- **Nav "Producción" en Tareas OS** (ícono de fábrica en el pie del sidebar, `prefs.nav = 'produccion'`), además del acceso desde Command Center › Producción.
- **Cola de producción para conectores**: `lib/plugins/tasks/server/production-work-queue.ts` + tools `whatspro_production_work_queue` y `whatspro_production_get` (`lib/plugins/tasks/tools/production-tools.ts`, agregador `grok-connector/server/production-actions.ts`). Devuelve lo que espera a producción (`pedido`, `aceptado`, `cambios`, y lo `en_curso` de quien pregunta) con la **cadena exacta de tools y pasos por tipo** (`CADENA_POR_TIPO` en `shared/produccion.ts`) y nueve reglas duras. Federada en `whatspro_work_queue` como fuente `production`. 279 tools MCP, sin duplicados. Smoke: `scripts/smoke-production-queue.mts` (51 pedidos reales del equipo 2: 10 demos, 38 de producción, 3 cambios).
- Las tools `whatspro_production_list` / `_create` / `_update` ya existían en `lib/plugins/sales-ops/tools/tareas-tools.ts` (el chat es quien pide el trabajo): la cola NO las duplica, las nombra en sus pasos.
- Familia **produccion** en el historial y el Muro del Command Center (`PRODUCTION_OS_*` auditado).

## Lo que falta, en orden

1. ~~Enganchar en Tareas OS~~ y ~~cola de trabajo para conectores~~: **hechos** (ver arriba). Falta que **Enfoque** (`views/Enfoque.tsx`) acepte un pedido de producción, para que el bloque de 25 min de Tareas OS y el de Producción sean el mismo reloj.
2. ~~Cola de trabajo para conectores~~: **hecha**. Falta sumarle `checklist_done` y `summary` a `whatspro_production_update` (hoy hay que reenviar el checklist entero).
3. **Del Command Center a Producción sin copiar a mano**: `request_demo` (ya crea la tarea en Demos) debe setear `work_kind` según la necesidad del análisis (`need` → tipo de demo) y `work_status = 'pedido'`, `requested_by`; `createClientProject` idem con `desarrollo`/`sitio_*`. Pedido de la persona en el Focus comercial: acción **Producción** en `ui/focus/acciones.ts` (tools: `whatspro_production_order_create`).
4. **Prompts por tipo de sitio** (skills `prod.*` en el Prompt Studio, `scripts/seed-production-skills.ts`): uno por `work_kind`, con variables (rubro, paleta, secciones, productos) y una variante **con diseño de imágenes** (genera el brief de imágenes: hero, logo provisorio, fotos de producto; salida = lista de prompts de imagen + dónde va cada una) para los tipos que lo necesiten (HTML, tienda custom, pro site). `executeProductionPromptWithBank` ya corre el prompt de la tarea; la skill llena `ai_prompt`.
5. **Pantalla para humanos y para IA con navegador**: en `ProduccionOS.tsx` estados como columnas con contadores, filtro por familia/tipo/responsable/cliente, una fila = un pedido con progreso (checklist) y link de entrega; en `ProductionFocusView.tsx` un solo pedido con: qué falta (checklist), prompt listo para copiar, botones **Aceptar · Empezar · Esperando al cliente · Entregado (pide link) · Cambios**, y el chat del cliente al lado. Para IA con Chrome: `data-testid` estables en botones y filas (`produccion-pedido-{id}`, `produccion-accion-{estado}`), textos sin ambigüedad, sin drag & drop obligatorio (todo se puede hacer con clic), y un panel "Estado en JSON" plegable con el pedido actual.
6. **Focus de 25 minutos por proyecto**: reusar `useBloque` del Command Center (`lib/plugins/sales-ops/ui/focus/useBloque.ts`) con clave propia `LS_BLOQUE_PRODUCCION`; barra de progreso = pedidos resueltos en la tanda; al vaciar una familia, pasar a la siguiente (demo → producción → cambios).
7. **Supervisión**: vista "Pendiente de producción" en Hoy del Command Center (conteo por estado) y en el Muro (auditar `PRODUCCION_*` en `activity_logs`, familia nueva del historial).
8. **Audios**: check "Usar Gemini para transcribir" en la cabecera de la vista Audios (`AudiosView.tsx`, guardar en settings del plugin Gemini como `reservaDiariaPct`), y `resumenAudios.transcripcionActiva`.

## Reglas que no se aflojan

- El estado operativo (`work_status`) manda; el `status` de Tareas lo sigue (`estadoTareaPara`).
- Un conector no marca `entregado` sin `delivery_url`; no salta de `pedido` a `entregado` (transiciones de `WORK_STATUS_TRANSITIONS`).
- Nada de esto envía WhatsApp: avisar al cliente sigue siendo un pedido del Command Center (fila aprobada).
- Las demos son pre-venta y se hacen rápido y en volumen; la producción es lo vendido; los cambios van sobre lo entregado. No se mezclan en la misma columna.
