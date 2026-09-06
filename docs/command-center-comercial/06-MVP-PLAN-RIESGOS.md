# H · MVP exacto · I · Plan de implementación · K · Riesgos

## H · MVP: lo que se puede usar durante esta misión

El MVP tiene **dos velocidades**, y la primera empieza hoy sin escribir código:

### MVP-0 — con conectores, sin código (día 1)

Con lo que ya existe en el conector MCP (`whatspro_list_records`, `whatspro_chat_media_list`, `whatspro_contact_graph`, `whatspro_crm_followup_queue`, `whatspro_documents_*`, `whatspro_add_internal_note`, `whatspro_manage_task`, `whatspro_register_sale`) y los prompts del documento 07:

1. **Prefiltro de dinero** (prompt P1): el conector lista los chats donde nosotros mencionamos alias/CBU/transferencia/comprobante, los contactos `radar_prioridad = P1`, `customData.cliente = true` sin cliente vinculado, etiquetas de producto sin cliente. Salen ~150 chats.
2. **Auditoría + clasificación de cada uno** (prompt P2): el conector lee el chat, aplica las reglas del documento 04 y devuelve el contrato JSON.
3. **Registro sin tocar el CRM**: el resultado se guarda como **documento** en la carpeta "🧭 Command Center Comercial / Auditoría" (un documento por lote, tabla con una fila por chat) y, opcionalmente, como **nota interna** en el chat (`isInternal`, el cliente nunca la ve). Nota: las notas internas son mensajes; **no** son CRM (no cambian etapa, etiqueta ni campo). Si el equipo prefiere cero rastro en el chat, se usa sólo el documento.
4. **Cola manual** (prompt P4): el conector arma el documento "Cola — semana N" con los lotes propuestos por gate, la lista de contactos de cada lote y el texto por contacto. Noelia/Carlos aprueban escribiendo "APROBADO" en el documento.
5. **Ejecución uno a uno** (prompt P5): con un lote aprobado, el conector envía con `whatspro_chat_send_message` (idempotencia `sales-ops:{actionId}`, la que trae el ítem de la cola), uno por llamada, y anota el `messageId` en el documento.
6. **Radar manual** (prompt P6): dos veces al día, el conector lista mensajes entrantes desde el último corte (`whatspro_list_records messages fromMe=false`), los clasifica y actualiza el documento "Respuestas — fecha".
7. **Caja**: Carlos registra cada cobro con `whatspro_register_sale`; el prompt P7 arma el resumen de meta de caja.

Limitaciones honestas del MVP-0: no hay prioridad calculada automáticamente (el conector la calcula con la fórmula, pero no persiste como columna ordenable), no hay dashboard, y el volumen depende de la persona que opera el conector (unos 30–60 chats por sesión). Es suficiente para el **Frente 1**.

### MVP-1 — con código (Fases 1–3, ~2 semanas de trabajo efectivo)

1. Migración `team_commercial_analysis` + `_versions` + `team_prompts` + `team_prompt_runs`.
2. `buildChatDossier` + `rules.ts` + `classifier.ts` + `priority.ts`.
3. Tools MCP: `whatspro_sales_dossier` (lectura), `whatspro_sales_classification_write` (escritura en la capa), `whatspro_sales_queue_list` (lectura), `whatspro_sales_pending` (chats sin analizar por prioridad de prefiltro).
4. Cron `sales-ops-classify` con el banco Gemini (rinde lo que rinda; el resto por conector).
5. Pantallas Hoy · Dinero · Oportunidades · Barrido · Todos · Ficha (Resumen + Timeline). Sólo lectura.
6. Importación de los 81 análisis Radar y de la auditoría del MVP-0 como versión 0 (`reason: initial`, `analyzed_by: claude`).

Con MVP-1, el MVP-0 no se tira: los mismos prompts pasan a escribir en la tabla en lugar de en documentos.

## I · Plan de implementación

