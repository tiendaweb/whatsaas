# App Oportunidades (`deals`) y las conversiones

Decisión del 2026-08-26: **Oportunidades es una app propia**, no una pantalla dentro de Ventas.
Se activa, se factura y se permisiona por separado — pero queda **vinculada a Ventas**, y el
recorrido Prospecto → Cliente → Oportunidad → Venta tiene que poder hacerse sin salir del flujo.

## 1. Por qué app propia y qué cuesta

Ventaja: `deals` aparece en el catálogo de apps, un equipo que no vende por pipeline no lo ve, y
los permisos son suyos. Costo: **un plugin nuevo se registra en 8 lugares**. Si falta uno, el
síntoma no es un error sino que la app "no aparece" y se pierde media hora buscando por qué.

### 1.1 Los 8 registros (checklist)

| # | Archivo | Qué se agrega |
|---|---|---|
| 1 | `lib/plugins/deals/manifest.ts` | el manifest |
| 2 | `lib/plugins/core/registry.ts` (`pluginLoaders`, ~línea 42) | `deals: () => import('@/lib/plugins/deals/manifest')` |
| 3 | `lib/plugins/core/registry.ts` (`pluginPermissionMap`, ~línea 140) | `'deals.read': 'dealsRead'`, `'deals.write': 'dealsWrite'` |
| 4 | `lib/plugins/core/page-registry.tsx` | los renderers de `/plugins/deals` y `/plugins/deals/[id]` |
| 5 | `lib/permissions.ts` | `dealsRead` / `dealsWrite` en `MemberPermissions` **y en los 3 `ROLE_PRESETS`** |
| 6 | `app/[locale]/(dashboard)/settings/page.tsx` (~línea 279) | las 2 filas de la UI de permisos |
| 7 | `lib/plugins/app-maker/server/resource-permissions.ts` | `{ keys: ['deals'], permission: 'dealsRead', pluginId: 'deals' }` |
| 8 | `lib/readonly-api/catalog.ts` (`readOnlyResources`, línea 226) | el recurso `deals` |
| 9 | `lib/plugins/app-maker/server/connectors.ts` | las tools en `actionToolMap` **y** el despacho del ejecutor |

> **El registro 9 apareció al implementar, no estaba en el plan.** App Maker valida en build que
> toda operación de `connector-policies.ts` exista en su `actionToolMap`, que sólo miraba
> `grokActionTools` y `grokExtendedActionTools`. Sin ese registro el build falla con *"APP MAKER
> connector registry is out of sync"*. Se resolvió agregando un ejecutor `'deals'` al union
> `AppMakerActionExecutor`: mandarlas por `'extended'` hubiera compilado y fallado en runtime,
> porque ese ejecutor no conoce las tools de Oportunidades.

### 1.2 Manifest

```ts
// lib/plugins/deals/manifest.ts
import { z } from 'zod';
import type { AppPluginManifest } from '@/lib/plugins/core/types';

const dealsSettingsSchema = z.object({
  defaultCurrency: z.string().default('USD'),
  stages: z.array(z.string()).default(['qualified','proposal','negotiation','closed_won','closed_lost']),
  autoCreateSaleOnWin: z.boolean().default(true),
  staleAfterDays: z.number().default(14),
});

const manifest: AppPluginManifest<typeof dealsSettingsSchema> = {
  id: 'deals',
  displayName: 'Oportunidades',
  activationMode: 'global',
  scopes: ['dashboard.nav', 'dashboard.page'],
  routes: [{ path: '/plugins/deals', title: 'Oportunidades', scope: 'dashboard.page' }],
  navItems: [{
    label: 'Oportunidades', href: '/plugins/deals', icon: 'Handshake',
    order: 55,                       // justo antes de Ventas (56)
    requiredPermission: 'deals.read',
  }],
  settingsSchema: dealsSettingsSchema,
  featureFlags: [],
};
export default manifest;
```

