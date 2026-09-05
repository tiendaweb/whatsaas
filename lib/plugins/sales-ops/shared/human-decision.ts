import { z } from 'zod';

/**
 * Formulario que un conector puede pedir cuando una corrida necesita criterio
 * humano. Vive en metadata de `team_prompt_runs`: sumar tipos de campo no exige
 * una migración y las corridas viejas siguen siendo legibles.
 */
export const HUMAN_DECISION_FIELD_TYPES = ['buttons', 'select', 'text', 'textarea', 'code'] as const;

export const humanDecisionOptionSchema = z.object({
  label: z.string().trim().min(1).max(80),
  value: z.string().trim().min(1).max(120),
  description: z.string().trim().max(240).optional(),
});

export const humanDecisionFieldSchema = z.object({
  id: z.string().trim().min(1).max(48).regex(/^[a-z][a-z0-9_]*$/),
  type: z.enum(HUMAN_DECISION_FIELD_TYPES),
  label: z.string().trim().min(1).max(160),
  description: z.string().trim().max(600).optional(),
  placeholder: z.string().trim().max(240).optional(),
  required: z.boolean().optional(),
  options: z.array(humanDecisionOptionSchema).min(2).max(8).optional(),
  allowOther: z.boolean().optional(),
  language: z.string().trim().max(32).optional(),
}).superRefine((field, ctx) => {
  if ((field.type === 'buttons' || field.type === 'select') && !field.options?.length) {
    ctx.addIssue({ code: 'custom', path: ['options'], message: 'Los campos buttons y select necesitan opciones.' });
  }
  const values = new Set<string>();
  field.options?.forEach((option, index) => {
    if (option.value === '__human_other__') ctx.addIssue({ code: 'custom', path: ['options', index, 'value'], message: 'Ese valor está reservado.' });
    if (values.has(option.value)) ctx.addIssue({ code: 'custom', path: ['options', index, 'value'], message: 'El valor de la opción está repetido.' });
    values.add(option.value);
  });
});

export const humanDecisionRequestSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
  fields: z.array(humanDecisionFieldSchema).min(1).max(8),
  submitLabel: z.string().trim().max(60).optional(),
}).superRefine((request, ctx) => {
  const seen = new Set<string>();
  request.fields.forEach((field, index) => {
    if (seen.has(field.id)) ctx.addIssue({ code: 'custom', path: ['fields', index, 'id'], message: 'El id del campo está repetido.' });
    seen.add(field.id);
  });
});

export const humanDecisionAnswersSchema = z.object({
  values: z.record(z.string().max(48), z.string().max(12_000)),
}).superRefine((answer, ctx) => {
  const total = Object.values(answer.values).reduce((sum, value) => sum + value.length, 0);
  if (total > 20_000) ctx.addIssue({ code: 'custom', path: ['values'], message: 'La respuesta completa supera 20.000 caracteres.' });
});

export type HumanDecisionOption = z.infer<typeof humanDecisionOptionSchema>;
export type HumanDecisionField = z.infer<typeof humanDecisionFieldSchema>;
export type HumanDecisionRequest = z.infer<typeof humanDecisionRequestSchema>;
export type HumanDecisionAnswers = z.infer<typeof humanDecisionAnswersSchema>;

export function validateHumanDecisionAnswers(
  request: HumanDecisionRequest,
  raw: HumanDecisionAnswers,
): { ok: true; values: Record<string, string> } | { ok: false; error: string } {
  const parsed = humanDecisionAnswersSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Respuesta inválida.' };

  const allowedIds = new Set(request.fields.map((field) => field.id));
  const unknown = Object.keys(parsed.data.values).find((id) => !allowedIds.has(id));
  if (unknown) return { ok: false, error: `El campo "${unknown}" no forma parte de esta decisión.` };

  for (const field of request.fields) {
    const value = parsed.data.values[field.id] ?? '';
    if (field.required && !value.trim()) return { ok: false, error: `Completá “${field.label}”.` };
    if ((field.type === 'buttons' || field.type === 'select') && value.trim()) {
      const known = field.options?.some((option) => option.value === value) ?? false;
      if (!known && !field.allowOther) return { ok: false, error: `Elegí una opción válida en “${field.label}”.` };
    }
  }

  return { ok: true, values: parsed.data.values };
}
