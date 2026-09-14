'use client';

import useSWR from 'swr';
import { AlertTriangle, ExternalLink, Loader2 } from 'lucide-react';
import type { ContactCommercialSnapshot } from '@/lib/contacts/graph';
import type { PanelChatSnapshot } from '@/lib/plugins/sales-ops/server/panel-chat';
import { CommandCenterNumeros } from './CommandCenter';
import { fecha, origenLabel, plata, relativo, type ClienteVinculado } from './tipos';

/**
 * Lo comercial del contacto: qué le estás vendiendo, cuánto debe y cuándo lo ves.
 *
 * Antes esto era una franja del panel y, justo debajo, otra franja separada de
 * AAPP SPACE con la MISMA membresía contada de otra manera —una decía "renueva
 * en 12 días" y la otra "vence el 3 de octubre", y ninguna decía de dónde
 * salía—. Se leían como dos verdades sobre el mismo cliente.
 *
 * Ahora hay una sola sección de membresías, con **todas** las del cliente (la
 * ficha del cliente ya las tenía completas; acá se pedía por otro lado una
 * versión recortada a una), y arriba de todo se dice **de dónde sale** ese
 * cliente: si lo trajo el sincronizador de AAPP SPACE o lo cargó alguien a
 * mano. Los sitios y el último sync, que era lo único propio del bloque de
 * AAPP SPACE, quedan como un renglón dentro de la misma sección.
 */

const fetcher = (url: string) => fetch(url).then((res) => (res.ok ? res.json() : null));

const ETAPA: Record<string, string> = {
  qualified: 'Calificada',
  proposal: 'Propuesta',
  negotiation: 'Negociación',
  closed_won: 'Ganada',
  closed_lost: 'Perdida',
};

const ESTADO_SUB: Record<string, string> = {
  active: 'activa',
  pending: 'pendiente',
  expired: 'vencida',
  cancelled: 'cancelada',
};

/** Suma por moneda, ya formateada. Las monedas nunca se suman entre sí. */
function porMoneda(totales: Record<string, number>): string {
  return Object.entries(totales)
    .filter(([, v]) => v !== 0)
    .map(([moneda, v]) => plata(v, moneda))
    .join(' · ');
}

