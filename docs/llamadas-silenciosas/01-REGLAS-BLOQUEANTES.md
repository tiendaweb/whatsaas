# Reglas bloqueantes del agente IA

> Relevado el 2026-09-08 sobre el equipo 2 (`noelia@whatspro.uno`).
> Todo lo que hace que el agente **no** actúe, en dos capas: lo que dice su prompt
> y lo que decide el sistema. Las del sistema ganan siempre: si el código bloquea,
> el prompt no importa.

---

## A. En el sistema (código y datos)

Ordenadas por qué tan seco es el corte.

| # | Regla | Dónde | Estado hoy en el equipo 2 |
|---|---|---|---|
| 1 | **Interruptor del equipo**: con `ai_configs.is_active = false` el agente no contesta… | `lib/ai/session-state.ts` | **Apagado** desde el 2026-08-31 |
| 2 | **…salvo que el chat tenga override explícito.** `ai_sessions.status` gana sobre el interruptor: un chat con `'active'` responde aunque el equipo esté apagado; uno con `'paused'` calla aunque esté encendido | `getEffectiveAIState()` | **226 chats en `active`**, 55 en `paused`. Sin tráfico del agente desde el 31/08, pero el override sigue puesto |
| 3 | **La automatización gana**: si un flujo procesó el mensaje entrante, la IA ni se entera | `app/api/webhook/evolution/route.ts:597` | El menú de botones ("MENÚ") corre por acá |
| 4 | **Nunca en grupos ni sobre mensajes propios** | mismo webhook, `!isGroup && !fromMe` | — |
| 5 | **`handover_to_human` pausa la sesión**: cuando el bot deriva, ese chat queda mudo hasta reactivarlo a mano | `service.ts:372` | 34 derivaciones registradas |
| 6 | **App apagada = funciones invisibles**: una función integrada no se ofrece si su plugin no está activo | `resolveBotActivePluginIds()` | `sales` y `articles` apagados ⇒ `register_sale`, `search_catalog` y `list_contact_purchases` **bloqueadas** |
| 7 | **Interruptor por función**: fila en `ai_builtin_tools` con `enabled = false` | Ajustes → Agente IA | **0 apagadas** |
| 8 | **Cinco vueltas por mensaje** (`MAX_LOOPS`): más de 5 rondas de funciones y corta | `service.ts:353` | — |
| 9 | **Memoria de 20 mensajes**: el historial se recorta a los últimos 20 | `service.ts:411` | — |
| 10 | **1.000 tokens de respuesta y temperatura 0.3** | `ai_configs` | Respuestas cortas por diseño |
| 11 | **Espera de 5 segundos** antes de contestar, para juntar mensajes seguidos | `AI_DEBOUNCE_MS` | — |
| 12 | **La herramienta del equipo le gana a la integrada** si comparten nombre | `tools.ts` (`taken`) | Sin herramientas propias hoy |

## B. En el prompt (las que se le prohíben al agente)

**Dinero y condiciones**
- No inventa precios, plazos, funciones, cupos ni promociones que no estén en el documento (§1).
- No baja el precio ni ofrece descuentos: no está autorizado (§8).
- Descuentos, cuotas o condiciones especiales ⇒ derivar, nunca ofrecerlas (§8, §10).
- Renovación USD 60: fija, no negociable (§5).
- Los 4 servicios a cotizar con Noelia (Community Manager, SEO, automatizaciones, desarrollo a medida) no llevan precio **ni un rango orientativo** (§5).
- Link de pago con tarjeta sólo si lo piden, avisando el recargo del 15-20 % (§9).
- **Pagos (cambiada el 2026-09-08)**: confirma con `confirm_payment` cuando hay importe y moneda claros; si falta algo, `flag_payment_proof` y revisión manual. Nunca inventa un importe (§1, §6, §9).

**Plazos**
- Planes profesionales: 7 a 15 días hábiles, no prometer menos (§5).
- Desarrollo a medida: nunca dar plazo (§5).

**Conversación**
- Una idea por mensaje; 2-5 líneas; nada de párrafos largos ni listas eternas (§1, §12).
- Nada de Markdown: sin `[texto](url)`, sin `**negrita**`, sin `#`, tablas ni HTML (§1).
- No listar todo el catálogo: se recomienda **un** producto (§3).
- Beneficio antes que precio (§3).
- Nunca cerrar en "contame más" sin un paso concreto (§6).
- No pedir una lista larga de datos de entrada (§6).

**Ejemplos y competencia**
- 1 a 3 ejemplos, nunca la lista completa, nunca mezclar básicos con profesionales (§7).
- Ejemplos por rubro: no enumerarlos, derivar al menú (§7).
- Falta material de "Sitio Web Profesional": avisar internamente, **no** decírselo al cliente (§7).
- No hablar mal de la competencia (§8).
- No presionar ante un "lo voy a pensar" (§8).

**Moneda**
- Nunca mezclar precios de una moneda con datos de pago de la otra: ARS y PYG son negocios distintos (§4).

**Derivación obligatoria** (§10) — sin intentar resolverlo: integraciones o desarrollo a medida,
AFIP/facturación, logística de envíos, membresías o roles complejos, más de 100 productos,
descuentos o cuotas, temas legales, cliente molesto, o cualquier dato que no pueda confirmar.

---

## Lo que hoy frena de verdad

Las reglas 1 y 2 son las que importan: el agente está apagado por interruptor, pero **el interruptor
global no manda sobre los 226 chats con override explícito**. Si entra un mensaje en uno de esos
chats y ninguna automatización lo toma primero, el agente responde — y ahora, con la regla de pagos
cambiada, puede confirmar un cobro. Para apagarlo de verdad hay que bajar también esos overrides.
