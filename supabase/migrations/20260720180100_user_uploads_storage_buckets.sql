-- Shared object storage for profile avatars and ticket attachments (multi-replica safe).

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('user_avatars', 'user_avatars', true),
  ('ticket_attachments', 'ticket_attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Public read (URLs stored on profiles / tickets)
DROP POLICY IF EXISTS "Public read user_avatars" ON storage.objects;
CREATE POLICY "Public read user_avatars"
ON storage.objects FOR SELECT
USING (bucket_id = 'user_avatars');

DROP POLICY IF EXISTS "Public read ticket_attachments" ON storage.objects;
CREATE POLICY "Public read ticket_attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'ticket_attachments');

-- Service role / backend uploads use the service key (bypasses RLS).
-- Authenticated users may upload into their own prefix when using anon key paths.
DROP POLICY IF EXISTS "Auth insert user_avatars" ON storage.objects;
CREATE POLICY "Auth insert user_avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'user_avatars');

DROP POLICY IF EXISTS "Auth update user_avatars" ON storage.objects;
CREATE POLICY "Auth update user_avatars"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'user_avatars');

DROP POLICY IF EXISTS "Auth insert ticket_attachments" ON storage.objects;
CREATE POLICY "Auth insert ticket_attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'ticket_attachments');
