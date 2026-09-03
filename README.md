# WhatsPro (Next.js + Drizzle)

Plataforma SaaS para operación comercial y soporte sobre WhatsApp, con gestión de conversaciones, CRM, campañas, automatizaciones, analítica, administración de equipos, planes y facturación.

## Estado actual del proyecto

### Ya implementado
- **Autenticación y sesiones**:
  - login, signup y recuperación de contraseña
  - sesiones persistentes y middlewares de acceso
  - validación de permisos por usuario/equipo
- **Dashboard multi-módulo**:
  - inbox visual tipo kanban para conversaciones
  - contactos/CRM
  - campañas
  - automatización
  - analítica
  - plantillas
  - configuración del workspace
- **Panel admin**:
  - métricas generales del sistema
  - administración de usuarios, equipos y planes
  - branding global
  - configuración visual del chat
  - monitoreo básico de actividad
- **Integración de pagos**:
  - checkout y portal de cliente con Stripe
  - webhooks de sincronización
  - soporte inicial para configuración por proveedor
  - base de datos preparada para migrar a plugins de pago
- **Persistencia en Postgres** con Drizzle ORM y migraciones SQL
- **Internacionalización** (`messages/es.json`, `messages/en.json`, `messages/pt.json`)
- **Base API interna y externa**:
  - endpoints REST para operaciones del dashboard
  - endpoint autenticado para envío programático (`app/api/v1/send`)

## Funciones clave del sistema

### 1. Conversaciones e inbox operativo
- Vista principal del dashboard con tablero de conversaciones.
- Gestión de chats y sesiones activas por instancia.
- Envío de mensajes de texto, imágenes, video, documentos y audio.
- Reacciones, marcado de lectura, cierre de chats y sincronización de mensajes.
- Actualización en tiempo real vía eventos del servidor.

### 2. CRM y gestión de contactos
- Listado de contactos con búsqueda y filtros avanzados.
- Asignación de agente, departamento y etapa de funnel.
- Etiquetas por contacto.
- Notas internas.
- Campos personalizados (`custom_fields`) y datos dinámicos (`custom_data`).
- Importación y exportación de contactos desde archivos.
- Reasignación/movimiento de contactos entre instancias.

### 3. Embudo comercial y organización
- Etapas de funnel configurables.
- Departamentos y miembros por departamento.
- Asignación operativa para distribuir conversaciones y leads.
- Roles de equipo y permisos granulares para acceso a módulos.

### 4. Campañas
- Creación de campañas desde el dashboard.
- Estado de campaña (`DRAFT`, `SCHEDULED`, `PROCESSING`, `COMPLETED`).
- Seguimiento de total de leads, enviados y fallidos.
- Ejecución manual y procesamiento en background.
- Control por feature flags según el plan del equipo.

### 5. Automatización
- Constructor/listado de automatizaciones por equipo.
- Activación/desactivación de flujos.
- Asociación de flujos con instancias de WhatsApp.
- Sesiones de automatización persistidas en base de datos.
- Procesamiento de eventos entrantes para disparar automatizaciones.

### 6. Plantillas de WhatsApp
- Sincronización de templates desde instancias conectadas.
- Gestión por instancia.
- Visualización de estado de aprobación.
- Preview de plantillas antes de uso.
- Creación condicionada por permisos/feature availability.

### 7. Analítica
- Dashboard analítico con métricas de funnel.
- Métricas por agente.
- Heatmap/tráfico operativo.
- Visualizaciones orientadas a performance comercial y de atención.

### 8. Gestión del equipo y del workspace
- Invitación de miembros.
- Revocación y reenvío de invitaciones.
- Gestión de miembros del equipo.
- Suscripción y plan actual desde settings.
- Configuración general, seguridad, AI, conectividad y desarrolladores.

### 9. Administración global
- Vista administrativa con KPIs de usuarios, equipos y suscripciones activas.
- Gestión centralizada de usuarios.
- Gestión de teams.
- Gestión de planes comerciales.
- Configuración de branding y chat theme.
- Revisión de pagos desde admin.
- Auditoría de actividad reciente del sistema.

### 10. Integraciones y mensajería
- Integración con Evolution API para instancias de WhatsApp.
- Webhook de eventos entrantes para mensajes, estados y reacciones.
- Sincronización de chats y mensajes desde instancias.
- Soporte para plantillas WABA.
- Infraestructura de notificaciones en tiempo real con Pusher.

