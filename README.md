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
- Base para exponer más capacidades de integración hacia terceros.

### 12. IA y extensibilidad
- Configuración AI persistida en base de datos.
- Sesiones y herramientas AI modeladas en schema.
- Plugin local `ai-chat` ya presente en `lib/plugins`.
- Arquitectura en transición hacia mayor extensibilidad por plugins, empezando por pagos.

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
4. Admin aprueba/rechaza.
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

Usuario semilla:
- `test@test.com`
- `admin123`

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
