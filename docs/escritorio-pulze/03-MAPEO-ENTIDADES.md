# Mapeo de entidades — PulzeCRM ↔ WhatsPro

WhatsPro tiene **159 tablas**. La regla es reusar todo lo que ya existe y crear sólo lo que
demostrablemente falta. Este documento es la fuente de verdad de ese juicio.

## 1. Tabla maestra

| Pantalla Pulze | Entidad Pulze | WhatsPro | Veredicto |
|---|---|---|---|
| Dashboard | agregados | `lib/desktop/service.ts` + `team_desktop_preferences` | **EXISTE** — se amplía |
| Leads | `Lead` | `contacts` + `funnel_stages` + `funnel_stage_groups` | **EXISTE** — faltan 4 campos |
| Deals | `Deal` | — | **CREAR** `team_deals` + app propia `deals` |
| Accounts | `Account` | `team_customers` | **EXISTE** — faltan 6 campos |
| Contacts | `Contact` | `contacts` + `team_customer_contacts` | **EXISTE** — faltan 4 campos |
| Tasks | `Task` | `team_task_items` + `team_task_columns` + `team_task_projects` | **EXISTE** — completo |
| Reports | analítica | `team_radar_apps/widgets/reports/insights` | **EXISTE** — se consume |
| Calendar | `CalendarItem` | `team_events` (`kind: meeting\|call`, `subtype`) | **EXISTE** — completo |
| Settings | preferencias | `team_desktop_preferences`, `users`, `team_members.permissions` | **EXISTE** |
| Profile | usuario | `users`, `team_members` | **EXISTE** |
| AI Assistant | chat | `ai_sessions`, plugin `ai-chat` | **EXISTE** |
| Global Search | búsqueda | `/api/escritorio/search` | **EXISTE** — se amplía |
| — (pedido extra) | Chats | `chats`, `messages`, `conversation_ai_summaries` | **EXISTE** |
| — (pedido extra) | Membresías | `team_membership_subscriptions/plans/companies` | **EXISTE** |
| — (pedido extra) | Ventas | `team_sales`, `team_sale_commissions`, `team_articles` | **EXISTE** |

**Una sola tabla nueva.** Todo lo demás son columnas añadidas a tablas existentes.

Oportunidades se entrega como **app propia** (plugin `deals`, permisos `dealsRead`/`dealsWrite`),
no como pantalla de Ventas. El detalle del plugin, las conversiones y el vínculo con `team_sales`
están en **`09-APP-OPORTUNIDADES.md`**.

## 2. Leads = contactos en el embudo

`contacts` ya está atado 1:1 a un chat de WhatsApp y tiene etapa de embudo:

```ts
// lib/db/schema.ts
contacts = { id, teamId, chatId /* notNull().unique() */, name,
             assignedUserId, assignedDepartmentId, funnelStageId,
             notes, customData: jsonb, showTimeInStage, createdAt, updatedAt }
```

Y el Kanban del CRM ya vive en `app/[locale]/(dashboard)/dashboard/KanbanBoard.tsx`.
**No se duplica nada.** El Escritorio lee de ahí.

### Lo que falta

| Campo Pulze | Dónde va | Por qué |
|---|---|---|
| `score` 0-100 | **columna nueva** `contacts.lead_score smallint default 0` | se ordena y se filtra por él; en `custom_data` no indexa |
| `status` Hot/Warm/Cold | **columna nueva** `contacts.temperature varchar(10) default 'warm'` | ídem |
| `company` | **columna nueva** `contacts.company varchar(200)` | Pulze lo muestra en toda tabla y tarjeta |
| `lastContact` | **derivado**, no se persiste | `max(messages.created_at)` por chat |
| `email`, `phone` | ver §4 | hoy viven en `custom_data` / `chats.jid` |

> ⚠️ `contacts.chat_id` es `notNull` y `unique`. Un lead cargado a mano sin WhatsApp **no cabe**
> en esta tabla hoy. Dos salidas: (a) crear el chat placeholder al dar de alta el lead, que es lo
> que ya hace el flujo de contactos manuales; (b) relajar `chat_id` a nullable. **Se elige (a)**:
> tocar esa restricción afecta a chats, mensajes, automatizaciones y campañas.

