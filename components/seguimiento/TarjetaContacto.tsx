'use client';

import { memo } from 'react';
import { BadgeCheck, MessageSquare, MoreHorizontal, Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { TagPill } from '@/components/chat/ContactTagsEditor';
import { cn } from '@/lib/utils';
import type { ContactoCard, Densidad } from './tipos';
import { TEMPERATURA_DOT, iniciales, tiempoRelativo } from './utils';

export type AccionesTarjeta = {
  onAbrirChat: (c: ContactoCard) => void;
  onMenu?: (c: ContactoCard, anchor: HTMLElement) => void;
};

type Props = AccionesTarjeta & {
  contacto: ContactoCard;
  densidad: Densidad;
  seleccionada?: boolean;
  menu?: React.ReactNode;
};

function Snippet({ c, className }: { c: ContactoCard; className?: string }) {
  const t = useTranslations('Seguimiento');
  const texto = c.ultimoTexto?.trim();
  return (
    <p className={cn('truncate text-xs text-muted-foreground', className)}>
      {texto ? (
        <>
          {c.ultimoEsMio && <span className="text-foreground/60">{t('card.you')} </span>}
          {texto}
        </>
      ) : (
        <span className="italic">{t('card.noMessages')}</span>
      )}
    </p>
  );
}

function Unread({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1.5 text-[11px] font-medium tabular-nums text-background">
      {n > 99 ? '99+' : n}
    </span>
  );
}

function Marcas({ c }: { c: ContactoCard }) {
  const t = useTranslations('Seguimiento');
  return (
    <>
      {c.esCliente && <BadgeCheck className="size-3.5 shrink-0 text-muted-foreground" aria-label={t('card.customer')} />}
      {c.esVip && <Star className="size-3.5 shrink-0 fill-amber-500 text-amber-500" aria-label={t('card.vip')} />}
    </>
  );
}

function EtiquetasMini({ c }: { c: ContactoCard }) {
  if (c.etiquetas.length === 0) return null;
  const visibles = c.etiquetas.slice(0, 2);
  const resto = c.etiquetas.length - visibles.length;
  return (
    <span className="flex min-w-0 items-center gap-1">
      {visibles.map((tag) => (
        <TagPill key={tag.id} tag={{ ...tag, color: tag.color ?? 'gray' }} className="h-5 px-1.5 text-[10px]" />
      ))}
      {resto > 0 && <span className="text-[10px] text-muted-foreground">+{resto}</span>}
    </span>
  );
}

export const TarjetaContacto = memo(function TarjetaContacto({ contacto: c, densidad, seleccionada, onAbrirChat, menu }: Props) {
  const t = useTranslations('Seguimiento');
  const tieneFicha = c.contactId !== null;
  const tiempo = tiempoRelativo(c.ultimoTs);
  const aria = t('card.aria', { name: c.nombre, unread: c.unread });

  if (densidad === 'lista') {
    return (
      <div
        role="article"
        aria-label={aria}
        tabIndex={0}
        onDoubleClick={() => onAbrirChat(c)}
        className={cn(
          'group grid min-h-11 cursor-default grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2 py-1 transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none',
          seleccionada && 'bg-muted',
        )}
      >
        <Avatar className="size-8">
          {c.avatarUrl && <AvatarImage src={c.avatarUrl} alt="" />}
          <AvatarFallback className="bg-muted text-[11px]">{iniciales(c.nombre)}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col sm:flex-row sm:items-center sm:gap-2">
          <span className="flex min-w-0 items-center gap-1">
            <span className="truncate text-sm font-medium">{c.nombre}</span>
            <Marcas c={c} />
          </span>
          <Snippet c={c} className="min-w-0 sm:flex-1" />
        </div>
        <div className="flex items-center gap-2">
          {tieneFicha && <EtiquetasMini c={c} />}
          {tiempo && <span className="hidden text-[11px] tabular-nums text-muted-foreground md:inline">{tiempo}</span>}
          <Unread n={c.unread} />
          <Button
            size="sm"
            variant="secondary"
            className="h-7 px-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(pointer:coarse)]:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              onAbrirChat(c);
            }}
          >
            <MessageSquare className="size-3.5" />
            <span className="sr-only sm:not-sr-only">{t('card.openChat')}</span>
          </Button>
          {menu}
        </div>
      </div>
    );
  }

  return (
    <div
      role="article"
      aria-label={aria}
      tabIndex={0}
      onDoubleClick={() => onAbrirChat(c)}
      className={cn(
        'group relative flex cursor-default flex-col gap-1.5 rounded-xl border border-border bg-card p-3 transition-colors hover:border-foreground/25 focus-visible:border-foreground/40 focus-visible:outline-none',
        seleccionada && 'border-foreground/60',
      )}
    >
      <div className="flex items-start gap-2.5">
        <Avatar className="size-8 shrink-0">
          {c.avatarUrl && <AvatarImage src={c.avatarUrl} alt="" />}
          <AvatarFallback className="bg-muted text-[11px]">{iniciales(c.nombre)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="truncate text-sm font-medium">{c.nombre}</span>
            <Marcas c={c} />
            <span className="ml-auto shrink-0">
              <Unread n={c.unread} />
            </span>
          </div>
          <Snippet c={c} />
        </div>
      </div>

      <div className="flex min-h-7 items-center gap-2 pl-[42px]">
        {tieneFicha && (
          <span
            className={cn('size-1.5 shrink-0 rounded-full', TEMPERATURA_DOT[c.temperatura])}
            title={t(`card.temperature.${c.temperatura}`)}
          />
        )}
        {tiempo && <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{tiempo}</span>}
        {tieneFicha && <EtiquetasMini c={c} />}
      </div>
      <span className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-1 rounded-lg bg-card pl-2 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
          <Button
            size="sm"
            variant="secondary"
            className="h-7 px-2.5"
            onClick={(e) => {
              e.stopPropagation();
              onAbrirChat(c);
            }}
          >
            <MessageSquare className="size-3.5" />
            {t('card.openChat')}
          </Button>
          {menu ?? (
            <Button size="sm" variant="ghost" className="size-7 p-0" aria-label={t('card.more')} disabled>
              <MoreHorizontal className="size-4" />
            </Button>
          )}
      </span>
    </div>
  );
});
