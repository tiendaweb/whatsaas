# Plan de ejecución

7 fases. Cada una deja el producto en un estado desplegable — nunca a mitad de camino.
Rama de trabajo: la actual, `feat/tareas-rediseno`, o una nueva `feat/escritorio-pulze`.

## Fase 0 — Cimientos (sin UI visible)

1. `npx shadcn@latest add progress sheet skeleton scroll-area`
2. `components/escritorio/tokens.ts` con las constantes de superficie de `02-SPEC-UI.md` §3
3. Cargar la fuente **Inter** en el layout raíz
4. `lib/charts/theme.ts`: paleta de series derivada de `--chart-1..5` + ámbar + violeta
   — **aplicar la skill `dataviz` antes de escribirlo**
5. Verificar que hay un `<Toaster>` de sonner montado en el layout del dashboard

**Terminado cuando:** `pnpm build` pasa y no cambió nada visible.
**Riesgo:** bajo.

## Fase 1 — Migraciones

1. `0085_team_deals.sql` — tabla nueva
2. `0086_customer_company_fields.sql` — 6 columnas en `team_customers`
3. `0087_contact_person_fields.sql` — 9 columnas en `contacts` + backfill
4. `0088_activity_log_metadata.sql` — `metadata jsonb`
5. `0089_sale_customer_and_deal.sql` — `team_sales.customer_id` + `deal_id` (**después de 0085**)
6. Actualizar `lib/db/schema.ts` con las definiciones drizzle
7. **Registrar las 5 en `_journal.json`**

**Antes del backfill de 0087**, inspeccionar las claves reales:
```sql
SELECT DISTINCT jsonb_object_keys(custom_data) FROM contacts WHERE custom_data <> '{}';
```

**Terminado cuando:** 97 archivos `.sql` y 81 entradas en `_journal.json` (hoy: 92 y 76), las 5
nuevas registradas, y una consulta a una columna nueva desde un Server Component devuelve datos.

**Riesgo: medio-alto.** Dos motivos:

- `contacts` es la tabla más caliente del producto.
- **El journal ya viene desincronizado**: 16 migraciones viejas existen como archivo y no están
  registradas (ver `03-MAPEO-ENTIDADES.md` §7.1). No se arregla acá — pero hay que registrar las
  5 nuevas sí o sí, y confirmar que ningún prefijo 0085-0089 choca con uno existente (ya hay dos
  archivos `0022_*`).

## Fase 2 — Backend

1. `lib/deals/service.ts` + `lib/deals/types.ts`
2. `lib/desktop/kpis.ts`, `activity.ts`, `trend.ts`
3. Ampliar `DesktopOverview` y `DesktopLayout` (`version: 2`)
4. `normalizeDesktopLayout` acepta `version: 1` y rellena `headerPosition` / `period`
5. Endpoints: `/api/plugins/deals/**`, `/api/escritorio/activity`, `/api/escritorio/quick-action`
6. Corregir el guardia de `/api/escritorio/overview` — de `tasksRead` global a permiso por bloque

**Terminado cuando:** `curl /api/escritorio/overview` devuelve el payload completo, y un usuario
con permisos recortados recibe 200 con los bloques que puede ver en cero, **no un 403**.

**Riesgo: medio.** Ojo con el `GROUP BY` de `date_trunc` (`feedback_drizzle_group_by_param`):
el intervalo va literal en el `sql\`\``, nunca como parámetro.

## Fase 3 — Escritorio (el corazón del pedido)

Reescribir `app/[locale]/(dashboard)/escritorio/EscritorioClient.tsx` (756 líneas hoy) como:

```
components/escritorio/
  DesktopShell.tsx        sidebar / top nav, 3 posiciones
  DesktopHeader.tsx       título + selector de período + Personalizar
  widgets/
    KpiCards.tsx          4 tarjetas con gradiente, progreso y stagger
    RevenueTrend.tsx      área recharts, 2 series, la 2ª punteada
    PipelineDonut.tsx     donut + leyenda propia en grilla 2×2
    TopDeals.tsx
    ActivityTimeline.tsx  línea vertical + iconos en círculo
    QuickActions.tsx      4 botones con gradiente
    UpcomingItems.tsx
  CustomizeDialog.tsx     tabs por categoría con contador
  GlobalSearch.tsx        Cmd+K (ya funciona, se reviste)
  tokens.ts
```

Los 9 widgets viejos (`focus`, `conversations`, …) se conservan como componentes, ocultos por
defecto en el layout nuevo. **No se borran**: hay equipos con layouts guardados que los usan.

**Terminado cuando:** `/escritorio` es indistinguible de pulzecrm.web.app salvo por el verde y
el idioma, con datos reales del equipo.
**Riesgo: alto** — es la pantalla más visible del cambio.

## Fase 4 — App Oportunidades y conversiones

