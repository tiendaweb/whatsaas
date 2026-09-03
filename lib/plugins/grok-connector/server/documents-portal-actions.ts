import 'server-only';

import { getDocumentPortal, saveDocumentPortal } from '@/lib/plugins/documents/server/portal';
import { documentPortalDefinitionSchema } from '@/lib/plugins/documents/shared/portal';
import {
  assertPermission,
  audit,
  type GrokActionContext,
  type GrokActionTool,
} from './actions';

const sectionSchema = {
  type: 'object',
  required: ['id', 'title', 'layout', 'source'],
  properties: {
    id: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{1,47}$' },
    title: { type: 'string', minLength: 1, maxLength: 80 },
    description: { type: 'string', maxLength: 220 },
    layout: { type: 'string', enum: ['featured', 'grid', 'list'] },
    source: {
      oneOf: [
        {
          type: 'object',
          required: ['kind', 'documentIds'],
          properties: {
            kind: { const: 'manual' },
            documentIds: { type: 'array', maxItems: 100, uniqueItems: true, items: { type: 'integer', minimum: 1 } },
          },
          additionalProperties: false,
        },
        {
          type: 'object',
          required: ['kind', 'limit'],
          properties: { kind: { const: 'recent' }, limit: { type: 'integer', minimum: 1, maximum: 24 } },
          additionalProperties: false,
        },
        {
          type: 'object',
          required: ['kind', 'folderId', 'limit'],
          properties: {
            kind: { const: 'folder' },
            folderId: { type: 'integer', minimum: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 50 },
          },
          additionalProperties: false,
        },
      ],
    },
  },
  additionalProperties: false,
};

const definitionJsonSchema = {
  type: 'object',
  required: ['schemaVersion', 'title', 'accent', 'navigation', 'density', 'defaultViewId', 'views'],
  properties: {
    schemaVersion: { const: 1 },
    title: { type: 'string', minLength: 1, maxLength: 80 },
    description: { type: 'string', maxLength: 240 },
    accent: { type: 'string', enum: ['green', 'indigo', 'violet', 'amber', 'rose', 'sky'] },
    navigation: { type: 'string', enum: ['tabs', 'sidebar'] },
    density: { type: 'string', enum: ['comfortable', 'compact'] },
    defaultViewId: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{1,47}$' },
    views: {
      type: 'array',
      minItems: 1,
      maxItems: 12,
      items: {
        type: 'object',
        required: ['id', 'name', 'icon', 'sections'],
        properties: {
          id: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{1,47}$' },
          name: { type: 'string', minLength: 1, maxLength: 60 },
          description: { type: 'string', maxLength: 180 },
          icon: { type: 'string', enum: ['home', 'book-open', 'briefcase', 'chart', 'files', 'folder-kanban', 'sparkles', 'users'] },
          sections: { type: 'array', minItems: 1, maxItems: 12, items: sectionSchema },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
};

export const documentsPortalReadTools: GrokActionTool[] = [{
  name: 'whatspro_documents_portal_get',
  description: 'Lee la definición declarativa completa de la portada de Documentos y sus vistas/secciones ya resueltas. Devuelve qué documentos muestra cada sección, en qué orden y si la fuente es manual, recientes o una carpeta. Usala antes de modificar el portal.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
}];

export const documentsPortalActionTools: GrokActionTool[] = [{
  name: 'whatspro_documents_portal_update',
  description: 'Reemplaza de forma segura la definición del portal interno de Documentos. Permite cambiar identidad, color, navegación, vistas, secciones, layout y mapear documentos en orden. Leé primero con whatspro_documents_portal_get, conservá lo que no te pidieron cambiar y enviá version para evitar pisar ediciones concurrentes. source manual mantiene exactamente el orden de documentIds; recent cambia solo según updatedAt; folder refleja los documentos de esa carpeta.',
  inputSchema: {
    type: 'object',
    required: ['definition', 'version'],
    properties: {
      definition: definitionJsonSchema,
      version: { type: 'integer', minimum: 0, description: 'Versión devuelta por whatspro_documents_portal_get. El valor 0 corresponde al portal predeterminado aún no guardado.' },
    },
    additionalProperties: false,
  },
}];

export async function executeDocumentsPortalTool(
  name: string,
  input: Record<string, unknown>,
  context: GrokActionContext,
) {
  if (name === 'whatspro_documents_portal_get') {
    await assertPermission(context, 'documentsRead', 'documents');
    return getDocumentPortal(context.teamId);
  }

  if (name === 'whatspro_documents_portal_update') {
    await assertPermission(context, 'documentsWrite', 'documents');
    const definition = documentPortalDefinitionSchema.parse(input.definition);
    const version = typeof input.version === 'number' && Number.isInteger(input.version) ? input.version : undefined;
    const saved = await saveDocumentPortal({ teamId: context.teamId, userId: context.userId, definition, version });
    await audit(context, 'CONNECTOR_DOCUMENT_PORTAL_UPDATED', saved.id);
    return { success: true, portal: await getDocumentPortal(context.teamId) };
  }

  throw new Error(`Unknown documents portal tool: ${name}`);
}
