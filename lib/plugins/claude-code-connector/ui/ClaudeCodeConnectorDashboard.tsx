'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  Bot,
  Check,
  Clipboard,
  Download,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Terminal,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConnectorAdminCapabilities } from '@/lib/plugins/grok-connector/ui/ConnectorAdminCapabilities';

type TokenRow = {
  id: number;
  tokenPrefix: string;
  tokenLastFour: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

type Status = {
  targetEmail: string;
  readOnly: boolean;
  transport: 'remote-mcp';
  mcpUrl: string;
  connections: Array<{ clientId: string; clientName: string; createdAt: string; lastUsedAt: string | null }>;
  baseUrl: string;
  downloadUrl: string;
  tokens: TokenRow[];
};

function CopyBlock({ label, value }: { label: string; value: string }) {
  const t = useTranslations('ClaudeCodeConnector');
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success(t('copied'));
    window.setTimeout(() => setCopied(false), 1600);
  }

  return <div className="overflow-hidden rounded-xl border border-border bg-background"><div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2"><span className="text-xs font-semibold text-muted-foreground">{label}</span><Button type="button" variant="ghost" size="sm" className="h-8 gap-2 rounded-lg text-xs" onClick={copy}>{copied ? <Check className="size-3.5" /> : <Clipboard className="size-3.5" />}{t(copied ? 'copied' : 'copy')}</Button></div><pre className="max-h-72 overflow-auto p-4 font-mono text-xs leading-6"><code>{value}</code></pre></div>;
}