`order: 55` deja Oportunidades pegada a Ventas (56) en el menú, que es como se lee el recorrido.

### 1.3 Permisos

`dealsRead` / `dealsWrite` en los presets:

| Rol | dealsRead | dealsWrite |
|---|---|---|
| `owner` | ✅ | ✅ |
| `admin` | ✅ | ✅ |
| `agent` | ❌ | ❌ |

**Corrección respecto de la versión anterior de este documento:** decía que `agent` tendría
`dealsRead`. Al implementarlo se verificó que el preset real de `agent` ya tiene
`salesRead: false`, así que darle lectura de Oportunidades le mostraría montos de venta que hoy
no ve. Oportunidades sigue el mismo criterio que Ventas: **apagado por defecto en `agent`**, y el
equipo se lo activa a quien corresponda desde Ajustes → permisos.

> Esto **reemplaza** lo que decían las versiones anteriores de `05-CONECTORES-MCP.md`, donde los
> deals colgaban de `salesRead`/`salesWrite`. Al ser app propia, los permisos son propios.

## 2. El vínculo con Ventas

### 2.1 Falta una columna en `team_sales`

```ts
teamSales = { id, teamId, contactId, saleNumber, status, currency, items,
              subtotal, discountAmount, taxAmount, total, notes,
              paidAt, dueDate, createdBy, updatedBy, … }
```

**No tiene `customer_id`.** Una venta sólo se puede atar a un contacto de WhatsApp. Pero una
oportunidad se ata a un **cliente** (`team_customers`), y al ganarla hay que crear la venta de ese
cliente. Hoy esa información se perdería.

Migración `0089_sale_customer_and_deal.sql`:

```sql
ALTER TABLE "team_sales"
  ADD COLUMN "customer_id" integer REFERENCES "team_customers"("id") ON DELETE SET NULL,
  ADD COLUMN "deal_id"     integer REFERENCES "team_deals"("id")     ON DELETE SET NULL;
CREATE INDEX "team_sales_customer_idx" ON "team_sales" ("team_id","customer_id");
CREATE INDEX "team_sales_deal_idx"     ON "team_sales" ("team_id","deal_id");
```

Queda una relación en los dos sentidos: `team_deals.sale_id` → la venta que generó, y
`team_sales.deal_id` → la oportunidad de la que salió. Redundante a propósito: cada pantalla
navega hacia el otro lado sin un join extra, y las dos son nullable, así que una venta suelta
(sin oportunidad) sigue siendo válida — que es el 90 % de los casos hoy.

**Ambas columnas nullable, ambas `ON DELETE SET NULL`.** Borrar una oportunidad **nunca** puede
borrar una venta: la venta es un hecho contable.

### 2.2 Orden de las migraciones

`0089` referencia `team_deals`, que crea `0085`. El orden importa:

| # | Archivo |
|---|---|
| 0085 | `team_deals.sql` |
| 0086 | `customer_company_fields.sql` |
| 0087 | `contact_person_fields.sql` |
| 0088 | `activity_log_metadata.sql` |
| 0089 | `sale_customer_and_deal.sql` ← **después de 0085** |

## 3. Las tres conversiones

Este es el corazón del pedido. Cada una es un servicio en `lib/deals/conversions.ts`, expuesto
por API y por MCP.

```
Prospecto ──(1)──> Cliente ──┐
    │                        │
    └────────(2)────────> Oportunidad ──(3)──> Venta
```

### 3.1 Prospecto → Cliente

**Ya existe y no hay que reescribirlo.** `registerCustomer`
(`lib/plugins/grok-connector/server/actions.ts:533`) hace exactamente esto:

1. Busca si el contacto ya tiene cliente vía `team_customer_contacts`.
2. Si no, deduplica por email o por teléfono (el teléfono se infiere del `remoteJid` del chat).
3. Crea o actualiza `team_customers`.
4. Inserta el vínculo `team_customer_contacts` con `onConflictDoNothing()`.
5. Audita `GROK_CUSTOMER_CREATED` / `GROK_CUSTOMER_UPDATED`.

