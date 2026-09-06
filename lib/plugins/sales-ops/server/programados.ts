import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs, teamScheduledMessages } from '@/lib/db/schema';
import { formatZoned } from '@/lib/plugins/ai-chat/builtin/context';
import { launchRun, type PromptRunRow } from './prompt-queue';
import { chatsPorTelefono } from './telefonos';

/**
 * Un programado con prompt deja de ser un programado: es un pedido para el
 * conector.
 *
 * Antes el prompt se guardaba en el programado y se encolaba una "reescritura"
 * del texto. Pero la mitad de las veces lo que la persona escribe en ese prompt
 * no es un mensaje: es "ofrecerle una demo", "armarle el proyecto", "hacerle
 * esto más personalizado". Forzarlo a ser un texto de WhatsApp a una hora fija
 * era decidir el resultado antes de leer el chat.
 *
 * Ahora el programado se convierte en una indicación en la cola, con todo lo
 * que tenía (para quién, cuándo iba a salir, el texto viejo), y el conector lee
 * el chat y decide qué corresponde: programar un mensaje, preparar la demo o
 * crear el proyecto en Tareas OS. El programado original se borra —si lo que
 * corresponde es un mensaje, el conector crea uno nuevo— y queda auditado.
 */
export async function convertirProgramadoEnPedido(
  teamId: number,
  userId: number | null,
  scheduledId: number,
  opts: { prompt?: string } = {},
): Promise<{ run: PromptRunRow; deleted: boolean; chatId: number | null }> {
  const row = await db.query.teamScheduledMessages.findFirst({ where: and(eq(teamScheduledMessages.teamId, teamId), eq(teamScheduledMessages.id, scheduledId)) });
  if (!row) throw new Error('Programado no encontrado.');
  const prompt = (opts.prompt ?? row.aiPrompt ?? '').trim();
  if (prompt.length < 5) throw new Error('El programado no tiene prompt (mínimo 5 caracteres).');

  const numeros = Array.isArray(row.targetNumbers) ? (row.targetNumbers as string[]) : [];
  const chats = await chatsPorTelefono(teamId, numeros);
  const primero = numeros.map((n) => chats[n.replace(/\D/g, '').slice(-8)]).find(Boolean) ?? null;
  const nombre = primero?.name ?? row.name;
  const cuando = row.nextRunAt ?? row.scheduledAt ?? null;

  const texto = [
    `Pedido que nació del mensaje programado "${row.name}" para ${nombre}${cuando ? `, que iba a salir el ${formatZoned(cuando)}` : ''}.${row.status !== 'active' ? ` (estaba ${row.status})` : ''}`,
    `INDICACIÓN:\n${prompt}`,
    row.message?.trim() ? `TEXTO QUE TENÍA:\n${row.message.trim()}` : 'TEXTO QUE TENÍA: (vacío)',
    [
      'QUÉ HACER: leé el chat (whatspro_sales_dossier) y decidí el resultado que pide la indicación. No es necesariamente un mensaje:',
      `- Si corresponde un mensaje: dejalo programado con whatspro_manage_scheduled_message (action "create", una sola vez${cuando ? `, a la hora original ${cuando.toISOString()}` : ''}) o proponelo con whatspro_sales_queue_propose para que lo apruebe una persona.`,
      '- Si corresponde una demo web: whatspro_sales_tareas_from_chat {action: "demo", chat_id} crea la tarea en el workspace "Demos" con la investigación y el prompt para AAPP SPACE.',
      '- Si corresponde un proyecto para el cliente: whatspro_sales_tareas_from_chat {action: "project", chat_id, tasks: [...]} lo arma en el workspace "Clientes", vinculado al contacto.',
      'El programado original ya no existe: no lo busques ni lo edites. Cerrá con whatspro_sales_prompt_result contando qué decidiste y por qué.',
    ].join('\n'),
  ].join('\n\n');

  const { run } = await launchRun(teamId, userId, {
    text: texto,
    title: `Programado → cola · ${nombre}`.slice(0, 160),
    targetKind: primero ? 'chat' : 'team',
    targetId: primero?.chatId ?? null,
    mode: 'queue',
    // Quien apretó "pasar a la cola" ya decidió: sin esto el pedido caía en
    // "En revisión" y había que aprobarlo una segunda vez.
    approved: true,
  });

  await db.delete(teamScheduledMessages).where(and(eq(teamScheduledMessages.teamId, teamId), eq(teamScheduledMessages.id, scheduledId)));
  try {
    await db.insert(activityLogs).values({
      teamId,
      userId,
      action: 'SALES_OPS_PROGRAMADO_A_COLA',
      metadata: {
        runId: run.id,
        scheduledId,
        chatId: primero?.chatId ?? null,
        snapshot: { name: row.name, status: row.status, message: row.message, aiPrompt: row.aiPrompt, nextRunAt: cuando?.toISOString() ?? null, targetNumbers: numeros },
      },
      ipAddress: null,
    });
  } catch (error) {
    console.error('[sales-ops/programados] audit', error);
  }
  return { run, deleted: true, chatId: primero?.chatId ?? null };
}
