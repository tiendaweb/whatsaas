# Checklist de QA

## 1. Color — el pedido explícito

- [ ] `grep -rniE '#(3b82a8|7dd3fc|dbeafe|1e3a5f|008ffb)' app components lib` → **0 resultados**
- [ ] Ningún azul suelto en gráficos (la serie por defecto de recharts también es azul)
- [ ] El acento es `#49b653` / `var(--primary)` en: nav activo, FAB, gradiente de marca,
      barras de progreso, ring de foco, badge de filtros activos
- [ ] El verde de "éxito" es teal `#2dd4bf`, **no** el mismo verde del primary
- [ ] En *Revenue Trend* las dos series se distinguen (verde vs. teal, y la 2ª punteada)
- [ ] Los 4 KPIs siguen teniendo 4 gradientes distinguibles entre sí
- [ ] Modo oscuro revisado en las 10 pantallas

## 1.1 Alcance del reemplazo

- [ ] El rediseño reemplaza **`/escritorio`**
- [ ] `/dashboard` y su Kanban del CRM quedan **intactos**
- [ ] Los layouts de widgets guardados de usuarios existentes siguen funcionando

## 2. Fidelidad con la referencia

Comparar lado a lado con pulzecrm.web.app, pantalla por pantalla:

- [ ] Escritorio: 7 widgets, mismo orden, mismos `col-span`
- [ ] KPI cards: icono con gradiente `h-10 w-10 rounded-xl`, valor `1.875rem`/700,
      delta con flecha, barra de progreso `h-2`
- [ ] Entrada escalonada de 100 ms por tarjeta
- [ ] *Revenue Trend*: área con degradado 0.3→0, `Target` punteada, eje Y en `$XXk`,
      leyenda arriba a la derecha
- [ ] *Deal Pipeline*: donut al 75 %, total central, leyenda propia en grilla 2×2
- [ ] *Activity Timeline*: línea vertical, icono en círculo con fondo al 15 %, `max-h-[400px]`
- [ ] *Quick Actions*: 4 botones con gradiente, cada uno abre su diálogo
- [ ] Diálogo *Personalizar*: tabs por categoría con contador
- [ ] Shell: las 3 posiciones de menú funcionan y persisten
- [ ] Sidebar 256 px, contenido `max-w-[1400px] px-6 lg:px-8 py-8`
- [ ] Superficies: `bg-white/80 dark:bg-card/80 backdrop-blur-sm border-border/40 shadow-sm`
- [ ] FAB del asistente abajo a la derecha, se abre con la tecla `a`
- [ ] Badges de estado y prioridad con las clases exactas de `01-INVENTARIO-PULZE.md` §8

## 3. Datos reales

- [ ] Ningún dato mock: nada de "Acme Corporation", "$45,000", "Sarah Johnson", "John Doe"
- [ ] `grep -rniE 'pulze|john\.doe|acme corporation|sales insights' app components lib` → 0
- [ ] Los KPIs cuadran con lo que muestran las pantallas de Ventas, Clientes y Tareas
- [ ] El delta "vs. período anterior" compara contra un período de la **misma duración**
- [ ] La moneda sale del dato, no está fija en USD
- [ ] Equipo vacío (sin ventas, sin deals): estados vacíos, **sin división por cero** en la
      tasa de conversión ni en el ticket promedio
- [ ] Equipo grande (>10k contactos): el overview responde en menos de ~800 ms

## 4. Aislamiento por equipo

- [ ] Toda consulta nueva filtra por `team_id` — sin excepción
- [ ] Con dos equipos cargados, ninguno ve datos del otro
- [ ] `/api/plugins/deals/[id]` con un id de otro equipo → **404**, no 200

## 4.1 Conversiones (`09-APP-OPORTUNIDADES.md` §3)

