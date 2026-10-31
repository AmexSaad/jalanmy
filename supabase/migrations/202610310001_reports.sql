-- Apply in a free Supabase project. No paid services are provisioned by this file.
create schema if not exists jalanmy_private;
revoke all on schema jalanmy_private from public, anon, authenticated;
create table if not exists jalanmy_private.reports (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  category text not null check(category in ('Roadblock','Speed trap','Kemalangan','Banjir','Jalan tutup','Halangan')),
  lon double precision not null check(lon between 102.35 and 104.6),
  lat double precision not null check(lat between 1.15 and 2.95),
  created timestamptz not null default now(), expires timestamptz not null default now()+interval '1 hour',
  removed boolean not null default false
);
create index if not exists reports_active on jalanmy_private.reports(expires) where not removed;
create table if not exists jalanmy_private.votes (
  report uuid not null references jalanmy_private.reports(id) on delete cascade,
  voter uuid not null references auth.users(id) on delete cascade,
  present boolean not null, updated timestamptz not null default now(), primary key(report,voter)
);
create table if not exists jalanmy_private.quotas (
  who uuid not null references auth.users(id) on delete cascade, action text not null,
  bucket bigint not null, n integer not null, primary key(who,action,bucket)
);
alter table jalanmy_private.reports enable row level security;
alter table jalanmy_private.votes enable row level security;
alter table jalanmy_private.quotas enable row level security;
revoke all on all tables in schema jalanmy_private from public,anon,authenticated;

create or replace function jalanmy_private.valid_coordinate(coordinate double precision[]) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(array_length(coordinate,1)=2 and coordinate[1] between 102.35 and 104.6 and coordinate[2] between 1.15 and 2.95,false);
$$;
create or replace function jalanmy_private.distance(lon1 double precision,lat1 double precision,lon2 double precision,lat2 double precision) returns double precision
language sql immutable set search_path='' as $$
 select 111195*sqrt(power((lon1-lon2)*cos(radians((lat1+lat2)/2)),2)+power(lat1-lat2,2));
$$;
create or replace function jalanmy_private.quota(action_name text,maximum integer) returns void
language plpgsql security definer set search_path='' as $$
declare amount integer; current_bucket bigint=floor(extract(epoch from now())/600);
begin
 if auth.uid() is null then raise exception 'Sesi diperlukan.'; end if;
 insert into jalanmy_private.quotas as q values(auth.uid(),action_name,current_bucket,1)
 on conflict(who,action,bucket) do update set n=q.n+1 returning n into amount;
 if amount>maximum then raise exception 'Had penghantaran dicapai. Cuba kemudian.'; end if;
end;
$$;

create or replace function public.jalanmy_reports() returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'Sesi diperlukan.'; end if;
 perform jalanmy_private.quota('read',120);
 delete from jalanmy_private.reports where expires<now()-interval '1 day';
 delete from jalanmy_private.quotas where bucket<floor(extract(epoch from now())/600)-144;
 select coalesce(jsonb_agg(row_to_json(r)),'[]'::jsonb) into result from (
   select r.id,r.category,r.lon,r.lat,extract(epoch from r.created)*1000 as "createdAt",
     extract(epoch from r.expires)*1000 as "expiresAt",
     (select count(*) from jalanmy_private.votes v where v.report=r.id and v.present and v.updated>now()-interval '1 hour') as confirmed,
     (select count(*) from jalanmy_private.votes v where v.report=r.id and not v.present and v.updated>now()-interval '1 hour') as absent
   from jalanmy_private.reports r where not r.removed and r.expires>now() order by r.created desc limit 500
 ) r;
 return result;
end;
$$;

create or replace function public.jalanmy_report(category text,coordinate double precision[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare rid uuid;
begin
 if not jalanmy_private.valid_coordinate(coordinate) then raise exception 'Lokasi tidak sah.'; end if;
 if category is null or category not in ('Roadblock','Speed trap','Kemalangan','Banjir','Jalan tutup','Halangan') then raise exception 'Kategori tidak sah.'; end if;
 perform jalanmy_private.quota('report',5);
 -- Serialize per category to make nearby duplicate detection atomic.
 perform pg_advisory_xact_lock(hashtext(category));
 select r.id into rid from jalanmy_private.reports r where r.category=jalanmy_report.category
   and not r.removed and r.expires>now() and jalanmy_private.distance(r.lon,r.lat,coordinate[1],coordinate[2])<100 limit 1;
 if rid is not null then return jsonb_build_object('id',rid,'merged',true); end if;
 insert into jalanmy_private.reports(owner,category,lon,lat) values(auth.uid(),category,coordinate[1],coordinate[2]) returning id into rid;
 return jsonb_build_object('id',rid,'merged',false);
end;
$$;

create or replace function public.jalanmy_vote(report_id uuid,coordinate double precision[],present boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r jalanmy_private.reports; yes_count integer; no_count integer;
begin
 if not jalanmy_private.valid_coordinate(coordinate) or present is null then raise exception 'Pengesahan tidak sah.'; end if;
 perform jalanmy_private.quota('vote',60);
 select * into r from jalanmy_private.reports where id=report_id and not removed and expires>now() for update;
 if not found then raise exception 'Laporan sudah tamat.'; end if;
 if jalanmy_private.distance(r.lon,r.lat,coordinate[1],coordinate[2])>1000 then raise exception 'Sahkan laporan apabila berhampiran lokasinya.'; end if;
 if r.owner=auth.uid() then
   if present then raise exception 'Laporan anda menunggu pengesahan pengguna lain.'; end if;
   update jalanmy_private.reports set removed=true where id=report_id;
 else
   insert into jalanmy_private.votes values(report_id,auth.uid(),present,now())
    on conflict(report,voter) do update set present=excluded.present,updated=excluded.updated;
   select count(*) filter(where v.present),count(*) filter(where not v.present) into yes_count,no_count
    from jalanmy_private.votes v where v.report=report_id and v.updated>now()-interval '1 hour';
   if no_count>=2 and no_count>yes_count then
     update jalanmy_private.reports set removed=true where id=report_id;
   elsif present then
     update jalanmy_private.reports set expires=least(created+interval '6 hours',greatest(expires,now()+interval '30 minutes')) where id=report_id;
   end if;
 end if;
 return jsonb_build_object('ok',true);
end;
$$;
revoke all on all functions in schema jalanmy_private from public,anon,authenticated;
revoke all on function public.jalanmy_reports() from public,anon;
revoke all on function public.jalanmy_report(text,double precision[]) from public,anon;
revoke all on function public.jalanmy_vote(uuid,double precision[],boolean) from public,anon;
grant execute on function public.jalanmy_reports() to authenticated;
grant execute on function public.jalanmy_report(text,double precision[]) to authenticated;
grant execute on function public.jalanmy_vote(uuid,double precision[],boolean) to authenticated;
