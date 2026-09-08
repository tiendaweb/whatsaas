'use client';

import { Copy, MessageSquare, MoreVertical, PenLine, Pin, PinOff, Play, Repeat, SlidersHorizontal, Trash2, Cpu, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { CATEGORY_LABELS, RECURRENCE_LABELS, type Skill } from '../../shared/skills';
import { tiempoRelativo } from '../components/format';
import { CATEGORY_TONE, SKILL_ICON_COMPONENTS } from './skill-meta';

type Props = {
  skill: Skill;
  onLaunch: () => void;
  /** Abre la skill en Componer (Prompt Studio). Sin esto el ítem no se dibuja. */
  onCompose?: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onPin: () => void;
  onRetire: () => void;
};

/**
 * Tarjeta de una skill.
 *
 * Lo que decide si sirve para lo que uno necesita ahora está arriba —el título
 * y la línea de qué hace—; los detalles operativos (cadencia, motor, cuántos
 * datos pide) van abajo como marcas chicas. Un botón grande "Lanzar", porque en
 * el teléfono es lo único que se toca.
 */
export function SkillCard({ skill, onLaunch, onCompose, onEdit, onDuplicate, onPin, onRetire }: Props) {
  const Icon = SKILL_ICON_COMPONENTS[skill.icon];
  const routine = skill.recurrence !== 'on_demand';

  return (
    <article className="group flex flex-col rounded-xl border border-border bg-card p-3 transition-colors hover:border-foreground/20">
      <div className="flex items-start gap-2.5">
        <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', CATEGORY_TONE[skill.category])}>
          <Icon className="size-4.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold leading-tight">
            {skill.pinned && <Pin className="size-3 shrink-0 text-muted-foreground" aria-label="Fijada" />}
            <span className="min-w-0 truncate">{skill.title}</span>
          </h3>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
            {skill.description || skill.text.replace(/\s+/g, ' ').slice(0, 140)}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-7 shrink-0 text-muted-foreground" aria-label={`Opciones de ${skill.title}`}>
              <MoreVertical className="size-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {onCompose && (
              <DropdownMenuItem onClick={onCompose}>
                <PenLine className="size-4" aria-hidden />
                Componer con datos
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={onEdit}>
              <SlidersHorizontal className="size-4" aria-hidden />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDuplicate}>
              <Copy className="size-4" aria-hidden />
              Duplicar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onPin}>
              {skill.pinned ? <PinOff className="size-4" aria-hidden /> : <Pin className="size-4" aria-hidden />}
              {skill.pinned ? 'Soltar' : 'Fijar arriba'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onRetire}>
              <Trash2 className="size-4" aria-hidden />
              Retirar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1">
        <Marca>{CATEGORY_LABELS[skill.category]}</Marca>
        {routine && (
          <Marca tone="routine">
            <Repeat className="size-3" aria-hidden />
            {RECURRENCE_LABELS[skill.recurrence]}
          </Marca>
        )}
        <Marca>
          {skill.execution === 'api' ? <Cpu className="size-3" aria-hidden /> : skill.execution === 'connector' ? <Inbox className="size-3" aria-hidden /> : null}
          {skill.execution === 'api' ? 'IA' : skill.execution === 'connector' ? 'Conector' : 'IA o conector'}
        </Marca>
        {skill.variables.length > 0 && <Marca>{skill.variables.length} dato{skill.variables.length === 1 ? '' : 's'}</Marca>}
        {skill.scope !== 'team' && (
          <Marca>
            <MessageSquare className="size-3" aria-hidden />
            Por chat
          </Marca>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" className="h-8 flex-1 gap-1.5 text-xs sm:flex-none" onClick={onLaunch}>
          <Play className="size-3.5" aria-hidden />
          Lanzar
        </Button>
        <span className="ml-auto truncate text-[10px] text-muted-foreground">
          v{skill.version}
          {skill.usageCount > 0 && ` · ${skill.usageCount} usos`}
          {skill.lastUsedAt && ` · ${tiempoRelativo(skill.lastUsedAt)}`}
        </span>
      </div>
    </article>
  );
}

function Marca({ children, tone }: { children: React.ReactNode; tone?: 'routine' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
        tone === 'routine' ? 'bg-primary/10 text-foreground' : 'bg-muted text-muted-foreground',
      )}
    >
      {children}
    </span>
  );
}
