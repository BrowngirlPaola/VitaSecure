/* guard.js — client-side role gate (Directives §4.4.3).
 *
 * UX convenience ONLY — the weakest of the three enforcement points and NOT
 * authoritative: RLS gates the DB and the on-chain RBAC contract makes the
 * authoritative permit/deny. guard.js just keeps users out of pages their role
 * shouldn't see and redirects them home.
 */

import { getSession, currentRole, currentProfile } from './auth.js';
import { homeForRole } from './roles.js';
import { isConfigured } from './config.js';

/**
 * Protect a dashboard page. Call at the top of each page's controller with the
 * role that page belongs to.
 *
 * @param {string} requiredRole one of ROLES.*
 * @returns {Promise<{role, user, profile, demo}>}
 */
export async function requireRole(requiredRole) {
  // Demo shell (no keys): render the page so the UI is reviewable, no redirect.
  if (!isConfigured) {
    return { role: requiredRole, user: null, profile: null, demo: true };
  }

  const session = await getSession();
  if (!session) {
    redirect('../login.html');
    return { role: null, user: null, profile: null, demo: false };
  }

  const [role, profile] = await Promise.all([currentRole(), currentProfile()]);

  if (role !== requiredRole) {
    redirect(`../${homeForRole(role)}`);
    return { role, user: session.user, profile, demo: false };
  }

  return { role, user: session.user, profile, demo: false };
}

function redirect(href) {
  window.location.replace(href);
}
