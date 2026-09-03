import { and, eq } from 'drizzle-orm';
import { db, client } from '../lib/db/drizzle';
import { automations } from '../lib/db/schema';
import { prepareAutomationFlowForSave } from '../lib/automation/flow-normalizer';

const TEAM_ID = 4;
const IDS = { inicio: 77, catalogo: 78, asesoramiento: 79 };

type NodeLike = { id: string; type: string; position: { x: number; y: number }; data: Record<string, any> };
type EdgeLike = { id: string; source: string; target: string; sourceHandle?: string | null };

async function main() {
  console.log('Alineando navegación de Asesoramiento AZ Indumentaria (catálogo aplanado + volver al menú)...');

  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ nodes: automations.nodes, edges: automations.edges })
      .from(automations)
      .where(and(eq(automations.id, IDS.asesoramiento), eq(automations.teamId, TEAM_ID)));

    let nodes = row.nodes as NodeLike[];
    let edges = row.edges as EdgeLike[];

    // 1. Fix the stale reference to the old (now-removed) grouped catalog entry.
    nodes = nodes.map((n) =>
      n.id === 'goto-catalogo' ? { ...n, data: { ...n.data, targetNodeId: 'menu-categorias' } } : n,
    );

    // 2. Replace the dead-end "Listo, gracias" with a way back to the main menu.
    nodes = nodes
      .filter((n) => n.id !== 'end-listo')
      .concat([{
        id: 'goto-menu-principal', type: 'go_to_node', position: { x: 1920, y: 180 },
        data: { mode: 'other_flow', targetAutomationId: IDS.inicio, targetNodeId: 'menu-main', fallbackAction: 'stop' },
      }]);

    const menuSiguiente = nodes.find((n) => n.id === 'menu-siguiente')!;
    menuSiguiente.data.menuOptions = (menuSiguiente.data.menuOptions as Array<{ id: string; text: string }>).map((opt) =>
      opt.id === 'listo' ? { id: 'menu', text: 'Volver al menú principal' } : opt,
    );

    edges = edges.map((e) =>
      e.source === 'menu-siguiente' && e.sourceHandle === 'menu-listo'
        ? { ...e, sourceHandle: 'menu-menu', target: 'goto-menu-principal' }
        : e,
    );

    const prepared = prepareAutomationFlowForSave({ nodes: nodes as never[], edges: edges as never[] });
    if (!prepared.success) throw new Error(prepared.errors.join('; '));

    await tx.update(automations)
      .set({ nodes: prepared.nodes, edges: prepared.edges, updatedAt: new Date() })
      .where(and(eq(automations.id, IDS.asesoramiento), eq(automations.teamId, TEAM_ID)));

    console.log(`  ✓ Asesoramiento AZ Indumentaria (#${IDS.asesoramiento}) actualizado: ${prepared.nodes.length} nodos.`);
  });

  console.log('Listo.');
}

main()
  .catch((error) => { console.error('ERROR', error); process.exitCode = 1; })
  .finally(async () => { await client.end(); });
