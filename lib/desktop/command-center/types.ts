import type { DealStage } from '@/lib/deals/types';

/**
 * `finance` son los movimientos por cobrar y por pagar que vencen o ya
 * vencieron. Entraron a la bandeja para que "registrar el cobro" sea una acción
 * del día y no una visita aparte al tablero de Finanzas.
 */
export const COMMAND_ITEM_KINDS = ['chat', 'task', 'membership', 'deal', 'event', 'finance'] as const;
export type CommandItemKind = (typeof COMMAND_ITEM_KINDS)[number];

/** Etapas que la bandeja puede mover. Cerrar una oportunidad emite venta y exige
 *  `salesWrite`: no se hace desde un clic en una lista. */
export const BATCH_DEAL_STAGES: readonly DealStage[] = ['qualified', 'proposal', 'negotiation'];

/**
 * Lo que el cliente puede pedir. `send-message` lleva SÓLO `chatId`: el
 * destinatario lo resuelve el servidor contra la base dentro del scope del
 * usuario, porque `sendTeamTextMessage` rutea por jid y aceptar el jid del
 * cliente convierte el chequeo de permiso en decoración.
 */
export type CommandAction =
  | { type: 'send-message'; chatId: number; text: string; source: SuggestionSource; suggestionId?: string | null }
  | { type: 'mark-chat-read'; chatId: number }
  | { type: 'complete-task'; taskId: number }
  | { type: 'snooze-task'; taskId: number; days: number }
  | {
      type: 'set-task-ai-detail';
      taskId: number;
      field: 'next-step' | 'context-question' | 'context-answer';
      text: string;
      source: SuggestionSource;
      suggestionId?: string | null;
    }
  | { type: 'move-deal-stage'; dealId: number; stage: DealStage }
  // ── Acciones sobre el contacto ────────────────────────────────────────────
  // Todas llevan `chatId` y no `contactId`: la bandeja identifica al interlocutor
  // por su chat, y el contacto lo resuelve el servidor. Aceptar un contactId del
  // cliente abriría una puerta para tocar la ficha de alguien que no está en la
  // bandeja de esta persona.
  | { type: 'set-crm-stage'; chatId: number; funnelStageId: number | null }
  | { type: 'change-contact-tags'; chatId: number; add?: number[]; remove?: number[] }
  | { type: 'assign-contact'; chatId: number; assignedUserId?: number | null; assignedDepartmentId?: number | null }
  /** Nota interna: queda en la conversación y NUNCA se le envía al cliente. */
  | { type: 'add-internal-note'; chatId: number; text: string; source: SuggestionSource }
  | { type: 'create-task'; chatId: number; title: string; notes?: string; dueDate?: string | null }
  // ── Plata ─────────────────────────────────────────────────────────────────
  // No cuelgan de un chat: la membresía y el asiento son la entidad, y el
  // servidor valida que sean del equipo antes de tocarlas.
  | {
      type: 'renew-membership';
      subscriptionId: number;
      newEndDate: string;
      paymentStatus?: 'pending' | 'paid' | 'overdue' | 'refunded';
      /** Deja además el asiento de ingreso. Sin esto la cobranza queda a medias. */
      recordPayment?: boolean;
      amount?: number;
      accountId?: number | null;
    }
  | {
      type: 'settle-entry';
      entryId: number;
      /** En unidad mínima entera, en la moneda del asiento. */
      amount: number;
      paidOn: string;
      accountId?: number | null;
      method?: string | null;
      notes?: string | null;
    };
export type CommandActionType = CommandAction['type'];

/**
 * Lo único que no se puede deshacer es lo que sale del equipo. Una etiqueta, una
 * etapa o una asignación se revierten con otra acción; un WhatsApp enviado no.
 */
export const IRREVERSIBLE_ACTIONS: readonly CommandActionType[] = ['send-message'];

export type SuggestionSource = 'ai' | 'template' | 'custom';

export type CommandSuggestion = {
  id: string;
  /** Texto completo que se enviaría. El chip muestra este texto truncado, no una
   *  etiqueta aparte: una etiqueta que la IA inventa puede no describir el cuerpo. */
  text: string;
  tone: 'neutral' | 'warm' | 'firm';
  source: Exclude<SuggestionSource, 'custom'>;
  purpose?: 'reply' | 'next-step' | 'context-question';
  /** El borrador afirma importes, porcentajes o fechas que no están en el
   *  contexto. La revisión lo marca en rojo. */
  warning?: string | null;
  /** El texto todavía tiene `[[variables]]` sin resolver: no se puede planificar
   *  de un clic, abre el editor. */
  needsEdit?: boolean;
};

export type SuggestionState = 'idle' | 'loading' | 'ready' | 'unavailable';
export type SuggestionReason = 'ai-not-configured' | 'plugin-off' | 'no-channel' | 'no-permission' | 'error';

export type CommandItem = {
  id: string;
  kind: CommandItemKind;
  entityId: number;
  title: string;
  detail: string;
  href: string;
  at: string | null;
  /** La fecha es sólo día (vencimiento de membresía): se muestra sin hora. */
  dateOnly?: boolean;
  urgent: boolean;
  score: number;
  actions: CommandAction[];
  defaultActionType: CommandActionType | null;
  /** Canal de respuesta. El teléfono NO viaja al cliente: alcanza el chatId. */
  reply: { chatId: number; contactName: string } | null;
  taskAi?: { nextStep: string; contextQuestion: string; contextAnswer: string } | null;
  suggestions: CommandSuggestion[];
  suggestionsState: SuggestionState;
  suggestionsReason?: SuggestionReason;
};

export type CommandCapabilities = {
  canSend: boolean;
  canTasksWrite: boolean;
  canDealsWrite: boolean;
  aiReady: boolean;
  signatureName: string | null;
};

export type CommandCenterPayload = {
  generatedAt: string;
  teamId: number;
  items: CommandItem[];
  /** Total REAL por kind, antes de la cuota por kind y del tope global, para que
   *  el badge pueda decir "8 de 60". Siempre trae las 5 claves. */
  counts: Record<CommandItemKind, number>;
  totals: { pending: number; shown: number };
  capabilities: CommandCapabilities;
};

export type PlannedAction = {
  itemId: string;
  action: CommandAction;
};

export type BatchErrorCode =
  | 'permission_denied'
  | 'out_of_scope'
  | 'not_found'
  | 'plugin_off'
  | 'send_failed'
  | 'send_unknown'
  | 'duplicate_recipient'
  | 'invalid';

export type BatchResultRow = {
  itemId: string;
  ok: boolean;
  idempotent?: boolean;
  error?: BatchErrorCode;
  message?: string;
  /** Sólo en /validar: a quién le va a llegar, resuelto en el servidor. */
  recipient?: { name: string; masked: string } | null;
  signatureName?: string | null;
  /** `send_unknown`: no se sabe si salió. Link al chat en vez de reintento. */
  href?: string;
};

export type BatchResponse = {
  results: BatchResultRow[];
  okCount: number;
  failCount: number;
  validation: boolean;
};

/** Teléfono enmascarado para la pantalla de revisión: +54 9 11 ****3312. */
export function maskJid(remoteJid: string): string {
  const digits = remoteJid.replace(/\D/g, '');
  if (digits.length < 6) return '****';
  const head = digits.slice(0, 4);
  const tail = digits.slice(-4);
  return `+${head} ${'*'.repeat(Math.max(2, digits.length - 8))}${tail}`;
}
