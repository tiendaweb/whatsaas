# Skill: Manual Payment Plugin

## Cuándo usar esta skill
Cuando se quiera habilitar cobros sin pasarela automática (transferencia, depósito, etc.).

## Objetivo
Implementar un plugin `manual` que permita cobrar con revisión administrativa.

## Flujo mínimo
1. Crear solicitud de pago manual para team/plan.
2. Guardar comprobante/referencia.
3. Marcar como `pending_manual_review`.
4. Panel admin aprueba o rechaza.
5. Si aprueba, activar plan del team.

## Datos sugeridos
Tabla `manual_payments` con:
- `teamId`, `planId`, `amount`, `currency`
- `proofUrl`, `reference`
- `status`, `reviewedBy`, `reviewedAt`
- timestamps

## Criterios de seguridad
- No activar plan automáticamente por input del usuario.
- Registrar usuario admin que aprobó.
- Evitar doble aprobación (idempotencia por status).

