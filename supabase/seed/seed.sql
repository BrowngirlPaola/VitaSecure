-- =============================================================================
-- seed.sql — synthetic Increment-1 data (NIH/ethics: NO real patient data, §1.5).
--
-- Populates the linked Supabase project with:
--   * one login per role (ADMIN, DOCTOR, NURSE, LAB_TECHNICIAN, RECEPTIONIST,
--     and three PATIENT logins) — created directly in auth.users with a bcrypt
--     password + a matching auth.identities row + an ACTIVE profile;
--   * patient charts (two linked to a patient login, one unlinked);
--   * the CLEAR tables only: appointments, allergies, lab_orders, consents.
--
-- Deliberately NOT seeded: encounters / vitals / lab_results / prescriptions.
-- Those carry AES-256-GCM ciphertext + a SHA-256 record_hash that can ONLY be
-- produced inside the create-record Edge Function (the key never touches SQL).
-- Create them through the pipeline instead — see scripts/smoke-increment1.mjs.
--
-- Idempotent: re-running updates in place (keyed on email / mrn). Safe to run
-- repeatedly in Dashboard ▸ SQL Editor, or via `supabase db push` with
-- [db.seed] configured.
--
-- Demo password for EVERY seeded account (synthetic, non-production):
--   vitasecure123
-- =============================================================================

-- Needed for crypt() / gen_salt() (pgcrypto) — also pulled in by 0002.
create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Helper: create-or-refresh an auth user + identity + an ACTIVE profile.
-- security definer so it can write the auth schema from the SQL editor.
-- -----------------------------------------------------------------------------
create or replace function public._seed_user(
  p_email     text,
  p_password  text,
  p_full_name text,
  p_role      app_role,
  p_title     text
) returns uuid
language plpgsql
security definer
set search_path = auth, public, extensions
as $$
declare
  uid uuid;
begin
  select id into uid from auth.users where email = p_email;

  if uid is null then
    uid := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      -- GoTrue scans these into non-nullable Go strings on login; they MUST be
      -- '' (not NULL) or auth fails with "Database error querying schema".
      confirmation_token, recovery_token, email_change, email_change_token_new,
      email_change_token_current, phone_change, phone_change_token,
      reauthentication_token
    ) values (
      '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
      p_email, crypt(p_password, gen_salt('bf')),
      now(),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object('full_name', p_full_name, 'requested_role', p_role::text),
      now(), now(),
      '', '', '', '', '', '', '', ''
    );
    insert into auth.identities (
      provider_id, user_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) values (
      uid::text, uid,
      jsonb_build_object('sub', uid::text, 'email', p_email, 'email_verified', true),
      'email', now(), now(), now()
    );
  else
    -- Refresh password + ensure the account is confirmed and usable. Repair any
    -- NULL token columns (the "Database error querying schema" cause) in place.
    update auth.users set
      encrypted_password = crypt(p_password, gen_salt('bf')),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      raw_user_meta_data = jsonb_build_object('full_name', p_full_name,
                                              'requested_role', p_role::text),
      confirmation_token         = coalesce(confirmation_token, ''),
      recovery_token             = coalesce(recovery_token, ''),
      email_change               = coalesce(email_change, ''),
      email_change_token_new     = coalesce(email_change_token_new, ''),
      email_change_token_current = coalesce(email_change_token_current, ''),
      phone_change               = coalesce(phone_change, ''),
      phone_change_token         = coalesce(phone_change_token, ''),
      reauthentication_token     = coalesce(reauthentication_token, ''),
      updated_at = now()
    where id = uid;
  end if;

  -- The handle_new_user trigger may have inserted a 'pending' PATIENT profile;
  -- force the seeded role/title and ACTIVE status here (admin would normally do
  -- this on-chain via assign-role in Increment 3).
  insert into public.profiles (id, full_name, title, role, status)
  values (uid, p_full_name, p_title, p_role, 'active')
  on conflict (id) do update set
    full_name = excluded.full_name,
    title     = excluded.title,
    role      = excluded.role,
    status    = 'active',
    updated_at = now();

  return uid;
end $$;

-- -----------------------------------------------------------------------------
-- Seed the accounts, patients and clear-table data in one transaction.
-- -----------------------------------------------------------------------------
do $$
declare
  u_admin uuid;
  u_doc   uuid;
  u_nurse uuid;
  u_lab   uuid;
  u_recep uuid;
  u_sarah uuid;  -- patient login
  u_marcus uuid; -- patient login
  u_elena uuid;  -- patient login

  pat_sarah  uuid;
  pat_marcus uuid;
  pat_elena  uuid;
  ord_elena  uuid;
