# Escritorio → réplica de PulzeCRM (adaptada a WhatsPro)

Carpeta de planificación del rediseño de la app **Escritorio** (`/escritorio`) para que sea
una copia 1:1 de <https://pulzecrm.web.app/>, pero funcionando sobre las entidades reales de
WhatsPro (clientes, contactos, chats, ventas, membresías, radar) y con el **acento celeste
`#3b82a8` reemplazado por el verde de marca `#49b653`**.

> Estado: **planificación cerrada, implementación no iniciada.**
> Nada de este rediseño está en código todavía. Ver `ESTADO.md`.

## Cómo se obtuvo la referencia

PulzeCRM es una SPA Vite + React 19 + Tailwind v4 + shadcn/ui. No tiene sourcemaps públicos,
así que el inventario se reconstruyó desde el bundle de producción:

```bash
curl -sL https://pulzecrm.web.app/assets/index-C7atM2KU.js -o app.js
curl -sL https://pulzecrm.web.app/assets/index-Bez322Qg.css -o app.css
npx esbuild app.js --format=esm --outfile=pretty.js   # re-imprime el AST con formato
```

De ahí salen: rutas, árbol de navegación, JSX de cada pantalla, tokens CSS, paleta hex y los
mocks que definen el modelo de datos. Todo eso está volcado en `01-INVENTARIO-PULZE.md`.

**Coincidencia de stack (por eso el port es casi mecánico):**

| | PulzeCRM | WhatsPro |
|---|---|---|
| CSS | Tailwind v4.1.12 | Tailwind v4.1.7 ✅ |
| UI kit | shadcn/ui + Radix | shadcn/ui + Radix ✅ |
| Iconos | lucide-react | lucide-react ✅ |
| Charts | ApexCharts | recharts ⚠️ *hay que portar* |
| Animación | framer-motion | tw-animate-css ⚠️ *hay que portar* |
| Drag & drop | dnd nativo | @hello-pangea/dnd ✅ |
| Tema | `--primary: #3b82a8` | `--primary: oklch(0.69 0.17 145)` = `#49b653` ✅ **ya verde** |

## Índice

| Archivo | Qué contiene |
|---|---|
| `01-INVENTARIO-PULZE.md` | Las 10 pantallas de PulzeCRM, componente a componente, con su JSX y sus datos |
| `02-SPEC-UI.md` | Tokens, mapeo celeste→verde, layout, tipografía, componentes shadcn faltantes |
| `03-MAPEO-ENTIDADES.md` | Pulze ↔ WhatsPro: qué reusar, qué extender, qué crear. Migración drizzle |
| `04-BACKEND-API.md` | Endpoints, servicios `lib/`, agregaciones del overview |
| `05-CONECTORES-MCP.md` | Tools MCP nuevas, permisos y políticas de App Maker |
| `06-COPY-ES.md` | Todos los textos, traducidos, listos para `messages/{es,en,pt}.json` |
| `07-PLAN-FASES.md` | Plan de ejecución en 7 fases con criterios de terminado |
| `08-CHECKLIST-QA.md` | QA visual y funcional antes de desplegar |
| `09-APP-OPORTUNIDADES.md` | La app `deals` como plugin propio + las tres conversiones |
| `ESTADO.md` | Estado vivo: qué está hecho y qué falta |

## Decisiones ya tomadas (no volver a discutirlas)

1. **El acento va a `#49b653`** (el `--primary` que WhatsPro ya tiene). No se inventa un verde nuevo.
2. **El verde menta de Pulze (`#6dd4a4`, rol "éxito/serie 2") se mueve a teal `#2dd4bf`.** Si no,
   colisiona con el primary y los gráficos de dos series quedan ilegibles.
3. **`Deals` es una entidad nueva** (`team_deals`) y **una app propia** (plugin `deals`, permisos
   `dealsRead`/`dealsWrite`), vinculada a Ventas en los dos sentidos. `team_sales` es una factura
   emitida (`sale_number`, `items`, `subtotal`, `paid_at`), no una oportunidad con etapa y
   probabilidad. Ver `09-APP-OPORTUNIDADES.md`.
4. **`Accounts` = `team_customers`** (Clientes), extendida con los campos de empresa.
5. **`Leads` = `contacts` + `funnel_stages`**, que ya es el Kanban del CRM. No se duplica.
6. **`Reports` se apoya en Radar**, no en gráficos sueltos.
7. **El rediseño reemplaza `/escritorio`, no `/dashboard`.** El Kanban del CRM y todo lo que hoy
   vive en `/dashboard` queda intacto. Escritorio sigue siendo core
   (`app/[locale]/(dashboard)/escritorio`), no se convierte en plugin.
8. **El recorrido Prospecto → Cliente → Oportunidad → Venta se puede hacer completo**, desde la
   UI y desde MCP, con deduplicación e idempotencia. Ver `09-APP-OPORTUNIDADES.md` §3.
9. **Todo el copy va en español** vía `next-intl`, con `en`/`pt` traducidos.
