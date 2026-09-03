import { eq } from 'drizzle-orm';
import { db } from '../lib/db/drizzle';
import { paymentProviderSettings } from '../lib/db/schema';
import { encryptProviderConfig } from '../lib/payments/secret-codec';

async function main() {
  const rows = await db.select().from(paymentProviderSettings);
  let updated = 0;
  for (const row of rows) {
    const config = encryptProviderConfig(row.provider, row.config ?? {});
    if (JSON.stringify(config) === JSON.stringify(row.config ?? {})) continue;
    await db.update(paymentProviderSettings)
      .set({ config, updatedAt: new Date() })
      .where(eq(paymentProviderSettings.id, row.id));
    updated += 1;
  }
  console.log(`Credenciales de pago protegidas: ${updated} configuración(es) actualizada(s).`);
}

main().catch((error) => {
  console.error('No se pudieron cifrar las credenciales de pago.', error);
  process.exit(1);
});
