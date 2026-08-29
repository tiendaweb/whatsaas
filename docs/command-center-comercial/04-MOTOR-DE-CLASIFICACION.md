# F · Motor de clasificación · G · Sistema de prioridad

Regla general: **lo que se puede calcular se calcula; lo que hay que interpretar lo interpreta la IA con evidencia citada.** Cada gate decidido por IA lleva los ids de los mensajes que lo justifican; si no puede citar evidencia, baja la confianza y el caso va a "Revisar".

## 1. El expediente (`buildChatDossier`) — sin IA

Entrada: `chatId`. Salida normalizada que consumen tanto las reglas como el prompt:

```
{
  chat: { id, remoteJid(enmascarado para IA), name, pushName, instance, lastCustomerInteraction, automationDisabled },
  contact: { id, name, funnelStage, tags[], customData: { rubro, tipo_servicio, origen_lead, cliente, monto, plan_contratado, radar_* } } | null,
  commercial: getContactCommercialSnapshot(...)  // deal, plata, cita, suscripción, cliente
  automation: { activeSession: {automationName, currentNodeId, since} | null, completedSessions: n }
  counts: { total, customer, human, bot, ai, internal, audiosTotal, audiosTranscribed }
  timeline: [ { id, at, who: 'cliente'|'humano'|'bot'|'ia'|'nota', type, text|transcript|'[audio 34s sin transcribir]'|'[imagen]'|'[documento nombre]', flags: ['precio','pago','objecion','compromiso'] } ]
  silence: { daysSinceCustomer, daysSinceUs, whoSpokeLast }
  followups: { total, automated, manual, lastAt }   // nuestros mensajes DESPUÉS del último del cliente
}
```

Recorte para la IA (los chats grandes): primeros 15 mensajes + últimos 60 + todos los que tengan `flags` + todas las notas internas; el resto se resume como "[… N mensajes omitidos entre fecha y fecha]". Máximo ~6.000 tokens. Un chat de 10.731 mensajes (interno) se excluye por lista.

`flags` se calculan con diccionarios (español rioplatense + guaraní básico para PY):

- `precio`: `precio|cuánto|cuanto sale|vale|costo|plan|\$|usd|gs\.?|mil|k\b|%`
- `pago`: `alias|cbu|cvu|transferencia|comprobante|seña|anticipo|pagar|pagué|pague|deposit|mercado pago|cuenta`
- `objecion`: `caro|no tengo|presupuesto|socio|pareja|más adelante|mas adelante|después|despues|lo pienso|comparar|otra empresa|no confío|desconf`
- `compromiso`: `lo hago|avanzo|arranquemos|dale|cuando cobre|la semana que viene|el mes que viene|te confirmo|quiero hacerlo|me interesa`
- `rechazo`: `no me interesa|no gracias|no molest|equivocado|bloque|baja|dejá de|deja de`

## 2. Reglas determinísticas (`rules.ts`) — se aplican antes y después de la IA

| Regla | Cómo | Efecto |
|---|---|---|
| **R1 Cliente existente** | ver §4 | `is_existing_customer`, `customer_evidence`. Si la evidencia es fuerte (`customer_link` o `sale_paid`) → `current_gate = G11`, `status = cliente`, la IA sólo rellena necesidad/oportunidad 2. Si es débil (`custom_data`, `tag_product`) → **la IA confirma** leyendo el chat. |
| **R2 G0 entrada muerta** | `counts.customer ≤ 1` y ese único mensaje es del anuncio (regex `quiero (más|mas) informaci|me gustaría conseguir más|quiero crear mi`) o dura < 10 minutos, y hubo respuesta nuestra, y no hay mensaje posterior del cliente | `current_gate = G0`, `drop_reason = sin_respuesta`. **Sin IA.** 255 chats con un solo mensaje del cliente entran acá casi todos. |
| **R3 Nunca contestados** | `counts.human + counts.bot + counts.ai = 0` y `counts.customer ≥ 1` | `current_gate = G0` con `drop_reason = sin_respuesta` pero `recommended_owner = noelia`, `recommended_action = "Responder — nunca se le contestó"`, prioridad alta si es reciente. (20 chats.) |
| **R4 GX explícito** | último(s) mensajes del cliente con flag `rechazo`, o `chats.name` con "no contactar", o número inválido (`errorMessage` en nuestros últimos 3 mensajes) | `GX`, `status = descarte_definitivo` **propuesto** (nunca automático: queda `pre_descarte` hasta aprobación). |
| **R5 Pago pendiente** | ver §6 | `payment_pending = true`, gate mínimo G9. |
| **R6 Automatización viva** | `automation_sessions.status='active'` para el chat | `automation_active = true`; ninguna acción de envío se propone mientras esté activa. |
| **R7 Respuesta automática del cliente** | ver §3 | `auto_reply_detected`; esos mensajes no cuentan como "respondió". |
| **R8 Impactos** | nuestros mensajes después del último del cliente: `followups_total/automated/manual`, `last_followup_at` | alimenta prioridad y decide "último intento" vs "pre-descarte". |
| **R9 Silencio** | `daysSinceCustomer` desde `lastCustomerInteraction` | temperatura base: < 3 d hot, < 21 d warm, resto cold. |
| **R10 Hueco de evidencia** | `audiosTotal - audiosTranscribed > 0` y alguno de esos audios está entre los últimos 10 mensajes | `evidence_gap = true`; se encola la transcripción (`encolarAudios` con prioridad) y el análisis se marca `stale` cuando llegue. |
| **R11 Override humano** | versión vigente con `analyzed_by = 'human'` y mismo fingerprint | la IA no cambia el gate; sólo actualiza atributos. |

