import 'server-only';

import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import { activityLogs, socialAccounts, socialComments } from '@/lib/db/schema';
import { MetaGraphError } from '@/lib/social/meta-graph';
import {
  listarComentarios as listarComentariosRemotos,
  listarPublicaciones,
  ocultarComentarioRemoto,
  responderComentarioRemoto,
  responderEnPrivado,
  type PlataformaSocial,
} from '@/lib/social/meta-comments';

/**
 * Comentarios de Facebook e Instagram, contestados desde Marketing.
 *
 * Publicar ya se hacía desde acá; leer lo que la gente contestaba, no: había
 * que entrar a Facebook o a Instagram —con su login y su verificación cada
 * vez— para enterarse de que alguien había preguntado un precio abajo de una
 * publicación. Esto usa el MISMO Page Access Token que ya guardó el publicador,
 * así que no hay una cuenta nueva que conectar ni un permiso nuevo que
 * aprobar: si la publicación salió desde acá, el comentario se contesta desde
 * acá.
 *
 * Reglas que no se aflojan:
 *  - **Nada sale sin que alguien lo escriba.** No hay respuesta automática ni
 *    borrador que se publique solo: la IA puede redactar, pero publicar es un
 *    acto explícito, igual que un envío de WhatsApp.
 *  - **Meta es la fuente de verdad.** El estado nuestro (`nuevo`, `respondido`,
 *    `ignorado`) es del equipo; el texto, el autor y el hilo son los que
 *    devuelve la Graph.
 *  - **Sincronizar dos veces no duplica** (índice único por comentario) ni
 *    revive lo que el equipo ya resolvió.
 */

export type EstadoComentario = 'nuevo' | 'respondido' | 'ignorado' | 'oculto';
export const ESTADOS_COMENTARIO: EstadoComentario[] = ['nuevo', 'respondido', 'ignorado', 'oculto'];

export class ComentariosError extends Error {
  code: 'not_found' | 'invalid' | 'sin_cuentas' | 'meta';
  constructor(code: ComentariosError['code'], message: string) {
    super(message);
    this.name = 'ComentariosError';
    this.code = code;
  }
}

export type ComentarioRow = {
  id: number;
  platform: PlataformaSocial;
  cuenta: string;
  externalId: string;
  parentExternalId: string | null;
  postExternalId: string;
  postPermalink: string | null;
  postExcerpt: string | null;
  autor: string | null;
  mensaje: string;
  creadoEn: string | null;
  status: EstadoComentario;
  oculto: boolean;
  likes: number;
  respuesta: string | null;
  respondidoEn: string | null;
};

export type BandejaComentarios = {
  cuentas: Array<{ id: number; platform: PlataformaSocial; nombre: string; status: string }>;
  conteos: Record<EstadoComentario, number>;
  rows: ComentarioRow[];
  /** Última vez que se trajo algo de Meta. */
  ultimaSync: string | null;
};

const LIMITE_DEFECTO = 100;

function esPlataforma(v: string): v is PlataformaSocial {
  return v === 'facebook_page' || v === 'instagram';
}

async function audit(teamId: number, userId: number | null, action: string, metadata: Record<string, unknown>) {
  try {
    await db.insert(activityLogs).values({ teamId, userId, action, ipAddress: JSON.stringify(metadata).slice(0, 500) });
  } catch {
    // La auditoría no puede voltear la operación que audita.
  }
}

/** Las cuentas de redes del equipo que sirven para leer comentarios. */
async function cuentasDelEquipo(teamId: number) {
  const filas = await db
    .select({
      id: socialAccounts.id,
      platform: socialAccounts.platform,
      externalId: socialAccounts.externalId,
      name: socialAccounts.name,
      accessToken: socialAccounts.accessToken,
      status: socialAccounts.status,
    })
    .from(socialAccounts)
    .where(eq(socialAccounts.teamId, teamId));
  return filas.filter((c) => esPlataforma(c.platform));
}

export type ResultadoSync = {
  cuentas: number;
  publicaciones: number;
  nuevos: number;
  actualizados: number;
  errores: Array<{ cuenta: string; error: string }>;
};

