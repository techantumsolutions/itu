-- Include phone/country on admin customer spend and ignore abandoned pending_payment rows.
drop view if exists admin_customer_spend;

create view admin_customer_spend as
select
  p.id as user_id,
  p.email,
  p.name,
  p.phone,
  p.country_code,
  p.country,
  p.app_role,
  coalesce(sum(case when t.status = 'completed' then t.amount else 0 end), 0) as total_spend,
  count(t.id) filter (where t.status is distinct from 'pending_payment') as transaction_count,
  max(t.created_at) filter (where t.status is distinct from 'pending_payment') as last_transaction_at
from profiles p
left join transactions t on t.user_id = p.id and t.status is distinct from 'pending_payment'
group by p.id, p.email, p.name, p.phone, p.country_code, p.country, p.app_role;

-- Recreating the view drops prior grants; restore read access for API roles.
grant select on public.admin_customer_spend to service_role;
grant select on public.admin_customer_spend to authenticated;
grant select on public.admin_customer_spend to anon;
