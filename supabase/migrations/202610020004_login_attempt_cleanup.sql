create index if not exists login_attempts_window_start_idx
  on public.login_attempts (window_start);

create or replace function public.consume_login_attempt(attempt_hash text, max_attempts integer default 10)
returns boolean language plpgsql security definer set search_path = public, pg_temp
as $$
declare current_count integer;
begin
  -- Expired windows no longer affect the limiter. Prune a bounded batch on
  -- each login attempt so this table does not need a scheduled extension.
  with stale_attempts as (
    select bucket_hash
    from public.login_attempts
    where window_start < now() - interval '15 minutes'
    order by window_start
    limit 500
    for update skip locked
  )
  delete from public.login_attempts as attempts
  using stale_attempts
  where attempts.bucket_hash = stale_attempts.bucket_hash;

  insert into public.login_attempts(bucket_hash, attempts, window_start) values (attempt_hash, 1, now())
  on conflict (bucket_hash) do update set
    attempts = case when public.login_attempts.window_start < now() - interval '15 minutes' then 1 else public.login_attempts.attempts + 1 end,
    window_start = case when public.login_attempts.window_start < now() - interval '15 minutes' then now() else public.login_attempts.window_start end
  returning attempts into current_count;
  return current_count <= max_attempts;
end;
$$;
