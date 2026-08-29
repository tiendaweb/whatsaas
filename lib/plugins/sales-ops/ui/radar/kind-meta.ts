import type { SignalKind } from '../../shared/taxonomy';

/** Emoji, etiqueta y orden de cada tipo de señal (doc 05 §6). Literales completos: Tailwind v4. */
export const KIND_META: Record<SignalKind, { emoji: string; label: string; urgent: boolean; folded: boolean }> = {
  pago: { emoji: '💰', label: 'Pago', urgent: true, folded: false },
  intencion_compra: { emoji: '🔥', label: 'Intención', urgent: true, folded: false },
  quiere_llamada: { emoji: '📞', label: 'Quiere llamada', urgent: true, folded: false },
  precio: { emoji: '💲', label: 'Precio', urgent: false, folded: false },
  objecion: { emoji: '🧱', label: 'Objeción', urgent: false, folded: false },
  interesado: { emoji: '🙂', label: 'Interesado', urgent: false, folded: false },
  pide_informacion: { emoji: '❓', label: 'Pide info', urgent: false, folded: false },
  rechazo: { emoji: '🚫', label: 'Rechazo', urgent: false, folded: false },
  respuesta_automatica: { emoji: '🤖', label: 'Automática', urgent: false, folded: true },
  irrelevante: { emoji: '⚪', label: 'Irrelevante', urgent: false, folded: true },
};

export const KIND_ORDER: SignalKind[] = [
  'pago',
  'intencion_compra',
  'quiere_llamada',
  'precio',
  'objecion',
  'interesado',
  'pide_informacion',
  'rechazo',
  'respuesta_automatica',
  'irrelevante',
];

/** "hace 12 min" sin depender de Intl (que revienta con datos sucios). */
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Math.max(0, Date.now() - then);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `hace ${d} d`;
  const m = Math.floor(d / 30);
  return `hace ${m} mes${m === 1 ? '' : 'es'}`;
}
