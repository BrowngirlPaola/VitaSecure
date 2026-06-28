/* pages/receptionist.js — Receptionist (front desk) workspace.
 *
 * Sections follow the SRS receptionist capabilities — demographics + scheduling
 * only, never clinical content:
 *
 *   FR-REC-1  register a new patient + MRN (C)            → #register
 *   FR-REC-2  search + update demographics (R U)          → #register
 *   FR-REC-3  detect / warn on duplicate charts           → registration form
 *   FR-REC-4  create / reschedule / cancel appointments   → #appointments
 *   FR-REC-5  appointment calendar + check-in status      → #appointments
 *   FR-REC-6  manage chart status (active/inactive/closed)→ patient row
 *   FR-REC-7  no clinical content                         → not rendered (US-REC-4)
 *
 * Live mode reads patients + appointments under RLS (data.js) and all writes
 * persist directly (RECEPTIONIST RLS policies). Demo keeps the synthetic data.
 */
import { mountDashboard, escapeHtml } from '../layout.js';
import {
  greeting, statCards, quickActions, panel, sectionHeader, avatarCell, badge,
  primaryBtn, searchInput,
} from '../widgets.js';
import { mountRouter, openFormDialog, closeDialog, field, textInput, optionSelect } from '../ui.js';
import { ROLES } from '../roles.js';
import {
  getPatients, createPatient, updatePatient, setChartStatus,
  getAppointments, createAppointment, setAppointmentStatus,
} from '../data.js';

const currentSection = () => {
  const ids = ['overview', 'register', 'appointments'];
  const h = location.hash.replace('#', '');
  return ids.includes(h) ? h : 'overview';
};

const ctx = await mountDashboard({ role: ROLES.RECEPTIONIST, active: currentSection(), title: 'Receptionist' });

/* ---- demographics + appointments (demo shell only) --------------------- */
let PATIENTS = [
  { id: 'pat_01', name: 'Sarah Mitchell', mrn: 'MRN-48213', dob: '1979-03-12', sex: 'F', phone: '+1 555 0114', chart: 'Active' },
  { id: 'pat_02', name: 'Robert Klein', mrn: 'MRN-50917', dob: '1963-08-02', sex: 'M', phone: '+1 555 0192', chart: 'Active' },
  { id: 'pat_06', name: 'Daniel Osei', mrn: 'MRN-51402', dob: '1991-11-25', sex: 'M', phone: '+1 555 0177', chart: 'Inactive' },
];

let APPOINTMENTS = [
  { id: 'a1', name: 'Sarah Mitchell', when: 'Today · 09:15', provider: 'Dr. Wilson', reason: 'Follow-up', status: 'Checked in' },
  { id: 'a2', name: 'Marcus Vane', when: 'Today · 10:30', provider: 'Dr. Wilson', reason: 'Hypertension review', status: 'Scheduled' },
  { id: 'a3', name: 'Elena Lopez', when: 'Today · 11:00', provider: 'Dr. Adeyemi', reason: 'Post-op check', status: 'Scheduled' },
  { id: 'a4', name: 'Robert Klein', when: 'Today · 13:45', provider: 'Dr. Wilson', reason: 'AF management', status: 'No-show' },
];

// appointment status: DB enum ↔ display label (declared before loadLive uses them).
const APPT_LABEL = { scheduled: 'Scheduled', 'checked-in': 'Checked in', completed: 'Completed', cancelled: 'Cancelled', 'no-show': 'No-show' };
const APPT_DB = { Scheduled: 'scheduled', 'Checked in': 'checked-in', Completed: 'completed', Cancelled: 'cancelled', 'No-show': 'no-show' };

/* ---- live data before first render --------------------------------------- */
if (!ctx.demo) {
  try { await loadLive(); } catch (e) { console.error('loadLive', e); ctx.toast('Could not load front-desk data.', 'error'); }
}

