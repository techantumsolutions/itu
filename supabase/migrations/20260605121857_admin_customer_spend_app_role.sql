-- Add app_role to admin_customer_spend view
create or replace view admin_customer_spend as
select
  p.id as user_id,
  p.email,
  p.name,
  p.app_role,
  coalesce(sum(case when t.status = 'completed' then t.amount else 0 end), 0) as total_spend,
  count(t.id) as transaction_count,
  max(t.created_at) as last_transaction_at
from profiles p
left join transactions t on t.user_id = p.id
group by p.id, p.email, p.name, p.app_role;
