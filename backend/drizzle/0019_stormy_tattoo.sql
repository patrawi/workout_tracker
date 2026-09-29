CREATE TABLE "gyms" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "gym_id" integer;--> statement-breakpoint
ALTER TABLE "gyms" ADD CONSTRAINT "gyms_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "gyms_user_id_name_idx" ON "gyms" USING btree ("user_id","name");--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- PAT-56 backfill: promote every distinct gym name ever logged into a gyms row,
-- then link old sessions by (user_id, exact name match). Legacy rows with an
-- empty gym_profile keep gym_id = NULL.
INSERT INTO "gyms" ("user_id", "name")
SELECT DISTINCT "user_id", "gym_profile" FROM "sessions" WHERE "gym_profile" <> '';--> statement-breakpoint
UPDATE "sessions" "s"
SET "gym_id" = "g"."id"
FROM "gyms" "g"
WHERE "s"."user_id" = "g"."user_id" AND "s"."gym_profile" = "g"."name";