/**
 * Trae los comentarios de las últimas publicaciones de cada cuenta.
 *
 * `limitePublicaciones` acota cuánto se mira hacia atrás: los comentarios
 * llegan casi siempre sobre lo último que se publicó, y recorrer el año entero
 * en cada corrida gastaría la cuota de la Graph sin traer nada nuevo.
 */
export async function sincronizarComentarios(
  teamId: number,
  opts: { limitePublicaciones?: number; limiteComentarios?: number; accountId?: number } = {},
): Promise<ResultadoSync> {
  const todas = await cuentasDelEquipo(teamId);
  const cuentas = opts.accountId ? todas.filter((c) => c.id === opts.accountId) : todas.filter((c) => c.status === 'active');
  if (!cuentas.length) {
    throw new ComentariosError(
      'sin_cuentas',
      'No hay cuentas de Facebook o Instagram conectadas. Conectalas una vez en Publicaciones › Cuentas y no hay que volver a verificar nada.',
    );
  }

  const limitePosts = Math.min(Math.max(1, opts.limitePublicaciones ?? 15), 50);
  const limiteComentarios = Math.min(Math.max(1, opts.limiteComentarios ?? 50), 100);
  const out: ResultadoSync = { cuentas: cuentas.length, publicaciones: 0, nuevos: 0, actualizados: 0, errores: [] };
  const ahora = new Date();

  for (const cuenta of cuentas) {
    if (!esPlataforma(cuenta.platform)) continue;
    try {
      const publicaciones = await listarPublicaciones(cuenta.platform, cuenta.externalId, cuenta.accessToken, limitePosts);
      out.publicaciones += publicaciones.length;

      for (const post of publicaciones) {
        const comentarios = await listarComentariosRemotos(cuenta.platform, post.id, cuenta.accessToken, limiteComentarios);
        if (!comentarios.length) continue;

        const existentes = await db
          .select({ externalId: socialComments.externalId })
          .from(socialComments)
          .where(
            and(
              eq(socialComments.teamId, teamId),
              eq(socialComments.platform, cuenta.platform),
              inArray(socialComments.externalId, comentarios.map((c) => c.id)),
            ),
          );
        const yaConocidos = new Set(existentes.map((e) => e.externalId));

        for (const c of comentarios) {
          const base = {
            teamId,
            accountId: cuenta.id,
            platform: cuenta.platform,
            externalId: c.id,
            parentExternalId: c.parentId,
            postExternalId: post.id,
            postPermalink: post.permalink,
            postExcerpt: post.texto ? post.texto.slice(0, 300) : null,
            authorName: c.autor,
            authorExternalId: c.autorId,
            message: c.texto,
            commentCreatedAt: c.creadoEn ? new Date(c.creadoEn) : null,
            isHidden: c.oculto,
            likeCount: c.likes,
            syncedAt: ahora,
            updatedAt: ahora,
          };
          await db
            .insert(socialComments)
            .values({ ...base, status: c.oculto ? 'oculto' : 'nuevo' })
            .onConflictDoUpdate({
              target: [socialComments.teamId, socialComments.platform, socialComments.externalId],
              // El estado NO se pisa: si el equipo lo respondió o lo ignoró, una
              // sincronización no puede devolverlo a la bandeja como si fuera
              // nuevo. Lo que se refresca es lo que vive en Meta.
              set: {
                message: base.message,
                authorName: base.authorName,
                likeCount: base.likeCount,
                isHidden: base.isHidden,
                postPermalink: base.postPermalink,
                postExcerpt: base.postExcerpt,
                syncedAt: ahora,
                updatedAt: ahora,
              },
            });
          if (yaConocidos.has(c.id)) out.actualizados += 1;
          else out.nuevos += 1;
        }
      }
    } catch (error) {
      const mensaje =
        error instanceof MetaGraphError && error.isTokenError
          ? 'El token de esta cuenta venció: reconectala en Publicaciones › Cuentas.'
          : error instanceof Error
            ? error.message
            : String(error);
      out.errores.push({ cuenta: cuenta.name, error: mensaje });
      if (error instanceof MetaGraphError && error.isTokenError) {
        await db.update(socialAccounts).set({ status: 'token_expired', updatedAt: ahora }).where(eq(socialAccounts.id, cuenta.id));
      }
    }
  }

  await audit(teamId, null, 'MARKETING_COMENTARIOS_SYNC', {
    cuentas: out.cuentas,
    nuevos: out.nuevos,
    actualizados: out.actualizados,
    errores: out.errores.length,
  });
  return out;
}

