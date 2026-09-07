# Centro de Desarrollo · app `dev-center` (2026-09-07)

La app que junta lo que el plan «Developer Command Center» reparte en cuatro documentos:
**misiones**, **prompts para ejecutarlas**, **terminales** sobre los proyectos del servidor y
**proyectos** (el registro). Ruta: **`/plugins/dev-center`**. Hoy la ve una sola persona:
`noelia@whatspro.uno`.

## Las dos puertas

La app no se da por rol. Se da por persona, y con dos cerrojos independientes que tienen que
abrirse los dos (`lib/plugins/dev-center/server/puerta.ts`):

1. **Activación por usuario.** El manifest es `activationMode: 'user'`: la app existe sólo para
   quien tiene la fila `team_member_plugins (team_id, user_id, 'dev-center', enabled=true)`.
   Nadie más la ve en el lanzador ni puede entrar a la ruta.
2. **La lista blanca de las terminales.** La misma que abre una shell root
   (`TERMINAL_ALLOWED_EMAILS` en `.env.terminal`, ver `00-ESTADO.md`). Quien puede darle una
   misión a un agente sobre producción es quien puede sentarse en la terminal. Sesión
   impersonada, no; dominio de marca blanca, no.

Cualquier falla devuelve **404**, no 403: quien no tiene acceso no tiene por qué saber que el
módulo existe.

## Una misión, cinco agentes, dos canales

Una misión (`developer_missions`, migración 0110) es un pedido de trabajo técnico sobre un
proyecto del registro: título, prompt, proyecto, **agente**, modo (`analizar · editar · probar ·
desplegar`), prioridad y estado (`draft → queued → running → blocked → completed | failed |
cancelled`, transiciones en `shared/types.ts › MISSION_TRANSITIONS`).

Los agentes son cinco (`MISSION_AGENTS`), por dos canales distintos:

| Agente | Canal | Quién la ejecuta |
|---|---|---|
| `claude` · `codex` | **terminal del servidor** | Claude Code / Codex CLI dentro de tmux, en el `cwd` del proyecto |
| `claude_desktop` · `codex_desktop` | **MCP, desde tu escritorio** | Claude Desktop / Codex de escritorio conectados al conector de WhatsPro |
| `connector` | **MCP, el que venga** | El próximo conector que pregunte por trabajo (Claude, ChatGPT, Grok) |

`MISSION_AGENT_META[agente].terminal` / `.mcp` dicen a qué canal pertenece cada uno; la app y las
tools no lo adivinan.

### Por terminal (`agent: claude | codex`)

La app pide la contraseña (como toda terminal), emite el ticket con `missionId` y abre una
sesión tmux en el `cwd` del proyecto con Claude Code o Codex ya lanzado. Al conectarse, la
pantalla **tipea el prompt de la misión** en esa sesión y la misión pasa a `running` con su
`tmuxName`. Cerrar el navegador no mata nada: el agente sigue en tmux y «reconectar» vuelve a
él. La misión se cierra a mano (`completed` con resumen, `failed`, `cancelled`); la transcripción
completa queda en `/var/log/whatspro-terminal/sessions/`.

### Por MCP (`agent: connector | claude_desktop | codex_desktop`)

No hay terminal. La misión se encola como **corrida** en `team_prompt_runs` —la misma cola del
Command Center comercial—, ya aprobada (`metadata.approvedAt`), con el texto de la misión
precedido por el contexto del proyecto (nombre, `cwd`, stack, rama, comandos, reglas de la casa)
y `forAgent` diciendo para quién es. Con `connector`, el próximo que pregunte por trabajo
(`whatspro_work_queue`) la recibe como `run_prompt` y la cierra con
`whatspro_sales_prompt_result` (`completed` / `failed` / `blocked` con `human_request`). Con
`claude_desktop` / `codex_desktop`, la toma ese escritorio con `whatspro_dev_missions
{for_agent}` y la cierra con `whatspro_dev_mission_manage`. En los dos casos la misión guarda
`promptRunId` y **su estado se lee de la corrida**: no hay dos verdades. Cancelar la misión
cancela la corrida.

Esto es lo que convierte a los conectores en parte del equipo de desarrollo sin darles una
shell: trabajan con las 281 tools de WhatsPro y las 215 de AAPP SPACE, y lo que hacen queda en
la Cola como cualquier otra corrida.

## Desde tu escritorio: Claude Desktop y Codex

1. **Conectar el conector MCP de WhatsPro** al escritorio (la app Conectores da la URL y el
   token; en Claude Desktop va en *Settings › Connectors*, en Codex en su configuración de
   servidores MCP). Es el mismo conector con las 281 tools; no hay uno aparte para desarrollo.
