# AAPP BUSINESS — plataforma de administración de clientes (2026-09-07)

> Origen: se está creando en el ecosistema AAPP el usuario **admin@aapp.business**. Este
> documento releva las 13 landings publicadas en aapp.space sobre AAPP BUSINESS (CAZA · PILOTO ·
> TORRE), las cruza contra lo que WhatsPro ya tiene construido, y deja el plan para que
> admin@aapp.business pueda vender y administrar sus propios clientes **desde su propia marca**
> (dominio `aapp.business`), apoyado 100% en el motor de WhatsPro, y operable por conectores MCP
> de punta a punta (landing → alta de cliente → planes → CRUD → panel).

## 0. Lo que dicen las 13 landings (relevamiento completo, 2026-09-07)

Leídas con `gobiz_html_get`/`gobiz_html_query`: `radiografia-aapp-business`,
`manual-business-operations`, `catalogo-operativo-aapp`, `mapa-maestro`,
`protocolo-produccion-aapp-space`, `business-command/automation/growth`,
`manual-business-command/automation/growth`, `mision-9000-octubre-2026`, `business-operations`.

**No hay ninguna mención textual de `admin@aapp.business` ni del dominio `aapp.business`** en
ninguna de las 13 páginas — son documentación de venta/producción interna (Martín, Carlos,
Noelia), no la especificación del panel. Tampoco aparecen las palabras "API", "CRUD" ni
"conector"/"MCP".

**Qué es AAPP BUSINESS:** el motor de ticket alto de AAPP SPACE, en tres capas acumulativas
(cada una incluye la anterior):

| | CAZA (Business Growth) | PILOTO (Business Automation) | TORRE (Business Command) |
|---|---|---|---|
| Precio | US$300 | US$500 | US$750 |
| Función | Genera demanda (sitio pro + Google Ads) | Atiende y filtra por WhatsApp (chatbot + CRM) | Prioriza y decide (Command Center) |
| Horas objetivo / línea roja | 3h / 5h | 5h / 8h | 7-8h / 12h |
| Recurrencia sugerida | — | Chatbot desde US$33/mes | Command Center US$99/mes + chatbot |

**La frase que define la arquitectura de TORRE** (Radiografía, literal): *"WHATSPRO GUARDA Y
OPERA · RADAR ENTIENDE · FOCUS PRIORIZA · COMMAND CENTER MUESTRA · MODO NOELIA PRESENTA · EL
HUMANO APRUEBA · QUEUE PROTEGE · CLOUD EJECUTA."* Explícitamente dice **no construir un CRM ni
un panel nuevos**: Radar = clasificador G0-GX, Focus = priorización, Command Center = el
`sales-ops` que ya existe, Queue = la cola aprobada con `idempotency_key`, Cloud =
`SERVER_EXECUTABLE_KINDS`. El "NO HACER" de la Radiografía es explícito: *"otro CRM por
interfaz · localStorage como base de TORRE · mezclar tenants · vender Modo Noelia como cuarto
producto · entregar MISIÓN 9000 como TORRE."* Y la capa cliente ("Multi-tenant") describe
`PLATFORM → company_id → contacts/conversations/actions` con roles OWNER/MANAGER/SALES — es
exactamente un modelo de tenant + roles, sin especificar ninguna pantalla.

**Conclusión del relevamiento**: no existe (ni está especificado) un panel de administración
propio de AAPP BUSINESS. El propio material asume que el cliente que compra CAZA/PILOTO/TORRE
termina operando **dentro de WhatsPro**, multi-tenant. Eso es literalmente el módulo de **marca
blanca / resellers** que WhatsPro ya tiene (`feat/task-os-embed`, [[project_white_label_resellers]]),
sólo que hoy es de sólo-humano y con CRUD muy limitado. Radar/Focus/Command Center/Queue/Cloud
de TORRE ya existen como el plugin `sales-ops` (Command Center Comercial). El protocolo de
producción de 8 etapas y el catálogo con `business_caza/business_piloto/business_torre` **ya
están implementados** en Producción OS (`lib/plugins/tasks/shared/catalogo.ts`, tanda 6 del
2026-09-07): la parte de "vender y entregar un CAZA/PILOTO/TORRE como proyecto único" está
resuelta. **Lo que falta es la capa de arriba: el negocio recurrente — dar de alta clientes
propios, cobrarles un plan propio mes a mes, y que admin@aapp.business administre todo eso desde
su marca, incluso por conector.**

