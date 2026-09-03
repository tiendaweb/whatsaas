# Inteligencia y Control — auditoría y diseño transversal

## 1. Decisión ejecutiva

WhatsPro ya contiene datos operativos, una página `/analytics`, un Escritorio que agrega información de varios plugins y dashboards locales en Finanzas, Ventas, Membresías y Meta Ads. Por lo tanto, **Inteligencia y Control no debe crear otro sistema de registro, otro CRM ni un almacén paralelo de entidades empresariales**.

La solución propuesta es un plugin transversal `intelligence-control` que:

1. consulta servicios y fuentes canónicas de cada dominio;
2. define métricas versionadas y reproducibles;
3. usa vistas/proyecciones reconstruibles solo cuando una consulta directa no escala o no conserva historia;
4. muestra frescura, completitud, moneda, período y calidad junto a cada resultado;
5. permite bajar desde el indicador hasta las entidades autorizadas que lo explican;
6. detecta excepciones, vencimientos y anomalías con reglas auditables;
7. entrega prioridades concretas a humanos y agentes IA;
8. nunca convierte una estimación o un dato faltante en un hecho.

Aplicación del principio rector:

- **Reutilizar:** `/analytics`, Escritorio, servicios de cada plugin, Meta Ads daily insights, datos transaccionales, permisos, activación, `team_notifications`, Pusher, API readonly y conectores.
- **Extender:** permisos, navegación, contratos de métricas, respuesta de APIs, eventos, data quality y el widget de prioridades del Escritorio.
- **Relacionar:** cliente/contacto/venta/campaña/proyecto/ticket/persona mediante IDs canónicos y vínculos aprobados por cada dominio.
- **Especializar:** paneles y alertas como lecturas derivadas; nunca como fuente de verdad del negocio.
- **Crear:** solo estado de proyección, snapshots métricos reconstruibles y ciclo de vida de alertas, porque hoy no existen equivalentes.

No se implementa código en esta fase.

## 2. Qué existe realmente

### 2.1 Analítica y agregación actuales

| Evidencia real | Capacidad | Limitación confirmada |
|---|---|---|
| `app/[locale]/(dashboard)/analytics/page.tsx` | Pantalla con funnel, lista de agentes y tráfico. | No es plugin, no tiene selector de período, calidad, comparación, drilldown empresarial ni alertas. |
| `app/[locale]/(dashboard)/analytics/actions.ts` | Cuenta contactos por etapa/agente y mensajes por día durante 90 días. | Funnel es stock actual, no historia; “agente” cuenta contactos asignados, no ventas/desempeño; tráfico excluye chats sin contacto. El server action acepta `teamId` como parámetro y no autentica ni autoriza internamente. |
| `components/interface/Sidebar.tsx` | Enlace fijo `/analytics`, etiquetado como Escritorio. | `/analytics` no aparece en `ROUTE_PERMISSIONS`; un usuario autenticado no requiere un permiso analítico específico. |
| `lib/desktop/service.ts` y `/api/escritorio/overview` | Agregador cross-plugin con activación, permisos, chat visibility, tareas, chats, clientes, membresías, ventas, Meta, infraestructura y conocimiento. | Carga arrays completos de ventas/membresías para contar; mezcla importes de distintas monedas bajo una sola moneda elegida; suma resultados Meta potencialmente heterogéneos. Es un home operativo personal, no un motor métrico. |
| `team_desktop_preferences` | Layout por team/usuario, widgets ocultos/fijados. | Debe reutilizarse para insertar prioridades, no crear otro home configurable. |
| `app/api/plugins/meta-ads/overview/route.ts` y `lib/ads/aggregate.ts` | Rango, comparación previa, granularidad, KPIs y campañas. Calcula ratios sobre totales, no promedio de ratios diarios. | Scope por cuenta; `reach` diario no es sumable y se usa un máximo de referencia. No relaciona campañas con contactos, clientes o ventas. |
| `app/api/plugins/finance/overview/route.ts` | Devuelve entries, comprobantes y opciones del equipo. | No es una proyección agregada: hasta 1000 entries y 500 comprobantes; la UI calcula parte de la vista. |
| `SalesDashboard.tsx`, `SubscriptionsSection.tsx`, otros dashboards | Chips y contadores locales calculados en cliente desde listas. | Definiciones dispersas, sin versión, comparación uniforme, freshness ni contrato de moneda. |

Acción previa obligatoria: retirar el parámetro `teamId` público de `getDashboardStats`, derivar el team del contexto y aplicar autorización. No se debe construir el nuevo plugin sobre ese server action.

### 2.2 Inventario de fuentes por dominio

| Dominio dueño | Fuentes actuales | Hechos utilizables hoy | Brechas para Inteligencia |
|---|---|---|---|
| WhatsApp/CRM | `chats`, `messages`, `contacts`, `funnel_stages`, tags y departamentos | contactos creados, stock por etapa, asignación, mensajes, no leídos, última interacción del cliente | no hay historia de cambio de etapa, oportunidad semántica, resultado perdido/ganado ni atribución de origen comercial |
| Campañas WhatsApp | `campaigns`, `campaign_leads` | audiencia, enviados, fallidos y estado por destinatario | no existe vínculo durable recipient/contact/customer/sale ni aperturas/conversiones verificadas |
| Formularios | `form_builder_forms`, `form_builder_submissions` | submissions por fecha/formulario/estado y entrega de confirmación | submission no tiene vínculo canónico a contact/customer/campaign; el JSON no debe interpretarse libremente como atribución |
| Ventas/Catálogo | `team_sales`, items JSON con `articleId`, `team_articles` y tipos | ventas por estado/fecha, total, items, contacto, pago y vencimiento | sin `customerId`, `sellerUserId`, line ID estable ni historial de estados; `createdBy` no equivale a vendedor |
| Clientes | `team_customers`, vínculos, tiendas y transacciones externas | cartera, altas, estado simple, fuente, membresías y transacciones vinculadas | sin lifecycle postventa, baja/churn, owner, health, onboarding, tickets o feedback; monto externo está en texto |
| Membresías | plans, subscriptions, reminder rules y AAPP renewal candidates | activas, pendientes, vencidas, próximas a vencer, pagos y comunicaciones de renovación | no hay renewal case comercial ni reconocimiento financiero canónico |
| Finanzas | `team_financial_entries`, receipts y fuentes de pagos | income/expense operativo, estados, vencimientos, moneda, recurrencia y relaciones parciales | no hay cuentas/movimientos de doble pierna, CxC/CxP parcial, allocations/centros de costo o FX; no representa todavía caja real |
| Meta Ads | accounts, campaigns, daily insights y sync runs | spend neto/final, results por tipo, clicks, impressions, CPC/CPM/CTR y estado de sync | sin campaña→lead→venta; monedas/tipos de resultado no se pueden sumar indiscriminadamente; no hay CAC/ROAS reales |
| Social Publisher | accounts, posts y targets | publicaciones, fallos, scheduling y estado por canal | no hay insights de alcance, engagement, leads o revenue |
| Task OS | workspaces, projects, columns, tasks, locations, relations, dependencies, media, templates y comments | backlog, fechas, completadas/abiertas y vencidas a nivel team | sin responsable, prioridad canónica, esfuerzo, estado de proyecto, horas, approvals o costo; columna y status pueden divergir |
| Calendario/Reuniones | `team_events`, notas y notificaciones | agenda, duración planificada, estado, contacto/departamento/usuario | sin tipo de reunión, participantes estructurados, duración real, outcomes o follow-up hasta implementar `20` |
| Equipo | users, team members, departments, department members y activity logs | miembros, roles de acceso, departamentos y acciones registradas | sin perfil laboral, superior, disponibilidad, goals, assignees, atribución comercial o métricas comparables |
| Conocimiento | notes, documents/folders/links/media y drafts | volumen, actualización y búsqueda de contenido | clasificación, revisión y vigencia semántica dependen del futuro dominio Conocimiento |
| Infraestructura | domains, Hostinger, sites | vencimientos, auto-renew, errores/sync, publicación | costo real pertenece a Finanzas; estado técnico no prueba rentabilidad |
| Plataforma/Pagos | teams, manual payments, payment audit/webhook events, marketplace orders | estado de suscripción de WhatsPro, órdenes y auditoría de proveedores | no confundir facturación de la plataforma con finanzas operativas del tenant |

