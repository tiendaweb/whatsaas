# ESTADO — Command Center Comercial

## Fase 0 — Descubrimiento (hecha el 2026-08-29)

Se relevaron el código de WhatsPro (rama `feat/tareas-rediseno`) y la base del equipo 2 antes de diseñar. Todo lo que dicen los documentos 01–04 está verificado contra archivos, líneas y consultas reales de esa fecha. **No se escribió una línea de código del Command Center ni se tocó el CRM.**

### Cinco hallazgos que cambiaron el diseño

1. **Ya existe un motor de ejecución con aprobación** (`lib/desktop/command-center/`, `/escritorio/bandeja`): un envío por request, `confirm: 'EJECUTAR'`, idempotencia derivada por el servidor, auditoría. La "cola de ejecución" pedida no se construye: se enchufa (Fase 6).
2. **Radar ya clasifica contactos con IA** (`whatspro_radar_save_analysis`, 81 contactos con `radar_prioridad/intencion/objecion/recuperabilidad/estrategia`). La taxonomía G0–GX es una evolución de eso; los 81 análisis se importan como hipótesis previa con fecha.
3. **La infraestructura de IA del servidor tiene un techo real:** el banco de keys Gemini gratuito rinde ~140 llamadas/día. Clasificar 1.057 chats sólo en servidor llevaría más de una semana. Por eso el motor es doble (conector + servidor) y el MVP-0 corre con conectores desde el día 1.
4. **No existe atribución al anuncio, ni historial de etapas, ni registro de envíos por destinatario, ni Prompt Studio.** Los cuatro están en el plan; los dos primeros se infieren del chat mientras tanto.
5. **"Cliente" tiene tres definiciones distintas en la base** (136 vinculados, 101 con `customData.cliente`, 274 con etiqueta de producto) que no coinciden entre sí. El motor las reconcilia por fuerza de evidencia (04 §4) y el chat manda.

### Datos que condicionan (equipo 2)

1.057 chats · 60.843 mensajes (27.197 del cliente; 3.658 de automatización; 452 de IA; 666 notas) · 13.773 audios (80 con ficha, 874 en cola) · 255 chats con un solo mensaje del cliente y 81 con ninguno · 566 chats arrancan con "¡Hola! Quiero más información" · 618 chats con >30 días de silencio · 205 sesiones de automatización activas · 1 venta registrada · 0 deals consultables · 0 campañas · 0 entradas financieras.

### Decisiones tomadas en el diseño (cambiarlas = editar 00-LEEME)

Plugin `sales-ops` en `/plugins/sales-ops` · 5 tablas propias + 2 de Prompt Studio · motor doble con un contrato JSON · reglas determinísticas antes de la IA · prioridad P × valor × velocidad con tablas base · Frente 1 primero con prefiltro determinístico · meta de caja desde `team_sales` (Carlos registra) · escritura al CRM sólo en Fase 6 y sólo tres acciones.

### Preguntas para el equipo (no bloquean el MVP-0)

1. **Notas internas en el chat durante la auditoría, ¿sí o no?** Son mensajes `isInternal` (el cliente no las ve) y no cambian el CRM, pero dejan rastro en el chat. El MVP-0 asume **sólo documentos** salvo que se pida lo contrario.
2. **Tipo de cambio provisorio** ARS 1.000 = USD 1 y Gs 7.500 = USD 1 para la meta de caja. Confirmar o corregir en el setting del plugin.
3. **Tabla de valor por servicio** (04 §8): salió de los nombres de las automatizaciones. Confirmar precios vigentes AR y PY.
4. **Set de control:** ¿Noelia puede etiquetar 50 chats a mano (gate + una línea) antes de habilitar lotes grandes? Es la única forma de medir el clasificador.
5. **Transcripciones:** ¿se encolan primero los ~300 audios de los chats del prefiltro de dinero (2–3 días con el banco actual) o se carga una key paga de Gemini (< USD 2 para todo)?

## Construcción en paralelo — 2026-08-29 (Fases 1–5 hechas, sin desplegar)

Se construyeron las Fases 1 a 5 el mismo día, en paralelo por cuatro equipos con archivos asignados sin solapamiento, sobre un contrato compartido (`lib/plugins/sales-ops/shared/{taxonomy,contract,api-types}.ts`). Resultado verificado contra la base del equipo 2 con smokes que borran lo que escriben:

