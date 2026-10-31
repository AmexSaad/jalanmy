select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
set role authenticated;
select public.jalanmy_report('Banjir',array[103.7,1.5]);
select public.jalanmy_report('Banjir',array[103.7,1.5]);
do $$begin
 if jsonb_array_length(public.jalanmy_reports())<>1 then raise exception 'Duplicate report not merged'; end if;
end$$;
do $$declare rid uuid=(public.jalanmy_reports()->0->>'id')::uuid; rejected boolean=false; begin
 begin perform public.jalanmy_vote(rid,array[103.7,1.5],true); exception when others then rejected=true; end;
 if not rejected then raise exception 'Author self-confirmation accepted'; end if;
end$$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
select public.jalanmy_vote((public.jalanmy_reports()->0->>'id')::uuid,array[103.7,1.5],false);
select public.jalanmy_vote((public.jalanmy_reports()->0->>'id')::uuid,array[103.7,1.5],false);
do $$begin if jsonb_array_length(public.jalanmy_reports())<>1 then raise exception 'Duplicate identity counted twice'; end if; end$$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
select public.jalanmy_vote((public.jalanmy_reports()->0->>'id')::uuid,array[103.7,1.5],false);
do $$begin if jsonb_array_length(public.jalanmy_reports())<>0 then raise exception 'Independent removals not applied'; end if; end$$;
reset role;
-- Verify clients cannot invoke these RPCs without an authenticated user.
do $$begin
 if has_function_privilege('anon','public.jalanmy_reports()','execute') then raise exception 'Anonymous role can bypass session'; end if;
 if has_table_privilege('authenticated','jalanmy_private.reports','select') then raise exception 'Private tables exposed'; end if;
 if has_function_privilege('authenticated','jalanmy_private.quota(text,integer)','execute') then raise exception 'Internal helper exposed'; end if;
end$$;
