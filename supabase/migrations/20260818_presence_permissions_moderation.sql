alter table public.group_channels add column if not exists access_mode text not null default 'public'
  check (access_mode in ('public','read_only','locked','private'));

create table if not exists public.channel_members (
  channel_id uuid references public.group_channels(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(channel_id,user_id)
);

create table if not exists public.group_bans (
  group_id uuid references public.groups(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  banned_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key(group_id,user_id)
);

create table if not exists public.user_presence (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  state text not null default 'online' check (state in ('online','background','away','offline')),
  focused boolean not null default true,
  idle_seconds integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.channel_members enable row level security;
alter table public.group_bans enable row level security;
alter table public.user_presence enable row level security;

create or replace function public.is_group_admin(check_group_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from group_members where group_id=check_group_id and user_id=auth.uid() and role in ('owner','admin'));
$$;

create or replace function public.can_see_channel(check_channel_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from group_channels c where c.id=check_channel_id and public.is_group_member(c.group_id)
    and (c.access_mode <> 'private' or public.is_group_admin(c.group_id)
      or exists(select 1 from channel_members cm where cm.channel_id=c.id and cm.user_id=auth.uid())));
$$;

create or replace function public.can_use_channel(check_channel_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from group_channels c where c.id=check_channel_id and public.can_see_channel(c.id)
    and (public.is_group_admin(c.group_id) or c.access_mode='public'
      or exists(select 1 from channel_members cm where cm.channel_id=c.id and cm.user_id=auth.uid())));
$$;

drop policy if exists "members read channels" on public.group_channels;
create policy "permitted members read channels" on public.group_channels for select to authenticated
using (public.can_see_channel(id));
create policy "admins update channels" on public.group_channels for update to authenticated
using (public.is_group_admin(group_id)) with check (public.is_group_admin(group_id));
grant update on public.group_channels to authenticated;

create policy "permitted users read channel access" on public.channel_members for select to authenticated
using (public.can_see_channel(channel_id));
create policy "admins manage channel access" on public.channel_members for all to authenticated
using (exists(select 1 from group_channels c where c.id=channel_id and public.is_group_admin(c.group_id)))
with check (exists(select 1 from group_channels c where c.id=channel_id and public.is_group_admin(c.group_id)));

create policy "members read group bans" on public.group_bans for select to authenticated
using (public.is_group_member(group_id) or user_id=auth.uid());
create policy "presence readable" on public.user_presence for select to authenticated using (true);
create policy "users insert presence" on public.user_presence for insert to authenticated with check(user_id=auth.uid());
create policy "users update presence" on public.user_presence for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
grant select,insert,update on public.user_presence to authenticated;
grant select,insert,delete on public.channel_members to authenticated;
grant select on public.group_bans to authenticated;

drop policy if exists "member reads messages" on public.messages;
drop policy if exists "member sends messages" on public.messages;
create policy "permitted members read messages" on public.messages for select to authenticated using(public.can_see_channel(channel_id));
create policy "permitted members send messages" on public.messages for insert to authenticated
with check(author_id=auth.uid() and public.can_use_channel(channel_id));

create or replace function public.configure_channel(target_channel_id uuid, target_mode text, allowed_users uuid[] default '{}')
returns void language plpgsql security definer set search_path=public as $$
declare gid uuid;
begin
  select group_id into gid from group_channels where id=target_channel_id;
  if not public.is_group_admin(gid) then raise exception 'Sem permissão'; end if;
  if target_mode not in ('public','read_only','locked','private') then raise exception 'Modo inválido'; end if;
  update group_channels set access_mode=target_mode where id=target_channel_id;
  delete from channel_members where channel_id=target_channel_id;
  insert into channel_members(channel_id,user_id) select target_channel_id,unnest(allowed_users) on conflict do nothing;
end $$;

create or replace function public.set_group_role(target_group_id uuid,target_user_id uuid,target_role text)
returns void language plpgsql security definer set search_path=public as $$
declare actor_role text; victim_role text;
begin
  select role into actor_role from group_members where group_id=target_group_id and user_id=auth.uid();
  select role into victim_role from group_members where group_id=target_group_id and user_id=target_user_id;
  if target_role not in ('admin','member') then raise exception 'Função inválida'; end if;
  if actor_role='owner' or (actor_role='admin' and victim_role='member' and target_role='admin') then
    update group_members set role=target_role where group_id=target_group_id and user_id=target_user_id;
  else raise exception 'Sem permissão para alterar este membro'; end if;
end $$;

create or replace function public.ban_group_member(target_group_id uuid,target_user_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare actor_role text; victim_role text;
begin
  select role into actor_role from group_members where group_id=target_group_id and user_id=auth.uid();
  select role into victim_role from group_members where group_id=target_group_id and user_id=target_user_id;
  if not (actor_role='owner' or (actor_role='admin' and victim_role='member')) then raise exception 'Sem permissão'; end if;
  insert into group_bans values(target_group_id,target_user_id,auth.uid(),now()) on conflict do nothing;
  delete from call_presence where group_id=target_group_id and user_id=target_user_id;
  delete from group_members where group_id=target_group_id and user_id=target_user_id;
end $$;

create or replace function public.unban_group_member(target_group_id uuid,target_user_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin if not public.is_group_admin(target_group_id) then raise exception 'Sem permissão'; end if;
delete from group_bans where group_id=target_group_id and user_id=target_user_id; end $$;

grant execute on function public.configure_channel(uuid,text,uuid[]) to authenticated;
grant execute on function public.set_group_role(uuid,uuid,text) to authenticated;
grant execute on function public.ban_group_member(uuid,uuid) to authenticated;
grant execute on function public.unban_group_member(uuid,uuid) to authenticated;
grant execute on function public.can_see_channel(uuid) to authenticated;
grant execute on function public.can_use_channel(uuid) to authenticated;

create or replace function public.add_friend_to_group(target_group_id uuid, target_user_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
begin
  if not public.is_group_admin(target_group_id) then raise exception 'Somente donos e administradores podem adicionar pessoas'; end if;
  if exists(select 1 from group_bans where group_id=target_group_id and user_id=target_user_id) then raise exception 'Este usuário está bloqueado no grupo'; end if;
  if not exists(select 1 from friendships where status='accepted' and ((requester_id=auth.uid() and addressee_id=target_user_id) or (addressee_id=auth.uid() and requester_id=target_user_id))) then raise exception 'Vocês precisam ser amigos primeiro'; end if;
  insert into group_members(group_id,user_id,role) values(target_group_id,target_user_id,'member') on conflict do nothing;
  return target_user_id;
end $$;
grant execute on function public.add_friend_to_group(uuid,uuid) to authenticated;

alter publication supabase_realtime add table public.user_presence;
alter publication supabase_realtime add table public.channel_members;