### 2.3 Calidad estructural relevante

- Todo dato empresarial se comparte en PostgreSQL/Drizzle y el límite dominante es `teamId`.
- No hay RLS; cada query, vista, proyección y drilldown debe aplicar tenant explícito.
- Varias FKs son simples y no impiden relaciones cruzadas entre teams.
- No existe un bus/outbox/inbox general; Pusher es efímero y `team_notifications` es inbox humano.
- `activity_logs` solo conserva acción, usuario, fecha e IP; no puede usarse como event store ni como base de productividad.
- Hay 75 SQL y 59 entradas de journal; ninguna migración de Inteligencia se numera antes de reconciliar el baseline.
- El catálogo readonly ya enumera gran parte de las fuentes, pero contiene filtros/campos inconsistentes documentados en los informes de Arquitectura y Operaciones. El motor interno no debe consultar su propia API readonly.
- No hay tests DB/API/permisos/multi-tenant para analítica.

## 3. Frontera y ownership

Inteligencia y Control posee:

- catálogo en código de definiciones métricas;
- composición autorizada de métricas entre dominios;
- contrato de período, comparación, moneda, frescura y calidad;
- proyecciones reconstruibles;
- detección y ciclo de vida de alertas;
- priorización diaria;
- paneles, drilldowns y herramientas IA de lectura/explicación.

No posee:

- ventas, cobros, pagos, tickets, tareas, clientes, campañas, reuniones, goals o documentos;
- cambios de estado en esas entidades;
- atribución comercial/marketing que el dominio origen no registre;
- FX, reconocimiento de ingresos ni health score: consume las definiciones de Finanzas y Clientes;
- decisiones laborales automáticas o un score opaco de desempeño;
- una copia de mensajes, transcripciones, documentos o comprobantes.

Regla de ownership:

| Concepto | Dueño de definición/fuente | Rol de Inteligencia |
|---|---|---|
| caja, ingreso, egreso, CxC, CxP, margen | Finanzas | consultar, comparar, explicar y alertar |
| lead, etapa, oportunidad | CRM | agregar según semántica e historia registrada |
| venta, líneas, pago, vendedor | Sales | calcular funnel comercial y drilldown |
| spend/results | Meta Ads | reutilizar adapter y mostrar freshness |
| CPL/CAC/ROAS | contrato Marketing+CRM+Sales+Finance | componer solo cuando haya atribución verificable |
| proyecto/tarea/blocker/capacidad | Operaciones/Equipo | agregar y priorizar |
| ticket/SLA/health/renovación | Clientes y Soporte | agregar, alertar y explicar |
| reunión/outcomes | Reuniones | exponer seguimientos pendientes |
| objetivos/desempeño/comisiones | Equipo | agregar con política de privacidad |
| alerta | Inteligencia | detectar, deduplicar y gestionar estado |

## 4. Contrato métrico común

Cada métrica tiene una definición estable en código, revisada por el dominio dueño:

```ts
type MetricDefinition = {
  key: string;
  version: number;
  owner: DomainId;
  labelKey: string;
  descriptionKey: string;
  unit: 'count' | 'minor_money' | 'ratio' | 'percent' | 'minutes' | 'score';
  additive: 'all_dimensions' | 'time_only' | 'none';
  supportedDimensions: string[];
  requiredCapabilities: string[];
  defaultComparison: 'previous_period' | 'previous_year' | 'none';
  query: MetricQueryKey;
  drilldown: MetricDrilldownKey;
};
```

No se persiste una tabla de definiciones en la primera versión: evitaría tipado, code review y despliegue coherente. Configuraciones de thresholds/dimensiones sí pueden ser tenant-scoped.

Respuesta común:

```ts
type MetricResult = {
  key: string;
  definitionVersion: number;
  availability: 'available' | 'partial' | 'insufficient_data' | 'not_supported' | 'forbidden';
  value: { value: string; unit: string; currency?: string } | null;
  numerator?: string | null;
  denominator?: string | null;
  period: { from: string; to: string; timezone: string; complete: boolean };
  comparison?: { value: string | null; delta: string | null; deltaPercent: string | null; comparable: boolean };
  dimensions: Record<string, string | number>;
  sources: Array<{ domain: string; dataset: string; watermark: string | null; freshness: string }>;
  quality: { status: 'good' | 'warning' | 'stale' | 'error'; completeness: number | null; issues: string[] };
  computedAt: string;
  scopeApplied: 'company' | 'department' | 'assigned' | 'self';
  drilldown?: { href: string; estimatedRows?: number };
};
```

Invariantes:

- `0` significa que la fuente completa no encontró hechos; dato faltante es `null` + estado explícito.
- Toda métrica monetaria devuelve una moneda o una serie separada por moneda.
- No se suman monedas sin una tasa/version de FX provista por Finanzas.
- Ratios se calculan con los totales del período, nunca promediando ratios parciales.
- Denominador cero produce `null`, no infinito ni 0 engañoso.
- El período usa la timezone de reporting del team; la respuesta indica si está completo.
- Cada definición fija qué fecha manda: creación, pago, vencimiento, resolución o reconocimiento.
- Un snapshot conserva versión de definición y watermark para poder reproducirlo.
- El drilldown usa el mismo scope, filtros y definición que el agregado.

## 5. Disponibilidad y contratos previos

### 5.1 Disponible con datos actuales

- contactos creados por período;
- stock actual de contactos por funnel stage/departamento/agente;
- volumen de mensajes, inbound/outbound, IA/automation y errores;
- campañas WhatsApp enviadas/fallidas;
- form submissions;
- ventas por estado, fecha de creación/pago, artículo y contacto;
- clientes existentes/activos según estado simple;
- membresías activas/pendientes/vencidas/próximas;
- finance entries pagados/pendientes/vencidos, declarados como ledger operativo parcial;
- Meta spend/results/clicks/impressions y freshness de sync por cuenta;
- tareas abiertas/completadas/vencidas y eventos programados;
- dominios próximos a vencer y conectores con error/stale;
- publicaciones sociales exitosas/fallidas;
- documentos/notas actualizados.

### 5.2 Disponible solo después de extensiones ya diseñadas

| Resultado | Dependencia aprobada en informes |
|---|---|
| caja real, CxC/CxP, cash forecast, margen y costos | cuentas, movimientos, obligations, allocations y FX de `10-finanzas.md` |
| meeting follow-up y decisiones sin responsable | details/outcomes/runs de `20-reuniones-comunicaciones.md` |
| carga, capacidad, disponibilidad, objetivos, vendedor y comisiones | perfiles, schedules, time off, goals, assignees y attribution de `30-equipo.md` |
| tickets, SLA, health, onboarding, renovaciones y churn | entidades de `40-clientes-soporte.md` |
| proyectos en riesgo, blockers, approvals, horas y costos | perfil operacional y detalles de `50-operaciones.md` |

