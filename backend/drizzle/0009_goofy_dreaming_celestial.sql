CREATE TABLE "water_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"glasses" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "water_logs_date_unique" UNIQUE("date")
);
--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "water_target_glasses" integer DEFAULT 10;