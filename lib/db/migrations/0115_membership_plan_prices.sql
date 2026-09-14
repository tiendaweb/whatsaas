ALTER TABLE "team_membership_plans" ADD COLUMN IF NOT EXISTS "prices" jsonb NOT NULL DEFAULT '[]'::jsonb;
UPDATE "team_membership_plans"
SET "prices" = jsonb_build_array(jsonb_build_object('currency', "currency", 'price', "price", 'setupFee', "setup_fee", 'maintenanceAmount', "maintenance_amount"))
WHERE "prices" = '[]'::jsonb;