begin
  ---------------------------------------------------------------------------
  -- Staff + patient logins (password: vitasecure123)
  ---------------------------------------------------------------------------
  u_admin := public._seed_user('admin@vitasecure.org',  'vitasecure123', 'Grace Okonkwo',  'ADMIN',          'System Administrator');
  u_doc   := public._seed_user('doctor@vitasecure.org', 'vitasecure123', 'Dr. James Wilson','DOCTOR',        'Physician');
  u_nurse := public._seed_user('nurse@vitasecure.org',  'vitasecure123', 'Amara Bello',    'NURSE',          'Registered Nurse');
  u_lab   := public._seed_user('lab@vitasecure.org',    'vitasecure123', 'Lina Park',      'LAB_TECHNICIAN', 'Lab Technician');
  u_recep := public._seed_user('reception@vitasecure.org','vitasecure123','Carlos Diaz',   'RECEPTIONIST',   'Receptionist');

  u_sarah  := public._seed_user('sarah@example.com',  'vitasecure123', 'Sarah Mitchell', 'PATIENT', 'Patient');
  u_marcus := public._seed_user('marcus@example.com', 'vitasecure123', 'Marcus Vane',    'PATIENT', 'Patient');
  u_elena  := public._seed_user('elena@example.com',  'vitasecure123', 'Elena Lopez',    'PATIENT', 'Patient');

  ---------------------------------------------------------------------------
  -- Patient charts (registered by the receptionist; patient logins linked).
  ---------------------------------------------------------------------------
  insert into public.patients
    (mrn, user_id, full_name, dob, sex, phone, address, emergency_contact, created_by)
  values
    ('MRN-10001', u_sarah,  'Sarah Mitchell', '1985-03-12', 'F', '+1 555 0114', '14 Maple Street, Springfield', 'Jane Doe · +1 555 0199', u_recep),
    ('MRN-10002', u_marcus, 'Marcus Vane',    '1971-09-02', 'M', '+1 555 0162', '8 Birch Road, Springfield',    'Paula Vane · +1 555 0177', u_recep),
    ('MRN-10003', u_elena,  'Elena Lopez',    '1990-07-21', 'F', '+1 555 0188', '23 Cedar Lane, Springfield',   'Mateo Lopez · +1 555 0133', u_recep)
  on conflict (mrn) do update set
    user_id           = excluded.user_id,
    full_name         = excluded.full_name,
    dob               = excluded.dob,
    sex               = excluded.sex,
    phone             = excluded.phone,
    address           = excluded.address,
    emergency_contact = excluded.emergency_contact;

  select id into pat_sarah  from public.patients where mrn = 'MRN-10001';
  select id into pat_marcus from public.patients where mrn = 'MRN-10002';
  select id into pat_elena  from public.patients where mrn = 'MRN-10003';

  ---------------------------------------------------------------------------
  -- Appointments (receptionist-owned, clear).
  ---------------------------------------------------------------------------
  delete from public.appointments where patient_id in (pat_sarah, pat_marcus, pat_elena);
  insert into public.appointments (patient_id, provider_id, datetime, reason, status, created_by)
  values
    (pat_sarah,  u_doc, now() + interval '7 days',  'Routine follow-up (hypertension)', 'scheduled',  u_recep),
    (pat_marcus, u_doc, now() + interval '2 days',  'Thyroid review',                   'scheduled',  u_recep),
    (pat_elena,  u_doc, now() - interval '1 day',   'Acute visit',                      'completed',  u_recep);

  ---------------------------------------------------------------------------
  -- Allergies (structured; not encrypted, no anchor — SRS §8).
  ---------------------------------------------------------------------------
  delete from public.allergies where patient_id in (pat_sarah, pat_marcus, pat_elena);
  insert into public.allergies (patient_id, substance, reaction, severity, created_by)
  values
    (pat_sarah,  'Penicillin', 'Hives',        'moderate', u_doc),
    (pat_marcus, 'Sulfa drugs','Rash',         'mild',     u_doc),
    (pat_elena,  'Latex',      'Anaphylaxis',  'severe',   u_doc);

  ---------------------------------------------------------------------------
  -- Lab orders (doctor-created queue items the lab tech will fulfil; clear).
  -- The smoke test creates a lab_result against ord_elena.
  ---------------------------------------------------------------------------
  delete from public.lab_orders where patient_id in (pat_sarah, pat_marcus, pat_elena);
  insert into public.lab_orders (patient_id, ordering_doctor_id, test_type, priority, status)
  values
    (pat_elena,  u_doc, 'Full Blood Count',       'STAT',    'ordered'),
    (pat_marcus, u_doc, 'Thyroid Function (TSH)',  'Urgent',  'in-progress'),
    (pat_sarah,  u_doc, 'Lipid Panel',             'Routine', 'received');

  select id into ord_elena from public.lab_orders
    where patient_id = pat_elena and test_type = 'Full Blood Count' limit 1;

  ---------------------------------------------------------------------------
  -- Consent (patient-owned, clear).
  ---------------------------------------------------------------------------
  delete from public.consents where patient_id = pat_sarah;
  insert into public.consents (patient_id, scope, granted_to, granted_at)
  values
    (pat_sarah, 'treating-team', 'Treating team', now() - interval '4 days'),
    (pat_sarah, 'laboratory',    'Laboratory',    now() - interval '2 days');

  raise notice 'Seed complete. Patients: Sarah=%, Marcus=%, Elena=%; FBC order=%',
    pat_sarah, pat_marcus, pat_elena, ord_elena;
end $$;

-- Drop the privileged helper so it doesn't linger as a security-definer function
-- that can write the auth schema. (Re-running seed.sql recreates it above.)
drop function if exists public._seed_user(text, text, text, app_role, text);

-- =============================================================================
-- Seeded logins (all password: vitasecure123)
--   admin@vitasecure.org       ADMIN
--   doctor@vitasecure.org      DOCTOR
--   nurse@vitasecure.org       NURSE
--   lab@vitasecure.org         LAB_TECHNICIAN
--   reception@vitasecure.org   RECEPTIONIST
--   sarah@example.com          PATIENT  (chart MRN-10001)
--   marcus@example.com         PATIENT  (chart MRN-10002)
--   elena@example.com          PATIENT  (chart MRN-10003)
-- =============================================================================
