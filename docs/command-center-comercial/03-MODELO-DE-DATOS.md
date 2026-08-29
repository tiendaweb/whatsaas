# C · Modelo de datos

Capa propia, derivada, versionada. **Ninguna tabla de WhatsPro cambia.** Todo cuelga de `teams`, y lo que apunta a `chats`/`contacts` usa `ON DELETE CASCADE` para no dejar huérfanos si algún día se borra un chat.

## 1. Taxonomía (constantes en `lib/plugins/sales-ops/shared/taxonomy.ts`)

```
GATES = ['G0','G1','G2','G3','G4','G5','G6','G7','G8','G9','G10','G11','GX']
GATE_ORDER: G0 < G1 < … < G11 ; GX fuera de la escala (perdido)

DROP_REASONS (motivo de caída, cerrado):
  sin_respuesta · curiosidad_no_desarrollada · diagnostico_incompleto ·
  precio_sin_reaccion · evaluando_sin_cierre · objecion_precio · objecion_presupuesto ·
  objecion_socio · objecion_tiempo · objecion_confianza · objecion_comparacion ·
  objecion_materiales · objecion_decision · objecion_mas_adelante ·
  intencion_sin_concretar · eleccion_sin_pago · pago_no_concretado ·
  bloqueo_nuestro_datos_pago · bloqueo_nuestro_contrato · bloqueo_nuestro_llamada ·
  bloqueo_nuestro_inicio · bloqueo_nuestro_informacion · ganado · rechazo_explicito ·
  numero_incorrecto · negocio_cerrado · incompatibilidad · no_contactar · desconocido

OBJECTIONS = precio · presupuesto · socio · tiempo · confianza · comparacion ·
             materiales · decision · mas_adelante · ninguna
NEEDS      = sitio_web · tienda_online · combo_full · tienda_profesional · sitio_profesional ·
             publicidad · contenido · desarrollo_medida · automatizacion · otro · indefinida
INTENT     = ninguna · curiosidad · evaluando · fuerte · compra_activa
TEMPERATURE = cold · warm · hot
COLLECTION_SPEED = inmediata · dias · semanas · meses · indefinida
OWNERS     = noelia · carlos · produccion · ia · nadie
STATUS (destino) = sin_analizar · en_proceso · recuperado · cobro · pendiente_con_fecha ·
                   pre_descarte · descarte_definitivo · cliente
SIGNAL_KINDS = interesado · pide_informacion · precio · objecion · quiere_llamada ·
               intencion_compra · pago · rechazo · respuesta_automatica · irrelevante
```

## 2. `team_commercial_analysis` — estado vigente de cada chat (1 fila por chat)

| Columna | Tipo | Notas |
|---|---|---|
| id | serial PK | |
| team_id | int → teams cascade | |
| chat_id | int → chats cascade | **UNIQUE (team_id, chat_id)** |
| contact_id | int → contacts set null | puede ser null (138 chats sin ficha) |
| version | int | = `team_commercial_analysis_versions.version` vigente |
| fingerprint | varchar(64) | sha256 del estado del chat al analizar (ver 02 §5) |
| stale | boolean default false | el chat cambió después del análisis |
| first_contact_at | timestamptz | primer mensaje del cliente |
| last_customer_message_at | timestamptz | |
| last_team_message_at | timestamptz | humano o bot |
| last_human_message_at | timestamptz | sólo humano |
| source | varchar(24) | `ads_meta` · `ads_cta_sitio` · `importacion` · `organico` · `presencial` · `desconocido` |
| source_detail | varchar(120) | texto del primer mensaje o `customData.origen_lead` |
| current_gate | varchar(4) | G0…GX |
| max_gate | varchar(4) | etapa máxima alcanzada |
| drop_gate | varchar(4) | etapa donde se detuvo (= current salvo G11) |
| drop_reason | varchar(40) | DROP_REASONS |
| business_type | varchar(120) | rubro |
| need | varchar(24) | NEEDS |
| need_detail | varchar(300) | |
| quoted_price | int | en unidad menor |
| quoted_currency | varchar(3) | ARS · PYG · USD |
| proposal_summary | varchar(600) | |
| objection_type | varchar(24) | OBJECTIONS |
| objection_detail | varchar(300) | |
| intent | varchar(16) | INTENT |
| intent_score | smallint | 0–100 |
| temperature | varchar(8) | |
| recovery_probability | smallint | 0–100 |
| potential_value_usd | int | USD enteros |
| collection_speed | varchar(12) | |
| priority_score | int | resultado de la fórmula, 0–10.000 para ordenar |
| followups_total | smallint | impactos nuestros después del último mensaje del cliente |
| followups_automated | smallint | de esos, `isAutomation` o `isAi` |
| followups_manual | smallint | humanos |
| last_followup_at | timestamptz | |
| automation_active | boolean | sesión activa al analizar |
| is_existing_customer | boolean | reconciliado (04 §4) |
| customer_evidence | varchar(40) | `customer_link` · `sale_paid` · `custom_data` · `tag_product` · `chat` · `none` |
| payment_pending | boolean | |
| auto_reply_detected | boolean | el cliente tiene respuestas automáticas |
| evidence_gap | boolean | audios sin transcribir u otro hueco |
| last_prospect_action | varchar(300) | frase literal |
| last_team_action | varchar(300) | |
| recommended_action | varchar(400) | siguiente mejor acción |
| recommended_owner | varchar(12) | OWNERS |
| status | varchar(24) | STATUS (destino), default `sin_analizar` |
| status_reason | varchar(300) | |
| next_action_at | date | obligatorio si `status = pendiente_con_fecha` |
| prior_radar | jsonb | los `radar_*` importados, con fecha (hipótesis previa) |
| analyzed_at | timestamptz | |
| analyzed_by | varchar(16) | `server` · `claude` · `chatgpt` · `grok` · `human` |
| provider / model | varchar | |
| created_at / updated_at | | |

