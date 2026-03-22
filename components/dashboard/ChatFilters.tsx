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
import { Filter, Check } from 'lucide-react';
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
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface ChatFiltersProps {
  activeTab: string;
  setActiveTab: (v: string) => void;
  filters: FilterState;
  setFilters: (v: FilterState) => void;
  instances: InstanceData[];
}

export function ChatFilters({
  activeTab,
  setActiveTab,
  filters,
  setFilters,
  instances
}: ChatFiltersProps) {
  const t = useTranslations('Dashboard');
  const { data: funnelStages } = useSWR<any[]>('/api/funnel-stages', fetcher);
  const { data: tags } = useSWR<any[]>('/api/tags', fetcher);
  const { data: teamData } = useSWR<any>('/api/team', fetcher);
  
  const agents = teamData?.teamMembers?.map((tm: any) => tm.user) || [];

  const hasActiveFilters = filters.funnelStageId || filters.tagId || filters.agentId || filters.instanceId;
  const clearFilters = () => setFilters({ funnelStageId: null, tagId: null, agentId: null, instanceId: null });

  return (
    <div className="flex items-center gap-2 p-3 border-b border-border overflow-x-auto no-scrollbar">
      <Button
        variant={activeTab === 'all' ? 'secondary' : 'ghost'}
        size="sm"
        className="rounded-full text-xs h-8 px-4 font-medium"
        onClick={() => setActiveTab('all')}
      >
        {t('all_chats_tab')}
      </Button>
      <Button
        variant={activeTab === 'unread' ? 'secondary' : 'ghost'}
        size="sm"
        className="rounded-full text-xs h-8 px-4 font-medium"
        onClick={() => setActiveTab('unread')}
      >
        {t('unread_chats_tab')}
      </Button>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant={hasActiveFilters ? "secondary" : "outline"}
            size="sm"
            className="rounded-full h-8 px-3 text-xs flex items-center gap-1.5 border-dashed"
          >
            <Filter className="h-3.5 w-3.5" />
            {t('filters_button')}
            {hasActiveFilters && <div className="w-1.5 h-1.5 bg-primary rounded-full" />}
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
                {instances?.map((instance: any) => (
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

              <CommandGroup heading={t('funnel_stage_heading')}>
                {funnelStages?.map(stage => (
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
                {agents?.map((agent: any) => (
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
                {Array.isArray(tags) && tags.map((tag: any) => (
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