## 3. Deals — la única entidad nueva

`team_sales` **no** sirve como oportunidad:

```ts
teamSales = { saleNumber, status, currency, items: SaleItem[], subtotal,
              discountAmount, taxAmount, total, paidAt, dueDate, … }
```
Es una factura emitida. No tiene etapa, ni probabilidad, ni fecha esperada de cierre, ni dueño
comercial. Forzar el pipeline dentro de `status` rompería la contabilidad y el plugin `finance`.

### Migración `0085_team_deals.sql`

```sql
CREATE TABLE "team_deals" (
  "id"                  serial PRIMARY KEY,
  "team_id"             integer NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "title"               varchar(200) NOT NULL,
  "customer_id"         integer REFERENCES "team_customers"("id") ON DELETE SET NULL,
  "contact_id"          integer REFERENCES "contacts"("id")       ON DELETE SET NULL,
  "stage"               varchar(30)  NOT NULL DEFAULT 'qualified',
  "value"               integer      NOT NULL DEFAULT 0,   -- centavos, como team_sales
  "currency"            varchar(3)   NOT NULL DEFAULT 'USD',
  "probability"         smallint     NOT NULL DEFAULT 50,
  "expected_close_date" timestamp,
  "closed_at"           timestamp,
  "owner_id"            integer REFERENCES "users"("id")      ON DELETE SET NULL,
  "sale_id"             integer REFERENCES "team_sales"("id")  ON DELETE SET NULL,
  "source"              varchar(40)  NOT NULL DEFAULT 'manual',
  "notes"               text         NOT NULL DEFAULT '',
  "position"            integer      NOT NULL DEFAULT 0,    -- orden dentro de la columna kanban
  "created_by"          integer REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_by"          integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at"          timestamp NOT NULL DEFAULT now(),
  "updated_at"          timestamp NOT NULL DEFAULT now()
);
CREATE INDEX "team_deals_team_idx"     ON "team_deals" ("team_id");
CREATE INDEX "team_deals_stage_idx"    ON "team_deals" ("team_id","stage");
CREATE INDEX "team_deals_customer_idx" ON "team_deals" ("team_id","customer_id");
CREATE INDEX "team_deals_owner_idx"    ON "team_deals" ("team_id","owner_id");
```

Etapas (`stage`): `qualified` · `proposal` · `negotiation` · `closed_won` · `closed_lost`.
Pulze sólo muestra las 4 primeras; `closed_lost` se agrega porque sin ella la tasa de conversión
del Dashboard no se puede calcular.

**`sale_id` es el puente:** al pasar un deal a `closed_won` se crea la `team_sales`
correspondiente y se enlaza. Así "Ventas" y "Oportunidades" no se contradicen.

El puente es de ida y vuelta: `team_sales` gana `deal_id` y `customer_id` en la migración 0089
(hoy una venta sólo se puede atar a un contacto de WhatsApp, no a un cliente). Ver
`09-APP-OPORTUNIDADES.md` §2.

### Historial de etapas

Para "Sales Funnel" y "Deal Progress" hace falta saber cuándo cambió cada etapa. Se resuelve
**sin tabla nueva**, reusando `activity_logs`, con el mismo patrón que el resto del producto.

> ⚠️ `project_whatspro_architecture_audit` deja anotado que `activityLogs` abusa de `ipAddress`
> para meter metadatos. **No repetir eso acá.** Si el payload no cabe, la decisión correcta es
> añadir `activity_logs.metadata jsonb`, no seguir empujando datos por `ipAddress`.

## 4. Accounts = Clientes

```ts
teamCustomers = { id, teamId, name, email, phone, source, externalId,
                  externalData: jsonb, profileImage, status, notes,
                  lastSyncedAt, createdBy, updatedBy, createdAt, updatedAt }
```