Lo que hay que hacer es **extraer esa lógica a `lib/customers/service.ts`** con firma
`convertContactToCustomer(teamId, contactId, overrides, actorId)` para que la use también el
botón de la UI. Hoy vive dentro del handler del conector y no se puede llamar desde otro lado.

La UI agrega el botón **"Convertir en cliente"** en la ficha del prospecto, que además copia los
campos nuevos: `company` → `team_customers.name` si el cliente es la empresa, `job_title` y
`department` quedan en el contacto.

### 3.2 Prospecto → Oportunidad

```ts
convertLeadToDeal(teamId, {
  contactId: number,
  customerId?: number,        // si no viene, se resuelve o se crea con 3.1
  title: string,
  value: number,              // centavos
  currency: string,
  stage?: DealStage,          // default 'qualified'
  probability?: number,       // default por etapa
  expectedCloseDate?: Date,
  ownerId?: number,
}, actorId: number): Promise<Deal>
```

Reglas:

1. **Si el contacto no tiene cliente, se crea** con 3.1 antes de crear la oportunidad. Una
   oportunidad sin cliente no se puede reportar por cliente, y ese es el uso principal.
2. El contacto **no** cambia de etapa de embudo automáticamente. Prospecto y oportunidad son
   ciclos distintos: un contacto puede tener tres oportunidades abiertas y seguir en la misma
   etapa. Si el equipo quiere moverlo, lo hace explícito.
3. `probability` por defecto según etapa: `qualified` 25, `proposal` 50, `negotiation` 75,
   `closed_won` 100, `closed_lost` 0.
4. Se registra en `activity_logs` con `metadata: { from: 'contact', contactId, dealId }`.
5. **Un contacto puede tener varias oportunidades.** No se deduplica — sería un error: es normal
   venderle dos veces al mismo cliente.

### 3.3 Oportunidad → Venta

```ts
closeDealAsWon(teamId, dealId, {
  items?: SaleItem[],         // si no vienen, se genera una línea con el título y el valor
  currency?: string,
  dueDate?: Date,
  createEntry?: boolean,      // asiento financiero, igual que registrarVenta
  idempotencyKey: string,
}, actorId: number): Promise<{ deal: Deal; sale: Sale }>
```

Es el único punto delicado del diseño, porque **crea un hecho contable**. Reglas:

1. Todo dentro de **una transacción**: actualizar el deal a `closed_won` + `closed_at`, crear la
   `team_sales`, enlazar en ambos sentidos. Si algo falla, no queda una venta huérfana ni un deal
   ganado sin venta.
2. **Idempotencia obligatoria.** `idempotencyKey` se comprueba contra `team_sales` antes de
   insertar. Un doble clic en "Marcar como ganada" **no puede** facturar dos veces.
3. **Si el deal ya tiene `sale_id`, no se crea otra venta.** Se devuelve la existente. Este es el
   caso real que rompe sistemas: alguien reabre un deal ganado y lo vuelve a ganar.
4. El número de venta sale de `siguienteNumeroDeVenta(teamId)`
   (`finance-actions.ts:403`, formato `V-0001`). **No se reimplementa.**
   > ⚠️ Esa función cuenta filas (`count(*) + 1`). Con dos cierres concurrentes genera el mismo
   > número. Ya es así hoy para las ventas manuales; al automatizar el cierre desde el kanban la
   > concurrencia sube. **Si aparecen números repetidos, la solución es una secuencia en la base,
   > no un reintento.** Queda anotado como riesgo conocido, no se arregla en esta fase.
5. Si no se pasan `items`, se genera una línea única:
   `{ articleId: null, name: deal.title, sku: '', quantity: 1, unitPrice: deal.value, total: deal.value }`.
6. `autoCreateSaleOnWin: false` en los settings del plugin desactiva todo esto: el deal pasa a
   ganado y la venta se carga a mano. Hay equipos que facturan por fuera.

