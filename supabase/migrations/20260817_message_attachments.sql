alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages add column attachment_path text;
alter table public.messages add column attachment_name text;
alter table public.messages add column attachment_mime text;
alter table public.messages add column attachment_size bigint;
alter table public.messages add constraint messages_content_check check (
  (char_length(body) between 1 and 4000) or attachment_path is not null
);

alter table public.direct_messages drop constraint if exists direct_messages_body_check;
alter table public.direct_messages add column attachment_path text;
alter table public.direct_messages add column attachment_name text;
alter table public.direct_messages add column attachment_mime text;
alter table public.direct_messages add column attachment_size bigint;
alter table public.direct_messages add constraint direct_messages_content_check check (
  (char_length(body) between 1 and 4000) or attachment_path is not null
);

insert into storage.buckets (id, name, public, file_size_limit)
values ('message-attachments', 'message-attachments', false, 26214400)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

create policy "users upload message attachments" on storage.objects
for insert to authenticated with check (
  bucket_id = 'message-attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "authenticated users read message attachments" on storage.objects
for select to authenticated using (bucket_id = 'message-attachments');

create policy "owners delete message attachments" on storage.objects
for delete to authenticated using (
  bucket_id = 'message-attachments' and owner_id = auth.uid()::text
);