export async function listarBandeja(
  teamId: number,
  opts: { status?: EstadoComentario | 'todos'; platform?: PlataformaSocial; accountId?: number; limit?: number } = {},
): Promise<BandejaComentarios> {
  const cuentas = await cuentasDelEquipo(teamId);
  const condiciones = [eq(socialComments.teamId, teamId)];
  if (opts.status && opts.status !== 'todos') condiciones.push(eq(socialComments.status, opts.status));
  if (opts.platform) condiciones.push(eq(socialComments.platform, opts.platform));
  if (opts.accountId) condiciones.push(eq(socialComments.accountId, opts.accountId));

  const [filas, conteosRaw, ultima] = await Promise.all([
    db
      .select()
      .from(socialComments)
      .where(and(...condiciones))
      .orderBy(desc(socialComments.commentCreatedAt), desc(socialComments.id))
      .limit(Math.min(Math.max(1, opts.limit ?? LIMITE_DEFECTO), 300)),
    db
      .select({ status: socialComments.status, n: sql<number>`count(*)::int` })
      .from(socialComments)
      .where(eq(socialComments.teamId, teamId))
      // `group by 1` por posición: la misma trampa de siempre con los
      // parámetros que drizzle renumera.
      .groupBy(sql`1`),
    db
      .select({ ultima: sql<Date | null>`max(${socialComments.syncedAt})` })
      .from(socialComments)
      .where(eq(socialComments.teamId, teamId)),
  ]);

  const conteos: Record<EstadoComentario, number> = { nuevo: 0, respondido: 0, ignorado: 0, oculto: 0 };
  for (const c of conteosRaw) {
    if (ESTADOS_COMENTARIO.includes(c.status as EstadoComentario)) conteos[c.status as EstadoComentario] = c.n;
  }
  const nombrePorCuenta = new Map(cuentas.map((c) => [c.id, c.name]));

  return {
    cuentas: cuentas.map((c) => ({ id: c.id, platform: c.platform as PlataformaSocial, nombre: c.name, status: c.status })),
    conteos,
    ultimaSync: ultima[0]?.ultima ? new Date(ultima[0].ultima).toISOString() : null,
    rows: filas.map((f) => ({
      id: f.id,
      platform: f.platform as PlataformaSocial,
      cuenta: (f.accountId != null ? nombrePorCuenta.get(f.accountId) : null) ?? 'Cuenta desconectada',
      externalId: f.externalId,
      parentExternalId: f.parentExternalId,
      postExternalId: f.postExternalId,
      postPermalink: f.postPermalink,
      postExcerpt: f.postExcerpt,
      autor: f.authorName,
      mensaje: f.message,
      creadoEn: f.commentCreatedAt ? f.commentCreatedAt.toISOString() : null,
      status: f.status as EstadoComentario,
      oculto: f.isHidden,
      likes: f.likeCount,
      respuesta: f.replyText,
      respondidoEn: f.repliedAt ? f.repliedAt.toISOString() : null,
    })),
  };
}

async function comentarioConToken(teamId: number, comentarioId: number) {
  const [fila] = await db
    .select()
    .from(socialComments)
    .where(and(eq(socialComments.teamId, teamId), eq(socialComments.id, comentarioId)))
    .limit(1);
  if (!fila) throw new ComentariosError('not_found', 'Ese comentario no existe en este equipo.');
  if (fila.accountId == null) throw new ComentariosError('invalid', 'El comentario quedó sin cuenta: reconectá la página para poder responder.');
  const [cuenta] = await db
    .select({ accessToken: socialAccounts.accessToken, name: socialAccounts.name, status: socialAccounts.status })
    .from(socialAccounts)
    .where(and(eq(socialAccounts.teamId, teamId), eq(socialAccounts.id, fila.accountId)))
    .limit(1);
  if (!cuenta) throw new ComentariosError('invalid', 'La cuenta de esa publicación ya no está conectada.');
  if (!esPlataforma(fila.platform)) throw new ComentariosError('invalid', `Plataforma desconocida: ${fila.platform}`);
  return { fila, cuenta, plataforma: fila.platform as PlataformaSocial };
}

