-- Marca blanca / Resellers
-- Escrita a mano y aplicada con psql: el journal de drizzle está congelado en 0039
-- y `drizzle-kit generate` regeneraría el esquema desde ese snapshot.

-- ---------------------------------------------------------------------------
-- Núcleo
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS resellers (
  id serial PRIMARY KEY,
  owner_user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  slug varchar(64) NOT NULL,
  company_name varchar(120) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'active',            -- active | past_due | suspended
  wholesale_discount_bps integer NOT NULL DEFAULT 0,       -- 3000 = 30% de descuento sobre plans.amount
  currency varchar(3) NOT NULL DEFAULT 'usd',
  low_balance_threshold integer NOT NULL DEFAULT 0,
  payments_enabled boolean NOT NULL DEFAULT false,         -- rollout gradual del cobro con sus credenciales
  allow_unsafe_html boolean NOT NULL DEFAULT false,        -- permite <script> en su landing. Ver nota de XSS.
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS resellers_slug_uidx ON resellers (lower(slug));
CREATE UNIQUE INDEX IF NOT EXISTS resellers_owner_uidx ON resellers (owner_user_id);

CREATE TABLE IF NOT EXISTS reseller_domains (
  id serial PRIMARY KEY,
  reseller_id integer NOT NULL REFERENCES resellers(id) ON DELETE CASCADE,
  hostname varchar(253) NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  status varchar(20) NOT NULL DEFAULT 'pending',           -- pending | active | disabled
  verification_token varchar(64),
  verified_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
-- Un dominio pertenece a un solo tenant.
CREATE UNIQUE INDEX IF NOT EXISTS reseller_domains_hostname_uidx ON reseller_domains (lower(hostname));
CREATE INDEX IF NOT EXISTS reseller_domains_reseller_idx ON reseller_domains (reseller_id);
CREATE UNIQUE INDEX IF NOT EXISTS reseller_domains_primary_uidx
  ON reseller_domains (reseller_id) WHERE is_primary;

-- ---------------------------------------------------------------------------
-- Branding por tenant (reseller_id NULL = la plataforma)
-- ---------------------------------------------------------------------------
ALTER TABLE branding
  ADD COLUMN IF NOT EXISTS reseller_id integer REFERENCES resellers(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS theme jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS legal jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS email_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS analytics jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS support_email varchar(255);

CREATE UNIQUE INDEX IF NOT EXISTS branding_reseller_uidx
  ON branding (reseller_id) WHERE reseller_id IS NOT NULL;
-- Garantiza una única fila de plataforma (hoy hay exactamente 1).
CREATE UNIQUE INDEX IF NOT EXISTS branding_platform_uidx
  ON branding ((true)) WHERE reseller_id IS NULL;

-- ---------------------------------------------------------------------------
-- Precios del reseller
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reseller_plan_prices (
  id serial PRIMARY KEY,
  reseller_id integer NOT NULL REFERENCES resellers(id) ON DELETE CASCADE,
  plan_id integer NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  is_published boolean NOT NULL DEFAULT true,
  retail_amount integer NOT NULL,          -- centavos: lo que el reseller cobra a su cliente
  wholesale_amount integer,                -- NULL => derivar de resellers.wholesale_discount_bps
  currency varchar(3) NOT NULL DEFAULT 'usd',
  external_product_ref text,               -- product id en la cuenta de pago DEL RESELLER
  external_price_ref text,                 -- price id en la cuenta de pago DEL RESELLER
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS reseller_plan_prices_uidx
  ON reseller_plan_prices (reseller_id, plan_id);

-- ---------------------------------------------------------------------------
-- Billetera prepago
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reseller_wallets (
  id serial PRIMARY KEY,
  reseller_id integer NOT NULL UNIQUE REFERENCES resellers(id) ON DELETE CASCADE,
  currency varchar(3) NOT NULL DEFAULT 'usd',
  balance integer NOT NULL DEFAULT 0,       -- centavos
  credit_limit integer NOT NULL DEFAULT 0,  -- permite saldo negativo hasta -credit_limit
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT reseller_wallets_balance_chk CHECK (balance >= -credit_limit)
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id serial PRIMARY KEY,
  wallet_id integer NOT NULL REFERENCES reseller_wallets(id) ON DELETE CASCADE,
  reseller_id integer NOT NULL REFERENCES resellers(id) ON DELETE CASCADE,
  type varchar(24) NOT NULL,                        -- topup | debit_plan | refund | adjustment | chargeback
  status varchar(20) NOT NULL DEFAULT 'completed',  -- completed | pending_debt | reversed
  amount integer NOT NULL,                          -- (+) acredita, (-) debita
  balance_after integer NOT NULL,
  currency varchar(3) NOT NULL DEFAULT 'usd',
  team_id integer REFERENCES teams(id) ON DELETE SET NULL,
  plan_id integer REFERENCES plans(id) ON DELETE SET NULL,
  idempotency_key varchar(191) NOT NULL,
  provider varchar(50),
  provider_ref varchar(191),
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
-- La defensa real contra el doble cobro: el alta por Stripe pasa dos veces
-- (checkout route + webhook) y ambas comparten idempotency_key.
CREATE UNIQUE INDEX IF NOT EXISTS wallet_transactions_idem_uidx
  ON wallet_transactions (reseller_id, idempotency_key);
CREATE INDEX IF NOT EXISTS wallet_transactions_wallet_idx
  ON wallet_transactions (wallet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS wallet_transactions_team_idx ON wallet_transactions (team_id);

CREATE TABLE IF NOT EXISTS reseller_topups (
  id serial PRIMARY KEY,
  reseller_id integer NOT NULL REFERENCES resellers(id) ON DELETE CASCADE,
  amount integer NOT NULL,
  currency varchar(3) NOT NULL DEFAULT 'usd',
  provider varchar(50) NOT NULL,             -- pasarela DE LA PLATAFORMA
  provider_ref varchar(191),
  status varchar(30) NOT NULL DEFAULT 'pending',  -- pending | pending_manual_review | paid | rejected | failed
  proof_url text,
  reviewed_by integer REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamp,
  wallet_transaction_id integer REFERENCES wallet_transactions(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS reseller_topups_provider_ref_uidx
  ON reseller_topups (provider, provider_ref) WHERE provider_ref IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Credenciales de pago por reseller: romper el UNIQUE global de `provider`
-- ---------------------------------------------------------------------------
ALTER TABLE payment_provider_settings
  ADD COLUMN IF NOT EXISTS reseller_id integer REFERENCES resellers(id) ON DELETE CASCADE;

-- El nombre de la constraint varía según quién creó la tabla (drizzle vs el DDL
-- runtime de ensurePaymentTables), así que se dropea por catálogo.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'payment_provider_settings'::regclass AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE payment_provider_settings DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS pps_provider_platform_uidx
  ON payment_provider_settings (provider) WHERE reseller_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pps_provider_reseller_uidx
  ON payment_provider_settings (reseller_id, provider) WHERE reseller_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Ligado de clientes. teams.reseller_id es la fuente de verdad de facturación:
-- el débito mira el team, nunca el host del request.
-- ---------------------------------------------------------------------------
ALTER TABLE teams ADD COLUMN IF NOT EXISTS reseller_id integer REFERENCES resellers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS teams_reseller_idx ON teams (reseller_id);

ALTER TABLE users ADD COLUMN IF NOT EXISTS reseller_id integer REFERENCES resellers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS users_reseller_idx ON users (reseller_id);

-- Idempotencia de webhooks por tenant: dos resellers pueden recibir el mismo
-- event_id de sus respectivas cuentas de Stripe.
ALTER TABLE payment_webhook_events
  ADD COLUMN IF NOT EXISTS reseller_id integer REFERENCES resellers(id) ON DELETE CASCADE;

DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'payment_webhook_events'::regclass AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE payment_webhook_events DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
DROP INDEX IF EXISTS payment_webhook_events_provider_event_id_unique;
DROP INDEX IF EXISTS payment_webhook_events_provider_payment_id_unique;

CREATE UNIQUE INDEX IF NOT EXISTS pwe_provider_event_uidx
  ON payment_webhook_events (provider, COALESCE(reseller_id, 0), event_id) WHERE event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pwe_provider_payment_uidx
  ON payment_webhook_events (provider, COALESCE(reseller_id, 0), payment_id) WHERE payment_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Landing por reseller
-- ---------------------------------------------------------------------------
ALTER TABLE landing_pages
  ADD COLUMN IF NOT EXISTS reseller_id integer REFERENCES resellers(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS custom_css text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS hide_chrome boolean NOT NULL DEFAULT false;

DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'landing_pages'::regclass AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE landing_pages DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS landing_pages_slug_platform_uidx
  ON landing_pages (slug) WHERE reseller_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS landing_pages_slug_reseller_uidx
  ON landing_pages (reseller_id, slug) WHERE reseller_id IS NOT NULL;

ALTER TABLE landing_content
  ADD COLUMN IF NOT EXISTS reseller_id integer REFERENCES resellers(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS landing_content_platform_uidx
  ON landing_content ((true)) WHERE reseller_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS landing_content_reseller_uidx
  ON landing_content (reseller_id) WHERE reseller_id IS NOT NULL;
