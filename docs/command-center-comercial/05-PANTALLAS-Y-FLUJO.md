# D · Mapa de pantallas · E · Flujo operativo

> **Vigencia (2026-09-05):** aprobar ejecuta (`SERVER_EXECUTABLE_KINDS`: envío, programado, tarea, demo, pre-descarte, descarte, responsable, llamada; y desde el 2026-09-06 también registrar cobro), los conectores corrigen el CRM de a un contacto (sólo lo que contradice ese chat, nunca en lote), y los cobros van por `whatspro_sales_register_payment`. Lo que sigue describe el diseño original.

Móvil primero. Cada pantalla responde una pregunta concreta; si una pantalla no responde ninguna de las ocho preguntas de la misión, no existe.

| Pregunta | Pantalla |
|---|---|
| ¿Dónde está el dinero? | Hoy → bloque Dinero ahora · vista Dinero |
| ¿Quién necesita atención ahora? | Hoy → Siguiente mejor acción |
| ¿Quién respondió? | Respuestas |
| ¿Quién está esperando pago? | Dinero → G9 |
| ¿Quién está bloqueado por nosotros? | Dinero → G10 |
| ¿Qué puedo enviar masivamente? | Cola → lotes propuestos |
| ¿Qué contactos debo descartar? | Limpieza |
| ¿Cuánto recuperamos hoy? | Hoy → Meta de caja · Métricas |

## 1. Shell

`/plugins/sales-ops` con `DesktopPage` (título "Command Center", subtítulo con la fecha y el fingerprint global "Auditados 812 / 1.057") y barra de píldoras horizontal scrolleable:

**Hoy · Dinero · Oportunidades · Barrido · Limpieza · Respuestas · Cola · Todos · Experimentos · Métricas**

Filtro global persistente arriba a la derecha: **Responsable** (Todos · Noelia · Carlos · Producción). Noelia y Carlos abren la app con su filtro guardado (`team_radar_user_state` o `localStorage`).

## 2. Hoy (dashboard operativo)

```
META DE CAJA                     ████████░░░░░░░░  USD 420 / 1.000
                                 ARS 380.000 · Gs 0 · 3 cobros · última: ayer 18:40

DINERO AHORA  8      RESPONDIERON HOY  19      OPORTUNIDADES  47
BARRIDO  312         PRE-DESCARTE  180         CLIENTES  136

AUDITORÍA   812 / 1.057 analizados · 41 desactualizados · 23 para revisar · 874 audios en cola

SIGUIENTE MEJOR ACCIÓN                                  [Ver cola →]
1  Oscar Reyes        G10 · 187   Pasar datos de pago y confirmar tienda pro      Carlos   [Abrir]
2  Magic Baby         G9  ·  96   Reenviar alias; eligió tienda online el 14/06    Carlos   [Abrir]
3  Carina             G7  ·  15   Confirmar anticipo de septiembre (dijo "semana que viene") Noelia [Abrir]
4  Rosy               señal: pidió precio hace 2 h                                Noelia   [Responder]
5  Alan Giraldes      G6  ·  12   Objeción presupuesto: ofrecer plan en 2 pagos     Noelia   [Abrir]

DISTRIBUCIÓN                G0 ▇▇▇▇▇▇▇▇ 255   G1 ▇▇▇▇ 130   G2 ▇▇▇ 96   G3 ▇▇ 61   G4 ▇▇▇ 88
                            G5 ▇ 40   G6 ▇ 33   G7 ▇ 21   G8 ▏9   G9 ▏7   G10 ▏3   G11 ▇▇▇▇ 136   GX ▇▇ 78
```

- Los seis contadores son botones: llevan a la vista con el filtro aplicado.
- "Siguiente mejor acción" mezcla **señales nuevas** (radar) y **prioridad** (fórmula): una señal `pago`/`intencion_compra`/`quiere_llamada` siempre va arriba, después por `priority_score`.
- Todo el bloque cabe en una pantalla de 390 px: KPIs en 2 columnas, lista de 5 filas de 2 líneas.

## 3. Listas (Dinero · Oportunidades · Barrido · Limpieza · Todos)

Misma lista, distinto filtro por defecto:

| Vista | Filtro | Orden | Acción principal de fila |
|---|---|---|---|
| Dinero | G8–G10, status ≠ cliente | prioridad | Abrir ficha (Carlos) |
| Oportunidades | G4–G7 | prioridad | Abrir ficha (Noelia) |
| Barrido | G0–G3, status ∉ {pre_descarte, descarte} | antigüedad asc (los más nuevos primero) | Seleccionar para lote |
| Limpieza | status ∈ {pre_descarte, descarte_definitivo} ∪ GX | último impacto | Confirmar descarte / rescatar |
| Todos | ninguno | prioridad | Abrir ficha |

Fila (móvil, 2 líneas):

```
◯ Oscar Reyes                       G10 · 187 · 🔥
  Pasar datos de pago y confirmar…  hace 6 h · Carlos          [›]
```