const router = mountRouter({
  ctx,
  sections: { overview: renderOverview, register: renderRegister, appointments: renderAppointments },
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
  return `
    ${greeting('Front desk', 'Register patients and manage today’s appointments.')}
    ${statCards([
      { label: "Today's Appts", value: String(APPOINTMENTS.length), icon: 'calendar_month', tone: 'primary' },
      { label: 'Patient Charts', value: String(PATIENTS.length), icon: 'badge', tone: 'secondary' },
      { label: 'Checked In', value: String(APPOINTMENTS.filter((a) => a.status === 'Checked in').length), icon: 'how_to_reg', tone: 'verified' },
      { label: 'No-shows', value: String(APPOINTMENTS.filter((a) => a.status === 'No-show').length), icon: 'event_busy', tone: 'tertiary' },
    ])}
    ${quickActions([
      { id: 'register', label: 'Register Patient', desc: 'Create demographics record', icon: 'person_add', tone: 'primary' },
      { id: 'book', label: 'Book Appointment', desc: 'Schedule a visit', icon: 'edit_calendar', tone: 'secondary' },
      { id: 'goto-appts', label: 'Manage Schedule', desc: 'Calendar & check-in', icon: 'event', tone: 'tertiary' },
    ])}
    ${panel({
      title: "Today's Appointments",
      action: `<button data-go="appointments" class="text-primary font-label-md text-label-md hover:underline">Full calendar</button>`,
      body: apptTable(APPOINTMENTS.slice(0, 6)),
    })}
    <div class="glass-card p-lg flex items-start gap-md mt-lg">
      <span class="material-symbols-outlined text-tertiary">visibility_off</span>
      <p class="text-on-surface-variant text-body-sm">This role manages demographics and scheduling only. Clinical content — notes, vitals, results, prescriptions — is never visible or editable here (FR-REC-7 / US-REC-4).</p>
    </div>
  `;
}

function renderRegister() {
  return `
    ${sectionHeader({
      title: 'Registration',
      subtitle: 'Create and maintain patient demographic records (FR-REC-1/2). A unique MRN is generated on registration.',
      actions: `${searchInput('Search patients…', 'data-filter="reg-tbody"')}${primaryBtn('Register Patient', { icon: 'person_add', attr: 'data-action="register"' })}`,
    })}
    ${panel({
      title: `Patient charts (${PATIENTS.length})`,
      body: `
        <div class="overflow-x-auto">
          <table class="w-full text-left">
            <thead class="bg-white/5 font-label-md text-label-md text-on-surface-variant">
              <tr>
                <th class="px-lg py-md font-medium">Patient</th>
                <th class="px-lg py-md font-medium">MRN</th>
                <th class="px-lg py-md font-medium">DOB</th>
                <th class="px-lg py-md font-medium">Phone</th>
                <th class="px-lg py-md font-medium">Chart Status</th>
                <th class="px-lg py-md"></th>
              </tr>
            </thead>
            <tbody id="reg-tbody" class="divide-y divide-white/5 font-body-sm text-body-sm">
              ${PATIENTS.length ? PATIENTS.map((p) => `
                <tr class="hover:bg-white/5 transition-colors">
                  <td class="px-lg py-md">${avatarCell(p.name, 'secondary')}</td>
                  <td class="px-lg py-md text-on-surface-variant">${escapeHtml(p.mrn)}</td>
                  <td class="px-lg py-md text-on-surface-variant">${escapeHtml(p.dob || '—')}</td>
                  <td class="px-lg py-md text-on-surface-variant">${escapeHtml(p.phone || '—')}</td>
                  <td class="px-lg py-md">${chartBadge(p.chart)}</td>
                  <td class="px-lg py-md text-right whitespace-nowrap">
                    <button data-edit="${p.id}" class="text-primary font-label-md text-label-md hover:underline mr-md">Edit</button>
                    <button data-chart="${p.id}" class="text-primary font-label-md text-label-md hover:underline">Chart status</button>
                  </td>
                </tr>`).join('') : emptyRow(6, 'No patient charts yet. Register the first one.')}
            </tbody>
          </table>
        </div>`,
    })}
  `;
}

function renderAppointments() {
  return `
    ${sectionHeader({
      title: 'Appointments',
      subtitle: 'Create, reschedule and cancel appointments; manage check-in status (FR-REC-4/5).',
      actions: `${searchInput('Search appointments…', 'data-filter="appt-tbody"')}${primaryBtn('Book Appointment', { icon: 'edit_calendar', attr: 'data-action="book"' })}`,
    })}
    ${panel({ title: `Schedule (${APPOINTMENTS.length})`, body: apptTable(APPOINTMENTS, 'appt-tbody') })}
  `;
}

/* =============================================================================
   Builders
   ========================================================================== */
function apptTable(rows, tbodyId = '') {
  return `
    <div class="overflow-x-auto">
      <table class="w-full text-left">
        <thead class="bg-white/5 font-label-md text-label-md text-on-surface-variant">
          <tr>
            <th class="px-lg py-md font-medium">Patient</th>
            <th class="px-lg py-md font-medium">Time</th>
            <th class="px-lg py-md font-medium">Provider</th>
            <th class="px-lg py-md font-medium">Reason</th>
            <th class="px-lg py-md font-medium">Status</th>
            <th class="px-lg py-md"></th>
          </tr>
        </thead>
        <tbody ${tbodyId ? `id="${tbodyId}"` : ''} class="divide-y divide-white/5 font-body-sm text-body-sm">
          ${rows.length ? rows.map((a) => `
            <tr class="hover:bg-white/5 transition-colors">
              <td class="px-lg py-md">${avatarCell(a.name, 'secondary')}</td>
              <td class="px-lg py-md text-on-surface-variant">${escapeHtml(a.when)}</td>
              <td class="px-lg py-md text-on-surface-variant">${escapeHtml(a.provider)}</td>
              <td class="px-lg py-md text-on-surface-variant">${escapeHtml(a.reason)}</td>
              <td class="px-lg py-md">${apptBadge(a.status)}</td>
              <td class="px-lg py-md text-right whitespace-nowrap">
                ${a.status === 'Scheduled' ? `<button data-checkin="${a.id}" class="text-primary font-label-md text-label-md hover:underline mr-md">Check in</button>` : ''}
                <button data-manage="${a.id}" class="text-primary font-label-md text-label-md hover:underline">Manage</button>
              </td>
            </tr>`).join('') : emptyRow(6, 'No appointments scheduled.')}
        </tbody>
      </table>
    </div>`;
}

function chartBadge(s) { return badge(s, s === 'Active' ? 'verified' : s === 'Closed' ? 'error' : 'neutral'); }
function apptBadge(s) {
  const map = { 'Checked in': 'verified', Scheduled: 'secondary', Completed: 'verified', 'No-show': 'error', Cancelled: 'neutral' };
  return badge(s, map[s] || 'neutral');
}

/* =============================================================================
   Wiring
   ========================================================================== */
function wire() {
  ctx.main.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { location.hash = b.dataset.go; }));
  ctx.main.querySelectorAll('[data-action]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.action === 'register') openRegisterForm();
    else if (b.dataset.action === 'book') openBookingForm();
    else if (b.dataset.action === 'goto-appts') { location.hash = 'appointments'; }
  }));
  ctx.main.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openRegisterForm(b.dataset.edit)));
  ctx.main.querySelectorAll('[data-chart]').forEach((b) => b.addEventListener('click', () => openChartStatus(b.dataset.chart)));
  ctx.main.querySelectorAll('[data-checkin]').forEach((b) => b.addEventListener('click', () => onCheckIn(b.dataset.checkin)));
  ctx.main.querySelectorAll('[data-manage]').forEach((b) => b.addEventListener('click', () => openManage(b.dataset.manage)));

  ctx.main.querySelectorAll('[data-filter]').forEach((inp) => {
    const tb = ctx.main.querySelector(`#${inp.dataset.filter}`);
    if (!tb) return;
    inp.addEventListener('input', () => {
      const q = inp.value.trim().toLowerCase();
      tb.querySelectorAll('tr').forEach((r) => { r.style.display = r.textContent.toLowerCase().includes(q) ? '' : 'none'; });
    });
  });
}

