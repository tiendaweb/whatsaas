import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { contacts, messages, teamTaskProjects, teamTaskWorkspaces, type TaskChecklistItem } from '@/lib/db/schema';
import { createTaskInColumn, getProjectFirstColumn, insertRelation } from '@/lib/plugins/tasks/server/task-os';
import { buildChatContext, runSkillWithApi } from './skill-runner';

/**
 * Pedidos de demo: una tarea por contacto en el workspace "Demos" de Tareas OS.
 *
 * Cuando un lote `request_demo` se ejecuta, cada contacto se convierte en una
 * tarea que ya trae hecho el trabajo previo: la investigación del chat (qué
 * negocio tiene, qué pidió, qué tono usa) y el prompt listo para generar su
 * sitio en AAPP SPACE. Quien tome la tarea sólo tiene que correr el prompt,
 * publicar y avisarle al cliente —eso queda como checklist—.
 *
 * El prompt lo redacta la IA del equipo sobre el expediente del chat; si la
 * cuota está agotada, se arma uno base con los últimos mensajes del cliente
 * para que la tarea nunca quede vacía (`promptSource` dice cuál fue).
 */

export const DEMOS_WORKSPACE_NAME = 'Demos';
const DEMOS_PROJECT_NAME = 'Demos';

async function ensureDemosProject(teamId: number, userId: number) {
  let workspace = await db.query.teamTaskWorkspaces.findFirst({ where: and(eq(teamTaskWorkspaces.teamId, teamId), eq(teamTaskWorkspaces.name, DEMOS_WORKSPACE_NAME)) });
  if (!workspace) {
    [workspace] = await db.insert(teamTaskWorkspaces).values({ teamId, name: DEMOS_WORKSPACE_NAME, order: 50, icon: 'globe', createdBy: userId }).returning();
  }
  let project = await db.query.teamTaskProjects.findFirst({
    where: and(eq(teamTaskProjects.teamId, teamId), eq(teamTaskProjects.workspaceId, workspace.id), eq(teamTaskProjects.name, DEMOS_PROJECT_NAME)),
  });
  if (!project) {
    [project] = await db.insert(teamTaskProjects).values({ teamId, workspaceId: workspace.id, name: DEMOS_PROJECT_NAME, order: 0, icon: 'globe', createdBy: userId }).returning();
  }
  return { workspace, project };
}

/** Últimos mensajes de texto del cliente, para el prompt base cuando la IA no está. */
async function ultimosMensajesCliente(chatId: number, limit = 15): Promise<string[]> {
  const rows = await db
    .select({ text: messages.text, caption: messages.mediaCaption })
    .from(messages)
    .where(and(eq(messages.chatId, chatId), eq(messages.fromMe, false)))
    .orderBy(desc(messages.timestamp))
    .limit(limit);
  return rows
    .map((r) => (r.text || r.caption || '').trim())
    .filter((t) => t.length > 0)
    .reverse();
}

const PROMPT_IA = `Sos quien prepara demos de sitios web para clientes que llegaron por WhatsApp.

Con el expediente del chat de arriba, escribí DOS bloques separados por una línea que diga exactamente "=== PROMPT ===":

1) INVESTIGACIÓN (máximo 12 líneas): qué negocio tiene la persona, a qué se dedica, qué pidió o qué le interesó, tono con el que habla, datos concretos que dio (rubro, ciudad, productos, precios, redes, horarios, nombre comercial). Si algo no aparece en el chat, escribí "(no dijo)" en vez de inventarlo.

2) PROMPT: un prompt completo, listo para pegar, para generar el sitio web de demo de este cliente en AAPP SPACE (sitio de una página, tipo vcard, con la herramienta gobiz_sites_create). Tiene que incluir: nombre comercial, rubro, propuesta de valor en una frase, secciones sugeridas (portada, servicios/productos, sobre nosotros, contacto con botón de WhatsApp), textos de ejemplo escritos en el tono del cliente, paleta y estilo sugeridos según el rubro, y qué datos faltan confirmar con el cliente antes de publicar. Todo en español rioplatense. Sin teléfonos completos.`;

