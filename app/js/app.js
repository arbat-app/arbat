// Точка входа: навигация, блокировка PIN-кодом, голосовой режим, фоновые проверки.
import { db, settings, setSetting, onChange } from './db.js';
import { icon, $, $$, toast } from './ui.js';
import { tick } from './notify.js';
import { handle, addChat, applyUndo } from './assistant.js';
import { listen, speak, stopSpeaking } from './speech.js';
import { debounce, esc } from './util.js';
import { maybeRefreshToken } from './ig.js';
import { initWake, pauseWake, resumeWake } from './wake.js';

const ROUTES = {
  home: { title: 'Главная', icon: 'home', tab: true, load: () => import('./views/home.js') },
  calendar: { title: 'Ежедневник', icon: 'calendar', tab: true, load: () => import('./views/calendar.js') },
  krisha: { title: 'Krisha', icon: 'building', tab: true, load: () => import('./views/krisha.js') },
  instagram: { title: 'Instagram', icon: 'chart', tab: true, load: () => import('./views/instagram.js') },
  assistant: { title: 'Джарвис', icon: 'spark', tab: true, load: () => import('./views/assistant.js') },
  notifications: { title: 'Уведомления', icon: 'bell', load: () => import('./views/notifications.js') },
  settings: { title: 'Настройки', icon: 'gear', load: () => import('./views/settings.js') },
  import: { title: 'Импорт', icon: 'download', hidden: true, load: () => import('./views/krisha.js') },
};

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = h.split('?');
  const params = Object.fromEntries(new URLSearchParams(query));
  return { name: ROUTES[path] ? path : 'home', params };
}

