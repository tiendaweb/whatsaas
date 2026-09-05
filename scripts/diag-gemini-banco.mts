/**
 * Qué puede hacer HOY el banco de keys, preguntándoselo a Google.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/diag-gemini-banco.mts
 *
 * No escribe nada. Para cada key: qué modelos le sirve la API y si una llamada
 * mínima pasa o la rechaza. Es la única forma de distinguir "se acabó la cuota
 * de Google" de "nos autolimitamos por debajo de la cuota de Google".
 */
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamGeminiKeys } from '@/lib/db/schema';
import { decryptPaymentSecret } from '@/lib/payments/secret-codec';

const TEAM = Number(process.env.SMOKE_TEAM_ID ?? 2);
const filas = await db.select().from(teamGeminiKeys).where(eq(teamGeminiKeys.teamId, TEAM));
console.log(`\n${filas.length} keys en el banco del equipo ${TEAM}\n`);

const CUANTAS = Number(process.env.DIAG_KEYS ?? 3);
let modelosVistos: string[] = [];

for (const fila of filas.slice(0, CUANTAS)) {
  const apiKey = decryptPaymentSecret(fila.apiKey);
  if (!apiKey) {
    console.log(`✗ ${fila.label}: no se pudo descifrar la key`);
    continue;
  }
  console.log(`── ${fila.label} (modelo configurado: ${fila.model}, límite propio ${fila.limitRpd}/día)`);

  // 1) Qué modelos le sirve Google a ESTA key.
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=100`);
    const body = (await res.json()) as { models?: Array<{ name: string; supportedGenerationMethods?: string[] }>; error?: { message: string } };
    if (!res.ok) {
      console.log(`   modelos: ✗ ${res.status} ${body?.error?.message?.slice(0, 120) ?? ''}`);
    } else {
      const generan = (body.models ?? [])
        .filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
        .map((m) => m.name.replace('models/', ''));
      modelosVistos = generan;
      console.log(`   modelos que generan: ${generan.length}`);
      console.log(`   flash disponibles: ${generan.filter((m) => m.includes('flash')).slice(0, 12).join(', ')}`);
      console.log(`   ¿está el configurado (${fila.model})? ${generan.includes(fila.model) ? 'sí' : 'NO'}`);
    }
  } catch (e) {
    console.log(`   modelos: ✗ ${e instanceof Error ? e.message : String(e)}`);
  }

  // 2) ¿Pasa una llamada mínima ahora mismo?
  const candidatos = [fila.model, ...modelosVistos.filter((m) => m.includes('flash') && m !== fila.model).slice(0, 4)];
  for (const modelo of candidatos) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Decí OK.' }] }], generationConfig: { maxOutputTokens: 8 } }),
      });
      const body = (await res.json()) as { error?: { code: number; status: string; message: string } };
      console.log(`   ${res.ok ? '✓' : '✗'} ${modelo}${res.ok ? '' : ` → ${body?.error?.status ?? res.status}: ${(body?.error?.message ?? '').slice(0, 90)}`}`);
      if (res.ok) break;
    } catch (e) {
      console.log(`   ✗ ${modelo} → ${e instanceof Error ? e.message.slice(0, 90) : String(e)}`);
    }
  }
  console.log('');
}
process.exit(0);