### 5.3 No disponible sin un nuevo contrato de origen

- **Conversión histórica por etapa:** requiere historia/eventos CRM; el stage actual no reconstruye transiciones pasadas.
- **Oportunidades:** requiere semántica canónica de stage (`lead`, `opportunity`, `won`, `lost`) o entidad equivalente; nombres libres no bastan.
- **CPL real:** requiere atribuir un lead calificado a una campaña/ad y definir qué evento lo califica.
- **CAC:** requiere adquisición de customer atribuida y gasto compatible.
- **ROAS:** requiere revenue pagado/reconocido atribuido a campaña, no comparar todos los ingresos con todo el spend.
- **Ventas por vendedor:** requiere `sellerUserId`/attribution; `createdBy` no es proxy.
- **Tarea crítica:** requiere prioridad canónica de Operaciones/Tasks; una label de texto no es suficiente.
- **Engagement social:** el Social Publisher actual registra publicación, no insights.

Estas métricas se devuelven como `not_supported` o `insufficient_data`, con la dependencia concreta. No se estiman por coincidencia de teléfono, nombre, fecha, UTM dentro de JSON arbitrario ni proximidad temporal.

## 6. Definiciones por panel

### 6.1 Panel Dirección

| Métrica | Definición | Fuente/fecha | Disponibilidad y drilldown |
|---|---|---|---|
| `finance.cash_balance` | suma de legs posteadas por cuenta hasta corte | Finanzas; `postedAt` | tras expansión Finanzas; cuentas/movimientos |
| `finance.realized_income` | movimientos/allocations de ingreso realizados en período | Finanzas; fecha de realización | entries actuales solo como provisional etiquetado |
| `finance.realized_expense` | egresos realizados, reversas neteadas | Finanzas | separar por moneda/centro |
| `finance.receivables_outstanding` | principal menos pagos/asignaciones/reversas al corte | Finanzas obligations | no usar total de ventas como CxC |
| `finance.payables_due` | saldo de payables con vencimiento hasta fecha | Finanzas | obligaciones/proveedor |
| `sales.paid_amount` | suma de ventas con transición real a paid dentro del período | Sales; `paidAt` | disponible, por moneda; venta/contacto |
| `customers.active` | customers con lifecycle activo al corte | Customers | estado simple hoy; lifecycle después |
| `customers.acquired` | customers que alcanzaron `becameCustomerAt` en período | Customers | requiere lifecycle; no usar sync timestamp |
| `customers.churned` | customers con churn efectivo en período | Customers | requiere `churnedAt` y motivo |
| `renewals.due` | renewal cases abiertos cuyo target date cae en horizonte | Customers/Memberships | candidates actuales pueden mostrarse como comunicaciones, no negociación |
| `profit.margin` | recognized revenue − refunds − direct cost − allocated cost | Finanzas | por moneda/cliente/proyecto/servicio/campaña/vendedor |

La cabecera Dirección no muestra un “total empresa” monetario si existen monedas no convertidas. Muestra una tarjeta por moneda o solicita una base FX válida y versionada.

### 6.2 Panel Comercial

| Métrica | Definición | Regla |
|---|---|---|
| `crm.leads_created` | contactos creados dentro del período | `contacts.createdAt`; puede dimensionar por fuente solo si la fuente es canónica |
| `crm.current_funnel_stock` | contactos actualmente en cada stage | stock, nunca rotular como flujo/conversión |
| `crm.opportunities_open` | contactos en stages con semántica `opportunity` y no terminales | requiere clasificación CRM |
| `crm.stage_conversion_rate` | contactos de una cohorte que entraron al stage destino / contactos que entraron al stage origen | requiere historia; cohort y ventana visibles |
| `sales.confirmed_count/value` | ventas cuya transición a confirmed ocurrió en el período | mientras no haya historia, usar createdAt solo como aproximación marcada |
| `sales.paid_count/value` | ventas pagadas por `paidAt` | por moneda, venta/customer/contact |
| `sales.win_rate` | oportunidades ganadas / oportunidades cerradas | requiere outcome CRM, no status actual aislado |
| `sales.cycle_time` | mediana entre lead created y paid/won | percentiles, no solo promedio; requiere identidad/vínculo estable |
| `sales.by_seller` | paid amount/count por attribution explícita | no inferir desde autor/editor/agente actual |
| `crm.abandoned_leads` | leads no terminales sin interacción calificante durante threshold | contacto/stage + chat/message/event; excluir opt-out, archived y casos sin canal |

“Interacción calificante” debe configurarse: inbound del cliente, respuesta humana, reunión completada o seguimiento registrado. Mensajes masivos/automatizados por sí solos no reinician abandono salvo política explícita.

### 6.3 Panel Marketing

| Métrica | Fórmula y condiciones |
|---|---|
| `marketing.spend` | suma de spend Meta del período, con tax policy de la cuenta; separar moneda/cuenta |
| `marketing.results` | suma solo dentro del mismo `resultActionType`; resultados heterogéneos se presentan por tipo |
| `marketing.cost_per_result` | spend final / results del mismo tipo, calculado sobre totales |
| `marketing.ctr` | clicks / impressions × 100 |
| `marketing.cpc` | spend final / clicks |
| `marketing.cpm` | spend final / impressions × 1000 |
| `marketing.leads_attributed` | leads calificados con attribution aceptada a campaña/ad |
| `marketing.cpl` | spend atribuible / leads atribuidos |
| `marketing.customers_acquired` | customers con adquisición atribuida dentro de cohorte |
| `marketing.cac` | spend atribuible / customers adquiridos |
| `marketing.revenue_attributed` | revenue pagado/reconocido cuya attribution fue aceptada |
| `marketing.roas` | revenue atribuido / spend atribuible |
| `campaigns.delivery_rate` | WhatsApp leads enviados exitosamente / intentados |
| `social.publish_success_rate` | targets publicados / targets terminados |

Hasta contar con attribution, Meta conserva “Costo por resultado” y no se renombra a CPL. `reach` derivado de filas daily se marca no aditivo; no se suma entre días.

El modelo de atribución (`first_touch`, `last_touch`, `linear`, etc.) pertenece a Marketing/CRM y debe guardar fuente, campaña/ad, confianza, touch timestamp y versión. Inteligencia consume el resultado; no crea matches heurísticos.

### 6.4 Panel Operaciones

| Métrica | Definición |
|---|---|
| `operations.work_orders_active` | perfiles operacionales en planned/active/on_hold según filtro |
| `operations.projects_overdue` | `plannedEndAt < now` y estado no terminal |
| `operations.delivery_on_time_rate` | órdenes completadas en/before planned end / completadas con fecha comprometida |
| `operations.tasks_overdue` | tasks no terminales con due date vencida, contadas por task ID una vez aunque tenga varias locations |
| `operations.blockers_open` | blockers abiertos por severidad; dependencias incompletas se derivan, no duplican |
| `operations.approvals_overdue` | approvals pending fuera de deadline/SLA |
| `operations.planned_vs_actual_hours` | estimated minutes vs time entries aprobados, por proyecto/persona |
| `operations.capacity_utilization` | carga planificada / capacidad neta, con completitud |
| `operations.budget_vs_cost` | presupuesto vs costos reales vinculados por Finanzas |
| `meetings.followups_pending` | outcomes aprobados/pendientes cuyo next step no se aplicó o venció |

Sin assignees o estimaciones, carga no es cero: se muestra `insufficient_data` y, aparte, conteo de tareas abiertas.

### 6.5 Panel Clientes