### 11. API para desarrolladores
- Endpoint autenticado para envío de mensajes (`/api/v1/send`).
- Validación de payload con Zod.
- Soporte para texto y archivos multimedia.
- Persistencia del mensaje enviado dentro del historial interno.
- API externa completa de solo lectura en `/api/readonly/v1`, con catálogo de recursos,
  paginación, filtros exactos, búsqueda, OpenAPI 3.1 y contexto Markdown para IA.
- Tokens `ro_live_…` separados de las claves de envío; se almacenan únicamente como
  hash SHA-256, admiten vencimiento y revocación, y siempre quedan aislados por equipo.
- Conector MCP sin dependencias en `/integrations/whatspro-readonly-mcp.mjs` para
  Claude Code, Claude Desktop y clientes Codex compatibles.

Variables del módulo de solo lectura:

```env
READ_ONLY_API_ALLOWED_EMAILS=noelia@whatspro.uno
# SHA-256 hexadecimal del código que desbloquea la documentación administrativa.
READ_ONLY_API_DOCS_CODE_HASH=
```

La página administrativa está en `/settings/developers/read-only`. El router externo
solo implementa `GET`, `HEAD` y `OPTIONS`; no reutiliza `/api/v1/send` ni las claves
`sk_live_…`. Contraseñas y credenciales de proveedores se eliminan antes de serializar.

El conector de Claude Code vive como plugin de usuario en
`/plugins/claude-code-connector`. Su acceso se valida en servidor contra
`noelia@whatspro.uno` y requiere además una activación individual en
`team_member_plugins`. Para aplicar y verificar esa asignación de forma idempotente:

```bash
pnpm activate:claude-code-connector
```

Los conectores de Grok, Claude Code y ChatGPT se muestran en la biblioteca de Apps
cuando están asignados al usuario. Para mantener los tres desactivados globalmente y
habilitarlos exclusivamente para `noelia@whatspro.uno`, ejecuta:

```bash
pnpm activate:ai-connectors-noelia
```

Los tres conectores reutilizan el mismo servidor MCP y publican el mismo plano de
administración. Además del catálogo de lectura y las acciones de negocio, pueden:

- crear, configurar, publicar y eliminar sitios sin depender de una plantilla;
- crear, leer, mover, reemplazar y eliminar archivos o carpetas del sitio;
- aplicar parches exactos con `expected_updated_at` para evitar escrituras obsoletas;
- gestionar slugs, subdominios, dominios personalizados y el inventario de dominios;
- crear, editar, archivar, eliminar y vincular clientes con contactos.

Todas las herramientas validan `teamId`, permisos del miembro y activación del plugin.
Las eliminaciones exigen `confirm=true` y las mutaciones generan actividad auditable.
No se expone SQL arbitrario ni credenciales de proveedores.

### 12. IA y extensibilidad
- Configuración AI persistida en base de datos.
- Sesiones y herramientas AI modeladas en schema.
- Plugin local `ai-chat` ya presente en `lib/plugins`.
- Arquitectura en transición hacia mayor extensibilidad por plugins, empezando por pagos.

### Reglas de activación de plugins de app
- Cada plugin declara `activationMode` (`system | global | user | hybrid`) en su manifest.
- `system` siempre está activo y no puede desactivarse desde admin.
- `global` se controla por team.
- `user` se controla por asignación individual.
- `hybrid` permite default por team con override por usuario.
- `marketplace` está marcado como `system` y se auto-provisiona activo para cada team.

### Form Builder
- El team asociado a `noelia@whatspro.uno` recibe el plugin `form-builder` activo por defecto, sin requerir variables de entorno.
- El plugin sigue siendo desactivable desde `/admin/plugins`; si ya existe un override de team, el bootstrap no lo sobrescribe.

### Sitios
- Plugin de activación individual para publicar HTML, CSS, JavaScript y assets estáticos.
- Cada sitio dispone de una URL inmediata `https://whatspro.uno/s/{slug}` y puede reservar un subdominio editable.
- Un sitio también puede guardar un dominio personalizado y configuración JSON. El DNS, el certificado TLS y la regla `Host(...)` del proxy deben apuntar ese dominio a la ruta interna `/api/sites-custom/{path}` antes de usarlo públicamente; el resolver toma el dominio desde `Host` y conserva el path solicitado.
- Los subdominios requieren DNS y certificado TLS wildcard para `*.whatspro.uno`; configura el dominio con `SITES_BASE_DOMAIN`.
- El editor usa Monaco Editor. La carga admite archivos, carpetas y ZIP (máximo 40 MB por operación y 10 MB por archivo).
- Variables: `SITES_BASE_DOMAIN` y `SITES_RESERVED_SUBDOMAINS`.
- Para activar el plugin a un usuario: `node scripts/activate-sites-for-user.mjs correo@dominio.com`.

