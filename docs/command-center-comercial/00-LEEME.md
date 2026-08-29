# Command Center Comercial — planificación

Objetivo: **un sistema operativo comercial sobre WhatsPro** que lea el historial completo de cada chat, clasifique dónde se detuvo cada contacto en el funnel (G0–G11/GX), priorice por dinero y alimente una cola de acciones aprobables. Primero para limpiar la base histórica y cobrar ~USD 1.000 mientras se valida; después para operar los leads nuevos en tiempo real.

**No es otro CRM.** WhatsPro es la fuente de datos. El Command Center es una capa de lectura + análisis + priorización + cola. Durante la validación **no escribe en el CRM** (contactos, etapas, etiquetas, automatizaciones, mensajes, clientes, oportunidades): tiene sus propias tablas.

## Cómo está armada esta carpeta

| Documento | Responde a |
|---|---|
| 00 — Léeme | Misión, doctrina, decisiones ya tomadas, cómo usar la carpeta. |
| 01 — Diagnóstico de infraestructura | **A** qué existe, qué se reutiliza, qué no sirve, qué falta · **J** qué no se construye. Medido en código y en la base. |
| 02 — Arquitectura | **B** frontend, backend, persistencia, sincronización, workers, IA, eventos, colas, permisos. |
| 03 — Modelo de datos | **C** tablas, relaciones, estados, versionado, auditoría. |
| 04 — Motor de clasificación y prioridad | **F** cómo se determina G0–G11/GX, qué es determinístico y qué es IA, respuestas automáticas, cliente existente, pago pendiente · **G** fórmula de prioridad. |
| 05 — Pantallas y flujo operativo | **D** dashboard, listas, ficha, timeline, cola, radar, experimentos, métricas · **E** desde que entra un contacto hasta pago o descarte. |
| 06 — MVP, plan y riesgos | **H** qué se construye primero · **I** orden, dependencias, complejidad · **K** riesgos y cómo se resuelven. |
| 07 — Prompt Studio | Prompts ejecutables por los conectores (Claude / ChatGPT / Grok vía MCP `whatspro_*`) para auditar, clasificar, priorizar y preparar la cola **hoy**, sin esperar código. |
| ESTADO | Qué se investigó, con qué datos, y qué se decidió. |

## Doctrina (no se discute en cada pantalla)

- **Auditar todo. Contactar mucho. Concentrarse en quien responde.** La IA procesa volumen; las personas trabajan intención.
- **El historial del chat es la evidencia.** Etiquetas, etapas y campos viejos son señales secundarias; con 675 contactos "reorganizados" el 27/07 y etiquetas de producto que se usan tanto para clientes como para interesados, confiar en ellas es clasificar mal.
- **No reabrir decisiones ya tomadas.** Si pidió alias, no se le vuelve a explicar el producto. Cada contacto continúa desde su último compromiso real.
- **Éxito = dinero cobrado.** No hay métrica de vanidad en la pantalla principal.
- **Análisis y ejecución separados.** Nada se envía sin pasar por PENDIENTE → APROBADO → EJECUTADO → RESULTADO, con quién aprobó y qué se mandó.
- **Todo contacto termina en un destino:** RECUPERADO · COBRO · PENDIENTE CON FECHA · PRE-DESCARTE · DESCARTE DEFINITIVO · CLIENTE. No existe "seguimiento" como estado terminal.

## Decisiones tomadas en esta planificación

