import { z } from 'zod';

export const automationNodeSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  data: z.record(z.string(), z.unknown()).optional().default({}),
});

export const automationEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().nullable().optional(),
  targetHandle: z.string().nullable().optional(),
  type: z.string().optional(),
});

export const createTemplateBaseSchema = z.object({
  name: z.string().trim().min(2).max(255),
  description: z.string().trim().max(1000).optional().nullable(),
  isPublic: z.boolean().optional().default(false),
  instanceId: z.number().int().positive().optional().nullable(),
  nodes: z.array(automationNodeSchema).min(1),
  edges: z.array(automationEdgeSchema),
});

export function normalizeTemplateDescription(value: string | null | undefined) {
  const description = value?.trim();
  return description ? description : null;
}