## 1. Qué existe hoy vs. qué falta (auditoría de código, 2026-09-07)

Módulo de resellers (`app/[locale]/(reseller)/reseller/*`, `lib/resellers/*`,
`lib/db/queries/resellers.ts`, migraciones 0050-0054):

| Pieza | Hoy | Falta |
|---|---|---|
| Tenant por dominio | ✅ `lib/tenant/` resuelve por header `Host`, `reseller_domains` | Alta de `aapp.business` (Traefik + DNS, ver §9) |
| Wallet prepago | ✅ completo, con idempotencia | — |
| Planes | Sólo **re-precificar** planes globales existentes (`reseller_plan_prices`) | **Crear planes propios** (CAZA/PILOTO recurrente, Command Center, etc.) con su propio bundle de plugins |
| Clientes | Sólo lectura: tabla de equipos que se auto-registraron | **CRUD real**: alta manual de un cliente (crea equipo + owner + plan) |
| Landing | Un solo HTML crudo pegado a mano (`landing_pages` slug `''`) | Ya soporta multi-página en el schema (`slug` único por reseller) pero la UI/acciones sólo tocan una; falta **captura de leads** |
| Conectores MCP | **Cero tools.** `grep reseller lib/plugins/grok-connector` no devuelve nada | Todo lo de arriba expuesto como tools |
| Visibilidad del Command Center para un cliente de reseller | Pendiente (ya anotado en [[project_mcp_full_coverage_batch]] como A3/A4) | Ocultar margen interno, catálogo AAPP, Misión 9000 — lo pide también el propio marketing de TORRE |

## 2. Arquitectura elegida

**No se construye un sistema nuevo.** admin@aapp.business se da de alta como un **reseller**
más de WhatsPro (tabla `resellers`), con su propio dominio (`aapp.business`), su propia landing,
sus propios planes y sus propios clientes — reutilizando wallet, branding, dominio y pagos que
ya existen. Cada cliente de AAPP BUSINESS es un `team` normal de WhatsPro con `resellerId`
apuntando a este reseller.

**Separación de responsabilidades (no mezclar):**
- **Producción (proyecto único, ya resuelto)**: vender e implementar el CAZA/PILOTO/TORRE inicial
  sigue siendo Producción OS (`work_kind`, ticket, horas, handoff, QA). No se toca.
- **Negocio recurrente (lo nuevo de este plan)**: una vez entregado, el cliente queda como
  **team con `resellerId`**, con un **plan propio del reseller** (Command Center US$99/mes,
  Chatbot, etc.) que factura el reseller con SUS credenciales (`payment_provider_settings`
  ya soporta `resellerId`).

## 3. Migración `0111_aapp_business.sql`

Verificar contra el schema real antes de aplicar (patrón `psql` + registrar en `_journal.json`,
ver [[feedback_build_commands]] y [[project_drizzle_journal_desync]]).

