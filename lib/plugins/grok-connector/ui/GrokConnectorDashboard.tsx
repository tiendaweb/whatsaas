'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  Bot,
  Check,
  Clipboard,
  Database,
  ExternalLink,
  KeyRound,
  Loader2,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  Unplug,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConnectorAdminCapabilities } from './ConnectorAdminCapabilities';

type Connection = {
  clientId: string;
  clientName: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
  scopes: string[];
};

type Status = {
  mode: 'subscription-mcp';
  readOnly: false;
  actions: true;
  targetEmail: string;
  mcpUrl: string;
  connections: Connection[];
};

type LinkCode = { code: string; expiresAt: string };

export function GrokConnectorDashboard() {
  const t = useTranslations('GrokConnector');
  const [status, setStatus] = useState<Status | null>(null);
  const [linkCode, setLinkCode] = useState<LinkCode | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch('/api/plugins/grok-connector/status', { cache: 'no-store' });
      if (!response.ok) throw new Error(t('load_error'));
      setStatus(await response.json());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t('load_error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  async function copy(value: string, key: string) {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    toast.success(t('copied'));
    window.setTimeout(() => setCopied((current) => current === key ? null : current), 1800);
  }

  async function createCode() {
    setCreating(true);
    try {
      const response = await fetch('/api/plugins/grok-connector/link-code', { method: 'POST' });
      if (!response.ok) throw new Error(t('code_error'));
      const created: LinkCode = await response.json();
      setLinkCode(created);
      await copy(created.code, 'code');
    } catch (createError) {
      toast.error(createError instanceof Error ? createError.message : t('code_error'));
    } finally {
      setCreating(false);
    }
  }

  async function revoke(clientId: string) {
    if (!window.confirm(t('revoke_confirm'))) return;
    setRevoking(clientId);
    try {
      const response = await fetch('/api/plugins/grok-connector/connections/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      });
      if (!response.ok) throw new Error(t('revoke_error'));
      toast.success(t('revoked_success'));
      await loadStatus();
    } catch (revokeError) {
      toast.error(revokeError instanceof Error ? revokeError.message : t('revoke_error'));
    } finally {
      setRevoking(null);
    }
  }

  const formatDate = (value: string | null) => value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
    : t('never');

  if (loading) {
    return <div className="flex h-full items-center justify-center bg-background"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
        <header className="flex flex-col gap-4 border-b border-border pb-6 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1.5"><Bot className="size-3.5" />{t('badge')}</Badge>
              <Badge variant="outline" className="gap-1.5"><ShieldCheck className="size-3.5" />{t('actions_enabled')}</Badge>
            </div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t('title')}</h1>
            <p className="max-w-3xl text-sm text-muted-foreground">{t('description')}</p>
          </div>
          <Button asChild className="shrink-0 gap-2">
            <a href="https://grok.com/connectors" target="_blank" rel="noreferrer">{t('open_grok')}<ExternalLink className="size-4" /></a>
          </Button>
        </header>

        {error && <Alert variant="destructive"><Unplug /><AlertTitle>{t('error_title')}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}

        <Alert>
          <KeyRound />
          <AlertTitle>{t('subscription_title')}</AlertTitle>
          <AlertDescription>{t('subscription_description')}</AlertDescription>
        </Alert>

        {status?.connections.some((connection) => !connection.scopes?.includes('whatspro:write')) && (
          <Alert>
            <RefreshCw />
            <AlertTitle>{t('reconnect_title')}</AlertTitle>
            <AlertDescription>{t('reconnect_description')}</AlertDescription>
          </Alert>
        )}

        <ConnectorAdminCapabilities
          title={t('admin_capabilities_title')}
          description={t('admin_capabilities_description')}
          projects={t('admin_projects')}
          code={t('admin_code')}
          domains={t('admin_domains')}
          data={t('admin_data')}
          guardrailTitle={t('admin_guardrail_title')}
          guardrailDescription={t('admin_guardrail_description')}
        />

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,.75fr)]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><PlugZap className="size-5" />{t('setup_title')}</CardTitle>
              <CardDescription>{t('setup_description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('mcp_url')}</div>
                <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-muted p-2">
                  <code className="min-w-0 flex-1 break-all px-2 text-xs text-foreground">{status?.mcpUrl}</code>
                  <Button variant="outline" size="icon" onClick={() => status && copy(status.mcpUrl, 'url')} aria-label={t('copy_url')}>
                    {copied === 'url' ? <Check className="size-4" /> : <Clipboard className="size-4" />}
                  </Button>
                </div>
              </div>

              <ol className="space-y-4">
                {[t('step_1'), t('step_2'), t('step_3'), t('step_4')].map((step, index) => (
                  <li key={step} className="flex gap-3 text-sm">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs font-bold">{index + 1}</span>
                    <span className="pt-1 text-muted-foreground">{step}</span>
                  </li>
                ))}
              </ol>

              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold">{t('code_title')}</div>
                    <p className="mt-1 text-xs text-muted-foreground">{t('code_description')}</p>
                  </div>
                  <Button onClick={createCode} disabled={creating} className="gap-2">
                    {creating ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}{t('generate_code')}
                  </Button>
                </div>
                {linkCode && (
                  <button type="button" onClick={() => copy(linkCode.code, 'code')} className="mt-4 flex w-full items-center justify-between rounded-lg border border-border bg-muted px-4 py-3 text-left">
                    <span className="font-mono text-xl font-bold tracking-[0.22em] text-foreground">{linkCode.code}</span>
                    {copied === 'code' ? <Check className="size-5" /> : <Clipboard className="size-5 text-muted-foreground" />}
                  </button>
                )}
                {linkCode && <p className="mt-2 text-xs text-muted-foreground">{t('code_expires', { date: formatDate(linkCode.expiresAt) })}</p>}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Database className="size-5" />{t('coverage_title')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>{t('coverage_description')}</p>
                <div className="flex flex-wrap gap-2">
                  {t('coverage_items').split('|').map((label) => <Badge key={label} variant="outline">{label}</Badge>)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t('access_title')}</CardTitle>
                <CardDescription>{t('access_description')}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border border-border bg-muted p-3 font-mono text-xs break-all">{status?.targetEmail}</div>
              </CardContent>
            </Card>
          </div>
        </div>

        <Card>
          <CardHeader className="sm:grid-cols-[1fr_auto]">
            <div>
              <CardTitle>{t('connections_title')}</CardTitle>
              <CardDescription className="mt-1.5">{t('connections_description')}</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => loadStatus()} className="mt-3 gap-2 sm:mt-0"><RefreshCw className="size-4" />{t('refresh')}</Button>
          </CardHeader>
          <CardContent>
            {!status?.connections.length ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{t('connections_empty')}</div>
            ) : (
              <div className="divide-y divide-border rounded-xl border border-border">
                {status.connections.map((connection) => (
                  <div key={connection.clientId} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2"><span className="font-semibold">{connection.clientName}</span><Badge variant="secondary">{t('active')}</Badge></div>
                      <p className="mt-1 text-xs text-muted-foreground">{t('connected_on', { date: formatDate(connection.createdAt) })}</p>
                    </div>
                    <Button variant="destructive" size="sm" onClick={() => revoke(connection.clientId)} disabled={revoking === connection.clientId} className="gap-2">
                      {revoking === connection.clientId ? <Loader2 className="size-4 animate-spin" /> : <Unplug className="size-4" />}{t('revoke')}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
