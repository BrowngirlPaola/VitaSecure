/* pages/doctor.js — Doctor (Physician) workspace.
 *
 * Single viewport-locked shell, hash-routed into the five sidebar sections
 * (overview · patients · encounters · orders · prescriptions). Content is built
 * strictly from the SRS doctor capabilities:
 *
 *   FR-DOC-1  search/open authorised patient records          → #patients
 *   FR-DOC-2  create + read clinical encounters/diagnoses     → #encounters (C R U V)
 *   FR-DOC-3  create/read/update prescriptions                → #prescriptions (C R U V)
 *   FR-DOC-4  order lab investigations (→ lab queue)          → #orders (C R V)
 *   FR-DOC-5  view lab results for the doctor's orders        → #orders (R V)
 *   FR-DOC-6  read vitals / nursing notes                     → patient drawer (R V)
 *   FR-DOC-7  read + update allergy / medication list         → patient drawer (R U V)
 *   FR-DOC-8  verify integrity of any accessible record       → Verify buttons (V)
 *   FR-DOC-9  view version history of a clinical record        → history drawer
 *
 * Demo shell: writes/verifications are stubbed (toast) until the create-record /
 * verify-integrity Edge Functions land (Increment 1+). Entity fields in the
 * forms mirror SRS §8 so the contract is visible in the UI.
 */
import { mountDashboard, integrityBadge, escapeHtml } from '../layout.js';
import {
  greeting, statCards, quickActions, panel, table, avatarCell, linkBtn, pendingNote,
  sectionHeader, primaryBtn, ghostBtn, searchInput, badge, emptyState, kv, meter,
} from '../widgets.js';
import { mountRouter, openDialog, closeDialog, openFormDialog, field, optionSelect } from '../ui.js';
import { ROLES } from '../roles.js';
import { verifyIntegrity, createRecord, readRecord } from '../api.js';
import { getPatients, getAllergies, getEncounters, getLabOrders, getPrescriptions, createLabOrder } from '../data.js';

const SECTION_IDS = ['overview', 'patients', 'encounters', 'orders', 'prescriptions'];
const currentSection = () => {
  const h = location.hash.replace('#', '');
  return SECTION_IDS.includes(h) ? h : 'overview';
};

const ctx = await mountDashboard({ role: ROLES.DOCTOR, active: currentSection(), title: 'Doctor' });

/* =============================================================================
   Synthetic demo data (ethics: synthetic only). Shapes follow SRS §8 entities.
   ========================================================================== */
let PATIENTS = [
  { id: 'pat_01', name: 'Sarah Mitchell', mrn: 'MRN-48213', age: 47, sex: 'F', last: 'Oct 24',
    conditions: ['Hypertension', 'Type 2 Diabetes'], allergies: ['Penicillin', 'Sulfa drugs'], status: 'Active' },
  { id: 'pat_02', name: 'Robert Klein', mrn: 'MRN-50917', age: 63, sex: 'M', last: 'Oct 24',
    conditions: ['Atrial Fibrillation'], allergies: [], status: 'Active' },
  { id: 'pat_03', name: 'Elena Lopez', mrn: 'MRN-44102', age: 38, sex: 'F', last: 'Oct 23',
    conditions: ['Post-surgical recovery'], allergies: ['Latex'], status: 'Active' },
  { id: 'pat_04', name: 'Marcus Vane', mrn: 'MRN-51338', age: 55, sex: 'M', last: 'Oct 22',
    conditions: ['Hypertension'], allergies: ['Aspirin'], status: 'Active' },
  { id: 'pat_05', name: 'Sandra Hughes', mrn: 'MRN-49770', age: 29, sex: 'F', last: 'Oct 21',
    conditions: ['Post-op Ortho'], allergies: [], status: 'Active' },
];

let ENCOUNTERS = [
  { id: 'enc_1', patientId: 'pat_01', when: 'Oct 24 · 09:15', type: 'Routine Follow-up', diagnosis: 'Essential hypertension, controlled', status: 'VERIFIED', version: 2 },
  { id: 'enc_2', patientId: 'pat_02', when: 'Oct 24 · 10:45', type: 'Acute Management', diagnosis: 'Paroxysmal atrial fibrillation', status: 'VERIFIED', version: 1 },
  { id: 'enc_3', patientId: 'pat_03', when: 'Oct 23 · 16:20', type: 'Post-Surgical', diagnosis: 'Uncomplicated post-op course', status: 'PENDING', version: 1 },
  { id: 'enc_4', patientId: 'pat_04', when: 'Oct 22 · 11:30', type: 'Chronic Care', diagnosis: 'Hypertension, medication review', status: 'VERIFIED', version: 3 },
];

let ORDERS = [
  { id: 'ord_1', patientId: 'pat_01', test: 'Lipid Panel', priority: 'Routine', status: 'RESULTED', when: 'Oct 24', result: 'LDL 142 mg/dL · borderline high', integrity: 'VERIFIED' },
  { id: 'ord_2', patientId: 'pat_02', test: 'Thyroid Function (TSH)', priority: 'Urgent', status: 'IN_PROGRESS', when: 'Oct 24', result: null, integrity: null },
  { id: 'ord_3', patientId: 'pat_03', test: 'Full Blood Count', priority: 'STAT', status: 'ORDERED', when: 'Oct 23', result: null, integrity: null },
  { id: 'ord_4', patientId: 'pat_04', test: 'HbA1c', priority: 'Routine', status: 'RESULTED', when: 'Oct 22', result: 'HbA1c 6.1% · within target', integrity: 'VERIFIED' },
];

let PRESCRIPTIONS = [
  { id: 'rx_1', patientId: 'pat_01', drug: 'Lisinopril', dose: '10 mg', frequency: 'Once daily', duration: '90 days', status: 'ACTIVE', integrity: 'VERIFIED', version: 2 },
  { id: 'rx_2', patientId: 'pat_02', drug: 'Apixaban', dose: '5 mg', frequency: 'Twice daily', duration: '30 days', status: 'ACTIVE', integrity: 'VERIFIED', version: 1 },
  { id: 'rx_3', patientId: 'pat_04', drug: 'Amlodipine', dose: '5 mg', frequency: 'Once daily', duration: '90 days', status: 'ACTIVE', integrity: 'PENDING', version: 1 },
  { id: 'rx_4', patientId: 'pat_01', drug: 'Metformin', dose: '500 mg', frequency: 'Twice daily', duration: '90 days', status: 'COMPLETED', integrity: 'VERIFIED', version: 1 },
];