## 3. Detección de respuestas automáticas (del lado del cliente)

Un mensaje del cliente es auto-reply si cumple **dos** de:

1. Llega **menos de 5 segundos** después de un mensaje nuestro (Evolution marca `timestamp` al segundo).
2. Su texto normalizado (sin acentos, sin números, sin emojis) aparece **idéntico en ≥ 3 chats distintos** del equipo enviado por remitentes distintos ("Gracias por comunicarte con…", "En este momento no podemos atenderte", "Hola, soy el asistente virtual de…").
3. Contiene patrones de bot: `asistente virtual|horario de atención|fuera de horario|gracias por comunicarte|en breve te responderemos|menú|opción [0-9]`.
4. Se repite **exactamente** dentro del mismo chat ≥ 2 veces como respuesta a mensajes nuestros distintos.

Se guarda como `flags: ['auto']` en el timeline y no cuenta para `counts.customer` efectivo ni para `lastCustomerInteraction` efectivo (se recalcula ignorándolos). El diccionario de textos repetidos se construye una vez por corrida (query de `text` normalizado con `count(distinct chat_id) ≥ 3`).

## 4. Cliente existente — reconciliación de tres definiciones

Orden de fuerza:

1. `team_customer_contacts` vincula el contacto → **`customer_link`** (136 contactos). Fuerte.
2. `team_sales.status = 'paid'` para el contacto o el cliente → **`sale_paid`**. Fuerte.
3. `team_membership_subscriptions` activa → **`subscription`**. Fuerte.
4. `contacts.customData.cliente = true` → **`custom_data`** (101). Media: la IA confirma con el chat (buscar `pago|comprobante|listo|publicado|dominio|entregado`).
5. Etiqueta de producto "… · Membresía anual" / "A medida" sin ninguna de las anteriores → **`tag_product`** (274). Débil: en este equipo la etiqueta de producto se pone también a interesados. La IA decide entre G11 y G5–G8.
6. Nada → **`none`**.

Un contacto G11 con "oportunidad 2" (otro servicio) no vuelve a Frente 1: va a una vista propia (Clientes · upsell) fuera del alcance de la misión.

## 5. Origen (histórico, inferido)

| Señal | `source` |
|---|---|
| Primer mensaje del cliente ≈ "¡Hola! Quiero más información" / "me gustaría conseguir más información" | `ads_meta` (566 + 82 + 51 chats) |
| Primer mensaje ≈ "Hola! quiero crear mi sitio web + tienda…" / "mi tienda online profesional" | `ads_cta_sitio` (CTA de la landing) |
| `customData.origen_lead` empieza con "Importación" | `importacion` |
| `customData.origen_lead` = "Visita presencial" o etiqueta "Origen · Visita presencial" | `presencial` |
| Ninguna | `organico` si el primer mensaje es libre; `desconocido` si el chat arrancó con nosotros |

Fase 7 reemplaza la inferencia por `chats.ad_source` capturado del webhook.

## 6. Pago pendiente

`payment_pending = true` si alguna:

