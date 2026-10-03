create index if not exists care_events_author_id_idx
  on public.care_events(author_id);
create index if not exists care_schedules_created_by_idx
  on public.care_schedules(created_by);
create index if not exists care_schedules_family_id_idx
  on public.care_schedules(family_id);
create index if not exists care_schedules_pet_id_idx
  on public.care_schedules(pet_id);
create index if not exists families_created_by_idx
  on public.families(created_by);
create index if not exists family_invites_family_id_idx
  on public.family_invites(family_id);
create index if not exists family_invites_invited_by_idx
  on public.family_invites(invited_by);
create index if not exists pets_family_id_idx
  on public.pets(family_id);
create index if not exists push_delivery_receipts_subscription_id_idx
  on public.push_delivery_receipts(subscription_id);
create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions(user_id);

alter table public.push_delivery_receipts
  add column id uuid not null default gen_random_uuid();
alter table public.push_delivery_receipts
  add constraint push_delivery_receipts_pkey primary key (id);

drop policy if exists "owners manage schedules" on public.care_schedules;
create policy "owners insert schedules" on public.care_schedules
  for insert to authenticated
  with check (private.is_family_owner(family_id));
create policy "owners update schedules" on public.care_schedules
  for update to authenticated
  using (private.is_family_owner(family_id))
  with check (private.is_family_owner(family_id));
create policy "owners delete schedules" on public.care_schedules
  for delete to authenticated
  using (private.is_family_owner(family_id));

drop policy if exists "user read own push" on public.push_subscriptions;
