import 'server-only';

import { and, asc, count, desc, eq, inArray, notInArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import {
  chats,
  contactTags,
  contacts,
  messages,
  funnelStageGroupMembers,
  funnelStageGroups,
  funnelStages,
  tags,
  teamCustomerContacts,
  teamCustomerNotes,
  teamCustomers,
  teamDeals,
  teamDocuments,
  teamMembers,
  teamMembershipCompanies,
  teamMembershipSubscriptions,
  teamRadarReports,
  teamTaskColumns,
  teamTaskDependencies,
  teamTaskItems,
  teamTaskProjects,
  teamTaskRelations,
  teamTaskWorkspaces,
  users,
} from '@/lib/db/schema';
import {
  assertPermission,
  audit,
  parse,
  type ActionPermission,
  type GrokActionContext,
  type GrokActionTool,
} from '@/lib/plugins/grok-connector/server/actions';
import {
  CASCADE_SYNTAX_HELP,
  parseCascadeDocument,
  summarizeCascadeDocument,
  type CascadeExportWorkspace,
} from '@/lib/plugins/tasks/client/cascade-dsl';
import {
  anchorCascadeDocument,
  getCascadeScopeLabel,
  parseScopedCascade,
  serializeCascadeForScope,
  type CascadeScope,
} from '@/lib/plugins/tasks/client/cascade-scope';
import { applyCascadeDocument, previewCascadeApply } from '@/lib/plugins/tasks/server/cascade-apply';
import { checklistToTasks } from '@/lib/plugins/tasks/server/checklist';
import { convertProjectToTask, convertTaskToProject } from '@/lib/plugins/tasks/server/convert';
import { duplicateProject, duplicateTask } from '@/lib/plugins/tasks/server/duplicate';
import { getEmbedState, setEmbedState } from '@/lib/plugins/tasks/server/embed';
import { createTaskTemplate, listTaskTemplates, TASK_TEMPLATE_TYPES } from '@/lib/plugins/tasks/server/templates';
import { getBaseUrl } from '@/lib/tenant/urls';
import { loadTaskAiWorklist, reportTaskAiRun } from '@/lib/plugins/tasks/server/ai-operations';
import { getContactCommercialSnapshot } from '@/lib/contacts/graph';
import { listOperationsAiMessages, saveOperationsConnectorReply } from '@/lib/operations-ai/service';
import {
  addTaskComment,
  assertContact,
  assertCustomer,
  assertDocument,
  assertProject,
  assertTask,
  assertWorkspace,
  getProjectFirstColumn,
  insertRelation,
  listCustomerLinksForTasks,
  listTaskComments,
  listTaskDetails,
  loadTaskOsData,
  mergeDuplicateNamedProjects,
  patchTaskItem,
} from '@/lib/plugins/tasks/server/task-os';

const TASKS_PLUGIN = 'tasks';

/** Tope de tareas que devuelve el tablero si no se pide otra cosa. */
const BOARD_DEFAULT_LIMIT = 150;
const BOARD_MAX_LIMIT = 500;

/**
 * Tope de caracteres del DSL exportado. Arriba de esto no truncamos: devolver
 * medio documento invita a que la IA lo edite y lo reaplique creyendo que tiene
 * el tablero entero. Preferimos fallar con un error que dice cómo acotar.
 */
const CASCADE_EXPORT_MAX_CHARS = 120_000;

type TaskOsData = Awaited<ReturnType<typeof loadTaskOsData>>;

/* ------------------------------------------------------------------ */
/* Catálogo de herramientas                                            */
/* ------------------------------------------------------------------ */

const scopeProperties = {
  workspace_id: {
    type: 'integer',
    minimum: 1,
    description: 'Acota al espacio de trabajo con este id (los espacios son el primer nivel: "Ventas", "Producción"…). Si también mandás project_id, gana project_id.',
  },
  project_id: {
    type: 'integer',
    minimum: 1,
    description: 'Acota al proyecto/tablero con este id (segundo nivel, dentro de un espacio). Es el filtro más útil: un solo tablero en vez de los 20 del equipo.',
  },
} as const;

const taskChecklistProperty = {
  type: 'array',
  maxItems: 100,
  items: {
    type: 'object',
    required: ['id', 'text', 'completed'],
    properties: {
      id: { type: 'string', minLength: 1, maxLength: 100 },
      text: { type: 'string', minLength: 1, maxLength: 500 },
      completed: { type: 'boolean' },
    },
    additionalProperties: false,
  },
} as const;

export const tasksReadTools: GrokActionTool[] = [
  {
    name: 'whatspro_tasks_ai_worklist',
    description:
      'Lee la cola de prompts anotados en WhatsPro y devuelve un plan seguro por fases. Usala cuando el usuario diga "ejecutá los prompts de WhatsPro". Orden obligatorio: 1) resolver primero los ítems state="needs-context" preguntándole al usuario y guardar la respuesta en ai_context_answer; 2) para phase="prepare", convertir prompts amplios de espacio/proyecto/tarea en proyectos, tareas, prompts o próximos pasos concretos y guardarlos con las herramientas normales; 3) volver a cargar esta cola; 4) ejecutar sólo los phase="execute" con las herramientas existentes y sus permisos; 5) llamar whatspro_tasks_ai_report para cada resultado. Nunca afirmes que ejecutaste algo sólo por leer esta cola. include_completed=true sirve para auditar lo ya reportado. NOTA: para ver TODO el trabajo pendiente del equipo —estos prompts más la cola comercial y la bandeja del Centro de comandos— usá whatspro_work_queue, que las federa en una sola lista ordenada por prioridad.',
    inputSchema: {
      type: 'object',
      properties: {
        include_completed: { type: 'boolean', default: false },
        limit: { type: 'integer', minimum: 1, maximum: 300, default: 100 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_tasks_board',
    description:
      'Devuelve el tablero completo de Tareas OS en UNA sola llamada: espacios de trabajo → proyectos → columnas (etapas) → tareas, con id, título, estado (open/in_progress/done), vencimiento, responsable, etiquetas, avance del checklist y cantidad de comentarios. Reemplaza cruzar a mano cuatro whatspro_list_records (task-workspaces, task-projects, task-columns, tasks), que son ~10 llamadas y muchísimo contexto. Usala para responder "¿cómo viene Producción?", "pasame el tablero de Ventas", "¿qué hay en la etapa Haciendo del proyecto de GoldPampa?", "¿qué tiene Carlos asignado?" o antes de mover/crear tareas, para trabajar con ids reales en vez de adivinarlos. Por defecto NO trae las tareas terminadas (include_done=false) y corta en 150 tareas: cuando corta te lo dice en meta.omitted_tasks y en cada columna, nunca trunca en silencio — si ves que quedaron tareas afuera, volvé a llamar acotando con workspace_id o project_id, o subí limit. Ojo con el tamaño: sin filtros el equipo puede tener 400+ tareas. Los ai_prompt del espacio, proyecto y tarea forman contexto heredado; cada tarea también puede incluir ai_next_step, ai_context_question y ai_context_answer. Leelos ANTES de decidir qué hacer. Los prompts de tarea se recortan a 400 caracteres; el texto completo está en whatspro_list_records con resource="tasks". Nota técnica: esta lectura corre un backfill idempotente de ubicaciones de tarea (ensureTaskLocations), así que es una "lectura con efectos" inofensiva pero no es estrictamente read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        ...scopeProperties,
        customer_id: {
          type: 'integer',
          minimum: 1,
          description: 'Sólo las tareas vinculadas a ESE cliente (el id de la ficha de Clientes), sin importar en qué proyecto estén. Es la forma de responder "¿qué tenemos pendiente de GoldPampa?" sin recorrer tablero por tablero. Si el cliente no tiene ninguna tarea vinculada, devuelve el tablero vacío y te lo dice en meta.',
        },
        include_done: {
          type: 'boolean',
          default: false,
          description: 'true incluye las tareas con estado done. Por defecto false, porque las terminadas son la mayor parte del volumen y casi nunca hacen falta para decidir el próximo paso.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: BOARD_MAX_LIMIT,
          default: BOARD_DEFAULT_LIMIT,
          description: `Máximo de tareas a devolver en total (no por columna). Por defecto ${BOARD_DEFAULT_LIMIT}, tope ${BOARD_MAX_LIMIT}. Las que no entran se informan como omitidas.`,
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_tasks_cascade_export',
    description:
      'Serializa el tablero al DSL de texto "Cascade": un markdown donde "# " es el espacio de trabajo, "## " el proyecto, "### " la columna/etapa, "#### " la tarea, "> " o un bloque :::notes las notas y "- [ ] / - [x]" los ítems del checklist. Devuelve además la guía de sintaxis completa en syntax_help. Es la forma de leer y reescribir un tablero entero como texto: exportás, editás el texto (reordenás, agregás etapas y tareas, completás checklists) y lo aplicás con whatspro_tasks_cascade_apply. Ejemplos de pedido: "pasame el tablero de Ventas · Noelia para reordenarlo", "exportá el plan de Producción que quiero agregarle 4 etapas". Acotá SIEMPRE con project_id o workspace_id cuando puedas: sin alcance exporta el equipo entero y si pasa los 120.000 caracteres la herramienta falla a propósito y te dice qué ids usar para achicar. Es sólo lectura: no escribe nada (más allá del backfill idempotente de ubicaciones que hace la carga del tablero).',
    inputSchema: {
      type: 'object',
      properties: { ...scopeProperties },
      additionalProperties: false,
    },
  },

  {
    name: 'whatspro_crm_funnel_snapshot',
    description:
      'Foto estratégica del embudo del CRM en UNA llamada: cada etapa con cuántos contactos tiene, hace cuántos días entró el más viejo, la mediana de antigüedad y cuántos están ESTANCADOS (sin ningún movimiento hace más de stale_after_days). Es la herramienta para responder "¿dónde se me traba el embudo?", "¿cuántos leads llevan más de 30 días en Propuesta?", "¿qué etapa está inflada?" o "dame los 5 más viejos de Seguimiento para llamarlos hoy". Devuelve las etapas ordenadas por su posición en el embudo, agrupadas por grupo de etapas (Ventas, Producción, Clientes…), más un total del equipo y el conteo de contactos sin etapa. Con include_stale_contacts=true agrega, por etapa, una muestra de los contactos más estancados con id, nombre, días y a quién están asignados — con esos ids podés seguir con whatspro_contact_graph o mover al contacto con whatspro_change_crm_stage. IMPORTANTE sobre la antigüedad: el esquema NO guarda cuándo un contacto entró a la etapa; se usa contacts.updated_at como aproximación, que es exactamente la misma cuenta que muestra el reloj de las tarjetas del tablero del CRM. Eso significa que cualquier edición del contacto (cambiar el nombre, asignarlo, tocar un campo) reinicia el contador: leelo como "días sin que nadie lo toque", no como "días en la etapa". Está aclarado en meta.caveat de la respuesta y conviene decírselo al usuario cuando la cifra sea el argumento de una decisión.',
    inputSchema: {
      type: 'object',
      properties: {
        stage_group_id: {
          type: 'integer',
          minimum: 1,
          description: 'Acota a un grupo de etapas (por ejemplo el embudo de Ventas). Se consideran tanto las etapas cuyo group_id es este grupo como las que están asociadas por la tabla de miembros de grupo. Los ids salen de whatspro_list_records(resource="funnel-stage-groups") o del propio resultado sin filtrar.',
        },
        stale_after_days: {
          type: 'integer',
          minimum: 1,
          maximum: 3650,
          default: 30,
          description: 'A partir de cuántos días sin movimiento se cuenta un contacto como estancado. Por defecto 30.',
        },
        include_empty: {
          type: 'boolean',
          default: false,
          description: 'true devuelve también las etapas que no tienen ni un contacto. Por defecto false, porque el equipo suele tener muchas etapas vacías que sólo ensucian la respuesta.',
        },
        include_deals: {
          type: 'boolean',
          default: true,
          description: 'Agrega el embudo de OPORTUNIDADES abiertas: por etapa y por moneda, cuántas hay, cuántas están estancadas y cuánto suman. Los montos NUNCA se suman entre monedas distintas. Si el plugin Oportunidades está apagado o falta el permiso, la sección viene vacía con el motivo en deals_skipped.',
        },
        include_stale_contacts: {
          type: 'boolean',
          default: false,
          description: 'true agrega en cada etapa una muestra de los contactos más estancados (id, nombre, días, responsable). Por defecto false para no inflar la respuesta.',
        },
        sample_limit: {
          type: 'integer',
          minimum: 1,
          maximum: 25,
          default: 5,
          description: 'Cuántos contactos estancados devolver por etapa cuando include_stale_contacts=true. Por defecto 5, tope 25. Si hay más, se informa cuántos quedaron afuera.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_contact_graph',
    description:
      'El mapa completo de todo lo que cuelga de un contacto o de un cliente, en UNA llamada: quién es, en qué etapa del embudo está y hace cuántos días, quién lo tiene asignado, sus etiquetas y campos personalizados, el cliente del CRM vinculado (y los otros contactos de ese mismo cliente), las tareas relacionadas con su proyecto y columna, las relaciones sueltas del grafo de Tareas (notas, eventos, proyectos), las suscripciones/membresías con plan, empresa, precio y vencimiento, los informes de Radar publicados sobre él, y el estado del chat (último mensaje, quién habló último, sin leer) más TODAS sus notas privadas (la nota del CRM, las notas internas del chat que nunca se le enviaron y la bitácora del cliente), y lo COMERCIAL: la oportunidad abierta con su valor y probabilidad, cuánto debe por moneda con las ventas vencidas marcadas, cuánto pagó históricamente, la próxima reunión agendada y qué quedó pendiente de la anterior. Reemplaza cruzar a mano seis o siete whatspro_list_records. Usala ANTES de contestarle algo a un cliente, antes de renovarle, antes de armarle una propuesta o cuando el usuario pregunta "contame todo de este contacto". Aceptá cualquiera de las tres puertas de entrada: contact_id, chat_id o customer_id (con customer_id arranca por el cliente y baja a sus contactos). Cada sección tiene su propio tope y te dice cuántos elementos quedaron afuera; ninguna se trunca en silencio. Las secciones se saltean solas si al usuario del conector le falta el permiso o el plugin correspondiente (clientes, membresías, tareas, Radar): en ese caso aparecen en skipped con el motivo, y el resto igual se devuelve.',
    inputSchema: {
      type: 'object',
      properties: {
        contact_id: { type: 'integer', minimum: 1, description: 'Id del contacto del CRM. Lo sacás de whatspro_list_records(resource="contacts") o de whatspro_crm_funnel_snapshot.' },
        chat_id: { type: 'integer', minimum: 1, description: 'Alternativa a contact_id: el id del chat de WhatsApp. Se resuelve al contacto guardado de ese chat.' },
        customer_id: { type: 'integer', minimum: 1, description: 'Alternativa: arrancar por el cliente del CRM (team_customers) en vez de por el contacto. Devuelve el cliente y todos sus contactos vinculados.' },
        include: {
          type: 'array',
          maxItems: 9,
          uniqueItems: true,
          items: { type: 'string', enum: ['customer', 'tasks', 'relations', 'subscriptions', 'radar', 'tags', 'notes', 'chat', 'commercial'] },
          description: 'Qué secciones traer. Si no lo mandás vienen todas. Usalo para achicar la respuesta cuando ya sabés qué buscás (por ejemplo include=["tasks","subscriptions"] antes de renovar).',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          default: 25,
          description: 'Tope de elementos por sección (tareas, suscripciones, informes, relaciones). Por defecto 25, tope 100. Lo que no entra se informa como omitido.',
        },
      },
      anyOf: [{ required: ['contact_id'] }, { required: ['chat_id'] }, { required: ['customer_id'] }],
      additionalProperties: false,
    },
  },
];

export const tasksActionTools: GrokActionTool[] = [
  {
    name: 'whatspro_tasks_duplicate',
    description:
      'Duplica una TAREA o un PROYECTO entero. target="task": copia título, notas, etiquetas, checklist, fechas, estado, color, ícono y adjuntos; sin column_id queda al lado de la original con el sufijo " copia", con column_id (opcionalmente validada contra project_id) va a esa columna conservando el título tal cual, que es la forma de "copiar a otro tablero". target="project": copia el proyecto con todas sus columnas, tareas, adjuntos de tareas y adjuntos del proyecto como "<nombre> copia", al final del mismo espacio o del target_workspace_id que indiques. En los dos casos la copia queda ligada a la original con la relación duplicated_to. Duplicar un proyecto crea muchos registros: usá dry_run=true primero para ver cuántas columnas y tareas se copiarían.',
    inputSchema: {
      type: 'object',
      required: ['target', 'id'],
      properties: {
        target: { type: 'string', enum: ['task', 'project'] },
        id: { type: 'integer', minimum: 1, description: 'Id de la tarea o del proyecto según target. Salen de whatspro_tasks_board.' },
        column_id: { type: 'integer', minimum: 1, description: 'Sólo target="task": columna destino. Si se omite, la misma columna.' },
        project_id: { type: 'integer', minimum: 1, description: 'Sólo target="task" y junto con column_id: valida que la columna pertenezca a ese proyecto.' },
        target_workspace_id: { type: 'integer', minimum: 1, description: 'Sólo target="project": espacio destino. Si se omite, el mismo espacio.' },
        dry_run: { type: 'boolean', description: 'true = no copia nada, sólo informa qué se copiaría. Por defecto false.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_tasks_convert',
    description:
      'Convierte entre tarea y proyecto sin borrar el original (quedan ligados por la relación converted_to). direction="task_to_project": crea un proyecto que se llama como la tarea, en el mismo espacio y con las mismas etiquetas del proyecto de origen, con las columnas "Por hacer / En progreso / Completado", y cada ítem del checklist pasa a ser una tarea hija en "Por hacer" (los tildados nacen done). direction="project_to_task": crea UNA tarea en la primera columna de ese mismo proyecto, llamada como el proyecto, cuyo checklist tiene un ítem por cada tarea del tablero ("<columna>: <título>", tildado si estaba done) con un snapshot de la tarea original. Es el movimiento para "esta tarea creció, hacela proyecto" y "este proyecto quedó chico, volvelo una tarea".',
    inputSchema: {
      type: 'object',
      required: ['direction', 'id'],
      properties: {
        direction: { type: 'string', enum: ['task_to_project', 'project_to_task'] },
        id: { type: 'integer', minimum: 1, description: 'Id de la tarea (task_to_project) o del proyecto (project_to_task).' },
        dry_run: { type: 'boolean', description: 'true = no crea nada, sólo informa qué se crearía. Por defecto false.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_tasks_checklist_to_tasks',
    description:
      'Despliega el checklist de una tarea en tareas propias: cada ítem se vuelve una tarea en la misma columna, hija de la original (parent) y ligada por la relación converted_checklist_item; los ítems tildados nacen en estado done. El checklist original NO se borra. Sirve cuando los ítems necesitan responsable, fecha o comentarios propios. Crea tantas tareas como ítems: usá dry_run=true para ver la lista antes.',
    inputSchema: {
      type: 'object',
      required: ['task_id'],
      properties: {
        task_id: { type: 'integer', minimum: 1 },
        dry_run: { type: 'boolean', description: 'true = no crea nada, devuelve los ítems que se convertirían. Por defecto false.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_tasks_embed',
    description:
      'Administra el LINK PÚBLICO (embed) de un proyecto o de un espacio de trabajo: una URL sin login que muestra el tablero y, con access="manage", permite editarlo desde afuera. action="status" sólo lee. action="enable" lo activa (reusa el token si ya había uno, así la URL vieja vuelve a funcionar). action="regenerate" emite un token nuevo: la URL anterior deja de funcionar para siempre, por eso exige confirm=true. action="disable" lo apaga conservando el token (exige confirm=true porque corta el acceso de quien lo esté usando; se puede volver a activar con la misma URL). access: "read" = sólo ver, "manage" = ver y editar; si no se manda se conserva el actual (manage por defecto). Devuelve public_url cuando el embed queda activo. Cualquiera con la URL ve el tablero: no la pegues en lugares públicos si tiene datos de clientes.',
    inputSchema: {
      type: 'object',
      required: ['type', 'id', 'action'],
      properties: {
        type: { type: 'string', enum: ['project', 'workspace'] },
        id: { type: 'integer', minimum: 1 },
        action: { type: 'string', enum: ['status', 'enable', 'regenerate', 'disable'] },
        access: { type: 'string', enum: ['read', 'manage'] },
        confirm: { type: 'boolean', description: 'Obligatorio en regenerate y disable.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_manage_task_template',
    description:
      'Plantillas de Tareas: action="list" devuelve las del equipo (opcionalmente filtradas por type); action="create" guarda una nueva. type="task" guarda los campos de una tarea modelo (título, notas, checklist, etiquetas…), type="project" las columnas y configuración de un tablero modelo, type="labels" un set de etiquetas. payload es lo que la pantalla vuelve a hidratar al aplicar la plantilla, y se guarda tal cual: copiá la forma de una plantilla existente (list) antes de inventar una. No hay borrado por acá porque la app tampoco lo expone todavía.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['list', 'create'] },
        type: { type: 'string', enum: [...TASK_TEMPLATE_TYPES], description: 'Obligatorio en create; opcional como filtro en list.' },
        name: { type: 'string', minLength: 1, maxLength: 200, description: 'Obligatorio en create.' },
        payload: { type: 'object', description: 'Contenido de la plantilla. Por defecto {}.', additionalProperties: true },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_tasks_manage_dependency',
    description:
      'Crea o borra una DEPENDENCIA entre tareas: "la tarea A depende de (está bloqueada por) la tarea B". Las dependencias se ven en la ficha de la tarea (whatspro_tasks_get las muestra en ambos sentidos). Antes de crear, valida que no se forme un ciclo (A depende de B y B, directa o indirectamente, de A): un ciclo dejaría a las dos tareas bloqueadas para siempre, así que se rechaza explicando la cadena.',
    inputSchema: {
      type: 'object',
      required: ['action', 'task_id', 'depends_on_task_id'],
      properties: {
        action: { type: 'string', enum: ['create', 'delete'] },
        task_id: { type: 'integer', minimum: 1, description: 'La tarea bloqueada (la que depende).' },
        depends_on_task_id: { type: 'integer', minimum: 1, description: 'La tarea de la que depende (la que bloquea).' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_tasks_merge_duplicate_projects',
    description:
      'Fusiona proyectos DUPLICADOS (mismo nombre dentro de un mismo espacio) en uno solo: las tareas del duplicado se mueven al proyecto que se conserva (el más viejo), mapeando las columnas por título (las que no existen se crean), y el proyecto duplicado se elimina. Por defecto corre en dry_run y devuelve QUÉ grupos de duplicados encontró sin tocar nada — revisá esa lista primero. Para aplicar de verdad: dry_run=false y confirm=true (mueve tareas y borra proyectos; no se deshace).',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: { type: 'integer', minimum: 1, description: 'Acota la fusión a un espacio. Sin él, todo el equipo.' },
        dry_run: { type: 'boolean', default: true, description: 'true (defecto) = solo lista los duplicados detectados.' },
        confirm: { type: 'boolean', description: 'Obligatorio en true cuando dry_run=false: la fusión borra proyectos.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_operations_ai_reply',
    description:
      'Publica una respuesta breve del conector en la burbuja IA compartida de Tareas y Centro de Comandos. Usala para responder una instrucción general leída en conversation de whatspro_tasks_ai_worklist o para dejar el resumen final de una corrida. Sólo reportá hechos que realmente ocurrieron; si algo quedó pendiente o bloqueado, decilo explícitamente. Para resultados de un prompt individual usá además whatspro_tasks_ai_report, que conserva fingerprint, fase y estado.',
    inputSchema: {
      type: 'object',
      required: ['content', 'connector'],
      properties: {
        content: { type: 'string', minLength: 1, maxLength: 4000 },
        connector: { type: 'string', enum: ['chatgpt', 'grok', 'claude', 'other'] },
        reply_to_message_id: { type: 'integer', minimum: 1 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_tasks_ai_report',
    description:
      'Registra el resultado REAL de una fase y lo publica en la burbuja IA. El fingerprint debe ser el de whatspro_tasks_ai_worklist. Para completar prepare de una TAREA es obligatorio prepared_next_step: se guarda atómicamente y la tarea pasa a phase="execute". Para completar execute: si mandás related_task_id, se vincula la tarea nueva y se completa la original; si no, la misma tarea vuelve a la lista abierta, se limpia la cola y el summary se agrega a su descripción (o usá updated_notes/checklist/adjusted_ai_prompt para dejar el resultado exacto). blocked y failed conservan la tarea en cola. Nunca reportes completed antes de ejecutar las herramientas reales necesarias.',
    inputSchema: {
      type: 'object',
      required: ['target_type', 'target_id', 'phase', 'status', 'fingerprint', 'summary', 'connector'],
      properties: {
        target_type: { type: 'string', enum: ['workspace', 'project', 'task'] },
        target_id: { type: 'integer', minimum: 1 },
        phase: { type: 'string', enum: ['prepare', 'execute'] },
        status: { type: 'string', enum: ['completed', 'blocked', 'failed'] },
        fingerprint: { type: 'string', minLength: 64, maxLength: 64 },
        summary: { type: 'string', minLength: 1, maxLength: 4000 },
        connector: { type: 'string', enum: ['chatgpt', 'grok', 'claude', 'other'] },
        prepared_next_step: { type: 'string', minLength: 1, maxLength: 20000 },
        related_task_id: { type: 'integer', minimum: 1 },
        updated_notes: { type: 'string', maxLength: 20000 },
        checklist: taskChecklistProperty,
        adjusted_ai_prompt: { type: 'string', maxLength: 20000 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_tasks_cascade_apply',
    description:
      'Aplica un documento en DSL Cascade sobre el tablero: crea los espacios, proyectos, columnas y tareas que falten y actualiza las notas y checklists de las que ya existen (matchea por título dentro de la ruta espacio→proyecto→columna→tarea). NUNCA borra ni mueve nada: lo que no está en el documento queda como estaba. FLUJO OBLIGATORIO EN DOS PASOS: 1) llamala con mode="preview" (es el valor por defecto), que NO escribe una sola fila y devuelve el diff — cuántos espacios/proyectos/columnas/tareas se crearían y cuántas tareas se actualizarían, más las rutas afectadas; 2) mostrale ese diff al usuario con palabras, esperá su OK explícito, y recién ahí volvé a llamar con el MISMO document y mode="apply". No llames directo con mode="apply" aunque el pedido parezca claro: es una escritura masiva. Ejemplos: "armá el plan de producción de GoldPampa con 4 etapas y 14 tareas, mostrame el diff antes de aplicar", "agregá estas 8 tareas al tablero de Soporte". Si no sabés la sintaxis del DSL, llamá antes a whatspro_tasks_cascade_export, que la devuelve en syntax_help junto con el tablero actual como ejemplo real. Si mandás workspace_id o project_id, el documento se ancla a ese espacio/proyecto (los títulos de nivel superior del texto se ignoran y no se crea un espacio nuevo por error). Requiere permiso de escritura de tareas incluso en modo preview.',
    inputSchema: {
      type: 'object',
      required: ['document'],
      properties: {
        document: {
          type: 'string',
          minLength: 1,
          maxLength: 200000,
          description: 'El documento en DSL Cascade. Ver la sintaxis en syntax_help de whatspro_tasks_cascade_export.',
        },
        mode: {
          type: 'string',
          enum: ['preview', 'apply'],
          default: 'preview',
          description: 'preview (por defecto) devuelve el diff sin escribir absolutamente nada. apply lo ejecuta. Usá apply sólo después de que el usuario haya visto el preview y lo haya aprobado.',
        },
        ...scopeProperties,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_tasks_comment',
    description:
      'Lee y escribe el hilo de comentarios de una tarea: es donde el equipo va a ver lo que dejaste. Con action="list" (por defecto) devuelve todos los comentarios de la tarea en orden cronológico con autor y fecha — usalo para ponerte al día antes de opinar y para no repetir algo que ya está dicho. Con action="add" agrega una entrada nueva. Usá kind="report" para dejar un PARTE DE TRABAJO: qué hiciste, qué encontraste y qué queda pendiente — queda guardado con fecha en la bitácora de la tarea, separado visualmente de los comentarios de las personas, y podés dejar tantos como haga falta a medida que avanzás. Usá kind="comment" (por defecto) cuando le estés hablando a alguien del equipo. Ejemplos: "dejá en la tarea de la migración qué encontraste al revisar el código", "comentale a Carlos en la tarea de cobranza que ya se le mandó el link de pago", "¿qué se dijo en la tarea 812?". Para conseguir el task_id usá whatspro_tasks_board. El texto es plano (sin markdown enriquecido) y se guarda tal cual; no se envía a nadie por WhatsApp, sólo queda en la tarea. action="list" pide permiso de lectura de tareas; action="add" pide permiso de escritura.',
    inputSchema: {
      type: 'object',
      required: ['task_id'],
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'add'],
          default: 'list',
          description: 'list = leer el hilo (no escribe nada). add = agregar un comentario (requiere text).',
        },
        task_id: {
          type: 'integer',
          minimum: 1,
          description: 'Id de la tarea. Lo sacás de whatspro_tasks_board.',
        },
        text: {
          type: 'string',
          minLength: 1,
          maxLength: 5000,
          description: 'Texto de la entrada. Obligatorio con action="add", se ignora con action="list".',
        },
        kind: {
          type: 'string',
          enum: ['comment', 'report'],
          default: 'comment',
          description: 'report = parte de trabajo tuyo (qué hiciste, qué encontraste, qué falta): queda en la bitácora marcado como hecho por IA, con su fecha. comment = comentario dirigido a una persona del equipo. Ante la duda, si estás documentando tu propio trabajo usá report.',
        },
      },
      additionalProperties: false,
    },
  },

  {
    name: 'whatspro_tasks_links',
    description:
      'El grafo de una tarea: qué contacto, qué cliente, qué otras tareas y qué tableros tiene colgados, y de qué tareas depende. Con action="list" (por defecto) devuelve TODO lo vinculado a la tarea en una llamada, en las dos direcciones, con los nombres resueltos (no ids pelados): contactos del CRM, clientes, tareas relacionadas, proyectos donde está compartida, dependencias (de qué depende y a quién bloquea) y en qué columnas del tablero aparece. Con action="link" creás un vínculo y con action="unlink" lo borrás. Ejemplos: "¿de qué cliente es esta tarea?", "vinculá la tarea 812 al contacto de Gomez Contenedores", "esta tarea no puede arrancar hasta que esté la 640", "sacale el vínculo con el cliente equivocado". PARÁMETRO kind: "relation" (por defecto) escribe en el grafo de relaciones de Tareas; "dependency" escribe una dependencia real de ejecución entre dos tareas (tabla aparte) y valida que no se arme un ciclo — es lo que tenés que usar cuando el usuario dice "esta depende de aquella" o "esta bloquea a esta otra". Los pares soportados con validación de equipo son contact, customer, task y project; workspace, note y event existen en el esquema pero no se pueden verificar acá, para esos usá whatspro_manage_task_relation. Si mandás un id que no es del equipo, el error te dice con qué herramienta buscar el correcto. action="list" pide permiso de lectura de tareas; link y unlink piden escritura.',
    inputSchema: {
      type: 'object',
      required: ['task_id'],
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'link', 'unlink'],
          default: 'list',
          description: 'list = ver todo lo vinculado (no escribe nada). link = crear el vínculo. unlink = borrarlo.',
        },
        task_id: {
          type: 'integer',
          minimum: 1,
          description: 'Id de la tarea sobre la que trabajás. Lo sacás de whatspro_tasks_board.',
        },
        kind: {
          type: 'string',
          enum: ['relation', 'dependency'],
          default: 'relation',
          description: 'relation = vínculo del grafo (tarea↔contacto, tarea↔cliente, tarea↔tarea, tarea↔proyecto). dependency = dependencia de ejecución entre dos tareas: la tarea task_id depende de target_id, o sea target_id tiene que estar lista primero. Con dependency, target_type debe ser "task".',
        },
        target_type: {
          type: 'string',
          enum: ['contact', 'customer', 'task', 'project', 'document'],
          description: 'Qué tipo de cosa estás vinculando. contact = contacto del CRM (aparece en el lateral de su chat). customer = cliente de la ficha de Clientes. task = otra tarea. project = otro tablero. document = documento de la app Documentos (la especificación, la propuesta o el informe de esa tarea). Obligatorio con link; con unlink podés usarlo junto a target_id en vez de relation_id.',
        },
        target_id: {
          type: 'integer',
          minimum: 1,
          description: 'Id de la entidad del otro lado del vínculo, del tipo indicado en target_type.',
        },
        relation_type: {
          type: 'string',
          enum: ['related', 'shared_in', 'generated_from', 'converted_to', 'checklist_source'],
          default: 'related',
          description: 'Sabor de la relación cuando kind="relation". related es el 95 % de los casos y es el valor por defecto. shared_in la usa whatspro_share_task para la misma tarea en dos tableros; generated_from y converted_to marcan de dónde salió la tarea. Se ignora con kind="dependency".',
        },
        relation_id: {
          type: 'integer',
          minimum: 1,
          description: 'Sólo para unlink: borrar el vínculo por su id exacto (los ids salen de action="list"). Es la forma segura cuando hay varios vínculos parecidos. Si lo mandás, target_type y target_id se ignoran.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_tasks_assign',
    description:
      'Pone o saca el responsable de una o varias tareas, y resuelve a la persona POR NOMBRE o por correo — no hace falta saber el user_id. Es la única forma de asignar por el conector: whatspro_manage_task no tiene campo de responsable. Ejemplos: "asignale a Martín las tres tareas de la migración", "sacale el responsable a la 812", "¿quién es Martín acá?", "¿cuántas tareas abiertas tiene cada uno?". OJO CON LOS HOMÓNIMOS: en un equipo pueden convivir dos cuentas que empiezan igual (por ejemplo martin@… y martinproduccion@…). La resolución puntúa a los candidatos y la coincidencia EXACTA (correo completo, nombre completo, primer nombre, o la parte local del correo) siempre le gana a un prefijo, así que "martin" resuelve a martin@… y no a martinproduccion@…. Si de verdad queda empate, la herramienta NO elige: devuelve status="ambiguous" con la lista de candidatos y sus ids, y tenés que preguntarle al usuario cuál es antes de escribir nada. Acciones: "resolve" te dice a quién resuelve un nombre sin tocar nada; "list_people" lista el equipo con su carga de tareas abiertas; "assign" y "unassign" escriben. Podés mandar task_id o task_ids (hasta 50): el resultado viene tarea por tarea, y una tarea que falla no aborta las demás. resolve y list_people piden permiso de lectura de tareas; assign y unassign piden escritura.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['assign', 'unassign', 'resolve', 'list_people'],
          default: 'assign',
          description: 'assign = poner responsable. unassign = dejar la tarea sin responsable. resolve = sólo averiguar a qué persona resuelve un nombre (no escribe). list_people = el equipo con su carga actual (no escribe).',
        },
        person: {
          type: 'string',
          minLength: 1,
          maxLength: 200,
          description: 'Nombre, primer nombre o correo de la persona, tal como lo dijo el usuario ("Martín", "noelia", "carlos@whatspro.uno"). Se normaliza (acentos y mayúsculas dan igual). Alternativa a user_id; si mandás los dos, gana user_id.',
        },
        user_id: {
          type: 'integer',
          minimum: 1,
          description: 'Id exacto del usuario a asignar. Se valida que sea miembro de este equipo. Usalo cuando ya lo resolviste con action="resolve".',
        },
        task_id: {
          type: 'integer',
          minimum: 1,
          description: 'Id de la tarea a asignar. Alternativa a task_ids.',
        },
        task_ids: {
          type: 'array',
          minItems: 1,
          maxItems: 50,
          uniqueItems: true,
          items: { type: 'integer', minimum: 1 },
          description: 'Varias tareas de una (hasta 50). El resultado viene por tarea: las que fallan se informan y las demás igual se escriben.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_tasks_move',
    description:
      'Mueve cosas de lugar dentro de Tareas OS validando que el destino sea del mismo equipo. Con action="task" movés una o varias tareas a otra columna (etapa) y/o a otro proyecto: si mandás sólo project_id, cae en la primera columna de ese tablero, así que podés mover algo de proyecto sin conocer los ids de sus columnas. Con action="project" movés un proyecto entero a otro espacio de trabajo. Ejemplos: "pasá estas 4 tareas a Haciendo", "mové la tarea de la migración al tablero de Producción", "el proyecto de GoldPampa va al espacio de Clientes". Detalle importante de cómo funciona el tablero: una tarea puede estar en varios proyectos a la vez (ubicación principal + ubicaciones secundarias que crea whatspro_share_task). Este mover cambia la ubicación PRINCIPAL: si la tarea estaba compartida en el destino, esa copia pasa a ser la principal en vez de duplicarse. Si lo que querés es que aparezca en dos tableros sin sacarla del original, no uses esta herramienta, usá whatspro_share_task. Acepta task_id o task_ids (hasta 50) y devuelve el resultado tarea por tarea, sin abortar todo al primer error. Requiere permiso de escritura de tareas.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: {
          type: 'string',
          enum: ['task', 'project'],
          description: 'task = mover tareas entre columnas y/o proyectos. project = mover un proyecto a otro espacio de trabajo.',
        },
        task_id: { type: 'integer', minimum: 1, description: 'Con action="task": la tarea a mover. Alternativa a task_ids.' },
        task_ids: {
          type: 'array',
          minItems: 1,
          maxItems: 50,
          uniqueItems: true,
          items: { type: 'integer', minimum: 1 },
          description: 'Con action="task": varias tareas de una (hasta 50). Todas van al mismo destino.',
        },
        column_id: {
          type: 'integer',
          minimum: 1,
          description: 'Con action="task": columna/etapa de destino. Si también mandás project_id, se valida que la columna pertenezca a ese proyecto.',
        },
        project_id: {
          type: 'integer',
          minimum: 1,
          description: 'Con action="task": proyecto de destino (si no mandás column_id, entra en su primera columna). Con action="project": el proyecto que estás moviendo.',
        },
        workspace_id: {
          type: 'integer',
          minimum: 1,
          description: 'Con action="project": espacio de trabajo de destino. Obligatorio en esa acción.',
        },
      },
      additionalProperties: false,
    },
  },
];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const scopeSchema = {
  workspace_id: z.number().int().positive().optional(),
  project_id: z.number().int().positive().optional(),
};

const taskAiWorklistSchema = z.object({
  include_completed: z.boolean().optional(),
  limit: z.number().int().min(1).max(300).optional(),
});

const taskAiReportSchema = z.object({
  target_type: z.enum(['workspace', 'project', 'task']),
  target_id: z.number().int().positive(),
  phase: z.enum(['prepare', 'execute']),
  status: z.enum(['completed', 'blocked', 'failed']),
  fingerprint: z.string().length(64),
  summary: z.string().trim().min(1).max(4000),
  connector: z.enum(['chatgpt', 'grok', 'claude', 'other']),
  prepared_next_step: z.string().trim().min(1).max(20000).optional(),
  related_task_id: z.number().int().positive().optional(),
  updated_notes: z.string().max(20000).optional(),
  checklist: z.array(z.object({
    id: z.string().trim().min(1).max(100),
    text: z.string().trim().min(1).max(500),
    completed: z.boolean(),
  })).max(100).optional(),
  adjusted_ai_prompt: z.string().max(20000).optional(),
});

const operationsAiReplySchema = z.object({
  content: z.string().trim().min(1).max(4000),
  connector: z.enum(['chatgpt', 'grok', 'claude', 'other']),
  reply_to_message_id: z.number().int().positive().optional(),
});

function buildScope(data: { workspace_id?: number; project_id?: number }): CascadeScope {
  if (data.project_id) return { type: 'project', projectId: data.project_id };
  if (data.workspace_id) return { type: 'workspace', workspaceId: data.workspace_id };
  return { type: 'team' };
}

function describeBoardIds(workspaces: TaskOsData) {
  return workspaces.map((ws) => ({
    workspace_id: ws.id,
    workspace: ws.name,
    projects: ws.projects.map((project) => ({ project_id: project.id, project: project.name })),
  }));
}

function idHint(workspaces: TaskOsData) {
  const parts = workspaces.flatMap((ws) =>
    ws.projects.map((project) => `${project.id}=${ws.name} · ${project.name}`),
  );
  if (!parts.length) return 'El equipo todavía no tiene proyectos de tareas.';
  return `Proyectos disponibles (project_id=espacio · proyecto): ${parts.slice(0, 40).join('; ')}`;
}

/**
 * Valida que el alcance exista dentro del equipo y devuelve los nombres que
 * necesitan `parseScopedCascade` y `anchorCascadeDocument`. Sin esta validación
 * un project_id de otro equipo cae en el fallback "Principal" y el apply
 * terminaría creando un espacio nuevo en vez de fallar.
 */
function resolveScope(workspaces: TaskOsData, scope: CascadeScope) {
  if (scope.type === 'workspace') {
    const ws = workspaces.find((w) => w.id === scope.workspaceId);
    if (!ws) {
      throw new Error(
        `No existe el espacio de trabajo ${scope.workspaceId} en este equipo. Espacios disponibles: ${
          workspaces.map((w) => `${w.id}=${w.name}`).join('; ') || 'ninguno'
        }.`,
      );
    }
    return { workspaceName: ws.name, projectName: undefined as string | undefined };
  }

  if (scope.type === 'project') {
    for (const ws of workspaces) {
      const project = ws.projects.find((p) => p.id === scope.projectId);
      if (project) return { workspaceName: ws.name, projectName: project.name };
    }
    throw new Error(
      `No existe el proyecto ${scope.projectId} en este equipo. ${idHint(workspaces)}. También podés listarlos con whatspro_tasks_board.`,
    );
  }

  return { workspaceName: 'Principal', projectName: undefined as string | undefined };
}

/** Etiqueta legible del alcance, con nombres reales en vez de ids sueltos. */
function scopeLabel(scope: CascadeScope, resolved: { workspaceName: string; projectName?: string }) {
  if (scope.type === 'project') return `Proyecto: ${resolved.projectName ?? scope.projectId}`;
  if (scope.type === 'workspace') return `Espacio de trabajo: ${resolved.workspaceName}`;
  return getCascadeScopeLabel(scope);
}

async function loadMemberNames(teamId: number) {
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(eq(teamMembers.teamId, teamId));
  return new Map(rows.map((row) => [row.id, row.name?.trim() || row.email]));
}

/* ------------------------------------------------------------------ */
/* whatspro_tasks_board                                                */
/* ------------------------------------------------------------------ */

async function board(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'tasksRead', TASKS_PLUGIN);
  const data = parse(
    z.object({
      ...scopeSchema,
      customer_id: z.number().int().positive().optional(),
      include_done: z.boolean().optional(),
      limit: z.number().int().min(1).max(BOARD_MAX_LIMIT).optional(),
    }),
    input,
  );

  const includeDone = data.include_done ?? false;
  const limit = data.limit ?? BOARD_DEFAULT_LIMIT;

  // Filtro por cliente: se resuelve una sola vez a un Set de ids de tarea y
  // después se aplica dentro del recorrido, en vez de consultar por tarea.
  let customerTaskIds: Set<number> | null = null;
  if (data.customer_id) {
    if (!(await assertCustomer(context.teamId, data.customer_id))) {
      throw new Error(`No existe el cliente ${data.customer_id} en este equipo. ${HOW_TO_FIND_CUSTOMER}`);
    }
    const byTask = await listCustomerLinksForTasks(context.teamId, null);
    customerTaskIds = new Set(
      [...byTask.entries()]
        .filter(([, customerIds]) => customerIds.includes(data.customer_id!))
        .map(([taskId]) => taskId),
    );
  }

  const all = await loadTaskOsData(context.teamId);
  const members = await loadMemberNames(context.teamId);

  if (data.workspace_id && !all.some((ws) => ws.id === data.workspace_id)) {
    throw new Error(
      `No existe el espacio de trabajo ${data.workspace_id} en este equipo. Espacios disponibles: ${
        all.map((ws) => `${ws.id}=${ws.name}`).join('; ') || 'ninguno'
      }.`,
    );
  }
  if (data.project_id && !all.some((ws) => ws.projects.some((p) => p.id === data.project_id))) {
    throw new Error(`No existe el proyecto ${data.project_id} en este equipo. ${idHint(all)}.`);
  }

  const scoped = all
    .filter((ws) => (data.workspace_id ? ws.id === data.workspace_id : true))
    .map((ws) => ({
      ...ws,
      projects: ws.projects.filter((project) => (data.project_id ? project.id === data.project_id : true)),
    }))
    .filter((ws) => (data.project_id ? ws.projects.length > 0 : true));

  let matched = 0;
  let returned = 0;
  let doneHidden = 0;

  const workspaces = scoped.map((ws) => ({
    workspace_id: ws.id,
    workspace: ws.name,
    ...(ws.aiPrompt ? { ai_prompt: ws.aiPrompt } : {}),
    projects: ws.projects.map((project) => {
      const labelsById = new Map((project.labels ?? []).map((label) => [label.id, label.name]));
      let projectMatched = 0;
      let projectReturned = 0;

      const columns = project.columns.map((column) => {
        const items = column.items.filter((item) => {
          if (customerTaskIds && !customerTaskIds.has(item.id)) return false;
          if (item.status === 'done' && !includeDone) {
            doneHidden++;
            return false;
          }
          return true;
        });

        matched += items.length;
        projectMatched += items.length;

        const room = Math.max(0, limit - returned);
        const visible = items.slice(0, room);
        returned += visible.length;
        projectReturned += visible.length;

        return {
          column_id: column.id,
          column: column.title,
          total_tasks: items.length,
          omitted_tasks: items.length - visible.length,
          tasks: visible.map((item) => {
            const checklist = item.checklist ?? [];
            return {
              id: item.id,
              title: item.title,
              status: item.status,
              // Instrucciones que una persona dejó escritas para la IA en esa
              // tarea. Van en el tablero (y no sólo en el detalle) para que se
              // vea de una cuáles esperan trabajo tuyo, sin abrir tarea por
              // tarea. Se recorta porque el tablero puede traer 150 tareas.
              ...(item.aiPrompt
                ? {
                    ai_prompt: item.aiPrompt.length > BOARD_PROMPT_MAX_CHARS
                      ? `${item.aiPrompt.slice(0, BOARD_PROMPT_MAX_CHARS)}…`
                      : item.aiPrompt,
                    ai_prompt_truncated: item.aiPrompt.length > BOARD_PROMPT_MAX_CHARS,
                  }
                : {}),
              ...(item.aiNextStep ? { ai_next_step: item.aiNextStep } : {}),
              ...(item.aiContextQuestion ? { ai_context_question: item.aiContextQuestion } : {}),
              ...(item.aiContextAnswer ? { ai_context_answer: item.aiContextAnswer } : {}),
              due_date: item.dueDate,
              assignee_id: item.assigneeId ?? null,
              assignee: item.assigneeId ? (members.get(item.assigneeId) ?? null) : null,
              // El esquema no tiene columna de prioridad: la prioridad se modela
              // con las etiquetas del proyecto, así que las resolvemos por nombre.
              labels: (item.labelIds ?? []).map((id) => labelsById.get(id) ?? id),
              checklist: checklist.length
                ? { done: checklist.filter((check) => check.completed).length, total: checklist.length }
                : null,
              comment_count: item.commentCount,
              is_primary_location: item.isPrimaryLocation,
            };
          }),
        };
      });

      return {
        project_id: project.id,
        project: project.name,
        ...(project.aiPrompt ? { ai_prompt: project.aiPrompt } : {}),
        total_tasks: projectMatched,
        omitted_tasks: projectMatched - projectReturned,
        columns,
      };
    }),
  }));

  const omitted = matched - returned;

  return {
    scope: data.project_id
      ? { type: 'project', project_id: data.project_id }
      : data.workspace_id
        ? { type: 'workspace', workspace_id: data.workspace_id }
        : { type: 'team' },
    include_done: includeDone,
    workspaces,
    meta: {
      limit,
      matched_tasks: matched,
      returned_tasks: returned,
      omitted_tasks: omitted,
      truncated: omitted > 0,
      done_hidden: includeDone ? 0 : doneHidden,
      note: omitted > 0
        ? `Quedaron ${omitted} tareas afuera por el límite de ${limit}. Volvé a llamar acotando con project_id o workspace_id, o subí limit (tope ${BOARD_MAX_LIMIT}).`
        : includeDone
          ? 'Se devolvió el tablero completo del alcance pedido.'
          : `Se devolvió el tablero completo del alcance pedido; ${doneHidden} tareas terminadas quedaron ocultas (pasá include_done=true para verlas).`,
    },
  };
}

/* ------------------------------------------------------------------ */
/* whatspro_tasks_cascade_export                                       */
/* ------------------------------------------------------------------ */

async function cascadeExport(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'tasksRead', TASKS_PLUGIN);
  const data = parse(z.object({ ...scopeSchema }), input);

  const workspaces = await loadTaskOsData(context.teamId);
  const scope = buildScope(data);
  const resolved = resolveScope(workspaces, scope);

  const document = serializeCascadeForScope(workspaces as CascadeExportWorkspace[], scope);

  if (document.length > CASCADE_EXPORT_MAX_CHARS) {
    throw new Error(
      `El documento exportado son ${document.length} caracteres y el tope es ${CASCADE_EXPORT_MAX_CHARS}. No lo trunco porque un DSL a medias es peligroso de reaplicar: volvé a llamar con project_id o workspace_id. ${idHint(workspaces)}.`,
    );
  }

  return {
    scope: { ...scope, label: scopeLabel(scope, resolved) },
    document,
    chars: document.length,
    lines: document ? document.split('\n').length : 0,
    board_ids: describeBoardIds(workspaces),
    syntax_help: CASCADE_SYNTAX_HELP,
    next: 'Editá el texto y aplicalo con whatspro_tasks_cascade_apply(mode="preview") para ver el diff antes de escribir.',
  };
}

/* ------------------------------------------------------------------ */
/* whatspro_tasks_cascade_apply                                        */
/* ------------------------------------------------------------------ */

async function cascadeApply(input: Record<string, unknown>, context: GrokActionContext) {
  // Pedimos tasksWrite también en preview: previewear una escritura que no
  // podrías ejecutar no tiene sentido y evita filtrar el tablero por esta vía.
  await assertPermission(context, 'tasksWrite', TASKS_PLUGIN);
  const data = parse(
    z.object({
      document: z.string().min(1).max(200000),
      mode: z.enum(['preview', 'apply']).default('preview'),
      ...scopeSchema,
    }),
    input,
  );

  if (!data.document.trim()) throw new Error('El documento está vacío. Mandá el DSL Cascade en "document".');

  const existing = await loadTaskOsData(context.teamId);
  const scope = buildScope(data);
  const scopeCtx = resolveScope(existing, scope);

  const parsed = scope.type === 'team'
    ? parseCascadeDocument(data.document)
    : parseScopedCascade(data.document, scope, {
        workspaceName: scopeCtx.workspaceName,
        projectName: scopeCtx.projectName,
      });

  const anchored = anchorCascadeDocument(parsed, scope, {
    workspaceName: scopeCtx.workspaceName,
    projectName: scopeCtx.projectName,
  });

  const summary = summarizeCascadeDocument(anchored);
  const scopeOut = { ...scope, label: scopeLabel(scope, scopeCtx) };

  if (data.mode === 'preview') {
    const preview = await previewCascadeApply(context.teamId, anchored);
    return {
      mode: 'preview' as const,
      applied: false,
      dry_run: true,
      scope: scopeOut,
      document_summary: summary,
      preview,
      next: 'Nada se escribió. Contale al usuario qué se crearía y qué se actualizaría, y si lo aprueba volvé a llamar con el mismo document y mode="apply".',
    };
  }

  const stats = await applyCascadeDocument(context.teamId, context.userId, anchored, scope);
  await audit(
    context,
    'GROK_TASKS_CASCADE_APPLIED',
    scope.type === 'project' ? `project:${scope.projectId}` : scope.type === 'workspace' ? `workspace:${scope.workspaceId}` : 'team',
  );

  return {
    mode: 'apply' as const,
    applied: true,
    dry_run: false,
    scope: scopeOut,
    document_summary: summary,
    stats,
    next: data.project_id
      ? `Verificá el resultado con whatspro_tasks_board(project_id=${data.project_id}).`
      : 'Verificá el resultado con whatspro_tasks_board acotando por project_id o workspace_id.',
  };
}

/* ------------------------------------------------------------------ */
/* whatspro_tasks_comment                                              */
/* ------------------------------------------------------------------ */

async function comment(input: Record<string, unknown>, context: GrokActionContext) {
  const data = parse(
    z.object({
      action: z.enum(['list', 'add']).default('list'),
      task_id: z.number().int().positive(),
      text: z.string().min(1).max(5000).optional(),
      kind: z.enum(['comment', 'report']).optional(),
    }),
    input,
  );

  if (data.action === 'list') {
    await assertPermission(context, 'tasksRead', TASKS_PLUGIN);
    // listTaskComments filtra por teamId, pero devuelve [] tanto si la tarea no
    // tiene comentarios como si no existe. Distinguimos los dos casos.
    const task = await assertTask(context.teamId, data.task_id);
    if (!task) {
      throw new Error(`No existe la tarea ${data.task_id} en este equipo. Buscá el id con whatspro_tasks_board.`);
    }

    const comments = await listTaskComments(context.teamId, data.task_id);
    const members = await loadMemberNames(context.teamId);

    return {
      action: 'list' as const,
      task_id: data.task_id,
      task_title: task.title,
      count: comments.length,
      comments: comments.map((row) => ({
        id: row.id,
        text: row.text,
        kind: row.kind,
        source: row.source,
        author_id: row.createdBy,
        author: row.source === 'connector' ? 'IA' : (row.createdBy ? (members.get(row.createdBy) ?? null) : null),
        created_at: row.createdAt,
      })),
    };
  }

  await assertPermission(context, 'tasksWrite', TASKS_PLUGIN);
  const text = data.text?.trim();
  if (!text) throw new Error('Con action="add" tenés que mandar "text" con el comentario.');

  const created = await addTaskComment({
    teamId: context.teamId,
    userId: context.userId,
    taskId: data.task_id,
    text,
    kind: data.kind ?? 'comment',
    // Todo lo que entra por MCP es de un conector, aunque `createdBy` guarde
    // el usuario que lo autorizó: sin esto un parte automático se leía como
    // si lo hubiera escrito esa persona a mano.
    source: 'connector',
  });
  if (!created) {
    throw new Error(`No existe la tarea ${data.task_id} en este equipo. Buscá el id con whatspro_tasks_board.`);
  }
  await audit(context, 'GROK_TASK_COMMENT_ADDED', created.id);

  return {
    action: 'add' as const,
    task_id: data.task_id,
    comment: { id: created.id, text: created.text, kind: created.kind, source: created.source, author_id: created.createdBy, created_at: created.createdAt },
    next: `La entrada ya está en la tarea. Podés releer el hilo con whatspro_tasks_comment(action="list", task_id=${data.task_id}).`,
  };
}

/* ------------------------------------------------------------------ */
/* Vínculos: helpers compartidos                                       */
/* ------------------------------------------------------------------ */

/** Recorte del prompt dentro del tablero: si hace falta el texto completo,
 * está en whatspro_list_records(resource="tasks"). */
const BOARD_PROMPT_MAX_CHARS = 400;

const LINK_TARGET_TYPES = ['contact', 'customer', 'task', 'project', 'document'] as const;
type LinkTargetType = (typeof LINK_TARGET_TYPES)[number];

const RELATION_TYPES = ['related', 'shared_in', 'generated_from', 'converted_to', 'checklist_source'] as const;

/**
 * Tipos que el esquema acepta en team_task_relations pero que no podemos
 * validar contra el equipo (assertEntity devuelve false para ellos). En vez de
 * escribir un vínculo colgado, avisamos y derivamos a la tool genérica.
 */
const UNVERIFIABLE_LINK_TARGETS = ['workspace', 'note', 'event'] as const;

/** Tope de vínculos por sección en la respuesta de whatspro_tasks_links. */
const LINKS_SECTION_LIMIT = 60;

const HOW_TO_FIND_TASK = 'Buscá el id correcto con whatspro_tasks_board.';
const HOW_TO_FIND_CONTACT = 'Buscá el id correcto con whatspro_list_records(resource="contacts") o whatspro_crm_funnel_snapshot.';
const HOW_TO_FIND_CUSTOMER = 'Buscá el id correcto con whatspro_list_records(resource="customers").';

/** ¿El usuario del conector puede hacer esto? Sin tirar el error. */
async function canDo(context: GrokActionContext, permission: ActionPermission, pluginId?: string) {
  try {
    await assertPermission(context, permission, pluginId);
    return true;
  } catch {
    return false;
  }
}

async function loadMembers(teamId: number) {
  return db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(eq(teamMembers.teamId, teamId));
}

type TeamMemberRow = Awaited<ReturnType<typeof loadMembers>>[number];

function memberLabel(member: Pick<TeamMemberRow, 'name' | 'email'>) {
  return member.name?.trim() || member.email;
}

/* ------------------------------------------------------------------ */
/* Resolución de personas por nombre                                   */
/* ------------------------------------------------------------------ */

/**
 * Misma normalización que la UI (`ui-nueva/data/universo.ts:nombreNormalizado`).
 * Está duplicada a propósito: ese módulo arrastra la cadena entera de la UI
 * (mapeo, i18n, tipos del cliente) y este archivo es `server-only`.
 */
function normalizarClave(value: string) {
  return value
    .trim()
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Puntúa qué tan bien un miembro responde a un nombre. `null` = no es
 * candidato. Es el mismo criterio que `puntajeMiembro` en
 * `lib/plugins/tasks/ui-nueva/data/miembros.ts`, con dos tramos más arriba
 * (correo completo y nombre completo) porque acá el usuario puede escribir
 * cualquiera de las dos cosas.
 *
 * Los tramos importan: una coincidencia EXACTA siempre le tiene que ganar a un
 * prefijo. En este equipo conviven `martin@whatspro.uno` y
 * `martinproduccion@aapp.space`; buscando "martin" el prefijo del segundo
 * ganaría por orden de array si no se penalizara lo que sobra.
 */
function puntajePersona(member: Pick<TeamMemberRow, 'name' | 'email'>, wanted: string): number | null {
  const nombre = normalizarClave(member.name ?? '');
  const correo = normalizarClave(member.email ?? '');
  const local = normalizarClave((member.email ?? '').split('@')[0] ?? '');
  const primer = nombre ? (nombre.split(' ')[0] ?? nombre) : '';

  if (correo && correo === wanted) return 110;
  if (nombre && nombre === wanted) return 105;
  if (primer && primer === wanted) return 100;
  if (local === wanted) return 90;
  if (nombre && nombre.startsWith(`${wanted} `)) return 80;

  // Prefijos: último recurso. Se penaliza lo que sobra, para que `martin@` le
  // gane a `martinproduccion@` sin depender del orden en que venga el equipo.
  if (local.startsWith(wanted)) return 50 - Math.min(45, local.length - wanted.length);
  if (nombre.startsWith(wanted)) return 45 - Math.min(40, nombre.length - wanted.length);
  return null;
}

type PersonMatch =
  | { status: 'ok'; member: TeamMemberRow; score: number; runners_up: Array<{ user_id: number; person: string; email: string; score: number }> }
  | { status: 'ambiguous'; candidates: Array<{ user_id: number; person: string; email: string; score: number }> }
  | { status: 'not_found' };

/**
 * Resuelve un nombre suelto al miembro del equipo. Si hay empate en el mejor
 * puntaje NO elige: devuelve los candidatos para que decida el usuario.
 */
function resolvePerson(members: TeamMemberRow[], query: string): PersonMatch {
  const wanted = normalizarClave(query);
  if (!wanted) return { status: 'not_found' };

  const scored = members
    .map((member) => ({ member, score: puntajePersona(member, wanted) }))
    .filter((row): row is { member: TeamMemberRow; score: number } => row.score !== null)
    .sort((a, b) => (b.score - a.score) || (a.member.id - b.member.id));

  if (!scored.length) return { status: 'not_found' };

  const describe = (row: { member: TeamMemberRow; score: number }) => ({
    user_id: row.member.id,
    person: memberLabel(row.member),
    email: row.member.email,
    score: row.score,
  });

  const top = scored[0];
  const tied = scored.filter((row) => row.score === top.score);
  if (tied.length > 1) return { status: 'ambiguous', candidates: tied.map(describe) };

  return { status: 'ok', member: top.member, score: top.score, runners_up: scored.slice(1, 5).map(describe) };
}

/* ------------------------------------------------------------------ */
/* whatspro_tasks_links                                                */
/* ------------------------------------------------------------------ */

async function describeLinkTarget(teamId: number, type: LinkTargetType, id: number) {
  if (type === 'task') {
    const row = await assertTask(teamId, id);
    return row ? { id, label: row.title } : null;
  }
  if (type === 'project') {
    const row = await assertProject(teamId, id);
    return row ? { id, label: row.name } : null;
  }
  if (type === 'contact') {
    const row = await assertContact(teamId, id);
    return row ? { id, label: row.name } : null;
  }
  if (type === 'document') {
    const row = await assertDocument(teamId, id);
    return row ? { id, label: row.title } : null;
  }
  const row = await db.query.teamCustomers.findFirst({
    where: and(eq(teamCustomers.id, id), eq(teamCustomers.teamId, teamId)),
    columns: { id: true, name: true },
  });
  return row ? { id, label: row.name } : null;
}

function linkTargetHint(type: LinkTargetType) {
  if (type === 'task') return HOW_TO_FIND_TASK;
  if (type === 'contact') return HOW_TO_FIND_CONTACT;
  if (type === 'customer') return HOW_TO_FIND_CUSTOMER;
  if (type === 'document') return 'Buscá el documento con whatspro_documents_search; su id es el document_id que devuelve.';
  return 'Buscá el id correcto con whatspro_tasks_board (los proyectos vienen con su project_id).';
}

/**
 * ¿Agregar "task depende de dependsOn" cierra un ciclo? Se responde caminando
 * hacia adelante desde dependsOn: si desde ahí se llega a task, el nuevo arco
 * lo cierra. Hoy NINGUNA otra parte del código valida ciclos, y una IA que
 * encadena dependencias los arma sin querer.
 */
async function dependencyWouldCycle(teamId: number, taskId: number, dependsOnTaskId: number) {
  const seen = new Set<number>([dependsOnTaskId]);
  let frontier = [dependsOnTaskId];
  for (let depth = 0; depth < 25 && frontier.length; depth++) {
    const rows = await db
      .select({ next: teamTaskDependencies.dependsOnTaskId })
      .from(teamTaskDependencies)
      .where(and(eq(teamTaskDependencies.teamId, teamId), inArray(teamTaskDependencies.taskId, frontier)));
    const next: number[] = [];
    for (const row of rows) {
      if (row.next === taskId) return true;
      if (!seen.has(row.next)) {
        seen.add(row.next);
        next.push(row.next);
      }
    }
    frontier = next;
  }
  return false;
}

function cap<T>(rows: T[], limit = LINKS_SECTION_LIMIT) {
  return { items: rows.slice(0, limit), omitted: Math.max(0, rows.length - limit), total: rows.length };
}

async function taskLinks(input: Record<string, unknown>, context: GrokActionContext) {
  const data = parse(
    z.object({
      action: z.enum(['list', 'link', 'unlink']).default('list'),
      task_id: z.number().int().positive(),
      kind: z.enum(['relation', 'dependency']).default('relation'),
      target_type: z.enum([...LINK_TARGET_TYPES, ...UNVERIFIABLE_LINK_TARGETS]).optional(),
      target_id: z.number().int().positive().optional(),
      relation_type: z.enum(RELATION_TYPES).default('related'),
      relation_id: z.number().int().positive().optional(),
    }),
    input,
  );

  await assertPermission(context, data.action === 'list' ? 'tasksRead' : 'tasksWrite', TASKS_PLUGIN);

  const task = await assertTask(context.teamId, data.task_id);
  if (!task) throw new Error(`No existe la tarea ${data.task_id} en este equipo. ${HOW_TO_FIND_TASK}`);

  if (data.action === 'list') return listTaskLinks(context, task);

  if (data.target_type && (UNVERIFIABLE_LINK_TARGETS as readonly string[]).includes(data.target_type)) {
    throw new Error(
      `El tipo "${data.target_type}" existe en el esquema de relaciones pero acá no puedo verificar que ese id sea de este equipo, así que no lo escribo a ciegas. Tipos soportados con validación: ${LINK_TARGET_TYPES.join(', ')}. Si de verdad necesitás vincular un ${data.target_type}, usá whatspro_manage_task_relation.`,
    );
  }

  if (!data.target_id && !data.relation_id) {
    throw new Error('Falta target_id (o relation_id si estás borrando un vínculo por su id). Mirá los vínculos actuales con whatspro_tasks_links(action="list").');
  }

  /* ---------------- dependencias ---------------- */
  if (data.kind === 'dependency') {
    if (data.target_type && data.target_type !== 'task') {
      throw new Error('Con kind="dependency" el target_type tiene que ser "task": una dependencia siempre es entre dos tareas.');
    }
    const dependsOnId = data.target_id;
    if (!dependsOnId) throw new Error('Con kind="dependency" hace falta target_id: el id de la tarea que tiene que estar lista primero.');
    if (dependsOnId === data.task_id) throw new Error('Una tarea no puede depender de sí misma.');

    const other = await assertTask(context.teamId, dependsOnId);
    if (!other) throw new Error(`No existe la tarea ${dependsOnId} en este equipo. ${HOW_TO_FIND_TASK}`);

    if (data.action === 'unlink') {
      const removed = await db
        .delete(teamTaskDependencies)
        .where(and(
          eq(teamTaskDependencies.teamId, context.teamId),
          eq(teamTaskDependencies.taskId, data.task_id),
          eq(teamTaskDependencies.dependsOnTaskId, dependsOnId),
        ))
        .returning({ id: teamTaskDependencies.id });
      if (removed.length) await audit(context, 'GROK_TASK_DEPENDENCY_REMOVED', removed[0].id);
      return {
        action: 'unlink' as const,
        kind: 'dependency' as const,
        removed: removed.length,
        task: { id: task.id, title: task.title },
        depends_on: { id: other.id, title: other.title },
        note: removed.length
          ? `La tarea ${task.id} ya no depende de la ${other.id}.`
          : `No había ninguna dependencia de la tarea ${task.id} sobre la ${other.id}; no se borró nada.`,
      };
    }

    if (await dependencyWouldCycle(context.teamId, data.task_id, dependsOnId)) {
      throw new Error(
        `No se puede: la tarea ${dependsOnId} ya depende (directa o indirectamente) de la ${data.task_id}, así que este vínculo cerraría un ciclo y ninguna de las dos podría arrancar nunca. Revisá la cadena con whatspro_tasks_links(action="list", task_id=${dependsOnId}).`,
      );
    }

    const [created] = await db
      .insert(teamTaskDependencies)
      .values({ teamId: context.teamId, taskId: data.task_id, dependsOnTaskId: dependsOnId, createdBy: context.userId })
      .onConflictDoNothing()
      .returning();
    if (created) await audit(context, 'GROK_TASK_DEPENDENCY_CREATED', created.id);

    return {
      action: 'link' as const,
      kind: 'dependency' as const,
      already_linked: !created,
      dependency: created ? { id: created.id, task_id: data.task_id, depends_on_task_id: dependsOnId } : null,
      task: { id: task.id, title: task.title },
      depends_on: { id: other.id, title: other.title },
      next: `"${task.title}" no puede arrancar hasta que esté "${other.title}". Verificalo con whatspro_tasks_links(action="list", task_id=${task.id}).`,
    };
  }

  /* ---------------- relaciones ---------------- */
  if (data.action === 'unlink' && data.relation_id) {
    const relation = await db.query.teamTaskRelations.findFirst({
      where: and(eq(teamTaskRelations.id, data.relation_id), eq(teamTaskRelations.teamId, context.teamId)),
    });
    if (!relation) {
      throw new Error(`No existe el vínculo ${data.relation_id} en este equipo. Listá los vínculos reales con whatspro_tasks_links(action="list", task_id=${data.task_id}).`);
    }
    const touchesTask =
      (relation.sourceType === 'task' && relation.sourceId === data.task_id)
      || (relation.targetType === 'task' && relation.targetId === data.task_id);
    if (!touchesTask) {
      throw new Error(`El vínculo ${data.relation_id} no es de la tarea ${data.task_id} (va de ${relation.sourceType}:${relation.sourceId} a ${relation.targetType}:${relation.targetId}). No lo borro por las dudas.`);
    }
    await db.delete(teamTaskRelations).where(and(eq(teamTaskRelations.id, relation.id), eq(teamTaskRelations.teamId, context.teamId)));
    await audit(context, 'GROK_TASK_LINK_REMOVED', relation.id);
    return {
      action: 'unlink' as const,
      kind: 'relation' as const,
      removed: 1,
      relation: { id: relation.id, source: `${relation.sourceType}:${relation.sourceId}`, target: `${relation.targetType}:${relation.targetId}`, relation_type: relation.relationType },
      next: `Verificá cómo quedó con whatspro_tasks_links(action="list", task_id=${data.task_id}).`,
    };
  }

  if (!data.target_type) {
    throw new Error(
      `Falta target_type. Valores soportados con validación de equipo: ${LINK_TARGET_TYPES.join(', ')}. Los tipos ${UNVERIFIABLE_LINK_TARGETS.join(', ')} existen en el esquema pero no se pueden verificar acá: para esos usá whatspro_manage_task_relation.`,
    );
  }

  const targetType = data.target_type as LinkTargetType;
  const target = await describeLinkTarget(context.teamId, targetType, data.target_id!);
  if (!target) {
    throw new Error(`No existe ${targetType} ${data.target_id} en este equipo. ${linkTargetHint(targetType)}`);
  }
  if (targetType === 'task' && data.target_id === data.task_id) {
    throw new Error('Una tarea no se puede vincular a sí misma.');
  }

  // Dirección canónica: la tarea siempre es el origen. Es como lo guarda el
  // resto del producto (createContactTask, share_task) y como lo leen
  // listContactTasks y la ficha del cliente.
  const source = { type: 'task' as const, id: data.task_id };
  const targetRef = { type: targetType, id: data.target_id! };

  if (data.action === 'unlink') {
    // Borramos en las dos direcciones: hay filas viejas cargadas al revés.
    const removed = await db
      .delete(teamTaskRelations)
      .where(and(
        eq(teamTaskRelations.teamId, context.teamId),
        or(
          and(
            eq(teamTaskRelations.sourceType, source.type),
            eq(teamTaskRelations.sourceId, source.id),
            eq(teamTaskRelations.targetType, targetRef.type),
            eq(teamTaskRelations.targetId, targetRef.id),
          ),
          and(
            eq(teamTaskRelations.sourceType, targetRef.type),
            eq(teamTaskRelations.sourceId, targetRef.id),
            eq(teamTaskRelations.targetType, source.type),
            eq(teamTaskRelations.targetId, source.id),
          ),
        ),
      ))
      .returning({ id: teamTaskRelations.id });

    for (const row of removed) await audit(context, 'GROK_TASK_LINK_REMOVED', row.id);

    return {
      action: 'unlink' as const,
      kind: 'relation' as const,
      removed: removed.length,
      task: { id: task.id, title: task.title },
      target: { type: targetType, id: target.id, label: target.label },
      note: removed.length
        ? `Se borraron ${removed.length} vínculo(s) entre la tarea ${task.id} y ${targetType} ${target.id}.`
        : `No había ningún vínculo entre la tarea ${task.id} y ${targetType} ${target.id}; no se borró nada.`,
    };
  }

  const existing = await db.query.teamTaskRelations.findFirst({
    where: and(
      eq(teamTaskRelations.teamId, context.teamId),
      or(
        and(
          eq(teamTaskRelations.sourceType, source.type),
          eq(teamTaskRelations.sourceId, source.id),
          eq(teamTaskRelations.targetType, targetRef.type),
          eq(teamTaskRelations.targetId, targetRef.id),
        ),
        and(
          eq(teamTaskRelations.sourceType, targetRef.type),
          eq(teamTaskRelations.sourceId, targetRef.id),
          eq(teamTaskRelations.targetType, source.type),
          eq(teamTaskRelations.targetId, source.id),
        ),
      ),
    ),
    columns: { id: true, relationType: true, sourceType: true, sourceId: true, targetType: true, targetId: true },
  });

  if (existing) {
    return {
      action: 'link' as const,
      kind: 'relation' as const,
      already_linked: true,
      relation: { id: existing.id, relation_type: existing.relationType, source: `${existing.sourceType}:${existing.sourceId}`, target: `${existing.targetType}:${existing.targetId}` },
      task: { id: task.id, title: task.title },
      target: { type: targetType, id: target.id, label: target.label },
      note: 'Ya estaban vinculados: no se creó nada nuevo.',
    };
  }

  const relation = await insertRelation({
    teamId: context.teamId,
    userId: context.userId,
    sourceType: source.type,
    sourceId: source.id,
    targetType: targetRef.type,
    targetId: targetRef.id,
    relationType: data.relation_type,
    metadata: { source: 'mcp' },
  });
  if (!relation) throw new Error('No se pudo crear el vínculo. Volvé a intentarlo o revisá el estado con whatspro_tasks_links(action="list").');
  await audit(context, 'GROK_TASK_LINK_CREATED', relation.id);

  return {
    action: 'link' as const,
    kind: 'relation' as const,
    already_linked: false,
    relation: { id: relation.id, relation_type: relation.relationType, source: `task:${task.id}`, target: `${targetType}:${target.id}` },
    task: { id: task.id, title: task.title },
    target: { type: targetType, id: target.id, label: target.label },
    next: targetType === 'contact'
      ? `La tarea ya aparece en el lateral del chat del contacto. Podés ver todo lo que cuelga de él con whatspro_contact_graph(contact_id=${target.id}).`
      : `Verificá cómo quedó con whatspro_tasks_links(action="list", task_id=${task.id}).`,
  };
}

async function listTaskLinks(context: GrokActionContext, task: { id: number; title: string; status: string; assigneeId: number | null }) {
  const details = await listTaskDetails(context.teamId, task.id);

  const byType: Record<string, Array<{ relation_id: number; other_id: number; relation_type: string; direction: 'outgoing' | 'incoming'; created_at: Date }>> = {};
  for (const relation of details.relations) {
    const isSource = relation.sourceType === 'task' && relation.sourceId === task.id;
    const otherType = isSource ? relation.targetType : relation.sourceType;
    const otherId = isSource ? relation.targetId : relation.sourceId;
    (byType[otherType] ??= []).push({
      relation_id: relation.id,
      other_id: otherId,
      relation_type: relation.relationType,
      direction: isSource ? 'outgoing' : 'incoming',
      created_at: relation.createdAt,
    });
  }

  const idsOf = (type: string) => Array.from(new Set((byType[type] ?? []).map((row) => row.other_id)));

  const dependencyIds = Array.from(new Set([
    ...details.dependencies.map((row) => row.dependsOnTaskId),
    ...details.dependents.map((row) => row.taskId),
  ]));
  const taskIds = Array.from(new Set([...idsOf('task'), ...dependencyIds]));
  const projectIds = Array.from(new Set([...idsOf('project'), ...details.locations.map((row) => row.projectId)]));

  const [contactRows, customerRows, taskRows, projectRows, columnRows, documentRows] = await Promise.all([
    idsOf('contact').length
      ? db.select({ id: contacts.id, name: contacts.name, funnelStageId: contacts.funnelStageId })
          .from(contacts).where(and(eq(contacts.teamId, context.teamId), inArray(contacts.id, idsOf('contact'))))
      : Promise.resolve([]),
    idsOf('customer').length
      ? db.select({ id: teamCustomers.id, name: teamCustomers.name, status: teamCustomers.status })
          .from(teamCustomers).where(and(eq(teamCustomers.teamId, context.teamId), inArray(teamCustomers.id, idsOf('customer'))))
      : Promise.resolve([]),
    taskIds.length
      ? db.select({ id: teamTaskItems.id, title: teamTaskItems.title, status: teamTaskItems.status, dueDate: teamTaskItems.dueDate })
          .from(teamTaskItems).where(and(eq(teamTaskItems.teamId, context.teamId), inArray(teamTaskItems.id, taskIds)))
      : Promise.resolve([]),
    projectIds.length
      ? db.select({ id: teamTaskProjects.id, name: teamTaskProjects.name, workspaceId: teamTaskProjects.workspaceId })
          .from(teamTaskProjects).where(and(eq(teamTaskProjects.teamId, context.teamId), inArray(teamTaskProjects.id, projectIds)))
      : Promise.resolve([]),
    details.locations.length
      ? db.select({ id: teamTaskColumns.id, title: teamTaskColumns.title })
          .from(teamTaskColumns)
          .where(and(eq(teamTaskColumns.teamId, context.teamId), inArray(teamTaskColumns.id, details.locations.map((row) => row.columnId))))
      : Promise.resolve([]),
    idsOf('document').length
      ? db.select({ id: teamDocuments.id, title: teamDocuments.title })
          .from(teamDocuments).where(and(eq(teamDocuments.teamId, context.teamId), inArray(teamDocuments.id, idsOf('document'))))
      : Promise.resolve([]),
  ]);

  const contactName = new Map(contactRows.map((row) => [row.id, row.name]));
  const customerName = new Map(customerRows.map((row) => [row.id, row.name]));
  const taskInfo = new Map(taskRows.map((row) => [row.id, row]));
  const projectName = new Map(projectRows.map((row) => [row.id, row.name]));
  const columnName = new Map(columnRows.map((row) => [row.id, row.title]));
  const documentName = new Map(documentRows.map((row) => [row.id, row.title]));

  const members = await loadMemberNames(context.teamId);

  const contactsOut = cap((byType.contact ?? []).map((row) => ({
    relation_id: row.relation_id,
    contact_id: row.other_id,
    contact: contactName.get(row.other_id) ?? null,
    relation_type: row.relation_type,
    direction: row.direction,
    exists: contactName.has(row.other_id),
  })));
  const customersOut = cap((byType.customer ?? []).map((row) => ({
    relation_id: row.relation_id,
    customer_id: row.other_id,
    customer: customerName.get(row.other_id) ?? null,
    relation_type: row.relation_type,
    direction: row.direction,
    exists: customerName.has(row.other_id),
  })));
  const relatedTasksOut = cap((byType.task ?? []).map((row) => ({
    relation_id: row.relation_id,
    task_id: row.other_id,
    title: taskInfo.get(row.other_id)?.title ?? null,
    status: taskInfo.get(row.other_id)?.status ?? null,
    relation_type: row.relation_type,
    direction: row.direction,
  })));
  const projectsOut = cap((byType.project ?? []).map((row) => ({
    relation_id: row.relation_id,
    project_id: row.other_id,
    project: projectName.get(row.other_id) ?? null,
    relation_type: row.relation_type,
    direction: row.direction,
  })));
  const documentsOut = cap((byType.document ?? []).map((row) => ({
    relation_id: row.relation_id,
    document_id: row.other_id,
    document: documentName.get(row.other_id) ?? null,
    relation_type: row.relation_type,
    direction: row.direction,
    exists: documentName.has(row.other_id),
  })));

  const otherOut = cap(
    Object.entries(byType)
      .filter(([type]) => !LINK_TARGET_TYPES.includes(type as LinkTargetType))
      .flatMap(([type, rows]) => rows.map((row) => ({
        relation_id: row.relation_id,
        type,
        id: row.other_id,
        relation_type: row.relation_type,
        direction: row.direction,
      }))),
  );

  return {
    action: 'list' as const,
    task: {
      id: task.id,
      title: task.title,
      status: task.status,
      assignee_id: task.assigneeId ?? null,
      assignee: task.assigneeId ? (members.get(task.assigneeId) ?? null) : null,
    },
    contacts: contactsOut,
    customers: customersOut,
    related_tasks: relatedTasksOut,
    projects: projectsOut,
    documents: documentsOut,
    other_relations: otherOut,
    depends_on: details.dependencies.map((row) => ({
      dependency_id: row.id,
      task_id: row.dependsOnTaskId,
      title: taskInfo.get(row.dependsOnTaskId)?.title ?? null,
      status: taskInfo.get(row.dependsOnTaskId)?.status ?? null,
    })),
    blocks: details.dependents.map((row) => ({
      dependency_id: row.id,
      task_id: row.taskId,
      title: taskInfo.get(row.taskId)?.title ?? null,
      status: taskInfo.get(row.taskId)?.status ?? null,
    })),
    boards: details.locations.map((row) => ({
      project_id: row.projectId,
      project: projectName.get(row.projectId) ?? null,
      column_id: row.columnId,
      column: columnName.get(row.columnId) ?? null,
      is_primary: row.isPrimary,
    })),
    media_count: details.media.length,
    meta: {
      section_limit: LINKS_SECTION_LIMIT,
      total_relations: details.relations.length,
      note: 'Los vínculos vienen en las dos direcciones (direction="outgoing" = la tarea es el origen). exists=false significa que la otra punta ya no existe: es un vínculo colgado y conviene borrarlo con action="unlink" y relation_id.',
    },
  };
}

/* ------------------------------------------------------------------ */
/* whatspro_tasks_assign                                               */
/* ------------------------------------------------------------------ */

function personNotFoundError(query: string, members: TeamMemberRow[]) {
  const roster = members.map((member) => `${member.id}=${memberLabel(member)} <${member.email}>`).join('; ');
  return new Error(`No encontré a nadie que responda a "${query}" en este equipo. Miembros: ${roster || 'ninguno'}. Probá con whatspro_tasks_assign(action="list_people").`);
}

async function tasksAssign(input: Record<string, unknown>, context: GrokActionContext) {
  const data = parse(
    z.object({
      action: z.enum(['assign', 'unassign', 'resolve', 'list_people']).default('assign'),
      person: z.string().trim().min(1).max(200).optional(),
      user_id: z.number().int().positive().optional(),
      task_id: z.number().int().positive().optional(),
      task_ids: z.array(z.number().int().positive()).min(1).max(50).optional(),
    }),
    input,
  );

  const isWrite = data.action === 'assign' || data.action === 'unassign';
  await assertPermission(context, isWrite ? 'tasksWrite' : 'tasksRead', TASKS_PLUGIN);

  const members = await loadMembers(context.teamId);

  if (data.action === 'list_people') {
    const rows = await db
      .select({ assigneeId: teamTaskItems.assigneeId, status: teamTaskItems.status, cnt: count() })
      .from(teamTaskItems)
      .where(eq(teamTaskItems.teamId, context.teamId))
      .groupBy(teamTaskItems.assigneeId, teamTaskItems.status);

    const load = new Map<number, { open: number; done: number }>();
    let unassignedOpen = 0;
    for (const row of rows) {
      const n = Number(row.cnt);
      if (row.assigneeId == null) {
        if (row.status !== 'done') unassignedOpen += n;
        continue;
      }
      const current = load.get(row.assigneeId) ?? { open: 0, done: 0 };
      if (row.status === 'done') current.done += n;
      else current.open += n;
      load.set(row.assigneeId, current);
    }

    return {
      action: 'list_people' as const,
      people: members.map((member) => ({
        user_id: member.id,
        person: memberLabel(member),
        email: member.email,
        open_tasks: load.get(member.id)?.open ?? 0,
        done_tasks: load.get(member.id)?.done ?? 0,
      })),
      unassigned_open_tasks: unassignedOpen,
      note: 'open_tasks cuenta las tareas con estado open o in_progress asignadas a esa persona en todo el equipo, sin filtrar por proyecto.',
    };
  }

  let member: TeamMemberRow | null = null;
  let match: PersonMatch | null = null;

  if (data.user_id != null) {
    member = members.find((row) => row.id === data.user_id) ?? null;
    if (!member) {
      throw new Error(`El usuario ${data.user_id} no es miembro de este equipo. Listá el equipo con whatspro_tasks_assign(action="list_people").`);
    }
  } else if (data.person) {
    match = resolvePerson(members, data.person);
    if (match.status === 'not_found') throw personNotFoundError(data.person, members);
    if (match.status === 'ambiguous') {
      return {
        action: data.action,
        status: 'ambiguous' as const,
        applied: false,
        query: data.person,
        candidates: match.candidates,
        next: `"${data.person}" puede ser cualquiera de estas ${match.candidates.length} personas y no elijo por vos. Preguntale al usuario cuál es y volvé a llamar con user_id.`,
      };
    }
    member = match.member;
  } else if (data.action !== 'unassign') {
    throw new Error('Falta person (un nombre o correo) o user_id. Con action="resolve" podés averiguar a quién resuelve un nombre antes de escribir.');
  }

  if (data.action === 'resolve') {
    if (!member) throw new Error('Con action="resolve" hace falta person o user_id.');
    return {
      action: 'resolve' as const,
      status: 'ok' as const,
      query: data.person ?? String(data.user_id),
      match: { user_id: member.id, person: memberLabel(member), email: member.email, score: match?.status === 'ok' ? match.score : null },
      runners_up: match?.status === 'ok' ? match.runners_up : [],
      note: 'La coincidencia exacta (correo, nombre completo, primer nombre o parte local del correo) siempre le gana a un prefijo. Si hubiera empate real, la respuesta vendría con status="ambiguous" y sin elegir.',
      next: `Para asignarle una tarea: whatspro_tasks_assign(action="assign", user_id=${member.id}, task_id=…).`,
    };
  }

  const taskIds = data.task_ids ?? (data.task_id != null ? [data.task_id] : []);
  if (!taskIds.length) throw new Error('Falta task_id (o task_ids con hasta 50 tareas). Los ids salen de whatspro_tasks_board.');

  const assigneeId = data.action === 'assign' ? member!.id : null;
  const results: Array<{ task_id: number; ok: boolean; title?: string; previous_assignee_id?: number | null; error?: string }> = [];

  for (const taskId of taskIds) {
    const current = await assertTask(context.teamId, taskId);
    if (!current) {
      results.push({ task_id: taskId, ok: false, error: `No existe en este equipo. ${HOW_TO_FIND_TASK}` });
      continue;
    }
    const updated = await patchTaskItem({ teamId: context.teamId, taskId, patch: { assigneeId } });
    if ('error' in updated) {
      results.push({ task_id: taskId, ok: false, error: updated.error });
      continue;
    }
    await audit(context, assigneeId ? 'GROK_TASK_ASSIGNED' : 'GROK_TASK_UNASSIGNED', taskId);
    results.push({ task_id: taskId, ok: true, title: updated.item.title, previous_assignee_id: current.assigneeId ?? null });
  }

  const applied = results.filter((row) => row.ok).length;
  return {
    action: data.action,
    status: 'ok' as const,
    applied,
    failed: results.length - applied,
    assignee: member ? { user_id: member.id, person: memberLabel(member), email: member.email } : null,
    resolved_from: data.person ?? null,
    results,
    next: applied
      ? 'Verificá el tablero con whatspro_tasks_board (cada tarea trae assignee).'
      : 'No se pudo aplicar en ninguna tarea: mirá el error de cada una.',
  };
}

/* ------------------------------------------------------------------ */
/* whatspro_tasks_move                                                 */
/* ------------------------------------------------------------------ */

async function tasksMove(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'tasksWrite', TASKS_PLUGIN);
  const data = parse(
    z.object({
      action: z.enum(['task', 'project']),
      task_id: z.number().int().positive().optional(),
      task_ids: z.array(z.number().int().positive()).min(1).max(50).optional(),
      column_id: z.number().int().positive().optional(),
      project_id: z.number().int().positive().optional(),
      workspace_id: z.number().int().positive().optional(),
    }),
    input,
  );

  if (data.action === 'project') {
    if (!data.project_id || !data.workspace_id) {
      throw new Error('Con action="project" hacen falta project_id (el proyecto que movés) y workspace_id (el espacio de destino). Los ids salen de whatspro_tasks_board.');
    }
    const project = await assertProject(context.teamId, data.project_id);
    if (!project) throw new Error(`No existe el proyecto ${data.project_id} en este equipo. ${HOW_TO_FIND_TASK}`);
    const workspace = await assertWorkspace(context.teamId, data.workspace_id);
    if (!workspace) {
      const all = await db.select({ id: teamTaskWorkspaces.id, name: teamTaskWorkspaces.name })
        .from(teamTaskWorkspaces).where(eq(teamTaskWorkspaces.teamId, context.teamId));
      throw new Error(`No existe el espacio de trabajo ${data.workspace_id} en este equipo. Espacios disponibles: ${all.map((row) => `${row.id}=${row.name}`).join('; ') || 'ninguno'}.`);
    }
    if (project.workspaceId === workspace.id) {
      return {
        action: 'project' as const,
        moved: false,
        project: { id: project.id, name: project.name },
        workspace: { id: workspace.id, name: workspace.name },
        note: 'El proyecto ya estaba en ese espacio de trabajo: no se cambió nada.',
      };
    }

    const [updated] = await db
      .update(teamTaskProjects)
      .set({ workspaceId: workspace.id, updatedAt: new Date() })
      .where(and(eq(teamTaskProjects.id, project.id), eq(teamTaskProjects.teamId, context.teamId)))
      .returning({ id: teamTaskProjects.id, name: teamTaskProjects.name, workspaceId: teamTaskProjects.workspaceId });
    await audit(context, 'GROK_TASK_PROJECT_MOVED', updated.id);

    return {
      action: 'project' as const,
      moved: true,
      project: { id: updated.id, name: updated.name },
      from_workspace_id: project.workspaceId,
      workspace: { id: workspace.id, name: workspace.name },
      next: `Verificalo con whatspro_tasks_board(workspace_id=${workspace.id}).`,
    };
  }

  const taskIds = data.task_ids ?? (data.task_id != null ? [data.task_id] : []);
  if (!taskIds.length) throw new Error('Falta task_id (o task_ids con hasta 50 tareas). Los ids salen de whatspro_tasks_board.');
  if (!data.column_id && !data.project_id) {
    throw new Error('Falta el destino: mandá column_id (columna exacta) o project_id (y cae en la primera columna de ese tablero). Los ids salen de whatspro_tasks_board.');
  }

  let project = data.project_id ? await assertProject(context.teamId, data.project_id) : null;
  if (data.project_id && !project) {
    throw new Error(`No existe el proyecto ${data.project_id} en este equipo. ${HOW_TO_FIND_TASK}`);
  }

  let column: { id: number; title: string; projectId: number } | null = null;
  if (data.column_id) {
    const found = await db.query.teamTaskColumns.findFirst({
      where: and(eq(teamTaskColumns.id, data.column_id), eq(teamTaskColumns.teamId, context.teamId)),
      columns: { id: true, title: true, projectId: true },
    });
    if (!found) throw new Error(`No existe la columna ${data.column_id} en este equipo. Las columnas de cada tablero vienen en whatspro_tasks_board como column_id.`);
    if (project && found.projectId !== project.id) {
      throw new Error(`La columna ${found.id} ("${found.title}") no pertenece al proyecto ${project.id} ("${project.name}"): pertenece al proyecto ${found.projectId}. Mandá una sola de las dos cosas, o la columna correcta.`);
    }
    column = found;
    if (!project) project = await assertProject(context.teamId, found.projectId);
  } else {
    const first = await getProjectFirstColumn(context.teamId, project!.id);
    column = { id: first.id, title: first.title, projectId: first.projectId };
  }

  const results: Array<{ task_id: number; ok: boolean; title?: string; from_column_id?: number; error?: string }> = [];
  for (const taskId of taskIds) {
    const current = await assertTask(context.teamId, taskId);
    if (!current) {
      results.push({ task_id: taskId, ok: false, error: `No existe en este equipo. ${HOW_TO_FIND_TASK}` });
      continue;
    }
    const updated = await patchTaskItem({ teamId: context.teamId, taskId, patch: { columnId: column!.id, makePrimary: true } });
    if ('error' in updated) {
      results.push({ task_id: taskId, ok: false, error: updated.error });
      continue;
    }
    await audit(context, 'GROK_TASK_MOVED', taskId);
    results.push({ task_id: taskId, ok: true, title: updated.item.title, from_column_id: current.columnId });
  }

  const applied = results.filter((row) => row.ok).length;
  return {
    action: 'task' as const,
    applied,
    failed: results.length - applied,
    destination: {
      project_id: project!.id,
      project: project!.name,
      column_id: column!.id,
      column: column!.title,
      picked_first_column: !data.column_id,
    },
    results,
    next: `Verificá el tablero con whatspro_tasks_board(project_id=${project!.id}).`,
  };
}

/* ------------------------------------------------------------------ */
/* whatspro_crm_funnel_snapshot                                        */
/* ------------------------------------------------------------------ */

const DAY_MS = 24 * 60 * 60 * 1000;

function daysSince(date: Date | null | undefined, now: number) {
  if (!date) return null;
  return Math.max(0, Math.floor((now - new Date(date).getTime()) / DAY_MS));
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

async function funnelSnapshot(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'contacts');
  const data = parse(
    z.object({
      stage_group_id: z.number().int().positive().optional(),
      stale_after_days: z.number().int().min(1).max(3650).optional(),
      include_empty: z.boolean().optional(),
      include_stale_contacts: z.boolean().optional(),
      include_deals: z.boolean().optional(),
      sample_limit: z.number().int().min(1).max(25).optional(),
    }),
    input,
  );

  const staleAfter = data.stale_after_days ?? 30;
  // Un `Date` suelto dentro de un FILTER de SQL pasa el typecheck y revienta en
  // runtime: va como literal ISO con cast explícito.
  const staleCutoff = sql`${new Date(Date.now() - staleAfter * DAY_MS).toISOString()}::timestamp`;
  const sampleLimit = data.sample_limit ?? 5;
  const now = Date.now();

  const [stages, groups, groupMembers] = await Promise.all([
    db.select({ id: funnelStages.id, name: funnelStages.name, emoji: funnelStages.emoji, order: funnelStages.order, groupId: funnelStages.groupId })
      .from(funnelStages).where(eq(funnelStages.teamId, context.teamId)).orderBy(asc(funnelStages.order), asc(funnelStages.id)),
    db.select({ id: funnelStageGroups.id, name: funnelStageGroups.name, order: funnelStageGroups.order })
      .from(funnelStageGroups).where(eq(funnelStageGroups.teamId, context.teamId)).orderBy(asc(funnelStageGroups.order)),
    db.select({ groupId: funnelStageGroupMembers.groupId, stageId: funnelStageGroupMembers.stageId }).from(funnelStageGroupMembers),
  ]);

  if (data.stage_group_id && !groups.some((group) => group.id === data.stage_group_id)) {
    throw new Error(`No existe el grupo de etapas ${data.stage_group_id} en este equipo. Grupos: ${groups.map((group) => `${group.id}=${group.name}`).join('; ') || 'ninguno'}.`);
  }

  const stageIds = new Set(stages.map((stage) => stage.id));
  const extraGroups = new Map<number, number[]>();
  for (const row of groupMembers) {
    if (!stageIds.has(row.stageId)) continue;
    (extraGroups.get(row.stageId) ?? extraGroups.set(row.stageId, []).get(row.stageId)!).push(row.groupId);
  }

  const inGroup = (stageId: number, groupId: number | null) =>
    data.stage_group_id == null
    || groupId === data.stage_group_id
    || (extraGroups.get(stageId) ?? []).includes(data.stage_group_id);

  const selected = stages.filter((stage) => inGroup(stage.id, stage.groupId));
  const selectedIds = new Set(selected.map((stage) => stage.id));

  const rows = await db
    .select({ id: contacts.id, name: contacts.name, stageId: contacts.funnelStageId, updatedAt: contacts.updatedAt, assignedUserId: contacts.assignedUserId })
    .from(contacts)
    .where(eq(contacts.teamId, context.teamId));

  const members = await loadMemberNames(context.teamId);
  const groupName = new Map(groups.map((group) => [group.id, group.name]));

  const buckets = new Map<number, Array<{ id: number; name: string; days: number | null; assignedUserId: number | null }>>();
  let withoutStage = 0;
  for (const row of rows) {
    if (row.stageId == null) {
      withoutStage++;
      continue;
    }
    if (!selectedIds.has(row.stageId)) continue;
    const bucket = buckets.get(row.stageId) ?? [];
    bucket.push({ id: row.id, name: row.name, days: daysSince(row.updatedAt, now), assignedUserId: row.assignedUserId });
    buckets.set(row.stageId, bucket);
  }

  let totalContacts = 0;
  let totalStale = 0;

  const stagesOut = selected
    .map((stage) => {
      const bucket = buckets.get(stage.id) ?? [];
      const days = bucket.map((row) => row.days).filter((value): value is number => value != null);
      const stale = bucket.filter((row) => (row.days ?? 0) >= staleAfter);
      totalContacts += bucket.length;
      totalStale += stale.length;

      const sample = data.include_stale_contacts
        ? [...stale].sort((a, b) => (b.days ?? 0) - (a.days ?? 0)).slice(0, sampleLimit)
        : [];

      return {
        stage_id: stage.id,
        stage: stage.name,
        emoji: stage.emoji,
        order: stage.order,
        group_id: stage.groupId,
        group: stage.groupId != null ? (groupName.get(stage.groupId) ?? null) : null,
        also_in_group_ids: (extraGroups.get(stage.id) ?? []).filter((groupId) => groupId !== stage.groupId),
        contacts: bucket.length,
        stale_contacts: stale.length,
        stale_share: bucket.length ? Math.round((stale.length / bucket.length) * 100) : 0,
        median_days: median(days),
        max_days: days.length ? Math.max(...days) : null,
        ...(data.include_stale_contacts
          ? {
              stale_sample: sample.map((row) => ({
                contact_id: row.id,
                contact: row.name,
                days: row.days,
                assigned_user_id: row.assignedUserId,
                assigned_to: row.assignedUserId ? (members.get(row.assignedUserId) ?? null) : null,
              })),
              stale_sample_omitted: Math.max(0, stale.length - sample.length),
            }
          : {}),
      };
    })
    .filter((stage) => (data.include_empty ? true : stage.contacts > 0));

  const worst = [...stagesOut].sort((a, b) => b.stale_contacts - a.stale_contacts)[0] ?? null;

  // El embudo de contactos y el de oportunidades son dos cosas distintas y el
  // equipo mira las dos juntas: acá van al lado, nunca sumadas. Si el plugin
  // está apagado o falta el permiso, la sección viene vacía con el motivo — un
  // snapshot del CRM no puede fallar porque el equipo no use Oportunidades.
  let dealsByStage: Array<Record<string, unknown>> = [];
  let dealsSkipped: string | null = null;
  if (data.include_deals !== false) {
    try {
      await assertPermission(context, 'dealsRead', 'deals');
      const dealRows = await db
        .select({
          stage: teamDeals.stage,
          currency: teamDeals.currency,
          total: sql<number>`COALESCE(SUM(${teamDeals.value}), 0)`,
          deals: sql<number>`COUNT(*)`,
          stalled: sql<number>`COUNT(*) FILTER (WHERE ${teamDeals.updatedAt} <= ${staleCutoff})`,
        })
        .from(teamDeals)
        .where(and(
          eq(teamDeals.teamId, context.teamId),
          notInArray(teamDeals.stage, ['closed_won', 'closed_lost']),
        ))
        // Por etapa Y por moneda: dos montos en monedas distintas no se suman.
        .groupBy(teamDeals.stage, teamDeals.currency);
      dealsByStage = dealRows.map((row) => ({
        stage: row.stage,
        currency: row.currency,
        deals: Number(row.deals ?? 0),
        stalled_deals: Number(row.stalled ?? 0),
        total_value: Number(row.total ?? 0),
      }));
    } catch (error) {
      dealsSkipped = error instanceof Error ? error.message : String(error);
    }
  }

  return {
    scope: data.stage_group_id
      ? { type: 'stage_group', stage_group_id: data.stage_group_id, stage_group: groupName.get(data.stage_group_id) ?? null }
      : { type: 'team' },
    stale_after_days: staleAfter,
    stages: stagesOut,
    deals_by_stage: dealsByStage,
    deals_skipped: dealsSkipped,
    totals: {
      contacts_in_scope: totalContacts,
      stale_contacts: totalStale,
      contacts_without_stage: withoutStage,
      stages_returned: stagesOut.length,
      stages_hidden_empty: data.include_empty ? 0 : selected.length - stagesOut.length,
    },
    headline: worst && worst.stale_contacts > 0
      ? `Donde más se traba: ${worst.stale_contacts} contactos llevan ${staleAfter}+ días sin movimiento en "${worst.stage}".`
      : 'Ninguna etapa tiene contactos estancados con el umbral pedido.',
    meta: {
      caveat: 'El esquema no guarda cuándo un contacto entró a la etapa. Los días se calculan desde contacts.updated_at, igual que el reloj de las tarjetas del CRM: cualquier edición del contacto lo reinicia. Leelo como "días sin que nadie lo toque".',
      next: 'Con include_stale_contacts=true traés los ids de los contactos más estancados; después usá whatspro_contact_graph para ver qué tiene cada uno y whatspro_change_crm_stage para moverlo.',
    },
  };
}

/* ------------------------------------------------------------------ */
/* whatspro_contact_graph                                              */
/* ------------------------------------------------------------------ */

type ContactRow = typeof contacts.$inferSelect;

const GRAPH_SECTIONS = ['customer', 'tasks', 'relations', 'subscriptions', 'radar', 'tags', 'notes', 'chat', 'commercial'] as const;
type GraphSection = (typeof GRAPH_SECTIONS)[number];

async function contactGraph(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'contacts');
  const data = parse(
    z.object({
      contact_id: z.number().int().positive().optional(),
      chat_id: z.number().int().positive().optional(),
      customer_id: z.number().int().positive().optional(),
      include: z.array(z.enum(GRAPH_SECTIONS)).max(9).optional(),
      limit: z.number().int().min(1).max(100).optional(),
    }).refine(
      (value) => value.contact_id != null || value.chat_id != null || value.customer_id != null,
      'Mandá contact_id, chat_id o customer_id.',
    ),
    input,
  );

  const limit = data.limit ?? 25;
  const want = (section: GraphSection) => !data.include || data.include.includes(section);
  const skipped: Array<{ section: GraphSection; reason: string }> = [];
  const now = Date.now();

  /* --- entrada: contacto o cliente --- */
  let contact: ContactRow | null = null;
  let customerId: number | null = data.customer_id ?? null;

  if (data.contact_id != null || data.chat_id != null) {
    const found = await db.query.contacts.findFirst({
      where: and(
        eq(contacts.teamId, context.teamId),
        data.contact_id != null ? eq(contacts.id, data.contact_id) : eq(contacts.chatId, data.chat_id!),
      ),
    });
    if (!found) {
      throw new Error(
        data.contact_id != null
          ? `No existe el contacto ${data.contact_id} en este equipo. ${HOW_TO_FIND_CONTACT}`
          : `El chat ${data.chat_id} no tiene un contacto guardado en este equipo. Guardalo primero con whatspro_save_contact.`,
      );
    }
    contact = found;
  }

  if (customerId != null) {
    const customer = await db.query.teamCustomers.findFirst({
      where: and(eq(teamCustomers.id, customerId), eq(teamCustomers.teamId, context.teamId)),
      columns: { id: true },
    });
    if (!customer) throw new Error(`No existe el cliente ${customerId} en este equipo. ${HOW_TO_FIND_CUSTOMER}`);
  }

  const members = await loadMemberNames(context.teamId);

  /* --- cliente vinculado --- */
  let customerOut: Record<string, unknown> | null = null;
  let siblingContacts: Array<{ contact_id: number; contact: string }> = [];
  if (want('customer')) {
    if (!(await canDo(context, 'customersRead', 'customers'))) {
      skipped.push({ section: 'customer', reason: 'Falta el permiso customersRead o el plugin customers no está activo en este equipo.' });
    } else {
      if (customerId == null && contact) {
        const link = await db.query.teamCustomerContacts.findFirst({
          where: and(eq(teamCustomerContacts.teamId, context.teamId), eq(teamCustomerContacts.contactId, contact.id)),
          columns: { customerId: true },
        });
        customerId = link?.customerId ?? null;
      }
      if (customerId != null) {
        const customer = await db.query.teamCustomers.findFirst({
          where: and(eq(teamCustomers.id, customerId), eq(teamCustomers.teamId, context.teamId)),
        });
        if (customer) {
          customerOut = {
            customer_id: customer.id,
            name: customer.name,
            email: customer.email,
            phone: customer.phone,
            status: customer.status,
            source: customer.source,
            notes: customer.notes ? customer.notes.slice(0, 1000) : '',
          };
          const links = await db
            .select({ contactId: teamCustomerContacts.contactId, name: contacts.name })
            .from(teamCustomerContacts)
            .innerJoin(contacts, eq(contacts.id, teamCustomerContacts.contactId))
            .where(and(eq(teamCustomerContacts.teamId, context.teamId), eq(teamCustomerContacts.customerId, customer.id)));
          // Si entraron por customer_id todavía no hay contacto: tomamos el
          // primero como ancla para poder traer chat, etapa, notas e informes.
          if (!contact && links.length) {
            const primary = await db.query.contacts.findFirst({
              where: and(eq(contacts.teamId, context.teamId), eq(contacts.id, links[0].contactId)),
            });
            contact = primary ?? null;
          }
          siblingContacts = links
            .filter((row) => row.contactId !== contact?.id)
            .map((row) => ({ contact_id: row.contactId, contact: row.name }));
        }
      }
    }
  }

  /* --- etapa del embudo --- */
  let stage: { stage_id: number; stage: string; emoji: string | null; group_id: number | null; days_in_stage: number | null } | null = null;
  if (contact?.funnelStageId) {
    const row = await db.query.funnelStages.findFirst({
      where: and(eq(funnelStages.id, contact.funnelStageId), eq(funnelStages.teamId, context.teamId)),
      columns: { id: true, name: true, emoji: true, groupId: true },
    });
    if (row) {
      stage = { stage_id: row.id, stage: row.name, emoji: row.emoji, group_id: row.groupId, days_in_stage: daysSince(contact.updatedAt, now) };
    }
  }

  /* --- relaciones del grafo de Tareas --- */
  const relationFilters = [] as Array<ReturnType<typeof and>>;
  if (contact) {
    relationFilters.push(and(eq(teamTaskRelations.sourceType, 'contact'), eq(teamTaskRelations.sourceId, contact.id)));
    relationFilters.push(and(eq(teamTaskRelations.targetType, 'contact'), eq(teamTaskRelations.targetId, contact.id)));
  }
  if (customerId != null) {
    relationFilters.push(and(eq(teamTaskRelations.sourceType, 'customer'), eq(teamTaskRelations.sourceId, customerId)));
    relationFilters.push(and(eq(teamTaskRelations.targetType, 'customer'), eq(teamTaskRelations.targetId, customerId)));
  }

  const relations = relationFilters.length
    ? await db.query.teamTaskRelations.findMany({
        where: and(eq(teamTaskRelations.teamId, context.teamId), or(...relationFilters)),
        orderBy: (table, { desc: orderDesc }) => [orderDesc(table.createdAt)],
      })
    : [];

  /* --- tareas --- */
  let tasksOut: { items: unknown[]; omitted: number; total: number } | null = null;
  if (want('tasks')) {
    if (!(await canDo(context, 'tasksRead', TASKS_PLUGIN))) {
      skipped.push({ section: 'tasks', reason: 'Falta el permiso tasksRead o el plugin tasks no está activo en este equipo.' });
    } else {
      const taskIds = Array.from(new Set(
        relations
          .filter((row) => row.sourceType === 'task' || row.targetType === 'task')
          .map((row) => (row.sourceType === 'task' ? row.sourceId : row.targetId)),
      ));
      const rows = taskIds.length
        ? await db
            .select({
              id: teamTaskItems.id,
              title: teamTaskItems.title,
              status: teamTaskItems.status,
              dueDate: teamTaskItems.dueDate,
              assigneeId: teamTaskItems.assigneeId,
              projectId: teamTaskItems.projectId,
              projectName: teamTaskProjects.name,
              columnId: teamTaskItems.columnId,
              columnName: teamTaskColumns.title,
            })
            .from(teamTaskItems)
            .innerJoin(teamTaskProjects, eq(teamTaskProjects.id, teamTaskItems.projectId))
            .innerJoin(teamTaskColumns, eq(teamTaskColumns.id, teamTaskItems.columnId))
            .where(and(eq(teamTaskItems.teamId, context.teamId), inArray(teamTaskItems.id, taskIds)))
            .orderBy(asc(teamTaskItems.status), asc(teamTaskItems.dueDate), asc(teamTaskItems.id))
        : [];
      const capped = cap(rows, limit);
      tasksOut = {
        total: capped.total,
        omitted: capped.omitted,
        items: capped.items.map((row) => ({
          task_id: row.id,
          title: row.title,
          status: row.status,
          due_date: row.dueDate,
          assignee_id: row.assigneeId ?? null,
          assignee: row.assigneeId ? (members.get(row.assigneeId) ?? null) : null,
          project_id: row.projectId,
          project: row.projectName,
          column_id: row.columnId,
          column: row.columnName,
        })),
      };
    }
  }

  /* --- suscripciones --- */
  let subscriptionsOut: { items: unknown[]; omitted: number; total: number } | null = null;
  if (want('subscriptions')) {
    if (!(await canDo(context, 'membershipsRead', 'memberships'))) {
      skipped.push({ section: 'subscriptions', reason: 'Falta el permiso membershipsRead o el plugin memberships no está activo en este equipo.' });
    } else {
      const filters = [] as Array<ReturnType<typeof eq>>;
      if (contact) filters.push(eq(teamMembershipSubscriptions.contactId, contact.id));
      if (customerId != null) filters.push(eq(teamMembershipSubscriptions.customerId, customerId));
      const rows = filters.length
        ? await db
            .select({
              id: teamMembershipSubscriptions.id,
              number: teamMembershipSubscriptions.subscriptionNumber,
              plan: teamMembershipSubscriptions.planNameSnapshot,
              planId: teamMembershipSubscriptions.planId,
              companyId: teamMembershipSubscriptions.companyId,
              company: teamMembershipCompanies.name,
              price: teamMembershipSubscriptions.price,
              currency: teamMembershipSubscriptions.currency,
              billingType: teamMembershipSubscriptions.billingType,
              status: teamMembershipSubscriptions.status,
              paymentStatus: teamMembershipSubscriptions.paymentStatus,
              startDate: teamMembershipSubscriptions.startDate,
              endDate: teamMembershipSubscriptions.endDate,
            })
            .from(teamMembershipSubscriptions)
            .leftJoin(teamMembershipCompanies, eq(teamMembershipCompanies.id, teamMembershipSubscriptions.companyId))
            .where(and(eq(teamMembershipSubscriptions.teamId, context.teamId), or(...filters)))
            .orderBy(desc(teamMembershipSubscriptions.startDate))
        : [];
      const capped = cap(rows, limit);
      subscriptionsOut = {
        total: capped.total,
        omitted: capped.omitted,
        items: capped.items.map((row) => ({
          subscription_id: row.id,
          number: row.number,
          plan: row.plan,
          plan_id: row.planId,
          company_id: row.companyId,
          company: row.company,
          price_cents: row.price,
          currency: row.currency,
          billing_type: row.billingType,
          status: row.status,
          payment_status: row.paymentStatus,
          start_date: row.startDate,
          end_date: row.endDate,
          days_to_expiry: row.endDate ? Math.round((new Date(`${row.endDate}T00:00:00Z`).getTime() - now) / DAY_MS) : null,
        })),
      };
    }
  }

  /* --- informes de Radar --- */
  let radarOut: { items: unknown[]; omitted: number; total: number } | null = null;
  if (want('radar')) {
    if (!contact) {
      skipped.push({ section: 'radar', reason: 'Los informes de Radar se vinculan por contacto y esta consulta arrancó por un cliente sin contactos.' });
    } else if (!(await canDo(context, 'intelligenceRead', 'radar'))) {
      skipped.push({ section: 'radar', reason: 'Falta el permiso intelligenceRead o el plugin radar no está activo en este equipo.' });
    } else {
      const rows = await db
        .select({
          id: teamRadarReports.id,
          documentId: teamRadarReports.documentId,
          category: teamRadarReports.category,
          summary: teamRadarReports.summary,
          assignedUserId: teamRadarReports.assignedUserId,
          updatedAt: teamRadarReports.updatedAt,
          title: teamDocuments.title,
          slug: teamDocuments.slug,
        })
        .from(teamRadarReports)
        .innerJoin(teamDocuments, eq(teamDocuments.id, teamRadarReports.documentId))
        .where(and(eq(teamRadarReports.teamId, context.teamId), eq(teamRadarReports.contactId, contact.id)))
        .orderBy(desc(teamRadarReports.updatedAt));
      const capped = cap(rows, limit);
      radarOut = {
        total: capped.total,
        omitted: capped.omitted,
        items: capped.items.map((row) => ({
          report_id: row.id,
          document_id: row.documentId,
          title: row.title,
          slug: row.slug,
          category: row.category,
          summary: row.summary ? row.summary.slice(0, 400) : null,
          assigned_user_id: row.assignedUserId,
          updated_at: row.updatedAt,
        })),
      };
    }
  }

  /* --- etiquetas y campos personalizados --- */
  let tagsOut: Array<{ tag_id: number; tag: string }> | null = null;
  if (want('tags') && contact) {
    const rows = await db
      .select({ id: tags.id, name: tags.name })
      .from(contactTags)
      .innerJoin(tags, eq(tags.id, contactTags.tagId))
      .where(and(eq(contactTags.contactId, contact.id), eq(tags.teamId, context.teamId)));
    tagsOut = rows.map((row) => ({ tag_id: row.id, tag: row.name }));
  }

  /* --- chat --- */
  let chatOut: Record<string, unknown> | null = null;
  if (want('chat') && contact) {
    const chat = await db.query.chats.findFirst({
      where: and(eq(chats.id, contact.chatId), eq(chats.teamId, context.teamId)),
      columns: { id: true, remoteJid: true, name: true, pushName: true, lastMessageText: true, lastMessageTimestamp: true, lastMessageFromMe: true, unreadCount: true, instanceId: true },
    });
    if (chat) {
      chatOut = {
        chat_id: chat.id,
        phone: chat.remoteJid.split('@')[0],
        remote_jid: chat.remoteJid,
        instance_id: chat.instanceId,
        last_message_text: chat.lastMessageText ? chat.lastMessageText.slice(0, 300) : null,
        last_message_at: chat.lastMessageTimestamp,
        last_message_from: chat.lastMessageFromMe ? 'us' : 'them',
        days_silent: daysSince(chat.lastMessageTimestamp, now),
        unread_count: chat.unreadCount,
      };
    }
  }

  /* --- notas ---
     Tres orígenes distintos, porque las notas privadas de un cliente viven en
     tres tablas y antes acá sólo salía la primera: la nota del CRM es un texto
     único del contacto, las notas internas son mensajes del chat que nunca se
     envían, y la bitácora es del cliente (la única que existe para los clientes
     importados sin WhatsApp). El detalle completo, paginado y con búsqueda está
     en whatspro_private_notes. */
  let notesOut: Record<string, unknown> | null = null;
  if (want('notes')) {
    const raw = contact?.notes ?? '';
    const internas = contact
      ? await db
          .select({ id: messages.id, text: messages.text, timestamp: messages.timestamp, isAi: messages.isAi })
          .from(messages)
          .where(and(eq(messages.chatId, contact.chatId), eq(messages.isInternal, true)))
          .orderBy(desc(messages.timestamp))
          .limit(limit)
      : [];
    const [{ total: internasTotal } = { total: 0 }] = contact
      ? await db
          .select({ total: count() })
          .from(messages)
          .where(and(eq(messages.chatId, contact.chatId), eq(messages.isInternal, true)))
      : [{ total: 0 }];

    let bitacora: Array<Record<string, unknown>> = [];
    let bitacoraTotal = 0;
    if (customerId != null && (await canDo(context, 'customersRead', 'customers'))) {
      const filas = await db
        .select({
          id: teamCustomerNotes.id,
          text: teamCustomerNotes.text,
          kind: teamCustomerNotes.kind,
          source: teamCustomerNotes.source,
          createdAt: teamCustomerNotes.createdAt,
        })
        .from(teamCustomerNotes)
        .where(and(eq(teamCustomerNotes.teamId, context.teamId), eq(teamCustomerNotes.customerId, customerId)))
        .orderBy(desc(teamCustomerNotes.createdAt))
        .limit(limit);
      bitacoraTotal = filas.length;
      bitacora = filas.map((fila) => ({
        note_id: fila.id,
        text: fila.text,
        kind: fila.kind,
        author: fila.source === 'connector' ? 'IA' : 'equipo',
        created_at: fila.createdAt,
      }));
    }

    notesOut = {
      crm: {
        chars: raw.length,
        truncated: raw.length > 4000,
        text: raw.slice(0, 4000),
        source: 'contacts.notes — texto único del contacto. Se escribe con whatspro_add_contact_note.',
      },
      internal: {
        total: internasTotal,
        omitted: Math.max(0, internasTotal - internas.length),
        items: internas.map((nota) => ({
          message_id: nota.id,
          text: nota.text ?? '',
          author: nota.isAi ? 'IA' : 'equipo',
          created_at: nota.timestamp,
        })),
        source: 'messages.isInternal — notas internas del chat. Se escriben con whatspro_add_internal_note.',
      },
      customer_log: {
        total: bitacoraTotal,
        omitted: 0,
        items: bitacora,
        source: 'team_customer_notes — bitácora del cliente. Se escribe con whatspro_customer_notes(action="add").',
      },
      note: 'Para buscar dentro de las notas o traer más de section_limit por origen usá whatspro_private_notes.',
    };
  }

  /* --- relaciones sueltas (notas de equipo, eventos, proyectos) --- */
  let relationsOut: { items: unknown[]; omitted: number; total: number } | null = null;
  if (want('relations')) {
    const rows = relations.map((row) => {
      const anchorIsSource =
        (contact && row.sourceType === 'contact' && row.sourceId === contact.id)
        || (customerId != null && row.sourceType === 'customer' && row.sourceId === customerId);
      return {
        relation_id: row.id,
        other_type: anchorIsSource ? row.targetType : row.sourceType,
        other_id: anchorIsSource ? row.targetId : row.sourceId,
        relation_type: row.relationType,
        anchor: anchorIsSource ? `${row.sourceType}:${row.sourceId}` : `${row.targetType}:${row.targetId}`,
        created_at: row.createdAt,
      };
    });
    const capped = cap(rows, limit);
    relationsOut = { total: capped.total, omitted: capped.omitted, items: capped.items };
  }

  /* --- comercial: oportunidad, plata y próxima cita ---
     Sale de `lib/contacts/graph.ts`, el MISMO módulo que alimenta el panel
     lateral del chat. Es a propósito: si la IA y la pantalla del agente sacaran
     estos números de dos consultas distintas, tarde o temprano dirían cosas
     distintas sobre cuánto debe un cliente. */
  let commercialOut: Record<string, unknown> | null = null;
  if (want('commercial') && contact) {
    const puedeDeals = await canDo(context, 'dealsRead', 'deals');
    const puedeVentas = await canDo(context, 'salesRead', 'sales');
    const puedeAgenda = await canDo(context, 'calendarRead', 'calendar');
    if (!puedeDeals && !puedeVentas && !puedeAgenda) {
      skipped.push({ section: 'commercial', reason: 'Faltan los permisos dealsRead, salesRead y calendarRead (o sus apps no están activas).' });
    } else {
      const snapshot = await getContactCommercialSnapshot(
        context.teamId,
        { contactId: contact.id },
        {
          deals: puedeDeals,
          money: puedeVentas,
          agenda: puedeAgenda,
          skippedReasons: {
            deals: 'Falta el permiso dealsRead o la app deals no está activa.',
            money: 'Falta el permiso salesRead o la app sales no está activa.',
            agenda: 'Falta el permiso calendarRead o la app calendar no está activa.',
          },
        },
      );
      if (snapshot) {
        commercialOut = {
          open_deals: snapshot.deals?.open ?? null,
          open_deals_by_currency: snapshot.deals?.openByCurrency ?? null,
          last_closed_deal: snapshot.deals?.lastClosed ?? null,
          pending_by_currency: snapshot.money?.pendingByCurrency ?? null,
          paid_by_currency: snapshot.money?.paidByCurrency ?? null,
          pending_sales: snapshot.money?.sales ?? null,
          overdue_count: snapshot.money?.overdueCount ?? null,
          next_due_date: snapshot.money?.nextDueDate ?? null,
          next_event: snapshot.agenda?.next ?? null,
          last_event: snapshot.agenda?.last ?? null,
          sibling_contacts: snapshot.scope.siblings,
          note: 'Los importes van en la unidad menor de cada moneda (centavos) y NUNCA se suman entre monedas distintas.',
          section_skipped: snapshot.skipped,
        };
      }
    }
  }

  return {
    entry: data.contact_id != null ? 'contact_id' : data.chat_id != null ? 'chat_id' : 'customer_id',
    contact: contact
      ? {
          contact_id: contact.id,
          name: contact.name,
          chat_id: contact.chatId,
          assigned_user_id: contact.assignedUserId ?? null,
          assigned_to: contact.assignedUserId ? (members.get(contact.assignedUserId) ?? null) : null,
          assigned_department_id: contact.assignedDepartmentId ?? null,
          created_at: contact.createdAt,
          updated_at: contact.updatedAt,
          custom_fields: contact.customData ?? {},
        }
      : null,
    funnel_stage: stage,
    customer: customerOut,
    customer_sibling_contacts: siblingContacts,
    tags: tagsOut,
    chat: chatOut,
    tasks: tasksOut,
    subscriptions: subscriptionsOut,
    radar_reports: radarOut,
    relations: relationsOut,
    notes: notesOut,
    commercial: commercialOut,
    skipped,
    meta: {
      section_limit: limit,
      note: 'Cada sección informa total y omitted: nada se trunca en silencio. Las secciones en skipped se saltearon por permisos o porque no aplican a la puerta de entrada usada.',
      next: contact
        ? `Para ver el grafo de una de sus tareas: whatspro_tasks_links(task_id=…). Para vincularle una tarea nueva: whatspro_tasks_links(action="link", task_id=…, target_type="contact", target_id=${contact.id}).`
        : 'Arrancá por un contacto (contact_id o chat_id) para traer chat, etapa, notas e informes de Radar.',
    },
  };
}

/* ------------------------------------------------------------------ */
/* Dispatcher                                                          */
/* ------------------------------------------------------------------ */

async function taskAiWorklist(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'tasksRead', TASKS_PLUGIN);
  const data = parse(taskAiWorklistSchema, input);
  const [items, conversation] = await Promise.all([
    loadTaskAiWorklist(context.teamId, {
      includeCompleted: data.include_completed,
      limit: data.limit,
    }),
    listOperationsAiMessages(context.teamId, 30),
  ]);
  return {
    strategy: {
      viable: true,
      order: ['needs-context', 'prepare', 'reload', 'execute', 'report'],
      rule: 'Leer no ejecuta. Cada escritura usa su herramienta normal y cada intento termina con whatspro_tasks_ai_report.',
      prepare: 'Convierte prompts amplios de proyecto/tarea en ai_prompt o ai_next_step concretos y guardados.',
      execute: 'Ejecuta ai_next_step con herramientas autorizadas. Si no existe una herramienta segura, reporta blocked; no simula el resultado.',
    },
    total: items.length,
    counts: {
      needs_context: items.filter((item) => item.state === 'needs-context').length,
      prepare: items.filter((item) => item.state === 'ready' && item.phase === 'prepare').length,
      execute: items.filter((item) => item.state === 'ready' && item.phase === 'execute').length,
      completed: items.filter((item) => item.state === 'completed').length,
    },
    conversation: conversation.map((message) => ({
      message_id: message.id,
      role: message.role,
      content: message.content,
      source: message.source,
      surface: message.surface,
      created_at: message.createdAt,
      // pending=true es una instrucción del usuario que todavía nadie contestó:
      // es lo que hay que responder con whatspro_operations_ai_reply al final.
      pending: message.role === 'user'
        && (message.metadata as { status?: string } | null)?.status === 'pending',
    })),
    items: items.map((item) => ({
      target_type: item.targetType,
      target_id: item.targetId,
      name: item.name,
      workspace_id: item.workspaceId,
      workspace: item.workspace,
      project_id: item.projectId,
      project: item.project,
      phase: item.phase,
      state: item.state,
      prompt: item.prompt,
      inherited_prompt: item.inheritedPrompt,
      ai_next_step: item.nextStep,
      ai_context_question: item.contextQuestion,
      ai_context_answer: item.contextAnswer,
      fingerprint: item.fingerprint,
      last_result: item.lastResult ?? null,
    })),
  };
}

async function operationsAiReply(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'tasksWrite', TASKS_PLUGIN);
  const data = parse(operationsAiReplySchema, input);
  const message = await saveOperationsConnectorReply({
    teamId: context.teamId,
    userId: context.userId,
    content: data.content,
    connector: data.connector,
    replyToMessageId: data.reply_to_message_id,
  });
  await audit(context, 'OPERATIONS_AI_CONNECTOR_REPLY', message.id);
  return { success: true, message_id: message.id, visible_in_operations_chat: true };
}

async function taskAiReport(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'tasksWrite', TASKS_PLUGIN);
  const data = parse(taskAiReportSchema, input);
  const result = await reportTaskAiRun({
    teamId: context.teamId,
    userId: context.userId,
    targetType: data.target_type,
    targetId: data.target_id,
    phase: data.phase,
    status: data.status,
    fingerprint: data.fingerprint,
    summary: data.summary,
    connector: data.connector,
    preparedNextStep: data.prepared_next_step,
    relatedTaskId: data.related_task_id,
    updatedNotes: data.updated_notes,
    checklist: data.checklist,
    adjustedAiPrompt: data.adjusted_ai_prompt,
  });
  await audit(context, 'TASK_AI_PHASE_REPORTED', result.run.id);
  return {
    success: true,
    run_id: result.run.id,
    target_type: result.run.targetType,
    target_id: result.run.targetId,
    phase: result.run.phase,
    status: result.run.status,
    summary: result.run.summary,
    visible_in_operations_chat: true,
  };
}

const manageDependencySchema = z.object({
  action: z.enum(['create', 'delete']),
  task_id: z.number().int().positive(),
  depends_on_task_id: z.number().int().positive(),
});

/**
 * ¿Se puede llegar de `from` a `to` siguiendo dependencias ya guardadas?
 * Si depends_on ya llega (directa o transitivamente) hasta task, agregar
 * task→depends_on cierra un ciclo. BFS sobre las filas del equipo: el volumen
 * de dependencias por equipo es chico y esto corre una sola query.
 */
async function dependencyPathExists(teamId: number, from: number, to: number) {
  const edges = await db.select({
    taskId: teamTaskDependencies.taskId,
    dependsOnTaskId: teamTaskDependencies.dependsOnTaskId,
  }).from(teamTaskDependencies).where(eq(teamTaskDependencies.teamId, teamId));

  const graph = new Map<number, number[]>();
  for (const edge of edges) {
    const list = graph.get(edge.taskId) ?? [];
    list.push(edge.dependsOnTaskId);
    graph.set(edge.taskId, list);
  }

  const queue = [from];
  const seen = new Set<number>([from]);
  const parent = new Map<number, number>();
  while (queue.length) {
    const node = queue.shift()!;
    if (node === to) {
      const chain = [to];
      let cursor = to;
      while (parent.has(cursor)) {
        cursor = parent.get(cursor)!;
        chain.push(cursor);
      }
      return chain.reverse();
    }
    for (const next of graph.get(node) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      parent.set(next, node);
      queue.push(next);
    }
  }
  return null;
}

async function manageDependency(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'tasksWrite', TASKS_PLUGIN);
  const data = parse(manageDependencySchema, input);
  if (data.task_id === data.depends_on_task_id) {
    throw new Error('Una tarea no puede depender de sí misma.');
  }

  const [task, dependsOn] = await Promise.all([
    assertTask(context.teamId, data.task_id),
    assertTask(context.teamId, data.depends_on_task_id),
  ]);
  if (!task) throw new Error(`La tarea ${data.task_id} no existe en este equipo.`);
  if (!dependsOn) throw new Error(`La tarea ${data.depends_on_task_id} no existe en este equipo.`);

  if (data.action === 'delete') {
    const deleted = await db.delete(teamTaskDependencies).where(and(
      eq(teamTaskDependencies.teamId, context.teamId),
      eq(teamTaskDependencies.taskId, data.task_id),
      eq(teamTaskDependencies.dependsOnTaskId, data.depends_on_task_id),
    )).returning({ id: teamTaskDependencies.id });
    if (!deleted.length) throw new Error('Esa dependencia no existe. Mirá las de la tarea con whatspro_tasks_get.');
    await audit(context, 'GROK_TASK_DEPENDENCY_DELETED', data.task_id);
    return { success: true, action: 'delete', task_id: data.task_id, depends_on_task_id: data.depends_on_task_id };
  }

  const cycle = await dependencyPathExists(context.teamId, data.depends_on_task_id, data.task_id);
  if (cycle) {
    throw new Error(
      `Esa dependencia formaría un ciclo: la tarea ${data.depends_on_task_id} ya depende (en cadena) de la ${data.task_id} — cadena: ${cycle.join(' → ')} → ${data.depends_on_task_id}. Revisá la cadena con whatspro_tasks_get y rompé el eslabón que sobra.`,
    );
  }

  const [row] = await db.insert(teamTaskDependencies).values({
    teamId: context.teamId,
    taskId: data.task_id,
    dependsOnTaskId: data.depends_on_task_id,
    createdBy: context.userId,
  }).onConflictDoNothing().returning();
  await audit(context, 'GROK_TASK_DEPENDENCY_CREATED', data.task_id);
  return {
    success: true,
    action: 'create',
    already_existed: !row,
    task: { id: task.id, title: task.title },
    depends_on: { id: dependsOn.id, title: dependsOn.title },
  };
}

const mergeProjectsSchema = z.object({
  workspace_id: z.number().int().positive().optional(),
  dry_run: z.boolean().default(true),
  confirm: z.boolean().optional(),
});

async function mergeDuplicateProjects(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'tasksWrite', TASKS_PLUGIN);
  const data = parse(mergeProjectsSchema, input);

  // La detección corre siempre: es lo que se muestra en dry_run y lo que
  // permite responder "no había nada que fusionar" después de aplicar.
  const whereProjects = data.workspace_id
    ? and(eq(teamTaskProjects.teamId, context.teamId), eq(teamTaskProjects.workspaceId, data.workspace_id))
    : eq(teamTaskProjects.teamId, context.teamId);
  const projects = await db.select({
    id: teamTaskProjects.id,
    name: teamTaskProjects.name,
    workspaceId: teamTaskProjects.workspaceId,
  }).from(teamTaskProjects).where(whereProjects).orderBy(asc(teamTaskProjects.id));

  const groups = new Map<string, Array<{ id: number; name: string; workspaceId: number | null }>>();
  for (const project of projects) {
    const key = `${project.workspaceId ?? 'null'}::${project.name.trim().toLowerCase()}`;
    const list = groups.get(key) ?? [];
    list.push(project);
    groups.set(key, list);
  }
  const duplicates = [...groups.values()].filter((list) => list.length > 1).map((list) => ({
    name: list[0].name,
    workspace_id: list[0].workspaceId,
    keeps: list[0].id,
    merges: list.slice(1).map((project) => project.id),
  }));

  if (data.dry_run) {
    return {
      dry_run: true,
      duplicate_groups: duplicates.length,
      groups: duplicates,
      note: duplicates.length
        ? 'Nada se tocó. Para fusionar de verdad: dry_run=false y confirm=true. En cada grupo se conserva "keeps" (el más viejo) y se fusionan "merges".'
        : 'No hay proyectos duplicados: no hay nada que fusionar.',
    };
  }

  if (data.confirm !== true) {
    throw new Error('confirm debe ser true para aplicar: la fusión mueve tareas y BORRA los proyectos duplicados, y no se deshace. Corré primero con dry_run=true para ver qué se fusionaría.');
  }

  const result = await mergeDuplicateNamedProjects(context.teamId, data.workspace_id);
  await audit(context, 'GROK_TASK_PROJECTS_MERGED', result.merged);
  return {
    success: true,
    dry_run: false,
    merged: result.merged,
    groups: duplicates,
    next: 'Verificá el tablero con whatspro_tasks_board.',
  };
}

/* ------------------------------------------------------------------ */
/* Duplicar, convertir, checklist, embed, plantillas                    */
/* ------------------------------------------------------------------ */

const duplicateSchema = z.object({
  target: z.enum(['task', 'project']),
  id: z.number().int().positive(),
  column_id: z.number().int().positive().optional(),
  project_id: z.number().int().positive().optional(),
  target_workspace_id: z.number().int().positive().optional(),
  dry_run: z.boolean().default(false),
});

async function tasksDuplicate(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'tasksWrite', TASKS_PLUGIN);
  const data = parse(duplicateSchema, input);

  if (data.target === 'task') {
    const task = await assertTask(context.teamId, data.id);
    if (!task) throw new Error('Task not found');
    if (data.dry_run) {
      return {
        dry_run: true,
        target: 'task',
        source: { id: task.id, title: task.title, column_id: task.columnId },
        would_create: { title: data.column_id ? task.title : `${task.title} copia`, column_id: data.column_id ?? task.columnId, checklist_items: (task.checklist ?? []).length },
      };
    }
    const duplicate = await duplicateTask(context.teamId, context.userId, data.id, {
      columnId: data.column_id ?? null,
      projectId: data.project_id ?? null,
    });
    await audit(context, 'GROK_TASK_DUPLICATED', duplicate.id);
    return {
      success: true,
      target: 'task',
      source_id: task.id,
      task: { id: duplicate.id, title: duplicate.title, column_id: duplicate.columnId, project_id: duplicate.projectId },
    };
  }

  const project = await assertProject(context.teamId, data.id);
  if (!project) throw new Error('Project not found');
  if (data.dry_run) {
    const data_ = await loadTaskOsData(context.teamId);
    const source = data_.flatMap((workspace) => workspace.projects).find((item) => item.id === project.id);
    const columns = source?.columns ?? [];
    return {
      dry_run: true,
      target: 'project',
      source: { id: project.id, name: project.name, workspace_id: project.workspaceId },
      would_create: {
        name: `${project.name} copia`,
        workspace_id: data.target_workspace_id ?? project.workspaceId,
        columns: columns.length,
        tasks: columns.reduce((sum, column) => sum + column.items.filter(Boolean).length, 0),
      },
    };
  }
  const result = await duplicateProject(context.teamId, context.userId, data.id, {
    targetWorkspaceId: data.target_workspace_id ?? null,
  });
  await audit(context, 'GROK_TASK_PROJECT_DUPLICATED', result.project.id);
  return {
    success: true,
    target: 'project',
    source_id: project.id,
    project: { id: result.project.id, name: result.project.name, workspace_id: result.project.workspaceId },
    copied: { columns: result.columns, tasks: result.tasks },
    next: 'Verificá la copia con whatspro_tasks_board(project_id=<id nuevo>).',
  };
}

const convertSchema = z.object({
  direction: z.enum(['task_to_project', 'project_to_task']),
  id: z.number().int().positive(),
  dry_run: z.boolean().default(false),
});

async function tasksConvert(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'tasksWrite', TASKS_PLUGIN);
  const data = parse(convertSchema, input);

  if (data.direction === 'task_to_project') {
    const task = await assertTask(context.teamId, data.id);
    if (!task) throw new Error('Task not found');
    if (data.dry_run) {
      return {
        dry_run: true,
        direction: data.direction,
        source: { id: task.id, title: task.title },
        would_create: { project_name: task.title, columns: ['Por hacer', 'En progreso', 'Completado'], tasks_from_checklist: (task.checklist ?? []).length },
      };
    }
    const result = await convertTaskToProject(context.teamId, context.userId, data.id);
    await audit(context, 'GROK_TASK_CONVERTED_TO_PROJECT', result.project.id);
    return {
      success: true,
      direction: data.direction,
      source_task_id: task.id,
      project: { id: result.project.id, name: result.project.name, workspace_id: result.project.workspaceId },
      tasks_created: result.createdTasks,
      note: 'La tarea original sigue existiendo, ligada al proyecto nuevo por converted_to.',
    };
  }

  const project = await assertProject(context.teamId, data.id);
  if (!project) throw new Error('Project not found');
  if (data.dry_run) {
    const data_ = await loadTaskOsData(context.teamId);
    const source = data_.flatMap((workspace) => workspace.projects).find((item) => item.id === project.id);
    const items = (source?.columns ?? []).reduce((sum, column) => sum + column.items.filter(Boolean).length, 0);
    return {
      dry_run: true,
      direction: data.direction,
      source: { id: project.id, name: project.name },
      would_create: { task_title: project.name, checklist_items: items },
    };
  }
  const result = await convertProjectToTask(context.teamId, context.userId, data.id);
  await audit(context, 'GROK_TASK_PROJECT_CONVERTED_TO_TASK', result.task.id);
  return {
    success: true,
    direction: data.direction,
    source_project_id: project.id,
    task: { id: result.task.id, title: result.task.title, column_id: result.task.columnId, project_id: result.task.projectId },
    checklist_items: result.checklistItems,
    note: 'El proyecto original sigue existiendo, ligado a la tarea nueva por converted_to.',
  };
}

const checklistToTasksSchema = z.object({
  task_id: z.number().int().positive(),
  dry_run: z.boolean().default(false),
});

async function tasksChecklistToTasks(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'tasksWrite', TASKS_PLUGIN);
  const data = parse(checklistToTasksSchema, input);

  const task = await assertTask(context.teamId, data.task_id);
  if (!task) throw new Error('Task not found');
  const items = task.checklist ?? [];
  if (data.dry_run) {
    return {
      dry_run: true,
      task: { id: task.id, title: task.title, column_id: task.columnId },
      would_create: items.map((item) => ({ title: item.text, status: item.completed ? 'done' : 'open' })),
      note: items.length ? 'Nada se creó. Para convertir de verdad: dry_run=false.' : 'La tarea no tiene checklist: no hay nada que convertir.',
    };
  }
  const result = await checklistToTasks(context.teamId, context.userId, data.task_id);
  await audit(context, 'GROK_TASK_CHECKLIST_TO_TASKS', task.id);
  return {
    success: true,
    task_id: task.id,
    created: result.created.map((item) => ({ id: item.id, title: item.title, status: item.status })),
    note: result.created.length ? 'El checklist original se conserva; las tareas nuevas son hijas de la original.' : 'La tarea no tenía checklist: no se creó nada.',
  };
}

const embedSchema = z.object({
  type: z.enum(['project', 'workspace']),
  id: z.number().int().positive(),
  action: z.enum(['status', 'enable', 'regenerate', 'disable']),
  access: z.enum(['read', 'manage']).optional(),
  confirm: z.boolean().optional(),
});

async function embedUrl(token: string | null) {
  if (!token) return null;
  const base = await getBaseUrl();
  return `${base}/es/task-embed/${token}`;
}

async function tasksEmbed(input: Record<string, unknown>, context: GrokActionContext) {
  const data = parse(embedSchema, input);
  await assertPermission(context, data.action === 'status' ? 'tasksRead' : 'tasksWrite', TASKS_PLUGIN);
  const entity = data.type === 'project'
    ? await assertProject(context.teamId, data.id)
    : await assertWorkspace(context.teamId, data.id);
  if (!entity) throw new Error(data.type === 'project' ? 'Project not found' : 'Workspace not found');

  if (data.action === 'status') {
    const state = await getEmbedState(context.teamId, data.type, data.id);
    if (!state) throw new Error('Embed not found');
    return { type: data.type, id: data.id, name: entity.name, enabled: state.enabled, access: state.access, public_url: await embedUrl(state.token) };
  }

  if (data.action === 'regenerate' && data.confirm !== true) {
    throw new Error('confirm debe ser true: regenerar emite un token nuevo y la URL anterior deja de funcionar para siempre.');
  }
  if (data.action === 'disable' && data.confirm !== true) {
    throw new Error('confirm debe ser true: desactivar corta el acceso de quien esté usando la URL (se puede volver a activar con la misma URL).');
  }

  const state = await setEmbedState({ teamId: context.teamId, type: data.type, id: data.id, action: data.action, access: data.access });
  if (!state) throw new Error('Embed not found');
  await audit(context, `GROK_TASK_EMBED_${data.action.toUpperCase()}`, `${data.type}:${data.id}`);
  return {
    success: true,
    action: data.action,
    type: data.type,
    id: data.id,
    name: entity.name,
    enabled: state.enabled,
    access: state.access,
    public_url: await embedUrl(state.token),
  };
}

const manageTemplateSchema = z.object({
  action: z.enum(['list', 'create']),
  type: z.enum(TASK_TEMPLATE_TYPES).optional(),
  name: z.string().trim().min(1).max(200).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

async function manageTaskTemplate(input: Record<string, unknown>, context: GrokActionContext) {
  const data = parse(manageTemplateSchema, input);

  if (data.action === 'list') {
    await assertPermission(context, 'tasksRead', TASKS_PLUGIN);
    const rows = await listTaskTemplates(context.teamId, data.type ?? null);
    return {
      total: rows.length,
      templates: rows.map((row) => ({ id: row.id, type: row.type, name: row.name, payload: row.payload, updated_at: row.updatedAt.toISOString() })),
    };
  }

  await assertPermission(context, 'tasksWrite', TASKS_PLUGIN);
  if (!data.type || !data.name) throw new Error('type y name son obligatorios para create.');
  const template = await createTaskTemplate(context.teamId, context.userId, { type: data.type, name: data.name, payload: data.payload ?? {} });
  await audit(context, 'GROK_TASK_TEMPLATE_CREATED', template.id);
  return { success: true, action: 'create', template: { id: template.id, type: template.type, name: template.name, payload: template.payload } };
}

export async function executeTasksTool(name: string, input: Record<string, unknown>, context: GrokActionContext) {
  if (name === 'whatspro_tasks_duplicate') return tasksDuplicate(input, context);
  if (name === 'whatspro_tasks_convert') return tasksConvert(input, context);
  if (name === 'whatspro_tasks_checklist_to_tasks') return tasksChecklistToTasks(input, context);
  if (name === 'whatspro_tasks_embed') return tasksEmbed(input, context);
  if (name === 'whatspro_manage_task_template') return manageTaskTemplate(input, context);
  if (name === 'whatspro_tasks_manage_dependency') return manageDependency(input, context);
  if (name === 'whatspro_tasks_merge_duplicate_projects') return mergeDuplicateProjects(input, context);
  if (name === 'whatspro_tasks_ai_worklist') return taskAiWorklist(input, context);
  if (name === 'whatspro_operations_ai_reply') return operationsAiReply(input, context);
  if (name === 'whatspro_tasks_ai_report') return taskAiReport(input, context);
  if (name === 'whatspro_tasks_board') return board(input, context);
  if (name === 'whatspro_tasks_cascade_export') return cascadeExport(input, context);
  if (name === 'whatspro_tasks_cascade_apply') return cascadeApply(input, context);
  if (name === 'whatspro_tasks_comment') return comment(input, context);
  if (name === 'whatspro_tasks_links') return taskLinks(input, context);
  if (name === 'whatspro_tasks_assign') return tasksAssign(input, context);
  if (name === 'whatspro_tasks_move') return tasksMove(input, context);
  if (name === 'whatspro_crm_funnel_snapshot') return funnelSnapshot(input, context);
  if (name === 'whatspro_contact_graph') return contactGraph(input, context);
  throw new Error(`Unknown Tasks tool: ${name}`);
}
