// Comentarios de Facebook Pages e Instagram Business sobre la Graph API.
//
// Es la otra mitad de `meta-graph.ts`: aquél publica, éste escucha y contesta.
// Las dos plataformas hacen lo mismo con nombres distintos y ésa es la única
// razón por la que este archivo existe: un post de Facebook tiene `message` y
// un media de Instagram tiene `caption`; en Facebook se responde publicando un
// comentario hijo (`/comments`) y en Instagram con `/replies`; ocultar es
// `is_hidden` en una y `hide` en la otra. Afuera se ve una sola forma.
//
// Docs: https://developers.facebook.com/docs/graph-api/reference/comment
//       https://developers.facebook.com/docs/instagram-api/guides/comment-moderation

import { graphFetch, type GraphParams } from './meta-graph';

export type PlataformaSocial = 'facebook_page' | 'instagram';

/** Una publicación con sus datos mínimos, venga de donde venga. */
export type PublicacionRemota = {
  id: string;
  texto: string;
  permalink: string | null;
  creadoEn: string | null;
};

/** Un comentario tal como lo devuelve Meta, ya normalizado. */
export type ComentarioRemoto = {
  id: string;
  parentId: string | null;
  autor: string | null;
  autorId: string | null;
  texto: string;
  creadoEn: string | null;
  likes: number;
  oculto: boolean;
};

type Paginado<T> = { data?: T[]; paging?: { next?: string } };

/** Últimas publicaciones de una página de Facebook. */
async function publicacionesDeFacebook(pageId: string, token: string, limite: number): Promise<PublicacionRemota[]> {
  const res = await graphFetch<Paginado<{ id: string; message?: string; story?: string; permalink_url?: string; created_time?: string }>>(
    `/${pageId}/posts`,
    { token, params: { fields: 'id,message,story,permalink_url,created_time', limit: limite } },
  );
  return (res.data ?? []).map((p) => ({
    id: p.id,
    texto: p.message ?? p.story ?? '',
    permalink: p.permalink_url ?? null,
    creadoEn: p.created_time ?? null,
  }));
}

/** Últimas publicaciones de una cuenta de Instagram Business. */
async function publicacionesDeInstagram(igUserId: string, token: string, limite: number): Promise<PublicacionRemota[]> {
  const res = await graphFetch<Paginado<{ id: string; caption?: string; permalink?: string; timestamp?: string }>>(
    `/${igUserId}/media`,
    { token, params: { fields: 'id,caption,permalink,timestamp', limit: limite } },
  );
  return (res.data ?? []).map((m) => ({
    id: m.id,
    texto: m.caption ?? '',
    permalink: m.permalink ?? null,
    creadoEn: m.timestamp ?? null,
  }));
}

export async function listarPublicaciones(
  plataforma: PlataformaSocial,
  cuentaExternalId: string,
  token: string,
  limite = 15,
): Promise<PublicacionRemota[]> {
  return plataforma === 'instagram'
    ? publicacionesDeInstagram(cuentaExternalId, token, limite)
    : publicacionesDeFacebook(cuentaExternalId, token, limite);
}

/**
 * Comentarios de una publicación, con sus respuestas.
 *
 * Se piden en orden cronológico inverso y aplanados (el hilo entero, no sólo
 * los de primer nivel): una respuesta a un comentario también es alguien
 * esperando que le contesten, y si sólo se miraran los de primer nivel esas
 * conversaciones quedarían mudas.
 */
export async function listarComentarios(
  plataforma: PlataformaSocial,
  postId: string,
  token: string,
  limite = 50,
): Promise<ComentarioRemoto[]> {
  if (plataforma === 'instagram') {
    const res = await graphFetch<
      Paginado<{
        id: string;
        text?: string;
        username?: string;
        timestamp?: string;
        like_count?: number;
        hidden?: boolean;
        replies?: Paginado<{ id: string; text?: string; username?: string; timestamp?: string; like_count?: number; hidden?: boolean }>;
      }>
    >(`/${postId}/comments`, {
      token,
      params: { fields: 'id,text,username,timestamp,like_count,hidden,replies{id,text,username,timestamp,like_count,hidden}', limit: limite },
    });
    const out: ComentarioRemoto[] = [];
    for (const c of res.data ?? []) {
      out.push({
        id: c.id,
        parentId: null,
        autor: c.username ?? null,
        autorId: null,
        texto: c.text ?? '',
        creadoEn: c.timestamp ?? null,
        likes: c.like_count ?? 0,
        oculto: Boolean(c.hidden),
      });
      for (const r of c.replies?.data ?? []) {
        out.push({
          id: r.id,
          parentId: c.id,
          autor: r.username ?? null,
          autorId: null,
          texto: r.text ?? '',
          creadoEn: r.timestamp ?? null,
          likes: r.like_count ?? 0,
          oculto: Boolean(r.hidden),
        });
      }
    }
    return out;
  }

  const res = await graphFetch<
    Paginado<{
      id: string;
      message?: string;
      created_time?: string;
      like_count?: number;
      is_hidden?: boolean;
      from?: { id?: string; name?: string };
      parent?: { id?: string };
    }>
  >(`/${postId}/comments`, {
    token,
    params: {
      fields: 'id,message,created_time,like_count,is_hidden,from{id,name},parent{id}',
      filter: 'stream',
      order: 'reverse_chronological',
      limit: limite,
    },
  });
  return (res.data ?? []).map((c) => ({
    id: c.id,
    parentId: c.parent?.id ?? null,
    // Meta anonimiza el autor cuando la app no tiene permiso para verlo: el
    // comentario igual se lee y se responde, sólo que sin nombre.
    autor: c.from?.name ?? null,
    autorId: c.from?.id ?? null,
    texto: c.message ?? '',
    creadoEn: c.created_time ?? null,
    likes: c.like_count ?? 0,
    oculto: Boolean(c.is_hidden),
  }));
}

/**
 * Contesta un comentario. Devuelve el id de la respuesta publicada.
 *
 * Instagram responde dentro del hilo (`/replies`); Facebook publica un
 * comentario hijo (`/comments`). En los dos casos el que habla es la página,
 * no la persona que aprieta el botón.
 */
export async function responderComentarioRemoto(
  plataforma: PlataformaSocial,
  comentarioId: string,
  texto: string,
  token: string,
): Promise<string> {
  const path = plataforma === 'instagram' ? `/${comentarioId}/replies` : `/${comentarioId}/comments`;
  const res = await graphFetch<{ id?: string }>(path, { method: 'POST', token, params: { message: texto } });
  if (!res?.id) throw new Error('Meta no devolvió el id de la respuesta.');
  return res.id;
}

/** Oculta (o vuelve a mostrar) un comentario. */
export async function ocultarComentarioRemoto(
  plataforma: PlataformaSocial,
  comentarioId: string,
  oculto: boolean,
  token: string,
): Promise<void> {
  const params: GraphParams = plataforma === 'instagram' ? { hide: oculto } : { is_hidden: oculto };
  await graphFetch(`/${comentarioId}`, { method: 'POST', token, params });
}

/**
 * Respuesta privada al comentario: le llega al autor por Messenger.
 *
 * Sólo Facebook, y sólo una vez por comentario (regla de Meta). Requiere
 * `pages_messaging`; si la página no lo tiene, la Graph devuelve error y el
 * llamador lo muestra tal cual en vez de fingir que salió.
 */
export async function responderEnPrivado(comentarioId: string, texto: string, token: string): Promise<void> {
  await graphFetch(`/${comentarioId}/private_replies`, { method: 'POST', token, params: { message: texto } });
}
