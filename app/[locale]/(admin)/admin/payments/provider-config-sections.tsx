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
};

const initialState: SaveProviderConfigResult = {};

export function ProviderConfigSections({ stripe, manual, mp }: Props) {
  const [stripeState, stripeAction] = useActionState(saveProviderConfigAction, initialState);
  const [manualState, manualAction] = useActionState(saveProviderConfigAction, initialState);
  const [mpState, mpAction] = useActionState(saveProviderConfigAction, initialState);

  const mpConfig = (mp?.config ?? {}) as Record<string, string>;

  return (
    <>
      {(stripeState.error || manualState.error || mpState.error) && (
        <p className="text-sm text-destructive">
          {stripeState.error || manualState.error || mpState.error}
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
          <CardTitle>Manual Payment Plugin</CardTitle>
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
            <Button type="submit">Guardar Manual Payment</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mercado Pago Plugin</CardTitle>
          <CardDescription>Configura keys y URLs del checkout.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={mpAction} className="space-y-4">
            <input type="hidden" name="provider" value="mercadopago" />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Access Token</Label>
                <Input name="accessToken" defaultValue={mpConfig.accessToken || ''} />
              </div>
              <div className="space-y-2">
                <Label>Public Key</Label>
                <Input name="publicKey" defaultValue={mpConfig.publicKey || ''} />
              </div>
              <div className="space-y-2">
                <Label>Webhook Secret</Label>
                <Input name="webhookSecret" defaultValue={mpConfig.webhookSecret || ''} />
              </div>
              <div className="space-y-2">
                <Label>Success URL</Label>
                <Input name="successUrl" defaultValue={mpConfig.successUrl || ''} />
              </div>
              <div className="space-y-2">
                <Label>Failure URL</Label>
                <Input name="failureUrl" defaultValue={mpConfig.failureUrl || ''} />
              </div>
              <div className="space-y-2">
                <Label>Pending URL</Label>
                <Input name="pendingUrl" defaultValue={mpConfig.pendingUrl || ''} />
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
    </>
  );
}
