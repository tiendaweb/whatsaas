# Comentarios de Facebook e Instagram

> 2026-09-10 · plugin `marketing`, vista **Comentarios**

Publicar en redes ya se hacía desde WhatsPro. Enterarse de que alguien preguntó el precio abajo de
una publicación, no: había que entrar a Facebook o a Instagram, iniciar sesión y verificar la cuenta
para leer tres comentarios. Esta bandeja los trae acá y los contesta desde acá.

## Lo que hace falta conectar: nada nuevo

Usa **el mismo Page Access Token que ya guardó el publicador** (`social_accounts.access_token`). Se
conecta una sola vez, pegando un token de usuario en *Publicaciones › Cuentas*, y de ahí salen la
página de Facebook y su Instagram Business vinculado. No hay OAuth por sesión, no hay verificación
de cuenta cada vez que se quiere responder, y no hay una app nueva que Meta tenga que revisar.

Permisos que el token tiene que traer (los mismos que ya pide publicar, más los de engagement):
`pages_show_list`, `pages_read_engagement`, `pages_manage_engagement`, `instagram_basic`,
`instagram_manage_comments`. Para responder por Messenger, además `pages_messaging`. Si falta
alguno, la Graph responde con su error y la pantalla lo muestra tal cual en vez de fingir que salió.

## Cómo funciona

| Pieza | Dónde |
|---|---|
| Llamadas a la Graph | `lib/social/meta-comments.ts` — publicaciones, comentarios, responder, ocultar, privado |
| Lógica del equipo | `lib/plugins/marketing/server/comentarios.ts` — sincronizar, bandeja, responder, marcar |
| Datos | tabla `social_comments` (migración `0112`) |
| Pantalla | `lib/plugins/marketing/ui/vistas/ComentariosView.tsx`, vista `comentarios` del rail |
| API | `GET/POST /api/plugins/marketing/comentarios` |
| Solo | `GET /api/cron/social-comments` (5 publicaciones por vuelta y por cuenta) |
| Conectores | `whatspro_social_comments`, `whatspro_social_comment_reply`, `whatspro_social_comment_manage` |

Facebook e Instagram hacen lo mismo con nombres distintos y esa es la única razón de
`meta-comments.ts`: un post tiene `message` y un media tiene `caption`; se responde con `/comments`
en una y con `/replies` en la otra; ocultar es `is_hidden` acá y `hide` allá. Afuera se ve una sola
forma.

## Reglas que no se aflojan

- **Nada sale sin que alguien lo escriba.** No hay respuesta automática. La IA puede redactar desde
  el conector, pero publicar es un acto explícito, igual que un envío de WhatsApp.
- **Meta es la fuente de verdad** del texto, el autor y el hilo. Lo nuestro es el estado para el
  equipo: `nuevo` · `respondido` · `ignorado` · `oculto`.
- **Sincronizar dos veces no duplica** (índice único por comentario) **ni revive lo resuelto**: el
  `onConflictDoUpdate` refresca lo que vive en Meta y nunca pisa el estado del equipo.
- **Ocultar toca la red** y se revierte; **marcar** es sólo nuestro.
- La respuesta privada de Facebook la permite Meta **una sola vez por comentario**.

## Lo que falta

- ~~Registrar el cron en PM2~~: hecho (`social-comments`, `*/10`, `scripts/social-comments.js`).
  El botón «Buscar nuevos» queda para cuando no se quiere esperar.
- Avisar por notificación cuando entra un comentario con pregunta de precio (hoy hay que mirar).
- Vincular el comentario con el contacto de WhatsApp cuando la persona ya escribió por ahí.
