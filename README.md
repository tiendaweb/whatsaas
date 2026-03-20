# WhatsPro (Next.js + Drizzle)

Plataforma SaaS para gestión de conversaciones, campañas y automatizaciones con panel administrativo, roles, planes y facturación.

## Estado actual del proyecto

### Ya implementado
- **Autenticación y sesiones** (login, signup, recuperación de contraseña)
- **Dashboard multi-módulo** (contactos, campañas, analítica, automatización, configuración)
- **Panel admin** (usuarios, equipos, planes, branding, chat theme)
- **Integración de pagos Stripe** (checkout, portal de cliente, webhooks)
- **Persistencia en Postgres** con Drizzle ORM y migraciones SQL
- **Internacionalización** (`messages/es.json`, `messages/en.json`, `messages/pt.json`)

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

## Setup local

```bash
pnpm install
pnpm db:setup
pnpm db:migrate
pnpm db:seed
pnpm dev
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