| Fase | Entrega | Depende de | Complejidad | Riesgo principal |
|---|---|---|---|---|
| **0 Descubrimiento** | Esta carpeta. | — | — | Hecha. |
| **MVP-0 Conectores** | Prompts P1–P7 en Prompt Studio v0 (documentos), carpeta "Auditoría" y "Cola". Operación sobre el Frente 1. | 0 | Baja | Consistencia entre sesiones del conector: se mitiga con el contrato JSON estricto y el documento maestro por lote. |
| **1 Modelo + auditor** | Migración 1, taxonomía, `dossier.ts`, `rules.ts`, tools `whatspro_sales_dossier` / `_pending`, Prompt Studio v1 (tablas), importación Radar + MVP-0. | 0 | Media | El recorte del chat para la IA (chats de 8 k+ caracteres): probar con los 20 más largos antes de fijar límites. |
| **2 Clasificador** | `classifier.ts` (contrato Zod), `priority.ts`, tool `whatspro_sales_classification_write`, cron `sales-ops-classify`, smoke sobre 50 chats etiquetados a mano por Noelia. | 1 | Media-alta | Calidad de gate: se mide contra 50 casos etiquetados; objetivo ≥ 85 % de acierto en gate ± 1 y 100 % en G9–G11. |
| **3 Dashboard sólo lectura** | Plugin `sales-ops` (manifest, permisos, nav), Hoy, listas, ficha con timeline, métricas de auditoría. | 1, 2 | Media | Rendimiento de la lista: índices por `(team, gate, priority)`; paginación por cursor. |
| **4 Cola operativa** | Migración 2, `queue.ts`, propuestas por gate, revisión de lote, aprobación con rol, experimentos con A/B, tools `whatspro_sales_queue_*`. | 3 | Media | Duplicados: índice parcial único por chat; expiración a 7 días. |
| **5 Radar** | Migración 3, `radar.ts`, cron 2 min (evento en el webhook después), vista Respuestas, Pusher `sales-ops:signal`, cancelación de acciones propuestas al responder. | 2 | Media | Auto-replies contados como respuestas: reglas §3 + revisión de las primeras 200 señales. |
| **6 Ejecución aprobada** | Adaptador cola → `executeCommandBatch` (kind `commercial`), acciones `create_task` y `register_sale`, resultados por contacto, experimentos alimentados solos. | 4, 5 | Media | Envío fuera de scope o doble: se hereda el motor; se prueba primero con `validation: true` sobre un lote real. |
| **7 Leads nuevos** | Captura de `externalAdReply` en el webhook (`chats.ad_source`), clasificación incremental por fingerprint, alertas de riesgo (04 §11), vista "Nuevos". | 5, 6 | Media | Tocar el webhook de Evolution (800 líneas, sin auth propia según auditoría): cambio mínimo, dentro de `after()`, con test de payload real. |

Orden estricto: MVP-0 arranca en paralelo con la Fase 1 y no la bloquea. Cada fase: `pnpm typecheck` + build en `.next-smoke` + smoke con puppeteer contra la base real + migración registrada en `_journal.json` + commit propio + deploy con `pnpm run deploy:saasfy`.

Estimación relativa (1 = un día de trabajo concentrado): MVP-0 0,5 · F1 3 · F2 4 · F3 4 · F4 3 · F5 3 · F6 2 · F7 3. Total ≈ 22 días-persona, con el Frente 1 produciendo caja desde el día 1.

## 5. Prompt de arranque para Claude Code (Fase 1)

```
Leé docs/command-center-comercial/00-LEEME.md, 01, 02, 03 y 04. Construí la Fase 1 del
Command Center Comercial: migración con team_commercial_analysis, team_commercial_analysis_versions,
team_prompts y team_prompt_runs (documento 03 §2, §3, §7), la taxonomía en
lib/plugins/sales-ops/shared/taxonomy.ts, buildChatDossier en lib/plugins/sales-ops/server/dossier.ts
(documento 04 §1, con el recorte para IA y los flags), rules.ts (R1–R11) y las tools MCP
whatspro_sales_dossier y whatspro_sales_pending registradas en PRIORITY_TOOLS. Importá los 81
análisis radar_* de contacts.customData como versión 0 con reason 'initial'. Nada escribe en
contacts, chats, tags, funnel ni automations. Cerrá con typecheck, build en .next-smoke, un smoke
que construya el expediente de los 20 chats más largos del equipo 2 y de 5 con audios sin
transcribir, y verificá con scripts/verify-connector-tools.mts que las tools aparecen.
```

