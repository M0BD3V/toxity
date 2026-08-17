drop function if exists public.invite_group_member(uuid, text);

create or replace function public.add_friend_to_group(target_group_id uuid, target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.group_members
    where group_id = target_group_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  ) then
    raise exception 'Somente donos e administradores podem adicionar pessoas';
  end if;

  if not exists (
    select 1 from public.friendships
    where status = 'accepted'
      and ((requester_id = auth.uid() and addressee_id = target_user_id)
        or (requester_id = target_user_id and addressee_id = auth.uid()))
  ) then
    raise exception 'Essa pessoa precisa aceitar sua amizade primeiro';
  end if;

  insert into public.group_members(group_id, user_id, role)
  values (target_group_id, target_user_id, 'member')
  on conflict (group_id, user_id) do nothing;
  return target_user_id;
end;
$$;

revoke all on function public.add_friend_to_group(uuid, uuid) from public;
grant execute on function public.add_friend_to_group(uuid, uuid) to authenticated;

alter publication supabase_realtime add table public.friendships;
alter publication supabase_realtime add table public.group_members;
