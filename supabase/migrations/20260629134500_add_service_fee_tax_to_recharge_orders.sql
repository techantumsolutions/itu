-- Migration: Add service_fee and tax columns to recharge_orders
alter table recharge_orders add column if not exists service_fee numeric default 0;
alter table recharge_orders add column if not exists tax numeric default 0;
