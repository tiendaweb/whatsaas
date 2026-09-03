# Plan: App AAPP SPACE + entidad CLIENTE (integración GoBiz API)

## Contexto

El usuario es reseller/admin en **aapp.space** (plataforma "GoBiz": los "users" son sus clientes finales, que contratan planes y crean tiendas/vCards). Quiere traer esos datos a whatsaas para gestionarlos junto al CRM de WhatsApp: ver los clientes, sus membresías (plan + vencimiento), sus tiendas (links), y vincular todo a contactos de WhatsApp y a Tareas OS.

Hoy faltan dos piezas base:
1. **No existe una entidad CLIENTE real** que agrupe varios contactos: el plugin `customers` es solo una vista derivada (`contacts` + `teamSales`), y las membresías (plugin `memberships`, ya en producción) se ligan a `contactId`, no a un cliente.
2. **No hay integración con aapp.space.**

La **GoBiz API** (`https://aapp.space/api/gobiz/v1`, auth `Authorization: Bearer gbz_...`, **solo lectura**, respuesta `{success, data, meta}` paginada) expone: `/users` (clientes: `user_id, name, email, mobile_number, plan_id, plan_validity`=vencimiento, `plan_activation_date`=inicio, `status`, `profile_image`), `/plans` (planes con features), `/stores` y `/cards` (tiendas: `card_id, user_id, card_url`=slug del link, `custom_domain, title, profile`), `/transactions` (pagos).

**Decisiones confirmadas:**
1. **Actualizar el plugin `customers`** para que use una entidad CLIENTE real (clientes manuales + los de AAPP SPACE juntos).
2. **Auto-vínculo cliente↔contacto**: al sincronizar, vincular por teléfono (`mobile_number`) **solo si ya existe** un contacto; si no, dejar vacío.
3. **Alcance del sync**: clientes + membresías (planes) + **tiendas/links** + **pagos/transacciones**. (Sin pedidos/productos.)
4. **Cadencia**: cron automático **cada 6 h** + botón "Sincronizar ahora".

---

## Parte A — Entidad CLIENTE (base) · `lib/db/schema.ts`

Multi-tenant (`teamId → teams.id cascade`), auditoría, timestamps. Patrón `teamMembership*`.

1. **`teamCustomers`** — el CLIENTE.
   `id, teamId, name, email, phone, source ('manual'|'aapp_space'), externalId (varchar, GoBiz user_id, null en manuales), externalData (jsonb snapshot), profileImage (text), status ('active'|'inactive'|'archived'), notes (text), lastSyncedAt (timestamp), createdBy, updatedBy, timestamps`.
   Índices: `(teamId)`; unique `(teamId, source, externalId)` (idempotencia del sync; NULLs distintos permiten varios manuales).
2. **`teamCustomerContacts`** — puente N:M cliente↔contacto.
   `id, teamId, customerId (FK→teamCustomers cascade), contactId (FK→contacts cascade), createdAt`. unique `(customerId, contactId)`.
3. **`teamCustomerStores`** — tiendas sincronizadas.
   `id, teamId, customerId (FK→teamCustomers set null), externalId (card_id), cardType, title, subTitle, cardUrl (slug), customDomain, profileImage, status, externalData (jsonb), timestamps`. unique `(teamId, externalId)`.
4. **`teamCustomerTransactions`** — pagos sincronizados.
   `id, teamId, customerId (FK set null), externalId (gobiz_transaction_id), planExternalId, amount (varchar, monto crudo), currency, paymentStatus, gateway, transactionDate (timestamp), externalData (jsonb), createdAt`. unique `(teamId, externalId)`.

**Link tienda:** `custom_domain` si existe, si no `https://aapp.space/{cardUrl}` (helper en `lib/aapp/client.ts`).

## Parte B — Extender `memberships` para vincular a CLIENTE

En `lib/db/schema.ts`:
- **`teamMembershipSubscriptions`**: agregar `customerId (FK→teamCustomers set null)`, hacer **`contactId` nullable**, agregar `externalSource (varchar)` + `externalId (varchar)` (idempotencia sync). Regla: al menos uno de `customerId`/`contactId`.
- **`teamMembershipPlans`** y **`teamMembershipCompanies`**: agregar `externalSource` + `externalId`. En companies agregar campos de **ficha**: `website, email, phone, address` (para el perfil completo).

Cambios de comportamiento:
- **UI de suscripción** (`lib/plugins/memberships/ui/SubscriptionsSection.tsx`): el selector principal pasa a ser **CLIENTE** (de `/api/plugins/customers`), con contacto opcional/derivado. Rutas API de subscriptions aceptan `customerId`.
- **Cron de recordatorios** (`app/api/cron/membership-reminders/route.ts`): resolver el JID destino desde `contactId` **o**, si falta, desde el primer contacto vinculado del `customerId`. Las suscripciones sincronizadas (mirror) no se re-notifican distinto; se respeta `remindersSent`.
- **Empresa ficha completa** (`CompaniesSection.tsx`): vista de detalle con perfil (`website/email/phone/address` + logo + notas) y, para la empresa AAPP SPACE, KPIs sincronizados (nº clientes, membresías activas, tiendas).

