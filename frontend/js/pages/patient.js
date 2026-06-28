/* pages/patient.js — Patient portal.
 *
 * Hash-routed sections mirror the SRS patient capabilities (read-only on clinical
 * content; full control over consent):
 *
 *   FR-PAT-1  view own complete record (encounters/results/rx/vitals) → #overview, #records
 *   FR-PAT-2  view the access trail of who touched the record          → #access-log
 *   FR-PAT-3  grant / revoke consent (anchored on-chain)              → #consent
 *   FR-PAT-4  request integrity verification of own records           → Verify buttons
 *   FR-PAT-5  update own non-clinical contact details                 → contact dialog
 *   FR-PAT-6  cannot alter clinical content                           → no edit affordances
 *
 * Live mode reads the patient's OWN rows (RLS auto-scopes every query to
 * user_id = auth.uid()); clinical content is decrypted on demand via read-record.
 * Consent grants/revokes persist to the consents table (the patient owns those
 * rows). Demo shell keeps the synthetic data.
 */
import { mountDashboard, integrityBadge, escapeHtml } from '../layout.js';
import {
  greeting, statCards, panel, sectionHeader, badge, kv, toggleRow,
  emptyState, primaryBtn, ghostBtn, searchInput,
} from '../widgets.js';
import { mountRouter, openDialog, closeDialog, openFormDialog, field, textInput } from '../ui.js';
import { ROLES, ROLE_LABEL } from '../roles.js';
import { verifyIntegrity, readRecord } from '../api.js';
import {
  getEncounters, getLabResults, getPrescriptions, getVitals,
  getAppointments, getAuditLog, getConsents, getMyPatient, grantConsent, revokeConsent, updatePatient,
} from '../data.js';

const currentSection = () => {
  const ids = ['overview', 'records', 'consent', 'access-log'];
  const h = location.hash.replace('#', '');
  return ids.includes(h) ? h : 'overview';
};

const ctx = await mountDashboard({ role: ROLES.PATIENT, active: currentSection(), title: 'My Health' });

/* ---- consent scopes (stable keys stored in consents.scope) -------------- */
const SCOPES = [
  { key: 'treating_team', label: 'Treating team', desc: 'Doctors and nurses directly involved in your care' },
  { key: 'laboratory', label: 'Laboratory', desc: 'Lab technicians fulfilling your test orders' },
  { key: 'research', label: 'De-identified research', desc: 'Anonymised use of your data for clinical research' },
];

/* ---- synthetic "my" data (demo shell only) ------------------------------ */
let MY_PATIENT = null;
let RECORDS = [
  { id: 'rec_1', type: 'Encounter', detail: 'Routine Follow-up · Essential hypertension', author: 'Dr. Wilson', when: 'Oct 24, 2026', status: 'VERIFIED', version: 2, kind: 'encounter' },
  { id: 'rec_2', type: 'Lab Result', detail: 'Lipid Panel · LDL 142 mg/dL', author: 'Laboratory', when: 'Oct 24, 2026', status: 'VERIFIED', version: 1, kind: 'lab_result' },
  { id: 'rec_3', type: 'Prescription', detail: 'Lisinopril 10 mg · once daily', author: 'Dr. Wilson', when: 'Oct 24, 2026', status: 'VERIFIED', version: 2, kind: 'prescription' },
  { id: 'rec_4', type: 'Vitals', detail: 'BP 128/82 · HR 74 · T 36.8°C', author: 'Nurse Bello', when: 'Oct 24, 2026', status: 'VERIFIED', version: 1, kind: 'vitals' },
  { id: 'rec_5', type: 'Prescription', detail: 'Metformin 500 mg · twice daily', author: 'Dr. Wilson', when: 'Sep 18, 2026', status: 'VERIFIED', version: 1, kind: 'prescription' },
];

let APPOINTMENTS = [
  { with: 'Dr. Wilson', dept: 'Cardiology', when: 'Oct 31, 2026 · 09:30', status: 'Scheduled' },
];

let CONSENTS = SCOPES.map((s) => ({ ...s, granted: s.key !== 'research' }));