/** Publica la respuesta en la red y deja el rastro de quién la escribió. */
export async function responderComentario(
  teamId: number,
  userId: number,
  comentarioId: number,
  texto: string,
  opts: { privado?: boolean } = {},
): Promise<ComentarioRow> {
  const limpio = texto.trim();
  if (limpio.length < 1) throw new ComentariosError('invalid', 'La respuesta no puede estar vacía.');
  if (limpio.length > 8000) throw new ComentariosError('invalid', 'La respuesta es demasiado larga.');
  const { fila, cuenta, plataforma } = await comentarioConToken(teamId, comentarioId);

  let replyId: string | null = null;
  try {
    if (opts.privado) {
      if (plataforma !== 'facebook_page') throw new ComentariosError('invalid', 'La respuesta privada existe sólo en Facebook.');
      await responderEnPrivado(fila.externalId, limpio, cuenta.accessToken);
    } else {
      replyId = await responderComentarioRemoto(plataforma, fila.externalId, limpio, cuenta.accessToken);
    }
  } catch (error) {
    if (error instanceof MetaGraphError) {
      throw new ComentariosError('meta', `Meta rechazó la respuesta: ${error.message}${error.isTokenError ? ' (el token venció: reconectá la cuenta)' : ''}`);
    }
    throw error;
  }

  const ahora = new Date();
  await db
    .update(socialComments)
    .set({ status: 'respondido', replyText: limpio, replyExternalId: replyId, repliedAt: ahora, repliedBy: userId, updatedAt: ahora })
    .where(and(eq(socialComments.teamId, teamId), eq(socialComments.id, comentarioId)));

  await audit(teamId, userId, 'MARKETING_COMENTARIO_RESPONDIDO', {
    comentarioId,
    platform: plataforma,
    privado: Boolean(opts.privado),
    cuenta: cuenta.name,
  });

  const bandeja = await listarBandeja(teamId, { status: 'todos', limit: 300 });
  const row = bandeja.rows.find((r) => r.id === comentarioId);
  if (!row) throw new ComentariosError('not_found', 'La respuesta salió pero no se pudo releer el comentario.');
  return row;
}

/** Marca sin tocar la red: es el estado del equipo, no el de Meta. */
export async function marcarComentario(
  teamId: number,
  userId: number,
  comentarioId: number,
  status: EstadoComentario,
): Promise<void> {
  if (!ESTADOS_COMENTARIO.includes(status)) throw new ComentariosError('invalid', `Estado desconocido: ${status}`);
  const [fila] = await db
    .select({ id: socialComments.id })
    .from(socialComments)
    .where(and(eq(socialComments.teamId, teamId), eq(socialComments.id, comentarioId)))
    .limit(1);
  if (!fila) throw new ComentariosError('not_found', 'Ese comentario no existe en este equipo.');
  await db
    .update(socialComments)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(socialComments.teamId, teamId), eq(socialComments.id, comentarioId)));
  await audit(teamId, userId, 'MARKETING_COMENTARIO_MARCADO', { comentarioId, status });
}

/** Oculta o vuelve a mostrar el comentario EN la red. */
export async function ocultarComentario(
  teamId: number,
  userId: number,
  comentarioId: number,
  oculto: boolean,
): Promise<void> {
  const { fila, cuenta, plataforma } = await comentarioConToken(teamId, comentarioId);
  try {
    await ocultarComentarioRemoto(plataforma, fila.externalId, oculto, cuenta.accessToken);
  } catch (error) {
    if (error instanceof MetaGraphError) throw new ComentariosError('meta', `Meta rechazó el cambio: ${error.message}`);
    throw error;
  }
  const ahora = new Date();
  await db
    .update(socialComments)
    .set({ isHidden: oculto, status: oculto ? 'oculto' : 'nuevo', updatedAt: ahora })
    .where(and(eq(socialComments.teamId, teamId), eq(socialComments.id, comentarioId)));
  await audit(teamId, userId, 'MARKETING_COMENTARIO_OCULTO', { comentarioId, oculto });
}
