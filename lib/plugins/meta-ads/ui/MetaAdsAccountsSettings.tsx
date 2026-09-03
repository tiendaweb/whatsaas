'use client';

import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { toast } from 'sonner';
import { AlertCircle, ArrowLeft, Info, KeyRound, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateTime } from './format';

type TokenItem = {
  id: number;
  label: string;
  tokenPreview: string;
  status: string;
  lastError: string | null;
  lastValidatedAt: string | null;
  accountsCount: number;
};

type AccountItem = {
  id: number;
  accountId: string;
  name: string;
  currency: string;
  timezoneName: string | null;
  businessName: string | null;
  taxRate: number;
  visible: boolean;
  syncEnabled: boolean;
  lastSyncedAt: string | null;
  lastSyncStatus: string | null;
  lastError: string | null;
  campaignsCount: number;
  tokenId: number;
};

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then((res) => res.json());

export function MetaAdsAccountsSettings() {
  const { data: tokens, mutate: mutateTokens } = useSWR<TokenItem[]>('/api/plugins/meta-ads/tokens', fetcher);
  const { data: accounts, mutate: mutateAccounts } = useSWR<AccountItem[]>('/api/plugins/meta-ads/accounts', fetcher);

  const [label, setLabel] = useState('');
  const [token, setToken] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [replacingId, setReplacingId] = useState<number | null>(null);
  const [replacementToken, setReplacementToken] = useState('');
  // El % de impuesto se edita libre y se guarda al salir del campo, no en cada tecla.
  const [taxDrafts, setTaxDrafts] = useState<Record<number, string>>({});

  const tokenList = Array.isArray(tokens) ? tokens : [];
  const accountList = Array.isArray(accounts) ? accounts : [];

  const refresh = () => {
    mutateTokens();
    mutateAccounts();
  };

  const handleConnect = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsConnecting(true);
    try {
      const response = await fetch('/api/plugins/meta-ads/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label.trim(), token: token.trim() }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'No se pudo conectar.');

      toast.success(`Conectado: ${json.accounts.length} cuenta(s) publicitaria(s) encontradas.`);
      setLabel('');
      setToken('');
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al conectar.');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleReplace = async (tokenId: number) => {
    setBusyId(tokenId);
    try {
      const response = await fetch(`/api/plugins/meta-ads/tokens/${tokenId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: replacementToken.trim() }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'No se pudo reemplazar el token.');

      toast.success('Token actualizado.');
      setReplacingId(null);
      setReplacementToken('');
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al reemplazar.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteToken = async (item: TokenItem) => {
    if (
      !confirm(
        `¿Quitar el token "${item.label}"? Se borran también sus cuentas y TODO el historial de campañas que sincronizaste.`,
      )
    ) {
      return;
    }

    setBusyId(item.id);
    try {
      const response = await fetch(`/api/plugins/meta-ads/tokens/${item.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('No se pudo quitar el token.');
      toast.success('Token eliminado.');
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error.');
    } finally {
      setBusyId(null);
    }
  };

  const handleSync = async (account: AccountItem) => {
    setBusyId(account.id);
    try {
      const response = await fetch(`/api/plugins/meta-ads/accounts/${account.id}/sync`, { method: 'POST' });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'No se pudo sincronizar.');

      const { campaignsUpserted, insightsUpserted } = json.summary;
      toast.success(`${campaignsUpserted} campañas · ${insightsUpserted} días de métricas.`);
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al sincronizar.');
    } finally {
      setBusyId(null);
    }
  };

  const patchAccount = async (account: AccountItem, patch: Partial<Pick<AccountItem, 'syncEnabled' | 'visible' | 'taxRate'>>) => {
    const response = await fetch(`/api/plugins/meta-ads/accounts/${account.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!response.ok) {
      toast.error('No se pudo guardar el cambio.');
      return;
    }
    mutateAccounts();
  };

  const commitTaxRate = async (account: AccountItem, raw: string) => {
    const taxRate = Number(raw);
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 200) {
      toast.error('El impuesto tiene que estar entre 0 y 200%.');
      setTaxDrafts((drafts) => ({ ...drafts, [account.id]: String(account.taxRate) }));
      return;
    }
    if (taxRate === account.taxRate) return;

    await patchAccount(account, { taxRate });
    toast.success(`Impuesto actualizado a ${taxRate}%.`);
  };

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="max-w-3xl space-y-6 p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild className="shrink-0">
          <Link href="/plugins/meta-ads">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold sm:text-2xl">Cuentas y ajustes</h1>
          <p className="text-sm text-muted-foreground">Cuentas de Meta Ads, visibilidad e impuesto.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4" /> Conectar con un token
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20">
            <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <AlertTitle className="text-blue-800 dark:text-blue-300">Usá un token de usuario del sistema</AlertTitle>
            <AlertDescription className="mt-1 space-y-1 text-xs text-blue-700 dark:text-blue-400">
              <p>1. Business Manager → Configuración del negocio → Usuarios del sistema.</p>
              <p>2. Agregar usuario → Generar token → elegí la app y marcá <code className="rounded bg-black/10 px-1 dark:bg-black/30">ads_read</code> y <code className="rounded bg-black/10 px-1 dark:bg-black/30">business_management</code>.</p>
              <p>3. Ese token no expira. Un token normal de usuario vence en horas y la sincronización se corta.</p>
            </AlertDescription>
          </Alert>

          <form onSubmit={handleConnect} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="metaAdsLabel">Nombre</Label>
              <Input
                id="metaAdsLabel"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Cuenta principal"
                required
                maxLength={120}
                disabled={isConnecting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="metaAdsToken">Token</Label>
              <Input
                id="metaAdsToken"
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="EAAG..."
                required
                minLength={20}
                disabled={isConnecting}
              />
            </div>
            <Button type="submit" disabled={isConnecting || !label.trim() || token.trim().length < 20}>
              {isConnecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Conectar y validar
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h2 className="text-sm font-medium text-muted-foreground">Tokens conectados ({tokenList.length})</h2>

        {tokenList.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Todavía no conectaste ningún token.
          </p>
        ) : (
          tokenList.map((item) => (
            <div key={item.id} className="space-y-3 rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {item.label}
                    {item.status === 'invalid' ? (
                      <Badge className="bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
                        Token vencido
                      </Badge>
                    ) : (
                      <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                        Activo
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Token {item.tokenPreview} · {item.accountsCount} cuenta(s)
                  </p>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setReplacingId(replacingId === item.id ? null : item.id)}
                >
                  Reemplazar token
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDeleteToken(item)}
                  disabled={busyId === item.id}
                  title="Quitar"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>

              {item.lastError && (
                <Alert variant="destructive" className="py-2">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs">{item.lastError}</AlertDescription>
                </Alert>
              )}

              {replacingId === item.id && (
                <div className="flex gap-2">
                  <Input
                    type="password"
                    value={replacementToken}
                    onChange={(event) => setReplacementToken(event.target.value)}
                    placeholder="Pegá el token nuevo"
                    autoFocus
                  />
                  <Button
                    onClick={() => handleReplace(item.id)}
                    disabled={busyId === item.id || replacementToken.trim().length < 20}
                  >
                    {busyId === item.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Guardar
                  </Button>
                </div>
              )}

              <div className="space-y-3 border-l-2 border-muted pl-3">
                {accountList
                  .filter((account) => account.tokenId === item.id)
                  .map((account) => (
                    <div key={account.id} className="space-y-2 rounded-md border bg-background p-3">
                      <div className="flex flex-wrap items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{account.name}</p>
                          <p className="text-xs text-muted-foreground">
                            act_{account.accountId} · {account.currency} · {account.campaignsCount} campañas
                            {account.lastSyncedAt
                              ? ` · sync ${formatDateTime(account.lastSyncedAt)}`
                              : ' · sin sincronizar'}
                          </p>
                          {account.lastError && (
                            <p className="mt-0.5 truncate text-xs text-destructive" title={account.lastError}>
                              {account.lastError}
                            </p>
                          )}
                        </div>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSync(account)}
                          disabled={busyId === account.id}
                        >
                          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${busyId === account.id ? 'animate-spin' : ''}`} />
                          Sincronizar
                        </Button>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
                        <label className="flex items-center gap-2">
                          <Switch
                            checked={account.visible}
                            onCheckedChange={(checked) => patchAccount(account, { visible: checked })}
                          />
                          <span className="text-muted-foreground">
                            Mostrar en el selector
                            {!account.visible && <span className="ml-1 text-amber-600">(oculta)</span>}
                          </span>
                        </label>

                        <label className="flex items-center gap-2">
                          <Switch
                            checked={account.syncEnabled}
                            onCheckedChange={(checked) => patchAccount(account, { syncEnabled: checked })}
                          />
                          <span className="text-muted-foreground">Sincronización automática</span>
                        </label>

                        <div className="flex items-center gap-2">
                          <Label htmlFor={`tax-${account.id}`} className="text-xs text-muted-foreground">
                            Impuesto
                          </Label>
                          <div className="flex items-center gap-1">
                            <Input
                              id={`tax-${account.id}`}
                              type="number"
                              min={0}
                              max={200}
                              step="0.01"
                              value={taxDrafts[account.id] ?? String(account.taxRate)}
                              onChange={(event) =>
                                setTaxDrafts((drafts) => ({ ...drafts, [account.id]: event.target.value }))
                              }
                              onBlur={(event) => commitTaxRate(account, event.target.value)}
                              className="h-8 w-20"
                            />
                            <span className="text-muted-foreground">%</span>
                          </div>
                        </div>
                      </div>

                      <p className="text-[11px] text-muted-foreground">
                        Meta informa la inversión sin impuestos. Con {account.taxRate}% todos los importes que ves
                        (inversión, costo por resultado, CPC y CPM) son los finales.
                      </p>
                    </div>
                  ))}
              </div>
            </div>
          ))
        )}
      </div>
      </div>
    </div>
  );
}
