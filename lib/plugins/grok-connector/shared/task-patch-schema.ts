import { z } from 'zod';

/**
 * Campos editables de una tarea, para ACTUALIZAR.
 *
 * Vive en `shared/` (sin `server-only`) para que se pueda testear: el bug que
 * motivó este archivo sólo se ve ejecutando el parseo, no leyéndolo.
 *
 * REGLA QUE NO SE PUEDE ROMPER: acá NINGÚN campo lleva `.default()`.
 *
 * El esquema de creación sí los necesita (una tarea nueva tiene que nacer con
 * `notes: ''`, `status: 'open'`, etc.). Pero si esos defaults llegan al camino
 * de actualización, zod rellena los campos que el conector NO mandó, el
 * handler los ve distintos de `undefined` y los escribe: mandar sólo
 * `label_ids` terminaba borrando la descripción y el checklist de la tarea, y
 * reabriendo una tarea terminada.
 *
 * Un campo ausente TIENE que llegar como `undefined`. Ver
 * `tests/connectors/task-patch-schema.test.ts`.
 */
export const checklistItemSchema = z.object({
  id: z.string().trim().min(1).max(100),
  text: z.string().trim().min(1).max(500),
  completed: z.boolean().default(false),
});

export const taskPatchFieldsSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  notes: z.string().max(20000).optional(),
  ai_prompt: z.string().max(20000).optional(),
  ai_next_step: z.string().max(20000).optional(),
  ai_context_question: z.string().max(20000).optional(),
  ai_context_answer: z.string().max(20000).optional(),
  ai_ready: z.boolean().optional(),
  label_ids: z.array(z.string().max(100)).max(50).optional(),
  checklist: z.array(checklistItemSchema).max(100).optional(),
  status: z.enum(['open', 'in_progress', 'done']).optional(),
  due_date: z.string().datetime().nullable().optional(),
  start_date: z.string().datetime().nullable().optional(),
  end_date: z.string().datetime().nullable().optional(),
  color: z.string().max(20).nullable().optional(),
  icon: z.string().max(60).nullable().optional(),
});

/** Campos que, si se escriben por accidente, destruyen trabajo del usuario. */
export const DESTRUCTIVE_TASK_FIELDS = [
  'notes', 'ai_prompt', 'ai_next_step', 'ai_context_question', 'ai_context_answer', 'checklist', 'label_ids', 'status',
] as const;
