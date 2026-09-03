ALTER TABLE "team_sales" ADD COLUMN IF NOT EXISTS "customer_id" integer;--> statement-breakpoint
ALTER TABLE "team_sales" ADD COLUMN IF NOT EXISTS "deal_id" integer;--> statement-breakpoint
ALTER TABLE "team_sales" ADD COLUMN IF NOT EXISTS "idempotency_key" varchar(120);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_sales" ADD CONSTRAINT "team_sales_customer_id_team_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "team_customers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_sales" ADD CONSTRAINT "team_sales_deal_id_team_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "team_deals"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_sales_customer_idx" ON "team_sales" ("team_id","customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_sales_deal_idx" ON "team_sales" ("team_id","deal_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "team_sales_idempotency_uidx" ON "team_sales" ("team_id","idempotency_key") WHERE "idempotency_key" IS NOT NULL;
