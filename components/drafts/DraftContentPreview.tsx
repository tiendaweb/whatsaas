'use client';

import { useMemo, useState, useEffect } from 'react';
import { Check, Copy, Variable, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type Props = {
  content: string;
  clampLines?: number;
  className?: string;
  showVariableInputs?: boolean;
  predefinedVariables?: string[];
};

const PLACEHOLDER_REGEX = /\[\[([\w\-. ]+)\]\]/g;

export function DraftContentPreview({
  content,
  clampLines,
  className,
  showVariableInputs,
  predefinedVariables,
}: Props) {
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  const placeholders = useMemo(() => {
    const set = new Set<string>();
    for (const match of content.matchAll(PLACEHOLDER_REGEX)) {
      const key = match[1]?.trim();
      if (key) set.add(key);
    }
    return Array.from(set);
  }, [content]);

  const variableFields = useMemo(() => {
    if (placeholders.length > 0) return placeholders;
    if (showVariableInputs && (predefinedVariables?.length ?? 0) > 0) {
      return Array.from(new Set(predefinedVariables?.map((v) => v.trim()).filter(Boolean)));
    }
    return [];
  }, [placeholders, predefinedVariables, showVariableInputs]);

  const showVariableSection = showVariableInputs === true || placeholders.length > 0;

  const renderedPreview = useMemo(() => {
    return content.replace(PLACEHOLDER_REGEX, (_, rawKey: string) => {
      const key = rawKey.trim();
      // Si la variable está vacía, resaltamos el placeholder para que el usuario sepa que falta
      return variables[key] || `[[${key}]]`;
    });
  }, [content, variables]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(renderedPreview);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* SECCIÓN DE VARIABLES: Diseño en grilla compacta */}
      {showVariableSection && (
        <section className="bg-secondary/30 rounded-xl p-4 border border-border/50">
          <div className="flex items-center gap-2 mb-3">
            <Variable className="h-3.5 w-3.5 text-primary" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Completar Variables
            </span>
          </div>
          
          {variableFields.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
              {variableFields.map((placeholder) => (
                <div key={placeholder} className="group flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-muted-foreground ml-1">
                    {placeholder.replace(/_/g, ' ')}
                  </label>
                  <Input
                    value={variables[placeholder] ?? ''}
                    onChange={(e) =>
                      setVariables((prev) => ({ ...prev, [placeholder]: e.target.value }))
                    }
                    placeholder="..."
                    className="h-8 text-xs bg-background border-none shadow-sm focus-visible:ring-1 focus-visible:ring-primary/50"
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground italic">
              No se detectaron variables dinámicas.
            </p>
          )}
        </section>
      )}

      {/* BURBUJA DE MENSAJE (PREVIEW FINAL) */}
      <div className="relative group">
        <div className={cn(
          "bg-background border rounded-2xl p-4 shadow-sm transition-all",
          "hover:border-primary/30",
          copied && "ring-2 ring-green-500/20 border-green-500/50"
        )}>
          <div className="flex items-center gap-2 mb-2 opacity-50">
            <MessageSquare className="h-3 w-3" />
            <span className="text-[10px] font-medium uppercase">Vista Previa del Mensaje</span>
          </div>

          <p className={cn(
            'text-[13px] md:text-sm whitespace-pre-wrap leading-relaxed text-foreground/90',
            clampLines && `line-clamp-${clampLines}`
          )}>
            {/* Resaltado visual de lo que falta completar */}
            {renderedPreview.split(/(\[\[.*?\]\])/g).map((part, i) => (
              part.startsWith('[[') ? (
                <span key={i} className="text-primary font-bold bg-primary/5 px-1 rounded">
                  {part}
                </span>
              ) : part
            ))}
          </p>

          {/* BOTÓN DE COPIAR FLOTANTE/INTEGRADO */}
          <div className="mt-4 flex justify-end">
            <Button 
              onClick={handleCopy} 
              size="sm"
              className={cn(
                "h-9 px-4 rounded-full transition-all duration-300",
                copied 
                  ? "bg-green-600 hover:bg-green-700 text-white" 
                  : "bg-primary text-primary-foreground hover:scale-105"
              )}
            >
              {copied ? (
                <><Check className="h-3.5 w-3.5 mr-2" /> ¡Copiado!</>
              ) : (
                <><Copy className="h-3.5 w-3.5 mr-2" /> Copiar para enviar</>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
