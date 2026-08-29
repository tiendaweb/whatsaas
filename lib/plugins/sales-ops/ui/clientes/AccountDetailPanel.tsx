'use client';

import { useCallback, useState } from 'react';
import useSWR from 'swr';
import { ExternalLink, Globe, MessageSquare, Store } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AccountDetail, AccountKind, AccountSubscription, AccountTab, Visibility } from '../../shared/accounts-types';
import { GateBadge } from '../components/GateBadge';
import { ErrorState, LoadingRows } from '../components/States';
import { fmtDate, iniciales } from '../components/format';
import { BILLING_LABELS, CARD_TYPE_LABELS, PAYMENT_LABELS, SUB_STATUS_LABELS, detailUrl, fetchDetail, fmtCents, hostDe, patchVisibility, venceTexto } from './api';
import { VisibilityBadge, VisibilityMenu } from './VisibilityMenu';

type Props = {
  kind: AccountKind;
  id: number;
  tab: AccountTab;
  onOpen?: (chatId: number) => void;
  /** Avisa a la lista que cambió algo de visibilidad (para refrescar conteos). */
  onVisibilityChanged?: () => void;
};

const SUB_STATUS_TONES: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  expired: 'bg-red-500/15 text-red-700 dark:text-red-300',
  pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  cancelled: 'bg-muted text-muted-foreground',
  paused: 'bg-muted text-muted-foreground',
};

const PAYMENT_TONES: Record<string, string> = {
  paid: 'text-muted-foreground',
  pending: 'text-amber-700 dark:text-amber-300',
  overdue: 'text-red-700 dark:text-red-300',
  failed: 'text-red-700 dark:text-red-300',
  refunded: 'text-muted-foreground',
};

/**
 * Lo que se despliega "por dentro" de una fila: membresías, links, contactos y
 * plata. Se carga recién al abrir; la visibilidad se cambia de forma optimista.
 */
