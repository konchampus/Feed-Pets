create extension if not exists pgcrypto with schema extensions;

create type public.family_role as enum ('owner', 'member');
create type public.care_kind as enum ('meal', 'walk', 'water', 'medicine', 'weight', 'vet', 'vaccine');

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  constraint profiles_username_format check (username is null or username ~ '^[a-zA-Z0-9_.-]{3,32}$')
);
create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table public.family_members (
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.family_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (family_id, user_id)
);
create unique index family_members_one_family_per_user_idx on public.family_members(user_id);
create table public.pets (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null,
  breed text not null default '',
  birthday date,
  sex text check (sex is null or sex in ('female', 'male', 'unknown')),
  photo_url text,
  allergies text not null default '',
  health_notes text not null default '',
  created_at timestamptz not null default now()
);
create table public.care_events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users(id),
  actor_name text not null default '',
  kind public.care_kind not null,
  occurred_at timestamptz not null default now(),
  amount numeric(10,2),
  unit text check (unit is null or unit in ('g', 'мин', 'мл', 'мг', 'кг')),
  label text,
  note text,
  created_at timestamptz not null default now()
);
create index care_events_family_time_idx on public.care_events(family_id, occurred_at desc);
create index care_events_pet_time_idx on public.care_events(pet_id, occurred_at desc);
create table public.care_schedules (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id),
  kind public.care_kind not null,
  title text not null,
  local_time time not null,
  timezone text not null default 'UTC',
  weekdays smallint[] not null default array[0,1,2,3,4,5,6],
  is_active boolean not null default true,
  last_notified_for date,
  created_at timestamptz not null default now(),
  constraint care_schedules_weekdays check (weekdays <@ array[0,1,2,3,4,5,6]::smallint[])
);
create table public.family_invites (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  invited_by uuid not null default auth.uid() references auth.users(id),
  invited_email text,
  token_hash text not null unique,
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null unique,
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.login_attempts (
  bucket_hash text primary key,
  attempts integer not null default 1,
  window_start timestamptz not null default now()
);

create or replace function public.is_family_member(target_family uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select exists (select 1 from public.family_members where family_id = target_family and user_id = (select auth.uid())) $$;
create or replace function public.is_family_owner(target_family uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select exists (select 1 from public.family_members where family_id = target_family and user_id = (select auth.uid()) and role = 'owner') $$;
create or replace function public.has_other_family_owner(target_family uuid, excluded_user uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select exists (select 1 from public.family_members where family_id = target_family and user_id <> excluded_user and role = 'owner') $$;
create or replace function public.on_auth_user_created()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (user_id, username, display_name)
  values (new.id, nullif(lower(new.raw_user_meta_data ->> 'username'), ''), coalesce(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (user_id) do update set display_name = excluded.display_name;
  return new;
end;
$$;
revoke all on function public.is_family_member(uuid) from public, anon;
revoke all on function public.is_family_owner(uuid) from public, anon;
revoke all on function public.has_other_family_owner(uuid, uuid) from public, anon;
grant execute on function public.is_family_member(uuid) to authenticated, service_role;
grant execute on function public.is_family_owner(uuid) to authenticated, service_role;
grant execute on function public.has_other_family_owner(uuid, uuid) to authenticated, service_role;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.on_auth_user_created();

alter table public.profiles enable row level security;
alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.pets enable row level security;
alter table public.care_events enable row level security;
alter table public.care_schedules enable row level security;
alter table public.family_invites enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.login_attempts enable row level security;

create policy "profile own read" on public.profiles for select to authenticated using (user_id = (select auth.uid()));
create policy "profile own update" on public.profiles for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "family members read family" on public.families for select to authenticated using (public.is_family_member(id));
create policy "family owners update family" on public.families for update to authenticated using (public.is_family_owner(id)) with check (public.is_family_owner(id));
create policy "members read membership" on public.family_members for select to authenticated using (public.is_family_member(family_id));
create policy "members read pets" on public.pets for select to authenticated using (public.is_family_member(family_id));
create policy "owners insert pets" on public.pets for insert to authenticated with check (public.is_family_owner(family_id));
create policy "owners update pets" on public.pets for update to authenticated using (public.is_family_owner(family_id)) with check (public.is_family_owner(family_id));
create policy "owners delete pets" on public.pets for delete to authenticated using (public.is_family_owner(family_id));
create policy "members read care events" on public.care_events for select to authenticated using (public.is_family_member(family_id));
create policy "members add care events" on public.care_events for insert to authenticated with check (public.is_family_member(care_events.family_id) and author_id = (select auth.uid()) and exists (select 1 from public.pets p where p.id = care_events.pet_id and p.family_id = care_events.family_id));
create policy "authors and owners update care events" on public.care_events for update to authenticated using (author_id = (select auth.uid()) or public.is_family_owner(care_events.family_id)) with check (public.is_family_member(care_events.family_id) and (author_id = (select auth.uid()) or public.is_family_owner(care_events.family_id)) and exists (select 1 from public.pets p where p.id = care_events.pet_id and p.family_id = care_events.family_id));
create policy "owners delete care events" on public.care_events for delete to authenticated using (public.is_family_owner(family_id));
create policy "members read schedules" on public.care_schedules for select to authenticated using (public.is_family_member(family_id));
create policy "owners manage schedules" on public.care_schedules for all to authenticated using (public.is_family_owner(family_id)) with check (public.is_family_owner(family_id));
create policy "owners read invites" on public.family_invites for select to authenticated using (public.is_family_owner(family_id));
create policy "owners manage family members" on public.family_members for delete to authenticated using (
  public.is_family_owner(family_id)
  and (user_id <> (select auth.uid()) or public.has_other_family_owner(family_id, (select auth.uid())))
);
create policy "user read own push" on public.push_subscriptions for select to authenticated using (user_id = (select auth.uid()));
create policy "user manage own push" on public.push_subscriptions for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.login_attempts from anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, update on public.families to authenticated;
grant select on public.family_members to authenticated;
grant select, insert, update, delete on public.pets to authenticated;
grant select, insert, update, delete on public.care_events to authenticated;
grant select, insert, update, delete on public.care_schedules to authenticated;
grant select on public.family_invites to authenticated;
grant delete on public.family_members to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

create or replace function public.consume_login_attempt(attempt_hash text, max_attempts integer default 10)
returns boolean language plpgsql security definer set search_path = public, pg_temp
as $$
declare current_count integer;
begin
  insert into public.login_attempts(bucket_hash, attempts, window_start) values (attempt_hash, 1, now())
  on conflict (bucket_hash) do update set
    attempts = case when public.login_attempts.window_start < now() - interval '15 minutes' then 1 else public.login_attempts.attempts + 1 end,
    window_start = case when public.login_attempts.window_start < now() - interval '15 minutes' then now() else public.login_attempts.window_start end
  returning attempts into current_count;
  return current_count <= max_attempts;
end;
$$;
revoke all on function public.consume_login_attempt(text, integer) from public, anon, authenticated;
grant execute on function public.consume_login_attempt(text, integer) to service_role;