2. **Tomar una misión**: `whatspro_dev_missions {for_agent: "claude_desktop"}` (o
   `"codex_desktop"`) lista las que están en cola para ese escritorio y sólo ésas; cada una trae
   el proyecto, el `cwd`, el stack y el prompt completo.
   `whatspro_dev_mission_manage {action: "update", mission_id, status: "running"}` la marca
   tomada, y `{action: "result", mission_id, status: "completed" | "failed" | "blocked",
   summary}` la cierra. Si falta una decisión humana: `blocked` con lo que hace falta, nunca
   inventarla.
3. **Los prompts de la biblioteca aparecen en el menú «+»** de Claude Desktop: el conector los
   expone como *prompts MCP* (`prompts/list` / `prompts/get`) con nombre `dev.<key>` y
   argumentos = las `{{variables}}` del prompt. Elegir uno y completar los argumentos pega el
   texto ya rellenado en la conversación, listo para ejecutar con las tools.

Lo que un escritorio hace por MCP queda auditado igual que lo que hace la app: misma puerta,
misma corrida, misma Cola.

## Biblioteca de prompts

`developer_prompts`: prompts técnicos reutilizables con `{{variables}}`. Cada uno trae agente,
proyecto y modo por defecto; «Ejecutar» abre el formulario de misión ya lleno.
`rellenarPrompt(body, valores)` reemplaza lo que viene y **deja a la vista** lo que falta
(`{{pendiente}}`), para que un prompt con huecos no salga en silencio. La semilla
(`seedDevPrompts`) es idempotente: correrla dos veces no duplica.

## Tools MCP

- `whatspro_dev_missions` (lectura): misiones con estado, corrida y proyecto; `for_agent`
  filtra las que están en cola para un escritorio concreto.
- `whatspro_dev_mission_manage` (escritura): crear (con `launch` para encolarla), cambiar
  estado, cerrar con resumen, cancelar.
- **Prompts MCP** `dev.<key>` (`prompts/list` / `prompts/get` en el route del conector): la
  biblioteca, con sus variables como argumentos.

Un conector puede así abrir misiones para otro conector, para un escritorio o para una
terminal, y cerrar la suya. Todo pasa por la misma puerta que la app.

## La terminal, rediseñada

`components/admin/terminal/TerminalWorkspace.tsx` (la misma en `/admin/terminal` y dentro de la
app): panel lateral de proyectos y sesiones en escritorio, hoja inferior en móvil para abrir una
terminal, pestañas, dos paneles lado a lado, **pantalla completa**, barra de teclas para el
celular (Esc, Tab, Ctrl, flechas, Ctrl+C, pegar), tamaño de letra, y el teclado del teléfono no
tapa la salida (`visualViewport`). Contrato: `TerminalWorkspace({ email, embedded?, autoOpen?,
onOpened? })` — `autoOpen` es cómo la app abre la terminal de una misión con su prompt inicial.

## Darle acceso a alguien más

1. Agregar el email en `TERMINAL_ALLOWED_EMAILS` de `.env.terminal` (lo leen la app y el
   gateway), `pm2 restart terminal-gateway` y desplegar (recrea el contenedor).
2. Activarle la app: fila en `team_member_plugins` (`enabled=true`) —desde la pantalla de Apps
   como owner/admin del equipo, o `INSERT … ON CONFLICT DO UPDATE`—.

Las dos cosas. Una sola no alcanza, a propósito.

## Verificación

`scripts/smoke-dev-center.mts` (contra la base, crea y borra `[SMOKE] …`): semilla idempotente,
variables, misión de terminal draft → running → completed y transición prohibida, misión de
conector encolada como corrida aprobada y visible en `whatspro_work_queue`, misión para Claude
Desktop que `whatspro_dev_missions {for_agent}` devuelve a ese escritorio y no al otro,
cancelación en cascada, lista blanca cerrada.

## Lo que sigue

- Misiones con **worktree** (`git worktree` por misión, doc 03 §9) y resultado con **diff**
  capturado al cerrar.
- Estado automático de las de terminal: cuando la sesión tmux termina, la misión se marca sola.
- Presets de misión (corregir bug · auditoría · refactor · preparar deploy) y revisión cruzada
  Claude ↔ Codex (doc 03 §11–12).
- Registro de proyectos en base (`developer_projects` / `developer_servers`) en vez del JSON.
- **AI Worker para AAPP SPACE**: el agente corre en el VPS sobre una copia de trabajo y el
  hosting recibe los cambios por un Runner con acciones firmadas; nunca una webshell (doc 02 §4).
