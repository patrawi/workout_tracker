DROP INDEX "coach_plan_day_type_idx";--> statement-breakpoint
ALTER TABLE "coach_plan" ADD COLUMN "user_id" integer;--> statement-breakpoint
-- Backfill: the legacy global plan belongs to the owner (user 1).
UPDATE "coach_plan" SET "user_id" = 1 WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "coach_plan" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "coach_plan" ADD CONSTRAINT "coach_plan_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coach_plan_user_day_type_idx" ON "coach_plan" USING btree ("user_id","day_type");
