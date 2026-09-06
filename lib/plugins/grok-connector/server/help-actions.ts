import 'server-only';

/**
 * whatspro_help_domain — la guía operativa de cada dominio del conector.
 *
 * Es el patrón que mejor funciona del catálogo (whatspro_automation_guide y
 * whatspro_radar_block_catalog lo demostraron): una tool barata que le enseña
 * al modelo QUÉ tools existen en un dominio, EN QUÉ ORDEN llamarlas y qué
 * trampas tiene, evita decenas de llamadas fallidas. No toca la base y no
 * exige permisos: es documentación.
 */
import { z } from 'zod';
import { CASCADE_SYNTAX_HELP } from '@/lib/plugins/tasks/client/cascade-dsl';
import {
  parse,
  type GrokActionContext,
  type GrokActionTool,
} from '@/lib/plugins/grok-connector/server/actions';

const HELP_DOMAINS = [
  'crm', 'chat', 'tasks', 'radar', 'finance', 'memberships', 'customers',
  'documents', 'sites', 'automation', 'integrations', 'deals',
] as const;
type HelpDomain = (typeof HELP_DOMAINS)[number];

const GUIDES: Record<HelpDomain, string> = {
  crm: [
    '# CRM: contactos, embudo, etiquetas y campos',
    '',
    '## Leer',
    '- whatspro_crm_search_contacts: búsqueda combinada (texto + etapa + etiqueta + campo personalizado + responsable + con/sin cliente). Es la búsqueda potente.',
    '- whatspro_crm_followup_queue: ¿a quién le debo respuesta? / ¿a quién dejo enfriar? Ordenada por urgencia.',
    '- whatspro_crm_funnel_snapshot: la foto del embudo (contactos por etapa, estancados).',
    '- whatspro_contact_graph / whatspro_customer_360: todo lo de un contacto/cliente en una llamada.',
    '- whatspro_custom_fields: catálogo de campos personalizados y valores resueltos de un contacto.',
    '- whatspro_private_notes: las notas internas escritas en sus chats.',
    '- whatspro_list_records(resource="contacts"|"funnel-stages"|"tags"): listados planos.',
    '',
    '## Escribir',
    '- whatspro_save_contact crea/edita; whatspro_change_crm_stage mueve de etapa; whatspro_set_contact_tags etiqueta; whatspro_set_custom_fields guarda campos (las claves deben existir: whatspro_manage_custom_field las define).',
    '- Notas: whatspro_add_internal_note (privada, en el chat) / whatspro_add_contact_note (historial del contacto).',
    '- En LOTE: whatspro_crm_bulk_stage y whatspro_crm_bulk_tags (hasta 200, con dry_run). Nunca muevas 30 contactos con 30 llamadas.',
    '- Estructura: whatspro_manage_crm_stage / _stage_group / _tag / _department / _custom_field.',
    '',
    '## Trampas',
    '- El embudo del negocio se arruina con un bulk_stage mal hecho: usá dry_run primero, siempre.',
    '- set_contact_tags con mode="replace" borra TODAS las etiquetas del contacto antes de poner las nuevas.',
    '- Un contacto siempre cuelga de un chat de WhatsApp; los clientes (customers) son otra entidad — se vinculan con whatspro_link_customer_contact.',
  ].join('\n'),

  chat: [
    '# Conversaciones y WhatsApp',
    '',
    '## Leer',
    '- whatspro_list_records(resource="chats"|"messages"): las conversaciones y sus mensajes (messages filtra por chatId; q busca en texto).',
    '- whatspro_chat_media_summary / _list / _get: los adjuntos de un chat; _get devuelve la imagen o el audio como bloque nativo (los ves/escuchás de verdad).',
    '- whatspro_pending_audios + whatspro_transcribe_media + whatspro_audio_analyze: notas de voz y su transcripción.',
    '',
    '## Escribir (sale hacia un cliente real: todo exige idempotency_key)',
    '- whatspro_chat_send_message: texto AHORA. dry_run primero si el texto no lo dictó el usuario.',
    '- whatspro_chat_send_media: imagen/video/PDF/nota de voz.',
    '- whatspro_chat_send_template: plantilla WABA aprobada — la ÚNICA forma fuera de la ventana de 24 h, y CUESTA PLATA (Meta factura cada una).',
    '- whatspro_chat_trigger_automation: dispara un flujo (que manda lo que el flujo diga). Inspeccioná antes con whatspro_inspect_automation.',
    '- whatspro_manage_scheduled_message: programar para después (once/daily/weekly). NO lo uses para "mandar en un minuto": para eso está send_message.',
    '- whatspro_add_internal_note: nota interna en el chat. NUNCA le llega al cliente.',
    '',
    '## Trampas',
    '- Fuera de la ventana de 24 h el texto libre rebota: usá send_template.',
    '- Un mensaje enviado no se deshace. dry_run + idempotency_key no son decorativos.',
  ].join('\n'),

  tasks: [
    '# Tareas OS',
    '',
    '## Leer',
    '- whatspro_tasks_board: el tablero entero (espacios → proyectos → columnas → tareas) en una llamada.',
    '- whatspro_tasks_today: vencidas + de hoy + próximos días. whatspro_tasks_search: búsqueda. whatspro_tasks_get: la ficha completa de UNA tarea (checklist, comentarios, relaciones, dependencias).',
    '',
    '## Escribir',
    '- Cambios masivos o estructurales: whatspro_tasks_cascade_export → editás el DSL → whatspro_tasks_cascade_apply (mode="preview" por defecto, muestra el diff). Es LA herramienta para reorganizar tableros.',
    '- Individual: whatspro_manage_task (crear/editar), whatspro_tasks_move, whatspro_tasks_assign, whatspro_task_checklist_item, whatspro_tasks_comment, whatspro_tasks_bulk_status.',
    '- Estructura: whatspro_manage_task_workspace / _project / _column; whatspro_create_task_project arma proyecto completo de un saque.',
    '- Vínculos: whatspro_create_contact_task (tarea ligada a un contacto), whatspro_link_customer_task, whatspro_manage_task_relation, whatspro_tasks_manage_dependency (valida ciclos), whatspro_share_task.',
    '- Limpieza: whatspro_tasks_merge_duplicate_projects (dry_run por defecto).',
    '',
    '## El DSL cascade',
    CASCADE_SYNTAX_HELP,
  ].join('\n'),

  radar: [
    '# Radar: inteligencia comercial',
    '',
    '## El flujo completo de análisis',
    '1. whatspro_radar_overview: qué hay hoy (contadores, contactos por prioridad).',
    '2. whatspro_radar_save_analysis: escribe el análisis COMPLETO de un contacto en una llamada (campos radar_*, nota 🎯 RADAR y opcionalmente el widget con create_widget=true). Antes eran 10+ llamadas.',
    '3. whatspro_radar_get_client: la ficha de un contacto (campos, notas, tareas, informes, widgets).',
    '4. whatspro_radar_list_clients: el panel filtrable (P1 con informe y sin tarea, etc.).',
    '',
    '## Dibujar en el tablero',
    '- SIEMPRE primero whatspro_radar_block_catalog: bloques, iconos y tonos son listas cerradas.',
    '- whatspro_radar_upsert_widget crea/reemplaza; whatspro_radar_patch_widget cambia icono/título/sección SIN reenviar bloques; whatspro_radar_manage_widget reordena/restaura/duplica/purga; whatspro_radar_manage_section edita el menú.',
    '- whatspro_radar_note_to_widget: convierte una nota 🎯 RADAR en widget dibujado.',
    '- El banco (archivados) se lista con whatspro_radar_list_bank.',
    '',
    '## Informes',
    '- whatspro_radar_publish_report CREA un documento nuevo; para reescribir uno existente usá whatspro_radar_update_report (si publicás de nuevo, duplicás). whatspro_radar_unlink_report lo saca de Radar sin borrar el documento.',
    '',
    '## Trampa: cliente ≠ contacto',
    '- Radar cuelga todo del CONTACTO. customer_id se acepta en casi todas las tools pero se resuelve al contacto vinculado; sin vínculo (o con varios) la tool falla explicando qué hacer.',
  ].join('\n'),

  finance: [
    '# Finanzas',
    '',
    '## Leer',
    '- whatspro_finance_summary: saldos, ingresos/egresos del período, utilidad, por cobrar/pagar.',
    '- whatspro_finance_receivables_payables: quién nos debe / qué hay que pagar.',
    '- whatspro_finance_cashflow_projection: proyección semanal.',
    '- whatspro_finance_list_entries: movimientos con filtros y cliente resuelto. whatspro_finance_entry_payments: los pagos de un movimiento.',
    '- whatspro_finance_accounts: cuentas con saldo calculado.',
    '',
    '## Escribir (todo exige idempotency_key + confirm: registra dinero)',
    '- whatspro_finance_record_entry: un ingreso o gasto. Montos ENTEROS en la unidad mínima ($200.000 = 200000).',
    '- whatspro_finance_settle_entry: marca pagado o registra un pago parcial contra una cuenta.',
    '- whatspro_register_sale: venta con ítems (con create_entry=true asienta el ingreso).',
    '- whatspro_sales_register_payment: el cobro de UN chat del Command Center Comercial {chat_id, amount en UNIDADES (no en centavos), currency, method, paid_on, concept, idempotency_key, confirm}: crea la venta, el asiento y el pago, vincula al contacto como cliente y pasa el chat a G11. Sólo desde una fila "Registrar cobro" aprobada o por pedido explícito de una persona; nunca por deducción del chat.',
    '- whatspro_finance_manage_account: cuentas. whatspro_finance_manage_exchange_rate: cotizaciones (afectan TODOS los reportes).',
    '',
    '## Trampas',
    '- recurrence se guarda pero NADIE materializa el asiento siguiente: no hay cron de recurrencia. No prometas "queda cargado todos los meses".',
    '- Las monedas nunca se suman entre sí.',
  ].join('\n'),

  memberships: [
    '# Membresías y renovaciones (el ingreso recurrente)',
    '',
    '## El circuito completo: se vence → se avisa → se renueva → se cobra',
    '1. whatspro_memberships_expiring: quién vence y en cuántos días.',
    '2. whatspro_memberships_renewal_queue: la cola de avisos AAPP (list para ver, apply con confirm para aprobar — aprobar AUTORIZA que el cron le escriba al cliente).',
    '3. whatspro_memberships_renew: corre endDate según el ciclo del plan y (opcional) asienta el cobro en Finanzas. Idempotente: renovar dos veces regala un año.',
    '4. whatspro_update_membership / whatspro_register_membership: edición y alta directa de suscripciones.',
    '- Planes: whatspro_manage_membership_plan. Empresas: resource="membership-companies".',
    '',
    '## Trampas',
    '- Mover end_date cambia a quién se le va a escribir (alimenta la cola de avisos).',
    '- Las reglas de aviso (resource="membership-reminder-rules") le escriben a TODOS los que matchean.',
  ].join('\n'),

  customers: [
    '# Clientes (team_customers)',
    '',
    '- whatspro_customer_360: la ficha completa (contactos, suscripciones, tiendas, transacciones, tareas, adjuntos, campos).',
    '- whatspro_register_customer: alta sin duplicar (por contacto, email o teléfono). whatspro_manage_customer: crear/editar/archivar/eliminar.',
    '- whatspro_link_customer_contact: vincula el cliente con su contacto de WhatsApp — el vínculo que hace funcionar Radar, tareas y renovaciones.',
    '- whatspro_customer_notes: la bitácora del cliente. whatspro_customers_pending_payment: quiénes deben.',
    '- whatspro_link_customer_task / whatspro_link_entities: relaciones con tareas y otras entidades.',
    '- Listados: resource="customers"|"customer-stores"|"customer-transactions".',
    '',
    '## Trampa',
    '- Cliente ≠ contacto: el contacto exige chat de WhatsApp; el cliente no. Muchos clientes importados de AAPP no tienen contacto vinculado.',
  ].join('\n'),

  documents: [
    '# Documentos y notas',
    '',
    '- Buscar: whatspro_documents_search (título + contenido, con extracto). Leer: whatspro_documents_read (format text/html/json, con tope de bytes). Backlinks: whatspro_documents_backlinks.',
    '- Escribir: whatspro_manage_document (markdown o format:"html"), whatspro_manage_document_folder (máx 5 niveles), whatspro_documents_move.',
    '- Notas de equipo: whatspro_create_note / whatspro_manage_note; whatspro_generate_tasks_from_note y whatspro_notes_sync_commitments convierten compromisos en tareas.',
    '- El portal público de documentos: whatspro_documents_portal_get / _update.',
    '- Borrar: whatspro_delete_record(type="document", confirm=true).',
    '',
    '## Trampa',
    '- Editar un documento pisa contenido: usá la version que devuelve documents_read (control optimista).',
  ].join('\n'),

  sites: [
    '# Sitios y dominios',
    '',
    '- Sitios: whatspro_list_sites → whatspro_list_site_files → whatspro_read_site_file (guardá expected_updated_at) → whatspro_patch_site_file (parches exactos) o whatspro_manage_site_file (reemplazo). whatspro_manage_site crea/publica/renombra.',
    '- Dominios: whatspro_list_domains, whatspro_domains_expiring (vencimientos con cliente), whatspro_manage_domain.',
    '- whatspro_sites_list_by_domain: resuelve dominio ↔ sitio/tienda ↔ cliente.',
    '- Importar de Hostinger: whatspro_integrations_sync(integration="hostinger").',
    '',
    '## Trampas',
    '- patch_site_file exige expected_updated_at: leé el archivo justo antes.',
    '- Publicar un sitio es exponerlo a internet; cambiar el slug rompe los links existentes.',
  ].join('\n'),

  automation: [
    '# Automatizaciones',
    '',
    'La guía completa del contrato de nodos/conexiones/variables la devuelve whatspro_automation_guide — llamala antes de armar un flujo.',
    '',
    '- Auditar un flujo: whatspro_inspect_automation (grafo, errores, nodos inalcanzables).',
    '- Editar: whatspro_replace_automation_flow (reemplazo atómico validado, mode="validate" primero) o whatspro_manage_automation_node/_edge para cambios puntuales.',
    '- Ciclo de vida: whatspro_manage_automation (crear/activar/desactivar), whatspro_manage_automation_folder.',
    '- Disparar sobre un chat: whatspro_chat_trigger_automation (confirm obligatorio: manda mensajes reales).',
  ].join('\n'),

  integrations: [
    '# Integraciones externas',
    '',
    '- whatspro_integrations_status: qué hay conectado (AAPP SPACE, Hostinger, Meta Ads) y su último sync.',
    '- whatspro_integrations_sync: dispara la sincronización (integration="aapp_space"|"hostinger"|"meta_ads"). Son operaciones largas.',
    '- Meta Ads: whatspro_metaads_report (KPIs, serie y campañas con impuestos aplicados).',
    '- AAPP SPACE: las suscripciones sincronizadas alimentan memberships; la cola de avisos es whatspro_memberships_renewal_queue.',
    '- Hostinger: importa dominios y los auto-vincula a clientes por custom_domain.',
    '- La administración de AAPP SPACE en sí (sitios, tiendas, clientes de aapp.space) es OTRO conector MCP (gobiz_*), no éste.',
  ].join('\n'),

  deals: [
    '# Deals (pipeline del Escritorio)',
    '',
    '- whatspro_deals_pipeline: el tablero por etapa con montos. whatspro_deals_list / _get: listado y detalle. whatspro_deals_forecast: proyección.',
    '- whatspro_manage_deal: crear/editar. whatspro_deals_move: cambiar de etapa. whatspro_deals_close: ganar/perder (con motivo).',
    '- whatspro_convert_lead: contacto → deal. whatspro_link_deal_contact: vincular.',
    '',
    '## Trampa',
    '- Deal ≠ venta ≠ cliente: el deal es la oportunidad; al ganarlo, el cobro se asienta en Finanzas y el cliente vive en customers.',
  ].join('\n'),
};

