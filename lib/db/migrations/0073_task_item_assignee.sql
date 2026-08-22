ALTER TABLE "team_task_items" ADD COLUMN "assignee_id" integer;--> statement-breakpoint
ALTER TABLE "team_task_items" ADD CONSTRAINT "team_task_items_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_task_items_assignee_idx" ON "team_task_items" USING btree ("team_id","assignee_id");
