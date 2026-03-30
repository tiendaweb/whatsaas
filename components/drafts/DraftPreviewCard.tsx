'use client';

import { useEffect, useMemo, useState } from 'react';
import { Edit3 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DraftContentPreview } from './DraftContentPreview';
import type { DraftItem } from './types';

type Props = {
  draft: DraftItem;
  onEdit: (draft: DraftItem) => void;
};

export function DraftPreviewCard({ draft, onEdit }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [showExpandAction, setShowExpandAction] = useState(false);

  const estimatedLines = useMemo(() => {
    return draft.content.split('\n').reduce((acc, line) => {
      const visualLines = Math.max(1, Math.ceil(line.length / 90));
      return acc + visualLines;
    }, 0);
  }, [draft.content]);

  useEffect(() => {
    setExpanded(false);
    setShowExpandAction(estimatedLines > 10);
  }, [estimatedLines, draft.id]);

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

      <div className="p-4 md:p-5 space-y-3">
        <DraftContentPreview content={draft.content} clampLines={expanded ? undefined : 10} />

        {showExpandAction && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded((prev) => !prev)}>
            {expanded ? 'Ver menos' : 'Ver más'}
          </Button>
        )}
      </div>
    </article>
  );
}