function promptBase(name: string, mensajes: string[], brief?: string): string {
  const citas = mensajes.length ? mensajes.map((m) => `- ${m.slice(0, 240)}`).join('\n') : '- (sin mensajes de texto del cliente; revisar audios y adjuntos en el chat)';
  return [
    'INVESTIGACIÓN (armar a mano: la IA del equipo no estaba disponible al crear la tarea)',
    `Contacto: ${name}`,
    brief ? `Pedido: ${brief}` : null,
    'Últimos mensajes del cliente:',
    citas,
    '',
    '=== PROMPT ===',
    `Generá el sitio web de demo (una página, tipo vcard, con gobiz_sites_create en AAPP SPACE) para "${name}".`,
    'Antes de escribir, leé el chat y completá: rubro, ciudad, productos o servicios, propuesta de valor, horarios y redes.',
    'Secciones: portada con nombre comercial y frase de valor; servicios o productos (3 a 6 ítems con texto corto); sobre nosotros; contacto con botón de WhatsApp.',
    'Tono: el mismo que usa el cliente en el chat. Español rioplatense. Paleta y estilo acordes al rubro.',
    'Listá al final qué datos faltan confirmar con el cliente antes de publicar.',
  ]
    .filter((l): l is string => l !== null)
    .join('\n');
}

export async function createDemoTask(input: {
  teamId: number;
  userId: number;
  chatId: number;
  contactId: number;
  name: string;
  brief?: string;
  title?: string;
  dueDate?: string | null;
  /** Investigación y prompt ya redactados (por un conector que leyó el chat): se usan tal cual, sin llamar a la IA. */
  research?: string;
  prompt?: string;
}): Promise<{ taskId: number; projectId: number; workspaceId: number; promptSource: 'ia' | 'base' | 'connector' } | { error: string }> {
  const contact = await db.query.contacts.findFirst({ where: and(eq(contacts.id, input.contactId), eq(contacts.teamId, input.teamId)), columns: { id: true, name: true } });
  if (!contact) return { error: 'contact_not_found' };
  const name = contact.name?.trim() || input.name;

  const { workspace, project } = await ensureDemosProject(input.teamId, input.userId);
  const column = await getProjectFirstColumn(input.teamId, project.id);

  let cuerpo: string;
  let promptSource: 'ia' | 'base' | 'connector' = 'base';
  if (input.prompt?.trim()) {
    cuerpo = `${input.research?.trim() || `Investigación: (la redactó el conector en la tarea)${input.brief ? `\nPedido: ${input.brief}` : ''}`}\n\n=== PROMPT ===\n${input.prompt.trim()}`;
    promptSource = 'connector';
  } else try {
    const context = await buildChatContext(input.teamId, input.chatId);
    const outcome = context ? await runSkillWithApi(input.teamId, `${input.brief ? `Pedido del equipo: ${input.brief}\n\n` : ''}${PROMPT_IA}`, context) : null;
    if (outcome?.ok && outcome.output.includes('=== PROMPT ===')) {
      cuerpo = outcome.output.trim();
      promptSource = 'ia';
    } else {
      cuerpo = promptBase(name, await ultimosMensajesCliente(input.chatId), input.brief);
    }
  } catch {
    cuerpo = promptBase(name, await ultimosMensajesCliente(input.chatId), input.brief);
  }

  const [investigacion, prompt] = cuerpo.split('=== PROMPT ===').map((s) => s.trim());
  const task = await createTaskInColumn({
    teamId: input.teamId,
    userId: input.userId,
    columnId: column.id,
    title: (input.title?.trim() || `Demo web — ${name}`).slice(0, 200),
    notes: [`Chat #${input.chatId} · contacto #${contact.id}`, '', investigacion ?? cuerpo].join('\n').slice(0, 20000),
    aiPrompt: (prompt ?? '').slice(0, 20000),
    dueDate: input.dueDate ?? null,
    checklist: [
      { id: 'investigar', text: 'Investigar el chat', completed: true },
      { id: 'prompt', text: promptSource === 'base' ? 'Completar el prompt base con los datos del chat' : promptSource === 'ia' ? 'Prompt generado por la IA (revisar)' : 'Prompt redactado por el conector', completed: promptSource !== 'base' },
      { id: 'generar', text: 'Generar el sitio en AAPP SPACE con el prompt', completed: false },
      { id: 'publicar', text: 'Publicar y revisar en el celular', completed: false },
      { id: 'avisar', text: 'Mandarle el link al cliente', completed: false },
    ] satisfies TaskChecklistItem[],
  });
  if (!task) return { error: 'task_not_created' };

  await insertRelation({
    teamId: input.teamId,
    userId: input.userId,
    sourceType: 'task',
    sourceId: task.id,
    targetType: 'contact',
    targetId: contact.id,
    relationType: 'related',
    metadata: { source: 'sales-ops:request_demo', chatId: input.chatId },
  });

  return { taskId: task.id, projectId: project.id, workspaceId: workspace.id, promptSource };
}