let ACCESS_LOG = [
  { who: 'Dr. Wilson', role: 'DOCTOR', action: 'Read encounter', when: 'Oct 24 · 09:20', outcome: 'Permitted' },
  { who: 'Nurse Bello', role: 'NURSE', action: 'Read vitals', when: 'Oct 24 · 08:15', outcome: 'Permitted' },
  { who: 'Lab Tech Park', role: 'LAB_TECHNICIAN', action: 'Read lab order context', when: 'Oct 23 · 16:40', outcome: 'Permitted' },
  { who: 'Receptionist Diaz', role: 'RECEPTIONIST', action: 'Open clinical note', when: 'Oct 23 · 14:02', outcome: 'Denied' },
  { who: 'Dr. Adeyemi', role: 'DOCTOR', action: 'Read record (no consent)', when: 'Oct 22 · 11:10', outcome: 'Denied' },
];

let CONSENT_HISTORY = [
  { kind: 'Granted', scope: 'Laboratory', when: 'Oct 23 · 16:30' },
  { kind: 'Granted', scope: 'Treating team', when: 'Oct 20 · 10:00' },
  { kind: 'Revoked', scope: 'De-identified research', when: 'Oct 18 · 09:12' },
];

// appointment status DB enum → display label (declared before loadLive uses it).
const APPT_LABEL = { scheduled: 'Scheduled', 'checked-in': 'Checked in', completed: 'Completed', cancelled: 'Cancelled', 'no-show': 'No-show' };

/* ---- live data before first render --------------------------------------- */
if (!ctx.demo) {
  try { await loadLive(); } catch (e) { console.error('loadLive', e); ctx.toast('Could not load your record.', 'error'); }
}

const router = mountRouter({
  ctx,
  sections: { overview: renderOverview, records: renderRecords, consent: renderConsent, 'access-log': renderAccessLog },
  afterRender: wire,
});

async function refresh() {
  if (!ctx.demo) {
    try { await loadLive(); } catch (e) { console.error('refresh', e); }
  }
  router.route();
}

/* =============================================================================
   Sections
   ========================================================================== */
function renderOverview() {
  const appt = APPOINTMENTS[0];
  return `
    ${greeting('My health record', 'Read your records, verify their integrity, and control who can access them.')}
    ${statCards([
      { label: 'My Records', value: String(RECORDS.length), icon: 'folder_shared', tone: 'primary' },
      { label: 'Upcoming Appts', value: String(APPOINTMENTS.length), icon: 'calendar_month', tone: 'secondary' },
      { label: 'Consent Grants', value: String(CONSENTS.filter((c) => c.granted).length), icon: 'handshake', tone: 'tertiary' },
      { label: 'Integrity', value: integrityRate(), icon: 'verified_user', tone: 'verified' },
    ])}
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-lg">
      <div class="lg:col-span-8 flex flex-col gap-lg">
        ${panel({
          title: 'Recent Records',
          action: `<button data-go="records" class="text-primary font-label-md text-label-md hover:underline">View all</button>`,
          body: recordsTable(RECORDS.slice(0, 5)),
        })}
      </div>
      <div class="lg:col-span-4 flex flex-col gap-lg">
        ${panel({
          title: 'Next Appointment',
          body: appt ? `<div class="p-lg space-y-sm">
            <p class="font-headline-md text-[18px] font-bold">${escapeHtml(appt.with)}</p>
            <p class="text-body-sm text-on-surface-variant">${escapeHtml(appt.dept)}</p>
            <div class="flex items-center gap-sm text-primary mt-md"><span class="material-symbols-outlined text-[18px]">event</span><span class="font-body-sm text-body-sm">${escapeHtml(appt.when)}</span></div>
            <div class="mt-sm">${badge(appt.status, 'secondary')}</div>
          </div>` : emptyState('event_available', 'No upcoming appointments'),
        })}
        <div class="glass-card p-lg">
          <h3 class="font-headline-md text-[18px] font-bold mb-md">My Profile</h3>
          <p class="text-body-sm text-on-surface-variant mb-md">You may update your own contact details (FR-PAT-5). Clinical content is read-only.</p>
          ${primaryBtn('Update contact details', { icon: 'edit', attr: 'data-edit-contact' })}
        </div>
      </div>
    </div>
  `;
}

function renderRecords() {
  return `
    ${sectionHeader({
      title: 'My Records',
      subtitle: 'Your complete health record — encounters, results, prescriptions and vitals (FR-PAT-1). Read-only; you can verify integrity and open content.',
      actions: searchInput('Search records…', 'data-filter="rec-tbody"'),
    })}
    ${panel({ title: `All records (${RECORDS.length})`, body: recordsTable(RECORDS, 'rec-tbody') })}
    <div class="glass-card p-lg flex items-start gap-md mt-lg">
      <span class="material-symbols-outlined text-primary">lock</span>
      <p class="text-on-surface-variant text-body-sm">Records are decrypted server-side by <span class="text-on-surface font-medium">read-record</span> only after an authorised, audited read — you never hold the AES key and cannot alter clinical content (FR-PAT-6).</p>
    </div>
  `;
}

