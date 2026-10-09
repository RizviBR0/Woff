-- Missing configuration must never become an implicit Test or Live admission.
begin;

create or replace function public.reserve_sender_checkout()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare cfg woff_private.pilot_capacity; ent public.sender_entitlements; reservation woff_private.sender_checkout_reservations; seats integer;
begin
  if not woff_private.is_verified_sender(auth.uid()) then raise exception 'Verify your email'; end if;
  perform pg_advisory_xact_lock(7814462001);
  select * into cfg from woff_private.pilot_capacity where id=1;
  if not found or not coalesce(cfg.checkout_enabled,false) or coalesce(cfg.capacity_bytes,0)<=0 then
    raise exception 'Checkout capacity is not ready';
  end if;
  select * into ent from public.sender_entitlements where user_id=auth.uid() for update;
  if not found then raise exception 'Sender account required'; end if;
  if ent.billing_capacity_reserved or greatest(ent.pro_until,ent.grace_until)>now()
    or (ent.subscription_id is not null and ent.status not in ('expired','unpaid','refunded')) then raise exception 'Manage your existing subscription'; end if;
  select * into reservation from woff_private.sender_checkout_reservations where user_id=auth.uid();
  if found and reservation.consumed_at is null and reservation.expires_at>now() then
    if reservation.billing_test_mode is distinct from cfg.billing_test_mode then raise exception 'Checkout mode mismatch'; end if;
    if reservation.checkout_url is null then raise exception 'Checkout is already being prepared'; end if;
    return jsonb_build_object('reservation_id',reservation.id,'expires_at',reservation.expires_at,'checkout_url',reservation.checkout_url);
  end if;
  select count(*) into seats from (
    select user_id from public.sender_entitlements where billing_capacity_reserved or (plan='pro' and greatest(pro_until,grace_until)>now())
    union select user_id from woff_private.sender_checkout_reservations where consumed_at is null and expires_at>now()
  ) cohort;
  if seats>=cfg.max_paid_accounts or woff_private.committed_storage_bytes()+(case when cfg.billing_test_mode then 0 else 1073741824 end)>cfg.capacity_bytes then raise exception 'Pro pilot is full'; end if;
  insert into woff_private.sender_checkout_reservations(user_id,billing_test_mode) values(auth.uid(),cfg.billing_test_mode)
    on conflict(user_id) do update set id=gen_random_uuid(),expires_at=now()+interval '30 minutes',consumed_at=null,checkout_url=null,billing_test_mode=excluded.billing_test_mode
    returning * into reservation;
  return jsonb_build_object('reservation_id',reservation.id,'expires_at',reservation.expires_at);
end $$;

revoke all on function public.reserve_sender_checkout() from public,anon,authenticated;
grant execute on function public.reserve_sender_checkout() to authenticated;

commit;