| Métrica | Definición |
|---|---|
| `support.ticket_backlog` | tickets no terminales al corte |
| `support.critical_open` | tickets críticos abiertos según prioridad canónica |
| `support.first_response_sla_rate` | tickets elegibles respondidos dentro de deadline / tickets elegibles respondidos o vencidos |
| `support.resolution_sla_rate` | tickets elegibles resueltos dentro de deadline / resueltos o vencidos |
| `support.reopen_rate` | tickets resueltos reabiertos / tickets resueltos |
| `customers.at_risk` | customers cuyo health automático cae en risk/critical |
| `customers.health_coverage` | customers con score válido / customers elegibles |
| `customers.without_followup` | clientes activos sin interacción/reunión/tarea/renewal en threshold |
| `customers.sold_without_onboarding` | venta elegible pagada/confirmada sin onboarding creado dentro de SLA |
| `renewals.due/won/lost` | casos de renovación por fecha/resultado |
| `customers.satisfaction` | CSAT/NPS/CES separado por tipo; no promediar escalas distintas |

Health reutiliza el algoritmo explicable y snapshots de Clientes; Inteligencia no recalcula pesos por su cuenta.

### 6.6 Panel Equipo

| Métrica | Definición y privacidad |
|---|---|
| `team.available_now` | horario efectivo − ausencia aprobada, con conflictos de agenda visibles según política |
| `team.capacity` | minutos programados/netos por período |
| `team.workload` | estimación asignada × allocation; incompleta si faltan estimaciones |
| `team.utilization` | workload / net capacity |
| `team.overdue_tasks` | tareas vencidas por assignee explícito |
| `team.goals_at_risk` | goals cuyo progreso/tiempo restante incumple regla versionada |
| `team.sales_results` | paid sales por attribution explícita |
| `team.performance_components` | tareas, goals, proyectos, ventas y feedback como componentes explicados, no ranking único |
| `team.commissions_pending` | ledger earned/approved no settled; permiso de compensation obligatorio |

`activity_logs` puede indicar uso/auditoría, pero no productividad. No se generan rankings de personas sin población comparable, período, rol, fuentes y permiso explícitos.

## 7. Modelo de consultas y proyecciones

### 7.1 Tres niveles, sin data warehouse prematuro

```text
Fuentes de verdad de dominios
  -> servicios/query modules tenant-scoped
     -> SQL directo o VIEW canónica para estado actual
        -> snapshot/proyección reconstruible para series y escala
           -> Metric Service + permisos/calidad
              -> panel / alerta / tool IA / widget Escritorio
```

**Nivel A — consulta directa:** default para métricas actuales sobre tablas indexadas y períodos acotados. Se implementa en `lib/plugins/intelligence-control/server/queries/<domain>.ts`, reutilizando helpers de dominio, no Route Handlers ni fetch HTTP internos.

**Nivel B — SQL VIEW:** para joins reutilizables de estado actual, por ejemplo customer↔membership o task↔operation profile. La vista conserva `team_id`, IDs de drilldown y columnas tipadas. No contiene secretos ni texto completo.

**Nivel C — proyección/snapshot:** solo para historia no disponible como estado actual, tendencias costosas, alert evaluation o dashboards frecuentes. Es derivada, versionada, idempotente y completamente reconstruible desde fuentes/eventos confiables.

No se crea:

- base de datos analítica separada;
- réplica de cada tabla;
- tabla genérica con copias JSON de entidades;
- materialized view global sin `teamId` o sin estrategia de refresh;
- cubo que mezcle monedas, resultados Meta o scopes de permisos.

### 7.2 Registry de consultas

Cada query declara:

- metric key/version;
- tablas/servicios fuente y dominio dueño;
- columnas de fecha y timezone;
- dimensiones permitidas;
- cardinalidad y límites;
- permiso/capability requerido;
- estrategia `direct | view | snapshot`;
- freshness target;
- validaciones de calidad;
- builder de drilldown.

La API nunca acepta nombres arbitrarios de tabla, campo, función SQL, group by u order by. Solo claves y dimensiones allowlisted.

### 7.3 Tablas nuevas mínimas

#### `team_intelligence_metric_snapshots`

Cache/historia reconstruible, no fuente operacional:

- `id`, `teamId`;
- `metricKey`, `definitionVersion`;
- `bucketDate`, `timezone`;
- `dimensions jsonb` y `dimensionHash` estable;
- `valueDecimal`, `numeratorDecimal`, `denominatorDecimal` nullable;
- `unit`, `currency` nullable;
- `availability`, `completeness`;
- `qualityIssues jsonb`;
- `sourceWatermark`, `computedAt`;
- unique `(teamId, metricKey, definitionVersion, bucketDate, dimensionHash)`;
- índices por `(teamId, metricKey,bucketDate)`.

No guardar PII, listas de IDs ni textos fuente. El drilldown siempre vuelve a la fuente con la misma definición.

#### `team_intelligence_projection_state`

- `teamId`, `projectionKey`, `projectionVersion`;
- `status`: `idle`, `running`, `ok`, `partial`, `failed`, `stale`;
- `projectedThrough`, `sourceWatermark`, `lastStartedAt`, `lastCompletedAt`;
- `rowCount`, `qualityStatus`, `qualityDetails jsonb`, `lastErrorCode`;
- lease/attempt para reclamar trabajo;
- unique `(teamId, projectionKey)`.

No persistir stack traces, tokens ni payloads sensibles.

#### `team_intelligence_alert_policies`

Override/configuración tenant sobre tipos de alerta definidos en código:

- `id`, `teamId`, `alertKey`, `enabled`;
- `severity`, `parameters jsonb` tipado/versionado;
- `scope jsonb` allowlisted;
- `evaluationSchedule`, `timezone`, `cooldownMinutes`;
- `recipientUserIds`/`departmentIds` validados o tablas de destinatarios si escala;
- `createdBy`, `updatedBy`, timestamps;
- unique `(teamId, alertKey)`.

#### `team_intelligence_alerts`

- `id`, `teamId`, `policyId` nullable, `alertKey`, `definitionVersion`;
- `fingerprint` único por team para la ocurrencia lógica;
- `severity`, `status`: `open`, `acknowledged`, `snoozed`, `resolved`, `dismissed`;
- `entityType`, `entityId` nullable;
- `metricKey`, `periodFrom`, `periodTo`;
- `observedValue`, `baselineValue`, `thresholdValue`, `unit`, `currency`;
- `reasonCodes jsonb`, `evidence jsonb` minimizado, `drilldownHref`;
- `firstDetectedAt`, `lastDetectedAt`, `occurrenceCount`;
- `acknowledgedBy/At`, `snoozedUntil`, `resolvedAt`, `resolutionReason`;
- `notificationId` nullable y timestamps.

La auditoría transversal registra cambios de estado. No hace falta otra tabla `alert_events` si el AuditEnvelope común conserva before/after.

### 7.4 Proyecciones lógicas sugeridas

- `finance_daily`: ingresos/egresos/obligaciones por moneda y dimensiones aprobadas;
- `sales_daily`: ventas creadas/confirmadas/pagadas/revertidas por moneda, artículo y attribution;
- `crm_stage_daily`: entradas/salidas por stage desde historia/eventos, nunca snapshots del estado actual fingiendo flujo;
- `marketing_daily`: Meta por cuenta/campaign/result type/currency;
- `customer_daily`: lifecycle, health band, onboarding, renewal y support facts;
- `operations_daily`: project/task transitions, due, blocker, approval, hours;
- `team_daily`: capacity, load, goals y resultados autorizados;
- `meeting_daily`: reuniones finalizadas y outcomes pendientes.

