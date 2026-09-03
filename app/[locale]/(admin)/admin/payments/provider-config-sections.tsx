'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { saveProviderConfigAction, type SaveProviderConfigResult } from './actions';

type ProviderSettings = {
  provider: string;
  enabled: boolean;
  isDefault: boolean;
  config: Record<string, string | undefined> | null;
};

type Props = {
  stripe?: ProviderSettings;
  manual?: ProviderSettings;
  mp?: ProviderSettings;
  ls?: ProviderSettings;
};

const initialState: SaveProviderConfigResult = {};

export function ProviderConfigSections({ stripe, manual, mp, ls }: Props) {
  const [stripeState, stripeAction] = useActionState(saveProviderConfigAction, initialState);
  const [manualState, manualAction] = useActionState(saveProviderConfigAction, initialState);
  const [mpState, mpAction] = useActionState(saveProviderConfigAction, initialState);
  const [lsState, lsAction] = useActionState(saveProviderConfigAction, initialState);

  const mpConfig = (mp?.config ?? {}) as Record<string, string>;
  const lsConfig = (ls?.config ?? {}) as Record<string, string>;

  return (
    <>
      {(stripeState.error || manualState.error || mpState.error || lsState.error) && (
        <p className="text-sm text-destructive">
          {stripeState.error || manualState.error || mpState.error || lsState.error}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Stripe</CardTitle>
          <CardDescription>Proveedor actual, mantenido por compatibilidad.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={stripeAction} className="space-y-4">
            <input type="hidden" name="provider" value="stripe" />
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="enabled" defaultChecked={Boolean(stripe?.enabled)} />
                Habilitado
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="isDefault" defaultChecked={Boolean(stripe?.isDefault)} />
                Predeterminado
              </label>
            </div>
            <Button type="submit">Guardar Stripe</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Plugin de pago manual</CardTitle>
          <CardDescription>Permite pagos manuales con revisión del administrador.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={manualAction} className="space-y-4">
            <input type="hidden" name="provider" value="manual" />
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="enabled" defaultChecked={Boolean(manual?.enabled)} />
                Habilitado
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="isDefault" defaultChecked={Boolean(manual?.isDefault)} />
                Predeterminado
              </label>
            </div>
            <Button type="submit">Guardar pago manual</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Plugin de Mercado Pago</CardTitle>
          <CardDescription>Configura keys y URLs del checkout.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={mpAction} className="space-y-4">
            <input type="hidden" name="provider" value="mercadopago" />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Token de acceso</Label>
                <Input
                  name="accessToken"
                  type="password"
                  placeholder={mpConfig.accessToken ? 'Configurado; deja vacío para conservarlo' : ''}
                />
              </div>
              <div className="space-y-2">
                <Label>Clave pública</Label>
                <Input name="publicKey" defaultValue={mpConfig.publicKey || ''} />
              </div>
              <div className="space-y-2">
                <Label>Secreto del webhook</Label>
                <Input
                  name="webhookSecret"
                  type="password"
                  placeholder={mpConfig.webhookSecret ? 'Configurado; deja vacío para conservarlo' : ''}
                />
              </div>
              <div className="space-y-2">
                <Label>URL de éxito</Label>
                <Input name="successUrl" defaultValue={mpConfig.successUrl || ''} />
              </div>
              <div className="space-y-2">
                <Label>URL de error</Label>
                <Input name="failureUrl" defaultValue={mpConfig.failureUrl || ''} />
              </div>
              <div className="space-y-2">
                <Label>URL pendiente</Label>
                <Input name="pendingUrl" defaultValue={mpConfig.pendingUrl || ''} />
              </div>
              <div className="space-y-2">
                <Label>Modo de checkout</Label>
                <select
                  name="checkoutMode"
                  defaultValue={mpConfig.checkoutMode || 'payment'}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="payment">Pago (Checkout Pro)</option>
                  <option value="subscription">Suscripción (Preapproval)</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Motivo de suscripción</Label>
                <Input name="subscriptionReason" defaultValue={mpConfig.subscriptionReason || ''} placeholder="Suscripción del plan" />
              </div>
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="enabled" defaultChecked={Boolean(mp?.enabled)} />
                Habilitado
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="isDefault" defaultChecked={Boolean(mp?.isDefault)} />
                Predeterminado
              </label>
            </div>
            <Button type="submit">Guardar Mercado Pago</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Plugin de Lemon Squeezy</CardTitle>
          <CardDescription>Configura la API key, la tienda y el webhook.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={lsAction} className="space-y-4">
            <input type="hidden" name="provider" value="lemonsqueezy" />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>API key</Label>
                <Input
                  name="apiKey"
                  type="password"
                  placeholder={lsConfig.apiKey ? 'Configurada; deja vacío para conservarla' : ''}
                />
              </div>
              <div className="space-y-2">
                <Label>Store ID</Label>
                <Input name="storeId" defaultValue={lsConfig.storeId || ''} />
              </div>
              <div className="space-y-2">
                <Label>Secreto del webhook</Label>
                <Input
                  name="webhookSecret"
                  type="password"
                  placeholder={lsConfig.webhookSecret ? 'Configurado; deja vacío para conservarlo' : ''}
                />
              </div>
              <div className="space-y-2">
                <Label>URL de éxito</Label>
                <Input name="successUrl" defaultValue={lsConfig.successUrl || ''} />
              </div>
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="enabled" defaultChecked={Boolean(ls?.enabled)} />
                Habilitado
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="isDefault" defaultChecked={Boolean(ls?.isDefault)} />
                Predeterminado
              </label>
            </div>
            <Button type="submit">Guardar Lemon Squeezy</Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
