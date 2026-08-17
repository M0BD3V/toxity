grant usage on schema public to authenticated;

grant select, update on public.profiles to authenticated;
grant select, insert, update on public.friendships to authenticated;
grant select on public.groups to authenticated;
grant select on public.group_members to authenticated;
grant select, insert, update, delete on public.messages to authenticated;