**Especificación completa: `09-APP-OPORTUNIDADES.md`.** Es la fase con más superficie de
integración de todo el plan.

1. **Plugin `deals`** — los 8 registros de §1.1 (manifest, `registry.ts` ×2, `page-registry.tsx`,
   `permissions.ts`, `settings/page.tsx`, `resource-permissions.ts`, `readonly-api/catalog.ts`)
2. **Permisos `dealsRead` / `dealsWrite`** en `MemberPermissions` y en los 3 `ROLE_PRESETS`
3. **UI**: kanban de 5 etapas con `@hello-pangea/dnd`, tarjeta, panel de detalle, formularios
4. **Conversiones** (`lib/deals/conversions.ts` + `lib/customers/service.ts`):
   - Prospecto → Cliente: **extraer** la lógica de `actions.ts:533`, que hoy sólo es accesible
     desde MCP, a un servicio que también pueda llamar la UI
   - Prospecto → Oportunidad: crea el cliente si falta
   - Oportunidad → Venta: transacción + idempotencia + `sale_id` en ambos sentidos
5. **Endpoints** `/api/plugins/deals/**` con `getPluginRequestContext`

**Terminado cuando:** el checklist de `09-APP-OPORTUNIDADES.md` §7 está completo. En particular:
un doble clic en "Marcar como ganada" **no** emite dos ventas, y borrar una oportunidad **no**
borra su venta.

**Riesgo: alto.** No por la UI sino por el cierre: crea un hecho contable. Los tres puntos que
hay que hacer bien son la transacción, la idempotencia y no facturar desde el drag.
Riesgo conocido que **no** se resuelve en esta fase: `siguienteNumeroDeVenta` numera con
`count(*) + 1` y puede repetir número con dos cierres concurrentes (ya pasa hoy con las ventas
manuales). Si aparece, se arregla con una secuencia en la base, no con reintentos.

## Fase 5 — Prospectos, Clientes, Contactos, Tareas, Agenda, Informes

Revestir las pantallas existentes con el lenguaje visual de Pulze y añadir los campos nuevos.
Informes se arma sobre secciones de Radar, no con gráficos sueltos.

**Terminado cuando:** las 6 pantallas comparten shell, tipografía y superficies con el Escritorio.
**Riesgo: bajo** — es sobre todo presentación.

## Fase 6 — Conectores MCP

`05-CONECTORES-MCP.md` (Escritorio y extensiones a tools existentes) + **`09-APP-OPORTUNIDADES.md`
§6**, que es la especificación vigente de las 9 tools de Oportunidades.

**Terminado cuando:** `npx tsx scripts/verify-connector-tools.mts` en verde y las 13 tools
aparecen en los tres conectores. Pruebas reales:
- *"mové la oportunidad de Acme a negociación y ponela al 80%"* → se refleja en la UI
- *"convertí a Sofía en cliente y abrile una oportunidad de 2.400 dólares en propuesta"* → crea
  cliente + oportunidad en una sola llamada, sin duplicar si ya era cliente
**Riesgo: bajo si se respeta la regla de JSON Schema; alto si no** — con zod adentro la tool
desaparece sin ningún error (`feedback_zod_en_json_schema`).

## Fase 7 — QA y despliegue

`08-CHECKLIST-QA.md` completo, y después:

```bash
pnpm run deploy:saasfy
```

> 🚨 **`pnpm build` + `docker restart` NO despliega nada.** Sirve el `.next` viejo y da la falsa
> impresión de que el cambio está arriba. El único comando que despliega es
> **`pnpm run deploy:saasfy`** (`feedback_build_commands`).

## Orden y paralelismo

```
Fase 0 ─┬─ Fase 1 ── Fase 2 ─┬─ Fase 3 ── Fase 5 ─┐
        │                    ├─ Fase 4 ── Fase 6 ─┼─ Fase 7
        └────────────────────┘
```
Fases 3 y 4 pueden ir en paralelo una vez cerrada la 2. La 5 depende de que la 3 haya fijado el
lenguaje visual. **La 6 ya no es paralela**: las tools de Oportunidades necesitan los servicios y
los permisos de la 4.

## Estimación

| Fase | Alcance |
|---|---|
| 0 | chico |
| 1 | chico, pero delicado |
| 2 | mediano |
| 3 | **grande** |
| 4 | **grande** — plugin + conversiones |
| 5 | grande, pero repetitivo |
| 6 | mediano |
| 7 | chico |

## Qué queda explícitamente fuera

Repetido de `03-MAPEO-ENTIDADES.md` §8 para que no se descubra tarde:
importación/exportación con deshacer · editor de plantillas de correo · revocar sesiones por
dispositivo · matriz de roles duplicada en Informes. Las cuatro se enlazan a lo que ya existe o
se dejan documentadas como pendientes, no se fingen.
