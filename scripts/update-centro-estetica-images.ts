import { and, eq } from 'drizzle-orm';
import { db, client } from '../lib/db/drizzle';
import { automations } from '../lib/db/schema';
import { prepareAutomationFlowForSave } from '../lib/automation/flow-normalizer';

const TEAM_ID = 4;

const IDS = {
  inicio: 92, facial: 94, corporal: 95, depilacion: 96, unas: 97, bienestar: 98, reservas: 100,
};

// Pexels stock photos, free for commercial use, no attribution required. Verified HTTP 200 / image/jpeg.
const IMG = {
  hero: 'https://images.pexels.com/photos/7031704/pexels-photo-7031704.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1',
  facial: 'https://images.pexels.com/photos/7446659/pexels-photo-7446659.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1',
  corporal: 'https://images.pexels.com/photos/6628701/pexels-photo-6628701.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1',
  depilacion: 'https://images.pexels.com/photos/3985354/pexels-photo-3985354.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1',
  unas: 'https://images.pexels.com/photos/4677845/pexels-photo-4677845.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1',
  bienestar: 'https://images.pexels.com/photos/5240636/pexels-photo-5240636.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1',
};

type NodeLike = { id: string; type: string; position: { x: number; y: number }; data: Record<string, any> };
type EdgeLike = { id: string; source: string; target: string; sourceHandle?: string | null };

async function loadFlow(tx: any, id: number) {
  const [row] = await tx
    .select({ nodes: automations.nodes, edges: automations.edges })
    .from(automations)
    .where(and(eq(automations.id, id), eq(automations.teamId, TEAM_ID)));
  return { nodes: row.nodes as NodeLike[], edges: row.edges as EdgeLike[] };
}

async function saveFlow(tx: any, id: number, nodes: NodeLike[], edges: EdgeLike[], label: string) {
  const prepared = prepareAutomationFlowForSave({ nodes: nodes as never[], edges: edges as never[] });
  if (!prepared.success) throw new Error(`${label}: ${prepared.errors.join('; ')}`);
  await tx.update(automations)
    .set({ nodes: prepared.nodes, edges: prepared.edges, updatedAt: new Date() })
    .where(and(eq(automations.id, id), eq(automations.teamId, TEAM_ID)));
  console.log(`  ✓ ${label} (#${id}): ${prepared.nodes.length} nodos.`);
}

function insertNodeBetween(
  nodes: NodeLike[], edges: EdgeLike[],
  fromId: string, toId: string, newNode: NodeLike,
): { nodes: NodeLike[]; edges: EdgeLike[] } {
  const newEdges = edges.map((e) =>
    e.source === fromId && e.target === toId ? { ...e, target: newNode.id } : e,
  );
  newEdges.push({ id: `edge-${newNode.id}-to-${toId}`, source: newNode.id, target: toId, sourceHandle: null });
  return { nodes: [...nodes, newNode], edges: newEdges };
}

async function main() {
  console.log('Sumando imágenes reales a Centro de Estética y puliendo el texto de confirmación de Reservas...');

  await db.transaction(async (tx) => {
    // Inicio: start -> [media-hero] -> msg-welcome
    {
      const { nodes, edges } = await loadFlow(tx, IDS.inicio);
      const mediaNode: NodeLike = {
        id: 'media-hero', type: 'media', position: { x: 160, y: 0 },
        data: { mediaType: 'image', mediaUrl: IMG.hero, caption: 'Nuestro espacio, pensado para que te relajes desde que llegás ✨' },
      };
      const updated = insertNodeBetween(nodes, edges, 'start', 'msg-welcome', mediaNode);
      await saveFlow(tx, IDS.inicio, updated.nodes, updated.edges, 'Inicio Centro de Estética');
    }

    // Each specialty: msg-intro -> [media-intro] -> menu-services
    const specialtyImages: Array<[keyof typeof IDS, string, string]> = [
      ['facial', IMG.facial, 'Uno de nuestros tratamientos faciales en curso ✨'],
      ['corporal', IMG.corporal, 'Sesión de masaje corporal en nuestro centro 🧖'],
      ['depilacion', IMG.depilacion, 'Depilación con tecnología láser 🌿'],
      ['unas', IMG.unas, 'Manicuría profesional en proceso 💅'],
      ['bienestar', IMG.bienestar, 'Un momento de relax en nuestro circuito de bienestar 🕯️'],
    ];
    for (const [key, url, caption] of specialtyImages) {
      const id = IDS[key];
      const { nodes, edges } = await loadFlow(tx, id);
      const mediaNode: NodeLike = {
        id: 'media-intro', type: 'media', position: { x: 160, y: 0 },
        data: { mediaType: 'image', mediaUrl: url, caption },
      };
      const updated = insertNodeBetween(nodes, edges, 'msg-intro', 'menu-services', mediaNode);
      await saveFlow(tx, id, updated.nodes, updated.edges, `Especialidad (${key})`);
    }

    // Reservas: tidy up "... ✨." -> "... ✨" (emoji followed by a stray period reads oddly).
    {
      const { nodes, edges } = await loadFlow(tx, IDS.reservas);
      const updatedNodes = nodes.map((n) =>
        n.id.startsWith('msg-confirm-') && typeof n.data.label === 'string'
          ? { ...n, data: { ...n.data, label: n.data.label.replace(/\s*\.\s*$/, '') } }
          : n,
      );
      await saveFlow(tx, IDS.reservas, updatedNodes, edges, 'Reservas Centro de Estética');
    }
  });

  console.log('Listo.');
}

main()
  .catch((error) => { console.error('ERROR', error); process.exitCode = 1; })
  .finally(async () => { await client.end(); });