function openRegisterForm(patientId = '') {
  const p = patientId ? PATIENTS.find((x) => x.id === patientId) : null;
  openFormDialog({
    title: p ? 'Update Demographics' : 'Register Patient',
    subtitle: p ? 'Edit contact and demographic details. Clinical fields are not visible here (US-REC-2).' : 'A unique MRN is generated. The system warns if a likely duplicate already exists (US-REC-1).',
    submitIcon: p ? 'save' : 'person_add',
    body: `
      ${!p ? `<div class="flex items-start gap-sm p-md rounded-xl bg-tertiary-container/20 border border-tertiary/30 mb-md">
        <span class="material-symbols-outlined text-tertiary">manage_search</span>
        <p class="text-body-sm text-on-surface-variant">Duplicate detection runs on full name + DOB before a new chart is created (FR-REC-3).</p>
      </div>` : ''}
      ${field('Full name', textInput('full_name', { value: p ? p.name : '', placeholder: 'Full legal name' }))}
      <div class="grid grid-cols-2 gap-md">
        ${field('Date of birth', textInput('dob', { value: p ? (p.dob || '') : '', type: 'date' }))}
        ${field('Sex', optionSelect('sex', ['Female', 'Male', 'Other'], p ? sexLabel(p.sex) : 'Female'))}
      </div>
      ${field('Phone', textInput('phone', { value: p ? (p.phone || '') : '', placeholder: '+1 555 0000' }))}
      ${field('Address', textInput('address', { value: p ? (p.address || '') : '', placeholder: 'Street, city' }))}
      ${field('Emergency contact', textInput('emergency', { value: p ? (p.emergency || '') : '', placeholder: 'Name · phone' }))}`,
    onSubmit: (wrap) => submitRegister(wrap, p),
  });
}