- [ ] "Convertir en cliente" sobre un contacto que ya es cliente **vincula**, no duplica
- [ ] Deduplica por email y por teléfono, no sólo por vínculo previo
- [ ] "Crear oportunidad" sobre un contacto sin cliente crea el cliente primero
- [ ] Un contacto puede tener varias oportunidades abiertas
- [ ] Convertir **no** cambia la etapa de embudo del contacto
- [ ] "Marcar como ganada" crea la venta en una transacción y enlaza en los dos sentidos
- [ ] Doble clic en "Marcar como ganada" → **una sola venta**
- [ ] Reabrir un deal ganado y volver a ganarlo → **no** crea una segunda venta
- [ ] Arrastrar hasta la columna "Ganada" **no** factura: abre el diálogo de cierre
- [ ] Borrar una oportunidad **no** borra su venta (`ON DELETE SET NULL`)
- [ ] `autoCreateSaleOnWin: false` corta la creación automática
- [ ] Desde la venta se puede volver a la oportunidad ("Viene de la oportunidad #N")

## 5. Permisos

- [ ] `dealsRead` / `dealsWrite` aparecen en Ajustes → permisos del equipo
- [ ] Un usuario con `dealsRead` y sin `dealsWrite` no puede arrastrar tarjetas
- [ ] Sin `dealsRead`: la app Oportunidades no aparece en el menú
- [ ] Un agente sin `dealsRead` ve el Escritorio con los bloques comerciales en cero, **no un 403**
- [ ] Sin `tasksRead`: no aparecen tareas, el resto sí
- [ ] Sin `contacts`: no aparecen prospectos
- [ ] `chatVisibility: 'assigned'` sólo ve sus conversaciones
- [ ] Un token de sólo lectura **no** lista las tools de escritura

## 6. Conectores

- [ ] `npx tsx scripts/verify-connector-tools.mts` en verde
- [ ] Las 13 tools nuevas aparecen en los **tres** conectores
- [ ] Ningún `z.` dentro de un `inputSchema`
- [ ] `whatspro_manage_deal` con `action:'delete'` sin `confirm` → error
- [ ] Repetir una creación con el mismo `idempotency_key` no duplica
- [ ] `whatspro_convert_lead` con `target:'deal'` sobre un contacto sin cliente crea el cliente
- [ ] `whatspro_deals_close` repetido con la misma clave → una sola venta
- [ ] Una app de App Maker con `dealsWrite` pero sin `salesWrite` **no** puede cerrar una
      oportunidad como ganada
- [ ] `whatspro_desktop_layout_set` cambia el layout y sobrevive al refresh

## 7. Migraciones

- [ ] 97 archivos `.sql`, 81 entradas en `_journal.json` (hoy: 92 y 76)
- [ ] Las 5 migraciones nuevas registradas en `_journal.json`
- [ ] Ningún prefijo `0085`-`0089` duplicado
- [ ] `0089` va después de `0085` (referencia `team_deals`)
- [ ] Una columna nueva leída desde un Server Component devuelve datos
- [ ] El backfill de `contacts` no pisó ningún valor existente
- [ ] `pnpm build` en verde

## 8. Responsive y accesibilidad

- [ ] 375 px, 768 px, 1024 px, 1440 px, 1920 px
- [ ] En móvil convive con la barra inferior unificada (`use-navigation.ts`) — **no la duplica**
- [ ] Tablas y kanban con scroll horizontal propio; el `body` nunca scrollea en horizontal
- [ ] Navegación completa por teclado; foco visible en todo control
- [ ] Ningún estado se comunica sólo por color
- [ ] Contraste AA en texto secundario sobre superficies translúcidas

## 9. i18n

- [ ] Las 3 locales (`es`, `en`, `pt`) sin claves faltantes
- [ ] Ningún texto hardcodeado en JSX
- [ ] Fechas y números con el locale activo

## 10. Despliegue

- [ ] **`pnpm run deploy:saasfy`** — nunca `pnpm build` + `docker restart`
- [ ] Verificado en el dominio real, no sólo en local
- [ ] `ESTADO.md` actualizado