**Perder una oportunidad** (`closeDealAsLost`) sólo marca `stage: 'closed_lost'` y `closed_at`,
con un motivo opcional en `notes`. No toca nada de ventas.

## 4. Pantallas de la app

Réplica de `/deals` de PulzeCRM (`01-INVENTARIO-PULZE.md` §5), en español:

```
/plugins/deals
  ├─ cabecera: "Embudo de oportunidades"
  │   + KPIs: Valor del embudo · Oportunidades activas · Ticket promedio
  │   + botón "Nueva oportunidad"
  ├─ kanban con @hello-pangea/dnd, una columna por etapa
  │   └─ tarjeta: título, cliente, monto, probabilidad, responsable, avatar,
  │              barra de probabilidad, aviso de estancada (> staleAfterDays)
  └─ /plugins/deals/[id]  panel de detalle
      ├─ "Avance de la oportunidad"  (barra + etapas recorridas)
      ├─ "Datos de la oportunidad"   (cliente, responsable, cierre estimado)
      ├─ "Actividad reciente"        (desde activity_logs)
      └─ acciones: Editar · Marcar como ganada · Marcar como perdida · Ver venta
```

**"Ver venta"** sólo aparece si `deal.saleId` no es nulo, y lleva a `/plugins/sales`.
En la ficha de la venta, el camino inverso: "Viene de la oportunidad #N".

## 5. Endpoints

```
app/api/plugins/deals/
  route.ts                    GET lista+filtros · POST crear
  [id]/route.ts               GET · PATCH · DELETE
  [id]/move/route.ts          PATCH { stage, position }        ← drag del kanban
  [id]/close/route.ts         POST  { result: 'won'|'lost', … } ← conversión 3.3
  stats/route.ts              GET   KPIs del embudo
  convert/route.ts            POST  { contactId, … }            ← conversión 3.2
```

Todos con `getPluginRequestContext('dealsRead' | 'dealsWrite')`
(`lib/plugins/core/runtime-permissions.ts`), que ya resuelve equipo, usuario y rol, y devuelve
401/403 solo. **No se reimplementa el guardia.**

## 6. Tools MCP (reemplaza §2 de `05-CONECTORES-MCP.md`)

`lib/plugins/grok-connector/server/deals-actions.ts`:

### Lectura — `dealsReadTools`, permiso `dealsRead`

| Tool | Qué hace |
|---|---|
| `whatspro_deals_list` | lista con filtros (`stage`, `owner_id`, `customer_id`, `min_value`, `expected_before`, `stale`) |
| `whatspro_deals_get` | una oportunidad con su historial de etapas y su venta enlazada |
| `whatspro_deals_pipeline` | por etapa: conteo, monto, monto ponderado por probabilidad |
| `whatspro_deals_forecast` | proyección por mes = `expected_close_date` × `probability` |

### Escritura — `dealsActionTools`, permiso `dealsWrite`

| Tool | Qué hace | Requisitos |
|---|---|---|
| `whatspro_manage_deal` | crear / actualizar / eliminar | `confirm: true` en `delete`, `idempotency_key` en `create` |
| `whatspro_deals_move` | mover de etapa y posición | — |
| `whatspro_deals_close` | ganar o perder; en `won` crea la venta | `idempotency_key` obligatorio |
| `whatspro_convert_lead` | prospecto → cliente y/o oportunidad | `idempotency_key` obligatorio |
| `whatspro_link_deal_contact` | vincular contacto o cliente | — |

`whatspro_convert_lead` es el que permite pedir *"convertí a Sofía en cliente y abrile una
oportunidad de 2.400 dólares en propuesta"* en una sola llamada.

