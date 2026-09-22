ALTER TABLE "meal_observations" ADD COLUMN "user_id" integer;--> statement-breakpoint
-- Backfill: all legacy single-user observations belong to the owner (user 1),
-- mirroring 0016_google_multi_user.sql.
UPDATE "meal_observations" SET "user_id" = 1 WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "meal_observations" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "meal_observations" ADD CONSTRAINT "meal_observations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
