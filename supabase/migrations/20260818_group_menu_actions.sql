create or replace function public.rename_owned_group(
  target_group_id uuid,
  next_name text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if length(trim(next_name)) < 2 or length(trim(next_name)) > 60 then
    raise exception 'Nome do grupo inválido';
  end if;
  if not exists (
    select 1 from public.groups
    where id = target_group_id and owner_id = auth.uid()
  ) then
    raise exception 'Somente o dono pode renomear o grupo';
  end if;
  update public.groups set name = trim(next_name) where id = target_group_id;
end;
$$;

create or replace function public.leave_group(target_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.groups
    where id = target_group_id and owner_id = auth.uid()
  ) then
    raise exception 'O dono precisa transferir a propriedade antes de sair';
  end if;
  delete from public.call_presence
    where group_id = target_group_id and user_id = auth.uid();
  delete from public.group_members
    where group_id = target_group_id and user_id = auth.uid();
end;
$$;

revoke all on function public.rename_owned_group(uuid, text) from public;
revoke all on function public.leave_group(uuid) from public;
grant execute on function public.rename_owned_group(uuid, text) to authenticated;
grant execute on function public.leave_group(uuid) to authenticated;