`status` ya existe (`active` por defecto) y admite `active` | `inactive` | `prospect` sin cambios.

### Migración `0086_customer_company_fields.sql`

```sql
ALTER TABLE "team_customers"
  ADD COLUMN "industry"       varchar(60),
  ADD COLUMN "website"        varchar(255),
  ADD COLUMN "employees"      integer,
  ADD COLUMN "annual_revenue" integer,          -- centavos
  ADD COLUMN "location"       varchar(160),     -- "San Francisco, CA"
  ADD COLUMN "customer_since" timestamp;
```

`street/city/state/zipCode/country` del formulario de Pulze se guardan en `external_data.address`
— son de captura, no se filtra ni se agrupa por ellos.

Industrias (enum de aplicación, no de BD): `technology`, `software`, `finance`, `healthcare`,
`retail`, `manufacturing`, `consulting`, `other`.

## 5. Contacts

Un contacto de Pulze es una persona con email, teléfono, empresa y cargo. En WhatsPro eso está
partido en dos: `contacts` (persona de WhatsApp) y `team_customer_contacts` (tabla puente
persona↔cliente, sólo `customerId` + `contactId`).

### Migración `0087_contact_person_fields.sql`

```sql
ALTER TABLE "contacts"
  ADD COLUMN "email"        varchar(255),
  ADD COLUMN "phone"        varchar(80),
  ADD COLUMN "company"      varchar(200),
  ADD COLUMN "job_title"    varchar(120),
  ADD COLUMN "department"   varchar(120),
  ADD COLUMN "linkedin_url" varchar(255),
  ADD COLUMN "lead_score"   smallint    NOT NULL DEFAULT 0,
  ADD COLUMN "temperature"  varchar(10) NOT NULL DEFAULT 'warm',
  ADD COLUMN "is_vip"       boolean     NOT NULL DEFAULT false;
CREATE INDEX "contacts_temperature_idx" ON "contacts" ("team_id","temperature");
CREATE INDEX "contacts_lead_score_idx"  ON "contacts" ("team_id","lead_score");
```

`is_vip` alimenta el KPI *VIP Contacts*. `department` es texto libre y **no** reemplaza a la tabla
`departments` (que es la asignación operativa de agentes); son cosas distintas y no se mezclan.

### Backfill

Muchos equipos ya guardan email/teléfono en `contacts.custom_data`. La migración copia lo que
encuentre, sin pisar nada:

```sql
UPDATE "contacts"
   SET "email" = COALESCE("email", NULLIF("custom_data"->>'email','')),
       "phone" = COALESCE("phone", NULLIF("custom_data"->>'phone',''))
 WHERE "custom_data" ? 'email' OR "custom_data" ? 'phone';
```

Las claves reales varían por equipo (`custom_fields` es configurable). **Antes de correr esto
hay que inspeccionar las claves existentes** — no asumir `'email'`/`'phone'`:

```sql
SELECT DISTINCT jsonb_object_keys(custom_data) FROM contacts WHERE custom_data <> '{}';
```

## 6. Tasks, Calendar, Reports — sin cambios de esquema

**Tasks.** `team_task_items` + `team_task_columns` + `team_task_projects` cubren todo. Los tres
estados de Pulze mapean a columnas del proyecto por defecto. `relatedType` (Lead/Deal/Contact/
Account) usa `team_task_relations`, que ya existe; sólo hay que dar de alta el tipo `deal`.

**Calendar.** `team_events` ya trae `kind: "meeting" | "call"`, `subtype`, `contactId`,
`customerId`, `attendees: string[]`, `reminderAt`, `outcome`, `nextAction`. Es un superconjunto
del modelo de Pulze. El tipo `demo` de Pulze es `kind:"meeting", subtype:"comercial"`.

**Reports.** Se consumen `team_radar_widgets` y `team_radar_reports`. Los 4 tabs de Pulze
(Overview / Sales Pipeline / Team Performance / Revenue Sources) se declaran como secciones de
Radar, no como componentes sueltos, para que la IA pueda editarlos por MCP igual que el resto.

