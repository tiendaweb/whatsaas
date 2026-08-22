'use client';

import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  ArrowUpRight,
  Check,
  Clipboard,
  Database,
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
import { ConnectorAdminCapabilities } from '@/lib/plugins/grok-connector/ui/ConnectorAdminCapabilities';

type Connection = {
  clientId: string;
  clientName: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
};

type Status = {
  targetEmail: string;
  transport: 'remote-mcp';
  readOnly: boolean;
  mcpUrl: string;
  connections: Connection[];
};

type LinkCode = { code: string; expiresAt: string };

export function ChatGPTConnectorDashboard() {
  const t = useTranslations('ChatGPTConnector');
  const locale = useLocale();
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
      const response = await fetch('/api/plugins/chatgpt-connector/status', { cache: 'no-store' });
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
      const response = await fetch('/api/plugins/chatgpt-connector/link-code', { method: 'POST' });
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
      const response = await fetch('/api/plugins/chatgpt-connector/connections/revoke', {
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
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
    : t('never');

  if (loading) {
    return <div className="flex h-full items-center justify-center bg-background"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="h-full overflow-y-auto bg-background text-foreground">
      <main className="mx-auto w-full max-w-6xl space-y-6 p-4 pb-24 sm:p-6 md:pb-8 lg:p-8">
        <header className="relative overflow-hidden border border-border bg-card p-5 sm:p-7">
          <div className="absolute inset-y-0 left-0 w-1 bg-primary" aria-hidden="true" />
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start">
              <div className="flex size-14 shrink-0 items-center justify-center rounded-xl border border-border bg-white p-2.5">
                <Image src="/integrations/brands/openai.svg" alt="OpenAI" width={40} height={40} className="size-9" priority />
              </div>
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">{t('plugin_badge')}</Badge>
                  <Badge variant="outline" className="gap-1.5"><ShieldCheck className="size-3.5" />{t('actions_enabled')}</Badge>
                  <Badge variant="outline" className="font-mono">MCP</Badge>
                </div>
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t('title')}</h1>
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{t('description')}</p>
              </div>
            </div>
            <Button asChild className="min-h-11 w-full shrink-0 gap-2 sm:w-auto">
              <a href="https://chatgpt.com/plugins" target="_blank" rel="noreferrer">{t('open_chatgpt')}<ArrowUpRight className="size-4" /></a>
            </Button>
          </div>
        </header>

        {error ? <Alert variant="destructive"><Unplug /><AlertTitle>{t('error_title')}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}

        <section className="grid gap-4 sm:grid-cols-3">
          <Card><CardContent className="p-5"><p className="text-xs font-semibold text-muted-foreground">{t('authorized_account')}</p><p className="mt-2 break-all font-mono text-sm font-semibold">{status?.targetEmail}</p></CardContent></Card>
          <Card><CardContent className="p-5"><p className="text-xs font-semibold text-muted-foreground">{t('active_connections')}</p><p className="mt-2 text-3xl font-bold tabular-nums">{status?.connections.length ?? 0}</p></CardContent></Card>
          <Card><CardContent className="p-5"><p className="text-xs font-semibold text-muted-foreground">{t('access_scope')}</p><p className="mt-2 text-sm font-semibold">{t('actions_scope')}</p></CardContent></Card>
        </section>

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

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,.75fr)]">
          <Card className="overflow-hidden">
            <CardHeader className="border-b border-border">
              <CardTitle className="flex items-center gap-2"><PlugZap className="size-5" />{t('setup_title')}</CardTitle>
              <CardDescription>{t('setup_description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 p-5 sm:p-6">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">{t('mcp_url')}</p>
                <div className="flex min-w-0 flex-col gap-2 border border-border bg-muted p-2 sm:flex-row sm:items-center">
                  <code className="min-w-0 flex-1 break-all px-2 py-1 text-xs">{status?.mcpUrl}</code>
                  <Button variant="outline" className="min-h-11 w-full gap-2 sm:w-auto" onClick={() => status && copy(status.mcpUrl, 'url')}>
                    {copied === 'url' ? <Check className="size-4" /> : <Clipboard className="size-4" />}{t('copy_url')}
                  </Button>
                </div>
              </div>

              <ol className="grid gap-3 sm:grid-cols-2">
                {[t('step_1'), t('step_2'), t('step_3'), t('step_4')].map((step, index) => (
                  <li key={step} className="flex gap-3 border border-border p-3 text-xs leading-5 text-muted-foreground">
                    <span className="flex size-7 shrink-0 items-center justify-center bg-muted font-mono font-bold text-foreground">{index + 1}</span>
                    <span className="pt-1">{step}</span>
                  </li>
                ))}
              </ol>

              <div className="border border-border bg-card p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div><p className="text-sm font-semibold">{t('code_title')}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{t('code_description')}</p></div>
                  <Button onClick={createCode} disabled={creating} className="min-h-11 w-full gap-2 sm:w-auto">
                    {creating ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}{t('generate_code')}
                  </Button>
                </div>
                {linkCode ? (
                  <button type="button" onClick={() => copy(linkCode.code, 'code')} className="mt-4 flex min-h-14 w-full items-center justify-between border border-border bg-muted px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    <span className="font-mono text-lg font-bold tracking-[0.18em] sm:text-xl sm:tracking-[0.22em]">{linkCode.code}</span>
                    {copied === 'code' ? <Check className="size-5" /> : <Clipboard className="size-5 text-muted-foreground" />}
                  </button>
                ) : null}
                {linkCode ? <p className="mt-2 text-xs text-muted-foreground">{t('code_expires', { date: formatDate(linkCode.expiresAt) })}</p> : null}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card><CardHeader><CardTitle className="flex items-center gap-2"><Database className="size-5" />{t('coverage_title')}</CardTitle></CardHeader><CardContent className="space-y-3 text-sm text-muted-foreground"><p>{t('coverage_description')}</p><div className="flex flex-wrap gap-2">{t('coverage_items').split('|').map((label) => <Badge key={label} variant="outline">{label}</Badge>)}</div></CardContent></Card>
            <Alert><ShieldCheck /><AlertTitle>{t('security_title')}</AlertTitle><AlertDescription>{t('security_description')}</AlertDescription></Alert>
          </div>
        </section>

        <Card>
          <CardHeader className="border-b border-border sm:flex-row sm:items-center sm:justify-between">
            <div><CardTitle>{t('connections_title')}</CardTitle><CardDescription className="mt-1.5">{t('connections_description')}</CardDescription></div>
            <Button variant="outline" onClick={() => loadStatus()} className="mt-3 min-h-11 w-full gap-2 sm:mt-0 sm:w-auto"><RefreshCw className="size-4" />{t('refresh')}</Button>
          </CardHeader>
          <CardContent className="p-0">
            {!status?.connections.length ? (
              <div className="p-10 text-center text-sm text-muted-foreground">{t('connections_empty')}</div>
            ) : status.connections.map((connection) => (
              <div key={connection.clientId} className="flex flex-col gap-4 border-b border-border p-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{connection.clientName}</span><Badge variant="secondary">{t('active')}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{t('connected_on', { date: formatDate(connection.createdAt) })} · {t('last_used', { date: formatDate(connection.lastUsedAt) })}</p></div>
                <Button variant="destructive" onClick={() => revoke(connection.clientId)} disabled={revoking === connection.clientId} className="min-h-11 w-full gap-2 sm:w-auto">{revoking === connection.clientId ? <Loader2 className="size-4 animate-spin" /> : <Unplug className="size-4" />}{t('revoke')}</Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
