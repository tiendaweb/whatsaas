# 08 — Focus: bloques de trabajo de 25 minutos

> Estado: plan aprobado, en ejecución. Rama `feat/tareas-rediseno`.
> Depende de: 02-ARQUITECTURA, 05-PANTALLAS-Y-FLUJO, 07-PROMPT-STUDIO.

## 1. Qué es

Una pantalla propia del Command Center donde **una persona procesa clientes de a
uno, contra reloj**, sin volver nunca a una lista. Entra, arranca un bloque de 25
minutos, y en cada cliente ve todo lo que necesita para decidir en una sola
pantalla: el resumen, lo que le va a salir programado, lo que la IA ya dijo, y el
chat. Decide, aprieta uno de dos botones, y pasa al siguiente.

No es una vista más del embudo. Las listas (Dinero, Oportunidades…) siguen siendo
para **elegir a quién**; Focus es para **hacerlo**.

La experiencia buscada es mitad juego, mitad herramienta profesional: cronómetro,
barra de progreso, contador de sesión y confeti al terminar una etapa, pero sin
un solo adorno que ocupe espacio que necesita el trabajo.

## 2. Por qué así

- **Un cliente por pantalla.** Hoy trabajar a alguien son cuatro lugares: la
  lista, la ficha, Programados y la Cola. Focus los junta y elimina la
  navegación entre ellos, que es donde se pierde el foco.
- **El tiempo es la unidad.** 25 minutos es un compromiso que se acepta; "vaciar
  Dinero" no. Al terminar el bloque se ofrece otro: la decisión de seguir se
  toma cada 25 minutos, no una vez.
- **Dos botones, no doce.** Cada cliente termina de una de dos formas: lo
  resolvió la IA del equipo acá mismo, o queda escrito para el conector. Todo lo
  demás (aprobar lotes, tocar el CRM) sigue viviendo donde ya vive.

## 3. Ruta y superficie

`/plugins/sales-ops?vista=focus`.

El plugin ya hace takeover del layout del dashboard (`scopes: dashboard.page`).
Focus **además** oculta el rail y el encabezado del propio Command Center: ocupa
el viewport entero. Recargar deja adentro; el estado de la sesión (etapa,
filtros, orden, índice y bloque) vive en `localStorage` bajo `sales-ops:focus:*`
con la URL como fuente de la etapa (`&etapa=`).

Una sola salida: **← Salir de Focus**, arriba a la izquierda, que vuelve a la
vista de la etapa. `Esc` no sale (cierra popovers); salir es deliberado.

## 4-bis. El celular no es la pantalla chica del escritorio

En el teléfono no entra ni una de las tres columnas, así que no se apilan: la
pantalla se parte en cuatro pestañas con una barra abajo, al alcance del pulgar.

**Acción · Chat · Programados · Datos.** Arriba queda fija la tarjeta del
cliente —grado, nombre y qué hay que hacerle—, porque eso es lo que no se puede
perder al cambiar de pestaña: es la razón por la que uno entró. Se pasa de
cliente **arrastrando la tarjeta** hacia el costado, como un mazo; las flechas
siguen ahí para quien no descubra el gesto, porque un gesto que no se anuncia no
puede ser la única forma de hacer algo.

**Los atajos son la función principal, no un adorno.** En el celular escribir el
prompt es el cuello de botella: entre teclado, autocorrector y una mano sola,
tipear "recordale el pago en dos renglones" cuesta más que leer el chat entero. Y
en una tanda el pedido es casi siempre el mismo, cambiando el cliente. Así que
arriba del cuadro de texto hay una fila de fichas que se tocan: primero la acción
recomendada de ESTE cliente, después lo que esta persona ya usó en esta etapa, y
al final una lista fija por etapa para el primer día. Un toque llena el pedido,
otro lo ejecuta.

**Las pestañas avisan.** Programados muestra cuántos tiene vivos; Acción, cuántos
pedidos volvieron pidiendo criterio humano. Sin eso había que entrar a mirar.

**La racha.** Clientes resueltos seguidos, sin saltear. Aparece a partir de dos.
Es lo único con forma de juego que hay, y está por una razón concreta: en el
celular la tentación es saltear al primero que da trabajo, y después al
siguiente. Ver el número volver a cero cuesta lo justo.

