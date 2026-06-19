-- Insert a new bucket for Ads Media
INSERT INTO storage.buckets (id, name, public)
VALUES ('ads_media', 'ads_media', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to ads_media
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'ads_media' );

-- Admins can insert/update/delete
CREATE POLICY "Admin Insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'ads_media' AND (auth.jwt() ->> 'role') = 'super_admin' );

CREATE POLICY "Admin Update"
ON storage.objects FOR UPDATE
TO authenticated
USING ( bucket_id = 'ads_media' AND (auth.jwt() ->> 'role') = 'super_admin' );

CREATE POLICY "Admin Delete"
ON storage.objects FOR DELETE
TO authenticated
USING ( bucket_id = 'ads_media' AND (auth.jwt() ->> 'role') = 'super_admin' );
