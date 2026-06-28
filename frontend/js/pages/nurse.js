/* pages/nurse.js — Nurse workspace.
 *
 * Sections follow the SRS nurse capabilities (own vitals/notes are writable;
 * clinical content above scope is read-only):
 *
 *   FR-NUR-1  search / open authorised patient records   → #patients
 *   FR-NUR-2  record + read vitals (C R U V)             → #vitals
 *   FR-NUR-3  create + read nursing notes                → #vitals
 *   FR-NUR-4  read encounters + allergy list (R)         → patient drawer
 *   FR-NUR-5  view relevant lab results (R)              → #results
 *   FR-NUR-6  verify vitals/nursing records (V)          → Verify buttons
 *   FR-NUR-7  no diagnoses / prescriptions / note edits  → no such affordances (US-NUR-4)
 *
 * Live mode replaces the synthetic arrays with RLS-scoped reads (data.js) and
 * the forms persist through the create-record pipeline; encrypted content is
 * decrypted on demand via read-record. Demo shell keeps the synthetic data.
 */
import { mountDashboard, integrityBadge, escapeHtml } from '../layout.js';
import {
  greeting, statCards, quickActions, panel, sectionHeader, avatarCell, badge, kv,
  emptyState, primaryBtn, ghostBtn, searchInput,
} from '../widgets.js';
import { mountRouter, openDialog, closeDialog, openFormDialog, field, textInput, textArea } from '../ui.js';
import { ROLES } from '../roles.js';
import { verifyIntegrity, createRecord, readRecord } from '../api.js';
import { getPatients, getAllergies, getEncounters, getVitals, getLabResults } from '../data.js';

const currentSection = () => {
  const ids = ['overview', 'patients', 'vitals', 'results'];
  const h = location.hash.replace('#', '');
  return ids.includes(h) ? h : 'overview';
};

const ctx = await mountDashboard({ role: ROLES.NURSE, active: currentSection(), title: 'Nurse' });

/* ---- synthetic ward data (demo shell only) ------------------------------ */
let PATIENTS = [
  { id: 'pat_04', name: 'Marcus Vane', mrn: 'MRN-51338', bed: 'A-12', age: 55, sex: 'M', allergies: ['Aspirin'], conditions: ['Hypertension'], lastEnc: 'Chronic Care · Oct 22' },
  { id: 'pat_05', name: 'Sandra Hughes', mrn: 'MRN-49770', bed: 'A-14', age: 29, sex: 'F', allergies: [], conditions: ['Post-op Ortho'], lastEnc: 'Post-Surgical · Oct 21' },
  { id: 'pat_03', name: 'Elena Lopez', mrn: 'MRN-44102', bed: 'B-03', age: 38, sex: 'F', allergies: ['Latex'], conditions: ['Post-surgical recovery'], lastEnc: 'Post-Surgical · Oct 23' },
];

let VITALS = [
  { id: 'v1', patientId: 'pat_04', when: 'Today · 08:10', kind: 'Vitals', summary: 'BP 128/82 · HR 76 · T 36.8°C · RR 16', status: 'VERIFIED', version: 1 },
  { id: 'v2', patientId: 'pat_05', when: 'Today · 07:45', kind: 'Vitals', summary: 'BP 118/76 · HR 68 · SpO₂ 98% · RR 14', status: 'VERIFIED', version: 1 },
  { id: 'n1', patientId: 'pat_03', when: 'Today · 07:30', kind: 'Nursing note', summary: 'Dressing changed, wound clean, no exudate.', status: 'PENDING', version: 1 },
];

let RESULTS = [
  { id: 'res_1', patientId: 'pat_04', test: 'HbA1c', value: '6.1% · within target', when: 'Oct 22', status: 'VERIFIED' },
  { id: 'res_2', patientId: 'pat_03', test: 'Full Blood Count', value: 'WBC 7.2 · normal', when: 'Oct 23', status: 'VERIFIED' },
];

const patientById = (id) => PATIENTS.find((p) => p.id === id);
const patientName = (id) => patientById(id)?.name ?? 'Unknown';

/* ---- live data before first render --------------------------------------- */
if (!ctx.demo) {
  try { await loadLive(); } catch (e) { console.error('loadLive', e); ctx.toast('Could not load ward data.', 'error'); }
}

