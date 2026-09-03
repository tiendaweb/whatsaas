import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  getPluginsAdminData,
  saveSystemPluginAction,
  saveTeamMemberPluginAction,
  saveTeamPluginAction,
} from './actions';
import { MarketplaceAIGenerator } from './marketplace/MarketplaceAIGenerator';

type PageProps = {
  searchParams: Promise<{ teamId?: string }>;
};

function renderSettingsFields(pluginId: string, schema: z.ZodTypeAny, current: Record<string, unknown>) {
  if (!(schema instanceof z.ZodObject)) {
    return null;
  }

  const shape = schema.shape;

  return Object.entries(shape).map(([key, fieldSchema]) => {
    const resolvedSchema =
      fieldSchema instanceof z.ZodDefault ? (fieldSchema._def.innerType as z.ZodTypeAny) : fieldSchema;
    const inputNamePrefix = `settings.${key}`;
    const currentValue = current[key];

    if (resolvedSchema instanceof z.ZodBoolean) {
      const boolValue = typeof currentValue === 'boolean' ? currentValue : false;
      return (
        <div key={`${pluginId}-${key}`} className="flex items-center justify-between rounded-md border p-3">
          <div>
            <p className="font-medium">{key}</p>
            <p className="text-xs text-muted-foreground">Boolean</p>
          </div>
          <Switch name={`${inputNamePrefix}.boolean`} defaultChecked={boolValue} />
        </div>
      );
    }

    if (resolvedSchema instanceof z.ZodEnum) {
      const enumValue = typeof currentValue === 'string' ? currentValue : resolvedSchema.options[0];
      return (
        <div key={`${pluginId}-${key}`} className="space-y-2">
          <Label htmlFor={`${pluginId}-${key}`}>{key}</Label>
          <select
            id={`${pluginId}-${key}`}
            name={`${inputNamePrefix}.string`}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            defaultValue={enumValue}
          >
            {resolvedSchema.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      );
    }

    if (resolvedSchema instanceof z.ZodNumber) {
      const numberValue = typeof currentValue === 'number' ? currentValue : undefined;
      return (
        <div key={`${pluginId}-${key}`} className="space-y-2">
          <Label htmlFor={`${pluginId}-${key}`}>{key}</Label>
          <input
            id={`${pluginId}-${key}`}
            name={`${inputNamePrefix}.number`}
            type="number"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            defaultValue={numberValue}
          />
        </div>
      );
    }

    const textValue = currentValue == null ? '' : String(currentValue);
    return (
      <div key={`${pluginId}-${key}`} className="space-y-2">
        <Label htmlFor={`${pluginId}-${key}`}>{key}</Label>
        <input
          id={`${pluginId}-${key}`}
          name={`${inputNamePrefix}.string`}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          defaultValue={textValue}
        />
      </div>
    );
  });
}

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
            <Label htmlFor="teamId">Equipo</Label>
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

      {data.plugins.map(({ manifest, state }) => {
        const isSystemPlugin = manifest.activationMode === 'system';
        const memberOverrides = data.memberOverrides.filter((item) => item.pluginId === manifest.id);

        return (
          <Card key={manifest.id}>
            <CardHeader>
              <CardTitle>{manifest.displayName}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 lg:grid-cols-2">
                <form action={saveSystemPluginAction} className="space-y-3 rounded-md border p-4">
                  <input type="hidden" name="pluginId" value={manifest.id} />
                  <p className="text-sm font-semibold">Capa sistema (default global)</p>
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <p className="font-medium">Activo por defecto para todos los teams</p>
                      {isSystemPlugin && (
                        <p className="text-xs text-muted-foreground">Plugin de sistema: no se puede desactivar.</p>
                      )}
                    </div>
                    <Switch
                      name="enabledByDefault"
                      defaultChecked={state.systemEnabledByDefault}
                      disabled={isSystemPlugin}
                    />
                  </div>
                  <Button type="submit" variant="outline" disabled={isSystemPlugin}>Guardar capa sistema</Button>
                </form>

                <form action={saveTeamPluginAction} className="space-y-3 rounded-md border p-4">
                  <input type="hidden" name="teamId" value={data.selectedTeamId ?? ''} />
                  <input type="hidden" name="pluginId" value={manifest.id} />
                  <p className="text-sm font-semibold">Capa team (override)</p>

                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <p className="font-medium">Habilitado para este team</p>
                      <p className="text-xs text-muted-foreground">Instalado: {state.installed ? 'Sí' : 'No'}</p>
                    </div>
                    <Switch name="enabled" defaultChecked={state.enabled} disabled={isSystemPlugin} />
                  </div>

                  <div className="space-y-3">{renderSettingsFields(manifest.id, manifest.settingsSchema, state.settings)}</div>

                  <Button type="submit" disabled={isSystemPlugin}>Guardar capa team</Button>
                </form>
              </div>

              <div className="space-y-3 rounded-md border p-4">
                <p className="text-sm font-semibold">Acceso por usuarios</p>
                <p className="text-xs text-muted-foreground">
                  Mapea usuarios del team a plugins sin editar permisos JSON manualmente.
                </p>

                <div className="grid gap-3 md:grid-cols-2">
                  {data.members.map((member) => {
                    const override = memberOverrides.find((item) => item.userId === member.userId);
                    return (
                      <form key={`${manifest.id}-${member.userId}`} action={saveTeamMemberPluginAction} className="rounded-md border p-3 space-y-3">
                        <input type="hidden" name="teamId" value={data.selectedTeamId ?? ''} />
                        <input type="hidden" name="pluginId" value={manifest.id} />
                        <input type="hidden" name="memberUserId" value={member.userId} />
                        <div>
                          <p className="text-sm font-medium">{member.profile?.name ?? member.profile?.email ?? `User #${member.userId}`}</p>
                          <p className="text-xs text-muted-foreground">Rol: {member.role}</p>
                        </div>
                        <div className="flex items-center justify-between rounded-md border p-2">
                          <Label htmlFor={`member-${manifest.id}-${member.userId}`}>Acceso plugin</Label>
                          <Switch
                            id={`member-${manifest.id}-${member.userId}`}
                            name="enabled"
                            defaultChecked={override?.enabled ?? false}
                          />
                        </div>
                        <Button type="submit" variant="secondary" size="sm">Guardar usuario</Button>
                      </form>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2 text-xs text-muted-foreground">
                <p>Activation mode: {manifest.activationMode}</p>
                <p>Scopes: {manifest.scopes.join(', ')}</p>
                <p>Feature flags: {manifest.featureFlags.join(', ') || 'N/A'}</p>
                <p>Rutas: {manifest.routes.map((route) => route.path).join(', ') || 'N/A'}</p>
              </div>
            </CardContent>
          </Card>
        );
      })}

      <MarketplaceAIGenerator selectedTeamId={data.selectedTeamId} />
    </div>
  );
}
