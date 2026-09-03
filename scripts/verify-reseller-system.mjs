import 'dotenv/config';
import postgres from 'postgres';

if (!process.env.POSTGRES_URL) throw new Error('POSTGRES_URL no está configurado.');
const client = postgres(process.env.POSTGRES_URL, { max: 1 });

async function count(query) {
  const rows = await client.unsafe(query);
  return Number(rows[0]?.count ?? 0);
}

try {
  const [
    globalWebhookIndexes,
    tenantWebhookIndexes,
    orphanTeams,
    orphanUsers,
    invalidOwners,
    missingWallets,
  ] = await Promise.all([
    count(`SELECT COUNT(*)::int AS count FROM pg_indexes WHERE schemaname='public' AND indexname IN ('payment_webhook_events_provider_event_id_uidx','payment_webhook_events_provider_payment_id_uidx','payment_webhook_events_provider_event_id_unique','payment_webhook_events_provider_payment_id_unique')`),
    count(`SELECT COUNT(*)::int AS count FROM pg_indexes WHERE schemaname='public' AND indexname IN ('pwe_provider_event_uidx','pwe_provider_payment_uidx')`),
    count(`SELECT COUNT(*)::int AS count FROM teams t LEFT JOIN resellers r ON r.id=t.reseller_id WHERE t.reseller_id IS NOT NULL AND r.id IS NULL`),
    count(`SELECT COUNT(*)::int AS count FROM users u LEFT JOIN resellers r ON r.id=u.reseller_id WHERE u.reseller_id IS NOT NULL AND r.id IS NULL`),
    count(`SELECT COUNT(*)::int AS count FROM resellers r JOIN users u ON u.id=r.owner_user_id WHERE u.role NOT IN ('reseller','admin') OR (u.role='reseller' AND u.reseller_id IS DISTINCT FROM r.id)`),
    count(`SELECT COUNT(*)::int AS count FROM resellers r LEFT JOIN reseller_wallets w ON w.reseller_id=r.id WHERE w.id IS NULL`),
  ]);

  const readiness = await client.unsafe(`
    SELECT r.id, r.slug, r.company_name, r.status, r.payments_enabled,
      u.email AS owner_email, u.role AS owner_role,
      COALESCE(w.balance, 0) AS balance,
      COALESCE(w.credit_limit, 0) AS credit_limit,
      (SELECT COUNT(*) FROM reseller_domains d WHERE d.reseller_id=r.id AND d.status='active' AND d.verified_at IS NOT NULL) AS active_domains,
      (SELECT COUNT(*) FROM reseller_plan_prices p WHERE p.reseller_id=r.id AND p.is_published) AS published_plans,
      (SELECT COUNT(*) FROM payment_provider_settings s WHERE s.reseller_id=r.id AND s.enabled) AS enabled_providers,
      (SELECT COUNT(*) FROM teams t WHERE t.reseller_id=r.id) AS customers
    FROM resellers r
    JOIN users u ON u.id=r.owner_user_id
    LEFT JOIN reseller_wallets w ON w.reseller_id=r.id
    ORDER BY r.id
  `);

  const critical = {
    globalWebhookIndexes,
    missingTenantWebhookIndexes: Math.max(0, 2 - tenantWebhookIndexes),
    orphanTeams,
    orphanUsers,
    invalidOwners,
    missingWallets,
  };
  console.log(JSON.stringify({ critical, readiness }, null, 2));
  if (Object.values(critical).some((value) => value > 0)) {
    throw new Error('La verificación reseller encontró invariantes críticas incumplidas.');
  }
} catch (error) {
  console.error(error instanceof Error ? (error.stack || String(error)) : error);
  process.exitCode = 1;
} finally {
  await client.end();
}
