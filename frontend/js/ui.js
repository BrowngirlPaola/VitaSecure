/* ui.js — shared dashboard interaction layer for every role page.
 *
 * Holds the pieces that were proven on the doctor workspace and are identical
 * across roles: the hash router that swaps <main> per sidebar section, the
 * glass dialog (modal + drawer, design.md "Level 2" surface), and the form
 * field primitives. Pages supply their own section renderers + wiring.
 */
import { setActiveNav, escapeHtml } from './layout.js';
import { primaryBtn, ghostBtn } from './widgets.js';

/** Atmospheric orb re-drawn behind every section (main is re-rendered on route). */
export const ORB = `<div class="fixed top-1/4 right-0 w-[40%] h-[40%] rounded-full bg-primary-container/10 floating-orb pointer-events-none"></div>`;

/**
 * Wire a hash router for a dashboard.
 * @param {object}   o
 * @param {object}   o.ctx        dashboard context from mountDashboard()
 * @param {object}   o.sections   { id: () => htmlString } keyed by nav id
 * @param {string}  [o.defaultId] fallback section (default 'overview')
 * @param {function}[o.afterRender] called with the active id after each render
 * @returns {{ route: function, current: function }}
 */
export function mountRouter({ ctx, sections, defaultId = 'overview', afterRender }) {
  const ids = Object.keys(sections);
  const current = () => {
    const h = location.hash.replace('#', '');
    return ids.includes(h) ? h : defaultId;
  };
  function route() {
    const id = current();
    setActiveNav(id);
    ctx.main.scrollTop = 0;
    ctx.main.innerHTML = `${ORB}<div class="relative z-10 mx-auto max-w-7xl">${sections[id]()}</div>`;
    if (afterRender) afterRender(id);
  }
  window.addEventListener('hashchange', route);
  route();
  return { route, current };
}

/* =============================================================================
   Dialogs — glass modal / right drawer with overlay
   ========================================================================== */
export function openDialog({ kind = 'modal', title, subtitle = '', body, footer = '', onOpen }) {
  closeDialog();
  const wrap = document.createElement('div');
  wrap.className = 'overlay';
  wrap.id = 'dialog';
  const panelClass = kind === 'drawer' ? 'drawer-panel glass-modal' : 'modal-card glass-modal';
  wrap.innerHTML = `
    <div class="${panelClass} p-lg">
      <div class="flex items-start justify-between gap-md mb-lg">
        <div>
          <h3 class="font-headline-md text-[22px] font-bold">${title}</h3>
          ${subtitle ? `<p class="text-on-surface-variant text-body-sm mt-xs">${subtitle}</p>` : ''}
        </div>
        <button data-close class="w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center text-on-surface-variant shrink-0">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
      <div data-dialog-body>${body}</div>
      ${footer ? `<div class="mt-lg pt-lg border-t border-white/5 flex justify-end gap-sm">${footer}</div>` : ''}
    </div>`;
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('is-open'));
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) closeDialog(); });
  wrap.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeDialog));
  document.addEventListener('keydown', escClose);
  if (onOpen) onOpen(wrap);
  return wrap;
}
function escClose(e) { if (e.key === 'Escape') closeDialog(); }
export function closeDialog() {
  const d = document.getElementById('dialog');
  if (!d) return;
  d.classList.remove('is-open');
  document.removeEventListener('keydown', escClose);
  setTimeout(() => d.remove(), 250);
}

/** Modal with a <form> body and a standard Cancel / primary-submit footer. */
export function openFormDialog({ title, subtitle = '', body, submitLabel, submitIcon = 'verified_user', onSubmit, onOpen }) {
  return openDialog({
    kind: 'modal',
    title,
    subtitle,
    body: `<form data-form>${body}</form>`,
    footer: `${ghostBtn('Cancel', { attr: 'data-close' })}${primaryBtn(submitLabel, { icon: submitIcon, attr: 'data-submit' })}`,
    onOpen: (wrap) => {
      const fire = (e) => { e.preventDefault(); onSubmit(wrap); };
      wrap.querySelector('[data-submit]')?.addEventListener('click', fire);
      wrap.querySelector('[data-form]')?.addEventListener('submit', fire);
      if (onOpen) onOpen(wrap);
    },
  });
}

/* =============================================================================
   Form field primitives (design.md inputs: 12px radius, white/10 border, glow)
   ========================================================================== */
export function field(label, inner) {
  return `<div class="mb-md"><label class="field-label">${escapeHtml(label)}</label>${inner}</div>`;
}
export function textInput(name, { value = '', placeholder = '', type = 'text' } = {}) {
  return `<input name="${name}" type="${type}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" class="field-input" />`;
}
export function textArea(name, { value = '', placeholder = '' } = {}) {
  return `<textarea name="${name}" class="field-input" placeholder="${escapeHtml(placeholder)}">${escapeHtml(value)}</textarea>`;
}
export function optionSelect(name, values, selected = '') {
  return `<select name="${name}" class="field-input">${values
    .map((v) => `<option ${v === selected ? 'selected' : ''}>${escapeHtml(v)}</option>`)
    .join('')}</select>`;
}
