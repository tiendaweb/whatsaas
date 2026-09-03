import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getUserPermissionContext } from '@/lib/auth/permissions-guard';
import { getSuggestionsForItems } from '@/lib/desktop/command-center/suggestions';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  itemIds: z
    .array(z.string().regex(/^(chat|task|membership|deal|event):\d+$/))
    .min(1)
    .max(12),
});

export async function POST(request: NextRequest) {
  const context = await getUserPermissionContext();
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });

  try {
    // 200 siempre: un equipo sin IA recibe `unavailable`, no un error que deje
    // la bandeja sin poder trabajar.
    return NextResponse.json({ suggestions: await getSuggestionsForItems(context, parsed.data.itemIds) });
  } catch (error) {
    console.error('[command-center] sugerencias failed', { teamId: context.teamId, error });
    return NextResponse.json({ suggestions: {} });
  }
}
