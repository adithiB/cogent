CREATE TYPE "public"."budget_scope_dimension" AS ENUM('total', 'project', 'team', 'model');--> statement-breakpoint
CREATE TYPE "public"."budget_threshold_type" AS ENUM('amount', 'percent');--> statement-breakpoint
CREATE TABLE "budget_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"scope_dimension" "budget_scope_dimension" NOT NULL,
	"scope_value" text NOT NULL,
	"threshold_type" "budget_threshold_type" NOT NULL,
	"threshold_amount_micros" bigint,
	"threshold_percent" numeric(5, 2),
	"budget_amount_micros" bigint,
	"notify_email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "budget_alerts" ADD CONSTRAINT "budget_alerts_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "budget_alerts_org_scope_unique" ON "budget_alerts" USING btree ("org_id","scope_dimension","scope_value");--> statement-breakpoint
CREATE INDEX "budget_alerts_org_idx" ON "budget_alerts" USING btree ("org_id");