Filtros secundarios en un `Sheet` inferior: gate (multi), motivo de caída, objeción, necesidad, origen, antigüedad (buckets), impactos previos, responsable, `evidence_gap`, `automation_active`, `stale`, "para revisar" (`confidence < 55`). Búsqueda por nombre/teléfono. Selección múltiple con checkbox → barra sticky "N seleccionados · Proponer acción ▾".

Paginación por cursor (`priority_score, id`), 50 por página; total en la cabecera.

## 4. Ficha del contacto

Pantalla completa en móvil (panel derecho en escritorio). Pestañas: **Resumen · Timeline · Chat · Acciones · Versiones**.

**Resumen** (todo lo del documento 03 §2, en este orden y con este énfasis):

```
Oscar Reyes · +54 9 11 ••• 4321 · chat 8123 · contacto 294
Entró 12/05/2026 por anuncio Meta ("¡Hola! Quiero más información")

G10 · CIERRE OPERATIVO BLOQUEADO        confianza 91 · analizado ayer por Claude
Máx. alcanzada G10 · cayó en G10 · motivo: faltó pasar datos de pago (nuestro)

RESUMEN IA
Fabricante de muebles/equipamiento. Hubo llamada el 20/05. Entendió el precio de
tienda profesional (ARS 200.000) y aceptó avanzar. Quedó esperando datos bancarios
nuestros; él junta fotos de productos.

ÚLTIMA ACCIÓN DEL PROSPECTO  "Dale, pasame los datos y arranco a juntar las fotos" · 6 h
ÚLTIMA ACCIÓN NUESTRA        llamada (nota interna de Noelia) · 20/05

NECESIDAD tienda_profesional · PRECIO CONOCIDO ARS 200.000 · PROPUESTA tienda pro + carga inicial
OBJECIÓN ninguna · INTENCIÓN compra_activa (92) · TEMPERATURA hot
IMPACTOS 0 (0 auto · 0 manuales) · ÚLTIMO IMPACTO — · AUTOMATIZACIÓN no · CLIENTE no (evidencia: none)
PROBABILIDAD 85 % · VALOR USD 220 · VELOCIDAD inmediata · PRIORIDAD 187

SIGUIENTE ACCIÓN  Pasar alias y confirmar tienda profesional; pedir las fotos por WhatsApp.
RESPONSABLE Carlos                                        [Proponer envío] [Crear tarea] [Registrar cobro]
DESTINO cobro                                              [Cambiar gate manualmente]
```

- Teléfono enmascarado salvo permiso `contacts`; nunca viaja al conector en claro.
- "Cambiar gate manualmente" crea una versión `manual_override` con motivo obligatorio.
- Los botones de acción **proponen** (crean fila `proposed` en la cola); no ejecutan.

**Timeline** (documento 03 §2 `evidence` + expediente): línea vertical con hitos, no todos los mensajes:

```
12/05  ANUNCIO         "¡Hola! Quiero más información"
12/05  BOT             flujo COMIENZO · 4 mensajes
12/05  CLIENTE         explicó negocio: muebles y equipamiento comercial          [ver]
13/05  HUMANO (Noelia) precio tienda profesional ARS 200.000                     [ver]
20/05  NOTA            llamada realizada, acepta avanzar                          [ver]
20/05  CLIENTE         "Dale, pasame los datos y arranco a juntar las fotos"  ⚑ compromiso
       ── silencio nuestro · 101 días ──
28/08  RADAR           sin señal
```

Cada hito enlaza al mensaje en la pestaña Chat. Los hitos salen de `flags` + `evidence` + cambios de `who`; los tramos sin hitos se colapsan en "silencio".

**Chat**: `ChatEmbebido` (cuando exista) o link al chat completo.

**Acciones**: historial de `team_commercial_actions` del chat con estado y resultado. **Versiones**: lista de análisis con `diff` y quién/qué motor.

## 5. Cola

```
LOTES PROPUESTOS                                                     [Nuevo lote]
Cierre G10 · 3 contactos · manual · Carlos                 pendiente aprobación   [Revisar]
Cobro G9 · 12 contactos · manual · Carlos                  pendiente aprobación   [Revisar]
Reactivación G4 · 70 contactos · mensaje A/B · Noelia      pendiente aprobación   [Revisar]
Último intento G0 · 200 contactos · mensaje · Noelia       pendiente aprobación   [Revisar]
Pre-descarte · 150 contactos · sin mensaje                 pendiente aprobación   [Revisar]

EN CURSO / HECHOS
Reactivación G4 (28/08) · 70 · enviados 68 · respondieron 9 · recuperados 4      [Ver]
```

Revisar un lote = lista completa de contactos incluidos (nombre, gate, último mensaje, texto que le llegaría con variables resueltas, aviso si `automation_active` o `auto_reply_detected` o si ya recibió un envío en 72 h), con checkbox por fila para sacar contactos, y **dos** botones: "Aprobar y \<verbo\> N" (pide rol) y "Rechazar lote". **Aprobar ejecuta** desde el 2026-09-05: lo que el servidor sabe hacer solo (`SERVER_EXECUTABLE_KINDS`) sale en el mismo request y la fila queda `executed`; el envío directo es el único que pide confirmación. Lo que queda `approved` sin ejecutar (una falla, o un lote aprobado con `execute:false`) se ejecuta después con "Ejecutar", un envío por acción y con clave idempotente `sales-ops:{actionId}`.

