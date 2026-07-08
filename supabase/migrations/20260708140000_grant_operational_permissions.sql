-- Grant permissions on operational tables to service role and authenticated users
GRANT ALL ON TABLE payment_events TO postgres, service_role, authenticated, anon;
GRANT ALL ON TABLE transactions TO postgres, service_role, authenticated, anon;
GRANT ALL ON TABLE recharge_orders TO postgres, service_role, authenticated, anon;
GRANT ALL ON TABLE lcr_v2_recharge_attempts TO postgres, service_role, authenticated, anon;
GRANT ALL ON TABLE refunds TO postgres, service_role, authenticated, anon;
