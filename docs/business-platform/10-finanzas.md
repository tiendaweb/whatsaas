# Finanzas — auditoría y diseño de expansión empresarial

## 1. Decisión ejecutiva

WhatsPro **ya tiene un plugin `finance` funcional**. La expansión no debe crear un segundo módulo financiero ni sustituir `team_financial_entries`. Debe evolucionar el plugin existente separando dos conceptos que hoy están combinados:

- **documento u obligación económica**: ingreso/egreso esperado, cuenta por cobrar o pagar (`team_financial_entries`);
- **movimiento efectivo de dinero**: entrada, salida, transferencia o ajuste sobre una cuenta financiera (nuevo libro operativo de movimientos).

Esta separación permite cuentas, caja, pagos parciales, transferencias y conciliación sin convertir WhatsPro en un sistema de contabilidad fiscal.

Orden aplicado: **reutilizar → extender → relacionar → especializar → crear solamente lo ausente**.

### Alcance

- ingresos por ventas, membresías, proyectos, servicios y otros conceptos;
- egresos por publicidad, infraestructura, dominios, herramientas, proveedores y operación;
- cuentas de efectivo, bancos, pasarelas, billeteras y cuentas personalizadas;
- movimientos de ingreso, egreso, transferencia y ajuste;
- cuentas por cobrar y pagar, incluidos pagos parciales;
- gastos e ingresos recurrentes;
- centros de costo y dimensiones empresariales;
- rentabilidad por cliente, servicio, proyecto, campaña y vendedor;
- aportes de socios, aportes en especie, reserva, reinversión y distribución de resultados;
- evidencia, auditoría, eventos e interacción mediante herramientas IA semánticas.

### Fuera de alcance explícito

- facturación fiscal o electrónica;
- cálculo, liquidación o presentación de impuestos;
- ARCA, Marangatu, SIFEN y organismos equivalentes;
- libros contables reglamentarios, plan de cuentas contable, asientos de partida doble o estados certificados;
- reemplazar Stripe, Mercado Pago o el plugin de pagos manual del core;
- custodiar dinero o iniciar transferencias bancarias en la primera fase.

La categoría histórica `taxes` presente en la UI financiera se conserva solamente por compatibilidad. No se le agregará lógica fiscal ni se promoverá como un flujo fiscal nuevo.

## 2. Evidencia del repositorio real

### 2.1 Plugin financiero existente

| Evidencia | Situación confirmada | Consecuencia de diseño |
|---|---|---|
| `lib/plugins/finance/manifest.ts` | Plugin `finance`, `activationMode: 'user'`, ruta `/plugins/finance`, permisos `finance.read` y moneda predeterminada `ARS`. | Extender este manifest y esta ruta; no registrar otro plugin Finanzas. |
| `lib/plugins/core/registry.ts` | `finance` ya está en el registry dinámico. | Mantener el ID estable para no romper activaciones por usuario. |
| `lib/plugins/core/page-registry.tsx` | La página carga `FinanceDashboard` dinámicamente. | Añadir subrutas/renderers dentro del mismo plugin si se necesitan pantallas especializadas. |
| `lib/db/schema.ts` y `lib/db/migrations/0066_finance.sql` | Existen `team_financial_entries` y `team_financial_receipts`; todos los importes de entries están en unidad mínima. | Son la base de obligaciones y comprobantes. La migración empresarial debe ser aditiva. |
| `lib/plugins/finance/server/schema.ts` | Valida ingreso/egreso, estado, recurrencia y pertenencia al team de cliente, empresa, plan y suscripción. | Reutilizar validación y resolución de relaciones; extraer servicios de dominio en vez de duplicarla en rutas. |
| `lib/plugins/finance/server/access.ts` | Verifica permiso y que el plugin esté activo para el usuario. | Reutilizar como guard único para todas las nuevas rutas. |
| `app/api/plugins/finance/entries/*` | Alta, cambio de estado y borrado de entries con filtro por `teamId`. | Conservar contrato durante transición; sustituir borrado de registros liquidados por anulación/reversión auditable. |
| `app/api/plugins/finance/overview/route.ts` | Entrega hasta 1.000 entries, 500 comprobantes y opciones de relaciones. | Útil hoy, pero no escala para analítica empresarial; agregar endpoints agregados y paginados. |
| `app/api/plugins/finance/receipts/*` y `chat-media/route.ts` | Vincula imágenes/PDF reales de mensajes de WhatsApp con entries y evita duplicar el mismo `messageId` por team. | Reutilizar `team_financial_receipts`; ampliar fuentes sin duplicar binarios de Files/Documents. |
| `app/api/plugins/finance/sync-aapp/route.ts` | Importa transacciones AAPP `SUCCESS`/`PENDING` de forma idempotente mediante `(teamId, externalSource, externalId)`. | Convertirlo en adaptador de integración; preservar la clave de idempotencia. |
| `lib/plugins/finance/ui/FinanceDashboard.tsx` | Ya ofrece resumen, ingresos, egresos, recurrentes, comprobantes, moneda, búsqueda, alta y cambio a pagado. | Rediseñar/expandir progresivamente la UI existente, no crear otra aplicación paralela. |

Limitaciones confirmadas del plugin actual:

