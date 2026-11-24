// Ежедневник: неделя, день, предстоящие дела, фильтры по типам, экспорт в Календарь.
import { icon, download, segmented, bindSegmented } from '../ui.js';
import { allEvents, onDate, TYPES, eveningReport, morningPlan } from '../events.js';
import { toICS } from '../notify.js';
import { openEventSheet } from './event-sheet.js';
import { eventRow, bindEventList, showText } from './home.js';
import { today, addDays, parseYmd, ymd, WD_SHORT, MONTHS, humanDate, esc } from '../util.js';

let root, sel = today(), mode = 'day', typeFilter = 'all';
export async function render(el, params) {
  root = el;
  sel = params.d || sel || today();
  if (params.d) mode = 'day';
  root.innerHTML = `
    <div class="header-row">
      <h1 class="large-title">Ежедневник</h1>
      <div class="header-actions"><button class="icon-btn" data-add aria-label="Добавить">${icon('plus')}</button></div>
    </div>
    <div class="mt">${segmented('mode', [['day', 'День'], ['upcoming', 'Предстоящие'], ['done', 'Выполнено']], mode)}</div>
    <div data-week></div>
    <div class="scroll-x" data-filters style="margin-bottom:14px">
      <button class="chip ${typeFilter === 'all' ? 'on' : ''}" data-f="all">Все</button>
      ${Object.entries(TYPES).map(([k, t]) => `<button class="chip ${typeFilter === k ? 'on' : ''}" data-f="${k}">${t.label}</button>`).join('')}
    </div>
    <div data-body></div>
    <div class="btn-row mt" data-day-actions>
      <button class="btn tinted" data-plan>${icon('sun')}План дня</button>
      <button class="btn tinted" data-report>${icon('doc')}Отчёт дня</button>
      <button class="btn gray" data-ics>${icon('calendar')}В Календарь</button>
    </div>
    <p class="footnote" data-ics-note>«В Календарь» сохраняет дела дня в Календарь iPhone или Mac с напоминаниями: система Apple напомнит, даже если приложение закрыто.</p>`;
  bindSegmented(root, (n, v) => { mode = v; draw(); });
  root.querySelector('[data-add]').onclick = () => openEventSheet(null, { date: sel });
  root.querySelector('[data-filters]').onclick = e => {
    const b = e.target.closest('[data-f]');
    if (!b) return;
    typeFilter = b.dataset.f;
    root.querySelectorAll('[data-f]').forEach(x => x.classList.toggle('on', x === b));
    draw();
  };
  root.querySelector('[data-plan]').onclick = async () => showText(`План · ${humanDate(sel)}`, await morningPlan(sel));
  root.querySelector('[data-report]').onclick = async () => showText(`Отчёт · ${humanDate(sel)}`, await eveningReport(sel));
  root.querySelector('[data-ics]').onclick = async () => {
    const list = onDate(await allEvents(), sel).filter(e => e.status === 'planned');
    if (!list.length) return import('../ui.js').then(m => m.toast('На этот день нет активных дел'));
    download(`Арбат ${sel}.ics`, toICS(list), 'text/calendar');
  };
  bindEventList(root.querySelector('[data-body]'));
  await draw();
}
export const refresh = () => draw();

async function draw() {
  const all = await allEvents();
  const filt = list => typeFilter === 'all' ? list : list.filter(e => e.type === typeFilter);
  const week = root.querySelector('[data-week]');
  const body = root.querySelector('[data-body]');
  root.querySelector('[data-day-actions]').hidden = mode !== 'day';
  root.querySelector('[data-ics-note]').hidden = mode !== 'day';
  if (mode === 'day') {
    const d = parseYmd(sel);
    const monday = addDays(sel, -((d.getDay() + 6) % 7));
    const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
    const md = parseYmd(monday);
    week.innerHTML = `
      <div class="week-nav"><button class="icon-btn" data-wk="-7" aria-label="Предыдущая неделя">${icon('back')}</button>
        <button class="caption" data-today>${MONTHS[md.getMonth()]} ${md.getFullYear()} · ${sel === today() ? 'сегодня' : 'к сегодня'}</button>
        <button class="icon-btn" data-wk="7" aria-label="Следующая неделя">${icon('chevron')}</button></div>
      <div class="week">${days.map(x => {
        const n = onDate(all, x).filter(e => e.status !== 'canceled').length;
        return `<button class="day ${x === sel ? 'sel' : ''} ${x === today() ? 'today' : ''}" data-day="${x}">${WD_SHORT[parseYmd(x).getDay()]}<b>${parseYmd(x).getDate()}</b><span class="pips">${'<i></i>'.repeat(Math.min(n, 3))}</span></button>`;
      }).join('')}</div>`;
    week.querySelectorAll('[data-day]').forEach(b => b.onclick = () => { sel = b.dataset.day; draw(); });
    week.querySelectorAll('[data-wk]').forEach(b => b.onclick = () => { sel = addDays(sel, Number(b.dataset.wk)); draw(); });
    week.querySelector('[data-today]').onclick = () => { sel = today(); draw(); };
    const list = filt(onDate(all, sel));
    body.innerHTML = `<div class="section-title" style="margin-top:6px">${humanDate(sel)}</div>
      <div class="timeline">${list.length ? list.map(e => eventRow(e, all)).join('') : `<div class="card empty"><b>Нет дел</b><button class="btn tinted small mt" data-add-day>${icon('plus')}Добавить</button></div>`}</div>`;
    body.querySelector('[data-add-day]')?.addEventListener('click', () => openEventSheet(null, { date: sel }));
  } else {
    week.innerHTML = '';
    const t = today();
    const list = filt(mode === 'upcoming'
      ? all.filter(e => e.status === 'planned' && e.date >= addDays(t, -30))
      : all.filter(e => e.status === 'done').reverse().slice(0, 100));
    const groups = {};
    list.forEach(e => { (groups[e.date] ||= []).push(e); });
    const keys = Object.keys(groups);
    body.innerHTML = keys.length ? keys.map(k => `<div class="section-title" style="margin-top:18px">${k < t && mode === 'upcoming' ? '<span style="color:var(--danger)">Просрочено · </span>' : ''}${humanDate(k)}</div>
      <div class="timeline">${groups[k].map(e => eventRow(e, all)).join('')}</div>`).join('')
      : `<div class="card empty mt"><b>${mode === 'upcoming' ? 'Нет предстоящих дел' : 'Пока ничего не выполнено'}</b></div>`;
  }
}
