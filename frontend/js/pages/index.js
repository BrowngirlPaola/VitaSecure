/* pages/index.js — sign-in / sign-up controller (Supabase Auth).
 *
 * Restyled to the Stitch "Secure Sign In" layout. Toggles between sign-in and
 * sign-up, submits via auth.js, and routes the user to their role dashboard on
 * success. In demo mode (no keys), shows role shortcuts so the UI is reviewable.
 */

import { isConfigured } from '../config.js';
import { signIn, signUp, getSession, currentRole } from '../auth.js';
import { homeForRole, ROLE_HOME, ROLE_LABEL } from '../roles.js';

const form = document.getElementById('auth-form');
const title = document.getElementById('auth-title');
const subtitle = document.getElementById('auth-subtitle');
const submitBtn = document.getElementById('submit-btn');
const submitLabel = document.getElementById('submit-label');
const submitIcon = document.getElementById('submit-icon');
const switchBtn = document.getElementById('switch-mode');
const switchPrompt = document.getElementById('switch-prompt');
const nameField = document.getElementById('name-field');
const roleField = document.getElementById('role-field');
const forgotLink = document.getElementById('forgot-link');
const passInput = document.getElementById('password-field');
const togglePass = document.getElementById('toggle-pass');

let mode = 'signin'; // | 'signup'

function applyMode() {
  const signup = mode === 'signup';
  title.textContent = signup ? 'Create Account' : 'Clinician Login';
  subtitle.textContent = signup
    ? 'Register for access to the healthcare blockchain network.'
    : 'Access the healthcare blockchain network.';
  submitLabel.textContent = signup ? 'Register Secure Account' : 'Login with Node';
  submitIcon.textContent = signup ? 'how_to_reg' : 'key';
  switchPrompt.textContent = signup ? 'Already registered?' : 'New to VitaSecure?';
  switchBtn.textContent = signup ? 'Sign in' : 'Create account';
  nameField.classList.toggle('hidden', !signup);
  roleField.classList.toggle('hidden', !signup);
  forgotLink?.classList.toggle('hidden', signup);
  passInput.setAttribute('autocomplete', signup ? 'new-password' : 'current-password');
}

switchBtn.addEventListener('click', () => {
  mode = mode === 'signin' ? 'signup' : 'signin';
  applyMode();
});

togglePass.addEventListener('click', () => {
  const showing = passInput.type === 'text';
  passInput.type = showing ? 'password' : 'text';
  togglePass.firstElementChild.textContent = showing ? 'visibility' : 'visibility_off';
});

forgotLink?.addEventListener('click', (e) => {
  e.preventDefault();
  toast('Password reset arrives with the Increment 1 backend.', 'ok');
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!isConfigured) {
    toast('Demo shell — set Supabase keys to enable live auth.', 'error');
    return;
  }
  const fd = new FormData(form);
  const email = fd.get('email')?.trim();
  const password = fd.get('password');
  setLoading(true);
  try {
    if (mode === 'signup') {
      await signUp(email, password, {
        full_name: fd.get('full_name')?.trim() || '',
        requested_role: fd.get('role') || 'PATIENT',
      });
      toast('Account created. Check your email to confirm, then sign in.', 'ok');
      mode = 'signin';
      applyMode();
    } else {
      await signIn(email, password);
      await routeByRole();
    }
  } catch (err) {
    toast(friendlyError(err), 'error');
  } finally {
    setLoading(false);
  }
});

async function routeByRole() {
  const role = await currentRole();
  window.location.replace(homeForRole(role));
}

function setLoading(on) {
  submitBtn.disabled = on;
  submitBtn.style.opacity = on ? '0.8' : '1';
  submitIcon.textContent = on ? 'sync' : (mode === 'signup' ? 'how_to_reg' : 'key');
  submitIcon.classList.toggle('animate-spin', on);
  submitLabel.textContent = on
    ? 'Validating…'
    : (mode === 'signup' ? 'Register Secure Account' : 'Login with Node');
}

function friendlyError(err) {
  const m = (err?.message || '').toLowerCase();
  if (m.includes('invalid login')) return 'Incorrect email or password.';
  if (m.includes('already registered')) return 'That email is already registered.';
  if (m.includes('confirm')) return 'Please confirm your email before signing in.';
  return 'Something went wrong. Please try again.';
}

function toast(message, kind = 'ok', ms = 3600) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = `toast toast--${kind} is-visible`;
  setTimeout(() => { el.className = `toast toast--${kind}`; }, ms);
}

function renderDemoLinks() {
  const footer = switchBtn.closest('footer');
  const wrap = document.createElement('div');
  wrap.className = 'w-full mb-md';
  wrap.innerHTML = `<p class="font-label-md text-label-md text-outline mb-xs text-center">Demo shell — preview a dashboard:</p>`;
  const grid = document.createElement('div');
  grid.className = 'grid grid-cols-3 gap-sm';
  for (const [role, href] of Object.entries(ROLE_HOME)) {
    const a = document.createElement('a');
    a.href = href;
    a.textContent = ROLE_LABEL[role];
    a.className = 'text-center text-[11px] py-sm rounded-lg border border-white/10 hover:bg-white/5 text-on-surface-variant hover:text-on-surface transition-all';
    grid.appendChild(a);
  }
  wrap.appendChild(grid);
  footer.parentElement.insertBefore(wrap, footer);
}

/* Subtle mouse parallax on the branding artwork. */
function wireParallax() {
  const art = document.getElementById('brand-art');
  if (!art) return;
  window.addEventListener('mousemove', (e) => {
    const x = (window.innerWidth / 2 - e.pageX) / 60;
    const y = (window.innerHeight / 2 - e.pageY) / 60;
    art.style.transform = `scale(1.1) translate(${x}px, ${y}px)`;
  });
}

async function init() {
  applyMode();
  wireParallax();
  if (!isConfigured) {
    renderDemoLinks();
    return;
  }
  const session = await getSession();
  if (session) await routeByRole();
}

init();
