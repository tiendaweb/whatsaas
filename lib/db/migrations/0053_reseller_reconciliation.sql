-- Reconciliación idempotente para instalaciones donde 0050-0052 se aplicaron
-- manualmente mientras el journal de Drizzle permanecía congelado.

ALTER TABLE payment_webhook_events
  ADD COLUMN IF NOT EXISTS reseller_id integer REFERENCES resellers(id) ON DELETE CASCADE;

-- Estos índices globales fueron creados por el bootstrap legacy y bloquean el mismo
-- event_id/payment_id legítimo cuando llega desde cuentas de dos resellers distintos.
DROP INDEX IF EXISTS payment_webhook_events_provider_event_id_uidx;
DROP INDEX IF EXISTS payment_webhook_events_provider_payment_id_uidx;
DROP INDEX IF EXISTS payment_webhook_events_provider_event_id_unique;
DROP INDEX IF EXISTS payment_webhook_events_provider_payment_id_unique;

CREATE UNIQUE INDEX IF NOT EXISTS pwe_provider_event_uidx
  ON payment_webhook_events (provider, COALESCE(reseller_id, 0), event_id)
  WHERE event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pwe_provider_payment_uidx
  ON payment_webhook_events (provider, COALESCE(reseller_id, 0), payment_id)
  WHERE payment_id IS NOT NULL;

ALTER TABLE manual_payments
  ADD COLUMN IF NOT EXISTS reseller_id integer REFERENCES resellers(id) ON DELETE CASCADE;
UPDATE manual_payments mp
SET reseller_id = t.reseller_id
FROM teams t
WHERE mp.team_id = t.id AND mp.reseller_id IS NULL AND t.reseller_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS manual_payments_reseller_status_idx
  ON manual_payments (reseller_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS payment_audit_events (
  id serial PRIMARY KEY,
  reseller_id integer REFERENCES resellers(id) ON DELETE SET NULL,
  team_id integer REFERENCES teams(id) ON DELETE SET NULL,
  provider varchar(50) NOT NULL,
  payment_reference varchar(191) NOT NULL,
  previous_status varchar(30),
  next_status varchar(30) NOT NULL,
  actor varchar(30) NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payment_audit_events_reseller_created_idx
  ON payment_audit_events (reseller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_audit_events_team_created_idx
  ON payment_audit_events (team_id, created_at DESC);

UPDATE reseller_domains
SET verification_token = md5(random()::text || clock_timestamp()::text || id::text)
WHERE verification_token IS NULL;

-- Un registro legacy no se considera verificado por el solo hecho de decir active.
UPDATE reseller_domains
SET status = 'pending', verified_at = NULL, updated_at = now()
WHERE status = 'active' AND verified_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resellers_discount_bps_chk') THEN
    ALTER TABLE resellers ADD CONSTRAINT resellers_discount_bps_chk
      CHECK (wholesale_discount_bps BETWEEN 0 AND 10000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resellers_status_chk') THEN
    ALTER TABLE resellers ADD CONSTRAINT resellers_status_chk
      CHECK (status IN ('active', 'past_due', 'suspended'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reseller_domains_status_chk') THEN
    ALTER TABLE reseller_domains ADD CONSTRAINT reseller_domains_status_chk
      CHECK (status IN ('pending', 'active', 'disabled'));
  END IF;
END $$;
