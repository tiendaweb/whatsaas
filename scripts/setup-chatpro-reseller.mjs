#!/usr/bin/env node

import { randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config();

if (!process.env.POSTGRES_URL) {
  throw new Error('POSTGRES_URL is required.');
}

const EMAIL = 'chatpro.uno@gmail.com';
const SLUG = 'chatpro';
const HOSTNAME = 'chatpro.whatspro.uno';
const INITIAL_TOPUP_CENTS = 10_000;
const TOPUP_KEY = 'setup:chatpro:initial-topup:10000';
const suppliedPassword = process.env.CHATPRO_RESELLER_PASSWORD?.trim();
const generatedPassword = suppliedPassword || `${randomBytes(18).toString('base64url')}!Aa7`;

if (generatedPassword.length < 12) {
  throw new Error('CHATPRO_RESELLER_PASSWORD must contain at least 12 characters.');
}

const client = postgres(process.env.POSTGRES_URL, { max: 1 });

try {
  const result = await client.begin(async (sql) => {
    const [reseller] = await sql`
      SELECT * FROM resellers WHERE slug = ${SLUG} FOR UPDATE
    `;
    if (!reseller) throw new Error(`Reseller ${SLUG} does not exist.`);

    const [admin] = await sql`
      SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1
    `;
    if (!admin) throw new Error('A platform admin is required.');

    let [owner] = await sql`
      SELECT * FROM users WHERE lower(email) = ${EMAIL} LIMIT 1
    `;
    let createdUser = false;

    if (owner) {
      const [otherOwnership] = await sql`
        SELECT id FROM resellers
        WHERE owner_user_id = ${owner.id} AND id <> ${reseller.id}
        LIMIT 1
      `;
      if (otherOwnership) {
        throw new Error(`${EMAIL} already owns another reseller.`);
      }
      if (owner.role !== 'reseller') {
        throw new Error(`${EMAIL} exists with role ${owner.role}; refusing to overwrite it.`);
      }
    } else {
      const passwordHash = await bcrypt.hash(generatedPassword, 12);
      [owner] = await sql`
        INSERT INTO users (email, password_hash, role, reseller_id)
        VALUES (${EMAIL}, ${passwordHash}, 'reseller', ${reseller.id})
        RETURNING *
      `;
      createdUser = true;
    }

    await sql`
      UPDATE users
      SET role = 'reseller', reseller_id = ${reseller.id}, updated_at = now()
      WHERE id = ${owner.id}
    `;

    if (reseller.owner_user_id !== owner.id) {
      await sql`
        UPDATE users
        SET reseller_id = NULL, updated_at = now()
        WHERE id = ${reseller.owner_user_id} AND reseller_id = ${reseller.id}
      `;
    }

    await sql`
      UPDATE resellers
      SET owner_user_id = ${owner.id}, wholesale_discount_bps = 3000,
          status = 'active', payments_enabled = false, updated_at = now()
      WHERE id = ${reseller.id}
    `;

    await sql`
      INSERT INTO reseller_audit_events (
        reseller_id, action, actor_user_id, previous_owner_user_id,
        next_owner_user_id, metadata
      ) VALUES (
        ${reseller.id},
        ${reseller.owner_user_id === owner.id ? 'commercial_setup_reconciled' : 'owner_transferred'},
        ${admin.id}, ${reseller.owner_user_id}, ${owner.id},
        ${sql.json({ targetEmail: EMAIL, source: 'setup-chatpro-reseller' })}
      )
    `;

    const [plan] = await sql`
      SELECT id, name, amount, currency
      FROM plans
      WHERE name = 'Esencial' AND amount = 4500 AND interval = 'month'
      ORDER BY id
      LIMIT 1
    `;
    if (!plan) throw new Error('Monthly Esencial plan (USD 45) does not exist.');

    await sql`
      INSERT INTO reseller_plan_prices (
        reseller_id, plan_id, is_published, retail_amount, wholesale_amount, currency
      ) VALUES (${reseller.id}, ${plan.id}, true, 4500, NULL, ${plan.currency})
      ON CONFLICT (reseller_id, plan_id) DO UPDATE SET
        is_published = true,
        retail_amount = EXCLUDED.retail_amount,
        wholesale_amount = NULL,
        currency = EXCLUDED.currency,
        updated_at = now()
    `;

    await sql`
      UPDATE payment_provider_settings
      SET enabled = false, is_default = false, updated_at = now()
      WHERE reseller_id = ${reseller.id} AND provider <> 'manual'
    `;
    const manualRows = await sql`
      UPDATE payment_provider_settings
      SET enabled = true, is_default = true, config = '{}'::jsonb, updated_at = now()
      WHERE reseller_id = ${reseller.id} AND provider = 'manual'
      RETURNING id
    `;
    if (manualRows.length === 0) {
      await sql`
        INSERT INTO payment_provider_settings (
          reseller_id, provider, enabled, is_default, config
        ) VALUES (${reseller.id}, 'manual', true, true, '{}'::jsonb)
      `;
    }

    const [existingDomain] = await sql`
      SELECT id, reseller_id FROM reseller_domains WHERE hostname = ${HOSTNAME} LIMIT 1
    `;
    if (existingDomain && existingDomain.reseller_id !== reseller.id) {
      throw new Error(`${HOSTNAME} belongs to another reseller.`);
    }
    await sql`
      UPDATE reseller_domains SET is_primary = false, updated_at = now()
      WHERE reseller_id = ${reseller.id}
    `;
    if (existingDomain) {
      await sql`
        UPDATE reseller_domains
        SET is_primary = true,
            verification_token = COALESCE(verification_token, ${randomUUID().replaceAll('-', '')}),
            updated_at = now()
        WHERE id = ${existingDomain.id}
      `;
    } else {
      await sql`
        INSERT INTO reseller_domains (
          reseller_id, hostname, is_primary, status, verification_token
        ) VALUES (
          ${reseller.id}, ${HOSTNAME}, true, 'pending', ${randomUUID().replaceAll('-', '')}
        )
      `;
    }

    let [wallet] = await sql`
      SELECT * FROM reseller_wallets WHERE reseller_id = ${reseller.id} FOR UPDATE
    `;
    if (!wallet) {
      [wallet] = await sql`
        INSERT INTO reseller_wallets (reseller_id, currency)
        VALUES (${reseller.id}, ${reseller.currency})
        RETURNING *
      `;
    }

    let [walletTransaction] = await sql`
      SELECT id FROM wallet_transactions
      WHERE reseller_id = ${reseller.id} AND idempotency_key = ${TOPUP_KEY}
      LIMIT 1
    `;
    if (!walletTransaction) {
      const nextBalance = wallet.balance + INITIAL_TOPUP_CENTS;
      [walletTransaction] = await sql`
        INSERT INTO wallet_transactions (
          wallet_id, reseller_id, type, amount, balance_after, currency,
          idempotency_key, provider, provider_ref, description, created_by
        ) VALUES (
          ${wallet.id}, ${reseller.id}, 'topup', ${INITIAL_TOPUP_CENTS},
          ${nextBalance}, ${wallet.currency}, ${TOPUP_KEY}, 'manual',
          'chatpro-initial-100', 'Recarga inicial ChatPro', ${admin.id}
        ) RETURNING id
      `;
      await sql`
        UPDATE reseller_wallets
        SET balance = ${nextBalance}, updated_at = now()
        WHERE id = ${wallet.id}
      `;
    }

    const [topup] = await sql`
      SELECT id FROM reseller_topups
      WHERE provider = 'manual' AND provider_ref = 'chatpro-initial-100'
      LIMIT 1
    `;
    if (!topup) {
      await sql`
        INSERT INTO reseller_topups (
          reseller_id, amount, currency, provider, provider_ref, status,
          reviewed_by, reviewed_at, wallet_transaction_id
        ) VALUES (
          ${reseller.id}, ${INITIAL_TOPUP_CENTS}, ${wallet.currency}, 'manual',
          'chatpro-initial-100', 'paid', ${admin.id}, now(), ${walletTransaction.id}
        )
      `;
    }

    return {
      resellerId: reseller.id,
      ownerUserId: owner.id,
      createdUser,
      planId: plan.id,
      hostname: HOSTNAME,
    };
  });

  console.log(JSON.stringify({
    ok: true,
    ...result,
    email: EMAIL,
    temporaryPassword: result.createdUser ? generatedPassword : null,
    paymentsEnabled: false,
    nextStep: 'Verify DNS/Traefik and activate the domain before enabling payments.',
  }, null, 2));
} finally {
  await client.end();
}