### Pagos hoy
Actualmente el core está acoplado principalmente a Stripe en:
- `lib/payments/stripe.ts`
- `lib/payments/actions.ts`
- `app/api/stripe/*`
- partes de `app/[locale]/(dashboard)/pricing/*`

## Objetivo siguiente (prioridad)

Crear un **entorno de plugins de pagos** para poder agregar funcionalidades sin tocar el core de negocio.

Objetivos inmediatos:
1. Plugin **Manual Payment** para registrar y aprobar pagos manuales.
2. Plugin **Mercado Pago** para configurar keys y habilitar checkout/webhooks.

---

## Arquitectura objetivo: Payment Plugins

### Principio
El core no debe conocer Stripe/Mercado Pago/Manual directamente.
Solo debe consumir una interfaz común.

### Interfaz propuesta
Crear `lib/payments/plugin-types.ts` con un contrato similar:

- `providerId` (`manual`, `stripe`, `mercadopago`)
- `createCheckout(input)`
- `openCustomerPortal?(input)`
- `handleWebhook?(payload, headers)`
- `getPaymentStatus(reference)`
- `validateConfig(env)`

### Registro de plugins
Crear `lib/payments/plugins/index.ts` con un registry:
- `registerPaymentPlugin(plugin)`
- `getPaymentPlugin(providerId)`
- `getEnabledPaymentPlugins()`

### Config central
En `.env`:
- `PAYMENT_PROVIDER=manual|stripe|mercadopago`
- `PAYMENT_PROVIDERS_ENABLED=manual,stripe,mercadopago`

---

## Plugin 1: Manual Payment (MVP)

### Flujo funcional
1. Usuario selecciona plan.
2. Sistema genera orden `pending_manual_review`.
3. Usuario sube comprobante o referencia.
4. En ventas de marca blanca, el reseller dueño del cliente aprueba/rechaza; el admin
   de plataforma conserva visibilidad y auditoría. En ventas directas aprueba el admin.
5. Al aprobar, activar plan del team.

### Estados recomendados
- `pending_payment`
- `pending_manual_review`
- `paid`
- `rejected`
- `expired`

### Requisitos de datos (sugeridos)
Tabla nueva `manual_payments`:
- `id`
- `teamId`
- `planId`
- `amount`
- `currency`
- `proofUrl` (opcional)
- `reference` (opcional)
- `status`
- `reviewedBy` (opcional)
- `reviewedAt` (opcional)
- `createdAt`
- `updatedAt`

---

## Plugin 2: Mercado Pago

### Variables de entorno esperadas
- `MP_ACCESS_TOKEN`
- `MP_PUBLIC_KEY`
- `MP_WEBHOOK_SECRET` (o estrategia de firma equivalente)
- `MP_SUCCESS_URL`
- `MP_FAILURE_URL`
- `MP_PENDING_URL`
- `MP_CHECKOUT_MODE` (`payment` o `subscription`)
- `MP_SUBSCRIPTION_REASON` (opcional para preapproval/subscriptions)

### Reglas clave
- Validar credenciales al iniciar (`validateConfig`).
- En webhook, usar idempotencia por `external_reference`/`payment_id`.
- Confirmar monto, moneda y `teamId` antes de activar plan.

### Webhooks por tenant

- Plataforma: `/api/stripe/webhook` y `/api/mercadopago/webhook` (compatibilidad).
- Reseller: `/api/payments/webhook/{provider}/{resellerSlug}`.
- Cada webhook valida con el secreto del tenant indicado y registra `reseller_id` para
  idempotencia y auditoría. Nunca existe fallback a credenciales de la plataforma.

Las credenciales guardadas desde los paneles se cifran con
`PAYMENT_CONFIG_ENCRYPTION_KEY` y nunca se devuelven completas al navegador.

### Activación de resellers y dominios

Un reseller no queda listo para vender solo por existir en la base. El admin debe
completar el checklist de `/admin/resellers`: dominio verificado, al menos un plan
publicado, proveedor propio habilitado, saldo/crédito y autorización de cobros.

La activación del dominio comprueba DNS y una respuesta HTTPS firmada por esta
instalación. Antes de pulsar **Verificar y activar**:

