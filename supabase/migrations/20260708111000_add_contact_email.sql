-- Add contact_email column to careers_jobs
alter table careers_jobs add column if not exists contact_email text;
