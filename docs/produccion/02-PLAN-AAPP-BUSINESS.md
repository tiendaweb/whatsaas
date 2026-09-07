# Producción OS ↔ AAPP SPACE / AAPP BUSINESS — qué falta para que todo vaya encaminado (2026-09-07)

> **Ejecutado el 2026-09-07 (tanda 6)**: §1 (horas, sesiones, ticket, US$/h, gates, rondas), §2 (handoff), §4 (catálogo, `qa`/`activado`, CAZA/PILOTO/TORRE), smoke `scripts/smoke-produccion-horas.mts` (22 ✓). **Pendiente**: §3 — `scripts/repair-produccion-desarrollo.mts --dry-run` dio 0 / 0 / 235 (ninguno cumple los criterios automáticos; los 235 «desarrollo» en curso son de agosto y hay que decidir a mano). Ver `ESTADO.md` fases 31–34.

Fuente: los HTML publicados en aapp.space entre el 04 y el 06/09 —
`catalogo-operativo-aapp` (Catálogo Operativo v1.2), `protocolo-produccion-aapp-space`
(Protocolo Maestro SPACE v1.0), `manual-business-operations` (Protocolo Maestro BUSINESS,
8 etapas), `radiografia-aapp-business` (arquitectura CAZA/PILOTO/TORRE) y `mapa-maestro`
(índice de todo)— cruzados contra lo que Producción OS tiene hoy en `team_task_items`
(`work_kind`, `work_status`, `delivery_url`, `blocked_reason`) y contra los 12 demos HTML
publicados el 06/09.

Todo lo de abajo está pensado para ejecutarse sin volver a relevar: archivo, patrón a copiar,
verificación. Reglas de la casa que siguen rigiendo: typecheck aparte, migraciones con `psql`
registradas en `_journal.json`, UN despliegue al final, tools MCP verificadas con
`verify-connector-tools.mts`.

## 0. Lo que se reparó hoy sin esperar

- **12 de 15 pedidos de demo tenían el título diciendo «PUBLICADA» y `delivery_url` vacío.**
  Los demos existían en aapp.space (ids 569–579) pero el pedido nunca supo dónde. Se cruzaron
  por nombre (coincidencia exacta e inequívoca) y se escribió sólo el enlace: 1322 Fe Em Deus,
  1351 PERITAR, 1354 CCCA, 1365 Sil Ambos, 1366 ECOPISSIS, 1367 Packaging/Fernando, 1368 Caza y
  Pesca/Hernán, 1369 Grondona, 1370 Tec, 1372 Rodrigo cosmética, 1373 Aventurate, 1403 Naty
  Codoni (`plataformapsico.aapp.pro`). **El estado no se tocó**: `en_curso` / `espera_cliente`
  reflejan el seguimiento comercial y eso lo decide una persona.
- Quedan 3 sin enlace: 1321 Dr. Soto (está `entregado` sin URL: viola la regla «no se entrega
  sin enlace», hay que pedirle a Noelia el link), 1330 Psicopedagogía (AAPP PRO, no es un HTML
  de aapp.space), 1364 M3 Producciones («PUBLICADA en A…», título cortado: buscar en
  `gobiz_html_list` página 2). Y el HTML 579 «clasicourbanodemo (demo Brian)» **no tiene
  pedido**: un demo hecho fuera de la cola. Crear el pedido con `whatspro_production_create`
  y cerrarlo con el enlace.

## 1. El dato clave que falta: HORAS REALES por pedido

Los tres documentos dicen lo mismo con distintas palabras: *«Si no medimos horas, volvemos al
mismo problema»* (Protocolo SPACE §08), *«Priorizamos lo que produce más ganancia por hora»*
(Catálogo, regla central), *«Horas estimadas y reales · margen»* (Protocolo BUSINESS §Medición).
La línea roja del catálogo es numérica: **más de 6 horas con ticket menor a US$ 250 no entra
como prioridad normal**, y el «Evaluador de oportunidad» calcula `ticket / horas = US$/h` con
umbrales 50 (alta) / 25 (revisar) / menos (segundo plano).

