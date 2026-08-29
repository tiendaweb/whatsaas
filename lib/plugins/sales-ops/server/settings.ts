import { db } from '@/lib/db/drizzle';
import { teamPlugins } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import manifest, { type SalesOpsSettings } from '../manifest';
import { SALES_OPS_PLUGIN_ID } from '../shared/taxonomy';

/** Settings del plugin con defaults del manifest. Tolerante a filas sin settings. */
export async function getSalesOpsSettings(teamId: number): Promise<SalesOpsSettings> {
  const row = await db.query.teamPlugins.findFirst({
    where: and(eq(teamPlugins.teamId, teamId), eq(teamPlugins.pluginId, SALES_OPS_PLUGIN_ID)),
    columns: { settings: true },
  });
  const parsed = manifest.settingsSchema.safeParse(row?.settings ?? {});
  return parsed.success ? parsed.data : manifest.settingsSchema.parse({});
}

/** Guarda un parche de settings del plugin (merge superficial), validado con el schema del manifest. */
export async function patchSalesOpsSettings(teamId: number, userId: number, patch: Partial<SalesOpsSettings>): Promise<SalesOpsSettings> {
  const current = await getSalesOpsSettings(teamId);
  const next = manifest.settingsSchema.parse({ ...current, ...patch });
  const existing = await db.query.teamPlugins.findFirst({
    where: and(eq(teamPlugins.teamId, teamId), eq(teamPlugins.pluginId, SALES_OPS_PLUGIN_ID)),
    columns: { id: true, settings: true },
  });
  if (existing) {
    await db.update(teamPlugins).set({ settings: { ...(existing.settings ?? {}), ...next }, updatedAt: new Date() }).where(eq(teamPlugins.id, existing.id));
  } else {
    await db.insert(teamPlugins).values({ teamId, pluginId: SALES_OPS_PLUGIN_ID, installed: true, enabled: true, settings: next, installedBy: userId });
  }
  return next;
}
