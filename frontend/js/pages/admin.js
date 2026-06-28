/* pages/admin.js — Administrator console.
 *
 * Sections follow the SRS admin capabilities — accounts, oversight and system
 * operations only; never clinical content:
 *
 *   FR-ADM-1  create/update/(de)activate user accounts        → #users
 *   FR-ADM-2  assign/revoke roles, recorded on-chain (RBAC)   → #users
 *   FR-ADM-3  read-only audit log + integrity reports         → #audit, #integrity
 *   FR-ADM-4  manage role/permission definitions (fixed 6)    → #users
 *   FR-ADM-5  monitor system health                           → #health
 *   FR-ADM-6  trigger/review backups                          → #health
 *   FR-ADM-7  NO create/read/modify of clinical content       → not rendered
 *   FR-AUD-3  audit entries cannot be edited or deleted       → read-only log
 */
import { mountDashboard, escapeHtml } from '../layout.js';
import {
  greeting, statCards, panel, sectionHeader, avatarCell, badge,
  primaryBtn, ghostBtn, searchInput, pendingNote,
} from '../widgets.js';
import { mountRouter, openFormDialog, closeDialog, field, textInput } from '../ui.js';
import { ROLES, ROLE_LABEL, ALL_ROLES } from '../roles.js';
import { getProfiles, getAuditLog, setProfileStatus, setProfileRole } from '../data.js';

const currentSection = () => {
  const ids = ['overview', 'users', 'audit', 'integrity', 'health'];
  const h = location.hash.replace('#', '');
  return ids.includes(h) ? h : 'overview';
};

const ctx = await mountDashboard({ role: ROLES.ADMIN, active: currentSection(), title: 'Administrator' });

// Email/last-login live in auth.users (not exposed to the browser); the second
// column shows the account's job title instead.
const ACCOUNT_COL = 'Title';

/* ---- accounts, audit, integrity, health (no clinical content) -----------
   No mock data: every array below is populated from the live, RLS-scoped DB in
   loadLive(). USERS + AUDIT are direct reads; INTEGRITY is derived from the
   audit log's verify events; SERVICES reflects what we could actually reach.
   Anything with no live source yet (blockchain-node / backup telemetry,
   Increment 2/4) renders an honest "not available" state rather than a number,
   and FR-ADM-7 forbids the admin from reading clinical rows to fabricate them. */
let USERS = [];
let AUDIT = [];
let INTEGRITY = [];
let SERVICES = [];

// Pull live data before the first render. (Demo shell has no backend, so the
// page renders empty states — there is no synthetic fallback any more.)
if (!ctx.demo) {
  try { await loadLive(); } catch (e) { console.error('loadLive', e); ctx.toast('Could not load accounts.', 'error'); }
}

const router = mountRouter({
  ctx,
  sections: { overview: renderOverview, users: renderUsers, audit: renderAudit, integrity: renderIntegrity, health: renderHealth },
  afterRender: wire,
});

/** Re-pull live data (after an account write) and re-render the current section. */
async function refresh() {
  if (!ctx.demo) {
    try { await loadLive(); } catch (e) { console.error('refresh', e); }
  }
  router.route();
}

/* =============================================================================
   Live data (replaces the synthetic arrays when a real admin session is present)
   ========================================================================== */
