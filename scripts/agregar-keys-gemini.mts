/**
 * Suma API keys de Gemini al banco, validando cada una contra Google antes de
 * guardarla.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx --env-file=.env \
 *     scripts/agregar-keys-gemini.mts AIzaSy... AIzaSy... AIzaSy...
 *
 * o pasándolas por entrada estándar, una por línea (admite `etiqueta=key`):
 *
 *   cat keys.txt | NODE_OPTIONS="--conditions=react-server" npx tsx --env-file=.env \
 *     scripts/agregar-keys-gemini.mts
 *
 * Variables: SMOKE_TEAM_ID (equipo, por defecto 2), GEMINI_MODEL (modelo).
 *
 * Nunca imprime la key entera y no toca las que ya están: si el prefijo ya
 * existe en el banco, la saltea. El `--conditions=react-server` es obligatorio,
 * si no el `import 'server-only'` del banco corta el script.
 */
import { eq } from 'drizzle-orm';
import { GoogleGenAI } from '@google/genai';
import { db } from '@/lib/db/drizzle';
import { teamGeminiKeys } from '@/lib/db/schema';
import { crearKey } from '@/lib/gemini/key-bank';
import { MODELO_GEMINI_POR_DEFECTO } from '@/lib/gemini/models';
import { decryptPaymentSecret } from '@/lib/payments/secret-codec';

const TEAM = Number(process.env.SMOKE_TEAM_ID ?? 2);
const MODELO = process.env.GEMINI_MODEL || MODELO_GEMINI_POR_DEFECTO;

const pista = (k: string) => `${k.slice(0, 8)}…${k.slice(-4)}`;

async function leerEntrada(): Promise<string[]> {
  const deArgv = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  if (deArgv.length) return deArgv;
  if (process.stdin.isTTY) return [];
  const trozos: Buffer[] = [];
  for await (const trozo of process.stdin) trozos.push(Buffer.from(trozo));
  return Buffer.concat(trozos).toString('utf8').split('\n');
}

/** Una llamada mínima real: es la única forma de saber si la key sirve hoy. */
async function sirve(apiKey: string): Promise<{ ok: true } | { ok: false; motivo: string }> {
  try {
    const cliente = new GoogleGenAI({ apiKey });
    const r = await cliente.models.generateContent({
      model: MODELO,
      contents: [{ role: 'user', parts: [{ text: 'Respondé solamente: ok' }] }],
      config: { temperature: 0, maxOutputTokens: 5 },
    });
    return r.text?.trim() ? { ok: true } : { ok: false, motivo: 'respondió vacío' };
  } catch (error) {
    const m = error instanceof Error ? error.message : String(error);
    const corto = m.length > 180 ? `${m.slice(0, 179)}…` : m;
    // Una key nueva puede llegar ya sin cuota del día: sigue sirviendo mañana.
    if (/429|quota|RESOURCE_EXHAUSTED/i.test(m)) return { ok: true };
    return { ok: false, motivo: corto };
  }
}

const lineas = await leerEntrada();
const candidatas = lineas
  .map((l) => l.trim())
  .filter(Boolean)
  .map((l) => {
    const i = l.indexOf('=');
    return i > 0 ? { etiqueta: l.slice(0, i).trim(), apiKey: l.slice(i + 1).trim() } : { etiqueta: '', apiKey: l };
  })
  .filter((c) => c.apiKey.length >= 20);

if (!candidatas.length) {
  console.log('No pasaste ninguna key. Ejemplo:\n  npx tsx --env-file=.env scripts/agregar-keys-gemini.mts AIzaSy... AIzaSy...');
  process.exit(1);
}

const existentes = await db.select().from(teamGeminiKeys).where(eq(teamGeminiKeys.teamId, TEAM));
const yaEstan = new Set(existentes.map((f) => decryptPaymentSecret(f.apiKey)).filter(Boolean) as string[]);
console.log(`\nBanco del equipo ${TEAM}: ${existentes.length} keys. Modelo: ${MODELO}.`);
console.log(`Se probarán ${candidatas.length} keys nuevas.\n`);

let sumadas = 0;
let numero = existentes.length;
for (const { etiqueta, apiKey } of candidatas) {
  if (yaEstan.has(apiKey)) {
    console.log(`· ${pista(apiKey)} — ya estaba en el banco, se saltea`);
    continue;
  }
  const prueba = await sirve(apiKey);
  if (!prueba.ok) {
    console.log(`✗ ${pista(apiKey)} — no sirve: ${prueba.motivo}`);
    continue;
  }
  numero += 1;
  const label = etiqueta || `Banco ${numero}`;
  await crearKey({ teamId: TEAM, label, apiKey, model: MODELO, notes: 'Agregada con scripts/agregar-keys-gemini.mts' });
  yaEstan.add(apiKey);
  sumadas += 1;
  console.log(`✓ ${pista(apiKey)} — guardada como "${label}"`);
}

console.log(`\n${sumadas} key(s) nuevas. El banco queda con ${existentes.length + sumadas}.`);
console.log(`Capacidad diaria aproximada: ${(existentes.length + sumadas) * 20} pedidos (20 por key en el free tier).\n`);
process.exit(0);