async function submitRegister(wrap, existing) {
  const v = formVals(wrap);
  if (!(v.full_name || '').trim()) return ctx.toast('Enter the patient name.', 'error');
  if (ctx.demo) { ctx.toast(`${existing ? 'Demographics updated' : 'Patient registered (MRN generated)'} — write pipeline lands in Increment 1.`, 'ok'); return closeDialog(); }
  // Duplicate warning on new registration (name + DOB).
  if (!existing) {
    const dup = PATIENTS.find((p) => p.name.toLowerCase() === v.full_name.trim().toLowerCase() && (p.dob || '') === (v.dob || ''));
    if (dup && !confirm(`A chart for ${dup.name} (${dup.mrn}) with the same name and DOB already exists. Register anyway?`)) return;
  }
  const btn = wrap.querySelector('[data-submit]');
  const label = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  try {
    if (existing) {
      await updatePatient(existing.id, {
        full_name: v.full_name, dob: v.dob || null, sex: sexCode(v.sex),
        phone: v.phone || null, address: v.address || null, emergency_contact: v.emergency || null,
      });
      ctx.toast('Demographics updated.', 'ok');
    } else {
      const res = await createPatient({
        fullName: v.full_name, dob: v.dob, sex: sexCode(v.sex),
        phone: v.phone, address: v.address, emergencyContact: v.emergency,
      });
      ctx.toast(`Patient registered · ${res.mrn}.`, 'ok');
    }
    closeDialog();
    await refresh();
  } catch (e) {
    console.error('register', e);
    ctx.toast('Could not save the chart.', 'error');
    if (btn) { btn.disabled = false; btn.textContent = label; }
  }
}

function openBookingForm() {
  if (!ctx.demo && !PATIENTS.length) return ctx.toast('Register a patient before booking.', 'error');
  openFormDialog({
    title: 'Book Appointment',
    subtitle: 'The calendar reflects changes immediately; each change is logged (US-REC-3).',
    submitIcon: 'event_available',
    body: `
      ${field('Patient', patientPicker())}
      <div class="grid grid-cols-2 gap-md">
        ${field('Date', textInput('date', { type: 'date' }))}
        ${field('Time', textInput('time', { type: 'time' }))}
      </div>
      ${field('Reason', textInput('reason', { placeholder: 'Reason for visit' }))}`,
    submitLabel: 'Schedule',
    onSubmit: (wrap) => submitBooking(wrap),
  });
}

async function submitBooking(wrap) {
  const v = formVals(wrap);
  if (!v.date) return ctx.toast('Pick a date.', 'error');
  if (ctx.demo) { ctx.toast('Appointment scheduled — write pipeline lands in Increment 1.', 'ok'); return closeDialog(); }
  if (!v.patient) return ctx.toast('Select a patient.', 'error');
  const datetime = new Date(`${v.date}T${v.time || '09:00'}`).toISOString();
  const btn = wrap.querySelector('[data-submit]');
  const label = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  try {
    await createAppointment({ patientId: v.patient, datetime, reason: v.reason || null });
    ctx.toast('Appointment scheduled.', 'ok');
    closeDialog();
    await refresh();
  } catch (e) {
    console.error('createAppointment', e);
    ctx.toast('Could not schedule the appointment.', 'error');
    if (btn) { btn.disabled = false; btn.textContent = label; }
  }
}

