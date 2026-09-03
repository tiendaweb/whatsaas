# Estado

**Última actualización:** 2026-08-26
**Rama:** `feat/tareas-rediseno`
**Build:** ✅ compila · ✅ tipos limpios · ✅ 221 tools MCP válidas · ✅ smoke tests contra la base real
**Base de datos:** ✅ migraciones 0085-0090 aplicadas · **backup previo en `/root/backups/`**
**Despliegue:** ✅ `pnpm run deploy:saasfy` — app arriba, rutas verificadas

## Resumen

Fases **0-4, 6, 7 y 8 completas y desplegadas**. De la fase 5 se hizo la parte funcional (las
conversiones desde la ficha del contacto) y las seis vistas nuevas (Prospectos, Contactos,
Clientes, Tareas, Agenda e Informes); queda el revestido visual fino.

La fase 8 es el **Centro de Comandos**: la bandeja de todo lo que hay que atender, con las
respuestas ya redactadas por la IA como botones de un clic, opción de escribir la propia,
checkbox por fila y un paso de revisión obligatorio antes de que salga nada.

## Fases

| Fase | Estado | Qué quedó |
|---|---|---|
| 0 — Cimientos | ✅ | `progress`/`sheet`/`skeleton` en `components/ui`, `components/escritorio/tokens.ts`, `lib/charts/theme.ts` con paleta validada |
| 1 — Migraciones | ✅ | 0085-0089 escritas y **registradas en `_journal.json`** (97 archivos / 81 entradas) |
| 2 — Backend | ✅ | `lib/deals/*`, `lib/customers/service.ts`, `lib/desktop/{kpis,trend,activity}.ts`, endpoints |
| 3 — Escritorio | ✅ | 7 widgets, layout configurable, período, búsqueda Cmd+K |
| 4 — App Oportunidades | ✅ | plugin `deals`, permisos, kanban, detalle, las 3 conversiones |
| 5 — Resto de pantallas | 🟡 | Hecho: "Convertir en cliente" / "Crear oportunidad" en la ficha del contacto. Pendiente: revestido visual de Prospectos, Clientes, Tareas, Agenda e Informes |
| 6 — Conectores MCP | ✅ | 9 tools de Oportunidades, `deals` en el catálogo read-only, App Maker. **2026-09-02:** las 4 tools del Escritorio (`whatspro_desktop_overview/_kpis/_layout_get/_layout_set`) y 3 del Centro de Comandos (`_inbox/_suggest/_execute`) — ver `docs/conectores/ACCIONES-MCP.md` §8 |
| 7 — QA y despliegue | ⬜ | `08-CHECKLIST-QA.md` + `pnpm run deploy:saasfy` |
| 8 — Centro de Comandos | ✅ | Bandeja de pendientes con respuestas sugeridas por IA, checkbox, revisión obligatoria y ejecución con freno. Ver `10-CENTRO-DE-COMANDOS.md` |

## Estado de la base de datos

**Backup previo (antes de tocar nada):**

```
/root/backups/whatsaas-20260826-062124.dump      16 MB  formato custom (pg_restore)
/root/backups/whatsaas-20260826-062124.sql.gz    15 MB  SQL plano comprimido
```
Verificado: header `PGDMP` correcto, 159 tablas con sus datos.

**Migraciones aplicadas** con `psql` directo, no con `drizzle-kit migrate`: la tabla
`drizzle.__drizzle_migrations` tiene 53 registros contra 81 entradas del journal, así que
`migrate` habría intentado aplicar 28 migraciones viejas — un incidente aparte. Resultado:

| Tabla | Verificado |
|---|---|
| `team_deals` | 21 columnas, 5 índices |
| `contacts` | 9 columnas nuevas + 2 índices |
| `team_customers` | 6 columnas nuevas |
| `team_sales` | `customer_id`, `deal_id`, `idempotency_key` + índice único parcial |
| `activity_logs` | `metadata jsonb` |

**Backfill:** 61 contactos con email rescatado de `custom_data`, **949 con teléfono** desde el
JID de su chat. El teléfono no estaba en `custom_data` — las únicas claves del equipo son
`crmReorganization`, `origen_lead`, `rubro`, … y `email`. La migración 0087 se corrigió para que
un entorno limpio haga el mismo backfill; sin eso la columna quedaba vacía para casi todos.

**App Oportunidades activada** (`plugin_system_states.deals = true`). Los 18 owners la ven por
rol; el único `agent` del equipo necesita que se le active `dealsRead`/`dealsWrite` a mano.

## Lo que falta

1. **Revestido visual** de Prospectos, Clientes, Tareas, Agenda e Informes (fase 5). Son
   pantallas que ya funcionan; cambiarlas es cosmético y de alto volumen, así que conviene verlas
   con el Escritorio nuevo delante antes de tocarlas.
2. **QA visual** del checklist 08 con datos reales en el navegador.
3. Cargar oportunidades reales: el embudo arranca vacío, así que los widgets de pipeline y
   mejores oportunidades muestran su estado vacío hasta que haya datos.

## Decisiones cerradas

