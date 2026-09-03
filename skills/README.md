# Skills de Claude Code para WhatSaaS

Guías automatizadas para crear y mantener funcionalidades en la app siguiendo los patrones y el estilo visual oficial.

---

## 📋 Skills disponibles

### 🎨 Creación de Interfaces (UI/UX)

| Skill | Descripción | Cuándo usar |
|-------|-------------|-------------|
| `/new-feature` | Crear pantalla/sección completa con sidebar + panel | Nueva página, módulo, o sección en dashboard/admin |
| `/new-modal` | Crear modales y diálogos correctamente | Modal de confirmación, formulario, wizard |
| `/new-component` | Crear componente UI reutilizable | Componente que se usa en múltiples lugares |
| `/style-check` | Checklist visual antes de merge | Antes de hacer push/PR de cambios de UI |

### 🌐 Internacionalización

| Skill | Descripción | Cuándo usar |
|-------|-------------|-------------|
| `/add-i18n` | Agregar strings en es/en/pt | Nueva pantalla con textos de usuario |

### 💾 Datos y APIs

| Skill | Descripción | Cuándo usar |
|-------|-------------|-------------|
| `/new-api-route` | Crear ruta API con autenticación | Endpoint privado o webhook nuevo |
| `/new-db-schema` | Agregar tablas/columnas a BD | Necesitas persistencia de datos |

### 💳 Pagos y Plugins

| Skill | Descripción | Cuándo usar |
|-------|-------------|-------------|
| `plugin-architecture/SKILL.md` | Arquitectura de plugins | Desacoplar funcionalidad del core |
| `manual-payment/SKILL.md` | Plugin pagos manual | Pagos por revisión manual |
| `mercadopago/SKILL.md` | Plugin Mercado Pago | Pagos vía Mercado Pago |

### 🎨 Sistema visual tipo WhatsPro

| Skill | Descripción | Cuándo usar |
|-------|-------------|-------------|
| `whatspro-style-designer/SKILL.md` | Diseña/audita landings, dashboards, CRM, inbox y flow builders con tokens y patrones tipo WhatsPro | Piezas nuevas que buscan esa estética verde de SaaS de automatización de WhatsApp; nunca copiar marca/copy propietario |

---

## 🚀 Flujo recomendado para una feature nueva

### Ejemplo: Agregar sección "Reportes"

1. **Diseña la estructura**
   ```bash
   /new-feature
   ```
   → Define pantalla, layout, componentes, permisos

2. **Crea componentes visuales**
   ```bash
   /new-component
   ```
   → Para cada componente reutilizable (MetricCard, FilterPanel, etc.)

3. **Agrega traducciones**
   ```bash
   /add-i18n
   ```
   → Agrega strings en `messages/{es,en,pt}.json`

4. **Crea API si necesitas datos**
   ```bash
   /new-api-route
   ```
   → `GET /api/reportes`, `POST /api/reportes`, etc.

5. **Agrega schema de BD si aplica**
   ```bash
   /new-db-schema
   ```
   → Tabla `reportes` en Drizzle schema

6. **Verifica calidad visual**
   ```bash
   /style-check
   ```
   → Checklist antes de merge

---

## 📚 Archivos de referencia

Estos archivos son consultados por los skills:

- **`STYLE.md`** — Guía oficial de estilo visual, tokens, componentes
- **`AGENTS.md`** — Arquitectura del proyecto, patrones, DoD
- **`app/globals.css`** — Tokens CSS, variables, tema global
- **`components/ui/`** — Componentes base disponibles (shadcn/ui)
- **`messages/{es,en,pt}.json`** — Strings de UI por idioma
- **`lib/db/schema.ts`** — Schema de BD (Drizzle)
- **`lib/permissions.ts`** — Roles y control de acceso

---

## 🎯 Atajos por dominio

### Si trabajas en Chat/Inbox
```bash
/new-feature              # Nueva pantalla del chat
/new-component            # Componente como MessageBubble, ChatHeader
/style-check              # Antes de merge
```

### Si trabajas en Automation (Flow Builder)
```bash
/new-feature              # Sección nueva de automation
/new-api-route            # Endpoint para guardar flujos
/new-db-schema            # Tabla de flujos si no existe
/new-modal                # Modal de configuración de nodo
```

### Si trabajas en Analytics/Reportes
```bash
/new-feature              # Nueva sección de reportes
/new-component            # Componentes como MetricCard, Chart
/new-api-route            # GET /api/analytics/reportes
/add-i18n                 # Títulos, etiquetas, mensajes
/style-check              # Verificación final
```

### Si trabajas en Admin
```bash
/new-feature              # Nueva página admin
/style-check              # Antes de merge (admin usa mismo tema)
```

---

## ⚡ Quick Tips

- **Siempre lee primero `STYLE.md`** antes de crear UI
- **`SelectTrigger` siempre necesita `className="w-full"`** (aprendido a la fuerza 😅)
- **Todos los textos en `messages/{es,en,pt}.json`**, no hardcodeados
- **Token colors always**, nunca `#hex` o `rgb()` en componentes
- **Mobile-first responsive design**: testea en DevTools en 375px, 768px, 1024px+
- **Dark mode funciona automático** con los tokens, pero verifica visualmente

---

## 📖 Ejemplos en el código

Busca estos archivos en el repo para ver patrones en acción:

- Pantalla completa: `app/[locale]/(dashboard)/campaigns/` → layout sidebar + panel
- Modal correctamente hecho: `components/chat/ChatHeader.tsx` → "Disparar flujo" modal
- Componente reutilizable: `components/dashboard/ChatListItem.tsx`
- API correcta: `app/api/contacts/route.ts` → CRUD con auth
- Schema de BD: `lib/db/schema.ts` → Tabla `docsArticles` como ejemplo

---

## 🤔 Si tienes dudas

1. Lee el skill relevante (están en markdown, super claros)
2. Revisa los archivos de referencia mencionados en el skill
3. Busca ejemplos similares en el código (patrones reales)
4. Pregunta a Claude Code invocando el skill directamente: `/new-feature`

---

## 📝 Notas de mantenimiento

- Los skills se viven en `skills/*/SKILL.md` en este repo
- Actualiza los skills si cambios de STYLE.md, componentes nuevos, etc.
- Agregar nuevo skill: crear carpeta `skills/nuevo-skill/SKILL.md` con instrucciones claras
- Los skills se reflejan en AGENTS.md para que Claude Code los descubra

