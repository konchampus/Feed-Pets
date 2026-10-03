create table if not exists public.push_delivery_receipts (
  event_id uuid references public.care_events(id) on delete cascade,
  schedule_id uuid references public.care_schedules(id) on delete cascade,
  local_date date,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  delivered_at timestamptz not null default now(),
  constraint push_delivery_receipts_target check (
    (event_id is not null and schedule_id is null and local_date is null)
    or (event_id is null and schedule_id is not null and local_date is not null)
  )
);

create unique index if not exists push_delivery_receipts_event_idx
  on public.push_delivery_receipts(event_id, subscription_id) where event_id is not null;
create unique index if not exists push_delivery_receipts_schedule_idx
  on public.push_delivery_receipts(schedule_id, local_date, subscription_id) where schedule_id is not null;

alter table public.push_delivery_receipts enable row level security;
revoke all on public.push_delivery_receipts from public, anon, authenticated;
grant all on public.push_delivery_receipts to service_role;

create or replace function public.claim_care_event_push(target_event uuid, requesting_user uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  new_token uuid := gen_random_uuid();
  claimed_token uuid;
begin
  if not exists (
    select 1 from public.care_events
    where id = target_event and author_id = requesting_user
  ) then
    return null;
  end if;

  insert into public.care_event_pushes (event_id, claim_token)
  values (target_event, new_token)
  on conflict (event_id) do update
    set claimed_at = now(), claim_token = excluded.claim_token
    where public.care_event_pushes.sent_at is null
      and public.care_event_pushes.claimed_at < now() - interval '180 seconds'
  returning claim_token into claimed_token;

  return claimed_token;
end;
$$;

create or replace function public.record_care_event_push_delivery(target_event uuid, claim_token uuid, target_subscription uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.care_event_pushes
    where event_id = $1 and public.care_event_pushes.claim_token = $2 and sent_at is null
  ) then
    return false;
  end if;

  insert into public.push_delivery_receipts (event_id, subscription_id)
  values ($1, $3)
  on conflict do nothing;
  return true;
end;
$$;

create or replace function public.release_care_event_push(target_event uuid, claim_token uuid)
returns void language sql security definer set search_path = ''
as $$
  update public.care_event_pushes
  set claimed_at = now() - interval '181 seconds'
  where event_id = $1 and public.care_event_pushes.claim_token = $2 and sent_at is null;
$$;

create or replace function public.claim_care_schedule(schedule_id uuid, local_date date)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare new_token uuid := gen_random_uuid();
begin
  update public.care_schedules
  set notification_claimed_at = now(), notification_claimed_for = $2, notification_claim_token = new_token
  where id = $1
    and is_active
    and (last_notified_for is null or last_notified_for < $2)
    and (notification_claimed_at is null or notification_claimed_at < now() - interval '180 seconds');
  if not found then return null; end if;

  delete from public.push_delivery_receipts
  where public.push_delivery_receipts.schedule_id = $1
    and public.push_delivery_receipts.local_date < $2;
  return new_token;
end;
$$;

create or replace function public.record_care_schedule_push_delivery(target_schedule uuid, local_date date, claim_token uuid, target_subscription uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.care_schedules
    where id = $1 and notification_claimed_for = $2 and notification_claim_token = $3
  ) then
    return false;
  end if;

  insert into public.push_delivery_receipts (schedule_id, local_date, subscription_id)
  values ($1, $2, $4)
  on conflict do nothing;
  return true;
end;
$$;

revoke all on function public.claim_care_event_push(uuid, uuid) from public, anon, authenticated;
revoke all on function public.record_care_event_push_delivery(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.record_care_schedule_push_delivery(uuid, date, uuid, uuid) from public, anon, authenticated;
revoke all on function public.claim_care_schedule(uuid, date) from public, anon, authenticated;
grant execute on function public.claim_care_event_push(uuid, uuid) to service_role;
grant execute on function public.record_care_event_push_delivery(uuid, uuid, uuid) to service_role;
grant execute on function public.claim_care_schedule(uuid, date) to service_role;
grant execute on function public.record_care_schedule_push_delivery(uuid, date, uuid, uuid) to service_role;