## Parte C — Plugin `aapp-space` (conector + sync)

**Credenciales/estado** · `lib/db/schema.ts`:
- **`teamAappConnections`**: `id, teamId (unique), apiKey (text), status ('connected'|'error'|'disconnected'), companyId (FK→teamMembershipCompanies set null), lastSyncedAt, lastSyncStatus, lastSyncError (text), createdBy, timestamps`. Patrón `socialAccounts` (`schema.ts:3020`) — token en texto plano (el repo no cifra credenciales, igual que social-publisher).

**Cliente HTTP** · `lib/aapp/client.ts` (patrón `lib/social/meta-graph.ts`): base URL, `AappError`, `aappFetch<T>(apiKey, path, params)` con `Authorization: Bearer`, y `aappFetchAllPages()` (itera `meta.last_page`). Helper `storeUrl(store)`.

**Motor de sync** · `lib/aapp/sync.ts` → `syncTeamAapp(teamId, apiKey)`:
1. Upsert empresa "AAPP SPACE" en `teamMembershipCompanies` (`externalSource='aapp_space'`), guardar `companyId` en la conexión.
2. `/plans` → upsert `teamMembershipPlans` (mapear `validity` días → `billingType`: ~30→monthly, ~365→annual, ≥3650→lifetime, otro→custom+`billingLabel="{validity} días"`; `price=plan_price*100`; `features` desde `no_of_stores/no_of_vcards/custom_domain/pwa/ai_credits/...` como items quantity/included/excluded).
3. `/users` → upsert `teamCustomers` (`source='aapp_space'`, `externalId=user_id`). **Auto-vínculo**: si hay `contacts` con teléfono == `mobile_number` (normalizado), insertar en `teamCustomerContacts`.
4. Por cada user con `plan_id` → upsert `teamMembershipSubscriptions` (`externalSource='aapp_space'`, `externalId=user_id`, `customerId`, `planId` resuelto por `externalId`, `startDate=plan_activation_date`, `endDate=plan_validity`, `status` según `user.status`, snapshot precio/nombre).
5. `/stores` → upsert `teamCustomerStores` (customer por `user_id`).
6. `/transactions` → upsert `teamCustomerTransactions`.
7. Actualizar `teamAappConnections` (`lastSyncedAt/lastSyncStatus/lastSyncError`).

**Rutas API** (`app/api/plugins/aapp-space/`, auth `getPluginRequestContext('aappSpaceRead'|'aappSpaceWrite')`):
- `connection/route.ts` — GET estado; POST guarda apiKey + prueba (`/info`); DELETE desconecta.
- `sync/route.ts` — POST ejecuta `syncTeamAapp` (con `ctx.team.id`), devuelve resumen.

**Cron** · `app/api/cron/aapp-sync/route.ts` (auth `CRON_SECRET`, `force-dynamic`, `maxDuration=300`): itera `teamAappConnections` con `status='connected'` y corre `syncTeamAapp` por equipo. Disparador `scripts/aapp-sync.js` (clon de `scripts/publish-social.js`) → registrar en PM2/cron del host **cada 6 h**.

**UI** · `lib/plugins/aapp-space/ui/AappSpaceDashboard.tsx`: tarjeta de conexión (input API key enmascarado, botón Probar/Guardar, estado, "Sincronizar ahora" con resumen y `lastSyncedAt`), y pestañas resumen (clientes/tiendas sincronizados). Manifest `activationMode:'global'`, icono lucide (ej. `Store`/`Plug`).

## Parte D — Actualizar plugin `customers` a la entidad real

- **`/api/plugins/customers/route.ts`**: listar `teamCustomers` del equipo (en vez del JOIN de ventas). Devolver por cliente: `source`, nº contactos vinculados, nº membresías activas, **próximo vencimiento**, nº tiendas. Filtro por `source` (todos/manual/AAPP SPACE) y búsqueda.
- **`/api/plugins/customers/[id]/route.ts`**: detalle desde `teamCustomers` + contactos vinculados (con `chats.remoteJid`), membresías (`teamMembershipSubscriptions` + plan + vencimiento), tiendas (`teamCustomerStores` + link), transacciones, tareas vinculadas (Parte E), notas (`teamCustomers.notes`).
- **Nuevas rutas**: `POST /api/plugins/customers` (crear manual), `PATCH/DELETE [id]`, `POST/DELETE [id]/contacts` (vincular/desvincular contacto — selector desde `/api/contacts?limit=500`), `POST/DELETE [id]/tasks` (Parte E).
- **UI** `CustomersList.tsx` / `CustomerDetail.tsx`: reescribir para la entidad (id = `teamCustomers.id`). Badges de origen, vencimientos, links de tienda, gestión de contactos y tareas vinculadas. Reutilizar adjuntos `teamTaskMedia` con `ownerType='customer'`, `ownerId=customerId`.
- **Compat**: los datos previos (customers derivados de ventas, notas `messages.isInternal`) no se migran; se documenta. Los permisos `customersRead/Write` se reutilizan.

