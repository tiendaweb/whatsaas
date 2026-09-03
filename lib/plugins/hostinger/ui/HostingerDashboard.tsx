'use client';

import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { AlertCircle, DownloadCloud, Globe, Info, Loader2, Plug, Server, Trash2 } from 'lucide-react';

export type HostingerAccountItem = {
  id: number;
  label: string;
  tokenPreview: string;
  status: string;
  lastError: string | null;
  lastSyncedAt: string | null;
  domainsCount: number;
  createdAt: string;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function HostingerDashboard() {
  const { data, isLoading, mutate } = useSWR<HostingerAccountItem[]>('/api/plugins/hostinger/accounts', fetcher);
  const [label, setLabel] = useState('');
  const [token, setToken] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const accounts = Array.isArray(data) ? data : [];

  const handleConnect = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsConnecting(true);
    try {
      const response = await fetch('/api/plugins/hostinger/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label.trim(), token: token.trim() }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'No se pudo conectar la cuenta.');
      toast.success(`Cuenta conectada: ${json.domainsCount} dominio(s) disponibles.`);
      setLabel('');
      setToken('');
      mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al conectar.');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleImport = async (account: HostingerAccountItem) => {
    setBusyId(account.id);
    try {
      const response = await fetch(`/api/plugins/hostinger/accounts/${account.id}/import`, { method: 'POST' });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'No se pudo importar.');
      const { total, created, updated, linked } = json.summary;
      toast.success(
        `${total} dominio(s) importados (${created} nuevos, ${updated} actualizados). ${linked} vinculados a clientes de AAPP SPACE.`,
      );
      mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al importar.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (account: HostingerAccountItem) => {
    if (!confirm(`¿Quitar la cuenta "${account.label}"? Los dominios ya importados se conservan.`)) return;
    setBusyId(account.id);
    try {
      const response = await fetch(`/api/plugins/hostinger/accounts/${account.id}`, { method: 'DELETE' });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'No se pudo quitar la cuenta.');
      toast.success('Cuenta desconectada.');
      mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al desconectar.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-purple-600 to-indigo-700 flex items-center justify-center">
          <Server className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Hostinger</h1>
          <p className="text-sm text-muted-foreground">
            Conecta una o varias cuentas de Hostinger e importá sus dominios.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Plug className="h-4 w-4" /> Conectar una cuenta
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
            <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <AlertTitle className="text-blue-800 dark:text-blue-300">Cómo obtener el token</AlertTitle>
            <AlertDescription className="text-xs text-blue-700 dark:text-blue-400 mt-1 space-y-1">
              <p>1. Entrá en hPanel → Cuenta → API → Generar token.</p>
              <p>2. Copiá el token y pegalo acá. Podés repetir el proceso para cada cuenta de Hostinger que tengas.</p>
            </AlertDescription>
          </Alert>
          <form onSubmit={handleConnect} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="hostingerLabel">Nombre de la cuenta</Label>
              <Input
                id="hostingerLabel"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Cuenta principal"
                required
                maxLength={120}
                disabled={isConnecting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hostingerToken">Token de API</Label>
              <Input
                id="hostingerToken"
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="Token de hPanel"
                required
                minLength={20}
                disabled={isConnecting}
              />
            </div>
            <Button type="submit" disabled={isConnecting || !label.trim() || token.trim().length < 20}>
              {isConnecting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Conectar y validar
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Cuentas conectadas ({accounts.length})</h2>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground border border-dashed rounded-lg p-6 text-center">
            Todavía no hay cuentas conectadas.
          </p>
        ) : (
          accounts.map((account) => (
            <div key={account.id} className="border rounded-lg p-4 bg-card space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate flex items-center gap-2">
                    {account.label}
                    {account.status === 'error' ? (
                      <Badge className="bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">Error</Badge>
                    ) : (
                      <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                        Conectada
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Token {account.tokenPreview} · {account.domainsCount} dominio(s)
                    {account.lastSyncedAt
                      ? ` · última importación ${new Date(account.lastSyncedAt).toLocaleString('es-AR')}`
                      : ' · sin importar todavía'}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleImport(account)}
                  disabled={busyId === account.id}
                >
                  {busyId === account.id ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <DownloadCloud className="h-4 w-4 mr-2" />
                  )}
                  Importar dominios
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(account)}
                  disabled={busyId === account.id}
                  title="Quitar cuenta"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>

              {account.status === 'error' && account.lastError ? (
                <Alert variant="destructive" className="py-2">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs">{account.lastError}</AlertDescription>
                </Alert>
              ) : null}
            </div>
          ))
        )}
      </div>

      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Globe className="h-3.5 w-3.5" />
        Los dominios importados aparecen en{' '}
        <Link href="/plugins/domains" className="underline underline-offset-2">
          Dominios
        </Link>
        , ya vinculados al cliente de AAPP SPACE cuando el dominio coincide con el de su tienda.
      </p>
    </div>
  );
}
