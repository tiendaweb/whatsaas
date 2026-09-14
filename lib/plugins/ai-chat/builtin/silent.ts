import { and, asc, desc, eq, ilike, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { contactTags, contacts, customFields, departments, funnelStages, messages, tags } from '@/lib/db/schema';
import { ensureCustomFieldsTable } from '@/lib/contacts/custom-fields';
import { notify } from '@/lib/notifications/service';
import { excludeChats } from '@/lib/plugins/sales-ops/server/exclusions';
import { clip, fail, ok, type BuiltinToolDefinition } from './types';
import { formatZoned, logBotAction, resolveActorUserId, resolveChatContact, type ChatContactBundle } from './context';
import type { BuiltinToolContext } from './types';

/**
 * Funciones silenciosas: el agente las llama mientras conversa y el cliente no
 * se entera. Registran el negocio —ficha, etiqueta, etapa, nota, aviso al
 * equipo— sin generar un solo mensaje de WhatsApp.
 *
 * Tres reglas que valen para todas y que no se aflojan:
 *
 * 1. Silencioso es para el cliente, nunca para el equipo: cada una escribe su
 *    `@@syslog_ai_*` en el chat y refresca la ficha en vivo.
 * 2. Ninguna manda un mensaje al cliente. Si hay que escribirle, lo decide el
 *    modelo en su respuesta normal o lo hace una persona.
 * 3. Son del núcleo (`pluginId: null`): funcionan aunque el equipo tenga apps
 *    apagadas. Una función de negocio que depende de un plugin que nadie
 *    encendió es una función que no existe.
 *
 * La excepción es `confirm_payment`, que vive acá porque es la otra mitad de
 * `flag_payment_proof` —el mismo momento de la conversación, dos caminos— pero
 * NO es silenciosa: un pago que se confirma sin decírselo a quien acaba de
 * pagar es peor que uno que no se confirma.
 */

/** Escribe claves en `customData` sin pisar lo que ya había. */
async function guardarCampos(
  context: BuiltinToolContext,
  bundle: ChatContactBundle,
  valores: Record<string, string | number | boolean>,
): Promise<string[]> {
  const claves = Object.keys(valores);
  if (!claves.length) return [];
  const actual = (bundle.contact.customData as Record<string, unknown>) || {};
  await db
    .update(contacts)
    .set({ customData: { ...actual, ...valores }, updatedAt: new Date() })
    .where(eq(contacts.id, bundle.contact.id));
  await asegurarCamposDefinidos(context.teamId, claves);
  return claves;
}

/**
 * Define en el equipo los campos que la función acaba de escribir.
 *
 * Sin esto el dato queda en `customData` pero no se ve en la ficha: la pantalla
 * dibuja los campos declarados en `custom_fields`, no las claves sueltas del
 * jsonb. Los equipos que ya los tienen (el 2 tiene 74) no cambian nada.
 */
async function asegurarCamposDefinidos(teamId: number, claves: string[]) {
  await ensureCustomFieldsTable();
  const existentes = await db
    .select({ key: customFields.key })
    .from(customFields)
    .where(eq(customFields.teamId, teamId));
  const yaEstan = new Set(existentes.map((f) => f.key));
  const faltan = claves.filter((k) => !yaEstan.has(k) && ETIQUETAS_DE_CAMPO[k]);
  if (!faltan.length) return;

  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${customFields.position}), 0)` })
    .from(customFields)
    .where(eq(customFields.teamId, teamId));

  await db
    .insert(customFields)
    .values(
      faltan.map((key, i) => ({
        teamId,
        key,
        name: ETIQUETAS_DE_CAMPO[key],
        type: 'text' as const,
        position: (max ?? 0) + i + 1,
      })),
    )
    .onConflictDoNothing();
}

/**
 * Nombre visible de cada clave. Son las claves que ya usa el equipo 2, para que
 * el dato caiga en el campo que la gente viene mirando hace meses y no en uno
 * nuevo con otro nombre.
 */
const ETIQUETAS_DE_CAMPO: Record<string, string> = {
  rubro: 'Rubro',
  tamano_negocio: 'Tamaño del negocio',
  nivel_digital: 'Nivel digital actual',
  dolor_principal: 'Dolor principal',
  objetivo_cliente: 'Objetivo del cliente',
  urgencia: 'Urgencia',
  presupuesto_aprox: 'Presupuesto aproximado',
  pais: 'País',
  zona: 'Zona',
  origen_lead: 'Origen del lead',
  producto_interes: 'Producto de interés',
  motivo_perdida: 'Motivo de pérdida',
  comprobante_enviado: 'Comprobante enviado',
};

/** Etiqueta por nombre: la reusa si existe, la crea si no. Nunca duplica. */
async function etiquetar(teamId: number, contactId: number, nombre: string): Promise<string | null> {
  const limpio = nombre.trim().slice(0, 100);
  if (!limpio) return null;
  const existente = await db.query.tags.findFirst({
    where: and(eq(tags.teamId, teamId), ilike(tags.name, limpio)),
    columns: { id: true, name: true },
  });
  let tagId = existente?.id;
  let tagName = existente?.name;
  if (!tagId) {
    const [creada] = await db
      .insert(tags)
      .values({ teamId, name: limpio })
      .onConflictDoNothing()
      .returning({ id: tags.id, name: tags.name });
    tagId = creada?.id;
    tagName = creada?.name;
  }
  if (!tagId) return null;
  await db.insert(contactTags).values({ contactId, tagId }).onConflictDoNothing();
  return tagName ?? limpio;
}

/** Suma una nota fechada a la ficha, sin pisar las anteriores. */
async function anotar(bundle: ChatContactBundle, texto: string): Promise<string> {
  const sello = formatZoned(new Date());
  const previas = bundle.contact.notes || '';
  const notas = previas ? `${previas}\n\n[IA · ${sello}]\n${texto}` : `[IA · ${sello}]\n${texto}`;
  await db.update(contacts).set({ notes: notas, updatedAt: new Date() }).where(eq(contacts.id, bundle.contact.id));
  return notas;
}

/** Link al chat, tal como lo arma el resto del sistema de avisos. */
function urlDelChat(bundle: ChatContactBundle): string {
  const jid = bundle.chat.remoteJid || '';
  const ruta = jid.endsWith('@g.us') ? jid : jid.split('@')[0];
  return `/dashboard/chat/${ruta}${bundle.chat.instanceId ? `?instanceId=${bundle.chat.instanceId}` : ''}`;
}

/** Busca un departamento del equipo por nombre aproximado. */
async function buscarDepartamento(teamId: number, nombre: string) {
  const limpio = nombre.trim();
  if (!limpio) return null;
  const exacto = await db.query.departments.findFirst({
    where: and(eq(departments.teamId, teamId), ilike(departments.name, limpio)),
    columns: { id: true, name: true },
  });
  if (exacto) return exacto;
  const parecido = await db.query.departments.findFirst({
    where: and(eq(departments.teamId, teamId), ilike(departments.name, `%${limpio}%`)),
    columns: { id: true, name: true },
  });
  return parecido ?? null;
}

const TEXTO = (v: unknown, max = 300): string | null => {
  if (typeof v !== 'string') return null;
  const limpio = v.trim();
  return limpio ? limpio.slice(0, max) : null;
};

export const silentTools: BuiltinToolDefinition[] = [
  {
    name: 'capture_business_profile',
    pluginId: null,
    label: 'Guardar el perfil del negocio',
    summary:
      'Anota en la ficha lo que se aprende del negocio del cliente —rubro, tamaño, nivel digital, dolor, objetivo, urgencia, presupuesto, zona y de dónde salió— sin decirle nada.',
    risk: 'write',
    silent: true,
    description:
      'Guarda en silencio el diagnóstico del negocio de la persona con la que hablás: rubro, tamaño, qué tiene hoy online, cuál es su problema principal, qué quiere lograr, qué tan apurada está, cuánto puede invertir, país/zona y cómo llegó. Llamala apenas la persona cuente cualquiera de estos datos, aunque sea uno solo, y volvé a llamarla cuando cuente otro. NO le digas al cliente que anotaste nada: seguí la charla normalmente.',
    parameters: {
      type: 'object',
      properties: {
        rubro: { type: 'string', description: 'A qué se dedica el negocio (panadería, estudio contable, indumentaria…)' },
        tamano_negocio: { type: 'string', description: 'Tamaño: emprendimiento personal, negocio chico, PyME, empresa…' },
        nivel_digital: { type: 'string', description: 'Qué tiene hoy: nada, sólo Instagram, sitio viejo, tienda en otra plataforma…' },
        dolor_principal: { type: 'string', description: 'El problema concreto que lo trajo: no vende, pierde consultas, le da vergüenza su sitio…' },
        objetivo_cliente: { type: 'string', description: 'Qué quiere lograr: vender online, tener presencia, ordenar pedidos…' },
        urgencia: { type: 'string', description: 'Qué tan apurado está: ya mismo, este mes, mirando sin apuro…' },
        presupuesto_aprox: { type: 'string', description: 'Cuánto dijo que puede invertir, tal cual lo dijo' },
        pais: { type: 'string', description: 'País, si lo menciona (Argentina, Paraguay…)' },
        zona: { type: 'string', description: 'Ciudad o zona' },
        origen_lead: { type: 'string', description: 'Cómo llegó: Instagram, recomendación, anuncio, cliente anterior…' },
      },
    },
    execute: async (args, context) => {
      const bundle = await resolveChatContact(context);
      if (!bundle) return fail('Chat no encontrado');
      const valores: Record<string, string> = {};
      for (const clave of [
        'rubro', 'tamano_negocio', 'nivel_digital', 'dolor_principal', 'objetivo_cliente',
        'urgencia', 'presupuesto_aprox', 'pais', 'zona', 'origen_lead',
      ]) {
        const valor = TEXTO(args[clave]);
        if (valor) valores[clave] = valor;
      }
      if (!Object.keys(valores).length) return fail('No se recibió ningún dato del negocio para guardar');

      const guardadas = await guardarCampos(context, bundle, valores);
      await logBotAction(context, bundle, `@@syslog_ai_set_field|field=perfil del negocio|value=${guardadas.join(', ')}`, {
        customData: { ...((bundle.contact.customData as Record<string, unknown>) || {}), ...valores },
      });
      return ok({ saved_fields: guardadas, silent: true });
    },
  },

  {
    name: 'log_product_interest',
    pluginId: null,
    label: 'Anotar qué le interesa',
    summary: 'Deja registrado qué producto quiere el cliente, lo etiqueta y, si corresponde, lo mueve de etapa. Sin avisarle.',
    risk: 'write',
    silent: true,
    description:
      'Registra en silencio qué producto o servicio le interesa a la persona (sitio web, tienda online, combo, campañas, contenido, desarrollo a medida…). Ponele además la etiqueta que corresponda del catálogo del equipo y, si el interés ya es firme, movela a la etapa del embudo que pidas. Llamala en cuanto quede claro qué está buscando. NO se lo menciones al cliente.',
    parameters: {
      type: 'object',
      required: ['producto'],
      properties: {
        producto: { type: 'string', description: 'Qué le interesa, en palabras del cliente (ej. "tienda online con 40 productos")' },
        etiqueta: { type: 'string', description: 'Nombre exacto de la etiqueta del equipo que mejor lo describe (ej. "Tienda Online · Membresía anual")' },
        etapa: { type: 'string', description: 'Nombre de la etapa del embudo a la que moverlo, sólo si el interés ya es firme' },
      },
    },
    execute: async (args, context) => {
      const bundle = await resolveChatContact(context);
      if (!bundle) return fail('Chat no encontrado');
      const producto = TEXTO(args.producto);
      if (!producto) return fail('Falta el producto de interés');

      await guardarCampos(context, bundle, { producto_interes: producto });

      const etiqueta = TEXTO(args.etiqueta, 100);
      const puesta = etiqueta ? await etiquetar(context.teamId, bundle.contact.id, etiqueta) : null;

      let etapaPuesta: string | null = null;
      const etapa = TEXTO(args.etapa, 100);
      if (etapa) {
        const stage = await db.query.funnelStages.findFirst({
          where: and(eq(funnelStages.teamId, context.teamId), ilike(funnelStages.name, `%${etapa}%`)),
          orderBy: [asc(funnelStages.order)],
          columns: { id: true, name: true },
        });
        if (stage) {
          await db
            .update(contacts)
            .set({ funnelStageId: stage.id, updatedAt: new Date() })
            .where(eq(contacts.id, bundle.contact.id));
          etapaPuesta = stage.name;
          await logBotAction(context, bundle, `@@syslog_ai_moved_to_stage|stage=${stage.name}`, { funnelStageId: stage.id });
        }
      }

      await logBotAction(context, bundle, `@@syslog_ai_set_field|field=Producto de interés|value=${producto}`, {});
      return ok({ producto, tag: puesta, stage: etapaPuesta, silent: true });
    },
  },

  {
    name: 'log_objection',
    pluginId: null,
    label: 'Anotar la objeción',
    summary: 'Guarda por qué el cliente duda o dice que no —precio, tiempo, confianza, competencia, momento— para que el equipo sepa después qué frenó la venta.',
    risk: 'write',
    silent: true,
    description:
      'Registra en silencio la objeción real que aparece en la conversación y con qué palabras la dijo. Llamala cuando la persona dude, ponga un pero o diga que no: seguí atendiendo la objeción con naturalidad como siempre, esto es sólo para que quede el registro. NO le comentes que la anotaste.',
    parameters: {
      type: 'object',
      required: ['tipo'],
      properties: {
        tipo: {
          type: 'string',
          enum: ['precio', 'tiempo', 'confianza', 'competencia', 'momento', 'necesidad', 'otra'],
          description: 'Tipo de objeción',
        },
        detalle: { type: 'string', description: 'Con qué palabras lo dijo el cliente' },
        perdido: { type: 'boolean', description: 'true sólo si dijo explícitamente que no avanza' },
      },
    },
    execute: async (args, context) => {
      const bundle = await resolveChatContact(context);
      if (!bundle) return fail('Chat no encontrado');
      const tipo = TEXTO(args.tipo, 30);
      if (!tipo) return fail('Falta el tipo de objeción');
      const detalle = TEXTO(args.detalle, 500);

      await guardarCampos(context, bundle, { motivo_perdida: detalle ? `${tipo}: ${detalle}` : tipo });
      const etiqueta = await etiquetar(context.teamId, bundle.contact.id, `Objeción · ${tipo}`);
      await anotar(bundle, `Objeción (${tipo})${detalle ? `: ${detalle}` : ''}`);
      if (args.perdido === true) {
        await guardarCampos(context, bundle, { motivo_perdida: detalle ? `${tipo}: ${detalle}` : tipo });
      }
      await logBotAction(context, bundle, `@@syslog_ai_set_field|field=Objeción|value=${tipo}`, {});
      return ok({ tipo, tag: etiqueta, silent: true });
    },
  },

  {
    name: 'write_contact_note',
    pluginId: null,
    label: 'Dejar una nota interna',
    summary: 'Suma a la ficha una nota fechada con lo que hay que saber de esta conversación. Sólo la ve el equipo.',
    risk: 'write',
    silent: true,
    description:
      'Deja una nota interna en la ficha del contacto, para que quien retome el chat no tenga que leer toda la conversación. Escribí lo que le sirve a una persona del equipo: qué pidió, qué se le ofreció, qué quedó pendiente y cualquier dato del negocio que importe. Llamala antes de derivar y cuando la charla haya avanzado. NO le menciones al cliente que existe esta nota.',
    parameters: {
      type: 'object',
      required: ['nota'],
      properties: {
        nota: { type: 'string', description: 'Qué necesita saber el equipo, en 2-5 líneas' },
      },
    },
    execute: async (args, context) => {
      const bundle = await resolveChatContact(context);
      if (!bundle) return fail('Chat no encontrado');
      const nota = TEXTO(args.nota, 2000);
      if (!nota) return fail('La nota vino vacía');
      const notas = await anotar(bundle, nota);
      await logBotAction(context, bundle, '@@syslog_ai_added_note', { notes: notas });
      return ok({ saved: true, silent: true });
    },
  },

  {
    name: 'alert_team',
    pluginId: null,
    label: 'Avisar al equipo',
    summary: 'Le hace sonar el aviso a la gente del sector que corresponde, con el link al chat. El cliente no se entera.',
    risk: 'write',
    silent: true,
    description:
      'Avisa de verdad a una persona del equipo, por la campana y el push, cuando en la conversación aparece algo que necesita un humano: pedido de descuento o cuotas, facturación/AFIP, desarrollo a medida, más de 100 productos, integraciones, temas legales, un cliente molesto, o cualquier cosa que no puedas confirmar con certeza. Llamala SIEMPRE que derives, además de decirle al cliente que sigue una persona. Elegí el sector: "Ventas y Clientes" para lo comercial, "Producción y Desarrollo" para lo técnico, "Administración" para pagos y facturación. NO le cuentes al cliente que mandaste un aviso interno.',
    parameters: {
      type: 'object',
      required: ['motivo'],
      properties: {
        motivo: { type: 'string', description: 'Qué necesita el cliente, en una línea, para que se entienda sin abrir el chat' },
        sector: { type: 'string', description: 'Nombre del sector destino: "Ventas y Clientes", "Producción y Desarrollo" o "Administración"' },
        urgente: { type: 'boolean', description: 'true si hay que atenderlo ya (cliente enojado, cierre a punto de caerse)' },
      },
    },
    execute: async (args, context) => {
      const bundle = await resolveChatContact(context);
      if (!bundle) return fail('Chat no encontrado');
      const motivo = TEXTO(args.motivo, 400);
      if (!motivo) return fail('Falta el motivo del aviso');

      const sector = TEXTO(args.sector, 100);
      const depto = sector ? await buscarDepartamento(context.teamId, sector) : null;
      const urgente = args.urgente === true;

      const aviso = await notify({
        teamId: context.teamId,
        // Sin sector encontrado el aviso va al equipo: es preferible a que se pierda.
        userId: bundle.contact.assignedUserId ?? null,
        departmentId: depto?.id ?? bundle.contact.assignedDepartmentId ?? null,
        kind: 'sales.signal',
        title: `${urgente ? '🔴 ' : ''}${bundle.displayName}`.slice(0, 180),
        body: clip(motivo, 500),
        url: urlDelChat(bundle),
        channels: urgente ? ['inapp', 'push', 'whatsapp'] : ['inapp', 'push'],
        entityType: 'chat',
        entityId: context.chatId,
        source: 'system',
        createdBy: await resolveActorUserId(context.teamId, bundle.contact),
        // Un aviso por chat y motivo por día: el bot puede volver a pedirlo en
        // el mismo hilo y no queremos la campana llena de lo mismo.
        dedupeKey: `ai-alert:${context.chatId}:${clip(motivo, 60)}:${new Date().toISOString().slice(0, 10)}`,
        metadata: { origen: 'agente-ia', urgente },
      });

      await logBotAction(context, bundle, `@@syslog_ai_alerted_team|sector=${depto?.name ?? 'equipo'}`, {});
      return ok({
        notified: aviso.ids.length,
        sector: depto?.name ?? null,
        sin_destinatarios: aviso.sinDestinatarios === true,
        silent: true,
      });
    },
  },

  {
    name: 'route_to_department',
    pluginId: null,
    label: 'Derivar al sector correcto',
    summary: 'Asigna el chat al departamento que corresponde, para que le suene y le aparezca a la gente de ese sector.',
    risk: 'write',
    silent: true,
    description:
      'Deja el chat en manos del sector correcto del equipo: "Ventas y Clientes" para lo comercial, "Producción y Desarrollo" para lo técnico o cambios de un sitio ya entregado, "Administración" para pagos, facturas y renovaciones. Llamala junto con el aviso al equipo cuando derivás. NO se lo menciones al cliente: a él decile con naturalidad que sigue una persona del equipo.',
    parameters: {
      type: 'object',
      required: ['sector'],
      properties: {
        sector: { type: 'string', description: 'Nombre del sector destino' },
        motivo: { type: 'string', description: 'Por qué lo derivás (queda en la ficha)' },
      },
    },
    execute: async (args, context) => {
      const bundle = await resolveChatContact(context);
      if (!bundle) return fail('Chat no encontrado');
      const sector = TEXTO(args.sector, 100);
      if (!sector) return fail('Falta el sector');
      const depto = await buscarDepartamento(context.teamId, sector);
      if (!depto) return fail(`El equipo no tiene un sector parecido a "${sector}"`);

      await db
        .update(contacts)
        .set({ assignedDepartmentId: depto.id, updatedAt: new Date() })
        .where(eq(contacts.id, bundle.contact.id));

      const motivo = TEXTO(args.motivo, 400);
      if (motivo) await anotar(bundle, `Derivado a ${depto.name}: ${motivo}`);

      await logBotAction(context, bundle, `@@syslog_department_assigned|department=${depto.name}`, {
        assignedDepartmentId: depto.id,
      });
      return ok({ department: depto.name, silent: true });
    },
  },

  {
    name: 'flag_payment_proof',
    pluginId: null,
    label: 'Marcar comprobante para revisar',
    summary: 'Cuando el cliente dice que pagó pero falta algo para darlo por bueno: lo marca, etiqueta y avisa a Administración, sin acreditar nada.',
    risk: 'write',
    silent: true,
    description:
      'Llamala cuando la persona diga que pagó pero NO puedas confirmarlo: no sabés el importe, no mandó el comprobante, el monto no cierra con lo acordado, o hay cualquier duda. Deja el pago marcado para revisión manual y le avisa a Administración con el link al chat. NO acredita plata: al cliente decile que el equipo lo verifica y le confirma. Si en cambio el pago está claro y completo, usá confirm_payment en vez de ésta. No le menciones este registro interno.',
    parameters: {
      type: 'object',
      properties: {
        importe: { type: 'string', description: 'Importe que dice haber pagado, tal como lo dijo' },
        moneda: { type: 'string', description: 'ARS, PYG, USD…' },
        medio: { type: 'string', description: 'Transferencia, Mercado Pago, efectivo, billetera…' },
        concepto: { type: 'string', description: 'Por qué paga: seña, membresía anual, cuota…' },
      },
    },
    execute: async (args, context) => {
      const bundle = await resolveChatContact(context);
      if (!bundle) return fail('Chat no encontrado');
      const importe = TEXTO(args.importe, 60);
      const moneda = TEXTO(args.moneda, 10);
      const medio = TEXTO(args.medio, 60);
      const concepto = TEXTO(args.concepto, 200);

      const resumen = [importe && `${importe}${moneda ? ` ${moneda}` : ''}`, medio, concepto]
        .filter(Boolean)
        .join(' · ') || 'sin detalle';

      await guardarCampos(context, bundle, { comprobante_enviado: 'sí' });
      await etiquetar(context.teamId, bundle.contact.id, 'Comprobante a revisar');
      await anotar(bundle, `Dice haber pagado: ${resumen}. Pendiente de revisión manual.`);

      const depto = await buscarDepartamento(context.teamId, 'Administración');
      const aviso = await notify({
        teamId: context.teamId,
        userId: null,
        departmentId: depto?.id ?? null,
        kind: 'queue.review',
        title: `Comprobante para revisar · ${bundle.displayName}`.slice(0, 180),
        body: clip(`Dice haber pagado: ${resumen}. No se confirmó nada.`, 500),
        url: urlDelChat(bundle),
        channels: ['inapp', 'push'],
        entityType: 'chat',
        entityId: context.chatId,
        source: 'system',
        createdBy: await resolveActorUserId(context.teamId, bundle.contact),
        dedupeKey: `ai-pago:${context.chatId}:${new Date().toISOString().slice(0, 10)}`,
        metadata: { origen: 'agente-ia', importe, moneda, medio, concepto },
      });

      await logBotAction(context, bundle, `@@syslog_ai_payment_flagged|detalle=${resumen}`, {});
      return ok({ flagged: true, notified: aviso.ids.length, confirmado: false, silent: true });
    },
  },

  {
    name: 'confirm_payment',
    pluginId: null,
    label: 'Confirmar un pago',
    summary:
      'Da el pago por cobrado: registra la venta y el ingreso en Finanzas, vincula el comprobante, pasa el contacto a cliente y avisa a Administración. Ésta sí se le confirma al cliente.',
    risk: 'write',
    // La única que NO es silenciosa de este archivo, y a propósito: confirmar un
    // pago sin decírselo a quien acaba de pagar sería peor que no confirmarlo.
    silent: false,
    description:
      'Confirma un pago del cliente y lo deja cobrado en el sistema: crea la venta y el ingreso en Finanzas, vincula el último comprobante que haya mandado, lo pasa a cliente y le avisa a Administración. Llamala sólo cuando el pago está claro: sabés el importe exacto, la moneda, y la persona dice que ya lo hizo (idealmente con comprobante a la vista). Si falta cualquiera de esos datos o algo no cierra, usá flag_payment_proof en vez de ésta. Después de llamarla, confirmale al cliente con naturalidad que el pago quedó registrado, diciendo el importe. Llamala UNA sola vez por pago.',
    parameters: {
      type: 'object',
      required: ['importe', 'moneda'],
      properties: {
        importe: { type: 'number', description: 'Importe pagado, en unidades de la moneda (50000, no centavos)' },
        moneda: { type: 'string', description: 'Código ISO de 3 letras: ARS, PYG, USD…' },
        concepto: { type: 'string', description: 'Qué pagó: "Seña sitio web", "Membresía anual", "Saldo tienda"…' },
        medio: { type: 'string', description: 'Transferencia, Mercado Pago, efectivo, billetera…' },
        fecha: { type: 'string', description: 'Día del pago en formato AAAA-MM-DD. Por defecto, hoy' },
        referencia: { type: 'string', description: 'Número de operación o comprobante, si lo dio' },
      },
    },
    execute: async (args, context) => {
      const bundle = await resolveChatContact(context);
      if (!bundle) return fail('Chat no encontrado');

      const importe = typeof args.importe === 'number' ? args.importe : Number(String(args.importe ?? '').replace(',', '.'));
      if (!Number.isFinite(importe) || importe <= 0) return fail('Falta el importe del pago, o no es un número válido');
      const moneda = TEXTO(args.moneda, 3);
      if (!moneda || !/^[A-Za-z]{3}$/.test(moneda)) return fail('La moneda tiene que ser un código de 3 letras (ARS, PYG, USD)');

      const concepto = TEXTO(args.concepto, 200) ?? 'Cobro';
      const medio = TEXTO(args.medio, 80);
      const referencia = TEXTO(args.referencia, 120);
      const fecha = TEXTO(args.fecha, 10);
      const paidOn = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : null;

      // El comprobante que mandó el cliente: el último archivo que entró en el
      // chat en las últimas 48 h. Queda pegado al asiento en Finanzas, que es
      // lo que después mira quien revisa.
      const desde = new Date(Date.now() - 48 * 3_600_000);
      const [comprobante] = await db
        .select({ id: messages.id })
        .from(messages)
        .where(
          and(
            eq(messages.chatId, context.chatId),
            eq(messages.fromMe, false),
            inArray(messages.messageType, ['imageMessage', 'documentMessage']),
            sql`${messages.timestamp} >= ${desde}`,
          ),
        )
        .orderBy(desc(messages.timestamp))
        .limit(1);

      const actor = await resolveActorUserId(context.teamId, bundle.contact);
      if (!actor) return fail('El equipo no tiene ningún miembro al que atribuirle el cobro');

      // Import diferido a propósito: `cobros` llega al clasificador y de ahí al
      // servicio del agente, que es quien carga este archivo. Importado arriba,
      // el ciclo deja `silentTools` sin inicializar y el agente se queda sin
      // ninguna función. El typecheck no lo ve; el smoke sí.
      const { CobroError, registrarCobro } = await import('@/lib/plugins/sales-ops/server/cobros');

      try {
        const cobro = await registrarCobro(context.teamId, actor, {
          chatId: context.chatId,
          amount: importe,
          currency: moneda.toUpperCase(),
          paidOn,
          method: medio,
          concept: concepto,
          receiptMessageId: comprobante?.id ?? null,
          notes: [
            'Confirmado por el agente IA en la conversación de WhatsApp.',
            referencia ? `Referencia: ${referencia}` : null,
          ].filter(Boolean).join(' '),
          // Estable a propósito: si el modelo la llama dos veces por el mismo
          // pago, la segunda no cobra de nuevo — devuelve el cobro que ya existe.
          idempotencyKey: `ai-confirm:${context.chatId}:${moneda.toUpperCase()}:${Math.round(importe * 100)}:${paidOn ?? new Date().toISOString().slice(0, 10)}`,
          via: 'agente-ia',
        });

        await anotar(bundle, `Pago confirmado por el agente: ${concepto} · ${importe} ${moneda.toUpperCase()}${medio ? ` (${medio})` : ''}${referencia ? ` · ref. ${referencia}` : ''}`);
        await guardarCampos(context, bundle, { comprobante_enviado: 'sí' });

        // Aviso, no permiso: el cobro ya entró y esto es para que Administración
        // lo vea el mismo día y pueda darlo vuelta si el dinero no aparece.
        const depto = await buscarDepartamento(context.teamId, 'Administración');
        await notify({
          teamId: context.teamId,
          userId: null,
          departmentId: depto?.id ?? null,
          kind: 'queue.review',
          title: `Pago confirmado por la IA · ${bundle.displayName}`.slice(0, 180),
          body: clip(`${cobro.summary} Verificá que el dinero esté.`, 500),
          url: urlDelChat(bundle),
          channels: ['inapp', 'push'],
          entityType: 'chat',
          entityId: context.chatId,
          source: 'system',
          createdBy: actor,
          dedupeKey: `ai-cobro:${context.chatId}:${cobro.entry?.id ?? cobro.paidOn}`,
          metadata: { origen: 'agente-ia', importe, moneda, concepto, medio, referencia },
        });

        await logBotAction(context, bundle, `@@syslog_ai_payment_confirmed|detalle=${importe} ${moneda.toUpperCase()} · ${concepto}`, {});

        return ok({
          confirmado: true,
          ya_estaba_registrado: cobro.idempotent,
          venta: cobro.sale?.saleNumber ?? null,
          asiento: cobro.entry?.id ?? null,
          comprobante_vinculado: Boolean(comprobante?.id),
          importe,
          moneda: moneda.toUpperCase(),
          fecha: cobro.paidOn,
          resumen: cobro.summary,
          instruction: cobro.idempotent
            ? 'Este pago ya estaba registrado: no vuelvas a confirmarlo, seguí la conversación.'
            : 'Confirmale al cliente que el pago quedó registrado, mencionando el importe. Sé breve y cordial.',
        });
      } catch (error) {
        if (error instanceof CobroError) return fail(error.message);
        throw error;
      }
    },
  },

  {
    name: 'mark_do_not_contact',
    pluginId: null,
    label: 'No molestar más',
    summary: 'Saca a la persona del circuito comercial: sin campañas, sin cola de seguimiento. Queda el motivo anotado.',
    risk: 'write',
    silent: true,
    description:
      'Llamala cuando la persona pida que no le escriban más, diga que se equivocó de número o avise que no le interesa y no quiere seguimiento. Saca el chat del circuito comercial (no le llegan más campañas ni seguimientos) y deja el motivo. Al cliente respondele con naturalidad y cortesía, sin mencionarle este registro.',
    parameters: {
      type: 'object',
      required: ['motivo'],
      properties: {
        motivo: { type: 'string', description: 'Qué dijo exactamente para no querer más contacto' },
        tipo: {
          type: 'string',
          enum: ['personal', 'equipo', 'otros'],
          description: 'personal = número personal o equivocado; equipo = alguien del propio equipo; otros = el resto',
        },
      },
    },
    execute: async (args, context) => {
      const bundle = await resolveChatContact(context);
      if (!bundle) return fail('Chat no encontrado');
      const motivo = TEXTO(args.motivo, 400);
      if (!motivo) return fail('Falta el motivo');
      const tipo = args.tipo === 'personal' || args.tipo === 'equipo' ? args.tipo : 'otros';

      const actor = await resolveActorUserId(context.teamId, bundle.contact);
      const resultado = await excludeChats(context.teamId, actor, [context.chatId], tipo, `Pedido del cliente: ${motivo}`);
      await etiquetar(context.teamId, bundle.contact.id, 'No contactar');
      await anotar(bundle, `Pidió no recibir más mensajes: ${motivo}`);

      await logBotAction(context, bundle, `@@syslog_ai_do_not_contact|motivo=${clip(motivo, 80)}`, {});
      return ok({ excluded: resultado.excluded === 1, kind: tipo, silent: true });
    },
  },
];
