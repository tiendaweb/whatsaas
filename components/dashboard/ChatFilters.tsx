'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandInput,
  CommandEmpty
} from "@/components/ui/command";
import { BadgeCheck, Filter, Check, UserRoundSearch } from 'lucide-react';
import useSWR from 'swr';
import { useTranslations } from 'next-intl';

type InstanceData = {
    dbId: number;
    instanceName: string;
    integration: 'WHATSAPP-BAILEYS' | 'WHATSAPP-BUSINESS';
};

type FilterState = {
  funnelStageId: number | null;
  tagId: number | null;
  agentId: number | null;
  instanceId: number | null;
  bookmarkGroupId: number | null;
  customerType: 'customer' | 'lead' | null;
};

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Request failed with status ${res.status}`);
  }
  return res.json();
};

interface ChatFiltersProps {
  activeTab: string;
  setActiveTab: (v: string) => void;
  filters: FilterState;
  setFilters: (v: FilterState) => void;
  instances: InstanceData[];
  customerFilterAvailable: boolean;
}

export function ChatFilters({
  activeTab,
  setActiveTab,
  filters,
  setFilters,
  instances,
  customerFilterAvailable,
}: ChatFiltersProps) {
  const t = useTranslations('Dashboard');
  const { data: funnelStages } = useSWR<any[]>('/api/funnel-stages', fetcher);
  const { data: tags } = useSWR<any[]>('/api/tags', fetcher);
  const { data: teamData } = useSWR<any>('/api/team', fetcher);
  const { data: agendasData } = useSWR<any>('/api/dashboard/bookmarks', fetcher);

  const stageList = Array.isArray(funnelStages) ? funnelStages : [];
  const tagList = Array.isArray(tags) ? tags : [];
  const agentList = Array.isArray(teamData?.teamMembers) ? teamData.teamMembers.map((tm: any) => tm.user) : [];
  const instanceList = Array.isArray(instances) ? instances : [];
  const agendas = Array.isArray(agendasData?.groups) ? agendasData.groups : [];

  const hasActiveFilters = Boolean(filters.funnelStageId || filters.tagId || filters.agentId || filters.instanceId || filters.bookmarkGroupId || filters.customerType);
  const clearFilters = () => setFilters({ funnelStageId: null, tagId: null, agentId: null, instanceId: null, bookmarkGroupId: null, customerType: null });
  const cycleCustomerType = () => {
    const customerType = filters.customerType === null
      ? 'customer'
      : filters.customerType === 'customer'
        ? 'lead'
        : null;
    setFilters({ ...filters, customerType });
  };

  return (
    <div className="no-scrollbar flex items-center gap-2 overflow-x-auto border-b border-border bg-background px-3 py-2 md:p-3">
      <Button
        variant={activeTab === 'all' ? 'secondary' : 'ghost'}
        size="sm"
        className="h-9 rounded-full px-4 text-xs font-medium md:h-8"
        onClick={() => setActiveTab('all')}
      >
        {t('all_chats_tab')}
      </Button>
      <Button
        variant={activeTab === 'unread' ? 'secondary' : 'ghost'}
        size="sm"
        className="h-9 rounded-full px-4 text-xs font-medium md:h-8"
        onClick={() => setActiveTab('unread')}
      >
        {t('unread_chats_tab')}
      </Button>

      {customerFilterAvailable && (
        <Button
          variant={filters.customerType ? 'secondary' : 'ghost'}
          size="sm"
          className="h-9 rounded-full px-3 text-xs font-medium md:h-8"
          aria-pressed={Boolean(filters.customerType)}
          data-filter-state={filters.customerType ?? 'all'}
          onClick={cycleCustomerType}
        >
          {filters.customerType === 'lead'
            ? <UserRoundSearch className="mr-1.5 h-3.5 w-3.5" />
            : <BadgeCheck className="mr-1.5 h-3.5 w-3.5" />}
          {filters.customerType === 'lead' ? t('filter_leads_label') : t('filter_customer_label')}
        </Button>
      )}

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant={hasActiveFilters ? "secondary" : "outline"}
            size="sm"
            className="relative h-9 w-9 shrink-0 rounded-full border-dashed p-0 md:h-8 md:w-8"
            aria-label={t('filters_button')}
            title={t('filters_button')}
          >
            <Filter className="h-3.5 w-3.5" />
            {hasActiveFilters && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-primary" />}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[280px] p-0" align="start">
          <Command>
            <div className="flex items-center border-b px-3 py-2">
              <span className="font-semibold text-xs text-foreground">{t('active_filters_heading')}</span>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" className="ml-auto h-auto p-0 text-xs text-destructive hover:text-destructive/80 hover:bg-transparent" onClick={clearFilters}>
                  {t('clear_all_button')}
                </Button>
              )}
            </div>
            <CommandInput placeholder={t('filter_by_placeholder')} />
            <CommandList>
              <CommandEmpty>{t('no_results_found')}</CommandEmpty>
              
              <CommandGroup heading={t('connections_heading')}>
                {instanceList.map((instance: any) => (
                    <CommandItem
                        key={instance.dbId}
                        onSelect={() => setFilters({ ...filters, instanceId: filters.instanceId === instance.dbId ? null : instance.dbId })}
                        className="text-sm"
                    >
                        <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${filters.instanceId === instance.dbId ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible"}`}>
                            <Check className="h-3 w-3" />
                        </div>
                        {instance.instanceName}
                        <span className="ml-auto text-[10px] text-muted-foreground uppercase">{instance.integration === 'WHATSAPP-BUSINESS' ? t('waba_integration') : t('web_integration')}</span>
                    </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />

              <CommandGroup heading={t('agendas_heading')}>
                {agendas.map((agenda: any) => (
                  <CommandItem
                    key={agenda.id}
                    onSelect={() => setFilters({
                      ...filters,
                      bookmarkGroupId: filters.bookmarkGroupId === agenda.id ? null : agenda.id,
                    })}
                    className="text-sm"
                  >
                    <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${filters.bookmarkGroupId === agenda.id ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible"}`}>
                      <Check className="h-3 w-3" />
                    </div>
                    <span className="mr-2 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: agenda.color }} />
                    <span className="min-w-0 flex-1 truncate">{agenda.name}</span>
                    {agenda.funnelStageGroupName && (
                      <span className="ml-2 max-w-24 truncate text-[10px] text-muted-foreground">{agenda.funnelStageGroupName}</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />

              <CommandGroup heading={t('funnel_stage_heading')}>
                {stageList.map(stage => (
                  <CommandItem
                    key={stage.id}
                    onSelect={() => setFilters({ ...filters, funnelStageId: filters.funnelStageId === stage.id ? null : stage.id })}
                    className="text-sm"
                  >
                    <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${filters.funnelStageId === stage.id ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible"}`}>
                      <Check className="h-3 w-3" />
                    </div>
                    {stage.name}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading={t('agents_heading')}>
                {agentList.map((agent: any) => (
                  <CommandItem
                    key={agent.id}
                    onSelect={() => setFilters({ ...filters, agentId: filters.agentId === agent.id ? null : agent.id })}
                    className="text-sm"
                  >
                    <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${filters.agentId === agent.id ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible"}`}>
                      <Check className="h-3 w-3" />
                    </div>
                    {agent.name || agent.email}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading={t('tags_heading')}>
                {tagList.map((tag: any) => (
                  <CommandItem
                    key={tag.id}
                    onSelect={() => setFilters({ ...filters, tagId: filters.tagId === tag.id ? null : tag.id })}
                    className="text-sm"
                  >
                    <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${filters.tagId === tag.id ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible"}`}>
                      <Check className="h-3 w-3" />
                    </div>
                    {tag.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
