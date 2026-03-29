'use client';

import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { FileText } from 'lucide-react';
import type { DraftItem } from '@/components/drafts/types';

type DraftShortcutsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  drafts: DraftItem[];
  onSelectDraft: (draft: DraftItem) => void;
};

export function DraftShortcutsModal({ open, onOpenChange, drafts, onSelectDraft }: DraftShortcutsModalProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filteredDrafts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return drafts;

    return drafts.filter((draft) => draft.title.toLowerCase().includes(normalized));
  }, [drafts, query]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [open]);

  useEffect(() => {
    if (selectedIndex >= filteredDrafts.length) {
      setSelectedIndex(0);
    }
  }, [filteredDrafts, selectedIndex]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg"
        onKeyDown={(event) => {
          if (!open) return;

          if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (filteredDrafts.length === 0) return;
            setSelectedIndex((prev) => (prev + 1) % filteredDrafts.length);
          }

          if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (filteredDrafts.length === 0) return;
            setSelectedIndex((prev) => (prev - 1 + filteredDrafts.length) % filteredDrafts.length);
          }

          if (event.key === 'Enter') {
            event.preventDefault();
            const selected = filteredDrafts[selectedIndex];
            if (!selected) return;
            onSelectDraft(selected);
            onOpenChange(false);
          }

          if (event.key === 'Escape') {
            event.preventDefault();
            onOpenChange(false);
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Borradores</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar borrador por nombre..."
          />

          <div className="h-72 rounded-md border overflow-y-auto">
            <div className="p-2">
              {filteredDrafts.length === 0 ? (
                <p className="text-sm text-muted-foreground px-2 py-3">No se encontraron borradores.</p>
              ) : (
                filteredDrafts.map((draft, index) => {
                  const isActive = selectedIndex === index;
                  return (
                    <button
                      key={draft.id}
                      type="button"
                      className={`w-full text-left rounded-md px-3 py-2 border mb-2 last:mb-0 transition ${
                        isActive
                          ? 'border-primary bg-primary/10'
                          : 'border-transparent hover:border-border hover:bg-muted/50'
                      }`}
                      onMouseEnter={() => setSelectedIndex(index)}
                      onClick={() => {
                        onSelectDraft(draft);
                        onOpenChange(false);
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <p className="text-sm font-medium truncate">{draft.title}</p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{draft.content}</p>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
