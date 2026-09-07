DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'aven_checkout_http') THEN
    GRANT USAGE ON SCHEMA public TO aven_checkout_http;
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      proof_of_work_challenges,
      checkout_customers,
      billing_customers,
      subscriptions,
      billing_checkouts,
      names,
      name_holds
    TO aven_checkout_http;
    GRANT SELECT, INSERT ON payment_events, email_queue, audit_events, platform_event_outbox TO aven_checkout_http;
    GRANT SELECT ON worker_heartbeats TO aven_checkout_http;
    GRANT USAGE, SELECT ON SEQUENCE billing_checkouts_id_seq TO aven_checkout_http;
  END IF;

  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'aven_checkout_webhooks') THEN
    GRANT USAGE ON SCHEMA public TO aven_checkout_webhooks;
    GRANT SELECT, INSERT, UPDATE ON
      checkout_customers,
      billing_customers,
      subscriptions,
      billing_checkouts,
      names,
      name_holds
    TO aven_checkout_webhooks;
    GRANT DELETE ON name_holds TO aven_checkout_webhooks;
    GRANT SELECT, INSERT ON payment_events, email_queue, audit_events, platform_event_outbox
      TO aven_checkout_webhooks;
    GRANT SELECT, INSERT, UPDATE ON polar_webhook_deliveries TO aven_checkout_webhooks;
  END IF;

  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'aven_checkout_email') THEN
    GRANT USAGE ON SCHEMA public TO aven_checkout_email;
    GRANT SELECT, UPDATE ON email_queue TO aven_checkout_email;
    GRANT SELECT, INSERT, UPDATE ON worker_heartbeats TO aven_checkout_email;
  END IF;

  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'aven_checkout_platform_events') THEN
    GRANT USAGE ON SCHEMA public TO aven_checkout_platform_events;
    GRANT SELECT, UPDATE ON platform_event_outbox TO aven_checkout_platform_events;
  END IF;
END $$;
