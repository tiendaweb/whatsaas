import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { getPluginsAdminData, saveTeamPluginAction } from './actions';
import { MarketplaceAIGenerator } from './marketplace/MarketplaceAIGenerator';

type PageProps = {
  searchParams: Promise<{ teamId?: string }>;
};

export default async function AdminPluginsPage({ searchParams }: PageProps) {
  const { teamId } = await searchParams;
  const parsedTeamId = teamId ? Number(teamId) : undefined;
  const data = await getPluginsAdminData(parsedTeamId);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Plugins</h1>

      <Card>
        <CardHeader>
          <CardTitle>Seleccionar equipo</CardTitle>
        </CardHeader>
        <CardContent>
          <form method="GET" className="max-w-xs space-y-2">
            <Label htmlFor="teamId">Team</Label>
            <select
              id="teamId"
              name="teamId"
              defaultValue={String(data.selectedTeamId ?? '')}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {data.teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
            <Button type="submit" variant="outline">Cambiar equipo</Button>
          </form>
        </CardContent>
      </Card>

      {data.error && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-destructive">Error cargando plugins</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{data.error}</p>
          </CardContent>
        </Card>
      )}

      {data.plugins.map(({ manifest, state }) => (
        <Card key={manifest.id}>
          <CardHeader>
            <CardTitle>{manifest.displayName}</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={saveTeamPluginAction} className="space-y-4">
              <input type="hidden" name="teamId" value={data.selectedTeamId ?? ''} />
              <input type="hidden" name="pluginId" value={manifest.id} />

              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="font-medium">Habilitado</p>
                  <p className="text-xs text-muted-foreground">Instalado: {state.installed ? 'Sí' : 'No'}</p>
                </div>
                <Switch name="enabled" defaultChecked={state.enabled} />
              </div>

              <div className="space-y-2">
                <Label htmlFor={`settings-${manifest.id}`}>Settings (JSON)</Label>
                <Textarea
                  id={`settings-${manifest.id}`}
                  name="settings"
                  className="font-mono min-h-28"
                  defaultValue={JSON.stringify(state.settings, null, 2)}
                />
              </div>

              <div className="space-y-2 text-xs text-muted-foreground">
                <p>Scopes: {manifest.scopes.join(', ')}</p>
                <p>Feature flags: {manifest.featureFlags.join(', ') || 'N/A'}</p>
                <p>Rutas: {manifest.routes.map((route) => route.path).join(', ') || 'N/A'}</p>
              </div>

              <Button type="submit">Guardar plugin</Button>
            </form>
          </CardContent>
        </Card>
      ))}


      <MarketplaceAIGenerator selectedTeamId={data.selectedTeamId} />
    </div>
  );
}
