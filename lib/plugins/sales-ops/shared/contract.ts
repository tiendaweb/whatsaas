/**
 * Contrato de salida del clasificador (doc 04 §7).
 *
 * Es el MISMO objeto tanto si lo produjo el worker del servidor (Gemini vía
 * `generateStructuredObjectForTeam`) como si lo trajo un conector (Claude /
 * ChatGPT / Grok) a través de `whatspro_sales_classification_write`. Todo lo
 * que entra a `team_commercial_analysis` pasa por `classificationSchema`.
 */
import { z } from 'zod';
import {
  ANALYSIS_STATUSES,
  COLLECTION_SPEEDS,
  CURRENCIES,
  CUSTOMER_EVIDENCE,
  DROP_REASONS,
  GATES,
  INTENTS,
  NEEDS,
  OBJECTIONS,
  OWNERS,
  SIGNAL_KINDS,
  SOURCES,
  TEMPERATURES,
} from './taxonomy';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');

export const evidenceSchema = z.object({
  gate: z.array(z.string()).default([]),
  price: z.array(z.string()).optional(),
  objection: z.array(z.string()).optional(),
  intent: z.array(z.string()).optional(),
  payment: z.array(z.string()).optional(),
});
export type Evidence = z.infer<typeof evidenceSchema>;

export const quotedPriceSchema = z.object({
  amount: z.number().int().nonnegative(),
  currency: z.enum(CURRENCIES),
});

/** Lo que devuelve la IA (o el conector). Sin los campos que el servidor calcula solo. */
export const classificationSchema = z.object({
  current_gate: z.enum(GATES),
  max_gate: z.enum(GATES),
  drop_gate: z.enum(GATES),
  drop_reason: z.enum(DROP_REASONS),
  confidence: z.number().int().min(0).max(100),
  evidence: evidenceSchema,
  source: z.enum(SOURCES).optional(),
  business_type: z.string().max(120).nullable().optional(),
  need: z.enum(NEEDS),
  need_detail: z.string().max(300).nullable().optional(),
  quoted_price: quotedPriceSchema.nullable().optional(),
  proposal_summary: z.string().max(600).nullable().optional(),
  objection_type: z.enum(OBJECTIONS),
  objection_detail: z.string().max(300).nullable().optional(),
  intent: z.enum(INTENTS),
  intent_score: z.number().int().min(0).max(100),
  temperature: z.enum(TEMPERATURES).optional(),
  is_existing_customer_by_chat: z.boolean().default(false),
  payment_pending_by_chat: z.boolean().default(false),
  last_prospect_action: z.string().max(300).nullable().optional(),
  last_team_action: z.string().max(300).nullable().optional(),
  potential_value_usd: z.number().int().nonnegative().optional(),
  collection_speed: z.enum(COLLECTION_SPEEDS).optional(),
  recovery_probability: z.number().int().min(0).max(100).optional(),
  recommended_action: z.string().max(400),
  recommended_owner: z.enum(OWNERS),
  suggested_status: z.enum(ANALYSIS_STATUSES).optional(),
  next_action_at: isoDate.nullable().optional(),
  notes_for_human: z.string().max(1000).nullable().optional(),
  crm_to_fix: z.string().max(600).nullable().optional(),
});
export type Classification = z.infer<typeof classificationSchema>;

/** Hechos que calculan las reglas determinísticas antes de la IA (doc 04 §2). */
export const ruleFactsSchema = z.object({
  is_existing_customer: z.boolean(),
  customer_evidence: z.enum(CUSTOMER_EVIDENCE),
  forced_gate: z.enum(GATES).nullable(),
  forced_reason: z.string().nullable(),
  min_gate: z.enum(GATES).nullable(),
  payment_pending: z.boolean(),
  automation_active: z.boolean(),
  automation_name: z.string().nullable(),
  auto_reply_detected: z.boolean(),
  evidence_gap: z.boolean(),
  pending_audio_message_ids: z.array(z.string()),
  never_answered_by_us: z.boolean(),
  days_silent: z.number().int().nonnegative().nullable(),
  who_spoke_last: z.enum(['cliente', 'nosotros', 'nadie']),
  followups_total: z.number().int().nonnegative(),
  followups_automated: z.number().int().nonnegative(),
  followups_manual: z.number().int().nonnegative(),
  last_followup_at: z.string().nullable(),
  source: z.enum(SOURCES),
  source_detail: z.string().nullable(),
  first_contact_at: z.string().nullable(),
  last_customer_message_at: z.string().nullable(),
  last_team_message_at: z.string().nullable(),
  last_human_message_at: z.string().nullable(),
  human_override: z.boolean(),
});
export type RuleFacts = z.infer<typeof ruleFactsSchema>;

/** Un hito del expediente que ve la IA y la pestaña Timeline. */
export const dossierEntrySchema = z.object({
  id: z.string(),
  at: z.string(),
  who: z.enum(['cliente', 'humano', 'bot', 'ia', 'nota']),
  type: z.string(),
  text: z.string(),
  flags: z.array(z.enum(['precio', 'pago', 'objecion', 'compromiso', 'rechazo', 'auto'])).default([]),
});
export type DossierEntry = z.infer<typeof dossierEntrySchema>;

export const dossierSchema = z.object({
  chat: z.object({
    id: z.number(),
    contactId: z.number().nullable(),
    name: z.string(),
    phoneMasked: z.string(),
    instanceId: z.number().nullable(),
    automationDisabled: z.boolean(),
  }),
  contact: z
    .object({
      funnelStage: z.string().nullable(),
      tags: z.array(z.string()),
      customData: z.record(z.string(), z.unknown()),
    })
    .nullable(),
  commercial: z.unknown().nullable(),
  counts: z.object({
    total: z.number(),
    customer: z.number(),
    customerEffective: z.number(),
    human: z.number(),
    bot: z.number(),
    ai: z.number(),
    internal: z.number(),
    audiosTotal: z.number(),
    audiosTranscribed: z.number(),
  }),
  timeline: z.array(dossierEntrySchema),
  omitted: z.array(z.object({ from: z.string(), to: z.string(), count: z.number() })).default([]),
  facts: ruleFactsSchema,
  fingerprint: z.string(),
});
export type Dossier = z.infer<typeof dossierSchema>;

/** Salida del radar por mensaje entrante (doc 04 §10). */
export const signalClassificationSchema = z.object({
  kind: z.enum(SIGNAL_KINDS),
  confidence: z.number().int().min(0).max(100),
  gate_after_suggested: z.enum(GATES).nullable().optional(),
  urgent: z.boolean().default(false),
  excerpt: z.string().max(300).optional(),
});
export type SignalClassification = z.infer<typeof signalClassificationSchema>;
