import 'server-only';

import { and, eq, gte, ilike, inArray, lte, max, ne, or } from 'drizzle-orm';
import { z } from 'zod';
import { ensureCustomFieldsTable } from '@/lib/contacts/custom-fields';
import { db } from '@/lib/db/drizzle';
import {
  automations,
  contactTags,
  contacts,
  customFields,
  dashboardBookmarkGroups,
  dashboardBookmarkItems,
  departmentMembers,
  departments,
  evolutionInstances,
  funnelStageGroupMembers,
  funnelStageGroups,
  funnelStages,
  tags,
  teamCustomers,
  teamEvents,
  teamMembers,
  teamMembershipPlans,
  teamMembershipSubscriptions,
  teamNotes,
  teamScheduledMessages,
  teamTaskColumns,
  teamTaskItemLocations,
  teamTaskItems,
  teamTaskMedia,
  teamTaskProjects,
  teamTaskRelations,
  teamTaskWorkspaces,
  type MembershipFeature,
  type TaskChecklistItem,
  type TaskLabel,
} from '@/lib/db/schema';
import {
  audit,
  assertPermission,
  parse,
  type GrokActionContext,
  type GrokActionTool,
} from '@/lib/plugins/grok-connector/server/actions';
import {
  BILLING_TYPES,
  FEATURE_TYPES,
  PAYMENT_STATUS,
  PLAN_VISIBILITIES,
  SUBSCRIPTION_STATUS,
} from '@/lib/plugins/memberships/constants';
import { assertCompanyOwnership } from '@/lib/plugins/memberships/server/plan-schema';
import { computeNextRunAt } from '@/lib/plugins/scheduled-messages/schedule';
import {
  assertEntity,
  assertProject,
  assertTask,
  createTaskInColumn,
  createTaskLocation,
  deleteColumn,
  deleteTaskItem,
  getProjectFirstColumn,
  insertRelation,
  nextTaskOrder,
  patchTaskItem,
} from '@/lib/plugins/tasks/server/task-os';
import { ensureDefaultTaskWorkspace } from '@/lib/plugins/tasks/server/workspaces';
import { createContactTask } from '@/lib/plugins/tasks/server/contact-tasks';
import {
  createDocument,
  deleteDocument,
  updateDocument,
} from '@/lib/plugins/documents/server/documents';
import {
  createFolder,
  deleteFolder,
  moveFolder,
  updateFolder,
} from '@/lib/plugins/documents/server/folders';
import { markdownToProseMirror } from '@/lib/plugins/documents/shared/markdown';

const nullablePositiveId = { type: ['integer', 'null'], minimum: 1 } as const;
const colorProperty = { type: 'string', minLength: 1, maxLength: 20 } as const;
const dateTimeProperty = { type: ['string', 'null'], format: 'date-time' } as const;
const taskChecklistProperty = {
  type: 'array',
  maxItems: 100,
  items: {
    type: 'object',
    required: ['id', 'text'],
    properties: {
      id: { type: 'string', minLength: 1, maxLength: 100 },
      text: { type: 'string', minLength: 1, maxLength: 500 },
      completed: { type: 'boolean', default: false },
    },
    additionalProperties: false,
  },
} as const;
const taskFields = {
  title: { type: 'string', minLength: 1, maxLength: 500 },
  notes: { type: 'string', maxLength: 20000 },
  label_ids: { type: 'array', maxItems: 50, items: { type: 'string', maxLength: 100 } },
  checklist: taskChecklistProperty,
  status: { type: 'string', enum: ['open', 'in_progress', 'done'] },
  due_date: dateTimeProperty,
  start_date: dateTimeProperty,
  end_date: dateTimeProperty,
  color: { type: ['string', 'null'], maxLength: 20 },
  icon: { type: ['string', 'null'], maxLength: 60 },
} as const;

