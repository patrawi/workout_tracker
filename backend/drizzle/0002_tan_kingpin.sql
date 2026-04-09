CREATE TYPE "public"."meal_type" AS ENUM('Breakfast', 'Lunch', 'Dinner', 'Snack');--> statement-breakpoint
ALTER TABLE "nutrition_logs" ALTER COLUMN "meal" SET DATA TYPE "public"."meal_type" USING "meal"::"public"."meal_type";--> statement-breakpoint
CREATE INDEX "nutrition_logs_date_idx" ON "nutrition_logs" USING btree ("date");--> statement-breakpoint
ALTER TABLE "nutrition_logs" DROP COLUMN "has_missing_macros";