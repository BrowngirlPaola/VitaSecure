/* layout.js — shared dashboard chrome renderer (Stitch glassmorphism shell).
 *
 * Builds the fixed glass sidebar + topbar + mobile bottom-nav identical across
 * all six role dashboards, so each page only supplies its own <main> content.
 * Nav items come from ROLE_NAV (derived from the SRS §5 matrix).
 *
 * Usage (in js/pages/<role>.js):
 *   const ctx = await mountDashboard({ role: ROLES.DOCTOR, active: 'overview' });
 *   ctx.main.innerHTML = `...role content...`;
 */

import { requireRole } from './guard.js';
import { signOut } from './auth.js';
import { ROLE_NAV, ROLE_LABEL } from './roles.js';

const ICON = (name, extra = '') =>
  `<span class="material-symbols-outlined ${extra}" aria-hidden="true">${name}</span>`;

export async function mountDashboard({ role, active, title }) {
  const ctx = await requireRole(role);
  // requireRole redirects on mismatch; if we reach here we're allowed (or demo).

  const nav = ROLE_NAV[role] ?? [];
  const roleLabel = ROLE_LABEL[role] ?? '';
  const profile = ctx.profile;
  const displayName = profile?.full_name || (ctx.demo ? 'Demo User' : 'Account');
  const displayTitle = profile?.title || roleLabel;
  const initials = toInitials(displayName);
  const pageTitle = title || roleLabel;

  const navLinks = nav
    .map(
      (item) => `
      <a href="#${item.id}" data-nav="${item.id}"
         class="px-lg py-md flex items-center gap-md rounded-r-xl transition-all
                ${item.id === active
                  ? 'sidebar-active'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-white/5'}">
        ${ICON(item.icon)}
        <span class="font-label-md text-label-md">${item.label}</span>
      </a>`,
    )
    .join('');

  const mobileLinks = nav
    .slice(0, 4)
    .map(
      (item) => `
      <a href="#${item.id}" data-mnav="${item.id}" class="flex flex-col items-center justify-center gap-0.5
         ${item.id === active ? 'text-primary' : 'text-on-surface-variant'}">
        ${ICON(item.icon)}
        <span class="text-[10px] ${item.id === active ? 'font-bold' : ''}">${item.label}</span>
      </a>`,
    )
    .join('');

  // Viewport-locked shell (100vh): the page never scrolls — only <main> does.
  document.body.className = 'antialiased h-screen overflow-hidden';
  document.body.innerHTML = `
    <!-- SIDEBAR -->
    <aside class="fixed left-0 top-0 h-screen w-64 glass-nav border-r border-white/5 flex flex-col z-40 hidden lg:flex">
      <div class="px-lg py-xl">
        <div class="flex items-center gap-sm">
          <span class="material-symbols-outlined is-filled text-primary text-[28px]">verified_user</span>
          <h1 class="font-headline-md text-headline-md font-bold text-primary tracking-tight">VitaSecure</h1>
        </div>
        <p class="font-label-md text-label-md text-on-surface-variant/60 mt-xs">Blockchain EHR · ${roleLabel}</p>
      </div>
      <nav class="flex-1 flex flex-col gap-xs pr-sm">${navLinks}</nav>
      <div class="px-lg py-lg mt-auto border-t border-white/5 flex flex-col gap-sm">
        <a href="#" class="flex items-center gap-md text-on-surface-variant hover:text-on-surface py-sm">
          ${ICON('help')}<span class="font-label-md text-label-md">Help</span>
        </a>
        <button id="logout-btn" class="flex items-center gap-md text-on-surface-variant hover:text-tampered py-sm w-full text-left">
          ${ICON('logout')}<span class="font-label-md text-label-md">Sign out</span>
        </button>
      </div>
    </aside>

    <!-- TOPBAR -->
    <header class="fixed top-0 right-0 left-0 lg:left-64 h-20 glass-nav border-b border-white/5 flex items-center justify-between px-lg z-30">
      <h2 class="font-headline-md text-[20px] font-bold lg:hidden">VitaSecure</h2>
      <div class="hidden lg:flex items-center gap-lg flex-1 max-w-md">
        <div class="relative w-full">
          ${ICON('search', 'absolute left-md top-1/2 -translate-y-1/2 text-on-surface-variant/50')}
          <input type="text" placeholder="Search…"
            class="w-full bg-surface-container-highest/30 border border-white/10 rounded-full pl-xl pr-md py-sm
                   font-body-sm text-body-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none" />
        </div>
      </div>
      <div class="flex items-center gap-lg ml-lg">
        <div id="chain-status" class="hidden md:flex flex-col items-end">
          <div class="flex items-center gap-xs">
            <span class="w-2 h-2 rounded-full bg-verified animate-pulse"></span>
            <span class="font-label-md text-label-md text-verified">Blockchain: Online</span>
          </div>
          <span class="text-[10px] text-on-surface-variant/60">Anchored ledger active</span>
        </div>
        <button class="relative w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/5 transition-colors">
          ${ICON('notifications')}
          <span class="absolute top-2 right-2 w-2 h-2 bg-tampered rounded-full"></span>
        </button>
        <div class="h-8 w-px bg-white/10"></div>
        <div class="flex items-center gap-md">
          <div class="w-10 h-10 rounded-full primary-gradient flex items-center justify-center font-bold text-on-primary-fixed border border-primary/30">${initials}</div>
          <div class="hidden sm:block">
            <p class="font-label-md text-label-md font-bold leading-tight">${escapeHtml(displayName)}</p>
            <p class="text-[10px] text-on-surface-variant uppercase tracking-wider">${escapeHtml(displayTitle)}</p>
          </div>
        </div>
      </div>
    </header>

    <!-- MAIN — the only scroll region (viewport-locked 100vh shell) -->
    <main id="dash-main" class="lg:ml-64 h-screen overflow-y-auto pt-24 px-lg pb-28 lg:pb-xl relative">
      <div class="fixed top-1/4 right-0 w-[40%] h-[40%] rounded-full bg-primary-container/10 floating-orb pointer-events-none"></div>
    </main>

    <!-- MOBILE NAV -->
    <footer class="fixed bottom-0 left-0 w-full z-50 flex lg:hidden justify-around items-center h-16 glass-nav border-t border-white/10 px-md">
      ${mobileLinks}
    </footer>

    <div id="toast" class="toast" role="status" aria-live="polite"></div>
  `;

  // Wire sign-out
  const logoutBtn = document.getElementById('logout-btn');
  logoutBtn?.addEventListener('click', async () => {
    if (!ctx.demo) await signOut();
    window.location.replace('../index.html');
  });

  document.title = `VitaSecure — ${pageTitle}`;

  const main = document.getElementById('dash-main');
  return { ...ctx, main, toast: makeToast() };
}