- **Fundaciones (integrador):** migración `0095_sales_ops.sql` **aplicada** (8 tablas: análisis + versiones, señales, acciones, experimentos + miembros, prompts + runs; índice parcial "un envío aprobado por chat"; plugin `sales-ops` activado sólo para el equipo 2), permisos `salesOpsRead/Write`, manifest, page-registry, lanzador de apps, agregador MCP `sales-ops-actions.ts` + `PRIORITY_TOOLS`. `/plugins/sales-ops` es **aplicación aparte** (takeover a pantalla completa como Tareas OS, decidido por el usuario).
- **Motor (Fases 1–2):** `server/{fingerprint,rules,dossier,priority,prompts,classifier}.ts`; prompts `sales-ops.classify` y `sales-ops.radar` sembrados en `team_prompts` v1; **81 análisis Radar importados** como versión 0 (`reason: import`); tools `whatspro_sales_pending/_dossier/_classification_write/_classify_server`; cron `sales-ops-classify`. Hallazgo: `generateStructuredObjectForTeam` no sirve con Gemini 2.5 (descarta el rol system y 1.000 tokens se los come el razonamiento) → el clasificador llama a `@google/genai` directo con `systemInstruction`, JSON mode y `thinkingBudget`. Clasificación real de prueba: G6, confianza 90, 13,6 s. Prefiltro de dinero real: **414 chats** (312 con datos de pago nuestros, 217 con etiqueta de producto, 24 radar P1).
- **UI (Fase 3):** shell propio (rail izquierdo, móvil con drawer y barra propia), Hoy, listas (Dinero/Oportunidades/Barrido/Limpieza/Todos), ficha con Timeline/Versiones/Acciones/Señales, Métricas, override manual de gate. Rutas `overview/contacts/contacts/[chatId]/metrics`.
- **Cola (Fase 4):** `server/{queue,experiments,housekeeping}.ts`, rutas `queue/*`, `experiments/*`, tools `whatspro_sales_queue_list/get/propose/approve/result`, vistas Cola y Experimentos, cron `sales-ops-housekeeping`. Aprobar no envía.
- **Radar (Fase 5):** `server/radar.ts` (reglas antes de IA, auto-reply, urgencia, cancelación de propuestas al responder, Pusher `sales-ops:signal`), rutas `signals/*`, tools `whatspro_sales_signals_list/_signal_write/_radar_scan`, vista Respuestas, cron `sales-ops-radar`. Barrido real de 3 días: 450 respuestas → 351 interesado · 80 pide info · 6 precio · 4 llamada · 1 pago · 2 rechazo.
- **Cola de trabajo para conectores (pedido del usuario):** `server/work-queue.ts` + tool `whatspro_sales_work_queue` + ruta `work` + contador "pendientes de conectores" en Hoy + prompt **P9** en el doc 07. Todo lo que el servidor no puede hacer con tokens (clasificar, clasificar respuestas, transcribir) y los envíos aprobados quedan encolados y los ejecuta el conector, que devuelve el resultado por las tools de escritura.

**Desviaciones respecto al plan:** una sola migración para las Fases 1–5 (en vez de una por fase) para permitir el paralelismo; UI en español hardcodeado (sin namespace i18n `SalesOps`) por la misma razón; `priority = P × valor × velocidad` sin el ×100 (los ejemplos del doc 04 ya estaban en esa escala); el conector se identifica por input (`GrokActionContext` no lo trae).

**Desplegado el 2026-08-29** (`pnpm run deploy:saasfy`, commits 70a5cff y a9688d6) y crons registrados en PM2: `sales-ops-classify` (*/15), `sales-ops-radar` (*/2), `sales-ops-housekeeping` (04:15). Disponible para los tres conectores (Claude, ChatGPT, Grok comparten el handler MCP); las instrucciones del servidor MCP mencionan `whatspro_sales_work_queue`. En la UI: vista Cola → bloque "Cola de conectores" con conteos y botón "Copiar prompt P9"; ficha → "Clasificar ahora" que, sin cuota de IA, avisa que el chat quedó en la cola de conectores.

**Falta (en orden):** cargar keys con cuota en el banco Gemini del equipo 2 o una key paga; set de control de 50 chats (P8) antes de lotes grandes; Fase 6 (ejecución desde el servidor vía `executeCommandBatch`) y Fase 7 (leads nuevos, atribución al anuncio).

## Fases

| Fase | Estado |
|---|---|
| 0 Descubrimiento | ✅ 2026-08-29 |
| MVP-0 Conectores (Prompt Studio v0, P1–P9) | ✅ prompts listos; subcarpetas Auditoría (75) · Cola (76) · Respuestas (77) creadas |
| 1 Modelo + auditor | ✅ 2026-08-29 (sin desplegar) |
| 2 Clasificador | ✅ 2026-08-29 (motor servidor + conector; sin desplegar) |
| 3 Dashboard sólo lectura | ✅ 2026-08-29 (sin desplegar) |
| 4 Cola operativa | ✅ 2026-08-29 (sin desplegar) |
| 5 Radar | ✅ 2026-08-29 (sin desplegar) |
| 6 Ejecución aprobada desde el servidor | ⏳ (hoy la ejecuta el conector vía P9) |
| 7 Leads nuevos | ⏳ |

## Relación con otros trabajos en curso

- **Seguimiento** (`docs/seguimiento/`): comparte el chat embebido (`ChatEmbebido`) y el panel lateral; la ficha del Command Center en escritorio reutiliza ese panel. Numeración de migraciones: la que se aplique primero toma `0095`.
- **Centro de Comandos del Escritorio** (`docs/escritorio-pulze/10-CENTRO-DE-COMANDOS.md`): motor de ejecución reutilizado en Fase 6; no se modifica su pantalla.
- **Radar** (`docs/radar/`): fuente de los 81 análisis previos y de los gráficos de Métricas.
- **Conectores** (`docs/conectores/ACCIONES-MCP.md`, `SKILLS-OPERATIVAS.md`): las tools `whatspro_sales_*` se registran con el patrón de `radar-actions.ts` y entran en `PRIORITY_TOOLS`.
