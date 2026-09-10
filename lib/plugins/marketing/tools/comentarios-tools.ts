import 'server-only';
import { z } from 'zod';
import { assertPermission, parse, type GrokActionContext, type GrokActionTool } from '@/lib/plugins/grok-connector/server/actions';
import {
  ESTADOS_COMENTARIO,
  listarBandeja,
  marcarComentario,
  ocultarComentario,
  responderComentario,
  sincronizarComentarios,
} from '@/lib/plugins/marketing/server/comentarios';

/**
 * Comentarios de Facebook e Instagram por MCP (`whatspro_social_comments*`).
 *
 * 🚨 `inputSchema` es JSON Schema puro: un `z.object` adentro hace desaparecer
 * la tool en silencio. Zod se usa sólo DENTRO del handler. Verificar con
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-connector-tools.mts
 *
 * La regla que no se afloja: **responder publica de verdad**, con el nombre de
 * la página, y no se deshace. Por eso la tool de respuesta pide permiso de
 * escritura de Marketing y nunca se llama "por las dudas": se contesta lo que
 * una persona pidió contestar, o lo que la bandeja marcó como pendiente y el
 * pedido de esa persona autoriza. Ocultar y marcar sí son reversibles.
 */

const MARKETING_PLUGIN_ID = 'marketing';

const listSchema = z.object({
  status: z.enum(['nuevo', 'respondido', 'ignorado', 'oculto', 'todos']).optional(),
  platform: z.enum(['facebook_page', 'instagram']).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  sync: z.boolean().optional(),
});

const replySchema = z.object({
  comment_id: z.number().int().positive(),
  text: z.string().trim().min(1).max(8000),
  private: z.boolean().optional(),
});

const manageSchema = z.object({
  comment_id: z.number().int().positive(),
  action: z.enum(['marcar', 'ocultar', 'mostrar']),
  status: z.enum(ESTADOS_COMENTARIO as unknown as [string, ...string[]]).optional(),
});

export const comentariosReadTools: GrokActionTool[] = [
  {
    name: 'whatspro_social_comments',
    description:
      'Bandeja de comentarios de Facebook e Instagram del equipo: quién comentó, qué dijo, en qué publicación, hace cuánto y ' +
      'en qué estado está (nuevo = nadie contestó todavía, respondido, ignorado, oculto). Con `sync: true` primero le pide a ' +
      'Meta los comentarios nuevos de las últimas publicaciones y después devuelve la bandeja actualizada — usalo cuando te ' +
      'pidan "fijate si hay comentarios nuevos". Usa el mismo token de página que ya conectó el publicador: no hay cuenta que ' +
      'verificar ni sesión que iniciar. Cada fila trae `id` (el de acá, el que piden las otras tools), el permalink de la ' +
      'publicación y, si ya se contestó, con qué. No escribe nada salvo el sync, que sólo trae datos.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['nuevo', 'respondido', 'ignorado', 'oculto', 'todos'], description: 'Default nuevo.' },
        platform: { type: 'string', enum: ['facebook_page', 'instagram'] },
        limit: { type: 'integer', minimum: 1, maximum: 200 },
        sync: { type: 'boolean', description: 'Traer primero lo nuevo desde Meta.' },
      },
      additionalProperties: false,
    },
  },
];

