/* pages/labtech.js — Lab Technician workspace.
 *
 * Sections follow the SRS lab capabilities — minimum-necessary access only:
 *
 *   FR-LAB-1  view the queue of orders directed to the lab        → #queue
 *   FR-LAB-2  open an order with only the context to fulfil it    → order drawer
 *   FR-LAB-3  record + upload results against the order (C R U)   → #results
 *   FR-LAB-4  mark order status (received / in progress / done)   → status control
 *   FR-LAB-5  verify integrity of results created (V)             → #verify, Verify buttons
 *   FR-LAB-6  no notes / prescriptions / unrelated records        → not rendered (US-LAB-4)
 *
 * Live mode uses RLS-scoped reads (data.js): the queue + own results. Result
 * entry/updates go through create-record (encrypt → hash → anchor → audit) and
 * order-status changes update lab_orders directly under RLS. Demo keeps synthetic.
 */
import { mountDashboard, integrityBadge, escapeHtml } from '../layout.js';
import {
  greeting, statCards, panel, sectionHeader, avatarCell, badge, kv,
  primaryBtn, ghostBtn, searchInput,
} from '../widgets.js';
import { mountRouter, openDialog, closeDialog, openFormDialog, field, textInput, textArea, optionSelect } from '../ui.js';
import { ROLES } from '../roles.js';
import { verifyIntegrity, createRecord, readRecord } from '../api.js';
import { getLabQueue, getLabResults, setLabOrderStatus } from '../data.js';

const currentSection = () => {
  const ids = ['overview', 'queue', 'results', 'verify'];
  const h = location.hash.replace('#', '');
  return ids.includes(h) ? h : 'overview';
};

const ctx = await mountDashboard({ role: ROLES.LAB_TECHNICIAN, active: currentSection(), title: 'Lab Technician' });

/* ---- assigned orders + own results (demo shell only) -------------------- */
let ORDERS = [
  { id: 'ord_3', patient: 'Elena Lopez', mrn: 'MRN-44102', test: 'Full Blood Count', priority: 'STAT', doctor: 'Dr. Wilson', when: 'Oct 23 · 16:40', status: 'ORDERED', hasResult: false },
  { id: 'ord_2', patient: 'Robert Klein', mrn: 'MRN-50917', test: 'Thyroid Function (TSH)', priority: 'Urgent', doctor: 'Dr. Wilson', when: 'Oct 24 · 09:05', status: 'IN_PROGRESS', hasResult: false },
  { id: 'ord_5', patient: 'Marcus Vane', mrn: 'MRN-51338', test: 'Renal Panel', priority: 'Routine', doctor: 'Dr. Adeyemi', when: 'Oct 24 · 10:20', status: 'RECEIVED', hasResult: false },
];

let RESULTS = [
  { id: 'res_1', orderId: 'ord_1', patient: 'Sarah Mitchell', test: 'Lipid Panel', value: 'LDL 142 mg/dL · borderline high', when: 'Oct 24', status: 'VERIFIED', version: 1 },
  { id: 'res_4', orderId: 'ord_4', patient: 'Marcus Vane', test: 'HbA1c', value: '6.1% · within target', when: 'Oct 22', status: 'VERIFIED', version: 1 },
  { id: 'res_6', orderId: 'ord_6', patient: 'Elena Lopez', test: 'Urinalysis', value: 'No abnormality detected', when: 'Oct 21', status: 'PENDING', version: 1 },
];

const orderById = (id) => ORDERS.find((o) => o.id === id);

/* ---- live data before first render --------------------------------------- */
if (!ctx.demo) {
  try { await loadLive(); } catch (e) { console.error('loadLive', e); ctx.toast('Could not load the lab queue.', 'error'); }
}

