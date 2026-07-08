-- Add about_role column to careers_jobs
alter table careers_jobs add column if not exists about_role text;