export function ComercialTab({
  contactId,
  cliente,
  cargandoCliente,
  snapshot,
}: {
  contactId: number;
  /** El cliente vinculado, si lo hay. Lo trae el panel una sola vez. */
  cliente: ClienteVinculado | null;
  cargandoCliente: boolean;
  snapshot: PanelChatSnapshot | null;
}) {
  const { data, isLoading } = useSWR<ContactCommercialSnapshot | null>(
    `/api/contacts/commercial-snapshot?contactId=${contactId}`,
    fetcher,
    { revalidateOnFocus: false },
  );

  if (isLoading || cargandoCliente) {
    return (
      <div className="ctx-sec flex items-center gap-2 text-[11.5px]" style={{ color: 'var(--mq-muted)' }}>
        <Loader2 className="size-3.5 animate-spin" /> Cargando lo comercial…
      </div>
    );
  }

  const subsCliente = cliente?.subscriptions ?? [];
  const activas = subsCliente.filter((s) => s.status === 'active');
  const otras = subsCliente.filter((s) => s.status !== 'active');
  const impagas = activas.filter((s) => s.paymentStatus !== 'paid');

  const deals = data?.deals?.open ?? [];
  const money = data?.money ?? null;
  const debe = money ? porMoneda(money.pendingByCurrency) : '';
  const proxima = data?.agenda?.next ?? null;
  const pendiente = data?.agenda?.last?.nextAction?.trim() || '';

  const sinNada =
    subsCliente.length === 0 && deals.length === 0 && !debe && !proxima && !pendiente && !snapshot?.analizado;

  if (sinNada) {
    return (
      <div className="ctx-sec">
        <p className="text-[11.5px]" style={{ color: 'var(--mq-muted2)' }}>
          Este contacto no tiene membresías, oportunidades ni deuda registrada. Cuando las tenga aparecen acá.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* ── De dónde sale ── */}
      {cliente && (
        <div className="ctx-sec">
          <div className="ctx-t">De dónde sale</div>
          <div className="ctx-row">
            <span className="k">Cliente</span>
            <span className="v">{cliente.name}</span>
          </div>
          <div className="ctx-row">
            <span className="k">Origen</span>
            <span className="v">{origenLabel(cliente.source)}</span>
          </div>
          {cliente.externalId && (
            <div className="ctx-row">
              <span className="k">Id externo</span>
              <span className="v mono">{cliente.externalId}</span>
            </div>
          )}
          {cliente.lastSyncedAt && (
            <div className="ctx-row">
              <span className="k">Último sync</span>
              <span className="v">{relativo(cliente.lastSyncedAt)}</span>
            </div>
          )}
          {cliente.stores.length > 0 && (
            <div className="mt-1.5">
              <div className="ctx-t" style={{ marginBottom: 5 }}>Sitios</div>
              {cliente.stores.map((s) => (
                s.url ? (
                  <a key={s.id} href={s.url} target="_blank" rel="noreferrer" className="list-row" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <span className="nm flex-1">{s.title || s.subTitle || 'Sitio'}</span>
                    <ExternalLink className="size-3 shrink-0" aria-hidden />
                  </a>
                ) : (
                  <div key={s.id} className="list-row">
                    <span className="nm flex-1">{s.title || s.subTitle || 'Sitio'}</span>
                    <span className="sub2">{s.status ?? 'sin publicar'}</span>
                  </div>
                )
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Membresías: TODAS, no la última ── */}
      {subsCliente.length > 0 && (
        <div className="ctx-sec">
          <div className="ctx-t">
            Membresías ({subsCliente.length})
          </div>
          {impagas.length > 0 && (
            <p className="mb-1.5 flex items-start gap-1.5 text-[11px] font-semibold text-destructive">
              <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
              {impagas.length === 1 ? 'Una membresía activa sin pago registrado.' : `${impagas.length} membresías activas sin pago registrado.`}
            </p>
          )}
          {[...activas, ...otras].map((s) => {
            const vencida = s.status === 'expired';
            const sinPagar = s.paymentStatus !== 'paid' && s.status === 'active';
            return (
              <div key={s.id} className="list-row">
                <span
                  className="dot"
                  style={{ background: vencida ? 'var(--mq-muted2)' : sinPagar ? '#f45b69' : 'var(--mq-green)' }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="nm">{s.planName || 'Membresía'}</div>
                  <div className="sub2">
                    {ESTADO_SUB[s.status] ?? s.status}
                    {sinPagar ? ' · SIN PAGAR' : ''}
                    {s.endDate ? ` · ${vencida ? 'venció' : 'renueva'} ${relativo(s.endDate)}` : ' · sin vencimiento'}
                  </div>
                </div>
                <div className="der">
                  <div className="mono" style={{ fontWeight: 700 }}>{s.price ? plata(s.price, s.currency) : '—'}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Oportunidades ── */}
      {deals.length > 0 && (
        <div className="ctx-sec">
          <div className="ctx-t">Oportunidades ({deals.length})</div>
          {deals.map((d) => (
            <a key={d.dealId} href="/plugins/deals" className="list-row" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="min-w-0 flex-1">
                <div className="nm">{d.title}</div>
                <div className="sub2">
                  {ETAPA[d.stage] ?? d.stage} · {d.probability}%
                  {d.expectedCloseDate ? ` · cierra ${relativo(d.expectedCloseDate)}` : ''}
                </div>
              </div>
              <div className="der">
                <div className="mono" style={{ fontWeight: 700 }}>{plata(d.value, d.currency)}</div>
              </div>
            </a>
          ))}
        </div>
      )}

      {/* ── Plata ── */}
      {(debe || money?.paidByCurrency) && (
        <div className="ctx-sec">
          <div className="ctx-t">Plata</div>
          {debe && (
            <div className="ctx-row">
              <span className="k">Debe</span>
              <span className="v mono" style={{ color: money && money.overdueCount > 0 ? '#f45b69' : undefined }}>{debe}</span>
            </div>
          )}
          {money && money.pendingCount > 0 && (
            <div className="ctx-row">
              <span className="k">Sin cobrar</span>
              <span className="v">
                {money.pendingCount} {money.pendingCount === 1 ? 'venta' : 'ventas'}
                {money.overdueCount > 0 ? ` · ${money.overdueCount} vencida${money.overdueCount === 1 ? '' : 's'}` : ''}
                {money.nextDueDate ? ` · vence ${relativo(money.nextDueDate)}` : ''}
              </span>
            </div>
          )}
          {money && porMoneda(money.paidByCurrency) && (
            <div className="ctx-row">
              <span className="k">Cobrado</span>
              <span className="v mono">{porMoneda(money.paidByCurrency)}</span>
            </div>
          )}
          {data?.subscriptions?.lastPayment && (
            <div className="ctx-row">
              <span className="k">Último pago</span>
              <span className="v">
                {data.subscriptions.lastPayment.amount} {data.subscriptions.lastPayment.currency ?? ''}
                {data.subscriptions.lastPayment.date ? ` · ${relativo(data.subscriptions.lastPayment.date)}` : ''}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Agenda ── */}
      {(proxima || pendiente) && (
        <div className="ctx-sec">
          <div className="ctx-t">Agenda</div>
          {proxima && (
            <div className="ctx-row">
              <span className="k">Próxima</span>
              <span className="v">{proxima.title} · {relativo(proxima.startsAt)}</span>
            </div>
          )}
          {pendiente && (
            <p className="text-[11px] leading-relaxed" style={{ color: 'var(--mq-muted)' }}>
              Quedó pendiente: {pendiente}
            </p>
          )}
        </div>
      )}

      {/* ── Cómo lo ve el Command Center ── */}
      {snapshot?.analizado && (
        <div className="ctx-sec">
          <div className="ctx-t">Command Center</div>
          <CommandCenterNumeros snapshot={snapshot} />
          <p className="mt-2 text-[10.5px]" style={{ color: 'var(--mq-muted2)' }}>
            Analizado {fecha(snapshot.analyzedAt)}
            {snapshot.confidence ? ` · confianza ${snapshot.confidence}` : ''}
          </p>
        </div>
      )}
    </>
  );
}
