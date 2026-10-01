create or replace function public.redeem_family_invite(invite_hash text, joining_user uuid, joining_email text)
returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  invite public.family_invites%rowtype;
begin
  select * into invite from public.family_invites
  where token_hash = invite_hash
  for update;

  if not found or invite.redeemed_at is not null or invite.expires_at <= now() then
    return null;
  end if;
  if invite.invited_email is not null and lower(invite.invited_email) <> lower(coalesce(joining_email, '')) then
    return null;
  end if;
  if exists (select 1 from public.family_members where user_id = joining_user) then
    return null;
  end if;

  insert into public.family_members (family_id, user_id, role)
  values (invite.family_id, joining_user, 'member')
  on conflict do nothing;
  update public.family_invites set redeemed_at = now() where id = invite.id;
  return invite.family_id;
end;
$$;

revoke all on function public.redeem_family_invite(text, uuid, text) from public, anon, authenticated;
grant execute on function public.redeem_family_invite(text, uuid, text) to service_role;

create or replace function public.claim_care_schedule(schedule_id uuid, local_date date)
returns boolean language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  update public.care_schedules
  set last_notified_for = local_date
  where id = schedule_id
    and is_active
    and (last_notified_for is null or last_notified_for < local_date);
  return found;
end;
$$;

revoke all on function public.claim_care_schedule(uuid, date) from public, anon, authenticated;
grant execute on function public.claim_care_schedule(uuid, date) to service_role;

revoke all on function public.is_family_member(uuid) from public, anon;
revoke all on function public.is_family_owner(uuid) from public, anon;
grant execute on function public.is_family_member(uuid) to authenticated, service_role;
grant execute on function public.is_family_owner(uuid) to authenticated, service_role;
revoke all on function public.has_other_family_owner(uuid, uuid) from public, anon;
grant execute on function public.has_other_family_owner(uuid, uuid) to authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'care_events'
     ) then
    execute 'alter publication supabase_realtime add table public.care_events';
  end if;
end;
$$;
