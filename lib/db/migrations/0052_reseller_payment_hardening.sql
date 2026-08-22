-- Endurecimiento multi-tenant de pagos reseller. Es idempotente para instalaciones
-- que recibieron 0050/0051 manualmente.
ALTER TABLE manual_payments
  ADD COLUMN IF NOT EXISTS reseller_id integer REFERENCES resellers(id) ON DELETE CASCADE;

UPDATE manual_payments mp
SET reseller_id = t.reseller_id
FROM teams t
WHERE mp.team_id = t.id
  AND mp.reseller_id IS NULL
  AND t.reseller_id IS NOT NULL;

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