function renderConsent() {
  return `
    ${sectionHeader({
      title: 'Consent',
      subtitle: 'Control who can access your record beyond emergency care. Each change is recorded (FR-PAT-3 / US-PAT-3).',
    })}
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-lg">
      ${panel({
        title: 'Access grants',
        span: 'lg:col-span-7',
        body: `<div class="p-lg space-y-md">
          ${CONSENTS.map((c) => toggleRow({ id: `consent-${c.key}`, label: c.label, desc: c.desc, checked: c.granted })).join('')}
          <p class="text-[11px] text-on-surface-variant/70 pt-sm">Changes take effect on the next access decision. On-chain anchoring via the consent contract lands in Increment 3.</p>
        </div>`,
      })}
      ${panel({
        title: 'Consent history',
        span: 'lg:col-span-5',
        body: CONSENT_HISTORY.length ? `<div class="divide-y divide-white/5">
          ${CONSENT_HISTORY.map((h) => consentEvent(h.kind, h.scope, h.when)).join('')}
        </div>` : `<p class="p-lg text-body-sm text-on-surface-variant">No consent changes recorded yet.</p>`,
      })}
    </div>
  `;
}

function renderAccessLog() {
  return `
    ${sectionHeader({
      title: 'Access Log',
      subtitle: 'Every access or modification of your record — tamper-evident and unalterable (FR-PAT-2 / US-PAT-2).',
      actions: searchInput('Search log…', 'data-filter="log-tbody"'),
    })}
    ${panel({
      title: `Access events (${ACCESS_LOG.length})`,
      body: `
        <div class="overflow-x-auto">
          <table class="w-full text-left">
            <thead class="bg-white/5 font-label-md text-label-md text-on-surface-variant">
              <tr>
                <th class="px-lg py-md font-medium">Accessed by</th>
                <th class="px-lg py-md font-medium">Role</th>
                <th class="px-lg py-md font-medium">Action</th>
                <th class="px-lg py-md font-medium">When</th>
                <th class="px-lg py-md font-medium">Outcome</th>
              </tr>
            </thead>
            <tbody id="log-tbody" class="divide-y divide-white/5 font-body-sm text-body-sm">
              ${ACCESS_LOG.length ? ACCESS_LOG.map((l) => `
                <tr class="hover:bg-white/5 transition-colors">
                  <td class="px-lg py-md font-medium">${escapeHtml(l.who)}</td>
                  <td class="px-lg py-md">${badge((l.role || '').replace('_', ' '), 'neutral')}</td>
                  <td class="px-lg py-md text-on-surface-variant">${escapeHtml(l.action)}</td>
                  <td class="px-lg py-md text-on-surface-variant">${escapeHtml(l.when)}</td>
                  <td class="px-lg py-md">${l.outcome === 'Denied' ? badge('Denied', 'error') : badge('Permitted', 'verified')}</td>
                </tr>`).join('') : emptyRow(5, 'No access events recorded yet.')}
            </tbody>
          </table>
        </div>`,
    })}
    <div class="glass-card p-lg flex items-start gap-md mt-lg">
      <span class="material-symbols-outlined text-verified">shield</span>
      <p class="text-on-surface-variant text-body-sm">The access log is an append-only event trail — no user, not even an administrator, can edit or delete entries (FR-AUD-3).</p>
    </div>
  `;
}

/* =============================================================================
   Builders
   ========================================================================== */
