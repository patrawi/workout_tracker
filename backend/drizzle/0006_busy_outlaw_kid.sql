ALTER TABLE "sessions" ADD COLUMN "walked_10k" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "did_liss" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "did_stretch" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "notes" text DEFAULT '';