create table public.group_channels (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 40),
  type text not null check (type in ('text', 'voice')),
  position integer not null default 0,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.group_channels enable row level security;
create policy "members read channels" on public.group_channels for select to authenticated using (public.is_group_member(group_id));
grant select on public.group_channels to authenticated;

alter table public.messages add column channel_id uuid references public.group_channels(id) on delete cascade;
alter table public.call_presence add column channel_id uuid references public.group_channels(id) on delete cascade;

insert into public.group_channels(group_id, name, type, position, created_by)
select g.id, 'geral', 'text', 0, g.owner_id from public.groups g;
insert into public.group_channels(group_id, name, type, position, created_by)
select g.id, 'Sala principal', 'voice', 1, g.owner_id from public.groups g;

update public.messages m set channel_id = (
  select c.id from public.group_channels c where c.group_id = m.group_id and c.type = 'text' order by c.position limit 1
) where channel_id is null;
alter table public.messages alter column channel_id set not null;

create or replace function public.create_group_with_owner(group_name text, group_description text default '')
returns uuid language plpgsql security definer set search_path=public as $$
declare created uuid;
begin
  insert into groups(owner_id,name,description) values(auth.uid(),group_name,group_description) returning id into created;
  insert into group_members(group_id,user_id,role) values(created,auth.uid(),'owner');
  insert into group_channels(group_id,name,type,position,created_by) values
    (created,'geral','text',0,auth.uid()),
    (created,'Sala principal','voice',1,auth.uid());
  return created;
end $$;

create or replace function public.create_group_channel(target_group_id uuid, channel_name text, channel_type text)
returns uuid language plpgsql security definer set search_path=public as $$
declare created uuid;
begin
  if channel_type not in ('text','voice') then raise exception 'Tipo de canal inválido'; end if;
  if not exists(select 1 from group_members where group_id=target_group_id and user_id=auth.uid() and role in ('owner','admin')) then
    raise exception 'Somente donos e administradores podem criar canais';
  end if;
  insert into group_channels(group_id,name,type,position,created_by)
  values(target_group_id,channel_name,channel_type,(select coalesce(max(position),-1)+1 from group_channels where group_id=target_group_id),auth.uid())
  returning id into created;
  return created;
end $$;
grant execute on function public.create_group_channel(uuid,text,text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('avatars','avatars',true,5242880,array['image/jpeg','image/png','image/webp','image/gif'])
on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy "users upload own avatar" on storage.objects for insert to authenticated
with check(bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "users update own avatar" on storage.objects for update to authenticated
using(bucket_id='avatars' and owner_id=auth.uid()::text);
create policy "users delete own avatar" on storage.objects for delete to authenticated
using(bucket_id='avatars' and owner_id=auth.uid()::text);

alter publication supabase_realtime add table public.group_channels;
