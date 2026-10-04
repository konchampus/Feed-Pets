create schema if not exists extensions;

do $migration$
declare
  extension_schema text;
  queued_requests bigint := 0;
  stored_responses bigint := 0;
  pg_net_jobs bigint := 0;
begin
  select namespace.nspname
  into extension_schema
  from pg_extension as installed_extension
  join pg_namespace as namespace on namespace.oid = installed_extension.extnamespace
  where installed_extension.extname = 'pg_net';

  if extension_schema is null then
    create extension pg_net with schema extensions;
    return;
  end if;

  if extension_schema = 'extensions' then
    return;
  end if;

  if extension_schema <> 'public' then
    raise exception 'pg_net is installed in unexpected schema "%"; refusing to move it', extension_schema;
  end if;

  if to_regclass('net.http_request_queue') is not null then
    execute 'lock table net.http_request_queue in access exclusive mode';
  end if;

  if to_regclass('net._http_response') is not null then
    execute 'lock table net._http_response in access exclusive mode';
  end if;

  if to_regclass('net.http_request_queue') is not null then
    execute 'select count(*) from net.http_request_queue' into queued_requests;
  end if;

  if to_regclass('net._http_response') is not null then
    execute 'select count(*) from net._http_response' into stored_responses;
  end if;

  if to_regclass('cron.job') is not null then
    execute $query$
      select count(*)
      from cron.job
      where command ~* '(^|[^[:alnum:]_])net[.]|pg_net'
    $query$ into pg_net_jobs;
  end if;

  if queued_requests > 0 or stored_responses > 0 or pg_net_jobs > 0 then
    raise exception
      'pg_net migration stopped: % queued requests, % stored responses, % cron jobs reference pg_net',
      queued_requests, stored_responses, pg_net_jobs;
  end if;

  execute 'drop extension pg_net restrict';
  create extension pg_net with schema extensions;
end;
$migration$;