## 7. Resumen de migraciones

| # | Archivo | Qué hace | Riesgo |
|---|---|---|---|
| 0085 | `team_deals.sql` | tabla nueva + 4 índices | bajo — nada depende de ella todavía |
| 0086 | `customer_company_fields.sql` | 6 columnas nullable en `team_customers` | bajo |
| 0087 | `contact_person_fields.sql` | 9 columnas en `contacts` + 2 índices + backfill | **medio** — `contacts` es la tabla más caliente del producto |
| 0088 | `activity_log_metadata.sql` | `activity_logs.metadata jsonb default '{}'` | bajo |
| 0089 | `sale_customer_and_deal.sql` | `team_sales.customer_id` + `team_sales.deal_id` + 2 índices | bajo — **debe ir después de 0085** |

Último archivo de migración: **0084**. La numeración nueva arranca en 0085.

## 7.1 🚨 El journal ya está desincronizado — leer antes de tocar nada

Estado real hoy: **92 archivos `.sql`, 76 entradas en `_journal.json`**. Hay **16 migraciones
que existen como archivo pero no están registradas**:

```
0013_landing_content            0026_funnel_stage_groups
0020_marketplace_orders         0027_funnel_stage_group_members
0021_team_marketplace_entitlements  0028_custom_fields_position
0022_apps_and_feature_requests  0045_hostinger
0022_plugin_activation_layers   0046_meta_ads
0023_automation_templates       0047_meta_ads_tax_visibility
0024_docs_data_layer            0048_documents
0025_plans_hidden               0049_desktop_preferences
```

Comprobado con:
```bash
python3 -c "
import json,os,glob
j=json.load(open('lib/db/migrations/meta/_journal.json'))
tags={e['tag'] for e in j['entries']}
files={os.path.basename(f)[:-4] for f in glob.glob('lib/db/migrations/*.sql')}
print(len(files),'archivos /',len(tags),'journal'); print(sorted(files-tags))"
```

Lo que esto significa para este trabajo:

1. **Esas tablas sí existen en la base** — `team_desktop_preferences` (0049) es justamente la que
   usa el Escritorio actual y funciona. Se aplicaron a mano, sin pasar por el journal.
2. **No hay que "arreglarlo" dentro de este rediseño.** Registrar 16 migraciones viejas de golpe
   haría que drizzle intente re-aplicarlas en cualquier entorno donde falten, y eso es un
   incidente aparte. Queda anotado como deuda, no como tarea de esta carpeta.
3. **Sí hay que registrar las 5 nuevas** (0085-0089). Si no, la columna existe en la base pero
   drizzle no la conoce y **cualquier Server Component que la lea revienta en runtime aunque el
   build pase** — que es exactamente lo que ya pasó (`project_drizzle_journal_desync`).
4. **Hay un `idx` duplicado a la vista**: dos archivos `0022_*`. Al numerar 0085-0089 hay que
   confirmar que no se repite ningún prefijo.

Verificación al cerrar la fase 1: **97 archivos, 81 entradas**, y las 5 nuevas presentes en
`files - tags` → conjunto vacío para 0085-0089.

## 8. Lo que este mapeo NO cubre

Dicho explícitamente para que nadie lo descubra a mitad de la implementación:

- **Import / Export con deshacer** (§13 del inventario) necesita una tabla de trabajos. Queda
  fuera del alcance y se documenta como pendiente.
- **Email Templates** de Settings se solapa con `message_drafts` / `waba_templates`. Se reusa
  `message_drafts`; el editor de plantillas de correo **no** se construye.
- **Active Sessions** (revocar sesión por dispositivo) no tiene respaldo: no hay tabla de
  sesiones por dispositivo. Se muestra sólo la sesión actual, sin botón *Revoke*, en vez de
  fingir una lista.
- **Roles & Permissions matrix** de Reports duplica lo que ya hace la pantalla de equipo del
  admin. Se enlaza a esa pantalla en lugar de reimplementar la matriz.
