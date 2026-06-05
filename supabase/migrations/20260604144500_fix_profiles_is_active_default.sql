-- Set default value for is_active to true
ALTER TABLE profiles ALTER COLUMN is_active SET DEFAULT true;

-- Update existing profiles where is_active is null to true
UPDATE profiles SET is_active = true WHERE is_active IS NULL;