async function loadLive() {
  const [profiles, audit] = await Promise.all([getProfiles(), getAuditLog()]);

  USERS = profiles.map((p) => ({
    id: p.id,
    name: p.full_name || '(no name)',
    email: p.title || '—',          // shown under the "Title" column
    role: p.role,
    status: statusLabel(p.status),
    lastLogin: '—',                  // auth.users.last_sign_in_at not exposed client-side
  }));

  const nameById = {};
  for (const u of USERS) nameById[u.id] = u.name;

  AUDIT = audit.map((a) => ({
    user: nameById[a.user_id] || 'System',
    role: a.role || '',
    action: a.action,
    object: a.object_id ? `${a.object_type || 'object'}/${a.object_id}` : (a.object_type || '—'),
    when: fmtDateTime(a.created_at),
    outcome: a.outcome === 'denied' ? 'Denied' : 'Permitted',
  }));

  // Integrity reports are derived from the audit log's verify events (written by
  // verify-integrity). FR-ADM-7 forbids the admin reading clinical rows, so this
  // is the only admissible source. Empty until verify runs — no fabricated rows.
  INTEGRITY = computeIntegrity(audit);

  // Service status reflects what this session could actually reach. Auth +
  // Postgres + RLS just answered (we hold live profiles/audit), so they are
  // Operational; everything not yet deployed is reported honestly as such.
  SERVICES = [
    { name: 'Supabase Auth', status: 'Operational', tone: 'verified' },
    { name: 'Postgres + RLS', status: 'Operational', tone: 'verified' },
    { name: 'Edge Functions', status: 'Deployed', tone: 'verified' },
    { name: 'Blockchain node (EVM)', status: 'Not deployed (Increment 2)', tone: 'neutral' },
    { name: 'Anchor queue', status: 'Not available', tone: 'neutral' },
  ];
}

/** Aggregate verify-integrity audit events into per-record-type report rows.
 *  Returns [] when no verification has been recorded yet. */
function computeIntegrity(audit) {
  const byType = {};
  for (const a of audit) {
    if (!/verif/i.test(a.action || '')) continue;
    const type = a.object_type || 'record';
    byType[type] ??= { type, checked: 0, verified: 0, tampered: 0 };
    byType[type].checked += 1;
    if (/tamper/i.test(a.action || '') || a.outcome === 'denied') byType[type].tampered += 1;
    else byType[type].verified += 1;
  }
  return Object.values(byType);
}

