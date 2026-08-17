create or replace function public.is_group_member(check_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members
    where group_id = check_group_id and user_id = auth.uid()
  );
$$;

revoke all on function public.is_group_member(uuid) from public;
grant execute on function public.is_group_member(uuid) to authenticated;

drop policy if exists "member reads groups" on public.groups;
drop policy if exists "member reads memberships" on public.group_members;
drop policy if exists "member reads messages" on public.messages;
drop policy if exists "member sends messages" on public.messages;

create policy "member reads groups"
on public.groups for select to authenticated
using (public.is_group_member(id));

create policy "member reads memberships"
on public.group_members for select to authenticated
using (public.is_group_member(group_id));

create policy "member reads messages"
on public.messages for select to authenticated
using (public.is_group_member(group_id));

create policy "member sends messages"
on public.messages for insert to authenticated
with check (author_id = auth.uid() and public.is_group_member(group_id));
