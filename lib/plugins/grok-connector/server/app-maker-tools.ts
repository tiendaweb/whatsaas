import { APP_MAKER_DESIGN_TEMPLATE_KEYS } from '@/lib/plugins/app-maker/shared/design-templates';
import type { GrokActionTool } from './actions';

export const APP_MAKER_READ_SCOPE = 'appmaker:read';
export const APP_MAKER_WRITE_SCOPE = 'appmaker:write';
export const APP_MAKER_PUBLISH_SCOPE = 'appmaker:publish';
export const APP_MAKER_MEDIA_SCOPE = 'appmaker:media';

export const APP_MAKER_SCOPES = [
  APP_MAKER_READ_SCOPE,
  APP_MAKER_WRITE_SCOPE,
  APP_MAKER_PUBLISH_SCOPE,
  APP_MAKER_MEDIA_SCOPE,
] as const;

const slug = { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', maxLength: 48 };
const entityKey = { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', maxLength: 48 };
const recordId = { type: 'integer', minimum: 1 };
const confirm = { type: 'boolean', const: true, description: 'Debe ser true; confirma que el usuario solicitó explícitamente la operación destructiva.' };

export const appMakerReadTools: GrokActionTool[] = [
  {
    name: 'whatspro_appmaker_catalog',
    description: 'Devuelve el catálogo completo de plantillas, vistas, bloques, formularios, campos, gráficos, relaciones y conectores disponibles para construir apps.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'whatspro_appmaker_list_apps',
    description: 'Enumera las aplicaciones App Maker accesibles para el usuario, sin exponer definiciones de otras audiencias.',
    inputSchema: {
      type: 'object',
      properties: { include_archived: { type: 'boolean', default: false } },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_appmaker_get_app',
    description: 'Lee la definición publicada de una app, o su borrador si draft=true y el miembro tiene permiso de edición.',
    inputSchema: {
      type: 'object', required: ['slug'],
      properties: { slug, draft: { type: 'boolean', default: false }, include_versions: { type: 'boolean', default: false } },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_appmaker_list_versions',
    description: 'Lista el historial de versiones de una app accesible.',
    inputSchema: { type: 'object', required: ['slug'], properties: { slug }, additionalProperties: false },
  },
  {
    name: 'whatspro_appmaker_list_records',
    description: 'Consulta registros de una entidad propia de App Maker aplicando audiencia, campos sensibles, filtros, búsqueda, relaciones y paginación.',
    inputSchema: {
      type: 'object', required: ['slug', 'entity_key'],
      properties: {
        slug, entity_key: entityKey, draft: { type: 'boolean', default: false }, page: { type: 'integer', minimum: 1, default: 1 },
        page_size: { type: 'integer', minimum: 1, maximum: 100, default: 25 }, search: { type: 'string', maxLength: 300 },
        filters: { type: 'array', maxItems: 20, items: { type: 'object', required: ['field', 'operator'], properties: { field: entityKey, operator: { type: 'string', enum: ['eq', 'neq', 'contains', 'starts-with', 'gt', 'gte', 'lt', 'lte', 'in', 'is-empty'] }, value: {} }, additionalProperties: false } },
        sort: { type: 'array', maxItems: 10, items: { type: 'object', required: ['field', 'direction'], properties: { field: entityKey, direction: { type: 'string', enum: ['asc', 'desc'] } }, additionalProperties: false } },
        fields: { type: 'array', maxItems: 100, items: entityKey }, include: { type: 'array', maxItems: 20, items: entityKey },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_appmaker_get_record',
    description: 'Lee un registro de App Maker por ID y puede resolver relaciones permitidas.',
    inputSchema: {
      type: 'object', required: ['slug', 'entity_key', 'record_id'],
      properties: { slug, entity_key: entityKey, record_id: recordId, draft: { type: 'boolean', default: false }, include: { type: 'array', maxItems: 20, items: entityKey } },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_appmaker_list_attachments',
    description: 'Lista metadatos de archivos privados visibles en un registro; no publica rutas ni URLs de almacenamiento.',
    inputSchema: {
      type: 'object', required: ['slug', 'entity_key', 'record_id'],
      properties: { slug, entity_key: entityKey, record_id: recordId, draft: { type: 'boolean', default: false } },
      additionalProperties: false,
    },
  },
];

export const appMakerWriteTools: GrokActionTool[] = [
  {
    name: 'whatspro_appmaker_save_app',
    description: 'Crea una app o guarda una nueva versión validada de su definición. Para actualizar exige expected_version.',
    inputSchema: {
      type: 'object', required: ['definition'],
      properties: { definition: { type: 'object' }, expected_version: { type: 'integer', minimum: 1 }, status: { type: 'string', enum: ['draft', 'preview'], default: 'draft' }, summary: { type: 'string', maxLength: 300 } },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_appmaker_set_design',
    description: 'Aplica uno de los Design Templates a la definición en borrador y crea una nueva versión.',
    inputSchema: {
      type: 'object', required: ['slug', 'template', 'expected_version'],
      properties: { slug, template: { type: 'string', enum: [...APP_MAKER_DESIGN_TEMPLATE_KEYS] }, expected_version: { type: 'integer', minimum: 1 }, summary: { type: 'string', maxLength: 300 } },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_appmaker_archive_app',
    description: 'Archiva una app sin borrar sus versiones ni datos. Solo se ejecuta con confirm=true.',
    inputSchema: { type: 'object', required: ['slug', 'confirm'], properties: { slug, confirm }, additionalProperties: false },
  },
  {
    name: 'whatspro_appmaker_create_record',
    description: 'Crea un registro validado y ejecuta los flujos record-created habilitados.',
    inputSchema: { type: 'object', required: ['slug', 'entity_key', 'values'], properties: { slug, entity_key: entityKey, values: { type: 'object', maxProperties: 100 }, draft: { type: 'boolean', default: false }, run_workflows: { type: 'boolean', default: true } }, additionalProperties: false },
  },
  {
    name: 'whatspro_appmaker_update_record',
    description: 'Actualiza un registro con control de versión y ejecuta los flujos record-updated habilitados.',
    inputSchema: { type: 'object', required: ['slug', 'entity_key', 'record_id', 'values', 'expected_version'], properties: { slug, entity_key: entityKey, record_id: recordId, values: { type: 'object', maxProperties: 100 }, expected_version: { type: 'integer', minimum: 1 }, draft: { type: 'boolean', default: false }, run_workflows: { type: 'boolean', default: true } }, additionalProperties: false },
  },
  {
    name: 'whatspro_appmaker_delete_record',
    description: 'Elimina un registro respetando restricciones/cascadas y ejecuta flujos. Requiere confirm=true.',
    inputSchema: { type: 'object', required: ['slug', 'entity_key', 'record_id', 'confirm'], properties: { slug, entity_key: entityKey, record_id: recordId, draft: { type: 'boolean', default: false }, run_workflows: { type: 'boolean', default: true }, confirm }, additionalProperties: false },
  },
  {
    name: 'whatspro_appmaker_link_record',
    description: 'Crea una relación validada entre un registro y otra entidad o recurso de WhatsPro.',
    inputSchema: { type: 'object', required: ['slug', 'relation_key', 'source_record_id', 'target_record_id'], properties: { slug, relation_key: entityKey, source_record_id: recordId, target_record_id: { type: ['string', 'integer'], minLength: 1 }, metadata: { type: 'object' }, draft: { type: 'boolean', default: false } }, additionalProperties: false },
  },
  {
    name: 'whatspro_appmaker_unlink_record',
    description: 'Quita una relación sin borrar registros. Requiere confirm=true.',
    inputSchema: { type: 'object', required: ['slug', 'relation_key', 'source_record_id', 'target_record_id', 'confirm'], properties: { slug, relation_key: entityKey, source_record_id: recordId, target_record_id: { type: ['string', 'integer'], minLength: 1 }, draft: { type: 'boolean', default: false }, confirm }, additionalProperties: false },
  },
  {
    name: 'whatspro_appmaker_run_workflow',
    description: 'Ejecuta un flujo manual habilitado de la app y devuelve el resultado de cada paso.',
    inputSchema: { type: 'object', required: ['slug', 'workflow_key'], properties: { slug, workflow_key: entityKey, draft: { type: 'boolean', default: false }, row: { type: 'object' }, previous: { type: 'object' } }, additionalProperties: false },
  },
];

export const appMakerPublishTools: GrokActionTool[] = [{
  name: 'whatspro_appmaker_publish_app',
  description: 'Publica de forma atómica la definición en borrador indicada por expected_version.',
  inputSchema: { type: 'object', required: ['slug', 'expected_version'], properties: { slug, expected_version: { type: 'integer', minimum: 1 }, summary: { type: 'string', maxLength: 300 } }, additionalProperties: false },
}];

export const appMakerMediaTools: GrokActionTool[] = [
  {
    name: 'whatspro_appmaker_get_attachment',
    description: 'Descarga contenido privado de una imagen, audio, video o documento y lo entrega directamente al conector, sin URL pública.',
    inputSchema: { type: 'object', required: ['slug', 'attachment_id'], properties: { slug, attachment_id: { type: 'integer', minimum: 1 }, draft: { type: 'boolean', default: false } }, additionalProperties: false },
  },
  {
    name: 'whatspro_appmaker_upload_attachment',
    description: 'Sube un archivo base64 a un campo privado de App Maker; requiere también appmaker:write.',
    inputSchema: { type: 'object', required: ['slug', 'entity_key', 'record_id', 'field_key', 'file_name', 'mime_type', 'data_base64'], properties: { slug, entity_key: entityKey, record_id: recordId, field_key: entityKey, file_name: { type: 'string', minLength: 1, maxLength: 240 }, mime_type: { type: 'string', minLength: 1, maxLength: 160 }, data_base64: { type: 'string', minLength: 1, description: 'Contenido base64 puro, sin prefijo data:.' }, draft: { type: 'boolean', default: false } }, additionalProperties: false },
  },
  {
    name: 'whatspro_appmaker_delete_attachment',
    description: 'Elimina un archivo privado y su vínculo con el registro; requiere appmaker:write y confirm=true.',
    inputSchema: { type: 'object', required: ['slug', 'attachment_id', 'confirm'], properties: { slug, attachment_id: { type: 'integer', minimum: 1 }, draft: { type: 'boolean', default: false }, confirm }, additionalProperties: false },
  },
];

export const appMakerTools = [...appMakerReadTools, ...appMakerWriteTools, ...appMakerPublishTools, ...appMakerMediaTools];

export function requiredAppMakerScopes(toolName: string) {
  if (appMakerReadTools.some((tool) => tool.name === toolName)) return [APP_MAKER_READ_SCOPE];
  if (appMakerWriteTools.some((tool) => tool.name === toolName)) return [APP_MAKER_WRITE_SCOPE];
  if (appMakerPublishTools.some((tool) => tool.name === toolName)) return [APP_MAKER_PUBLISH_SCOPE, APP_MAKER_WRITE_SCOPE];
  if (appMakerMediaTools.some((tool) => tool.name === toolName)) {
    return toolName === 'whatspro_appmaker_get_attachment'
      ? [APP_MAKER_MEDIA_SCOPE, APP_MAKER_READ_SCOPE]
      : [APP_MAKER_MEDIA_SCOPE, APP_MAKER_WRITE_SCOPE];
  }
  return null;
}
