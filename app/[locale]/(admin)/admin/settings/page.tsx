import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { getAutomationAdminSettings } from '@/lib/automation/admin-settings';
import { getPaymentAdminData, saveProviderConfig } from '../payments/actions';
import { saveAutomationAdminSettings } from './actions';

export default async function AdminSettingsPage() {
  const [{ providers }, automationSettings] = await Promise.all([
    getPaymentAdminData(),
    getAutomationAdminSettings(),
  ]);

  const stripe = providers.find((p) => p.provider === 'stripe');
  const manual = providers.find((p) => p.provider === 'manual');
  const mp = providers.find((p) => p.provider === 'mercadopago');

  const stripeConfig = (stripe?.config ?? {}) as Record<string, string>;
  const mpConfig = (mp?.config ?? {}) as Record<string, string>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Ajustes</h1>
        <p className="text-muted-foreground">Configura llaves de proveedores y define el método de cobro activo.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Automatizaciones</CardTitle>
          <CardDescription>Activa o desactiva funciones globales del editor de automatizaciones.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={saveAutomationAdminSettings} className="space-y-4">
            <div className="flex items-start justify-between gap-6 rounded-lg border p-4">
              <div className="space-y-1">
                <Label htmlFor="ai-flow-generator-enabled">Generador IA de flujos</Label>
                <p className="text-sm text-muted-foreground">
                  Controla si los usuarios pueden abrir el modal del generador IA desde el builder.
                </p>
              </div>
              <Switch
                id="ai-flow-generator-enabled"
                name="aiFlowGeneratorEnabled"
                defaultChecked={Boolean(automationSettings?.aiFlowGeneratorEnabled ?? true)}
              />
            </div>
            <Button type="submit">Guardar ajustes de automatización</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stripe</CardTitle>
          <CardDescription>Configura las keys para checkout y webhook.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={saveProviderConfig} className="space-y-4">
            <input type="hidden" name="provider" value="stripe" />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Secret Key</Label>
                <Input name="secretKey" defaultValue={stripeConfig.secretKey || ''} placeholder="sk_live_..." />
              </div>
              <div className="space-y-2">
                <Label>Publishable Key</Label>
                <Input name="publishableKey" defaultValue={stripeConfig.publishableKey || ''} placeholder="pk_live_..." />
              </div>
              <div className="space-y-2">
                <Label>Webhook Secret</Label>
                <Input name="webhookSecret" defaultValue={stripeConfig.webhookSecret || ''} placeholder="whsec_..." />
              </div>
            </div>
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
          <CardTitle>Mercado Pago</CardTitle>
          <CardDescription>Configura credenciales y URLs de retorno.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={saveProviderConfig} className="space-y-4">
            <input type="hidden" name="provider" value="mercadopago" />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><Label>Access Token</Label><Input name="accessToken" defaultValue={mpConfig.accessToken || ''} /></div>
              <div className="space-y-2"><Label>Public Key</Label><Input name="publicKey" defaultValue={mpConfig.publicKey || ''} /></div>
              <div className="space-y-2"><Label>Webhook Secret</Label><Input name="webhookSecret" defaultValue={mpConfig.webhookSecret || ''} /></div>
              <div className="space-y-2"><Label>Success URL</Label><Input name="successUrl" defaultValue={mpConfig.successUrl || ''} /></div>
              <div className="space-y-2"><Label>Failure URL</Label><Input name="failureUrl" defaultValue={mpConfig.failureUrl || ''} /></div>
              <div className="space-y-2"><Label>Pending URL</Label><Input name="pendingUrl" defaultValue={mpConfig.pendingUrl || ''} /></div>
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
          <CardTitle>Offline / Manual Payment</CardTitle>
          <CardDescription>Permite aceptar pagos fuera de línea y aprobarlos en el panel de pagos.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={saveProviderConfig} className="space-y-4">
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
    </div>
  );
}
