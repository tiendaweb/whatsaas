'use client';

import useSWR from 'swr';
import Link from 'next/link';
import { AlertTriangle, CalendarClock, CircleDollarSign, ExternalLink, Handshake, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ContactCommercialSnapshot } from '@/lib/contacts/graph';

/**
 * Lo comercial del contacto, arriba de todo en el panel del chat: qué le estás
 * vendiendo, cuánto te debe y cuándo lo ves.
 *
 * Estaba todo en la base y no se veía mientras hablabas: la oportunidad abierta
 * no aparecía en ninguna pantalla del chat (sólo se podía CREAR una desde la
 * ficha), la deuda vivía en el panel de Ventas y la próxima reunión en el
 * Calendario. Eran tres pestañas para contestar un mensaje.
 *
 * El bloque se oculta entero si no hay nada que contar. Un panel que muestra
 * tres ceros en cada chat enseña a ignorarlo.
 */

const fetcher = (url: string) => fetch(url).then((res) => (res.ok ? res.json() : null));

/**
 * Los importes vienen en la unidad menor y la moneda sale de una columna de
 * texto libre. `Intl.NumberFormat` tira `RangeError` con un código inválido y
 * se lleva puesta la pantalla entera con el error boundary genérico, así que
 * cualquier moneda sucia cae al formato simple en vez de romper.
 */
