import { z } from 'zod';

export const DOCUMENT_PORTAL_ACCENTS = ['green', 'indigo', 'violet', 'amber', 'rose', 'sky'] as const;
export const DOCUMENT_PORTAL_ICONS = [
  'home',
  'book-open',
  'briefcase',
  'chart',
  'files',
  'folder-kanban',
  'sparkles',
  'users',
] as const;

const slug = z
  .string()
  .trim()
  .min(2)
  .max(48)
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'Usá minúsculas, números y guiones.');

const manualSourceSchema = z.object({
  kind: z.literal('manual'),
  documentIds: z.array(z.number().int().positive()).max(100).default([]),
});

const recentSourceSchema = z.object({
  kind: z.literal('recent'),
  limit: z.number().int().min(1).max(24).default(8),
});

const folderSourceSchema = z.object({
  kind: z.literal('folder'),
  folderId: z.number().int().positive(),
  limit: z.number().int().min(1).max(50).default(12),
});

export const documentPortalSectionSchema = z.object({
  id: slug,
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().max(220).optional(),
  layout: z.enum(['featured', 'grid', 'list']).default('grid'),
  source: z.discriminatedUnion('kind', [manualSourceSchema, recentSourceSchema, folderSourceSchema]),
});

export const documentPortalViewSchema = z.object({
  id: slug,
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(180).optional(),
  icon: z.enum(DOCUMENT_PORTAL_ICONS).default('files'),
  sections: z.array(documentPortalSectionSchema).min(1).max(12),
});

export const documentPortalDefinitionSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().max(240).optional(),
  accent: z.enum(DOCUMENT_PORTAL_ACCENTS).default('green'),
  navigation: z.enum(['tabs', 'sidebar']).default('tabs'),
  density: z.enum(['comfortable', 'compact']).default('comfortable'),
  defaultViewId: slug,
  views: z.array(documentPortalViewSchema).min(1).max(12),
}).superRefine((value, context) => {
  const viewIds = new Set<string>();
  for (const [viewIndex, view] of value.views.entries()) {
    if (viewIds.has(view.id)) {
      context.addIssue({ code: 'custom', message: 'Los ids de vista deben ser únicos.', path: ['views', viewIndex, 'id'] });
    }
    viewIds.add(view.id);

    const sectionIds = new Set<string>();
    for (const [sectionIndex, section] of view.sections.entries()) {
      if (sectionIds.has(section.id)) {
        context.addIssue({
          code: 'custom',
          message: 'Los ids de sección deben ser únicos dentro de la vista.',
          path: ['views', viewIndex, 'sections', sectionIndex, 'id'],
        });
      }
      sectionIds.add(section.id);
      if (section.source.kind === 'manual' && new Set(section.source.documentIds).size !== section.source.documentIds.length) {
        context.addIssue({
          code: 'custom',
          message: 'Un documento no puede repetirse dentro de la misma sección.',
          path: ['views', viewIndex, 'sections', sectionIndex, 'source', 'documentIds'],
        });
      }
    }
  }

  if (!viewIds.has(value.defaultViewId)) {
    context.addIssue({ code: 'custom', message: 'La vista predeterminada debe existir.', path: ['defaultViewId'] });
  }
});

export type DocumentPortalDefinition = z.infer<typeof documentPortalDefinitionSchema>;
export type DocumentPortalView = z.infer<typeof documentPortalViewSchema>;
export type DocumentPortalSection = z.infer<typeof documentPortalSectionSchema>;

export const DEFAULT_DOCUMENT_PORTAL: DocumentPortalDefinition = {
  schemaVersion: 1,
  title: 'Documentos del equipo',
  description: 'Un acceso ordenado al conocimiento, los informes y los recursos que el equipo usa todos los días.',
  accent: 'green',
  navigation: 'tabs',
  density: 'comfortable',
  defaultViewId: 'inicio',
  views: [
    {
      id: 'inicio',
      name: 'Inicio',
      description: 'Lo más nuevo y relevante de la biblioteca.',
      icon: 'home',
      sections: [
        {
          id: 'actualizados',
          title: 'Actualizados recientemente',
          description: 'Esta sección cambia automáticamente cuando el equipo edita documentos.',
          layout: 'featured',
          source: { kind: 'recent', limit: 8 },
        },
      ],
    },
  ],
};
