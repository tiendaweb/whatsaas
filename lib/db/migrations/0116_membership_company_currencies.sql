ALTER TABLE "team_membership_companies" ADD COLUMN IF NOT EXISTS "currencies" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "team_membership_companies" ADD COLUMN IF NOT EXISTS "default_currency" varchar(3);

-- Arranque: cada empresa hereda las monedas que ya usan sus planes, así el
-- selector no aparece vacío en las empresas que venían de antes.
UPDATE "team_membership_companies" c
SET "currencies" = sub.currencies,
    "default_currency" = sub.currencies->>0
FROM (
  SELECT p."company_id" AS company_id,
         jsonb_agg(DISTINCT p."currency" ORDER BY p."currency") AS currencies
  FROM "team_membership_plans" p
  WHERE p."company_id" IS NOT NULL AND p."currency" IS NOT NULL AND p."currency" <> ''
  GROUP BY p."company_id"
) sub
WHERE c."id" = sub.company_id AND c."currencies" = '[]'::jsonb;
