import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamDocuments } from '@/lib/db/schema';
import { searchDocuments } from '@/lib/plugins/documents/server/documents';
import { clip, fail, ok, type BuiltinToolDefinition } from './types';

/** Base de conocimiento: la app Documentos como FAQ del bot. */
export const knowledgeTools: BuiltinToolDefinition[] = [
  {
    name: 'search_knowledge_base',
    pluginId: 'documents',
    label: 'Buscar en Documentos',
    summary: 'Busca en los documentos del equipo (precios, políticas, FAQs, procedimientos) para responder con información real.',
    risk: 'read',
    description:
      'Busca en la base de conocimiento del equipo (app Documentos) por palabra clave. Usala ANTES de responder preguntas sobre precios, horarios, políticas, garantías, envíos o cualquier dato del negocio que no tengas en el prompt. Devuelve títulos y extractos; para leer uno completo usá read_knowledge_document. Buscá por la raíz de la palabra ("factur" en vez de "facturación").',
    parameters: {
      type: 'object',
      required: ['query'],
      properties: {
        query: { type: 'string', description: 'Término a buscar (2 a 60 caracteres)' },
        limit: { type: 'integer', description: 'Máximo de resultados (1-8). Por defecto 5.' },
      },
    },
    execute: async (args, context) => {
      const query = typeof args.query === 'string' ? args.query.trim() : '';
      if (query.length < 2) return fail('query debe tener al menos 2 caracteres');
      const limit = Math.min(Math.max(Number(args.limit) || 5, 1), 8);
      const results = await searchDocuments(context.teamId, query, limit);
      return ok({ total: results.length, results });
    },
  },
  {
    name: 'read_knowledge_document',
    pluginId: 'documents',
    label: 'Leer documento',
    summary: 'Lee el texto completo de un documento encontrado con la búsqueda.',
    risk: 'read',
    description:
      'Devuelve el texto de un documento de la base de conocimiento (hasta ~4.000 caracteres). Usala después de search_knowledge_base cuando el extracto no alcanza para responder.',
    parameters: {
      type: 'object',
      required: ['document_id'],
      properties: { document_id: { type: 'integer', description: 'id devuelto por search_knowledge_base' } },
    },
    execute: async (args, context) => {
      const id = Number(args.document_id);
      if (!Number.isInteger(id) || id < 1) return fail('document_id inválido');
      const [row] = await db
        .select({ id: teamDocuments.id, title: teamDocuments.title, contentText: teamDocuments.contentText, updatedAt: teamDocuments.updatedAt })
        .from(teamDocuments)
        .where(and(eq(teamDocuments.id, id), eq(teamDocuments.teamId, context.teamId)))
        .limit(1);
      if (!row) return fail('Documento no encontrado');
      return ok({ id: row.id, title: row.title, updated_at: row.updatedAt.toISOString(), text: clip(row.contentText, 4000) });
    },
  },
];
