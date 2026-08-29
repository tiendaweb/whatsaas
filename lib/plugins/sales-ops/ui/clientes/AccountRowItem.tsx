'use client';

import { memo } from 'react';
import { ChevronDown } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import type { AccountRow, AccountTab, Visibility } from '../../shared/accounts-types';
import { GateBadge } from '../components/GateBadge';
import { fmtDateShort, iniciales } from '../components/format';
import { AccountDetailPanel } from './AccountDetailPanel';
import { fmtUsd, hostDe } from './api';
import { VisibilityBadge, VisibilityMenu } from './VisibilityMenu';

type Props = {
  row: AccountRow;
  tab: AccountTab;
  open: boolean;
  onToggle: (row: AccountRow) => void;
  onVisibility: (row: AccountRow, next: Visibility) => void;
  onOpen?: (chatId: number) => void;
  onVisibilityChanged?: () => void;
};

/**
 * Fila de dos líneas que se despliega por dentro (acordeón):
 *   ◯ Nombre                              2 activas · 1 vencida   ⋯ ⌄
 *     Rubro · sitio.com                   1 tienda · 2 dominios · Contacto G11
 */
export const AccountRowItem = memo(function AccountRowItem({ row, tab, open, onToggle, onVisibility, onOpen, onVisibilityChanged }: Props) {
  const { active, expired, pending, totalMonthlyUsd, privateCount, hiddenCount } = row.subscriptions;
  const chips: string[] = [];
  if (active > 0) chips.push(`${active} ${active === 1 ? 'activa' : 'activas'}`);
  if (expired > 0) chips.push(`${expired} ${expired === 1 ? 'vencida' : 'vencidas'}`);
  if (pending > 0) chips.push(`${pending} sin pagar`);
  if (privateCount > 0 && tab !== 'en_venta') chips.push(`${privateCount} ${privateCount === 1 ? 'privada' : 'privadas'}`);
  if (hiddenCount > 0 && tab === 'ocultas') chips.push(`${hiddenCount} ${hiddenCount === 1 ? 'oculta' : 'ocultas'}`);
  if (chips.length === 0) chips.push('sin membresías');

  const links: string[] = [];
  if (row.links.stores > 0) links.push(`${row.links.stores} ${row.links.stores === 1 ? 'tienda/sitio' : 'tiendas/sitios'}`);
  if (row.links.domains > 0) links.push(`${row.links.domains} ${row.links.domains === 1 ? 'dominio' : 'dominios'}`);

  const subtitulo = [row.industry, row.website ? hostDe(row.website) : null].filter(Boolean).join(' · ');
  const genero = row.kind === 'customers' ? 'm' : 'f';

  return (
    <div className={cn('rounded-lg transition-colors', open && 'bg-muted/40', row.visibility !== 'visible' && !open && 'opacity-80')}>
      <div className="flex items-center gap-1 pr-1">
        <button
          type="button"
          onClick={() => onToggle(row)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-muted/50 focus-visible:outline-none"
          aria-label={`${open ? 'Cerrar' : 'Abrir'} ${row.name}`}
        >
          <Avatar className="size-9 shrink-0">
            {row.avatarUrl && <AvatarImage src={row.avatarUrl} alt="" />}
            <AvatarFallback className="text-xs">{iniciales(row.name)}</AvatarFallback>
          </Avatar>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{row.name}</span>
              <VisibilityBadge visibility={row.visibility} genero={genero} />
              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{chips.join(' · ')}</span>
            </span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="min-w-0 flex-1 truncate">{subtitulo || (row.email ?? '') || (row.phoneMasked ?? '') || '—'}</span>
              <span className="flex shrink-0 items-center gap-1.5 tabular-nums">
                {links.length > 0 && <span className="hidden sm:inline">{links.join(' · ')}</span>}
                {totalMonthlyUsd != null && totalMonthlyUsd > 0 && <span className="hidden md:inline">{fmtUsd(totalMonthlyUsd)}/mes</span>}
                {row.contacts.slice(0, 2).map((c) => (
                  <span key={c.contactId} className="inline-flex items-center gap-1">
                    <span className="hidden max-w-24 truncate lg:inline">{c.name}</span>
                    <GateBadge gate={c.gate} />
                  </span>
                ))}
                {row.contacts.length > 2 && <span>+{row.contacts.length - 2}</span>}
              </span>
            </span>
            {(links.length > 0 || row.lastPaidAt) && (
              <span className="truncate text-[10px] uppercase tracking-wide text-muted-foreground/80 sm:hidden">
                {[...links, row.lastPaidAt ? `cobro ${fmtDateShort(row.lastPaidAt)}` : null].filter(Boolean).join(' · ')}
              </span>
            )}
          </span>
          <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground/60 transition-transform', open && 'rotate-180')} aria-hidden />
        </button>
        <VisibilityMenu current={row.visibility} genero={genero} onChange={(v) => onVisibility(row, v)} label={`Visibilidad de ${row.name}`} />
      </div>
      {open && <AccountDetailPanel kind={row.kind} id={row.id} tab={tab} onOpen={onOpen} onVisibilityChanged={onVisibilityChanged} />}
    </div>
  );
});
