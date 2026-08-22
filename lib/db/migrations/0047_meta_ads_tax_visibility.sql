-- La inversión que reporta Meta es NETA. En Argentina se le suman impuestos y percepciones
-- (~30%), así que guardamos la alícuota por cuenta y mostramos el costo final.
ALTER TABLE "meta_ad_accounts"
  ADD COLUMN IF NOT EXISTS "tax_rate" numeric(5, 2) DEFAULT 30.00 NOT NULL;

-- Permite sacar del selector las cuentas que no se usan, sin borrar su histórico.
ALTER TABLE "meta_ad_accounts"
  ADD COLUMN IF NOT EXISTS "visible" boolean DEFAULT true NOT NULL;