```sql
-- Planes propios de un reseller (hoy sólo re-precifican planes de la plataforma)
ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS reseller_id integer REFERENCES resellers(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS provisioning_plugin_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ALTER COLUMN stripe_product_id DROP NOT NULL,
  ALTER COLUMN stripe_price_id DROP NOT NULL;

-- Un plan de plataforma exige sus ids de Stripe; uno de reseller no (se completan al
-- publicarlo con syncResellerPlanPrice(), que puede tardar).
ALTER TABLE plans ADD CONSTRAINT plans_stripe_or_reseller_chk
  CHECK (reseller_id IS NOT NULL OR (stripe_product_id IS NOT NULL AND stripe_price_id IS NOT NULL));

CREATE INDEX IF NOT EXISTS plans_reseller_idx ON plans (reseller_id);

-- Leads captados por la landing de un reseller (aún no son un team)
CREATE TABLE IF NOT EXISTS reseller_leads (
  id serial PRIMARY KEY,
  reseller_id integer NOT NULL REFERENCES resellers(id) ON DELETE CASCADE,
  name varchar(160) NOT NULL,
  email varchar(255),
  phone varchar(32),
  message text,
  source_page varchar(191),           -- slug de landing_pages que lo generó
  status varchar(20) NOT NULL DEFAULT 'new',  -- new | contacted | won | lost
  converted_team_id integer REFERENCES teams(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reseller_leads_reseller_idx ON reseller_leads (reseller_id, status, created_at DESC);
```

No hace falta tabla nueva para "clientes": un cliente de AAPP BUSINESS **es** un `teams` row
con `reseller_id` (ya existe desde la migración 0050). Alta manual = crear team + owner + plan,
no un CRUD paralelo.

## 4. Servidor

- `lib/resellers/plans.ts` (nuevo): `createResellerPlan(resellerId, {name, amount, currency,
  interval, provisioningPluginIds, retailAmount})` — inserta en `plans` con `resellerId` y en
  `reseller_plan_prices`; `updateResellerPlan`, `archiveResellerPlan` (idempotente: nunca borra
  un plan con clientes activos, lo oculta). `syncResellerPlanPrice()` (ya anotado como pendiente
  en [[project_white_label_resellers]]): crea producto+precio en el Stripe **del reseller**
  usando `payment_provider_settings` de ese `resellerId`; si el reseller no tiene Stripe
  conectado, el plan queda "publicado sin cobro automático" (cobro manual, como ya soporta
  `manual.ts` en `lib/payments/plugins/`).
- `lib/resellers/clients.ts` (nuevo): `createResellerClient(resellerId, {teamName, ownerEmail,
  ownerName, planId})` — crea `teams` (`resellerId`), busca o crea `users` por email, la
  membresía owner, aplica el plan (wallet debit si `paymentsEnabled`), y **habilita el bundle de
  plugins** de `plans.provisioningPluginIds` (`team_plugins` insert, patrón ya usado por
  `lib/plugins/core/registry.ts`). `updateResellerClient` (cambiar plan → re-provisiona el
  bundle), `suspendResellerClient` (no borra nunca).
- `lib/resellers/leads.ts` (nuevo): `createLead`, `listLeads`, `updateLeadStatus`,
  `convertLeadToClient(leadId, planId)` → llama a `createResellerClient` y guarda
  `convertedTeamId`.
- **Endpoint de captura pública** `app/api/reseller-leads/route.ts` (POST, sin auth — resuelve
  el `resellerId` por el `Host` de la request vía `lib/tenant/resolve.ts`, igual que hace
  `/sign-in`): valida con zod, inserta `reseller_leads`. Rate-limit básico (mismo patrón que
  otros endpoints públicos del repo).
- **Visibilidad A3/A4** (bloqueante para vender TORRE a un tercero, ya anotado en
  [[project_mcp_full_coverage_batch]] y pedido también por el propio marketing): en
  `sales-ops`, todo lo que muestra `teamId` debe filtrar por el equipo de sesión — auditar
  que ningún endpoint de Command Center devuelva `CATALOGO_AAPP`, margen (`usdPorHora`,
  `ticket_amount` interno) ni nada de Misión 9000 cuando el `team.resellerId` no es el equipo
  interno (id 2). Si ya está filtrado por `teamId` en todos lados, esto es sólo un smoke test
  nuevo, no código nuevo — **verificarlo primero antes de escribir nada**.