Hasta la Fase 6, "Aprobado" habilita la **ejecución por conector**: el prompt `sales-ops.execute-batch` (documento 07) lee el lote aprobado y envía con `whatspro_chat_send_message` (idempotencia = `sales-ops:{actionId}`), anotando `result_message_id` con la tool de resultado. Sigue siendo un envío por llamada y con humano mirando.

## 6. Respuestas (radar)

Lista de señales `new`, más reciente primero, agrupadas por tipo con conteo en la cabecera (Pago 1 · Intención 3 · Quiere llamada 2 · Precio 6 · Objeción 4 · Interesado 8 · Pide info 5 · Rechazo 2 · Automática 7 · Irrelevante 12). Fila:

```
💰 Magic Baby   "pasame el alias así hago la transferencia"   hace 12 min   G9→G9   [Abrir]  [✓ Atendida]
```

Las automáticas e irrelevantes vienen plegadas. Atender una señal la marca `handled` y, si vino de un lote, actualiza `responded_at` del experimento. Aviso en tiempo real (`sales-ops:signal`) para `pago`, `intencion_compra`, `quiere_llamada`.

## 7. Experimentos

Tarjeta por experimento con el embudo **Elegibles → Enviados → Entregados → Respondieron → Recuperados → Propuesta → Pago → Caja**, por variante A/B, con tasas y USD. Filtros por gate, mensaje, período. Un experimento se crea desde la Cola ("Nuevo lote" con dos textos) o a mano. La atribución de "pago" es por `team_sales.contact_id` dentro de los 30 días posteriores al envío (regla explícita, editable).

## 8. Métricas

Tabla y barras (Radar `whatspro_radar_query` sobre la tabla nueva como *source*, o `metrics.ts` en JS):

- Dinero cobrado (principal, por moneda y en USD al fx del plugin), por semana.
- Tasa de respuesta, recuperación, propuesta y pago **por gate**, **por antigüedad**, **por objeción**, **por impactos previos**, **por origen**.
- Ingreso por contacto y por gate. Tiempo medio a pago desde el primer contacto y desde la reactivación.
- Auditoría: cobertura (analizados/total), confianza media, % para revisar, % con hueco de evidencia, versiones por chat.

## E · Flujo operativo

```
ENTRADA (anuncio / orgánico / importación)
   │  webhook Evolution → chats/messages (ya existe)
   ▼
EXPEDIENTE  buildChatDossier                      (sin IA, en segundos)
   ▼
REGLAS  R1 cliente · R2 G0 · R3 nunca contestado · R4 GX · R5 pago · R6 automatización · R7 auto-reply · R8-R10
   ▼
CLASIFICACIÓN IA  (servidor o conector) → gate, motivo, atributos, acción, responsable, versión N
   ▼
PRIORIDAD  P × valor × velocidad → priority_score
   ▼
┌──────────────── FRENTE 1: DINERO RÁPIDO (G10 → G9 → G8 → G7 → G6) ────────────────┐
│ individual · continúa desde el último compromiso · Carlos (G8–G10) / Noelia (G6–G7) │
│ acción: proponer mensaje / llamada / registrar cobro → cola → aprobación → envío    │
└─────────────────────────────────────────────────────────────────────────────────────┘
┌──────────────── FRENTE 2: LIMPIEZA (G0 → G1 → G2, y G3–G4 en segunda pasada) ──────┐
│ en volumen · lote con mensaje A/B · Noelia aprueba · un envío por request           │
│ responde → RADAR → señal → sale del barrido, re-clasificación, entra al funnel activo│
│ no responde al último intento (7 días) → PRE-DESCARTE (housekeeping propone)        │
│ rechaza → DESCARTE DEFINITIVO (aprobado por humano)                                  │
└─────────────────────────────────────────────────────────────────────────────────────┘
   ▼
DESTINO FINAL  recuperado · cobro · pendiente_con_fecha (obligatorio next_action_at) · pre_descarte · descarte_definitivo · cliente
   ▼
CAJA  whatspro_register_sale / Ventas → team_sales.paid → Meta de caja · experimento.paid_at
```

Reglas del flujo:

1. Nadie envía nada a un contacto con `automation_active` sin cortar el flujo a mano primero (es una decisión humana; queda anotada).
2. Un contacto no recibe dos envíos del Command Center en 72 h (índice parcial de la cola).
3. Toda respuesta del cliente **cancela** las acciones `proposed`/`pending_approval` de ese chat: se re-clasifica antes de proponer otra cosa.
4. `pendiente_con_fecha` sin fecha no existe; al vencer la fecha, el housekeeping lo devuelve a la cola de su responsable.
5. `pre_descarte` sólo lo propone el sistema; `descarte_definitivo` sólo lo aprueba una persona. Un `pre_descarte` que responde vuelve solo a `recuperado`.
6. Producción entra sólo cuando la acción recomendada lo dice (`recommended_owner = produccion`: demo, maqueta, evidencia, solución técnica).
