// Главный экран: план на сегодня, ближайшая встреча, Krisha, Instagram, задачи, уведомления.
import { db, settings } from '../db.js';
import { icon, chev, toast, sheet, shareText } from '../ui.js';
import { allEvents, onDate, TYPES, nextUpcoming, conflictsOf, setStatus, morningPlan, eveningReport } from '../events.js';
import { derived } from '../ig.js';
import { onWakeState } from '../wake.js';
import { openEventSheet } from './event-sheet.js';
import { esc, today, longDate, eventStart, untilText, timeAgo, compact, money, humanDate, isNum } from '../util.js';

let root, wakeUnsub;
export async function render(el) {
  root = el;
  await draw();
  const timer = setInterval(() => { const c = root.querySelector('[data-countdown]'); if (c) draw(); }, 60000);
  return () => { clearInterval(timer); wakeUnsub?.(); wakeUnsub = null; };
}
export const refresh = () => draw();

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер';
}

export function eventRow(e, all) {
  const conflict = conflictsOf(e, all).length;
  return `<div class="ev">
    <div class="ev-time">${e.start || '—'}${e.end ? `<small>${e.end}</small>` : ''}</div>
    <div class="ev-card t-${e.type} ${e.status}" role="button" tabindex="0" data-open="${e.id}">
      <span class="check ${e.status === 'done' ? 'on' : ''}" role="checkbox" aria-checked="${e.status === 'done'}" aria-label="Выполнено" data-check="${e.id}"></span>
      <div class="row-main">
        <div class="row-title">${esc(e.title)}</div>
        <div class="ev-meta">
          <span class="badge type">${TYPES[e.type].label}</span>
          ${e.priority === 'high' ? '<span class="badge danger">Важно</span>' : ''}
          ${e.status === 'canceled' ? '<span class="badge">Отменено</span>' : ''}
          ${(e.history || []).some(h => h.op === 'move') ? '<span class="badge warn">Перенесено</span>' : ''}
          ${e.location ? `<span class="caption">${esc(e.location)}</span>` : ''}
          ${e.client ? `<span class="caption">· ${esc(e.client)}</span>` : ''}
        </div>
        ${conflict ? '<div class="conflict">Пересечение по времени</div>' : ''}
      </div>
    </div>
  </div>`;
}

export function bindEventList(container, onDone) {
  container.addEventListener('click', async ev => {
    const ch = ev.target.closest('[data-check]');
    if (ch) {
      ev.stopPropagation();
      const e = await db.get('events', ch.dataset.check);
      if (!e) return;
      const next = e.status === 'done' ? 'planned' : 'done';
      await setStatus(e, next);
      if (next === 'done') toast(`Выполнено: ${e.title}`, { action: 'Отменить', onAction: () => setStatus(e, 'planned') });
      onDone?.();
      return;
    }
    const op = ev.target.closest('[data-open]');
    if (op) { const e = await db.get('events', op.dataset.open); if (e) openEventSheet(e); }
  });
}

