# Prompt Studio — prompts ejecutables por conectores

Qué es: una biblioteca de prompts **con contrato de salida y cadena de tools**, pensados para pegarse en Claude / ChatGPT / Grok con el conector `whatspro_*` conectado. Cada prompt lee de WhatsPro, razona con las reglas del documento 04 y **escribe sólo en la capa del Command Center** (documentos de esta carpeta, notas internas, y —cuando exista— la tabla de análisis). Ninguno cambia etapas, etiquetas, campos, automatizaciones ni clientes.

**v0 (hoy):** los prompts viven en esta carpeta de Documentos; el conector los encuentra con `whatspro_documents_search "Prompt Studio"`. Los resultados van a dos subcarpetas: **Auditoría** (lotes clasificados) y **Cola** (lotes propuestos/aprobados/ejecutados).
**v1 (hecho el 2026-08-29):** los prompts viven en `team_prompts` (versionados, keys `qa.*`) y se ven en la vista **Prompt Studio** del Command Center; cada botón **Encolar** crea una corrida en `team_prompt_runs` que el conector toma con `whatspro_sales_work_queue` (kind `run_prompt`) y cierra con `whatspro_sales_prompt_result`. Desde la ficha de un chat, **"Dejar un prompt al conector"** encola un texto libre con el contexto del chat. `whatspro_sales_prompts_list` devuelve las acciones y las corridas abiertas. Las tools `whatspro_sales_*` reemplazan los documentos como destino; esta carpeta queda como referencia y para prompts largos.

Reglas comunes a todos los prompts (van al principio de cada uno):

```
REGLAS DEL COMMAND CENTER COMERCIAL
1. WhatsPro es la fuente. Leé antes de escribir; todo id sale de un listado.
2. Durante esta fase NO uses whatspro_change_crm_stage, whatspro_set_contact_tags, whatspro_set_custom_fields,
   whatspro_save_contact, whatspro_manage_automation*, whatspro_chat_trigger_automation, whatspro_convert_lead,
   whatspro_manage_customer ni whatspro_delete_record. Si creés que hace falta, anotalo en "CRM a corregir".
3. El historial del chat es la evidencia. Etiquetas, etapa y campos radar_* son hipótesis con fecha.
4. Citá evidencia: cada gate lleva los ids de los mensajes que lo justifican. Sin evidencia, confianza < 55 y "Revisar".
5. No reabras decisiones tomadas: si pidió alias, eligió plan o dio fecha, la siguiente acción continúa desde ahí.
6. Un mensaje nuestro marcado isAutomation o isAi no es una respuesta humana. isInternal es una nota que el cliente nunca vio.
7. Enviar mensajes sólo con un lote APROBADO por escrito, uno por llamada, con idempotency_key = sales-ops:{fecha}:{chatId}.
8. Nunca escribas teléfonos completos en documentos: últimos 4 dígitos.
```

---

## P1 · Prefiltro de dinero (Frente 1)

**Para qué:** encontrar los ~150 chats donde probablemente hay plata detenida, antes de leer nada en profundidad.

**Cadena:** `whatspro_list_records messages {fromMe:true, search:"alias|cbu|cvu|transferencia|comprobante|seña|anticipo", limit:500}` → agrupar por `chatId` · `whatspro_list_records contacts {search custom_data radar_prioridad P1}` (o `whatspro_list_records contacts` y filtrar `customData.radar_prioridad = 'P1'`) · `whatspro_deals_list {open:true}` · `whatspro_list_records contact-tags` + `tags` (etiquetas "Membresía anual" / "A medida") · `whatspro_list_records contacts` con `customData.cliente = true` · `whatspro_customer_360`/`whatspro_list_records customer-contacts` para excluir a los vinculados a cliente · `whatspro_list_records automation-sessions {status:'active'}` para marcar flujo vivo.

**Salida (documento "Auditoría / P1 — prefiltro dinero — {fecha}"):** tabla `chatId · contactId · nombre · señal (pago_nuestro / radar_P1 / deal / tag_producto / cliente_custom) · último msg del cliente (fecha) · quién habló último · automatización activa · audios sin ficha (n)`, ordenada por: señal `pago_nuestro` primero, después fecha del último mensaje del cliente desc. Al final: conteo por señal y la lista de `messageIds` de audios a encolar con `whatspro_audio_queue_add` (sólo los de estos chats).

