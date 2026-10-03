begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

select ok(
  (select prosecdef from pg_proc where oid = 'private.can_receive_family_broadcast(text)'::regprocedure),
  'the channel authorization helper runs as its owner'
);
select ok(
  (select proconfig @> array['search_path=""']::text[] from pg_proc where oid = 'private.can_receive_family_broadcast(text)'::regprocedure),
  'the channel authorization helper has an empty search path'
);
select ok(
  has_function_privilege('authenticated', 'private.can_receive_family_broadcast(text)', 'EXECUTE'),
  'authenticated users can evaluate their own channel access'
);
select ok(
  not has_function_privilege('anon', 'private.can_receive_family_broadcast(text)', 'EXECUTE'),
  'anonymous users cannot evaluate channel access'
);
select ok(
  (select prosecdef from pg_proc where oid = 'public.broadcast_family_changes()'::regprocedure),
  'the broadcast trigger runs as its owner'
);
select ok(
  (select proconfig @> array['search_path=""']::text[] from pg_proc where oid = 'public.broadcast_family_changes()'::regprocedure),
  'the broadcast trigger has an empty search path'
);
select ok(
  not has_function_privilege('authenticated', 'public.broadcast_family_changes()', 'EXECUTE'),
  'authenticated users cannot call the trigger function directly'
);

select ok(
  (select count(*) = 3 from pg_trigger
   where not tgisinternal
     and tgfoid = 'public.broadcast_family_changes()'::regprocedure
     and tgrelid in ('public.pets'::regclass, 'public.care_events'::regclass, 'public.care_schedules'::regclass)),
  'pets, care events, and schedules each have a broadcast trigger'
);
select ok(
  (select count(*) = 3 from pg_trigger
   where not tgisinternal
     and tgfoid = 'public.broadcast_family_changes()'::regprocedure
     and tgrelid in ('public.pets'::regclass, 'public.care_events'::regclass, 'public.care_schedules'::regclass)
     and (tgtype & 4) = 4 and (tgtype & 16) = 16 and (tgtype & 8) = 8),
  'each family trigger handles inserts, updates, and deletes'
);
select ok(
  exists (select 1 from pg_trigger
          where not tgisinternal
            and tgfoid = 'public.broadcast_family_changes()'::regprocedure
            and tgrelid = 'public.family_members'::regclass
            and (tgtype & 8) = 8),
  'removing a member broadcasts a family refresh so removed devices can leave the channel'
);
select ok(
  exists (select 1 from pg_policy
          where polrelid = 'realtime.messages'::regclass
            and polname = 'authenticated family broadcast read'
            and polcmd = 'r'
            and polroles = array['authenticated'::regrole::oid]
            and pg_get_expr(polqual, polrelid) like '%can_receive_family_broadcast%'),
  'only authenticated clients get the family broadcast read policy'
);

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

set local role authenticated;
set local request.jwt.claim.sub = '30000000-0000-0000-0000-000000000003';

select ok(private.can_receive_family_broadcast('family:a0000000-0000-0000-0000-000000000001'), 'a member can receive their family broadcasts');
select ok(not private.can_receive_family_broadcast('family:b0000000-0000-0000-0000-000000000002'), 'a member cannot receive another familys broadcasts');
select ok(not private.can_receive_family_broadcast('family:not-a-uuid'), 'malformed family topics are denied');
select ok(not private.can_receive_family_broadcast('pets:a0000000-0000-0000-0000-000000000001'), 'topics outside the family namespace are denied');

reset role;
select * from finish();
rollback;
