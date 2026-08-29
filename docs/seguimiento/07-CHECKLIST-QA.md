# Checklist de QA — Seguimiento

Se completa contra la base real del equipo 2 (920 contactos) antes de desplegar. Cada ítem se marca con cómo se verificó.

## Carga y datos

- [ ] `/seguimiento` carga en menos de 1,5 s con el grupo Ventas (medir en Network, no a ojo).
- [ ] Los conteos por sección suman el total del segmento (sumar cabeceras = pill "Todos").
- [ ] Segmento Leads excluye a todos los contactos con cliente vinculado; Clientes incluye a los 136 vinculados.
- [ ] Un contacto sin etapa aparece en "Sin etapa" y sólo ahí.
- [ ] Grupos de WhatsApp (`@g.us`) no aparecen.
- [ ] Cambiar de grupo no recarga la página y respeta el filtro de etiquetas.
- [ ] La URL con `?grupo=&seg=&tags=&q=` reproduce exactamente la vista al pegarla en otra pestaña.
- [ ] `chatVisibility` de un agente restringido: ve sólo sus chats (probar con un usuario no owner).

## Tarjeta

- [ ] Nombre → pushName → teléfono, en ese orden, sin "null" ni "undefined".
- [ ] Teléfono con caracteres raros no rompe la pantalla (`Intl` en try/catch).
- [ ] Unread desaparece al abrir el chat y vuelve al recibir un mensaje con el panel cerrado.
- [ ] Etiquetas: máximo 2 + "+N"; editar desde el popover actualiza la tarjeta sin recargar.
- [ ] Icono de cliente y VIP sólo cuando corresponde.
- [ ] Acciones visibles en hover y con teclado (Tab hasta la tarjeta).

## Drag & drop

- [ ] Arrastrar entre secciones cambia la etapa; el Embudo abierto en otra pestaña lo refleja sin recargar (Pusher).
- [ ] El chat del contacto muestra el mensaje de sistema "movido a…".
- [ ] Simular fallo (etapa borrada en otra pestaña): la tarjeta vuelve y sale el toast de error.
- [ ] Soltar en la misma sección no hace request (verificar en Network).
- [ ] En móvil el drag está deshabilitado y "Mover a etapa" funciona.

## Panel lateral

- [ ] Abrir chat desde la tarjeta muestra los últimos 60 mensajes con scroll al final.
- [ ] Enviar un texto: aparece en el panel, en `/dashboard/chat/[jid]` y llega al WhatsApp real.
- [ ] Nota interna: no sale a WhatsApp, aparece con estilo de nota.
- [ ] Mensaje entrante mientras el panel está abierto: burbuja nueva + mark-read (unread de la tarjeta queda en 0).
- [ ] Cambiar de contacto no deja mensajes del anterior (key por JID).
- [ ] `Esc` cierra; el botón flotante reabre el último contacto.
- [ ] Sin `messagesSend`: no hay caja de texto.
- [ ] Sin instancia conectada: aviso "Conectá WhatsApp" en lugar de la caja.
- [ ] Pestaña Info muestra las mismas secciones que el sidebar del chat principal para ese contacto.

## Panel configurable

- [ ] Ocultar "Archivos y enlaces" y mover "Etapa" al principio en Seguimiento → `/dashboard/chat/[jid]` lo muestra igual tras recargar.
- [ ] Al revés también.
- [ ] Restablecer vuelve al orden original.
- [ ] Otro usuario del mismo equipo no ve el cambio (es por usuario).
- [ ] Un id inventado en la base (`UPDATE layout`) no rompe: se descarta al normalizar.
- [ ] Migración 0095 aplicada y registrada en `_journal.json`; `pnpm build` y navegación de un Server Component que use la tabla, verdes.

## Programados

- [ ] "Programar mensaje" abre el formulario con el número prellenado y "mañana 09:00".
- [ ] Guardar crea la fila, aparece en la pestaña Programados y en `/plugins/scheduled-messages` con `nextRunAt` correcto.
- [ ] Pausar/reanudar/borrar funcionan y actualizan las dos pantallas.
- [ ] Sin `scheduledMessagesWrite`: no hay botón "Programar" ni acciones.
- [ ] El dashboard del plugin sigue idéntico después de exportar `MessageFormDialog`.

## Móvil

- [ ] Toolbar en dos filas, chips en Sheet, lista de una columna.
- [ ] Panel como Sheet a pantalla completa con botón atrás.
- [ ] La barra inferior de navegación sigue funcionando al cerrar el panel.

## Calidad

- [ ] `pnpm typecheck` verde.
- [ ] `pnpm build` verde.
- [ ] `npm run i18n:check` verde (es/en/pt).
- [ ] Smoke test con puppeteer capturando `window.onerror` en `/seguimiento` y en `/dashboard/chat/[jid]`: cero errores.
- [ ] Ningún color hardcodeado fuera de los mapas cerrados (temperatura, etiquetas). `grep -n "bg-\${" components/seguimiento` vacío.
- [ ] Menú: "Seguimiento" aparece en escritorio (`Sidebar.tsx`), móvil (`MobileMenuSheet`) y en el editor de menú de ajustes (`core-nav-items.ts`).
- [ ] Desplegado con `pnpm run deploy:saasfy` y verificado en producción.
