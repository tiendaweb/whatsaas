# Memoria de proyecto · Modo Noelia

Actualizado: 2026-09-07

## Objetivo

Dentro del Command Center Comercial, ofrecer una bandeja secuencial de decisiones: un cliente, una situación, una recomendación, un mensaje y una decisión. No es una ruta ni una app separada; es `vista=noelia` dentro de `SalesOpsApp`.

## Implementado

- Acceso persistente **Modo Noelia** en el header y tarjeta destacada en Hoy.
- Vista takeover responsive con categorías Dinero ahora, Oportunidades, Seguimientos y Revisar.
- Cola paginada reutilizando `useColaFocus`; `queued=decision` incluye propuestas pendientes y excluye casos ya aprobados, ejecutándose, programados o tomados por un conector.
- Rama backend `vista=revisar`: análisis desactualizado, confianza menor a 55 o evidencia/audio pendiente.
- Tarjeta humana con Radar, recomendación Focus, razones, alerta “Nosotros lo frenamos”, precio confirmado y mensaje listo.
- Mensaje generado con `/api/drafts/generate` cuando todavía no existe una propuesta.
- Aprobar individual sin ejecutar, editar y aprobar, cambiar con IA, posponer 24 horas y saltar.
- Aprobación individual nueva para no rechazar accidentalmente las demás filas de un lote.
- Auditoría ampliada con recomendación, original, instrucción IA, texto editado y texto aprobado.
- Atajos A/E/I/P/S, progreso, bloque de 25 minutos, prefetch, fin de etapa, confeti y panel de más contexto.
- Contadores reales `audit.review` y `counters.newToday` en overview.

## Decisiones de arquitectura

1. **Posponer persiste 24 horas.** El repo ya tenía `POST contacts/[chatId]/lead { action: 'snooze' }`; se reutiliza y no se inventa estado local.
2. **Aprobar nunca envía.** Modo Noelia usa una ruta individual que sólo mueve la fila a `approved`. No usa el default ejecutable de aprobación por lote.
3. **No se aprueba un lote completo desde una tarjeta.** Excluir el resto del lote los habría rechazado. La operación individual conserva las demás decisiones pendientes.
4. **Precio sin evidencia no se estima.** Si no hay `quotedPrice`, la UI dice “Precio a confirmar”; no muestra el valor potencial heurístico como si fuera cotización.
5. **Owner por identidad, no hardcode de datos.** Si la persona autenticada es Noelia y el filtro global está en “todos”, la entrada usa `owner=noelia`; Carlos y Martín pueden abrir la misma vista según sus permisos.

## Verificación realizada

- TypeScript completo con heap de 6 GB: verde.
- `git diff --check`: verde.
- QA de sólo lectura sobre 20 casos reales del equipo 2: pagos pendientes, montos confirmados y ambiguos, baja confianza, audios/evidencia pendiente, stale, automatización activa, responsables Noelia/Carlos/nadie y acciones previas none/executed/rejected.
- Conteos reales observados al 2026-09-07: 756 análisis, 175 Dinero, 79 Oportunidades, 60 Seguimientos y 371 Revisar (unión sin duplicados).
- Durante el QA no se aprobó ni envió ningún mensaje.
- Deploy productivo completado con BUILD_ID `KgAJwOe9Gb9UdG1foB1pL`; `whatsaas-app` fue recreado el 2026-09-07 09:13 UTC.
- `https://whatspro.uno/es` respondió 200 y la URL del Command Center respondió 307 hacia sign-in sin sesión, como corresponde.
- Un build Turbopack concurrente agotó memoria sin tocar el bundle activo. La recuperación se hizo con webpack y se corrigió `build-next-preserve-static.mjs` para pasar `--webpack` explícitamente en Next 16 cuando `NEXT_NO_TURBOPACK=1`.

## Pendiente al retomar

- Prueba autenticada con Noelia a 375, 390, 430 y escritorio; medir menos de 10 segundos hasta entender el primer caso.
- Aprobar un único chat de prueba con worker de envío detenido o destino controlado, comprobar que queda `approved` y que el siguiente caso aparece sin envío real.
- Verificar permisos de `/api/drafts/generate` para Carlos y Martín; si no tienen `drafts`, dejar la regeneración IA deshabilitada con explicación, sin bloquear lectura/supervisión.
- Actualizar el documento 326 con el resultado final y completar el QA autenticado pendiente.

## Archivos principales

- `lib/plugins/sales-ops/ui/noelia/*`
- `lib/plugins/sales-ops/ui/SalesOpsApp.tsx`
- `lib/plugins/sales-ops/ui/hoy/PanelHoy.tsx`
- `app/api/plugins/sales-ops/contacts/route.ts`
- `app/api/plugins/sales-ops/queue/actions/[actionId]/approve/route.ts`
- `lib/plugins/sales-ops/server/queries.ts`
- `lib/plugins/sales-ops/server/queue.ts`
- `lib/plugins/sales-ops/server/overview.ts`
- `scripts/build-next-preserve-static.mjs`
