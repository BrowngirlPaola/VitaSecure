-- =============================================================================
-- 0002_core_schema.sql — clinical + administrative data model (SRS §8, Increment 1)
--
-- Design rules (CLAUDE.md / Directives):
--   * Deny-by-default RLS on every table; explicit policies only.
--   * Raw clinical CONTENT is never stored in the clear. Sensitive free-text /
--     result fields live as AES-256-GCM ciphertext (ciphertext + iv + auth_tag),
--     produced ONLY inside Edge Functions (the AES key never touches the DB or
--     the browser). Identifiers + foreign keys stay in clear so RLS and queries
--     work.
--   * Ciphertext is opaque, so authorised clients MAY SELECT clinical rows for
--     listing/metadata — they still cannot read content without read-record
--     (server-side decrypt). All CLINICAL WRITES are denied to clients and go
--     through create-record (service role) so the encrypt → hash → anchor → audit
--     pipeline is always applied and "updates never overwrite" holds.
--   * Each record-bearing clinical table carries version + record_hash +
--     anchor_tx_id + anchor_status (no chain yet in Increment 1 → 'pending-anchor').
--
-- Role strings come from the JWT claim user_role (see 0001) and MUST match
-- frontend/js/roles.js and the on-chain RBAC contract.
-- =============================================================================

create extension if not exists pgcrypto;  -- gen_random_uuid()

-- Convenience: the caller's application role from the JWT (null if absent).
create or replace function public.auth_role()
returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'user_role', '')
$$;

-- updated_at maintenance.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

