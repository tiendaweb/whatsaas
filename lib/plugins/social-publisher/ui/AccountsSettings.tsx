'use client';

import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { ArrowLeft, Facebook, Instagram, Info, Loader2, Plug, Trash2 } from 'lucide-react';
import { fetcher, type SocialAccountItem } from './types';

const REQUIRED_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'instagram_basic',
  'instagram_content_publish',
];

export function AccountsSettings() {
  const { data: accounts, isLoading, mutate } = useSWR<SocialAccountItem[]>('/api/plugins/social-publisher/accounts', fetcher);
  const [token, setToken] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsConnecting(true);
    try {
      const res = await fetch('/api/plugins/social-publisher/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userToken: token.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error al conectar');
      toast.success(`${json.connected.length} cuenta(s) conectada(s)`);
      setToken('');
      mutate();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async (account: SocialAccountItem) => {
    if (!confirm(`¿Desconectar ${account.name}? Las publicaciones programadas hacia esta cuenta fallarán.`)) return;
    setBusyId(account.id);
    try {
      const res = await fetch(`/api/plugins/social-publisher/accounts?id=${account.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error');
      toast.success('Cuenta desconectada');
      mutate();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const list = Array.isArray(accounts) ? accounts : [];

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/plugins/social-publisher"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">Cuentas conectadas</h1>
          <p className="text-sm text-muted-foreground">Facebook Pages e Instagram Business para publicar contenido</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Plug className="h-4 w-4" /> Conectar con token de Meta</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
            <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <AlertTitle className="text-blue-800 dark:text-blue-300">Cómo obtener el token</AlertTitle>
            <AlertDescription className="text-xs text-blue-700 dark:text-blue-400 mt-1 space-y-1">
              <p>1. Entra en Meta Business Suite → Configuración → Usuarios del sistema (o usa el Explorador de la API Graph).</p>
              <p>2. Genera un token de larga duración con estos permisos: <code className="bg-black/10 dark:bg-black/30 px-1 rounded">{REQUIRED_SCOPES.join(', ')}</code></p>
              <p>3. Pégalo aquí: detectaremos tus páginas de Facebook y las cuentas de Instagram Business vinculadas.</p>
            </AlertDescription>
          </Alert>
          <form onSubmit={handleConnect} className="flex items-end gap-2">
            <div className="flex-1 space-y-2">
              <Label htmlFor="metaUserToken">Token de acceso</Label>
              <Input
                id="metaUserToken"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="EAAG..."
                required
                minLength={20}
                disabled={isConnecting}
              />
            </div>
            <Button type="submit" disabled={isConnecting || token.trim().length < 20}>
              {isConnecting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Conectar
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Cuentas ({list.length})</h2>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : list.length === 0 ? (
          <p className="text-sm text-muted-foreground border border-dashed rounded-lg p-6 text-center">
            No hay cuentas conectadas todavía
          </p>
        ) : (
          list.map((account) => (
            <div key={account.id} className="border rounded-lg p-3 flex items-center gap-3 bg-card">
              <Avatar className="h-9 w-9">
                <AvatarImage src={account.pictureUrl || undefined} />
                <AvatarFallback>{account.name.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate flex items-center gap-1.5">
                  {account.platform === 'instagram'
                    ? <Instagram className="h-3.5 w-3.5 text-pink-600" />
                    : <Facebook className="h-3.5 w-3.5 text-blue-600" />}
                  {account.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {account.platform === 'instagram' ? 'Instagram Business' : 'Página de Facebook'}
                </p>
              </div>
              {account.status === 'token_expired' && (
                <Badge className="bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">Token expirado</Badge>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDisconnect(account)}
                disabled={busyId === account.id}
                title="Desconectar"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
