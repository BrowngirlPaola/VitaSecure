/* widgets.js — reusable dashboard UI fragments (Aura EHR / Stitch language).
 * Pure functions returning HTML strings; pages compose them into ctx.main.
 */
import { escapeHtml } from './layout.js';

const ICON = (name, extra = '') =>
  `<span class="material-symbols-outlined ${extra}" aria-hidden="true">${name}</span>`;

export function greeting(name, subtitle) {
  return `
    <div class="mb-xl animate-fade-up">
      <h2 class="font-headline-lg text-headline-lg font-bold">${escapeHtml(name)}</h2>
      <p class="text-on-surface-variant font-body-md mt-xs">${escapeHtml(subtitle)}</p>
    </div>`;
}

/** stats: [{label, value, icon, tone}] tone ∈ primary|secondary|tertiary|verified */
export function statCards(stats) {
  const tone = {
    primary: 'bg-primary-container/20 text-primary',
    secondary: 'bg-secondary-container/20 text-secondary',
    tertiary: 'bg-tertiary-container/20 text-tertiary',
    verified: 'bg-verified/10 text-verified',
  };
  return `<div class="grid grid-cols-2 lg:grid-cols-4 gap-lg mb-xl">${stats
    .map(
      (s) => `
      <div class="glass-card p-lg animate-fade-up">
        <div class="flex items-center justify-between">
          <p class="card__title font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">${escapeHtml(s.label)}</p>
          <div class="w-9 h-9 rounded-xl flex items-center justify-center ${tone[s.tone] || tone.primary}">${ICON(s.icon, 'text-[20px]')}</div>
        </div>
        <p class="font-headline-lg text-[28px] font-bold mt-sm">${escapeHtml(String(s.value))}</p>
      </div>`,
    )
    .join('')}</div>`;
}

/** actions: [{id, label, desc, icon, tone}] */
export function quickActions(actions) {
  const tone = {
    primary: 'bg-primary-container/20 text-primary group-hover:bg-primary group-hover:text-white',
    tertiary: 'bg-tertiary-container/20 text-tertiary group-hover:bg-tertiary group-hover:text-black',
    secondary: 'bg-secondary-container/20 text-secondary group-hover:bg-secondary group-hover:text-black',
  };
  return `<div class="grid grid-cols-1 md:grid-cols-3 gap-lg mb-xl">${actions
    .map(
      (a) => `
      <button data-action="${a.id}" class="glass-card p-lg text-left group hover:scale-[1.02] transition-transform flex items-center gap-lg">
        <div class="w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${tone[a.tone] || tone.primary}">${ICON(a.icon, 'text-[30px]')}</div>
        <div>
          <h3 class="font-headline-md text-[18px] font-bold">${escapeHtml(a.label)}</h3>
          <p class="text-on-surface-variant text-body-sm">${escapeHtml(a.desc)}</p>
        </div>
      </button>`,
    )
    .join('')}</div>`;
}

/** A glass panel with a header (title + optional action button) and body html. */
export function panel({ title, action = '', body, span = '' }) {
  return `
    <div class="glass-card overflow-hidden ${span}">
      <div class="p-lg border-b border-white/5 flex items-center justify-between">
        <h3 class="font-headline-md text-[20px] font-bold">${escapeHtml(title)}</h3>
        ${action}
      </div>
      <div>${body}</div>
    </div>`;
}