const router = mountRouter({
  ctx,
  sections: { overview: renderOverview, patients: renderPatients, vitals: renderVitals, results: renderResults },
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
    ${greeting('Nursing dashboard', 'Record vitals and nursing notes for patients on your ward.')}
    ${statCards([
      { label: 'Patients on Ward', value: String(PATIENTS.length), icon: 'group', tone: 'primary' },
      { label: 'Vitals Logged', value: String(VITALS.filter((v) => v.kind === 'Vitals').length), icon: 'monitor_heart', tone: 'tertiary' },
      { label: 'Notes Today', value: String(VITALS.filter((v) => v.kind === 'Nursing note').length), icon: 'edit_note', tone: 'secondary' },
      { label: 'Verified', value: integrityRate(), icon: 'verified_user', tone: 'verified' },
    ])}
    ${quickActions([
      { id: 'record-vitals', label: 'Record Vitals', desc: 'Capture observations', icon: 'monitor_heart', tone: 'primary' },
      { id: 'nursing-note', label: 'Nursing Note', desc: 'Document care given', icon: 'edit_note', tone: 'secondary' },
      { id: 'view-results', label: 'Lab Results', desc: 'Read-only reference', icon: 'lab_panel', tone: 'tertiary' },
    ])}
    ${panel({
      title: 'Recent Vitals & Notes',
      action: `<button data-go="vitals" class="text-primary font-label-md text-label-md hover:underline">View all</button>`,
      body: vitalsTable(VITALS.slice(0, 4)),
    })}
    <div class="glass-card p-lg flex items-start gap-md mt-lg">
      <span class="material-symbols-outlined text-tertiary">block</span>
      <p class="text-on-surface-variant text-body-sm">Diagnosis and prescription actions are outside the nursing scope and are not available to this role — enforced technically, not by convention (FR-NUR-7 / US-NUR-4).</p>
    </div>
  `;
}

function renderPatients() {
  return `
    ${sectionHeader({
      title: 'Ward Patients',
      subtitle: 'Open a record you are authorised to view (FR-NUR-1). Encounters and allergies are read-only (FR-NUR-4).',
      actions: searchInput('Search patients…', 'data-filter="pat-tbody"'),
    })}
    ${panel({
      title: `On your ward (${PATIENTS.length})`,
      body: `
        <div class="overflow-x-auto">
          <table class="w-full text-left">
            <thead class="bg-white/5 font-label-md text-label-md text-on-surface-variant">
              <tr>
                <th class="px-lg py-md font-medium">Patient</th>
                <th class="px-lg py-md font-medium">MRN</th>
                <th class="px-lg py-md font-medium">Allergies</th>
                <th class="px-lg py-md font-medium">Last Encounter</th>
                <th class="px-lg py-md"></th>
              </tr>
            </thead>
            <tbody id="pat-tbody" class="divide-y divide-white/5 font-body-sm text-body-sm">
              ${PATIENTS.length ? PATIENTS.map((p) => `
                <tr class="hover:bg-white/5 transition-colors">
                  <td class="px-lg py-md">${avatarCell(p.name)}</td>
                  <td class="px-lg py-md text-on-surface-variant">${escapeHtml(p.mrn)}</td>
                  <td class="px-lg py-md">${p.allergies.length ? p.allergies.map((a) => badge(a, 'error')).join(' ') : badge('None known', 'verified')}</td>
                  <td class="px-lg py-md text-on-surface-variant">${escapeHtml(p.lastEnc)}</td>
                  <td class="px-lg py-md text-right whitespace-nowrap">
                    <button data-open-patient="${p.id}" class="text-primary font-label-md text-label-md hover:underline mr-md">Open</button>
                    <button data-vitals-for="${p.id}" class="text-primary font-label-md text-label-md hover:underline">Vitals</button>
                  </td>
                </tr>`).join('') : emptyRow(5, 'No patients on the ward yet.')}
            </tbody>
          </table>
        </div>`,
    })}
  `;
}

function renderVitals() {
  return `
    ${sectionHeader({
      title: 'Vitals & Nursing Notes',
      subtitle: 'Record and read patient vitals and nursing notes — saved, encrypted, hashed and anchored (FR-NUR-2/3, US-NUR-1).',
      actions: `${searchInput('Search…', 'data-filter="vit-tbody"')}${primaryBtn('Record Vitals', { icon: 'monitor_heart', attr: 'data-action="record-vitals"' })}`,
    })}
    ${panel({ title: `Entries (${VITALS.length})`, body: vitalsTable(VITALS, 'vit-tbody') })}
  `;
}

function renderResults() {
  return `
    ${sectionHeader({
      title: 'Lab Results',
      subtitle: 'Results relevant to patients under your care — read-only (FR-NUR-5).',
      actions: searchInput('Search results…', 'data-filter="res-tbody"'),
    })}
    ${panel({
      title: `Results (${RESULTS.length})`,
      body: `
        <div class="overflow-x-auto">
          <table class="w-full text-left">
            <thead class="bg-white/5 font-label-md text-label-md text-on-surface-variant">
              <tr>
                <th class="px-lg py-md font-medium">Patient</th>
                <th class="px-lg py-md font-medium">Test</th>
                <th class="px-lg py-md font-medium">Result</th>
                <th class="px-lg py-md font-medium">Date</th>
                <th class="px-lg py-md font-medium">Integrity</th>
                <th class="px-lg py-md"></th>
              </tr>
            </thead>
            <tbody id="res-tbody" class="divide-y divide-white/5 font-body-sm text-body-sm">
              ${RESULTS.length ? RESULTS.map((r) => `
                <tr class="hover:bg-white/5 transition-colors">
                  <td class="px-lg py-md">${avatarCell(patientName(r.patientId))}</td>
                  <td class="px-lg py-md">${escapeHtml(r.test)}</td>
                  <td class="px-lg py-md text-on-surface-variant">${r.value ? escapeHtml(r.value) : lockedCell()}</td>
                  <td class="px-lg py-md text-on-surface-variant">${escapeHtml(r.when)}</td>
                  <td class="px-lg py-md">${integrityBadge(r.status)}</td>
                  <td class="px-lg py-md text-right whitespace-nowrap">
                    ${r.value ? '' : `<button data-open-result="${r.id}" class="text-primary font-label-md text-label-md hover:underline mr-md">Open</button>`}
                    <button data-verify="${r.id}" data-type="lab_result" class="text-primary font-label-md text-label-md hover:underline">Verify</button>
                  </td>
                </tr>`).join('') : emptyRow(6, 'No lab results available.')}
            </tbody>
          </table>
        </div>`,
    })}
  `;
}

/* =============================================================================
   Builders
   ========================================================================== */
function vitalsTable(rows, tbodyId = '') {
  return `
    <div class="overflow-x-auto">
      <table class="w-full text-left">
        <thead class="bg-white/5 font-label-md text-label-md text-on-surface-variant">
          <tr>
            <th class="px-lg py-md font-medium">Patient</th>
            <th class="px-lg py-md font-medium">Recorded</th>
            <th class="px-lg py-md font-medium">Type</th>
            <th class="px-lg py-md font-medium">Observation</th>
            <th class="px-lg py-md font-medium">Integrity</th>
            <th class="px-lg py-md"></th>
          </tr>
        </thead>
        <tbody ${tbodyId ? `id="${tbodyId}"` : ''} class="divide-y divide-white/5 font-body-sm text-body-sm">
          ${rows.length ? rows.map((v) => `
            <tr class="hover:bg-white/5 transition-colors">
              <td class="px-lg py-md">${avatarCell(patientName(v.patientId))}</td>
              <td class="px-lg py-md text-on-surface-variant">${escapeHtml(v.when)}</td>
              <td class="px-lg py-md">${badge(v.kind, v.kind === 'Vitals' ? 'primary' : 'secondary')}</td>
              <td class="px-lg py-md text-on-surface-variant">${v.summary ? escapeHtml(v.summary) : lockedCell()}</td>
              <td class="px-lg py-md">${integrityBadge(v.status)} ${v.version > 1 ? badge(`v${v.version}`, 'neutral') : ''}</td>
              <td class="px-lg py-md text-right whitespace-nowrap">
                ${v.summary ? '' : `<button data-open-vital="${v.id}" data-kind="${v.kind === 'Nursing note' ? 'note' : 'vitals'}" class="text-primary font-label-md text-label-md hover:underline mr-md">Open</button>`}
                <button data-verify="${v.id}" data-type="vitals" class="text-primary font-label-md text-label-md hover:underline">Verify</button>
              </td>
            </tr>`).join('') : emptyRow(6, 'No vitals or notes recorded yet.')}
        </tbody>
      </table>
    </div>`;
}

/* =============================================================================
   Wiring
   ========================================================================== */
function wire() {
  ctx.main.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { location.hash = b.dataset.go; }));
  ctx.main.querySelectorAll('[data-verify]').forEach((b) => b.addEventListener('click', () => doVerify(b.dataset.verify, b.dataset.type, b)));
  ctx.main.querySelectorAll('[data-open-patient]').forEach((b) => b.addEventListener('click', () => openPatient(b.dataset.openPatient)));
  ctx.main.querySelectorAll('[data-vitals-for]').forEach((b) => b.addEventListener('click', () => openVitalsForm(b.dataset.vitalsFor)));
  ctx.main.querySelectorAll('[data-open-vital]').forEach((b) => b.addEventListener('click', () => openVital(b.dataset.openVital, b.dataset.kind)));
  ctx.main.querySelectorAll('[data-open-result]').forEach((b) => b.addEventListener('click', () => openResult(b.dataset.openResult)));
  ctx.main.querySelectorAll('[data-action]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.action === 'record-vitals') openVitalsForm();
    else if (b.dataset.action === 'nursing-note') openNoteForm();
    else if (b.dataset.action === 'view-results') { location.hash = 'results'; }
  }));

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

function patientOptions(selectedId = '') {
  if (!PATIENTS.length) return `<select name="patient" class="field-input"><option value="">No patients available</option></select>`;
  return `<select name="patient" class="field-input">${PATIENTS.map((p) => `<option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>${escapeHtml(p.name)}${p.bed && p.bed !== '—' ? ` · ${escapeHtml(p.bed)}` : ` · ${escapeHtml(p.mrn)}`}</option>`).join('')}</select>`;
}

function openVitalsForm(patientId = PATIENTS[0]?.id || '') {
  openFormDialog({
    title: 'Record Vitals',
    subtitle: 'Attributed to you with a timestamp; encrypted, hashed and anchored on save (US-NUR-1).',
    body: `
      ${field('Patient', patientOptions(patientId))}
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-md">
        ${field('Temperature (°C)', textInput('temperature', { placeholder: '36.8' }))}
        ${field('Blood pressure', textInput('blood_pressure', { placeholder: '120/80' }))}
        ${field('Heart rate (bpm)', textInput('heart_rate', { placeholder: '74' }))}
        ${field('Respiratory rate', textInput('resp_rate', { placeholder: '16' }))}
        ${field('Weight (kg)', textInput('weight', { placeholder: '72' }))}
        ${field('SpO₂ (%)', textInput('spo2', { placeholder: '98' }))}
      </div>
      ${field('Note (optional)', textArea('note', { placeholder: 'Any observations…' }))}`,
    submitLabel: 'Save & Anchor',
    onSubmit: (wrap) => submitVitals(wrap, 'vitals'),
  });
}

function openNoteForm(patientId = PATIENTS[0]?.id || '') {
  openFormDialog({
    title: 'Nursing Note',
    subtitle: 'Document observations and care given. You cannot edit a doctor’s diagnosis (FR-NUR-7).',
    body: `
      ${field('Patient', patientOptions(patientId))}
      ${field('Nursing note', textArea('note', { placeholder: 'Care delivered, patient response, observations…' }))}`,
    submitLabel: 'Save & Anchor',
    onSubmit: (wrap) => submitVitals(wrap, 'note'),
  });
}

async function submitVitals(wrap, kind) {
  const v = formVals(wrap);
  if (!v.patient) return ctx.toast('Select a patient.', 'error');
  if (kind === 'note' && !(v.note || '').trim()) return ctx.toast('Enter a note.', 'error');
  if (ctx.demo) { ctx.toast(`${kind === 'note' ? 'Nursing note saved' : 'Vitals recorded'} — write pipeline lands in Increment 1+.`, 'ok'); return closeDialog(); }
  const btn = wrap.querySelector('[data-submit]');
  const label = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  try {
    await createRecord({
      recordType: 'vitals',
      patient_id: v.patient,
      kind,
      temperature: v.temperature || null,
      blood_pressure: v.blood_pressure || null,
      heart_rate: v.heart_rate || null,
      resp_rate: v.resp_rate || null,
      weight: v.weight || null,
      spo2: v.spo2 || null,
      note: v.note || null,
    });
    ctx.toast(kind === 'note' ? 'Nursing note saved, encrypted & anchored.' : 'Vitals recorded, encrypted & anchored.', 'ok');
    closeDialog();
    await refresh();
  } catch (e) {
    console.error('createRecord vitals', e);
    ctx.toast('Could not save.', 'error');
    if (btn) { btn.disabled = false; btn.textContent = label; }
  }
}

/* ---- decrypt drawers (read-record) -------------------------------------- */
async function openVital(id, kind) {
  let fields = {};
  try {
    const res = await readRecord({ recordType: 'vitals', recordId: id });
    fields = res?.fields || {};
  } catch { return ctx.toast('Could not open record.', 'error'); }
  const v = VITALS.find((x) => x.id === id);
  openDialog({
    kind: 'drawer',
    title: kind === 'note' ? 'Nursing note' : 'Vitals',
    subtitle: v ? `${patientName(v.patientId)} · ${v.when} · decrypted by read-record (audited)` : 'Decrypted by read-record',
    body: `
      <div class="mb-md">${integrityBadge(v?.status || 'PENDING')}</div>
      <section class="glass-card p-lg">
        ${kind === 'note'
          ? kv('Note', escapeHtml(fields.note ?? '—'))
          : `${kv('Temperature', escapeHtml(fields.temperature ?? '—'))}
             ${kv('Blood pressure', escapeHtml(fields.blood_pressure ?? '—'))}
             ${kv('Heart rate', escapeHtml(fields.heart_rate ?? '—'))}
             ${kv('Respiratory rate', escapeHtml(fields.resp_rate ?? '—'))}
             ${kv('Weight', escapeHtml(fields.weight ?? '—'))}
             ${kv('SpO₂', escapeHtml(fields.spo2 ?? '—'))}
             ${fields.note ? kv('Note', escapeHtml(fields.note)) : ''}`}
      </section>`,
    footer: `${ghostBtn('Close', { attr: 'data-close' })}${primaryBtn('Verify Integrity', { icon: 'verified_user', attr: 'data-verify-v' })}`,
    onOpen: (wrap) => wrap.querySelector('[data-verify-v]')?.addEventListener('click', (e) => doVerify(id, 'vitals', e.currentTarget)),
  });
}

async function openResult(id) {
  const r = RESULTS.find((x) => x.id === id);
  let value = '—';
  try {
    const res = await readRecord({ recordType: 'lab_result', recordId: id });
    value = res?.fields?.result_payload ?? '—';
  } catch { return ctx.toast('Could not open result.', 'error'); }
  openDialog({
    title: r ? `${r.test} — Result` : 'Lab Result',
    subtitle: r ? `${patientName(r.patientId)} · ${r.when} · decrypted by read-record (audited)` : 'Decrypted by read-record',
    body: `
      ${r ? `<div class="mb-md">${integrityBadge(r.status)}</div>` : ''}
      <section class="glass-card p-lg">
        ${kv('Test', escapeHtml(r?.test ?? '—'))}
        ${kv('Result', `<span class="text-on-surface font-medium">${escapeHtml(value)}</span>`)}
      </section>
      <p class="text-[11px] text-on-surface-variant mt-md">Results are read-only for nursing staff and decrypted server-side only on an authorised, audited read (FR-NUR-5).</p>`,
    footer: `${ghostBtn('Close', { attr: 'data-close' })}${primaryBtn('Verify Integrity', { icon: 'verified_user', attr: 'data-verify-r' })}`,
    onOpen: (wrap) => wrap.querySelector('[data-verify-r]')?.addEventListener('click', (e) => doVerify(id, 'lab_result', e.currentTarget)),
  });
}

function openPatient(patientId) {
  const p = patientById(patientId);
  if (!p) return;
  const vs = VITALS.filter((v) => v.patientId === patientId);
  openDialog({
    kind: 'drawer',
    title: p.name,
    subtitle: `${p.mrn}${p.bed && p.bed !== '—' ? ` · Bed ${p.bed}` : ''} · ${p.age} ${p.sex}`,
    body: `
      <div class="space-y-lg">
        <section class="glass-card p-lg">
          <h4 class="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant mb-md">Allergies &amp; conditions — read-only (FR-NUR-4)</h4>
          <div class="flex flex-wrap gap-xs mb-sm">${p.allergies.length ? p.allergies.map((a) => badge(a, 'error')).join('') : badge('No known allergies', 'verified')}</div>
          <div class="flex flex-wrap gap-xs">${p.conditions.map((c) => badge(c, 'secondary')).join('') || '<span class="text-on-surface-variant text-body-sm">No conditions on file</span>'}</div>
        </section>
        <section class="glass-card p-lg">
          ${kv('Last encounter (read-only)', escapeHtml(p.lastEnc))}
          <p class="text-[11px] text-on-surface-variant mt-md">Encounter content is read-only for nursing staff (FR-NUR-4).</p>
        </section>
        <section class="glass-card overflow-hidden">
          <div class="p-lg border-b border-white/5"><h4 class="font-headline-md text-[16px] font-bold">My recent entries</h4></div>
          ${vs.length ? `<div class="divide-y divide-white/5">${vs.map((v) => `
            <div class="p-lg flex items-center justify-between gap-md">
              <div><p class="font-body-sm text-body-sm font-medium">${escapeHtml(v.kind)}</p><p class="text-[11px] text-on-surface-variant">${v.when}${v.summary ? ' · ' + escapeHtml(v.summary) : ' · encrypted'}</p></div>
              ${integrityBadge(v.status)}
            </div>`).join('')}</div>` : emptyState('monitor_heart', 'No entries yet')}
        </section>
      </div>`,
    footer: `${ghostBtn('Close', { attr: 'data-close' })}${primaryBtn('Record Vitals', { icon: 'monitor_heart', attr: 'data-rv' })}`,
    onOpen: (wrap) => { wrap.querySelector('[data-rv]')?.addEventListener('click', () => openVitalsForm(patientId)); },
  });
}

/* =============================================================================
   Live data + helpers
   ========================================================================== */
async function loadLive() {
  const [patients, allergies, encounters, vitals, results] = await Promise.all([
    getPatients(), getAllergies(), getEncounters(), getVitals(), getLabResults(),
  ]);

  const allergyBy = {};
  for (const a of allergies) (allergyBy[a.patient_id] ||= []).push(a.substance);

  const lastEncBy = {};
  for (const e of encounters) if (!lastEncBy[e.patient_id]) lastEncBy[e.patient_id] = `${e.encounter_type || 'Encounter'} · ${fmtDate(e.datetime)}`;

  PATIENTS = patients.map((p) => ({
    id: p.id, name: p.full_name, mrn: p.mrn, bed: '—',
    age: ageFromDob(p.dob), sex: p.sex || '—',
    allergies: allergyBy[p.id] || [],
    conditions: [],
    lastEnc: lastEncBy[p.id] || '—',
  }));

  VITALS = vitals.map((v) => ({
    id: v.id, patientId: v.patient_id,
    when: fmtDateTime(v.recorded_at),
    kind: v.kind === 'note' ? 'Nursing note' : 'Vitals',
    summary: null,                         // encrypted — opened via read-record
    status: anchorIntegrity(v.anchor_status), version: v.version,
  }));

  RESULTS = results.map((r) => {
    const ord = r.lab_orders || {};
    const pat = ord.patients || {};
    return {
      id: r.id, patientId: ord.patient_id,
      patientName: pat.full_name || 'Patient',
      test: ord.test_type || 'Lab result',
      value: null,                         // encrypted — opened via read-record
      when: fmtDate(r.completed_at),
      status: anchorIntegrity(r.anchor_status),
    };
  });
}

function integrityRate() {
  if (!VITALS.length) return '—';
  const ok = VITALS.filter((v) => v.status === 'VERIFIED').length;
  return `${Math.round((ok / VITALS.length) * 100)}%`;
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
function ageFromDob(dob) {
  if (!dob) return '—';
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return '—';
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a;
}
function fmtDate(ts) {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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
