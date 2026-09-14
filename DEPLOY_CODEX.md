# Prompt de despliegue para Codex — WhatsPro (whatspro.uno)

Copiar el bloque de abajo y enviarlo a Codex. Es autocontenido.

> **Antes de reusarlo:** el `BUILD_ID` de rollback que aparece abajo es el que estaba
> sirviendo el 2026-09-11. Si ya hubo despliegues después, confirmá el actual con
> `cat /root/whatsaas/.next/BUILD_ID` y reemplazalo en el prompt.

---

````
Contexto: VPS de producción. Repo Next.js 16 en `/root/whatsaas`, montado en `/app`
dentro del contenedor Docker `whatsaas-app` (servicio `app` del docker-compose del
repo). Sirve https://whatspro.uno. Leé `AGENTS.md` antes de tocar nada.

TAREA: desplegar los cambios que ya están escritos en el working tree. No hay que
programar nada nuevo — el código ya está listo y validado (`npx tsc --noEmit -p
tsconfig.json` da 0 errores y un build completo pasó con exit 0).

## Cómo desplegar

Desde `/root/whatsaas`:

    NEXT_NO_TURBOPACK=1 pnpm run deploy:saasfy

`NEXT_NO_TURBOPACK=1` NO ES OPCIONAL. Turbopack es Rust y su memoria vive fuera del
heap de V8, así que `--max-old-space-size` no la limita y el kernel mata el build por
OOM en esta máquina (7,9 GB, ~20 contenedores). Ya pasó tres veces. Con webpack la
memoria queda dentro del heap y el build termina.

Tampoco bajes `NEXT_BUILD_MAX_OLD_SPACE_SIZE_MB`: el default de 4096 es el correcto.
Bajarlo a 3072 hace fallar el build desde adentro con "Reached heap limit".

NO corras `tsc`, otro build ni nada pesado en paralelo: eso solo bastó para provocar
el OOM del kernel incluso con memoria aparentemente libre.

El build tarda ~20 min con webpack. Es normal.

## Cómo saber si salió bien

Éxito = exit code 0 y la línea final `Deploy verification passed.`

CUIDADO al leer el resultado: `pnpm build 2>&1 | tail` devuelve el exit code del
`tail`, no el del build. Usá `${PIPESTATUS[0]}` o redirigí a un archivo y mirá el
código real. Un log que dice "✓ Compiled successfully" puede terminar igual en
`ELIFECYCLE ... exit code 1` más abajo.

El script hace: build en `.next-deploy` → valida el artefacto → swap atómico
(`mv .next .next-previous && mv .next-deploy .next`) → `docker compose up -d
--force-recreate app` → verifica `/es/sign-in`, `/es/dashboard`, la mini-app
business-woman-planner, que los assets estáticos resuelvan y que las rutas protegidas
sigan redirigiendo a sign-in.

## Si falla

- Falla ANTES del swap (OOM, error de tipos): producción queda intacta. No hagas nada
  más que reportar el error.
- Falla la VERIFICACIÓN después del swap: el build nuevo ya está sirviendo y NO hay
  rollback automático. Revertí con:

      cd /root/whatsaas && rm -rf .next-roto && mv .next .next-roto && \
      mv .next-previous .next && docker compose up -d --force-recreate app

  El build que está sirviendo ahora, y al que hay que volver, es `FyA0VAlh9pgVSyzGgVFrA`
  (`cat .next/BUILD_ID` para confirmar).

- Nunca reinicies `whatsaas-app` si `.next/BUILD_ID` no existe.

## Verificación manual después (el script no la cubre)

Entrá a https://whatspro.uno → Empresa → Proyectos y probá:
1. Arrastrar una tarjeta de una columna a otra (debe persistir al recargar).
2. Marcar/desmarcar un ítem de checklist en el panel derecho de una tarea.
3. El botón "Ocultar terminados" de la barra superior.
4. Empresa → Planes: debe existir un botón "Ver privados".

Esas son rutas nuevas (`/api/plugins/empresa/proyectos`, `.../tareas`,
`.../checklist`, `.../archivar`) que la verificación automática no toca.

Nota: esas acciones exigen el permiso `empresaWrite`, que en `ROLE_PRESETS` es true
para owner y admin pero FALSE para el rol `agent`. Si probás con un agente vas a
recibir 403; no es un bug del deploy.

## Advertencias

- NO hay migraciones de base de datos en este cambio. No corras `db:migrate`.
- El working tree tiene MUCHO trabajo sin commitear que no es de esta tarea
  (sales-ops, ai-chat, menu, permissions, messages, el plugin `empresa` entero está
  sin trackear). El deploy compila TODO el árbol actual, no solo la feature de
  Proyectos. Revisá `git status` antes de construir y no descartes nada.
- No commitees ni hagas push salvo que te lo pidan explícitamente.
- No ejecutes una segunda instancia de la app con PM2.
````

---

## Qué se está desplegando (contexto para vos, no para Codex)

Trabajo del 2026-09-11 sobre **Empresa → Proyectos**, que pasó de ser una pantalla de
sólo lectura a una de trabajo. Todas las escrituras pasan por las funciones que ya usa
Tareas OS (`patchTaskItem`, `createTaskProject`, `archiveClientProject`).

- Checklists visibles y editables en el panel de la tarea, con pestañas Detalle /
  Checklist / Notas.
- Botón "Ocultar terminados" (tareas e ítems), recordado entre sesiones.
- Alta de proyectos desde el rail; archivado que saca al cliente del CRM.
- Arrastrar tarjetas entre columnas, optimista y con reversión si el servidor rechaza.
- Empresa → Marcas y Planes: los planes privados quedan ocultos por defecto, con un
  interruptor "Ver privados".

Tres defectos encontrados y corregidos de paso:

1. El panel de la tarea tenía `display: none` bajo 1100 px. Como la checklist vivía
   sólo ahí, en pantalla mediana la función era inalcanzable. Ahora es un cajón.
2. La API mandaba sólo 20 ítems de checklist y el JSON se guarda entero: escribir desde
   el navegador habría borrado los ítems 21+. Las tres operaciones de checklist se
   resuelven en el servidor mandando sólo el ítem que cambia.
3. `app/api/plugins/dev-center/prompts/route.ts` exportaba un schema de Zod desde un
   archivo de ruta, lo que **bloqueaba el build de todo el proyecto** desde el commit
   `136169c`. Se movió a `lib/plugins/dev-center/shared/prompt-schema.ts`.

Dos decisiones que quedaron pendientes de confirmación:

- Las suscripciones a planes privados siguen visibles, para no borrar facturación real
  de los totales.
- Archivar mantiene la exigencia de cero tareas abiertas, igual que Tareas OS.