Se materializan únicamente las que tengan historia confiable y necesidad medida. Un job nocturno reconcilia eventos con fuentes para reparar pérdidas.

## 8. Frescura y calidad de datos

### 8.1 Freshness

Cada source adapter expone un watermark real:

| Fuente | Watermark | Política inicial |
|---|---|---|
| tablas transaccionales locales | máximo `updatedAt`/evento aplicable | consulta directa “as of” DB; proyección warning >5 min |
| Meta Ads | `meta_ad_accounts.lastSyncedAt` + último sync run | cron selecciona cuentas cada ≥3 h; warning configurable >6 h, stale >24 h |
| AAPP | `team_aapp_connections.lastSyncedAt` | target configurable; no asumir frecuencia externa |
| Hostinger | `hostinger_accounts.lastSyncedAt` | mostrar stale/error por cuenta |
| proyecciones | `projectedThrough` y `sourceWatermark` | near-real-time objetivo 5 min; reconciliación diaria |
| período calendario | cierre en timezone del team | no comparar día/mes incompleto como completo |

La frecuencia efectiva de invocación de crons no se verifica solo desde el repositorio. La UI debe mostrar el timestamp observado, no prometer “tiempo real”.

### 8.2 Calidad

Dimensiones evaluadas:

- **completitud:** proporción de hechos elegibles con vínculos/campos necesarios;
- **validez:** estados, fechas, moneda, montos y relaciones dentro de rangos válidos;
- **consistencia:** total/items, status/paidAt, team FK, task status/column y sources equivalentes;
- **unicidad:** idempotency/external IDs y hechos duplicados;
- **timeliness:** watermark vs target;
- **cobertura:** porcentaje de entidades donde la métrica aplica.

Ejemplos de flags:

- `mixed_currency_without_fx`;
- `sales_without_customer_link`;
- `sales_without_seller_attribution`;
- `contacts_without_stage_history`;
- `meta_results_mixed_types`;
- `meta_daily_reach_non_additive`;
- `tasks_without_assignee`;
- `tasks_without_estimate`;
- `customers_health_insufficient_data`;
- `projection_lagging`;
- `cross_team_reference_detected`.

Reglas de presentación:

- un warning no se oculta detrás de tooltip exclusivamente;
- métricas stale conservan el último valor con “datos al …”, nunca parecen actuales;
- quality error bloquea alertas estadísticas dependientes para evitar falsos positivos;
- el usuario puede abrir `/data-health` y ver fuente, impacto, owner y acción correctiva;
- la completitud acompaña cualquier ranking o recomendación.

## 9. Alertas y prioridades

### 9.1 Motor de alertas

Tipos iniciales:

| Alert key | Condición | Fuente |
|---|---|---|
| `receivable.overdue` | saldo > 0 y due date pasada | Finanzas |
| `payable.due` | payable abierto dentro del horizonte | Finanzas |
| `sales.drop` | período completo cae contra baseline comparable sobre mínimo volumen | Sales |
| `cost.increase` | costos comparables superan baseline/threshold | Finanzas |
| `lead.abandoned` | lead no terminal sin interacción calificante | CRM/Chats |
| `customer.at_risk` | health risk/critical con cobertura suficiente | Customers |
| `customer.no_followup` | cliente activo sin actividad elegible | Customers/Meetings/Tasks |
| `renewal.due` | renewal case requiere acción | Customers/Memberships |
| `project.overdue` | work order fuera de planned end | Operations |
| `project.risk` | risk reasons canónicos de Operaciones | Operations |
| `task.critical_overdue` | prioridad crítica canónica + vencida | Operations/Tasks |
| `ticket.critical` | ticket critical abierto | Support |
| `ticket.sla_breached` | first response/resolution deadline incumplida | Support |
| `marketing.cost_high` | CPL/cost per result supera política sobre datos compatibles | Marketing |
| `connector.stale` | sync fuera del freshness target | Meta/AAPP/Hostinger |
| `data_quality.degraded` | check crítico falla o cobertura cae | Intelligence |

### 9.2 Anomalías

Una anomalía no es “cualquier cambio”. La evaluación estadística exige:

- misma métrica, timezone, moneda y dimensiones;
- períodos completos y comparables;
- mínimo de observaciones/volumen;
- estacionalidad semanal cuando aplique;
- baseline visible;
- método versionado, inicialmente threshold porcentual + mediana/MAD para series suficientes;
- reason code y evidencia numérica.

La IA puede explicar una anomalía, pero no decide si existe. Un modelo probabilístico futuro debe registrarse como una definición versionada y evaluarse contra falsos positivos.

### 9.3 Ciclo de vida y deduplicación

```text
evaluación
  -> fingerprint(team + alertKey + entity/scope + período lógico)
  -> crear open o actualizar lastDetectedAt/occurrenceCount
  -> team_notification para destinatarios autorizados
  -> acknowledge / snooze / resolve / dismiss
  -> si persiste luego de cooldown, reabrir o incrementar según política
```

- El mismo evento/retry no crea alertas duplicadas.
- Resolver una entidad en su dominio resuelve la alerta en la siguiente evaluación/evento.
- `team_notifications.readAt` no equivale a acknowledge; leer una notificación no cambia el riesgo.
- Pusher solo refresca la UI después del commit.
- Dismiss exige motivo; una nueva ocurrencia material puede reabrir.

### 9.4 “¿Qué tenemos que hacer hoy?”

La cola diaria combina alertas y obligaciones autorizadas. Orden determinista:

1. severidad y SLA/vencimiento;
2. impacto económico explícito, si existe y hay permiso;
3. proximidad temporal;
4. número de clientes/personas afectadas;
5. confianza/calidad;
6. antigüedad sin atención.

Cada prioridad devuelve:

- razón concreta;
- entidad y enlace;
- fecha límite;
- evidencia/importe autorizado;
- acción recomendada;
- owner/departamento si existe;
- calidad y datos faltantes.

Ejemplos: cobrar receivable vencido, responder ticket SLA crítico, recuperar lead abandonado, revisar campaña con costo alto, resolver blocker/proyecto atrasado, llamar renovación próxima y completar task crítica. Inteligencia propone/navega; la mutación sigue en el plugin dueño.

## 10. Permisos, privacidad y multi-tenancy

### 10.1 Permisos propuestos

- `intelligenceRead`;
- `intelligenceDirectionRead`;
- `intelligenceCommercialRead`;
- `intelligenceMarketingRead`;
- `intelligenceOperationsRead`;
- `intelligenceCustomersRead`;
- `intelligenceTeamRead`;
- `intelligenceAlertsManage`;
- `intelligenceDataQualityRead`.

Dirección no concede automáticamente Finanzas, compensación o datos privados. La regla es:

```text
acceso efectivo = permiso del panel
                 ∩ permiso del dominio fuente
                 ∩ visibilidad de entidades
                 ∩ field-level policy
                 ∩ plugin/capability activo
```

`scopeApplied` puede ser `company`, `department`, `assigned` o `self`. Un agregado de empresa también filtra información; no debe mostrarse si el usuario solo puede ver asignados, salvo que una política explícita autorice un agregado anonimizado con umbral mínimo.

### 10.2 Datos sensibles

- compensación/comisiones requieren permission específica de Equipo;
- costos/margen requieren permisos financieros;
- transcript, grabaciones, notas privadas, feedback y health reasons sensibles no se incluyen en un panel general;
- agregados de personas aplican umbral mínimo para evitar reidentificación;
- la IA recibe exactamente el resultado métrico autorizado, no dumps de tablas;
- exports y drilldowns repiten checks, no confían en que la UI ocultó un botón.

