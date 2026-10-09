-- Incorporated into the launch migration by the schema owner. No remote writes.
create table woff_private.pilot_capacity (
  id integer primary key check (id = 1),
  checkout_enabled boolean not null default false,
  capacity_bytes bigint not null default 0 check (capacity_bytes >= 0),
  max_paid_accounts integer not null default 5 check (max_paid_accounts between 1 and 5),
  billing_test_mode boolean not null default false
);
insert into woff_private.pilot_capacity(id) values(1);
create table woff_private.sender_checkout_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  consumed_at timestamptz,
  checkout_url text
);
create table woff_private.billing_events (
  event_key text primary key check (event_key ~ '^[a-f0-9]{64}$'),
  event_name text not null,
  subscription_id text not null,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  disposition text not null default 'received',
  payload jsonb not null default '{}'::jsonb
);
alter table woff_private.pilot_capacity enable row level security;
alter table woff_private.sender_checkout_reservations enable row level security;
alter table woff_private.billing_events enable row level security;
revoke all on woff_private.pilot_capacity, woff_private.sender_checkout_reservations, woff_private.billing_events from public, anon, authenticated;
grant all on woff_private.pilot_capacity, woff_private.sender_checkout_reservations, woff_private.billing_events to service_role;

-- One lock covers checkout admission and upload reservations. Expired physical
-- objects remain charged until cleanup actually removes them.
create function woff_private.committed_storage_bytes()
returns bigint language plpgsql security definer set search_path = '' as $$
declare total_bytes bigint; reserved_bytes bigint;
begin
  if exists(select 1 from storage.objects where bucket_id = 'files'
    and coalesce(metadata->>'size','') !~ '^[0-9]+$') then
    raise exception 'Storage accounting requires complete object sizes';
  end if;
  select coalesce(sum((metadata->>'size')::bigint),0) into total_bytes
    from storage.objects where bucket_id = 'files';
  total_bytes := total_bytes + coalesce((select sum(u.size) from public.upload_intents u
    where not exists(select 1 from storage.objects o where o.bucket_id='files' and o.name=u.path)),0);
  with paid as (
    select user_id from public.sender_entitlements where billing_capacity_reserved or (plan='pro' and greatest(pro_until,grace_until)>now())
    union select user_id from woff_private.sender_checkout_reservations where consumed_at is null and expires_at>now()
  ), ownership as (
    select p.user_id, coalesce((select sum((o.metadata->>'size')::bigint)
      from storage.objects o join public.spaces s on s.id::text=split_part(o.name,'/',1)
      where o.bucket_id='files' and s.creator_device_id=p.user_id::text),0)
      + coalesce((select sum(u.size) from public.upload_intents u join public.spaces s on s.id=u.space_id
        where s.creator_device_id=p.user_id::text and not exists(select 1 from storage.objects o
          where o.bucket_id='files' and o.name=u.path)),0) as owned_bytes
    from paid p
  ) select coalesce(sum(greatest(1073741824::bigint-owned_bytes,0)),0) into reserved_bytes from ownership;
  return total_bytes + reserved_bytes;
end $$;

create function woff_private.upload_capacity_available(p_owner text,p_bytes bigint)
returns boolean language plpgsql security definer set search_path = '' as $$
declare capacity bigint; paid boolean;
begin
  perform pg_advisory_xact_lock(7814462001);
  select capacity_bytes into capacity from woff_private.pilot_capacity where id=1;
  if coalesce(capacity,0)=0 then return true; end if;
  paid := exists(select 1 from public.sender_entitlements where user_id::text=p_owner and billing_capacity_reserved)
    or woff_private.owner_is_pro(p_owner) or exists(select 1 from woff_private.sender_checkout_reservations
    where user_id::text=p_owner and consumed_at is null and expires_at>now());
  return woff_private.committed_storage_bytes() + case when paid then 0 else greatest(p_bytes,0) end <= capacity;
end $$;