- `team_financial_entries` no identifica una cuenta financiera;
- solamente admite `income | expense`, no transferencias ni ajustes;
- un estado `paid` no registra de qué cuenta salió o entró el dinero;
- no hay asignaciones de pagos ni estado `partial`;
- `recurrence` y `nextDueOn` son metadatos: no se encontró un job que materialice la siguiente obligación;
- no hay cuenta corriente por contraparte, centros de costo, tipo de cambio ni rentabilidad;
- el endpoint de resumen trae filas y calcula métricas en el cliente;
- el dashboard inicializa `ARS` directamente y no consume de forma visible el `defaultCurrency` del manifest;
- la auditoría financiera usa `activity_logs`, pero guarda tipo/estado/ID en `ipAddress`, que no es metadata estructurada;
- no se encontraron pruebas específicas de Finanzas en `tests/`.

### 2.2 Fuentes económicas reutilizables

#### Ventas y artículos

- `team_sales` contiene `contactId`, número, estado (`draft`, `confirmed`, `paid`, `cancelled`, `refunded`), moneda, items con `articleId`, totales, vencimiento y fecha de pago (`lib/db/schema.ts`, `app/api/plugins/sales/*`).
- `team_articles`, tipos, variantes y planes ya distinguen productos, servicios y membresías; no se debe crear un catálogo financiero paralelo.
- Una venta todavía no tiene `customerId` ni `sellerUserId` directos. El cliente puede inferirse a través de `contactId → team_customer_contacts`, pero esa inferencia puede ser ambigua. La rentabilidad por vendedor tampoco es confiable con `createdBy` como sustituto.
- Las rutas de ventas no emiten eventos de dominio ni escriben auditoría estructurada.

Decisión: `team_sales` seguirá siendo la fuente comercial. Finanzas creará/actualizará su obligación relacionada de forma idempotente y nunca copiará los items como otro catálogo.

#### Clientes y transacciones externas

- `team_customers` es la entidad de cliente compartida y está aislada por `teamId`.
- `team_customer_contacts` vincula clientes con contactos reales del CRM/WhatsApp.
- `team_customer_transactions` guarda transacciones AAPP externas, gateway, fecha, moneda, estado y payload original.
- El detalle de cliente ya reúne contactos, membresías, transacciones, tareas y adjuntos (`app/api/plugins/customers/[id]/route.ts`).

Decisión: Finanzas debe relacionarse con `team_customers`, no crear `finance_customers`. `team_customer_transactions` queda como fuente de integración; el libro financiero guarda la consecuencia económica idempotente.

#### Membresías

- `team_membership_plans` define precio, setup, mantenimiento, moneda y periodicidad.
- `team_membership_subscriptions` ya relaciona plan, empresa, cliente/contacto, precio, estado de servicio, estado de pago, inicio y vencimiento.
- Existen reglas y cron de recordatorios, además de candidatos de renovación AAPP.

Decisión: no crear suscripciones financieras. Una suscripción genera obligaciones periódicas en Finanzas, pero su ciclo de servicio continúa bajo el plugin Memberships.

#### Pagos de la plataforma

- `lib/payments/plugin-types.ts` define el contrato único para Stripe, manual y Mercado Pago.
- `manual_payments`, `payment_webhook_events` y `payment_audit_events` gestionan el pago del plan de WhatsPro/plataforma o reseller.
- Los webhooks tienen idempotencia y normalización de estados; el pago manual requiere revisión y comprobante.

Decisión crítica: **estos pagos no son automáticamente las cobranzas operativas del cliente de WhatsPro**. Son otro bounded context. No deben copiarse indiscriminadamente a Finanzas porque el mismo pago es ingreso del vendedor de la plataforma y egreso del team comprador. Solamente un adaptador explícito, con tenant/rol económico inequívoco, puede convertir un evento de pagos en un movimiento financiero.

Los SDK y credenciales de Stripe/Mercado Pago deben permanecer dentro de `lib/payments/plugins/*`; el plugin Finance consume eventos canónicos, nunca SDKs de proveedores.

#### Meta Ads

- `meta_campaign_insights_daily` es la fuente diaria de inversión neta por campaña.
- `meta_ad_accounts.taxRate` permite calcular el costo final; `lib/ads/aggregate.ts` ya aplica esa transformación y evita promedios incorrectos.
- Meta guarda importes decimales en unidad mayor, mientras Finanzas usa enteros en unidad mínima.

Decisión: los insights siguen siendo la fuente canónica del costo devengado de publicidad. Los reportes financieros los consultan mediante un adaptador, evitando duplicar diariamente toda la serie. El pago real de una factura de Meta sí se registra como movimiento/egreso y puede conciliarse con ese costo. La alícuota existente se usa únicamente para costo final, no para implementar impuestos.

#### Proyectos y tareas

- `team_task_workspaces`, `team_task_projects`, columnas, items, relaciones, dependencias, medios y plantillas ya componen el gestor operativo.
- `team_task_projects` no tiene presupuesto, ingresos, costos ni horas.
- `team_task_relations` es una relación operativa genérica y ya admite customer/contact/project/task, pero pertenece al dominio Tasks.

Decisión: no crear proyectos financieros. Finanzas enlaza entries/centros de costo con `team_task_projects`; Operaciones seguirá siendo dueño del proyecto, hitos, horas y carga.

### 2.3 Permisos, auditoría y conectores

