# Developer Command Center · Terminales del admin — estado (2026-09-07)

Implementación de la **Fase 1–3 del Terminal Manager** (docs «01 · Terminal Manager para VPS» y
«04 · Plan de implementación», en la app Documentos, carpeta Developer Command Center) más el
selector de agente de la Fase 5. Ruta: **`/admin/terminal`**. Acceso: **sólo `noelia@whatspro.uno`**.

## Qué hay

| Pieza | Dónde | Qué hace |
|---|---|---|
| Registro de proyectos | `config/terminal-projects.json` | WhatsPro (`/root/whatsaas`), AAPP PRO (`/root/aapphost`), Contrataya (`/opt/contrataya/site`); cwd, stack, comandos, agentes, tope de terminales. **El frontend nunca manda rutas**: elige un slug. |
| Puerta | `lib/terminal/access.ts` | Lista blanca `TERMINAL_ALLOWED_EMAILS` (no es un rol: ser `admin` no alcanza, ser `owner` no hace falta); tickets HMAC de 45 s; cabeceras firmadas para hablar con el gateway. |
| API | `app/api/admin/terminal/ticket` · `…/sessions` | `POST ticket`: sesión válida y **no impersonada** + lista blanca + **contraseña de nuevo cada vez** + proyecto/modo/ranura del registro + 10 intentos por 10 min (las contraseñas erradas cuentan) → ticket de un solo uso atado a la IP. `GET sessions`: proyectos + conexiones vivas del operador. `DELETE sessions`: mata la sesión tmux (sólo las propias). Todo en `activity_logs`. |
| Pantalla | `app/[locale]/(terminal)/admin/terminal` + `components/admin/terminal/TerminalWorkspace.tsx` | Grupo de rutas propio (**fuera de `(admin)`**, cuyo layout sólo deja pasar `role='admin'`); `notFound()` para quien no está en la lista. xterm.js, pestañas hasta el tope del proyecto, dividir en dos, modo Shell / Claude Code / Codex, «reconectar» a la misma sesión tmux, «■» para matar de verdad. |
| Gateway | `scripts/terminal-gateway/server.mjs` (PM2 `terminal-gateway`) | Corre en el **host** (ahí viven los proyectos, docker, pm2, `claude` y `codex`). Escucha **sólo en 172.19.0.1:3400** (IP del host en el bridge de docker; ninguna interfaz pública). Verifica firma, vencimiento, nonce único, email en su propia lista blanca, proyecto/modo/ranura y `Origin`. Abre `tmux new-session -A -s wp-<uid>-<proyecto>-<n> -c <cwd>` con un **entorno limpio** (los secretos no llegan a la shell). 30 min sin teclear → desconecta (tmux sigue); 8 h → corta. |
| Puente | `docker-compose.yml` › `terminal-proxy` + `config/terminal-proxy.nginx.conf` | Traefik sólo enruta a contenedores: un nginx recibe `/terminal-gateway/*` y lo pasa a **172.19.0.1:3400** (la IP fija, no `host.docker.internal`: ese nombre resuelve al docker0 y el gateway no escucha ahí). Sin ticket el gateway rechaza el upgrade igual. |
| Auditoría | `/var/log/whatspro-terminal/` (0700) | `audit.jsonl` (aperturas, cierres, rechazos con motivo, IP) y **una transcripción completa por sesión** (entrada y salida, 0600, tope 25 MB). Más `activity_logs`: `TERMINAL_TICKET_ISSUED`, `TERMINAL_DENIED` (motivo), `TERMINAL_SESSION_KILLED`. |
| Secretos | `.env.terminal` (0600, ignorado por git) | Un solo secreto, dos lectores: el contenedor de la app (env_file) y el gateway (`--env-file`). **El gateway no lee el `.env` general.** |

## Modelo de seguridad, en una línea por capa

1. **Quién**: lista blanca por email, cerrada por defecto; impersonación excluida; contraseña otra vez por cada terminal; rate limit.
2. **Cómo entra**: ticket firmado, 45 s, un uso, atado a IP, proyecto, modo y ranura; `Origin` verificado; nonce recordado.
3. **Dónde**: sólo los `cwd` del registro; el navegador no elige rutas ni comandos de arranque.
4. **Con qué**: entorno mínimo (`PATH`, `HOME`, `TERM`…), sin los secretos de la app ni del gateway.
5. **Cuánto**: tope de terminales por proyecto y 6 conexiones por usuario; 30 min de inactividad; 8 h absolutas.
6. **Qué quedó**: transcripción íntegra por sesión + audit.jsonl + activity_logs. Nada se puede hacer sin que quede escrito.
7. **Red**: el gateway no escucha en ninguna interfaz pública; el único camino es Traefik → nginx → host, y ese camino exige el ticket.

## Desviación conocida (decidir)

**La shell es root.** El servidor entero corre como root y los proyectos son de root (`/root/whatsaas`, `/root/aapphost`); crear un usuario técnico con acceso a esas carpetas (doc 01 §10) implica reasignar permisos de tres proyectos y de docker/pm2. No se hizo en esta tanda para no romper despliegues. Mitigación real: quién entra (una persona), transcripción completa, tmux nominal por usuario. Filtrar comandos dentro de una PTY no es seguridad (se esquiva con un alias): no se simuló.

## Cómo se arranca (ya está arrancado el 2026-09-07) y cómo se opera

```bash
# gateway en el host (PM2 `terminal-gateway`, guardado con pm2 save; sobrevive a reinicios)
pm2 start /root/whatsaas/scripts/terminal-gateway/server.mjs --name terminal-gateway \
  --node-args="--env-file=/root/whatsaas/.env.terminal" --time && pm2 save
curl -s http://172.19.0.1:3400/health            # {"ok":true,...}
curl -s https://whatspro.uno/terminal-gateway/health   # lo mismo, por Traefik + nginx

# smoke de punta a punta (firma un ticket con el mismo secreto, abre el WS, manda pwd,
# prueba nonce, vencimiento, lista blanca, proyecto, firma alterada y reconexión a tmux):
cd /root/whatsaas/scripts/terminal-gateway && node --env-file=/root/whatsaas/.env.terminal smoke.mjs
node --env-file=/root/whatsaas/.env.terminal smoke.mjs wss://whatspro.uno/terminal-gateway/ws   # por el dominio
# Verificado el 2026-09-07: 9/9 en los dos caminos.

# dar acceso a alguien más: agregar el email en .env.terminal (los DOS lectores lo leen),
# reiniciar el gateway (pm2 restart terminal-gateway) y recrear la app (deploy).
tail -f /var/log/whatspro-terminal/audit.jsonl   # quién entró, a qué, desde dónde
tmux ls                                           # sesiones vivas (wp-3-whatspro-1, …)
```

## Lo que sigue (del plan, en orden)

- Fase 4 · Project Registry en base de datos (`developer_projects`, `developer_servers`, `terminal_sessions`, `developer_audit_logs` del doc 04 §2) en vez del JSON.
- Fase 5 · Misiones IA: formulario, contexto automático por proyecto (Documentación IA de `99 · Privado IA`), worktree por misión.
- Fase 6 · AAPP PRO remoto por SSH (hoy vive en el mismo VPS: `local-pty` alcanza).
- Fase 8 · AAPP SPACE sin SSH: diagnóstico desde la Terminal de cPanel (doc 05 §C), Runner con acciones firmadas, papelera. **No empezar por acá** (doc 04 §14).
- Usuario técnico no-root (arriba).
- Panel de sesiones vivas con CPU/RAM y «detener proceso» (doc 01 §8).