---

## P2 · Auditoría y clasificación de un chat

**Para qué:** el expediente + el gate G0–G11/GX + atributos + siguiente acción de **un** chat. Es el prompt central; P3 lo aplica en lote.

**Cadena:** `whatspro_get_record chats {id}` · `whatspro_list_records messages {chatId, limit:200, orderBy:timestamp asc}` (si hay más de 200, pedir primeros 40 y últimos 160 y anotar el hueco) · `whatspro_chat_media_list {chatId}` (trae transcripciones de audios con ficha; los sin ficha se citan como `[audio Ns sin transcribir]`) · `whatspro_contact_graph {contactId}` (cliente, deal, plata, citas, tareas) · `whatspro_list_records automation-sessions {chatId}` · `whatspro_get_record contacts {id}` (tags, funnelStage, customData: rubro, tipo_servicio, origen_lead, cliente, radar_*).

**Instrucción de razonamiento (pegar tal cual después de las reglas comunes):**

```
Armá primero el EXPEDIENTE: para cada mensaje relevante anotá {id, fecha, quién: cliente|humano|bot|ia|nota,
resumen de 1 línea, flags: precio|pago|objecion|compromiso|rechazo|auto}. Marcá "auto" si el mensaje del
cliente llega <5 s después de uno nuestro o tiene patrón de bot ("asistente virtual", "horario de atención",
"gracias por comunicarte"). Ignorá los "auto" para decidir si respondió.

Después aplicá las REGLAS en este orden y detenete en la primera que decida el gate:
R1 cliente existente → si contact_graph muestra cliente vinculado, venta pagada o suscripción activa: G11.
   Si sólo hay customData.cliente=true o etiqueta de producto: NO es prueba; decidí por el chat.
R2 entrada muerta → un solo mensaje del cliente (el del anuncio) + respuesta nuestra + silencio: G0.
R3 nunca contestado → mensajes del cliente y cero nuestros: G0 con acción "Responder ya" (Noelia).
R4 perdido → rechazo explícito, "no contactar", número inválido: GX.
R5 pago pendiente → nosotros mandamos alias/cuenta después de un compromiso, o el cliente pidió cómo pagar,
   y no hay pago: gate mínimo G9. Si nosotros prometimos datos/contrato/llamada/inicio y no hay rastro
   de que lo hicimos: G10.
Si ninguna decide, elegí entre G1..G8 por el punto MÁS ALTO con evidencia DEL CLIENTE (no nuestra):
G1 respondió algo básico sin explicar necesidad · G2 empezó a contar negocio/rubro/problema y quedó
incompleto · G3 necesidad concreta definida · G4 pidió precio, lo recibió y calló · G5 recibió ejemplos/
planes/propuesta y quedó evaluando · G6 objeción clara (precio, presupuesto, socio, tiempo, confianza,
comparación, materiales, decisión, más adelante) · G7 intención explícita de avanzar ("me interesa",
"lo hago el mes que viene", "cuando cobre") · G8 eligió una opción concreta (Combo Full, Tienda, Sitio,
Publicidad, otro).
max_gate = el más alto alcanzado alguna vez; drop_gate = donde se detuvo (= current salvo G11).

Devolvé EXCLUSIVAMENTE este JSON:
{ "chat_id": n, "contact_id": n|null, "nombre": "", "telefono_ult4": "",
  "current_gate": "G0..G11|GX", "max_gate": "", "drop_gate": "", "drop_reason": "<catálogo doc 03 §1>",
  "confidence": 0-100, "evidence": {"gate": ["msgId",…], "price": [], "objection": [], "intent": [], "payment": []},
  "source": "ads_meta|ads_cta_sitio|importacion|organico|presencial|desconocido", "first_contact_at": "YYYY-MM-DD",
  "business_type": "", "need": "sitio_web|tienda_online|combo_full|tienda_profesional|sitio_profesional|publicidad|contenido|desarrollo_medida|automatizacion|otro|indefinida",
  "need_detail": "", "quoted_price": {"amount": n, "currency": "ARS|PYG|USD"}|null, "proposal_summary": ""|null,
  "objection_type": "precio|presupuesto|socio|tiempo|confianza|comparacion|materiales|decision|mas_adelante|ninguna",
  "objection_detail": ""|null, "intent": "ninguna|curiosidad|evaluando|fuerte|compra_activa", "intent_score": 0-100,
  "temperature": "cold|warm|hot", "days_silent": n, "followups": {"total": n, "automated": n, "manual": n, "last_at": ""|null},
  "automation_active": bool, "is_existing_customer": bool, "customer_evidence": "customer_link|sale_paid|subscription|custom_data|tag_product|chat|none",
  "payment_pending": bool, "auto_reply_detected": bool, "evidence_gap": bool,
  "last_prospect_action": "", "last_team_action": "",
  "potential_value_usd": n, "collection_speed": "inmediata|dias|semanas|meses|indefinida",
  "recovery_probability": 0-100, "priority": n,
  "recommended_action": "<imperativa, ≤200 caracteres, continúa desde el último compromiso>",
  "recommended_owner": "noelia|carlos|produccion|ia|nadie",
  "suggested_status": "recuperado|cobro|pendiente_con_fecha|pre_descarte|descarte_definitivo|cliente|en_proceso",
  "next_action_at": "YYYY-MM-DD"|null, "notes_for_human": ""|null, "crm_to_fix": ""|null }

Valor (USD): sitio_web 45 · tienda_online 45 · combo_full 65 · tienda_profesional 220 · sitio_profesional 220 ·
publicidad 110 · contenido 65 · desarrollo_medida 330 · automatizacion 165 · otro/indefinida 45; si hay
quoted_price, convertí con ARS 1.000 = USD 1 y Gs 7.500 = USD 1 (fx provisorio).
Prioridad = P × valor × velocidad × 100, con P = base(gate) × antigüedad × impactos × objeción:
base G10 .85 G9 .70 G8 .60 G7 .50 G6 .35 G5 .30 G4 .20 G3 .20 G2 .12 G1 .07 G0 .03;
antigüedad ≤7d 1.0 · 8-30 .8 · 31-90 .55 · 91-180 .35 · >180 .2; impactos 0→1.0 1→.85 2→.65 3+→.4;
objeción ninguna 1 · tiempo/mas_adelante .8 · precio/presupuesto .6 · socio/decision .6 · comparacion .7 · confianza .5 · materiales .9;
velocidad inmediata 1 · dias .8 · semanas .5 · meses .25 · indefinida .15.
```

