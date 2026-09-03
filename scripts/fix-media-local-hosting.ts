import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db, client } from '../lib/db/drizzle';
import { automations } from '../lib/db/schema';

const TEAM_ID = 4;
const OUT_DIR = path.join(process.cwd(), 'public', 'uploads', 'automation');

// engine.ts's processMediaOutput reads `public/<mediaUrl>` straight off disk — any
// absolute external URL silently fails (fileToBase64 catches ENOENT -> null -> no-op).
// So every media node needs to point at a locally-hosted file.
const EXTERNAL_URLS = [
  'https://tiendaweb.uno/storage/uploads/theme12/header/az_hero_2.jpg',
  'https://tiendaweb.uno/storage/uploads/product_image/remeras%20hombre%20varios%20colores%20az%20indumentaria%20once%20caba_1780541625.jpeg',
  'https://tiendaweb.uno/storage/uploads/product_image/campera-acolchada-negra-hombre-az-indumentaria-once-caba.jpg_1780537307.png',
  'https://tiendaweb.uno/storage/uploads/product_image/buzo-premium-hombre-negro-az-indumentaria-once-caba.jpg_1780543630.jpeg',
  'https://images.pexels.com/photos/7031704/pexels-photo-7031704.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1',
  'https://images.pexels.com/photos/7446659/pexels-photo-7446659.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1',
  'https://images.pexels.com/photos/6628701/pexels-photo-6628701.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1',
  'https://images.pexels.com/photos/3985354/pexels-photo-3985354.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1',
  'https://images.pexels.com/photos/4677845/pexels-photo-4677845.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1',
  'https://images.pexels.com/photos/5240636/pexels-photo-5240636.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1',
];

const AUTOMATION_IDS = [77, 79, 92, 94, 95, 96, 97, 98];

async function download(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

function extFromUrl(url: string, contentType: string | null): string {
  const clean = url.split('?')[0];
  const match = clean.match(/\.(jpg|jpeg|png|webp)$/i);
  if (match) return match[1].toLowerCase();
  if (contentType?.includes('png')) return 'png';
  return 'jpg';
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const urlToLocal = new Map<string, string>();
  for (const url of EXTERNAL_URLS) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} descargando ${url}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    const ext = extFromUrl(url, res.headers.get('content-type'));
    const filename = `${randomUUID()}.${ext}`;
    await fs.writeFile(path.join(OUT_DIR, filename), buffer);
    const localPath = `/uploads/automation/${filename}`;
    urlToLocal.set(url, localPath);
    console.log(`  ↓ ${url.slice(0, 70)}... -> ${localPath} (${buffer.length} bytes)`);
  }

  await db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: automations.id, name: automations.name, nodes: automations.nodes })
      .from(automations)
      .where(and(eq(automations.teamId, TEAM_ID), inArray(automations.id, AUTOMATION_IDS)));

    for (const row of rows) {
      let changed = false;
      const nodes = (row.nodes as any[]).map((n) => {
        if (n.type === 'media' && urlToLocal.has(n.data.mediaUrl)) {
          changed = true;
          return { ...n, data: { ...n.data, mediaUrl: urlToLocal.get(n.data.mediaUrl) } };
        }
        return n;
      });
      if (changed) {
        await tx.update(automations).set({ nodes, updatedAt: new Date() }).where(eq(automations.id, row.id));
        console.log(`  ✓ ${row.name} (#${row.id}) actualizado con rutas locales.`);
      }
    }
  });

  console.log('Listo.');
}

main()
  .catch((error) => { console.error('ERROR', error); process.exitCode = 1; })
  .finally(async () => { await client.end(); });