async function draw() {
  const [s, all, listings, reports, reels, notes] = await Promise.all([
    settings(), allEvents(), db.all('listings'), db.all('reports'), db.all('reels'), db.all('notifications'),
  ]);
  const t = today();
  const todays = onDate(all, t).filter(e => e.status !== 'canceled');
  const next = nextUpcoming(all);
  const tasks = all.filter(e => e.status === 'planned' && e.date <= t && (e.type === 'task' || e.date < t)).slice(0, 6);
  const fresh = listings.filter(l => !l.hidden).sort((a, b) => b.foundAt - a.foundAt);
  const unseen = fresh.filter(l => !l.seen);
  const unread = notes.filter(n => !n.read).sort((a, b) => b.createdAt - a.createdAt);
  const lastReport = reports.sort((a, b) => b.createdAt - a.createdAt)[0];
  const lastReel = lastReport ? reels.find(r => r.id === lastReport.reelId) : null;
  const done = todays.filter(e => e.status === 'done').length;

  root.innerHTML = `
    <div class="header-row">
      <div>
        <div class="hero-date">${longDate()}</div>
        <h1 class="large-title">${greeting()}${s.name ? `, ${esc(s.name)}` : ''}</h1>
      </div>
      <div class="header-actions">
        <a class="icon-btn" href="#/notifications" aria-label="Уведомления" style="position:relative">${icon('bell')}${unread.length ? `<span class="dot" style="position:absolute;top:-3px;right:-3px;min-width:17px;height:17px;padding:0 5px;border-radius:9px;background:var(--danger);color:#fff;font-size:11px;font-weight:600;display:grid;place-items:center">${unread.length}</span>` : ''}</a>
        <button class="icon-btn" data-theme-toggle aria-label="Сменить тему">${icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon')}</button>
        <a class="icon-btn" href="#/settings" aria-label="Настройки">${icon('gear')}</a>
      </div>
    </div>
    <button class="wake-pill" data-wake-pill hidden><i></i><span>Скажите «Помощник»</span></button>
    <p class="subtitle">${todays.length ? `Сегодня ${todays.length} ${todays.length === 1 ? 'дело' : todays.length < 5 ? 'дела' : 'дел'}, выполнено ${done}` : 'На сегодня дел нет — самое время спланировать день'}</p>

    ${next ? `<a class="next-card" href="#/calendar?d=${next.date}" data-countdown>
      <span class="k">Ближайшее · ${TYPES[next.type].label}</span>
      <span class="t">${esc(next.title)}</span>
      <span class="m">${humanDate(next.date)}, ${next.start}${next.end ? '–' + next.end : ''}${next.location ? ' · ' + esc(next.location) : ''}${next.client ? ' · ' + esc(next.client) : ''}</span>
      <span class="countdown">${untilText(eventStart(next) - Date.now())}</span>
    </a>` : ''}

    <div class="quick-grid mt">
      <button class="quick" data-q="add"><span class="icon-badge dark">${icon('plus')}</span>Дело</button>
      <button class="quick" data-voice><span class="icon-badge">${icon('mic')}</span>Голосом</button>
      <button class="quick" data-q="plan"><span class="icon-badge neutral">${icon('sun')}</span>План дня</button>
      <button class="quick" data-q="report"><span class="icon-badge neutral">${icon('moon')}</span>Отчёт</button>
    </div>

    <div class="section-title">План на сегодня <a href="#/calendar">Все</a></div>
    <div class="timeline" data-list>${todays.length ? todays.map(e => eventRow(e, all)).join('') : `<div class="card empty"><b>Свободный день</b>Скажите помощнику: «Завтра в 11 показ на Абая»</div>`}</div>

    ${tasks.length ? `<div class="section-title">Активные задачи</div>
    <div class="list" data-list>${tasks.map(e => `<div class="row" data-open="${e.id}" role="button">
      <span class="check" data-check="${e.id}" role="checkbox" aria-checked="false" aria-label="Выполнено"></span>
      <div class="row-main"><div class="row-title">${esc(e.title)}</div><div class="row-sub">${e.date < t ? `<span style="color:var(--danger)">Просрочено · ${humanDate(e.date).toLowerCase()}</span>` : (e.start || 'в течение дня')}${e.priority === 'high' ? ' · важно' : ''}</div></div>
    </div>`).join('')}</div>` : ''}

    <div class="section-title">Krisha · от хозяев <a href="#/krisha">${unseen.length ? `Новых: ${unseen.length}` : 'Открыть'}</a></div>
    ${fresh.length ? `<div class="scroll-x">${fresh.slice(0, 8).map(l => `<a class="listing" href="#/krisha?l=${l.id}" style="min-width:230px;max-width:230px;flex-direction:column">
        <div class="listing-photo" style="width:auto;min-height:0;aspect-ratio:4/3;background-image:url('${esc(l.photo)}')">${!l.seen ? '<span class="badge">Новое</span>' : ''}</div>
        <div class="listing-body" style="padding:10px 12px 12px"><div class="listing-price" style="font-size:17px">${esc(l.priceText || '—')}</div><div class="listing-title" style="font-size:14px">${esc(l.title)}</div><div class="caption">${esc(l.address)}</div></div>
      </a>`).join('')}</div>` : `<a class="card row" href="#/krisha"><span class="icon-badge">${icon('building')}</span><div class="row-main"><div class="row-title">Настройте поиск</div><div class="row-sub">Объявления от собственников будут собираться здесь</div></div>${chev()}</a>`}

    <div class="section-title">Instagram <a href="#/instagram">Отчёты</a></div>
    ${lastReport ? igStats(lastReport, lastReel) : `<a class="card row" href="#/instagram"><span class="icon-badge dark">${icon('chart')}</span><div class="row-main"><div class="row-title">Первый отчёт по Reels</div><div class="row-sub">Вставьте ссылку на ролик или скриншоты статистики</div></div>${chev()}</a>`}

    <div class="section-title">Уведомления <a href="#/notifications">Все</a></div>
    <div class="list">${unread.length ? unread.slice(0, 3).map(n => `<a class="row notif unread" href="${esc(n.link || '#/notifications')}" data-read="${n.id}"><span class="unread-dot"></span><div class="row-main"><div class="row-title">${esc(n.title)}</div><div class="row-sub">${esc(n.body)} · ${timeAgo(n.createdAt)}</div></div></a>`).join('') : '<div class="empty">Новых уведомлений нет</div>'}</div>
  `;

  root.querySelectorAll('[data-list]').forEach(l => bindEventList(l));
  root.querySelector('[data-q=add]').onclick = () => openEventSheet();
  const pill = root.querySelector('[data-wake-pill]');
  wakeUnsub?.();
  wakeUnsub = onWakeState(st => {
    pill.hidden = st === 'off';
    pill.classList.toggle('on', st === 'listening');
    pill.querySelector('span').textContent = st === 'listening' ? 'Слушаю слово «Помощник»' : st === 'paused' ? 'Джарвис в диалоге' : st === 'denied' ? 'Нет доступа к микрофону — нажмите, чтобы включить' : 'Включаю микрофон…';
  });
  pill.onclick = async () => { if (!pill.classList.contains('on') && !pill.textContent.includes('диалоге')) { const w = await import('../wake.js'); w.startWake(); } else import('../app.js').then(m => m.openVoice({ greet: true })); };
  root.querySelector('[data-theme-toggle]').onclick = async () => { const { toggleTheme } = await import('../app.js'); await toggleTheme(); draw(); };
  root.querySelector('[data-q=plan]').onclick = async () => showText('Утренний план', await morningPlan());
  root.querySelector('[data-q=report]').onclick = async () => showText('Отчёт за день', await eveningReport());
  root.querySelectorAll('[data-read]').forEach(a => a.addEventListener('click', async () => { const n = await db.get('notifications', a.dataset.read); if (n) { n.read = true; db.put('notifications', n); } }));
}

