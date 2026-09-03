import { createContactTask, listContactTasks } from '@/lib/plugins/tasks/server/contact-tasks';
import { logBotAction, resolveActorUserId, resolveChatContact } from './context';
import { fail, ok, type BuiltinToolDefinition } from './types';

/** Tareas: seguimiento interno vinculado al contacto. */
export const tasksTools: BuiltinToolDefinition[] = [
  {
    name: 'create_followup_task',
    pluginId: 'tasks',
    label: 'Crear tarea de seguimiento',
    summary: 'Crea una tarea para el equipo humano vinculada al contacto (llamar, enviar presupuesto, revisar reclamo).',
    risk: 'write',
    description:
      'Crea una tarea interna para el equipo humano vinculada a esta persona: "llamar mañana", "enviar presupuesto", "revisar reclamo". Usala cuando prometas algo que un humano debe hacer o cuando el cliente pida algo que vos no podés resolver. No le cuentes al cliente el detalle interno; sólo confirmale que el equipo lo va a atender.',
    parameters: {
      type: 'object',
      required: ['title'],
      properties: {
        title: { type: 'string', description: 'Qué hay que hacer, en imperativo y breve' },
        notes: { type: 'string', description: 'Contexto para quien la tome: qué pidió el cliente, datos clave' },
        due_date: { type: 'string', description: 'Fecha límite YYYY-MM-DD (opcional)' },
      },
    },
    execute: async (args, context) => {
      const title = typeof args.title === 'string' ? args.title.trim().slice(0, 200) : '';
      if (!title) return fail('title es obligatorio');
      const bundle = await resolveChatContact(context);
      if (!bundle) return fail('Chat no encontrado');
      const actorId = await resolveActorUserId(context.teamId, bundle.contact);
      if (!actorId) return fail('El equipo no tiene miembros para asignar la tarea');
      const result = await createContactTask({
        teamId: context.teamId,
        userId: actorId,
        contactId: bundle.contact.id,
        title,
        notes: typeof args.notes === 'string' ? `${args.notes.slice(0, 2000)}\n\n(Creada por el agente IA desde WhatsApp)` : 'Creada por el agente IA desde WhatsApp',
        dueDate: typeof args.due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.due_date) ? args.due_date : null,
        status: 'open',
      });
      if ('error' in result) return fail(String(result.error));
      await logBotAction(context, bundle, `@@syslog_ai_added_note`);
      return ok({ task_id: result.task.id, title, due_date: result.task.dueDate ?? null });
    },
  },
  {
    name: 'list_contact_tasks',
    pluginId: 'tasks',
    label: 'Ver tareas del contacto',
    summary: 'Tareas abiertas del equipo relacionadas con esta persona (para no prometer dos veces lo mismo).',
    risk: 'read',
    description: 'Lista las tareas internas abiertas relacionadas con esta persona, con estado y fecha límite. Usala para saber si el equipo ya tiene pendiente algo que el cliente reclama y evitar duplicar tareas.',
    parameters: { type: 'object', properties: { include_done: { type: 'boolean', description: 'Incluir también las terminadas' } } },
    execute: async (args, context) => {
      const bundle = await resolveChatContact(context);
      if (!bundle) return fail('Chat no encontrado');
      const rows = await listContactTasks(context.teamId, bundle.contact.id);
      const filtered = args.include_done ? rows : rows.filter((t) => t.status !== 'done');
      return ok({ tasks: filtered.slice(0, 15).map((t) => ({ task_id: t.id, title: t.title, status: t.status, due_date: t.dueDate ?? null, project: t.projectName, column: t.columnName })) });
    },
  },
];
