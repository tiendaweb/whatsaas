import 'server-only';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { chats, contacts } from '@/lib/db/schema';
import { assertPermission, parse, type GrokActionContext, type GrokActionTool } from '@/lib/plugins/grok-connector/server/actions';
import { createClientProject } from '@/lib/plugins/sales-ops/server/client-projects';
import { createDemoTask } from '@/lib/plugins/sales-ops/server/demos';
import { SALES_OPS_PLUGIN_ID } from '@/lib/plugins/sales-ops/shared/taxonomy';

/**
 * Del chat a Tareas OS, con la misma lógica que usa el servidor cuando ejecuta
 * un lote `request_demo`.
 *
 * 🚨 `inputSchema` es JSON Schema puro (nada de zod adentro).
 */
export const tareasActionTools: GrokActionTool[] = [
  {
    name: 'whatspro_sales_tareas_from_chat',
    description:
      'Convierte un chat en trabajo dentro de Tareas OS, separado donde corresponde. action="demo": crea (o completa) la tarea ' +
      '"Demo web — {nombre}" en el workspace "Demos", con la investigación del chat en las notas y el prompt para generar el ' +
      'sitio en AAPP SPACE en ai_prompt; si pasás research y prompt se usan tal cual (los escribiste vos leyendo el chat), si ' +
      'no, los redacta la IA del equipo sobre el expediente. action="project": crea el proyecto del cliente en el workspace ' +
      '"Clientes" (o el que indiques) con columnas Por hacer / En curso / Hecho y las tareas que pases, vinculado al contacto; ' +
      'si el proyecto ya existe suma las tareas en vez de duplicarlo. Ninguna de las dos envía mensajes ni toca el CRM.',
    inputSchema: {
      type: 'object',
      required: ['action', 'chat_id'],
      properties: {
        action: { type: 'string', enum: ['demo', 'project'] },
        chat_id: { type: 'integer', minimum: 1 },
        brief: { type: 'string', maxLength: 4000, description: 'Indicación breve: qué pidió el cliente o qué hay que hacer.' },
        research: { type: 'string', maxLength: 20000, description: 'demo: investigación del chat ya redactada (va a las notas de la tarea).' },
        prompt: { type: 'string', maxLength: 20000, description: 'demo: prompt listo para generar la web en AAPP SPACE (va a ai_prompt). project: prompt del proyecto.' },
        title: { type: 'string', maxLength: 200, description: 'demo: título de la tarea. project: nombre del proyecto (default: empresa o nombre del contacto).' },
        workspace_name: { type: 'string', maxLength: 200, description: 'project: workspace destino. Default "Clientes".' },
        due_date: { type: 'string', maxLength: 10, description: 'demo: vencimiento YYYY-MM-DD.' },
        tasks: {
          type: 'array',
          maxItems: 100,
          description: 'project: tareas iniciales.',
          items: {
            type: 'object',
            required: ['title'],
            properties: {
              title: { type: 'string', minLength: 1, maxLength: 200 },
              notes: { type: 'string', maxLength: 20000 },
              due_date: { type: 'string', maxLength: 10 },
              column: { type: 'string', maxLength: 200, description: 'Título de la columna destino (default: la primera).' },
            },
            additionalProperties: false,
          },
        },
        dry_run: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  },
];

const schema = z.object({
  action: z.enum(['demo', 'project']),
  chat_id: z.number().int().positive(),
  brief: z.string().max(4000).optional(),
  research: z.string().max(20000).optional(),
  prompt: z.string().max(20000).optional(),
  title: z.string().max(200).optional(),
  workspace_name: z.string().max(200).optional(),
  due_date: z.string().max(10).optional(),
  tasks: z.array(z.object({ title: z.string().min(1).max(200), notes: z.string().max(20000).optional(), due_date: z.string().max(10).optional(), column: z.string().max(200).optional() })).max(100).optional(),
  dry_run: z.boolean().optional(),
});

export async function executeTareasTool(name: string, input: Record<string, unknown>, context: GrokActionContext): Promise<unknown> {
  if (name !== 'whatspro_sales_tareas_from_chat') throw new Error(`sales-ops tareas: tool desconocida ${name}`);
  await assertPermission(context, 'salesOpsWrite', SALES_OPS_PLUGIN_ID);
  const data = parse(schema, input);

  const chat = await db.query.chats.findFirst({ where: and(eq(chats.id, data.chat_id), eq(chats.teamId, context.teamId)), columns: { id: true, name: true, pushName: true, remoteJid: true } });
  if (!chat) throw new Error(`No existe el chat ${data.chat_id} en este equipo.`);
  const contact = await db.query.contacts.findFirst({ where: and(eq(contacts.chatId, chat.id), eq(contacts.teamId, context.teamId)), columns: { id: true, name: true } });
  if (!contact) throw new Error('El chat no tiene contacto asociado: guardalo primero con whatspro_save_contact.');
  const nombre = contact.name?.trim() || chat.name || chat.pushName || `…${chat.remoteJid.replace(/\D/g, '').slice(-4)}`;

  if (data.dry_run) return { dryRun: true, action: data.action, chatId: chat.id, contactId: contact.id, name: nombre };

  if (data.action === 'demo') {
    const result = await createDemoTask({
      teamId: context.teamId,
      userId: context.userId,
      chatId: chat.id,
      contactId: contact.id,
      name: nombre,
      brief: data.brief,
      title: data.title,
      dueDate: data.due_date ?? null,
      research: data.research,
      prompt: data.prompt,
    });
    if ('error' in result) throw new Error(result.error);
    return { ...result, name: nombre, note: 'Tarea creada en el workspace "Demos". Siguiente paso: generar el sitio en AAPP SPACE con el prompt (gobiz_sites_create) y mandarle el link al cliente.' };
  }

  const result = await createClientProject({
    teamId: context.teamId,
    userId: context.userId,
    contactId: contact.id,
    workspaceName: data.workspace_name,
    projectName: data.title,
    brief: data.brief,
    aiPrompt: data.prompt,
    tasks: data.tasks?.map((t) => ({ title: t.title, notes: t.notes, dueDate: t.due_date ?? null, column: t.column })),
  });
  if ('error' in result) throw new Error(result.error);
  return { ...result, name: nombre, note: result.created ? 'Proyecto creado y vinculado al contacto.' : 'El proyecto ya existía: se sumaron las tareas.' };
}