1. Apunta los registros A/AAAA del dominio al mismo ingress que `BASE_URL`.
2. Añade el host a la regla Traefik y recrea el contenedor; un restart no relee labels.
3. Asegura TLS válido para el dominio.

Si la resolución pública de `BASE_URL` no representa las IP reales del ingress,
decláralas explícitamente, separadas por coma:

```env
RESELLER_INGRESS_IPS=203.0.113.10,2001:db8::10
```

Desactivar un dominio o fallar su revalidación deshabilita también los cobros del
reseller para evitar checkouts con URLs de retorno inválidas.

---

## Estructura sugerida de carpetas

```txt
lib/
  payments/
    plugin-types.ts
    plugin-registry.ts
    plugin-runtime.ts
    plugins/
      manual/
        index.ts
      stripe/
        index.ts
      mercadopago/
        index.ts
```

> Nota: mientras se migra, se puede mantener `lib/payments/stripe.ts` y adaptarlo internamente al contrato del plugin.

---

## Módulos del sistema y alcance funcional

### Dashboard
- **Dashboard / Inbox**: operación diaria de conversaciones.
- **Contacts**: CRM, segmentación, ownership y datos personalizados.
- **Campaigns**: difusión y seguimiento de campañas salientes.
- **Automation**: flujos automatizados conectados a eventos.
- **Analytics**: reporting operativo/comercial.
- **Templates**: gestión de plantillas reutilizables.
- **Pricing**: selección de plan y checkout.
- **Settings**: membresía, seguridad, conectividad, AI y configuración del equipo.

### Admin
- **Admin Overview**: KPIs globales.
- **Users**: administración de usuarios.
- **Teams**: administración de equipos.
- **Plans**: configuración de planes y límites.
- **Payments**: revisión y operación administrativa de pagos.
- **Branding / Chat Theme**: customización global del producto y experiencia visual.

### APIs internas principales
- `app/api/chats/*`: operaciones de inbox/chat.
- `app/api/messages/*`: envío y actualización de mensajes.
- `app/api/contacts/*`: CRUD, notas, tags, asignaciones e importación.
- `app/api/campaigns/*`: creación, listado, envío y procesamiento de campañas.
- `app/api/automation/*`: soporte para automatizaciones.
- `app/api/templates/*`: listado, creación y sincronización de templates.
- `app/api/instance/*`: alta, conexión, QR, sync y logout de instancias.
- `app/api/stripe/*`: checkout y webhook actuales.
- `app/api/webhook/evolution`: recepción de eventos externos.
- `app/api/v1/send`: API autenticada para integraciones.
- `app/api/readonly/v1/*`: lectura paginada y aislada de datos centrales y plugins.

---

## Modelo de datos funcional (resumen)

El schema actual ya cubre la mayor parte del sistema operativo:

- **Core SaaS**: `users`, `teams`, `team_members`, `plans`, `activity_logs`, `invitations`.
- **Inbox**: `chats`, `messages`, `message_reactions`, `evolution_instances`.
- **CRM**: `contacts`, `tags`, `contact_tags`, `funnel_stages`, `departments`, `department_members`, `custom_fields`.
- **Marketing**: `waba_templates`, `campaigns`, `campaign_leads`.
- **Automation / AI**: `automations`, `automation_sessions`, `ai_configs`, `ai_sessions`, `ai_tools`.
- **Extensibilidad / integraciones**: `api_keys`, `webhook_events`.
- **Branding y experiencia**: `branding`, `chat_theme`.
- **Pagos**: `payment_provider_settings`, `manual_payments`.

Esto permite que la documentación no se limite a pagos: el producto ya funciona como una base SaaS completa para operación de WhatsApp, CRM y automatización.

---

## Capacidades destacadas para producto y negocio

- **Multi-tenant por equipos**: el aislamiento funcional gira alrededor de `teamId`.
- **Feature gating por plan**: módulos como campañas, templates o flow builder pueden habilitarse por plan.
- **Compatibilidad multilenguaje**: español, inglés y portugués.
- **Auditoría operativa**: actividad reciente y eventos webhook persistidos.
- **Preparado para integraciones**: API propia, webhooks, instancias externas y runtime de plugins en evolución.

---

## Setup local

```bash
pnpm install
pnpm db:setup
pnpm db:migrate
pnpm db:seed
pnpm dev
```

## Post-deploy obligatorio

Antes de levantar la app en producción con `next start`, es **obligatorio** ejecutar migraciones:

```bash
pnpm db:migrate
```

