begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

select is((
  select namespace.nspname
  from pg_extension as installed_extension
  join pg_namespace as namespace on namespace.oid = installed_extension.extnamespace
  where installed_extension.extname = 'pg_net'
), 'extensions', 'pg_net is installed in the extensions schema');

select ok(
  to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is not null,
  'net.http_post remains available after extension placement'
);

select ok(
  to_regclass('net.http_request_queue') is not null,
  'pg_net request queue remains available'
);

select ok(
  to_regclass('net._http_response') is not null,
  'pg_net response table remains available'
);

select * from finish();
rollback;
