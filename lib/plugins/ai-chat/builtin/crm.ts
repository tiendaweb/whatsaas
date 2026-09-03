import { and, eq, ilike, asc } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { contacts, contactTags, funnelStages, tags, users } from '@/lib/db/schema';
import { logBotAction, resolveChatContact } from './context';
import { fail, ok, type BuiltinToolDefinition } from './types';

/** Funciones del núcleo CRM: siempre disponibles (no dependen de una app). */
export const crmTools: BuiltinToolDefinition[] = [
  {
    name: 'get_contact_profile',
    pluginId: null,
    label: 'Ver ficha del contacto',
    summary: 'Nombre, email, empresa, etapa del embudo, etiquetas, campos personalizados y agente asignado de la persona que escribe.',
    risk: 'read',
    description:
      'Devuelve la ficha CRM de la persona con la que estás hablando: nombre, email, empresa, cargo, etapa del embudo, etiquetas, campos personalizados y agente asignado. Usala al inicio para personalizar el trato o cuando necesites saber qué ya sabemos de esta persona antes de preguntarle.',
    parameters: { type: 'object', properties: {} },
    execute: async (_args, context) => {
      const bundle = await resolveChatContact(context);
      if (!bundle) return fail('Chat no encontrado');
      const { contact, phone } = bundle;
      const [stage, tagRows, agent] = await Promise.all([
        contact.funnelStageId
          ? db.query.funnelStages.findFirst({ where: eq(funnelStages.id, contact.funnelStageId), columns: { name: true, emoji: true } })
          : Promise.resolve(null),
        db
          .select({ name: tags.name })
          .from(contactTags)
          .innerJoin(tags, eq(contactTags.tagId, tags.id))
          .where(eq(contactTags.contactId, contact.id)),
        contact.assignedUserId
          ? db.query.users.findFirst({ where: eq(users.id, contact.assignedUserId), columns: { name: true, email: true } })
          : Promise.resolve(null),
      ]);
      return ok({
        contact_id: contact.id,
        name: contact.name,
        phone,
        email: contact.email,
        company: contact.company,
        job_title: contact.jobTitle,
        funnel_stage: stage ? `${stage.emoji ?? ''} ${stage.name}`.trim() : null,
        tags: tagRows.map((t) => t.name),
        custom_fields: contact.customData ?? {},
        assigned_agent: agent ? agent.name || agent.email : null,
        is_vip: contact.isVip,
        temperature: contact.temperature,
        notes: contact.notes ? contact.notes.slice(-800) : null,
      });
    },
  },
  {
    name: 'update_contact_details',
    pluginId: null,
    label: 'Guardar datos del contacto',
    summary: 'Actualiza nombre, email, empresa o cargo cuando la persona los dice en la conversación.',
    risk: 'write',
    description:
      'Guarda en la ficha CRM los datos que la persona te da en la conversación: nombre completo, email, empresa y/o cargo. Llamala en cuanto el cliente mencione alguno de esos datos; sólo enviá los campos que realmente dijo.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nombre completo tal como lo dijo la persona' },
        email: { type: 'string', description: 'Email' },
        company: { type: 'string', description: 'Empresa u organización' },
        job_title: { type: 'string', description: 'Cargo o rol' },
      },
    },
    execute: async (args, context) => {
      const bundle = await resolveChatContact(context);
      if (!bundle) return fail('Chat no encontrado');
      const patch: Partial<typeof contacts.$inferInsert> = {};
      if (typeof args.name === 'string' && args.name.trim()) patch.name = args.name.trim().slice(0, 200);
      if (typeof args.email === 'string' && /\S+@\S+\.\S+/.test(args.email)) patch.email = args.email.trim().toLowerCase();
      if (typeof args.company === 'string' && args.company.trim()) patch.company = args.company.trim().slice(0, 200);
      if (typeof args.job_title === 'string' && args.job_title.trim()) patch.jobTitle = args.job_title.trim().slice(0, 120);
      if (Object.keys(patch).length === 0) return fail('No se recibió ningún dato válido para guardar');
      await db.update(contacts).set({ ...patch, updatedAt: new Date() }).where(eq(contacts.id, bundle.contact.id));
      await logBotAction(context, bundle, `@@syslog_ai_set_field|field=contacto|value=${Object.keys(patch).join(', ')}`, patch);
      return ok({ updated_fields: Object.keys(patch) });
    },
  },
  {
    name: 'move_contact_to_stage',
    pluginId: null,
    label: 'Mover a etapa del embudo',
    summary: 'Cambia la etapa del contacto buscándola por nombre (no hace falta configurar una herramienta por etapa).',
    risk: 'write',
    description:
      'Mueve al contacto a una etapa del embudo de ventas indicando el nombre de la etapa (por ejemplo "Interesado", "Presupuesto enviado", "Cliente"). Si no sabés qué etapas existen, llamala sin stage_name y te devuelve la lista.',
    parameters: {
      type: 'object',
      properties: {
        stage_name: { type: 'string', description: 'Nombre (o parte) de la etapa destino. Vacío para listar las etapas disponibles.' },
      },
    },
    execute: async (args, context) => {
      const bundle = await resolveChatContact(context);
      if (!bundle) return fail('Chat no encontrado');
      const stages = await db.query.funnelStages.findMany({
        where: eq(funnelStages.teamId, context.teamId),
        orderBy: [asc(funnelStages.order)],
        columns: { id: true, name: true, emoji: true },
      });
      const wanted = typeof args.stage_name === 'string' ? args.stage_name.trim().toLowerCase() : '';
      if (!wanted) return ok({ stages: stages.map((s) => s.name), current_stage_id: bundle.contact.funnelStageId });
      const stage =
        stages.find((s) => s.name.toLowerCase() === wanted) ?? stages.find((s) => s.name.toLowerCase().includes(wanted));
      if (!stage) return fail(`No existe una etapa parecida a "${args.stage_name}"`, { stages: stages.map((s) => s.name) });
      await db.update(contacts).set({ funnelStageId: stage.id, updatedAt: new Date() }).where(eq(contacts.id, bundle.contact.id));
      await logBotAction(context, bundle, `@@syslog_ai_moved_to_stage|stage=${stage.name}`, { funnelStageId: stage.id });
      return ok({ stage: stage.name });
    },
  },
  {
    name: 'tag_contact',
    pluginId: null,
    label: 'Etiquetar contacto',
    summary: 'Agrega una etiqueta por nombre; si no existe la crea.',
    risk: 'write',
    description:
      'Agrega una etiqueta al contacto por nombre (ej. "Interesado en plan anual", "Reclamo"). Si la etiqueta no existe en el equipo, se crea. Útil para clasificar la conversación para el equipo humano.',
    parameters: {
      type: 'object',
      required: ['tag_name'],
      properties: { tag_name: { type: 'string', description: 'Nombre corto de la etiqueta' } },
    },
    execute: async (args, context) => {
      const name = typeof args.tag_name === 'string' ? args.tag_name.trim().slice(0, 60) : '';
      if (!name) return fail('tag_name es obligatorio');
      const bundle = await resolveChatContact(context);
      if (!bundle) return fail('Chat no encontrado');
      let tag = await db.query.tags.findFirst({ where: and(eq(tags.teamId, context.teamId), ilike(tags.name, name)) });
      if (!tag) {
        [tag] = await db.insert(tags).values({ teamId: context.teamId, name, color: '#64748b' }).returning();
      }
      await db.insert(contactTags).values({ contactId: bundle.contact.id, tagId: tag.id }).onConflictDoNothing();
      await logBotAction(context, bundle, `@@syslog_ai_added_tag|tag=${tag.name}`);
      return ok({ tag: tag.name, created: false });
    },
  },
];

