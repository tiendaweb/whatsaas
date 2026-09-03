# Modelo comercial, planes, módulos y monetización

## Tres relaciones económicas separadas

### SaaS Maker vende al creador

La organización Maker contrata capacidad de construcción y operación. Los límites pueden incluir proyectos, ambientes, miembros, dominios, usuarios activos finales, storage, ejecuciones, emails, IA y soporte. Esta suscripción no debe modificar directamente los planes ofrecidos dentro de cada SaaS.

### El creador vende su SaaS al cliente final

Cada proyecto define su propio catálogo, moneda, periodicidad y proveedor de pagos. Puede ofrecer pago único, mensual, anual, trial y plan gratuito. SaaS Maker aprovisiona capacidades según eventos confirmados, pero el creador es responsable de su oferta, términos e impuestos salvo un acuerdo de merchant of record futuro.

### Módulos se venden o suscriben

Un módulo puede ser incluido por plan, comprado una vez, suscrito por mes, suscrito por año o concedido manualmente. El precio puede pertenecer al creador del SaaS o a un proveedor del marketplace. Deben existir reglas explícitas de revenue share, reembolsos y acceso al expirar.

## Modelo de oferta

`Product` representa lo comercializable. `Price` representa moneda, importe, modalidad y vigencia. `Plan` agrupa uno o más prices y un conjunto base de entitlements. `ModuleOffer` define cómo un módulo se obtiene dentro de un proyecto. Nunca guardar solo `planName` o `priceId` externo como fuente de verdad.

Modalidades:

- `free`: sin checkout, con límites;
- `trial`: acceso temporal con o sin método de pago;
- `one_time`: entitlement perpetuo o por plazo definido;
- `recurring_monthly`;
- `recurring_yearly`;
- `included`: incluido en un plan base;
- `manual_grant`: concesión auditada con vencimiento opcional.

## Estados canónicos

Checkout: draft, open, completed, expired, canceled.

Suscripción: trialing, active, past_due, paused, canceled, expired, incomplete.

Pago: pending, requires_action, paid, failed, refunded, partially_refunded, disputed, canceled.

Entitlement: scheduled, active, grace, suspended, expired, revoked.

Instalación de módulo: requested, validating, installing, active, update_available, suspended, uninstalling, removed, failed.

## Reglas de aprovisionamiento

1. El retorno del checkout no concede acceso.
2. Un webhook firmado se normaliza y se deduplica por proveedor/cuenta/evento.
3. La transición comercial se guarda en transacción con auditoría y outbox.
4. Un consumer materializa entitlements con clave idempotente.
5. El runtime evalúa entitlement y límites; nunca consulta al proveedor en cada request.
6. Past due puede entrar en gracia configurable; no borrar datos.
7. Downgrade conserva datos inaccesibles durante la retención definida.
8. Reembolso, disputa y cancelación aplican políticas explícitas por producto.

## Catálogo de módulos

Cada versión declara identidad, proveedor, compatibilidad de runtime, dependencias, permisos, entidades, migraciones, UI, workflows, webhooks, secretos requeridos, límites, eventos, política de desinstalación y checksum. El instalador ejecuta plan, validación, migración, activación y bootstrap; si falla, revierte o deja estado reparable.

Categorías iniciales sugeridas: CRM, agenda, tareas, documentos, facturación, soporte, formularios, analytics, email, notificaciones, membresías, inventario, integraciones e IA.

## Administración comercial

El creador debe poder:

- crear y archivar productos/precios sin reescribir historia;
- versionar beneficios y límites;
- decidir prorrateo y fecha efectiva de cambios;
- simular factura antes de upgrade/downgrade;
- conceder créditos, cupones y acceso manual con motivo;
- exportar ledger y reconciliar proveedor;
- revisar MRR, ARR, churn, LTV, fallos de pago y uso por plan;
- configurar portal de cliente y políticas de cancelación.

## Preguntas de negocio que deben cerrarse

- ¿SaaS Maker cobra comisión sobre ventas finales o solo suscripción de plataforma?
- ¿Quién emite factura e impuestos en cada país?
- ¿Quién soporta reembolsos y disputas de módulos de terceros?
- ¿Un pago único es perpetuo para una versión mayor o para todas?
- ¿Qué ocurre con datos al desinstalar, cancelar o vencer?
- ¿Se permiten precios distintos por tenant, región o canal?
- ¿Qué límites son hard, soft o facturados por sobreuso?

