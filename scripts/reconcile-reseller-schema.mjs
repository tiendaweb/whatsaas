import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import postgres from 'postgres';

if (!process.env.POSTGRES_URL) throw new Error('POSTGRES_URL no está configurado.');
const client = postgres(process.env.POSTGRES_URL, { max: 1 });

try {
  const migrationPath = join(process.cwd(), 'lib/db/migrations/0053_reseller_reconciliation.sql');
  const migration = await readFile(migrationPath, 'utf8');
  await client.unsafe(migration);
  console.log('Esquema reseller reconciliado correctamente.');
} catch (error) {
  console.error('No se pudo reconciliar el esquema reseller.', error);
  process.exitCode = 1;
} finally {
  await client.end();
}