function formatMoney(cents: number, currency: string) {
  const amount = cents / 100;
  try {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${amount.toLocaleString('es-AR', { maximumFractionDigits: 0 })} ${currency}`;
  }
}

function formatTotals(totals: Record<string, number>) {
  return Object.entries(totals)
    .filter(([, value]) => value !== 0)
    .map(([currency, value]) => formatMoney(value, currency))
    .join(' + ');
}

/** "en 3 días", "hace 2 días", "hoy". Sin librería: son tres casos. */
function relativeDay(iso: string) {
  const dias = Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'mañana';
  if (dias === -1) return 'ayer';
  return dias > 0 ? `en ${dias} días` : `hace ${Math.abs(dias)} días`;
}

const STAGE_LABEL: Record<string, string> = {
  qualified: 'Calificada',
  proposal: 'Propuesta',
  negotiation: 'Negociación',
  closed_won: 'Ganada',
  closed_lost: 'Perdida',
};

function Row({ icon, children, tone }: { icon: React.ReactNode; children: React.ReactNode; tone?: 'alert' }) {
  return (
    <div className={cn(
      'flex items-start gap-2 rounded-lg border bg-background p-2.5 text-sm',
      tone === 'alert' && 'border-destructive/40 bg-destructive/5',
    )}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function CommercialPanel({ contactId }: { contactId?: number | null }) {
  const { data, isLoading } = useSWR<ContactCommercialSnapshot | null>(
    contactId ? `/api/contacts/commercial-snapshot?contactId=${contactId}` : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  if (!contactId) return null;
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 border-y py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando datos comerciales…
      </div>
    );
  }
  if (!data) return null;

  const subs = data.subscriptions;
  const sub = subs?.active[0] ?? null;
  const otrasSubs = Math.max(0, (subs?.active.length ?? 0) - 1);
  const subVencida = !sub ? subs?.lastExpired ?? null : null;
  const sinPagar = subs?.unpaid.length ?? 0;

  const deal = data.deals?.open[0] ?? null;
  const otrasAbiertas = Math.max(0, (data.deals?.open.length ?? 0) - 1);
  const money = data.money;
  const debe = money ? formatTotals(money.pendingByCurrency) : '';
  const proxima = data.agenda?.next ?? null;
  const pendiente = data.agenda?.last?.nextAction?.trim() || '';

  // Nada que contar: el bloque no existe.
  if (!sub && !subVencida && !deal && !debe && !proxima && !pendiente) return null;

  return (
    <section className="space-y-2 border-y py-4">
      <h3 className="flex items-center text-sm font-semibold">
        <Handshake className="mr-2 h-4 w-4 text-primary" />
        Comercial
      </h3>

      {sub && (
        <Row
          icon={<RefreshCw className={cn('h-4 w-4', (sub.daysLeft ?? 99) <= 7 || sub.paymentStatus !== 'paid' ? 'text-destructive' : 'text-primary')} />}
          tone={(sub.daysLeft ?? 99) <= 7 || sub.paymentStatus !== 'paid' ? 'alert' : undefined}
        >
          <div className="flex items-start justify-between gap-2">
            <span className="min-w-0">
              <span className="block truncate font-medium">{sub.planName || 'Suscripción'}</span>
              <span className="text-xs text-muted-foreground">
                {sub.endDate
                  ? sub.daysLeft != null && sub.daysLeft < 0
                    ? `venció hace ${Math.abs(sub.daysLeft)} días`
                    : `renueva ${relativeDay(`${sub.endDate}T12:00:00`)}`
                  : 'sin vencimiento'}
                {/* Los dos ejes son independientes: se puede estar activo y sin pagar. */}
                {sub.paymentStatus !== 'paid' ? ' · SIN PAGAR' : ''}
                {otrasSubs > 0 ? ` · +${otrasSubs} más` : ''}
              </span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums">{formatMoney(sub.price, sub.currency)}</span>
          </div>
        </Row>
      )}

      {!sub && subVencida && (
        <Row icon={<RefreshCw className="h-4 w-4 text-muted-foreground" />}>
          <span className="block truncate font-medium">{subVencida.planName || 'Suscripción'}</span>
          <span className="text-xs text-muted-foreground">
            Vencida{subVencida.endDate ? ` ${relativeDay(`${subVencida.endDate}T12:00:00`)}` : ''} · sin renovar
          </span>
        </Row>
      )}

      {sinPagar > 1 && (
        <p className="text-xs font-medium text-destructive">
          {sinPagar} suscripciones activas sin pago registrado.
        </p>
      )}

      {deal && (
        <Row icon={<Handshake className="h-4 w-4 text-primary" />}>
          <Link href="/plugins/deals" className="flex items-start justify-between gap-2 hover:underline">
            <span className="min-w-0">
              <span className="block truncate font-medium">{deal.title}</span>
              <span className="text-xs text-muted-foreground">
                {STAGE_LABEL[deal.stage] ?? deal.stage} · {deal.probability}%
                {deal.expectedCloseDate ? ` · cierra ${relativeDay(deal.expectedCloseDate)}` : ''}
                {otrasAbiertas > 0 ? ` · +${otrasAbiertas} más` : ''}
              </span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums">{formatMoney(deal.value, deal.currency)}</span>
          </Link>
        </Row>
      )}

      {debe && (
        <Row
          icon={<CircleDollarSign className={cn('h-4 w-4', money!.overdueCount > 0 ? 'text-destructive' : 'text-primary')} />}
          tone={money!.overdueCount > 0 ? 'alert' : undefined}
        >
          <div className="flex items-start justify-between gap-2">
            <span className="min-w-0">
              <span className="block font-medium">Debe {debe}</span>
              <span className="text-xs text-muted-foreground">
                {money!.pendingCount} {money!.pendingCount === 1 ? 'venta sin cobrar' : 'ventas sin cobrar'}
                {money!.nextDueDate ? ` · vence ${relativeDay(money!.nextDueDate)}` : ''}
              </span>
            </span>
            {money!.overdueCount > 0 && (
              <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-destructive">
                <AlertTriangle className="h-3 w-3" />
                {money!.overdueCount} vencida{money!.overdueCount === 1 ? '' : 's'}
              </span>
            )}
          </div>
        </Row>
      )}

      {(proxima || pendiente) && (
        <Row icon={<CalendarClock className="h-4 w-4 text-primary" />}>
          {proxima && (
            <span className="block truncate font-medium">
              {proxima.title} · {relativeDay(proxima.startsAt)}
            </span>
          )}
          {pendiente && (
            <span className="block text-xs text-muted-foreground">
              Quedó pendiente: {pendiente}
            </span>
          )}
        </Row>
      )}

      {subs?.lastPayment && (
        <p className="text-xs text-muted-foreground">
          Último pago: {subs.lastPayment.amount} {subs.lastPayment.currency ?? ''}
          {subs.lastPayment.gateway ? ` · ${subs.lastPayment.gateway}` : ''}
          {subs.lastPayment.date ? ` · ${relativeDay(subs.lastPayment.date)}` : ''}
        </p>
      )}

      {data.scope.siblings.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {data.scope.customerName} tiene {data.scope.siblings.length} contacto
          {data.scope.siblings.length === 1 ? '' : 's'} más: {data.scope.siblings.map((s) => s.name).join(', ')}
        </p>
      )}

      {data.scope.customerId != null && (
        <Link
          href={`/plugins/customers/${data.scope.customerId}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Abrir ficha del cliente <ExternalLink className="h-3 w-3" />
        </Link>
      )}
    </section>
  );
}
