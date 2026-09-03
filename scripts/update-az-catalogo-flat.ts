import { and, eq } from 'drizzle-orm';
import { db, client } from '../lib/db/drizzle';
import { automations } from '../lib/db/schema';
import { prepareAutomationFlowForSave } from '../lib/automation/flow-normalizer';

const TEAM_ID = 4;
const STORE_URL = 'https://tiendaweb.uno/store/az';

const IDS = { inicio: 77, catalogo: 78, asesoramiento: 79, reservas: 80, postventa: 81 };

const CATEGORY_LINK = (name: string) => `${STORE_URL}/categorie/${encodeURIComponent(name)}`;

// Flat list of 10 options (menu_simple hard cap). "Remeras" and "Remera Manga
// Larga" are merged into a single option that sends both links, so the whole
// men's catalog still fits without a second filtering step.
type CategoryLink = { name: string; label?: string };

const CATEGORIES_FLAT: Array<{ id: string; text: string; blurb: string; links: CategoryLink[] }> = [
  { id: 'camperas', text: 'Camperas', blurb: '🧥 Camperas para el frío porteño, desde acolchadas hasta con capucha.', links: [{ name: 'Camperas' }] },
  { id: 'chalecos', text: 'Chalecos', blurb: '🦺 Chalecos ideales para combinar en las estaciones intermedias.', links: [{ name: 'Chalecos' }] },
  { id: 'buzos', text: 'Buzos', blurb: '👕 Buzos y hoodies premium, básicos y estampados.', links: [{ name: 'Buzos' }] },
  { id: 'pijamas', text: 'Pijamas de hombre', blurb: '🌙 Pijamas súper frizados para estar cómodo en casa.', links: [{ name: 'Pijamas de Hombre' }] },
  { id: 'termicas', text: 'Camisetas térmicas', blurb: '🔥 Camisetas térmicas para las noches más frías.', links: [{ name: 'Camisetas Térmicas de Hombre' }] },
  {
    id: 'remeras', text: 'Remeras (manga corta y larga)',
    blurb: '👕 Remeras en varios colores, manga corta y larga, el básico que no puede faltar.',
    links: [{ name: 'Remeras', label: 'Manga corta' }, { name: 'Remera Manga Larga de Hombre', label: 'Manga larga' }],
  },
  { id: 'joggins', text: 'Joggins', blurb: '🏃 Joggins premium, comodidad para el día a día.', links: [{ name: 'Joggins' }] },
  { id: 'bombacha', text: 'Bombacha de campo', blurb: '🤠 Bombachas de campo, el clásico que nunca pasa de moda.', links: [{ name: 'Bombacha de Campo' }] },
  { id: 'chino', text: 'Pantalón chino premium', blurb: '👖 Pantalones chinos premium para un look prolijo.', links: [{ name: 'Pantalón Chino Premium de Hombre' }] },
  { id: 'cargo', text: 'Pantalones cargo', blurb: '🎒 Pantalones cargo con bolsillos, estilo urbano.', links: [{ name: 'Pantalones Cargos' }] },
];

type NodeLike = { id: string; type: string; position: { x: number; y: number }; data: Record<string, unknown> };
type EdgeLike = { id: string; source: string; target: string; sourceHandle?: string | null };
type Flow = { nodes: NodeLike[]; edges: EdgeLike[] };

const slug = (value: string) =>
  value.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

class FlowBuilder {
  nodes: NodeLike[] = [];
  edges: EdgeLike[] = [];
  private edgeIndex = 0;
  node(id: string, type: string, data: Record<string, unknown>, x: number, y: number) {
    this.nodes.push({ id, type, data, position: { x, y } });
    return id;
  }
  edge(source: string, target: string, sourceHandle?: string) {
    this.edgeIndex += 1;
    this.edges.push({ id: `edge-${slug(source)}-${slug(sourceHandle ?? 'default')}-${slug(target)}-${this.edgeIndex}`, source, target, sourceHandle: sourceHandle ?? null });
  }
  menu(id: string, label: string, options: Array<{ id: string; text: string; target: string }>, x: number, y: number, fallbackTarget?: string) {
    this.node(id, 'menu_simple', {
      label, markerStyle: 'emoji_number', globalDelaySeconds: 0,
      menuOptions: options.map((option) => ({ id: option.id, text: option.text })),
    }, x, y);
    for (const option of options) this.edge(id, option.target, `menu-${option.id}`);
    this.edge(id, fallbackTarget ?? id, 'fallback');
    return id;
  }
  flow(): Flow { return { nodes: this.nodes, edges: this.edges }; }
}

