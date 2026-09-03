'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowUpRight, CalendarClock, Check, Clock3, HelpCircle, ListPlus, MoveRight, Receipt, RefreshCw, Sparkles, StickyNote, Tag, UserRound, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { CommandAction, CommandActionType, CommandItem, CommandSuggestion } from '@/lib/desktop/command-center/types';
import { KindBadge } from './KindBadge';
import { SuggestionChips } from './SuggestionChips';
import { CustomReplyPopover } from './CustomReplyPopover';
import { TaskAiDetailPopover } from './TaskAiDetailPopover';

/**
 * Un ícono por acción. `Record<CommandActionType, …>` y no un objeto suelto: si
 * mañana se agrega una acción y nadie le pone ícono, falla el typecheck en vez
 * de reventar en runtime al indexar con una clave que no existe.
 */
const ACTION_ICON: Record<CommandActionType, LucideIcon> = {
  'complete-task': Check,
  'snooze-task': Clock3,
  'set-task-ai-detail': Sparkles,
  'mark-chat-read': Check,
  'move-deal-stage': MoveRight,
  'send-message': ArrowUpRight,
  'set-crm-stage': MoveRight,
  'change-contact-tags': Tag,
  'assign-contact': UserRound,
  'add-internal-note': StickyNote,
  'create-task': ListPlus,
  'renew-membership': RefreshCw,
  'settle-entry': Receipt,
};

export function CommandItemRow({
  item,
  selected,
  plannedAction,
  aiReady,
  onToggle,
  onPlan,
}: {
  item: CommandItem;
  selected: boolean;
  plannedAction: CommandAction | null;
  aiReady: boolean;
  onToggle: () => void;
  onPlan: (action: CommandAction) => void;
}) {
  const t = useTranslations('DesktopOperations');
  const locale = useLocale();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorSeed, setEditorSeed] = useState('');
  const [taskEditorOpen, setTaskEditorOpen] = useState(false);
  const [taskEditorField, setTaskEditorField] = useState<'next-step' | 'context-question'>('next-step');

  const plannedText = plannedAction?.type === 'send-message' || plannedAction?.type === 'set-task-ai-detail'
    ? plannedAction.text
    : null;

  // `Intl` lanza ante datos sucios y un throw en el render tumba la pantalla
  // entera: todo lo que no parsea se muestra sin fecha.
  const dateLabel = (() => {
    if (!item.at) return null;
    const time = new Date(item.at).getTime();
    if (!Number.isFinite(time)) return null;
    try {
      return new Date(time).toLocaleDateString(
        locale,
        item.dateOnly
          ? { day: 'numeric', month: 'short' }
          : { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' },
      );
    } catch {
      return null;
    }
  })();

  const planSuggestion = (suggestion: CommandSuggestion) => {
    if (item.kind === 'task') {
      onPlan({
        type: 'set-task-ai-detail',
        taskId: item.entityId,
        field: suggestion.purpose === 'context-question' ? 'context-question' : 'next-step',
        text: suggestion.text,
        source: suggestion.source,
        suggestionId: suggestion.id,
      });
      return;
    }
    if (!item.reply) return;
    onPlan({
      type: 'send-message',
      chatId: item.reply.chatId,
      text: suggestion.text,
      source: suggestion.source,
      suggestionId: suggestion.id,
    });
  };

  const planCustom = (text: string) => {
    if (!item.reply) return;
    onPlan({ type: 'send-message', chatId: item.reply.chatId, text, source: 'custom', suggestionId: null });
  };

  return (
    <div
      className={cn(
        'flex gap-3 border-b border-border/40 px-4 py-4 transition-colors last:border-b-0',
        selected ? 'bg-primary/5' : 'hover:bg-muted/40',
      )}
    >
      <Checkbox
        checked={selected}
        onCheckedChange={onToggle}
        aria-label={item.title}
        className="mt-1 flex-none"
      />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <KindBadge kind={item.kind} label={t(`command.kinds.${item.kind}`)} />
          {item.urgent && (
            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[0.6875rem] font-medium text-destructive">
              {t('command.urgent')}
            </span>
          )}
          {dateLabel && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <CalendarClock className="size-3.5" aria-hidden />
              {dateLabel}
            </span>
          )}
        </div>

        <div className="min-w-0">
          <Link href={item.href} className="block truncate text-sm font-medium text-foreground hover:underline">
            {item.title}
          </Link>
          <p className="truncate text-xs text-muted-foreground">{item.detail}</p>
        </div>

        {item.taskAi?.nextStep || item.taskAi?.contextQuestion || item.taskAi?.contextAnswer ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {item.taskAi.nextStep ? (
              <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs">
                <p className="mb-1 inline-flex items-center gap-1 font-medium text-foreground">
                  <Sparkles className="size-3.5 text-primary" aria-hidden />
                  {t('command.taskAi.nextStep')}
                </p>
                <p className="line-clamp-2 text-muted-foreground">{item.taskAi.nextStep}</p>
              </div>
            ) : null}
            {item.taskAi.contextQuestion ? (
              <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs">
                <p className="mb-1 inline-flex items-center gap-1 font-medium text-foreground">
                  <HelpCircle className="size-3.5 text-primary" aria-hidden />
                  {t('command.taskAi.contextQuestion')}
                </p>
                <p className="line-clamp-2 text-muted-foreground">{item.taskAi.contextQuestion}</p>
              </div>
            ) : null}
            {item.taskAi.contextAnswer ? (
              <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs sm:col-span-2">
                <p className="mb-1 inline-flex items-center gap-1 font-medium text-foreground">
                  <Check className="size-3.5 text-primary" aria-hidden />
                  {t('command.taskAi.contextAnswer')}
                </p>
                <p className="line-clamp-2 text-muted-foreground">{item.taskAi.contextAnswer}</p>
              </div>
            ) : null}
          </div>
        ) : null}

        {(item.reply || (item.kind === 'task' && item.actions.length > 0)) && (
          <SuggestionChips
            item={item}
            plannedText={plannedText}
            onPlan={planSuggestion}
            onEdit={(text, purpose) => {
              if (item.kind === 'task') {
                setEditorSeed(text);
                setTaskEditorField(purpose === 'context-question' ? 'context-question' : 'next-step');
                setTaskEditorOpen(true);
              } else {
                setEditorSeed(text);
                setEditorOpen(true);
              }
            }}
          />
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {item.reply && (
            <CustomReplyPopover
              chatId={item.reply.chatId}
              initialText={editorSeed || plannedText || ''}
              open={editorOpen}
              onOpenChange={setEditorOpen}
              onConfirm={planCustom}
              canImprove={aiReady}
            />
          )}
          {item.kind === 'task' && item.actions.length > 0 && (
            <TaskAiDetailPopover
              open={taskEditorOpen}
              onOpenChange={setTaskEditorOpen}
              initialText={editorSeed || plannedText || ''}
              initialField={taskEditorField}
              onConfirm={(field, text) => onPlan({
                type: 'set-task-ai-detail',
                taskId: item.entityId,
                field,
                text,
                source: 'custom',
                suggestionId: null,
              })}
            />
          )}
          {item.actions.map((action) => {
            const Icon = ACTION_ICON[action.type];
            const isPlanned = plannedAction?.type === action.type;
            return (
              <Button
                key={action.type}
                type="button"
                variant={isPlanned ? 'default' : 'ghost'}
                size="sm"
                className="h-8 gap-1.5 rounded-full text-xs"
                onClick={() => onPlan(action)}
              >
                <Icon className="size-3.5" aria-hidden />
                {t(`command.actions.${action.type}`)}
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