-- =============================================================================
-- PATIENTS (demographics — PII, but not clinical CONTENT; kept clear so RLS /
-- search / FKs work). Receptionist owns C R U; clinical roles read; patient
-- reads own; admin reads.
-- =============================================================================
create table if not exists public.patients (
  id                uuid primary key default gen_random_uuid(),
  mrn               text unique not null,
  user_id           uuid references auth.users (id) on delete set null, -- patient login link
  full_name         text not null,
  dob               date,
  sex               text,
  phone             text,
  address           text,
  emergency_contact text,
  chart_status      text not null default 'active'
                      check (chart_status in ('active','inactive','closed')),
  created_by        uuid references auth.users (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists patients_user_id_idx on public.patients (user_id);
drop trigger if exists patients_touch on public.patients;
create trigger patients_touch before update on public.patients
  for each row execute function public.touch_updated_at();

-- =============================================================================
-- APPOINTMENTS (scheduling — clear). Receptionist C R U; clinical roles read;
-- patient reads own.
-- =============================================================================
create table if not exists public.appointments (
  id           uuid primary key default gen_random_uuid(),
  patient_id   uuid not null references public.patients (id) on delete cascade,
  provider_id  uuid references auth.users (id),
  datetime     timestamptz not null,
  reason       text,
  status       text not null default 'scheduled'
                 check (status in ('scheduled','checked-in','completed','cancelled','no-show')),
  created_by   uuid references auth.users (id),
  created_at   timestamptz not null default now()
);
create index if not exists appointments_patient_idx on public.appointments (patient_id);

-- =============================================================================
-- ENCOUNTERS (clinical — sensitive fields encrypted). Doctor C R U V; nurse R;
-- patient R own.
-- =============================================================================
create table if not exists public.encounters (
  id            uuid primary key default gen_random_uuid(),
  patient_id    uuid not null references public.patients (id) on delete cascade,
  doctor_id     uuid not null references auth.users (id),
  datetime      timestamptz not null default now(),
  encounter_type text,
  -- encrypted JSON of { chief_complaint, examination, diagnosis, progress_note }
  ciphertext    text not null,
  iv            text not null,
  auth_tag      text not null,
  version       int  not null default 1,
  record_hash   text not null,
  anchor_tx_id  text,
  anchor_status text not null default 'pending-anchor'
                  check (anchor_status in ('pending-anchor','anchored','tampered')),
  created_at    timestamptz not null default now()
);
create index if not exists encounters_patient_idx on public.encounters (patient_id);

-- =============================================================================
-- VITALS / NURSING NOTES (clinical — encrypted). Nurse C R U V; doctor R V;
-- patient R own.
-- =============================================================================
create table if not exists public.vitals (
  id            uuid primary key default gen_random_uuid(),
  patient_id    uuid not null references public.patients (id) on delete cascade,
  nurse_id      uuid not null references auth.users (id),
  kind          text not null default 'vitals' check (kind in ('vitals','note')),
  recorded_at   timestamptz not null default now(),
  ciphertext    text not null,   -- { temperature, blood_pressure, heart_rate, resp_rate, weight, spo2, note }
  iv            text not null,
  auth_tag      text not null,
  version       int  not null default 1,
  record_hash   text not null,
  anchor_tx_id  text,
  anchor_status text not null default 'pending-anchor'
                  check (anchor_status in ('pending-anchor','anchored','tampered')),
  created_at    timestamptz not null default now()
);
create index if not exists vitals_patient_idx on public.vitals (patient_id);

-- =============================================================================
-- ALLERGIES (structured reference the treating team needs fast; per SRS §8 it
-- carries NO hash/anchor — not encrypted). Doctor R U; nurse R; patient R own.
-- =============================================================================
create table if not exists public.allergies (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null references public.patients (id) on delete cascade,
  substance   text not null,
  reaction    text,
  severity    text check (severity in ('mild','moderate','severe')),
  created_by  uuid references auth.users (id),
  created_at  timestamptz not null default now()
);
create index if not exists allergies_patient_idx on public.allergies (patient_id);

-- =============================================================================
-- LAB ORDERS (request + status — clear, no hash/anchor per §8). Doctor C R;
-- lab tech R (assigned) + status U; nurse R; patient R own.
-- =============================================================================
create table if not exists public.lab_orders (
  id                 uuid primary key default gen_random_uuid(),
  encounter_id       uuid references public.encounters (id) on delete set null,
  patient_id         uuid not null references public.patients (id) on delete cascade,
  ordering_doctor_id uuid not null references auth.users (id),
  test_type          text not null,
  priority           text not null default 'Routine' check (priority in ('Routine','Urgent','STAT')),
  status             text not null default 'ordered'
                       check (status in ('ordered','received','in-progress','completed','cancelled')),
  notes              text,
  created_at         timestamptz not null default now()
);
create index if not exists lab_orders_patient_idx on public.lab_orders (patient_id);
create index if not exists lab_orders_status_idx on public.lab_orders (status);

-- =============================================================================
-- LAB RESULTS (clinical — encrypted). Lab tech C R U V (own); doctor R V;
-- nurse R; patient R own.
-- =============================================================================
create table if not exists public.lab_results (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.lab_orders (id) on delete cascade,
  lab_tech_id    uuid not null references auth.users (id),
  ciphertext     text not null,   -- { result_payload }
  iv             text not null,
  auth_tag       text not null,
  attachment_ref text,
  completed_at   timestamptz not null default now(),
  version        int  not null default 1,
  record_hash    text not null,
  anchor_tx_id   text,
  anchor_status  text not null default 'pending-anchor'
                   check (anchor_status in ('pending-anchor','anchored','tampered')),
  created_at     timestamptz not null default now()
);
create index if not exists lab_results_order_idx on public.lab_results (order_id);

-- =============================================================================
-- PRESCRIPTIONS (clinical — encrypted). Doctor C R U V; nurse R; patient R own.
-- =============================================================================
create table if not exists public.prescriptions (
  id            uuid primary key default gen_random_uuid(),
  encounter_id  uuid references public.encounters (id) on delete set null,
  patient_id    uuid not null references public.patients (id) on delete cascade,
  doctor_id     uuid not null references auth.users (id),
  ciphertext    text not null,   -- { drug, dose, frequency, duration }
  iv            text not null,
  auth_tag      text not null,
  status        text not null default 'active' check (status in ('active','completed','cancelled')),
  version       int  not null default 1,
  record_hash   text not null,
  anchor_tx_id  text,
  anchor_status text not null default 'pending-anchor'
                  check (anchor_status in ('pending-anchor','anchored','tampered')),
  created_at    timestamptz not null default now()
);
create index if not exists prescriptions_patient_idx on public.prescriptions (patient_id);

-- =============================================================================
-- CONSENT (policy data — clear). Patient C R U (own); admin/doctor/nurse R.
-- =============================================================================
create table if not exists public.consents (
  id           uuid primary key default gen_random_uuid(),
  patient_id   uuid not null references public.patients (id) on delete cascade,
  scope        text not null,
  granted_to   text,
  granted_at   timestamptz,
  revoked_at   timestamptz,
  anchor_tx_id text,
  created_at   timestamptz not null default now()
);
create index if not exists consents_patient_idx on public.consents (patient_id);

-- =============================================================================
-- AUDIT LOG (append-only; never editable — FR-AUD-3). Written by Edge Functions
-- (service role). Admin reads all; others read their own actions / own record.
-- =============================================================================
create table if not exists public.audit_log (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users (id),
  role         text,
  action       text not null,
  object_type  text,
  object_id    text,
  patient_id   uuid references public.patients (id) on delete set null,
  outcome      text not null default 'permitted' check (outcome in ('permitted','denied')),
  anchor_tx_id text,
  created_at   timestamptz not null default now()
);
create index if not exists audit_user_idx on public.audit_log (user_id);
create index if not exists audit_patient_idx on public.audit_log (patient_id);

-- =============================================================================
-- Enable RLS (deny-by-default) on everything.
-- =============================================================================
alter table public.patients      enable row level security;
alter table public.appointments  enable row level security;
alter table public.encounters    enable row level security;
alter table public.vitals        enable row level security;
alter table public.allergies     enable row level security;
alter table public.lab_orders    enable row level security;
alter table public.lab_results   enable row level security;
alter table public.prescriptions enable row level security;
alter table public.consents      enable row level security;
alter table public.audit_log     enable row level security;

-- Helper predicate: is the current patient row the caller's own record?
-- (patients.user_id = auth.uid())

-- ---- PATIENTS ---------------------------------------------------------------
create policy patients_select on public.patients for select using (
  public.auth_role() in ('ADMIN','DOCTOR','NURSE','RECEPTIONIST','LAB_TECHNICIAN')
  or user_id = auth.uid()
);
create policy patients_insert on public.patients for insert with check (
  public.auth_role() = 'RECEPTIONIST'
);
create policy patients_update on public.patients for update using (
  public.auth_role() = 'RECEPTIONIST'
) with check ( public.auth_role() = 'RECEPTIONIST' );

-- ---- APPOINTMENTS -----------------------------------------------------------
create policy appointments_select on public.appointments for select using (
  public.auth_role() in ('ADMIN','DOCTOR','NURSE','RECEPTIONIST')
  or exists (select 1 from public.patients p where p.id = patient_id and p.user_id = auth.uid())
);
create policy appointments_write on public.appointments for all using (
  public.auth_role() = 'RECEPTIONIST'
) with check ( public.auth_role() = 'RECEPTIONIST' );

-- ---- ENCOUNTERS (read metadata/ciphertext; writes via Edge Function only) ---
create policy encounters_select on public.encounters for select using (
  public.auth_role() in ('DOCTOR','NURSE')
  or exists (select 1 from public.patients p where p.id = patient_id and p.user_id = auth.uid())
);

-- ---- VITALS -----------------------------------------------------------------
create policy vitals_select on public.vitals for select using (
  public.auth_role() in ('DOCTOR','NURSE')
  or exists (select 1 from public.patients p where p.id = patient_id and p.user_id = auth.uid())
);

-- ---- ALLERGIES (small structured table; doctor may also write) --------------
create policy allergies_select on public.allergies for select using (
  public.auth_role() in ('DOCTOR','NURSE')
  or exists (select 1 from public.patients p where p.id = patient_id and p.user_id = auth.uid())
);
create policy allergies_write on public.allergies for all using (
  public.auth_role() = 'DOCTOR'
) with check ( public.auth_role() = 'DOCTOR' );

-- ---- LAB ORDERS (doctor creates; lab tech updates status) -------------------
create policy lab_orders_select on public.lab_orders for select using (
  public.auth_role() in ('DOCTOR','NURSE','LAB_TECHNICIAN')
  or exists (select 1 from public.patients p where p.id = patient_id and p.user_id = auth.uid())
);
create policy lab_orders_insert on public.lab_orders for insert with check (
  public.auth_role() = 'DOCTOR'
);
create policy lab_orders_update on public.lab_orders for update using (
  public.auth_role() in ('DOCTOR','LAB_TECHNICIAN')
) with check ( public.auth_role() in ('DOCTOR','LAB_TECHNICIAN') );

-- ---- LAB RESULTS (read; writes via Edge Function only) ----------------------
create policy lab_results_select on public.lab_results for select using (
  public.auth_role() in ('DOCTOR','NURSE','LAB_TECHNICIAN')
  or exists (
    select 1 from public.lab_orders o join public.patients p on p.id = o.patient_id
    where o.id = order_id and p.user_id = auth.uid()
  )
);

-- ---- PRESCRIPTIONS (read; writes via Edge Function only) --------------------
create policy prescriptions_select on public.prescriptions for select using (
  public.auth_role() in ('DOCTOR','NURSE')
  or exists (select 1 from public.patients p where p.id = patient_id and p.user_id = auth.uid())
);

-- ---- CONSENT (patient owns; care team + admin read) -------------------------
create policy consents_select on public.consents for select using (
  public.auth_role() in ('ADMIN','DOCTOR','NURSE')
  or exists (select 1 from public.patients p where p.id = patient_id and p.user_id = auth.uid())
);
create policy consents_write on public.consents for all using (
  exists (select 1 from public.patients p where p.id = patient_id and p.user_id = auth.uid())
) with check (
  exists (select 1 from public.patients p where p.id = patient_id and p.user_id = auth.uid())
);

-- ---- AUDIT LOG (read-only to clients; no insert/update/delete policies →
-- only the service role can write, and NOBODY can edit/delete: FR-AUD-3) -------
create policy audit_admin_read on public.audit_log for select using (
  public.auth_role() = 'ADMIN'
);
create policy audit_self_read on public.audit_log for select using (
  user_id = auth.uid()
  or exists (select 1 from public.patients p where p.id = patient_id and p.user_id = auth.uid())
);