Índices: `(team_id, current_gate, priority_score desc)`, `(team_id, status)`, `(team_id, recommended_owner, priority_score desc)`, `(team_id, stale)`, `(team_id, next_action_at)`.

## 3. `team_commercial_analysis_versions` — historial inmutable

Misma forma que la tabla vigente más `analysis_id`, `version`, `reason` (`initial` · `chat_changed` · `prompt_changed` · `manual_override` · `radar_signal`), `prompt_run_id` → `team_prompt_runs`, `evidence jsonb` (`{gate: [messageIds], price: [messageIds], objection: [...], intent: [...], payment: [...]}`), `diff jsonb` (campos que cambiaron respecto a la versión anterior), `created_by` (user o null si fue IA).

Regla: **nunca se sobreescribe**. Un nuevo análisis inserta una versión y actualiza la vigente; `diff` muestra qué cambió y `reason` por qué. Un override humano (`analyzed_by = 'human'`) **congela** el gate hasta que el chat cambie (`fingerprint` distinto), y la IA lo respeta como dato de entrada.

## 4. `team_commercial_signals` — radar de respuestas (1 fila por mensaje entrante clasificado)

| Columna | Notas |
|---|---|
| id, team_id, chat_id, contact_id | |
| message_id → messages cascade | UNIQUE (team_id, message_id) |
| kind | SIGNAL_KINDS |
| confidence | 0–100 |
| excerpt | varchar(300), texto del mensaje (o transcripción) |
| triggered_by_action_id → team_commercial_actions set null | si responde a un envío nuestro de las últimas 72 h |
| gate_before / gate_after | qué sugiere el radar; **no** cambia `current_gate` solo: marca `stale` y encola re-clasificación |
| status | `new` · `seen` · `handled` · `dismissed` |
| handled_by, handled_at | |
| created_at | |

Índices: `(team_id, status, created_at desc)`, `(team_id, kind)`.

## 5. `team_commercial_actions` — cola de ejecución (1 fila por contacto y acción)

| Columna | Notas |
|---|---|
| id, team_id, chat_id, contact_id | |
| batch_id | varchar(64): agrupa la propuesta ("Último intento G0 — 200 contactos") |
| batch_label | varchar(120) |
| experiment_id → team_commercial_experiments set null | |
| variant | varchar(8) (`A`/`B`) |
| kind | `send_message` · `create_task` · `register_sale` · `mark_pre_descarte` · `mark_descarte` · `assign_owner` · `schedule_call` |
| payload | jsonb (texto del mensaje con variables ya resueltas, fecha de tarea, etc.) |
| gate_at_creation | varchar(4) |
| status | `proposed` · `pending_approval` · `approved` · `executing` · `executed` · `resulted` · `rejected` · `expired` · `failed` |
| requires_role | `noelia` · `carlos` · `any` |
| proposed_by | `ia` · user id |
| approved_by, approved_at | quién aprobó (obligatorio para `approved`) |
| executed_at, executed_via | `command-center` · `connector` · `manual` |
| result_message_id | text → messages (el envío real) |
| result | jsonb (`{error, respondedAt, signalId, saleId, taskId}`) |
| scheduled_for | timestamptz |
| expires_at | timestamptz (una propuesta no aprobada en 7 días expira) |
| created_at, updated_at | |