**Destino v0:** fila en la tabla del documento del lote (P3) y, si el operador lo pide, `whatspro_add_internal_note` con el texto `🧭 CCC {fecha} · {gate} · prio {n} · {recommended_action}` (idempotencia `ccc-note:{chatId}:{fecha}`).
**Destino v1:** `whatspro_sales_classification_write` con el mismo JSON.

---

## P3 · Lote de clasificación

**Para qué:** aplicar P2 a una lista (salida de P1 o de un filtro) y dejar un documento supervisable.

**Cadena:** por cada `chatId` de la lista → P2 → acumular. Al terminar: `whatspro_manage_document {folder: "Auditoría", title: "Lote {fecha} — {origen de la lista} — {n} chats"}` con: tabla (una fila por chat: nombre · G · prio · motivo · acción · responsable · confianza · gap) ordenada por prioridad desc, sección "Para revisar" (confianza < 55 o contradicciones), sección "CRM a corregir", conteo por gate, y el JSON completo de cada chat en un bloque de código al final (para importar en la Fase 1).

**Ritmo:** lotes de 20–30 chats por sesión; un documento por lote; nombrar el lote con fecha y hora para que sea idempotente entre sesiones (`whatspro_documents_search` antes de crear).

---

## P4 · Armar la cola de la semana

**Para qué:** convertir la auditoría en lotes de acción aprobables.

**Cadena:** `whatspro_documents_search "Lote"` (todos los lotes de Auditoría) → consolidar la última versión de cada chat (la de fecha más reciente gana; un override humano anotado en el documento gana siempre) → agrupar:

- **Cierre G10** (manual, Carlos): acción individual desde el último compromiso.
- **Cobro G9** (manual, Carlos): reenviar datos de pago + confirmar el plan elegido.
- **Compra elegida G8** (Carlos): cerrar precio y pedir seña.
- **Intención G7 / Objeción G6** (Noelia): mensaje individual que responde a la objeción anotada.
- **Reactivación G4–G5** (Noelia, lote con A/B): dos textos que retoman el precio/propuesta conocida.
- **Último intento G0–G3** (Noelia, lote): un texto corto que pide una respuesta de una palabra.
- **Pre-descarte**: los que ya tienen 3+ impactos sin respuesta o `>180` días y G0–G2. Sin mensaje.

