# Skill: style-check

## Cuándo usar esta skill
Antes de hacer push/merge de cualquier código que toque UI, componentes visuales, o cree nuevas pantallas.

Este es un **checklist de verificación** para asegurar que el código sigue la guía visual oficial.

---

## Consulta rápida

Lees esto si:
- Acabas de crear una nueva pantalla/sección
- Implementaste componentes nuevos
- Modificaste estilos existentes
- Agregaste modales o dialogs

---

## Checklist de verificación (OBLIGATORIO antes de merge)

### 1️⃣ TOKENS Y COLORES

- [ ] **Sin colores hardcodeados**: Busca en tu código:
  - `#hexcolor` → reemplaza con token (`bg-primary`, `text-foreground`)
  - `rgb()` → reemplaza con token
  - `bg-blue-500`, `bg-red-600` → reemplaza con `bg-primary`, `bg-destructive`

  **Excepción:** Colores de branding dinámico (leído de config) está permitido.

- [ ] **Tokens correctos para el contexto**:
  - Fondo principal: `bg-background`
  - Fondo de card: `bg-card`
  - Fondo secundario: `bg-muted`
  - Texto principal: `text-foreground`
  - Texto de ayuda: `text-muted-foreground`
  - Acción principal: `bg-primary` + `text-primary-foreground`
  - Acciones destructivas: `bg-destructive` + `text-destructive-foreground`

**Comando para verificar:**
```bash
grep -r "bg-\|text-" app/[locale]/(dashboard)/mi-seccion/ | grep -v "bg-primary\|bg-card\|bg-muted\|bg-background\|bg-secondary\|bg-destructive\|bg-accent\|bg-sidebar\|text-foreground\|text-primary\|text-destructive\|text-accent\|text-muted\|text-secondary\|dark:" | head -20
```

---

### 2️⃣ TIPOGRAFÍA

- [ ] **Jerarquía clara**:
  - Títulos de página: `text-2xl` o `text-3xl` + `font-bold`
  - Títulos de sección/card: `text-sm`, `text-base`, o `text-lg` + `font-semibold`
  - Cuerpo normal: `text-sm`
  - Metadata/ayuda: `text-xs` + `text-muted-foreground`

- [ ] **Fuente consistente**: Todos usan **Manrope** (configurada globalmente en `globals.css`).

- [ ] **Contraste de texto**: En light/dark mode:
  - Texto claro sobre fondo oscuro ✓
  - Texto oscuro sobre fondo claro ✓
  - Usar `dark:text-*` si es necesario

**Herramienta**: DevTools → Inspect element → Accessibility → Ver contraste ratio.

---

### 3️⃣ COMPONENTES UI

- [ ] **Solo componentes de `components/ui/`** (shadcn/ui): Button, Card, Input, Select, Dialog, etc.
- [ ] **No mezclar librerías de UI**: Nada de Material-UI, Chakra, etc.
- [ ] **Iconos solo de Lucide React**: No usar outras librerías de iconos.
- [ ] **Toasts solo de Sonner**: No usar el componente shadcn toast.

**Verificar:**
```bash
grep -r "from '@mui\|from 'chakra\|from 'react-icons" app/[locale]/(dashboard)/
```

Si hay coincidencias, reemplazar con `lucide-react` o `@/components/ui/`.

---

### 4️⃣ ESTADOS VISUALES

- [ ] **Estado vacío**: Si la pantalla/lista puede estar vacía:
  - Icono + título + descripción + CTA (opcional)
  - Ejemplo: `<EmptyState icon={...} title="..." description="..." />`

- [ ] **Estado cargando**: 
  - Skeleton loaders o spinner
  - No deixar pantalla en blanco mientras carga

- [ ] **Estado error**:
  - Mensaje de error legible
  - Opción para reintentar
  - No dejar usuario sin feedback

**Checklist visual:**
```
Si la pantalla muestra datos:
  [ ] ¿Qué pasa si no hay datos? → EmptyState
  [ ] ¿Mientras carga? → Skeleton/Spinner
  [ ] ¿Si hay error? → ErrorState con reintentar
```

---

### 5️⃣ LAYOUT Y RESPONSIVIDAD

- [ ] **Layout en desktop:**
  - Sidebar izquierda o header arriba
  - Contenido principal a la derecha/abajo
  - 2-3 columnas máximo

- [ ] **Layout en mobile:**
  - Stack vertical (no horizontales complejos)
  - Sidebar colapsado o oculto
  - Botones full-width
  - Touchable (elementos > 44px de altura)

**Verificar en DevTools:**
```
1. Abre DevTools (F12)
2. Toggle Device Toolbar (Ctrl+Shift+M)
3. Testea en:
   - 375px (iPhone)
   - 768px (Tablet)
   - 1024px+ (Desktop)
```

- [ ] **Responsive classes usadas correctamente**:
  - `hidden md:block` (oculto en mobile, visible en desktop)
  - `w-full md:w-80` (ancho completo en mobile, 80 en desktop)
  - `grid-cols-1 md:grid-cols-2` (1 columna mobile, 2 en desktop)

---

### 6️⃣ SELECTTRIGGER Y DROPDOWNS

**Lección aprendida: `w-full` es OBLIGATORIO en `SelectTrigger`.**

- [ ] **Todos los `<SelectTrigger>` tienen `className="w-full"`** (o incluyen `w-full` en className existente)
  
  ```typescript
  // ❌ MAL
  <SelectTrigger>
  
  // ✅ BIEN
  <SelectTrigger className="w-full">
  
  // ✅ TAMBIÉN BIEN
  <SelectTrigger className="h-9 w-full bg-background">
  ```

- [ ] **En modales**, los selects ocupan el ancho completo del contenedor.
- [ ] **Dropdown content** no se ve cortado ni desalineado.