Si se omite este paso, pueden fallar lecturas de configuración de pagos (por ejemplo, tabla `payment_provider_settings` inexistente).

Las instalaciones históricas cuyo journal quedó congelado antes de las migraciones
de resellers deben hacer backup y ejecutar primero la reconciliación idempotente:

```bash
pnpm db:reconcile-resellers
pnpm verify:resellers
```

No ejecutes `pnpm db:migrate` a ciegas si `drizzle.__drizzle_migrations` está por
detrás del esquema real; reconcilia el journal completo antes de reactivar el flujo
normal de Drizzle.

### Migración CRM pendiente (requerida)

Hay una migración obligatoria para CRM que agrega `contacts.custom_data` (`jsonb`, default `{}`):

- Archivo: `lib/db/migrations/0008_contacts_custom_data.sql`
- SQL: `ALTER TABLE contacts ADD COLUMN custom_data jsonb DEFAULT '{}'::jsonb`

Asegúrate de ejecutar `pnpm db:migrate` antes de iniciar la app para evitar desajustes entre el schema de Drizzle y la base de datos en producción.

## Checklist de despliegue

```txt
1) git pull
2) pnpm install
3) pnpm build
4) pnpm db:migrate
5) restart del proceso (next start / PM2 / systemd)
```

## Integración AAPP SPACE (GoBiz)

El plugin `aapp-space` sincroniza clientes, planes, membresías, tiendas y transacciones de GoBiz. La API key `gbz_...` se configura por equipo desde **Apps → AAPP SPACE** y no se expone nuevamente al navegador.

Variables:

```env
AAPP_SPACE_API_URL=https://aapp.space/api/gobiz/v1
CRON_SECRET=un-secreto-seguro
APP_URL=https://whatspro.uno
```

El endpoint `GET /api/cron/aapp-sync` requiere `Authorization: Bearer $CRON_SECRET`. Para programarlo cada seis horas con PM2:

```bash
pm2 start scripts/aapp-sync.js --name aapp-sync --cron-restart "0 */6 * * *" --no-autorestart
pm2 save
```

La sincronización es de solo lectura hacia GoBiz. Los registros locales usan identificadores externos únicos por equipo para que las ejecuciones sean idempotentes. La vista anterior de Clientes, derivada de ventas y notas internas de chat, no se migra automáticamente a la entidad `team_customers`.

Usuario semilla:
- `test@test.com`
- `admin123`

---

## Fichas de audio y banco de keys de Gemini

Cada nota de voz entrante de WhatsApp se **transcribe** y después se **analiza** (resumen, intención, urgencia, ánimo, montos y fechas, qué hacer), una sola vez, y queda en `message_audio_insights`. Son dos llamadas por audio: la segunda va sobre el texto ya transcripto, no sobre el audio otra vez. `AUDIO_INSIGHTS_ANALYZE=false` deja el análisis a pedido.

Existe porque ningún modelo de Claude recibe audio y los conectores de ChatGPT tampoco: el bloque MCP `type: "audio"` de `whatspro_chat_media_get` sólo lo aprovecha Gemini. El que escucha es el servidor, y lo que viaja a cualquier IA es texto.

### Banco de API keys (app Gemini)

Las llamadas salen de un **banco de API keys** propio (`team_gemini_keys`), **independiente de Ajustes → Agente IA**, que sigue siendo la configuración del chat. Se administra en la app **Gemini** (`/plugins/gemini`), activada por equipo.

- El free tier de `gemini-3.6-flash` da **20 requests por día** por cuenta y por modelo (quota `GenerateRequestsPerDayPerProjectPerModel-FreeTier`, verificado contra la respuesta de Google). Es el límite real, y es bajo: **una key = 20 audios por día**. Varias keys multiplican el techo sin pagar.
- La key se elige **al azar** entre las que tengan cuota libre. Un orden fijo concentraría el gasto en la primera de la lista.
- Falle por lo que falle —cuota agotada, `503` por saturación, key inválida, red— **se prueba la siguiente key del banco**. Si ninguna puede, el audio vuelve a la cola **sin gastar un intento** y queda disponible para que lo tome un conector.
- Las keys se guardan cifradas (AES-256-GCM) y nunca vuelven al navegador: sólo los últimos cuatro caracteres.

**Las barras de progreso son una estimación local.** Google no expone cuánta cuota gratuita queda —no hay endpoint—, así que se cuentan las llamadas que hacemos desde acá. Si la misma key se usa en otro lado, el consumo real es mayor que el que muestra la barra. Los límites (`limitRpm`, `limitRpd`) son editables por key porque Google los cambia sin aviso.

