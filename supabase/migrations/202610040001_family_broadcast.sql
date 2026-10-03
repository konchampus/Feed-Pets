create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create or replace function private.can_receive_family_broadcast(target_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when target_topic ~ '^family:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      exists (
        select 1
        from public.family_members as family_member
        where family_member.family_id = substring(target_topic from 8)::uuid
          and family_member.user_id = (select auth.uid())
      )
    else false
  end;
$$;

revoke all on function private.can_receive_family_broadcast(text) from public, anon;
grant execute on function private.can_receive_family_broadcast(text) to authenticated, service_role;

create or replace function public.broadcast_family_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_family_id uuid;
begin
  if tg_op = 'UPDATE' and old.family_id is distinct from new.family_id then
    perform realtime.send(
      jsonb_build_object('operation', tg_op, 'table', tg_table_name),
      tg_op,
      'family:' || old.family_id::text,
      true
    );
  end if;

  if tg_op = 'DELETE' then
    target_family_id := old.family_id;
  else
    target_family_id := new.family_id;
  end if;

  perform realtime.send(
    jsonb_build_object('operation', tg_op, 'table', tg_table_name),
    tg_op,
    'family:' || target_family_id::text,
    true
  );

  return null;
end;
$$;

revoke all on function public.broadcast_family_changes() from public, anon, authenticated;

drop trigger if exists broadcast_family_changes on public.pets;
create trigger broadcast_family_changes
after insert or update or delete on public.pets
for each row execute function public.broadcast_family_changes();

drop trigger if exists broadcast_family_changes on public.care_events;
create trigger broadcast_family_changes
after insert or update or delete on public.care_events
for each row execute function public.broadcast_family_changes();

drop trigger if exists broadcast_family_changes on public.care_schedules;
create trigger broadcast_family_changes
after insert or update or delete on public.care_schedules
for each row execute function public.broadcast_family_changes();

drop trigger if exists broadcast_family_members_removed on public.family_members;
create trigger broadcast_family_members_removed
after delete on public.family_members
for each row execute function public.broadcast_family_changes();

drop policy if exists "authenticated family broadcast read" on realtime.messages;
create policy "authenticated family broadcast read"
on realtime.messages
for select
to authenticated
using (
  extension = 'broadcast'
  and private.can_receive_family_broadcast((select realtime.topic()))
);
