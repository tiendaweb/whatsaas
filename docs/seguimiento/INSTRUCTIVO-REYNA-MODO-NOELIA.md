# Modo Noelia — instructivo para Reyna (2026-09-07)

## Mensaje para mandarle

> Reyna, te dejo todo listo para arrancar mañana.
>
> Preparamos **146 mensajes ya escritos** para contactos que quedaron colgados y que **nunca
> nadie tocó** desde el Command Center. Son US$ 12.579 en juego. **No se envió nada todavía**:
> están todos esperando que vos los mires y decidas.
>
> Entrás a WhatsPro → app **Command Center Comercial** → botón **⚡ Modo Noelia**.
>
> Te va a mostrar **un cliente por vez**, con el mensaje ya redactado. Vos leés y apretás un
> botón. No tenés que escribir nada salvo que quieras cambiarlo.
>
> Empezá por la cola **💰 Dinero ahora** (44 contactos, son los que están más cerca de pagar).
> Después **🔥 Oportunidades** (65) y por último **↗ Seguimientos** (37).
>
> Ojo con una sola cosa: **ENVIAR AHORA manda el mensaje de verdad, en el momento**. No es un
> borrador. Si dudás, usá PROGRAMAR o A LA COLA.
>
> Abajo te dejo el paso a paso.

---

## Mini tutorial

### Qué vas a ver en cada tarjeta

| Parte | Qué significa |
|---|---|
| **Nombre grande** | El cliente. Arriba, la píldora dice si es 🔥 ALTA o ⚡ PENDIENTE. |
| **Origen · Producto · Valor** | De dónde vino, qué pidió y cuánta plata hay en juego. |
| **RADAR DICE** | Lo que el sistema entendió del chat, con una cita textual del cliente. |
| **FOCUS RECOMIENDA** | Qué conviene hacer, y con qué nivel de confianza. |
| **MENSAJE LISTO** | El mensaje ya escrito. Esto es lo que sale si apretás ENVIAR AHORA. |
| **Badge de la derecha** | El estado. Arranca en ámbar y pasa a verde cuando resolvés. |

### Los botones

**Fila principal — las tres salidas del caso:**

- **✓ ENVIAR AHORA** *(atajo: A)* — manda el mensaje **en el momento**. El badge pasa a
  «✓ ENVIADO RECIÉN». Es real, no es un borrador.
- **⏰ PROGRAMAR** *(atajo: G)* — elegís cuándo sale: en 1 h, en 3 h, mañana 9:00, mañana 15:00,
  o la fecha y hora que quieras. Sale solo a esa hora.
- **🤖 A LA COLA** *(atajo: C)* — no lo mandás vos: le dejás una **indicación escrita** al
  conector de IA (por ejemplo «mejorá el texto con lo que veas en el chat y mandalo») y él lo
  mejora y lo manda. Usalo cuando el mensaje está bien pero querés que alguien lo afine.

**Fila chica — para trabajar el caso antes de decidir:**

- **Editar** *(E)* — cambiás el texto a mano.
- **IA** *(I)* — le pedís a la IA que lo cambie: «más corto», «más cálido», «quiero cerrar»,
  «no menciones el precio»… o lo que escribas vos.
- **Posponer** *(P)* — lo sacás por 24 horas.
- **Saltar** *(S)* — pasás al siguiente sin resolverlo. Vuelve a aparecer.
- **Por qué** — abre el detalle de por qué este contacto está primero.

**Para ver la conversación:** en la compu está a la derecha, siempre. En el celular, el botón
**Chat** arriba.

**Flechas ← →** para moverte entre casos.

### El orden que conviene

1. **💰 Dinero ahora — 44 contactos, US$ 5.313.** Gente que ya eligió, ya tiene precio o
   directamente quedó a un paso de pagar. Acá está la plata.
2. **🔥 Oportunidades — 65 contactos, US$ 5.141.** Recibieron precio y quedaron evaluando.
3. **↗ Seguimientos — 37 contactos, US$ 2.125.** Consultas viejas que quedaron sin respuesta.

El reloj de arriba a la derecha son bloques de 25 minutos. Cuando termina, te avisa y te ofrece
descanso. No hace falta terminar toda una cola de una sentada.

### Lo que tenés que saber sí o sí

- **No se envió nada todavía.** Los 146 están esperando tu decisión.
- **Los mensajes están firmados «Soy Noelia».** Salen por la línea de la empresa. Si preferís
  que digan otra cosa, cambialo con **Editar** antes de mandar.
- **Todos los mensajes reconocen que la pelota quedó de nuestro lado**, porque es lo que pasó:
  la mayoría preguntó algo y nunca le contestamos. Por eso arrancan pidiendo disculpas.
- **Ninguno inventa precios ni fechas.** Donde figura un precio, es el que quedó registrado en
  ese chat.
- **Si el cliente escribió después de que aprobaste, el sistema no manda** y te avisa. Está
  puesto a propósito para no escribirle encima a alguien que ya respondió.
- **5 contactos quedaron afuera solos** porque tienen respuesta automática detectada (Gio,
  Melania, Juanca, Garra duo, Construir Instante). El sistema los excluye para no hablarle a un
  bot.
- **Todo queda auditado**: quién aprobó, a qué hora, con qué texto y si se cambió respecto del
  original.

### Si algo sale mal

- **«No se pudo enviar»** en ámbar → el mensaje quedó aprobado pero el envío falló. Se puede
  reintentar desde la vista **Cola** del Command Center.
- **La IA no responde** → hay un tope diario de la cuenta de Google. Podés escribir el mensaje
  a mano con **Editar** y aprobarlo igual.
- **La cola no se actualiza sola** a propósito: si se recargara, los contactos se te moverían
  de abajo del cursor mientras trabajás.

---

## Resumen técnico (para Martín)

- **146 filas `proposed`** en 15 lotes, etiquetados `Noelia · …`. Ninguna aprobada, ninguna
  enviada.
- **Criterio de selección**: contactos con análisis comercial confiable (`confidence >= 55`) que
  **nunca tuvieron una acción** en `team_commercial_actions`, sin corrida de conector viva, sin
  automatización activa, que no son clientes, no están en descarte y no son GX.
- **Agrupados por situación real** (gate + objeción + si hay precio + si el nombre sirve), no al
  azar: cada lote tiene su propio texto.
- **Bug corregido en el camino**: `quoted_price` se guarda en unidades, no en centavos, y cuatro
  lugares lo dividían por 100. El `{{precio}}` de los mensajes le habría dicho «ARS 600» a un
  cliente cotizado en $60.000. Corregido en `queue.ts`, `traducciones.ts`, `FichaView.tsx` y
  `PanelResumen.tsx`.