function openChartStatus(patientId) {
  const p = PATIENTS.find((x) => x.id === patientId);
  if (!p) return;
  openFormDialog({
    title: 'Chart Status',
    subtitle: `${p.name} · ${p.mrn}`,
    submitIcon: 'save',
    body: field('Status', optionSelect('chart', ['Active', 'Inactive', 'Closed'], p.chart)),
    submitLabel: 'Update',
    onSubmit: async (wrap) => {
      const v = formVals(wrap);
      if (ctx.demo) { ctx.toast('Chart status update logged (FR-REC-6).', 'ok'); return closeDialog(); }
      try {
        await setChartStatus(p.id, (v.chart || 'Active').toLowerCase());
        ctx.toast('Chart status updated.', 'ok');
        closeDialog();
        await refresh();
      } catch (e) { console.error('setChartStatus', e); ctx.toast('Could not update chart status.', 'error'); }
    },
  });
}

async function onCheckIn(apptId) {
  if (ctx.demo) return ctx.toast('Checked in — change logged.', 'ok');
  try {
    await setAppointmentStatus(apptId, 'checked-in');
    ctx.toast('Patient checked in.', 'ok');
    await refresh();
  } catch (e) { console.error('checkin', e); ctx.toast('Could not check in.', 'error'); }
}

function openManage(apptId) {
  const a = APPOINTMENTS.find((x) => x.id === apptId);
  if (!a) return;
  openFormDialog({
    title: 'Manage Appointment',
    subtitle: `${a.name} · ${a.when}`,
    submitIcon: 'save',
    body: field('Status', optionSelect('status', ['Scheduled', 'Checked in', 'Completed', 'Cancelled', 'No-show'], a.status)),
    submitLabel: 'Update',
    onSubmit: async (wrap) => {
      const v = formVals(wrap);
      if (ctx.demo) { ctx.toast('Appointment updated.', 'ok'); return closeDialog(); }
      try {
        await setAppointmentStatus(a.id, APPT_DB[v.status] || 'scheduled');
        ctx.toast('Appointment updated.', 'ok');
        closeDialog();
        await refresh();
      } catch (e) { console.error('manage appt', e); ctx.toast('Could not update the appointment.', 'error'); }
    },
  });
}

/* =============================================================================
   Live data + helpers
   ========================================================================== */
async function loadLive() {
  const [patients, appts] = await Promise.all([getPatients(), getAppointments()]);

  PATIENTS = patients.map((p) => ({
    id: p.id, name: p.full_name, mrn: p.mrn,
    dob: p.dob || '', sex: p.sex || '',
    phone: p.phone || '', address: p.address || '', emergency: p.emergency_contact || '',
    chart: titleCase(p.chart_status || 'active'),
  }));

  APPOINTMENTS = appts.map((a) => {
    const pat = a.patients || {};
    return {
      id: a.id,
      name: pat.full_name || 'Patient',
      when: fmtDateTime(a.datetime),
      provider: '—',                        // provider profiles aren't readable by this role
      reason: a.reason || '—',
      status: APPT_LABEL[a.status] || titleCase(a.status || 'scheduled'),
    };
  });
}

function patientPicker() {
  if (!PATIENTS.length) return `<select name="patient" class="field-input"><option value="">No patients registered</option></select>`;
  return `<select name="patient" class="field-input">${PATIENTS.map((p) => `<option value="${p.id}">${escapeHtml(p.name)} · ${escapeHtml(p.mrn)}</option>`).join('')}</select>`;
}
function sexLabel(code) { return code === 'M' ? 'Male' : code === 'F' ? 'Female' : code === 'Other' ? 'Other' : 'Female'; }
function sexCode(label) { return label === 'Male' ? 'M' : label === 'Female' ? 'F' : label || null; }
function formVals(wrap) {
  const out = {};
  wrap.querySelectorAll('[name]').forEach((el) => { out[el.name] = el.value; });
  return out;
}
function emptyRow(cols, text) {
  return `<tr><td colspan="${cols}" class="px-lg py-xl text-center text-on-surface-variant text-body-sm">${escapeHtml(text)}</td></tr>`;
}
function titleCase(s) { return String(s).charAt(0).toUpperCase() + String(s).slice(1); }
function fmtDateTime(ts) {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
