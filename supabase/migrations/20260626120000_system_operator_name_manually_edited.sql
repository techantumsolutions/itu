-- Preserve admin-edited operator display names during provider sync.
alter table if exists system_operators
  add column if not exists name_manually_edited boolean not null default false;

create index if not exists idx_system_operators_name_manually_edited
  on system_operators (name_manually_edited)
  where name_manually_edited = true;
