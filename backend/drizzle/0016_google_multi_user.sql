CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"google_sub" text NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"picture" text,
	"is_owner" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "users_google_sub_unique" UNIQUE("google_sub")
);
--> statement-breakpoint
-- Seed the placeholder owner row (id = 1). The first real Google login claims
-- it (google_sub 'pending-owner' -> real sub), transferring all legacy data.
INSERT INTO "users" ("id", "google_sub", "email", "name", "is_owner")
VALUES (1, 'pending-owner', 'owner@pending', 'Owner', true)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
-- The explicit-id insert above leaves the sequence behind; re-sync it so the
-- next INSERT (new Google user) gets id 2 instead of colliding on 1.
SELECT setval('users_id_seq', GREATEST((SELECT MAX("id") FROM "users"), 1));
--> statement-breakpoint
ALTER TABLE "bodyweight_logs" ADD COLUMN "user_id" integer;--> statement-breakpoint
ALTER TABLE "nutrition_logs" ADD COLUMN "user_id" integer;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "user_id" integer;--> statement-breakpoint
ALTER TABLE "rest_days" ADD COLUMN "user_id" integer;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "user_id" integer;--> statement-breakpoint
ALTER TABLE "water_logs" ADD COLUMN "user_id" integer;--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "user_id" integer;--> statement-breakpoint
-- Backfill: all legacy single-user data belongs to the owner (user 1).
UPDATE "bodyweight_logs" SET "user_id" = 1 WHERE "user_id" IS NULL;--> statement-breakpoint
UPDATE "nutrition_logs" SET "user_id" = 1 WHERE "user_id" IS NULL;--> statement-breakpoint
UPDATE "profile" SET "user_id" = 1 WHERE "user_id" IS NULL;--> statement-breakpoint
UPDATE "rest_days" SET "user_id" = 1 WHERE "user_id" IS NULL;--> statement-breakpoint
UPDATE "sessions" SET "user_id" = 1 WHERE "user_id" IS NULL;--> statement-breakpoint
UPDATE "water_logs" SET "user_id" = 1 WHERE "user_id" IS NULL;--> statement-breakpoint
UPDATE "workouts" SET "user_id" = 1 WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "bodyweight_logs" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "nutrition_logs" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "profile" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "rest_days" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "water_logs" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "workouts" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "bodyweight_logs" ADD CONSTRAINT "bodyweight_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nutrition_logs" ADD CONSTRAINT "nutrition_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rest_days" ADD CONSTRAINT "rest_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "water_logs" ADD CONSTRAINT "water_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Date uniqueness becomes per-user (safe here: every backfilled row has
-- user_id = 1, so the composite constraint holds whenever the old one did).
ALTER TABLE "bodyweight_logs" DROP CONSTRAINT "bodyweight_logs_date_unique";--> statement-breakpoint
ALTER TABLE "rest_days" DROP CONSTRAINT "rest_days_date_unique";--> statement-breakpoint
ALTER TABLE "water_logs" DROP CONSTRAINT "water_logs_date_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "bodyweight_logs_user_date_idx" ON "bodyweight_logs" USING btree ("user_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "rest_days_user_date_idx" ON "rest_days" USING btree ("user_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "water_logs_user_date_idx" ON "water_logs" USING btree ("user_id","date");--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_user_id_unique" UNIQUE("user_id");