Excluir siempre: `automation_active`, `is_existing_customer` (G11), `GX`, `auto_reply_detected` (para lotes), y quien recibió un mensaje nuestro en las últimas 72 h.

**Salida:** documento "Cola / Cola — semana {n} ({fecha})" con una sección por lote: criterio, cantidad, responsable, texto(s) con variables `{{nombre}}`, `{{plan}}`, `{{precio}}`, tabla de contactos (nombre · G · prio · último msg · texto final con variables resueltas · advertencias) y una línea final **"ESTADO: PENDIENTE APROBACIÓN"** que Noelia/Carlos cambian a **"APROBADO por {nombre} el {fecha}"** (pueden borrar filas antes).

---

## P5 · Ejecutar un lote aprobado (uno por uno)

**Para qué:** enviar lo aprobado, con rastro, sin duplicar.

**Cadena:** `whatspro_documents_search "Cola — semana"` → leer el lote con "ESTADO: APROBADO" → por cada fila: verificar de nuevo `whatspro_list_records messages {chatId, fromMe:false, limit:1}` (si el cliente escribió después de la aprobación, **saltar** y marcar "respondió antes del envío") y `automation-sessions` activas (saltar) → `whatspro_chat_send_message {chat_id, text, idempotency_key: "sales-ops:{fecha}:{chatId}", dry_run:true}` → si el dry run es correcto, la misma llamada sin `dry_run` → anotar `messageId` en la fila → al terminar, **"ESTADO: EJECUTADO {fecha} — enviados n · saltados n · fallidos n"**.

Nunca más de un envío por llamada. Nunca reintentar un envío con timeout: anotarlo como "desconocido" y enlazar el chat.

---

## P6 · Radar de respuestas (manual, dos veces por día)

**Para qué:** saber quién respondió y qué dijo, sin abrir 200 chats.

**Cadena:** `whatspro_list_records messages {fromMe:false, orderBy:timestamp desc, limit:300}` desde el último corte (guardar la fecha del corte en el documento "Respuestas") → agrupar por chat → clasificar cada respuesta nueva: `interesado · pide_informacion · precio · objecion · quiere_llamada · intencion_compra · pago · rechazo · respuesta_automatica · irrelevante` (reglas de auto-reply del P2; `pago` si menciona alias/transferencia/comprobante; `rechazo` si "no me interesa/no molestar") → cruzar con la Cola: si el chat estaba en un lote ejecutado, anotar "respondió al lote X".

**Salida:** documento "Respuestas — {fecha} {mañana|tarde}": primero las `pago`, `intencion_compra`, `quiere_llamada` (con el texto literal y el `chatId`), después el resto agrupado; las automáticas e irrelevantes al final, plegadas. Para cada `pago`/`intencion_compra`: `whatspro_create_contact_task {contactId, title:"Cerrar — respondió: …", due: hoy, assignee: Carlos}` sólo si el operador lo confirma.

---

## P7 · Meta de caja y ventas faltantes

**Para qué:** que la meta refleje la realidad.

**Cadena:** `whatspro_list_records sales {status:'paid'}` (período de la misión) + `whatspro_finance_summary` → total por moneda y en USD (fx provisorio) → comparar con las señales `pago` atendidas en los documentos "Respuestas" y con los `cobro` de la Cola → listar **cobros probables sin venta registrada** (chat, fecha de la señal, plan elegido).

**Salida:** documento "Meta de caja — {fecha}": `USD cobrado / 1.000`, tabla de ventas, tabla de "faltan registrar" con el comando sugerido `whatspro_register_sale {contact_id, items:[{name, unit_price}], currency, status:'paid', idempotency_key:"sale:{chatId}:{fecha}"}` para que Carlos lo confirme.

---

## P8 · Revisión de calidad del clasificador (set de control)

**Para qué:** medir antes de confiar.

