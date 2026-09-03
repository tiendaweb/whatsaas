'use client';

import { useMemo, useState } from 'react';
import { Check, Loader2, Pencil, Plus, Tag as TagIcon, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import useSWR, { mutate as globalMutate } from 'swr';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export type ContactTag = {
  id: number;
  name: string;
  color: string;
};

export const TAG_COLORS = ['gray', 'green', 'blue', 'violet', 'amber', 'rose', 'teal'] as const;
type TagColor = (typeof TAG_COLORS)[number];

const TAG_STYLES: Record<TagColor, { pill: string; dot: string }> = {
  gray: { pill: 'border-border bg-muted text-foreground', dot: 'bg-muted-foreground' },
  green: { pill: 'border-primary/25 bg-primary/10 text-primary', dot: 'bg-primary' },
  blue: { pill: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-300', dot: 'bg-blue-500' },
  violet: { pill: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/50 dark:text-violet-300', dot: 'bg-violet-500' },
  amber: { pill: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300', dot: 'bg-amber-500' },
  rose: { pill: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300', dot: 'bg-rose-500' },
  teal: { pill: 'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900 dark:bg-teal-950/50 dark:text-teal-300', dot: 'bg-teal-500' },
};

function colorOf(value: string): TagColor {
  return TAG_COLORS.includes(value as TagColor) ? (value as TagColor) : 'gray';
}

async function jsonFetcher<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'server_error');
  return payload as T;
}

function ColorPicker({ value, onChange }: { value: TagColor; onChange: (color: TagColor) => void }) {
  const t = useTranslations('InboxTags');
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('color_label')}>
      {TAG_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value === color}
          aria-label={t(`colors.${color}`)}
          title={t(`colors.${color}`)}
          onClick={() => onChange(color)}
          className={cn(
            'relative flex size-9 items-center justify-center rounded-full border transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            value === color ? 'scale-110 border-foreground/40' : 'border-border hover:scale-105',
          )}
        >
          <span className={cn('size-5 rounded-full', TAG_STYLES[color].dot)} />
          {value === color && <Check className="absolute size-3 text-primary-foreground" aria-hidden="true" />}
        </button>
      ))}
    </div>
  );
}

export function TagPill({ tag, className }: { tag: ContactTag; className?: string }) {
  const style = TAG_STYLES[colorOf(tag.color)];
  return (
    <span className={cn('inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium', style.pill, className)}>
      <span className={cn('size-2 shrink-0 rounded-full', style.dot)} aria-hidden="true" />
      <span className="truncate">{tag.name}</span>
    </span>
  );
}

type ContactTagsEditorProps = {
  contactId: number;
  tags: ContactTag[];
  onChange: (tags: ContactTag[]) => void;
};

