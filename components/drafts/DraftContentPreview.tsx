'use client';

import { useMemo, useState } from 'react';
import { Check, Copy } from 'lucide-react';
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
      return Array.from(new Set(predefinedVariables?.map((variable) => variable.trim()).filter(Boolean)));
    }
    return [];
  }, [placeholders, predefinedVariables, showVariableInputs]);

  const showVariableSection = showVariableInputs === true || placeholders.length > 0;

  const renderedPreview = useMemo(() => {
    return content.replace(PLACEHOLDER_REGEX, (_, rawKey: string) => {
      const key = rawKey.trim();
      return variables[key] ?? `[[${key}]]`;
    });
  }, [content, variables]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(renderedPreview);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className={`space-y-4 ${className ?? ''}`}>
      {showVariableSection && (
        <section className="rounded-lg border bg-muted/30 p-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Variables dinámicas</p>
          {variableFields.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {variableFields.map((placeholder) => (
                <div key={placeholder} className="space-y-1">
                  <p className="text-xs text-muted-foreground">{placeholder}</p>
                  <Input
                    value={variables[placeholder] ?? ''}
                    onChange={(event) =>
                      setVariables((prev) => ({
                        ...prev,
                        [placeholder]: event.target.value,
                      }))
                    }
                    placeholder={`Ingresa ${placeholder}`}
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Este borrador no detectó variables automáticamente. Agrega placeholders como [[nombre]] para
              completarlas aquí.
            </p>
          )}
        </section>
      )}

      <p
        className={cn(
          'text-sm whitespace-pre-wrap',
          clampLines === 2 && 'line-clamp-2',
          clampLines === 3 && 'line-clamp-3',
          clampLines === 10 && 'line-clamp-10',
        )}
      >
        {renderedPreview}
      </p>

      <div className="flex justify-end">
        <Button onClick={handleCopy} className="min-w-[140px]">
          {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />} Copiar listo
        </Button>
      </div>
    </div>
  );
}
