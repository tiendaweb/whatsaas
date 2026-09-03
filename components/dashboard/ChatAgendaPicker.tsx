'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BookmarkCheck, Check, ChevronRight, Clock3, Layers, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

type AgendaChat = { id: number; remoteJid: string };
type AgendaItem = { id: number; chat?: AgendaChat };
type AgendaGroup = {
  id: number;
  name: string;
  color: string;
  funnelStageGroupId: number | null;
  funnelStageGroupName: string | null;
  items: AgendaItem[];
};
type FunnelGroup = { id: number; name: string; order: number };
type AgendasResponse = {
  groups: AgendaGroup[];
  funnelGroups: FunnelGroup[];
  catalog: { chats: AgendaChat[] };
};

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
  return response.json();
};

export function ChatAgendaPicker({
  chatId,
  remoteJid,
  className,
}: {
  chatId?: number | null;
  remoteJid?: string | null;
  className?: string;
}) {
  const t = useTranslations('DashboardBookmarks');
  const { data, isLoading, mutate } = useSWR<AgendasResponse>('/api/dashboard/bookmarks', fetcher);
  const [savingGroupId, setSavingGroupId] = useState<number | null>(null);
  const [lastAgendaId, setLastAgendaId] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedFunnelGroupId, setSelectedFunnelGroupId] = useState<number | null>(null);

  useEffect(() => {
    const stored = Number(localStorage.getItem('dashboardLastAgendaId'));
    if (Number.isFinite(stored) && stored > 0) setLastAgendaId(stored);
  }, []);

  const resolvedChatId = useMemo(() => {
    if (chatId) return chatId;
    return data?.catalog.chats.find((chat) => chat.remoteJid === remoteJid)?.id ?? null;
  }, [chatId, data?.catalog.chats, remoteJid]);

  const membershipByGroup = useMemo(() => {
    const memberships = new Map<number, AgendaItem>();
    if (!resolvedChatId) return memberships;
    for (const group of data?.groups ?? []) {
      const item = group.items.find((candidate) => candidate.chat?.id === resolvedChatId);
      if (item) memberships.set(group.id, item);
    }
    return memberships;
  }, [data?.groups, resolvedChatId]);

  const agendasByFunnelGroup = useMemo(() => {
    const agendas = data?.groups ?? [];
    const sections = (data?.funnelGroups ?? []).map((funnelGroup) => ({
      ...funnelGroup,
      agendas: agendas
        .filter((agenda) => agenda.funnelStageGroupId === funnelGroup.id)
        .sort((a, b) => Number(b.id === lastAgendaId) - Number(a.id === lastAgendaId)),
    })).filter((section) => section.agendas.length > 0);
    const unassigned = agendas
      .filter((agenda) => agenda.funnelStageGroupId == null)
      .sort((a, b) => Number(b.id === lastAgendaId) - Number(a.id === lastAgendaId));
    if (unassigned.length > 0) {
      sections.push({ id: -1, name: t('unassigned_funnel_group_option'), order: Number.MAX_SAFE_INTEGER, agendas: unassigned });
    }
    return sections;
  }, [data?.funnelGroups, data?.groups, lastAgendaId, t]);

  const toggleGroup = async (group: AgendaGroup) => {
    if (!resolvedChatId) return;
    const existing = membershipByGroup.get(group.id);
    setLastAgendaId(group.id);
    localStorage.setItem('dashboardLastAgendaId', String(group.id));
    setSavingGroupId(group.id);
    try {
      const response = await fetch('/api/dashboard/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(existing
          ? { action: 'remove_item', itemId: existing.id }
          : { action: 'add_item', groupId: group.id, entityType: 'chat', entityId: resolvedChatId }),
      });
      if (!response.ok) throw new Error('save_failed');
      toast.success(t(existing ? 'removed_from_agenda_toast' : 'saved_to_agenda_toast', { group: group.name }));
      await mutate();
    } catch {
      toast.error(t('save_error_toast'));
    } finally {
      setSavingGroupId(null);
    }
  };

  const savedCount = membershipByGroup.size;
  const selectedSection = agendasByFunnelGroup.find((section) => section.id === selectedFunnelGroupId) ?? null;

  return (
    <Popover
      open={pickerOpen}
      onOpenChange={(open) => {
        setPickerOpen(open);
        if (!open) setSelectedFunnelGroupId(null);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn('w-full justify-center', className)}
          disabled={isLoading || !resolvedChatId}
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookmarkCheck className="h-4 w-4" />}
          {savedCount > 0
            ? t('saved_in_agendas_button', { count: savedCount })
            : t('save_to_agenda_button')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <div className="border-b border-border px-3 py-2.5">
          {selectedSection ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedFunnelGroupId(null)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={t('agenda_picker_back_to_groups')}
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{selectedSection.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{t('agenda_picker_choose_agenda')}</p>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm font-semibold text-foreground">{t('agenda_picker_title')}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t('agenda_picker_choose_group')}</p>
            </>
          )}
        </div>
        <div className="max-h-72 overflow-y-auto p-1.5">
          {(data?.groups.length ?? 0) === 0 ? (
            <p className="px-3 py-5 text-center text-sm text-muted-foreground">{t('agenda_picker_empty')}</p>
          ) : selectedSection ? (
            <section>
              {selectedSection.agendas.map((agenda) => {
                const selected = membershipByGroup.has(agenda.id);
                const saving = savingGroupId === agenda.id;
                const isLastUsed = agenda.id === lastAgendaId;
                return (
                  <button
                    key={agenda.id}
                    type="button"
                    className="flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-foreground hover:bg-muted disabled:opacity-60"
                    disabled={savingGroupId !== null}
                    onClick={() => toggleGroup(agenda)}
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: agenda.color }} />
                    <span className="min-w-0 flex-1 truncate">{agenda.name}</span>
                    {isLastUsed && (
                      <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                        <Clock3 className="h-3 w-3" />
                        {t('last_used_label')}
                      </span>
                    )}
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <span className={cn(
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border border-border',
                        selected && 'border-primary bg-primary text-primary-foreground',
                      )}>
                        {selected && <Check className="h-3.5 w-3.5" />}
                      </span>
                    )}
                  </button>
                );
              })}
            </section>
          ) : (
            <div className="space-y-1">
              {agendasByFunnelGroup.map((section) => {
                const selectedInSection = section.agendas.filter((agenda) => membershipByGroup.has(agenda.id)).length;
                return (
                  <button
                    key={section.id}
                    type="button"
                    className="flex min-h-12 w-full items-center gap-3 rounded-md px-2.5 text-left hover:bg-muted"
                    onClick={() => setSelectedFunnelGroupId(section.id)}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Layers className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{section.name}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {t('agenda_picker_agenda_count', { count: section.agendas.length })}
                      </span>
                    </span>
                    {selectedInSection > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                        {selectedInSection}
                      </span>
                    )}
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
