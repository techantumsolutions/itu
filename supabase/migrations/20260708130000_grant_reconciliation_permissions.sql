-- Grant permissions on reconciliation and related operational tables to standard database roles

GRANT ALL ON TABLE reconciliation_reports TO postgres, service_role, authenticated, anon;
GRANT ALL ON TABLE reconciliation_items TO postgres, service_role, authenticated, anon;
GRANT ALL ON TABLE payment_events TO postgres, service_role, authenticated, anon;
GRANT ALL ON TABLE transactions TO postgres, service_role, authenticated, anon;
GRANT ALL ON TABLE recharge_orders TO postgres, service_role, authenticated, anon;
GRANT ALL ON TABLE lcr_v2_recharge_attempts TO postgres, service_role, authenticated, anon;
GRANT ALL ON TABLE refunds TO postgres, service_role, authenticated, anon;

-- Also verify sequences if they are used for serial IDs
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, service_role, authenticated, anon;
