/**
 * Resetea los contadores del banco de keys de Gemini y prueba cada key con una
 * llamada real. El contador es NUESTRA contabilidad, no la de Google: ponerlo en
 * cero no devuelve cuota, sólo deja de mentir sobre lo que creemos gastado. La
 * verdad la dice la llamada de prueba.
 */
import { and, eq } from 'drizzle-orm';
import { GoogleGenAI } from '@google/genai';
import { db } from '@/lib/db/drizzle';
import { teamGeminiKeys, teamGeminiKeyUsage } from '@/lib/db/schema';
import { decryptPaymentSecret } from '@/lib/payments/secret-codec';

const TEAM_ID = Number(process.argv[2] ?? 2);

async function main() {
  const keys = await db.select().from(teamGeminiKeys).where(eq(teamGeminiKeys.teamId, TEAM_ID));
  console.log(`Banco del equipo ${TEAM_ID}: ${keys.length} keys\n`);

  // 1. Contadores a cero (todas las filas de uso de esas keys).
  for (const key of keys) {
    await db.update(teamGeminiKeyUsage)
      .set({ requests: 0, errors: 0, quotaErrors: 0, audioSeconds: 0, minuteRequests: 0, minuteWindow: null, updatedAt: new Date() })
      .where(eq(teamGeminiKeyUsage.keyId, key.id));
  }
  console.log('Contadores de uso en cero.\n');

  // 2. Una llamada mínima por key.
  let vivas = 0;
  for (const key of keys) {
    let apiKey: string = '';
    try {
      apiKey = decryptPaymentSecret(key.apiKey) ?? '';
    } catch {
      console.log(`✗ ${key.label} · no se pudo descifrar la key`);
      continue;
    }
    try {
      const cliente = new GoogleGenAI({ apiKey });
      const respuesta = await cliente.models.generateContent({
        model: key.model,
        contents: [{ role: 'user', parts: [{ text: 'Respondé solamente: ok' }] }],
        config: { maxOutputTokens: 16, temperature: 0 },
      });
      const texto = (respuesta.text ?? '').trim().slice(0, 40);
      await db.update(teamGeminiKeys)
        .set({ status: 'active', lastError: '', lastErrorAt: null, updatedAt: new Date() })
        .where(eq(teamGeminiKeys.id, key.id));
      vivas += 1;
      console.log(`✓ ${key.label} (${key.model}) → "${texto || 'sin texto'}"`);
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      await db.update(teamGeminiKeys)
        .set({ lastError: mensaje.slice(0, 1000), lastErrorAt: new Date(), updatedAt: new Date() })
        .where(and(eq(teamGeminiKeys.id, key.id), eq(teamGeminiKeys.teamId, TEAM_ID)));
      console.log(`✗ ${key.label} (${key.model}) → ${mensaje.slice(0, 160).replace(/\s+/g, ' ')}`);
    }
  }

  console.log(`\n${vivas} de ${keys.length} keys respondieron.`);
  process.exit(0);
}

void main();
