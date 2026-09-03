import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamDesktopPreferences } from '@/lib/db/schema';
import {
  DEFAULT_DESKTOP_LAYOUT,
  DEFAULT_VISIBLE_WIDGETS,
  DESKTOP_PERIOD_IDS,
  DESKTOP_WIDGET_IDS,
  HEADER_POSITIONS,
  type DesktopLayout,
  type DesktopPeriodId,
  type DesktopWidgetId,
  type HeaderPosition,
} from './types';

const knownWidgets = new Set<string>(DESKTOP_WIDGET_IDS);

function validWidgets(value: unknown): DesktopWidgetId[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is DesktopWidgetId => typeof item === 'string' && knownWidgets.has(item)))];
}

export function normalizeDesktopLayout(value: unknown): DesktopLayout {
  const input = value && typeof value === 'object' ? value as Partial<DesktopLayout> : {};
  const savedOrder = validWidgets(input.order);
  const order = [...savedOrder, ...DESKTOP_WIDGET_IDS.filter((id) => !savedOrder.includes(id))];

  // Migración v1 → v2. Un layout viejo no conoce los widgets del rediseño, así
  // que aparecerían al final y ocultos por la regla de abajo; se los muestra
  // igual que a un usuario nuevo, y se le respetan los widgets viejos que tenía
  // visibles. Sin esto, quien ya usaba el Escritorio abriría una pantalla vacía.
  const isLegacy = input.version !== 2;
  const savedHidden = validWidgets(input.hidden);
  const hidden = isLegacy
    ? savedHidden.filter((id) => !(DEFAULT_VISIBLE_WIDGETS as readonly string[]).includes(id))
    : savedHidden;

  const pinned = validWidgets(input.pinned).filter((id) => !hidden.includes(id));

  const headerPosition: HeaderPosition =
    typeof input.headerPosition === 'string' &&
    (HEADER_POSITIONS as readonly string[]).includes(input.headerPosition)
      ? (input.headerPosition as HeaderPosition)
      : DEFAULT_DESKTOP_LAYOUT.headerPosition;

  const period: DesktopPeriodId =
    typeof input.period === 'string' &&
    (DESKTOP_PERIOD_IDS as readonly string[]).includes(input.period)
      ? (input.period as DesktopPeriodId)
      : DEFAULT_DESKTOP_LAYOUT.period;

  return { version: 2, order, pinned, hidden, headerPosition, period };
}

export async function getDesktopLayout(teamId: number, userId: number): Promise<DesktopLayout> {
  const row = await db.query.teamDesktopPreferences.findFirst({
    where: and(eq(teamDesktopPreferences.teamId, teamId), eq(teamDesktopPreferences.userId, userId)),
    columns: { layout: true },
  });
  return row ? normalizeDesktopLayout(row.layout) : DEFAULT_DESKTOP_LAYOUT;
}

export async function saveDesktopLayout(teamId: number, userId: number, value: unknown): Promise<DesktopLayout> {
  const layout = normalizeDesktopLayout(value);
  await db.insert(teamDesktopPreferences).values({ teamId, userId, layout }).onConflictDoUpdate({
    target: [teamDesktopPreferences.teamId, teamDesktopPreferences.userId],
    set: { layout, updatedAt: new Date() },
  });
  return layout;
}