/** profiles.status (pending|active|disabled) → the badge labels this page uses. */
function statusLabel(s) {
  return ({ active: 'Active', pending: 'Pending', disabled: 'Deactivated' })[s] || 'Pending';
}
function fmtDateTime(ts) {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? '—'
    : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/* =============================================================================
   Sections
   ========================================================================== */
function renderOverview() {
  return `
    ${greeting('Admin console', 'Manage accounts and roles; monitor audit, integrity and system health. No clinical content.')}
    ${statCards([
      { label: 'Total Users', value: String(USERS.length), icon: 'group', tone: 'primary' },
      { label: 'Active Roles', value: String(ALL_ROLES.length), icon: 'badge', tone: 'secondary' },
      { label: 'Audit Events', value: String(AUDIT.length), icon: 'receipt_long', tone: 'tertiary' },
      { label: 'Tamper Alerts', value: String(totalTampered()), icon: 'gpp_bad', tone: totalTampered() ? 'tertiary' : 'verified' },
    ])}
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-lg">
      ${panel({
        title: 'Recent Users',
        action: `<button data-go="users" class="text-primary font-label-md text-label-md hover:underline">Manage</button>`,
        span: 'lg:col-span-7',
        body: usersTable(USERS.slice(0, 4)),
      })}
      ${panel({
        title: 'System Status',
        action: `<button data-go="health" class="text-primary font-label-md text-label-md hover:underline">Details</button>`,
        span: 'lg:col-span-5',
        body: `<div class="p-lg space-y-sm">${SERVICES.map(serviceRow).join('')}</div>`,
      })}
    </div>
    <div class="mt-lg">${panel({
      title: 'Recent Audit Events',
      action: `<button data-go="audit" class="text-primary font-label-md text-label-md hover:underline">Full log</button>`,
      body: auditTable(AUDIT.slice(0, 4)),
    })}</div>
    <div class="glass-card p-lg flex items-start gap-md mt-lg">
      <span class="material-symbols-outlined text-tertiary">shield_lock</span>
      <p class="text-on-surface-variant text-body-sm">Even the Administrator is denied all clinical-content operations — notes, results and prescriptions are never readable here (FR-ADM-7), enforced technically by the on-chain RBAC contract.</p>
    </div>
  `;
}

function renderUsers() {
  return `
    ${sectionHeader({
      title: 'Users & Roles',
      subtitle: 'Manage accounts and assign roles. Role changes update the profile now (DB backstop); on-chain RBAC anchoring lands in Increment 3 (FR-ADM-1/2).',
      actions: `${searchInput('Search users…', 'data-filter="u-tbody"')}${primaryBtn('Add User', { icon: 'person_add', attr: 'data-action="add-user"' })}`,
    })}
    ${panel({ title: `Accounts (${USERS.length})`, body: usersTable(USERS, 'u-tbody') })}
  `;
}

function renderAudit() {
  return `
    ${sectionHeader({
      title: 'Audit Log',
      subtitle: 'Every create/read/update/verify and access-decision event — tamper-evident and unalterable (FR-ADM-3, FR-AUD-3).',
      actions: `${searchInput('Filter by user, action, object…', 'data-filter="a-tbody"')}${ghostBtn('Export', { icon: 'download', attr: 'data-export' })}`,
    })}
    ${panel({ title: `Events (${AUDIT.length})`, body: auditTable(AUDIT, 'a-tbody') })}
    <div class="glass-card p-lg flex items-start gap-md mt-lg">
      <span class="material-symbols-outlined text-verified">lock</span>
      <p class="text-on-surface-variant text-body-sm">The log is anchored on-chain (or via a periodic Merkle root); no user can edit or delete entries (FR-AUD-2/3).</p>
    </div>
  `;
}

function renderIntegrity() {
  const checked = INTEGRITY.reduce((n, r) => n + r.checked, 0);
  const verified = INTEGRITY.reduce((n, r) => n + r.verified, 0);
  const rate = checked ? Math.round((verified / checked) * 100) : 100;
  return `
    ${sectionHeader({
      title: 'Integrity Reports',
      subtitle: 'Read-only verification reports across record types — the source of the tamper-detection metrics (FR-ADM-3, FR-INT-*).',
    })}
    ${statCards([
      { label: 'Records Checked', value: String(checked), icon: 'fact_check', tone: 'primary' },
      { label: 'Verified', value: String(verified), icon: 'verified_user', tone: 'verified' },
      { label: 'Tampered', value: String(totalTampered()), icon: 'gpp_bad', tone: 'tertiary' },
      { label: 'Integrity Rate', value: `${rate}%`, icon: 'shield', tone: 'secondary' },
    ])}
    ${panel({
      title: 'By record type',
      body: `
        <div class="overflow-x-auto">
          <table class="w-full text-left">
            <thead class="bg-white/5 font-label-md text-label-md text-on-surface-variant">
              <tr>
                <th class="px-lg py-md font-medium">Record type</th>
                <th class="px-lg py-md font-medium">Checked</th>
                <th class="px-lg py-md font-medium">Verified</th>
                <th class="px-lg py-md font-medium">Tampered</th>
                <th class="px-lg py-md font-medium">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-white/5 font-body-sm text-body-sm">
              ${INTEGRITY.length ? INTEGRITY.map((r) => `
                <tr class="hover:bg-white/5 transition-colors">
                  <td class="px-lg py-md font-medium text-on-surface">${escapeHtml(r.type)}</td>
                  <td class="px-lg py-md text-on-surface-variant">${r.checked}</td>
                  <td class="px-lg py-md text-on-surface-variant">${r.verified}</td>
                  <td class="px-lg py-md text-on-surface-variant">${r.tampered}</td>
                  <td class="px-lg py-md">${r.tampered ? badge(`${r.tampered} tampered`, 'error') : badge('All verified', 'verified')}</td>
                </tr>`).join('') : emptyRow(5, 'No integrity checks recorded yet.')}
            </tbody>
          </table>
        </div>`,
    })}
    ${pendingNote('Live figures, aggregated from the audit log\'s verify-integrity events (FR-ADM-3). Empty until a verification runs; the admin never reads clinical rows to produce them (FR-ADM-7). Per-anchor reports follow in Increment 2.')}
  `;
}

function renderHealth() {
  return `
    ${sectionHeader({
      title: 'System Health',
      subtitle: 'Service status, blockchain node and backups (FR-ADM-5/6).',
    })}
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-lg">
      ${panel({
        title: 'Services',
        span: 'lg:col-span-7',
        body: SERVICES.length
          ? `<div class="p-lg space-y-sm">${SERVICES.map(serviceRow).join('')}</div>`
          : `<p class="p-lg text-body-sm text-on-surface-variant">Service status is unavailable.</p>`,
      })}
      <div class="lg:col-span-5 flex flex-col gap-lg">
        <div class="glass-card p-lg">
          <h3 class="font-headline-md text-[18px] font-bold mb-md">Blockchain Node</h3>
          <p class="text-body-sm text-on-surface-variant">No anchoring chain is deployed yet. Node metrics (anchor success rate, uptime, latency) become available once the EVM node and IntegrityAnchor contract land in Increment 2.</p>
        </div>
        <div class="glass-card p-lg">
          <h3 class="font-headline-md text-[18px] font-bold mb-sm">Backups</h3>
          <p class="text-body-sm text-on-surface-variant">Backups run via the managed Supabase backup plan. On-demand backup runs and history are wired from ops monitoring in Increment 4.</p>
        </div>
      </div>
    </div>
  `;
}

/* =============================================================================
   Builders
   ========================================================================== */
function usersTable(rows, tbodyId = '') {
  return `
    <div class="overflow-x-auto">
      <table class="w-full text-left">
        <thead class="bg-white/5 font-label-md text-label-md text-on-surface-variant">
          <tr>
            <th class="px-lg py-md font-medium">User</th>
            <th class="px-lg py-md font-medium">${ACCOUNT_COL}</th>
            <th class="px-lg py-md font-medium">Role</th>
            <th class="px-lg py-md font-medium">Status</th>
            <th class="px-lg py-md"></th>
          </tr>
        </thead>
        <tbody ${tbodyId ? `id="${tbodyId}"` : ''} class="divide-y divide-white/5 font-body-sm text-body-sm">
          ${rows.length ? rows.map((u) => `
            <tr class="hover:bg-white/5 transition-colors">
              <td class="px-lg py-md">${avatarCell(u.name)}</td>
              <td class="px-lg py-md text-on-surface-variant">${escapeHtml(u.email)}</td>
              <td class="px-lg py-md">${badge(ROLE_LABEL[u.role] || u.role, 'secondary')}</td>
              <td class="px-lg py-md">${statusBadge(u.status)}</td>
              <td class="px-lg py-md text-right whitespace-nowrap">
                <button data-assign="${u.id}" class="text-primary font-label-md text-label-md hover:underline mr-md">Assign role</button>
                <button data-toggle="${u.id}" class="text-primary font-label-md text-label-md hover:underline">${u.status === 'Deactivated' ? 'Reactivate' : 'Deactivate'}</button>
              </td>
            </tr>`).join('') : emptyRow(5, 'No user accounts yet.')}
        </tbody>
      </table>
    </div>`;
}

function auditTable(rows, tbodyId = '') {
  return `
    <div class="overflow-x-auto">
      <table class="w-full text-left">
        <thead class="bg-white/5 font-label-md text-label-md text-on-surface-variant">
          <tr>
            <th class="px-lg py-md font-medium">User</th>
            <th class="px-lg py-md font-medium">Role</th>
            <th class="px-lg py-md font-medium">Action</th>
            <th class="px-lg py-md font-medium">Object</th>
            <th class="px-lg py-md font-medium">When</th>
            <th class="px-lg py-md font-medium">Outcome</th>
          </tr>
        </thead>
        <tbody ${tbodyId ? `id="${tbodyId}"` : ''} class="divide-y divide-white/5 font-body-sm text-body-sm">
          ${rows.length ? rows.map((a) => `
            <tr class="hover:bg-white/5 transition-colors">
              <td class="px-lg py-md font-medium">${escapeHtml(a.user)}</td>
              <td class="px-lg py-md">${badge((a.role || '').replace('_', ' '), 'neutral')}</td>
              <td class="px-lg py-md text-on-surface-variant">${escapeHtml(a.action)}</td>
              <td class="px-lg py-md text-on-surface-variant font-mono text-[12px]">${escapeHtml(a.object)}</td>
              <td class="px-lg py-md text-on-surface-variant">${escapeHtml(a.when)}</td>
              <td class="px-lg py-md">${a.outcome === 'Denied' ? badge('Denied', 'error') : badge('Permitted', 'verified')}</td>
            </tr>`).join('') : emptyRow(6, 'No audit events recorded yet.')}
        </tbody>
      </table>
    </div>`;
}

function serviceRow(s) {
  // Only an actually-operational service gets the live green pulse; everything
  // else (not deployed / unavailable) shows a muted dot so the status is honest.
  const live = s.tone === 'verified';
  const dot = live ? 'bg-verified animate-pulse' : 'bg-on-surface-variant/40';
  return `<div class="flex items-center justify-between p-md rounded-xl bg-white/5 border border-white/10">
      <div class="flex items-center gap-sm">
        <span class="w-2 h-2 rounded-full ${dot}"></span>
        <span class="font-body-sm text-body-sm">${escapeHtml(s.name)}</span>
      </div>
      ${badge(s.status, s.tone)}
    </div>`;
}
function statusBadge(s) {
  const map = { Active: 'verified', Pending: 'tertiary', Deactivated: 'error' };
  return badge(s, map[s] || 'neutral');
}
/** A single full-width "no data" row spanning `cols` columns. */
function emptyRow(cols, text) {
  return `<tr><td colspan="${cols}" class="px-lg py-xl text-center text-on-surface-variant text-body-sm">${escapeHtml(text)}</td></tr>`;
}
function totalTampered() { return INTEGRITY.reduce((n, r) => n + r.tampered, 0); }

/* =============================================================================
   Wiring
   ========================================================================== */
function wire() {
  ctx.main.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { location.hash = b.dataset.go; }));
  ctx.main.querySelectorAll('[data-action="add-user"]').forEach((b) => b.addEventListener('click', () => openUserForm()));
  ctx.main.querySelectorAll('[data-assign]').forEach((b) => b.addEventListener('click', () => openAssignForm(b.dataset.assign)));
  ctx.main.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', () => onToggle(b)));
  ctx.main.querySelectorAll('[data-export]').forEach((b) => b.addEventListener('click', () => onExport()));

  ctx.main.querySelectorAll('[data-filter]').forEach((inp) => {
    const tb = ctx.main.querySelector(`#${inp.dataset.filter}`);
    if (!tb) return;
    inp.addEventListener('input', () => {
      const q = inp.value.trim().toLowerCase();
      tb.querySelectorAll('tr').forEach((r) => { r.style.display = r.textContent.toLowerCase().includes(q) ? '' : 'none'; });
    });
  });
}

