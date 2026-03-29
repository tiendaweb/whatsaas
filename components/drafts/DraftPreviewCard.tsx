'use client';

import { useMemo, useState } from 'react';
import { Check, Copy, Edit3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import type { DraftItem } from './types';

type Props = {
  draft: DraftItem;
  onEdit: (draft: DraftItem) => void;
};

const PLACEHOLDER_REGEX = /\[\[([\w\-. ]+)\]\]/g;

export function DraftPreviewCard({ draft, onEdit }: Props) {
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  const placeholders = useMemo(() => {
    const set = new Set<string>();
    for (const match of draft.content.matchAll(PLACEHOLDER_REGEX)) {
      const key = match[1]?.trim();
      if (key) set.add(key);
    }
    return Array.from(set);
  }, [draft.content]);

  const renderedPreview = useMemo(() => {
    return draft.content.replace(PLACEHOLDER_REGEX, (_, rawKey: string) => {
      const key = rawKey.trim();
      return variables[key] ?? `[[${key}]]`;
    });
  }, [draft.content, variables]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(renderedPreview);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <article className="rounded-xl border bg-card overflow-hidden">
      <header className="px-4 md:px-5 pt-4 pb-3 border-b bg-background flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Plantilla</p>
          <h3 className="text-base font-semibold truncate mt-1">{draft.title}</h3>
          <div className="flex flex-wrap gap-2 mt-2">
            {draft.category?.name && <Badge variant="secondary">{draft.category.name}</Badge>}
            {draft.tags.map((tag) => (
              <Badge key={tag.id} variant="outline">
                {tag.name}
              </Badge>
            ))}
          </div>
        </div>

        <Button size="sm" variant="outline" onClick={() => onEdit(draft)}>
          <Edit3 className="h-4 w-4 mr-2" /> Editar
        </Button>
      </header>

      <div className="p-4 md:p-5 space-y-4">
        <div>
          <p className="text-sm whitespace-pre-wrap">{renderedPreview}</p>
        </div>

        {placeholders.length > 0 && (
          <section className="rounded-lg border bg-muted/30 p-3 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Variables dinámicas</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {placeholders.map((placeholder) => (
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
          </section>
        )}

        <div className="flex justify-end">
          <Button onClick={handleCopy} className="min-w-[140px]">
            {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />} Copiar listo
          </Button>
        </div>
      </div>
    </article>
  );
}
