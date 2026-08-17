create or replace function public.invite_group_member(target_group_id uuid, target_nametag text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invited_user uuid;
begin
  if not exists (
    select 1 from public.group_members
    where group_id = target_group_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  ) then
    raise exception 'Somente donos e administradores podem convidar';
  end if;

  select id into invited_user from public.profiles where nametag = lower(target_nametag);
  if invited_user is null then raise exception 'Nametag não encontrado'; end if;

  insert into public.group_members(group_id, user_id, role)
  values (target_group_id, invited_user, 'member')
  on conflict (group_id, user_id) do nothing;
  return invited_user;
end;
$$;

revoke all on function public.invite_group_member(uuid, text) from public;
grant execute on function public.invite_group_member(uuid, text) to authenticated;
