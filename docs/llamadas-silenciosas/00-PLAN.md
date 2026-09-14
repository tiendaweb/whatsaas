# Llamadas a funciones silenciosas

> Plan escrito el 2026-09-08 después de auditar el sistema completo de
> **Ajustes → Agente IA → Llamadas a funciones** y los datos reales del equipo 2
> (`noelia@whatspro.uno`, 1.067 chats, 63.788 mensajes).

---

## 1. Qué hay hoy

El sistema tiene **dos mitades** que se ven juntas en la misma pestaña
(`app/[locale]/(dashboard)/settings/ai/page.tsx:461`) pero funcionan distinto:

| | Herramientas del equipo | Funciones integradas |
|---|---|---|
| Dónde viven | tabla `ai_tools` (una fila por herramienta) | código, `lib/plugins/ai-chat/builtin/*` |
| Quién las crea | el equipo, a mano, en la UI | vienen hechas |
| Qué pueden hacer | 16 acciones de una lista cerrada | cualquier cosa, con parámetros ricos |
| Se encienden | `is_active` | solas, si el plugin que las respalda está activo |
| Se apagan | borrándolas | fila en `ai_builtin_tools` |

Hoy hay **30 funciones integradas** repartidas en 12 apps: CRM (4), Calendario (4),
Clientes (3), Membresías (3), Ventas (3), Conocimiento (2), Oportunidades (2),
Finanzas (2), Tareas (2), Programados (2), Soporte (2), Sitios (1).

El motor es el bucle de `lib/plugins/ai-chat/service.ts:355-410`: máximo 5 vueltas,
cada `tool_call` se ejecuta y su resultado se devuelve al modelo como mensaje `role: 'tool'`.

## 2. Lo que muestran los datos

**Del equipo 2 (el negocio):**

- `ai_configs.is_active = **false**` → el agente está **apagado** desde el 2026-08-31.
  Hay 517 mensajes marcados `is_ai` y 281 sesiones (226 activas, 55 pausadas): se usó y se cortó.
- **0 herramientas propias** en `ai_tools`. Cero.
- **0 funciones integradas apagadas**: están todas disponibles, nadie tocó nada.
- El prompt tiene 16.176 caracteres y en su sección 10 ordena derivar a Noelia en 9 casos
  (descuentos, AFIP, +100 productos, cliente enojado…), pero **no hay ninguna función que avise al equipo**:
  el bot le dice al cliente "ya te contacta una persona" y del otro lado no suena nada.
- Rastro de acciones en los chats: 213 `@@syslog_moved_to_stage` (todas **manuales**),
  34 `@@syslog_ai_deactivated` (el handover). **Ni un solo** `@@syslog_ai_moved_to_stage`,
  `@@syslog_ai_added_note`, `@@syslog_ai_added_tag` ni `@@syslog_ai_set_field`:
  el agente nunca registró nada en el CRM. Las 32 etapas y los 74 campos personalizados se llenan a mano.

**Bloqueos reales encontrados:**

1. **El bloqueo grande: no existe lo silencioso.** Toda herramienta del equipo termina en
   `lib/plugins/ai-chat/tools.ts:625-628` devolviendo
   `[SYSTEM_INSTRUCTION] Tell the user the action was executed successfully.`
   Es decir: **es imposible que el bot haga algo sin contárselo al cliente**. Etiquetar, mover de etapa,
   anotar o avisar al equipo son cosas internas, y hoy todas terminan en un "listo, ya lo registré"
   que el cliente no tiene por qué leer. Las integradas no fuerzan mensaje, pero tampoco le dicen
   al modelo que se calle: queda librado a su criterio.
2. **Apps apagadas = funciones bloqueadas.** Para el equipo 2, `sales` y `articles` están en `false`
   (`team_plugins`) y sin usuarios en `team_member_plugins`, así que `register_sale`,
   `list_contact_purchases` y `search_catalog` **no se le ofrecen al agente** aunque estén escritas.
3. **Los avisos no llegan a nadie por dentro.** `lib/notifications/service.ts` tiene `notify()` con
   canales app/push/WhatsApp/grupo y sectores (los 3 departamentos del equipo: Ventas y Clientes,
   Producción y Desarrollo, Administración), pero ninguna función del agente lo usa.

## 3. Qué es una llamada silenciosa

Una función que el agente invoca **mientras conversa**, que deja el negocio registrado
(ficha, etiqueta, etapa, nota, aviso al equipo) y de la que **el cliente no se entera**:
no genera mensaje, no interrumpe el hilo, no cambia el tono de la charla.

Dos condiciones, las dos necesarias:

1. **El motor no la obliga a hablar** (hoy sí obliga).
2. **El modelo recibe la orden explícita de no mencionarla** y de seguir la conversación
   como si nada hubiera pasado.

Y una tercera, que es la que la hace confiable: **queda rastro para el equipo**.
Silencioso es para el cliente, no para el negocio: cada llamada escribe su `@@syslog_ai_*`
en el chat y refresca la ficha en vivo por Pusher.

## 4. Diseño

### Fase 0 — el mecanismo (sin migración)

- `BuiltinToolDefinition` y `ToolDefinition` ganan `silent?: boolean`.
- Las herramientas del equipo se marcan con `actionData.silent = true` — es `jsonb`,
  **no hace falta migrar la base** (y así no se toca el `_journal.json`, que ya rompió cosas antes).
