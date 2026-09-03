# Conectores MCP — tools y permisos

Los tres conectores (`grok-connector`, `chatgpt-connector`, `claude-code-connector`) comparten
las definiciones de `lib/plugins/grok-connector/server/*`. Se escribe una vez y los tres la ven.

## 1. Cómo está armado hoy

```
lib/plugins/grok-connector/server/
  actions.ts            grokActionTools[]  +  executeGrokAction(name, input, ctx)
  extended-actions.ts   grokExtendedActionTools[]
  finance-actions.ts    financeActionTools[] / financeReadTools[]
  … 24 archivos, ~67 tools en total

app/api/plugins/grok-connector/mcp/route.ts
  readOnlyTools  →  siempre disponibles
  actionTools    →  sólo si context.actionsEnabled
  línea 391:  tools: [...appTools, ...readOnlyTools, ...(actionsEnabled ? actionTools : [])]
```

Contrato de una tool:

```ts
export type GrokActionTool = {   // actions.ts:34
  name: string;
  description: string;
  inputSchema: JsonSchema;       // JSON Schema puro
};
```

El permiso **no** va en la definición: se comprueba dentro del handler con
`assertPermission(context, 'salesWrite', 'sales')`.

> 🚨 **Trampa que ya costó una sesión.** `inputSchema` es **JSON Schema, no zod**. Si se cuela un
> `z.object(...)` ahí, la tool **desaparece del listado en silencio** — sin error, sin log.
> Ver `feedback_zod_en_json_schema`. Validar siempre con:
> ```bash
> npx tsx scripts/verify-connector-tools.mts
> ```

## 2. Tools de Oportunidades → ver `09-APP-OPORTUNIDADES.md` §6

Oportunidades es una **app propia** con permisos `dealsRead` / `dealsWrite`. Sus 9 tools, sus
permisos y su registro están especificados en **`09-APP-OPORTUNIDADES.md` §6**, que es la fuente
de verdad. No se duplica acá.

Lo único que hace falta retener de esta sección es el **patrón de escritura de una tool**, que
vale para todas:

```ts
// 1. La definición: JSON Schema puro, NUNCA zod.
export const dealsActionTools: GrokActionTool[] = [{
  name: 'whatspro_manage_deal',
  description: 'Crea, actualiza o elimina una oportunidad. Usa idempotency_key para que los ' +
               'reintentos no dupliquen la oportunidad.',
  inputSchema: {
    type: 'object',
    required: ['action'],
    properties: {
      action:  { type: 'string', enum: ['create', 'update', 'delete'] },
      deal_id: { type: ['integer', 'null'], minimum: 1 },
      value:   { type: 'integer', minimum: 0, description: 'Importe en centavos.' },
      idempotency_key: { type: 'string', minLength: 8, maxLength: 120 },
      confirm: { type: 'boolean', description: 'Obligatorio en action=delete.' },
    },
    additionalProperties: false,
  },
}];

// 2. El handler: permiso PRIMERO, después validar, después ejecutar.
async function manageDeal(input: unknown, context: ConnectorContext) {
  await assertPermission(context, 'dealsWrite', 'deals');
  const parsed = manageDealSchema.parse(input);   // zod acá SÍ, en la validación interna
  if (parsed.action === 'delete' && !parsed.confirm) {
    throw new ConnectorError('confirm es obligatorio para eliminar una oportunidad.');
  }
  return updateDeal(context.teamId, …);           // lib/deals/service.ts
}
```

**El `assertPermission` va primero, siempre**, antes de tocar la entrada. Un handler que valida
antes de autorizar filtra la forma de los datos a quien no debería verlos.

Registro en `executeGrokAction`, y en `mcp/route.ts` sumar los arrays a `readOnlyTools` /
`actionTools` — **en los tres conectores** (`grok`, `chatgpt`, `claude-code`). Es fácil olvidar uno.

## 3. Tools nuevas para el Escritorio

Archivo: extender `lib/plugins/grok-connector/server/dashboard.ts` (ya existe).

| Tool | Qué hace | Permiso |
|---|---|---|
| `whatspro_desktop_overview` | Devuelve el `DesktopOverview` completo: KPIs, tendencia, pipeline, actividad, próximos | por bloque (§5) |
| `whatspro_desktop_layout_get` | Layout de widgets del usuario | ninguno propio |
| `whatspro_desktop_layout_set` | Reordena, muestra/oculta widgets, cambia `headerPosition` y `period` | ninguno propio |
| `whatspro_desktop_kpis` | Sólo los 4 KPIs con su delta contra el período anterior | `salesRead` + `dealsRead` + `contacts` |

`whatspro_desktop_layout_set` es lo que permite pedirle a la IA *"ponemé el pipeline arriba de
todo y ocultá marketing"* y que quede guardado. Es la misma idea que ya usa el Radar Engine.

## 4. Extensiones a tools existentes

