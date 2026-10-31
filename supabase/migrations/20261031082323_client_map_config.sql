-- Public, origin-restricted client key. Never store server/secret credentials here.
create table if not exists jalanmy_private.client_config (
  id boolean primary key default true check(id),
  geoapify_key text not null check(length(geoapify_key) between 16 and 200)
);
alter table jalanmy_private.client_config enable row level security;
revoke all on jalanmy_private.client_config from public,anon,authenticated;
create or replace function jalanmy_private.api_client_config() returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'Sesi diperlukan.'; end if;
 perform jalanmy_private.quota('config',30);
 select jsonb_build_object('geoapifyKey',c.geoapify_key) into result from jalanmy_private.client_config c where c.id;
 return coalesce(result,'{}'::jsonb);
end;
$$;
revoke all on function jalanmy_private.api_client_config() from public,anon;
grant execute on function jalanmy_private.api_client_config() to authenticated;
create or replace function public.jalanmy_client_config() returns jsonb
language sql security invoker set search_path='' as $$select jalanmy_private.api_client_config()$$;
revoke all on function public.jalanmy_client_config() from public,anon;
grant execute on function public.jalanmy_client_config() to authenticated;
