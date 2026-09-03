# Implementación y selección de recursos

## Stack observado públicamente

| Elemento | Certeza | Evidencia pública |
| --- | --- | --- |
| Next.js | Confirmado | Cabecera `x-powered-by: Next.js`, rutas `/_next/` y payload RSC |
| React | Confirmado | Runtime React y React Server Components en bundles |
| Turbopack | Confirmado | Bundle `turbopack-*.js` |
| Tailwind CSS | Confirmado | Variables `--tw-*`, utilidades y capas generadas; sintaxis compatible con Tailwind 4 |
| Radix UI primitives | Confirmado | Runtime y atributos Radix en bundles |
| Patrón shadcn/ui | Alta confianza | `data-slot`, Radix, CVA y clases de botón características; no hay manifiesto fuente público para certificar el origen |
| Lucide React | Confirmado | Runtime genera clases `lucide-*` y SVG lineales |
| Sonner | Confirmado | Bundle y clases `sonner-*` |
| Manrope | Confirmado | `body { font-family: Manrope, ... }` |
| React Flow / XYFlow | No detectado en la landing | No aparecen identificadores en los bundles públicos auditados; el flow builder mostrado puede ser una maqueta propia |
| Baileys | Declarado por el sitio | La página afirma soporte mediante WhatsApp Web; describe el producto, no necesariamente el código de la landing |

## Stack recomendado

```bash
npx create-next-app@latest crm-ui --ts --tailwind --eslint --app
cd crm-ui
npm install lucide-react sonner class-variance-authority clsx tailwind-merge
npm install @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-tabs
```

Agregar según necesidad:

```bash
npm install @xyflow/react       # flow builder interactivo
npm install recharts            # gráficos
npm install motion              # animaciones complejas
npm install next-themes         # claro/oscuro persistente
```

Para componentes prearmados, inicializar shadcn/ui y agregar sólo los componentes usados. Revisar el código generado: shadcn/ui entrega código editable.

## Arquitectura sugerida

```text
app/
  (marketing)/page.tsx
  dashboard/page.tsx
components/
  ui/
  marketing/
  inbox/
  flow-builder/
lib/
  cn.ts
styles/
  globals.css
```

Mantener tokens semánticos en `globals.css`. Separar datos demo de componentes. Implementar estados con tipos explícitos.

## Uso por agentes de terminal

1. Instalar la carpeta completa del skill.
2. Invocarlo con `$whatspro-style-designer` o `/skills` en Codex.
3. Colocar reglas persistentes en `AGENTS.md`: gestor de paquetes, pruebas, rutas y restricciones de marca.
4. Pedir objetivo, contexto, restricciones y definición de terminado.

```text
Usa $whatspro-style-designer para crear un inbox CRM responsive.
Contexto: Next.js App Router y Tailwind ya instalados.
Restricciones: no copiar textos ni logos de WhatsPro; datos demo en español.
Terminado cuando: lista, chat, panel, dark mode, teclado y pruebas a 360/768/1440 px.
```

## Integración con otros agentes

- En agentes compatibles con Agent Skills, copiar la carpeta y conservar `SKILL.md`, `references/` y `agents/`.
- Sin soporte de skills, usar SKILL.md como regla de proyecto y adjuntar sólo la referencia necesaria.
- Usar MCP para datos/herramientas externas, no para sustituir reglas visuales. Exponer acciones pequeñas y tipadas.
- Para una CLI propia, ofrecer comandos estables como `inspect`, `generate` y `validate`, y documentarlos en el skill.

## Criterios de aceptación

- Lint y pruebas pasan; no hay errores de consola ni hidratación.
- Navegación completa por teclado, foco visible y contraste AA.
- 360, 768 y 1440 px sin desbordes.
- Estados loading, empty, error, success y disabled definidos.
- No hay dependencias sin uso.
