CREATE TABLE IF NOT EXISTS "team_menu_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "team_id" integer NOT NULL,
  "item_key" varchar(160) NOT NULL,
  "pinned" boolean DEFAULT true NOT NULL,
  "order" integer DEFAULT 0 NOT NULL,
  "updated_by" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_menu_items" ADD CONSTRAINT "team_menu_items_team_id_teams_id_fk"
 FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_menu_items" ADD CONSTRAINT "team_menu_items_updated_by_users_id_fk"
 FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_menu_items" ADD CONSTRAINT "team_menu_items_team_item_idx"
 UNIQUE("team_id","item_key");
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_menu_items_team_order_idx" ON "team_menu_items" USING btree ("team_id","order");