const router = mountRouter({
  ctx,
  sections: { overview: renderOverview, queue: renderQueue, results: renderResults, verify: renderVerify },
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
    ${greeting('Laboratory queue', 'Process assigned orders and enter verified results.')}
    ${statCards([
      { label: 'Assigned Orders', value: String(ORDERS.length), icon: 'pending_actions', tone: 'primary' },
      { label: 'In Progress', value: String(ORDERS.filter((o) => o.status === 'IN_PROGRESS' || o.status === 'in-progress').length), icon: 'science', tone: 'tertiary' },
      { label: 'Results Entered', value: String(RESULTS.length), icon: 'task_alt', tone: 'secondary' },
      { label: 'Verified', value: integrityRate(), icon: 'verified_user', tone: 'verified' },
    ])}
    ${panel({
      title: 'Order Queue',
      action: `<button data-go="queue" class="text-primary font-label-md text-label-md hover:underline">Open queue</button>`,
      body: queueTable(ORDERS.slice(0, 4)),
    })}
    <div class="glass-card p-lg flex items-start gap-md mt-lg">
      <span class="material-symbols-outlined text-tertiary">visibility_off</span>
      <p class="text-on-surface-variant text-body-sm">You only ever see the context required to fulfil an order — test, patient identifier and ordering doctor. Progress notes, prescriptions and unrelated records are never exposed to this role (FR-LAB-6 / US-LAB-4).</p>
    </div>
  `;
}

function renderQueue() {
  return `
    ${sectionHeader({
      title: 'Order Queue',
      subtitle: 'Orders directed to the lab. Open one to see only the context needed to fulfil it (FR-LAB-1/2).',
      actions: searchInput('Search orders…', 'data-filter="q-tbody"'),
    })}
    ${panel({ title: `Assigned orders (${ORDERS.length})`, body: queueTable(ORDERS, 'q-tbody') })}
  `;
}

function renderResults() {
  return `
    ${sectionHeader({
      title: 'My Results',
      subtitle: 'Results you recorded against their orders — encrypted, hashed and anchored on save (FR-LAB-3, US-LAB-2).',
      actions: `${searchInput('Search results…', 'data-filter="r-tbody"')}${primaryBtn('Enter Result', { icon: 'science', attr: 'data-action="enter-result"' })}`,
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
                <th class="px-lg py-md font-medium">Completed</th>
                <th class="px-lg py-md font-medium">Integrity</th>
                <th class="px-lg py-md"></th>
              </tr>
            </thead>
            <tbody id="r-tbody" class="divide-y divide-white/5 font-body-sm text-body-sm">
              ${RESULTS.length ? RESULTS.map((r) => `
                <tr class="hover:bg-white/5 transition-colors">
                  <td class="px-lg py-md">${avatarCell(r.patient, 'tertiary')}</td>
                  <td class="px-lg py-md">${escapeHtml(r.test)}</td>
                  <td class="px-lg py-md text-on-surface-variant">${r.value ? escapeHtml(r.value) : lockedCell()}</td>
                  <td class="px-lg py-md text-on-surface-variant">${escapeHtml(r.when)}</td>
                  <td class="px-lg py-md">${integrityBadge(r.status)} ${r.version > 1 ? badge(`v${r.version}`, 'neutral') : ''}</td>
                  <td class="px-lg py-md text-right whitespace-nowrap">
                    ${r.value ? '' : `<button data-open-result="${r.id}" class="text-primary font-label-md text-label-md hover:underline mr-md">Open</button>`}
                    <button data-edit-result="${r.id}" data-order="${r.orderId}" class="text-primary font-label-md text-label-md hover:underline mr-md">Update</button>
                    <button data-verify="${r.id}" data-type="lab_result" class="text-primary font-label-md text-label-md hover:underline">Verify</button>
                  </td>
                </tr>`).join('') : emptyRow(6, 'No results entered yet.')}
            </tbody>
          </table>
        </div>`,
    })}
  `;
}

function renderVerify() {
  return `
    ${sectionHeader({
      title: 'Integrity Verify',
      subtitle: 'Confirm a result you uploaded was stored unaltered — returns VERIFIED or TAMPERED (FR-LAB-5, US-LAB-3).',
    })}
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-lg">
      ${panel({
        title: 'Verify a result',
        span: 'lg:col-span-5',
        body: `<div class="p-lg space-y-md">
          ${RESULTS.length
            ? `<select name="verify-result" class="field-input">${RESULTS.map((r) => `<option value="${r.id}">${escapeHtml(r.test)} · ${escapeHtml(r.patient)}</option>`).join('')}</select>`
            : `<p class="text-body-sm text-on-surface-variant">No results to verify yet.</p>`}
          ${RESULTS.length ? primaryBtn('Run Verification', { icon: 'verified_user', attr: 'data-run-verify' }) : ''}
          <p class="text-[11px] text-on-surface-variant">Re-hashes the stored record and compares it to the on-chain anchor.</p>
        </div>`,
      })}
      ${panel({
        title: 'Recent results',
        span: 'lg:col-span-7',
        body: RESULTS.length ? `<div class="divide-y divide-white/5">
          ${RESULTS.map((r) => `
            <div class="p-lg flex items-center justify-between gap-md">
              <div><p class="font-body-sm text-body-sm font-medium">${escapeHtml(r.test)}</p><p class="text-[11px] text-on-surface-variant">${escapeHtml(r.patient)} · ${escapeHtml(r.when)}</p></div>
              ${integrityBadge(r.status)}
            </div>`).join('')}
        </div>` : `<p class="p-lg text-body-sm text-on-surface-variant">No results yet.</p>`,
      })}
    </div>
  `;
}

/* =============================================================================
   Builders
   ========================================================================== */
function queueTable(rows, tbodyId = '') {
  return `
    <div class="overflow-x-auto">
      <table class="w-full text-left">
        <thead class="bg-white/5 font-label-md text-label-md text-on-surface-variant">
          <tr>
            <th class="px-lg py-md font-medium">Patient</th>
            <th class="px-lg py-md font-medium">Test</th>
            <th class="px-lg py-md font-medium">Priority</th>
            <th class="px-lg py-md font-medium">Ordering Doctor</th>
            <th class="px-lg py-md font-medium">Status</th>
            <th class="px-lg py-md"></th>
          </tr>
        </thead>
        <tbody ${tbodyId ? `id="${tbodyId}"` : ''} class="divide-y divide-white/5 font-body-sm text-body-sm">
          ${rows.length ? rows.map((o) => `
            <tr class="hover:bg-white/5 transition-colors">
              <td class="px-lg py-md">${avatarCell(o.patient, 'tertiary')}</td>
              <td class="px-lg py-md">${escapeHtml(o.test)}</td>
              <td class="px-lg py-md">${priorityBadge(o.priority)}</td>
              <td class="px-lg py-md text-on-surface-variant">${escapeHtml(o.doctor)}</td>
              <td class="px-lg py-md">${orderStatusBadge(o.status)}</td>
              <td class="px-lg py-md text-right whitespace-nowrap">
                <button data-open-order="${o.id}" class="text-primary font-label-md text-label-md hover:underline mr-md">Open</button>
                ${o.hasResult
                  ? `<span class="text-on-surface-variant text-label-md">Resulted</span>`
                  : `<button data-result-for="${o.id}" class="gradient-button text-on-primary-fixed text-label-md uppercase tracking-wider px-md py-xs rounded-lg">Enter result</button>`}
              </td>
            </tr>`).join('') : emptyRow(6, 'No orders in the queue.')}
        </tbody>
      </table>
    </div>`;
}

function priorityBadge(p) { return badge(p, p === 'STAT' ? 'error' : p === 'Urgent' ? 'tertiary' : 'neutral'); }
function orderStatusBadge(s) {
  const map = {
    ORDERED: ['Ordered', 'neutral'], RECEIVED: ['Received', 'secondary'], IN_PROGRESS: ['In progress', 'tertiary'], COMPLETED: ['Completed', 'verified'],
    ordered: ['Ordered', 'neutral'], received: ['Received', 'secondary'], 'in-progress': ['In progress', 'tertiary'],
    completed: ['Completed', 'verified'], cancelled: ['Cancelled', 'error'],
  };
  const [t, tone] = map[s] || [s, 'neutral'];
  return badge(t, tone);
}

/* =============================================================================
   Wiring
   ========================================================================== */
function wire() {
  ctx.main.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { location.hash = b.dataset.go; }));
  ctx.main.querySelectorAll('[data-verify]').forEach((b) => b.addEventListener('click', () => doVerify(b.dataset.verify, b.dataset.type, b)));
  ctx.main.querySelectorAll('[data-open-order]').forEach((b) => b.addEventListener('click', () => openOrder(b.dataset.openOrder)));
  ctx.main.querySelectorAll('[data-result-for]').forEach((b) => b.addEventListener('click', () => openResultForm(b.dataset.resultFor)));
  ctx.main.querySelectorAll('[data-edit-result]').forEach((b) => b.addEventListener('click', () => openResultForm(b.dataset.order || null, b.dataset.editResult)));
  ctx.main.querySelectorAll('[data-open-result]').forEach((b) => b.addEventListener('click', () => openResultView(b.dataset.openResult)));
  ctx.main.querySelectorAll('[data-action="enter-result"]').forEach((b) => b.addEventListener('click', () => openResultForm()));
  ctx.main.querySelectorAll('[data-run-verify]').forEach((b) => b.addEventListener('click', () => {
    const sel = ctx.main.querySelector('select[name="verify-result"]');
    doVerify(sel ? sel.value : 'selected', 'lab_result', b);
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

function openOrder(orderId) {
  const o = orderById(orderId);
  if (!o) return;
  openDialog({
    kind: 'drawer',
    title: `${o.test}`,
    subtitle: `Order ${o.id} · ${o.when}`,
    body: `
      <div class="mb-md flex items-center gap-sm">${priorityBadge(o.priority)} ${orderStatusBadge(o.status)}</div>
      <section class="glass-card p-lg">
        <h4 class="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant mb-md">Minimum-necessary context (FR-LAB-2)</h4>
        ${kv('Test requested', escapeHtml(o.test))}
        ${kv('Patient identifier', escapeHtml(o.mrn))}
        ${kv('Ordering doctor', escapeHtml(o.doctor))}
      </section>
      <section class="glass-card p-lg mt-lg">
        ${field('Update status', optionSelect('status', ['Received', 'In progress', 'Completed'], statusLabel(o.status)))}
        <p class="text-[11px] text-on-surface-variant">Status changes are audited (FR-LAB-4).</p>
      </section>
      <p class="text-[11px] text-on-surface-variant mt-md">Progress notes, prescriptions and demographics beyond the identifier are not accessible to this role (FR-LAB-6).</p>`,
    footer: `${ghostBtn('Close', { attr: 'data-close' })}${primaryBtn('Enter Result', { icon: 'science', attr: 'data-enter' })}`,
    onOpen: (wrap) => {
      wrap.querySelector('[data-enter]')?.addEventListener('click', () => openResultForm(orderId));
      wrap.querySelector('select[name="status"]')?.addEventListener('change', (e) => onStatusChange(orderId, e.target.value));
    },
  });
}
function statusLabel(s) {
  return {
    ORDERED: 'Received', RECEIVED: 'Received', IN_PROGRESS: 'In progress', COMPLETED: 'Completed',
    ordered: 'Received', received: 'Received', 'in-progress': 'In progress', completed: 'Completed',
  }[s] || 'Received';
}
const STATUS_DB = { Received: 'received', 'In progress': 'in-progress', Completed: 'completed' };

async function onStatusChange(orderId, label) {
  const status = STATUS_DB[label];
  if (!status) return;
  if (ctx.demo) return ctx.toast('Status update lands in Increment 1+.', 'ok');
  try {
    await setLabOrderStatus(orderId, status);
    ctx.toast(`Order marked ${label.toLowerCase()}.`, 'ok');
    await refresh();
  } catch (e) {
    console.error('setLabOrderStatus', e);
    ctx.toast('Could not update status.', 'error');
  }
}

async function openResultView(id) {
  const r = RESULTS.find((x) => x.id === id);
  let value = '—';
  try {
    const res = await readRecord({ recordType: 'lab_result', recordId: id });
    value = res?.fields?.result_payload ?? '—';
  } catch { return ctx.toast('Could not open result.', 'error'); }
  openDialog({
    title: r ? `${r.test} — Result` : 'Lab Result',
    subtitle: r ? `${r.patient} · ${r.when} · decrypted by read-record (audited)` : 'Decrypted by read-record',
    body: `
      ${r ? `<div class="mb-md">${integrityBadge(r.status)}</div>` : ''}
      <section class="glass-card p-lg">
        ${kv('Test', escapeHtml(r?.test ?? '—'))}
        ${kv('Result', `<span class="text-on-surface font-medium">${escapeHtml(value)}</span>`)}
      </section>`,
    footer: `${ghostBtn('Close', { attr: 'data-close' })}${primaryBtn('Verify Integrity', { icon: 'verified_user', attr: 'data-verify-r' })}`,
    onOpen: (wrap) => wrap.querySelector('[data-verify-r]')?.addEventListener('click', (e) => doVerify(id, 'lab_result', e.currentTarget)),
  });
}

async function openResultForm(orderId = null, resultId = null) {
  const o = orderId ? orderById(orderId) : null;
  const existing = resultId ? RESULTS.find((r) => r.id === resultId) : null;
  // For live updates, pre-fill the current payload by decrypting it.
  let prefill = existing ? existing.value : '';
  if (existing && !ctx.demo && existing.value == null) {
    try {
      const res = await readRecord({ recordType: 'lab_result', recordId: resultId });
      prefill = res?.fields?.result_payload ?? '';
    } catch { /* leave blank; tech can re-enter */ }
  }
  const targetOrderId = orderId || existing?.orderId || null;
  const heading = o ? `${o.test} · ${o.patient}` : existing ? `${existing.test} · ${existing.patient}` : 'Select order below';
  const needOrderPick = !o && !existing;
  openFormDialog({
    title: existing ? 'Update Result' : 'Enter Lab Result',
    subtitle: 'Linked to the correct order; encrypted, hashed and anchored on save (US-LAB-2).',
    body: `
      ${!needOrderPick
        ? `<div class="mb-md p-md rounded-xl bg-white/5 border border-white/10 text-body-sm"><span class="text-on-surface-variant">Order:</span> <span class="font-medium">${escapeHtml(heading)}</span></div>`
        : field('Order', orderPicker())}
      ${field('Result payload', textArea('result', { value: prefill || '', placeholder: 'Measured values and interpretation…' }))}
      ${field('Attachment reference (optional)', textInput('attachment', { placeholder: 'e.g. lab-report-2026-10-24.pdf' }))}`,
    submitLabel: existing ? 'Save New Version' : 'Save & Anchor',
    onSubmit: (wrap) => submitResult(wrap, { existing, targetOrderId }),
  });
}

function orderPicker() {
  const open = ORDERS.filter((o) => !o.hasResult);
  const list = open.length ? open : ORDERS;
  if (!list.length) return `<select name="order" class="field-input"><option value="">No orders available</option></select>`;
  return `<select name="order" class="field-input">${list.map((o) => `<option value="${o.id}">${escapeHtml(o.test)} · ${escapeHtml(o.patient)}</option>`).join('')}</select>`;
}

async function submitResult(wrap, { existing, targetOrderId }) {
  const v = formVals(wrap);
  const orderId = targetOrderId || v.order;
  if (!orderId) return ctx.toast('Select an order.', 'error');
  if (!(v.result || '').trim()) return ctx.toast('Enter the result.', 'error');
  if (ctx.demo) { ctx.toast(`${existing ? 'Result updated' : 'Result saved'} — write pipeline lands in Increment 1+.`, 'ok'); return closeDialog(); }
  const btn = wrap.querySelector('[data-submit]');
  const label = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  try {
    await createRecord({
      recordType: 'lab_result',
      recordId: existing ? existing.id : undefined,
      order_id: orderId,
      result_payload: v.result,
      attachment_ref: v.attachment || null,
    });
    // Recording a result advances the order to completed.
    if (!existing) { try { await setLabOrderStatus(orderId, 'completed'); } catch { /* non-fatal */ } }
    ctx.toast(existing ? 'Result updated — new version anchored.' : 'Result saved, encrypted & anchored.', 'ok');
    closeDialog();
    await refresh();
  } catch (e) {
    console.error('createRecord lab_result', e);
    ctx.toast('Could not save the result.', 'error');
    if (btn) { btn.disabled = false; btn.textContent = label; }
  }
}

/* =============================================================================
   Live data + helpers
   ========================================================================== */
async function loadLive() {
  const [orders, results] = await Promise.all([getLabQueue(), getLabResults()]);

  ORDERS = orders.map((o) => {
    const pat = o.patients || {};
    return {
      id: o.id,
      patient: pat.full_name || 'Patient',
      mrn: pat.mrn || '—',
      test: o.test_type,
      priority: o.priority,
      doctor: '—',                          // other users' profiles aren't readable (minimum-necessary)
      when: fmtDateTime(o.created_at),
      status: o.status,
      hasResult: Array.isArray(o.lab_results) && o.lab_results.length > 0,
    };
  });

  RESULTS = results.map((r) => {
    const ord = r.lab_orders || {};
    const pat = ord.patients || {};
    return {
      id: r.id, orderId: r.order_id,
      patient: pat.full_name || 'Patient',
      test: ord.test_type || 'Lab result',
      value: null,                          // encrypted — opened via read-record
      when: fmtDate(r.completed_at),
      status: anchorIntegrity(r.anchor_status), version: r.version,
    };
  });
}

function integrityRate() {
  const ok = RESULTS.filter((r) => r.status === 'VERIFIED').length;
  return RESULTS.length ? `${Math.round((ok / RESULTS.length) * 100)}%` : '—';
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
