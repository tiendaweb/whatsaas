# Business OS — WhatsPro

Expansión de WhatsPro hacia un Business Operating System: siete aplicaciones
empresariales (Finanzas, Proveedores/Compras, RRHH/Comisiones, Reuniones,
Soporte, Contratos, BI) construidas **reutilizando** el CRM, Task OS, Calendar,
Notes, Customers, Sales y Memberships existentes en vez de duplicarlos.

Esta carpeta documenta lo que se implementó en **Fase 1** (Finanzas & Tesorería
+ Reuniones/Llamadas + Notas de reunión), **Fase 2** (Proveedores/Compras +
RRHH/Comisiones), **Fase 3** (Soporte/Postventa + Contratos) y **Fase 4**
(panel de dirección/BI).

## Documentos

| Archivo | Contenido |
|---|---|
| [`architecture.md`](./architecture.md) | Patrón de plugin, reutilización de entidades, decisiones de diseño. |
| [`database.md`](./database.md) | Tablas nuevas y columnas agregadas, con su propósito y relaciones. |
| [`permissions.md`](./permissions.md) | Permisos usados (todos ya existían) y cómo se validan. |
| [`api.md`](./api.md) | Endpoints REST nuevos por dominio. |
| [`events.md`](./events.md) | Qué hay de auditoría/notificaciones hoy y qué falta para eventos de dominio reales. |
| [`ai-tools.md`](./ai-tools.md) | Tools MCP nuevas para agentes IA (finanzas, reuniones, generación de tareas). |
| [`testing.md`](./testing.md) | Qué se testeó y con qué convención. |

## Estado por fase

- **Fase 1 (Finanzas + Reuniones/Llamadas + Notas de reunión): implementada.**
- **Fase 2 (Proveedores/Compras + RRHH/Comisiones): implementada.** Plugins nuevos
  `purchases` (proveedores, órdenes de compra e ítems) y `hr` (perfiles
  laborales sobre `teamMembers` existentes, reglas de comisión y comisiones
  por venta, liquidadas como egreso en Finanzas cuando ese plugin está
  activo). Migración `0069_business_os_phase2.sql`. `docs/business-platform/`
  no tiene un documento Codex dedicado a "Proveedores/Compras" (el más
  cercano, `50-operaciones.md`, es en realidad sobre especializar Task OS en
  órdenes de trabajo, un dominio distinto); `purchases` se diseñó desde cero
  con el mismo criterio pragmático. `hr` sí se aparta deliberadamente del
  diseño de `30-equipo.md`: comisión manual por venta (sin cálculo automático
  desde `sale.paid`), sin atribución multi-rol ni reversas, sin
  horarios/ausencias/objetivos.
- **Fase 3 (Soporte/Postventa + Contratos): implementada.** Plugins nuevos
  `support` (tickets con cliente/contacto/chat opcional, prioridad, estado,
  comentarios) y `contracts` (contratos por cliente con vigencia, valor y
  auto-renovación, opcionalmente enlazados a un documento del plugin
  `documents`). Migración `0070_business_os_phase3.sql`. Versión muy reducida
  frente a `docs/business-platform/40-clientes-soporte.md`, que además
  propone categorías, políticas SLA versionadas con snapshot, bitácora de
  eventos append-only, feedback CSAT/NPS, customer health score y casos de
  renovación — nada de eso se implementó. No hay tampoco documento Codex
  dedicado a "Contratos"; se diseñó igual que Compras, desde cero.
- **Fase 4 (BI/CEO Dashboard): implementada parcialmente.** Plugin nuevo
  `intelligence`, sin tablas propias: agrega en vivo sobre Finanzas, Ventas,
  Clientes, Compras, RRHH, Soporte y Contratos existentes (`GET
  /api/plugins/intelligence/overview` + `/revenue-trend`). Si un plugin fuente
  no está activo para el usuario, esa tarjeta se muestra como "no disponible"
  en vez de inventar un cero, siguiendo el mismo principio de
  `docs/business-platform/70-inteligencia-control.md` §6.4. **No implementa**
  la parte de "eventos de dominio + automatizaciones transversales" del
  título de esta fase: eso es exactamente el outbox/envelope/DLQ de
  `docs/business-platform/80-integracion-eventos.md`, la pieza de
  infraestructura más pesada de todo el plan Codex (idempotencia, orden,
  reintentos, catálogo canónico de eventos) y sigue siendo deuda técnica
  explícita, igual que en las fases 1-3. Además del panel Dirección, agrega
  dos paneles más con lo que ya existe en el repo:
  - **Comercial** (`GET /api/plugins/intelligence/commercial`): leads creados
    en el mes, stock de contactos por etapa de embudo, ventas del mes por
    estado, y "ventas por vendedor" como **proxy explícitamente marcado como
    incompleto** — usa `team_sale_commissions.userId` (Fase 2 RRHH) porque no
    existe una tabla de atribución de venta real; no cubre ventas sin
    comisión cargada. No implementa `sales.win_rate`, `sales.cycle_time` ni
    `crm.abandoned_leads` de `70-inteligencia-control.md` §6.2 (requieren
    outcome de CRM e historial de interacción calificante que no existen).
  - **Marketing** (`GET /api/plugins/intelligence/marketing`): gasto, CTR,
    CPC y CPM del mes agrupados por moneda, reutilizando `meta_campaign_insights_daily`
    y las mismas fórmulas de `lib/ads/aggregate.ts` que ya usa el plugin
    `meta-ads`. Deliberadamente **no** suma `results` entre campañas —
    `70-inteligencia-control.md` §6.3 advierte que tipos de resultado
    heterogéneos no son sumables — y no implementa `cpl`/`cac`/`roas` (piden
    atribución lead↔campaña que no existe).

  **No implementa** los paneles Operaciones ni Equipo de
  `70-inteligencia-control.md` §6.4/§6.6: requieren, respectivamente, el
  plugin `operations` (especialización de Task OS en órdenes de trabajo,
  `50-operaciones.md`, nunca construido) y el plugin `team-management`
  (perfiles laborales, capacidad, objetivos, `30-equipo.md` §6-7, del cual
  solo se construyó el subconjunto de comisiones en `hr`). Ninguno de los dos
  es una extensión chica sobre datos existentes — son dominios enteros sin
  construir, no una tarjeta más del dashboard.

## Nota sobre el plan paralelo de Codex

En `docs/business-platform/` existe un plan de arquitectura mucho más riguroso
(generado con Codex, ~9800 líneas) que propone un "Gate 0" de seguridad/
reconciliación de migraciones y un "Gate 1" de contratos compartidos
(Money/FX, EntityRef, AuditEnvelope, event outbox/inbox) **antes** de
implementar cualquier plugin empresarial, y un diseño más pesado para
Finanzas (ledger de doble entrada) y Reuniones (`team_meeting_details` 1:1).

Se decidió explícitamente (2026-08-14) seguir con la Fase 1 pragmática en vez
de ese Gate 0 primero. El diseño de esta carpeta es intencionalmente más
simple: extiende tablas existentes en vez de crear un ledger de doble
entrada, y no implementa outbox/inbox de eventos. Los riesgos de seguridad que
señaló Codex (`/analytics` con team arbitrario, webhooks sin auth robusta,
posible fuga cross-tenant, secrets de IA sin cifrar) siguen pendientes como
deuda técnica — no fueron introducidos por esta fase, pero tampoco se
resolvieron. Ver `docs/business-platform/99-plan-maestro.md` §18 y §21 para el
detalle completo si se decide abordarlos.