Detalles que se ganan o se pierden acá: "Ejecutar ahora" salta solo a la pestaña
Programados, porque el borrador aterriza ahí y si no parecía que no hubiera hecho
nada; cambiar de cliente vuelve a Acción, porque seguir en Chat mostraría otra
conversación sin aviso; y los filtros, que en escritorio viven en un popover de
la barra, en el celular se abren en una hoja desde abajo con **los mismos
controles** (`PanelFiltros`) — antes el teléfono simplemente no los tenía.

## 4. Layout de escritorio (≥ 1280 px)

```
┌───────────────────────────────────────────────────────────────────────────┐
│ ← Salir   ⏱ 18:42   Dinero  ▓▓▓▓▓▓▓░░░ 34/61   ✓12 esta sesión   ⚙ ⏴ ⏵ │  Barra
├───────────────┬───────────────────────────────────┬───────────────────────┤
│ RESUMEN       │ PROGRAMADOS            (0 px si   │  CHAT                 │
│ · gate + score│  no tiene ninguno)                │  (ChatEmbebido,       │
│ · radar SVG   │  editable en línea                │   se puede responder) │
│ · señales     ├───────────────────────────────────┤                       │
│ · dinero      │ CHAT IA                           │                       │
│ · gráfico     │  enviados / recibidos / en cola / │                       │
│   de impactos │  bloqueados con formulario        │                       │
│               ├───────────────────────────────────┤                       │
│  300 px       │ ▸ prompt…      [Ejecutar ahora]   │  420 px               │
│               │                [Listo p/ conector]│                       │
└───────────────┴───────────────────────────────────┴───────────────────────┘
```

**Columna izquierda — Resumen (300 px).** De `GET /contacts/{chatId}`
(`DetailPayload`, ya existe). Gate y estado con `GateBadge`, los seis ejes con
`ScoreRadar` (ya existe), señales del radar sin atender, valor potencial y
velocidad de cobro, y una franja de impactos (seguimientos hechos vs. días de
silencio). Nada nuevo del servidor.

**Centro arriba — Programados.** `ProgramadosContacto` con `soloSiHay`: si el
contacto no tiene ninguno **no ocupa un píxel**. Si tiene, se ven, se editan, se
pausan y se borran ahí mismo. El resultado de "Ejecutar ahora" aterriza en este
editor como borrador, listo para guardar.

**Centro abajo — Chat IA.** Las corridas del Prompt Studio de este chat
(`GET /prompts/queue?chatId=&status=all`), en el hilo de la conversación con la
IA: lo que se le pidió, lo que devolvió, lo que está en cola, y lo bloqueado con
su formulario de criterio humano (`HumanDecisionCard`, ya existe: botones,
select, texto, textarea y código). Es el único lugar de Focus donde una decisión
del conector se contesta.

**Columna derecha — Chat (420 px).** `FichaChat` con `ChatEmbebido`. Se puede
responder desde ahí.

**Barra de prompt.** Escribís qué querés que haga con este cliente y elegís uno
de los dos botones, que van **uno debajo del otro** y no lado a lado: con el
mismo tamaño y el mismo peso, en fila, se apretaba el equivocado. Arriba el que
se queda en la pantalla, abajo el que pasa al siguiente.

Recuerda el último texto por etapa (no por cliente): el 80 % de los pedidos de
una tanda son el mismo. Tiene una × para cortar esa herencia sin borrar a mano.

## 5. Los dos botones

### Ejecutar ahora
Corre el pedido **en el servidor con la IA del equipo** (Gemini, mismo camino que
el resto del plugin: proveedor del equipo → banco de keys) y **se queda en la
pantalla**.

Qué sabe hacer el servidor sin herramientas (`runSkillWithApi`): redactar. Todo
lo que sea *escribir o corregir un texto* —el mensaje programado, un borrador de
respuesta, la reescritura con otro tono— se resuelve acá y el resultado cae en el
editor de Programados de esta misma pantalla, para leerlo antes de guardarlo. Por
eso no avanza: el trabajo todavía no terminó, falta que una persona lo apruebe.

**Ejecutar ahora nunca envía un WhatsApp.** Redacta y deja programado; un envío
sigue pasando por proponer → aprobar → ejecutar, con clave idempotente. Esto no
se afloja: es el invariante 2 del Command Center.

