import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { resolveActivePluginsForTeam } from '@/lib/plugins/core/registry';
import { FILE_TYPES, listChatFiles } from '@/lib/plugins/files/server/files';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  q: z.string().trim().max(160).optional(),
  type: z.enum(FILE_TYPES).optional(),
  chatId: z.coerce.number().int().positive().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  sort: z.enum(['newest', 'oldest', 'largest', 'smallest']).default('newest'),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(12).max(100).default(48),
});

export async function GET(request: NextRequest) {
  try {
    const ctx = await getPluginRequestContext('filesRead');
    if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

    const activePlugins = await resolveActivePluginsForTeam(ctx.team.id, ctx.user.id);
    if (!activePlugins.some((plugin) => plugin.pluginId === 'files')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid query', details: parsed.error.issues }, { status: 400 });
    }

    const data = await listChatFiles({ teamId: ctx.team.id, query: parsed.data.q, ...parsed.data });
    return NextResponse.json(data);
  } catch (error) {
    console.error('[plugins/files GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
