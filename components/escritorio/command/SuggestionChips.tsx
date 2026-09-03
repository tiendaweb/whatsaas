'use client';

import { AlertTriangle, HelpCircle, Pencil, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { CommandItem, CommandSuggestion } from '@/lib/desktop/command-center/types';

/**
 * Las respuestas que sugiere la IA, como botones de un clic.
 *
 * El chip muestra el TEXTO REAL truncado, nunca una etiqueta que el modelo
 * inventa por separado: una etiqueta "Confirmar turno" puede estar encima de un
 * cuerpo que dice otra cosa, y el chip es un clic.
 *
 * Un chip no envía nada: deja la respuesta lista en el plan. Lo que envía es el
 * paso de revisión.
 */
export function SuggestionChips({
  item,
  plannedText,
  onPlan,
  onEdit,
}: {
  item: CommandItem;
  plannedText: string | null;
  onPlan: (suggestion: CommandSuggestion) => void;
  onEdit: (text: string, purpose?: CommandSuggestion['purpose']) => void;
}) {
  const t = useTranslations('DesktopOperations');

  if (item.suggestionsState === 'loading') {
    return (
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-8 w-48 rounded-full" />
        <Skeleton className="h-8 w-36 rounded-full" />
      </div>
    );
  }

  if (item.suggestionsState === 'unavailable' && item.suggestionsReason === 'no-channel') return null;

  if (!item.suggestions.length) {
    if (item.suggestionsState === 'idle') {
      return <p className="text-xs text-muted-foreground">{t('command.suggestions.pending')}</p>;
    }
    return (
      <p className="text-xs text-muted-foreground">
        {t(`command.suggestions.reason.${item.suggestionsReason ?? 'error'}`)}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {item.suggestions.map((suggestion) => {
        const isPlanned = plannedText === suggestion.text;
        // Un borrador con variables sin resolver no se planifica de un clic:
        // abre el editor, o el cliente recibe "[[nombre]]".
        const mustEdit = suggestion.needsEdit === true;
        return (
          <button
            key={suggestion.id}
            type="button"
            onClick={() => (mustEdit ? onEdit(suggestion.text, suggestion.purpose) : onPlan(suggestion))}
            title={suggestion.text}
            className={cn(
              'group inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-left text-xs transition-all duration-200',
              'border-border/60 bg-background hover:border-primary/50 hover:bg-primary/5',
              isPlanned && 'border-primary bg-primary/10 ring-2 ring-primary/40',
              suggestion.warning && 'border-destructive/50 bg-destructive/5',
            )}
          >
            {suggestion.warning ? (
              <AlertTriangle className="size-3.5 flex-none text-destructive" aria-hidden />
            ) : mustEdit ? (
              <Pencil className="size-3.5 flex-none text-muted-foreground" aria-hidden />
            ) : suggestion.purpose === 'context-question' ? (
              <HelpCircle className="size-3.5 flex-none text-primary" aria-hidden />
            ) : (
              <Sparkles className="size-3.5 flex-none text-primary" aria-hidden />
            )}
            <span className="truncate">{suggestion.text.slice(0, 90)}</span>
          </button>
        );
      })}
    </div>
  );
}