- `MemberPermissions`, presets, `ROUTE_PERMISSIONS` y `getPluginRequestContext` ya incluyen `financeRead`/`financeWrite`.
- Owner/admin eluden overrides; agentes necesitan permisos explícitos.
- `activity_logs` aporta auditoría general, pero solo tiene `action`, `timestamp` e `ipAddress`; no tiene entidad ni payload JSON. Además, su `userId` usa `ON DELETE CASCADE`, por lo que no ofrece todavía la retención exigible para un historial financiero durable.
- `payment_audit_events` es correcto para cambios de proveedor, no debe reutilizarse como auditoría financiera general.
- `lib/readonly-api/catalog.ts` expone ventas, clientes, transacciones, membresías, proyectos, Meta Ads y pagos, pero **no expone `team_financial_entries` ni `team_financial_receipts`**.
- Grok ya puede operar membresías, pero no se hallaron herramientas financieras semánticas.
- No se encontró un Event Bus/domain events general en la búsqueda del repositorio; sí hay webhooks idempotentes, cron, Pusher y logs. La infraestructura transversal debe coordinarse con el documento de Integración y Eventos.

## 3. Modelo conceptual propuesto

```text
Ventas / Membresías / AAPP / Meta Ads / Operaciones
                         │
                 adaptadores idempotentes
                         │
         ┌───────────────┴────────────────┐
         │ obligación / documento         │ costo devengado externo
         │ team_financial_entries         │ Meta insights / horas
         └───────────────┬────────────────┘
                         │ asignaciones parciales
             movimientos efectivos de dinero
                         │
               cuentas financieras / caja
                         │
       flujo de caja · CxC/CxP · rentabilidad · IA
```

Reglas de dominio:

1. Una entry describe cuánto se debe cobrar/pagar y por qué.
2. Un movimiento posteado describe dónde entró/salió el dinero.
3. Una asignación aplica total o parcialmente un movimiento a una entry.
4. Una transferencia mueve saldo entre cuentas y no genera ingreso/egreso ni rentabilidad.
5. Un ajuste modifica saldo con motivo obligatorio y autorización reforzada.
6. Los saldos se derivan de movimientos posteados; no se editan directamente.
7. Los movimientos posteados son inmutables: se corrigen mediante reversión.
8. Toda relación y consulta se acota por `teamId`, incluso después de validar un ID.
9. Toda ingesta externa exige clave de idempotencia `(teamId, source, externalId)`.
10. No se suman monedas distintas. Los reportes convierten con una tasa explícita o muestran totales separados.

## 4. Qué se reutiliza, extiende y crea

### Reutilizar sin duplicar

- plugin, manifest, guard, página, rutas y tablas actuales de Finanzas;
- `team_customers`, contactos y ficha de cliente;
- `team_sales` y catálogo de artículos/servicios;
- planes, suscripciones, estados y renovaciones de Memberships;
- transacciones AAPP e idempotencia externa;
- insights y agregadores de Meta Ads;
- proyectos de Tasks;
- adjuntos/comprobantes financieros y archivos existentes;
- registry, activación por usuario y permisos del sistema;
- contrato de proveedores de pago únicamente como fuente de eventos canónicos;
- `activity_logs`, condicionado a que el plan transversal lo amplíe con metadata estructurada.

### Extender

#### `team_financial_entries`

Mantener IDs y comportamiento actuales. Agregar de forma nullable/backward-compatible:

- `documentType`: `receivable | payable | income | expense` (backfill desde `type` y contexto);
- estado `partial`; `balance` se deriva de allocations, no se persiste como segunda fuente de verdad;
- `issuedOn` además de `occurredOn` y `dueOn`;
- `counterpartyId` hacia una contraparte financiera;
- `saleId`, `taskProjectId`, `articleId`, `departmentId` y `metaCampaignId`;
- `recurrenceRuleId` para instancias materializadas;
- `sourceEventId`/versión si el contrato de eventos transversal lo adopta;
- índice por `(teamId, documentType, status, dueOn)` e índices tenant-first para relaciones frecuentes.

`customerId`, `companyId`, `planId`, `subscriptionId`, `externalSource` y `externalId` existentes permanecen. `companyId` refiere hoy a `team_membership_companies`; no representa a la empresa dueña del team. La dimensión “empresa” del centro de costo es el propio `teamId`.

#### `team_sales`

- agregar `customerId` nullable para una relación no ambigua;
- agregar `sellerUserId` nullable para comisiones/rentabilidad por vendedor;
- backfill de `customerId` solamente cuando un contacto corresponda a un único cliente;
- mantener `contactId` para la persona de la operación;
- emitir eventos canónicos al confirmar, pagar, cancelar o reembolsar.

No es necesario copiar items de venta a Finanzas: `saleId` permite navegar al detalle y los artículos siguen siendo propiedad de Sales/Articles.

#### Auditoría compartida

Preferencia: endurecer y extender `activity_logs` transversalmente con `entityType`, `entityId`, `metadata`, `requestId` y `occurredAt`, preservando columnas actuales y cambiando la retención del actor a `ON DELETE SET NULL`. Si el plan maestro no aprueba esa ampliación común, crear una bitácora financiera específica solamente como fallback; no crear ambas.

### Tablas nuevas necesarias

Los nombres son propuestos; el número de migración debe asignarse durante integración para evitar colisiones con otros agentes.

#### `team_financial_accounts`

- `id`, `teamId`, `name`, `type`, `currency`, `status`, `description`;
- tipos: `cash`, `bank`, `mercadopago`, `stripe`, `paypal`, `wallet`, `clearing`, `custom`;
- `openingBalance` y `openingOn` únicamente como semilla auditada; el saldo posterior se deriva;
- `externalSource`, `externalId`, metadata no secreta;
- `createdBy`, `updatedBy`, timestamps;
- unique `(teamId, name)` y `(teamId, externalSource, externalId)` parcial.

