import { NextResponse } from 'next/server';
import { puertaDevCenter } from '@/lib/plugins/dev-center/server/puerta';
import { listMissions, missionCounts } from '@/lib/plugins/dev-center/server/missions';
import { listDevPrompts } from '@/lib/plugins/dev-center/server/prompts';
import { MISSION_STATUS_META } from '@/lib/plugins/dev-center/shared/types';
import { terminalRegistry } from '@/lib/terminal/access';

export const dynamic = 'force-dynamic';

/**
 * Todo lo que la pantalla necesita en una sola llamada: proyectos del
 * registro (sin nada que no sea público para quien ya está adentro), agentes,
 * biblioteca de prompts, misiones abiertas, las últimas cerradas y los
 * contadores por estado.
 */
export async function GET() {
  const p = await puertaDevCenter();
  if (!p.ok) return p.error;
  try {
    const registry = terminalRegistry();
    const [prompts, missions, history, counts] = await Promise.all([
      listDevPrompts(p.teamId),
      listMissions(p.teamId, { status: 'open', limit: 200 }),
      listMissions(p.teamId, { status: 'all', limit: 500 }).then((all) => all.filter((m) => !MISSION_STATUS_META[m.status].abierta).slice(0, 30)),
      missionCounts(p.teamId),
    ]);
    return NextResponse.json({
      me: p.user,
      projects: registry.projects.map(({ slug, name, cwd, stack, productionUrl, defaultBranch, agents, defaultAgent, maxSessions, commands }) => ({ slug, name, cwd, stack, productionUrl, defaultBranch, agents, defaultAgent, maxSessions, commands })),
      agents: registry.agents,
      prompts,
      missions,
      history,
      counts,
    });
  } catch (error) {
    console.error('[dev-center GET]', error);
    return NextResponse.json({ error: 'No se pudo cargar el Centro de Desarrollo.' }, { status: 500 });
  }
}
