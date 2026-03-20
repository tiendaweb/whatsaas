CREATE TABLE "message_reactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"chat_id" integer NOT NULL,
	"emoji" text NOT NULL,
	"from_me" boolean DEFAULT false NOT NULL,
	"remote_jid" text,
	"participant_name" text,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unique_reaction_per_user_idx" UNIQUE("message_id","remote_jid","from_me")
);
--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reaction_message_id_idx" ON "message_reactions" USING btree ("message_id");