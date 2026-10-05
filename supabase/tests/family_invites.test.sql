begin;

create extension if not exists pgtap with schema extensions;

select plan(19);

insert into auth.users (id, email) values
  ('71000000-0000-0000-0000-000000000001', 'invite-owner-one@example.test'),
  ('71000000-0000-0000-0000-000000000002', 'invite-owner-two@example.test'),
  ('71000000-0000-0000-0000-000000000003', 'new-member@example.test'),
  ('71000000-0000-0000-0000-000000000004', 'existing-member@example.test'),
  ('71000000-0000-0000-0000-000000000005', 'racing-member@example.test'),
  ('71000000-0000-0000-0000-000000000006', 'expired-invite-user@example.test'),
  ('71000000-0000-0000-0000-000000000007', 'email-mismatch-user@example.test');

insert into public.families (id, name, created_by) values
  ('72000000-0000-0000-0000-000000000001', 'Invite family one', '71000000-0000-0000-0000-000000000001'),
  ('72000000-0000-0000-0000-000000000002', 'Invite family two', '71000000-0000-0000-0000-000000000002');

insert into public.family_members (family_id, user_id, role) values
  ('72000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', 'owner'),
  ('72000000-0000-0000-0000-000000000002', '71000000-0000-0000-0000-000000000002', 'owner'),
  ('72000000-0000-0000-0000-000000000002', '71000000-0000-0000-0000-000000000004', 'member');

insert into public.family_invites (id, family_id, invited_by, invited_email, token_hash, expires_at) values
  ('73000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', 'NEW-MEMBER@example.test', 'invite-success-hash', now() + interval '1 day'),
  ('73000000-0000-0000-0000-000000000002', '72000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', null, 'invite-expired-hash', now() - interval '1 minute'),
  ('73000000-0000-0000-0000-000000000003', '72000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', 'other@example.test', 'invite-email-hash', now() + interval '1 day'),
  ('73000000-0000-0000-0000-000000000004', '72000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', 'existing-member@example.test', 'invite-existing-member-hash', now() + interval '1 day'),
  ('73000000-0000-0000-0000-000000000005', '72000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', 'racing-member@example.test', 'invite-racing-member-hash', now() + interval '1 day');

create function public."testInjectInviteMembershipRace"()
returns trigger language plpgsql set search_path = public, pg_temp
as $$
begin
  if new.user_id = '71000000-0000-0000-0000-000000000005'
     and new.family_id = '72000000-0000-0000-0000-000000000001' then
    insert into public.family_members (family_id, user_id, role)
    values ('72000000-0000-0000-0000-000000000002', new.user_id, 'member');
  end if;
  return new;
end;
$$;

create trigger test_inject_invite_membership_race
before insert on public.family_members
for each row execute function public."testInjectInviteMembershipRace"();

set local role service_role;

select is(
  public.redeem_family_invite('invite-success-hash', '71000000-0000-0000-0000-000000000003', 'new-member@example.test')::text,
  '72000000-0000-0000-0000-000000000001',
  'a valid invite admits its intended user to the invited family'
);
select is((select count(*) from public.family_members where user_id = '71000000-0000-0000-0000-000000000003'), 1::bigint, 'a valid invite creates exactly one membership');
select is((select role::text from public.family_members where user_id = '71000000-0000-0000-0000-000000000003'), 'member', 'an invited user joins with the member role');
select ok((select redeemed_at is not null from public.family_invites where id = '73000000-0000-0000-0000-000000000001'), 'successful redemption marks the invite as used');

select is(
  public.redeem_family_invite('invite-success-hash', '71000000-0000-0000-0000-000000000003', 'new-member@example.test')::text,
  null::text,
  'a redeemed invite cannot be used again'
);
select is((select count(*) from public.family_members where user_id = '71000000-0000-0000-0000-000000000003'), 1::bigint, 'replaying an invite does not create another membership');

select is(
  public.redeem_family_invite('invite-expired-hash', '71000000-0000-0000-0000-000000000006', 'expired-invite-user@example.test')::text,
  null::text,
  'an expired invite is rejected'
);
select is((select count(*) from public.family_members where user_id = '71000000-0000-0000-0000-000000000006'), 0::bigint, 'an expired invite does not add a membership');
select ok((select redeemed_at is null from public.family_invites where id = '73000000-0000-0000-0000-000000000002'), 'rejecting an expired invite leaves it unredeemed');

select is(
  public.redeem_family_invite('invite-email-hash', '71000000-0000-0000-0000-000000000007', 'email-mismatch-user@example.test')::text,
  null::text,
  'an invite addressed to a different email is rejected'
);
select is((select count(*) from public.family_members where user_id = '71000000-0000-0000-0000-000000000007'), 0::bigint, 'an email mismatch does not add a membership');
select ok((select redeemed_at is null from public.family_invites where id = '73000000-0000-0000-0000-000000000003'), 'rejecting an email mismatch leaves the invite unredeemed');

select is(
  public.redeem_family_invite('invite-existing-member-hash', '71000000-0000-0000-0000-000000000004', 'existing-member@example.test')::text,
  null::text,
  'a user who already belongs to a family cannot redeem another invite'
);
select is((select count(*) from public.family_members where user_id = '71000000-0000-0000-0000-000000000004'), 1::bigint, 'rejecting an existing family member preserves their original membership');
select is((select family_id::text from public.family_members where user_id = '71000000-0000-0000-0000-000000000004'), '72000000-0000-0000-0000-000000000002', 'an existing member remains in their original family');

select is(
  public.redeem_family_invite('invite-racing-member-hash', '71000000-0000-0000-0000-000000000005', 'racing-member@example.test')::text,
  null::text,
  'a membership conflict during invite redemption is reported as a rejection'
);
select is((select family_id::text from public.family_members where user_id = '71000000-0000-0000-0000-000000000005'), '72000000-0000-0000-0000-000000000002', 'a membership conflict keeps the user in the family that won the race');
select ok((select redeemed_at is null from public.family_invites where id = '73000000-0000-0000-0000-000000000005'), 'a membership conflict does not consume the invite');

select is(
  public.redeem_family_invite('missing-invite-hash', '71000000-0000-0000-0000-000000000003', 'new-member@example.test')::text,
  null::text,
  'an unknown invite token is rejected'
);

reset role;
select * from finish();
rollback;
