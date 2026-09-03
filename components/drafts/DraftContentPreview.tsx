'use client';

import { useMemo, useState } from 'react';
import { Check, Copy, Variable } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { extractEditorPlaceholders, renderDraftContent } from '@/lib/drafts/utils';

type Props = {
  content: string;
  clampLines?: number;
  className?: string;
  showVariableInputs?: boolean;
  predefinedVariables?: string[];
  /** Controlled variables (for modals) */
  variables?: Record<string, string>;
  onVariablesChange?: (vars: Record<string, string>) => void;
  /** Preview style: card (default library) or bubble (modal chat-like) */
  variant?: 'card' | 'bubble';
};

export function DraftContentPreview({
  content,
  clampLines,
  className,
  showVariableInputs,
  predefinedVariables,
  variables: controlledVariables,
  onVariablesChange,
  variant = 'card',
}: Props) {
  const isControlled = controlledVariables !== undefined;
  const [internalVars, setInternalVars] = useState<Record<string, string>>({});
  const variables = isControlled ? controlledVariables : internalVars;
  const setVariables = (next: Record<string, string>) => {
    if (isControlled) {
      onVariablesChange?.(next);
    } else {
      setInternalVars(next);
    }
  };

  const [copied, setCopied] = useState(false);

  const placeholders = useMemo(() => extractEditorPlaceholders(content), [content]);

  const variableFields = useMemo(() => {
    if (placeholders.length > 0) return placeholders;
    if (showVariableInputs && (predefinedVariables?.length ?? 0) > 0) {
      return Array.from(new Set(predefinedVariables?.map((v) => v.trim()).filter(Boolean)));
    }
    return [];
  }, [placeholders, predefinedVariables, showVariableInputs]);

  const showVariableSection = (showVariableInputs === true || placeholders.length > 0) && variant === 'card';

  const renderedPreview = useMemo(() => {
    return renderDraftContent(content, variables);
  }, [content, variables]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(renderedPreview);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const setVar = (key: string, val: string) => {
    setVariables({ ...variables, [key]: val });
  };

  // Ultra clean modern minimal OS-style bubble preview
  if (variant === 'bubble') {
    const hasPlaceholders = placeholders.length > 0;
    return (
      <div className={cn("w-full max-w-full", className)}>
        <div className={cn(
          "bg-[#0A0A0A] dark:bg-[#F8F8F8] text-[#F8F8F8] dark:text-[#0A0A0A] rounded-3xl px-5 py-4 text-[15px] leading-[1.45] shadow-sm border border-white/10 dark:border-black/5",
          "whitespace-pre-wrap break-words"
        )}>
          {renderedPreview.split(/(\[\[.*?\]\])/g).map((part, i) => {
            if (part.startsWith('[[')) {
              return (
                <span key={i} className="font-medium text-[#3B82F6] dark:text-[#2563EB] bg-white/10 dark:bg-black/5 px-1 rounded">
                  {part}
                </span>
              );
            }
            return part;
          })}
        </div>
        {hasPlaceholders && (
          <div className="mt-2 text-[10px] text-muted-foreground/70 tracking-[0.5px] uppercase">Vista previa • variables sin rellenar se muestran como [[ ]]</div>
        )}
      </div>
    );
  }

  // Default card variant — ultra minimalist OS library card preview
  return (
    <div className={cn("space-y-3", className)}>
      {showVariableSection && variableFields.length > 0 && (
        <div className="rounded-2xl border bg-muted/30 p-3">
          <div className="flex items-center gap-1.5 mb-2.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            <Variable className="h-3.5 w-3.5" />
            Variables
          </div>
          <div className="grid grid-cols-1 gap-2.5">
            {variableFields.map((ph) => (
              <div key={ph} className="flex flex-col gap-1">
                <label className="text-[10px] font-medium text-muted-foreground tracking-tight pl-0.5">
                  {ph.replace(/_/g, ' ')}
                </label>
                <Input
                  value={variables[ph] ?? ''}
                  onChange={(e) => setVar(ph, e.target.value)}
                  placeholder="…"
                  className="h-9 text-sm rounded-2xl bg-background border-border/70 focus-visible:ring-primary/30"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="relative group">
        <div className={cn(
          "rounded-3xl border bg-background/95 p-4 text-[14px] leading-relaxed text-foreground shadow-sm transition-all",
          "border-border/60 hover:border-primary/20",
          copied && "border-green-500/40"
        )}>
          <div className="text-[10px] font-medium uppercase tracking-[1px] text-muted-foreground/70 mb-1.5 select-none">Mensaje</div>

          <p className={cn(
            'whitespace-pre-wrap break-words',
            clampLines && `line-clamp-${clampLines}`
          )}>
            {renderedPreview.split(/(\[\[.*?\]\])/g).map((part, i) => (
              part.startsWith('[[') ? (
                <span key={i} className="font-medium text-primary bg-primary/5 px-1 py-px rounded">
                  {part}
                </span>
              ) : part
            ))}
          </p>

          <div className="mt-4 flex justify-end">
            <Button
              onClick={handleCopy}
              size="sm"
              variant="ghost"
              className={cn(
                "h-8 rounded-2xl px-3 text-xs text-muted-foreground hover:text-foreground transition-all",
                copied && "text-green-600 dark:text-green-500"
              )}
            >
              {copied ? (
                <><Check className="h-3.5 w-3.5 mr-1.5" /> Copiado</>
              ) : (
                <><Copy className="h-3.5 w-3.5 mr-1.5" /> Copiar</>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
