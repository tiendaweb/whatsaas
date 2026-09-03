# Spec de UI — tokens, paleta y componentes

## 1. El cambio de acento: celeste → verde

PulzeCRM usa `#3b82a8` (celeste apagado) como `--primary`, `--ring` y `--sidebar-primary`,
177 apariciones en el bundle. WhatsPro **ya tiene** un `--primary` verde:

```css
/* app/globals.css:112 */
--primary: oklch(0.69 0.17 145);   /* = #49b653 */
```

Así que no se inventa un verde: se reusa el de marca. El único trabajo real es **evitar la
colisión** entre el nuevo primary verde y el verde menta que Pulze usaba como color de éxito.

### 1.1 Tabla de sustitución (obligatoria, sin excepciones)

| Rol | Pulze | WhatsPro | Nota |
|---|---|---|---|
| **Primary / acento** | `#3b82a8` | **`#49b653`** | usar `var(--primary)` siempre que se pueda |
| Primary claro (gradiente) | `#7dd3fc` | **`#86efac`** | `green-300` |
| Fondo tenue del acento | `#dbeafe` | **`#dcfce7`** | `green-100` |
| Texto sobre fondo tenue | `#3b82a8` | **`#15803d`** | `green-700`, contraste AA |
| Azul oscuro decorativo | `#1e3a5f` | **`#14532d`** | `green-900` |
| Ring / focus | `#3b82a8` | **`var(--ring)`** | ya definido en globals |
| **Éxito / serie 2** | `#6dd4a4` | **`#2dd4bf`** | teal-400 — *se mueve para no chocar con el primary* |
| Éxito claro | `#4ade80` | **`#5eead4`** | teal-300 |
| Éxito fondo | `#d1fae5` | **`#ccfbf1`** | teal-100 |
| Éxito texto | `#059669` | **`#0d9488`** | teal-600 |
| Serie 3 / warning | `#f9c74f` → `#fbbf24` | *sin cambio* | ámbar |
| Warning fondo/texto | `#fef3c7` / `#f59e0b` | *sin cambio* | |
| Serie 4 | `#a78bfa` → `#c084fc` | *sin cambio* | violeta |
| Error | `#ef4444` / `#dc2626` / `#fee2e2` | *sin cambio* | |
| Neutro | `#e5e7eb` / `#64748b` / `#94a3b8` | *sin cambio* | |
| Fondo página claro | `#f5f7fa` → `#fafbfc` | *sin cambio* | gris neutro, no tiene tinte azul |
| Fondo página oscuro | `#0f172a` → `#1e293b` | *sin cambio* | slate |
| Serie por defecto ApexCharts | `#008FFB` | **`var(--chart-2)`** | no debe quedar ningún azul suelto |

> **Por qué se mueve el verde menta.** Si `primary` pasa a verde y el color de "éxito" sigue
> siendo `#6dd4a4`, el gráfico *Revenue Trend* queda con dos series verdes casi idénticas, el
> delta "+12.5%" de las tarjetas KPI se confunde con el icono, y los badges *Completed* dejan de
> distinguirse del estado activo. Teal conserva la lectura "positivo" y mantiene el contraste.

### 1.2 Gradientes derivados

| Uso | Pulze | WhatsPro |
|---|---|---|
| Marca / FAB / KPI 1 | `from-[#3b82a8] to-[#7dd3fc]` | `from-[#2f9e44] to-[#86efac]` |
| KPI 2 (leads) | `from-[#6dd4a4] to-[#4ade80]` | `from-[#2dd4bf] to-[#5eead4]` |
| KPI 3 (deals) | `from-[#f9c74f] to-[#fbbf24]` | *sin cambio* |
| KPI 4 (conversión) | `from-[#a78bfa] to-[#c084fc]` | *sin cambio* |

### 1.3 Verificación

No puede quedar **ningún** hex azul en el código nuevo. Antes de dar por cerrada cualquier fase:

```bash
grep -rniE '#(3b82a8|7dd3fc|dbeafe|1e3a5f|008ffb|60a5fa|3b82f6)' \
  app/\[locale\]/\(dashboard\)/escritorio components/escritorio lib/desktop
# debe devolver 0 resultados
```

## 2. Tokens de layout

