import 'server-only';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { users } from '@/lib/db/schema';
import { isTerminalOperator, terminalRegistry } from '@/lib/terminal/access';
import { rellenarPrompt, type DevPromptRow } from '../shared/types';
import { REGLAS_DE_LA_CASA, listDevPrompts } from './prompts';

/**
 * La biblioteca de prompts del Centro de Desarrollo, expuesta por el protocolo
 * MCP (`prompts/list` y `prompts/get`). Así Claude Desktop los muestra en su
 * menú «+» y Codex los puede pedir por nombre: cada `DevPromptRow` es un
 * prompt `dev.<key>` cuyos `arguments` son las `{{variables}}`.
 *
 * Sólo para el operador de terminales (la persona detrás del conector). Si no
 * lo es, la lista está vacía —no es un error: el cliente simplemente no ve
 * nada—.
 */

const PREFIJO = 'dev.';

export type McpPromptListItem = { name: string; description?: string; arguments?: Array<{ name: string; description?: string; required?: boolean }> };
export type McpPromptGet = { description?: string; messages: Array<{ role: 'user' | 'assistant'; content: { type: 'text'; text: string } }> };

const nombreDe = (p: DevPromptRow) => (p.key.startsWith(PREFIJO) ? p.key : `${PREFIJO}${p.key}`);

async function esOperador(userId: number): Promise<boolean> {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { email: true, deletedAt: true } });
  return isTerminalOperator(user);
}

export async function listMcpPrompts(teamId: number, userId: number): Promise<McpPromptListItem[]> {
  if (!(await esOperador(userId))) return [];
  const prompts = await listDevPrompts(teamId);
  return prompts.map((p) => ({
    name: nombreDe(p),
    description: [p.title, p.description].filter(Boolean).join(' — ').slice(0, 500),
    arguments: p.variables.map((v) => ({ name: v.key, description: v.placeholder ? `${v.label} (ej.: ${v.placeholder})` : v.label, required: false })),
  }));
}

/** La ficha del proyecto por defecto del prompt (o WhatsPro), para que el cliente sepa dónde está parado. */
function fichaProyecto(slug: string | null): string {
  const p = terminalRegistry().projects.find((x) => x.slug === (slug ?? 'whatspro')) ?? terminalRegistry().projects[0];
  if (!p) return '';
  return [
    `PROYECTO: ${p.name} (${p.slug})`,
    `Carpeta: ${p.cwd} · rama por defecto: ${p.defaultBranch} · producción: ${p.productionUrl}`,
    `Stack: ${p.stack}`,
    ...Object.entries(p.commands ?? {}).map(([k, v]) => `Comando ${k}: ${v}`),
  ].join('\n');
}

export async function getMcpPrompt(teamId: number, userId: number, name: string, args: Record<string, unknown>): Promise<McpPromptGet | null> {
  if (!(await esOperador(userId))) return null;
  const prompts = await listDevPrompts(teamId);
  const prompt = prompts.find((p) => nombreDe(p) === name);
  if (!prompt) return null;
  const values: Record<string, string> = {};
  for (const [k, v] of Object.entries(args ?? {})) if (typeof v === 'string') values[k] = v;
  const cuerpo = rellenarPrompt(prompt.body, values);
  // Los prompts de semilla ya empiezan con las reglas; no se repiten.
  const reglas = cuerpo.includes('REGLAS DE LA CASA') ? '' : `\n\n${REGLAS_DE_LA_CASA}`;
  return {
    description: [prompt.title, prompt.description].filter(Boolean).join(' — ').slice(0, 500),
    messages: [{ role: 'user', content: { type: 'text', text: `${cuerpo}\n\n${fichaProyecto(prompt.projectDefault)}${reglas}` } }],
  };
}
