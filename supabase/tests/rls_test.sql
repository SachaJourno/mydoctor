\set ON_ERROR_STOP 1
grant all on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
insert into auth.users values ('00000000-0000-0000-0000-00000000000d', '{"role":"doctor","full_name":"Dr A"}'),
 ('00000000-0000-0000-0000-00000000000a', '{"role":"patient","full_name":"Pat A"}'),
 ('00000000-0000-0000-0000-00000000000b', '{"role":"patient","full_name":"Pat B"}');
set role authenticated;
set request.jwt.sub = '00000000-0000-0000-0000-00000000000d';
select public.create_invite() as code \gset
set request.jwt.sub = '00000000-0000-0000-0000-00000000000a';
select public.redeem_invite(:'code');
set request.jwt.sub = '00000000-0000-0000-0000-00000000000d';
insert into care_plans (doctor_id, patient_id, title) values ('00000000-0000-0000-0000-00000000000d','00000000-0000-0000-0000-00000000000a','Angine') returning id as plan \gset
insert into medications (plan_id, name, times) values (:'plan', 'Amoxicilline 1 g', '{08:00,20:00}');
insert into tasks (plan_id, kind, title) values (:'plan', 'pharmacy', 'Acheter les médicaments') returning id as task \gset
-- plan vers patient B : refusé
do $$ begin
  begin
    insert into care_plans (doctor_id, patient_id) values ('00000000-0000-0000-0000-00000000000d','00000000-0000-0000-0000-00000000000b');
    raise exception 'ATTENDU: refus';
  exception when insufficient_privilege then raise notice 'ok refus plan patient non lié';
  end;
end $$;
set request.jwt.sub = '00000000-0000-0000-0000-00000000000a';
select count(*) as brouillon_visible from care_plans;  -- 0
set request.jwt.sub = '00000000-0000-0000-0000-00000000000d';
update care_plans set status='sent', sent_at=now() where id = :'plan';
set request.jwt.sub = '00000000-0000-0000-0000-00000000000a';
select count(*) as plans, (select count(*) from medications) as meds, (select count(*) from tasks) as tasks from care_plans;
select public.set_task_done(:'task', true);
select done_at is not null as done from tasks;
update profiles set role='doctor' where id = auth.uid();
select role from profiles where id = auth.uid();
select full_name from profiles order by full_name;
set request.jwt.sub = '00000000-0000-0000-0000-00000000000b';
select count(*) as autre_patient_voit from care_plans;
