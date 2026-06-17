-- Add attachment_url to support_tickets table if the table exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'support_tickets') THEN
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'support_tickets' AND column_name = 'attachment_url') THEN
            ALTER TABLE support_tickets ADD COLUMN attachment_url text;
        END IF;
    END IF;
END
$$;