## 5. Interfaces faltantes (UI humana)

- `/reseller/clientes` (renombrar de `/reseller/customers` si hace falta consistencia):
  agregar botón **"Nuevo cliente"** (formulario: nombre del equipo, email/nombre del dueño,
  plan) → `createResellerClient`; por fila, **"Cambiar plan"** y **"Suspender"**.
- `/reseller/planes`: sección nueva **"Crear plan propio"** (nombre, precio, moneda, intervalo,
  selector de plugins a habilitar — checklist con las apps ya registradas en
  `lib/plugins/core/registry.ts`) además de la re-precificación que ya existe.
- `/reseller/landing`: convertir de "una sola página" a **lista de páginas** (Inicio, y una por
  slug que el reseller cree: `caza`, `piloto`, `torre`, etc. — el schema ya soporta N páginas
  por reseller); agregar pestaña **"Leads"** con la tabla de `reseller_leads` y botón
  **"Convertir en cliente"** por fila (abre el formulario de alta con los datos precargados).
  Semilla opcional: al crear el reseller `aapp-business`, copiar el contenido (adaptado, sin
  el HTML de simulación "Modo Noelia") de las landings ya publicadas en aapp.space
  (`business-growth`/`business-automation`/`business-command`) como punto de partida editable,
  no como demo — ya se citó el texto completo de las tres en la sección 0 de este documento y
  en la investigación de la misión (no hace falta volver a leerlas).
- `/admin/resellers`: si `createReseller` no contempla aún elegir dominio en el alta, agregarlo
  (hoy `activateResellerDomain` es una acción aparte — está bien, no es bloqueante).

## 6. Tools MCP — "conector friendly" (lo central del pedido)

Nuevo agregador `lib/plugins/grok-connector/server/reseller-actions.ts` (patrón
`production-actions.ts`), registrado donde se concatenan los demás
(`app/api/plugins/grok-connector/mcp/route.ts`). Contexto de permiso: resolver `resellerId`
desde `getResellerForUser(session.user.id)` (ya existe) — **si el usuario de la sesión no es
dueño de un reseller, estas tools ni se listan** (fail-closed, mismo criterio que
[[project_conectores_escritorio_permisos]]).

- `whatspro_reseller_get` — branding, dominio(s), wallet, stats (clientes, MRR estimado).
- `whatspro_reseller_manage_branding` — nombre, logo, colores, soporte.
- `whatspro_reseller_manage_domain` — agregar/quitar dominio, marcar primario.
- `whatspro_reseller_landing_list` / `whatspro_reseller_landing_manage` — CRUD de páginas
  (`landing_pages`), `dry_run` antes de publicar (mismo patrón que AAPP SPACE).
- `whatspro_reseller_leads_list` / `whatspro_reseller_lead_manage` — leer, cambiar estado,
  **convertir en cliente**.
- `whatspro_reseller_plan_list` / `whatspro_reseller_plan_manage` — crear/editar/archivar
  planes propios (con el bundle de plugins).
- `whatspro_reseller_client_list` / `whatspro_reseller_client_manage` — alta manual, cambio de
  plan, suspensión.
- `whatspro_reseller_wallet_get` — saldo, movimientos, umbral de aviso (sólo lectura; el topup
  real sigue siendo un pago real, no una tool que mueva plata sola).

Registrar TODAS en `PRIORITY_TOOLS` si aplica y verificar con
`NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-connector-tools.mts`
(ver [[feedback_zod_en_json_schema]] — JSON Schema puro, nunca zod dentro del schema de la
tool).

## 7. Bootstrap de admin@aapp.business y el dominio (decisión humana, no del agente)

