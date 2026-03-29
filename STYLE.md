# STYLE.md

Guía de estilo visual oficial de WhatSaaS.

> Objetivo: mantener consistencia visual en todas las pantallas futuras, reutilizando el sistema de diseño actual (tokens, componentes y layout del proyecto).

---

## 1) Fundamentos del sistema visual

### 1.1 Tokens y colores (obligatorio)

- **No hardcodear colores** en componentes salvo casos excepcionales de branding configurable.
- Usar clases/tokens del sistema:
  - Fondo: `bg-background`, `bg-card`, `bg-muted`, `bg-sidebar`
  - Texto: `text-foreground`, `text-muted-foreground`
  - Bordes: `border-border`
  - Acción principal: `bg-primary`, `text-primary-foreground`
  - Estados: `destructive`, `accent`, `secondary`

Fuente base y tokens están definidos en `app/globals.css`.

### 1.2 Tipografía

- Fuente global: **Manrope**.
- Jerarquía:
  - Título de página: `text-2xl` o `text-3xl` + `font-bold`
  - Título de sección/card: `text-sm` / `text-base` + `font-semibold`
  - Cuerpo: `text-sm`
  - Metadata/ayuda: `text-xs text-muted-foreground`

### 1.3 Bordes, radios y sombras

- Radios estándar desde tokens (`--radius`).
- Preferir `rounded-lg` / `rounded-xl` para bloques.
- Bordes suaves con `border` + `border-border`.
- Evitar sombras fuertes; priorizar separación por fondo + borde.

---

## 2) Disposición general (layout)

### 2.1 Patrón principal de aplicación

- Estructura tipo workspace:
  1. **Sidebar izquierda** para búsqueda/listado/contexto.
  2. **Encabezado superior** con contexto + CTA principal.
  3. **Panel derecho** con contenido detallado en cards.

- Spacing recomendado:
  - Entre secciones grandes: `space-y-6` / `space-y-8`
  - Entre controles pequeños: `gap-2` / `gap-3`

### 2.2 Comportamiento responsive

- Desktop: 2 columnas (sidebar + contenido).
- Mobile: stack vertical.
- Evitar horizontales complejos en pantallas chicas.

---

## 3) Reglas por componente

### 3.1 Botones

- Acción principal: `Button` default.
- Acción secundaria: `Button variant="outline"`.
- Acciones destructivas: `variant="destructive"`.
- Siempre indicar loading/disabled en acciones async.

### 3.2 Inputs y formularios

- Usar componentes del sistema (`Input`, `Textarea`, `Select`, `Switch`, `Label`).
- Etiqueta clara arriba del campo.
- Mensajes de ayuda/error debajo (`text-xs`).

### 3.3 Cards

- Toda sección funcional debe estar en `Card` o bloque con estilo card:
  - `rounded-xl border bg-card`
  - padding interno consistente
- Contenido largo en `CardContent` scrollable si hace falta.

### 3.4 Badges/etiquetas

- Contexto secundario en `Badge`.
- No usar badge para CTA principal.

---

## 4) Estilo específico para pantalla “Borradores”

### 4.1 Objetivo de diseño

“Borradores” debe verse como un editor/listado de biblioteca:

- **Izquierda**: búsqueda + listado de borradores.
- **Derecha**: vista detallada del borrador seleccionado.
- **Acción primaria**: “Nuevo borrador” visible en header.

### 4.2 Estructura visual recomendada

1. Header:
   - Título “Borradores”.
   - Subtítulo de apoyo.
   - Botón principal a la derecha.

2. Contenido:
   - Contenedor con borde general (`rounded-xl border bg-background`).
   - Sidebar interna (`w-full md:w-80`) con buscador + lista.
   - Panel detalle con cards de preview/variables.

3. Card de borrador:
   - Título corto en énfasis.
   - Cuerpo del mensaje.
   - Bloque de variables dinámicas.
   - Botón de copiar/acciones al final.

### 4.3 Reglas de interacción

- Seleccionar un borrador en sidebar actualiza el panel derecho.
- Si no hay selección, seleccionar automáticamente el primer borrador filtrado.
- Si no hay datos: estado vacío simple con ícono + texto.

---

## 5) Reglas de implementación para futuras features

1. No crear variantes visuales nuevas si el sistema ya cubre el caso.
2. Si una pantalla nueva necesita excepción, documentarla en PR.
3. Mantener copywriting consistente en español del producto.
4. Reusar patrones existentes antes de crear componentes nuevos.
5. Validar contraste mínimo en light/dark.

---

## 6) Checklist de calidad visual

Antes de merge:

- [ ] Usa tokens del sistema (sin colores hardcodeados innecesarios).
- [ ] Respeta jerarquía tipográfica.
- [ ] Mantiene layout sidebar + panel donde aplique.
- [ ] Usa componentes UI existentes.
- [ ] Tiene estado de vacío/carga/error.
- [ ] Se ve correcto en mobile y desktop.