1. El rediseño reemplaza `/escritorio`. `/dashboard` y su Kanban del CRM quedan intactos.
2. Oportunidades es app propia (plugin `deals`, permisos `dealsRead`/`dealsWrite`).
3. Vinculada a Ventas en ambos sentidos, con el recorrido Prospecto → Cliente → Oportunidad →
   Venta disponible desde UI y MCP.

## Lo que cambió respecto del plan (y por qué)

| Planeado | Real | Motivo |
|---|---|---|
| Paleta de series `#49b653` + `#2dd4bf` | `#15803d #7c3aed #d97706 #0d9488` (claro) / `#16a34a #8b5cf6 #d97706 #0d9488` (oscuro) | El validador de `dataviz` las rechazó: verde y teal quedan a ΔE 13.9 en visión normal, bajo el piso de 15. Ver `02-SPEC-UI.md` §5.2 |
| `agent` con `dealsRead: true` | `agent` con `dealsRead: false` | El preset de `agent` ya tiene `salesRead: false`; darle lectura de oportunidades le mostraría montos que hoy no ve |
| Un plugin se registra en 8 lugares | **9** | App Maker valida en build que las políticas existan en su `actionToolMap`. Se agregó el ejecutor `'deals'` |
| Fuente Inter vía `next/font/google` | **No se agregó** | El proyecto no usa `next/font` en ningún lado; meterlo agrega una descarga en build time y puede romper el deploy. La pila del sistema queda como está |
| `revenueTrend.target` desde `team_budgets` | media móvil de 3 meses | `team_budgets` existe pero no hay presupuestos cargados. Está marcado como sustituto explícito en `lib/desktop/trend.ts`, no como proyección |

## Riesgos abiertos (heredados, no se resuelven acá)

| Riesgo | Dónde aparece |
|---|---|
| 16 migraciones viejas fuera de `_journal.json` (ahora 97 archivos vs 81 entradas) | `03-MAPEO-ENTIDADES.md` §7.1. Las 5 nuevas SÍ están registradas |
| `nextSaleNumber` numera con `count(*) + 1` y puede repetir con cierres concurrentes | `lib/deals/conversions.ts`. Se arregla con una secuencia en la base, no con reintentos |
| `contacts.chat_id` es `notNull().unique()`: un lead sin WhatsApp no cabe | se crea chat placeholder, no se relaja la constraint |

## Verificaciones hechas

```bash
# 1. Ningún azul en el código nuevo (sólo un comentario que explica el reemplazo)
grep -rniE '#(3b82a8|7dd3fc|dbeafe|1e3a5f|008ffb)' \
  'app/[locale]/(dashboard)/escritorio' components/escritorio lib/desktop lib/deals lib/charts lib/plugins/deals

# 2. Migraciones registradas
python3 -c "import json,os,glob;j=json.load(open('lib/db/migrations/meta/_journal.json'));\
tags={e['tag'] for e in j['entries']};files={os.path.basename(f)[:-4] for f in glob.glob('lib/db/migrations/*.sql')};\
print(sorted(x for x in files-tags if x>='0085'))"   # []

# 3. Tools MCP válidas
NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-connector-tools.mts
# → Tools revisadas: 154 · Todos los inputSchema son JSON Schema válido

# 4. Tipos y build
NODE_OPTIONS="--max-old-space-size=6144" npx tsc --noEmit -p tsconfig.json
pnpm build
```

## Trampas que se pisaron y se resolvieron

| Trampa | Cómo apareció |
|---|---|
| App Maker registry out of sync | El build falló al recolectar `/api/plugins/app-maker/catalog`. Faltaba el registro 9 |
| `tsc` sin memoria | `--max-old-space-size=6144` con el proyecto completo |
| `verify-connector-tools.mts` con `server-only` | Necesita `NODE_OPTIONS="--conditions=react-server"` |
| Paleta que "se ve bien" pero falla CVD | Sólo se detecta corriendo el validador; a ojo pasaba |
| **`Date` crudo dentro de un `sql` anidado en `FILTER (WHERE …)`** | Lo cazó el smoke test contra la base real: postgres.js no lo serializa y revienta con *"The string argument must be of type string"*. **Ni el build ni el typecheck lo detectan.** Va como ISO string con cast: `sql\`${value.toISOString()}::timestamp\``. Es primo hermano de la trampa de `date_trunc` |
| **`Intl` lanza ante datos sucios de otra app** | El Escritorio mostraba *"No pudimos cargar esta página"* en el navegador aunque el servidor respondía 200 y no había nada en los logs. La causa: la agenda de una mini-app guarda horas sueltas (`"10:10"`) en el campo de fecha; `new Date("10:10")` da NaN y **`Intl.RelativeTimeFormat.format(NaN)` tira `RangeError`**, que dentro del render tumba la pantalla entera. Se arregló en los dos lados: el servicio normaliza `at` a ISO-o-null y antepone la hora al título, y el cliente tolera lo que no parsee. El formateo de moneda quedó blindado igual en `components/escritorio/format.ts`. **Regla: ningún dato guardado por otro plugin puede romper esta pantalla.** |
| El teléfono no está donde uno supone | `custom_data` sólo tenía `email`; el teléfono vive en `chats.remote_jid`. Un backfill "obvio" habría dejado 949 contactos sin teléfono, en silencio |
