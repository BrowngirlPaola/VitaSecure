/* pages/landing.js — public landing page (index.html).
 *
 * Pure presentation glue: mobile menu, scroll-reveal, footer year, and a
 * session-aware CTA. If a Supabase session already exists, the "Login /
 * Get Started" buttons are swapped for an "Open dashboard" link routed to the
 * user's role home. No clinical data is touched here.
 */

import { isConfigured } from '../config.js';
import { getSession, currentRole } from '../auth.js';
import { homeForRole, ROLE_LABEL } from '../roles.js';

/* ---- Mobile menu -------------------------------------------------------- */
const menuToggle = document.getElementById('menu-toggle');
const mobileMenu = document.getElementById('mobile-menu');

menuToggle?.addEventListener('click', () => {
  const open = mobileMenu.classList.toggle('hidden') === false;
  menuToggle.setAttribute('aria-expanded', String(open));
  menuToggle.firstElementChild.textContent = open ? 'close' : 'menu';
});

// Close the mobile menu after tapping a link.
mobileMenu?.querySelectorAll('a').forEach((a) =>
  a.addEventListener('click', () => {
    mobileMenu.classList.add('hidden');
    menuToggle?.setAttribute('aria-expanded', 'false');
    if (menuToggle) menuToggle.firstElementChild.textContent = 'menu';
  }),
);

/* ---- Footer year -------------------------------------------------------- */
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = String(new Date().getFullYear());

/* ---- Scroll reveal ------------------------------------------------------ */
function wireReveal() {
  const items = document.querySelectorAll('.reveal');
  if (!items.length) return;
  if (!('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-visible'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
  );
  items.forEach((el) => io.observe(el));
}

/* ---- Session-aware CTA -------------------------------------------------- */
function dashboardLink(role, { full = false } = {}) {
  const label = ROLE_LABEL[role] ? `Open ${ROLE_LABEL[role]} dashboard` : 'Open dashboard';
  const a = document.createElement('a');
  a.href = homeForRole(role);
  a.className =
    `btn-gradient text-on-primary px-lg py-sm rounded-xl font-label-md text-label-md ` +
    `flex items-center justify-center gap-xs ${full ? 'text-center' : ''}`;
  a.innerHTML = `<span class="material-symbols-outlined text-[18px]">space_dashboard</span> ${label}`;
  return a;
}

async function wireSessionCta() {
  if (!isConfigured) return; // demo shell: keep Login / Get Started
  const session = await getSession();
  if (!session) return;
  const role = await currentRole();

  const desktop = document.getElementById('nav-cta');
  if (desktop) {
    const status = desktop.querySelector('div'); // keep the "Blockchain: Online" pill
    desktop.innerHTML = '';
    if (status) desktop.appendChild(status);
    desktop.appendChild(dashboardLink(role));
  }

  const mobile = document.getElementById('nav-cta-mobile');
  if (mobile) {
    mobile.innerHTML = '';
    mobile.appendChild(dashboardLink(role, { full: true }));
  }

  // Hero + final CTAs → single "Open dashboard" button.
  document.querySelectorAll('#hero-cta').forEach((el) => {
    el.innerHTML = '';
    el.appendChild(dashboardLink(role));
  });
}

wireReveal();
wireSessionCta();
