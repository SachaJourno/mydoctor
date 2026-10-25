-- MyDoctor : schéma initial
-- Règle d'or : un patient ne voit que ce que son médecin a validé et envoyé.

create extension if not exists pgcrypto;

-- Profils -------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('doctor', 'patient')),
  full_name text not null default '',
  timezone text not null default 'Europe/Paris',
  created_at timestamptz not null default now()
);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'role', 'patient'),
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Le rôle est fixé à l'inscription et ne change plus.
create function public.keep_role() returns trigger
language plpgsql as $$
begin
  new.role := old.role;
  return new;
end;
$$;

create trigger profiles_keep_role
  before update on public.profiles
  for each row execute function public.keep_role();

-- Liens médecin <-> patient ---------------------------------------------------

create table public.care_links (
  doctor_id uuid not null references public.profiles (id) on delete cascade,
  patient_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (doctor_id, patient_id)
);

create table public.invites (
  code text primary key,
  doctor_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_by uuid references public.profiles (id),
  used_at timestamptz
);

create function public.is_linked(p_doctor uuid, p_patient uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.care_links
    where doctor_id = p_doctor and patient_id = p_patient
  );
$$;

create function public.is_doctor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'doctor');
$$;

-- Le médecin crée un code à 6 chiffres que le patient saisit.
create function public.create_invite() returns text
language plpgsql security definer set search_path = public as $$
declare
  v_code text;
begin
  if not public.is_doctor() then
    raise exception 'Seul un médecin peut inviter un patient';
  end if;
  loop
    v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (select 1 from public.invites where code = v_code and used_at is null);
  end loop;
  delete from public.invites where code = v_code;
  insert into public.invites (code, doctor_id) values (v_code, auth.uid());
  return v_code;
end;
$$;