Índices: `(team_id, status, scheduled_for)`, `(team_id, batch_id)`, `(team_id, chat_id, created_at desc)`.

Invariante: **una acción `send_message` `approved` por chat a la vez.** Se valida al aprobar (índice parcial único `(team_id, chat_id) WHERE kind='send_message' AND status IN ('approved','executing')`).

## 6. `team_commercial_experiments` + `team_commercial_experiment_members`

`experiments`: `id, team_id, name, hypothesis, segment_gates text[], message_a, message_b, started_at, ended_at, status (draft · running · closed), created_by`.

`experiment_members`: `experiment_id, chat_id, variant, eligible_at, sent_at, delivered_at, responded_at, recovered_at, proposal_at, paid_at, revenue_cents, currency`. UNIQUE (experiment_id, chat_id). Las fechas se llenan desde acciones, señales y ventas; las tasas se calculan en JS.

## 7. Prompt Studio — `team_prompts` + `team_prompt_runs`

`team_prompts`: `id, team_id, key varchar(64), title, purpose (classify · radar · next_action · followup_message · audit_dossier · custom), audience (server · connector · both), version int, status (draft · active · retired), system_prompt text, user_template text (con `{{variables}}`), output_schema jsonb (JSON Schema del contrato esperado), tool_chain jsonb (para conectores: la cadena de tools `whatspro_*` sugerida), notes, created_by, created_at`. UNIQUE (team_id, key, version). Un solo `active` por key (índice parcial).

`team_prompt_runs`: `id, team_id, prompt_id, prompt_fingerprint varchar(64), prompt_snapshot text, target_kind (chat · batch · signal), target_id, connector (server · claude · chatgpt · grok), status (completed · blocked · failed), input_tokens, output_tokens, summary, metadata jsonb, created_by, created_at`. Generaliza `team_task_ai_runs`.

## 8. Meta de caja

No tiene tabla. Se calcula:

```
cobrado = Σ team_sales.total WHERE status='paid' AND paid_at BETWEEN misión
        + Σ team_financial_entries.amount WHERE type='income' AND status='paid' AND sale_id IS NULL AND paid_on BETWEEN misión
meta    = plugin setting `sales-ops.cash_goal_usd` (default 1000) + tipo de cambio manual `sales-ops.fx` {ARS, PYG}
```
Por moneda, nunca sumadas entre sí sin el tipo de cambio explícito (invariante del snapshot comercial).

## 9. Auditoría

- Toda escritura de la capa pasa por `activity_logs` con `action = 'SALES_OPS_<VERBO>'` y `metadata` (`{chatId, batchId, actionId, version, connector}`). `action` es texto libre: no hay que tocar el enum.
- `team_prompt_runs` guarda el prompt exacto de cada corrida.
- Las acciones guardan `approved_by`/`executed_at`/`result_message_id`: quién, qué, a quién, cuándo, resultado.

## 10. Migraciones

| Migración | Fase | Contenido |
|---|---|---|
| `0095_sales_ops_analysis.sql` | 1 | taxonomía no (constantes), `team_commercial_analysis`, `_versions`, `team_prompts`, `team_prompt_runs` |
| `0096_sales_ops_queue.sql` | 4 | `team_commercial_actions`, `team_commercial_experiments`, `_members` |
| `0097_sales_ops_signals.sql` | 5 | `team_commercial_signals` |
| `0098_chat_ad_attribution.sql` | 7 | `chats.ad_source jsonb` (única columna nueva en una tabla del core, y sólo al final) |

Numeración a confirmar en el momento: Seguimiento reserva `0095` para `team_chat_panel_preferences` si se ejecuta antes; la que llegue segunda toma el número siguiente.