- Nuestro mensaje con flag `pago` **después** de un mensaje del cliente con flag `compromiso` o `precio`, y ningún `sale_paid` posterior.
- Mensaje del cliente que pide datos: `pasame el alias|cbu|cuenta|cómo pago|como pago|donde pago|link de pago`.
- `team_sales` en `draft`/`confirmed` para el contacto (criterio compartido con `pending-payment.ts`).
- `team_deals.stage = 'negotiation'` con `expected_close_date` vencida.

Si además el último mensaje es **nuestro** con datos de pago y el cliente calló → G9 (`pago_no_concretado`). Si el cliente pidió datos y **nosotros no respondimos** o prometimos llamada/contrato/inicio y no hay rastro → G10 (`bloqueo_nuestro_*`). Ese "no hay rastro" lo decide la IA con evidencia; la regla sólo levanta la bandera.

## 7. Clasificación por IA — contrato de salida

Prompt `sales-ops.classify` (documento 07 tiene el texto completo). Entrada: el expediente recortado + `RuleFacts`. Salida (Zod):

```
{
  current_gate: 'G0'|…|'GX',
  max_gate, drop_gate,
  drop_reason: DROP_REASONS,
  confidence: 0-100,
  evidence: { gate: string[], price?: string[], objection?: string[], intent?: string[], payment?: string[] }, // ids de mensajes del expediente
  business_type: string, need: NEEDS, need_detail: string,
  quoted_price: { amount: number, currency: 'ARS'|'PYG'|'USD' } | null,
  proposal_summary: string | null,
  objection_type: OBJECTIONS, objection_detail: string | null,
  intent: INTENT, intent_score: 0-100,
  is_existing_customer_by_chat: boolean,   // lo que dice el chat, para reconciliar con R1
  payment_pending_by_chat: boolean,
  last_prospect_action: string, last_team_action: string,
  potential_value_usd: number,             // según tabla de servicios (abajo); la IA sólo elige el servicio
  collection_speed: COLLECTION_SPEED,
  recommended_action: string,              // imperativa, ≤ 200 caracteres, continúa desde el último compromiso
  recommended_owner: OWNERS,
  suggested_status: STATUS, next_action_at: 'YYYY-MM-DD' | null,
  notes_for_human: string | null           // dudas, contradicciones, "revisar audio del 12/06"
}
```

Reglas del prompt que evitan los errores típicos:

- **"No reabrir decisiones":** si hay `pago`/`compromiso` en el timeline, la acción recomendada **continúa** desde ahí (p. ej. "Pasarle el alias y confirmar el plan Combo Full que eligió el 14/06"), nunca "preguntar si sigue interesado".
- **El gate es el punto más alto con evidencia del cliente**, no de nuestros mensajes: que nosotros hayamos mandado precio no es G4 si el cliente no lo pidió ni reaccionó (eso es G1/G2 con `precio_sin_reaccion` sólo si él preguntó).
- **Un mensaje de automatización nuestro no es una respuesta humana.** Se distingue en el expediente (`who: bot`).
- **Audios sin transcribir** se citan como hueco (`notes_for_human`), no se adivinan.
- **Contradicción entre CRM y chat** (etiqueta cliente pero el chat nunca llegó a pago): manda el chat, se anota la contradicción.

Post-proceso en `classifier.ts`: validación Zod; reconciliación con `RuleFacts` (R1 fuerte gana sobre `is_existing_customer_by_chat`; R2/R3 ganan sobre la IA; R5 sube el gate mínimo a G9); si `confidence < 55` o `evidence.gate` vacío → `status = en_proceso` y etiqueta interna "Revisar"; cálculo de prioridad; versión nueva.

## 8. Valor potencial (tabla, no IA)

| `need` | ARS (Argentina) | PYG (Paraguay) | USD equivalente inicial |
|---|---|---|---|
| sitio_web | 40.000 | 230.000 Gs | 45 |
| tienda_online | 40.000 | 230.000 Gs | 45 |
| combo_full | 60.000 | 350.000 Gs | 65 |
| tienda_profesional | 200.000 | 1.200.000 Gs | 220 |
| sitio_profesional | 200.000 | — | 220 |
| publicidad | según `quoted_price` o 100.000 | — | 110 |
| contenido | 60.000 | — | 65 |
| desarrollo_medida | `quoted_price` o 300.000 | — | 330 |
| automatizacion | `quoted_price` o 150.000 | — | 165 |
| otro / indefinida | 40.000 | 230.000 | 45 |