export function ContactTagsEditor({ contactId, tags, onChange }: ContactTagsEditorProps) {
  const t = useTranslations('InboxTags');
  const { data: allTags = [], mutate } = useSWR<ContactTag[]>('/api/tags', jsonFetcher);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [createColor, setCreateColor] = useState<TagColor>('green');
  const [editTag, setEditTag] = useState<ContactTag | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState<TagColor>('gray');
  const [busyId, setBusyId] = useState<number | 'create' | 'edit' | null>(null);

  const assignedIds = useMemo(() => new Set(tags.map((tag) => tag.id)), [tags]);
  const filteredTags = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return allTags.filter((tag) => !normalized || tag.name.toLocaleLowerCase().includes(normalized));
  }, [allTags, query]);
  const exactMatch = allTags.some((tag) => tag.name.toLocaleLowerCase() === query.trim().toLocaleLowerCase());

  const refreshChats = () => {
    void globalMutate((key) => typeof key === 'string' && key.startsWith('/api/chats'));
  };

  const toggleTag = async (tag: ContactTag) => {
    const remove = assignedIds.has(tag.id);
    const previous = tags;
    const next = remove ? tags.filter((item) => item.id !== tag.id) : [...tags, tag];
    onChange(next);
    setBusyId(tag.id);
    try {
      const response = await fetch(`/api/contacts/${contactId}/tags/${remove ? tag.id : ''}`, {
        method: remove ? 'DELETE' : 'POST',
        headers: remove ? undefined : { 'Content-Type': 'application/json' },
        body: remove ? undefined : JSON.stringify({ tagId: tag.id }),
      });
      if (!response.ok) throw new Error();
      toast.success(t(remove ? 'removed_success' : 'added_success', { name: tag.name }));
      refreshChats();
    } catch {
      onChange(previous);
      toast.error(t('save_error'));
    } finally {
      setBusyId(null);
    }
  };

  const createTag = async () => {
    const name = query.trim();
    if (!name || exactMatch) return;
    setBusyId('create');
    try {
      const response = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color: createColor }),
      });
      const created = await response.json();
      if (!response.ok) throw new Error(created.error || 'server_error');
      await mutate((current = []) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)), false);
      await toggleTag(created);
      setQuery('');
      setPopoverOpen(false);
      toast.success(t('created_success', { name }));
    } catch {
      toast.error(t('save_error'));
    } finally {
      setBusyId(null);
    }
  };

  const openEdit = (tag: ContactTag) => {
    setPopoverOpen(false);
    setEditTag(tag);
    setEditName(tag.name);
    setEditColor(colorOf(tag.color));
  };

  const saveEdit = async () => {
    if (!editTag || !editName.trim()) return;
    setBusyId('edit');
    try {
      const response = await fetch('/api/tags', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editTag.id, name: editName.trim(), color: editColor }),
      });
      const updated = await response.json();
      if (!response.ok) throw new Error(updated.error || 'server_error');
      await mutate((current = []) => current.map((tag) => tag.id === updated.id ? updated : tag).sort((a, b) => a.name.localeCompare(b.name)), false);
      onChange(tags.map((tag) => tag.id === updated.id ? updated : tag));
      setEditTag(null);
      refreshChats();
      toast.success(t('edited_success'));
    } catch {
      toast.error(t('save_error'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="space-y-3" aria-labelledby="contact-tags-title">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="contact-tags-title" className="flex items-center gap-2 text-sm font-semibold">
            <TagIcon className="size-4 text-primary" aria-hidden="true" />
            {t('title')}
          </h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{t('description')}</p>
        </div>
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="min-h-9 shrink-0">
              <Plus className="mr-1.5 size-4" aria-hidden="true" />
              {t('add')}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] space-y-4 p-4">
            <div className="space-y-2">
              <Label htmlFor="tag-search">{t('name_label')}</Label>
              <Input id="tag-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('name_placeholder')} autoFocus />
            </div>
            {query.trim() && !exactMatch && (
              <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                <Label>{t('color_label')}</Label>
                <ColorPicker value={createColor} onChange={setCreateColor} />
                <Button className="w-full" onClick={() => void createTag()} disabled={busyId === 'create'}>
                  {busyId === 'create' ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Plus className="mr-2 size-4" />}
                  {t('create', { name: query.trim() })}
                </Button>
              </div>
            )}
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {filteredTags.length ? filteredTags.map((tag) => (
                <div key={tag.id} className="flex items-center gap-1 rounded-lg hover:bg-muted/60">
                  <button
                    type="button"
                    className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => void toggleTag(tag)}
                    disabled={busyId === tag.id}
                  >
                    <span className={cn('size-2.5 shrink-0 rounded-full', TAG_STYLES[colorOf(tag.color)].dot)} />
                    <span className="min-w-0 flex-1 truncate">{tag.name}</span>
                    {busyId === tag.id ? <Loader2 className="size-4 animate-spin" /> : assignedIds.has(tag.id) && <Check className="size-4 text-primary" />}
                  </button>
                  <Button type="button" variant="ghost" size="icon" className="size-9 shrink-0" onClick={() => openEdit(tag)} aria-label={t('edit_label', { name: tag.name })}>
                    <Pencil className="size-4" />
                  </Button>
                </div>
              )) : <p className="py-6 text-center text-sm text-muted-foreground">{t('no_results')}</p>}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex min-h-9 flex-wrap gap-2">
        {tags.length ? tags.map((tag) => (
          <span key={tag.id} className={cn('inline-flex min-h-8 max-w-full items-center rounded-full border', TAG_STYLES[colorOf(tag.color)].pill)}>
            <button type="button" className="flex min-w-0 items-center gap-1.5 py-1 pl-2.5 pr-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => openEdit(tag)} aria-label={t('edit_label', { name: tag.name })}>
              <span className={cn('size-2 shrink-0 rounded-full', TAG_STYLES[colorOf(tag.color)].dot)} />
              <span className="truncate">{tag.name}</span>
              <Pencil className="size-3 opacity-60" aria-hidden="true" />
            </button>
            <button type="button" className="mr-1 flex size-7 shrink-0 items-center justify-center rounded-full opacity-70 hover:bg-foreground/10 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => void toggleTag(tag)} disabled={busyId === tag.id} aria-label={t('remove_label', { name: tag.name })}>
              {busyId === tag.id ? <Loader2 className="size-3 animate-spin" /> : <X className="size-3" />}
            </button>
          </span>
        )) : <p className="self-center text-xs text-muted-foreground">{t('empty')}</p>}
      </div>

      <Dialog open={Boolean(editTag)} onOpenChange={(open) => !open && setEditTag(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('edit_title')}</DialogTitle>
            <DialogDescription>{t('edit_description')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-tag-name">{t('name_label')}</Label>
              <Input id="edit-tag-name" value={editName} onChange={(event) => setEditName(event.target.value)} maxLength={100} />
            </div>
            <div className="space-y-2">
              <Label>{t('color_label')}</Label>
              <ColorPicker value={editColor} onChange={setEditColor} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTag(null)}>{t('cancel')}</Button>
            <Button onClick={() => void saveEdit()} disabled={!editName.trim() || busyId === 'edit'}>
              {busyId === 'edit' && <Loader2 className="mr-2 size-4 animate-spin" />}
              {t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