create function public.reserve_sender_checkout()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare cfg woff_private.pilot_capacity; ent public.sender_entitlements; reservation woff_private.sender_checkout_reservations; seats integer;
begin
  if not woff_private.is_verified_sender(auth.uid()) then raise exception 'Verify your email'; end if;
  perform pg_advisory_xact_lock(7814462001);
  select * into cfg from woff_private.pilot_capacity where id=1;
  if not cfg.checkout_enabled or cfg.capacity_bytes=0 then raise exception 'Checkout capacity is not ready'; end if;
  select * into ent from public.sender_entitlements where user_id=auth.uid() for update;
  if not found then raise exception 'Sender account required'; end if;
  if ent.billing_capacity_reserved or greatest(ent.pro_until,ent.grace_until)>now()
    or (ent.subscription_id is not null and ent.status not in ('expired','unpaid','refunded')) then raise exception 'Manage your existing subscription'; end if;
  select * into reservation from woff_private.sender_checkout_reservations where user_id=auth.uid();
  if found and reservation.consumed_at is null and reservation.expires_at>now() then
    if reservation.checkout_url is null then raise exception 'Checkout is already being prepared'; end if;
    return jsonb_build_object('reservation_id',reservation.id,'expires_at',reservation.expires_at,'checkout_url',reservation.checkout_url);
  end if;
  select count(*) into seats from (
    select user_id from public.sender_entitlements where billing_capacity_reserved or (plan='pro' and greatest(pro_until,grace_until)>now())
    union select user_id from woff_private.sender_checkout_reservations where consumed_at is null and expires_at>now()
  ) cohort;
  if seats>=cfg.max_paid_accounts or woff_private.committed_storage_bytes()+1073741824>cfg.capacity_bytes then raise exception 'Pro pilot is full'; end if;
  insert into woff_private.sender_checkout_reservations(user_id) values(auth.uid())
    on conflict(user_id) do update set id=gen_random_uuid(),expires_at=now()+interval '30 minutes',consumed_at=null,checkout_url=null
    returning * into reservation;
  return jsonb_build_object('reservation_id',reservation.id,'expires_at',reservation.expires_at);
end $$;