Hoy Producción OS **no guarda ni horas ni ticket**: `team_task_items` no tiene ninguna columna
de tiempo trabajado ni de precio, y el único reloj (25 minutos, ahora unificado entre Enfoque y
Producción) vive en `localStorage` y se olvida al terminar el bloque. Sin eso no se puede
calcular US$/h, no se puede aplicar la línea roja y el KPI principal del protocolo no existe.

### 1.1 Migración `0109_produccion_horas.sql` (registrar en `_journal.json`)

```sql
ALTER TABLE team_task_items
  ADD COLUMN ticket_amount integer,                 -- unidad menor, como Finanzas
  ADD COLUMN ticket_currency varchar(3),
  ADD COLUMN estimated_minutes integer,             -- lo que ventas prometió
  ADD COLUMN revision_rounds_included smallint,     -- 1 express, 2 premium (Catálogo)
  ADD COLUMN revision_rounds_used smallint NOT NULL DEFAULT 0,
  ADD COLUMN payment_state varchar(24);             -- pendiente | anticipo | total | verificado | excepcion

CREATE TABLE team_task_work_sessions (
  id serial PRIMARY KEY,
  team_id integer NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  task_id integer NOT NULL REFERENCES team_task_items(id) ON DELETE CASCADE,
  user_id integer REFERENCES users(id) ON DELETE SET NULL,
  started_at timestamp NOT NULL,
  ended_at timestamp,
  minutes integer,                                  -- se calcula al cerrar; NULL = abierta
  kind varchar(16) NOT NULL DEFAULT 'foco',         -- foco | descanso (el descanso no cuenta)
  source varchar(16) NOT NULL DEFAULT 'bloque',     -- bloque | manual | connector
  note text,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX team_task_work_sessions_task_idx ON team_task_work_sessions(team_id, task_id);
```

Las horas son la suma de `minutes` con `kind='foco'`. No se guardan «horas» como número
suelto en la tarea porque la primera pregunta del protocolo es *cuántas rondas y cuántos
bloques se fueron en retrabajo*, y eso necesita sesiones con fecha.

### 1.2 Servidor

- `lib/plugins/tasks/server/work-sessions.ts` (nuevo): `abrirSesion(teamId, taskId, userId,
  kind)`, `cerrarSesion(teamId, sessionId)`, `registrarSesionManual(teamId, taskId, minutes,
  note)`, `resumenHoras(teamId, taskId)` → `{ minutosFoco, sesiones, rondas }`. Una sola
  sesión abierta por usuario: abrir otra cierra la anterior.
- `production-os.ts` `loadProductionOs`: sumar `horas` y `ticket` a cada `ProductionOrder`,
  y calcular `usdPorHora` con la referencia del catálogo (**ARS 1.530 = US$ 1** al 04/09; leerla
  de `team_financial_exchange_rates` si existe, si no, constante en `shared/produccion.ts`
  con la fecha).
- `updateProductionOrder`: aceptar `ticket_amount`, `ticket_currency`, `estimated_minutes`,
  `revision_rounds_included`, `payment_state`. **Regla nueva, no negociable**: transición
  `pedido → aceptado` exige `payment_state in ('total','verificado','anticipo','excepcion')`
  — «sin pago no hay posición en cola» (Protocolo SPACE paso 3, BUSINESS etapa 02). Con
  `excepcion` exige `blocked_reason` con el motivo y quién autorizó.
- `cambios`: cada transición `entregado → cambios` incrementa `revision_rounds_used`; si
  supera `revision_rounds_included`, la respuesta lleva `fueraDeAlcance: true` y la UI lo
  muestra como «Extra = presupuesto» (Protocolo SPACE §05).

### 1.3 Reloj → sesiones

`useBloqueProduccion` ya guarda `desde` y `terminaEn`. Al `arrancar('foco')` con un pedido
abierto: `POST /api/plugins/tasks/production/{id}/sessions {action:'open'}`; al `terminar()` o
al vencer: `{action:'close'}`. El hook no cambia de forma: se le pasa `onArrancar`/`onTerminar`
opcionales desde `ProductionFocusView` y `Enfoque`. Si el navegador se cierra con una sesión
abierta, `resumenHoras` la cuenta hasta `terminaEn` como máximo (nunca más de un bloque).