Una cuenta de tipo Stripe/PayPal/Mercado Pago no implica una conexión ni autoriza pagos. Es una clasificación de saldo. Credenciales y sincronización pertenecen al connector/provider correspondiente.

#### `team_financial_movements`

Cabecera de operación:

- `type`: `income | expense | transfer | adjustment`;
- `status`: `draft | posted | void`;
- `occurredAt`, `description`, `reference`, `reversalOfId`;
- `externalSource`, `externalId`, `idempotencyKey`;
- `createdBy`, `postedBy`, `voidedBy` y timestamps;
- índices `(teamId, status, occurredAt)` y unique de idempotencia por team.

#### `team_financial_movement_legs`

Impacto sobre cuentas, sin pretender ser contabilidad fiscal:

- `movementId`, `teamId`, `accountId`;
- `direction`: `in | out`;
- `amount` positivo y `currency`;
- `exchangeRate`/`baseAmount` nullable cuando hay conversión;
- una transferencia requiere al menos una salida y una entrada, posteadas atómicamente;
- una entrada/egreso normal usa una pata de cuenta; cargos o diferencias pueden usar patas adicionales justificadas.

Separar cabecera y patas evita columnas frágiles `sourceAccount/destinationAccount` y soporta transferencias entre monedas sin inventar ingresos.

#### `team_financial_allocations`

- `teamId`, `movementId`, `entryId`, `amount`, `currency`, timestamps;
- unique `(teamId, movementId, entryId)` si se consolida una asignación por par;
- no permitir que allocations posteadas excedan el importe de la entry;
- actualizar el estado de la entry dentro de la misma transacción: `pending/overdue → partial → paid`;
- una reversión revierte también la aplicación, nunca la borra.

Esta tabla habilita pagos parciales y un pago aplicado a varias obligaciones.

#### `team_financial_counterparties`

Perfil financiero especializado, no CRM duplicado:

- `kind`: `customer | supplier | partner | employee | platform | other`;
- nombre legal/comercial mínimo y datos de pago no secretos;
- FK opcional a `teamCustomers`, `contacts` o `users`;
- identificadores externos e inactivación;
- proveedor/beneficiario se crea aquí solamente cuando no existe una entidad reusable.

No guardar credenciales bancarias sensibles en JSON libre. Cualquier dato bancario futuro requiere cifrado y política específica.

#### `team_financial_recurrence_rules`

- plantilla explícita de ingreso/egreso, periodicidad, intervalo, próxima ejecución y fecha final;
- cuenta/contraparte/categoría/moneda/importes predeterminados;
- estado `active | paused | completed`;
- zona horaria y política de fin de mes;
- cada instancia genera una entry con unique `(ruleId, periodKey)`.

Se backfillean las entries con `recurrence != none` sin borrar sus campos legacy. El job será idempotente y reutilizará la infraestructura de jobs acordada por Integración y Eventos.

#### `team_financial_cost_centers`

- centro manual o asociado a una dimensión real;
- FKs opcionales a cliente, proyecto, artículo/servicio, departamento o campaña Meta;
- la empresa principal se representa mediante `teamId`;
- estado, responsable, presupuesto opcional y período opcional;
- CHECK para evitar que un centro automático apunte simultáneamente a entidades incompatibles.

#### `team_financial_entry_cost_allocations`

- `entryId`, `costCenterId`, `amount` o `basisPoints`;
- suma validada contra el total de la entry;
- soporta repartir infraestructura/publicidad entre varios clientes o proyectos.

No se reutiliza `team_task_relations` para esto: esa tabla expresa navegación operativa de Tasks y no distribución monetaria.

#### `team_financial_exchange_rates`

- moneda origen/destino, fecha, tasa, fuente `manual | imported`, usuario;
- unique `(teamId, baseCurrency, quoteCurrency, rateDate, source)`;
- las tasas son explícitas y auditables; nunca se oculta una suma multimoneda detrás de una conversión implícita.

Puede diferirse hasta que un team necesite reportes consolidados multimoneda.

#### Aportes y distribución — fase especializada

`team_financial_equity_events`:

- `kind`: `cash_contribution | advertising_contribution | infrastructure_contribution | reserve | reinvestment | distribution`;
- socio como `counterpartyId`, valoración, moneda, período y evidencia;
- relación opcional con movement, cuenta, campaña, proyecto o cost center;
- aportes en especie no cambian caja hasta que exista un movimiento real.

`team_financial_distribution_policies` y `team_financial_distribution_policy_members`:

- vigencia de la política, socio/beneficiario, basis points y reglas de reserva/reinversión;
- suma de participaciones validada y versionada.

`team_financial_distribution_runs` y `team_financial_distribution_run_lines`:

- snapshot de ingresos, costos, margen distribuible, reserva y líneas por participante;
- aprobación antes de postear movimientos;
- nunca recalcular silenciosamente una distribución histórica si cambia la política.

Estas tablas deben implementarse después del libro de movimientos y la rentabilidad; antes no existe una base confiable que distribuir.

### Qué no se crea

- `finance_customers`, `finance_sales`, `finance_projects`, `finance_memberships` o `finance_campaigns`;
- catálogo financiero de productos/servicios;
- otro gestor de comprobantes o almacenamiento binario;
- otra pasarela de pago dentro de Finance;
- Event Bus exclusivo de Finanzas;
- dashboard de gráficos desconectado del libro operativo;
- modelos fiscales, impuestos o integraciones gubernamentales.

## 5. Servicios de dominio

Mantenerlos dentro de `lib/plugins/finance/server/` y dejar las rutas como adaptadores HTTP delgados.

