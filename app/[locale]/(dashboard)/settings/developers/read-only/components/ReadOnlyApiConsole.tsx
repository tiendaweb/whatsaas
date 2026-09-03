'use client';

import { useMemo, useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
  BookOpen,
  Bot,
  Braces,
  Check,
  ChevronRight,
  Copy,
  Database,
  ExternalLink,
  FileJson,
  KeyRound,
  Loader2,
  Lock,
  ListTree,
  MessageSquareText,
  Network,
  Plus,
  Search,
  ServerCog,
  ShieldCheck,
  Terminal,
  Trash2,
  Workflow,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { createReadOnlyToken, lockDocumentation, revokeReadOnlyToken } from '../actions';

type ResourceMeta = {
  key: string;
  title: string;
  description: string;
  category: string;
  endpoint: string;
  fields: string[];
  filters: string[];
  searchable: boolean;
  itemLookup: boolean;
};

type TokenRow = {
  id: number;
  name: string;
  tokenPrefix: string;
  tokenLastFour: string;
  scopes: string[];
  expiresAt: Date | string | null;
  lastUsedAt: Date | string | null;
  revokedAt: Date | string | null;
  createdAt: Date | string;
};

function CodeBlock({ value, label }: { value: string; label: string }) {
  const t = useTranslations('ReadOnlyApi');
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success(t('copied'));
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-muted/40">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={copy}>
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {t(copied ? 'copied' : 'copy')}
        </Button>
      </div>
      <pre className="max-h-80 overflow-auto p-4 text-xs leading-6"><code>{value}</code></pre>
    </div>
  );
}