### 10.3 Aislamiento

- `teamId` siempre deriva del `getActivePluginRequestContext` futuro;
- toda vista/proyección contiene `teamId` y todo índice comienza por team cuando corresponde;
- IDs/dimensiones se validan con `(teamId,id)`;
- las relaciones polimórficas usan registry tenant-aware;
- alert policies no aceptan destinatarios/departamentos de otro team;
- una referencia ajena devuelve 404 sin revelar existencia;
- no usar `teamId` del body/query ni server actions con team arbitrario.

## 11. APIs propuestas

Base: `/api/plugins/intelligence-control`.

| Método/ruta | Función |
|---|---|
| `GET /overview?panel=direction|commercial|marketing|operations|customers|team` | composición del panel con rango/scope y capabilities |
| `GET /metrics/:key` | métrica canónica con dimensiones allowlisted |
| `GET /metrics/:key/series` | serie paginada/granularidad válida |
| `GET /metrics/:key/drilldown` | entidades fuente autorizadas, cursor y mismo filtro |
| `GET /definitions` | catálogo autorizado de fórmula, owner, unit y disponibilidad |
| `GET /data-health` | freshness, checks, coverage y projection state |
| `GET /priorities/today` | cola explicable y deduplicada |
| `GET /alerts` | alertas por estado/severity/tipo/entity |
| `POST /alerts/:id/acknowledge` | reconocimiento auditado |
| `POST /alerts/:id/snooze` | posposición con límite/motivo |
| `POST /alerts/:id/resolve` | resolución manual cuando la política lo admite |
| `GET/PUT /alert-policies` | configuración y validación de thresholds/recipients |
| `POST /projections/:key/rebuild` | solo admin, job asíncrono, rango acotado y dry-run |

Parámetros comunes:

- `from`, `to` ISO y rango máximo según granularidad;
- `timezone` no arbitraria: default/settings y allowlist IANA;
- `currency` solo si hay adapter/FX válido;
- `compare=previous_period|previous_year|none`;
- dimensiones declaradas por definición;
- cursor/limit para drilldowns;
- `includeQuality=true` por defecto.

Respuestas cacheables solo por `teamId + user/scope + permission fingerprint + metric/version + filtros + watermark`. Nunca compartir cache entre usuarios/teams por URL sola.

## 12. UI y compatibilidad

### 12.1 Manifest y rutas

- plugin `id: 'intelligence-control'`;
- activation `global`;
- ruta principal `/plugins/intelligence-control`;
- subrutas `/direction`, `/commercial`, `/marketing`, `/operations`, `/customers`, `/team`, `/alerts`, `/data-health`;
- capacidades opcionales de todos los dominios; un plugin ausente degrada secciones, no se activa silenciosamente;
- settings en `team_plugins.settings`: reporting timezone, default currency/FX policy, fiscal week no incluida, comparison defaults, thresholds y freshness targets.

El manifest actual no soporta dependencias declarativas; coordinar con Arquitectura. Como la capa es transversal, no debe exigir que todos los plugins estén instalados para abrir.

### 12.2 Migración de experiencias existentes

- `/analytics` se conserva como redirect compatible a `/plugins/intelligence-control/commercial` durante al menos una versión.
- `FunnelLineChart`, `FunnelRadarChart`, `TrafficHeatmap` y `AgentList` solo se reutilizan si consumen definiciones corregidas; no perpetuar labels engañosos.
- `/escritorio` sigue siendo home personal/operativo. Añade un widget “Prioridades de hoy” cuando el plugin y permisos estén activos.
- Meta Ads conserva su dashboard especializado; el panel Marketing enlaza/drilldown allí.
- Finanzas, Ventas, Customers, Operations y Equipo conservan sus pantallas de dominio.

### 12.3 Composición de panel

Cada panel prioriza decisiones:

1. **Qué requiere atención ahora:** prioridades/alertas.
2. **Estado:** pocas métricas primarias, con calidad/freshness visibles.
3. **Cambio:** comparación y tendencia cuando es comparable.
4. **Por qué:** contribuyentes/dimensiones y reason codes.
5. **Qué hacer:** drilldown a la entidad/fuente.

Una Metric Card incluye label, valor/unidad/moneda, delta, período, “datos al”, quality badge, fórmula accesible y link de detalle. Los gráficos se usan para tendencia/distribución; no reemplazan tablas de excepción ni prioridades.

Estados obligatorios:

- loading/empty/error;
- forbidden;
- plugin fuente desactivado;
- not supported;
- insufficient data;
- stale/partial;
- mixed currencies;
- período incompleto;
- proyección reconstruyéndose.

Responsive 360/768/1440, teclado, foco, contraste, reduced motion, tabla→cards en móvil y acciones críticas nunca solo en hover.

## 13. Eventos y jobs

### 13.1 Principio

Los eventos invalidan/actualizan proyecciones; **la fuente de dominio sigue siendo verdad**. Un reconcile periódico debe poder reconstruir snapshots y corregir un evento perdido.

Consumir, cuando existan mediante outbox:

- `contact.created`, `contact.stage_changed`, `contact.assigned`;
- `sale.created`, `sale.confirmed`, `sale.paid`, `sale.refunded`, `sale.cancelled`;
- `payment.received`, `receivable.overdue`, `payable.due`, movimientos/reversas;
- `membership.created`, `membership.expiring`, `membership.expired`, renovación paid/lost;
- `meeting.created`, `meeting.finished`, `meeting.outcomes.applied`;
- `ticket.created`, `ticket.first_responded`, `ticket.resolved`, `ticket.reopened`, `ticket.sla_breached`;
- `customer.health_changed`, `onboarding.created/completed/blocked`;
- `project.created`, `work_order.started/completed/blocked`, `task.assigned/completed/reopened/overdue`;
- `time_entry.approved`, `approval.requested/decided`, `blocker.created/resolved`;
- `team.goal.progress_updated/achieved`, `team.time_off.approved`, `commission.*`;
- `meta.insights_synced`, `meta.performance_alert`, connector sync results;
- `document.created/updated` cuando Conocimiento lo requiera.

Producir:

- `intelligence.metric_snapshot_updated`;
- `intelligence.projection_failed/recovered`;
- `intelligence.data_quality_degraded/recovered`;
- `intelligence.alert_opened/updated/acknowledged/snoozed/resolved`;
- `intelligence.priority_changed` opcional para refresco.

### 13.2 Jobs

- projector incremental, idempotente, watermark por team/projection;
- reconcile diario por dominio/rango;
- evaluador de vencimientos frecuente;
- evaluador estadístico solo al cerrar período;
- health/data quality scan;
- cleanup de snapshots según retención, nunca de hechos fuente;
- rebuild manual acotado con estado observable.

PostgreSQL outbox + worker/cron con `SKIP LOCKED` es la ruta inicial coherente con Arquitectura. Pusher notifica UI y `team_notifications` entrega avisos; ninguno reemplaza outbox.

## 14. IA y conectores

### 14.1 Herramientas semánticas

- `obtener_salud_empresa({fecha_corte, moneda?, alcance?})`;
- `obtener_prioridades_del_dia({fecha, departamento?})`;
- `obtener_panel_direccion({desde,hasta,comparacion})`;
- `obtener_panel_comercial(...)`;
- `obtener_panel_marketing(...)`;
- `obtener_panel_operaciones(...)`;
- `obtener_panel_clientes(...)`;
- `obtener_panel_equipo(...)`;
- `explicar_metrica({metrica,periodo,dimensiones})`;
- `comparar_periodos({metrica,actual,anterior})`;
- `listar_alertas_activas({severidad,tipo,responsable})`;
- `explicar_alerta({alerta_id})`;
- `obtener_calidad_datos({dominio?})`;
- `reconocer_alerta` y `posponer_alerta` como mutaciones limitadas.

