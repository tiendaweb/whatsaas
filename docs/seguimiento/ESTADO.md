# ESTADO — Seguimiento

## Fase 0 — Reconocimiento (hecha el 2026-08-29)

Se relevó el código completo antes de escribir el plan. Todo lo que dice el documento 03 está verificado contra archivos y líneas reales al 2026-08-29 en la rama `feat/tareas-rediseno`.

### Lo que confirma el plan

- Existen dos pantallas hermanas de las que Seguimiento toma casi todo: el Embudo (`KanbanBoard.tsx`, 1439 líneas) y las Agendas (`BookmarksBoard.tsx`, 1309 líneas). Misma librería de drag & drop (`@hello-pangea/dnd` 18), mismo endpoint de cambio de etapa, mismo evento Pusher.
- `GET /api/chats?scope=kanban` trae en una sola respuesta todo lo que la tarjeta necesita (contacto, etapa, etiquetas, no leídos, último mensaje, avatar).
- El chat embebido ya existe y funciona (`ChatCliente.tsx` del plugin Tareas).
- El formulario de programados ya existe (`MessageFormDialog`), sólo es privado.
- No existe ninguna configuración del sidebar del chat; el patrón para hacerla está entero en el Escritorio (`teamDesktopPreferences` + `CustomizeDialog`).

### Lo que condiciona el diseño

- 920 contactos y 32 etapas en 5 grupos: sin selector de grupo y sin "Ver las N restantes" la pantalla es inusable.
- El grupo Ventas tiene etapas con el mismo `order` (tres con 3, dos con 4, dos con 5): el orden se desempata por `id`.
- No hay columna que distinga lead de cliente: lead = con etapa y sin cliente; cliente = fila en `team_customer_contacts`. Sólo 136 de los 920 contactos están vinculados a un cliente aunque hay 310 clientes: **hay clientes sin contacto vinculado**, que en Seguimiento no aparecen (no tienen chat).
- El menú está definido en tres lugares (`use-navigation.ts`, `Sidebar.tsx`, `core-nav-items.ts`). Hay que tocar los tres.
- La rama `feat/tareas-rediseno` tiene mucho trabajo sin commitear (ver memoria del rediseño de Tareas). Seguimiento **no** depende de eso, pero conviene commitearlo antes de empezar para no mezclar diffs.

## Decisiones tomadas por el usuario (2026-08-29)

1. **Ruta propia `/seguimiento`.** Sí.
2. **Un solo layout del panel de información** para el chat y Seguimiento. Sí.
3. **Chats sin ficha de contacto: se muestran abajo de todo**, en una sección propia "Sin ficha" al final de la agenda, con su propio control de orden (último mensaje · nombre · no leídos). Se puede abrir el chat; no se pueden arrastrar ni etiquetar hasta que exista la ficha (se crea al primer cambio de etapa desde el menú).

Quedan a criterio de implementación: grupo por defecto (el primero por `order`, después el último usado) y adjuntos en el chat embebido (después; "Abrir chat completo" cubre el caso).

## Fase 1 — qué se hizo (2026-08-29)

- Ruta `app/[locale]/(dashboard)/seguimiento/page.tsx` (server, permiso `contacts`) → `components/seguimiento/SeguimientoApp.tsx`.
- `components/seguimiento/`: `tipos.ts`, `utils.ts` (orden, tiempo relativo sin date-fns, búsqueda sin acentos), `use-seguimiento-data.ts` (6 SWR + derivación de `ContactoCard`), `Toolbar.tsx`, `SeccionEtapa.tsx`, `TarjetaContacto.tsx` (tarjeta y fila; acciones como overlay en hover).
- Menú en los tres lugares + `MobileBottomNav` + mapas de icono `Target` en `settings/menu/page.tsx` y `launcher-catalog.ts`. i18n `Sidebar.seguimiento` + namespace `Seguimiento` en es/en/pt.
- `/api/chats` devuelve además `contact.temperature` e `isVip` (aditivo).
- Desvíos respecto al documento 02: en móvil se fuerza el modo lista y las acciones de la tarjeta son un overlay inferior derecho (la fila reservada dejaba hueco vacío). "Abrir chat" navega a `/dashboard/chat/[numero]` hasta la Fase 2.
- Verificación: `tsc` limpio, `next build` en `.next-smoke` (heap 4 GB; el default se queda sin memoria), smoke con puppeteer y sesión de Martin: 5 rutas, 0 errores de JS; los únicos 404 son `/api/avatar` (fotos vencidas, preexistente).

## Fases

| Fase | Estado |
|---|---|
| 0 Reconocimiento | ✅ 2026-08-29 |
| 1 Cimientos | ✅ 2026-08-29 — `/seguimiento` funcionando con la base real (1.057 chats en 12 secciones del grupo Ventas, segmentos Todos 1.057 · Leads 782 · Clientes 136, sección Sin ficha 138 con su orden propio); build y smoke con puppeteer sin errores; sin commitear |
| 2 Chat lateral | ⏳ |
| 3 Drag & drop y acciones | ⏳ |
| 4 Panel configurable (migración 0095) | ⏳ |
| 5 Programados | ⏳ |
| 6 Pulido, móvil, QA, deploy | ⏳ |