| Servicio | Responsabilidad |
|---|---|
| `entries.ts` | Crear/actualizar obligaciones, validar relaciones tenant-scoped y recalcular estado desde allocations. |
| `accounts.ts` | Gestionar cuentas y obtener saldos derivados. |
| `movements.ts` | Postear, transferir, ajustar, revertir y garantizar atomicidad de patas. |
| `allocations.ts` | Aplicar cobros/pagos parciales sin sobreasignación y con control de concurrencia. |
| `recurrence.ts` | Materializar períodos de manera idempotente. |
| `cost-centers.ts` | Validar distribución de costos e ingresos. |
| `cashflow.ts` | Posición actual, proyección por vencimiento y escenarios por moneda. |
| `profitability.ts` | Margen por cliente, servicio, proyecto, campaña y vendedor con procedencia explicable. |
| `equity.ts` | Aportes, valoración, políticas, simulación y aprobación de repartos. |
| `audit.ts` | Adaptar al contrato transversal de auditoría; no poner metadata en `ipAddress`. |
| `integrations/*.ts` | Adaptadores Sales, Memberships, AAPP, Meta Ads, Payments y Operaciones. |

Todas las operaciones que cambian dinero usan transacción DB. Aplicaciones concurrentes deben bloquear/validar el saldo pendiente antes de insertar allocations. Los servicios reciben `{teamId, actorUserId, idempotencyKey}`; no lo infieren de un registro externo.

## 6. Integraciones y reglas de origen

| Fuente | Evento/condición | Resultado financiero | Idempotencia |
|---|---|---|---|
| Sales | venta confirmada | receivable vinculada a `saleId`; no movimiento todavía | `sale:{id}:confirmed:{version}` |
| Sales | venta pagada con cuenta conocida | movimiento income + allocation; actualizar paid | referencia/evento de pago |
| Sales | cancelada/reembolsada | cancelar obligación no cobrada o postear reversión/reembolso | evento/version |
| Memberships | período/renovación exigible | receivable relacionada a subscription/customer | `subscription:{id}:{period}` |
| AAPP | transacción `PENDING` | receivable/entry pendiente | external transaction ID existente |
| AAPP | transacción `SUCCESS` | movimiento a cuenta gateway/clearing + allocation | `(teamId, aapp_space, externalId)` |
| Meta Ads | insight sincronizado | costo devengado consultable para rentabilidad, sin duplicar cash | clave del insight |
| Meta Ads | factura/pago conciliado | payable/expense y movimiento de salida | ID del documento/pago |
| Operaciones | horas/costos aprobados | costo atribuible a proyecto/cliente, no caja salvo pago | período + recurso + proyecto |
| Core Payments | estado canónico pagado | solo si un adaptador conoce el rol económico y tenant correcto | payment reference + rol |

Una venta marcada `paid` sin cuenta no debe inventar “efectivo”. Puede usar una cuenta de compensación visible (`clearing`) y quedar pendiente de conciliación.

## 7. Contrato de eventos

La implementación debe consumir el contrato transversal definido por el Agente de Integración. Mínimo común:

```ts
type DomainEvent<T> = {
  id: string;
  name: string;
  version: number;
  teamId: number;
  occurredAt: string;
  actorUserId: number | null;
  correlationId: string;
  causationId?: string;
  idempotencyKey: string;
  payload: T;
};
```

Eventos consumidos:

- `sale.created`, `sale.confirmed`, `sale.paid`, `sale.cancelled`, `sale.refunded`;
- `membership.created`, `membership.renewal_due`, `membership.payment_status_changed`;
- `payment.received` solamente con contexto económico explícito;
- `meta.insights.synced` y, si existe, `meta.statement.reconciled`;
- `project.created`, `project.completed`, `worklog.approved` cuando Operaciones lo incorpore.

Eventos producidos:

- `finance.entry.created`, `finance.entry.overdue`, `finance.entry.paid`;
- `finance.movement.posted`, `finance.movement.reversed`;
- `payment.received` y `payment.sent` como hechos operativos normalizados;
- `receivable.overdue`, `payable.due`;
- `finance.cash_below_threshold`;
- `finance.profitability_negative`;
- `finance.distribution.approved`.

Si el repositorio adopta outbox, la escritura del hecho financiero y del evento debe ocurrir en la misma transacción. Finance no implementará un bus propio mientras esa decisión esté pendiente.

## 8. Permisos

### Compatibilidad inicial

- `financeRead`: ver dashboard, cuentas, movimientos, CxC/CxP y reportes autorizados;
- `financeWrite`: crear/editar borradores y adjuntar evidencia;
- owner/admin conservan acceso según el guard actual;
- activación sigue siendo por usuario (`activationMode: 'user'`).

### Granularidad empresarial propuesta

La ampliación de `MemberPermissions` debe coordinarse con el plan maestro para no crear un sistema de permisos paralelo:

- `financeAccountsManage`;
- `financeMovementsPost`;
- `financeAdjustmentsApprove`;
- `financeCollectionsManage`;
- `financePayablesManage`;
- `financeProfitabilityRead`;
- `financeEquityManage`;
- `financeExport`;
- `financeSettingsManage`.

Matriz recomendada:

- propietario: todos;
- admin: todos salvo distribución/aportes si no se concede explícitamente;
- responsable financiero: lectura, movimientos, cobranzas, pagos, cuentas y reportes;
- comercial: lectura limitada a ventas/cobranzas propias, sin caja global ni costos;
- operaciones: costos/presupuesto de sus proyectos, sin cuentas bancarias;
- agente: ninguno por defecto, como hoy.

