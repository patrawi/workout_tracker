CREATE TYPE "public"."session_type" AS ENUM('working', 'working_compromised', 'form_check', 'return_from_layoff', 'return_from_injury');--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "session_type" "session_type" DEFAULT 'working' NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "gym_profile" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "pain" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Backfill: all existing sessions were logged at the single current gym (spec §3.4 continuity seed).
UPDATE "sessions" SET "gym_profile" = 'The Gym Group Edinburgh Meadowbank Branch' WHERE "gym_profile" = '';