function buildCatalogoFlat(): Flow {
  const fb = new FlowBuilder();
  fb.node('start', 'start', { label: 'Start (interno)', triggerType: 'fallback', keywords: [], conditions: {} }, 0, 0);
  fb.edge('start', 'menu-categorias');

  fb.node('menu-more', 'menu_simple', {
    label: '¿Te ayudo con algo más?',
    markerStyle: 'emoji_number',
    menuOptions: [
      { id: 'otra', text: 'Ver otra categoría' },
      { id: 'reservar', text: 'Reservar turno para probador' },
      { id: 'menu', text: 'Volver al menú principal' },
    ],
  }, 1920, 0);
  fb.edge('menu-more', 'menu-categorias', 'menu-otra');
  fb.node('goto-reservas', 'go_to_node', { mode: 'other_flow', targetAutomationId: IDS.reservas, targetNodeId: 'menu-ya-elegiste', fallbackAction: 'stop' }, 2240, -60);
  fb.edge('menu-more', 'goto-reservas', 'menu-reservar');
  fb.node('goto-menu-principal', 'go_to_node', { mode: 'other_flow', targetAutomationId: IDS.inicio, targetNodeId: 'menu-main', fallbackAction: 'stop' }, 2240, 60);
  fb.edge('menu-more', 'goto-menu-principal', 'menu-menu');
  fb.edge('menu-more', 'menu-more', 'fallback');

  CATEGORIES_FLAT.forEach((cat, index) => {
    const nodeId = `msg-cat-${cat.id}`;
    const linksText = cat.links
      .map((l) => (l.label ? `${l.label}: ${CATEGORY_LINK(l.name)}` : CATEGORY_LINK(l.name)))
      .join('\n');
    fb.node(nodeId, 'message', {
      label: `${cat.blurb}\n\n👉 ${linksText}\n\n🛍️ Ver todo el catálogo: ${STORE_URL}`,
    }, 1280, index * 90 - (CATEGORIES_FLAT.length * 45));
    fb.edge(nodeId, 'menu-more');
  });

  fb.menu('menu-categorias', '¿Qué tipo de prenda estás buscando?', CATEGORIES_FLAT.map((c) => ({
    id: c.id, text: c.text, target: `msg-cat-${c.id}`,
  })), 640, 0);

  return fb.flow();
}

function patchGotoCatalogoTarget(flow: Flow): Flow {
  const nodes = flow.nodes.map((node) =>
    node.id === 'goto-catalogo'
      ? { ...node, data: { ...node.data, targetNodeId: 'menu-categorias' } }
      : node,
  );
  return { nodes, edges: flow.edges };
}

function validatePrepared(name: string, flow: Flow) {
  const prepared = prepareAutomationFlowForSave({ nodes: flow.nodes as never[], edges: flow.edges as never[] });
  if (!prepared.success) throw new Error(`${name}: ${prepared.errors.join('; ')}`);
  const ids = new Set(prepared.nodes.map((node) => node.id));
  for (const edge of prepared.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) {
      throw new Error(`${name}: arista inválida ${edge.id} (${edge.source} -> ${edge.target})`);
    }
  }
  return { nodes: prepared.nodes, edges: prepared.edges };
}

async function main() {
  console.log('Aplanando el catálogo de AZ Indumentaria (sin doble filtro) y actualizando referencias...');

  await db.transaction(async (tx) => {
    // 1. Rebuild Catálogo with the flat menu.
    const catalogoFlow = validatePrepared('Catálogo AZ Indumentaria', buildCatalogoFlat());
    await tx.update(automations).set({ nodes: catalogoFlow.nodes, edges: catalogoFlow.edges, updatedAt: new Date() })
      .where(and_(IDS.catalogo));
    console.log(`  ✓ Catálogo AZ Indumentaria (#${IDS.catalogo}) reconstruido: ${catalogoFlow.nodes.length} nodos.`);

    // 2. Patch the "goto-catalogo" node in Inicio and Asesoramiento to point at the new flat entry node.
    for (const key of ['inicio', 'asesoramiento'] as const) {
      const id = IDS[key];
      const [row] = await tx.select({ nodes: automations.nodes, edges: automations.edges }).from(automations).where(and_(id));
      const patched = patchGotoCatalogoTarget({ nodes: row.nodes as NodeLike[], edges: row.edges as EdgeLike[] });
      const validated = validatePrepared(key, patched);
      await tx.update(automations).set({ nodes: validated.nodes, edges: validated.edges, updatedAt: new Date() })
        .where(and_(id));
      console.log(`  ✓ ${key} (#${id}): referencia a Catálogo actualizada a "menu-categorias".`);
    }
  });

  console.log('Listo.');
}

function and_(id: number) {
  return and(eq(automations.id, id), eq(automations.teamId, TEAM_ID));
}

main()
  .catch((error) => { console.error('ERROR', error); process.exitCode = 1; })
  .finally(async () => { await client.end(); });