La API nunca debe confiar únicamente en ocultar una pestaña. Cada servicio valida permiso, team, relación y estado de transición.

## 9. APIs propuestas

Mantener endpoints actuales durante la transición y versionar payloads si cambian.

### Operación

- `GET/POST /api/plugins/finance/accounts`
- `PATCH /api/plugins/finance/accounts/:id`
- `GET/POST /api/plugins/finance/movements`
- `GET /api/plugins/finance/movements/:id`
- `POST /api/plugins/finance/movements/:id/post`
- `POST /api/plugins/finance/movements/:id/reverse`
- `POST /api/plugins/finance/movements/transfer`
- `GET/POST /api/plugins/finance/entries` (agregar GET paginado; conservar POST actual)
- `PATCH /api/plugins/finance/entries/:id`
- `POST /api/plugins/finance/entries/:id/allocations`
- `GET /api/plugins/finance/receivables`
- `GET /api/plugins/finance/payables`
- `GET/POST/PATCH /api/plugins/finance/recurrence-rules`
- `GET/POST/PATCH /api/plugins/finance/cost-centers`

### Inteligencia financiera

- `GET /api/plugins/finance/overview?from&to&currency`
- `GET /api/plugins/finance/cashflow?from&to&scenario`
- `GET /api/plugins/finance/profitability?dimension=customer|service|project|campaign|seller`
- `GET /api/plugins/finance/aging?type=receivable|payable`
- `GET /api/plugins/finance/reconciliation`
- `GET/POST /api/plugins/finance/equity-events`
- `POST /api/plugins/finance/distributions/simulate`
- `POST /api/plugins/finance/distributions/:id/approve`

### Integraciones

- sustituir `sync-aapp` por un servicio reusable y conservar la ruta como fachada compatible;
- sincronizaciones Sales/Memberships/Meta deben ser handlers de eventos o jobs idempotentes, no botones que vuelven a importar todo sin cursor;
- exponer estado, cursor, último error y cantidad procesada sin exponer secretos.

Todas las listas deben paginarse en servidor, filtrar por moneda/fecha/estado y retornar totales calculados en DB. Los endpoints de mutación aceptan `Idempotency-Key` o campo equivalente.

## 10. UI del plugin existente

Evolucionar `FinanceDashboard`, respetando el sistema visual general y estados accesibles:

1. **Resumen**: caja disponible por moneda, ingresos/egresos realizados, por cobrar/pagar, proyección 30/60/90 días y alertas accionables.
2. **Cuentas**: tarjetas de saldo, movimientos recientes, conciliación y cuenta de compensación pendiente.
3. **Movimientos**: lista paginada con tipo, cuenta, contraparte, fuente, evidencia y estado; transferencia como acción explícita.
4. **Cobros**: aging de CxC, saldo, vencimiento, cliente, concepto y acción “registrar pago parcial”.
5. **Pagos**: CxP, proveedor/beneficiario, vencimiento, aprobación y comprobante.
6. **Recurrentes**: reglas y próximas materializaciones; no solo filtrar entries marcadas recurrentes.
7. **Centros de costo**: distribución y navegación a cliente/proyecto/servicio/departamento/campaña real.
8. **Rentabilidad**: desglose explicable de ingreso, costo directo, costo asignado y margen; nunca un único número opaco.
9. **Aportes y resultados**: aportes valorados, políticas, simulaciones y aprobación de reparto.
10. **Comprobantes**: conservar la experiencia actual, sumando referencias a Files/Documents y origen del movimiento.

Responsive: tabla en escritorio, cards con acción primaria visible en móvil. Incluir carga, vacío, error, sin permiso, moneda no convertible, datos sin conciliar y plugin desactivado. Acciones críticas no dependen de hover.

## 11. Rentabilidad

### Fórmula base

```text
ingresos reconocidos
- reembolsos/descuentos
- costos directos vinculados
- costos compartidos asignados por centro de costo
= margen operativo
```

Dimensiones:

- cliente: `teamCustomers`;
- servicio: `teamArticles` cuyo tipo sea `service` o el artículo real de la venta;
- proyecto: `teamTaskProjects`;
- campaña: `metaCampaigns` + insights diarios;
- vendedor: `teamSales.sellerUserId` (nuevo; `createdBy` no es equivalente confiable).

Cada resultado debe devolver:

- período y moneda/base de conversión;
- fuentes incluidas y excluidas;
- ingresos, costos directos, costos asignados, margen y porcentaje;
- filas sin relación o sin tasa de cambio;
- frescura de cada integración.

No incluir impuestos calculados ni presentar el margen como utilidad fiscal.

## 12. Herramientas IA y conectores

Primero exponer herramientas semánticas; el catálogo read-only genérico es complemento, no interfaz principal.

### Lectura

- `obtener_salud_financiera({fecha_corte, moneda})`;
- `listar_cobros_vencidos({dias, cliente_id, responsable_id})`;
- `listar_pagos_proximos({hasta, prioridad})`;
- `proyectar_caja({desde, hasta, escenario, moneda})`;
- `obtener_rentabilidad_cliente({cliente_id, desde, hasta})`;
- `obtener_rentabilidad_proyecto({proyecto_id})`;
- `obtener_rentabilidad_campana({campana_id, desde, hasta})`;
- `explicar_movimiento({movimiento_id})`;
- `obtener_conciliaciones_pendientes()`;
- `simular_distribucion_resultados({periodo, politica_id})`.