Si el pedido necesita herramientas (mandar, tocar el CRM, armar la demo, crear el
proyecto en Tareas OS), el motor no puede y lo dice: la respuesta vuelve como
`mode: "conector"` con el motivo en una línea, y la pantalla resalta el otro
botón. No se inventa una ejecución a medias.

### Listo para conector
Encola el pedido (`launchRun`, `mode: queue`, ya aprobado porque lo escribió una
persona) y **avanza al siguiente cliente**. Con el prompt vacío encola la acción
recomendada del análisis, así pasar de largo sigue dejando trabajo hecho.

### Cómo se decide cuál
| Pedido | Botón | Después |
|---|---|---|
| Escribir / corregir el texto de un programado | Ejecutar ahora | Se queda |
| Redactar un borrador de respuesta | Ejecutar ahora | Se queda |
| Enviar, cobrar, cambiar etapa, etiquetar | Listo para conector | Avanza |
| Armar demo web o proyecto del cliente | Listo para conector | Avanza |
| El motor devuelve `conector` | Listo para conector | Avanza |

El servidor decide, no la UI: `POST /focus/run` clasifica y responde
`{ mode: 'texto', text }` o `{ mode: 'conector', reason }`. La UI sólo obedece.

## 6. La cola

Los clientes salen de `GET /contacts` (ya existe, con cursor). Focus le agrega:

- **Filtros multiselect**: Tipo (Dinero, Oportunidades, Barrido, Limpieza →
  traduce a `gates`), Gate suelto, Estado. Todos multiselect, todos en un solo
  popover, todos persistidos.
- **Orden**: Prioridad · Más nuevo · Más viejo · Grado (gate). Los dos últimos
  son nuevos en el backend (`sort: 'oldest' | 'gate'`).
- **Progreso**: `procesados / total` de la etapa, barra fina arriba. "Procesado"
  = se le ejecutó algo o se lo dejó para conector en esta sesión; saltar no
  cuenta. Dos cosas que la barra tiene que cumplir y que se probaron rompiendo:
  el denominador se fija con la PRIMERA página y no se toca más (en las
  siguientes el servidor ya cuenta menos, porque lo trabajado dejó de cumplir
  `queued=sin`, y repisarlo la hacía saltar sola), y el numerador se cuenta sobre
  todas las filas cargadas y no hasta el cursor (contando hasta el índice, volver
  atrás con la flecha hacía **retroceder** la barra, como si el trabajo se
  deshiciera por mirarlo de nuevo). `scripts/smoke-focus-progreso.mts` prueba las
  dos, más que el total declarado sea el que efectivamente se puede recorrer.
- **Sesión**: cuántos ejecutados, cuántos encolados, cuántos saltados, desde que
  se abrió Focus.
- **Prefetch**: al pintar el cliente N se pide el detalle del N+1. Pasar de
  cliente tiene que ser instantáneo.

Navegación: `⏵ Siguiente` (sin anotar nada), `⏴ Anterior`, `Saltar` (queda
anotado como saltado). Teclado: `→` / `←` navegan y `S` saltea, y sólo eso — los
dos botones se aprietan a mano a propósito: no hay una tecla que ejecute ni que
encole sin querer.

## 7. Etapas y confeti

Las etapas son las listas del embudo, en el orden en que conviene trabajarlas:
**Dinero → Oportunidades → Barrido → Limpieza**.

Cuando se agota la cola de la etapa actual, la pantalla central se reemplaza por
la tarjeta **"Etapa completa"** con confeti (canvas propio, ~60 líneas: una
librería pesa más que toda la vista, igual que `ScoreRadar` que dibuja su SVG a
mano), el resumen de lo hecho, y un botón para pasar a la siguiente etapa. Si no
queda ninguna, dice que terminó la ronda.

## 8. Bloques de 25 minutos

- Al entrar arranca un bloque de 25:00. El cronómetro es chico, arriba, y no
  parpadea ni suena mientras corre.