const TEST_TYPES = ['Full Blood Count', 'Lipid Panel', 'Thyroid Function (TSH)', 'HbA1c', 'Liver Function', 'Renal Panel', 'Urinalysis', 'Coagulation Screen'];
const PRIORITIES = ['Routine', 'Urgent', 'STAT'];

const patientById = (id) => PATIENTS.find((p) => p.id === id);
const patientName = (id) => patientById(id)?.name ?? 'Unknown';

/* =============================================================================
   Router
   ========================================================================== */
// Live mode: replace the synthetic arrays with RLS-scoped data from the project
// before the first render. Demo mode keeps the synthetic data above.
if (!ctx.demo) {
  try { await loadLive(); } catch (e) { console.error('loadLive', e); ctx.toast('Could not load records.', 'error'); }
}

const router = mountRouter({
  ctx,
  sections: {
    overview: renderOverview,
    patients: renderPatients,
    encounters: renderEncounters,
    orders: renderOrders,
    prescriptions: renderPrescriptions,
  },
  afterRender: () => { wireCommon(); wireSearch(); },
});

/** Re-pull live data (after a write) and re-render the current section. */
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
    ${greeting(`Good day, ${doctorName()}`, `You have ${ENCOUNTERS.filter((e) => e.status === 'PENDING').length || 2} patients in the clinical queue today.`)}
    ${statCards([
      { label: 'My Patients', value: String(PATIENTS.length), icon: 'group', tone: 'primary' },
      { label: 'Open Encounters', value: String(ENCOUNTERS.length), icon: 'medical_services', tone: 'secondary' },
      { label: 'Pending Results', value: String(ORDERS.filter((o) => o.status !== 'RESULTED').length), icon: 'biotech', tone: 'tertiary' },
      { label: 'Verified Records', value: integrityRate(), icon: 'verified_user', tone: 'verified' },
    ])}
    ${quickActions([
      { id: 'new-encounter', label: 'New Encounter', desc: 'Document a patient visit', icon: 'add_box', tone: 'primary' },
      { id: 'order-lab', label: 'Order Lab Test', desc: 'Request diagnostic services', icon: 'biotech', tone: 'tertiary' },
      { id: 'write-rx', label: 'Write Prescription', desc: 'Issue medication orders', icon: 'prescriptions', tone: 'secondary' },
    ])}
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-lg">
      ${panel({
        title: 'Recent Encounters',
        action: linkBtn('View all', 'data-go="encounters"'),
        span: 'lg:col-span-8',
        body: encounterTable(ENCOUNTERS.slice(0, 4)),
      })}
      <div class="lg:col-span-4 flex flex-col gap-lg">
        ${panel({
          title: 'Clinical Queue',
          action: badge('2 Pending', 'primary'),
          body: `<div class="p-lg space-y-md">
            ${queueItem('09:00 AM', 'Marcus Vane', 'Hypertension Mgmt', true)}
            ${queueItem('10:30 AM', 'Sandra Hughes', 'Post-op Ortho', false)}
          </div>`,
        })}
        <div class="glass-card p-lg">
          <h3 class="font-headline-md text-[18px] font-bold mb-md">Documentation Integrity</h3>
          <div class="space-y-lg">
            ${meter('Records anchored on-chain', integrityRate(), Number(integrityRate().replace('%', '')), 'verified')}
            ${meter('Encounters documented', '98.2%', 98, 'primary')}
          </div>
          <div class="mt-lg pt-lg border-t border-white/5 flex items-center gap-md">
            <span class="material-symbols-outlined text-verified">verified_user</span>
            <p class="text-body-sm text-on-surface-variant">Every save runs <span class="text-on-surface font-medium">encrypt → hash → anchor → audit</span>.</p>
          </div>
        </div>
      </div>
    </div>
    ${pendingNote('Encounters, lab orders and prescriptions are written through the create-record pipeline (encrypt → hash → anchor → audit) in Increment 1+. Each save earns a Verified badge once anchoring lands (Increment 2).')}
  `;
}

function renderPatients() {
  return `
    ${sectionHeader({
      title: 'My Patients',
      subtitle: 'Search and open a record you are authorised to view (FR-DOC-1). Opening a record is logged.',
      actions: searchInput('Search by name or MRN…', 'data-filter="patients-tbody"'),
    })}
    ${panel({
      title: `Patients under care (${PATIENTS.length})`,
      body: `
        <div class="overflow-x-auto">
          <table class="w-full text-left">
            <thead class="bg-white/5 font-label-md text-label-md text-on-surface-variant">
              <tr>
                <th class="px-lg py-md font-medium">Patient</th>
                <th class="px-lg py-md font-medium">MRN</th>
                <th class="px-lg py-md font-medium">Age / Sex</th>
                <th class="px-lg py-md font-medium">Active Conditions</th>
                <th class="px-lg py-md font-medium">Allergies</th>
                <th class="px-lg py-md font-medium">Last Visit</th>
                <th class="px-lg py-md"></th>
              </tr>
            </thead>
            <tbody id="patients-tbody" class="divide-y divide-white/5 font-body-sm text-body-sm">
              ${PATIENTS.map((p) => `
                <tr class="hover:bg-white/5 transition-colors">
                  <td class="px-lg py-md">${avatarCell(p.name)}</td>
                  <td class="px-lg py-md text-on-surface-variant">${p.mrn}</td>
                  <td class="px-lg py-md text-on-surface-variant">${p.age} · ${p.sex}</td>
                  <td class="px-lg py-md">${p.conditions.map((c) => badge(c, 'secondary')).join(' ') || '<span class="text-on-surface-variant">—</span>'}</td>
                  <td class="px-lg py-md">${p.allergies.length ? p.allergies.map((a) => badge(a, 'error')).join(' ') : badge('None known', 'verified')}</td>
                  <td class="px-lg py-md text-on-surface-variant">${p.last}</td>
                  <td class="px-lg py-md text-right">
                    <button data-open-patient="${p.id}" class="text-primary font-label-md text-label-md hover:underline">Open record</button>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`,
    })}
  `;
}

function renderEncounters() {
  return `
    ${sectionHeader({
      title: 'Encounters',
      subtitle: 'Create and read clinical encounter records — chief complaint, examination, diagnosis, progress notes (FR-DOC-2).',
      actions: `${searchInput('Search encounters…', 'data-filter="enc-tbody"')}${primaryBtn('New Encounter', { icon: 'add_box', attr: 'data-action="new-encounter"' })}`,
    })}
    ${panel({
      title: `Documented encounters (${ENCOUNTERS.length})`,
      body: encounterTable(ENCOUNTERS, 'enc-tbody'),
    })}
    ${pendingNote('On save an encounter is canonicalised, AES-256-GCM encrypted, SHA-256 hashed and anchored on-chain. A later edit creates a new version with a new anchor; the original remains verifiable (US-DOC-2).')}
  `;
}

function renderOrders() {
  return `
    ${sectionHeader({
      title: 'Lab Orders & Results',
      subtitle: 'Order investigations to the laboratory (FR-DOC-4) and review results returned for your orders (FR-DOC-5).',
      actions: `${searchInput('Search orders…', 'data-filter="ord-tbody"')}${primaryBtn('Order Lab Test', { icon: 'biotech', attr: 'data-action="order-lab"' })}`,
    })}
    ${panel({
      title: `Orders (${ORDERS.length})`,
      body: `
        <div class="overflow-x-auto">
          <table class="w-full text-left">
            <thead class="bg-white/5 font-label-md text-label-md text-on-surface-variant">
              <tr>
                <th class="px-lg py-md font-medium">Patient</th>
                <th class="px-lg py-md font-medium">Test</th>
                <th class="px-lg py-md font-medium">Priority</th>
                <th class="px-lg py-md font-medium">Status</th>
                <th class="px-lg py-md font-medium">Ordered</th>
                <th class="px-lg py-md font-medium">Integrity</th>
                <th class="px-lg py-md"></th>
              </tr>
            </thead>
            <tbody id="ord-tbody" class="divide-y divide-white/5 font-body-sm text-body-sm">
              ${ORDERS.map((o) => `
                <tr class="hover:bg-white/5 transition-colors">
                  <td class="px-lg py-md">${avatarCell(patientName(o.patientId))}</td>
                  <td class="px-lg py-md">${o.test}</td>
                  <td class="px-lg py-md">${priorityBadge(o.priority)}</td>
                  <td class="px-lg py-md">${orderStatusBadge(o.status)}</td>
                  <td class="px-lg py-md text-on-surface-variant">${o.when}</td>
                  <td class="px-lg py-md">${o.integrity ? integrityBadge(o.integrity) : '<span class="text-on-surface-variant">—</span>'}</td>
                  <td class="px-lg py-md text-right whitespace-nowrap">
                    ${(o.resultId || o.status === 'RESULTED')
                      ? `<button data-result="${o.id}" class="text-primary font-label-md text-label-md hover:underline mr-md">View result</button><button data-verify="${o.resultId || o.id}" data-type="lab_result" class="text-primary font-label-md text-label-md hover:underline">Verify</button>`
                      : '<span class="text-on-surface-variant text-label-md">Awaiting lab</span>'}
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`,
    })}
  `;
}

function renderPrescriptions() {
  return `
    ${sectionHeader({
      title: 'Prescriptions',
      subtitle: 'Create, read and update medication orders for patients under your care (FR-DOC-3). Known allergies are surfaced before you confirm (US-DOC-4).',
      actions: `${searchInput('Search prescriptions…', 'data-filter="rx-tbody"')}${primaryBtn('Write Prescription', { icon: 'prescriptions', attr: 'data-action="write-rx"' })}`,
    })}
    ${panel({
      title: `Prescriptions (${PRESCRIPTIONS.length})`,
      body: `
        <div class="overflow-x-auto">
          <table class="w-full text-left">
            <thead class="bg-white/5 font-label-md text-label-md text-on-surface-variant">
              <tr>
                <th class="px-lg py-md font-medium">Patient</th>
                <th class="px-lg py-md font-medium">Drug</th>
                <th class="px-lg py-md font-medium">Dose</th>
                <th class="px-lg py-md font-medium">Frequency</th>
                <th class="px-lg py-md font-medium">Duration</th>
                <th class="px-lg py-md font-medium">Status</th>
                <th class="px-lg py-md font-medium">Integrity</th>
                <th class="px-lg py-md"></th>
              </tr>
            </thead>
            <tbody id="rx-tbody" class="divide-y divide-white/5 font-body-sm text-body-sm">
              ${PRESCRIPTIONS.map((r) => `
                <tr class="hover:bg-white/5 transition-colors">
                  <td class="px-lg py-md">${avatarCell(patientName(r.patientId))}</td>
                  <td class="px-lg py-md font-medium text-on-surface">${r.drug ? escapeHtml(r.drug) : lockedCell()}</td>
                  <td class="px-lg py-md text-on-surface-variant">${r.dose ? escapeHtml(r.dose) : '—'}</td>
                  <td class="px-lg py-md text-on-surface-variant">${r.frequency ? escapeHtml(r.frequency) : '—'}</td>
                  <td class="px-lg py-md text-on-surface-variant">${r.duration ? escapeHtml(r.duration) : '—'}</td>
                  <td class="px-lg py-md">${rxStatusBadge(r.status)}</td>
                  <td class="px-lg py-md">${integrityBadge(r.integrity)}</td>
                  <td class="px-lg py-md text-right whitespace-nowrap">
                    ${r.drug ? '' : `<button data-open-rx="${r.id}" class="text-primary font-label-md text-label-md hover:underline mr-md">Open</button>`}
                    <button data-edit-rx="${r.id}" class="text-primary font-label-md text-label-md hover:underline mr-md">Update</button>
                    <button data-history="${r.id}" data-type="prescription" data-versions="${r.version}" class="text-primary font-label-md text-label-md hover:underline mr-md">History</button>
                    <button data-verify="${r.id}" data-type="prescription" class="text-primary font-label-md text-label-md hover:underline">Verify</button>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`,
    })}
  `;
}

/* =============================================================================
   Shared row / cell builders
   ========================================================================== */
function encounterTable(rows, tbodyId = '') {
  return `
    <div class="overflow-x-auto">
      <table class="w-full text-left">
        <thead class="bg-white/5 font-label-md text-label-md text-on-surface-variant">
          <tr>
            <th class="px-lg py-md font-medium">Patient</th>
            <th class="px-lg py-md font-medium">Date &amp; Time</th>
            <th class="px-lg py-md font-medium">Type</th>
            <th class="px-lg py-md font-medium">Diagnosis</th>
            <th class="px-lg py-md font-medium">Integrity</th>
            <th class="px-lg py-md"></th>
          </tr>
        </thead>
        <tbody ${tbodyId ? `id="${tbodyId}"` : ''} class="divide-y divide-white/5 font-body-sm text-body-sm">
          ${rows.map((e) => `
            <tr class="hover:bg-white/5 transition-colors">
              <td class="px-lg py-md">${avatarCell(patientName(e.patientId))}</td>
              <td class="px-lg py-md text-on-surface-variant">${e.when}</td>
              <td class="px-lg py-md">${e.type}</td>
              <td class="px-lg py-md text-on-surface-variant">${e.diagnosis ? escapeHtml(e.diagnosis) : lockedCell()}</td>
              <td class="px-lg py-md">${integrityBadge(e.status)} ${e.version > 1 ? badge(`v${e.version}`, 'neutral') : ''}</td>
              <td class="px-lg py-md text-right whitespace-nowrap">
                ${e.diagnosis ? '' : `<button data-open-encounter="${e.id}" class="text-primary font-label-md text-label-md hover:underline mr-md">Open</button>`}
                <button data-history="${e.id}" data-type="encounter" data-versions="${e.version}" class="text-primary font-label-md text-label-md hover:underline mr-md">History</button>
                <button data-verify="${e.id}" data-type="encounter" class="text-primary font-label-md text-label-md hover:underline">Verify</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function queueItem(time, name, reason, active) {
  return `<div class="p-md rounded-xl bg-white/5 border border-white/5 flex items-center gap-md relative overflow-hidden">
    ${active ? '<div class="absolute left-0 top-0 bottom-0 w-1 bg-primary"></div>' : ''}
    <div class="w-12 h-12 rounded-lg bg-surface flex flex-col items-center justify-center border border-white/10 shrink-0">
      <span class="text-[10px] uppercase font-bold ${active ? 'text-primary' : 'text-on-surface-variant'}">${time}</span>
    </div>
    <div class="flex-1 min-w-0"><p class="font-label-md text-label-md truncate">${escapeHtml(name)}</p><p class="text-[10px] text-on-surface-variant truncate">${escapeHtml(reason)}</p></div>
    <span class="material-symbols-outlined text-on-surface-variant">${active ? 'play_arrow' : 'schedule'}</span>
  </div>`;
}

function priorityBadge(p) {
  const tone = p === 'STAT' ? 'error' : p === 'Urgent' ? 'tertiary' : 'neutral';
  return badge(p, tone);
}
function orderStatusBadge(s) {
  const map = {
    // synthetic demo labels
    ORDERED: ['Ordered', 'neutral'], IN_PROGRESS: ['In progress', 'tertiary'], RESULTED: ['Resulted', 'verified'],
    // live DB statuses (lab_orders.status)
    ordered: ['Ordered', 'neutral'], received: ['Received', 'secondary'], 'in-progress': ['In progress', 'tertiary'],
    completed: ['Completed', 'verified'], cancelled: ['Cancelled', 'error'],
  };
  const [t, tone] = map[s] || [s, 'neutral'];
  return badge(t, tone);
}
function rxStatusBadge(s) {
  const map = { ACTIVE: ['Active', 'verified'], COMPLETED: ['Completed', 'neutral'], CANCELLED: ['Cancelled', 'error'] };
  const [t, tone] = map[s] || [s, 'neutral'];
  return badge(t, tone);
}

/* =============================================================================
   Wiring
   ========================================================================== */
function wireCommon() {
  // Cross-section nav shortcuts (e.g. "View all" → encounters)
  ctx.main.querySelectorAll('[data-go]').forEach((b) =>
    b.addEventListener('click', () => { location.hash = b.dataset.go; }));

  // Quick actions + section actions open the matching form dialog.
  ctx.main.querySelectorAll('[data-action]').forEach((b) =>
    b.addEventListener('click', () => openActionDialog(b.dataset.action)));

  // Verify integrity (FR-DOC-8)
  ctx.main.querySelectorAll('[data-verify]').forEach((b) =>
    b.addEventListener('click', () => doVerify(b.dataset.verify, b.dataset.type || 'encounter', b)));

  // Version history (FR-DOC-9)
  ctx.main.querySelectorAll('[data-history]').forEach((b) =>
    b.addEventListener('click', () => openHistory(b.dataset.history, b.dataset.type, Number(b.dataset.versions || 1))));

  // Patient record drawer (FR-DOC-1, FR-DOC-6, FR-DOC-7)
  ctx.main.querySelectorAll('[data-open-patient]').forEach((b) =>
    b.addEventListener('click', () => openPatient(b.dataset.openPatient)));

  // Open (decrypt via read-record) an encrypted encounter / prescription (live)
  ctx.main.querySelectorAll('[data-open-encounter]').forEach((b) =>
    b.addEventListener('click', () => openEncounter(b.dataset.openEncounter)));
  ctx.main.querySelectorAll('[data-open-rx]').forEach((b) =>
    b.addEventListener('click', () => openPrescriptionView(b.dataset.openRx)));

  // Edit prescription (FR-DOC-3 update)
  ctx.main.querySelectorAll('[data-edit-rx]').forEach((b) =>
    b.addEventListener('click', () => openPrescriptionForm(b.dataset.editRx)));

  // View a returned lab result (FR-DOC-5)
  ctx.main.querySelectorAll('[data-result]').forEach((b) =>
    b.addEventListener('click', () => openResult(b.dataset.result)));
}

function wireSearch() {
  ctx.main.querySelectorAll('[data-filter]').forEach((inp) => {
    const tb = ctx.main.querySelector(`#${inp.dataset.filter}`);
    if (!tb) return;
    inp.addEventListener('input', () => {
      const q = inp.value.trim().toLowerCase();
      tb.querySelectorAll('tr').forEach((r) => {
        r.style.display = r.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });
  });
}

function openActionDialog(action) {
  if (action === 'new-encounter') return openEncounterForm();
  if (action === 'order-lab') return openOrderForm();
  if (action === 'write-rx') return openPrescriptionForm();
}

/* ---- verify integrity --------------------------------------------------- */
async function doVerify(recordId, recordType, btn) {
  if (ctx.demo) return ctx.toast('Integrity verification is wired in Increment 2.', 'ok');
  const original = btn.textContent;
  btn.textContent = 'Verifying…';
  btn.disabled = true;
  try {
    const res = await verifyIntegrity({ recordId, recordType });
    const status = res?.status ?? 'VERIFIED';
    ctx.toast(`Integrity: ${status}`, status === 'TAMPERED' ? 'error' : 'ok');
  } catch {
    ctx.toast('Verification failed.', 'error');
  } finally {
    btn.textContent = original;
    btn.disabled = false;
  }
}

/* =============================================================================
   Forms & drawers (built on the shared ui.js dialog system)
   ========================================================================== */
function patientSelect(name = 'patient', selectedId = '') {
  const opts = PATIENTS.map((p) => `<option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>${escapeHtml(p.name)} · ${p.mrn}</option>`).join('');
  return `<select name="${name}" class="field-input">${opts}</select>`;
}
function allergyBanner(patientId) {
  const p = patientById(patientId);
  if (!p) return '';
  if (!p.allergies.length) {
    return `<div class="flex items-center gap-sm p-md rounded-xl bg-verified/10 border border-verified/30 mb-md">
        <span class="material-symbols-outlined text-verified">verified_user</span>
        <p class="text-body-sm text-verified font-medium">No known allergies on record.</p>
      </div>`;
  }
  return `<div class="flex items-start gap-sm p-md rounded-xl bg-error-container/30 border border-error/40 mb-md">
      <span class="material-symbols-outlined text-error">warning</span>
      <div>
        <p class="text-body-sm text-error font-bold">Known allergies — review before prescribing</p>
        <p class="text-body-sm text-on-surface-variant mt-xs">${p.allergies.map(escapeHtml).join(' · ')}</p>
      </div>
    </div>`;
}

function submitStub(message) {
  if (ctx.demo) { ctx.toast(`${message} — write pipeline lands in Increment 1+.`, 'ok'); }
  else { ctx.toast(message, 'ok'); }
  closeDialog();
}

/** Run an async submit with button-busy state; restore the button on error. */
async function withSubmit(wrap, fn, errMsg) {
  const btn = wrap.querySelector('[data-submit]');
  const label = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  try {
    await fn();
  } catch (e) {
    console.error(e);
    ctx.toast(errMsg, 'error');
    if (btn) { btn.disabled = false; btn.textContent = label; }
  }
}

async function submitPrescription(wrap, existing) {
  const v = formVals(wrap);
  if (!v.patient) return ctx.toast('Select a patient.', 'error');
  if (ctx.demo) return submitStub(existing ? 'Prescription updated' : 'Prescription issued');
  await withSubmit(wrap, async () => {
    await createRecord({
      recordType: 'prescription',
      recordId: existing ? existing.id : undefined,
      patient_id: v.patient,
      status: 'active',
      drug: v.drug, dose: v.dose, frequency: v.frequency, duration: v.duration,
    });
    ctx.toast(existing ? 'Prescription updated — new version anchored.' : 'Prescription issued, encrypted & anchored.', 'ok');
    closeDialog();
    await refresh();
  }, 'Could not save prescription.');
}

/* ---- Read-only decrypt drawers (read-record, FR-DOC-2/3/5) --------------- */
async function openEncounter(id) {
  const e = ENCOUNTERS.find((x) => x.id === id);
  let fields = {};
  try {
    const res = await readRecord({ recordType: 'encounter', recordId: id });
    fields = res?.fields || {};
  } catch { return ctx.toast('Could not open encounter.', 'error'); }
  openDialog({
    kind: 'drawer',
    title: e ? `${e.type} — ${patientName(e.patientId)}` : 'Encounter',
    subtitle: e ? `${e.when} · decrypted by read-record (audited)` : 'Decrypted by read-record',
    body: `
      <div class="mb-md">${integrityBadge(e?.status || 'PENDING')} ${e && e.version > 1 ? badge(`v${e.version}`, 'neutral') : ''}</div>
      <section class="glass-card p-lg">
        ${kv('Chief complaint', escapeHtml(fields.chief_complaint ?? '—'))}
        ${kv('Examination', escapeHtml(fields.examination ?? '—'))}
        ${kv('Diagnosis', escapeHtml(fields.diagnosis ?? '—'))}
        ${kv('Progress note', escapeHtml(fields.progress_note ?? '—'))}
      </section>
      <p class="text-[11px] text-on-surface-variant mt-md">Clinical content is decrypted server-side only on an authorised, audited read (FR-DOC-2).</p>`,
    footer: `${ghostBtn('Close', { attr: 'data-close' })}${primaryBtn('Verify Integrity', { icon: 'verified_user', attr: 'data-verify-enc' })}`,
    onOpen: (wrap) => wrap.querySelector('[data-verify-enc]')?.addEventListener('click', (ev) => doVerify(id, 'encounter', ev.currentTarget)),
  });
}

async function openPrescriptionView(id) {
  const r = PRESCRIPTIONS.find((x) => x.id === id);
  let fields = {};
  try {
    const res = await readRecord({ recordType: 'prescription', recordId: id });
    fields = res?.fields || {};
  } catch { return ctx.toast('Could not open prescription.', 'error'); }
  openDialog({
    title: `${fields.drug ?? 'Prescription'} — ${r ? patientName(r.patientId) : ''}`,
    subtitle: 'Decrypted by read-record (audited)',
    body: `
      <div class="mb-md">${integrityBadge(r?.integrity || 'PENDING')} ${r && r.version > 1 ? badge(`v${r.version}`, 'neutral') : ''}</div>
      <section class="glass-card p-lg">
        ${kv('Drug', escapeHtml(fields.drug ?? '—'))}
        ${kv('Dose', escapeHtml(fields.dose ?? '—'))}
        ${kv('Frequency', escapeHtml(fields.frequency ?? '—'))}
        ${kv('Duration', escapeHtml(fields.duration ?? '—'))}
      </section>`,
    footer: `${ghostBtn('Close', { attr: 'data-close' })}${primaryBtn('Verify Integrity', { icon: 'verified_user', attr: 'data-verify-rx' })}`,
    onOpen: (wrap) => wrap.querySelector('[data-verify-rx]')?.addEventListener('click', (ev) => doVerify(id, 'prescription', ev.currentTarget)),
  });
}

/* ---- New / edit encounter (FR-DOC-2) ------------------------------------ */
function openEncounterForm() {
  openFormDialog({
    title: 'New Clinical Encounter',
    subtitle: 'Documented as the legal clinical record — encrypted, hashed and anchored on save (US-DOC-2).',
    body: `
      ${field('Patient', patientSelect())}
      ${field('Encounter type', optionSelect('type', ['Routine Follow-up', 'Acute Management', 'Chronic Care', 'Post-Surgical', 'Initial Consultation']))}
      ${field('Chief complaint', '<input name="chief" class="field-input" placeholder="e.g. Intermittent chest discomfort" />')}
      ${field('Examination findings', '<textarea name="exam" class="field-input" placeholder="Objective examination findings…"></textarea>')}
      ${field('Diagnosis', '<input name="diagnosis" class="field-input" placeholder="e.g. Essential hypertension" />')}
      ${field('Progress note', '<textarea name="note" class="field-input" placeholder="Assessment and plan…"></textarea>')}`,
    submitLabel: 'Save & Anchor',
    onSubmit: (wrap) => submitEncounter(wrap),
  });
}

async function submitEncounter(wrap) {
  const v = formVals(wrap);
  if (!v.patient) return ctx.toast('Select a patient.', 'error');
  if (ctx.demo) return submitStub('Encounter saved');
  await withSubmit(wrap, async () => {
    await createRecord({
      recordType: 'encounter',
      patient_id: v.patient,
      encounter_type: v.type,
      chief_complaint: v.chief,
      examination: v.exam,
      diagnosis: v.diagnosis,
      progress_note: v.note,
    });
    ctx.toast('Encounter saved, encrypted & anchored.', 'ok');
    closeDialog();
    await refresh();
  }, 'Could not save encounter.');
}

/* ---- Order lab investigation (FR-DOC-4) --------------------------------- */
function openOrderForm() {
  openFormDialog({
    title: 'Order Laboratory Test',
    subtitle: 'The order is linked to the patient and appears in the lab technician’s queue (US-DOC-3).',
    body: `
      ${field('Patient', patientSelect())}
      ${field('Linked encounter', optionSelect('encounter', ['Most recent encounter', 'New standalone order']))}
      ${field('Test type', optionSelect('test', TEST_TYPES))}
      ${field('Priority', optionSelect('priority', PRIORITIES))}
      ${field('Clinical notes for lab', '<textarea name="notes" class="field-input" placeholder="Relevant context for the laboratory…"></textarea>')}`,
    submitLabel: 'Send to Lab',
    onSubmit: (wrap) => submitOrder(wrap),
  });
}

async function submitOrder(wrap) {
  const v = formVals(wrap);
  if (!v.patient) return ctx.toast('Select a patient.', 'error');
  if (ctx.demo) return submitStub('Lab order created');
  await withSubmit(wrap, async () => {
    await createLabOrder({
      patientId: v.patient,
      doctorId: ctx.user.id,
      testType: v.test,
      priority: v.priority,
      notes: v.notes || null,
    });
    ctx.toast('Lab order sent to the laboratory.', 'ok');
    closeDialog();
    await refresh();
  }, 'Could not create lab order.');
}

/* ---- Write / update prescription (FR-DOC-3, US-DOC-4 allergy check) ------ */
async function openPrescriptionForm(rxId = '') {
  let existing = rxId ? PRESCRIPTIONS.find((r) => r.id === rxId) : null;
  // Live: the in-memory row carries no decrypted content — fetch it to prefill the edit form.
  if (existing && !ctx.demo && existing.drug == null) {
    try {
      const res = await readRecord({ recordType: 'prescription', recordId: rxId });
      const f = res?.fields || {};
      existing = { ...existing, drug: f.drug, dose: f.dose, frequency: f.frequency, duration: f.duration };
    } catch { return ctx.toast('Could not load prescription for editing.', 'error'); }
  }
  const selectedPatient = existing?.patientId || PATIENTS[0].id;
  openFormDialog({
    title: existing ? 'Update Prescription' : 'Write Prescription',
    subtitle: existing
      ? 'Updating creates a new version with a fresh anchor; the prior version stays verifiable.'
      : 'Recorded, hashed and anchored on confirm (US-DOC-4). Allergies shown below.',
    body: `
      <div data-allergy-slot>${allergyBanner(selectedPatient)}</div>
      ${field('Patient', patientSelect('patient', selectedPatient))}
      ${field('Drug', `<input name="drug" class="field-input" value="${existing ? escapeHtml(existing.drug) : ''}" placeholder="e.g. Lisinopril" />`)}
      <div class="grid grid-cols-2 gap-md">
        ${field('Dose', `<input name="dose" class="field-input" value="${existing ? escapeHtml(existing.dose) : ''}" placeholder="e.g. 10 mg" />`)}
        ${field('Frequency', `<input name="frequency" class="field-input" value="${existing ? escapeHtml(existing.frequency) : ''}" placeholder="e.g. Once daily" />`)}
      </div>
      ${field('Duration', `<input name="duration" class="field-input" value="${existing ? escapeHtml(existing.duration) : ''}" placeholder="e.g. 90 days" />`)}`,
    submitLabel: existing ? 'Save New Version' : 'Prescribe & Anchor',
    onSubmit: (wrap) => submitPrescription(wrap, existing),
    onOpen: (wrap) => {
      const sel = wrap.querySelector('select[name="patient"]');
      const slot = wrap.querySelector('[data-allergy-slot]');
      sel?.addEventListener('change', () => { slot.innerHTML = allergyBanner(sel.value); });
    },
  });
}

/* ---- Patient record drawer (FR-DOC-1/6/7) ------------------------------- */
function openPatient(patientId) {
  const p = patientById(patientId);
  if (!p) return;
  const encs = ENCOUNTERS.filter((e) => e.patientId === patientId);
  const rxs = PRESCRIPTIONS.filter((r) => r.patientId === patientId);
  openDialog({
    kind: 'drawer',
    title: p.name,
    subtitle: `${p.mrn} · ${p.age} ${p.sex} · ${p.status}`,
    body: `
      <div class="space-y-lg">
        <section class="glass-card p-lg">
          <h4 class="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant mb-md">Demographics</h4>
          ${kv('MRN', p.mrn)}
          ${kv('Age / Sex', `${p.age} · ${p.sex === 'F' ? 'Female' : 'Male'}`)}
          ${kv('Last visit', p.last)}
          ${kv('Active conditions', p.conditions.map((c) => badge(c, 'secondary')).join(' ') || '—')}
        </section>

        <section class="glass-card p-lg">
          <div class="flex items-center justify-between mb-md">
            <h4 class="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">Allergy &amp; Medication List</h4>
            <button data-edit-allergy class="text-primary font-label-md text-label-md hover:underline">Update</button>
          </div>
          ${p.allergies.length
            ? `<div class="flex flex-wrap gap-xs">${p.allergies.map((a) => badge(a, 'error')).join('')}</div>`
            : `<div class="flex items-center gap-sm text-verified text-body-sm"><span class="material-symbols-outlined text-[18px]">verified_user</span>No known allergies</div>`}
          <p class="text-[11px] text-on-surface-variant mt-md">FR-DOC-7 — doctors may read and update the allergy/medication list (R U V).</p>
        </section>

        <section class="glass-card p-lg">
          <h4 class="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant mb-md">Vitals (latest) — read-only (FR-DOC-6)</h4>
          ${ctx.demo ? `<div class="grid grid-cols-2 gap-md">
            ${vitalTile('Blood Pressure', '128 / 82', 'mmHg')}
            ${vitalTile('Heart Rate', '74', 'bpm')}
            ${vitalTile('Temperature', '36.8', '°C')}
            ${vitalTile('SpO₂', '98', '%')}
          </div>` : `<p class="text-body-sm text-on-surface-variant">Vitals are charted by nursing staff and decrypted via read-record; view them from the nursing record.</p>`}
        </section>

        <section class="glass-card overflow-hidden">
          <div class="p-lg border-b border-white/5"><h4 class="font-headline-md text-[16px] font-bold">Recent Encounters</h4></div>
          ${encs.length ? `<div class="divide-y divide-white/5">${encs.map((e) => `
            <div class="p-lg flex items-center justify-between gap-md">
              <div><p class="font-body-sm text-body-sm font-medium">${escapeHtml(e.type)}</p><p class="text-[11px] text-on-surface-variant">${e.when}${e.diagnosis ? ' · ' + escapeHtml(e.diagnosis) : ''}</p></div>
              ${integrityBadge(e.status)}
            </div>`).join('')}</div>` : emptyState('medical_services', 'No encounters yet', 'Documented visits will appear here.')}
        </section>

        <section class="glass-card overflow-hidden">
          <div class="p-lg border-b border-white/5"><h4 class="font-headline-md text-[16px] font-bold">Active Medications</h4></div>
          ${rxs.length ? `<div class="divide-y divide-white/5">${rxs.map((r) => `
            <div class="p-lg flex items-center justify-between gap-md">
              <div><p class="font-body-sm text-body-sm font-medium">${r.drug ? `${escapeHtml(r.drug)} ${escapeHtml(r.dose || '')}` : 'Prescription'}</p><p class="text-[11px] text-on-surface-variant">${r.frequency ? `${escapeHtml(r.frequency)}${r.duration ? ' · ' + escapeHtml(r.duration) : ''}` : 'Encrypted — open from Prescriptions'}</p></div>
              ${rxStatusBadge(r.status)}
            </div>`).join('')}</div>` : emptyState('prescriptions', 'No prescriptions', 'Issued medications will appear here.')}
        </section>
      </div>`,
    footer: `${ghostBtn('Close', { attr: 'data-close' })}${primaryBtn('New Encounter', { icon: 'add_box', attr: 'data-new-from-patient' })}`,
    onOpen: (wrap) => {
      wrap.querySelector('[data-new-from-patient]')?.addEventListener('click', () => openEncounterForm());
      wrap.querySelector('[data-edit-allergy]')?.addEventListener('click', () =>
        ctx.toast(ctx.demo ? 'Allergy updates go through update-record in Increment 1+.' : 'Updated.', 'ok'));
    },
  });
}
function vitalTile(label, value, unit) {
  return `<div class="p-md rounded-xl bg-white/5 border border-white/10">
      <p class="text-[10px] uppercase tracking-wider text-on-surface-variant">${label}</p>
      <p class="font-headline-md text-[20px] font-bold mt-xs">${value} <span class="text-body-sm font-normal text-on-surface-variant">${unit}</span></p>
    </div>`;
}

/* ---- Lab result viewer (FR-DOC-5) --------------------------------------- */
async function openResult(orderId) {
  const o = ORDERS.find((x) => x.id === orderId);
  if (!o) return;
  let resultText = o.result;
  const resultRecordId = o.resultId || o.id;
  if (!ctx.demo && o.resultId) {
    try {
      const res = await readRecord({ recordType: 'lab_result', recordId: o.resultId });
      resultText = res?.fields?.result_payload ?? '—';
    } catch { return ctx.toast('Could not open result.', 'error'); }
  }
  openDialog({
    title: `${o.test} — Result`,
    subtitle: `${patientName(o.patientId)} · Ordered ${o.when}`,
    body: `
      ${o.integrity ? `<div class="mb-md">${integrityBadge(o.integrity)}</div>` : ''}
      <section class="glass-card p-lg">
        ${kv('Test', o.test)}
        ${kv('Priority', priorityBadge(o.priority))}
        ${kv('Status', orderStatusBadge(o.status))}
        ${kv('Result', `<span class="text-on-surface font-medium">${escapeHtml(resultText || '—')}</span>`)}
      </section>
      <p class="text-[11px] text-on-surface-variant mt-md">Results are decrypted server-side by read-record; the doctor only ever sees plaintext after an authorised, audited read.</p>`,
    footer: `${ghostBtn('Close', { attr: 'data-close' })}${primaryBtn('Verify Integrity', { icon: 'verified_user', attr: 'data-verify-result' })}`,
    onOpen: (wrap) => {
      wrap.querySelector('[data-verify-result]')?.addEventListener('click', (e) =>
        doVerify(resultRecordId, 'lab_result', e.currentTarget));
    },
  });
}

/* ---- Version history drawer (FR-DOC-9) ---------------------------------- */
function openHistory(recordId, recordType, versions) {
  const rows = [];
  for (let v = versions; v >= 1; v--) {
    const isCurrent = v === versions;
    rows.push(`
      <div class="p-lg flex items-start gap-md ${isCurrent ? '' : 'opacity-90'}">
        <div class="w-10 h-10 rounded-full ${isCurrent ? 'primary-gradient text-on-primary-fixed' : 'bg-white/5 text-on-surface-variant border border-white/10'} flex items-center justify-center font-bold text-body-sm shrink-0">v${v}</div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-sm flex-wrap">
            <span class="font-body-sm text-body-sm font-medium">Version ${v}${isCurrent ? ' · current' : ''}</span>
            ${integrityBadge('VERIFIED')}
          </div>
          <p class="text-[11px] text-on-surface-variant mt-xs">Anchored ${anchorStamp(v)} · ${doctorName()}</p>
          <p class="text-[11px] text-on-surface-variant font-mono mt-xs">anchor_tx: ${fakeTx(recordId, v)}</p>
        </div>
        <button data-verify="${recordId}" data-type="${recordType}" class="text-primary font-label-md text-label-md hover:underline shrink-0">Verify</button>
      </div>`);
  }
  openDialog({
    kind: 'drawer',
    title: 'Version History',
    subtitle: `${recordType} ${recordId} · ${versions} version${versions > 1 ? 's' : ''} on-chain (FR-DOC-9)`,
    body: `<div class="glass-card overflow-hidden divide-y divide-white/5">${rows.join('')}</div>
      <p class="text-[11px] text-on-surface-variant mt-md">Updates never overwrite — each edit re-hashes and anchors a new version while every prior anchor remains independently verifiable (US-DOC-2 AC2).</p>`,
    onOpen: (wrap) => {
      wrap.querySelectorAll('[data-verify]').forEach((b) =>
        b.addEventListener('click', () => doVerify(b.dataset.verify, b.dataset.type, b)));
    },
  });
}

/* =============================================================================
   Small helpers
   ========================================================================== */
function doctorName() {
  const n = ctx.profile?.full_name;
  if (!n) return 'Dr. ' + (ctx.demo ? 'Wilson' : 'Doctor');
  const last = n.split(/\s+/).filter(Boolean).slice(-1)[0];
  return last ? `Dr. ${last}` : 'Doctor';
}
function integrityRate() {
  const all = [...ENCOUNTERS, ...PRESCRIPTIONS];
  const ok = all.filter((r) => (r.status || r.integrity) === 'VERIFIED').length;
  return `${Math.round((ok / all.length) * 100)}%`;
}
function anchorStamp(v) {
  const days = ['Oct 24 · 09:15', 'Oct 18 · 14:02', 'Oct 09 · 10:48'];
  return days[Math.max(0, days.length - v)] || 'Oct 01 · 08:00';
}
function fakeTx(id, v) {
  const seed = `${id}${v}`.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const hex = (seed * 2654435761 >>> 0).toString(16).padStart(8, '0');
  return `0x${hex}${hex.slice(0, 4)}…${hex.slice(-4)}`;
}

/* =============================================================================
   Live data (replaces the synthetic arrays when a real session is present)
   ========================================================================== */
async function loadLive() {
  const [patients, allergies, encounters, orders, prescriptions] = await Promise.all([
    getPatients(), getAllergies(), getEncounters(), getLabOrders(), getPrescriptions(),
  ]);

  const allergyBy = {};
  for (const a of allergies) (allergyBy[a.patient_id] ||= []).push(a.substance);

  const lastVisit = {};
  for (const e of encounters) if (!lastVisit[e.patient_id]) lastVisit[e.patient_id] = e.datetime;

  PATIENTS = patients.map((p) => ({
    id: p.id, name: p.full_name, mrn: p.mrn,
    age: ageFromDob(p.dob), sex: p.sex || '—',
    last: lastVisit[p.id] ? fmtDate(lastVisit[p.id]) : '—',
    conditions: [],
    allergies: allergyBy[p.id] || [],
    status: titleCase(p.chart_status || 'active'),
  }));

  ENCOUNTERS = encounters.map((e) => ({
    id: e.id, patientId: e.patient_id, when: fmtDateTime(e.datetime),
    type: e.encounter_type || 'Encounter',
    diagnosis: null,                       // encrypted — opened via read-record
    status: anchorIntegrity(e.anchor_status), version: e.version,
  }));

  ORDERS = orders.map((o) => {
    const result = o.lab_results && o.lab_results[0];
    return {
      id: o.id, patientId: o.patient_id, test: o.test_type, priority: o.priority,
      status: o.status, when: fmtDate(o.created_at),
      result: null, resultId: result ? result.id : null,
      integrity: result ? anchorIntegrity(result.anchor_status) : null,
    };
  });

  PRESCRIPTIONS = prescriptions.map((r) => ({
    id: r.id, patientId: r.patient_id,
    drug: null, dose: null, frequency: null, duration: null,  // encrypted
    status: (r.status || 'active').toUpperCase(),
    integrity: anchorIntegrity(r.anchor_status), version: r.version,
  }));
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
  return Number.isNaN(d.getTime()) ? '—'
    : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function titleCase(s) { return String(s).charAt(0).toUpperCase() + String(s).slice(1); }

/** anchor_status → integrity badge label. No chain yet in Increment 1 → PENDING. */
function anchorIntegrity(anchorStatus) {
  if (anchorStatus === 'anchored') return 'VERIFIED';
  if (anchorStatus === 'tampered') return 'TAMPERED';
  return 'PENDING';
}

/** Collect name→value for every field inside a dialog form. */
function formVals(wrap) {
  const out = {};
  wrap.querySelectorAll('[name]').forEach((el) => { out[el.name] = el.value; });
  return out;
}

/** Small "🔒 Encrypted" placeholder for list cells whose content needs read-record. */
function lockedCell() {
  return `<span class="inline-flex items-center gap-xs text-on-surface-variant"><span class="material-symbols-outlined text-[14px]">lock</span>Encrypted</span>`;
}