/** headers: [string]; rows: array of cell-array; rows already escaped/HTML. */
export function table(headers, rows) {
  return `
    <div class="overflow-x-auto">
      <table class="w-full text-left">
        <thead class="bg-white/5 font-label-md text-label-md text-on-surface-variant">
          <tr>${headers.map((h) => `<th class="px-lg py-md font-medium">${h}</th>`).join('')}</tr>
        </thead>
        <tbody class="divide-y divide-white/5 font-body-sm text-body-sm">
          ${rows.map((cells) => `<tr class="hover:bg-white/5 transition-colors">${cells.map((c) => `<td class="px-lg py-md">${c}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

export function avatarCell(name, tone = 'primary') {
  const map = { primary: 'bg-primary/20 text-primary', secondary: 'bg-secondary/20 text-secondary', tertiary: 'bg-tertiary/20 text-tertiary' };
  const initials = String(name).split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
  return `<div class="flex items-center gap-md"><div class="w-8 h-8 rounded-full ${map[tone]} flex items-center justify-center font-bold text-xs">${initials}</div><span>${escapeHtml(name)}</span></div>`;
}

export function linkBtn(label, attr = '') {
  return `<button ${attr} class="text-primary font-label-md text-label-md hover:underline">${escapeHtml(label)}</button>`;
}

/** A note banner explaining backend-pending state for the shell. */
export function pendingNote(text) {
  return `<div class="glass-card p-lg flex items-start gap-md mt-lg">
      ${ICON('info', 'text-primary')}
      <p class="text-on-surface-variant text-body-sm">${escapeHtml(text)}</p>
    </div>`;
}

/** Page-section header: title + subtitle on the left, optional action HTML right. */
export function sectionHeader({ title, subtitle = '', actions = '' }) {
  return `
    <div class="mb-xl flex flex-col sm:flex-row sm:items-end sm:justify-between gap-md animate-fade-up">
      <div>
        <h2 class="font-headline-lg text-headline-lg font-bold">${escapeHtml(title)}</h2>
        ${subtitle ? `<p class="text-on-surface-variant font-body-md mt-xs">${escapeHtml(subtitle)}</p>` : ''}
      </div>
      ${actions ? `<div class="flex items-center gap-sm shrink-0">${actions}</div>` : ''}
    </div>`;
}

/** Gradient primary button (design-system: 12px radius, purple→lavender). */
export function primaryBtn(label, { icon = '', attr = '' } = {}) {
  return `<button ${attr} class="gradient-button text-on-primary-fixed rounded-xl px-lg py-sm font-label-md text-label-md uppercase tracking-wider flex items-center gap-sm">
      ${icon ? ICON(icon, 'text-[18px]') : ''}<span>${escapeHtml(label)}</span>
    </button>`;
}

/** Ghost / secondary button (primary border, glass fill on hover). */
export function ghostBtn(label, { icon = '', attr = '' } = {}) {
  return `<button ${attr} class="rounded-xl px-lg py-sm font-label-md text-label-md uppercase tracking-wider flex items-center gap-sm border border-primary/40 text-primary hover:bg-primary/10 transition-colors">
      ${icon ? ICON(icon, 'text-[18px]') : ''}<span>${escapeHtml(label)}</span>
    </button>`;
}

/** A search box matching the topbar style; emits input events for the page. */
export function searchInput(placeholder, attr = '') {
  return `<div class="relative w-full max-w-md">
      ${ICON('search', 'absolute left-md top-1/2 -translate-y-1/2 text-on-surface-variant/50 text-[20px]')}
      <input ${attr} type="text" placeholder="${escapeHtml(placeholder)}"
        class="w-full bg-surface-container-highest/30 border border-white/10 rounded-full pl-xl pr-md py-sm font-body-sm text-body-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none" />
    </div>`;
}

/** Generic pill badge. tone ∈ primary|secondary|tertiary|neutral|error|verified */
export function badge(text, tone = 'neutral') {
  const map = {
    primary: 'bg-primary/15 text-primary border-primary/30',
    secondary: 'bg-secondary/15 text-secondary border-secondary/30',
    tertiary: 'bg-tertiary/15 text-tertiary border-tertiary/30',
    neutral: 'bg-white/5 text-on-surface-variant border-white/10',
    error: 'bg-error-container/30 text-error border-error/30',
    verified: 'bg-verified/10 text-verified border-verified/30',
  };
  return `<span class="inline-flex items-center gap-xs px-sm py-xs rounded-full border font-bold text-[10px] uppercase tracking-widest ${map[tone] || map.neutral}">${escapeHtml(text)}</span>`;
}

/** Empty-state placeholder inside a panel. */
export function emptyState(icon, title, sub = '') {
  return `<div class="p-xl flex flex-col items-center text-center gap-sm text-on-surface-variant">
      <div class="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">${ICON(icon, 'text-[28px] text-primary')}</div>
      <p class="font-headline-md text-[18px] font-bold text-on-surface">${escapeHtml(title)}</p>
      ${sub ? `<p class="text-body-sm max-w-sm">${escapeHtml(sub)}</p>` : ''}
    </div>`;
}

/** Labelled key/value row for detail panels. */
export function kv(label, valueHtml) {
  return `<div class="flex items-start justify-between gap-md py-sm border-b border-white/5 last:border-0">
      <span class="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant shrink-0">${escapeHtml(label)}</span>
      <span class="font-body-sm text-body-sm text-on-surface text-right">${valueHtml}</span>
    </div>`;
}

/** Compact metric/vital tile (label · big value · unit). */
export function tile(label, value, unit = '') {
  return `<div class="p-md rounded-xl bg-white/5 border border-white/10">
      <p class="text-[10px] uppercase tracking-wider text-on-surface-variant">${escapeHtml(label)}</p>
      <p class="font-headline-md text-[20px] font-bold mt-xs">${escapeHtml(String(value))} ${unit ? `<span class="text-body-sm font-normal text-on-surface-variant">${escapeHtml(unit)}</span>` : ''}</p>
    </div>`;
}

/** A labelled toggle row (switch). `id` lets pages wire the change event. */
export function toggleRow({ id, label, desc = '', checked = false }) {
  return `<label class="flex items-center justify-between gap-md p-md rounded-xl bg-white/5 border border-white/10 cursor-pointer">
      <span>
        <span class="font-body-sm text-body-sm font-medium block">${escapeHtml(label)}</span>
        ${desc ? `<span class="text-[11px] text-on-surface-variant">${escapeHtml(desc)}</span>` : ''}
      </span>
      <input id="${id}" type="checkbox" ${checked ? 'checked' : ''} class="w-5 h-5 rounded border-white/10 bg-white/5 text-primary-container focus:ring-primary shrink-0" />
    </label>`;
}

/** Horizontal progress meter (overview metrics). tone ∈ primary|verified */
export function meter(label, value, pct, tone = 'primary') {
  const bar = tone === 'verified' ? 'bg-verified' : 'bg-primary';
  const glow = tone === 'verified' ? 'rgba(16,185,129,0.5)' : 'rgba(124,58,237,0.5)';
  return `<div>
      <div class="flex justify-between items-center mb-xs">
        <span class="text-body-sm text-on-surface-variant">${escapeHtml(label)}</span>
        <span class="${tone === 'verified' ? 'text-verified' : 'text-primary'} font-bold text-body-sm">${escapeHtml(value)}</span>
      </div>
      <div class="w-full h-2 bg-white/5 rounded-full overflow-hidden">
        <div class="h-full ${bar}" style="width:${pct}%;box-shadow:0 0 10px ${glow}"></div>
      </div>
    </div>`;
}
