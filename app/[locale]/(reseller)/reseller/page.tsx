import Link from 'next/link';
import { AlertTriangle, Users, Wallet, Globe } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { requireReseller } from '@/lib/db/queries/resellers';
import {
  getResellerDomains,
  getResellerStats,
  getResellerWallet,
} from '@/lib/db/queries/resellers';
import { formatMoney } from '@/lib/resellers/pricing';

export default async function ResellerOverviewPage() {
  const ctx = await requireReseller();
  if (!ctx) return null;

  const { reseller } = ctx;
  const [wallet, stats, domains] = await Promise.all([
    getResellerWallet(reseller.id),
    getResellerStats(reseller.id),
    getResellerDomains(reseller.id),
  ]);

  const balance = wallet?.balance ?? 0;
  const currency = wallet?.currency ?? reseller.currency;
  const pendingDomains = domains.filter((domain) => domain.status !== 'active');

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">{reseller.companyName}</h1>
        <p className="text-muted-foreground">
          Tu panel de marca blanca: marca, dominio, precios y saldo.
        </p>
      </div>

      {reseller.status === 'past_due' ? (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex items-start gap-3 pt-6">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
            <div>
              <p className="font-semibold text-destructive">Cuenta con saldo pendiente</p>
              <p className="text-sm text-muted-foreground">
                No puedes activar clientes nuevos hasta regularizar tu saldo. Tus
                clientes actuales siguen funcionando.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Saldo disponible</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={balance <= 0 ? 'text-3xl font-bold text-destructive' : 'text-3xl font-bold'}>
              {formatMoney(balance, currency)}
            </div>
            <Button asChild size="sm" className="mt-3">
              <Link href="/reseller/wallet">Recargar</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Clientes</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.totalCustomers}</div>
            <p className="text-xs text-muted-foreground">
              {stats.activeCustomers} con plan activo
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Dominios</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{domains.length}</div>
            {pendingDomains.length > 0 ? (
              <p className="text-xs text-amber-600">
                {pendingDomains.length} pendiente(s) de activación
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Todos activos</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cómo funciona tu billetera</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Tus clientes te pagan a ti, con tus propias credenciales de cobro. El
            dinero llega directo a tu cuenta.
          </p>
          <p>
            Cada vez que un cliente tuyo activa o renueva un plan, se descuenta de
            este saldo el precio mayorista de ese plan. Tu ganancia es la diferencia
            entre lo que le cobras y ese precio.
          </p>
          <p>
            Si te quedas sin saldo no podrás activar clientes nuevos, pero los que ya
            tienes seguirán funcionando.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
