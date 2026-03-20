# Skill: Mercado Pago Plugin

## Cuándo usar esta skill
Cuando se requiera integrar cobros online para LATAM con Mercado Pago.

## Objetivo
Implementar plugin `mercadopago` usando un contrato compatible con el runtime de pagos.

## Variables de entorno
- `MP_ACCESS_TOKEN`
- `MP_PUBLIC_KEY`
- `MP_WEBHOOK_SECRET`
- `MP_SUCCESS_URL`
- `MP_FAILURE_URL`
- `MP_PENDING_URL`

## Pasos mínimos
1. Implementar `validateConfig()` para asegurar keys requeridas.
2. Implementar creación de preferencia/checkout con `external_reference`.
3. Implementar webhook y verificación de firma.
4. Validar monto, moneda y orden/team.
5. Actualizar estado de pago y plan del team.

## Reglas de robustez
- Idempotencia por `payment_id` y evento recibido.
- No confiar en datos del frontend para marcar pago aprobado.
- Loggear cada transición de estado.

