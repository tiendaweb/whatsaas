/**
 * Contratos de las rutas HTTP del plugin `sales-ops` (app/api/plugins/sales-ops/*).
 *
 * Los consumen la UI (`lib/plugins/sales-ops/ui/*`) y los producen los módulos
 * de `server/`. Distintos equipos de trabajo implementan cada lado en paralelo:
 * este archivo es el acuerdo. No cambiar una forma sin avisar al otro lado.
 */
import type {
  ActionKind,
  ActionRole,
  ActionStatus,
  AnalysisStatus,
  AnalyzedBy,
  CollectionSpeed,
  CustomerEvidence,
  DropReason,
  ExperimentStatus,
  Gate,
  Intent,
  Need,
  Objection,
  Owner,
  SignalKind,
  SignalStatus,
  Source,
  Temperature,
} from './taxonomy';
import type { DossierEntry, Evidence } from './contract';

/** Fila de lista y cabecera de ficha. Nunca lleva el teléfono completo. */
export type AnalysisRow = {
  id: number;
  chatId: number;
  contactId: number | null;
  name: string;
  phoneMasked: string;
  avatarUrl: string | null;
  currentGate: Gate;
  maxGate: Gate;
  dropGate: Gate;
  dropReason: DropReason;
  confidence: number;
  priorityScore: number;
  recoveryProbability: number;
  potentialValueUsd: number;
  collectionSpeed: CollectionSpeed;
  need: Need;
  objectionType: Objection;
  intent: Intent;
  temperature: Temperature;
  status: AnalysisStatus;
  recommendedAction: string;
  recommendedOwner: Owner;
  nextActionAt: string | null;
  lastCustomerMessageAt: string | null;
  lastTeamMessageAt: string | null;
  daysSilent: number | null;
  followupsTotal: number;
  automationActive: boolean;
  isExistingCustomer: boolean;
  customerEvidence: CustomerEvidence;
  paymentPending: boolean;
  autoReplyDetected: boolean;
  evidenceGap: boolean;
  stale: boolean;
  analyzedAt: string | null;
  analyzedBy: AnalyzedBy | null;
  version: number;
  source: Source;
};

export type AnalysisDetail = AnalysisRow & {
  needDetail: string | null;
  businessType: string | null;
  quotedPrice: { amount: number; currency: string } | null;
  proposalSummary: string | null;
  objectionDetail: string | null;
  intentScore: number;
  lastProspectAction: string | null;
  lastTeamAction: string | null;
  statusReason: string | null;
  notesForHuman: string | null;
  crmToFix: string | null;
  evidence: Evidence;
  priorRadar: Record<string, unknown> | null;
  sourceDetail: string | null;
  firstContactAt: string | null;
  followupsAutomated: number;
  followupsManual: number;
  lastFollowupAt: string | null;
  provider: string | null;
  model: string | null;
};

export type TimelineHit = DossierEntry & {
  /** ids de evidencia a los que pertenece (gate/price/objection/intent/payment). */
  evidenceOf: string[];
};

export type TimelineGap = { from: string; to: string; count: number; kind: 'silence' | 'omitted' };

export type AnalysisVersionRow = {
  id: number;
  version: number;
  reason: string;
  analyzedBy: AnalyzedBy | null;
  currentGate: Gate;
  confidence: number;
  createdAt: string;
  createdBy: number | null;
  diff: Record<string, { from: unknown; to: unknown }> | null;
};

export type ActionRow = {
  id: number;
  chatId: number;
  contactId: number | null;
  name: string;
  batchId: string;
  batchLabel: string;
  experimentId: number | null;
  variant: string | null;
  kind: ActionKind;
  payload: Record<string, unknown>;
  gateAtCreation: Gate | null;
  status: ActionStatus;
  requiresRole: ActionRole;
  proposedBy: string;
  approvedBy: number | null;
  approvedAt: string | null;
  executedAt: string | null;
  executedVia: string | null;
  resultMessageId: string | null;
  result: Record<string, unknown> | null;
  scheduledFor: string | null;
  expiresAt: string | null;
  createdAt: string;
  /** Advertencias calculadas al listar: automatización viva, auto-reply, envío reciente, cliente. */
  warnings: string[];
};

