CREATE TABLE "team_article_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"kind" varchar(30) DEFAULT 'physical' NOT NULL,
	"billing_mode" varchar(20) DEFAULT 'one_time' NOT NULL,
	"billing_label" varchar(100),
	"tracks_stock" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_article_types_team_name_unique" UNIQUE("team_id","name")
);
--> statement-breakpoint
ALTER TABLE "team_articles" ADD COLUMN "article_type_id" integer;
--> statement-breakpoint
ALTER TABLE "team_article_types" ADD CONSTRAINT "team_article_types_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_articles" ADD CONSTRAINT "team_articles_article_type_id_team_article_types_id_fk" FOREIGN KEY ("article_type_id") REFERENCES "public"."team_article_types"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "team_article_types_team_idx" ON "team_article_types" USING btree ("team_id");
--> statement-breakpoint
CREATE INDEX "team_articles_type_idx" ON "team_articles" USING btree ("article_type_id");
