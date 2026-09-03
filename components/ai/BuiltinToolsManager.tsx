'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Loader2, Sparkles, Eye, PencilLine } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { getBuiltinAiTools, toggleBuiltinAiTool } from '@/app/[locale]/(dashboard)/settings/ai/builtin-tools-actions';

type Entry = Awaited<ReturnType<typeof getBuiltinAiTools>>[number];

export function BuiltinToolsManager() {
  const t = useTranslations('AiBuiltinTools');
  const { data, mutate, isLoading } = useSWR('ai-builtin-tools', getBuiltinAiTools);
  const [pending, setPending] = useState<string | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, { pluginName: string; pluginActive: boolean; tools: Entry[] }>();
    for (const tool of data ?? []) {
      const key = tool.pluginId ?? '__core__';
      if (!map.has(key)) map.set(key, { pluginName: tool.pluginName, pluginActive: tool.pluginActive, tools: [] });
      map.get(key)!.tools.push(tool);
    }
    return Array.from(map.entries());
  }, [data]);

  const activeCount = (data ?? []).filter((tool) => tool.pluginActive && tool.enabled).length;

  async function onToggle(tool: Entry, enabled: boolean) {
    setPending(tool.name);
    const result = await toggleBuiltinAiTool(tool.name, enabled);
    setPending(null);
    if ('error' in result && result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(enabled ? t('enabled_toast') : t('disabled_toast'));
    mutate();
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> {t('title')}
            </CardTitle>
            <CardDescription>{t('description')}</CardDescription>
          </div>
          {data && (
            <Badge variant="secondary" className="whitespace-nowrap">
              {t('active_count', { count: activeCount, total: data.length })}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t('loading')}
          </div>
        )}
        {!isLoading && groups.length === 0 && <p className="text-sm text-muted-foreground">{t('empty')}</p>}
        {groups.map(([key, group]) => (
          <div key={key} className="rounded-lg border">
            <div className="flex items-center justify-between gap-3 border-b bg-muted/40 px-4 py-2">
              <span className="text-sm font-semibold">{group.pluginName}</span>
              <Badge variant={group.pluginActive ? 'default' : 'outline'} className="text-[10px]">
                {group.pluginActive ? t('plugin_active') : t('plugin_inactive')}
              </Badge>
            </div>
            <ul className="divide-y">
              {group.tools.map((tool) => {
                const effective = tool.pluginActive && tool.enabled;
                return (
                  <li key={tool.name} className={`flex items-start justify-between gap-4 px-4 py-3 ${group.pluginActive ? '' : 'opacity-60'}`}>
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{tool.label}</span>
                        <code className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{tool.name}</code>
                        <Badge variant="outline" className="gap-1 text-[10px]">
                          {tool.risk === 'read' ? <Eye className="h-3 w-3" /> : <PencilLine className="h-3 w-3" />}
                          {tool.risk === 'read' ? t('risk_read') : t('risk_write')}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{tool.summary}</p>
                    </div>
                    <div className="flex items-center gap-2 pt-0.5">
                      {pending === tool.name && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                      <Switch
                        checked={tool.enabled}
                        disabled={!group.pluginActive || pending === tool.name}
                        onCheckedChange={(checked) => onToggle(tool, checked)}
                        aria-label={effective ? t('disable_aria', { name: tool.label }) : t('enable_aria', { name: tool.label })}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
