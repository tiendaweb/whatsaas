import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSitesRequestContext } from '@/lib/plugins/sites/server/auth';
import { createSite, listSites } from '@/lib/plugins/sites/server/service';

export const dynamic = 'force-dynamic';

const createSiteSchema = z.object({
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().max(80).nullable().optional(),
  slug: z.string().trim().max(63).optional(),
});

export async function GET() {
  const ctx = await getSitesRequestContext('sitesRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  return NextResponse.json(await listSites(ctx.team.id));
}

export async function POST(request: Request) {
  const ctx = await getSitesRequestContext('sitesWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const parsed = createSiteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Ingresá un nombre válido para el sitio.' }, { status: 400 });
  }

  try {
    const site = await createSite({
      teamId: ctx.team.id,
      userId: ctx.user.id,
      name: parsed.data.name,
      category: parsed.data.category,
      requestedSlug: parsed.data.slug,
    });
    return NextResponse.json(site, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo crear el sitio.';
    return NextResponse.json({ error: message }, { status: message.includes('uso') ? 409 : 400 });
  }
}
