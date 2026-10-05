create or replace function public.redeem_family_invite(invite_hash text, joining_user uuid, joining_email text)
returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  invite public.family_invites%rowtype;
  "joinedFamily" uuid;
begin
  select * into invite from public.family_invites
  where token_hash = invite_hash
  for update;

  if not found or invite.redeemed_at is not null or invite.expires_at <= now() then
    return null;
  end if;
  if invite.invited_email is not null and lower(invite.invited_email) <> lower(coalesce(joining_email, '')) then
    return null;
  end if;
  if exists (select 1 from public.family_members where user_id = joining_user) then
    return null;
  end if;

  insert into public.family_members (family_id, user_id, role)
  values (invite.family_id, joining_user, 'member')
  on conflict do nothing
  returning family_id into "joinedFamily";

  if not found then
    return null;
  end if;

  update public.family_invites set redeemed_at = now() where id = invite.id;
  return "joinedFamily";
end;
$$;