### 1.4 Tools MCP

`whatspro_production_update` acepta los campos nuevos; `whatspro_production_get` devuelve
`horas`, `ticket`, `usd_por_hora`, `rondas`; tool nueva `whatspro_production_log_time`
(`task_id`, `minutes`, `note`) para que un conector que produjo un demo deje constancia del
tiempo. Registrar en `production-actions.ts`. Verificar con `verify-connector-tools.mts`.

### 1.5 Pantalla

- `ProduccionOS.tsx`: columna «Horas» y chip **US$/h** con el color del Evaluador (verde ≥ 50,
  amarillo ≥ 25, rojo < 25; rojo fijo si horas > 6 y ticket < US$ 250). Contador **WIP** en la
  cabecera: `en_curso` de familia `produccion` — el protocolo dice **máximo 3**, hoy hay
  **205 `desarrollo` en `en_curso`** (§3).
- `ProductionFocusView.tsx`: «Ticket» y «Pago» editables en la cabecera; «Rondas 1/1» al
  lado del estado; botón «Registrar tiempo a mano».
- `Enfoque.tsx` (Tareas): ya comparte el reloj; cuando la tarea activa tiene `workKind`, mostrar
  el chip del pedido y abrir sesión.

### 1.6 Smoke

`scripts/smoke-produccion-horas.mts`: abre y cierra una sesión sobre un pedido de prueba,
verifica que `pedido → aceptado` sin pago falla, que `cambios` sube `revision_rounds_used`, y
que `usdPorHora` da lo mismo que el Evaluador del catálogo para (ticket 131 USD, 3 h) → 44.

## 2. Handoff: la ficha que el protocolo exige y Producción OS no tiene

Protocolo SPACE §06 (8 ítems) y BUSINESS etapa 03 (7 ítems) exigen una ficha de handoff
antes de producir. Hoy el pedido tiene `ai_prompt` (brief) y `blocked_reason` (texto libre).

- Añadir `handoff jsonb` al pedido: `{ logo, colores, textos, fotos, whatsapp, productos,
  accesos, alcanceAceptado, canalRevision }` con valores `ok | falta | ia` (`ia` = autorizado a
  resolver con IA, como dice el checklist). `loadProductionOs` calcula `handoffCompleto`.
- Regla: `aceptado → en_curso` exige `handoffCompleto` o `espera_cliente` con la lista de
  faltantes en `blocked_reason`. Es exactamente «si el handoff está incompleto, el trabajo no
  empieza».
- UI: la checklist en `ProductionFocusView` con los 8 ítems, un clic cada uno. Los conectores
  la llenan por `whatspro_production_update {handoff}`.
- **`request_demo` desde el Command Center** (`sales-ops/server/demos.ts`) ya recibe el
  análisis del chat: rellenar `handoff` con lo que se sabe (whatsapp = el del contacto,
  productos = los que aparecen en el chat) en vez de dejarlo en blanco.

## 3. Datos sucios que contradicen el protocolo

- **205 pedidos `desarrollo` en `en_curso` y 30 `aceptado`**, creados entre el 24/06 y el
  05/09: es la importación de proyectos de clientes (`server/client-projects.ts`, uno por
  cliente), no trabajo en curso. Con eso el WIP es 205 y ningún tablero sirve. Decisión a
  tomar con el usuario: (a) marcarlos `entregado` en lote con `delivery_url` del sitio del
  cliente cuando exista (`team_customers` ↔ Hostinger/aapp), o (b) sacarles `work_kind`
  (vuelven a ser tareas comunes) y dejar en Producción sólo lo que realmente se está
  produciendo. Recomendación: (b) para los que no tienen movimiento en 30 días, (a) para el
  resto. Script `scripts/repair-produccion-desarrollo.mts` con `--dry-run` primero.
- 1321 «Dr. Soto» `entregado` sin `delivery_url` (§0).

## 4. Catálogo de productos: un solo lugar

