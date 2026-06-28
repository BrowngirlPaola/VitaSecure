/* data.js — RLS-scoped PostgREST reads + non-clinical writes (Increment 1).
 *
 * These helpers use the shared Supabase client, so every query carries the
 * signed-in user's JWT and is gated by RLS (deny-by-default). They return the
 * CLEAR columns + ciphertext METADATA the row exposes — never decrypted clinical
 * content. To read encrypted fields (diagnosis, drug, result…) call read-record
 * via api.js, which decrypts server-side and audits the read.
 *
 * Writes here are limited to the CLEAR tables a role may write directly under
 * RLS (e.g. a doctor creating a lab order). Encrypted clinical writes go through
 * create-record so the encrypt → hash → anchor → audit pipeline always runs.
 */

import { getSupabase } from './supabaseClient.js';

async function client() {
  const c = await getSupabase();
  if (!c) throw new Error('Supabase not configured (demo shell).');
  return c;
}

export async function getPatients() {
  const c = await client();
  const { data, error } = await c
    .from('patients')
    .select('id, mrn, full_name, dob, sex, phone, address, emergency_contact, chart_status, created_at')
    .order('full_name', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getAllergies() {
  const c = await client();
  const { data, error } = await c
    .from('allergies')
    .select('id, patient_id, substance, reaction, severity');
  if (error) throw error;
  return data ?? [];
}

export async function getEncounters() {
  const c = await client();
  const { data, error } = await c
    .from('encounters')
    .select('id, patient_id, doctor_id, datetime, encounter_type, version, anchor_status')
    .order('datetime', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getLabOrders() {
  const c = await client();
  const { data, error } = await c
    .from('lab_orders')
    .select('id, patient_id, ordering_doctor_id, test_type, priority, status, created_at, lab_results(id, version, anchor_status)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getPrescriptions() {
  const c = await client();
  const { data, error } = await c
    .from('prescriptions')
    .select('id, patient_id, doctor_id, encounter_id, status, version, anchor_status, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/* ---- Admin reads (RLS: admin-only on profiles + audit_log) --------------- */

/** All user accounts. Admin can read every profile (0001 RLS). Email/last-login
 *  live in auth.users (not exposed to PostgREST), so only profile fields return. */
export async function getProfiles() {
  const c = await client();
  const { data, error } = await c
    .from('profiles')
    .select('id, full_name, title, role, status, created_at')
    .order('full_name', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Append-only audit log (admin reads all; FR-ADM-3 / FR-AUD-3). Written by the
 *  Edge Functions — empty until create/read-record run. */
export async function getAuditLog(limit = 100) {
  const c = await client();
  const { data, error } = await c
    .from('audit_log')
    .select('id, user_id, role, action, object_type, object_id, outcome, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

/** Admin (de)activates an account — non-clinical write the admin RLS policy
 *  permits (FR-ADM-1). The authoritative ROLE change still goes on-chain via the
 *  assign-role Edge Function (Increment 3); status is the DB backstop. */
export async function setProfileStatus(userId, status) {
  const c = await client();
  const { error } = await c
    .from('profiles')
    .update({ status })
    .eq('id', userId);
  if (error) throw error;
}

/** Admin assigns a role (FR-ADM-2). Direct `profiles.role` update permitted by
 *  the admin RLS policy "admin can manage profiles" (0001) — the genuinely
 *  working Increment-1 path, mirroring setProfileStatus. The new role reaches the
 *  target user's JWT on their next sign-in/refresh, because the custom
 *  access-token hook reads `profiles.role` at mint time. On-chain RBAC anchoring
 *  (the assign-role Edge Function) layers on top in Increment 3; this row stays
 *  the DB backstop. */
export async function setProfileRole(userId, role) {
  const c = await client();
  const { error } = await c
    .from('profiles')
    .update({ role })
    .eq('id', userId);
  if (error) throw error;
}

/* ---- Vitals & nursing notes (nurse C R U; doctor/nurse R; patient R own) -- */

/** Vitals/nursing-note metadata rows (clear cols only; content is encrypted and
 *  read via read-record). RLS scopes to the care team or the patient's own rows. */
export async function getVitals() {
  const c = await client();
  const { data, error } = await c
    .from('vitals')
    .select('id, patient_id, nurse_id, kind, recorded_at, version, anchor_status')
    .order('recorded_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/* ---- Lab results (read metadata + order/test context) -------------------- */

/** Lab-result metadata with the order + patient context needed to label rows.
 *  RLS lets the care team read all; a patient sees only their own. */
export async function getLabResults() {
  const c = await client();
  const { data, error } = await c
    .from('lab_results')
    .select('id, order_id, lab_tech_id, completed_at, version, anchor_status, lab_orders(test_type, patient_id, patients(full_name, mrn))')
    .order('completed_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/* ---- Lab queue (lab tech: orders directed to the lab) -------------------- */

/** Orders for the lab queue, with patient context and whether a result exists.
 *  RLS permits LAB_TECHNICIAN to read lab_orders + patients. */
export async function getLabQueue() {
  const c = await client();
  const { data, error } = await c
    .from('lab_orders')
    .select('id, test_type, priority, status, created_at, ordering_doctor_id, patient_id, patients(full_name, mrn), lab_results(id)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Lab tech / doctor advances an order's status (RLS: LAB_TECHNICIAN, DOCTOR). */
export async function setLabOrderStatus(orderId, status) {
  const c = await client();
  const { error } = await c.from('lab_orders').update({ status }).eq('id', orderId);
  if (error) throw error;
}

/* ---- Patient demographics writes (receptionist C R U) -------------------- */

/** Register a new patient chart. Generates a unique MRN client-side; RLS insert
 *  policy requires RECEPTIONIST. */
export async function createPatient({ fullName, dob, sex, phone, address, emergencyContact }) {
  const c = await client();
  const mrn = `MRN-${Math.floor(100000 + Math.random() * 900000)}`;
  const { data, error } = await c
    .from('patients')
    .insert({
      mrn,
      full_name: fullName,
      dob: dob || null,
      sex: sex || null,
      phone: phone || null,
      address: address || null,
      emergency_contact: emergencyContact || null,
    })
    .select('id, mrn')
    .single();
  if (error) throw error;
  return data;
}

/** Update demographic fields on a chart (RLS update: RECEPTIONIST). */
export async function updatePatient(id, fields) {
  const c = await client();
  const { error } = await c.from('patients').update(fields).eq('id', id);
  if (error) throw error;
}

/** Set chart status active|inactive|closed (RLS update: RECEPTIONIST). */
export async function setChartStatus(id, chartStatus) {
  const c = await client();
  const { error } = await c.from('patients').update({ chart_status: chartStatus }).eq('id', id);
  if (error) throw error;
}

/* ---- Appointments (receptionist C R U; care team + patient R) ------------ */

export async function getAppointments() {
  const c = await client();
  const { data, error } = await c
    .from('appointments')
    .select('id, patient_id, provider_id, datetime, reason, status, patients(full_name, mrn)')
    .order('datetime', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createAppointment({ patientId, datetime, reason = null, providerId = null }) {
  const c = await client();
  const { data, error } = await c
    .from('appointments')
    .insert({ patient_id: patientId, datetime, reason, provider_id: providerId })
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

export async function setAppointmentStatus(id, status) {
  const c = await client();
  const { error } = await c.from('appointments').update({ status }).eq('id', id);
  if (error) throw error;
}

/* ---- Patient self-service (own chart + consent) -------------------------- */

/** The signed-in patient's own demographics row (RLS returns only user_id =
 *  auth.uid()). Null if no chart is linked to the account yet. */
export async function getMyPatient() {
  const c = await client();
  const { data, error } = await c
    .from('patients')
    .select('id, mrn, full_name, dob, sex, phone, address, emergency_contact, chart_status, user_id')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Consent rows for the patient (RLS: patient sees own; care team + admin read). */
export async function getConsents() {
  const c = await client();
  const { data, error } = await c
    .from('consents')
    .select('id, patient_id, scope, granted_to, granted_at, revoked_at, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Grant a consent scope (insert; RLS consents_write requires the patient owns
 *  the row). Anchoring on-chain follows in Increment 3. */
export async function grantConsent(patientId, scope) {
  const c = await client();
  const { error } = await c
    .from('consents')
    .insert({ patient_id: patientId, scope, granted_to: scope, granted_at: new Date().toISOString() });
  if (error) throw error;
}

/** Revoke the active grant for a scope (mark revoked_at on the open row). */
export async function revokeConsent(patientId, scope) {
  const c = await client();
  const { error } = await c
    .from('consents')
    .update({ revoked_at: new Date().toISOString() })
    .eq('patient_id', patientId)
    .eq('scope', scope)
    .is('revoked_at', null);
  if (error) throw error;
}

/** Doctor creates a lab order (clear table; RLS check = DOCTOR). */
export async function createLabOrder({ patientId, doctorId, testType, priority, encounterId = null, notes = null }) {
  const c = await client();
  const { data, error } = await c
    .from('lab_orders')
    .insert({
      patient_id: patientId,
      ordering_doctor_id: doctorId,
      test_type: testType,
      priority,
      encounter_id: encounterId,
      notes,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data;
}
