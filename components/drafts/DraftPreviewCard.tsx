'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Copy, Edit3, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import type { DraftItem } from './types';

type Props = {
  draft: DraftItem;
  onEdit: (draft: DraftItem) => void;
};

const PLACEHOLDER_REGEX = /\[\[([\w\-. ]+)\]\]/g;

export function DraftPreviewCard({ draft, onEdit }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [liveContent, setLiveContent] = useState(draft.content);
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [inlineEditing, setInlineEditing] = useState(false);
  const [inlineTitle, setInlineTitle] = useState(draft.title);
  const [inlineContent, setInlineContent] = useState(draft.content);
  const [copied, setCopied] = useState(false);

  const placeholders = useMemo(() => {
    const set = new Set<string>();
    for (const match of liveContent.matchAll(PLACEHOLDER_REGEX)) {
      const key = match[1]?.trim();
      if (key) set.add(key);
    }
    return Array.from(set);
  }, [liveContent]);

  const renderedPreview = useMemo(() => {
    return liveContent.replace(PLACEHOLDER_REGEX, (_, rawKey: string) => {
      const key = rawKey.trim();
      return variables[key] ?? `[[${key}]]`;
    });
  }, [liveContent, variables]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(renderedPreview);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  const resetInline = () => {
    setInlineEditing(false);
    setInlineTitle(draft.title);
    setInlineContent(draft.content);
    setLiveContent(draft.content);
  };

  return (
    <article className="rounded-lg border bg-background p-4 space-y-3">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {inlineEditing ? (
            <Input value={inlineTitle} onChange={(event) => setInlineTitle(event.target.value)} />
          ) : (
            <h3 className="font-semibold truncate">{draft.title}</h3>
          )}
          <div className="flex flex-wrap gap-2 mt-2">
            {draft.category?.name && <Badge variant="secondary">{draft.category.name}</Badge>}
            {draft.tags.map((tag) => (
              <Badge key={tag.id} variant="outline">
                {tag.name}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={() => setExpanded((prev) => !prev)}>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          {!inlineEditing ? (
            <Button size="icon" variant="ghost" onClick={() => setInlineEditing(true)}>
              <Edit3 className="h-4 w-4" />
            </Button>
          ) : (
            <>
              <Button size="icon" variant="ghost" onClick={() => onEdit({ ...draft, title: inlineTitle, content: inlineContent })}>
                <Save className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={resetInline}>
                <X className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </header>

      {inlineEditing ? (
        <Textarea
          value={inlineContent}
          onChange={(event) => {
            setInlineContent(event.target.value);
            setLiveContent(event.target.value);
          }}
          className="min-h-[110px]"
        />
      ) : (
        <p className="text-sm text-muted-foreground line-clamp-3">{draft.content}</p>
      )}

      {expanded && (
        <div className="space-y-3 border-t pt-3">
          <div className="rounded-md border p-3 space-y-2">
            <p className="text-sm font-medium">Edición en vivo (no persistente)</p>
            <Textarea
              value={liveContent}
              onChange={(event) => setLiveContent(event.target.value)}
              className="min-h-[100px]"
            />
          </div>

          {placeholders.length > 0 && (
            <div className="rounded-md border p-3 space-y-2">
              <p className="text-sm font-medium">Variables rápidas</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {placeholders.map((placeholder) => (
                  <Input
                    key={placeholder}
                    placeholder={placeholder}
                    value={variables[placeholder] ?? ''}
                    onChange={(event) =>
                      setVariables((prev) => ({
                        ...prev,
                        [placeholder]: event.target.value,
                      }))
                    }
                  />
                ))}
              </div>
            </div>
          )}

          <div className="rounded-md border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Preview</p>
              <Button size="sm" variant="outline" onClick={handleCopy}>
                {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />} Copiar
              </Button>
            </div>
            <pre className="text-sm whitespace-pre-wrap font-sans">{renderedPreview}</pre>
          </div>
        </div>
      )}
    </article>
  );
}