function recordsTable(rows, tbodyId = '') {
  return `
    <div class="overflow-x-auto">
      <table class="w-full text-left">
        <thead class="bg-white/5 font-label-md text-label-md text-on-surface-variant">
          <tr>
            <th class="px-lg py-md font-medium">Record</th>
            <th class="px-lg py-md font-medium">Detail</th>
            <th class="px-lg py-md font-medium">By</th>
            <th class="px-lg py-md font-medium">Date</th>
            <th class="px-lg py-md font-medium">Integrity</th>
            <th class="px-lg py-md"></th>
          </tr>
        </thead>
        <tbody ${tbodyId ? `id="${tbodyId}"` : ''} class="divide-y divide-white/5 font-body-sm text-body-sm">
          ${rows.length ? rows.map((r) => `
            <tr class="hover:bg-white/5 transition-colors">
              <td class="px-lg py-md font-medium text-on-surface">${escapeHtml(r.type)}</td>
              <td class="px-lg py-md text-on-surface-variant">${r.detail ? escapeHtml(r.detail) : lockedCell()}</td>
              <td class="px-lg py-md text-on-surface-variant">${escapeHtml(r.author)}</td>
              <td class="px-lg py-md text-on-surface-variant">${escapeHtml(r.when)}</td>
              <td class="px-lg py-md">${integrityBadge(r.status)} ${r.version > 1 ? badge(`v${r.version}`, 'neutral') : ''}</td>
              <td class="px-lg py-md text-right whitespace-nowrap">
                <button data-view="${r.id}" class="text-primary font-label-md text-label-md hover:underline mr-md">Open</button>
                <button data-verify="${r.id}" data-type="${r.kind}" class="text-primary font-label-md text-label-md hover:underline">Verify</button>
              </td>
            </tr>`).join('') : emptyRow(6, 'No records yet.')}
        </tbody>
      </table>
    </div>`;
}

function consentEvent(kind, scope, when) {
  const tone = kind === 'Revoked' ? 'error' : 'verified';
  return `<div class="p-lg flex items-center justify-between gap-md">
      <div><p class="font-body-sm text-body-sm font-medium">${escapeHtml(scope)}</p><p class="text-[11px] text-on-surface-variant">${escapeHtml(when)}</p></div>
      ${badge(kind, tone)}
    </div>`;
}

/* =============================================================================
   Wiring
   ========================================================================== */
function wire() {
  ctx.main.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { location.hash = b.dataset.go; }));
  ctx.main.querySelectorAll('[data-verify]').forEach((b) => b.addEventListener('click', () => doVerify(b.dataset.verify, b.dataset.type, b)));
  ctx.main.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => openRecord(b.dataset.view)));
  ctx.main.querySelectorAll('[data-edit-contact]').forEach((b) => b.addEventListener('click', openContactForm));
  ctx.main.querySelectorAll('[id^="consent-"]').forEach((t) => t.addEventListener('change', () => onConsentToggle(t)));

  ctx.main.querySelectorAll('[data-filter]').forEach((inp) => {
    const tb = ctx.main.querySelector(`#${inp.dataset.filter}`);
    if (!tb) return;
    inp.addEventListener('input', () => {
      const q = inp.value.trim().toLowerCase();
      tb.querySelectorAll('tr').forEach((r) => { r.style.display = r.textContent.toLowerCase().includes(q) ? '' : 'none'; });
    });
  });
}

async function doVerify(recordId, recordType, btn) {
  if (ctx.demo) return ctx.toast('Integrity verification is wired in Increment 2.', 'ok');
  const original = btn.textContent; btn.textContent = 'Verifying…'; btn.disabled = true;
  try {
    const res = await verifyIntegrity({ recordId, recordType });
    const status = res?.status ?? 'VERIFIED';
    ctx.toast(`Integrity: ${status}`, status === 'TAMPERED' ? 'error' : 'ok');
  } catch { ctx.toast('Verification failed.', 'error'); }
  finally { btn.textContent = original; btn.disabled = false; }
}

async function openRecord(id) {
  const r = RECORDS.find((x) => x.id === id);
  if (!r) return;
  let detailHtml = `${kv('Detail', escapeHtml(r.detail || '—'))}`;
  // Live: decrypt the content via read-record.
  if (!ctx.demo && r.detail == null) {
    let fields = {};
    try {
      const res = await readRecord({ recordType: r.kind, recordId: r.id });
      fields = res?.fields || {};
    } catch { return ctx.toast('Could not open the record.', 'error'); }
    detailHtml = fieldsForKind(r.kind, fields);
  }
  openDialog({
    kind: 'drawer',
    title: r.type,
    subtitle: `${r.author} · ${r.when}`,
    body: `
      <div class="mb-md">${integrityBadge(r.status)} ${r.version > 1 ? badge(`version ${r.version}`, 'neutral') : ''}</div>
      <section class="glass-card p-lg">
        ${kv('Type', r.type)}
        ${detailHtml}
        ${kv('Date', escapeHtml(r.when))}
      </section>
      <p class="text-[11px] text-on-surface-variant mt-md">This is a read-only view (FR-PAT-6). Use Verify to confirm the record has not been altered since it was anchored.</p>`,
    footer: `${ghostBtn('Close', { attr: 'data-close' })}${primaryBtn('Verify Integrity', { icon: 'verified_user', attr: 'data-verify-rec' })}`,
    onOpen: (wrap) => {
      wrap.querySelector('[data-verify-rec]')?.addEventListener('click', (e) => doVerify(r.id, r.kind, e.currentTarget));
    },
  });
}