**Cadena:** Noelia elige 50 chats y escribe su gate en un documento "Control — {fecha}" (sólo gate y una línea). El conector corre P2 sobre los 50 **sin leer el documento de control**, y después compara: acierto exacto, acierto ± 1, errores en G9–G11 (deben ser cero), y por qué falló cada uno (evidencia citada vs. la de Noelia).

**Salida:** documento "Control — resultado {fecha}" con la matriz de confusión y las 5 reglas del prompt que habría que ajustar. Sólo con ≥ 85 % (± 1) y 0 errores en G9–G11 se habilitan lotes de más de 30 contactos.

---

## P9 · Drenar la cola de trabajo (lo que el servidor no puede hacer con tokens)

**Para qué:** todo lo que el servidor no puede resolver solo —por falta de cuota/tokens de IA (clasificar chats, clasificar respuestas ambiguas, transcribir audios) o por diseño (los envíos aprobados no salen del servidor hasta la Fase 6)— queda en una cola y lo ejecuta el conector. **Este es el prompt de trabajo diario.**

**Cadena:** `whatspro_sales_work_queue {limit: 30}` → por cada ítem, seguir sus `steps` con sus `tools`:

| Tipo | Qué hace el conector | Devuelve con |
|---|---|---|
| `execute_action` | Envío/tarea/venta **ya aprobada por una persona**. Verificar que el cliente no escribió después de la aprobación; `whatspro_chat_send_message` con la `idempotencyKey` del ítem (`dry_run` primero). | `whatspro_sales_queue_result {action_id, status: executed\|failed\|skipped…, result_message_id, executed_via: "connector"}` |
| `classify` | `whatspro_sales_dossier` → prompt P2 → JSON del contrato. | `whatspro_sales_classification_write {chat_id, classification, connector}` |
| `classify_signal` | Clasificar la respuesta nueva (tipos del radar). | `whatspro_sales_signal_write {message_id, kind, confidence, urgent}` |
| `transcribe` | `whatspro_audio_queue_takeover` → escuchar. | `whatspro_audio_insight_write {message_id, transcript, summary, intent}` |

**Instrucción:** pegar después de las reglas comunes:

```
Pedí whatspro_sales_work_queue. Trabajá los ítems en el orden en que vienen (los envíos aprobados
primero, después clasificaciones del prefiltro de dinero, después respuestas nuevas, después audios).
Por cada ítem seguí exactamente sus "steps" y cerrá con la tool de resultado antes de pasar al
siguiente. Nunca reintentes un envío que dio timeout: reportalo como send_unknown con el chat.
Cuando termines el lote, volvé a pedir la cola; si viene vacía, informá cuántos ítems hiciste por tipo.
Límite por sesión: 30 ítems, o menos si el usuario lo pide.
```

**Salida:** al final de la sesión, un resumen (tipo · hechos · saltados · fallidos) en el documento "Cola / Sesión conector — {fecha}".

En la UI, "Hoy → Auditoría" muestra **"N pendientes de conectores"** (envíos aprobados sin ejecutar + chats sin analizar + desactualizados); ese número tiene que bajar después de cada sesión.

---

## Cómo se versionan (v0)

Cada prompt de este documento tiene un encabezado `P{n} · v{k} · {fecha}`; al cambiarlo se sube `k` y se anota qué cambió en el ESTADO. Los documentos de Auditoría/Cola/Respuestas citan la versión del prompt con la que se generaron en su primera línea (`generado con P2 v1`). En v1 esto pasa a `team_prompts.version` y `team_prompt_runs.prompt_fingerprint` automáticamente.

## Tools nuevas que estos prompts necesitan en v1 (no existen hoy)

| Tool | Tipo | Reemplaza |
|---|---|---|
| `whatspro_sales_dossier {chat_id}` | lectura | la cadena de 6 tools de P2; devuelve el expediente recortado y los `RuleFacts` |
| `whatspro_sales_pending {source: prefiltro\|stale\|all, limit}` | lectura | P1 |
| `whatspro_sales_classification_write {json del contrato, prompt_version}` | escritura en la capa | el documento de lote |
| `whatspro_sales_queue_list / _propose / _approve / _result` | lectura/escritura en la capa | los documentos de Cola |
| `whatspro_sales_signal_write` | escritura en la capa | el documento de Respuestas |

Todas entran en `PRIORITY_TOOLS` del conector, validan `teamId` y `chatId` por su cuenta y aceptan `dry_run`.