Los importes salen de los nombres de las automatizaciones del equipo ("PLAN COMBO FULL 60k", "Caracteristicas Sitio Web 40000", "Tienda Online Profesional 200k", "(PY) 350k Gs"…). Si la IA extrajo `quoted_price`, manda ese. El tipo de cambio es un setting del plugin (`sales-ops.fx`) editable; la tabla se revisa con el equipo antes de la Fase 2.

## 9. G · Prioridad

```
priority = P_recuperacion × valor_usd × velocidad × 100   (entero, para ordenar)
```

**P_recuperacion** = base(gate) × f_antigüedad × f_impactos × f_objeción × f_evidencia, acotado a [0,01, 0,95]:

| Gate | base | | Días desde último msg del cliente | f_antigüedad |
|---|---|---|---|---|
| G10 | 0,85 | | ≤ 7 | 1,00 |
| G9 | 0,70 | | 8–30 | 0,80 |
| G8 | 0,60 | | 31–90 | 0,55 |
| G7 | 0,50 | | 91–180 | 0,35 |
| G6 | 0,35 | | > 180 | 0,20 |
| G5 | 0,30 | | | |
| G4 | 0,20 | | Impactos sin respuesta (followups_total) | f_impactos |
| G3 | 0,20 | | 0 | 1,00 |
| G2 | 0,12 | | 1 | 0,85 |
| G1 | 0,07 | | 2 | 0,65 |
| G0 | 0,03 | | 3+ | 0,40 |
| G11 / GX | 0 (fuera de la cola) | | | |

f_objeción: ninguna 1,0 · tiempo/mas_adelante 0,8 · presupuesto/precio 0,6 · socio/decision 0,6 · comparacion 0,7 · confianza 0,5 · materiales 0,9. f_evidencia: `evidence_gap` 0,8; `auto_reply_detected` 0,7; `confidence < 55` 0,6.

**velocidad** (`collection_speed`): inmediata 1,0 · dias 0,8 · semanas 0,5 · meses 0,25 · indefinida 0,15. Se propone por gate (G9/G10 inmediata, G8 días, G7 semanas, ≤ G6 meses) y la IA la ajusta si el cliente dio fecha ("en septiembre" → meses).

Ejemplos con la tabla: Oscar Reyes (G10, combo/tienda pro USD 220, 6 h de silencio, 0 impactos, velocidad inmediata) → 0,85 × 220 × 1,0 = **187**. Carina (G7/G9, dos proyectos ≈ USD 130, "septiembre", 1 impacto) → 0,70 × 0,8 × 0,85 × 130 × 0,25 = **15**. Un G0 de abril con 2 seguimientos (USD 45) → 0,03 × 0,55 × 0,65 × 45 × 0,15 = **0,07**. La cola ordena exactamente como el instinto comercial: primero Oscar, después Carina, y los G0 sólo en barrido masivo.

**Prioridad se recalcula** en cada housekeeping diario (cambia `f_antigüedad`) sin crear versión nueva del análisis: es un campo derivado, la versión guarda los factores usados.

## 10. Radar de respuestas (Fase 5) — clasificación de cada mensaje entrante

Prompt corto `sales-ops.radar` sobre el mensaje nuevo + los últimos 6 del timeline + `current_gate`. Salida: `{kind: SIGNAL_KINDS, confidence, gate_after_suggested, urgent: boolean}`. Reglas antes de la IA: auto-reply (§3) → `respuesta_automatica`; flags `pago` → `pago` con `urgent = true` sin preguntarle a nadie; flags `rechazo` → `rechazo`. La IA sólo para lo ambiguo. Una señal `pago`, `intencion_compra` o `quiere_llamada` emite `sales-ops:signal` y sube el contacto a la cola de Carlos/Noelia al instante.

## 11. Leads nuevos (Fase 7) — riesgo de caída antes de que sea histórico

Con el radar y el fingerprint andando, el mismo clasificador corre incremental. Alertas de riesgo (housekeeping cada hora):

| Situación | Alerta |
|---|---|
| Recibió precio (nuestro mensaje flag `precio` tras su pregunta) y 24 h sin respuesta | riesgo G4 → proponer seguimiento |
| Eligió plan (G8) y 48 h sin pago | riesgo G9 → Carlos |
| Pidió alias/cuenta | inmediata (señal `pago`) |
| Nuevo lead sin respuesta humana en 2 h hábiles y sin automatización activa | "esperando respuesta" → Noelia |
| Automatización terminó (`completed`) y el cliente no siguió | riesgo G1 → barrido |
