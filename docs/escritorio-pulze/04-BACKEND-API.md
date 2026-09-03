# Backend y API

## 1. Lo que ya existe

```
lib/desktop/
  types.ts        9 widgets, DesktopLayout, DesktopOverview, DesktopSearchResult
  service.ts      getDesktopOverview(ctx)  ·  searchDesktop(ctx, query)      (224 líneas)
  preferences.ts  normalizeDesktopLayout · getDesktopLayout · saveDesktopLayout

app/api/escritorio/
  overview/route.ts      GET   → getDesktopOverview   (403 si !tasksRead)
  preferences/route.ts   PATCH → guarda el layout
  search/route.ts        GET ?q=
```

`getDesktopOverview` ya agrega: tareas, conversaciones, clientes, membresías, ingresos,
marketing (Meta Ads), infraestructura (dominios/Hostinger), conocimiento (docs/notas/formularios)
y Business Woman. **El Escritorio actual ya lee casi todo lo que el Dashboard de Pulze necesita.**

## 2. Widgets: de 9 a 7 + los de Pulze

Hoy (`lib/desktop/types.ts`):
```ts
['focus','conversations','customers','revenue','marketing',
 'infrastructure','knowledge','business-woman','apps']
```

Destino — se **añaden** los de Pulze sin borrar los actuales, porque equipos en producción ya
tienen layouts guardados con esos ids y `normalizeDesktopLayout` los conserva:

```ts
export const DESKTOP_WIDGET_IDS = [
  // Pulze
  'kpi-cards', 'forecast', 'pipeline', 'recent-deals',
  'activity-feed', 'quick-actions', 'upcoming',
  // WhatsPro (se mantienen, ocultos por defecto en el layout nuevo)
  'focus', 'conversations', 'customers', 'revenue', 'marketing',
  'infrastructure', 'knowledge', 'business-woman', 'apps',
] as const;
```

> `normalizeDesktopLayout` ya hace lo correcto: los ids desconocidos se descartan y los nuevos se
> añaden al final. Un usuario con layout viejo verá los widgets nuevos al final; uno nuevo recibe
> `DEFAULT_DESKTOP_LAYOUT`. **No hay que migrar `team_desktop_preferences`.**

`DesktopLayout` gana dos campos:

```ts
export type DesktopLayout = {
  version: 2;                                   // ← subir versión
  order: DesktopWidgetId[];
  pinned: DesktopWidgetId[];
  hidden: DesktopWidgetId[];
  headerPosition: 'top' | 'left' | 'right';     // ← nuevo, default 'left'
  period: '30d' | '3m' | '6m' | '1y' | 'all';   // ← nuevo, default '30d'
};
```
`normalizeDesktopLayout` tiene que aceptar `version: 1` y rellenar los dos campos nuevos con sus
defaults. Si no, todo layout guardado se descarta silenciosamente.

## 3. `DesktopOverview` — lo que hay que agregar

```ts
kpis: {
  revenue:    { value: number; currency: string; changePct: number; trend: 'up'|'down'; progress: number };
  leads:      { value: number; changePct: number; trend: 'up'|'down'; progress: number };
  dealsClosed:{ value: number; changePct: number; trend: 'up'|'down'; progress: number };
  conversion: { value: number; changePct: number; trend: 'up'|'down'; progress: number };
};
revenueTrend: Array<{ month: string; revenue: number; target: number }>;   // 6 meses
pipeline:     Array<{ stage: string; label: string; count: number; value: number; pct: number; color: string }>;
topDeals:     Array<{ id: number; title: string; company: string; value: number; currency: string; stage: string; probability: number; href: string }>;
activity:     Array<{ id: string; kind: string; title: string; description: string; at: string; color: string }>;
upcoming:     Array<{ id: number; title: string; kind: 'meeting'|'call'|'task'; at: string; priority: string; href: string }>;
```

### 3.1 De dónde sale cada número

| Campo | Consulta |
|---|---|
| `kpis.revenue` | `sum(team_sales.total)` con `status='paid'` y `paid_at` en el período |
| `kpis.leads` | `count(contacts)` con `funnel_stage_id` en etapas activas |
| `kpis.dealsClosed` | `count(team_deals)` con `stage='closed_won'` y `closed_at` en el período |
| `kpis.conversion` | `closed_won / (closed_won + closed_lost)` en el período |
| `changePct` | mismo cálculo sobre el período inmediatamente anterior, misma duración |
| `revenueTrend.revenue` | `team_sales.total` agrupado por mes |
| `revenueTrend.target` | `team_budgets` si hay presupuesto cargado; si no, media móvil de 3 meses |
| `pipeline` | `team_deals` agrupado por `stage`, con `count` y `sum(value)` |
| `topDeals` | `team_deals` abiertos, `order by value desc limit 4` |
| `activity` | `activity_logs` del equipo, últimos 5, mapeados a título/descripción |
| `upcoming` | `team_events` + `team_task_items` con vencimiento, próximos 7 días |

