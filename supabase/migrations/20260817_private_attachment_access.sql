create or replace function public.can_access_message_attachment(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.messages m
    where m.attachment_path = object_name and public.is_group_member(m.group_id)
  ) or exists (
    select 1 from public.direct_messages dm
    where dm.attachment_path = object_name and auth.uid() in (dm.sender_id, dm.recipient_id)
  );
$$;

revoke all on function public.can_access_message_attachment(text) from public;
grant execute on function public.can_access_message_attachment(text) to authenticated;

drop policy if exists "authenticated users read message attachments" on storage.objects;
create policy "participants read message attachments" on storage.objects
for select to authenticated using (
  bucket_id = 'message-attachments'
  and (owner_id = auth.uid()::text or public.can_access_message_attachment(name))
);
