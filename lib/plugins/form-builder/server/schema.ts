import { z } from 'zod';

export const FORM_BUILDER_PLUGIN_ID = 'form-builder';

export const formFieldTypeSchema = z.enum([
  'text',
  'textarea',
  'email',
  'phone',
  'number',
  'select',
  'checkbox',
  'date',
]);

export const formFieldSchema = z.object({
  id: z.string().min(1).max(80),
  key: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-zA-Z0-9_]+$/, 'La key solo puede contener letras, numeros y guion bajo.'),
  label: z.string().min(1).max(140),
  type: formFieldTypeSchema,
  required: z.boolean().default(false),
  placeholder: z.string().max(180).optional().default(''),
  options: z.array(z.string().min(1).max(120)).max(40).optional().default([]),
});

export const formStyleSchema = z.object({
  theme: z.enum(['blank', 'classic', 'soft']).default('blank'),
  background: z.string().max(80).optional().default(''),
  textColor: z.string().max(80).optional().default(''),
  accentColor: z.string().max(80).optional().default(''),
  borderRadius: z.enum(['none', 'small', 'medium', 'large']).default('medium'),
});

const defaultFormStyle = {
  theme: 'blank' as const,
  background: '',
  textColor: '',
  accentColor: '',
  borderRadius: 'medium' as const,
};

export const formStatusSchema = z.enum(['draft', 'published']);

export const formBuilderFormInputSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).nullable().optional(),
  slug: z.string().max(180).nullable().optional(),
  status: formStatusSchema.default('draft'),
  instanceId: z.number().int().positive(),
  fields: z.array(formFieldSchema).max(80).default([]),
  style: formStyleSchema.default(defaultFormStyle),
  submitButtonLabel: z.string().min(1).max(80).default('Enviar'),
  successMessage: z.string().min(1).max(1000).default('Gracias. Recibimos tus datos correctamente.'),
  confirmationMessage: z
    .string()
    .min(1)
    .max(5000)
    .default('Hola {{nombre}}, recibimos tus datos de {{formulario}}.\n\n{{datos}}'),
});

export const submissionStatusSchema = z.enum(['new', 'in_review', 'managed', 'archived']);

export const publicSubmissionSchema = z.object({
  data: z.record(z.string(), z.unknown()),
});

export type FormField = z.infer<typeof formFieldSchema>;
export type FormStyle = z.infer<typeof formStyleSchema>;
export type FormBuilderFormInput = z.infer<typeof formBuilderFormInputSchema>;
export type PublicSubmissionInput = z.infer<typeof publicSubmissionSchema>;