| Token | Pulze | Decisión |
|---|---|---|
| `--radius` | `0.75rem` | WhatsPro tiene `0.65rem`. **Se respeta el de WhatsPro**; el `rounded-xl` literal de las tarjetas de Pulze se mantiene tal cual, así que la diferencia no se nota |
| Ancho máximo | `max-w-[1400px] px-6 lg:px-8 py-8` | idéntico |
| Sidebar | `w-64` (256 px) | idéntico |
| Header móvil | `h-16` | idéntico |
| Sheet móvil | `w-72 p-0`, `side="left"` | idéntico |
| Tipografía | Inter, base `16px` | WhatsPro ya usa la fuente del sistema; **se añade Inter** para que el render coincida |
| Pesos | 400 / 500 / 600 / 700 | idéntico |

Pulze fija tamaños con `style={{ fontSize, fontWeight }}` inline en casi todos los textos,
porque su `globals.css` redefine los `h1..h4` y `p` a nivel de elemento. **En el port se
traducen a clases Tailwind** (`text-3xl font-semibold`, `text-sm font-medium`, …) — mismo
resultado visual, sin estilos inline.

Equivalencias usadas:

| inline | clase |
|---|---|
| `1.875rem` / 700 | `text-3xl font-bold` |
| `1.875rem` / 600 | `text-3xl font-semibold` |
| `1.125rem` / 600 | `text-lg font-semibold` |
| `0.9375rem` / 600 | `text-[0.9375rem] font-semibold` |
| `0.875rem` / 500 | `text-sm font-medium` |
| `0.75rem` | `text-xs` |
| `0.6875rem` | `text-[0.6875rem]` |

## 3. Superficies

Se repiten en toda la app y deben extraerse a constantes compartidas
(`components/escritorio/tokens.ts`):

```ts
export const surfaceCard =
  'border-border/40 bg-white/80 dark:bg-card/80 backdrop-blur-sm shadow-sm';
export const surfaceCardHover =
  `${surfaceCard} hover:shadow-md transition-all duration-300 group`;
export const surfaceHeader =
  'border-border/40 bg-white/80 dark:bg-[#0f172a]/80 backdrop-blur-sm';
export const pageBackground =
  'bg-gradient-to-br from-[#f5f7fa] to-[#fafbfc] dark:from-[#0f172a] dark:to-[#1e293b]';
export const navItemActive   = 'bg-primary text-primary-foreground shadow-sm';
export const navItemInactive = 'text-foreground/70 hover:text-foreground hover:bg-muted/50';
```

> Tailwind v4 **no** genera clases desde strings construidos en runtime. Todas estas cadenas son
> literales completos y por eso funcionan. La misma trampa ya documentada en el Radar Engine
> (`project_radar_widgets`) aplica acá: nunca `bg-${color}-500`.

## 4. Componentes shadcn que faltan en WhatsPro

`components/ui/` tiene 25 componentes. Para el port hacen falta **4 más**:

| Componente | Se usa en | Acción |
|---|---|---|
| `progress` | KPI cards, Deal Progress, barras de import/export | `npx shadcn@latest add progress` (Radix ya está) |
| `sheet` | menú móvil del shell, panel del AI Assistant | `npx shadcn@latest add sheet` |
| `scroll-area` | timeline de actividad, listas largas | `add scroll-area` — o `overflow-y-auto custom-scrollbar`, que ya existe en `globals.css` |
| `skeleton` | estados de carga de todos los widgets | `add skeleton` |

Ya disponibles y suficientes: `card`, `badge`, `button`, `dialog`, `dropdown-menu`, `popover`,
`select`, `switch`, `tabs`, `tooltip`, `avatar`, `input`, `label`, `textarea`, `table`,
`separator`, `checkbox`, `command` (para la búsqueda global), `alert-dialog`.

## 5. Sustituciones de librería

### 5.1 ApexCharts → recharts

WhatsPro trae `recharts@3.7`. No se instala ApexCharts.

| Pulze (Apex) | recharts |
|---|---|
| `type:"area"` + gradient fill | `<AreaChart>` + `<defs><linearGradient>` con `stopOpacity` 0.3 → 0 |
| `stroke.dashArray:[0,5]` | `strokeDasharray="5 5"` en la segunda `<Area>` |
| `grid.strokeDashArray:4` | `<CartesianGrid strokeDasharray="4 4" vertical={false} />` |
| `yaxis.formatter: v => $${v/1000}k` | `<YAxis tickFormatter={v => \`$${v/1000}k\`} />` |
| `type:"donut"`, `donut.size:"75%"` | `<PieChart><Pie innerRadius="60%" outerRadius="80%" />` |
| total central `"Total"/"100%"` | `<text>` centrado dentro del `<PieChart>` (recharts no lo trae) |
| `legend.position:"top"` | `<Legend verticalAlign="top" align="right" />` |
| `tooltip.theme` | `<Tooltip content={<CustomTooltip/>} />` con tokens del tema |

