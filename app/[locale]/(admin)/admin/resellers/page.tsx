import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { resellerDomains, resellerTopups } from '@/lib/db/schema';
import { listResellersForAdmin } from '@/lib/db/queries/resellers';
import { formatMoney } from '@/lib/resellers/pricing';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ActionForm } from '@/components/resellers/action-form';
import { getTranslations } from 'next-intl/server';
import {
  activateResellerDomain,
  adjustResellerBalance,
  approveTopup,
  createReseller,
  rejectTopup,
  transferResellerOwner,
  updateResellerSettings,
} from './actions';

export default async function AdminResellersPage() {
  const t = await getTranslations('Admin');
  const [resellersList, domains, pendingTopups] = await Promise.all([
    listResellersForAdmin(),
    db.select().from(resellerDomains),
    db
      .select()
      .from(resellerTopups)
      .where(eq(resellerTopups.status, 'pending_manual_review')),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Revendedores</h1>
        <p className="text-muted-foreground">
          Marca blanca: cada revendedor tiene su dominio, su marca y su billetera.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nuevo revendedor</CardTitle>
          <CardDescription>
            Se crea el usuario, la billetera y su marca. El descuento define el precio
            mayorista que se le descuenta del saldo por cada plan que active.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={createReseller} className="grid gap-4 md:grid-cols-5">
            <div className="space-y-2">
              <Label htmlFor="companyName">Empresa</Label>
              <Input id="companyName" name="companyName" placeholder="ChatPro" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">Identificador</Label>
              <Input id="slug" name="slug" placeholder="chatpro" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email del dueño</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input id="password" name="password" type="password" minLength={12} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="discountPercent">Descuento %</Label>
              <div className="flex gap-2">
                <Input
                  id="discountPercent"
                  name="discountPercent"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  defaultValue={30}
                />
                <Button type="submit">Crear</Button>
              </div>
            </div>
          </ActionForm>
        </CardContent>
      </Card>

      {resellersList.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Todavía no hay revendedores.
          </CardContent>
        </Card>
      ) : (
        resellersList.map(({
          reseller,
          balance,
          creditLimit,
          customers,
          primaryHost,
          activeDomains,
          publishedPlans,
          enabledProviders,
          ownerEmail,
          ownerRole,
        }) => {
          const resellerDomainList = domains.filter((d) => d.resellerId === reseller.id);
          const resellerTopupList = pendingTopups.filter(
            (t) => t.resellerId === reseller.id,
          );
          const readiness = [
            { label: 'Dominio verificado', ready: activeDomains > 0 },
            { label: 'Plan publicado', ready: publishedPlans > 0 },
            { label: 'Proveedor habilitado', ready: enabledProviders > 0 },
            { label: 'Cobros autorizados', ready: reseller.paymentsEnabled },
            { label: 'Saldo o crédito disponible', ready: (balance ?? 0) + (creditLimit ?? 0) > 0 },
          ];
          const readyToSell = readiness.every((item) => item.ready);

          return (
            <Card key={reseller.id}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {reseller.companyName}
                      {reseller.status === 'active' ? (
                        <Badge className="bg-emerald-600">Activo</Badge>
                      ) : reseller.status === 'past_due' ? (
                        <Badge className="bg-amber-600">Saldo pendiente</Badge>
                      ) : (
                        <Badge variant="destructive">Suspendido</Badge>
                      )}
                    </CardTitle>
                    <CardDescription>
                      {primaryHost ?? 'Sin dominio principal'} · {customers} cliente(s) ·
                      Descuento {reseller.wholesaleDiscountBps / 100}%
                    </CardDescription>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Saldo</p>
                    <p
                      className={
                        (balance ?? 0) <= 0
                          ? 'text-2xl font-bold text-destructive'
                          : 'text-2xl font-bold'
                      }
                    >
                      {formatMoney(balance ?? 0, reseller.currency)}
                    </p>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-6">
                <div className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{t('reseller_owner_title')}</p>
                      <p className="text-xs text-muted-foreground">
                        {t('reseller_owner_current', { email: ownerEmail, role: ownerRole })}
                      </p>
                    </div>
                    <Badge variant="secondary">{t('reseller_owner_scope')}</Badge>
                  </div>
                  <ActionForm
                    action={transferResellerOwner}
                    successMessage={t('reseller_owner_saved')}
                    className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end"
                  >
                    <input type="hidden" name="resellerId" value={reseller.id} />
                    <div className="space-y-1">
                      <Label htmlFor={`owner-email-${reseller.id}`}>
                        {t('reseller_owner_email')}
                      </Label>
                      <Input
                        id={`owner-email-${reseller.id}`}
                        name="ownerEmail"
                        type="email"
                        defaultValue={ownerEmail}
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`owner-password-${reseller.id}`}>
                        {t('reseller_owner_password')}
                      </Label>
                      <Input
                        id={`owner-password-${reseller.id}`}
                        name="ownerPassword"
                        type="password"
                        minLength={12}
                        placeholder={t('reseller_owner_password_placeholder')}
                      />
                    </div>
                    <Button type="submit" variant="secondary">
                      {t('reseller_owner_save')}
                    </Button>
                  </ActionForm>
                </div>

                <div className="rounded-lg border p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold">Preparación para vender</p>
                    <Badge className={readyToSell ? 'bg-emerald-600' : 'bg-amber-600'}>
                      {readyToSell ? 'Listo' : 'Configuración pendiente'}
                    </Badge>
                  </div>
                  <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-5">
                    {readiness.map((item) => (
                      <div key={item.label} className="flex items-center gap-2">
                        <span className={item.ready ? 'text-emerald-600' : 'text-amber-600'}>
                          {item.ready ? '✓' : '○'}
                        </span>
                        <span>{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  <ActionForm action={updateResellerSettings} className="space-y-3">
                    <input type="hidden" name="resellerId" value={reseller.id} />
                    <p className="text-sm font-semibold">Condiciones</p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Descuento %</Label>
                        <Input
                          name="discountPercent"
                          type="number"
                          min={0}
                          max={100}
                          defaultValue={reseller.wholesaleDiscountBps / 100}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Crédito</Label>
                        <Input name="creditLimit" type="number" min={0} defaultValue={(creditLimit ?? 0) / 100} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Estado</Label>
                        <select
                          name="status"
                          defaultValue={reseller.status}
                          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                        >
                          <option value="active">Activo</option>
                          <option value="past_due">Saldo pendiente</option>
                          <option value="suspended">Suspendido</option>
                        </select>
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="paymentsEnabled"
                        defaultChecked={reseller.paymentsEnabled}
                        className="h-4 w-4"
                      />
                      Permitir cobros con credenciales propias
                    </label>
                    <Button type="submit" size="sm" variant="secondary">
                      Guardar condiciones
                    </Button>
                  </ActionForm>

                  <ActionForm action={adjustResellerBalance} className="space-y-3">
                    <input type="hidden" name="resellerId" value={reseller.id} />
                    <p className="text-sm font-semibold">Ajustar saldo</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Importe (+/-)</Label>
                        <Input name="amount" type="number" step="0.01" placeholder="50.00" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Motivo</Label>
                        <Input name="description" placeholder="Recarga manual" />
                      </div>
                    </div>
                    <Button type="submit" size="sm" variant="secondary">
                      Aplicar ajuste
                    </Button>
                  </ActionForm>
                </div>

                {resellerTopupList.length > 0 ? (
                  <div>
                    <p className="mb-2 text-sm font-semibold">
                      Recargas pendientes ({resellerTopupList.length})
                    </p>
                    <ul className="space-y-2">
                      {resellerTopupList.map((topup) => (
                        <li
                          key={topup.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3"
                        >
                          <div>
                            <span className="font-semibold">
                              {formatMoney(topup.amount, topup.currency)}
                            </span>
                            {topup.providerRef ? (
                              <span className="ml-2 text-xs text-muted-foreground">
                                Ref: {topup.providerRef}
                              </span>
                            ) : null}
                          </div>
                          <div className="flex gap-2">
                            {topup.proofUrl ? (
                              <Button asChild type="button" size="sm" variant="outline">
                                <a href={`/api/reseller-topups/${topup.id}/proof`} target="_blank" rel="noreferrer">
                                  Ver comprobante
                                </a>
                              </Button>
                            ) : null}
                            <ActionForm action={approveTopup} successMessage="Saldo acreditado.">
                              <input type="hidden" name="topupId" value={topup.id} />
                              <Button type="submit" size="sm">
                                Acreditar
                              </Button>
                            </ActionForm>
                            <ActionForm action={rejectTopup} successMessage="Recarga rechazada.">
                              <input type="hidden" name="topupId" value={topup.id} />
                              <Button type="submit" size="sm" variant="outline">
                                Rechazar
                              </Button>
                            </ActionForm>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div>
                  <p className="mb-2 text-sm font-semibold">Dominios</p>
                  {resellerDomainList.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sin dominios.</p>
                  ) : (
                    <ul className="space-y-2">
                      {resellerDomainList.map((domain) => (
                        <li
                          key={domain.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm">{domain.hostname}</span>
                            {domain.isPrimary ? (
                              <Badge variant="secondary">Principal</Badge>
                            ) : null}
                            {domain.status === 'active' ? (
                              <Badge className="bg-emerald-600">Activo</Badge>
                            ) : (
                              <Badge variant="outline">Pendiente</Badge>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <ActionForm
                              action={activateResellerDomain}
                              successMessage={domain.status === 'active' ? 'Dominio revalidado.' : 'Dominio activado.'}
                            >
                              <input type="hidden" name="domainId" value={domain.id} />
                              <Button type="submit" size="sm" variant={domain.status === 'active' ? 'secondary' : 'default'}>
                                {domain.status === 'active' ? 'Revalidar' : 'Verificar y activar'}
                              </Button>
                            </ActionForm>
                            {domain.status === 'active' ? (
                              <ActionForm action={activateResellerDomain} successMessage="Dominio desactivado.">
                                <input type="hidden" name="domainId" value={domain.id} />
                                <input type="hidden" name="intent" value="deactivate" />
                                <Button type="submit" size="sm" variant="outline">Desactivar</Button>
                              </ActionForm>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  {resellerDomainList.some((d) => d.status !== 'active') ? (
                    <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
                      <p className="font-semibold text-amber-700 dark:text-amber-500">
                        Antes de activar: configura DNS, Traefik y TLS
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        El sistema comprobará que el DNS comparte el ingress de WhatsPro y
                        que el dominio responde el token de esta instalación. En{' '}
                        <code>docker-compose.yml</code>, añade el host a la regla del router y
                        recrea el contenedor con{' '}
                        <code className="font-semibold">docker compose up -d</code>.
                        Un <code>docker restart</code> NO relee las labels: el dominio
                        respondería 404 aunque aquí figure como activo.
                      </p>
                      <pre className="mt-2 overflow-x-auto rounded bg-muted p-2">
{resellerDomainList
  .filter((d) => d.status !== 'active')
  .map(
    (d) =>
      `- traefik.http.routers.whatspro.rule=... || Host(\`${d.hostname}\`) || Host(\`www.${d.hostname}\`)`,
  )
  .join('\n')}
                      </pre>
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