## K · Riesgos y cómo se resuelven

| Riesgo | Cómo se manifiesta | Mitigación |
|---|---|---|
| **Clasificación incorrecta** | Un G9 tratado como G1 (se le vuelve a vender) o un G1 como G8 (Carlos pierde tiempo). | Evidencia obligatoria (ids de mensajes) o baja confianza → "Revisar". 50 casos etiquetados a mano como set de control antes de confiar en lotes. Override humano congela el gate. Versionado: nada se pisa. |
| **Cliente tratado como lead** | Se le manda "¿seguís interesado?" a alguien que paga membresía. | R1 con tres fuentes fuertes antes de la IA; en la revisión de lote, cualquier contacto con `customer_evidence ≠ none` sale resaltado y excluido por defecto. |
| **Acciones duplicadas** | Dos envíos al mismo contacto en el día; el mismo lote ejecutado dos veces. | Índice parcial único por chat en `approved/executing`; idempotencia derivada por el motor del Centro de Comandos (`batchId + chatId`); regla de 72 h; `send_unknown` no reintenta. |
| **Automatizaciones cruzadas** | El Command Center escribe mientras el flujo COMIENZO sigue activo y el bot responde encima. | R6: `automation_active` bloquea la propuesta de envío; cortar el flujo es un paso humano explícito y queda en la acción. 205 sesiones activas se listan en Limpieza para decidir en bloque. |
| **Respuestas automáticas** | El radar marca "respondió" y el contacto sale del barrido sin haber hablado nadie. | Reglas §3 del documento 04 (latencia < 5 s, texto repetido en ≥ 3 chats, patrones de bot). Señal `respuesta_automatica` plegada por defecto; no cancela acciones ni cambia gate. |
| **Seguimientos excesivos** | Un contacto recibe el "último intento" tres veces porque cada lote lo vuelve a incluir. | `followups_total` en el expediente; el prefiltro de lote excluye a quien recibió un envío del Command Center en 72 h y a quien ya tiene 3+ impactos sin respuesta (va a pre-descarte, no a otro mensaje). |
| **Datos inconsistentes** (etiqueta dice cliente, chat dice lead; etapa "Conversando" desde marzo) | Confianza mal puesta en el CRM. | El chat manda; la contradicción se anota en `notes_for_human` y se muestra en la ficha. Las etapas y etiquetas del CRM no se corrigen en esta fase: se acumula una lista "CRM a corregir" para después. |
| **Audios sin transcribir** (13.773 audios, 80 con ficha) | Un G9 decidido por audio parece G2. | R10: `evidence_gap`; se encolan primero los audios de los chats del prefiltro de dinero (≈ 300 audios, 2–3 días con el banco actual); el conector que sí escucha audio (`whatspro_audio_queue_takeover`) cubre el resto. |
| **Teléfonos y datos personales a la IA** | El expediente viaja a un modelo externo. | JID enmascarado (`maskJid`), nombres sí (necesarios para la acción), sin `mediaUrl`. Igual que el Centro de Comandos y el conector hoy. |
| **Meta de caja que no se mueve** | Se cobra pero nadie registra la venta. | Regla de operación explícita + prompt P7 que reclama ventas faltantes comparando señales `pago` atendidas con `team_sales`. |
| **Coste/cupo de IA** | Banco gratuito de Gemini agotado a las 10 de la mañana. | Motor doble (conector para lo prioritario, servidor para lo masivo cuando haya cupo); `capacidadDelBanco` antes de cada corrida; una key paga desbloquea todo por < USD 2. |
| **Deriva del prompt** | Se mejora el prompt y los análisis viejos dejan de ser comparables. | `team_prompts` versionado; cada análisis guarda `prompt_run_id`; las métricas se pueden filtrar por versión del prompt. |
