begin;

create extension if not exists pgtap with schema extensions;

select plan(41);

insert into auth.users (id, email) values
  ('10000000-0000-0000-0000-000000000001', 'owner-one@example.test'),
  ('20000000-0000-0000-0000-000000000002', 'owner-two@example.test'),
  ('30000000-0000-0000-0000-000000000003', 'member-one@example.test');

insert into public.families (id, name, created_by) values
  ('a0000000-0000-0000-0000-000000000001', 'Family One', '10000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000002', 'Family Two', '20000000-0000-0000-0000-000000000002');

insert into public.family_members (family_id, user_id, role) values
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'owner'),
  ('a0000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', 'member'),
  ('b0000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'owner');

insert into public.pets (id, family_id, name) values
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Rex'),
  ('d0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'Milo');

insert into public.care_events (id, family_id, pet_id, author_id, actor_name, kind, label) values
  ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Owner One', 'meal', 'Breakfast');

insert into public.care_schedules (id, family_id, pet_id, created_by, kind, title, local_time) values
  ('f0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'meal', 'Morning meal', '08:00'),
  ('f0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'meal', 'Second family meal', '09:00');

select ok(not has_function_privilege('authenticated', 'public.redeem_family_invite(text,uuid,text)', 'EXECUTE'), 'members cannot redeem invites as the service role');
select ok(not has_function_privilege('authenticated', 'public.claim_care_event_push(uuid,uuid)', 'EXECUTE'), 'members cannot claim push deliveries as the service role');
select ok(not has_function_privilege('authenticated', 'public.record_care_event_push_delivery(uuid,uuid,uuid)', 'EXECUTE'), 'members cannot write push delivery receipts');

set local role authenticated;
set local request.jwt.claim.sub = '30000000-0000-0000-0000-000000000003';

select is((select count(*) from public.families), 1::bigint, 'a member sees only their family');
select is((select count(*) from public.families where id = 'b0000000-0000-0000-0000-000000000002'), 0::bigint, 'a member cannot see another family');
select is((select count(*) from public.family_members), 2::bigint, 'a member sees membership in their family');
select is((select count(*) from public.family_members where family_id = 'b0000000-0000-0000-0000-000000000002'), 0::bigint, 'a member cannot see another familys membership');
select is((select count(*) from public.pets), 1::bigint, 'a member sees the pets in their family');
select is((select count(*) from public.pets where id = 'd0000000-0000-0000-0000-000000000002'), 0::bigint, 'a member cannot see another family pets');
select is((select count(*) from public.care_events), 1::bigint, 'a member sees the care history in their family');
select is((select count(*) from public.care_schedules), 1::bigint, 'a member sees schedules in their family');
select is((select count(*) from public.care_schedules where id = 'f0000000-0000-0000-0000-000000000002'), 0::bigint, 'a member cannot see another familys schedules');
select lives_ok($$insert into public.care_events (id, family_id, pet_id, author_id, actor_name, kind, label)
  values ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', 'Member One', 'walk', 'Park')$$, 'a member can add a care event to their family');
select lives_ok($$update public.care_events set label = 'Park Updated' where id = 'e0000000-0000-0000-0000-000000000002'$$, 'a member can edit their own care event');
select throws_ok($$insert into public.care_events (id, family_id, pet_id, author_id, actor_name, kind, label)
  values ('e0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000003', 'Member One', 'walk', 'Other family')$$,
  '42501', null, 'a member cannot add a care event to another family');
select throws_ok($$insert into public.pets (id, family_id, name)
  values ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Unauthorized')$$,
  '42501', null, 'a member cannot add a pet');
select throws_ok($$insert into public.care_schedules (id, family_id, pet_id, created_by, kind, title, local_time)
  values ('f0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', 'meal', 'Unauthorized', '09:00')$$,
  '42501', null, 'a member cannot add a schedule');

update public.care_events set label = 'Unauthorized' where id = 'e0000000-0000-0000-0000-000000000001';
delete from public.care_events where id = 'e0000000-0000-0000-0000-000000000001';
update public.care_schedules set title = 'Unauthorized' where id = 'f0000000-0000-0000-0000-000000000001';
delete from public.care_schedules where id = 'f0000000-0000-0000-0000-000000000001';

reset role;

select is((select name from public.pets where id = 'c0000000-0000-0000-0000-000000000001'), 'Rex', 'a member cannot edit a pet');
select is((select label from public.care_events where id = 'e0000000-0000-0000-0000-000000000001'), 'Breakfast', 'a member cannot edit another authors event');
select is((select count(*) from public.care_events where id = 'e0000000-0000-0000-0000-000000000001'), 1::bigint, 'a member cannot delete another authors event');
select is((select title from public.care_schedules where id = 'f0000000-0000-0000-0000-000000000001'), 'Morning meal', 'a member cannot change a schedule');
select is((select label from public.care_events where id = 'e0000000-0000-0000-0000-000000000002'), 'Park Updated', 'a members own event change was applied');

set local role authenticated;
set local request.jwt.claim.sub = '20000000-0000-0000-0000-000000000002';

select is((select count(*) from public.pets), 1::bigint, 'the second owner sees only their family pets');
select is((select count(*) from public.families where id = 'a0000000-0000-0000-0000-000000000001'), 0::bigint, 'the second owner cannot see the first family');
select is((select count(*) from public.family_members), 1::bigint, 'the second owner sees only their family membership');
select is((select count(*) from public.family_members where family_id = 'a0000000-0000-0000-0000-000000000001'), 0::bigint, 'the second owner cannot see the first familys membership');
select is((select count(*) from public.pets where id = 'c0000000-0000-0000-0000-000000000001'), 0::bigint, 'the second owner cannot see the first familys pets');
select is((select count(*) from public.care_events), 0::bigint, 'the second owner cannot see the first familys care events');
select is((select count(*) from public.care_schedules), 1::bigint, 'the second owner sees only their family schedules');
select is((select count(*) from public.care_schedules where id = 'f0000000-0000-0000-0000-000000000001'), 0::bigint, 'the second owner cannot see the first familys schedules');

set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';

select lives_ok($$insert into public.pets (id, family_id, name)
  values ('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'New pet')$$, 'an owner can add a family pet');
select lives_ok($$update public.pets set name = 'Rex Updated' where id = 'c0000000-0000-0000-0000-000000000001'$$, 'an owner can update a family pet');
select lives_ok($$insert into public.care_schedules (id, family_id, pet_id, created_by, kind, title, local_time)
  values ('f0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'meal', 'Evening meal', '18:00')$$, 'an owner can add a family schedule');
select lives_ok($$update public.care_schedules set title = 'Evening meal' where id = 'f0000000-0000-0000-0000-000000000001'$$, 'an owner can update a family schedule');
select lives_ok($$delete from public.care_schedules where id = 'f0000000-0000-0000-0000-000000000003'$$, 'an owner can delete a family schedule');
select lives_ok($$delete from public.care_events where id = 'e0000000-0000-0000-0000-000000000002'$$, 'an owner can delete a members care event');
select lives_ok($$delete from public.pets where id = 'c0000000-0000-0000-0000-000000000003'$$, 'an owner can delete a family pet');

reset role;

select is((select name from public.pets where id = 'c0000000-0000-0000-0000-000000000001'), 'Rex Updated', 'the owners pet change was applied');
select is((select count(*) from public.pets where id = 'c0000000-0000-0000-0000-000000000003'), 0::bigint, 'the owners pet deletion was applied');
select is((select title from public.care_schedules where id = 'f0000000-0000-0000-0000-000000000001'), 'Evening meal', 'the owners schedule change was applied');
select is((select count(*) from public.care_events where id = 'e0000000-0000-0000-0000-000000000002'), 0::bigint, 'the owners event deletion was applied');

select * from finish();
rollback;