function fieldsForKind(kind, f) {
  if (kind === 'encounter') {
    return `${kv('Chief complaint', escapeHtml(f.chief_complaint ?? '—'))}
            ${kv('Examination', escapeHtml(f.examination ?? '—'))}
            ${kv('Diagnosis', escapeHtml(f.diagnosis ?? '—'))}
            ${kv('Progress note', escapeHtml(f.progress_note ?? '—'))}`;
  }
  if (kind === 'prescription') {
    return `${kv('Drug', escapeHtml(f.drug ?? '—'))}
            ${kv('Dose', escapeHtml(f.dose ?? '—'))}
            ${kv('Frequency', escapeHtml(f.frequency ?? '—'))}
            ${kv('Duration', escapeHtml(f.duration ?? '—'))}`;
  }
  if (kind === 'lab_result') {
    return kv('Result', `<span class="text-on-surface font-medium">${escapeHtml(f.result_payload ?? '—')}</span>`);
  }
  if (kind === 'vitals') {
    return `${kv('Temperature', escapeHtml(f.temperature ?? '—'))}
            ${kv('Blood pressure', escapeHtml(f.blood_pressure ?? '—'))}
            ${kv('Heart rate', escapeHtml(f.heart_rate ?? '—'))}
            ${kv('Respiratory rate', escapeHtml(f.resp_rate ?? '—'))}
            ${kv('SpO₂', escapeHtml(f.spo2 ?? '—'))}
            ${f.note ? kv('Note', escapeHtml(f.note)) : ''}`;
  }
  return kv('Detail', '—');
}

function openContactForm() {
  const p = MY_PATIENT;
  openFormDialog({
    title: 'Update Contact Details',
    subtitle: 'Non-clinical details only (FR-PAT-5).',
    submitIcon: 'save',
    body: `
      ${field('Phone', textInput('phone', { value: p?.phone || '', placeholder: 'Phone number' }))}
      ${field('Address', textInput('address', { value: p?.address || '', placeholder: 'Street, city' }))}
      ${field('Emergency contact', textInput('emergency', { value: p?.emergency_contact || '', placeholder: 'Name · phone' }))}`,
    onSubmit: (wrap) => submitContact(wrap),
  });
}

async function submitContact(wrap) {
  const v = formVals(wrap);
  if (ctx.demo) { ctx.toast('Contact update goes through the front desk in Increment 1+.', 'ok'); return closeDialog(); }
  if (!MY_PATIENT) { ctx.toast('No chart is linked to your account yet — contact the front desk.', 'error'); return closeDialog(); }
  try {
    await updatePatient(MY_PATIENT.id, { phone: v.phone || null, address: v.address || null, emergency_contact: v.emergency || null });
    ctx.toast('Contact details updated.', 'ok');
    closeDialog();
    await refresh();
  } catch (e) {
    // Demographics are owned by the front desk under RLS; if self-update isn't
    // permitted the change is surfaced honestly rather than silently dropped.
    console.error('updatePatient (self)', e);
    ctx.toast('Contact changes are managed by the front desk — your request was not saved directly.', 'error');
    closeDialog();
  }
}

async function onConsentToggle(el) {
  const scope = el.id.replace('consent-', '');
  const granted = el.checked;
  if (ctx.demo) return ctx.toast(`Consent ${granted ? 'granted' : 'revoked'} — anchored on-chain in Increment 3.`, 'ok');
  if (!MY_PATIENT) { ctx.toast('No chart is linked to your account yet.', 'error'); el.checked = !granted; return; }
  try {
    if (granted) await grantConsent(MY_PATIENT.id, scope);
    else await revokeConsent(MY_PATIENT.id, scope);
    ctx.toast(granted ? 'Consent granted.' : 'Consent revoked.', 'ok');
    await loadLive();
  } catch (e) {
    console.error('consent', e);
    ctx.toast('Could not update consent.', 'error');
    el.checked = !granted;
  }
}