1. **Usuario**: si `admin@aapp.business` no existe todavía como `users` en WhatsPro, el
   Protocolo Maestro no dice cómo se le da de alta — **no inventar una contraseña ni mandarla
   por un canal inseguro**. Camino recomendado: crear el `reseller` con `ownerUserId` apuntando
   a una cuenta que el propio Noelia/Carlos pueda controlar hoy, y dejar el `transferResellerOwner`
   (ya existe en `admin/resellers/actions.ts`) para el día que admin@aapp.business se registre
   normalmente en whatspro.uno con ese correo. **Preguntarle al usuario** cuál de los dos
   caminos prefiere antes de crear el reseller en producción.
2. **Dominio `aapp.business`**: agregar la label de Traefik (patrón de los demás resellers) y
   la fila en `reseller_domains` es parte de esta misión; **la parte de DNS (apuntar el dominio
   a la IP del VPS en el registrador) es externa y hay que pedírsela al usuario** — no asumir
   que ya está apuntado. `docker compose up -d` (no `restart`, ver [[feedback_deploy_recursos_servidor]]
   y [[project_white_label_resellers]] "gotcha de deploy") para que Traefik relea la label nueva.
3. **Slug sugerido**: `aapp-business`, `companyName`: "AAPP Business".

## 8. Semilla de los 3 planes (una vez creado el reseller)

Script `scripts/seed-aapp-business.ts` (idempotente, patrón `seedDevPrompts`): crea, si no
existen, los planes recurrentes del reseller `aapp-business`:

| Plan | Precio | Intervalo | Bundle de plugins a habilitar |
|---|---|---|---|
| AAPP CAZA · Care | US$100–150/mes *(a confirmar con el usuario — el catálogo oficial no lo cierra, ver hueco #5 de la investigación)* | mensual | básico (CRM, sitio) |
| AAPP PILOTO · Automation | desde US$33/mes (retoma el catálogo de Chatbot) | mensual | `automations`, `memberships` |
| AAPP TORRE · Command | US$99/mes | mensual | `sales-ops`, `tasks` (Producción OS), `memberships` |

**No inventar el precio de CAZA Care**: el propio catálogo oficial lo marca como "supuesto a
validar" (ver investigación §2) — confirmarlo con el usuario antes de sembrarlo en producción,
o sembrarlo `isHidden:true` hasta confirmar.

## 9. Orden de ejecución (una sesión; si no entra, cortar con commit + nota en este archivo)

1. §3 migración (verificar `plans` real primero) → `pnpm exec tsc` en verde.
2. §4 servidor (`lib/resellers/plans.ts`, `clients.ts`, `leads.ts`) + endpoint público de leads.
3. §6 tools MCP + `verify-connector-tools.mts`.
4. §5 UI (clientes CRUD, planes propios, landing multi-página + leads).
5. Auditoría A3/A4 (§4, último párrafo) — smoke test, no código si ya está bien.
6. §7 bootstrap: **preguntarle al usuario** el camino del owner antes de crear el reseller real;
   crear el `reseller` `aapp-business` (con owner acordado), agregar la label de Traefik,
   avisar al usuario que falta el DNS.
7. §8 semilla de planes (confirmando el precio de CAZA Care antes).
8. Smoke nuevo `scripts/smoke-reseller-business.mts`: crear reseller de prueba, plan propio,
   cliente (team+owner+bundle), lead → convertir en cliente, tools MCP verificadas, borrar todo
   al final (prefijo `[SMOKE]`).
9. `NEXT_SKIP_TYPECHECK=1 pnpm run deploy:saasfy` **una sola vez** → `git commit` → actualizar
   este archivo (marcar hecho) y la memoria `project_aapp_business_platform.md`.

## Relacionado

[[project_white_label_resellers]] (el módulo que se extiende), [[project_produccion_os]] (la
parte que NO se toca), [[project_mcp_full_coverage_batch]] (A3/A4 ya estaba anotado ahí),
[[project_command_center_comercial]] (qué es TORRE en código), [[project_aapp_api_limits]]
(por qué esto no se construye del lado de aapp.space/GoBiz: esa API es de sólo lectura y sin
teléfono por cuenta — no sirve como backend de facturación).