export function ReadOnlyApiConsole({
  resources,
  tokens,
  baseUrl,
}: {
  resources: ResourceMeta[];
  tokens: TokenRow[];
  baseUrl: string;
}) {
  const t = useTranslations('ReadOnlyApi');
  const locale = useLocale();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState('chats');
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState(() => t('token_default_name'));
  const [expires, setExpires] = useState('90');
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return resources;
    return resources.filter((resource) => `${resource.key} ${resource.title} ${resource.description}`.toLowerCase().includes(normalized));
  }, [query, resources]);
  const selected = resources.find((resource) => resource.key === selectedKey) || resources[0];
  const activeTokens = tokens.filter((token) => !token.revokedAt);

  function formatDate(value: Date | string | null) {
    if (!value) return t('never');
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  }

  function createToken() {
    startTransition(async () => {
      const result = await createReadOnlyToken({ name, expiresInDays: expires === 'never' ? null : Number(expires) });
      if (!result.ok) {
        toast.error(t('token_create_error'));
        return;
      }
      setCreatedSecret(result.token);
      router.refresh();
    });
  }

  function revokeToken(id: number) {
    if (!window.confirm(t('revoke_confirm'))) return;
    startTransition(async () => {
      const result = await revokeReadOnlyToken(id);
      if (!result.ok) {
        toast.error(t('token_revoke_error'));
        return;
      }
      toast.success(t('token_revoked'));
      router.refresh();
    });
  }

  function lockPage() {
    startTransition(async () => {
      await lockDocumentation();
      router.refresh();
    });
  }

  const tokenPlaceholder = 'ro_live_YOUR_TOKEN';
  const selectedUrl = `${baseUrl}${selected?.endpoint || '/api/readonly/v1/chats'}?per_page=100`;
  const curl = `curl -sS "${selectedUrl}" \\
  -H "Authorization: Bearer $WHATSPRO_API_TOKEN" \\
  -H "Accept: application/json"`;
  const javascript = `const response = await fetch("${selectedUrl}", {
  method: "GET",
  headers: {
    Authorization: \`Bearer \${process.env.WHATSPRO_API_TOKEN}\`,
    Accept: "application/json"
  }
});

if (!response.ok) throw new Error(await response.text());
const result = await response.json();
console.log(result.data, result.meta);`;
  const python = `import os
import requests

response = requests.get(
    "${selectedUrl}",
    headers={"Authorization": f"Bearer {os.environ['WHATSPRO_API_TOKEN']}"},
    timeout=30,
)
response.raise_for_status()
result = response.json()`;
  const codexConfig = `[mcp_servers.whatspro_readonly]
command = "node"
args = ["/absolute/path/whatspro-readonly-mcp.mjs"]
startup_timeout_sec = 10
tool_timeout_sec = 60
default_tools_approval_mode = "approve"

[mcp_servers.whatspro_readonly.env]
WHATSPRO_API_BASE_URL = "${baseUrl}"
WHATSPRO_API_TOKEN = "${tokenPlaceholder}"`;
  const claudeConfig = `{
  "mcpServers": {
    "whatspro-readonly": {
      "command": "node",
      "args": ["/absolute/path/whatspro-readonly-mcp.mjs"],
      "env": {
        "WHATSPRO_API_BASE_URL": "${baseUrl}",
        "WHATSPRO_API_TOKEN": "${tokenPlaceholder}"
      }
    }
  }
}`;
  const claudeCodeCommand = `claude mcp add --transport stdio --scope user \\
  --env WHATSPRO_API_BASE_URL=${baseUrl} \\
  --env WHATSPRO_API_TOKEN=${tokenPlaceholder} \\
  whatspro-readonly -- node /absolute/path/whatspro-readonly-mcp.mjs`;

  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-6 p-4 md:p-6 xl:p-8">
      <header className="flex flex-col gap-5 border-b pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="gap-1.5 font-mono"><ShieldCheck className="size-3" /> GET · HEAD · OPTIONS</Badge>
            <Badge variant="secondary">{resources.length} {t('resources')}</Badge>
            <Badge variant="secondary">{activeTokens.length} {t('active_tokens')}</Badge>
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{t('title')}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{t('description')}</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={lockPage} disabled={pending}><Lock className="mr-2 size-4" />{t('lock_button')}</Button>
          <Button onClick={() => setCreateOpen(true)}><Plus className="mr-2 size-4" />{t('create_token_button')}</Button>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          [Database, t('coverage_title'), t('coverage_description')],
          [Lock, t('isolation_title'), t('isolation_description')],
          [Braces, t('openapi_title'), t('openapi_description')],
          [Bot, t('ai_title'), t('ai_description')],
        ].map(([Icon, title, description]) => {
          const ItemIcon = Icon as typeof Database;
          return <Card key={String(title)}><CardContent className="flex gap-3 p-4"><div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted text-primary"><ItemIcon className="size-4" /></div><div><h2 className="text-sm font-semibold">{String(title)}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{String(description)}</p></div></CardContent></Card>;
        })}
      </div>

      <Tabs defaultValue="reference" className="space-y-5">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 md:inline-flex md:w-auto md:grid-cols-none">
          <TabsTrigger value="reference"><BookOpen className="mr-2 size-4" />{t('reference_tab')}</TabsTrigger>
          <TabsTrigger value="guides"><ListTree className="mr-2 size-4" />{t('guides_tab')}</TabsTrigger>
          <TabsTrigger value="tokens"><KeyRound className="mr-2 size-4" />{t('tokens_tab')}</TabsTrigger>
          <TabsTrigger value="ai"><Bot className="mr-2 size-4" />{t('ai_tab')}</TabsTrigger>
          <TabsTrigger value="security"><ShieldCheck className="mr-2 size-4" />{t('security_tab')}</TabsTrigger>
        </TabsList>

        <TabsContent value="reference" className="mt-0">
          <div className="grid min-h-[720px] overflow-hidden rounded-xl border bg-card lg:grid-cols-[330px_minmax(0,1fr)]">
            <aside className="border-b lg:border-b-0 lg:border-r">
              <div className="border-b p-4">
                <Label htmlFor="resource-search" className="sr-only">{t('search_resources')}</Label>
                <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="resource-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('search_resources')} className="pl-9" /></div>
              </div>
              <div className="max-h-[340px] overflow-y-auto p-2 lg:max-h-[680px]">
                {filtered.map((resource) => (
                  <button key={resource.key} type="button" onClick={() => setSelectedKey(resource.key)} className={`flex min-h-14 w-full items-center gap-3 border-b px-3 py-2 text-left transition-colors ${selected?.key === resource.key ? 'bg-primary/10 text-foreground' : 'hover:bg-muted/60'}`}>
                    <span className="min-w-0 flex-1"><strong className="block truncate font-mono text-xs font-semibold">{resource.key}</strong><small className="mt-1 block truncate text-xs text-muted-foreground">{resource.title}</small></span><ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                ))}
                {filtered.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">{t('no_resources')}</p>}
              </div>
            </aside>

            {selected && <article className="min-w-0 space-y-6 p-4 md:p-6 lg:p-8">
              <div className="space-y-3 border-b pb-6"><div className="flex flex-wrap items-center gap-2"><Badge className="font-mono">GET</Badge><code className="break-all text-sm">{selected.endpoint}</code><Badge variant="outline">{selected.category}</Badge></div><div><h2 className="text-xl font-semibold">{selected.title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{selected.description}</p></div></div>
              <div className="grid gap-4 xl:grid-cols-2"><Card><CardHeader><CardTitle className="text-sm">{t('parameters_title')}</CardTitle><CardDescription>{t('parameters_description')}</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-2"><Badge variant="secondary">page</Badge><Badge variant="secondary">per_page</Badge>{selected.searchable && <Badge variant="secondary">q</Badge>}{selected.filters.map((filter) => <Badge key={filter} variant="outline" className="font-mono">{filter}</Badge>)}</CardContent></Card><Card><CardHeader><CardTitle className="text-sm">{t('fields_title')}</CardTitle><CardDescription>{t('fields_description')}</CardDescription></CardHeader><CardContent className="flex max-h-32 flex-wrap gap-2 overflow-y-auto">{selected.fields.map((field) => <code key={field} className="rounded border bg-muted px-2 py-1 text-xs">{field}</code>)}</CardContent></Card></div>
              <Tabs defaultValue="curl"><TabsList><TabsTrigger value="curl">cURL</TabsTrigger><TabsTrigger value="javascript">JavaScript</TabsTrigger><TabsTrigger value="python">Python</TabsTrigger></TabsList><TabsContent value="curl"><CodeBlock label="cURL" value={curl} /></TabsContent><TabsContent value="javascript"><CodeBlock label="JavaScript" value={javascript} /></TabsContent><TabsContent value="python"><CodeBlock label="Python" value={python} /></TabsContent></Tabs>
              <div className="space-y-2"><h3 className="text-sm font-semibold">{t('response_title')}</h3><CodeBlock label="application/json" value={`{
  "object": "list",
  "resource": "${selected.key}",
  "data": [],
  "meta": {
    "page": 1,
    "perPage": 100,
    "hasMore": false,
    "nextPage": null
  }
}`} /></div>
            </article>}
          </div>
        </TabsContent>

        <TabsContent value="guides" className="mt-0 space-y-5">
          <div className="grid gap-4 lg:grid-cols-3">
            {[
              [Terminal, 'guide_auth_title', 'guide_auth_description'],
              [ListTree, 'guide_pagination_title', 'guide_pagination_description'],
              [Network, 'guide_relations_title', 'guide_relations_description'],
            ].map(([Icon, title, description]) => {
              const GuideIcon = Icon as typeof Terminal;
              return <Card key={String(title)}><CardHeader><GuideIcon className="mb-2 size-5 text-primary" /><CardTitle className="text-base">{t(String(title))}</CardTitle><CardDescription className="leading-6">{t(String(description))}</CardDescription></CardHeader></Card>;
            })}
          </div>
          <div className="grid gap-5 xl:grid-cols-2">
            {[
              ['recipe_conversations_title', 'recipe_conversations_description', 'recipe_conversations_steps', MessageSquareText],
              ['recipe_automations_title', 'recipe_automations_description', 'recipe_automations_steps', Workflow],
              ['recipe_crm_title', 'recipe_crm_description', 'recipe_crm_steps', Network],
              ['recipe_plugins_title', 'recipe_plugins_description', 'recipe_plugins_steps', ServerCog],
            ].map(([title, description, steps, Icon]) => {
              const RecipeIcon = Icon as typeof Terminal;
              return <Card key={String(title)}><CardHeader><CardTitle className="flex items-center gap-2 text-base"><RecipeIcon className="size-5 text-primary" />{t(String(title))}</CardTitle><CardDescription className="leading-6">{t(String(description))}</CardDescription></CardHeader><CardContent><pre className="whitespace-pre-wrap rounded-xl border bg-muted/40 p-4 text-xs leading-6"><code>{t(String(steps))}</code></pre></CardContent></Card>;
            })}
          </div>
          <Card><CardHeader><CardTitle>{t('errors_title')}</CardTitle><CardDescription>{t('errors_description')}</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[['400','errors_400'],['401','errors_401'],['404','errors_404'],['429','errors_429']].map(([code, key]) => <div key={code} className="rounded-xl border p-4"><code className="text-sm font-semibold">HTTP {code}</code><p className="mt-2 text-xs leading-5 text-muted-foreground">{t(key)}</p></div>)}</CardContent></Card>
        </TabsContent>

        <TabsContent value="tokens" className="mt-0 space-y-4">
          <Card><CardHeader className="flex-row items-start justify-between gap-4"><div><CardTitle>{t('token_management_title')}</CardTitle><CardDescription className="mt-1">{t('token_management_description')}</CardDescription></div><Button onClick={() => setCreateOpen(true)}><Plus className="mr-2 size-4" />{t('create_token_button')}</Button></CardHeader><CardContent className="space-y-2">{tokens.length === 0 ? <div className="py-10 text-center text-sm text-muted-foreground">{t('tokens_empty')}</div> : tokens.map((token) => <div key={token.id} className="flex flex-col gap-3 border-b py-4 last:border-0 md:flex-row md:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{token.name}</strong><Badge variant={token.revokedAt ? 'destructive' : 'secondary'}>{t(token.revokedAt ? 'revoked' : 'active')}</Badge></div><code className="mt-1 block text-xs text-muted-foreground">{token.tokenPrefix}••••••••{token.tokenLastFour}</code></div><div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs md:text-right"><span className="text-muted-foreground">{t('created')}</span><span>{formatDate(token.createdAt)}</span><span className="text-muted-foreground">{t('last_used')}</span><span>{formatDate(token.lastUsedAt)}</span><span className="text-muted-foreground">{t('expires')}</span><span>{formatDate(token.expiresAt)}</span></div>{!token.revokedAt && <Button variant="ghost" size="icon" aria-label={t('revoke')} onClick={() => revokeToken(token.id)} disabled={pending} className="text-destructive"><Trash2 className="size-4" /></Button>}</div>)}</CardContent></Card>
        </TabsContent>

        <TabsContent value="ai" className="mt-0 space-y-5">
          <div className="grid gap-5 xl:grid-cols-2"><Card><CardHeader><CardTitle className="flex items-center gap-2"><ServerCog className="size-5" />{t('mcp_title')}</CardTitle><CardDescription>{t('mcp_description')}</CardDescription></CardHeader><CardContent className="space-y-4"><Button asChild variant="outline"><a href="/integrations/whatspro-readonly-mcp.mjs" download><ExternalLink className="mr-2 size-4" />{t('download_mcp')}</a></Button><section className="rounded-xl border border-primary/30 bg-primary/5 p-4"><div className="flex items-start gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Terminal className="size-4" /></span><div><h3 className="text-sm font-semibold">{t('claude_code_title')}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{t('claude_code_description')}</p></div></div><div className="mt-4 space-y-3"><p className="text-xs leading-5 text-muted-foreground">{t('claude_code_install_help')}</p><CodeBlock label="Claude Code CLI" value={claudeCodeCommand} /><p className="text-xs leading-5 text-muted-foreground">{t('claude_code_verify_help')}</p></div></section><p className="text-xs leading-5 text-muted-foreground">{t('codex_config_help')}</p><CodeBlock label="~/.codex/config.toml" value={codexConfig} /><p className="text-xs leading-5 text-muted-foreground">{t('claude_config_help')}</p><CodeBlock label="claude_desktop_config.json" value={claudeConfig} /></CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2"><FileJson className="size-5" />{t('machine_docs_title')}</CardTitle><CardDescription>{t('machine_docs_description')}</CardDescription></CardHeader><CardContent className="space-y-3"><CodeBlock label="OpenAPI 3.1" value={`curl -sS "${baseUrl}/api/readonly/v1/openapi.json" -H "Authorization: Bearer $WHATSPRO_API_TOKEN" -o whatspro-openapi.json`} /><CodeBlock label="AI context" value={`curl -sS "${baseUrl}/api/readonly/v1/ai-context.md" -H "Authorization: Bearer $WHATSPRO_API_TOKEN" -o WHATSPRO_API.md`} /></CardContent></Card></div>
          <Card><CardHeader><CardTitle>{t('ai_prompt_title')}</CardTitle><CardDescription>{t('ai_prompt_description')}</CardDescription></CardHeader><CardContent><CodeBlock label="Prompt" value={t('ai_prompt')} /></CardContent></Card>
        </TabsContent>

        <TabsContent value="security" className="mt-0"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[['read_only_guarantee_title','read_only_guarantee_description'],['secret_redaction_title','secret_redaction_description'],['team_scope_title','team_scope_description'],['hashed_tokens_title','hashed_tokens_description'],['rate_limit_title','rate_limit_description'],['revocation_title','revocation_description']].map(([title, description]) => <Card key={title}><CardHeader><ShieldCheck className="mb-2 size-5 text-primary" /><CardTitle className="text-base">{t(title)}</CardTitle><CardDescription className="leading-6">{t(description)}</CardDescription></CardHeader></Card>)}</div></TabsContent>
      </Tabs>

      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) setCreatedSecret(null); }}>
        <DialogContent className="sm:max-w-[520px]">{createdSecret ? <><DialogHeader><DialogTitle>{t('token_created_title')}</DialogTitle><DialogDescription>{t('token_created_description')}</DialogDescription></DialogHeader><CodeBlock label={t('token_label')} value={createdSecret} /><DialogFooter><Button onClick={() => { setCreateOpen(false); setCreatedSecret(null); }}>{t('done')}</Button></DialogFooter></> : <><DialogHeader><DialogTitle>{t('create_token_title')}</DialogTitle><DialogDescription>{t('create_token_description')}</DialogDescription></DialogHeader><div className="space-y-4 py-2"><div className="space-y-2"><Label htmlFor="token-name">{t('token_name')}</Label><Input id="token-name" value={name} onChange={(event) => setName(event.target.value)} placeholder={t('token_name_placeholder')} /></div><div className="space-y-2"><Label htmlFor="token-expiration">{t('token_expiration')}</Label><Select value={expires} onValueChange={setExpires}><SelectTrigger id="token-expiration" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="30">{t('days_30')}</SelectItem><SelectItem value="90">{t('days_90')}</SelectItem><SelectItem value="365">{t('days_365')}</SelectItem><SelectItem value="never">{t('never_expires')}</SelectItem></SelectContent></Select></div></div><DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>{t('cancel')}</Button><Button onClick={createToken} disabled={pending || name.trim().length < 3}>{pending && <Loader2 className="mr-2 size-4 animate-spin" />}{t('create')}</Button></DialogFooter></>}</DialogContent>
      </Dialog>
    </main>
  );
}
