CREATE TABLE "team_article_attributes" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"values" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_article_attributes_team_name_unique" UNIQUE("team_id","name")
);
--> statement-breakpoint
CREATE TABLE "team_article_custom_fields" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"article_type_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"key" varchar(100) NOT NULL,
	"type" varchar(20) DEFAULT 'text' NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"has_price" boolean DEFAULT false NOT NULL,
	"price" integer DEFAULT 0 NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_article_custom_fields_type_key_unique" UNIQUE("article_type_id","key")
);
--> statement-breakpoint
CREATE TABLE "team_article_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"article_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"included_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"billing_mode" varchar(20) DEFAULT 'monthly' NOT NULL,
	"billing_label" varchar(100),
	"price" integer DEFAULT 0 NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"company_name" varchar(200),
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_article_variations" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"article_id" integer NOT NULL,
	"combination" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sku" varchar(100),
	"price" integer,
	"stock" integer,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "team_article_types" ADD COLUMN "field_config" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "team_articles" ADD COLUMN "custom_field_values" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "team_articles" ADD COLUMN "attribute_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "team_article_attributes" ADD CONSTRAINT "team_article_attributes_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_article_custom_fields" ADD CONSTRAINT "team_article_custom_fields_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_article_custom_fields" ADD CONSTRAINT "team_article_custom_fields_article_type_id_team_article_types_id_fk" FOREIGN KEY ("article_type_id") REFERENCES "public"."team_article_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_article_plans" ADD CONSTRAINT "team_article_plans_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_article_plans" ADD CONSTRAINT "team_article_plans_article_id_team_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."team_articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_article_variations" ADD CONSTRAINT "team_article_variations_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_article_variations" ADD CONSTRAINT "team_article_variations_article_id_team_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."team_articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_article_attributes_team_idx" ON "team_article_attributes" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "team_article_custom_fields_type_idx" ON "team_article_custom_fields" USING btree ("article_type_id");--> statement-breakpoint
CREATE INDEX "team_article_plans_article_idx" ON "team_article_plans" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX "team_article_variations_article_idx" ON "team_article_variations" USING btree ("article_id");