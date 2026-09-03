import { inArray } from 'drizzle-orm';
import { db, client } from '../lib/db/drizzle';
import { automations } from '../lib/db/schema';

const AUTOMATION_IDS = [
  166, 167, 168, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181, 182,
];
const LONG_MESSAGE_THRESHOLD = 500;

type NodeLike = { id: string; type: string; data: Record<string, any> };
type EdgeLike = { id: string; source: string; target: string; sourceHandle?: string | null };
type Row = { id: number; name: string; nodes: NodeLike[]; edges: EdgeLike[] };

async function main() {
  const rows = (await db
    .select({ id: automations.id, name: automations.name, nodes: automations.nodes, edges: automations.edges })
    .from(automations)
    .where(inArray(automations.id, AUTOMATION_IDS))) as unknown as Row[];

  const byId = new Map(rows.map((r) => [r.id, r]));

  // --- Collect external entry points (targets of go_to_node "other_flow" jumps) ---
  const externalEntries = new Map<number, Set<string>>(); // automationId -> nodeIds reachable from outside
  for (const r of rows) {
    for (const node of r.nodes) {
      if (node.type === 'go_to_node' && node.data.mode === 'other_flow') {
        const targetAutomationId = Number(node.data.targetAutomationId);
        const targetNodeId = String(node.data.targetNodeId ?? '');
        if (!targetNodeId) continue;
        if (!externalEntries.has(targetAutomationId)) externalEntries.set(targetAutomationId, new Set());
        externalEntries.get(targetAutomationId)!.add(targetNodeId);
      }
    }
  }

  let totalProblems = 0;

  for (const r of rows) {
    console.log(`\n=== ${r.name} (#${r.id}) — ${r.nodes.length} nodos, ${r.edges.length} aristas ===`);

    const nodesById = new Map(r.nodes.map((n) => [n.id, n]));
    const outgoing = new Map<string, EdgeLike[]>();
    for (const e of r.edges) {
      if (!outgoing.has(e.source)) outgoing.set(e.source, []);
      outgoing.get(e.source)!.push(e);
    }

    const startNode = r.nodes.find((n) => n.type === 'start');
    const entryIds = new Set<string>([startNode!.id, ...(externalEntries.get(r.id) ?? [])]);

    // Reachability (BFS from every known entry point).
    const reachable = new Set<string>();
    const queue = [...entryIds];
    while (queue.length) {
      const id = queue.shift()!;
      if (reachable.has(id)) continue;
      reachable.add(id);
      for (const e of outgoing.get(id) ?? []) queue.push(e.target);
    }
    const orphans = r.nodes.filter((n) => n.type !== 'sticky_note' && !reachable.has(n.id));
    if (orphans.length) {
      totalProblems += orphans.length;
      console.log(`  ⚠ NODOS HUÉRFANOS (${orphans.length}): ${orphans.map((n) => n.id).join(', ')}`);
    }

    // Dead ends: non-terminal node types with zero outgoing edges.
    const deadEnds = r.nodes.filter(
      (n) => n.type !== 'end' && n.type !== 'go_to_node' && n.type !== 'sticky_note' && (outgoing.get(n.id) ?? []).length === 0,
    );
    if (deadEnds.length) {
      totalProblems += deadEnds.length;
      console.log(`  ⚠ CALLEJONES SIN SALIDA (${deadEnds.length}): ${deadEnds.map((n) => n.id).join(', ')}`);
    }

    // Loops without escape: Tarjan SCC, flag SCCs with size>1 (or self-loop) with no edge leaving the SCC.
    const sccs = tarjanSCC(r.nodes.map((n) => n.id), outgoing);
    for (const scc of sccs) {
      const sccSet = new Set(scc);
      const hasSelfLoop = scc.length === 1 && (outgoing.get(scc[0]) ?? []).some((e) => e.target === scc[0]);
      if (scc.length === 1 && !hasSelfLoop) continue;
      const hasExit = scc.some((id) => (outgoing.get(id) ?? []).some((e) => !sccSet.has(e.target)));
      if (!hasExit) {
        totalProblems += 1;
        console.log(`  ⚠ LOOP SIN ESCAPE: ${scc.join(' -> ')}`);
      }
    }

    // Long messages.
    for (const n of r.nodes) {
      const label = typeof n.data?.label === 'string' ? n.data.label : null;
      if (label && label.length > LONG_MESSAGE_THRESHOLD) {
        console.log(`  ℹ Mensaje largo (${label.length} caracteres) en ${n.id}`);
      }
    }

    // Transcript from the main entry point (start node), depth-limited, cycle-safe.
    console.log(`  --- Transcripción desde "${startNode!.id}" ---`);
    const lines: string[] = [];
    printTranscript(startNode!.id, nodesById, outgoing, byId, new Set(), lines, '  ');
    console.log(lines.join('\n'));
  }

  console.log(`\nTOTAL PROBLEMAS ESTRUCTURALES: ${totalProblems}`);
  await client.end();
  if (totalProblems > 0) process.exitCode = 1;
}

