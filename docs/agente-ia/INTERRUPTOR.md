# El interruptor del agente IA (2026-09-11)

## Qué pasó

Contratá Ya (equipo 27) reportó que **la IA envió mensajes sola**. Es cierto, y el caso es peor de
lo que parece: el 2026-09-10 a las 02:23 el agente le escribió a un **contacto personal** del dueño
—una conversación de todos los días, con audios y temas privados— el guion comercial completo
(«¿estás buscando algún profesional de la construcción/reformas en el Partido de la Costa…?»).
El bot del equipo estaba **apagado** desde el día anterior a las 18:01.

## Por qué

`ai_sessions.status` cumplía dos papeles a la vez:

1. Guardar la conversación que el agente lleva con ese chat.
2. Decidir si el agente contesta en ese chat.

El motor (`processAIMessage`) crea la sesión con `status = 'active'` la primera vez que responde,
para tener dónde guardar el historial. Después, `getEffectiveAIState` leía ese mismo valor como
«en esta conversación la IA está prendida **a propósito**» y le daba prioridad sobre
`ai_configs.is_active`. Resultado: **apagar el bot del equipo no apagaba ningún chat donde la IA
hubiera contestado alguna vez.**

Medido en la base antes del arreglo, con el bot apagado en los dos equipos:

| Equipo | Chats que habrían contestado igual |
|---|---|
| 2 (Noelia) | 226 |
| 27 (Contratá Ya) | 4 |

Y había un segundo efecto, el inverso: como activar un chat sin sesión no persistía nada («ya
hereda del equipo»), con el bot apagado **prender la IA en un chat suelto no hacía nada**.

## Cómo quedó

El override es explícito. `ai_sessions` suma `is_override`, `override_by` y `override_at`
(migración `0113`), y el estado efectivo sólo mira el interruptor del chat cuando **alguien lo
tocó**: una persona desde el chat o un nodo de automatización. Sin override, el chat hereda lo que
diga el equipo, que es lo que cualquiera espera al apagar el bot.

- La sesión que crea el motor nace con `is_override = false`: es de trabajo, no es una decisión.
- Tocar el interruptor de un chat **siempre** escribe override, con quién y cuándo.
- Migración de datos: las `paused` pasaron a override (el motor nunca crea una sesión pausada, así
  que una pausa es siempre humana y se respeta); las `active` vuelven a heredar.

Smoke: `scripts/smoke-ia-override.mts` — las seis combinaciones y, contra la base, que ningún
equipo con el bot apagado tenga un chat que conteste salvo los prendidos a mano.

## Lo que este arreglo NO cubre

- Los dos mensajes que ya salieron no se pueden deshacer; conviene mirar esos dos chats.
- El agente sigue pudiendo contestar en un chat personal si el equipo prende el bot globalmente:
  no distingue «cliente» de «conocido». Si eso importa, el camino es una lista de chats excluidos
  como la que ya tiene el radar (`radarMutedChatIds`).
- El disparo salió 2,5 h después del audio que lo motivó (23:51 → 02:23). El debounce es de 5 s, así
  que ese retraso viene de otro lado —un reinicio, un reintento— y quedó sin diagnosticar.