export function AccountDetailPanel({ kind, id, tab, onOpen, onVisibilityChanged }: Props) {
  const { data, error, isLoading, mutate } = useSWR<AccountDetail>(detailUrl(kind, id), fetchDetail, { revalidateOnFocus: false });
  const [mostrarTodas, setMostrarTodas] = useState(false);

  const cambiarSub = useCallback(
    async (sub: AccountSubscription, next: Visibility) => {
      if (!data) return;
      const previous = data;
      const optimistic: AccountDetail = { ...data, subscriptions: data.subscriptions.map((s) => (s.id === sub.id ? { ...s, visibility: next } : s)) };
      void mutate(optimistic, { revalidate: false });
      try {
        await patchVisibility({ target: 'subscription', id: sub.id, visibility: next });
        toast.success(next === 'visible' ? 'Membresía visible otra vez' : next === 'private' ? 'Membresía marcada como privada' : 'Membresía oculta');
        void mutate();
        onVisibilityChanged?.();
      } catch (e) {
        void mutate(previous, { revalidate: false });
        toast.error(e instanceof Error ? e.message : 'No se pudo cambiar la visibilidad');
      }
    },
    [data, mutate, onVisibilityChanged],
  );

  if (error) return <ErrorState message={error instanceof Error ? error.message : 'Error'} onRetry={() => void mutate()} className="border-0 bg-transparent py-4" />;
  if (isLoading || !data) return <LoadingRows rows={3} className="py-1" />;

  // En "En venta" las privadas/ocultas no molestan: se esconden con un aviso.
  const filtrar = tab === 'en_venta' && !mostrarTodas;
  const subsVisibles = filtrar ? data.subscriptions.filter((s) => s.visibility === 'visible') : data.subscriptions;
  const escondidas = data.subscriptions.length - subsVisibles.length;

  const paid = Object.entries(data.moneyByCurrency.paid);
  const pending = Object.entries(data.moneyByCurrency.pending);
  const activas = Object.entries(data.moneyByCurrency.activeSubscriptions);

  return (
    <div className="space-y-4 px-2 pb-3 pt-1 sm:px-3">
      {/* Membresías */}
      <section className="space-y-1.5">
        <Titulo>Membresías {data.subscriptions.length > 0 && <span className="tabular-nums">· {data.subscriptions.length}</span>}</Titulo>
        {subsVisibles.length === 0 ? (
          <p className="px-1 text-xs text-muted-foreground">{data.subscriptions.length === 0 ? 'Sin membresías registradas.' : 'Nada visible en esta pestaña.'}</p>
        ) : (
          <ul className="divide-y divide-border/50 rounded-lg border border-border">
            {subsVisibles.map((s) => (
              <li key={s.id} className={cn('flex items-start gap-2 px-2.5 py-2', s.visibility !== 'visible' && 'bg-muted/30')}>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="truncate text-sm font-medium text-foreground">{s.planName || 'Plan sin nombre'}</span>
                    <span className={cn('rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide', SUB_STATUS_TONES[s.status] ?? SUB_STATUS_TONES.cancelled)}>
                      {SUB_STATUS_LABELS[s.status] ?? s.status}
                    </span>
                    <VisibilityBadge visibility={s.visibility} />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span className="tabular-nums text-foreground/90">
                      {fmtCents(s.price, s.currency)} <span className="text-muted-foreground">{BILLING_LABELS[s.billingType] ?? s.billingType}</span>
                    </span>
                    <span className={PAYMENT_TONES[s.paymentStatus] ?? 'text-muted-foreground'}>{PAYMENT_LABELS[s.paymentStatus] ?? s.paymentStatus}</span>
                    {venceTexto(s.daysLeft, s.status) && (
                      <span className={cn('tabular-nums', s.daysLeft != null && s.daysLeft <= 15 && s.status === 'active' && 'text-amber-700 dark:text-amber-300')}>
                        {venceTexto(s.daysLeft, s.status)}
                        {s.endDate && <span className="text-muted-foreground/70"> ({fmtDate(s.endDate)})</span>}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                    {s.contactName && <span>Contacto: {s.contactName}</span>}
                    {kind === 'companies' && s.customerName && <span>Cliente: {s.customerName}</span>}
                    {kind === 'customers' && s.companyName && <span>Empresa: {s.companyName}</span>}
                    <span className="font-mono text-[10px] text-muted-foreground/70">{s.number}</span>
                  </div>
                  {s.notes && <p className="line-clamp-2 text-[11px] text-muted-foreground/90">{s.notes}</p>}
                </div>
                <VisibilityMenu current={s.visibility} genero="f" onChange={(v) => void cambiarSub(s, v)} label={`Visibilidad de ${s.planName || 'membresía'}`} />
              </li>
            ))}
          </ul>
        )}
        {escondidas > 0 && (
          <button type="button" onClick={() => setMostrarTodas(true)} className="px-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
            {escondidas} {escondidas === 1 ? 'privada u oculta sin mostrar' : 'privadas u ocultas sin mostrar'} · ver
          </button>
        )}
      </section>

      {/* Links */}
      <section className="space-y-1.5">
        <Titulo>Links</Titulo>
        {data.stores.length === 0 && data.domains.length === 0 && !data.account.website ? (
          <p className="px-1 text-xs text-muted-foreground">Sin tiendas, sitios ni dominios vinculados.</p>
        ) : (
          <ul className="divide-y divide-border/50 rounded-lg border border-border">
            {data.account.website && (
              <LinkItem icon={<Globe className="size-4" aria-hidden />} href={data.account.website} label={hostDe(data.account.website)} meta="Sitio del cliente" />
            )}
            {data.stores.map((s) => (
              <LinkItem
                key={`s-${s.id}`}
                icon={
                  s.profileImage ? (
                    <Avatar className="size-6">
                      <AvatarImage src={s.profileImage} alt="" />
                      <AvatarFallback className="text-[9px]">{iniciales(s.title ?? '?')}</AvatarFallback>
                    </Avatar>
                  ) : (
                    <Store className="size-4" aria-hidden />
                  )
                }
                href={s.url}
                label={s.title || hostDe(s.url)}
                meta={[CARD_TYPE_LABELS[s.cardType ?? ''] ?? s.cardType ?? 'Link', s.customDomain ? s.customDomain : hostDe(s.url), s.status === '1' || s.status === 'active' ? 'activa' : s.status === '0' || s.status === 'inactive' ? 'inactiva' : s.status]
                  .filter(Boolean)
                  .join(' · ')}
              />
            ))}
            {data.domains.map((d) => (
              <LinkItem
                key={`d-${d.id}`}
                icon={<Globe className="size-4" aria-hidden />}
                href={`https://${d.name}`}
                label={d.name}
                meta={`Dominio · ${d.status}${d.expiresAt ? ` · vence ${fmtDate(d.expiresAt)}` : ''}`}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Contactos */}
      <section className="space-y-1.5">
        <Titulo>Contactos {data.contacts.length > 0 && <span className="tabular-nums">· {data.contacts.length}</span>}</Titulo>
        {data.contacts.length === 0 ? (
          <p className="px-1 text-xs text-muted-foreground">Sin contactos de WhatsApp vinculados.</p>
        ) : (
          <ul className="divide-y divide-border/50 rounded-lg border border-border">
            {data.contacts.map((c) => (
              <li key={c.contactId} className="flex items-center gap-2 px-2.5 py-1.5">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm text-foreground">{c.name}</span>
                    <GateBadge gate={c.gate} />
                  </span>
                  {c.phoneMasked && <span className="text-[11px] tabular-nums text-muted-foreground">{c.phoneMasked}</span>}
                </span>
                {c.chatId != null && onOpen && (
                  <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => onOpen(c.chatId as number)}>
                    <MessageSquare className="size-3.5" aria-hidden /> Abrir ficha
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Plata */}
      <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/60 px-1 pt-2 text-xs text-muted-foreground">
        <span>
          <span className="font-medium text-foreground/80">Activas:</span>{' '}
          {activas.length ? activas.map(([cur, cents]) => fmtCents(cents, cur)).join(' + ') : '—'}
        </span>
        <span>
          <span className="font-medium text-foreground/80">Cobrado:</span> {paid.length ? paid.map(([cur, cents]) => fmtCents(cents, cur)).join(' + ') : '—'}
        </span>
        <span>
          <span className="font-medium text-foreground/80">Pendiente:</span> {pending.length ? pending.map(([cur, cents]) => fmtCents(cents, cur)).join(' + ') : '—'}
        </span>
        {data.sales.length > 0 && (
          <span className="tabular-nums">
            {data.sales.length} {data.sales.length === 1 ? 'venta' : 'ventas'}
            {data.account.lastPaidAt && ` · último cobro ${fmtDate(data.account.lastPaidAt)}`}
          </span>
        )}
      </footer>
    </div>
  );
}

function Titulo({ children }: { children: React.ReactNode }) {
  return <h3 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{children}</h3>;
}

function LinkItem({ icon, href, label, meta }: { icon: React.ReactNode; href: string | null; label: string; meta: string }) {
  const inner = (
    <>
      <span className="flex size-6 shrink-0 items-center justify-center text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-foreground">{label}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{meta}</span>
      </span>
      {href && <ExternalLink className="size-3.5 shrink-0 text-muted-foreground/70" aria-hidden />}
    </>
  );
  return (
    <li>
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-muted/50" onClick={(e) => e.stopPropagation()}>
          {inner}
        </a>
      ) : (
        <span className="flex items-center gap-2 px-2.5 py-1.5">{inner}</span>
      )}
    </li>
  );
}