Estas tools llaman al Metric/Alert/Priority Service común. No generan SQL, no recorren el catálogo readonly libremente y no replican fórmulas en cada conector.

### 14.2 Respuesta “¿Cómo está la empresa?”

La tool devuelve estructura antes de narrativa:

- período/timezone/corte;
- salud por dominio con estado `available/partial/...`;
- métricas con fórmula/version/freshness;
- cambios comparables;
- alertas activas;
- riesgos y datos faltantes;
- enlaces a drilldown autorizados.

La IA resume esa estructura y cita metric keys/reason codes. No afirma caja, margen, CAC o health si el estado es parcial/no soportado.

### 14.3 Controles

- scopes y permisos del usuario/conexión, sin privilegio propio;
- field-level redaction;
- límites de período/filas;
- sin notas, chats, documentos o transcripts completos salvo tool específica y permiso;
- acciones de alerta con confirmación e idempotency key;
- ninguna mutación de Finanzas/CRM/Tasks/Tickets desde una tool de Inteligencia;
- costo/uso del modelo no modifica la definición métrica;
- logs guardan keys/IDs y tiempos, no datasets sensibles.

## 15. Migraciones, backfill y rollback

### 15.1 Precondiciones

1. reconciliar migraciones/journal y esquema de producción;
2. definir active team y `getActivePluginRequestContext`;
3. aprobar Money/FX, AuditEnvelope, DomainEventEnvelope y outbox;
4. cerrar ownership de métricas y estados canónicos;
5. corregir seguridad/semántica de `/analytics` y agregados multi-moneda de Escritorio.

### 15.2 Secuencia aditiva

1. registrar manifest/permisos/rutas detrás de feature flag;
2. crear Metric Registry y queries directas de fuentes actuales;
3. crear alert policies/alerts y reutilizar notifications;
4. crear projection state;
5. crear snapshots solo para métricas aprobadas;
6. agregar vistas/proyecciones por dominio después de sus migraciones;
7. backfill por team/rango en lotes, con quality report;
8. comparar direct query vs projection y activar lectura cuando concilie;
9. habilitar alert evaluator y después IA;
10. convertir `/analytics` en redirect y añadir widget al Escritorio.

### 15.3 Backfill honesto

Se puede reconstruir:

- Meta daily desde insights existentes;
- ventas creadas por `createdAt` y pagadas por `paidAt` cuando consistente;
- finance entries por `occurredOn/dueOn/paidOn` como modelo actual;
- tasks por fechas/`completedAt` para conteos simples;
- contacts creados por `createdAt`;
- form submissions, events, documents y posts por timestamps.

No se reconstruye retroactivamente:

- stage transitions;
- seller attribution;
- campaign attribution;
- customer lifecycle/churn;
- ticket SLA;
- assignment/capacity;
- blockers/approvals;
- reunión finalizada/outcomes;
- caja real anterior a cuentas/movimientos.

Esas series comienzan al habilitar el contrato o importan historia solo desde una fuente verificable. Nunca se fabrican desde el estado actual.

### 15.4 Rollback

- desactivar plugin, projectors y evaluadores;
- mantener fuentes intactas;
- volver temporalmente a queries directas si una proyección falla;
- conservar snapshots/alerts para diagnóstico; son ignorados por código anterior;
- `/analytics` puede volver a la pantalla anterior durante rollback de UI;
- no hacer DROP automático de alertas/snapshots con historia;
- DDL inverso solo tras export/backup y verificación de consumidores;
- reconstruir una proyección, no editar snapshots manualmente.

## 16. Pruebas y criterios de aceptación

### 16.1 Unitarias de métricas

- fecha límite inclusiva/exclusiva y timezone/DST;
- período completo/incompleto y comparación equivalente;
- denominador cero;
- ratio sobre totales;
- money minor units, redondeo, reversas y monedas separadas;
- Meta tax, result types y reach no aditivo;
- medianas/percentiles para cycle time;
- completeness y availability;
- definición/version migration.

### 16.2 Reconciliación backend/DB

- agregado = suma del drilldown bajo mismo filtro;
- direct query = snapshot dentro de watermark;
- paid sales usa `paidAt`, no `createdAt`;
- tarea en varias locations se cuenta una vez;
- customer con múltiples contactos no duplica revenue/tickets;
- joins no multiplican facts N:M;
- backfill repetible no duplica buckets;
- rebuild corrige snapshot alterado;
- índices y `EXPLAIN ANALYZE` para rangos objetivo.

### 16.3 Alertas

- threshold, cooldown, fingerprint y retry;
- anomalía con mínimo volumen, baseline y estacionalidad;
- período incompleto no dispara caída falsa;
- stale/quality error inhibe regla dependiente;
- persistencia actualiza occurrence, no duplica;
- acknowledge/snooze/resolve/dismiss/reopen;
- resolución del dominio cierra alerta;
- notification failure no pierde alerta.

### 16.4 Permisos y privacidad

- owner/admin/agent/custom;
- cada permiso de panel;
- company/department/assigned/self;
- finance/compensation/customer/chat visibility;
- aggregate y drilldown consistentes;
- export/tool IA no amplían acceso;
- grupos pequeños/redacción;
- plugin fuente activo/desactivado.

### 16.5 Multi-tenant

Para cada metric, dimension, projection, alert y tool:

- team A no usa IDs/dimensiones/destinatarios de B;
- projection worker reclama y escribe el team correcto;
- cache key incluye team/user scope;
- alert fingerprint no colisiona entre teams;
- una FK simple mal vinculada se detecta/omite con quality error;
- responses 404/403 no revelan existencia.

### 16.6 Funcional/E2E

- abrir cada panel y cambiar rango/comparación;
- ver stale/mixed currency/not supported/partial;
- card→drilldown→entidad fuente;
- alerta→ack/snooze→notificación/estado;
- prioridad→acción en plugin dueño;
- widget Escritorio;
- redirects `/analytics` y navegación;
- tool “salud empresa” y “prioridades” con evidencia;
- 360/768/1440, teclado, foco, lector y reduced motion.

### 16.7 Regresión

- analytics anterior durante compatibilidad;
- Escritorio y sus preferencias;
- dashboards Finance/Sales/Memberships/Meta;
- CRM/chat visibility;
- Tasks OS y customers;
- readonly API/conectores;
- cron Meta y notifications;
- performance del proceso Next compartido.

DoD: no basta compilar. Se exige reconciliación numérica, definición/version, permisos, tenant isolation, quality/freshness, drilldown, alert lifecycle, IA, migración/rollback, observabilidad y documentación.

## 17. Fases de implementación

### Fase 0 — Seguridad y contratos

- corregir `/analytics` y agregados multi-moneda de Escritorio;
- aprobar contexto/permisos, Money/FX, eventos/outbox, auditoría y migraciones;
- aprobar MetricResult/registry, períodos y quality taxonomy;
- mapear disponibilidad por team/plugin.

### Fase 1 — Base sobre datos actuales

- plugin/permissions/UI shell;
- Dirección parcial, Comercial stock/ventas, Marketing Meta, datos básicos de Clientes/Tasks;
- metric cards, comparison, freshness/data-health y drilldowns;
- redirect compatible y widget Escritorio;
- sin atribución/CAC/ROAS ni scores inventados.