export const comentariosActionTools: GrokActionTool[] = [
  {
    name: 'whatspro_social_comment_reply',
    description:
      'RESPONDE un comentario de Facebook o Instagram. La respuesta se publica DE VERDAD en la red, con el nombre de la ' +
      'página, debajo del comentario, y no se puede deshacer desde acá. Usala sólo cuando una persona te pidió contestar ese ' +
      'comentario (o te pidió contestar los pendientes); nunca por tu cuenta al ver la bandeja. `private: true` (sólo ' +
      'Facebook) manda la respuesta por Messenger al autor en vez de publicarla, y Meta la permite UNA sola vez por ' +
      'comentario. Escribí como el equipo: español rioplatense, directo, sin "Estimado cliente"; si el comentario pregunta un ' +
      'precio que no sabés, no lo inventes — pedile el dato a la persona. Al responder, el comentario queda en estado ' +
      'respondido y sale de los pendientes.',
    inputSchema: {
      type: 'object',
      required: ['comment_id', 'text'],
      properties: {
        comment_id: { type: 'integer', minimum: 1, description: 'El `id` de la fila en whatspro_social_comments.' },
        text: { type: 'string', minLength: 1, maxLength: 8000 },
        private: { type: 'boolean', description: 'Facebook: contestar por Messenger en vez de debajo de la publicación.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_social_comment_manage',
    description:
      'Cambia el estado de un comentario sin escribirle a nadie. action="marcar" con `status` (nuevo | respondido | ignorado ' +
      '| oculto) sólo mueve la fila en NUESTRA bandeja — sirve para sacar de pendientes lo que no necesita respuesta (un ' +
      'emoji, un saludo). action="ocultar" y action="mostrar" sí tocan la red: ocultar deja el comentario invisible para todos ' +
      'menos su autor, y se revierte con mostrar. Usá ocultar sólo para spam o agravios, y cuando una persona lo pida.',
    inputSchema: {
      type: 'object',
      required: ['comment_id', 'action'],
      properties: {
        comment_id: { type: 'integer', minimum: 1 },
        action: { type: 'string', enum: ['marcar', 'ocultar', 'mostrar'] },
        status: { type: 'string', enum: [...ESTADOS_COMENTARIO], description: 'Sólo con action="marcar".' },
      },
      additionalProperties: false,
    },
  },
];

export async function executeComentariosTool(name: string, input: Record<string, unknown>, context: GrokActionContext): Promise<unknown> {
  if (name === 'whatspro_social_comments') {
    await assertPermission(context, 'marketingRead', MARKETING_PLUGIN_ID);
    const data = parse(listSchema, input);
    let sync: Awaited<ReturnType<typeof sincronizarComentarios>> | null = null;
    if (data.sync) {
      try {
        sync = await sincronizarComentarios(context.teamId, {});
      } catch (error) {
        // Sin cuentas conectadas o con el token vencido, la bandeja guardada
        // sigue sirviendo: se devuelve con el aviso en vez de fallar entera.
        sync = { cuentas: 0, publicaciones: 0, nuevos: 0, actualizados: 0, errores: [{ cuenta: 'sync', error: error instanceof Error ? error.message : String(error) }] };
      }
    }
    const bandeja = await listarBandeja(context.teamId, {
      status: (data.status ?? 'nuevo') as never,
      platform: data.platform,
      limit: data.limit,
    });
    return { ...bandeja, sync };
  }

  if (name === 'whatspro_social_comment_reply') {
    await assertPermission(context, 'marketingWrite', MARKETING_PLUGIN_ID);
    const data = parse(replySchema, input);
    const comentario = await responderComentario(context.teamId, context.userId, data.comment_id, data.text, { privado: data.private });
    return { comentario, note: data.private ? 'Enviado por Messenger al autor.' : 'Publicado debajo del comentario, como la página.' };
  }

  if (name === 'whatspro_social_comment_manage') {
    await assertPermission(context, 'marketingWrite', MARKETING_PLUGIN_ID);
    const data = parse(manageSchema, input);
    if (data.action === 'marcar') {
      if (!data.status) throw new Error('action="marcar" necesita `status`.');
      await marcarComentario(context.teamId, context.userId, data.comment_id, data.status as never);
      return { ok: true, status: data.status };
    }
    const oculto = data.action === 'ocultar';
    await ocultarComentario(context.teamId, context.userId, data.comment_id, oculto);
    return { ok: true, oculto };
  }

  throw new Error(`comentarios: tool desconocida ${name}`);
}
