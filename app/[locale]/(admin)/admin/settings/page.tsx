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
  const ls = providers.find((p) => p.provider === 'lemonsqueezy');

  const stripeConfig = (stripe?.config ?? {}) as Record<string, string>;
  const mpConfig = (mp?.config ?? {}) as Record<string, string>;
  const lsConfig = (ls?.config ?? {}) as Record<string, string>;

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
                <Label htmlFor="ai-flow-generator-enabled">Mostrar "Generar con IA" en automatizaciones</Label>
                <p className="text-sm text-muted-foreground">
                  Cuando está apagado, el botón y el modal de "Generar con IA" se ocultan del creador de flujos.
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
                <Label>Clave secreta</Label>
                <Input name="secretKey" defaultValue={stripeConfig.secretKey || ''} placeholder="sk_live_..." />
              </div>
              <div className="space-y-2">
                <Label>Clave publicable</Label>
                <Input name="publishableKey" defaultValue={stripeConfig.publishableKey || ''} placeholder="pk_live_..." />
              </div>
              <div className="space-y-2">
                <Label>Secreto del webhook</Label>
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
              <div className="space-y-2"><Label>Token de acceso</Label><Input name="accessToken" defaultValue={mpConfig.accessToken || ''} /></div>
              <div className="space-y-2"><Label>Clave pública</Label><Input name="publicKey" defaultValue={mpConfig.publicKey || ''} /></div>
              <div className="space-y-2"><Label>Secreto del webhook</Label><Input name="webhookSecret" defaultValue={mpConfig.webhookSecret || ''} /></div>
              <div className="space-y-2"><Label>URL de éxito</Label><Input name="successUrl" defaultValue={mpConfig.successUrl || ''} /></div>
              <div className="space-y-2"><Label>URL de error</Label><Input name="failureUrl" defaultValue={mpConfig.failureUrl || ''} /></div>
              <div className="space-y-2"><Label>URL pendiente</Label><Input name="pendingUrl" defaultValue={mpConfig.pendingUrl || ''} /></div>
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
              <div className="space-y-2"><Label>Motivo de suscripción</Label><Input name="subscriptionReason" defaultValue={mpConfig.subscriptionReason || ''} /></div>
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
          <CardTitle>Lemon Squeezy</CardTitle>
          <CardDescription>Configura la API key, la tienda y el webhook.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={saveProviderConfig} className="space-y-4">
            <input type="hidden" name="provider" value="lemonsqueezy" />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><Label>API key</Label><Input name="apiKey" defaultValue={lsConfig.apiKey || ''} /></div>
              <div className="space-y-2"><Label>Store ID</Label><Input name="storeId" defaultValue={lsConfig.storeId || ''} /></div>
              <div className="space-y-2"><Label>Secreto del webhook</Label><Input name="webhookSecret" defaultValue={lsConfig.webhookSecret || ''} /></div>
              <div className="space-y-2"><Label>URL de éxito</Label><Input name="successUrl" defaultValue={lsConfig.successUrl || ''} /></div>
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

      <Card>
        <CardHeader>
          <CardTitle>Pago offline / manual</CardTitle>
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
            <Button type="submit">Guardar pago manual</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