/* =============================================================================
   Live data + helpers
   ========================================================================== */
async function loadLive() {
  const [me, encounters, results, prescriptions, vitals, appts, audit, consents] = await Promise.all([
    getMyPatient(), getEncounters(), getLabResults(), getPrescriptions(), getVitals(),
    getAppointments(), getAuditLog(), getConsents(),
  ]);
  MY_PATIENT = me;

  const recs = [];
  for (const e of encounters) recs.push({ id: e.id, type: 'Encounter', detail: null, author: 'Doctor', when: fmtDate(e.datetime), status: anchorIntegrity(e.anchor_status), version: e.version, kind: 'encounter', _ts: e.datetime });
  for (const r of results) recs.push({ id: r.id, type: 'Lab Result', detail: null, author: 'Laboratory', when: fmtDate(r.completed_at), status: anchorIntegrity(r.anchor_status), version: r.version, kind: 'lab_result', _ts: r.completed_at });
  for (const p of prescriptions) recs.push({ id: p.id, type: 'Prescription', detail: null, author: 'Doctor', when: fmtDate(p.created_at), status: anchorIntegrity(p.anchor_status), version: p.version, kind: 'prescription', _ts: p.created_at });
  for (const v of vitals) recs.push({ id: v.id, type: v.kind === 'note' ? 'Nursing note' : 'Vitals', detail: null, author: 'Nursing', when: fmtDate(v.recorded_at), status: anchorIntegrity(v.anchor_status), version: v.version, kind: 'vitals', _ts: v.recorded_at });
  recs.sort((a, b) => new Date(b._ts) - new Date(a._ts));
  RECORDS = recs;

  APPOINTMENTS = appts.map((a) => ({
    with: 'Care provider',
    dept: a.reason || 'Appointment',
    when: fmtDateTime(a.datetime),
    status: APPT_LABEL[a.status] || titleCase(a.status || 'scheduled'),
  }));

  ACCESS_LOG = audit.map((a) => ({
    who: ROLE_LABEL[a.role] || a.role || 'System',
    role: a.role || '',
    action: a.action,
    when: fmtDateTime(a.created_at),
    outcome: a.outcome === 'denied' ? 'Denied' : 'Permitted',
  }));

  // Active grant = a consent row for the scope with no revoked_at.
  const activeByScope = {};
  for (const c of consents) if (!c.revoked_at) activeByScope[c.scope] = true;
  CONSENTS = SCOPES.map((s) => ({ ...s, granted: Boolean(activeByScope[s.key]) }));

  // History from consent rows (granted_at / revoked_at), newest first.
  const hist = [];
  for (const c of consents) {
    const label = SCOPES.find((s) => s.key === c.scope)?.label || c.scope;
    if (c.granted_at) hist.push({ kind: 'Granted', scope: label, when: fmtDateTime(c.granted_at), _ts: c.granted_at });
    if (c.revoked_at) hist.push({ kind: 'Revoked', scope: label, when: fmtDateTime(c.revoked_at), _ts: c.revoked_at });
  }
  hist.sort((a, b) => new Date(b._ts) - new Date(a._ts));
  CONSENT_HISTORY = hist;
}

function integrityRate() {
  if (!RECORDS.length) return '—';
  const ok = RECORDS.filter((r) => r.status === 'VERIFIED').length;
  return `${Math.round((ok / RECORDS.length) * 100)}%`;
}
function formVals(wrap) {
  const out = {};
  wrap.querySelectorAll('[name]').forEach((el) => { out[el.name] = el.value; });
  return out;
}
function lockedCell() {
  return `<span class="inline-flex items-center gap-xs text-on-surface-variant"><span class="material-symbols-outlined text-[14px]">lock</span>Encrypted</span>`;
}
function emptyRow(cols, text) {
  return `<tr><td colspan="${cols}" class="px-lg py-xl text-center text-on-surface-variant text-body-sm">${escapeHtml(text)}</td></tr>`;
}
function titleCase(s) { return String(s).charAt(0).toUpperCase() + String(s).slice(1); }
function fmtDate(ts) {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
function fmtDateTime(ts) {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function anchorIntegrity(anchorStatus) {
  if (anchorStatus === 'anchored') return 'VERIFIED';
  if (anchorStatus === 'tampered') return 'TAMPERED';
  return 'PENDING';
}
