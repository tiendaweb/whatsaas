'use client';

import type { SkillIcon } from '../../shared/skills';

/**
 * Qué se le está pidiendo al conector, dicho de una.
 *
 * Antes todo pedido era "un prompt": el mismo cuadro de texto para "mandale un
 * recordatorio" y para "armale el proyecto en Tareas". El conector tenía que
 * adivinar la forma del resultado leyendo el chat, y quien supervisaba no podía
 * saber de un vistazo qué iba a producir cada corrida.
 *
 * Elegir la acción hace dos cosas: escribe el pedido con la instrucción que le
 * corresponde —incluida la cadena de tools— y le pone nombre a la corrida, para
 * que en la Cola se lea "Programar mensaje · Juan" y no "Focus · Juan".
 *
 * La acción se puede cambiar a mano en cualquier momento, y el texto sigue
 * siendo editable después de elegirla: la plantilla es un punto de partida, no
 * un formulario.
 */
export const ACCIONES_FOCUS = ['mensaje', 'programar', 'tareas', 'calendario', 'documento', 'planificacion', 'crm', 'libre'] as const;
export type AccionFocus = (typeof ACCIONES_FOCUS)[number];

export type DefinicionAccion = {
  key: AccionFocus;
  label: string;
  /** En una línea, para el tooltip. */
  ayuda: string;
  icon: SkillIcon;
  /** Las tools que resuelven esto. Van dentro del pedido: el conector no adivina. */
  tools: string[];
  /**
   * El pedido base. `detalle` es lo que la persona escribió; si está vacío, la
   * plantilla sola ya es un pedido válido.
   */
  plantilla: (nombre: string, detalle: string) => string;
};

const cierre = 'Cerrá con whatspro_sales_prompt_result contando qué hiciste y por qué.';

export const ACCIONES: Record<AccionFocus, DefinicionAccion> = {
  mensaje: {
    key: 'mensaje',
    label: 'Mensaje',
    ayuda: 'Redactar un mensaje y dejarlo propuesto para que una persona lo apruebe.',
    icon: 'message',
    tools: ['whatspro_sales_dossier', 'whatspro_sales_queue_propose'],
    plantilla: (nombre, detalle) =>
      [
        `Escribile un mensaje a ${nombre}.`,
        detalle ? `QUÉ DECIR:\n${detalle}` : 'QUÉ DECIR: leé el chat y decidí qué corresponde ahora.',
        'QUÉ HACER: leé el expediente con whatspro_sales_dossier y proponé el envío con whatspro_sales_queue_propose. NO lo mandes: queda esperando aprobación.',
        cierre,
      ].join('\n\n'),
  },
  programar: {
    key: 'programar',
    label: 'Programar',
    ayuda: 'Dejar un mensaje agendado para una fecha y hora.',
    icon: 'calendar',
    tools: ['whatspro_sales_dossier', 'whatspro_manage_scheduled_message'],
    plantilla: (nombre, detalle) =>
      [
        `Dejale un mensaje programado a ${nombre}.`,
        detalle ? `QUÉ DECIR Y CUÁNDO:\n${detalle}` : 'QUÉ DECIR Y CUÁNDO: leé el chat y elegí el texto y el momento que corresponden.',
        'QUÉ HACER: whatspro_manage_scheduled_message con action "create", una sola vez, apuntado a su teléfono. Si la fecha no está clara, preguntala con human_request en vez de inventarla.',
        cierre,
      ].join('\n\n'),
  },
  tareas: {
    key: 'tareas',
    label: 'Tareas OS',
    ayuda: 'Lo que haga falta en Tareas OS: una tarea, un proyecto entero o un espacio de trabajo nuevo.',
    icon: 'clipboard',
    tools: [
      'whatspro_sales_dossier',
      'whatspro_create_contact_task',
      'whatspro_sales_tareas_from_chat',
      'whatspro_manage_task_project',
      'whatspro_manage_task_workspace',
      'whatspro_manage_task',
      'whatspro_manage_task_column',
    ],
    plantilla: (nombre, detalle) =>
      [
        `Trabajá Tareas OS para ${nombre}.`,
        detalle ? `QUÉ HACE FALTA:\n${detalle}` : 'QUÉ HACE FALTA: leé el chat y sacá lo que quedó pendiente de nuestro lado.',
        [
          'QUÉ HACER: elegí la forma según el tamaño, no crees una tarea suelta por costumbre.',
          '- Una sola cosa pendiente → whatspro_create_contact_task, vinculada al contacto.',
          '- Varias que dependen entre sí → whatspro_sales_tareas_from_chat action "project", o whatspro_manage_task_project si ya sabés a qué espacio va.',
          '- Un cliente que arranca y todavía no tiene dónde → whatspro_manage_task_workspace para crear su espacio, y recién ahí el proyecto y sus tareas.',
          '- Si ya existe el proyecto, no lo dupliques: sumale las tareas con whatspro_manage_task y ordená columnas con whatspro_manage_task_column.',
          'Títulos imperativos y cortos, con fecha cuando el chat la diga.',
        ].join('\n'),
        cierre,
      ].join('\n\n'),
  },
  calendario: {
    key: 'calendario',
    label: 'Calendario',
    ayuda: 'Agendar, mover o cerrar una reunión con el cliente.',
    icon: 'calendar',
    tools: ['whatspro_sales_dossier', 'whatspro_manage_calendar_event', 'whatspro_meeting_agenda', 'whatspro_calendar_close_meeting'],
    plantilla: (nombre, detalle) =>
      [
        `Ocupate del calendario con ${nombre}.`,
        detalle ? `QUÉ HACER:\n${detalle}` : 'QUÉ HACER: leé el chat y fijate si quedó una reunión por agendar, mover o cerrar.',
        'CON QUÉ: whatspro_manage_calendar_event para crear o mover, whatspro_meeting_agenda para prepararla y whatspro_calendar_close_meeting para cerrarla con lo que se habló. Si la fecha u hora no están claras en el chat, preguntalas con human_request en vez de inventarlas.',
        cierre,
      ].join('\n\n'),
  },
  documento: {
    key: 'documento',
    label: 'Documento',
    ayuda: 'Escribir un documento en la app Documentos (propuesta, informe, guion).',
    icon: 'pen',
    tools: ['whatspro_sales_dossier', 'whatspro_manage_document', 'whatspro_documents_search'],
    plantilla: (nombre, detalle) =>
      [
        `Escribí un documento sobre ${nombre}.`,
        detalle ? `QUÉ DOCUMENTO:\n${detalle}` : 'QUÉ DOCUMENTO: una propuesta con lo que pidió, el precio que se le pasó y los pasos siguientes.',
        'QUÉ HACER: buscá antes con whatspro_documents_search si ya existe uno de este cliente (no dupliques) y escribilo con whatspro_manage_document. Español rioplatense, sin relleno.',
        cierre,
      ].join('\n\n'),
  },
  planificacion: {
    key: 'planificacion',
    label: 'Planificar',
    ayuda: 'Armar el plan de trabajo del cliente: qué se le entrega y en qué orden.',
    icon: 'target',
    tools: ['whatspro_sales_dossier', 'whatspro_sales_tareas_from_chat', 'whatspro_customer_360'],
    plantilla: (nombre, detalle) =>
      [
        `Planificá el trabajo con ${nombre}.`,
        detalle ? `ALCANCE:\n${detalle}` : 'ALCANCE: sacalo del chat — qué compró o está por comprar, y qué hay que entregarle.',
        'QUÉ HACER: mirá whatspro_customer_360 para no repetir lo ya entregado, y armá el proyecto con whatspro_sales_tareas_from_chat action "project": una tarea por entregable, en orden, con responsable si el chat lo dice.',
        cierre,
      ].join('\n\n'),
  },
  crm: {
    key: 'crm',
    label: 'CRM',
    ayuda: 'Corregir etapa, etiquetas y campos del contacto según lo que dice el chat.',
    icon: 'users',
    tools: ['whatspro_sales_dossier', 'whatspro_change_crm_stage', 'whatspro_set_contact_tags', 'whatspro_set_custom_fields'],
    plantilla: (nombre, detalle) =>
      [
        `Poné el CRM de ${nombre} a tono con lo que dice el chat.`,
        detalle ? `QUÉ CORREGIR:\n${detalle}` : 'QUÉ CORREGIR: comparás el expediente con la etapa, las etiquetas y los campos que tiene, y arreglás lo que se contradice.',
        'QUÉ HACER: whatspro_change_crm_stage, whatspro_set_contact_tags y whatspro_set_custom_fields sobre ESTE contacto. Sólo lo que contradice este chat, nunca en lote, y usando nombres que existan en el equipo (están en crm_catalog del expediente).',
        cierre,
      ].join('\n\n'),
  },
  libre: {
    key: 'libre',
    label: 'Libre',
    ayuda: 'Escribir el pedido a mano, sin plantilla.',
    icon: 'sparkles',
    tools: ['whatspro_sales_dossier'],
    plantilla: (_nombre, detalle) => detalle,
  },
};