- El tic-tac vive en `<Reloj>`, aparte del hook. `useBloque` no cuenta segundos:
  agenda un `setTimeout` al instante exacto del vencimiento (y revisa contra el
  reloj real al volver a la pestaña, porque en segundo plano los timers se
  estiran). Con el intervalo adentro del hook, cada segundo se volvía a
  renderizar el Focus entero —las tres columnas y el chat embebido incluidos—.
- Se guarda el **instante de vencimiento** en `localStorage`, no los segundos
  restantes: así una recarga o una pestaña en segundo plano no lo desincronizan.
- Al llegar a cero: modal con lo hecho en el bloque y tres salidas —**Otro
  bloque** (25:00 de nuevo), **Descanso 5 min** (cronómetro corto, la pantalla
  sigue usable), **Salir**.
- Pausar y reanudar con un clic en el cronómetro. Nada bloquea el trabajo: el
  reloj informa, no manda.

## 9. Qué se toca

**Backend (chico):**
| Archivo | Cambio |
|---|---|
| `shared/api-types.ts` | `ListQuery.sort` += `'oldest' \| 'gate'` |
| `server/queries.ts` | `orderFor`: los dos casos nuevos |
| `api/…/contacts/route.ts` | el enum de zod, igual |
| `server/focus.ts` | **nuevo**: `ejecutarPedidoFocus` (redacta o dice que no puede) |
| `api/…/focus/run/route.ts` | **nuevo**: `POST { chatId, prompt, message? }` |

**UI (nuevo, en `ui/focus/`):** `FocusView` (elige pantalla y guarda el estado),
`BarraFocus` + `PanelFiltros` + `Reloj`, `FocusMovil`, `PanelResumen`,
`PanelChat`, `PanelChatIA`, `BarraPrompt` + `atajos.ts`, `FinDeEtapa`,
`AvisoBloque`, `Confeti`, `LimiteDeError`, `useBloque`, `useColaFocus`,
`tipos.ts`, `api.ts`.

Los paneles son los mismos en las dos pantallas: lo único que cambia es cómo se
acomodan. Cuando el chat estaba escrito adentro del layout de escritorio, la
versión del celular era una copia que se iba quedando atrás.

Cada columna va adentro de `LimiteDeError`. Sin eso, cualquier excepción de
render sube al boundary genérico de la app ("No se pudo cargar la página"), que
no dice qué pasó, pierde el bloque en curso y obliga a recargar. Con eso, el
resto de la pantalla sigue viva y se lee el motivo.

**Enganches:** `vistas.ts` (vista `focus`, oculta del rail), `SalesOpsApp.tsx`
(render sin chrome cuando `vista === 'focus'`), y el botón de entrada.

**No se toca:** el clasificador, la cola de lotes, el CRM, la taxonomía, ni una
sola migración. Focus no agrega tablas: todo lo que muestra ya existe.

## 10. Invariantes que no se aflojan

1. Ejecutar ahora **no envía mensajes**. Redacta y programa.
2. El destinatario lo resuelve el servidor desde `chats.remoteJid`; la UI manda
   `chatId` y nada más.
3. Focus **no escribe en el CRM**: ni etapa, ni etiquetas, ni campos.
4. Un pedido encolado lleva `mode: queue` y queda aprobado porque lo escribió una
   persona identificada; el conector no aprueba nada solo.
5. Todo lo que la IA devuelve es un borrador hasta que una persona guarda.
6. Los contadores de sesión son de la sesión: no se persisten como métricas del
   equipo (para eso está Métricas).

## 11. Fases

- **F1 · Esqueleto** — ruta, takeover, tres columnas, cola con `GET /contacts`,
  navegación y prefetch. Sin IA.
- **F2 · Cronómetro** — bloques de 25, persistencia, modal de fin, descanso.
- **F3 · Paneles** — Resumen (radar y señales), Programados con `soloSiHay`,
  Chat IA con decisiones humanas, Chat.
- **F4 · Los dos botones** — `server/focus.ts`, la ruta, y el cableado con el
  editor de programados.
- **F5 · Filtros, orden y progreso** — multiselect, `oldest`/`gate`, barra,
  contadores de sesión.
- **F6 · Etapas y confeti** — fin de etapa, salto a la siguiente, celebración.
- **F7 · Móvil y teclado** — ✅ pestañas, tarjeta con arrastre, atajos de prompt,
  racha, filtros en hoja, avisos por pestaña.
