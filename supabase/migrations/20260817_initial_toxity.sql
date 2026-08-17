create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 32),
  nametag text not null unique check (nametag ~ '^[a-z0-9_]{3,20}$'),
  bio text not null default '' check (char_length(bio) <= 280),
  avatar_url text,
  status text not null default 'online' check (status in ('online','away','busy','offline')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.friendships (
  requester_id uuid references public.profiles(id) on delete cascade,
  addressee_id uuid references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','blocked')),
  created_at timestamptz not null default now(),
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

create table public.groups (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id),
  name text not null check (char_length(name) between 2 and 60), description text not null default '',
  avatar_url text, created_at timestamptz not null default now()
);
create table public.group_members (
  group_id uuid references public.groups(id) on delete cascade, user_id uuid references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')), joined_at timestamptz not null default now(),
  primary key (group_id,user_id)
);
create table public.messages (
  id uuid primary key default gen_random_uuid(), group_id uuid not null references public.groups(id) on delete cascade,
  author_id uuid not null references public.profiles(id), body text not null check (char_length(body) between 1 and 4000),
  edited_at timestamptz, created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.messages enable row level security;

create policy "profiles readable by authenticated" on public.profiles for select to authenticated using (true);
create policy "profile owner updates" on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());
create policy "friend participants read" on public.friendships for select to authenticated using (auth.uid() in (requester_id,addressee_id));
create policy "friend requester inserts" on public.friendships for insert to authenticated with check (requester_id=auth.uid());
create policy "friend participants update" on public.friendships for update to authenticated using (auth.uid() in (requester_id,addressee_id));
create policy "member reads groups" on public.groups for select to authenticated using (exists(select 1 from public.group_members gm where gm.group_id=id and gm.user_id=auth.uid()));
create policy "member reads memberships" on public.group_members for select to authenticated using (exists(select 1 from public.group_members mine where mine.group_id=group_id and mine.user_id=auth.uid()));
create policy "member reads messages" on public.messages for select to authenticated using (exists(select 1 from public.group_members gm where gm.group_id=group_id and gm.user_id=auth.uid()));
create policy "member sends messages" on public.messages for insert to authenticated with check (author_id=auth.uid() and exists(select 1 from public.group_members gm where gm.group_id=group_id and gm.user_id=auth.uid()));
create policy "author edits messages" on public.messages for update to authenticated using (author_id=auth.uid()) with check (author_id=auth.uid());
create policy "author deletes messages" on public.messages for delete to authenticated using (author_id=auth.uid());

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into public.profiles(id,display_name,nametag) values(new.id,coalesce(new.raw_user_meta_data->>'display_name','Toxity user'),lower(coalesce(new.raw_user_meta_data->>'nametag','user_'||substr(new.id::text,1,8)))); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.send_friend_request(target_nametag text) returns uuid language plpgsql security definer set search_path=public as $$
declare target uuid; begin select id into target from profiles where nametag=lower(target_nametag); if target is null then raise exception 'Nametag não encontrado'; end if; insert into friendships(requester_id,addressee_id) values(auth.uid(),target); return target; end $$;

create or replace function public.create_group_with_owner(group_name text,group_description text default '') returns uuid language plpgsql security definer set search_path=public as $$
declare created uuid; begin insert into groups(owner_id,name,description) values(auth.uid(),group_name,group_description) returning id into created; insert into group_members(group_id,user_id,role) values(created,auth.uid(),'owner'); return created; end $$;

grant execute on function public.send_friend_request(text) to authenticated;
grant execute on function public.create_group_with_owner(text,text) to authenticated;
alter publication supabase_realtime add table public.messages;