### La cola

Encolar no consume cuota; procesar sí. El worker drena de a poco respetando el límite por minuto y por día.

| Herramienta MCP | Para qué |
|---|---|
| `whatspro_audio_queue_add` | Encola audios sin gastar. Es el camino para "transcribí todo lo de este cliente". |
| `whatspro_audio_queue_status` | Cuántos esperan y cuánta cuota le queda hoy al banco. |
| `whatspro_transcribe_media` | Transcribe **ahora** un audio puntual. |
| `whatspro_audio_analyze` | Rehace el análisis de un audio ya transcripto (normalmente ya viene hecho). |
| `whatspro_audio_queue_takeover` | Los audios que el banco no pudo, con enlace de descarga para que los tome el conector. |
| `whatspro_audio_insight_write` | El conector guarda lo que **él** entendió del audio, sin tocar el banco. |
| `whatspro_pending_audios` | Qué quedó sin escuchar. |

**El plan B, en orden:** la cola manda el audio a transcribir → si una key falla, prueba la siguiente → si ninguna puede, el audio queda listado en `whatspro_audio_queue_takeover` con un enlace de descarga temporal, para que un conector que sí escuche audio lo baje, lo transcriba con su propia cuota y devuelva el resultado con `whatspro_audio_insight_write`.

`whatspro_audio_insight_write` cierra el círculo: un modelo que sí escucha audio (o una persona corrigiendo una transcripción mala) puede bajar el archivo con `whatspro_chat_media_get` / `whatspro_chat_media_link`, entenderlo con su propia cuota y guardar el resultado. Queda registrado como `external:<fuente>` para saber que no salió del banco, y no pisa una transcripción existente sin `overwrite: true`.

La ficha aparece sola en `whatspro_chat_media_list` (campos `transcript`, `summary`, `intent`, `urgency`, `sentiment`), en `whatspro_chat_media_get` y como recurso `audio-insights` de la API de sólo lectura — que es también la vía para que Radar mida sobre el contenido de los audios.

### Cron

```bash
pm2 start scripts/audio-insights.js --name audio-insights --cron-restart "*/10 * * * *" --no-autorestart
pm2 save
```

Encola los audios entrantes nuevos y drena la cola. No se cuelga del webhook de Evolution a propósito: la llamada al proveedor tarda segundos y demoraría el ACK en cada audio que entra.

Variables (todas opcionales, con los valores por defecto puestos):

```env
AUDIO_INSIGHTS_TEAM_IDS=             # equipos habilitados, separados por coma. Vacío = todos
AUDIO_INSIGHTS_ENABLED=true          # "false" apaga el cron sin desregistrarlo
AUDIO_INSIGHTS_ANALYZE=true          # "false" deja el análisis a pedido
AUDIO_INSIGHTS_BATCH=10              # audios por corrida
AUDIO_INSIGHTS_MIN_SECONDS=3         # los más cortos son "dale" y "ok": no se procesan
AUDIO_INSIGHTS_MAX_SECONDS=600
AUDIO_INSIGHTS_MAX_AGE_DAYS=30       # el histórico viejo va por backfill, no arrastrándolo
AUDIO_INSIGHTS_MAX_ATTEMPTS=3
```

Sólo se procesan los audios **entrantes**: los que mandamos nosotros ya sabemos qué dicen y son el 65% del volumen. `AUDIO_INSIGHTS_TEAM_IDS` acota el gasto: un equipo fuera de la lista no procesa ni por cron ni a pedido desde el conector. Hoy en producción está en `2` (noelia@whatspro.uno).

Backfill del histórico, a mano y por tandas:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/audio-insights?limit=100"
```

---

## Roadmap corto recomendado

1. **Fase 1**: introducir interfaz + registry + feature flags sin romper Stripe.
2. **Fase 2**: mover Stripe a plugin `stripe`.
3. **Fase 3**: implementar plugin `manual` con UI admin de aprobación.
4. **Fase 4**: implementar plugin `mercadopago` + webhook robusto.
5. **Fase 5**: métricas/auditoría de pagos y pruebas E2E por proveedor.

---

## Documentación adicional

- Guía de trabajo para agentes: `AGENTS.md`
- Skills internas para implementar plugins:
  - `skills/plugin-architecture/SKILL.md`
  - `skills/manual-payment/SKILL.md`
  - `skills/mercadopago/SKILL.md`
