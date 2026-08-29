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
