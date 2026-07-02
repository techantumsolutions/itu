SELECT
id,
email,
encrypted_password IS NOT NULL AS has_password,
email_confirmed_at,
banned_until,
last_sign_in_at
FROM auth.users
WHERE email='admin@itu.com';