begin;

-- Lemon Squeezy customers are grouped by checkout email. A customer can pay
-- for distinct Woff accounts, whose ownership is established by the signed
-- checkout reservation. Customer uniqueness must not reject a valid payment.
-- Keep subscription_id unique: a subscription still belongs to one account.
alter table public.sender_entitlements
  drop constraint sender_entitlements_customer_id_key;

create index sender_entitlements_customer_id_idx
  on public.sender_entitlements (customer_id);

commit;