```ts
{
  name: 'whatspro_convert_lead',
  description:
    'Convierte un prospecto en cliente y opcionalmente abre una oportunidad. Deduplica el ' +
    'cliente por vínculo previo, email o teléfono. Usa idempotency_key para que los ' +
    'reintentos no dupliquen nada.',
  inputSchema: {
    type: 'object',
    required: ['contact_id', 'target', 'idempotency_key'],
    properties: {
      contact_id: { type: 'integer', minimum: 1 },
      target:     { type: 'string', enum: ['customer', 'deal', 'customer_and_deal'] },
      customer:   { type: 'object', additionalProperties: false, properties: {
        name:  { type: 'string', maxLength: 200 },
        email: { type: ['string','null'], format: 'email', maxLength: 255 },
        phone: { type: ['string','null'], maxLength: 80 },
      } },
      deal: { type: 'object', additionalProperties: false, properties: {
        title:       { type: 'string', minLength: 1, maxLength: 200 },
        value:       { type: 'integer', minimum: 0, description: 'Importe en centavos.' },
        currency:    { type: 'string', minLength: 3, maxLength: 3 },
        stage:       { type: 'string', enum: ['qualified','proposal','negotiation'] },
        probability: { type: 'integer', minimum: 0, maximum: 100 },
        expected_close_date: { type: ['string','null'] },
        owner_id:    { type: ['integer','null'], minimum: 1 },
      } },
      idempotency_key: { type: 'string', minLength: 8, maxLength: 120 },
    },
    additionalProperties: false,
  },
}
```

> 🚨 `inputSchema` es **JSON Schema, no zod**. Un `z.` acá hace que la tool desaparezca del
> listado sin ningún error (`feedback_zod_en_json_schema`). Validar con
> `npx tsx scripts/verify-connector-tools.mts`.

`target: 'deal'` sobre un contacto sin cliente **igual crea el cliente** (regla 1 de §3.2). El
enum no miente: describe qué se pide, no qué se toca.

### Registro

- `executeGrokAction`: los 5 `if (name === …)`
- `mcp/route.ts`: `...dealsReadTools` en `readOnlyTools`, `...dealsActionTools` en `actionTools`
- **Los tres conectores**: `grok`, `chatgpt`, `claude-code`
- `connector-policies.ts` (App Maker):
  ```ts
  extended('whatspro_manage_deal',       'crm', ['dealsWrite'], 'deals'),
  extended('whatspro_deals_move',        'crm', ['dealsWrite'], 'deals'),
  extended('whatspro_deals_close',       'crm', ['dealsWrite','salesWrite'], 'deals'),
  extended('whatspro_convert_lead',      'crm', ['dealsWrite','customersWrite'], 'deals'),
  extended('whatspro_link_deal_contact', 'crm', ['dealsWrite'], 'deals'),
  ```
  `deals_close` y `convert_lead` piden **dos** permisos porque tocan dos apps. Una app de App
  Maker que sólo tiene `dealsWrite` no puede facturar de rebote.
- `whatspro_delete_record`: sumar `'dealsWrite'` y aceptar `resource: 'deal'`

## 7. Terminado cuando

- [ ] Los 8 registros de §1.1 hechos; la app aparece en el menú y en el catálogo
- [ ] `dealsRead`/`dealsWrite` visibles y editables en Ajustes → permisos del equipo
- [ ] Migración 0089 aplicada y **en el journal**
- [ ] Kanban con drag & drop entre las 5 etapas, con posición persistida
- [ ] "Convertir en cliente" desde la ficha del prospecto, deduplicando
- [ ] "Nueva oportunidad" desde la ficha del prospecto, creando el cliente si falta
- [ ] "Marcar como ganada" crea la venta enlazada, en transacción, e idempotente
- [ ] Doble clic en "Marcar como ganada" **no** genera dos ventas
- [ ] Reabrir y volver a ganar un deal **no** genera una segunda venta
- [ ] Borrar una oportunidad **no** borra su venta
- [ ] `autoCreateSaleOnWin: false` corta la creación automática
- [ ] Las 9 tools listadas en los tres conectores, con `verify-connector-tools.mts` en verde
- [ ] Un usuario con `dealsRead` y sin `dealsWrite` no puede arrastrar tarjetas
