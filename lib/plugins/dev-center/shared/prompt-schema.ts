import { z } from 'zod';
import { MISSION_AGENTS, MISSION_MODES } from '@/lib/plugins/dev-center/shared/types';

/**
 * Validación de un prompt del Centro de Desarrollo.
 *
 * Vive acá y no dentro de `app/api/.../prompts/route.ts` porque Next.js sólo
 * admite en un archivo de ruta sus exports reservados (los verbos HTTP,
 * `dynamic`, `revalidate`…). Exportar el schema desde ahí —y que la ruta
 * `[id]` lo importara— hacía fallar la validación de tipos del build entero:
 *
 *   Type error: Route "app/api/plugins/dev-center/prompts/route.ts" does not
 *   match the required types of a Next.js Route. "promptSchema" is not a valid
 *   Route export field.
 *
 * Las dos rutas lo importan de este módulo, que no es una ruta.
 */
export const promptSchema = z.object({
  key: z.string().trim().min(2).max(64).regex(/^[a-z0-9._-]+$/).optional(),
  title: z.string().trim().min(2).max(160),
  body: z.string().min(5).max(20000),
  description: z.string().max(2000).nullable().optional(),
  agentDefault: z.enum(MISSION_AGENTS).optional(),
  projectDefault: z.string().max(40).nullable().optional(),
  modeDefault: z.enum(MISSION_MODES).optional(),
  variables: z.array(z.object({ key: z.string().regex(/^[a-zA-Z0-9_]+$/).max(40), label: z.string().max(80), placeholder: z.string().max(160).optional() })).max(12).optional(),
  pinned: z.boolean().optional(),
});
