alter table public.care_schedules
  add column if not exists notification_claimed_at timestamptz,
  add column if not exists notification_claimed_for date,
  add column if not exists notification_claim_token uuid;

create table if not exists public.care_event_pushes (
  event_id uuid primary key references public.care_events(id) on delete cascade,
  claimed_at timestamptz not null default now(),
  claim_token uuid not null default gen_random_uuid(),
  sent_at timestamptz
);

alter table public.care_event_pushes enable row level security;
revoke all on public.care_event_pushes from public, anon, authenticated;

drop function if exists public.claim_care_event_push(uuid, uuid);
create function public.claim_care_event_push(target_event uuid, requesting_user uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp
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
      and public.care_event_pushes.claimed_at < now() - interval '30 seconds'
  returning claim_token into claimed_token;

  return claimed_token;
end;
$$;

drop function if exists public.complete_care_event_push(uuid);
create or replace function public.complete_care_event_push(target_event uuid, claim_token uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  update public.care_event_pushes
  set sent_at = now()
  where event_id = target_event and public.care_event_pushes.claim_token = $2 and sent_at is null;
  return found;
end;
$$;

drop function if exists public.release_care_event_push(uuid);
create or replace function public.release_care_event_push(target_event uuid, claim_token uuid)
returns void language sql security definer set search_path = public, pg_temp
as $$
  delete from public.care_event_pushes
  where event_id = target_event and public.care_event_pushes.claim_token = $2 and sent_at is null;
$$;

drop function if exists public.claim_care_schedule(uuid, date);
drop function if exists public.complete_care_schedule(uuid, date);
drop function if exists public.release_care_schedule(uuid);
create function public.claim_care_schedule(schedule_id uuid, local_date date)
returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare new_token uuid := gen_random_uuid();
begin
  update public.care_schedules
  set notification_claimed_at = now(), notification_claimed_for = local_date, notification_claim_token = new_token
  where id = schedule_id
    and is_active
    and (last_notified_for is null or last_notified_for < local_date)
    and (notification_claimed_at is null or notification_claimed_at < now() - interval '30 seconds');
  if not found then return null; end if;
  return new_token;
end;
$$;

create or replace function public.complete_care_schedule(schedule_id uuid, local_date date, claim_token uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  update public.care_schedules
  set last_notified_for = local_date, notification_claimed_at = null, notification_claimed_for = null, notification_claim_token = null
  where id = schedule_id and notification_claimed_for = local_date and notification_claim_token = $3;
  return found;
end;
$$;

create or replace function public.release_care_schedule(schedule_id uuid, claim_token uuid)
returns void language sql security definer set search_path = public, pg_temp
as $$
  update public.care_schedules
  set notification_claimed_at = null, notification_claimed_for = null, notification_claim_token = null
  where id = schedule_id and notification_claim_token = $2;
$$;

revoke all on function public.claim_care_event_push(uuid, uuid) from public, anon, authenticated;
revoke all on function public.complete_care_event_push(uuid, uuid) from public, anon, authenticated;
revoke all on function public.release_care_event_push(uuid, uuid) from public, anon, authenticated;
revoke all on function public.claim_care_schedule(uuid, date) from public, anon, authenticated;
revoke all on function public.complete_care_schedule(uuid, date, uuid) from public, anon, authenticated;
revoke all on function public.release_care_schedule(uuid, uuid) from public, anon, authenticated;

grant execute on function public.claim_care_event_push(uuid, uuid) to service_role;
grant execute on function public.complete_care_event_push(uuid, uuid) to service_role;
grant execute on function public.release_care_event_push(uuid, uuid) to service_role;
grant execute on function public.claim_care_schedule(uuid, date) to service_role;
grant execute on function public.complete_care_schedule(uuid, date, uuid) to service_role;
grant execute on function public.release_care_schedule(uuid, uuid) to service_role;
