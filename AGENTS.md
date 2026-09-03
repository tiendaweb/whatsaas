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

## Despliegue y reinicio en whatspro.uno

- El dominio publico `whatspro.uno` se sirve desde el contenedor Docker `whatsaas-app`, montando este repo en `/app` desde `/root/whatsaas`.
- Despues de cambios de frontend o build de Next, ejecutar `pnpm build` y reiniciar `whatsaas-app` para que el dominio publico tome el bundle actualizado.
- El contenedor también publica `127.0.0.1:3000` para verificaciones y cron locales. No se debe ejecutar una segunda instancia de la aplicación con PM2.
- `pnpm build` genera un artefacto aislado en `.next-build`; nunca reemplaza el `.next` servido.
- Para construir, intercambiar el bundle de forma atómica, reiniciar el contenedor y verificar rutas usar `pnpm run deploy:saasfy`.
- No reiniciar `whatsaas-app` si `.next/BUILD_ID` no existe.
- Verificar despues del reinicio con `curl -I https://whatspro.uno/es` y confirmar respuesta 200 o redireccion esperada.

## Skills del repositorio

### Creación de features y componentes
Para tareas guiadas usar:
- `/new-feature` — Crear una nueva pantalla, sección o página completa
- `/new-modal` — Crear modales y diálogos respetando el estilo visual
- `/new-component` — Crear componentes UI reutilizables
- `/add-i18n` — Agregar textos en español, inglés y portugués
- `/style-check` — Verificar consistencia visual antes de merge

### Integración de datos
- `/new-api-route` — Crear rutas API con autenticación correcta
- `/new-db-schema` — Agregar tablas o columnas a la base de datos

### Arquitectura de pagos
- `skills/plugin-architecture/SKILL.md` — Arquitectura de plugins para pagos
- `skills/manual-payment/SKILL.md` — Plugin de pagos manual
- `skills/mercadopago/SKILL.md` — Plugin de Mercado Pago

### Diseño visual
- `skills/whatspro-style-designer/SKILL.md` — Diseñar/auditar landings, dashboards, CRM, inbox y flow builders con el lenguaje visual tipo WhatsPro (tokens, tipografía, patrones por pantalla); no reutilizar marca ni copy propietario
