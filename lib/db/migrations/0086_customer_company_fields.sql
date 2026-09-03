ALTER TABLE "team_customers" ADD COLUMN IF NOT EXISTS "industry" varchar(60);--> statement-breakpoint
ALTER TABLE "team_customers" ADD COLUMN IF NOT EXISTS "website" varchar(255);--> statement-breakpoint
ALTER TABLE "team_customers" ADD COLUMN IF NOT EXISTS "employees" integer;--> statement-breakpoint
ALTER TABLE "team_customers" ADD COLUMN IF NOT EXISTS "annual_revenue" integer;--> statement-breakpoint
ALTER TABLE "team_customers" ADD COLUMN IF NOT EXISTS "location" varchar(160);--> statement-breakpoint
ALTER TABLE "team_customers" ADD COLUMN IF NOT EXISTS "customer_since" timestamp;
