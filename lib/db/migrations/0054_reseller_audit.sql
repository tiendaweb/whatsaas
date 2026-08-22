CREATE TABLE IF NOT EXISTS reseller_audit_events (
  id serial PRIMARY KEY,
  reseller_id integer REFERENCES resellers(id) ON DELETE SET NULL,
  action varchar(80) NOT NULL,
  actor_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  previous_owner_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  next_owner_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reseller_audit_events_reseller_created_idx
  ON reseller_audit_events (reseller_id, created_at);

CREATE INDEX IF NOT EXISTS reseller_audit_events_actor_created_idx
  ON reseller_audit_events (actor_user_id, created_at);