## Parte E — Vínculo CLIENTE ↔ Tareas OS

En `lib/plugins/tasks/server/task-os.ts`: agregar `'customer'` a `TaskEntityType` (`:22`), `assertCustomer(teamId, id)` (verifica `teamCustomers`), y ramas en `assertEntity` (`:174`). En `app/api/plugins/tasks/relations/route.ts` agregar `'customer'` al array `TYPES` (`:10`). Reusar `insertRelation`/`teamTaskRelations` (polimórfica) — sin tablas nuevas. En `CustomerDetail` listar/crear/quitar relaciones `{sourceType:'customer', targetType:'task'}` vía `/api/plugins/tasks/relations` (+ crear tarea con `createTaskInColumn` y relacionarla).

## Parte F — Registro del plugin y permisos

- `lib/plugins/core/registry.ts`: `pluginLoaders` (+`aapp-space`), `pluginPermissionMap` (+`aapp-space.read/write`).
- `lib/plugins/core/page-registry.tsx`: bloque `aapp-space` → `AappSpaceDashboard`.
- `lib/permissions.ts`: `aappSpaceRead/Write` en `MemberPermissions`, `ROLE_PRESETS` (owner/admin true, agent false) y `ROUTE_PERMISSIONS`.
- Launcher: agregar `/plugins/aapp-space` a `APPS_LAUNCHER_PREFIXES`/`APP_VISUAL`/`APP_LABEL_OVERRIDE` en `components/interface/Sidebar.tsx` y `app/[locale]/(dashboard)/apps/page.tsx` (+icono en `PLUGIN_NAV_ICON_MAP`). Habilitar por equipo (opt-in) para noelia igual que memberships.

## Parte G — Migración

Editar `schema.ts` → `pnpm db:generate` → revisar SQL. **`drizzle-kit migrate` está roto por el desync del journal** (ver project_drizzle_journal_desync): aplicar el SQL nuevo directamente contra `POSTGRES_URL` (como en la migración 0037 de memberships). Verificar que la entrada quede en `meta/_journal.json`. Los `ALTER TABLE ... ADD COLUMN`/`ALTER COLUMN DROP NOT NULL` de la Parte B son aditivos y seguros.

## Archivos clave

- Schema/migración: `lib/db/schema.ts` (6 tablas nuevas + 3 alteradas), `lib/db/migrations/*`, `meta/_journal.json`.
- Plugin conector: `lib/plugins/aapp-space/{manifest,constants,ui/*}`, `lib/aapp/{client,sync}.ts`.
- API: `app/api/plugins/aapp-space/{connection,sync}/route.ts`; `app/api/cron/aapp-sync/route.ts`; `scripts/aapp-sync.js`.
- Customers: `app/api/plugins/customers/**`, `lib/plugins/customers/ui/*`.
- Memberships: `lib/plugins/memberships/ui/SubscriptionsSection.tsx` + `CompaniesSection.tsx`, `app/api/plugins/memberships/subscriptions/**`, `app/api/cron/membership-reminders/route.ts`.
- Tasks: `lib/plugins/tasks/server/task-os.ts`, `app/api/plugins/tasks/relations/route.ts`.
- Registro: `registry.ts`, `page-registry.tsx`, `permissions.ts`, `Sidebar.tsx`, `apps/page.tsx`.

## Verificación (end-to-end)

1. **Build/migración**: `pnpm db:generate` → aplicar SQL a `POSTGRES_URL` → `pnpm build` (tsc limpio). Deploy: `docker restart whatsaas-app` + `pm2 restart saasfy`.
2. **Conexión**: en AAPP SPACE pegar la API key `gbz_...`, Probar (200 `/info`), Guardar. Botón "Sincronizar ahora".
3. **Sync**: verificar en `db:studio` que se crearon empresa AAPP SPACE, planes (con features), ~228 clientes, suscripciones con vencimiento, tiendas (con link), transacciones. Auto-vínculo: un cliente cuyo `mobile_number` coincida con un contacto existente queda vinculado.
4. **Clientes**: la sección Clientes muestra clientes manuales + AAPP SPACE, con origen, vencimientos, tiendas; abrir ficha → contactos vinculados, membresías, tiendas (links clicables), pagos, tareas.
5. **Membresía↔Cliente**: crear una suscripción manual eligiendo un CLIENTE; el recordatorio (cron `membership-reminders`) resuelve el contacto vía el cliente y envía WhatsApp.
6. **Tareas OS**: desde la ficha del cliente, crear/vincular una tarea; aparece la relación en ambos lados.
7. **Cron**: `curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/aapp-sync` → sincroniza equipos conectados. Registrar el tick cada 6 h en PM2.
8. **Aislamiento**: todo filtra por `teamId`.
