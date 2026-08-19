create or replace function public.is_nametag_available(candidate_nametag text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select candidate_nametag ~ '^[a-z0-9_]{3,20}$'
    and not exists (
      select 1 from public.profiles
      where nametag = lower(trim(candidate_nametag))
    );
$$;

revoke all on function public.is_nametag_available(text) from public;
grant execute on function public.is_nametag_available(text) to anon, authenticated;
