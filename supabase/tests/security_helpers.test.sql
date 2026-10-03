begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

select ok(
  (select prosecdef from pg_proc where oid = 'private.is_family_member(uuid)'::regprocedure)
  and (select proconfig @> array['search_path=""']::text[] from pg_proc where oid = 'private.is_family_member(uuid)'::regprocedure),
  'the family membership helper is a search-path-safe security definer'
);
select ok(
  (select prosecdef from pg_proc where oid = 'private.is_family_owner(uuid)'::regprocedure)
  and (select proconfig @> array['search_path=""']::text[] from pg_proc where oid = 'private.is_family_owner(uuid)'::regprocedure),
  'the family owner helper is a search-path-safe security definer'
);
select ok(
  (select prosecdef from pg_proc where oid = 'private.has_other_family_owner(uuid)'::regprocedure)
  and (select proconfig @> array['search_path=""']::text[] from pg_proc where oid = 'private.has_other_family_owner(uuid)'::regprocedure),
  'the other-owner helper is a search-path-safe security definer'
);
select ok(
  has_function_privilege('authenticated', 'private.is_family_member(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'private.is_family_owner(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'private.has_other_family_owner(uuid)', 'EXECUTE'),
  'authenticated policies can call the private family helpers'
);

select ok(
  not has_function_privilege('anon', 'public.is_family_member(uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.is_family_member(uuid)', 'EXECUTE'),
  'the public family membership helper is not API-callable'
);
select ok(
  not has_function_privilege('anon', 'public.is_family_owner(uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.is_family_owner(uuid)', 'EXECUTE'),
  'the public family owner helper is not API-callable'
);
select ok(
  not has_function_privilege('anon', 'public.has_other_family_owner(uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.has_other_family_owner(uuid,uuid)', 'EXECUTE'),
  'the public other-owner probe is not API-callable'
);
select ok(
  not has_function_privilege('anon', 'public.on_auth_user_created()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.on_auth_user_created()', 'EXECUTE')
  and not exists (
    select 1 from aclexplode(coalesce(proacl, acldefault('f', proowner))) as grant_row
    where grant_row.grantee = 0 and grant_row.privilege_type = 'EXECUTE'
  ),
  'only the auth trigger can execute the profile trigger function'
)
from pg_proc where oid = 'public.on_auth_user_created()'::regprocedure;
select ok(
  exists (select 1 from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = 'on_auth_user_created' and not tgisinternal),
  'the auth profile trigger remains installed'
);

select ok((select relrowsecurity from pg_class where oid = 'public.care_event_pushes'::regclass), 'push claims keep RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.login_attempts'::regclass), 'login throttles keep RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.push_delivery_receipts'::regclass), 'delivery receipts keep RLS enabled');
select ok(
  not exists (
    select 1
    from pg_class as table_row
    cross join lateral aclexplode(coalesce(table_row.relacl, acldefault('r', table_row.relowner))) as grant_row
    where table_row.oid in (
      'public.care_event_pushes'::regclass,
      'public.login_attempts'::regclass,
      'public.push_delivery_receipts'::regclass
    )
      and grant_row.grantee in (0, 'anon'::regrole::oid, 'authenticated'::regrole::oid)
      and grant_row.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
  ),
  'internal tables grant no access to public or client roles'
);
select ok(
  not exists (
    select 1 from pg_policy
    where polrelid in (
      'public.care_event_pushes'::regclass,
      'public.login_attempts'::regclass,
      'public.push_delivery_receipts'::regclass
    )
  ),
  'internal tables remain policy-free and default-deny'
);
select ok(
  exists (select 1 from pg_policy where polrelid = 'public.families'::regclass and polname = 'family members read family' and pg_get_expr(polqual, polrelid) like '%private.is_family_member%')
  and exists (select 1 from pg_policy where polrelid = 'public.pets'::regclass and polname = 'owners delete pets' and pg_get_expr(polqual, polrelid) like '%private.is_family_owner%'),
  'family RLS policies use private helpers'
);
select ok(
  exists (select 1 from pg_policy where polrelid = 'public.family_members'::regclass and polname = 'owners manage family members' and pg_get_expr(polqual, polrelid) like '%private.has_other_family_owner%'),
  'self-removal still requires another family owner'
);

select * from finish();
rollback;