El Catálogo Operativo v1.2 tiene 6 productos SPACE + 3 planes Chatbot + 3 de AAPP BUSINESS
+ kits de redes, con precio en ARS y USD. En WhatsPro los precios están repartidos:
`CADENA_POR_TIPO` (tipo → tools), `sales-ops` (`need` → `workKind`), Membresías (planes de
chatbot) y ninguno sabe el precio de un «Sitio Web anual».

- `lib/plugins/tasks/shared/catalogo.ts`: `CATALOGO_AAPP` = `{ key, nombre, workKind,
  precioArs, precioUsd, recurrencia: 'anual'|'mensual'|'unico', rondasIncluidas, horasObjetivo,
  familia: 'space'|'business'|'chatbot'|'redes' }` con los 15 ítems del documento **y la fecha
  de vigencia** («congelar 30 días» → hasta el 04/10/2026). `need` del análisis comercial →
  `key` del catálogo → `workKind` + `ticket` + `rondasIncluidas` al crear el pedido.
- `whatspro_production_create` acepta `catalog_key` y rellena ticket/rondas/estimado solo.
- Tool de lectura `whatspro_catalog_list` para que los conectores coticen con los precios
  reales (hoy los inventan o los leen del HTML).
- CAZA/PILOTO/TORRE son `workKind` nuevos (`business_caza`, `business_piloto`,
  `business_torre`) con la cadena de BUSINESS: sus checklists (14/13/17 ítems del Protocolo)
  van como `checklist` inicial del pedido, y las 8 etapas se mapean a `work_status` con dos
  estados nuevos: **`qa`** (entre `en_curso` y `entregado`) y **`activado`** (después de
  `entregado`; «construido no significa activado»). Migración: ampliar `WORK_STATUSES`,
  `WORK_STATUS_TRANSITIONS` y `WORK_STATUS_META`; los tipos SPACE pueden saltar `qa` → no:
  el Protocolo SPACE también tiene QA interno (paso 7). Mejor: `qa` obligatorio para todos.

## 5. Lo que los documentos prometen y WhatsPro ya tiene (no construir dos veces)

La Radiografía describe TORRE como *«WhatsPro guarda y opera · Radar entiende · Focus prioriza
· Command Center muestra · Modo Noelia presenta · el humano aprueba · Queue protege · Cloud
ejecuta»*. Eso **es** el plugin `sales-ops`: clasificador G0–GX (Radar), Focus, Cola con
aprobación (Queue), `SERVER_EXECUTABLE_KINDS` (Cloud), `whatspro_work_queue` (ejecutor). Lo
que falta para venderlo como TORRE a un tercero es lo que ya está anotado en
[[project-mcp-full-coverage-batch]]: **A3/A4, visibilidad y permisos de lectura por equipo**
antes de un segundo usuario, y que el Command Center del cliente **no muestre** margen
interno, catálogo AAPP ni Misión 9000 (Radiografía §10). Eso es un `teamId` distinto con el
plugin habilitado y `buildPermissionContext` fail-closed — ya existe, falta probarlo con un
equipo que no sea el 2.

PILOTO = WhatsPro + chatbot + CRM básico: ya existe (automatizaciones, CRM, etiquetas).
CAZA = sitio profesional + Google Ads: el Mapa Maestro dice **«Google Ads: PÁGINA TODAVÍA NO
CREADA»** y el plugin `meta-ads` sólo sabe Meta. Google Ads es un plugin nuevo (fuera de este
plan).

## 6. Orden de ejecución (una sesión, un despliegue)

1. §1.1 migración + §1.2 servidor + §1.4 tools → typecheck → `verify-connector-tools`.
2. §1.3 reloj → sesiones, §1.5 pantalla.
3. §2 handoff (columna jsonb en la misma migración 0109).
4. §4 catálogo en código + `catalog_key` en `production_create`.
5. §3 script de reparación en `--dry-run`, mostrar el resultado, decidir con el usuario.
6. Smokes (§1.6 + `smoke-production-queue.mts`) → **un** `deploy:saasfy` → commit →
   `ESTADO.md` fase 28 + memoria `project_produccion_os.md`.

Lo que NO entra: Google Ads (plugin nuevo), Radar Dashboard (404 en aapp.space, legacy),
LAB LATAM (auditorías, no producción), redes sociales (el catálogo lo desincentiva).