let current = { name: null, cleanup: null, mod: null };
async function render() {
  const { name, params } = parseHash();
  const route = ROUTES[name];
  const view = $('#view');
  if (current.cleanup) { try { current.cleanup(); } catch (e) { /* noop */ } }
  document.body.className = `page-${name}`;
  updateNav(name);
  const mod = await route.load();
  current = { name, mod, cleanup: null, params };
  view.innerHTML = '';
  try {
    current.cleanup = await (name === 'import' ? mod.renderImport(view, params) : mod.render(view, params)) || null;
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="empty"><b>Не удалось открыть раздел</b>${esc(e.message)}</div>`;
  }
  if (!params.keepScroll) window.scrollTo(0, 0);
  document.title = `${route.title} · Арбат`;
}
export const go = hash => { if (location.hash === hash) render(); else location.hash = hash; };
window.addEventListener('hashchange', render);

// Живое обновление открытого раздела при изменении данных
const rerender = debounce(async store => {
  if (!current.mod?.refresh) return;
  try { await current.mod.refresh(store); } catch (e) { console.error(e); }
}, 120);
onChange(store => { rerender(store); updateBadges(); });

function buildNav() {
  const tabs = Object.entries(ROUTES).filter(([, r]) => r.tab);
  $('#nav-tab').innerHTML = tabs.map(([k, r]) => `<a class="tab" href="#/${k}" data-r="${k}">${icon(r.icon)}<span>${r.title}</span></a>`).join('');
}
function updateNav(name) {
  $$('.tab[data-r]').forEach(t => t.classList.toggle('active', t.dataset.r === name || (name === 'import' && t.dataset.r === 'krisha')));
}
async function updateBadges() {
  const [notes, listings] = await Promise.all([db.all('notifications'), db.all('listings')]);
  const unread = notes.filter(n => !n.read).length;
  const fresh = listings.filter(l => !l.seen && !l.hidden).length;
  setBadge('notifications', unread);
  setBadge('krisha', fresh);
  if ('setAppBadge' in navigator) { try { unread ? navigator.setAppBadge(unread) : navigator.clearAppBadge(); } catch (e) { /* noop */ } }
}
function setBadge(route, n) {
  $$(`.tab[data-r="${route}"]`).forEach(t => {
    let d = t.querySelector('.dot');
    if (!n) { d?.remove(); return; }
    if (!d) { d = document.createElement('span'); d.className = 'dot'; t.append(d); }
    d.textContent = n > 99 ? '99+' : n;
  });
}

// ── Тема ──
// Две темы: светлая и тёмная. При первом запуске берём тему системы и запоминаем.
export async function applyTheme() {
  const s = await settings();
  let theme = s.theme;
  if (theme !== 'light' && theme !== 'dark') {
    theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    await setSetting('theme', theme);
  }
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name=theme-color]:not([media])')?.remove();
  const m = document.createElement('meta');
  m.name = 'theme-color'; m.content = theme === 'dark' ? '#000000' : '#f4f4f1';
  document.head.append(m);
}
export async function toggleTheme() {
  const s = await settings();
  await setSetting('theme', s.theme === 'dark' ? 'light' : 'dark');
  await applyTheme();
}

// ── Голосовой режим в стиле JARVIS ──
export function openVoice({ autoListen = true, greet = false, command = '', byWake = false } = {}) {
  if ($('.voice')) return;
  pauseWake();
  const el = document.createElement('div');
  el.className = 'voice';
  el.innerHTML = `
    <div class="voice-name">J.A.R.V.I.S.</div>
    <div class="voice-state">Слушаю</div>
    <div class="orb"></div>
    <div class="voice-text">Слушаю вас. Расскажите о планах — я разложу всё по расписанию</div>
    <div class="voice-reply"></div>
    <div class="btn-row">
      <button class="btn gray" data-close>Закрыть</button>
      <button class="btn" data-main>Готово</button>
    </div>
    <div class="btn-row" data-extra hidden>
      <button class="btn gray" data-undo>Отменить</button>
      <button class="btn gray" data-open>Открыть чат</button>
    </div>`;
  document.body.append(el);
  const state = $('.voice-state', el), text = $('.voice-text', el), reply = $('.voice-reply', el), orb = $('.orb', el);
  const main = $('[data-main]', el);
  let session = null, lastUndo = null, mode = 'idle', idleTimer = null;
  const close = () => { clearTimeout(idleTimer); session?.cancel(); stopSpeaking(); el.remove(); resumeWake(); };
  const setMode = m => {
    mode = m;
    orb.classList.toggle('idle', m !== 'listening');
    state.textContent = { listening: 'Слушаю', thinking: 'Анализирую', speaking: 'Отвечаю', idle: 'В режиме ожидания' }[m];
    main.textContent = m === 'listening' ? 'Готово' : 'Говорить';
    clearTimeout(idleTimer);
    // При вызове словом «Помощник» окно закрывается само и снова ждёт слова
    if (m === 'idle' && byWake) idleTimer = setTimeout(close, 6000);
  };
  const process = async t => {
    text.textContent = t;
    setMode('thinking');
    await addChat('me', t, { voice: true });
    const res = await handle(t);
    lastUndo = res.undo?.length ? res.undo : null;
    await addChat('ai', res.reply, { undo: lastUndo });
    reply.textContent = res.reply;
    $('[data-extra]', el).hidden = false;
    $('[data-undo]', el).hidden = !lastUndo;
    const s = await settings();
    if (s.voiceReplies) { setMode('speaking'); speak(res.reply, { onEnd: () => mode === 'speaking' && setMode('idle') }); } else setMode('idle');
  };
  const start = () => {
    stopSpeaking();
    reply.textContent = '';
    text.textContent = 'Говорите…';
    setMode('listening');
    session = listen({
      onPartial: t => { text.textContent = t; },
      onLevel: v => { orb.style.transform = `scale(${1 + v * 0.18})`; },
      onFinal: process,
      onError: msg => { reply.textContent = msg; },
      onEnd: () => { orb.style.transform = ''; if (mode === 'listening') setMode('idle'); session = null; },
    });
  };
  main.onclick = () => { clearTimeout(idleTimer); if (mode === 'listening') session?.stop(); else start(); };
  $('[data-close]', el).onclick = close;
  $('[data-undo]', el).onclick = async () => { clearTimeout(idleTimer); if (lastUndo) { await applyUndo(lastUndo); lastUndo = null; $('[data-undo]', el).hidden = true; reply.textContent = 'Отменил последние изменения.'; await addChat('ai', 'Отменил последние изменения.'); } };
  $('[data-open]', el).onclick = () => { close(); go('#/assistant'); };
  if (command) { process(command); return; }
  if (greet) {
    setMode('speaking');
    text.textContent = 'Да, я вас слушаю';
    speak('Да, я вас слушаю.', { onEnd: () => { if (mode === 'speaking') start(); } });
    return;
  }
  if (autoListen) start(); else setMode('idle');
}
document.addEventListener('click', e => { if (e.target.closest('[data-voice]')) openVoice(); });

// ── PIN-код ──
async function pbkdf2(pin, saltB64) {
  const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 210000, hash: 'SHA-256' }, key, 256);
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}
export async function hashPin(pin) {
  const salt = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
  return { salt, hash: await pbkdf2(pin, salt) };
}
async function lockScreen() {
  const s = await settings();
  if (!s.pinHash) return;
  const lock = $('#lock');
  lock.hidden = false;
  let pin = '';
  lock.innerHTML = `<div class="large-title" style="font-size:24px">Введите код</div><div class="pin-dots">${'<i></i>'.repeat(4)}</div>
    <div class="pin-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map(k => k === '' ? '<span></span>' : `<button data-k="${k}">${k}</button>`).join('')}</div>`;
  const dots = () => $$('.pin-dots i', lock).forEach((d, i) => d.classList.toggle('on', i < pin.length));
  return new Promise(resolve => {
    const press = async k => {
      if (k === '⌫') pin = pin.slice(0, -1); else if (pin.length < 4) pin += k;
      dots();
      if (pin.length === 4) {
        if (await pbkdf2(pin, s.pinSalt) === s.pinHash) { lock.hidden = true; lock.innerHTML = ''; document.removeEventListener('keydown', onKey); resolve(); }
        else { const d = $('.pin-dots', lock); d.classList.add('shake'); setTimeout(() => d.classList.remove('shake'), 400); pin = ''; dots(); }
      }
    };
    lock.onclick = e => { const b = e.target.closest('[data-k]'); if (b) press(b.dataset.k); };
    const onKey = e => { if (/^\d$/.test(e.key)) press(e.key); if (e.key === 'Backspace') press('⌫'); };
    document.addEventListener('keydown', onKey);
  });
}
let hiddenAt = 0;
document.addEventListener('visibilitychange', async () => {
  if (document.hidden) hiddenAt = Date.now();
  else {
    if (hiddenAt && Date.now() - hiddenAt > 5 * 60000) await lockScreen();
    tick().catch(console.error);
  }
});

// ── Запуск ──
async function boot() {
  buildNav();
  await applyTheme();
  await lockScreen();
  if (!location.hash) history.replaceState(null, '', '#/home');
  await render();
  updateBadges();
  tick().catch(console.error);
  setInterval(() => tick().catch(console.error), 30000);
  maybeRefreshToken().catch(() => {});
  initWake(command => openVoice({ greet: !command, command, byWake: true })).catch(console.error);
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW', e));
    navigator.serviceWorker.addEventListener('message', e => { if (e.data?.link) go(e.data.link); });
  }
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
}
boot().catch(e => { console.error(e); toast('Ошибка запуска: ' + e.message); });
