create or replace function private.is_family_member(target_family uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.family_members as family_member
    where family_member.family_id = target_family
      and family_member.user_id = (select auth.uid())
  );
$$;

create or replace function private.is_family_owner(target_family uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.family_members as family_member
    where family_member.family_id = target_family
      and family_member.user_id = (select auth.uid())
      and family_member.role = 'owner'
  );
$$;

create or replace function private.has_other_family_owner(target_family uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.family_members as family_member
    where family_member.family_id = target_family
      and family_member.user_id <> (select auth.uid())
      and family_member.role = 'owner'
  );
$$;

revoke all on function private.is_family_member(uuid) from public, anon;
revoke all on function private.is_family_owner(uuid) from public, anon;
revoke all on function private.has_other_family_owner(uuid) from public, anon;
grant execute on function private.is_family_member(uuid) to authenticated, service_role;
grant execute on function private.is_family_owner(uuid) to authenticated, service_role;
grant execute on function private.has_other_family_owner(uuid) to authenticated, service_role;

revoke all on function public.is_family_member(uuid) from public, anon, authenticated, service_role;
revoke all on function public.is_family_owner(uuid) from public, anon, authenticated, service_role;
revoke all on function public.has_other_family_owner(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.on_auth_user_created() from public, anon, authenticated, service_role;

revoke all on public.login_attempts from public, anon, authenticated;
revoke all on public.care_event_pushes from public, anon, authenticated;
revoke all on public.push_delivery_receipts from public, anon, authenticated;

drop policy if exists "family members read family" on public.families;
create policy "family members read family" on public.families
for select to authenticated using (private.is_family_member(id));

drop policy if exists "family owners update family" on public.families;
create policy "family owners update family" on public.families
for update to authenticated using (private.is_family_owner(id)) with check (private.is_family_owner(id));

drop policy if exists "members read membership" on public.family_members;
create policy "members read membership" on public.family_members
for select to authenticated using (private.is_family_member(family_id));

drop policy if exists "owners manage family members" on public.family_members;
create policy "owners manage family members" on public.family_members
for delete to authenticated using (
  private.is_family_owner(family_id)
  and (user_id <> (select auth.uid()) or private.has_other_family_owner(family_id))
);

drop policy if exists "members read pets" on public.pets;
create policy "members read pets" on public.pets
for select to authenticated using (private.is_family_member(family_id));

drop policy if exists "owners insert pets" on public.pets;
create policy "owners insert pets" on public.pets
for insert to authenticated with check (private.is_family_owner(family_id));

drop policy if exists "owners update pets" on public.pets;
create policy "owners update pets" on public.pets
for update to authenticated using (private.is_family_owner(family_id)) with check (private.is_family_owner(family_id));

drop policy if exists "owners delete pets" on public.pets;
create policy "owners delete pets" on public.pets
for delete to authenticated using (private.is_family_owner(family_id));

drop policy if exists "members read care events" on public.care_events;
create policy "members read care events" on public.care_events
for select to authenticated using (private.is_family_member(family_id));

drop policy if exists "members add care events" on public.care_events;
create policy "members add care events" on public.care_events
for insert to authenticated with check (
  private.is_family_member(care_events.family_id)
  and author_id = (select auth.uid())
  and exists (
    select 1 from public.pets as pet
    where pet.id = care_events.pet_id and pet.family_id = care_events.family_id
  )
);

drop policy if exists "authors and owners update care events" on public.care_events;
create policy "authors and owners update care events" on public.care_events
for update to authenticated
using (author_id = (select auth.uid()) or private.is_family_owner(family_id))
with check (
  private.is_family_member(care_events.family_id)
  and (author_id = (select auth.uid()) or private.is_family_owner(care_events.family_id))
  and exists (
    select 1 from public.pets as pet
    where pet.id = care_events.pet_id and pet.family_id = care_events.family_id
  )
);

drop policy if exists "owners delete care events" on public.care_events;
create policy "owners delete care events" on public.care_events
for delete to authenticated using (private.is_family_owner(family_id));

drop policy if exists "members read schedules" on public.care_schedules;
create policy "members read schedules" on public.care_schedules
for select to authenticated using (private.is_family_member(family_id));

drop policy if exists "owners manage schedules" on public.care_schedules;
create policy "owners manage schedules" on public.care_schedules
for all to authenticated using (private.is_family_owner(family_id)) with check (private.is_family_owner(family_id));

drop policy if exists "owners read invites" on public.family_invites;
create policy "owners read invites" on public.family_invites
for select to authenticated using (private.is_family_owner(family_id));
