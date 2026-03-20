# AGENTS.md - Guía de contribución para WhatSaaS

Este archivo define cómo trabajar en este repositorio sin romper el core.

## Meta del proyecto
Migrar a un modelo de **plugins**, iniciando por pagos, para agregar funciones nuevas sin editar el núcleo funcional.

## Estado actual (resumen técnico)
- El flujo de pagos está centrado en Stripe.
- Existen acciones y rutas acopladas a Stripe en `lib/payments` y `app/api/stripe`.
- El siguiente hito es desacoplar proveedores de pago vía un contrato único.

## Reglas de desarrollo

1. **No tocar el core para agregar proveedores**
   - Si se agrega una integración de pago nueva, debe vivir como plugin.
   - El core solo puede leer interfaz común + configuración.

2. **Contrato único de plugins**
   - Toda integración de pagos debe implementar el contrato definido en `lib/payments/plugin-types.ts`.
   - Prohibido llamar SDK de proveedor directamente desde páginas del dashboard.

3. **Registry obligatorio**
   - Todo plugin se registra en `lib/payments/plugins/index.ts`.
   - Selección del plugin activo por `PAYMENT_PROVIDER`.

4. **Eventos y auditoría**
   - Cualquier cambio de estado de pago debe registrar evento auditable.
   - Nunca activar suscripción sin validación (admin/manual o webhook firmado).

5. **Compatibilidad incremental**
   - Evitar migraciones destructivas.
   - Priorizar cambios backward-compatible mientras Stripe se migra al modelo plugin.

## Objetivo funcional inmediato

### A. Plugin Manual Payment
- Crear orden de pago manual.
- Adjuntar comprobante/referencia.
- Estado `pending_manual_review`.
- UI para aprobar/rechazar en admin.
- Activar plan al aprobar.

### B. Plugin Mercado Pago
- Alta de credenciales por `.env`.
- Checkout con referencia de orden/team.
- Webhook con validación e idempotencia.
- Activar/cancelar plan según estado final del pago.

## Definición de terminado (DoD)

Un proveedor nuevo está completo cuando:
- Implementa contrato de plugin.
- Está registrado y puede habilitarse por env.
- Tiene validación de config.
- Tiene manejo de errores y logging.
- Documenta variables de entorno en README.

## Skills del repositorio
Para tareas guiadas usar:
- `skills/plugin-architecture/SKILL.md`
- `skills/manual-payment/SKILL.md`
- `skills/mercadopago/SKILL.md`