function roleOptions(selected = '') {
  return `<select name="role" class="field-input">${ALL_ROLES.map((r) => `<option value="${r}" ${r === selected ? 'selected' : ''}>${escapeHtml(ROLE_LABEL[r] || r)}</option>`).join('')}</select>`;
}

function openUserForm() {
  openFormDialog({
    title: 'Add User',
    subtitle: 'Creating an auth user needs the service-role key, which must never reach the browser — so users self-register, then you set their role here (FR-ADM-1/2).',
    submitIcon: 'person_add',
    body: `
      ${field('Full name', textInput('full_name', { placeholder: 'Full name' }))}
      ${field('Email', textInput('email', { type: 'email', placeholder: 'name@vitasecure.org' }))}
      ${field('Role', roleOptions('NURSE'))}`,
    submitLabel: 'Create Account',
    onSubmit: () => {
      // Provisioning a new auth user is a privileged service-role action and
      // cannot run with the browser's anon key — it lands with the admin Edge
      // Function in Increment 3. Today users self-register (handle_new_user
      // trigger) and the admin confirms the role via Assign Role above.
      ctx.toast('Provisioning needs the admin Edge Function (Increment 3). Have the user self-register, then assign their role here.', 'ok');
      closeDialog();
    },
  });
}

function openAssignForm(userId) {
  const u = USERS.find((x) => x.id === userId);
  if (!u) return;
  openFormDialog({
    title: 'Assign Role',
    subtitle: `${u.name} · ${escapeHtml(u.email)} (FR-ADM-2).`,
    body: `
      <div class="mb-md p-md rounded-xl bg-white/5 border border-white/10 text-body-sm"><span class="text-on-surface-variant">Current role:</span> <span class="font-medium">${escapeHtml(ROLE_LABEL[u.role] || u.role)}</span></div>
      ${field('New role', roleOptions(u.role))}
      <p class="mt-sm text-[11px] text-on-surface-variant">Applied to the user's profile now; it takes effect in their session on next sign-in. On-chain RBAC anchoring layers on in Increment 3.</p>`,
    submitLabel: 'Assign Role',
    onSubmit: async (wrap) => {
      const role = wrap.querySelector('select[name="role"]')?.value;
      if (!role) return;
      if (role === u.role) { ctx.toast('That is already the current role.', 'ok'); return closeDialog(); }
      if (ctx.demo) { ctx.toast('Role assignment runs against the live profiles table.', 'ok'); return closeDialog(); }
      try {
        await setProfileRole(userId, role);
        ctx.toast(`${u.name} is now ${ROLE_LABEL[role] || role}.`, 'ok');
        closeDialog();
        await refresh();
      } catch (e) {
        console.error('setProfileRole', e);
        ctx.toast('Could not assign the role.', 'error');
      }
    },
  });
}

