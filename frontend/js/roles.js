/* roles.js — canonical role constants + per-role navigation (Directives §4.10).
 *
 * CRITICAL: these string VALUES are the single source of truth for role identity
 * and MUST be identical in three places:
 *   1. this file (frontend / guard UX),
 *   2. the Supabase `profiles.role` column + the JWT role claim that RLS reads
 *      (auth.jwt() ->> 'role' / user_role), and
 *   3. the on-chain RBAC contract.
 * If they drift, authorization silently breaks. Change them in all three together.
 *
 * Source: SRS §5 role–permission matrix. Six roles, least privilege.
 */

export const ROLES = Object.freeze({
  ADMIN: 'ADMIN',
  DOCTOR: 'DOCTOR',
  NURSE: 'NURSE',
  LAB_TECHNICIAN: 'LAB_TECHNICIAN',
  RECEPTIONIST: 'RECEPTIONIST',
  PATIENT: 'PATIENT',
});

export const ALL_ROLES = Object.freeze(Object.values(ROLES));

/** Dashboard page per role (filenames per Directives §3). */
export const ROLE_HOME = Object.freeze({
  [ROLES.ADMIN]: 'pages/admin.html',
  [ROLES.DOCTOR]: 'pages/doctor.html',
  [ROLES.NURSE]: 'pages/nurse.html',
  [ROLES.LAB_TECHNICIAN]: 'pages/labtech.html',
  [ROLES.RECEPTIONIST]: 'pages/receptionist.html',
  [ROLES.PATIENT]: 'pages/patient.html',
});

/** Human-readable label for UI chrome. */
export const ROLE_LABEL = Object.freeze({
  [ROLES.ADMIN]: 'Administrator',
  [ROLES.DOCTOR]: 'Doctor',
  [ROLES.NURSE]: 'Nurse',
  [ROLES.LAB_TECHNICIAN]: 'Lab Technician',
  [ROLES.RECEPTIONIST]: 'Receptionist',
  [ROLES.PATIENT]: 'Patient',
});

/**
 * Sidebar navigation per role, derived from the SRS §5 capability matrix.
 * `id` is used to mark the active link; `icon` is a Material Symbols name.
 */
export const ROLE_NAV = Object.freeze({
  [ROLES.ADMIN]: [
    { id: 'overview', label: 'Overview', icon: 'dashboard' },
    { id: 'users', label: 'Users & Roles', icon: 'manage_accounts' },
    { id: 'audit', label: 'Audit Log', icon: 'receipt_long' },
    { id: 'integrity', label: 'Integrity Reports', icon: 'verified_user' },
    { id: 'health', label: 'System Health', icon: 'monitor_heart' },
  ],
  [ROLES.DOCTOR]: [
    { id: 'overview', label: 'Dashboard', icon: 'dashboard' },
    { id: 'patients', label: 'My Patients', icon: 'group' },
    { id: 'encounters', label: 'Encounters', icon: 'medical_services' },
    { id: 'orders', label: 'Lab Orders', icon: 'biotech' },
    { id: 'prescriptions', label: 'Prescriptions', icon: 'prescriptions' },
  ],
  [ROLES.NURSE]: [
    { id: 'overview', label: 'Dashboard', icon: 'dashboard' },
    { id: 'patients', label: 'Patients', icon: 'group' },
    { id: 'vitals', label: 'Vitals & Notes', icon: 'monitor_heart' },
    { id: 'results', label: 'Results', icon: 'lab_panel' },
  ],
  [ROLES.LAB_TECHNICIAN]: [
    { id: 'overview', label: 'Dashboard', icon: 'dashboard' },
    { id: 'queue', label: 'Order Queue', icon: 'pending_actions' },
    { id: 'results', label: 'Enter Results', icon: 'science' },
    { id: 'verify', label: 'Integrity Verify', icon: 'verified' },
  ],
  [ROLES.RECEPTIONIST]: [
    { id: 'overview', label: 'Dashboard', icon: 'dashboard' },
    { id: 'register', label: 'Registration', icon: 'person_add' },
    { id: 'appointments', label: 'Appointments', icon: 'calendar_month' },
  ],
  [ROLES.PATIENT]: [
    { id: 'overview', label: 'My Health', icon: 'favorite' },
    { id: 'records', label: 'My Records', icon: 'folder_shared' },
    { id: 'consent', label: 'Consent', icon: 'handshake' },
    { id: 'access-log', label: 'Access Log', icon: 'history' },
  ],
});

export function isValidRole(role) {
  return ALL_ROLES.includes(role);
}

/** Resolve the landing page for a role; falls back to the sign-in page. */
export function homeForRole(role) {
  return ROLE_HOME[role] ?? 'index.html';
}