- `lib/plugins/ai-chat/tools.ts`: si la herramienta es silenciosa, el `finalMessage` deja de ordenar
  "decile al usuario que salió bien" y pasa a ordenar lo contrario.
- `lib/plugins/ai-chat/service.ts`: después de una llamada silenciosa se empuja al historial
  un recordatorio de sistema de no mencionarla.
- La UI muestra qué es silencioso: interruptor en el creador, insignia en el catálogo.

### Fase 1 — las nueve funciones del negocio

Todas nuevas, en `lib/plugins/ai-chat/builtin/silent.ts`; silenciosas salvo `confirm_payment`,
que por definición tiene que decirle algo al cliente.
Ninguna depende de una app apagada: son del núcleo (`pluginId: null`), así que funcionan
aunque `sales` y `articles` sigan en `false`.

| Función | Qué hace por detrás | Por qué en este negocio |
|---|---|---|
| `capture_business_profile` | Guarda rubro, tamaño, nivel digital, dolor principal, objetivo, urgencia, presupuesto aproximado, país/zona y origen del lead en los campos personalizados | El prompt hace diagnóstico en cada charla y hoy ese diagnóstico se pierde: son 9 de los 74 campos que ya existen y están vacíos |
| `log_product_interest` | Producto de interés + etiqueta + (opcional) etapa del embudo | Las 27 etiquetas son el catálogo (Sitio Web, Tienda, Combo, Ads, Contenido…) y se ponen a mano |
| `log_objection` | Tipifica la objeción (precio, tiempo, confianza, competencia, momento, otra), la guarda y etiqueta | Sección 4 del prompt: el bot ya detecta objeciones y las trabaja, pero nadie sabe después cuál fue |
| `write_contact_note` | Nota interna fechada en la ficha | Que quien retome el chat no tenga que leer 40 mensajes |
| `alert_team` | Aviso real por `notify()` al sector que corresponda, con urgencia | Los 9 casos de derivación de la sección 10 hoy no le suenan a nadie |
| `route_to_department` | Asigna el chat al departamento (Ventas / Producción / Administración) | Es lo que hace que el chat le suene a la persona correcta (`leTocaElChat`) |
| `flag_payment_proof` | Marca "comprobante enviado", etiqueta y avisa a Administración, sin acreditar nada | Para cuando el pago **no** está claro: falta el importe, el comprobante o algo no cierra |
| `confirm_payment` *(no silenciosa)* | Da el pago por cobrado: venta + ingreso en Finanzas vía `registrarCobro`, vincula el comprobante, pasa el contacto a cliente y avisa a Administración | Pedido del 2026-09-08: que el agente pueda cerrar el circuito en vez de dejar todo esperando revisión |
| `mark_do_not_contact` | Saca el chat del circuito comercial (`excludeChats`) y deja el motivo | Para que no le sigan llegando campañas ni cola a quien pidió que no lo molesten |

### Invariantes que no se aflojan

1. **Silencioso es para el cliente, nunca para el equipo**: toda función deja `@@syslog_ai_*` en el chat.
2. **Ninguna función manda un mensaje de WhatsApp.** Ninguna. Si hay que escribirle a alguien,
   lo decide el modelo en su respuesta normal o lo hace una persona.
3. **El pago tiene dos caminos y el modelo elige uno.** `flag_payment_proof` marca y no acredita
   nada; `confirm_payment` cobra de verdad. Confirmar exige importe y moneda —nunca cobra a ciegas—,
   usa una clave de idempotencia estable (mismo chat, moneda, importe y día ⇒ un solo cobro, aunque
   el modelo la llame dos veces) y avisa a Administración **después** de cobrar: es un aviso, no un
   permiso, para que se pueda dar vuelta el mismo día si el dinero no aparece.
   El agente confirma sobre lo que dice el cliente: no ve el banco.
4. **Todo campo se crea si falta**, con la misma clave canónica, así funciona en cualquier equipo
   y no sólo en el 2.
5. **El agente sigue apagado.** Encenderlo es una decisión de negocio de Noelia, no de este trabajo:
   son 1.067 chats del otro lado.

## 5. Verificación

- `tsc --noEmit` con 6 GB.
- Smoke contra la base (`scripts/smoke-silent-tools.mts`): que las 9 aparezcan en el catálogo
  del equipo 2, con la marca de silencio correcta y disponibles.
- Revisión de que ninguna escribe en `messages` con `from_me = true`.

**Lo que el typecheck no vio y el smoke sí:** importar `registrarCobro` arriba de todo arma un
ciclo (`silent → cobros → classifier → ai-chat/service → tools → builtin/index → silent`) que deja
`silentTools` sin inicializar y **al agente sin ninguna función**. Va con `await import()` dentro
del `execute`. Si alguna vez hay que importar otra cosa de `sales-ops/server` acá, mismo recaudo.

## 6. Lo que falta del lado del negocio

El prompt del equipo 2 dice, en la sección 9: *"Regla dura: nunca confirmes un pago vos mismo por
más convincente que parezca el comprobante. Siempre es «revisión manual»"*. Mientras esa línea esté,
el modelo **no va a llamar a `confirm_payment`** aunque exista. Cambiar esa regla es una decisión de
Noelia, no de este trabajo.
