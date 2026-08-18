create table public.call_presence (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  sharing boolean not null default false,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);

alter table public.call_presence enable row level security;
alter table public.direct_messages enable row level security;

create policy "group members read call presence" on public.call_presence
for select to authenticated using (public.is_group_member(group_id));
create policy "users join calls" on public.call_presence
for insert to authenticated with check (user_id = auth.uid() and public.is_group_member(group_id));
create policy "users update call presence" on public.call_presence
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "users leave calls" on public.call_presence
for delete to authenticated using (user_id = auth.uid());

create policy "participants read direct messages" on public.direct_messages
for select to authenticated using (auth.uid() in (sender_id, recipient_id));
create policy "sender sends direct messages" on public.direct_messages
for insert to authenticated with check (sender_id = auth.uid());
create policy "sender deletes direct messages" on public.direct_messages
for delete to authenticated using (sender_id = auth.uid());

grant select, insert, update, delete on public.call_presence to authenticated;
grant select, insert, delete on public.direct_messages to authenticated;

create or replace function public.delete_owned_group(target_group_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.groups where id = target_group_id and owner_id = auth.uid()) then
    raise exception 'Somente o dono pode excluir este grupo';
  end if;
  delete from public.groups where id = target_group_id;
end;
$$;
revoke all on function public.delete_owned_group(uuid) from public;
grant execute on function public.delete_owned_group(uuid) to authenticated;

alter publication supabase_realtime add table public.call_presence;
alter publication supabase_realtime add table public.direct_messages;
