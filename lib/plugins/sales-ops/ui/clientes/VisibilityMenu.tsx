'use client';

import { Eye, EyeOff, Lock, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { Visibility } from '../../shared/accounts-types';
import { VISIBILITY_LABELS } from './api';

type Props = {
  current: Visibility;
  /** "privada" (membresía) o "privado" (cliente/empresa). */
  genero?: 'f' | 'm';
  disabled?: boolean;
  onChange: (next: Visibility) => void;
  className?: string;
  label?: string;
};

/**
 * Menú `⋯` de visibilidad. Muestra sólo las opciones que cambian algo:
 * si ya es privada, ofrece "Ocultar" y "Mostrar"; si es visible, "Marcar
 * privada" y "Ocultar".
 */
export function VisibilityMenu({ current, genero = 'f', disabled, onChange, className, label = 'Opciones' }: Props) {
  const privada = genero === 'f' ? 'Marcar privada' : 'Marcar privado';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={cn('size-8 shrink-0 text-muted-foreground hover:text-foreground', className)} disabled={disabled} aria-label={label} onClick={(e) => e.stopPropagation()}>
          <MoreHorizontal className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40" onClick={(e) => e.stopPropagation()}>
        {current !== 'private' && (
          <DropdownMenuItem onSelect={() => onChange('private')}>
            <Lock className="size-4" aria-hidden /> {privada}
          </DropdownMenuItem>
        )}
        {current !== 'hidden' && (
          <DropdownMenuItem onSelect={() => onChange('hidden')}>
            <EyeOff className="size-4" aria-hidden /> Ocultar
          </DropdownMenuItem>
        )}
        {current !== 'visible' && (
          <DropdownMenuItem onSelect={() => onChange('visible')}>
            <Eye className="size-4" aria-hidden /> Mostrar
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Badge discreto para filas privadas u ocultas. Nada para las visibles. */
export function VisibilityBadge({ visibility, genero = 'f', className }: { visibility: Visibility; genero?: 'f' | 'm'; className?: string }) {
  if (visibility === 'visible') return null;
  const Icon = visibility === 'private' ? Lock : EyeOff;
  const texto = visibility === 'private' ? (genero === 'f' ? 'Privada' : 'Privado') : VISIBILITY_LABELS.hidden.replace(/a$/, genero === 'f' ? 'a' : 'o');
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground', className)}>
      <Icon className="size-3" aria-hidden /> {texto}
    </span>
  );
}