> 🚨 **Trampa de drizzle, ya vivida.** Para agrupar por mes **no** se puede pasar el intervalo de
> `date_trunc` como parámetro: `date_trunc($1, created_at)` compila, pasa el build y explota en
> runtime al armar el `GROUP BY`. Va literal: `sql\`date_trunc('month', ${teamSales.paidAt})\``.
> Ver `feedback_drizzle_group_by_param`.

### 3.2 Permisos por bloque

`getDesktopOverview` ya recibe un `PermissionContext` y tiene `isPluginAllowed(ctx, pluginId)`.
Cada bloque nuevo se apaga solo si falta el permiso, devolviendo ceros — **nunca un 403 global**,
que dejaría el Escritorio en blanco para un agente con permisos acotados:

| Bloque | Permiso | Plugin |
|---|---|---|
| `kpis.revenue`, `revenueTrend` | `salesRead` | `sales` |
| `kpis.leads`, `pipeline` | `contacts` | — |
| `topDeals`, `kpis.dealsClosed`, `kpis.conversion` | `dealsRead` | `deals` |
| `upcoming` (eventos) | `calendarRead` | `calendar` |
| `upcoming` (tareas) | `tasksRead` | `tasks` |
| Membresías | `membershipsRead` | `memberships` |
| Conversaciones | `messagesRead` + `chatVisibility` | — |

El guardia actual de `overview/route.ts` exige `tasksRead` para **todo**. Eso hay que corregirlo:
pasa a exigir sólo que exista contexto, y cada bloque decide.

## 4. Endpoints nuevos

```
app/api/escritorio/
  activity/route.ts       GET    timeline paginado
  quick-action/route.ts   POST   { type: 'lead'|'message'|'call'|'meeting', … }
```

Los endpoints de la app Oportunidades (`app/api/plugins/deals/**`, incluidos `move`, `close` y
`convert`) están especificados en **`09-APP-OPORTUNIDADES.md` §5**, porque son de esa app y no
del Escritorio.

`/[id]/move` es endpoint propio a propósito: el drag dispara muchas escrituras pequeñas y no
tiene que arrastrar el payload completo del deal ni revalidar de más.

### Contrato de `move`

```ts
PATCH /api/plugins/deals/42/move
{ "stage": "negotiation", "position": 2 }
→ 200 { ok: true, deal: { id, stage, position, updatedAt } }
```
Reordena en transacción las posiciones de la columna origen y destino, y registra en
`activity_logs`.

⚠️ **`move` a `closed_won` NO factura.** Arrastrar una tarjeta hasta la última columna cambia la
etapa y nada más. La venta se crea sólo por `POST /[id]/close`, que exige `idempotency_key`.
Si el drag facturara, un arrastre accidental emitiría una venta — y una venta es un hecho
contable que después hay que anular a mano. La UI, al soltar en "Ganada", abre el diálogo de
cierre; el usuario confirma ahí. Ver `09-APP-OPORTUNIDADES.md` §3.3.

## 5. Rendimiento

`getDesktopOverview` ya hace del orden de 15 consultas. Con lo nuevo se va a ~25. Reglas:

1. Todo lo independiente va en un solo `Promise.all`, como ya hace el servicio.
2. Los 4 KPIs con su período anterior son **8 agregaciones**: se resuelven en **2 consultas** con
   `FILTER (WHERE …)` por período, no en 8 viajes.
3. `refreshInterval: 60000` del SWR del cliente se mantiene.
4. `export const dynamic = 'force-dynamic'` ya está en las rutas — no se cachea entre equipos.
5. Si `getDesktopOverview` pasa de ~800 ms en un equipo real, se parte en dos endpoints
   (`/overview` crítico y `/overview/extended` diferido). **Medir antes de partir.**

## 6. Servicios en `lib/`

Regla del repo (`AGENTS.md`, y `project_mcp_connector_catalog`): la lógica vive en `lib/**` con
firma `(teamId, …)`. Sólo así exponerla por MCP después es barato. Nada de lógica dentro de
`route.ts`.

```
lib/deals/
  service.ts      listDeals · getDeal · createDeal · updateDeal · moveDeal · dealStats
  conversions.ts  convertLeadToDeal · closeDealAsWon · closeDealAsLost
  types.ts        Deal, DealStage, DEAL_STAGES
lib/customers/
  service.ts      convertContactToCustomer   ← extraído de actions.ts:533, hoy vive dentro
                                               del handler MCP y no se puede llamar desde la UI
lib/desktop/
  kpis.ts         computeKpis(teamId, period, ctx)
  activity.ts     listActivity(teamId, limit)
  trend.ts        revenueTrend(teamId, months)
```

Firmas: `moveDeal(teamId: number, dealId: number, input: MoveInput, actorId: number)`.
Sin `PermissionContext` adentro — el permiso se valida en el borde (ruta o tool MCP), el
servicio sólo recibe `teamId` ya resuelto. Ese es el patrón que hace que las 67 tools MCP
existentes hayan salido baratas.