create function public.redeem_invite(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_invite public.invites;
begin
  select * into v_invite from public.invites
  where code = p_code and used_at is null and expires_at > now()
  for update;
  if not found then
    raise exception 'Code invalide ou expiré';
  end if;
  if (select role from public.profiles where id = auth.uid()) <> 'patient' then
    raise exception 'Seul un patient peut utiliser un code';
  end if;
  insert into public.care_links (doctor_id, patient_id)
  values (v_invite.doctor_id, auth.uid())
  on conflict do nothing;
  update public.invites set used_by = auth.uid(), used_at = now() where code = p_code;
  return v_invite.doctor_id;
end;
$$;

-- Plans de soin -----------------------------------------------------------------

create table public.care_plans (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.profiles (id) on delete cascade,
  patient_id uuid not null references public.profiles (id) on delete cascade,
  title text not null default 'Consultation',
  status text not null default 'draft' check (status in ('draft', 'sent')),
  source_text text not null default '',
  source_files text[] not null default '{}',
  extraction jsonb,
  advice text[] not null default '{}',
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create table public.medications (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.care_plans (id) on delete cascade,
  name text not null,
  dosage text not null default '',
  form text not null default '',
  quantity_per_intake numeric,
  unit text not null default '',
  times text[] not null default '{}', -- heures de prise, format HH:MM
  start_date date,
  end_date date,
  instructions text not null default '',
  uncertain_fields text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.care_plans (id) on delete cascade,
  kind text not null check (kind in ('pharmacy', 'appointment', 'exam', 'other')),
  title text not null,
  details text not null default '',
  due_date date,
  appointment_at timestamptz,
  done_at timestamptz,
  created_at timestamptz not null default now()
);

-- Une ligne par prise cochée par le patient.
create table public.dose_logs (
  id uuid primary key default gen_random_uuid(),
  medication_id uuid not null references public.medications (id) on delete cascade,
  patient_id uuid not null references public.profiles (id) on delete cascade,
  scheduled_for timestamptz not null,
  status text not null check (status in ('taken', 'skipped')),
  logged_at timestamptz not null default now(),
  unique (medication_id, scheduled_for)
);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index on public.care_plans (patient_id, status);
create index on public.medications (plan_id);
create index on public.tasks (plan_id);
create index on public.dose_logs (patient_id, scheduled_for);
create index on public.chat_messages (patient_id, created_at);

-- RLS -----------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.care_links enable row level security;
alter table public.invites enable row level security;
alter table public.care_plans enable row level security;
alter table public.medications enable row level security;
alter table public.tasks enable row level security;
alter table public.dose_logs enable row level security;
alter table public.chat_messages enable row level security;

create policy "profil : soi-même" on public.profiles
  for select using (id = auth.uid());
create policy "profil : modifier soi-même" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
create policy "profil : personnes liées" on public.profiles
  for select using (public.is_linked(auth.uid(), id) or public.is_linked(id, auth.uid()));

create policy "liens : les deux parties" on public.care_links
  for select using (doctor_id = auth.uid() or patient_id = auth.uid());

create policy "invitations : le médecin" on public.invites
  for select using (doctor_id = auth.uid());

create policy "plans : le médecin lit" on public.care_plans
  for select using (doctor_id = auth.uid());
create policy "plans : le médecin crée" on public.care_plans
  for insert with check (doctor_id = auth.uid() and public.is_linked(auth.uid(), patient_id));
create policy "plans : le médecin modifie" on public.care_plans
  for update using (doctor_id = auth.uid()) with check (doctor_id = auth.uid() and public.is_linked(auth.uid(), patient_id));
create policy "plans : le médecin supprime un brouillon" on public.care_plans
  for delete using (doctor_id = auth.uid() and status = 'draft');
create policy "plans : le patient lit les plans envoyés" on public.care_plans
  for select using (patient_id = auth.uid() and status = 'sent');

create function public.can_edit_plan(p_plan uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.care_plans where id = p_plan and doctor_id = auth.uid());
$$;

create function public.can_read_plan(p_plan uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.care_plans
    where id = p_plan
      and (doctor_id = auth.uid() or (patient_id = auth.uid() and status = 'sent'))
  );
$$;

create policy "médicaments : lecture" on public.medications
  for select using (public.can_read_plan(plan_id));
create policy "médicaments : le médecin écrit" on public.medications
  for all using (public.can_edit_plan(plan_id)) with check (public.can_edit_plan(plan_id));

create policy "tâches : lecture" on public.tasks
  for select using (public.can_read_plan(plan_id));
create policy "tâches : le médecin écrit" on public.tasks
  for all using (public.can_edit_plan(plan_id)) with check (public.can_edit_plan(plan_id));

-- Le patient coche ou décoche une tâche, sans pouvoir changer le reste.
create function public.set_task_done(p_task uuid, p_done boolean, p_appointment_at timestamptz default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.tasks t
  set done_at = case when p_done then now() else null end,
      appointment_at = coalesce(p_appointment_at, t.appointment_at)
  from public.care_plans p
  where t.id = p_task and p.id = t.plan_id and p.patient_id = auth.uid() and p.status = 'sent';
  if not found then
    raise exception 'Tâche introuvable';
  end if;
end;
$$;

create policy "prises : le patient" on public.dose_logs
  for all using (patient_id = auth.uid()) with check (patient_id = auth.uid());
create policy "prises : le médecin lit" on public.dose_logs
  for select using (public.is_linked(auth.uid(), patient_id));

create policy "chat : le patient lit" on public.chat_messages
  for select using (patient_id = auth.uid());
-- Les messages sont écrits par la fonction patient-chat (clé de service).

-- Stockage des ordonnances ----------------------------------------------------------
-- Chemin : <doctor_id>/<plan_id>/<fichier>

insert into storage.buckets (id, name, public) values ('prescriptions', 'prescriptions', false)
on conflict (id) do nothing;

create policy "ordonnances : le médecin dépose" on storage.objects
  for insert with check (bucket_id = 'prescriptions' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "ordonnances : le médecin lit" on storage.objects
  for select using (bucket_id = 'prescriptions' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "ordonnances : le médecin supprime" on storage.objects
  for delete using (bucket_id = 'prescriptions' and (storage.foldername(name))[1] = auth.uid()::text);
