/**
 * P9 · Drenar la cola de trabajo — la instrucción de trabajo diario de un
 * conector (Claude / ChatGPT / Grok) con el conector de WhatsPro.
 *
 * Es UNA sola constante a propósito: la lee el botón "Copiar prompt P9" de la
 * Cola (ConectoresCard), la siembra el seed como skill `qa.p9-drenar-cola` y
 * la cita el doc 07. Si se edita acá, cambia en los tres lugares; si se
 * editara en uno solo, las tres copias se contradecirían en una semana.
 *
 * Sin 'use client': lo importan un componente cliente y un script de Node.
 */
export const PROMPT_P9 = `Pedí whatspro_sales_work_queue {limit: 30}. Trabajá los ítems en el orden en que vienen (los pedidos y skills aprobados primero, después lo aprobado que el servidor no pudo ejecutar solo, después clasificaciones del prefiltro de dinero, después respuestas nuevas, después audios). Por cada ítem seguí exactamente sus "steps" y cerrá con la tool de resultado antes de pasar al siguiente. Si un pedido necesita una decisión humana, no la inventes: devolvé status "blocked" con human_request y el servidor lo reencola con la respuesta. Podés corregir el CRM del contacto que estás trabajando (etapa, etiquetas, campos) sólo en lo que contradice ese chat y de a uno; nada en lote, y no toques automatizaciones ni clientes. Un envío inmediato sólo desde una fila aprobada y con su idempotency_key; si el cliente escribió después de la aprobación, cerrá con whatspro_sales_queue_result status "failed" y result.error "customer_replied". Cobros: sólo whatspro_sales_register_payment desde una fila aprobada. Nunca reintentes un envío que dio timeout: reportalo como send_unknown con el chat. Cuando termines el lote, volvé a pedir la cola; si viene vacía, informá cuántos ítems hiciste por tipo. Límite por sesión: 30 ítems.`;