create function public.record_sender_checkout(p_user_id uuid,p_reservation_id uuid,p_checkout_url text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_checkout_url is null or char_length(p_checkout_url)>4096
    or p_checkout_url !~ '^https://([a-zA-Z0-9-]+\.)*lemonsqueezy\.com/' then raise exception 'Invalid checkout URL'; end if;
  update woff_private.sender_checkout_reservations set checkout_url=p_checkout_url
    where id=p_reservation_id and user_id=p_user_id and consumed_at is null and expires_at>now() and checkout_url is null;
  return found;
end $$;

create function public.release_sender_checkout(p_reservation_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not woff_private.is_verified_sender(auth.uid()) then raise exception 'Verify your email'; end if;
  -- Admission leases cannot be released by browsers: an already-issued provider
  -- checkout remains payable until its deadline. This RPC is deliberately inert.
  return false;
end $$;

create function public.process_billing_event(
  p_event_key text,p_event_name text,p_occurred_at timestamptz,p_user_id uuid,
  p_customer_id text,p_subscription_id text,p_status text,p_pro_until timestamptz,
  p_test_mode boolean,p_payload jsonb,p_reservation_id uuid default null,p_capacity_reserved boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare ent public.sender_entitlements; cfg woff_private.pilot_capacity; reservation woff_private.sender_checkout_reservations; next_until timestamptz; next_grace timestamptz; seats integer;
begin
  -- EXECUTE is granted only to service_role below; no browser role may call it.
  if not woff_private.is_verified_sender(p_user_id) then raise exception 'Verified sender required'; end if;
  if p_event_key is null or p_event_key !~ '^[a-f0-9]{64}$'
    or p_customer_id is null or p_customer_id !~ '^[0-9]+$'
    or p_subscription_id is null or p_subscription_id !~ '^[0-9]+$'
    or p_status is null or p_status not in ('active','on_trial','paused','past_due','unpaid','cancelled','expired','refunded')
    or p_event_name is null or p_event_name not in ('subscription_created','subscription_updated','subscription_cancelled',
      'subscription_resumed','subscription_expired','subscription_paused','subscription_unpaused',
      'subscription_payment_success','subscription_payment_failed','subscription_payment_recovered','subscription_payment_refunded')
    or p_test_mode is null or p_payload is null or p_capacity_reserved is null
    or p_occurred_at is null or p_occurred_at>now()+interval '5 minutes'
    or pg_column_size(p_payload)>8192 then raise exception 'Invalid billing event'; end if;
  perform pg_advisory_xact_lock(7814462001);
  select * into cfg from woff_private.pilot_capacity where id=1;
  if p_test_mode is distinct from cfg.billing_test_mode then raise exception 'Billing mode mismatch'; end if;
  insert into woff_private.billing_events(event_key,event_name,subscription_id,occurred_at,payload)
    values(p_event_key,p_event_name,p_subscription_id,p_occurred_at,p_payload) on conflict do nothing;
  if not found then return jsonb_build_object('processed',false,'ignored','duplicate'); end if;
  select * into ent from public.sender_entitlements where user_id=p_user_id for update;
  if not found then raise exception 'Sender account required'; end if;
  if ent.subscription_id is distinct from p_subscription_id then
    if ent.billing_capacity_reserved or greatest(ent.pro_until,ent.grace_until)>now() then raise exception 'Existing paid subscription'; end if;
    select * into reservation from woff_private.sender_checkout_reservations
      where id=p_reservation_id and user_id=p_user_id and consumed_at is null for update;
    if not found then raise exception 'Valid checkout reservation required'; end if;
    if reservation.expires_at<now() then
      -- A payment made just before checkout expiry can be delivered late. Admit
      -- it only if full allowance and a pilot seat can still be honored.
      select count(*) into seats from (
        select user_id from public.sender_entitlements where billing_capacity_reserved or (plan='pro' and greatest(pro_until,grace_until)>now())
        union select user_id from woff_private.sender_checkout_reservations where consumed_at is null and expires_at>now()
      ) cohort;
      if seats>=cfg.max_paid_accounts or cfg.capacity_bytes=0
        or woff_private.committed_storage_bytes()+1073741824>cfg.capacity_bytes then
        raise exception 'Late payment requires capacity review';
      end if;
    end if;
    update woff_private.sender_checkout_reservations set consumed_at=now() where id=reservation.id;
  elsif ent.customer_id is distinct from p_customer_id then raise exception 'Customer mismatch';
  end if;
  if ent.subscription_id=p_subscription_id and ent.billing_updated_at>=p_occurred_at then
    update woff_private.billing_events set disposition='stale' where event_key=p_event_key;
    return jsonb_build_object('processed',false,'ignored','stale');
  end if;
  if ent.subscription_id=p_subscription_id and not ent.billing_capacity_reserved
    and coalesce(greatest(ent.pro_until,ent.grace_until)>now(),false)=false
    and (p_capacity_reserved or (p_status in ('active','cancelled') and p_pro_until>now())) then
    -- A provider can reactivate an ended subscription without a new Woff
    -- checkout. Its former seat may now belong to somebody else.
    select count(*) into seats from (
      select user_id from public.sender_entitlements where billing_capacity_reserved or (plan='pro' and greatest(pro_until,grace_until)>now())
      union select user_id from woff_private.sender_checkout_reservations where consumed_at is null and expires_at>now()
    ) cohort where user_id<>p_user_id;
    if seats>=cfg.max_paid_accounts or cfg.capacity_bytes=0
      or (not exists(select 1 from woff_private.sender_checkout_reservations where user_id=p_user_id and consumed_at is null and expires_at>now())
        and woff_private.committed_storage_bytes()+1073741824>cfg.capacity_bytes) then
      raise exception 'Reactivated payment requires capacity review';
    end if;
  end if;
  next_until := ent.pro_until;
  next_grace := null;
  if p_status in ('active','cancelled') then
    if p_pro_until is null or p_pro_until>now()+interval '40 days' then raise exception 'Monthly paid deadline required'; end if;
    next_until := p_pro_until;
  elsif p_status='past_due' then
    -- A failure never advances paid-through to the next retry. Three days of
    -- grace are anchored to the last paid period, never refreshed by retries.
    if ent.status in ('active','cancelled','past_due') then
      next_grace := coalesce(ent.grace_until,ent.pro_until+interval '3 days');
    end if;
  elsif p_status in ('unpaid','expired','refunded','on_trial','paused') then
    next_until := least(coalesce(ent.pro_until,now()),now());
  end if;
  update public.sender_entitlements set plan=case when greatest(next_until,next_grace)>now() then 'pro' else 'free' end,
    status=p_status,pro_until=next_until,grace_until=next_grace,customer_id=p_customer_id,
    subscription_id=p_subscription_id,billing_updated_at=p_occurred_at,billing_capacity_reserved=p_capacity_reserved where user_id=p_user_id;
  update woff_private.billing_events set disposition='processed' where event_key=p_event_key;
  return jsonb_build_object('processed',true,'is_pro',coalesce(greatest(next_until,next_grace)>now(),false));
end $$;

revoke all on function woff_private.committed_storage_bytes(),woff_private.upload_capacity_available(text,bigint) from public,anon,authenticated;
revoke all on function public.reserve_sender_checkout(),public.release_sender_checkout(uuid) from public,anon,authenticated;
grant execute on function public.reserve_sender_checkout(),public.release_sender_checkout(uuid) to authenticated;
revoke all on function public.record_sender_checkout(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.record_sender_checkout(uuid,uuid,text) to service_role;
revoke all on function public.process_billing_event(text,text,timestamptz,uuid,text,text,text,timestamptz,boolean,jsonb,uuid,boolean) from public,anon,authenticated;
grant execute on function public.process_billing_event(text,text,timestamptz,uuid,text,text,text,timestamptz,boolean,jsonb,uuid,boolean) to service_role;