export function ClaudeCodeConnectorDashboard() {
  const t = useTranslations('ClaudeCodeConnector');
  const locale = useLocale();
  const [status, setStatus] = useState<Status | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [creatingLinkCode, setCreatingLinkCode] = useState(false);
  const [linkCode, setLinkCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [revoking, setRevoking] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch('/api/plugins/claude-code-connector/status', { cache: 'no-store' });
      if (!response.ok) throw new Error(t('load_error'));
      setStatus(await response.json());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t('load_error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  async function createToken() {
    setCreating(true);
    try {
      const response = await fetch('/api/plugins/claude-code-connector/tokens', { method: 'POST' });
      if (!response.ok) throw new Error(t('create_error'));
      const payload: { token: string } = await response.json();
      setSecret(payload.token);
      toast.success(t('created'));
      await loadStatus();
    } catch (createError) {
      toast.error(createError instanceof Error ? createError.message : t('create_error'));
    } finally {
      setCreating(false);
    }
  }

  async function createRemoteLinkCode() {
    setCreatingLinkCode(true);
    try {
      const response = await fetch('/api/plugins/claude-code-connector/link-code', { method: 'POST' });
      if (!response.ok) throw new Error(t('code_error'));
      const payload: { code: string; expiresAt: string } = await response.json();
      setLinkCode(payload);
      await navigator.clipboard.writeText(payload.code);
      toast.success(t('copied'));
    } catch (createError) {
      toast.error(createError instanceof Error ? createError.message : t('code_error'));
    } finally {
      setCreatingLinkCode(false);
    }
  }

  async function revokeToken(tokenId: number) {
    if (!window.confirm(t('revoke_confirm'))) return;
    setRevoking(tokenId);
    try {
      const response = await fetch('/api/plugins/claude-code-connector/tokens', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenId }),
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
  const tokenValue = secret || 'ro_live_YOUR_TOKEN';
  const command = status ? `claude mcp add --transport stdio --scope user \\
  --env WHATSPRO_API_BASE_URL=${status.baseUrl} \\
  --env WHATSPRO_API_TOKEN=${tokenValue} \\
  whatspro-readonly -- node /absolute/path/whatspro-readonly-mcp.mjs` : '';
  const remoteCommand = status ? `claude mcp add --transport http --scope user whatspro ${status.mcpUrl}` : '';

  if (loading) return <div className="flex h-full items-center justify-center bg-background"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;

  return <div className="h-full overflow-y-auto bg-background text-foreground"><main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
    <header className="flex flex-col gap-5 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between"><div className="space-y-3"><div className="flex flex-wrap gap-2"><Badge variant="secondary" className="gap-1.5"><Bot className="size-3.5" />{t('plugin_badge')}</Badge><Badge variant="outline" className="gap-1.5"><ShieldCheck className="size-3.5" />{t('actions_enabled')}</Badge><Badge variant="outline" className="font-mono">MCP</Badge></div><div><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t('title')}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{t('description')}</p></div></div><Button variant="outline" onClick={() => loadStatus()} className="min-h-11 shrink-0 gap-2 rounded-xl"><RefreshCw className="size-4" />{t('refresh')}</Button></header>

    {error ? <Alert variant="destructive"><Terminal /><AlertTitle>{t('error_title')}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}

    <section className="grid gap-4 sm:grid-cols-3"><Card><CardContent className="p-5"><p className="text-xs font-semibold text-muted-foreground">{t('authorized_account')}</p><p className="mt-2 break-all font-mono text-sm font-semibold">{status?.targetEmail}</p></CardContent></Card><Card><CardContent className="p-5"><p className="text-xs font-semibold text-muted-foreground">{t('active_connections')}</p><p className="mt-2 text-3xl font-bold tabular-nums">{status?.connections.length ?? 0}</p></CardContent></Card><Card><CardContent className="p-5"><p className="text-xs font-semibold text-muted-foreground">{t('access_scope')}</p><p className="mt-2 text-sm font-semibold">{t('actions_scope')}</p></CardContent></Card></section>

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

    <Card className="overflow-hidden"><CardHeader className="border-b border-border"><CardTitle className="flex items-center gap-2"><Bot className="size-5" />{t('remote_setup_title')}</CardTitle><CardDescription>{t('remote_setup_description')}</CardDescription></CardHeader><CardContent className="space-y-4 p-5 sm:p-6"><CopyBlock label={t('mcp_url')} value={status?.mcpUrl || ''} /><CopyBlock label={t('terminal_command')} value={remoteCommand} /><div className="flex flex-col gap-3 sm:flex-row sm:items-center"><Button onClick={createRemoteLinkCode} disabled={creatingLinkCode} className="min-h-11 gap-2 rounded-xl">{creatingLinkCode ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}{t('generate_code')}</Button>{linkCode ? <button type="button" onClick={() => navigator.clipboard.writeText(linkCode.code)} className="min-h-11 border border-border bg-muted px-4 font-mono text-lg font-bold tracking-[0.18em]">{linkCode.code}</button> : null}</div>{linkCode ? <p className="text-xs text-muted-foreground">{t('code_expires', { date: formatDate(linkCode.expiresAt) })}</p> : null}</CardContent></Card>

    <section className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,.75fr)]">
      <Card className="overflow-hidden"><CardHeader className="border-b border-border"><CardTitle className="flex items-center gap-2"><Terminal className="size-5" />{t('setup_title')}</CardTitle><CardDescription>{t('setup_description')}</CardDescription></CardHeader><CardContent className="space-y-5 p-5 sm:p-6"><div className="flex flex-col gap-3 sm:flex-row"><Button asChild variant="outline" className="min-h-11 gap-2 rounded-xl"><a href={status?.downloadUrl || '#'} download><Download className="size-4" />{t('download_server')}</a></Button><Button onClick={createToken} disabled={creating} className="min-h-11 gap-2 rounded-xl">{creating ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}{t('create_token')}</Button></div>{secret ? <Alert className="border-primary/40 bg-primary/5"><KeyRound /><AlertTitle>{t('secret_title')}</AlertTitle><AlertDescription>{t('secret_description')}</AlertDescription></Alert> : null}<CopyBlock label={t('terminal_command')} value={command} /><ol className="grid gap-3 sm:grid-cols-3">{[t('step_download'), t('step_path'), t('step_verify')].map((step, index) => <li key={step} className="flex gap-3 rounded-xl border border-border p-3 text-xs leading-5 text-muted-foreground"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted font-mono font-bold text-foreground">{index + 1}</span>{step}</li>)}</ol></CardContent></Card>

      <Card><CardHeader><CardTitle>{t('security_title')}</CardTitle><CardDescription>{t('security_description')}</CardDescription></CardHeader><CardContent className="space-y-4 text-sm"><div className="rounded-xl border border-border p-4"><p className="font-semibold">{t('team_isolation_title')}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{t('team_isolation_description')}</p></div><div className="rounded-xl border border-border p-4"><p className="font-semibold">{t('hash_title')}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{t('hash_description')}</p></div><div className="rounded-xl border border-border p-4"><p className="font-semibold">{t('expiration_title')}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{t('expiration_description')}</p></div></CardContent></Card>
    </section>

    <Card><CardHeader className="border-b border-border"><CardTitle>{t('tokens_title')}</CardTitle><CardDescription>{t('tokens_description')}</CardDescription></CardHeader><CardContent className="p-0">{status?.tokens.length ? status.tokens.map((token) => <div key={token.id} className="flex flex-col gap-4 border-b border-border p-4 last:border-b-0 sm:flex-row sm:items-center sm:p-5"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><code className="text-sm font-semibold">{token.tokenPrefix}••••••••{token.tokenLastFour}</code><Badge variant={token.revokedAt ? 'destructive' : 'secondary'}>{t(token.revokedAt ? 'revoked' : 'active')}</Badge></div><p className="mt-2 text-xs text-muted-foreground">{t('created_at', { date: formatDate(token.createdAt) })} · {t('last_used', { date: formatDate(token.lastUsedAt) })} · {t('expires_at', { date: formatDate(token.expiresAt) })}</p></div>{!token.revokedAt ? <Button variant="ghost" onClick={() => revokeToken(token.id)} disabled={revoking === token.id} className="min-h-10 gap-2 rounded-xl text-destructive hover:text-destructive">{revoking === token.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}{t('revoke')}</Button> : null}</div>) : <div className="p-10 text-center text-sm text-muted-foreground">{t('tokens_empty')}</div>}</CardContent></Card>
  </main></div>;
}