### Mutación controlada

- `registrar_cobro({cuenta_id, asignaciones, referencia, idempotency_key})`;
- `registrar_pago({cuenta_id, asignaciones, referencia, idempotency_key})`;
- `transferir_entre_cuentas(...)`;
- `crear_cuenta_por_cobrar(...)`;
- `crear_cuenta_por_pagar(...)`;
- `revertir_movimiento({movimiento_id, motivo, idempotency_key})`.

Controles:

- usar los mismos permisos del usuario/conexión y el mismo `teamId`;
- mutaciones con confirmación explícita, idempotencia y respuesta previa (“dry run”) para transferencias, ajustes y repartos;
- no devolver credenciales, payloads secretos ni datos bancarios sensibles;
- devolver evidencia y enlaces a entidades, no solo una respuesta narrativa;
- agregar `team_financial_entries`, cuentas, movimientos y allocations al read-only catalog con columnas sensibles excluidas.

## 13. Migraciones y compatibilidad

### Estrategia

1. Migración aditiva para tablas nuevas y columnas nullable; sin renombrar/eliminar columnas existentes.
2. Crear por team una cuenta visible `Compensación histórica` por moneda usada cuando sea necesario.
3. Para cada entry legacy `paid`, crear idempotentemente un movement posteado y allocation en compensación con `externalSource='finance_legacy'` y `externalId='entry:{id}'`.
4. Entries pendientes/vencidas permanecen como obligaciones sin movement.
5. Convertir metadata de recurrencia en reglas mediante `periodKey` determinista, conservando campos legacy durante al menos una versión.
6. No reimportar AAPP: respetar el unique externo existente.
7. Activar nuevas lecturas mediante feature flag/settings y comparar saldos legacy/nuevo antes del corte.
8. Después del corte, impedir DELETE físico si hay movimientos/allocations; usar cancelación o reversión.

### Rollback

El repositorio usa migraciones forward-only de Drizzle y no mantiene scripts down por cada migración. Para este dominio:

- rollback de aplicación: desactivar feature flag y volver a endpoints/UI legacy;
- conservar tablas nuevas y movimientos escritos; no borrar datos financieros en un rollback operativo;
- script compensatorio documentado únicamente para entornos sin datos o pruebas;
- probar restore de backup y reejecución idempotente de backfills antes de producción.

### Contrato de dinero pendiente de decisión transversal

Hoy Sales, Memberships, Finance y pagos usan `integer` en centavos; Meta usa decimal en unidad mayor y AAPP recibe `amount` como texto. PostgreSQL `integer` limita aproximadamente a 21,4 millones de unidades monetarias cuando se usan centavos, un riesgo real en monedas de alta denominación. Antes de implementar se debe acordar uno de estos contratos para toda la plataforma:

- migrar importes operativos a `bigint` minor units y serializarlos de forma segura; o
- usar `numeric`/string decimal en límites de API.

No introducir una convención exclusiva de Finance que vuelva incompatibles ventas y membresías.

## 14. Pruebas y criterios de aceptación

### Unitarias

- suma de saldos por dirección y estado;
- transferencias no alteran resultado;
- pagos parciales y sobreasignación;
- aging y cambio a overdue por fecha/zona horaria;
- recurrencia mensual, anual, fin de mes y período único;
- conversión monetaria y ausencia de tasa;
- rentabilidad por cada dimensión;
- aplicación del costo final Meta sin doble impuesto;
- simulación y redondeo de distribuciones a 10.000 basis points.

### Integración backend/DB

- creación, posteo y reversión atómicos;
- unique de idempotencia con solicitudes concurrentes;
- dos cobradores intentando aplicar el último saldo simultáneamente;
- transferencia con patas balanceadas y bloqueo de cuenta ajena;
- backfill de entries legacy repetible;
- Sales/Memberships/AAPP/Meta sin duplicación;
- recibos existentes siguen abriendo después de la migración;
- movimientos posteados no se borran ni editan destructivamente.

### Permisos y multi-tenancy

- todas las rutas con owner/admin/finanzas/comercial/operaciones/agente;
- IDs válidos de otro team retornan 404/forbidden sin filtrar existencia;
- joins de customer, sale, project, campaign, account y cost center exigen mismo team;
- activación/desactivación por usuario mantiene el comportamiento actual;
- tools IA heredan permisos y team de la conexión;
- exports y agregados no mezclan teams.

### Regresión

- plugin Sales y su UI siguen operativos;
- ficha del cliente conserva membresías/transacciones/tareas/adjuntos;
- recordatorios de Memberships no cambian;
- sincronización Meta no cambia su fuente de verdad;
- checkout, webhooks y pagos manuales de plataforma no cambian;
- `FinanceDashboard` legacy puede leer entries durante el rollout.

### Rendimiento

- paginación por cursor en movimientos/entries;
- agregados SQL y explain de índices tenant-first;
- prueba con al menos 100.000 movimientos por team y series Meta de un año;
- jobs incrementales con cursor, sin recorridos completos como operación habitual.

## 15. Fases recomendadas

### F0 — Contratos compartidos y hardening

- acordar dinero, evento/outbox, auditoría estructurada y permisos granulares;
- mover lógica de rutas actuales a servicios de dominio sin cambiar UX;
- agregar tests del comportamiento existente;
- paginar overview y hacer efectivo `defaultCurrency`;
- reemplazar metadata en `ipAddress` por contrato auditable.

### F1 — Caja, cuentas y obligaciones