export const grokExtendedActionTools: GrokActionTool[] = [
  {
    name: 'whatspro_manage_crm_stage_group',
    description: 'Crea o edita un grupo de etapas del CRM y, opcionalmente, reemplaza las etapas que contiene.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['create', 'update'] },
        group_id: { type: 'integer', minimum: 1 },
        name: { type: 'string', minLength: 1, maxLength: 100 },
        description: { type: ['string', 'null'], maxLength: 300 },
        order: { type: 'integer', minimum: 0 },
        stage_ids: { type: 'array', uniqueItems: true, maxItems: 100, items: { type: 'integer', minimum: 1 } },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_manage_crm_stage',
    description: 'Crea o edita una etapa del CRM, incluido su orden, emoji y pertenencia a grupos de etapas.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['create', 'update'] },
        stage_id: { type: 'integer', minimum: 1 },
        name: { type: 'string', minLength: 1, maxLength: 100 },
        emoji: { type: ['string', 'null'], maxLength: 10 },
        order: { type: 'integer', minimum: 0 },
        group_ids: { type: 'array', uniqueItems: true, maxItems: 20, items: { type: 'integer', minimum: 1 } },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_manage_tag',
    description: 'Crea o edita una etiqueta del CRM.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['create', 'update'] },
        tag_id: { type: 'integer', minimum: 1 },
        name: { type: 'string', minLength: 1, maxLength: 100 },
        color: colorProperty,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_manage_department',
    description: 'Crea o edita un departamento del CRM para organizar contactos y agentes.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['create', 'update'] },
        department_id: { type: 'integer', minimum: 1 },
        name: { type: 'string', minLength: 1, maxLength: 100 },
        description: { type: ['string', 'null'], maxLength: 1000 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_manage_department_member',
    description: 'Agrega o quita un agente del equipo en un departamento del CRM.',
    inputSchema: {
      type: 'object',
      required: ['action', 'department_id', 'user_id'],
      properties: {
        action: { type: 'string', enum: ['add', 'remove'] },
        department_id: { type: 'integer', minimum: 1 },
        user_id: { type: 'integer', minimum: 1 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_set_contact_tags',
    description: 'Agrega, quita o reemplaza las etiquetas de un contacto del CRM.',
    inputSchema: {
      type: 'object',
      required: ['contact_id', 'mode', 'tag_ids'],
      properties: {
        contact_id: { type: 'integer', minimum: 1 },
        mode: { type: 'string', enum: ['add', 'remove', 'replace'] },
        tag_ids: { type: 'array', uniqueItems: true, maxItems: 100, items: { type: 'integer', minimum: 1 } },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_manage_agenda',
    description: 'Crea o edita una agenda del escritorio y puede vincularla con un grupo de etapas del CRM.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['create', 'update'] },
        agenda_id: { type: 'integer', minimum: 1 },
        name: { type: 'string', minLength: 1, maxLength: 120 },
        color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
        funnel_stage_group_id: nullablePositiveId,
        order: { type: 'integer', minimum: 0 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_manage_agenda_contact',
    description: 'Agrega, mueve o quita un contacto de una agenda. El contacto debe tener un chat asociado.',
    inputSchema: {
      type: 'object',
      required: ['action', 'contact_id', 'agenda_id'],
      properties: {
        action: { type: 'string', enum: ['add', 'move', 'remove'] },
        contact_id: { type: 'integer', minimum: 1 },
        agenda_id: { type: 'integer', minimum: 1, description: 'Agenda destino para add/move; agenda actual para remove.' },
        source_agenda_id: { type: 'integer', minimum: 1, description: 'Agenda de origen opcional al mover.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_manage_membership_plan',
    description: 'Crea o edita un plan de membresía con precio, frecuencia, características, visibilidad y estado.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['create', 'update'] },
        plan_id: { type: 'integer', minimum: 1 },
        company_id: nullablePositiveId,
        name: { type: 'string', minLength: 1, maxLength: 150 },
        description: { type: 'string', maxLength: 1000 },
        billing_type: { type: 'string', enum: BILLING_TYPES },
        price: { type: 'integer', minimum: 0, description: 'Importe en centavos.' },
        setup_fee: { type: 'integer', minimum: 0 },
        maintenance_amount: { type: 'integer', minimum: 0 },
        maintenance_interval_months: { type: ['integer', 'null'], minimum: 1, maximum: 240 },
        billing_label: { type: ['string', 'null'], maxLength: 100 },
        currency: { type: 'string', minLength: 3, maxLength: 3 },
        features: {
          type: 'array',
          maxItems: 100,
          items: {
            type: 'object',
            required: ['label', 'type'],
            properties: {
              label: { type: 'string', minLength: 1, maxLength: 200 },
              type: { type: 'string', enum: FEATURE_TYPES },
              value: { type: 'string', maxLength: 200 },
            },
            additionalProperties: false,
          },
        },
        visibility: { type: 'string', enum: PLAN_VISIBILITIES },
        status: { type: 'string', enum: ['active', 'archived'] },
        position: { type: 'integer', minimum: 0 },
        idempotency_key: { type: 'string', minLength: 8, maxLength: 80 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_update_membership',
    description: 'Edita una membresía ya asignada: plan, cliente/contacto, fechas, precio y estados de membresía o pago.',
    inputSchema: {
      type: 'object',
      required: ['membership_id'],
      properties: {
        membership_id: { type: 'integer', minimum: 1 },
        subscription_number: { type: 'string', minLength: 1, maxLength: 50 },
        plan_id: nullablePositiveId,
        customer_id: nullablePositiveId,
        contact_id: nullablePositiveId,
        price: { type: 'integer', minimum: 0 },
        currency: { type: 'string', minLength: 3, maxLength: 3 },
        billing_type: { type: 'string', enum: BILLING_TYPES },
        status: { type: 'string', enum: SUBSCRIPTION_STATUS },
        payment_status: { type: 'string', enum: PAYMENT_STATUS },
        start_date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        end_date: { type: ['string', 'null'], pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        notes: { type: 'string', maxLength: 2000 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_create_task_project',
    description: 'Crea un proyecto completo de Tareas OS con espacio, etiquetas, columnas, tareas y subtareas en una operación.',
    inputSchema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 200 },
        workspace_id: { type: 'integer', minimum: 1 },
        workspace_name: { type: 'string', minLength: 1, maxLength: 200 },
        background_url: { type: ['string', 'null'], maxLength: 2000 },
        color: { type: ['string', 'null'], maxLength: 20 },
        icon: { type: ['string', 'null'], maxLength: 60 },
        labels: {
          type: 'array',
          maxItems: 50,
          items: {
            type: 'object',
            required: ['id', 'name', 'color'],
            properties: {
              id: { type: 'string', minLength: 1, maxLength: 100 },
              name: { type: 'string', minLength: 1, maxLength: 100 },
              color: colorProperty,
            },
            additionalProperties: false,
          },
        },
        columns: {
          type: 'array',
          minItems: 1,
          maxItems: 30,
          items: {
            type: 'object',
            required: ['title'],
            properties: {
              title: { type: 'string', minLength: 1, maxLength: 200 },
              color: { type: ['string', 'null'], maxLength: 20 },
              icon: { type: ['string', 'null'], maxLength: 60 },
              tasks: {
                type: 'array',
                maxItems: 200,
                items: {
                  type: 'object',
                  required: ['title'],
                  properties: {
                    ...taskFields,
                    subtasks: {
                      type: 'array',
                      maxItems: 100,
                      items: {
                        type: 'object',
                        required: ['title'],
                        properties: taskFields,
                        additionalProperties: false,
                      },
                    },
                  },
                  additionalProperties: false,
                },
              },
            },
            additionalProperties: false,
          },
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_manage_task_column',
    description: 'Crea o edita una columna/etapa de un proyecto de Tareas OS.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['create', 'update'] },
        project_id: { type: 'integer', minimum: 1 },
        column_id: { type: 'integer', minimum: 1 },
        title: { type: 'string', minLength: 1, maxLength: 200 },
        order: { type: 'integer', minimum: 0 },
        color: { type: ['string', 'null'], maxLength: 20 },
        icon: { type: ['string', 'null'], maxLength: 60 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_manage_task',
    description: 'Crea o edita una tarea o subtarea de Tareas OS, incluidas fechas, checklist, etiquetas, estado y columna.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['create', 'update'] },
        task_id: { type: 'integer', minimum: 1 },
        column_id: { type: 'integer', minimum: 1 },
        parent_task_id: nullablePositiveId,
        ...taskFields,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_create_contact_task',
    description: 'Crea una tarea de Tareas OS vinculada directamente a un contacto del CRM. Se mostrará en el lateral de su chat.',
    inputSchema: {
      type: 'object',
      required: ['contact_id', 'title'],
      properties: {
        contact_id: { type: 'integer', minimum: 1 },
        title: { type: 'string', minLength: 1, maxLength: 500 },
        notes: { type: 'string', maxLength: 20000 },
        due_date: dateTimeProperty,
        status: { type: 'string', enum: ['open', 'in_progress', 'done'] },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_manage_document_folder',
    description: 'Crea, edita o mueve una carpeta de Documentos, respetando la profundidad máxima y evitando ciclos.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['create', 'update', 'move'] },
        folder_id: { type: 'integer', minimum: 1 },
        parent_id: nullablePositiveId,
        name: { type: 'string', minLength: 1, maxLength: 120 },
        emoji: { type: ['string', 'null'], maxLength: 16 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_manage_document',
    description: 'Crea o edita un documento. Acepta contenido Markdown (se convierte al formato seguro del editor) o, con format: "html", un archivo HTML completo tal cual — útil para informes generados por vos mismo (con o sin gráficos/JS) que quieras guardar y que la persona pueda ver con un diseño profesional dentro de Documentos.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['create', 'update'] },
        document_id: { type: 'integer', minimum: 1 },
        folder_id: nullablePositiveId,
        title: { type: 'string', minLength: 1, maxLength: 200 },
        emoji: { type: ['string', 'null'], maxLength: 16 },
        format: { type: 'string', enum: ['markdown', 'html'], description: 'Por defecto "markdown". Usá "html" para guardar un archivo HTML completo en vez de texto Markdown.' },
        markdown: { type: 'string', maxLength: 200000 },
        html: { type: 'string', maxLength: 500000, description: 'HTML completo del informe. Solo se usa cuando format es "html".' },
        version: { type: 'integer', minimum: 1, description: 'Versión actual para evitar sobrescribir cambios concurrentes.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_manage_scheduled_message',
    description: 'Crea o edita un mensaje programado único, diario o semanal; también puede ejecutar una automatización.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['create', 'update'] },
        scheduled_message_id: { type: 'integer', minimum: 1 },
        name: { type: 'string', minLength: 1, maxLength: 200 },
        status: { type: 'string', enum: ['active', 'paused', 'completed', 'failed'] },
        instance_id: nullablePositiveId,
        target_numbers: { type: 'array', maxItems: 10000, items: { type: 'string', minLength: 5, maxLength: 40 } },
        schedule_type: { type: 'string', enum: ['once', 'daily', 'weekly'] },
        scheduled_at: dateTimeProperty,
        hour: { type: ['integer', 'null'], minimum: 0, maximum: 23 },
        minute: { type: ['integer', 'null'], minimum: 0, maximum: 59 },
        weekdays: { type: 'array', uniqueItems: true, maxItems: 7, items: { type: 'integer', minimum: 0, maximum: 6 } },
        action_type: { type: 'string', enum: ['message', 'automation'] },
        message: { type: ['string', 'null'], maxLength: 20000 },
        media_url: { type: ['string', 'null'], maxLength: 2000 },
        automation_id: nullablePositiveId,
        max_runs: { type: ['integer', 'null'], minimum: 1 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_manage_custom_field',
    description: 'Crea o edita una definición de campo personalizado del CRM. Para guardar valores en un contacto usa whatspro_set_custom_fields.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['create', 'update'] },
        field_id: { type: 'integer', minimum: 1 },
        name: { type: 'string', minLength: 1, maxLength: 100 },
        key: { type: 'string', pattern: '^[a-z0-9_]{1,100}$' },
        field_type: { type: 'string', enum: ['text', 'boolean'] },
        position: { type: 'integer', minimum: 0 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_manage_note',
    description: 'Crea o edita una nota de equipo del plugin Notas. Para notas del contacto usa whatspro_add_contact_note.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['create', 'update'] },
        note_id: { type: 'integer', minimum: 1 },
        title: { type: 'string', minLength: 1, maxLength: 180 },
        content: { type: 'string', maxLength: 20000 },
        tags: { type: 'array', maxItems: 30, items: { type: 'string', minLength: 1, maxLength: 80 } },
        pinned: { type: 'boolean' },
        status: { type: 'string', enum: ['todo', 'in_progress', 'done'] },
        due_date: { type: ['string', 'null'], description: 'Fecha ISO 8601 o YYYY-MM-DD.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_manage_calendar_event',
    description: 'Crea o edita un evento de calendario, con asistentes, recordatorio y relación opcional a contacto, agente o departamento.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['create', 'update'] },
        event_id: { type: 'integer', minimum: 1 },
        title: { type: 'string', minLength: 1, maxLength: 180 },
        starts_at: { type: 'string', format: 'date-time' },
        ends_at: { type: 'string', format: 'date-time' },
        attendees: { type: 'array', maxItems: 200, items: { type: 'string', maxLength: 255 } },
        notes: { type: 'string', maxLength: 20000 },
        reminder_at: dateTimeProperty,
        status: { type: 'string', enum: ['scheduled', 'completed', 'canceled'] },
        department_id: nullablePositiveId,
        related_user_id: nullablePositiveId,
        contact_id: nullablePositiveId,
        validate_overlap: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_manage_task_workspace',
    description: 'Crea o edita un espacio de trabajo de Tareas OS.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['create', 'update'] },
        workspace_id: { type: 'integer', minimum: 1 },
        name: { type: 'string', minLength: 1, maxLength: 200 },
        order: { type: 'integer', minimum: 0 },
        color: { type: ['string', 'null'], maxLength: 20 },
        icon: { type: ['string', 'null'], maxLength: 60 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_manage_task_project',
    description: 'Edita o mueve un proyecto existente de Tareas OS, incluidas sus etiquetas y apariencia. Para crearlo usa whatspro_create_task_project.',
    inputSchema: {
      type: 'object',
      required: ['project_id'],
      properties: {
        project_id: { type: 'integer', minimum: 1 },
        workspace_id: nullablePositiveId,
        name: { type: 'string', minLength: 1, maxLength: 200 },
        background_url: { type: ['string', 'null'], maxLength: 2000 },
        labels: {
          type: 'array',
          maxItems: 50,
          items: {
            type: 'object',
            required: ['id', 'name', 'color'],
            properties: {
              id: { type: 'string', minLength: 1, maxLength: 100 },
              name: { type: 'string', minLength: 1, maxLength: 100 },
              color: colorProperty,
            },
            additionalProperties: false,
          },
        },
        order: { type: 'integer', minimum: 0 },
        color: { type: ['string', 'null'], maxLength: 20 },
        icon: { type: ['string', 'null'], maxLength: 60 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_manage_task_relation',
    description:
      'Crea o elimina una relación de Tareas. Tipos: related, shared_in, generated_from, converted_to. Entidades: task, project, workspace, contact, customer, note, event. Para compartir una tarea en otro tablero usá whatspro_share_task. Para vincular a un cliente del CRM: source_type=customer, target_type=task, relation_type=related.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['create', 'delete'] },
        relation_id: { type: 'integer', minimum: 1 },
        source_type: { type: 'string', enum: ['workspace', 'project', 'task', 'contact', 'customer', 'note', 'event'] },
        source_id: { type: 'integer', minimum: 1 },
        target_type: { type: 'string', enum: ['workspace', 'project', 'task', 'contact', 'customer', 'note', 'event'] },
        target_id: { type: 'integer', minimum: 1 },
        relation_type: { type: 'string', enum: ['related', 'shared_in', 'generated_from', 'converted_to'] },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_share_task',
    description:
      'Comparte una tarea existente en otro proyecto (crea una location secundaria y la relación shared_in). No duplica el registro: la misma tarea aparece en ambos tableros. column_id opcional: si falta, usa la primera columna del destino.',
    inputSchema: {
      type: 'object',
      required: ['task_id', 'project_id'],
      properties: {
        task_id: { type: 'integer', minimum: 1 },
        project_id: { type: 'integer', minimum: 1 },
        column_id: { type: 'integer', minimum: 1 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_link_customer_task',
    description:
      'Vincula o desvincula una tarea del plugin Tareas con un cliente del CRM (teamCustomers). La ficha del cliente y la tarea quedan relacionadas en ambos lados.',
    inputSchema: {
      type: 'object',
      required: ['action', 'customer_id', 'task_id'],
      properties: {
        action: { type: 'string', enum: ['link', 'unlink'] },
        customer_id: { type: 'integer', minimum: 1 },
        task_id: { type: 'integer', minimum: 1 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_delete_record',
    description: 'Elimina de forma irreversible un registro administrable. Solo debe usarse cuando el usuario pidió explícitamente eliminarlo y confirm=true.',
    inputSchema: {
      type: 'object',
      required: ['resource', 'record_id', 'confirm'],
      properties: {
        resource: {
          type: 'string',
          enum: ['crm_stage_group', 'crm_stage', 'tag', 'department', 'agenda', 'membership_plan', 'membership', 'task_workspace', 'task_project', 'task_column', 'task', 'document_folder', 'document', 'scheduled_message', 'team_note', 'custom_field', 'calendar_event'],
        },
        record_id: { type: 'integer', minimum: 1 },
        confirm: { type: 'boolean', const: true },
      },
      additionalProperties: false,
    },
  },
];

const actionSchema = z.enum(['create', 'update']);
const departmentManageSchema = z.object({
  action: actionSchema,
  department_id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
}).superRefine((data, ctx) => {
  if (data.action === 'create' && !data.name) ctx.addIssue({ code: 'custom', message: 'name is required for create', path: ['name'] });
  if (data.action === 'update' && !data.department_id) ctx.addIssue({ code: 'custom', message: 'department_id is required for update', path: ['department_id'] });
});
const departmentMemberManageSchema = z.object({
  action: z.enum(['add', 'remove']),
  department_id: z.number().int().positive(),
  user_id: z.number().int().positive(),
});
const crmGroupSchema = z.object({
  action: actionSchema,
  group_id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().max(300).nullable().optional(),
  order: z.number().int().min(0).optional(),
  stage_ids: z.array(z.number().int().positive()).max(100).optional(),
}).superRefine((data, ctx) => {
  if (data.action === 'create' && !data.name) ctx.addIssue({ code: 'custom', message: 'name is required for create', path: ['name'] });
  if (data.action === 'update' && !data.group_id) ctx.addIssue({ code: 'custom', message: 'group_id is required for update', path: ['group_id'] });
});
const crmStageSchema = z.object({
  action: actionSchema,
  stage_id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(100).optional(),
  emoji: z.string().max(10).nullable().optional(),
  order: z.number().int().min(0).optional(),
  group_ids: z.array(z.number().int().positive()).max(20).optional(),
}).superRefine((data, ctx) => {
  if (data.action === 'create' && !data.name) ctx.addIssue({ code: 'custom', message: 'name is required for create', path: ['name'] });
  if (data.action === 'update' && !data.stage_id) ctx.addIssue({ code: 'custom', message: 'stage_id is required for update', path: ['stage_id'] });
});
const tagSchema = z.object({
  action: actionSchema,
  tag_id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(100).optional(),
  color: z.string().trim().min(1).max(20).optional(),
}).superRefine((data, ctx) => {
  if (data.action === 'create' && !data.name) ctx.addIssue({ code: 'custom', message: 'name is required for create', path: ['name'] });
  if (data.action === 'update' && !data.tag_id) ctx.addIssue({ code: 'custom', message: 'tag_id is required for update', path: ['tag_id'] });
});
const setContactTagsSchema = z.object({
  contact_id: z.number().int().positive(),
  mode: z.enum(['add', 'remove', 'replace']),
  tag_ids: z.array(z.number().int().positive()).max(100),
});
const agendaManageSchema = z.object({
  action: actionSchema,
  agenda_id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  color: z.string().regex(/^#[0-9A-F]{6}$/i).optional(),
  funnel_stage_group_id: z.number().int().positive().nullable().optional(),
  order: z.number().int().min(0).optional(),
}).superRefine((data, ctx) => {
  if (data.action === 'create' && !data.name) ctx.addIssue({ code: 'custom', message: 'name is required for create', path: ['name'] });
  if (data.action === 'update' && !data.agenda_id) ctx.addIssue({ code: 'custom', message: 'agenda_id is required for update', path: ['agenda_id'] });
});
const agendaContactSchema = z.object({
  action: z.enum(['add', 'move', 'remove']),
  contact_id: z.number().int().positive(),
  agenda_id: z.number().int().positive(),
  source_agenda_id: z.number().int().positive().optional(),
});

const featureSchema = z.object({
  label: z.string().trim().min(1).max(200),
  type: z.enum(FEATURE_TYPES),
  value: z.string().max(200).optional(),
});
const planManageSchema = z.object({
  action: actionSchema,
  plan_id: z.number().int().positive().optional(),
  company_id: z.number().int().positive().nullable().optional(),
  name: z.string().trim().min(1).max(150).optional(),
  description: z.string().max(1000).optional(),
  billing_type: z.enum(BILLING_TYPES).optional(),
  price: z.number().int().min(0).optional(),
  setup_fee: z.number().int().min(0).optional(),
  maintenance_amount: z.number().int().min(0).optional(),
  maintenance_interval_months: z.number().int().min(1).max(240).nullable().optional(),
  billing_label: z.string().max(100).nullable().optional(),
  currency: z.string().trim().length(3).optional(),
  features: z.array(featureSchema).max(100).optional(),
  visibility: z.enum(PLAN_VISIBILITIES).optional(),
  status: z.enum(['active', 'archived']).optional(),
  position: z.number().int().min(0).optional(),
  idempotency_key: z.string().trim().min(8).max(80).optional(),
}).superRefine((data, ctx) => {
  if (data.action === 'create' && !data.name) ctx.addIssue({ code: 'custom', message: 'name is required for create', path: ['name'] });
  if (data.action === 'update' && !data.plan_id) ctx.addIssue({ code: 'custom', message: 'plan_id is required for update', path: ['plan_id'] });
});
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const membershipUpdateSchema = z.object({
  membership_id: z.number().int().positive(),
  subscription_number: z.string().trim().min(1).max(50).optional(),
  plan_id: z.number().int().positive().nullable().optional(),
  customer_id: z.number().int().positive().nullable().optional(),
  contact_id: z.number().int().positive().nullable().optional(),
  price: z.number().int().min(0).optional(),
  currency: z.string().trim().length(3).optional(),
  billing_type: z.enum(BILLING_TYPES).optional(),
  status: z.enum(SUBSCRIPTION_STATUS).optional(),
  payment_status: z.enum(PAYMENT_STATUS).optional(),
  start_date: isoDate.optional(),
  end_date: isoDate.nullable().optional(),
  notes: z.string().max(2000).optional(),
});

const checklistItemSchema = z.object({
  id: z.string().trim().min(1).max(100),
  text: z.string().trim().min(1).max(500),
  completed: z.boolean().default(false),
});
const taskBaseSchema = z.object({
  title: z.string().trim().min(1).max(500),
  notes: z.string().max(20000).default(''),
  label_ids: z.array(z.string().max(100)).max(50).default([]),
  checklist: z.array(checklistItemSchema).max(100).default([]),
  status: z.enum(['open', 'in_progress', 'done']).default('open'),
  due_date: z.string().datetime().nullable().optional(),
  start_date: z.string().datetime().nullable().optional(),
  end_date: z.string().datetime().nullable().optional(),
  color: z.string().max(20).nullable().optional(),
  icon: z.string().max(60).nullable().optional(),
});
const taskWithSubtasksSchema = taskBaseSchema.extend({ subtasks: z.array(taskBaseSchema).max(100).default([]) });
const taskProjectSchema = z.object({
  name: z.string().trim().min(1).max(200),
  workspace_id: z.number().int().positive().optional(),
  workspace_name: z.string().trim().min(1).max(200).optional(),
  background_url: z.string().max(2000).nullable().optional(),
  color: z.string().max(20).nullable().optional(),
  icon: z.string().max(60).nullable().optional(),
  labels: z.array(z.object({
    id: z.string().trim().min(1).max(100),
    name: z.string().trim().min(1).max(100),
    color: z.string().trim().min(1).max(20),
  })).max(50).default([]),
  columns: z.array(z.object({
    title: z.string().trim().min(1).max(200),
    color: z.string().max(20).nullable().optional(),
    icon: z.string().max(60).nullable().optional(),
    tasks: z.array(taskWithSubtasksSchema).max(200).default([]),
  })).min(1).max(30).default([
    { title: 'Por hacer', tasks: [] },
    { title: 'En progreso', tasks: [] },
    { title: 'Completado', tasks: [] },
  ]),
});
const taskColumnSchema = z.object({
  action: actionSchema,
  project_id: z.number().int().positive().optional(),
  column_id: z.number().int().positive().optional(),
  title: z.string().trim().min(1).max(200).optional(),
  order: z.number().int().min(0).optional(),
  color: z.string().max(20).nullable().optional(),
  icon: z.string().max(60).nullable().optional(),
}).superRefine((data, ctx) => {
  if (data.action === 'create' && !data.project_id) ctx.addIssue({ code: 'custom', message: 'project_id is required for create', path: ['project_id'] });
  if (data.action === 'create' && !data.title) ctx.addIssue({ code: 'custom', message: 'title is required for create', path: ['title'] });
  if (data.action === 'update' && !data.column_id) ctx.addIssue({ code: 'custom', message: 'column_id is required for update', path: ['column_id'] });
});
const taskManageSchema = taskBaseSchema.partial().extend({
  action: actionSchema,
  task_id: z.number().int().positive().optional(),
  column_id: z.number().int().positive().optional(),
  parent_task_id: z.number().int().positive().nullable().optional(),
}).superRefine((data, ctx) => {
  if (data.action === 'create' && !data.column_id) ctx.addIssue({ code: 'custom', message: 'column_id is required for create', path: ['column_id'] });
  if (data.action === 'create' && !data.title) ctx.addIssue({ code: 'custom', message: 'title is required for create', path: ['title'] });
  if (data.action === 'update' && !data.task_id) ctx.addIssue({ code: 'custom', message: 'task_id is required for update', path: ['task_id'] });
});
const contactTaskSchema = z.object({
  contact_id: z.number().int().positive(),
  title: z.string().trim().min(1).max(500),
  notes: z.string().max(20000).optional(),
  due_date: z.string().datetime().nullable().optional(),
  status: z.enum(['open', 'in_progress', 'done']).optional(),
});
const folderManageSchema = z.object({
  action: z.enum(['create', 'update', 'move']),
  folder_id: z.number().int().positive().optional(),
  parent_id: z.number().int().positive().nullable().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  emoji: z.string().max(16).nullable().optional(),
}).superRefine((data, ctx) => {
  if (data.action === 'create' && !data.name) ctx.addIssue({ code: 'custom', message: 'name is required for create', path: ['name'] });
  if (data.action !== 'create' && !data.folder_id) ctx.addIssue({ code: 'custom', message: 'folder_id is required', path: ['folder_id'] });
  if (data.action === 'move' && data.parent_id === undefined) ctx.addIssue({ code: 'custom', message: 'parent_id is required for move (use null for root)', path: ['parent_id'] });
});
const documentManageSchema = z.object({
  action: actionSchema,
  document_id: z.number().int().positive().optional(),
  folder_id: z.number().int().positive().nullable().optional(),
  title: z.string().trim().min(1).max(200).optional(),
  emoji: z.string().max(16).nullable().optional(),
  format: z.enum(['markdown', 'html']).optional(),
  markdown: z.string().max(200000).optional(),
  html: z.string().max(500000).optional(),
  version: z.number().int().positive().optional(),
}).superRefine((data, ctx) => {
  if (data.action === 'update' && !data.document_id) ctx.addIssue({ code: 'custom', message: 'document_id is required for update', path: ['document_id'] });
});
const scheduledManageSchema = z.object({
  action: actionSchema,
  scheduled_message_id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(200).optional(),
  status: z.enum(['active', 'paused', 'completed', 'failed']).optional(),
  instance_id: z.number().int().positive().nullable().optional(),
  target_numbers: z.array(z.string().trim().min(5).max(40)).max(10000).optional(),
  schedule_type: z.enum(['once', 'daily', 'weekly']).optional(),
  scheduled_at: z.string().datetime().nullable().optional(),
  hour: z.number().int().min(0).max(23).nullable().optional(),
  minute: z.number().int().min(0).max(59).nullable().optional(),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  action_type: z.enum(['message', 'automation']).optional(),
  message: z.string().max(20000).nullable().optional(),
  media_url: z.string().max(2000).nullable().optional(),
  automation_id: z.number().int().positive().nullable().optional(),
  max_runs: z.number().int().min(1).nullable().optional(),
}).superRefine((data, ctx) => {
  if (data.action === 'create' && !data.name) ctx.addIssue({ code: 'custom', message: 'name is required for create', path: ['name'] });
  if (data.action === 'update' && !data.scheduled_message_id) ctx.addIssue({ code: 'custom', message: 'scheduled_message_id is required for update', path: ['scheduled_message_id'] });
});
const customFieldManageSchema = z.object({
  action: actionSchema,
  field_id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(100).optional(),
  key: z.string().trim().regex(/^[a-z0-9_]{1,100}$/).optional(),
  field_type: z.enum(['text', 'boolean']).optional(),
  position: z.number().int().min(0).optional(),
}).superRefine((data, ctx) => {
  if (data.action === 'create' && !data.name) ctx.addIssue({ code: 'custom', message: 'name is required for create', path: ['name'] });
  if (data.action === 'update' && !data.field_id) ctx.addIssue({ code: 'custom', message: 'field_id is required for update', path: ['field_id'] });
});
const noteManageSchema = z.object({
  action: actionSchema,
  note_id: z.number().int().positive().optional(),
  title: z.string().trim().min(1).max(180).optional(),
  content: z.string().max(20000).optional(),
  tags: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  pinned: z.boolean().optional(),
  status: z.enum(['todo', 'in_progress', 'done']).optional(),
  due_date: z.string().nullable().optional(),
}).superRefine((data, ctx) => {
  if (data.action === 'create' && !data.title) ctx.addIssue({ code: 'custom', message: 'title is required for create', path: ['title'] });
  if (data.action === 'update' && !data.note_id) ctx.addIssue({ code: 'custom', message: 'note_id is required for update', path: ['note_id'] });
});
const calendarEventManageSchema = z.object({
  action: actionSchema,
  event_id: z.number().int().positive().optional(),
  title: z.string().trim().min(1).max(180).optional(),
  starts_at: z.string().datetime().optional(),
  ends_at: z.string().datetime().optional(),
  attendees: z.array(z.string().trim().max(255)).max(200).optional(),
  notes: z.string().max(20000).optional(),
  reminder_at: z.string().datetime().nullable().optional(),
  status: z.enum(['scheduled', 'completed', 'canceled']).optional(),
  department_id: z.number().int().positive().nullable().optional(),
  related_user_id: z.number().int().positive().nullable().optional(),
  contact_id: z.number().int().positive().nullable().optional(),
  validate_overlap: z.boolean().optional(),
}).superRefine((data, ctx) => {
  if (data.action === 'create' && !data.title) ctx.addIssue({ code: 'custom', message: 'title is required for create', path: ['title'] });
  if (data.action === 'create' && !data.starts_at) ctx.addIssue({ code: 'custom', message: 'starts_at is required for create', path: ['starts_at'] });
  if (data.action === 'create' && !data.ends_at) ctx.addIssue({ code: 'custom', message: 'ends_at is required for create', path: ['ends_at'] });
  if (data.action === 'update' && !data.event_id) ctx.addIssue({ code: 'custom', message: 'event_id is required for update', path: ['event_id'] });
});
const taskWorkspaceManageSchema = z.object({
  action: actionSchema,
  workspace_id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(200).optional(),
  order: z.number().int().min(0).optional(),
  color: z.string().max(20).nullable().optional(),
  icon: z.string().max(60).nullable().optional(),
}).superRefine((data, ctx) => {
  if (data.action === 'create' && !data.name) ctx.addIssue({ code: 'custom', message: 'name is required for create', path: ['name'] });
  if (data.action === 'update' && !data.workspace_id) ctx.addIssue({ code: 'custom', message: 'workspace_id is required for update', path: ['workspace_id'] });
});
const taskLabelSchema = z.object({
  id: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(100),
  color: z.string().trim().min(1).max(20),
});
const taskProjectManageSchema = z.object({
  project_id: z.number().int().positive(),
  workspace_id: z.number().int().positive().nullable().optional(),
  name: z.string().trim().min(1).max(200).optional(),
  background_url: z.string().max(2000).nullable().optional(),
  labels: z.array(taskLabelSchema).max(50).optional(),
  order: z.number().int().min(0).optional(),
  color: z.string().max(20).nullable().optional(),
  icon: z.string().max(60).nullable().optional(),
});
const deletableResourceSchema = z.enum([
  'crm_stage_group', 'crm_stage', 'tag', 'department', 'agenda', 'membership_plan', 'membership', 'task_workspace', 'task_project',
  'task_column', 'task', 'document_folder', 'document', 'scheduled_message', 'team_note', 'custom_field', 'calendar_event',
]);
const deleteRecordSchema = z.object({
  resource: deletableResourceSchema,
  record_id: z.number().int().positive(),
  confirm: z.literal(true),
});

async function assertOwnedContact(context: GrokActionContext, contactId: number) {
  const contact = await db.query.contacts.findFirst({
    where: and(eq(contacts.id, contactId), eq(contacts.teamId, context.teamId)),
    columns: { id: true, chatId: true },
  });
  if (!contact) throw new Error('Contact not found.');
  return contact;
}

async function assertOwnedGroups(teamId: number, groupIds: number[]) {
  if (!groupIds.length) return [];
  const uniqueIds = [...new Set(groupIds)];
  const rows = await db.query.funnelStageGroups.findMany({
    where: and(eq(funnelStageGroups.teamId, teamId), inArray(funnelStageGroups.id, uniqueIds)),
  });
  if (rows.length !== uniqueIds.length) throw new Error('One or more CRM stage groups do not belong to this team.');
  return rows;
}

async function replaceStageGroups(teamId: number, stageId: number, groupIds: number[]) {
  await assertOwnedGroups(teamId, groupIds);
  await db.delete(funnelStageGroupMembers).where(eq(funnelStageGroupMembers.stageId, stageId));
  for (const groupId of [...new Set(groupIds)]) {
    const [last] = await db.select({ order: max(funnelStageGroupMembers.order) })
      .from(funnelStageGroupMembers).where(eq(funnelStageGroupMembers.groupId, groupId));
    await db.insert(funnelStageGroupMembers).values({ groupId, stageId, order: (last?.order ?? -1) + 1 });
  }
  await db.update(funnelStages).set({ groupId: groupIds[0] ?? null })
    .where(and(eq(funnelStages.id, stageId), eq(funnelStages.teamId, teamId)));
}

async function manageCrmStageGroup(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'contacts');
  const data = parse(crmGroupSchema, input);
  let group: typeof funnelStageGroups.$inferSelect;
  if (data.action === 'create') {
    const [last] = await db.select({ order: max(funnelStageGroups.order) }).from(funnelStageGroups)
      .where(eq(funnelStageGroups.teamId, context.teamId));
    [group] = await db.insert(funnelStageGroups).values({
      teamId: context.teamId,
      name: data.name!,
      description: data.description ?? null,
      order: data.order ?? (last?.order ?? -1) + 1,
    }).returning();
  } else {
    [group] = await db.update(funnelStageGroups).set({
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.order !== undefined ? { order: data.order } : {}),
    }).where(and(eq(funnelStageGroups.id, data.group_id!), eq(funnelStageGroups.teamId, context.teamId))).returning();
    if (!group) throw new Error('CRM stage group not found.');
  }
  if (data.stage_ids !== undefined) {
    const uniqueStageIds = [...new Set(data.stage_ids)];
    const ownedStages = uniqueStageIds.length ? await db.query.funnelStages.findMany({
      where: and(eq(funnelStages.teamId, context.teamId), inArray(funnelStages.id, uniqueStageIds)),
      columns: { id: true },
    }) : [];
    if (ownedStages.length !== uniqueStageIds.length) throw new Error('One or more CRM stages do not belong to this team.');
    await db.delete(funnelStageGroupMembers).where(eq(funnelStageGroupMembers.groupId, group.id));
    if (uniqueStageIds.length) await db.insert(funnelStageGroupMembers).values(
      uniqueStageIds.map((stageId, order) => ({ groupId: group.id, stageId, order })),
    );
    await db.update(funnelStages).set({ groupId: null })
      .where(and(eq(funnelStages.teamId, context.teamId), eq(funnelStages.groupId, group.id)));
    if (uniqueStageIds.length) await db.update(funnelStages).set({ groupId: group.id })
      .where(and(eq(funnelStages.teamId, context.teamId), inArray(funnelStages.id, uniqueStageIds)));
  }
  await audit(context, data.action === 'create' ? 'GROK_CRM_STAGE_GROUP_CREATED' : 'GROK_CRM_STAGE_GROUP_UPDATED', group.id);
  return { success: true, created: data.action === 'create', group };
}

async function manageCrmStage(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'contacts');
  const data = parse(crmStageSchema, input);
  if (data.group_ids !== undefined) await assertOwnedGroups(context.teamId, data.group_ids);
  let stage: typeof funnelStages.$inferSelect;
  if (data.action === 'create') {
    const [last] = await db.select({ order: max(funnelStages.order) }).from(funnelStages)
      .where(eq(funnelStages.teamId, context.teamId));
    [stage] = await db.insert(funnelStages).values({
      teamId: context.teamId,
      name: data.name!,
      emoji: data.emoji ?? '📁',
      groupId: data.group_ids?.[0] ?? null,
      order: data.order ?? (last?.order ?? -1) + 1,
    }).returning();
  } else {
    [stage] = await db.update(funnelStages).set({
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.emoji !== undefined ? { emoji: data.emoji ?? '📁' } : {}),
      ...(data.order !== undefined ? { order: data.order } : {}),
      ...(data.group_ids !== undefined ? { groupId: data.group_ids[0] ?? null } : {}),
    }).where(and(eq(funnelStages.id, data.stage_id!), eq(funnelStages.teamId, context.teamId))).returning();
    if (!stage) throw new Error('CRM stage not found.');
  }
  if (data.group_ids !== undefined) await replaceStageGroups(context.teamId, stage.id, data.group_ids);
  await audit(context, data.action === 'create' ? 'GROK_CRM_STAGE_CREATED' : 'GROK_CRM_STAGE_UPDATED', stage.id);
  return { success: true, created: data.action === 'create', stage };
}

async function manageTag(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'contacts');
  const data = parse(tagSchema, input);
  let tag: typeof tags.$inferSelect;
  if (data.action === 'create') {
    const existing = await db.query.tags.findFirst({
      where: and(eq(tags.teamId, context.teamId), ilike(tags.name, data.name!)),
    });
    if (existing) return { success: true, created: false, already_exists: true, tag: existing };
    [tag] = await db.insert(tags).values({ teamId: context.teamId, name: data.name!, color: data.color ?? 'gray' }).returning();
  } else {
    [tag] = await db.update(tags).set({
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.color !== undefined ? { color: data.color } : {}),
    }).where(and(eq(tags.id, data.tag_id!), eq(tags.teamId, context.teamId))).returning();
    if (!tag) throw new Error('Tag not found.');
  }
  await audit(context, data.action === 'create' ? 'GROK_CRM_TAG_CREATED' : 'GROK_CRM_TAG_UPDATED', tag.id);
  return { success: true, created: data.action === 'create', tag };
}

async function assertOwnedDepartment(context: GrokActionContext, departmentId: number) {
  const department = await db.query.departments.findFirst({
    where: and(eq(departments.id, departmentId), eq(departments.teamId, context.teamId)),
  });
  if (!department) throw new Error('Department not found.');
  return department;
}

async function manageDepartment(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'contacts');
  const data = parse(departmentManageSchema, input);
  if (data.action === 'create') {
    const existing = await db.query.departments.findFirst({ where: and(
      eq(departments.teamId, context.teamId), ilike(departments.name, data.name!),
    ) });
    if (existing) return { success: true, created: false, already_exists: true, department: existing };
    const [department] = await db.insert(departments).values({
      teamId: context.teamId,
      name: data.name!,
      description: data.description ?? null,
    }).returning();
    await audit(context, 'GROK_DEPARTMENT_CREATED', department.id);
    return { success: true, created: true, department };
  }
  const [department] = await db.update(departments).set({
    ...(data.name !== undefined ? { name: data.name } : {}),
    ...(data.description !== undefined ? { description: data.description } : {}),
  }).where(and(eq(departments.id, data.department_id!), eq(departments.teamId, context.teamId))).returning();
  if (!department) throw new Error('Department not found.');
  await audit(context, 'GROK_DEPARTMENT_UPDATED', department.id);
  return { success: true, created: false, department };
}

async function manageDepartmentMember(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'contacts');
  const data = parse(departmentMemberManageSchema, input);
  await assertOwnedDepartment(context, data.department_id);
  const member = await db.query.teamMembers.findFirst({ where: and(
    eq(teamMembers.teamId, context.teamId), eq(teamMembers.userId, data.user_id),
  ), columns: { userId: true } });
  if (!member) throw new Error('User is not a member of this team.');
  if (data.action === 'remove') {
    const removed = await db.delete(departmentMembers).where(and(
      eq(departmentMembers.departmentId, data.department_id),
      eq(departmentMembers.userId, data.user_id),
    )).returning({ id: departmentMembers.id });
    await audit(context, 'GROK_DEPARTMENT_MEMBER_REMOVED', data.department_id);
    return { success: true, removed: removed.length > 0, department_id: data.department_id, user_id: data.user_id };
  }
  const [departmentMember] = await db.insert(departmentMembers).values({
    departmentId: data.department_id,
    userId: data.user_id,
  }).onConflictDoNothing().returning();
  await audit(context, 'GROK_DEPARTMENT_MEMBER_ADDED', data.department_id);
  return {
    success: true,
    added: Boolean(departmentMember),
    already_assigned: !departmentMember,
    department_id: data.department_id,
    user_id: data.user_id,
  };
}

async function setContactTags(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'contacts');
  const data = parse(setContactTagsSchema, input);
  await assertOwnedContact(context, data.contact_id);
  const uniqueIds = [...new Set(data.tag_ids)];
  const ownedTags = uniqueIds.length ? await db.query.tags.findMany({
    where: and(eq(tags.teamId, context.teamId), inArray(tags.id, uniqueIds)),
    columns: { id: true, name: true, color: true },
  }) : [];
  if (ownedTags.length !== uniqueIds.length) throw new Error('One or more tags do not belong to this team.');
  if (data.mode === 'replace') await db.delete(contactTags).where(eq(contactTags.contactId, data.contact_id));
  if (data.mode === 'remove' && uniqueIds.length) await db.delete(contactTags)
    .where(and(eq(contactTags.contactId, data.contact_id), inArray(contactTags.tagId, uniqueIds)));
  if ((data.mode === 'add' || data.mode === 'replace') && uniqueIds.length) await db.insert(contactTags)
    .values(uniqueIds.map((tagId) => ({ contactId: data.contact_id, tagId }))).onConflictDoNothing();
  const assigned = await db.query.contactTags.findMany({
    where: eq(contactTags.contactId, data.contact_id),
    with: { tag: { columns: { id: true, name: true, color: true } } },
  });
  await audit(context, 'GROK_CONTACT_TAGS_UPDATED', data.contact_id);
  return { success: true, contact_id: data.contact_id, tags: assigned.map((row) => row.tag) };
}

async function manageAgenda(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'contacts');
  const data = parse(agendaManageSchema, input);
  if (data.funnel_stage_group_id != null) await assertOwnedGroups(context.teamId, [data.funnel_stage_group_id]);
  let agenda: typeof dashboardBookmarkGroups.$inferSelect;
  if (data.action === 'create') {
    const [last] = await db.select({ order: max(dashboardBookmarkGroups.order) }).from(dashboardBookmarkGroups)
      .where(eq(dashboardBookmarkGroups.teamId, context.teamId));
    [agenda] = await db.insert(dashboardBookmarkGroups).values({
      teamId: context.teamId,
      name: data.name!,
      color: data.color ?? '#2563EB',
      funnelStageGroupId: data.funnel_stage_group_id ?? null,
      order: data.order ?? (last?.order ?? -1) + 1,
      createdBy: context.userId,
    }).returning();
  } else {
    [agenda] = await db.update(dashboardBookmarkGroups).set({
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.color !== undefined ? { color: data.color } : {}),
      ...(data.funnel_stage_group_id !== undefined ? { funnelStageGroupId: data.funnel_stage_group_id } : {}),
      ...(data.order !== undefined ? { order: data.order } : {}),
      updatedAt: new Date(),
    }).where(and(eq(dashboardBookmarkGroups.id, data.agenda_id!), eq(dashboardBookmarkGroups.teamId, context.teamId))).returning();
    if (!agenda) throw new Error('Agenda not found.');
  }
  await audit(context, data.action === 'create' ? 'GROK_AGENDA_CREATED' : 'GROK_AGENDA_UPDATED', agenda.id);
  return { success: true, created: data.action === 'create', agenda };
}

async function manageAgendaContact(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'contacts');
  const data = parse(agendaContactSchema, input);
  const [contact, agenda] = await Promise.all([
    assertOwnedContact(context, data.contact_id),
    db.query.dashboardBookmarkGroups.findFirst({
      where: and(eq(dashboardBookmarkGroups.id, data.agenda_id), eq(dashboardBookmarkGroups.teamId, context.teamId)),
    }),
  ]);
  if (!agenda) throw new Error('Agenda not found.');
  if (data.action === 'remove') {
    const removed = await db.delete(dashboardBookmarkItems).where(and(
      eq(dashboardBookmarkItems.teamId, context.teamId),
      eq(dashboardBookmarkItems.groupId, agenda.id),
      eq(dashboardBookmarkItems.chatId, contact.chatId),
    )).returning({ id: dashboardBookmarkItems.id });
    await audit(context, 'GROK_CONTACT_REMOVED_FROM_AGENDA', contact.id);
    return { success: true, removed: removed.length > 0, contact_id: contact.id, agenda_id: agenda.id };
  }
  if (data.action === 'move') {
    const sourceFilter = data.source_agenda_id ? eq(dashboardBookmarkItems.groupId, data.source_agenda_id) : undefined;
    await db.delete(dashboardBookmarkItems).where(and(
      eq(dashboardBookmarkItems.teamId, context.teamId),
      eq(dashboardBookmarkItems.chatId, contact.chatId),
      sourceFilter,
    ));
  }
  const existing = await db.query.dashboardBookmarkItems.findFirst({ where: and(
    eq(dashboardBookmarkItems.teamId, context.teamId),
    eq(dashboardBookmarkItems.groupId, agenda.id),
    eq(dashboardBookmarkItems.chatId, contact.chatId),
  ) });
  if (existing) return { success: true, already_assigned: true, item: existing, agenda };
  const [last] = await db.select({ order: max(dashboardBookmarkItems.order) }).from(dashboardBookmarkItems)
    .where(and(eq(dashboardBookmarkItems.teamId, context.teamId), eq(dashboardBookmarkItems.groupId, agenda.id)));
  const [item] = await db.insert(dashboardBookmarkItems).values({
    teamId: context.teamId,
    groupId: agenda.id,
    entityType: 'chat',
    chatId: contact.chatId,
    order: (last?.order ?? -1) + 1,
    createdBy: context.userId,
  }).returning();
  await audit(context, data.action === 'move' ? 'GROK_CONTACT_MOVED_TO_AGENDA' : 'GROK_CONTACT_ASSIGNED_TO_AGENDA', item.id);
  return { success: true, already_assigned: false, item, agenda };
}

async function manageMembershipPlan(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'membershipsWrite', 'memberships');
  const data = parse(planManageSchema, input);
  if (!(await assertCompanyOwnership(context.teamId, data.company_id))) throw new Error('Membership company not found.');
  if (data.action === 'create' && data.idempotency_key) {
    const existing = await db.query.teamMembershipPlans.findFirst({ where: and(
      eq(teamMembershipPlans.teamId, context.teamId),
      eq(teamMembershipPlans.externalSource, 'grok'),
      eq(teamMembershipPlans.externalId, data.idempotency_key),
    ) });
    if (existing) return { success: true, created: false, already_created: true, plan: existing };
  }
  let plan: typeof teamMembershipPlans.$inferSelect;
  if (data.action === 'create') {
    [plan] = await db.insert(teamMembershipPlans).values({
      teamId: context.teamId,
      companyId: data.company_id ?? null,
      name: data.name!,
      description: data.description ?? '',
      billingType: data.billing_type ?? 'monthly',
      price: data.price ?? 0,
      setupFee: data.setup_fee ?? 0,
      maintenanceAmount: data.maintenance_amount ?? 0,
      maintenanceIntervalMonths: data.maintenance_interval_months ?? null,
      billingLabel: data.billing_type === 'custom' ? data.billing_label ?? null : null,
      currency: (data.currency ?? 'USD').toUpperCase(),
      features: (data.features ?? []) as MembershipFeature[],
      visibility: data.visibility ?? 'public',
      status: data.status ?? 'active',
      position: data.position ?? 0,
      externalSource: data.idempotency_key ? 'grok' : null,
      externalId: data.idempotency_key ?? null,
      createdBy: context.userId,
      updatedBy: context.userId,
    }).returning();
  } else {
    const current = await db.query.teamMembershipPlans.findFirst({ where: and(
      eq(teamMembershipPlans.id, data.plan_id!), eq(teamMembershipPlans.teamId, context.teamId),
    ) });
    if (!current) throw new Error('Membership plan not found.');
    const nextBillingType = data.billing_type ?? current.billingType;
    [plan] = await db.update(teamMembershipPlans).set({
      ...(data.company_id !== undefined ? { companyId: data.company_id } : {}),
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.billing_type !== undefined ? { billingType: data.billing_type } : {}),
      ...(data.price !== undefined ? { price: data.price } : {}),
      ...(data.setup_fee !== undefined ? { setupFee: data.setup_fee } : {}),
      ...(data.maintenance_amount !== undefined ? { maintenanceAmount: data.maintenance_amount } : {}),
      ...(data.maintenance_interval_months !== undefined ? { maintenanceIntervalMonths: data.maintenance_interval_months } : {}),
      ...(data.billing_label !== undefined || data.billing_type !== undefined
        ? { billingLabel: nextBillingType === 'custom' ? data.billing_label ?? current.billingLabel : null }
        : {}),
      ...(data.currency !== undefined ? { currency: data.currency.toUpperCase() } : {}),
      ...(data.features !== undefined ? { features: data.features as MembershipFeature[] } : {}),
      ...(data.visibility !== undefined ? { visibility: data.visibility } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.position !== undefined ? { position: data.position } : {}),
      updatedBy: context.userId,
      updatedAt: new Date(),
    }).where(and(eq(teamMembershipPlans.id, data.plan_id!), eq(teamMembershipPlans.teamId, context.teamId))).returning();
  }
  await audit(context, data.action === 'create' ? 'GROK_MEMBERSHIP_PLAN_CREATED' : 'GROK_MEMBERSHIP_PLAN_UPDATED', plan.id);
  return { success: true, created: data.action === 'create', plan };
}

async function updateMembership(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'membershipsWrite', 'memberships');
  const data = parse(membershipUpdateSchema, input);
  const existing = await db.query.teamMembershipSubscriptions.findFirst({ where: and(
    eq(teamMembershipSubscriptions.id, data.membership_id), eq(teamMembershipSubscriptions.teamId, context.teamId),
  ) });
  if (!existing) throw new Error('Membership not found.');
  if (data.contact_id != null) await assertOwnedContact(context, data.contact_id);
  if (data.customer_id != null) {
    const customer = await db.query.teamCustomers.findFirst({ where: and(
      eq(teamCustomers.id, data.customer_id), eq(teamCustomers.teamId, context.teamId),
    ), columns: { id: true } });
    if (!customer) throw new Error('Customer not found.');
  }
  const nextCustomerId = data.customer_id !== undefined ? data.customer_id : existing.customerId;
  const nextContactId = data.contact_id !== undefined ? data.contact_id : existing.contactId;
  if (nextCustomerId == null && nextContactId == null) throw new Error('A membership requires a customer_id or contact_id.');
  const planPatch: Record<string, unknown> = {};
  if (data.plan_id !== undefined) {
    if (data.plan_id === null) Object.assign(planPatch, { planId: null, companyId: null, planNameSnapshot: '' });
    else {
      const plan = await db.query.teamMembershipPlans.findFirst({ where: and(
        eq(teamMembershipPlans.id, data.plan_id), eq(teamMembershipPlans.teamId, context.teamId),
      ) });
      if (!plan) throw new Error('Membership plan not found.');
      Object.assign(planPatch, { planId: plan.id, companyId: plan.companyId, planNameSnapshot: plan.name });
    }
  }
  const [membership] = await db.update(teamMembershipSubscriptions).set({
    ...planPatch,
    ...(data.subscription_number !== undefined ? { subscriptionNumber: data.subscription_number } : {}),
    ...(data.customer_id !== undefined ? { customerId: data.customer_id } : {}),
    ...(data.contact_id !== undefined ? { contactId: data.contact_id } : {}),
    ...(data.price !== undefined ? { price: data.price } : {}),
    ...(data.currency !== undefined ? { currency: data.currency.toUpperCase() } : {}),
    ...(data.billing_type !== undefined ? { billingType: data.billing_type } : {}),
    ...(data.status !== undefined ? { status: data.status } : {}),
    ...(data.payment_status !== undefined ? { paymentStatus: data.payment_status } : {}),
    ...(data.start_date !== undefined ? { startDate: data.start_date } : {}),
    ...(data.end_date !== undefined ? { endDate: data.end_date } : {}),
    ...(data.notes !== undefined ? { notes: data.notes } : {}),
    ...(data.end_date !== undefined && data.end_date !== existing.endDate ? { remindersSent: [] } : {}),
    updatedBy: context.userId,
    updatedAt: new Date(),
  }).where(and(eq(teamMembershipSubscriptions.id, data.membership_id), eq(teamMembershipSubscriptions.teamId, context.teamId))).returning();
  await audit(context, 'GROK_MEMBERSHIP_UPDATED', membership.id);
  return { success: true, membership };
}

function taskValues(task: z.infer<typeof taskBaseSchema>) {
  return {
    title: task.title,
    notes: task.notes,
    labelIds: task.label_ids,
    checklist: task.checklist as TaskChecklistItem[],
    status: task.status,
    completedAt: task.status === 'done' ? new Date() : null,
    dueDate: task.due_date ? new Date(task.due_date) : null,
    startDate: task.start_date ? new Date(task.start_date) : null,
    endDate: task.end_date ? new Date(task.end_date) : null,
    color: task.color ?? null,
    icon: task.icon ?? null,
  };
}

async function resolveTaskWorkspace(context: GrokActionContext, workspaceId?: number, workspaceName?: string) {
  if (workspaceId) {
    const workspace = await db.query.teamTaskWorkspaces.findFirst({ where: and(
      eq(teamTaskWorkspaces.id, workspaceId), eq(teamTaskWorkspaces.teamId, context.teamId),
    ) });
    if (!workspace) throw new Error('Task workspace not found.');
    return workspace;
  }
  if (workspaceName) {
    const existing = await db.query.teamTaskWorkspaces.findFirst({ where: and(
      eq(teamTaskWorkspaces.teamId, context.teamId), ilike(teamTaskWorkspaces.name, workspaceName),
    ) });
    if (existing) return existing;
    const [last] = await db.select({ order: max(teamTaskWorkspaces.order) }).from(teamTaskWorkspaces)
      .where(eq(teamTaskWorkspaces.teamId, context.teamId));
    const [created] = await db.insert(teamTaskWorkspaces).values({
      teamId: context.teamId,
      name: workspaceName,
      order: (last?.order ?? -1) + 1,
      createdBy: context.userId,
    }).returning();
    return created;
  }
  return ensureDefaultTaskWorkspace(context.teamId, context.userId);
}

async function createTaskProject(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'tasksWrite', 'tasks');
  const data = parse(taskProjectSchema, input);
  const workspace = await resolveTaskWorkspace(context, data.workspace_id, data.workspace_name);
  const labelIds = new Set(data.labels.map((label) => label.id));
  for (const column of data.columns) for (const task of column.tasks) {
    const unknown = [...task.label_ids, ...task.subtasks.flatMap((subtask) => subtask.label_ids)].filter((id) => !labelIds.has(id));
    if (unknown.length) throw new Error(`Unknown project label IDs: ${[...new Set(unknown)].join(', ')}.`);
  }
  const result = await db.transaction(async (tx) => {
    const [lastProject] = await tx.select({ order: max(teamTaskProjects.order) }).from(teamTaskProjects)
      .where(eq(teamTaskProjects.teamId, context.teamId));
    const [project] = await tx.insert(teamTaskProjects).values({
      teamId: context.teamId,
      workspaceId: workspace.id,
      name: data.name,
      backgroundUrl: data.background_url ?? null,
      labels: data.labels as TaskLabel[],
      order: (lastProject?.order ?? -1) + 1,
      color: data.color ?? null,
      icon: data.icon ?? null,
      createdBy: context.userId,
    }).returning();
    const columns = await tx.insert(teamTaskColumns).values(data.columns.map((column, order) => ({
      projectId: project.id,
      teamId: context.teamId,
      title: column.title,
      order,
      color: column.color ?? null,
      icon: column.icon ?? null,
    }))).returning();
    const tasks: Array<typeof teamTaskItems.$inferSelect> = [];
    for (const [columnIndex, columnInput] of data.columns.entries()) {
      const column = columns[columnIndex];
      let order = 0;
      for (const taskInput of columnInput.tasks) {
        const [task] = await tx.insert(teamTaskItems).values({
          teamId: context.teamId,
          projectId: project.id,
          columnId: column.id,
          parentTaskId: null,
          order: order++,
          createdBy: context.userId,
          ...taskValues(taskInput),
        }).returning();
        await tx.insert(teamTaskItemLocations).values({
          taskId: task.id, teamId: context.teamId, projectId: project.id, columnId: column.id, order: task.order, isPrimary: true,
        });
        tasks.push(task);
        for (const subtaskInput of taskInput.subtasks) {
          const [subtask] = await tx.insert(teamTaskItems).values({
            teamId: context.teamId,
            projectId: project.id,
            columnId: column.id,
            parentTaskId: task.id,
            order: order++,
            createdBy: context.userId,
            ...taskValues(subtaskInput),
          }).returning();
          await tx.insert(teamTaskItemLocations).values({
            taskId: subtask.id, teamId: context.teamId, projectId: project.id, columnId: column.id, order: subtask.order, isPrimary: true,
          });
          tasks.push(subtask);
        }
      }
    }
    return { project, columns, tasks };
  });
  await audit(context, 'GROK_TASK_PROJECT_CREATED', result.project.id);
  return { success: true, workspace, ...result };
}

async function manageTaskColumn(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'tasksWrite', 'tasks');
  const data = parse(taskColumnSchema, input);
  let column: typeof teamTaskColumns.$inferSelect;
  if (data.action === 'create') {
    const project = await db.query.teamTaskProjects.findFirst({ where: and(
      eq(teamTaskProjects.id, data.project_id!), eq(teamTaskProjects.teamId, context.teamId),
    ) });
    if (!project) throw new Error('Task project not found.');
    const [last] = await db.select({ order: max(teamTaskColumns.order) }).from(teamTaskColumns)
      .where(and(eq(teamTaskColumns.projectId, project.id), eq(teamTaskColumns.teamId, context.teamId)));
    [column] = await db.insert(teamTaskColumns).values({
      teamId: context.teamId,
      projectId: project.id,
      title: data.title!,
      order: data.order ?? (last?.order ?? -1) + 1,
      color: data.color ?? null,
      icon: data.icon ?? null,
    }).returning();
  } else {
    [column] = await db.update(teamTaskColumns).set({
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.order !== undefined ? { order: data.order } : {}),
      ...(data.color !== undefined ? { color: data.color } : {}),
      ...(data.icon !== undefined ? { icon: data.icon } : {}),
      updatedAt: new Date(),
    }).where(and(eq(teamTaskColumns.id, data.column_id!), eq(teamTaskColumns.teamId, context.teamId))).returning();
    if (!column) throw new Error('Task column not found.');
  }
  await audit(context, data.action === 'create' ? 'GROK_TASK_COLUMN_CREATED' : 'GROK_TASK_COLUMN_UPDATED', column.id);
  return { success: true, created: data.action === 'create', column };
}

async function manageTask(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'tasksWrite', 'tasks');
  const data = parse(taskManageSchema, input);
  if (data.parent_task_id != null) {
    const parent = await db.query.teamTaskItems.findFirst({ where: and(
      eq(teamTaskItems.id, data.parent_task_id), eq(teamTaskItems.teamId, context.teamId),
    ) });
    if (!parent) throw new Error('Parent task not found.');
  }
  if (data.action === 'create') {
    const task = await createTaskInColumn({
      teamId: context.teamId,
      userId: context.userId,
      columnId: data.column_id!,
      title: data.title!,
      notes: data.notes,
      labelIds: data.label_ids,
      checklist: data.checklist as TaskChecklistItem[] | undefined,
      status: data.status,
      dueDate: data.due_date,
      startDate: data.start_date,
      endDate: data.end_date,
      parentTaskId: data.parent_task_id,
      color: data.color,
      icon: data.icon,
    });
    if (!task) throw new Error('Task column not found.');
    await audit(context, 'GROK_TASK_CREATED', task.id);
    return { success: true, created: true, task };
  }
  if (data.parent_task_id === data.task_id) throw new Error('A task cannot be its own parent.');
  const result = await patchTaskItem({ teamId: context.teamId, taskId: data.task_id!, patch: {
    ...(data.title !== undefined ? { title: data.title } : {}),
    ...(data.notes !== undefined ? { notes: data.notes } : {}),
    ...(data.label_ids !== undefined ? { labelIds: data.label_ids } : {}),
    ...(data.checklist !== undefined ? { checklist: data.checklist as TaskChecklistItem[] } : {}),
    ...(data.status !== undefined ? { status: data.status } : {}),
    ...(data.due_date !== undefined ? { dueDate: data.due_date } : {}),
    ...(data.start_date !== undefined ? { startDate: data.start_date } : {}),
    ...(data.end_date !== undefined ? { endDate: data.end_date } : {}),
    ...(data.column_id !== undefined ? { columnId: data.column_id } : {}),
    ...(data.parent_task_id !== undefined ? { parentTaskId: data.parent_task_id } : {}),
    ...(data.color !== undefined ? { color: data.color } : {}),
    ...(data.icon !== undefined ? { icon: data.icon } : {}),
  } });
  if ('error' in result) throw new Error(`Could not update task: ${result.error}.`);
  await audit(context, 'GROK_TASK_UPDATED', result.item.id);
  return { success: true, created: false, task: result.item };
}

async function createTaskForContact(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'tasksWrite', 'tasks');
  const data = parse(contactTaskSchema, input);
  const result = await createContactTask({
    teamId: context.teamId,
    userId: context.userId,
    contactId: data.contact_id,
    title: data.title,
    notes: data.notes,
    dueDate: data.due_date,
    status: data.status,
  });
  if ('error' in result) throw new Error(`Could not create contact task: ${result.error}.`);
  await audit(context, 'GROK_CONTACT_TASK_CREATED', result.task.id);
  return { success: true, created: true, contact_id: data.contact_id, task: result.task };
}

async function manageDocumentFolder(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'documentsWrite', 'documents');
  const data = parse(folderManageSchema, input);
  let folder;
  if (data.action === 'create') folder = await createFolder({
    teamId: context.teamId, userId: context.userId, name: data.name!, emoji: data.emoji, parentId: data.parent_id,
  });
  else if (data.action === 'update') folder = await updateFolder({
    teamId: context.teamId, id: data.folder_id!, name: data.name, emoji: data.emoji,
  });
  else folder = await moveFolder({ teamId: context.teamId, id: data.folder_id!, parentId: data.parent_id! });
  await audit(context, `GROK_DOCUMENT_FOLDER_${data.action.toUpperCase()}D`, folder.id);
  return { success: true, action: data.action, folder };
}

async function manageDocument(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'documentsWrite', 'documents');
  const data = parse(documentManageSchema, input);
  const format = data.format === 'html' ? 'html' as const : undefined;
  const content = format !== 'html' && data.markdown !== undefined ? markdownToProseMirror(data.markdown) : undefined;
  const document = data.action === 'create'
    ? await createDocument({
        teamId: context.teamId, userId: context.userId, title: data.title, emoji: data.emoji, folderId: data.folder_id,
        content, format, htmlContent: data.html,
      })
    : await updateDocument({
        teamId: context.teamId, userId: context.userId, id: data.document_id!, title: data.title, emoji: data.emoji,
        folderId: data.folder_id, content, format, htmlContent: data.html, version: data.version,
      });
  await audit(context, data.action === 'create' ? 'GROK_DOCUMENT_CREATED' : 'GROK_DOCUMENT_UPDATED', document.id);
  return { success: true, created: data.action === 'create', document };
}

async function assertScheduledReferences(context: GrokActionContext, instanceId?: number | null, automationId?: number | null) {
  if (instanceId != null) {
    const instance = await db.query.evolutionInstances.findFirst({ where: and(
      eq(evolutionInstances.id, instanceId), eq(evolutionInstances.teamId, context.teamId),
    ), columns: { id: true } });
    if (!instance) throw new Error('WhatsApp instance not found.');
  }
  if (automationId != null) {
    const automation = await db.query.automations.findFirst({ where: and(
      eq(automations.id, automationId), eq(automations.teamId, context.teamId),
    ), columns: { id: true } });
    if (!automation) throw new Error('Automation not found.');
  }
}

async function manageScheduledMessage(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'scheduledMessagesWrite', 'scheduled-messages');
  const data = parse(scheduledManageSchema, input);
  await assertScheduledReferences(context, data.instance_id, data.automation_id);
  if (data.action === 'create') {
    const scheduleType = data.schedule_type ?? 'once';
    const scheduledAt = data.scheduled_at ? new Date(data.scheduled_at) : null;
    const [scheduledMessage] = await db.insert(teamScheduledMessages).values({
      teamId: context.teamId,
      name: data.name!,
      status: data.status ?? 'active',
      instanceId: data.instance_id ?? null,
      targetNumbers: data.target_numbers ?? [],
      scheduleType,
      scheduledAt,
      hour: data.hour ?? null,
      minute: data.minute ?? null,
      weekdays: data.weekdays ?? [],
      actionType: data.action_type ?? 'message',
      message: data.message ?? null,
      mediaUrl: data.media_url ?? null,
      automationId: data.automation_id ?? null,
      maxRuns: data.max_runs ?? null,
      nextRunAt: computeNextRunAt({ scheduleType, scheduledAt, hour: data.hour, minute: data.minute, weekdays: data.weekdays }),
      createdBy: context.userId,
    }).returning();
    await audit(context, 'GROK_SCHEDULED_MESSAGE_CREATED', scheduledMessage.id);
    return { success: true, created: true, scheduled_message: scheduledMessage };
  }
  const existing = await db.query.teamScheduledMessages.findFirst({ where: and(
    eq(teamScheduledMessages.id, data.scheduled_message_id!), eq(teamScheduledMessages.teamId, context.teamId),
  ) });
  if (!existing) throw new Error('Scheduled message not found.');
  const scheduleType = data.schedule_type ?? existing.scheduleType;
  const scheduledAt = data.scheduled_at !== undefined ? (data.scheduled_at ? new Date(data.scheduled_at) : null) : existing.scheduledAt;
  const hour = data.hour !== undefined ? data.hour : existing.hour;
  const minute = data.minute !== undefined ? data.minute : existing.minute;
  const weekdays = data.weekdays ?? existing.weekdays as number[];
  const recompute = data.schedule_type !== undefined || data.scheduled_at !== undefined || data.hour !== undefined
    || data.minute !== undefined || data.weekdays !== undefined || data.status === 'active';
  const [scheduledMessage] = await db.update(teamScheduledMessages).set({
    ...(data.name !== undefined ? { name: data.name } : {}),
    ...(data.status !== undefined ? { status: data.status } : {}),
    ...(data.instance_id !== undefined ? { instanceId: data.instance_id } : {}),
    ...(data.target_numbers !== undefined ? { targetNumbers: data.target_numbers } : {}),
    ...(data.schedule_type !== undefined ? { scheduleType: data.schedule_type } : {}),
    ...(data.scheduled_at !== undefined ? { scheduledAt } : {}),
    ...(data.hour !== undefined ? { hour: data.hour } : {}),
    ...(data.minute !== undefined ? { minute: data.minute } : {}),
    ...(data.weekdays !== undefined ? { weekdays: data.weekdays } : {}),
    ...(data.action_type !== undefined ? { actionType: data.action_type } : {}),
    ...(data.message !== undefined ? { message: data.message } : {}),
    ...(data.media_url !== undefined ? { mediaUrl: data.media_url } : {}),
    ...(data.automation_id !== undefined ? { automationId: data.automation_id } : {}),
    ...(data.max_runs !== undefined ? { maxRuns: data.max_runs } : {}),
    ...(recompute ? { nextRunAt: computeNextRunAt({ scheduleType, scheduledAt, hour, minute, weekdays }) } : {}),
    updatedAt: new Date(),
  }).where(and(eq(teamScheduledMessages.id, existing.id), eq(teamScheduledMessages.teamId, context.teamId))).returning();
  await audit(context, 'GROK_SCHEDULED_MESSAGE_UPDATED', scheduledMessage.id);
  return { success: true, created: false, scheduled_message: scheduledMessage };
}

function buildCustomFieldKey(name: string) {
  const key = name
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 100);
  return key || `field_${Date.now()}`;
}

function parseOptionalDate(value: string | null | undefined) {
  if (value == null || value === '') return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid date.');
  return date;
}

async function manageCustomField(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'contacts');
  await ensureCustomFieldsTable();
  const data = parse(customFieldManageSchema, input);
  if (data.action === 'create') {
    const key = data.key ?? buildCustomFieldKey(data.name!);
    const existing = await db.query.customFields.findFirst({ where: and(
      eq(customFields.teamId, context.teamId), eq(customFields.key, key),
    ) });
    if (existing) return { success: true, created: false, already_exists: true, field: existing };
    const [last] = await db.select({ position: max(customFields.position) }).from(customFields)
      .where(eq(customFields.teamId, context.teamId));
    const [field] = await db.insert(customFields).values({
      teamId: context.teamId,
      name: data.name!,
      key,
      type: data.field_type ?? 'text',
      position: data.position ?? (last?.position ?? -1) + 1,
    }).returning();
    await audit(context, 'GROK_CUSTOM_FIELD_CREATED', field.id);
    return { success: true, created: true, field };
  }
  const [field] = await db.update(customFields).set({
    ...(data.name !== undefined ? { name: data.name } : {}),
    ...(data.field_type !== undefined ? { type: data.field_type } : {}),
    ...(data.position !== undefined ? { position: data.position } : {}),
  }).where(and(eq(customFields.id, data.field_id!), eq(customFields.teamId, context.teamId))).returning();
  if (!field) throw new Error('Custom field not found.');
  await audit(context, 'GROK_CUSTOM_FIELD_UPDATED', field.id);
  return { success: true, created: false, field };
}

async function manageNote(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'notesWrite', 'notes');
  const data = parse(noteManageSchema, input);
  if (data.action === 'create') {
    const [note] = await db.insert(teamNotes).values({
      teamId: context.teamId,
      title: data.title!,
      content: data.content ?? '',
      tags: data.tags ?? [],
      pinned: data.pinned ?? false,
      status: data.status ?? 'todo',
      dueDate: parseOptionalDate(data.due_date),
      createdBy: context.userId,
      updatedBy: context.userId,
    }).returning();
    await audit(context, 'GROK_TEAM_NOTE_CREATED', note.id);
    return { success: true, created: true, note };
  }
  const [note] = await db.update(teamNotes).set({
    ...(data.title !== undefined ? { title: data.title } : {}),
    ...(data.content !== undefined ? { content: data.content } : {}),
    ...(data.tags !== undefined ? { tags: data.tags } : {}),
    ...(data.pinned !== undefined ? { pinned: data.pinned } : {}),
    ...(data.status !== undefined ? { status: data.status } : {}),
    ...(data.due_date !== undefined ? { dueDate: parseOptionalDate(data.due_date) } : {}),
    updatedBy: context.userId,
    updatedAt: new Date(),
  }).where(and(eq(teamNotes.id, data.note_id!), eq(teamNotes.teamId, context.teamId))).returning();
  if (!note) throw new Error('Team note not found.');
  await audit(context, 'GROK_TEAM_NOTE_UPDATED', note.id);
  return { success: true, created: false, note };
}

async function assertCalendarReferences(
  context: GrokActionContext,
  data: Pick<z.infer<typeof calendarEventManageSchema>, 'department_id' | 'related_user_id' | 'contact_id'>,
) {
  if (data.department_id != null) {
    const department = await db.query.departments.findFirst({ where: and(
      eq(departments.id, data.department_id), eq(departments.teamId, context.teamId),
    ), columns: { id: true } });
    if (!department) throw new Error('Department not found.');
  }
  if (data.related_user_id != null) {
    const member = await db.query.teamMembers.findFirst({ where: and(
      eq(teamMembers.userId, data.related_user_id), eq(teamMembers.teamId, context.teamId),
    ), columns: { userId: true } });
    if (!member) throw new Error('Team member not found.');
  }
  if (data.contact_id != null) await assertOwnedContact(context, data.contact_id);
}

async function manageCalendarEvent(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'calendarWrite', 'calendar');
  const data = parse(calendarEventManageSchema, input);
  await assertCalendarReferences(context, data);
  const existing = data.action === 'update'
    ? await db.query.teamEvents.findFirst({ where: and(
        eq(teamEvents.id, data.event_id!), eq(teamEvents.teamId, context.teamId),
      ) })
    : null;
  if (data.action === 'update' && !existing) throw new Error('Calendar event not found.');
  const startsAt = data.starts_at ? new Date(data.starts_at) : existing?.startsAt;
  const endsAt = data.ends_at ? new Date(data.ends_at) : existing?.endsAt;
  if (!startsAt || !endsAt || endsAt <= startsAt) throw new Error('ends_at must be later than starts_at.');

  if (data.validate_overlap) {
    const overlap = await db.query.teamEvents.findFirst({ where: and(
      eq(teamEvents.teamId, context.teamId),
      data.event_id ? ne(teamEvents.id, data.event_id) : undefined,
      or(
        and(lte(teamEvents.startsAt, startsAt), gte(teamEvents.endsAt, startsAt)),
        and(lte(teamEvents.startsAt, endsAt), gte(teamEvents.endsAt, endsAt)),
        and(gte(teamEvents.startsAt, startsAt), lte(teamEvents.endsAt, endsAt)),
      ),
    ), columns: { id: true } });
    if (overlap) throw new Error('A calendar event overlaps this time range.');
  }

  const values = {
    ...(data.title !== undefined ? { title: data.title } : {}),
    ...(data.starts_at !== undefined || data.action === 'create' ? { startsAt } : {}),
    ...(data.ends_at !== undefined || data.action === 'create' ? { endsAt } : {}),
    ...(data.attendees !== undefined ? { attendees: data.attendees } : {}),
    ...(data.notes !== undefined ? { notes: data.notes } : {}),
    ...(data.reminder_at !== undefined ? { reminderAt: parseOptionalDate(data.reminder_at) } : {}),
    ...(data.status !== undefined ? { status: data.status } : {}),
    ...(data.department_id !== undefined ? { departmentId: data.department_id } : {}),
    ...(data.related_user_id !== undefined ? { relatedUserId: data.related_user_id } : {}),
    ...(data.contact_id !== undefined ? { contactId: data.contact_id } : {}),
    updatedBy: context.userId,
    updatedAt: new Date(),
  };
  const [event] = data.action === 'create'
    ? await db.insert(teamEvents).values({
        teamId: context.teamId,
        title: data.title!,
        startsAt,
        endsAt,
        attendees: data.attendees ?? [],
        notes: data.notes ?? '',
        reminderAt: parseOptionalDate(data.reminder_at),
        status: data.status ?? 'scheduled',
        departmentId: data.department_id ?? null,
        relatedUserId: data.related_user_id ?? null,
        contactId: data.contact_id ?? null,
        createdBy: context.userId,
        updatedBy: context.userId,
      }).returning()
    : await db.update(teamEvents).set(values)
        .where(and(eq(teamEvents.id, data.event_id!), eq(teamEvents.teamId, context.teamId))).returning();
  await audit(context, data.action === 'create' ? 'GROK_CALENDAR_EVENT_CREATED' : 'GROK_CALENDAR_EVENT_UPDATED', event.id);
  return { success: true, created: data.action === 'create', event };
}

async function manageTaskWorkspace(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'tasksWrite', 'tasks');
  const data = parse(taskWorkspaceManageSchema, input);
  if (data.action === 'create') {
    const [last] = await db.select({ order: max(teamTaskWorkspaces.order) }).from(teamTaskWorkspaces)
      .where(eq(teamTaskWorkspaces.teamId, context.teamId));
    const [workspace] = await db.insert(teamTaskWorkspaces).values({
      teamId: context.teamId,
      name: data.name!,
      order: data.order ?? (last?.order ?? -1) + 1,
      color: data.color ?? null,
      icon: data.icon ?? null,
      createdBy: context.userId,
    }).returning();
    await audit(context, 'GROK_TASK_WORKSPACE_CREATED', workspace.id);
    return { success: true, created: true, workspace };
  }
  const [workspace] = await db.update(teamTaskWorkspaces).set({
    ...(data.name !== undefined ? { name: data.name } : {}),
    ...(data.order !== undefined ? { order: data.order } : {}),
    ...(data.color !== undefined ? { color: data.color } : {}),
    ...(data.icon !== undefined ? { icon: data.icon } : {}),
    updatedAt: new Date(),
  }).where(and(eq(teamTaskWorkspaces.id, data.workspace_id!), eq(teamTaskWorkspaces.teamId, context.teamId))).returning();
  if (!workspace) throw new Error('Task workspace not found.');
  await audit(context, 'GROK_TASK_WORKSPACE_UPDATED', workspace.id);
  return { success: true, created: false, workspace };
}

async function manageTaskProject(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'tasksWrite', 'tasks');
  const data = parse(taskProjectManageSchema, input);
  if (data.workspace_id != null) {
    const workspace = await db.query.teamTaskWorkspaces.findFirst({ where: and(
      eq(teamTaskWorkspaces.id, data.workspace_id), eq(teamTaskWorkspaces.teamId, context.teamId),
    ), columns: { id: true } });
    if (!workspace) throw new Error('Task workspace not found.');
  }
  const [project] = await db.update(teamTaskProjects).set({
    ...(data.workspace_id !== undefined ? { workspaceId: data.workspace_id } : {}),
    ...(data.name !== undefined ? { name: data.name } : {}),
    ...(data.background_url !== undefined ? { backgroundUrl: data.background_url } : {}),
    ...(data.labels !== undefined ? { labels: data.labels as TaskLabel[] } : {}),
    ...(data.order !== undefined ? { order: data.order } : {}),
    ...(data.color !== undefined ? { color: data.color } : {}),
    ...(data.icon !== undefined ? { icon: data.icon } : {}),
    updatedAt: new Date(),
  }).where(and(eq(teamTaskProjects.id, data.project_id), eq(teamTaskProjects.teamId, context.teamId))).returning();
  if (!project) throw new Error('Task project not found.');
  await audit(context, 'GROK_TASK_PROJECT_UPDATED', project.id);
  return { success: true, project };
}

async function deleteTaskProject(context: GrokActionContext, projectId: number) {
  const project = await db.query.teamTaskProjects.findFirst({ where: and(
    eq(teamTaskProjects.id, projectId), eq(teamTaskProjects.teamId, context.teamId),
  ), columns: { id: true } });
  if (!project) return false;
  const taskRows = await db.query.teamTaskItems.findMany({
    where: and(eq(teamTaskItems.projectId, projectId), eq(teamTaskItems.teamId, context.teamId)),
    columns: { id: true },
  });
  for (const task of taskRows) await deleteTaskItem(context.teamId, task.id);
  await db.delete(teamTaskRelations).where(and(
    eq(teamTaskRelations.teamId, context.teamId),
    or(
      and(eq(teamTaskRelations.sourceType, 'project'), eq(teamTaskRelations.sourceId, projectId)),
      and(eq(teamTaskRelations.targetType, 'project'), eq(teamTaskRelations.targetId, projectId)),
    ),
  ));
  await db.delete(teamTaskMedia).where(and(
    eq(teamTaskMedia.teamId, context.teamId), eq(teamTaskMedia.ownerType, 'project'), eq(teamTaskMedia.ownerId, projectId),
  ));
  await db.delete(teamTaskProjects).where(and(eq(teamTaskProjects.id, projectId), eq(teamTaskProjects.teamId, context.teamId)));
  return true;
}

async function deleteRecord(input: Record<string, unknown>, context: GrokActionContext) {
  const data = parse(deleteRecordSchema, input);
  let deleted = false;
  if (['crm_stage_group', 'crm_stage', 'tag', 'department', 'agenda', 'custom_field'].includes(data.resource)) {
    await assertPermission(context, 'contacts');
  } else if (['membership_plan', 'membership'].includes(data.resource)) {
    await assertPermission(context, 'membershipsWrite', 'memberships');
  } else if (['task_workspace', 'task_project', 'task_column', 'task'].includes(data.resource)) {
    await assertPermission(context, 'tasksWrite', 'tasks');
  } else if (['document_folder', 'document'].includes(data.resource)) {
    await assertPermission(context, 'documentsWrite', 'documents');
  } else if (data.resource === 'scheduled_message') {
    await assertPermission(context, 'scheduledMessagesWrite', 'scheduled-messages');
  } else if (data.resource === 'team_note') {
    await assertPermission(context, 'notesWrite', 'notes');
  } else if (data.resource === 'calendar_event') {
    await assertPermission(context, 'calendarWrite', 'calendar');
  }

  if (data.resource === 'crm_stage_group') deleted = Boolean((await db.delete(funnelStageGroups)
    .where(and(eq(funnelStageGroups.id, data.record_id), eq(funnelStageGroups.teamId, context.teamId))).returning({ id: funnelStageGroups.id })).length);
  if (data.resource === 'crm_stage') deleted = Boolean((await db.delete(funnelStages)
    .where(and(eq(funnelStages.id, data.record_id), eq(funnelStages.teamId, context.teamId))).returning({ id: funnelStages.id })).length);
  if (data.resource === 'tag') deleted = Boolean((await db.delete(tags)
    .where(and(eq(tags.id, data.record_id), eq(tags.teamId, context.teamId))).returning({ id: tags.id })).length);
  if (data.resource === 'department') deleted = Boolean((await db.delete(departments)
    .where(and(eq(departments.id, data.record_id), eq(departments.teamId, context.teamId))).returning({ id: departments.id })).length);
  if (data.resource === 'agenda') deleted = Boolean((await db.delete(dashboardBookmarkGroups)
    .where(and(eq(dashboardBookmarkGroups.id, data.record_id), eq(dashboardBookmarkGroups.teamId, context.teamId))).returning({ id: dashboardBookmarkGroups.id })).length);
  if (data.resource === 'membership_plan') deleted = Boolean((await db.delete(teamMembershipPlans)
    .where(and(eq(teamMembershipPlans.id, data.record_id), eq(teamMembershipPlans.teamId, context.teamId))).returning({ id: teamMembershipPlans.id })).length);
  if (data.resource === 'membership') deleted = Boolean((await db.delete(teamMembershipSubscriptions)
    .where(and(eq(teamMembershipSubscriptions.id, data.record_id), eq(teamMembershipSubscriptions.teamId, context.teamId))).returning({ id: teamMembershipSubscriptions.id })).length);
  if (data.resource === 'task_workspace') {
    const workspace = await db.query.teamTaskWorkspaces.findFirst({ where: and(
      eq(teamTaskWorkspaces.id, data.record_id), eq(teamTaskWorkspaces.teamId, context.teamId),
    ), columns: { id: true } });
    if (workspace) {
      const replacement = await db.query.teamTaskWorkspaces.findFirst({ where: and(
        eq(teamTaskWorkspaces.teamId, context.teamId), ne(teamTaskWorkspaces.id, workspace.id),
      ), orderBy: (table, { asc }) => [asc(table.order), asc(table.createdAt)] });
      if (!replacement) throw new Error('The last task workspace cannot be deleted.');
      await db.update(teamTaskProjects).set({ workspaceId: replacement.id, updatedAt: new Date() })
        .where(and(eq(teamTaskProjects.teamId, context.teamId), eq(teamTaskProjects.workspaceId, workspace.id)));
      await db.delete(teamTaskWorkspaces).where(and(eq(teamTaskWorkspaces.id, workspace.id), eq(teamTaskWorkspaces.teamId, context.teamId)));
      deleted = true;
    }
  }
  if (data.resource === 'task_project') deleted = await deleteTaskProject(context, data.record_id);
  if (data.resource === 'task_column') {
    const column = await db.query.teamTaskColumns.findFirst({ where: and(
      eq(teamTaskColumns.id, data.record_id), eq(teamTaskColumns.teamId, context.teamId),
    ), columns: { id: true } });
    if (column) { await deleteColumn(context.teamId, column.id); deleted = true; }
  }
  if (data.resource === 'task') deleted = await deleteTaskItem(context.teamId, data.record_id);
  if (data.resource === 'document_folder') { await deleteFolder(context.teamId, data.record_id); deleted = true; }
  if (data.resource === 'document') { await deleteDocument(context.teamId, data.record_id); deleted = true; }
  if (data.resource === 'scheduled_message') deleted = Boolean((await db.delete(teamScheduledMessages)
    .where(and(eq(teamScheduledMessages.id, data.record_id), eq(teamScheduledMessages.teamId, context.teamId))).returning({ id: teamScheduledMessages.id })).length);
  if (data.resource === 'team_note') deleted = Boolean((await db.delete(teamNotes)
    .where(and(eq(teamNotes.id, data.record_id), eq(teamNotes.teamId, context.teamId))).returning({ id: teamNotes.id })).length);
  if (data.resource === 'custom_field') deleted = Boolean((await db.delete(customFields)
    .where(and(eq(customFields.id, data.record_id), eq(customFields.teamId, context.teamId))).returning({ id: customFields.id })).length);
  if (data.resource === 'calendar_event') deleted = Boolean((await db.delete(teamEvents)
    .where(and(eq(teamEvents.id, data.record_id), eq(teamEvents.teamId, context.teamId))).returning({ id: teamEvents.id })).length);
  if (!deleted) throw new Error('Record not found.');
  await audit(context, `GROK_${data.resource.toUpperCase()}_DELETED`, data.record_id);
  return { success: true, deleted: true, resource: data.resource, record_id: data.record_id };
}

const taskRelationManageSchema = z.object({
  action: z.enum(['create', 'delete']),
  relation_id: z.number().int().positive().optional(),
  source_type: z.enum(['workspace', 'project', 'task', 'contact', 'customer', 'note', 'event']).optional(),
  source_id: z.number().int().positive().optional(),
  target_type: z.enum(['workspace', 'project', 'task', 'contact', 'customer', 'note', 'event']).optional(),
  target_id: z.number().int().positive().optional(),
  relation_type: z.enum(['related', 'shared_in', 'generated_from', 'converted_to']).optional(),
}).superRefine((data, ctx) => {
  if (data.action === 'delete' && !data.relation_id) {
    ctx.addIssue({ code: 'custom', message: 'relation_id is required for delete', path: ['relation_id'] });
  }
  if (data.action === 'create' && (!data.source_type || !data.source_id || !data.target_type || !data.target_id)) {
    ctx.addIssue({ code: 'custom', message: 'source and target are required for create', path: ['source_type'] });
  }
});

const shareTaskSchema = z.object({
  task_id: z.number().int().positive(),
  project_id: z.number().int().positive(),
  column_id: z.number().int().positive().optional(),
});

const linkCustomerTaskSchema = z.object({
  action: z.enum(['link', 'unlink']),
  customer_id: z.number().int().positive(),
  task_id: z.number().int().positive(),
});

async function manageTaskRelation(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'tasksWrite', 'tasks');
  const data = parse(taskRelationManageSchema, input);
  if (data.action === 'delete') {
    const deleted = await db.delete(teamTaskRelations).where(and(
      eq(teamTaskRelations.id, data.relation_id!),
      eq(teamTaskRelations.teamId, context.teamId),
    )).returning({ id: teamTaskRelations.id });
    if (!deleted.length) throw new Error('Relation not found.');
    await audit(context, 'GROK_TASK_RELATION_DELETED', data.relation_id!);
    return { success: true, deleted: true, relation_id: data.relation_id };
  }
  const [sourceOk, targetOk] = await Promise.all([
    assertEntity(context.teamId, data.source_type!, data.source_id!),
    assertEntity(context.teamId, data.target_type!, data.target_id!),
  ]);
  if (!sourceOk || !targetOk) throw new Error('Related entity not found.');
  const relation = await insertRelation({
    teamId: context.teamId,
    userId: context.userId,
    sourceType: data.source_type!,
    sourceId: data.source_id!,
    targetType: data.target_type!,
    targetId: data.target_id!,
    relationType: data.relation_type ?? 'related',
  });
  await audit(context, 'GROK_TASK_RELATION_CREATED', relation?.id ?? 0);
  return { success: true, created: true, relation };
}

async function shareTaskAcrossProjects(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'tasksWrite', 'tasks');
  const data = parse(shareTaskSchema, input);
  const task = await assertTask(context.teamId, data.task_id);
  if (!task) throw new Error('Task not found.');
  const project = await assertProject(context.teamId, data.project_id);
  if (!project) throw new Error('Project not found.');
  const column = data.column_id
    ? await db.query.teamTaskColumns.findFirst({
        where: and(
          eq(teamTaskColumns.id, data.column_id),
          eq(teamTaskColumns.projectId, data.project_id),
          eq(teamTaskColumns.teamId, context.teamId),
        ),
      })
    : await getProjectFirstColumn(context.teamId, data.project_id);
  if (!column) throw new Error('Column not found.');
  const order = await nextTaskOrder(context.teamId, column.id);
  const location = await createTaskLocation({
    taskId: task.id,
    teamId: context.teamId,
    projectId: project.id,
    columnId: column.id,
    order,
  });
  const relation = await insertRelation({
    teamId: context.teamId,
    userId: context.userId,
    sourceType: 'task',
    sourceId: task.id,
    targetType: 'project',
    targetId: project.id,
    relationType: 'shared_in',
  });
  await audit(context, 'GROK_TASK_SHARED', task.id);
  return { success: true, shared: true, location, relation };
}

async function linkCustomerTask(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'tasksWrite', 'tasks');
  const data = parse(linkCustomerTaskSchema, input);
  const [customer, task] = await Promise.all([
    db.query.teamCustomers.findFirst({ where: and(eq(teamCustomers.id, data.customer_id), eq(teamCustomers.teamId, context.teamId)), columns: { id: true } }),
    assertTask(context.teamId, data.task_id),
  ]);
  if (!customer) throw new Error('Customer not found.');
  if (!task) throw new Error('Task not found.');
  if (data.action === 'unlink') {
    const deleted = await db.delete(teamTaskRelations).where(and(
      eq(teamTaskRelations.teamId, context.teamId),
      or(
        and(eq(teamTaskRelations.sourceType, 'customer'), eq(teamTaskRelations.sourceId, data.customer_id), eq(teamTaskRelations.targetType, 'task'), eq(teamTaskRelations.targetId, data.task_id)),
        and(eq(teamTaskRelations.sourceType, 'task'), eq(teamTaskRelations.sourceId, data.task_id), eq(teamTaskRelations.targetType, 'customer'), eq(teamTaskRelations.targetId, data.customer_id)),
      ),
    )).returning({ id: teamTaskRelations.id });
    await audit(context, 'GROK_CUSTOMER_TASK_UNLINKED', data.task_id);
    return { success: true, unlinked: true, count: deleted.length };
  }
  const relation = await insertRelation({
    teamId: context.teamId,
    userId: context.userId,
    sourceType: 'customer',
    sourceId: data.customer_id,
    targetType: 'task',
    targetId: data.task_id,
    relationType: 'related',
  });
  await audit(context, 'GROK_CUSTOMER_TASK_LINKED', data.task_id);
  return { success: true, linked: true, relation };
}

export async function executeGrokExtendedAction(name: string, input: Record<string, unknown>, context: GrokActionContext) {
  if (name === 'whatspro_manage_crm_stage_group') return manageCrmStageGroup(input, context);
  if (name === 'whatspro_manage_crm_stage') return manageCrmStage(input, context);
  if (name === 'whatspro_manage_tag') return manageTag(input, context);
  if (name === 'whatspro_manage_department') return manageDepartment(input, context);
  if (name === 'whatspro_manage_department_member') return manageDepartmentMember(input, context);
  if (name === 'whatspro_set_contact_tags') return setContactTags(input, context);
  if (name === 'whatspro_manage_agenda') return manageAgenda(input, context);
  if (name === 'whatspro_manage_agenda_contact') return manageAgendaContact(input, context);
  if (name === 'whatspro_manage_membership_plan') return manageMembershipPlan(input, context);
  if (name === 'whatspro_update_membership') return updateMembership(input, context);
  if (name === 'whatspro_create_task_project') return createTaskProject(input, context);
  if (name === 'whatspro_manage_task_column') return manageTaskColumn(input, context);
  if (name === 'whatspro_manage_task') return manageTask(input, context);
  if (name === 'whatspro_create_contact_task') return createTaskForContact(input, context);
  if (name === 'whatspro_manage_document_folder') return manageDocumentFolder(input, context);
  if (name === 'whatspro_manage_document') return manageDocument(input, context);
  if (name === 'whatspro_manage_scheduled_message') return manageScheduledMessage(input, context);
  if (name === 'whatspro_manage_custom_field') return manageCustomField(input, context);
  if (name === 'whatspro_manage_note') return manageNote(input, context);
  if (name === 'whatspro_manage_calendar_event') return manageCalendarEvent(input, context);
  if (name === 'whatspro_manage_task_workspace') return manageTaskWorkspace(input, context);
  if (name === 'whatspro_manage_task_project') return manageTaskProject(input, context);
  if (name === 'whatspro_manage_task_relation') return manageTaskRelation(input, context);
  if (name === 'whatspro_share_task') return shareTaskAcrossProjects(input, context);
  if (name === 'whatspro_link_customer_task') return linkCustomerTask(input, context);
  if (name === 'whatspro_delete_record') return deleteRecord(input, context);
  throw new Error(`Unknown extended Grok action: ${name}`);
}
