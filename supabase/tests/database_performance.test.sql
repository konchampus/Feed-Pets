begin;

create extension if not exists pgtap with schema extensions;

select plan(22);

select ok(exists (
  select 1 from pg_index
  where indexrelid = to_regclass('public.care_events_author_id_idx')
    and indrelid = 'public.care_events'::regclass
    and indisvalid and indisready and indnatts = 1
    and right(pg_get_indexdef(indexrelid), length('(author_id)')) = '(author_id)'
), 'care event author foreign key has a usable index');
select ok(exists (
  select 1 from pg_index
  where indexrelid = to_regclass('public.care_schedules_created_by_idx')
    and indrelid = 'public.care_schedules'::regclass
    and indisvalid and indisready and indnatts = 1
    and right(pg_get_indexdef(indexrelid), length('(created_by)')) = '(created_by)'
), 'schedule creator foreign key has a usable index');
select ok(exists (
  select 1 from pg_index
  where indexrelid = to_regclass('public.care_schedules_family_id_idx')
    and indrelid = 'public.care_schedules'::regclass
    and indisvalid and indisready and indnatts = 1
    and right(pg_get_indexdef(indexrelid), length('(family_id)')) = '(family_id)'
), 'schedule family foreign key has a usable index');
select ok(exists (
  select 1 from pg_index
  where indexrelid = to_regclass('public.care_schedules_pet_id_idx')
    and indrelid = 'public.care_schedules'::regclass
    and indisvalid and indisready and indnatts = 1
    and right(pg_get_indexdef(indexrelid), length('(pet_id)')) = '(pet_id)'
), 'schedule pet foreign key has a usable index');
select ok(exists (
  select 1 from pg_index
  where indexrelid = to_regclass('public.families_created_by_idx')
    and indrelid = 'public.families'::regclass
    and indisvalid and indisready and indnatts = 1
    and right(pg_get_indexdef(indexrelid), length('(created_by)')) = '(created_by)'
), 'family creator foreign key has a usable index');
select ok(exists (
  select 1 from pg_index
  where indexrelid = to_regclass('public.family_invites_family_id_idx')
    and indrelid = 'public.family_invites'::regclass
    and indisvalid and indisready and indnatts = 1
    and right(pg_get_indexdef(indexrelid), length('(family_id)')) = '(family_id)'
), 'invite family foreign key has a usable index');
select ok(exists (
  select 1 from pg_index
  where indexrelid = to_regclass('public.family_invites_invited_by_idx')
    and indrelid = 'public.family_invites'::regclass
    and indisvalid and indisready and indnatts = 1
    and right(pg_get_indexdef(indexrelid), length('(invited_by)')) = '(invited_by)'
), 'invite creator foreign key has a usable index');
select ok(exists (
  select 1 from pg_index
  where indexrelid = to_regclass('public.pets_family_id_idx')
    and indrelid = 'public.pets'::regclass
    and indisvalid and indisready and indnatts = 1
    and right(pg_get_indexdef(indexrelid), length('(family_id)')) = '(family_id)'
), 'pet family foreign key has a usable index');
select ok(exists (
  select 1 from pg_index
  where indexrelid = to_regclass('public.push_delivery_receipts_subscription_id_idx')
    and indrelid = 'public.push_delivery_receipts'::regclass
    and indisvalid and indisready and indnatts = 1
    and right(pg_get_indexdef(indexrelid), length('(subscription_id)')) = '(subscription_id)'
), 'delivery subscription foreign key has a usable index');
select ok(exists (
  select 1 from pg_index
  where indexrelid = to_regclass('public.push_subscriptions_user_id_idx')
    and indrelid = 'public.push_subscriptions'::regclass
    and indisvalid and indisready and indnatts = 1
    and right(pg_get_indexdef(indexrelid), length('(user_id)')) = '(user_id)'
), 'push owner foreign key has a usable index');

select ok(exists (
  select 1 from pg_constraint as constraint_row
  where constraint_row.conrelid = 'public.push_delivery_receipts'::regclass
    and constraint_row.contype = 'p'
    and array_length(constraint_row.conkey, 1) = 1
    and exists (
      select 1 from pg_attribute
      where attrelid = constraint_row.conrelid
        and attnum = constraint_row.conkey[1]
        and attname = 'id'
    )
), 'delivery receipts have a single-column id primary key');
select ok((
  select attnotnull and pg_get_expr(default_row.adbin, default_row.adrelid) = 'gen_random_uuid()'
  from pg_attribute as column_row
  join pg_attrdef as default_row
    on default_row.adrelid = column_row.attrelid and default_row.adnum = column_row.attnum
  where column_row.attrelid = 'public.push_delivery_receipts'::regclass
    and column_row.attname = 'id'
), 'delivery receipt IDs are generated and required');

select is((
  select count(*) from pg_policy
  where polrelid = 'public.care_schedules'::regclass
    and polroles @> array['authenticated'::regrole::oid]
    and polcmd in ('r', '*')
), 1::bigint, 'schedules have one authenticated select policy');
select ok(exists (
  select 1 from pg_policy
  where polrelid = 'public.care_schedules'::regclass
    and polname = 'members read schedules'
    and polcmd = 'r'
    and pg_get_expr(polqual, polrelid) like '%private.is_family_member%'
), 'schedule reads remain limited to family members');
select ok(not exists (
  select 1 from pg_policy
  where polrelid = 'public.care_schedules'::regclass
    and polname = 'owners manage schedules'
), 'the all-commands schedule policy is removed');

select is((
  select count(*) from pg_policy
  where polrelid = 'public.push_subscriptions'::regclass
    and polroles @> array['authenticated'::regrole::oid]
    and polcmd in ('r', '*')
), 1::bigint, 'push subscriptions have one authenticated select policy');
select ok(exists (
  select 1 from pg_policy
  where polrelid = 'public.push_subscriptions'::regclass
    and polname = 'user manage own push'
    and polcmd = '*'
    and pg_get_expr(polqual, polrelid) like '%auth.uid%'
), 'push users retain their own-row policy');
select ok(not exists (
  select 1 from pg_policy
  where polrelid = 'public.push_subscriptions'::regclass
    and polname = 'user read own push'
), 'the duplicate push select policy is removed');

insert into auth.users (id, email) values
  ('41000000-0000-0000-0000-000000000001', 'push-owner-one@example.test'),
  ('42000000-0000-0000-0000-000000000002', 'push-owner-two@example.test');
insert into public.push_subscriptions (id, user_id, endpoint, subscription) values
  ('43000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'https://push.example.test/one', '{}'),
  ('44000000-0000-0000-0000-000000000002', '42000000-0000-0000-0000-000000000002', 'https://push.example.test/two', '{}');

set local role authenticated;
set local request.jwt.claim.sub = '41000000-0000-0000-0000-000000000001';
select is((select count(*) from public.push_subscriptions), 1::bigint, 'a user can read their own push subscription');
select is((select count(*) from public.push_subscriptions where id = '44000000-0000-0000-0000-000000000002'), 0::bigint, 'a user cannot read another users push subscription');
delete from public.push_subscriptions where id = '44000000-0000-0000-0000-000000000002';

reset role;
select is((select count(*) from public.push_subscriptions), 2::bigint, 'another users push subscription cannot be deleted');
select is((select count(*) from public.push_subscriptions where id = '44000000-0000-0000-0000-000000000002'), 1::bigint, 'the other users subscription remains intact');

select * from finish();
rollback;
