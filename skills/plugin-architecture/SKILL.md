# Skill: Plugin Architecture (Payments)

## Cuándo usar esta skill
Cuando se necesite agregar un proveedor de pago nuevo o desacoplar lógica de proveedor del core.

## Objetivo
Implementar una arquitectura de plugins en pagos para evitar cambios en el core ante nuevas integraciones.

## Checklist
1. Crear contrato en `lib/payments/plugin-types.ts`.
2. Crear runtime/registry en `lib/payments/plugin-registry.ts` o `lib/payments/plugins/index.ts`.
3. Mover integración existente (Stripe) detrás del contrato.
4. Ajustar acciones del dashboard para consumir solo interfaz común.
5. Definir provider activo por `PAYMENT_PROVIDER`.
6. Documentar variables y flujos en README.

## Convenciones
- IDs de provider en minúsculas: `manual`, `stripe`, `mercadopago`.
- Cada plugin en su propia carpeta.
- No importar SDK externos fuera del plugin.

## Validaciones mínimas
- `validateConfig()` obligatorio.
- Manejo de errores consistente.
- Logging de eventos de pago.