export type BatchSummary = {
  batchId: string;
  batchLabel: string;
  kind: ActionKind;
  requiresRole: ActionRole;
  experimentId: number | null;
  total: number;
  byStatus: Partial<Record<ActionStatus, number>>;
  createdAt: string;
  approvedBy: number | null;
  responded: number;
  recovered: number;
};

export type SignalRow = {
  id: number;
  chatId: number;
  contactId: number | null;
  name: string;
  messageId: string;
  kind: SignalKind;
  confidence: number;
  excerpt: string;
  triggeredByActionId: number | null;
  gateBefore: Gate | null;
  gateAfter: Gate | null;
  status: SignalStatus;
  handledBy: number | null;
  handledAt: string | null;
  createdAt: string;
};

export type ExperimentRow = {
  id: number;
  name: string;
  hypothesis: string | null;
  segmentGates: Gate[];
  messageA: string | null;
  messageB: string | null;
  status: ExperimentStatus;
  startedAt: string | null;
  endedAt: string | null;
  funnel: Record<'A' | 'B' | 'all', ExperimentFunnel>;
};

export type ExperimentFunnel = {
  eligible: number;
  sent: number;
  delivered: number;
  responded: number;
  recovered: number;
  proposal: number;
  paid: number;
  revenueUsd: number;
};

export type CashGoal = {
  goalUsd: number;
  collectedUsd: number;
  byCurrency: Record<string, number>;
  salesCount: number;
  lastPaidAt: string | null;
  since: string;
};

export type OverviewPayload = {
  cash: CashGoal;
  counters: {
    moneyNow: number;
    respondedToday: number;
    opportunities: number;
    sweep: number;
    preDiscard: number;
    customers: number;
  };
  audit: {
    analyzed: number;
    total: number;
    stale: number;
    toReview: number;
    audiosQueued: number;
    /** Ítems que esperan un conector: envíos aprobados + sin analizar + desactualizados. */
    connectorPending: number;
  };
  nextBest: Array<{
    chatId: number;
    name: string;
    gate: Gate | null;
    priorityScore: number;
    reason: 'signal' | 'priority';
    signalKind?: SignalKind;
    text: string;
    owner: Owner;
  }>;
  distribution: Record<Gate, number>;
  generatedAt: string;
};

export type ListQuery = {
  vista?: 'dinero' | 'oportunidades' | 'barrido' | 'limpieza' | 'todos';
  gates?: Gate[];
  status?: AnalysisStatus[];
  owner?: Owner;
  objection?: Objection;
  need?: Need;
  source?: Source;
  ageBucket?: 'lt7' | '7to30' | '30to90' | '90to180' | 'gt180';
  followups?: '0' | '1' | '2' | '3plus';
  evidenceGap?: boolean;
  automationActive?: boolean;
  stale?: boolean;
  toReview?: boolean;
  q?: string;
  sort?: 'priority' | 'age' | 'lastFollowup' | 'name';
  cursor?: string;
  limit?: number;
};

export type ListPayload = {
  rows: AnalysisRow[];
  total: number;
  nextCursor: string | null;
};

export type DetailPayload = {
  analysis: AnalysisDetail | null;
  timeline: Array<TimelineHit | TimelineGap>;
  versions: AnalysisVersionRow[];
  actions: ActionRow[];
  signals: SignalRow[];
  chatHref: string;
};

export type MetricsPayload = {
  cashByWeek: Array<{ week: string; usd: number }>;
  byGate: Record<Gate, { total: number; responded: number; recovered: number; proposal: number; paid: number; revenueUsd: number }>;
  byAge: Record<string, { total: number; responded: number; recovered: number }>;
  byObjection: Record<string, { total: number; recovered: number }>;
  byFollowups: Record<string, { total: number; responded: number }>;
  bySource: Record<string, { total: number; paid: number; revenueUsd: number }>;
  audit: { analyzed: number; total: number; avgConfidence: number; toReviewPct: number; evidenceGapPct: number; versionsPerChat: number };
};

export type QueueListPayload = {
  batches: BatchSummary[];
};

export type QueueBatchPayload = {
  batch: BatchSummary;
  actions: ActionRow[];
};

export type SignalsPayload = {
  rows: SignalRow[];
  counts: Record<SignalKind, number>;
  lastCutAt: string | null;
};
