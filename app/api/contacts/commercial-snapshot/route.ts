import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getContactCommercialSnapshot, type SnapshotSection } from '@/lib/contacts/graph';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { resolveActivePluginsForTeam } from '@/lib/plugins/core/registry';
import type { MemberPermissions } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  contactId: z.coerce.number().int().positive().optional(),
  chatId: z.coerce.number().int().positive().optional(),
}).refine((value) => value.contactId != null || value.chatId != null, 'contactId o chatId');

/**
 * Lo comercial del contacto para el panel lateral del chat.
 *
 * El permiso de entrada es `contacts` —el mismo que ya exige el panel—, pero
 * CADA sección se decide aparte: quién no puede ver ventas no recibe la plata
 * aunque pueda ver el chat. Las secciones que no se devuelven salen en
 * `skipped` con el motivo; el panel las oculta en vez de mostrar un cero
 * falso, que es peor que no mostrar nada.
 */
export async function GET(request: NextRequest) {
  const ctx = await getPluginRequestContext('contacts');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const parsed = querySchema.safeParse({
    contactId: request.nextUrl.searchParams.get('contactId') ?? undefined,
    chatId: request.nextUrl.searchParams.get('chatId') ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: 'Falta contactId o chatId' }, { status: 400 });

  const esAdmin = ctx.membership.role === 'owner' || ctx.membership.role === 'admin';
  const permisos = ctx.membership.permissions as MemberPermissions | null;
  const puede = (permiso: keyof Omit<MemberPermissions, 'chatVisibility'>) =>
    esAdmin || permisos?.[permiso] === true;

  const activos = await resolveActivePluginsForTeam(ctx.team.id, ctx.user.id);
  const pluginActivo = (pluginId: string) => activos.some((plugin) => plugin.pluginId === pluginId);

  const razones: Partial<Record<SnapshotSection, string>> = {};
  const seccion = (
    clave: SnapshotSection,
    permiso: keyof Omit<MemberPermissions, 'chatVisibility'>,
    pluginId: string,
  ) => {
    if (!puede(permiso)) {
      razones[clave] = `Sin permiso ${permiso}.`;
      return false;
    }
    if (!pluginActivo(pluginId)) {
      razones[clave] = `La app ${pluginId} no está activa en este equipo.`;
      return false;
    }
    return true;
  };

  const sections = {
    deals: seccion('deals', 'dealsRead', 'deals'),
    money: seccion('money', 'salesRead', 'sales'),
    agenda: seccion('agenda', 'calendarRead', 'calendar'),
    subscriptions: seccion('subscriptions', 'membershipsRead', 'memberships'),
    skippedReasons: razones,
  };

  const snapshot = await getContactCommercialSnapshot(ctx.team.id, parsed.data, sections);
  if (!snapshot) return NextResponse.json({ error: 'Contacto no encontrado' }, { status: 404 });

  return NextResponse.json(snapshot);
}
