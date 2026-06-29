-- Migration: Add currency column to reward_rules
alter table reward_rules add column if not exists currency varchar default 'USD';