---

### 7️⃣ MODALES Y DIÁLOGOS

- [ ] **Tamaño estándar**: `sm:max-w-[360px]`, `[480px]`, `[520px]`, o `[800px]`.
- [ ] **Estructura**: DialogHeader + DialogContent + DialogFooter.
- [ ] **Botones**: Cancelar (outline) + CTA (filled).
- [ ] **Loading state**: Botón muestra spinner durante acción async.
- [ ] **Validación**: Si es formulario, usa Zod + react-hook-form.
- [ ] **Cierre**: Modal se cierra después de acción exitosa.

---

### 8️⃣ INTERNACIONALIZACIÓN (i18n)

- [ ] **Sin strings hardcodeadas**:
  - Todos los textos via `useTranslations()` (client) o `getTranslations()` (server)
  - Busca: `"hola mundo"`, `'texto aqui'` → deben estar en `.json`

  ```bash
  grep -r '"[A-Za-z]' app/[locale]/(dashboard)/mi-seccion/ | grep -v "className\|htmlFor\|id=" | head -10
  ```

- [ ] **Namespace agregado** en `messages/es.json`, `messages/en.json`, `messages/pt.json`.
- [ ] **Todas las claves existen en los 3 idiomas** (no omisiones).
- [ ] **Traducciones naturales** (no traducciones literales forzadas).

---

### 9️⃣ DARK MODE

- [ ] **Se ve correcto en light mode** (tema por defecto).
- [ ] **Se ve correcto en dark mode** (cambiar con el selector en sidebar).
- [ ] **Contraste suficiente** en ambos temas.
- [ ] **No falta** usar `dark:` clases si color es hardcodeado (lo cual no debería pasar).

**Verificar:**
```bash
1. Abre DevTools → Console
2. Ejecuta: document.documentElement.classList.toggle('dark')
3. Recarga
4. Verifica visibilidad y contraste
```

---

### 🔟 ACCESIBILIDAD (bonus)

- [ ] **Etiquetas en inputs**: `<Label htmlFor="field-id">` + `<Input id="field-id" />`
- [ ] **Botones con texto**: No solo iconos (o `aria-label` si solo ícono)
- [ ] **Colores no son la única forma de transmitir info** (ej: en gráficos, usar también símbolos/texto)
- [ ] **Focusable en teclado**: Tab navega por elementos interactivos
- [ ] **Error messages claros**: Usuario entiende qué corregir

---

### 1️⃣1️⃣ PERFORMANCE (bonus)

- [ ] **Componentes Server cuando posible**: Menos JS en cliente.
- [ ] **SWR para data fetching**: No múltiples fetch/promises anidados.
- [ ] **Imágenes optimizadas**: Usar `Image` de Next.js (no `<img>`).
- [ ] **Sin imports innecesarios**: Cada componente importa solo lo que usa.

---

## Checklist rápido (30 segundos)

```
Antes de hacer git push:

[ ] Tokens de color? ✓ (grep para colores hex/rgb)
[ ] Tipografía clara? ✓ (h1 > h2 > p > pequeño)
[ ] Estados (empty/loading/error)? ✓
[ ] Responsive mobile+desktop? ✓ (DevTools F12)
[ ] SelectTrigger tiene w-full? ✓
[ ] i18n en los 3 idiomas? ✓
[ ] Dark mode se ve bien? ✓ (toggle dark class)
[ ] Solo shadcn/ui + Lucide? ✓
```

---

## Verificación automatizada (opcional)

```bash
# Buscar colores hex directos
grep -r "#[0-9a-f]\{6\}\|rgb(" app/[locale]/ --include="*.tsx" --include="*.ts"

# Buscar imports de librerías UI prohibidas
grep -r "from 'chakra\|from 'antd\|from '@mui" app/[locale]/

# Buscar strings hardcodeadas (aproximado)
grep -r '["'"'"'][A-Z].*["'"'"']' app/[locale]/(dashboard)/ | grep -v "className\|htmlFor\|id\|data-"
```

---

## Ejemplos de cambios comunes

### ❌ → ✅ Colores

```typescript
// ❌ MAL
<div className="bg-blue-500 text-white">

// ✅ BIEN
<div className="bg-primary text-primary-foreground">
```

### ❌ → ✅ Tipografía

```typescript
// ❌ MAL
<p className="font-bold text-lg">Título</p>

// ✅ BIEN
<h2 className="text-lg font-semibold">Título</h2>
```

### ❌ → ✅ SelectTrigger

```typescript
// ❌ MAL
<SelectTrigger className="h-9">

// ✅ BIEN
<SelectTrigger className="h-9 w-full">
```

### ❌ → ✅ Strings

```typescript
// ❌ MAL
<Button>{isLoading ? "Guardando..." : "Guardar"}</Button>

// ✅ BIEN
const t = useTranslations('MyFeature');
<Button>{isLoading ? t('saving_button') : t('save_button')}</Button>
```

---

## Recursos

- `STYLE.md` — Guía visual oficial completa
- `app/globals.css` — Tokens CSS definidos aquí
- `components/ui/` — Componentes base disponibles
- `messages/{es,en,pt}.json` — Strings de UI

---

## Si no pasas el checklist

**No hagas merge.** En su lugar:

1. Identifica qué falla (tokens, i18n, responsive, etc.)
2. Arréglalo localmente
3. Verifica nuevamente este checklist
4. Haz push cuando todo esté ✓

---

## Tip para PR reviews

Si eres reviewer, usa este checklist como guía. Señala:
- "Falta `w-full` en SelectTrigger línea X"
- "Texto hardcodeado en línea Y, mover a i18n"
- "No se ve bien en mobile, revisar responsive classes"
