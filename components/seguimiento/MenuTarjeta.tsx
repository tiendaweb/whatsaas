'use client';

import { Check, Loader2, MoreHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ContactoCard, Etapa } from './tipos';

/**
 * Menú `⋯` de la tarjeta.
 *
 * Existe sobre todo por el táctil: en móvil el drag & drop está deshabilitado
 * (`pointer: coarse` no arrastra bien y la barra inferior se pelea con el
 * gesto), así que "Mover a etapa" es la única forma de cambiar de etapa desde
 * el celular. En escritorio duplica a propósito lo que hace el arrastre.
 */
export function MenuTarjeta({
  contacto,
  etapas,
  moviendo,
  onAbrirChat,
  onMover,
}: {
  contacto: ContactoCard;
  /** Etapas del grupo elegido, en orden. */
  etapas: Etapa[];
  moviendo: boolean;
  onAbrirChat: (c: ContactoCard) => void;
  onMover: (c: ContactoCard, etapaId: number | null) => void;
}) {
  const t = useTranslations('Seguimiento');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="size-7 p-0"
          aria-label={t('card.more')}
          onClick={(e) => e.stopPropagation()}
        >
          {moviendo ? <Loader2 className="size-4 animate-spin" /> : <MoreHorizontal className="size-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={() => onAbrirChat(contacto)}>{t('menu.openChat')}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>{t('menu.moveTo')}</DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
              {etapas.map((etapa) => (
                <DropdownMenuItem
                  key={etapa.id}
                  disabled={etapa.id === contacto.etapaId}
                  onSelect={() => onMover(contacto, etapa.id)}
                >
                  <span className="truncate">{`${etapa.emoji ?? ''} ${etapa.name}`.trim()}</span>
                  {etapa.id === contacto.etapaId ? <Check className="ml-auto size-3.5" /> : null}
                </DropdownMenuItem>
              ))}
              {contacto.contactId !== null ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem disabled={contacto.etapaId === null} onSelect={() => onMover(contacto, null)}>
                    {t('section.unassigned')}
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