function igStats(r, reel) {
  const o = r.organic || {}, p = r.paid || {};
  const d = derived(r);
  const cell = (v, l) => `<div class="stat"><div class="v ${isNum(v) ? '' : 'na'}">${isNum(v) ? compact(v) : 'нет данных'}</div><div class="l">${l}</div></div>`;
  return `<div class="stat-grid four">
      ${cell(o.views ?? r.totalViews, 'Просмотры')}
      ${cell(o.reach, 'Охват')}
      ${cell(d.totalMessages, 'Обращения')}
      <div class="stat"><div class="v ${isNum(p.spend) ? '' : 'na'}">${isNum(p.spend) ? money(p.spend, p.currency || 'KZT') : 'нет рекламы'}</div><div class="l">Расход на рекламу</div></div>
    </div>
    <p class="footnote">${esc(reel?.title || 'Ролик')} · ${timeAgo(r.createdAt)}${isNum(d.costPerMessage) ? ` · обращение ${money(d.costPerMessage, p.currency || 'KZT')}` : ''}</p>`;
}

export function showText(title, text) {
  return sheet({
    title, body: `<div class="card report-text">${esc(text)}</div><div class="btn-row mt"><button class="btn tinted" data-share>${icon('share')}Поделиться</button><button class="btn dark" data-say>${icon('spark')}Озвучить</button></div>`,
    onMount: b => {
      b.querySelector('[data-share]').onclick = () => shareText(title, text);
      b.querySelector('[data-say]').onclick = () => import('../speech.js').then(m => m.speak(text));
    },
  });
}