| Tool | Cambio | Motivo |
|---|---|---|
| `whatspro_save_contact` | admite `lead_score`, `temperature`, `company`, `job_title`, `department`, `linkedin_url`, `is_vip` | campos nuevos de §5 de `03-MAPEO-ENTIDADES.md` |
| `whatspro_manage_customer` | admite `industry`, `website`, `employees`, `annual_revenue`, `location`, `customer_since` | campos nuevos de `team_customers` |
| `whatspro_crm_funnel_snapshot` | añade `deals` junto a los contactos por etapa | el embudo hoy sólo ve contactos |
| `whatspro_crm_followup_queue` | incluye oportunidades estancadas (sin movimiento en N días) | es la cola de seguimiento real de un CRM |
| `whatspro_delete_record` | acepta `resource: 'deal'` | borrado unificado |
| `whatspro_list_records` / `whatspro_get_record` | recurso `deals` | lectura genérica |

Añadir campos a un `inputSchema` existente es **compatible hacia atrás** mientras sean opcionales.
Ninguno de estos campos es obligatorio.

## 5. Permisos

**Corrección (2026-08-26):** sí hacen falta dos permisos nuevos, `dealsRead` y `dealsWrite`,
porque Oportunidades es app propia. Van en `lib/permissions.ts` (`MemberPermissions` + los 3
`ROLE_PRESETS`), en la UI de `settings/page.tsx` y en el `pluginPermissionMap` de
`registry.ts`. El detalle está en `09-APP-OPORTUNIDADES.md` §1.

`salesRead` / `salesWrite` se siguen usando para todo lo que toca `team_sales` — incluido el
cierre de una oportunidad, que pide los dos permisos.

### 5.1 `lib/readonly-api/catalog.ts`

Registrar el recurso `deals` (`readOnlyResources`, línea 226) para que aparezca en
`whatspro_list_resources` y en la API de sólo lectura. Campos expuestos y filtrables:
`id, title, stage, value, currency, probability, expected_close_date, closed_at,
customer_id, contact_id, owner_id, source, created_at, updated_at`.
**`notes` no se expone** en el listado read-only: es texto libre con contenido de cliente.

### 5.2 `lib/plugins/app-maker/server/resource-permissions.ts`

```ts
{ keys: ['deals'], permission: 'dealsRead', pluginId: 'deals' },
```
Va junto a `{ keys: ['sales'], … }` de la línea 35.

### 5.3 `lib/plugins/app-maker/shared/connector-policies.ts`

Las apps de App Maker sólo pueden ejecutar operaciones de esta allow-list. Añadir:

```ts
extended('whatspro_manage_deal',       'crm', ['dealsWrite'], 'deals'),
extended('whatspro_deals_move',        'crm', ['dealsWrite'], 'deals'),
extended('whatspro_deals_close',       'crm', ['dealsWrite','salesWrite'], 'deals'),
extended('whatspro_convert_lead',      'crm', ['dealsWrite','customersWrite'], 'deals'),
extended('whatspro_link_deal_contact', 'crm', ['dealsWrite'], 'deals'),
```

`deals_close` y `convert_lead` piden dos permisos porque tocan dos apps.

Y sumar `'dealsWrite'` a la lista de permisos de `whatspro_delete_record`, que hoy es:
```ts
['contacts','membershipsWrite','tasksWrite','documentsWrite','scheduledMessagesWrite','notesWrite','calendarWrite']
```

> El tipo `AppMakerActionPolicy['category']` no tiene `'sales'`. O se añade al union, o los deals
> van bajo `'crm'`. **Se eligen `'crm'`**: son oportunidades del CRM, y no obliga a tocar un tipo
> que valida definiciones ya guardadas de App Maker.

### 5.4 Escritorio y `actionsEnabled`

Las tools de escritura sólo se listan si `context.actionsEnabled` (`mcp/route.ts:391`). Las de
lectura del Escritorio van en `readOnlyTools`, así un token de sólo lectura puede consultar los
KPIs sin poder mover nada.

## 6. Documentación del catálogo

`docs/conectores/ACCIONES-MCP.md` lleva el inventario (67 existentes + 54 propuestas). Al cerrar
la fase 6 hay que sumar ahí las 13 tools nuevas, con su permiso y si son destructivas. Si no, la
siguiente persona vuelve a proponerlas.

## 7. Checklist de la fase de conectores

- [ ] `npx tsx scripts/verify-connector-tools.mts` en verde
- [ ] Ningún `z.` dentro de un `inputSchema`
- [ ] Las 13 tools listadas en los **tres** conectores (9 de Oportunidades + 4 del Escritorio)
- [ ] `assertPermission` es la primera línea de cada handler de escritura
- [ ] `confirm: true` obligatorio en toda operación destructiva
- [ ] `idempotency_key` en toda operación de creación
- [ ] `deals` registrado en `readonly-api/catalog.ts` y en `resource-permissions.ts`
- [ ] `connector-policies.ts` actualizado
- [ ] `docs/conectores/ACCIONES-MCP.md` actualizado
- [ ] Probado con un token de sólo lectura: las 6 tools de escritura **no** aparecen
      (5 de Oportunidades + `whatspro_desktop_layout_set`)