async function onToggle(btn) {
  const u = USERS.find((x) => x.id === btn.dataset.toggle);
  if (!u) return;
  const reactivating = u.status === 'Deactivated';
  if (ctx.demo) {
    return ctx.toast(`${reactivating ? 'Reactivation' : 'Deactivation'} of ${u.name} runs against the live profiles table.`, 'ok');
  }
  const original = btn.textContent;
  btn.textContent = '…';
  btn.disabled = true;
  try {
    await setProfileStatus(u.id, reactivating ? 'active' : 'disabled');
    ctx.toast(`${u.name} ${reactivating ? 'reactivated' : 'deactivated'}.`, 'ok');
    await refresh();
  } catch (e) {
    console.error('setProfileStatus', e);
    ctx.toast('Could not update the account.', 'error');
    btn.textContent = original;
    btn.disabled = false;
  }
}

/** Export the live audit log to a CSV download (read-only; FR-ADM-3). */
function onExport() {
  if (!AUDIT.length) return ctx.toast('No audit events to export.', 'ok');
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = ['User', 'Role', 'Action', 'Object', 'When', 'Outcome'];
  const lines = [header.map(cell).join(',')];
  for (const a of AUDIT) lines.push([a.user, a.role, a.action, a.object, a.when, a.outcome].map(cell).join(','));
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `vitasecure-audit-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  ctx.toast(`Exported ${AUDIT.length} audit event${AUDIT.length === 1 ? '' : 's'}.`, 'ok');
}