function tarjanSCC(allIds: string[], outgoing: Map<string, EdgeLike[]>): string[][] {
  let index = 0;
  const indices = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const result: string[][] = [];

  function strongconnect(v: string) {
    indices.set(v, index);
    lowlink.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);

    for (const e of outgoing.get(v) ?? []) {
      const w = e.target;
      if (!indices.has(w)) {
        strongconnect(w);
        lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!));
      } else if (onStack.has(w)) {
        lowlink.set(v, Math.min(lowlink.get(v)!, indices.get(w)!));
      }
    }

    if (lowlink.get(v) === indices.get(v)) {
      const scc: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);
      result.push(scc);
    }
  }

  for (const id of allIds) {
    if (!indices.has(id)) strongconnect(id);
  }
  return result;
}

function printTranscript(
  nodeId: string,
  nodesById: Map<string, NodeLike>,
  outgoing: Map<string, EdgeLike[]>,
  byId: Map<number, Row>,
  visited: Set<string>,
  lines: string[],
  indent: string,
  depth = 0,
) {
  if (depth > 40) {
    lines.push(`${indent}(profundidad máxima alcanzada, corto acá)`);
    return;
  }
  const node = nodesById.get(nodeId);
  if (!node) return;

  if (visited.has(nodeId)) {
    lines.push(`${indent}↩ (vuelve a "${nodeId}", ya mostrado)`);
    return;
  }
  const pathVisited = new Set(visited);
  pathVisited.add(nodeId);

  const edges = outgoing.get(nodeId) ?? [];

  switch (node.type) {
    case 'start':
      if (edges[0]) printTranscript(edges[0].target, nodesById, outgoing, byId, pathVisited, lines, indent, depth + 1);
      return;
    case 'message':
      lines.push(`${indent}Bot: ${oneLine(node.data.label)}`);
      if (edges[0]) printTranscript(edges[0].target, nodesById, outgoing, byId, pathVisited, lines, indent, depth + 1);
      return;
    case 'media':
      lines.push(`${indent}Bot: [imagen] ${oneLine(node.data.caption ?? '')}`);
      if (edges[0]) printTranscript(edges[0].target, nodesById, outgoing, byId, pathVisited, lines, indent, depth + 1);
      return;
    case 'collect':
      lines.push(`${indent}Bot: ${oneLine(node.data.label)}`);
      lines.push(`${indent}Usuario: (respuesta libre → {{${node.data.variable}}})`);
      if (edges[0]) printTranscript(edges[0].target, nodesById, outgoing, byId, pathVisited, lines, indent, depth + 1);
      return;
    case 'form':
      lines.push(`${indent}Bot: [formulario] ${(node.data.fields ?? []).map((f: any) => f.label).join(' / ')}`);
      if (edges[0]) printTranscript(edges[0].target, nodesById, outgoing, byId, pathVisited, lines, indent, depth + 1);
      return;
    case 'delay':
      lines.push(`${indent}(espera ${node.data.seconds}s)`);
      if (edges[0]) printTranscript(edges[0].target, nodesById, outgoing, byId, pathVisited, lines, indent, depth + 1);
      return;
    case 'save_contact':
      lines.push(`${indent}(sistema: guarda contacto${node.data.nameVariable ? ` nombre=${node.data.nameVariable}` : ''})`);
      if (edges[0]) printTranscript(edges[0].target, nodesById, outgoing, byId, pathVisited, lines, indent, depth + 1);
      return;
    case 'ai_control':
      lines.push(`${indent}(sistema: IA ${node.data.action === 'paused' ? 'pausada' : 'activa'})`);
      if (edges[0]) printTranscript(edges[0].target, nodesById, outgoing, byId, pathVisited, lines, indent, depth + 1);
      return;
    case 'end':
      lines.push(`${indent}(fin — ${node.data.disableAutomation ? 'requiere reactivación manual' : 'recuperable'})`);
      return;
    case 'go_to_node': {
      const targetAutomation = byId.get(Number(node.data.targetAutomationId));
      lines.push(`${indent}→ deriva a "${targetAutomation?.name ?? node.data.targetAutomationId}" · nodo "${node.data.targetNodeId}"`);
      return;
    }
    case 'sticky_note':
      return;
    case 'menu_simple': {
      lines.push(`${indent}Bot: ${oneLine(node.data.label)}`);
      const options: Array<{ id: string; text: string }> = node.data.menuOptions ?? [];
      for (const opt of options) {
        const edge = edges.find((e) => e.sourceHandle === `menu-${opt.id}`);
        lines.push(`${indent}  Usuario elige: "${opt.text}"`);
        if (edge) printTranscript(edge.target, nodesById, outgoing, byId, pathVisited, lines, indent + '    ', depth + 1);
      }
      const fallbackEdge = edges.find((e) => e.sourceHandle === 'fallback');
      if (fallbackEdge) {
        if (fallbackEdge.target === nodeId) {
          lines.push(`${indent}  Usuario: (respuesta no reconocida) → repite el mismo menú`);
        } else {
          lines.push(`${indent}  Usuario: (respuesta no reconocida)`);
          printTranscript(fallbackEdge.target, nodesById, outgoing, byId, pathVisited, lines, indent + '    ', depth + 1);
        }
      }
      return;
    }
    case 'condition': {
      lines.push(`${indent}Bot: [evalúa condición] ${oneLine(node.data.label ?? '')}`);
      const conditions: Array<{ id: string; label?: string }> = node.data.conditions ?? [];
      for (const cond of conditions) {
        const edge = edges.find((e) => e.sourceHandle === cond.id);
        lines.push(`${indent}  Rama: ${cond.label ?? cond.id}`);
        if (edge) printTranscript(edge.target, nodesById, outgoing, byId, pathVisited, lines, indent + '    ', depth + 1);
      }
      const fallbackEdge = edges.find((e) => e.sourceHandle === 'fallback');
      if (fallbackEdge) {
        lines.push(`${indent}  Rama: fallback`);
        printTranscript(fallbackEdge.target, nodesById, outgoing, byId, pathVisited, lines, indent + '    ', depth + 1);
      }
      return;
    }
    default:
      lines.push(`${indent}(nodo tipo ${node.type}: ${nodeId})`);
      if (edges[0]) printTranscript(edges[0].target, nodesById, outgoing, byId, pathVisited, lines, indent, depth + 1);
  }
}

function oneLine(text: string): string {
  return String(text ?? '').replace(/\n+/g, ' ⏎ ').slice(0, 300);
}

main().catch((error) => {
  console.error('ERROR', error);
  process.exitCode = 1;
});