export const helpReadTools: GrokActionTool[] = [
  {
    name: 'whatspro_help_domain',
    description:
      'Devuelve la GUÍA OPERATIVA de un dominio de WhatsPro: qué herramientas existen, en qué orden llamarlas, y las trampas conocidas que hacen fallar a las IA. LLAMALA ANTES de trabajar en un dominio que no usaste en esta conversación — es una llamada barata que evita decenas de llamadas fallidas. Dominios: crm (contactos/embudo/etiquetas), chat (conversaciones y envío de WhatsApp), tasks (Tareas OS y el DSL cascade completo), radar (inteligencia comercial), finance, memberships (renovaciones), customers, documents, sites (sitios y dominios), automation, integrations (AAPP/Hostinger/Meta Ads), deals. No toca la base de datos.',
    inputSchema: {
      type: 'object',
      required: ['domain'],
      properties: {
        domain: { type: 'string', enum: [...HELP_DOMAINS], description: 'El dominio del que querés la guía.' },
      },
      additionalProperties: false,
    },
  },
];

const helpSchema = z.object({ domain: z.enum(HELP_DOMAINS) });

export async function executeHelpTool(name: string, input: Record<string, unknown>, _context: GrokActionContext) {
  if (name !== 'whatspro_help_domain') throw new Error(`Unknown help tool: ${name}`);
  const data = parse(helpSchema, input);
  return {
    object: 'domain_guide',
    domain: data.domain,
    guide: GUIDES[data.domain],
    other_domains: HELP_DOMAINS.filter((domain) => domain !== data.domain),
  };
}