export const ACCIONES_VISIBLES: AccionFocus[] = ['mensaje', 'programar', 'tareas', 'calendario', 'documento', 'planificacion', 'crm', 'libre'];

/** Título de la corrida, para que en la Cola se lea qué es sin abrirla. */
export function tituloDeAccion(accion: AccionFocus, nombre: string): string {
  return `${ACCIONES[accion].label} · ${nombre}`.slice(0, 160);
}

/**
 * Adiviná qué acción es un pedido ya escrito.
 *
 * Sirve para las corridas viejas, que no tienen la acción guardada: en la
 * supervisión se muestra la que se dedujo y se puede cambiar. Ante la duda,
 * `libre`: decir "esto es una tarea" cuando no lo es confunde más que no decir
 * nada.
 */
export function deducirAccion(texto: string): AccionFocus {
  const t = texto.toLowerCase();
  // El orden importa y no es alfabético: planificar USA la tool de tareas
  // (`tareas_from_chat`), así que si "tarea" se evaluara antes, todo plan se
  // leería como una tarea suelta. Lo específico va primero.
  if (/manage_calendar_event|meeting_agenda|close_meeting|agendá la reunión|calendario/.test(t)) return 'calendario';
  // `action "project"` NO sirve para distinguir: lo nombran las dos plantillas,
  // porque planificar es armar un proyecto y Tareas OS también puede armarlo.
  // Lo que separa a planificar es mirar el 360 del cliente y hablar de entregables.
  if (/planificá|planificar|customer_360|entregable/.test(t)) return 'planificacion';
  if (/programad|programar un mensaje|scheduled_message|agendá el mensaje/.test(t)) return 'programar';
  if (/manage_document|documents_search|escribí un documento|informe/.test(t)) return 'documento';
  if (/crm_stage|set_contact_tags|set_custom_fields|etapa del embudo|etiquetas/.test(t)) return 'crm';
  if (/tareas_from_chat|create_contact_task|manage_task|tareas os/.test(t)) return 'tareas';
  if (/queue_propose|escribile|mensaje a /.test(t)) return 'mensaje';
  return 'libre';
}