### 5.2 Paleta de series — VALIDADA (no cambiar sin volver a validar)

La skill `dataviz` se aplicó y su validador **rechazó la propuesta original** de §1.1 para las
series de datos: `#49b653` (verde) y `#2dd4bf` (teal) quedan a ΔE 13.9 en visión normal, por
debajo del piso de 15 — dos series que un lector con visión plena no distingue. Los pastel de
Pulze además caen fuera de la banda de luminosidad y no llegan a 3:1 contra la superficie.

Los valores que **sí** pasan los seis chequeos, en claro y en oscuro:

```
claro:  #15803d  #7c3aed  #d97706  #0d9488
oscuro: #16a34a  #8b5cf6  #d97706  #0d9488
```

Están en `lib/charts/theme.ts`. Notas:

- **El modo oscuro tiene sus propios pasos.** La banda válida sobre fondo oscuro es más angosta
  (L 0.48–0.67 contra 0.43–0.77 en claro), así que no es un flip del claro: los verdes claros
  que uno esperaría ahí deslumbran y fallan.
- **Ninguna serie es azul.** Se descartó una paleta que pasaba todo (`#0891b2` como serie 2)
  justo por eso: un cyan en un gráfico delataría el celeste del diseño original.
- **El orden importa.** Verde y ámbar adyacentes fallan en protanopía (ΔE 4.8); el violeta entre
  medio resuelve el par. Los hues se asignan en orden fijo y **nunca se ciclan**.

Para revalidar tras cualquier cambio:

```bash
node <skill dataviz>/scripts/validate_palette.js "#15803d,#7c3aed,#d97706,#0d9488" --mode light
node <skill dataviz>/scripts/validate_palette.js "#16a34a,#8b5cf6,#d97706,#0d9488" --mode dark --surface "#1e293b"
```

Los gradientes decorativos de §1.2 (iconos de KPI, marca, FAB) **no** pasan por el validador: no
son series de datos. Viven en `components/escritorio/tokens.ts`.

`--chart-1..5` de `globals.css` es una escala **secuencial** verde: sirve para magnitud, no para
identidad. No se usa como paleta categórica.

### 5.3 framer-motion → tw-animate-css

Pulze anima la entrada de las KPI cards con un stagger de 100 ms. `tw-animate-css` ya está
instalado; se replica con:

```jsx
<div className="animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both"
     style={{ animationDelay: `${i * 100}ms` }}>
```

`animationDelay` inline es un valor dinámico legítimo (no es una clase de Tailwind), así que no
cae en la trampa de §3.

### 5.4 Drag & drop

`@hello-pangea/dnd` ya se usa en `app/[locale]/(dashboard)/dashboard/KanbanBoard.tsx:4`.
El pipeline de Deals y el tablero de Tasks reusan ese mismo patrón — incluido
`bg-primary/10` en `isDraggingOver` y `cursor-grab active:cursor-grabbing` en el handle.

### 5.5 Toasts

Pulze usa Sonner con `toast.success(title, description)`. WhatsPro tiene `sonner@2.0.7`.
Verificar que haya un `<Toaster>` montado en el layout del dashboard antes de usarlo.

## 6. Modos de header

El selector *Header Position* (`left` | `right` | `top`) de Settings es parte de la copia.
Se guarda en `team_desktop_preferences` junto al layout de widgets (ver `04-BACKEND-API.md` §3),
no en `localStorage`, para que siga al usuario entre dispositivos.

⚠️ WhatsPro ya tiene navegación propia: sidebar de dashboard + la barra inferior móvil unificada
de `use-navigation.ts`. **El shell de Pulze no la reemplaza.** El Escritorio renderiza su propio
sub-shell dentro del área de contenido; en móvil se apoya en la barra inferior existente y el
modo `left/right` degrada a `top`. Romper esto rompe la navegación de todo el producto.

## 7. Accesibilidad

Se mantiene lo que Pulze ya hace bien y se corrige lo que no:

- `<SheetTitle>` / `<SheetDescription>` con `sr-only` en el menú móvil ✅ (Pulze ya lo hace)
- Focus ring visible: `focus:ring-2 focus:ring-[--ring] focus:ring-offset-2` ✅
- ❌ Los estados **no pueden distinguirse sólo por color**: los badges Hot/Warm/Cold y
  todo/in-progress/completed llevan además icono o texto.
- ❌ `text-foreground/70` sobre `bg-white/80` queda en 4.1:1. En el port sube a `/80`.