### Fase 2 — Alertas deterministas

- policies/alerts, deadlines, connector stale y quality;
- priorities today;
- notifications/Pusher;
- tools read-only principales.

### Fase 3 — Proyecciones de dominios implementados

- Finanzas real;
- Support/Customer health;
- Operations/Team capacity;
- Meetings follow-up;
- snapshots/reconcile e historial desde activación.

### Fase 4 — Atribución y anomalías

- contrato CRM stage history y marketing attribution;
- conversiones, CPL/CAC/ROAS;
- baselines estadísticos con volumen suficiente;
- IA explicativa y comparación avanzada.

### Fase 5 — Escala medida

- optimizar proyecciones/particiones/retención según volumen real;
- read replica o warehouse solo si PostgreSQL compartido deja de cumplir SLO demostrado;
- observabilidad de latencia, lag, costo y exactitud.

## 18. Riesgos y conflictos

| Riesgo/conflicto | Impacto | Decisión/mitigación |
|---|---|---|
| `/analytics` sin permiso/contexto interno | fuga tenant o acceso excesivo | corregir antes de reutilizar |
| Escritorio suma monedas y resultados heterogéneos | números falsos | separar por moneda/tipo; no elegir `salesRows[0]`/`max(currency)` |
| stage actual presentado como conversión | funnel engañoso | stock explícito; historia desde eventos/tabla CRM |
| `createdBy` usado como vendedor/assignee | ranking y comisión falsos | attribution/assignee explícitos |
| joins N:M duplican facts | revenue/tickets inflados | grain declarado, pre-aggregate y tests drilldown |
| Meta reach/result types no aditivos | marketing incorrecto | semantic adapter y quality flags |
| snapshots se vuelven fuente de verdad | divergencia silenciosa | rebuild/reconcile, watermarks y drilldown a source |
| eventos perdidos/duplicados | proyección/alerta incorrecta | outbox/inbox, idempotencia y reconcile |
| alert fatigue | usuarios ignoran señales | cooldown, severity, dedupe, mínimos y feedback |
| anomalía sobre período incompleto | falsos positivos | cierre de período y comparabilidad obligatorios |
| agregado revela datos ocultos | fuga interna | permission intersection y scope aplicado |
| costos/compensación en IA | privacidad | field policies y scopes específicos |
| data quality oculta | decisiones sobre datos malos | badges, availability y data-health |
| plugin transversal consulta HTTP interno | latencia/acoplamiento | query/services en proceso, Route Handler solo frontera |
| proyecciones globales pesadas | bloqueo DB | índices, lotes, SKIP LOCKED, SLO y materialización medida |
| migraciones divergentes | despliegue inseguro | reconciliar baseline antes de DDL |
| ausencia de tests actuales | regresión numérica/tenant | suites dedicadas antes de activación |

Conflictos a consolidar:

1. `teamSales.customerId` y `sellerUserId` son compartidos por Finanzas, Equipo, Clientes y Operaciones: una sola extensión en Sales.
2. Assignees/capacidad pertenecen a Tasks/Operaciones+Equipo: Inteligencia solo consume.
3. Marketing attribution necesita owner único; no ubicarla en tablas de Inteligencia.
4. Customer Health pertenece a Customers; Dirección consume el snapshot oficial.
5. Profitability y FX pertenecen a Finanzas; no crear fórmulas alternativas.
6. Alert events usan outbox/audit comunes; no crear infraestructura paralela.

## 19. Dependencias

- **Arquitectura:** active team, contexto de plugin activo, permisos, migraciones y service boundaries.
- **Finanzas:** Money/FX, cuentas/movimientos, obligations, allocations y profitability.
- **Reuniones:** event details, finish y outcomes.
- **Equipo:** profiles, assignees, schedules, time off, goals, attribution y privacidad.
- **Clientes y Soporte:** lifecycle, onboarding, tickets/SLA, health, feedback y renewal cases.
- **Operaciones:** work orders, project/task status, priority, blockers, approvals, time/cost.
- **Conocimiento:** clasificación/vigencia cuando exista.
- **Eventos:** outbox/inbox, envelope, retry, reconcile y audit.
- **IA/Connectors:** tool registry, scopes, redacción, confirmación y rate limits.
- **CRM/Marketing:** stage semantics/history y attribution campaign→lead→customer→revenue.

## 20. Decisiones para el plan maestro

1. Crear plugin transversal, no otro sistema de datos.
2. Migrar `/analytics` de forma compatible y conservar Escritorio como home operativo.
3. Metric Registry en código con owner/version/formula/unit/additivity.
4. Queries directas primero; views/projections reconstruibles solo por historia/escala.
5. Crear únicamente snapshots, projection state, alert policies y alert instances.
6. Separar moneda/result types y mostrar calidad/freshness siempre.
7. Bloquear CPL/CAC/ROAS/conversion history hasta contar con atribución/historia reales.
8. Alertas deterministas antes de anomalías estadísticas; IA solo explica.
9. Permission intersection y drilldown con exactamente el mismo scope.
10. Prioridades diarias enlazan a acciones de dominios dueños, no mutan desde Inteligencia.

## 21. Informe del agente

### Archivos e informes analizados

- `docs/business-platform/00-arquitectura-actual.md`;
- `docs/business-platform/10-finanzas.md`;
- `docs/business-platform/20-reuniones-comunicaciones.md`;
- `docs/business-platform/30-equipo.md`;
- `docs/business-platform/40-clientes-soporte.md`;
- `docs/business-platform/50-operaciones.md`;
- `lib/db/schema.ts` y migraciones/inventario relevante;
- `app/[locale]/(dashboard)/analytics/page.tsx` y `actions.ts`;
- `components/dashboard/analytics-charts.tsx`;
- `components/interface/Sidebar.tsx`;
- `lib/permissions.ts`, guards y plugin core;
- `lib/desktop/service.ts`, types, API y UI de Escritorio;
- Meta Ads: schema, sync cron, overview/detail, aggregate/types y UI;
- Finance: schema, overview, entries/receipts/sync y dashboard;
- Sales, Customers y Memberships: schema, APIs y dashboards;
- CRM/chats/messages/funnel/campaigns/forms;
- Task OS, Calendar, Notes, Documents y Files;
- Social Publisher, Domains, Hostinger, Sites y marketplace/pagos;
- `lib/readonly-api/catalog.ts` y conectores Grok/ChatGPT/Claude;
- `package.json` y suites actuales.

### Archivo modificado

- `docs/business-platform/70-inteligencia-control.md` únicamente.

### Decisiones

- Inteligencia es lectura/proyección/alerta, no owner de hechos operativos.
- No existe hoy base fiable para conversion history, CAC o ROAS.
- MetricResult incluye versión, fuente, watermark, quality, scope y drilldown.
- Dinero y Meta se segregan por moneda/tipo salvo conversión válida.
- Alert lifecycle es distinto de notification read state.
- Queries directas son default; snapshots se justifican por historia/escala.

### Riesgos

- seguridad de analytics actual;
- agregados multi-moneda/heterogéneos existentes;
- ausencia de historia/atribución;
- joins N:M y relaciones cross-team;
- event bus y auditoría aún inexistentes;
- alert fatigue y false positives;
- baseline de migraciones y tests insuficientes.

### Dependencias

- contratos de Arquitectura/Eventos/Money/Audit;
- implementaciones de Finanzas, Reuniones, Equipo, Clientes y Operaciones;
- owner de stage history y marketing attribution;
- aprobación de privacidad, freshness SLO y reporting timezone por tenant.
