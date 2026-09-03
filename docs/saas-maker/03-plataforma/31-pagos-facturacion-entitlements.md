# Pagos, facturación, ledger y entitlements

## Arquitectura de pagos

Crear un gateway de proveedores con contrato único: createCheckout, customerPortal, cancel/change subscription, validateConfig, handleWebhook, normalizeEvent y health. Adaptadores iniciales recomendados: Stripe y Mercado Pago; manual solo para operación asistida. Las credenciales pertenecen al proyecto/ambiente y se guardan cifradas o en secret manager.

## Contextos de billing

Todo objeto financiero incluye `billingContext`:

- `maker_platform`: SaaS Maker cobra a organización Maker;
- `project_customer`: proyecto cobra a cliente final;
- `module_marketplace`: compra de módulo y eventual liquidación.

Las cuentas de proveedor, customers, prices y webhooks se resuelven dentro de ese contexto. Está prohibido buscar un customer externo globalmente por email.

## Entidades mínimas

- billing_accounts y provider_connections;
- products, prices y price_versions;
- plans y plan_capabilities;
- customers y billing_profiles;
- checkouts;
- subscriptions y subscription_items;
- invoices, invoice_lines y payments;
- refunds, disputes y credits;
- coupons/promotions;
- entitlements, grants y usage_counters;
- module_offers y module_purchases;
- provider_events e idempotency_keys;
- ledger_entries y reconciliation_runs.

## Reglas de precios

Un price publicado es inmutable. Cambiar monto crea versión nueva; las suscripciones existentes conservan price hasta una migración explícita. Guardar importe en minor units, moneda ISO, tax behavior, interval, interval count, trial y provider aliases. El frontend nunca calcula el monto final como autoridad.

## Webhooks

Pipeline:

1. recibir bytes originales;
2. resolver cuenta y proveedor sin confiar en payload no firmado;
3. verificar firma y tolerancia temporal;
4. deduplicar eventId;
5. persistir inbox redacted/encrypted según política;
6. normalizar evento;
7. validar transición y referencias;
8. mutar billing + outbox en transacción;
9. responder rápido;
10. procesar entitlements y notificaciones en worker.

Eventos fuera de orden se comparan por versión/fecha del proveedor y estado canónico. Reintentos no duplican factura, grant ni email.

## Materialización de acceso

Un entitlement declara tenant, capability, sourceType/sourceId, quantity/limit, startsAt, endsAt, state y policy version. Puede provenir de plan, módulo, compra única, trial, crédito o grant. La capacidad efectiva se calcula desde entitlements activos y módulos instalados, con cache invalidable por evento.

## Upgrade, downgrade y cancelación

- mostrar preview de importe, prorrateo y fecha efectiva;
- usar idempotency key por intento;
- upgrade puede ser inmediato tras confirmación;
- downgrade suele aplicarse al cierre de período;
- cancel at period end conserva acceso hasta `endsAt`;
- past_due aplica grace configurable y comunicación escalonada;
- suspensión no borra datos ni desinstala módulos;
- reactivación recompone entitlements idempotentemente.

## Pago único de módulos

Definir si concede uso perpetuo, una versión mayor, soporte temporal o acceso mientras el proyecto siga activo. Guardar licencia/grant separado de instalación. Desinstalar no elimina la compra. Reinstalar debe comprobar compatibilidad y política de datos.

## Reconciliación

Job periódico compara suscripciones, invoices y pagos locales con el proveedor; crea diferencias sin autocorregir estados sensibles. El panel muestra pendientes, fallos, disputas, webhooks en DLQ y ledger por contexto. Toda corrección manual exige motivo, actor y before/after.

## Portal de facturación del cliente final

Debe permitir ver plan, módulos, próximas fechas, facturas, método de pago, uso, upgrade/downgrade y cancelación según política. Nunca revelar IDs/secretos del proveedor. Si se usa portal hospedado, validar return URL allowlisted y tenant actual.

## Pruebas críticas

- evento duplicado, tardío, inválido y de otra cuenta;
- doble click de checkout;
- moneda/importe alterado;
- cambio de plan concurrente;
- refund parcial/total y disputa;
- trial con y sin método de pago;
- pago único más suscripción del mismo módulo;
- grace y recuperación;
- cancelación mientras corre aprovisionamiento;
- reconciliación sin efectos dobles.

