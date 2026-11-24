// Общие элементы интерфейса: иконки, шторки, тосты, подтверждения.
import { esc } from './util.js';

const P = {
  home: '<path d="M3.5 10.5 12 3.5l8.5 7"/><path d="M5.5 9v11h4.5v-6h4v6h4.5V9"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8 14h2M12 14h2M8 17h2"/>',
  building: '<path d="M4 20.5V8.5l6-4 6 4v12"/><path d="M16 11h4v9.5M2.5 20.5h19"/><path d="M8 10.5h4M8 14h4M8 17.5h4"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
  spark: '<path d="M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7Z"/><path d="M19 15.5c.3 1.6 1 2.3 2.5 2.5-1.5.2-2.2.9-2.5 2.5-.3-1.6-1-2.3-2.5-2.5 1.5-.2 2.2-.9 2.5-2.5Z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  bell: '<path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Z"/><path d="M10 20a2.2 2.2 0 0 0 4 0"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  mic: '<rect x="9" y="3" width="6" height="11.5" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
  send: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  back: '<path d="m15 6-6 6 6 6"/>',
  phone: '<path d="M5 4h3.5l1.5 4-2 1.5a11 11 0 0 0 6.5 6.5l1.5-2 4 1.5V19a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>',
  trash: '<path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
  share: '<path d="M12 15V3.5M7.5 8 12 3.5 16.5 8"/><path d="M5 12v7.5h14V12"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4.5V11h-6.5"/>',
  camera: '<path d="M4 8h3l2-2.5h6L17 8h3v11.5H4Z"/><circle cx="12" cy="13.5" r="3.5"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h1M10.5 10h1M14.5 10h1M6.5 14h11"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="2"/>',
  doc: '<path d="M6 3.5h8l4 4v13H6Z"/><path d="M14 3.5v4h4M9 12h6M9 16h6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>',
  upload: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 19.5h14"/>',
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9Z"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
  handshake: '<path d="m3 12 4-4 3 1 3-2 4 1 4 4"/><path d="m7 13 3 3a1.5 1.5 0 0 0 2-2M11 15l2 2a1.5 1.5 0 0 0 2-2l-3-3M14 16l1 1a1.5 1.5 0 0 0 2-2l-2-2"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 8.5-8.5M16 7l2.5 2.5M14 9l2 2"/>',
  task: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
};
export function icon(name, cls = '') {
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" style="fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round">${P[name] || ''}</svg>`;
}
export const chev = () => `<svg class="chev" viewBox="0 0 8 13" aria-hidden="true" style="fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><path d="m1.5 1.5 5 5-5 5"/></svg>`;

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ── Тосты ──
export function toast(text, { action, onAction, ms = 3200 } = {}) {
  const root = $('#toast-root');
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span>${esc(text)}</span>${action ? `<button>${esc(action)}</button>` : ''}`;
  root.append(el);
  const close = () => el.remove();
  if (action) el.querySelector('button').onclick = () => { close(); onAction?.(); };
  setTimeout(close, ms);
}

// ── Шторка (bottom sheet / модальное окно) ──
export function sheet({ title = '', body = '', done, doneText = 'Готово', cancelText = 'Отмена', onMount, wide = false }) {
  return new Promise(resolve => {
    const root = $('#sheet-root');
    const bd = document.createElement('div');
    bd.className = 'sheet-backdrop';
    bd.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}" ${wide ? 'style="max-width:820px"' : ''}>
      <div class="sheet-grabber"></div>
      <div class="sheet-head">
        <button class="btn plain" data-x>${esc(cancelText)}</button>
        <h2>${esc(title)}</h2>
        ${done ? `<button class="btn plain strong" data-ok>${esc(doneText)}</button>` : '<span style="min-width:76px"></span>'}
      </div>
      <div class="sheet-body"></div>
    </div>`;
    const body$ = bd.querySelector('.sheet-body');
    if (typeof body === 'string') body$.innerHTML = body; else body$.append(body);
    root.append(bd);
    document.body.style.overflow = 'hidden';
    const close = val => { bd.remove(); if (!$('#sheet-root').children.length) document.body.style.overflow = ''; resolve(val); };
    bd.addEventListener('click', e => { if (e.target === bd) close(null); });
    bd.querySelector('[data-x]').onclick = () => close(null);
    const ok = bd.querySelector('[data-ok]');
    if (ok) ok.onclick = async () => {
      try {
        const r = await done(body$);
        if (r !== false) close(r ?? true);
      } catch (e) { toast(e.message || 'Ошибка'); }
    };
    const onKey = e => { if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); close(null); } };
    document.addEventListener('keydown', onKey);
    onMount?.(body$, close);
    setTimeout(() => body$.querySelector('[autofocus]')?.focus(), 250);
  });
}

export function confirmSheet(text, { ok = 'Удалить', danger = true } = {}) {
  return sheet({
    title: 'Подтвердите',
    body: `<p style="margin:4px 4px 18px;font-size:16px">${esc(text)}</p><button class="btn block ${danger ? 'dark' : ''}" data-yes>${esc(ok)}</button>`,
    onMount: (b, close) => { b.querySelector('[data-yes]').onclick = () => close(true); },
  });
}

export function formData(root) {
  const o = {};
  root.querySelectorAll('[name]').forEach(el => {
    if (el.type === 'checkbox') o[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
    else o[el.name] = el.value.trim();
  });
  return o;
}

export function segmented(name, options, value) {
  return `<div class="seg" data-seg="${name}">${options.map(([v, l]) => `<button type="button" data-v="${esc(v)}" class="${v === value ? 'on' : ''}">${esc(l)}</button>`).join('')}<input type="hidden" name="${name}" value="${esc(value)}"></div>`;
}
export function bindSegmented(root, onChange) {
  root.querySelectorAll('[data-seg]').forEach(seg => {
    seg.addEventListener('click', e => {
      const b = e.target.closest('button[data-v]');
      if (!b) return;
      seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      seg.querySelector('input').value = b.dataset.v;
      onChange?.(seg.dataset.seg, b.dataset.v);
    });
  });
}

export function download(filename, content, type = 'application/json') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export async function shareText(title, text) {
  if (navigator.share) {
    try { await navigator.share({ title, text }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  await navigator.clipboard.writeText(text);
  toast('Скопировано в буфер обмена');
}
