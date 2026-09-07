CREATE TABLE "proof_of_work_challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"nonce" text NOT NULL,
	"purpose" text NOT NULL,
	"difficulty_bits" integer NOT NULL,
	"expires_at" bigint NOT NULL,
	"used_at" bigint,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_checkouts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"checkout_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_customers" (
	"user_id" text PRIMARY KEY NOT NULL,
	"provider_customer_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_customers_provider_customer_id_unique" UNIQUE("provider_customer_id")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider_subscription_id" text NOT NULL,
	"tier" text NOT NULL,
	"status" text NOT NULL,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"pause_at_period_end" boolean DEFAULT false NOT NULL,
	"price_eur_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_provider_subscription_id_unique" UNIQUE("provider_subscription_id")
);
--> statement-breakpoint
CREATE TABLE "checkout_customers" (
	"subject_id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "checkout_customers_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "email_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"template_key" text NOT NULL,
	"to_address" text NOT NULL,
	"payload_encrypted" text,
	"status" text NOT NULL,
	"priority" integer NOT NULL,
	"attempts" integer NOT NULL,
	"max_attempts" integer NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"idempotency_key" text,
	"last_error_code" text,
	"last_error_message" text,
	"smtp_message_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"dead_at" timestamp with time zone,
	CONSTRAINT "email_queue_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "name_holds" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"tier" text DEFAULT '' NOT NULL,
	"salutation" text DEFAULT '' NOT NULL,
	"idea" text DEFAULT '' NOT NULL,
	"claim_token_hash" text DEFAULT '' NOT NULL,
	"success_token_hash" text DEFAULT '' NOT NULL,
	"email_confirmed_at" timestamp with time zone,
	"reserved_until" timestamp with time zone,
	"checkout_id" text,
	"checkout_url" text,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "names" (
	"name" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"status" text NOT NULL,
	"checkout_id" text,
	"order_id" text,
	"price_paid_eur" numeric,
	"purchased_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoke_reason" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"checkout_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"processed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"actor_user_id" text,
	"target_user_id" text,
	"email_queue_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worker_heartbeats" (
	"worker_name" text PRIMARY KEY NOT NULL,
	"instance_id" text NOT NULL,
	"version" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"last_heartbeat_at" timestamp with time zone NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_checkouts" ADD CONSTRAINT "billing_checkouts_user_id_checkout_customers_subject_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."checkout_customers"("subject_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_customers" ADD CONSTRAINT "billing_customers_user_id_checkout_customers_subject_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."checkout_customers"("subject_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_checkout_customers_subject_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."checkout_customers"("subject_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "names" ADD CONSTRAINT "names_owner_user_id_checkout_customers_subject_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."checkout_customers"("subject_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "proof_of_work_challenges_expiry_idx" ON "proof_of_work_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "billing_checkouts_user_idx" ON "billing_checkouts" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "subscriptions_user_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "email_queue_claim_idx" ON "email_queue" USING btree ("status","available_at","priority");--> statement-breakpoint
CREATE INDEX "email_queue_created_idx" ON "email_queue" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "email_queue_to_idx" ON "email_queue" USING btree ("to_address");--> statement-breakpoint
CREATE INDEX "email_queue_template_idx" ON "email_queue" USING btree ("template_key");--> statement-breakpoint
CREATE INDEX "name_holds_name_idx" ON "name_holds" USING btree ("name");--> statement-breakpoint
CREATE INDEX "name_holds_expiry_idx" ON "name_holds" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "name_holds_email_idx" ON "name_holds" USING btree ("email");--> statement-breakpoint
CREATE INDEX "name_holds_tier_idx" ON "name_holds" USING btree ("tier");--> statement-breakpoint
CREATE INDEX "name_holds_claim_token_idx" ON "name_holds" USING btree ("claim_token_hash");--> statement-breakpoint
CREATE INDEX "name_holds_reserved_idx" ON "name_holds" USING btree ("reserved_until");--> statement-breakpoint
CREATE INDEX "names_owner_idx" ON "names" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "names_status_idx" ON "names" USING btree ("status");--> statement-breakpoint
CREATE INDEX "names_checkout_idx" ON "names" USING btree ("checkout_id");--> statement-breakpoint
CREATE INDEX "payment_events_checkout_idx" ON "payment_events" USING btree ("checkout_id");