| Decisión | Valor | Por qué |
|---|---|---|
| Dónde vive | **Plugin nuevo `sales-ops`** en `/plugins/sales-ops`, con el shell móvil del Escritorio (`DesktopPage` + barra de píldoras + `MobileBottomNav`). | Un plugin = 9 registros conocidos (ver memoria Escritorio); `/plugins/` hereda la barra inferior móvil sin tocar nada; no colisiona con `/escritorio/bandeja` (Centro de Comandos de trabajo diario), que se reutiliza como motor de ejecución. |
| Capa propia de datos | **5 tablas nuevas** (`team_commercial_analysis`, `_analysis_versions`, `_actions`, `_signals`, `_experiments` + `_experiment_members`) y **2 de Prompt Studio** (`team_prompts`, `team_prompt_runs`). Una migración por fase. | El CRM no se toca; App Maker (jsonb sin índices) no aguanta 1.000 chats filtrados por prioridad. |
| Motor de clasificación | **Dos vías sobre el mismo contrato de salida**: (1) conector MCP —Claude/ChatGPT/Grok leen el chat con tools de sólo lectura y escriben la clasificación con **una** tool nueva—; (2) worker de servidor con `generateStructuredObjectForTeam` + banco de keys Gemini, para lotes grandes y para leads nuevos en tiempo real. | El banco Gemini gratuito rinde ~140 llamadas/día (7 keys × 20): clasificar 1.057 chats llevaría más de una semana. Con conectores se empieza **hoy**, y el worker queda para cuando haya key paga o para lo incremental. |
| Determinístico antes que IA | Cliente existente, G0, GX explícito, pago pendiente, automatización viva, respuestas automáticas y silencio se calculan en SQL/reglas; la IA decide entre G1–G10 y rellena motivo, objeción, necesidad, valor y siguiente acción. | Lo barato y verificable no se le pregunta a un modelo. |
| Prioridad | `prioridad = P(recuperación) × valor potencial (USD) × velocidad de cobro`, con tablas base por gate y factores por antigüedad, impactos previos y objeción (documento 04 §6). | Es la fórmula pedida; los factores se calibran con los experimentos. |
| Frente 1 primero | El primer lote que se clasifica es el **prefiltro determinístico de dinero**: chats donde nosotros mencionamos alias/CBU/transferencia/comprobante, contactos con `radar_prioridad = P1`, deals abiertos, `customData.cliente = true` sin venta registrada, etiquetas de producto sin cliente vinculado. | Son ~150 chats; de ahí sale la caja de la primera semana. |
| Meta de caja | Se lee de `team_sales` con `status = 'paid'` (+ `team_financial_entries` pagadas con `saleId`) dentro del período de la misión. Carlos registra cada cobro con `whatspro_register_sale` o desde Ventas. | Hoy hay **una** venta cargada. Sin registrar cobros la meta no se mueve: es una regla de operación, no de software. |
| Escritura al CRM | **Fase 6**, y sólo tres acciones con aprobación: enviar mensaje (motor del Centro de Comandos), crear tarea con fecha, registrar venta. Etapas y etiquetas del CRM **no** se tocan hasta que el equipo decida migrar la taxonomía G a etapas. | Es la regla de la misión. |
| Idioma y estilo | Español rioplatense en UI y prompts. Tokens del Escritorio. Móvil primero. | Igual que el resto del Escritorio. |

## Números que condicionan todo (equipo 2, 2026-08-29)

- **1.057 chats individuales** (4 grupos, 18 sin mensajes), **60.843 mensajes**: 27.197 del cliente, 33.646 nuestros (3.658 de automatización, 452 de IA, 666 notas internas).
- Entradas por mes: mar 86 · abr 231 · may 159 · jun 107 · jul 204 · ago 252. La base "histórica" es de marzo a julio: ~790 chats.
- **Silencio del cliente:** 618 chats con más de 30 días sin mensaje del cliente, 327 con más de 90.
- Respuesta del cliente: 81 chats con **cero** mensajes del cliente, 255 con **uno solo** (el "Hola, quiero más información" del anuncio: 566 chats arrancan exactamente así), 345 con 2–5, 376 con más de 5.
- Tamaño de un chat: mediana 3.650 caracteres / 10 mensajes; p90 8.500; máximo 294.000 (un cliente interno, se excluye).
- **13.773 audios** (23 % de los mensajes). Sólo 80 tienen ficha; 874 en cola. Un chat con audios sin transcribir se clasifica con `evidence_gap` y se encola la transcripción de esos audios primero.
- **205 sesiones de automatización activas** sobre 1.099 completadas; 3 flujos activos ("COMIENZO", "COMIENZO Argentina (Ads)", "COMIENZO Paraguay (Ads)"). Un contacto con sesión activa se marca antes de ofrecer cualquier acción.
- **Radar ya clasificó 81 contactos** (`radar_prioridad`: 24 P1, 38 P2, 16 P3, 3 descartados; `radar_intencion`, `radar_objecion`, `radar_recuperabilidad`, `radar_estrategia`). Se importan como **hipótesis previa** con su fecha, nunca como verdad.
- Clientes: 310 en `team_customers`, 136 contactos vinculados; `customData.cliente = true` en 101 contactos; etiquetas de producto "Membresía anual" en 274 contactos. Tres definiciones distintas de "cliente" — el motor las reconcilia (documento 04 §4).
- **Una sola venta cargada** (`team_sales`, pagada). Cero deals con etapa consultable, cero campañas, cero entradas financieras.
- No existe atribución al anuncio (`externalAdReply`/`referral` no se guardan). El "origen" se infiere del primer mensaje ("¡Hola! Quiero más información" = anuncio) y de `customData.origen_lead` (importaciones).

## Cómo usar esta carpeta

1. Leer **01** para no proponer nada que ya exista.
2. Con **07 (Prompt Studio)** se puede empezar la auditoría **hoy** desde Claude/ChatGPT con el conector, antes de que exista una sola tabla: los prompts están escritos para que el conector lea, clasifique y deje el resultado en documentos/notas propias sin tocar el CRM.
3. Para construir: pegar en Claude Code el bloque "Prompt de arranque" del documento **06 §5**, que apunta a la Fase 1.