/* ---- small UI utilities shared by pages -------------------------------- */
function makeToast() {
  return (message, kind = 'ok', ms = 3200) => {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = message;
    el.className = `toast toast--${kind} is-visible`;
    setTimeout(() => { el.className = `toast toast--${kind}`; }, ms);
  };
}

function toInitials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || 'U';
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Move the active highlight to nav item `id` (sidebar + mobile bar) without
 * re-mounting the shell. Used by per-role hash routers.
 */
export function setActiveNav(id) {
  document.querySelectorAll('[data-nav]').forEach((a) => {
    const on = a.dataset.nav === id;
    a.classList.toggle('sidebar-active', on);
    a.classList.toggle('text-on-surface-variant', !on);
    a.classList.toggle('hover:text-on-surface', !on);
    a.classList.toggle('hover:bg-white/5', !on);
  });
  document.querySelectorAll('[data-mnav]').forEach((a) => {
    const on = a.dataset.mnav === id;
    a.classList.toggle('text-primary', on);
    a.classList.toggle('text-on-surface-variant', !on);
    const label = a.querySelector('span:last-child');
    if (label) label.classList.toggle('font-bold', on);
  });
}

/** Reusable integrity badge markup (FR-INT-4/5). */
export function integrityBadge(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'TAMPERED')
    return `<span class="status-badge status-badge--tampered">${ICON('gpp_bad', 'text-[12px]')} Tampered</span>`;
  if (s === 'PENDING' || s === 'PENDING-ANCHOR')
    return `<span class="status-badge status-badge--pending">${ICON('hourglass_top', 'text-[12px]')} Pending</span>`;
  return `<span class="status-badge status-badge--verified">${ICON('verified_user', 'text-[12px]')} Verified</span>`;
}