- cuentas, movements, legs y allocations;
- CxC/CxP y pagos parciales;
- migración/backfill legacy y cuenta de compensación;
- posteo, reversión, comprobantes y conciliación básica.

### F2 — Automatización e integración

- eventos Sales/Memberships/AAPP;
- reglas recurrentes y job idempotente;
- centros de costo;
- Meta Ads como costo devengado y conciliación de pagos;
- relaciones con proyectos, servicios, departamentos y vendedores.

### F3 — Rentabilidad y dirección

- rentabilidad explicable por dimensiones;
- cashflow y escenarios;
- alertas de cobro, pago, caja y margen;
- semantic tools read-only y luego mutaciones controladas.

### F4 — Aportes y reparto

- equity events;
- políticas versionadas;
- simulación, aprobación, runs y reversión;
- herramientas IA con doble confirmación.

## 16. Riesgos y dependencias

### Riesgos

1. **Duplicación económica**: una venta pagada, una transacción AAPP y un webhook pueden describir el mismo dinero. Mitigación: source adapters, correlation/idempotency y conciliación.
2. **Confusión plataforma/tenant**: `manual_payments` y providers cobran el plan WhatsPro, no necesariamente ventas del team. Mitigación: rol económico explícito y ninguna ingesta automática por defecto.
3. **Multimoneda engañosa**: sumar ARS/USD sin tasa produce métricas falsas. Mitigación: separación por moneda y tasas explícitas.
4. **Overflow monetario**: enteros actuales pueden quedar cortos. Mitigación: contrato común antes de ampliar.
5. **Historial destructivo**: DELETE actual borra entries. Mitigación: posted immutable + reversals y rollout compatible.
6. **Auditoría insuficiente**: `activity_logs.ipAddress` se usa como metadata y el borrado del usuario puede eliminar sus logs por cascada. Mitigación: ampliación estructurada y retención transversal.
7. **Recurrencia aparente**: hoy marcar recurrente no genera períodos. Mitigación: rule + job idempotente + estado visible.
8. **Rentabilidad incompleta**: no hay vendedor directo, worklogs ni costos de proyectos. Mitigación: dependencias explícitas con Sales/Equipo/Operaciones y cobertura de datos reportada.
9. **Escala**: overview actual carga 1.000 entries en memoria del navegador. Mitigación: agregados y paginación server-side.
10. **Estado del worktree**: al auditar, `lib/plugins/finance/` aparece sin seguimiento y `lib/db/schema.ts` modificado. Antes de implementar se debe fijar baseline/ownership para no sobrescribir trabajo existente.

### Dependencias de otros dominios

- **Integración y Eventos**: contrato, outbox/jobs, reintentos e idempotencia.
- **Operaciones**: costos, horas, entregables y relación venta→proyecto.
- **Equipo**: vendedor, comisiones, costo/capacidad de personas.
- **Clientes y Soporte**: salud del cliente puede consumir mora y CxC.
- **Inteligencia y Control**: definiciones de caja, ingreso, costo y margen deben ser las mismas.
- **IA y conectores**: identidad, scopes, confirmación y auditoría de tools.
- **Sales**: `customerId`, `sellerUserId` y eventos de estado.

## 17. Decisiones para consolidación del plan maestro

1. Confirmar que `team_financial_entries` será obligación/documento y no saldo bancario.
2. Adoptar movimientos con cabecera+patas y allocations, sin presentarlos como contabilidad fiscal.
3. Mantener Payments como bounded context separado y consumir solamente eventos con rol económico.
4. No duplicar Meta Ads diario; usar insights para costo devengado y movement para caja real.
5. Extender Sales con cliente/vendedor explícitos.
6. Elegir contrato monetario común antes de crear tablas nuevas.
7. Elegir auditoría/eventos transversales antes de construir implementaciones locales.
8. Implementar primero cuentas, movimientos y pagos parciales; rentabilidad y reparto dependen de esa base.

## 18. Reporte del agente

### Archivos y áreas analizados

- `lib/db/schema.ts`, la migración financiera `0066_finance.sql` y el journal de migraciones;
- `lib/plugins/finance/**` y `app/api/plugins/finance/**`;
- `lib/plugins/sales/**` y `app/api/plugins/sales/**`;
- `lib/plugins/customers/**`, `app/api/plugins/customers/**` y sincronización AAPP;
- `lib/plugins/memberships/**`, rutas, cron y renovaciones;
- `lib/payments/**`, pagos manuales, webhooks y auditoría;
- `lib/ads/**`, `lib/plugins/meta-ads/**` y rutas Meta Ads;
- esquema/servicios/rutas de Tasks y proyectos;
- registry, page registry, permisos, runtime guards, desktop y read-only API catalog;
- Grok/ChatGPT connector patterns y pruebas existentes.

### Archivo modificado

- `docs/business-platform/10-finanzas.md` únicamente.

### Decisiones

- ampliar el plugin `finance` existente;
- preservar `team_financial_entries` y `team_financial_receipts`;
- crear libro operativo de cuentas/movimientos/allocations;
- relacionar, no copiar, Sales/Customers/Memberships/Meta/Tasks;
- excluir fiscalidad;
- postergar reparto hasta tener margen y caja confiables.

### Dependencias y conflictos a resolver

- contrato común de eventos/outbox y auditoría;
- contrato común de dinero;
- propiedad de `team_sales.customerId`/`sellerUserId` entre Sales, Finanzas y Equipo;
- definición de costos/horas con Operaciones;
- baseline del worktree antes de implementar sobre archivos actualmente modificados/no trackeados.
