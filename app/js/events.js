// Ежедневник: типы событий, конфликты, свободные окна, отчёты.
import { db, settings } from './db.js';
import { uid, today, toMin, fromMin, nowMin, humanDate, addDays, duration, plural, eventStart } from './util.js';

export const TYPES = {
  meeting:     { label: 'Встреча',       icon: 'handshake', dur: 60 },
  showing:     { label: 'Показ',         icon: 'eye',       dur: 60 },
  intake:      { label: 'Приём объекта', icon: 'key',       dur: 90 },
  call:        { label: 'Звонок',        icon: 'phone',     dur: 15 },
  negotiation: { label: 'Переговоры',    icon: 'user',      dur: 60 },
  task:        { label: 'Задача',        icon: 'task',      dur: 30 },
};
export const STATUSES = { planned: 'Запланировано', done: 'Выполнено', canceled: 'Отменено' };
export const PRIORITIES = { high: 'Высокий', normal: 'Обычный', low: 'Низкий' };

export async function allEvents() {
  const list = await db.all('events');
  return list.sort(byTime);
}
export function byTime(a, b) {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const am = toMin(a.start) ?? 24 * 60, bm = toMin(b.start) ?? 24 * 60;
  if (am !== bm) return am - bm;
  const pr = { high: 0, normal: 1, low: 2 };
  return (pr[a.priority] ?? 1) - (pr[b.priority] ?? 1);
}
export const onDate = (list, date) => list.filter(e => e.date === date).sort(byTime);
export const isOpen = e => e.status === 'planned';
export const wasMoved = e => (e.history || []).some(h => h.op === 'move');

export function endMin(e) {
  const s = toMin(e.start);
  if (s === null) return null;
  return toMin(e.end) ?? s + (TYPES[e.type]?.dur ?? 30);
}

export function newEvent(p = {}) {
  const type = TYPES[p.type] ? p.type : 'task';
  const e = {
    id: uid(), type, title: p.title || TYPES[type].label, date: p.date || today(),
    start: p.start || '', end: p.end || '', location: p.location || '', client: p.client || '',
    phone: p.phone || '', notes: p.notes || '', priority: p.priority || 'normal',
    status: 'planned', remind: p.remind ?? (type === 'call' ? 5 : 30),
    createdAt: Date.now(), updatedAt: Date.now(), history: [], source: p.source || 'manual',
  };
  if (e.start && !e.end) e.end = fromMin(toMin(e.start) + TYPES[type].dur);
  return e;
}

export async function saveEvent(e) {
  e.updatedAt = Date.now();
  if (e.start && !e.end) e.end = fromMin(toMin(e.start) + (TYPES[e.type]?.dur ?? 30));
  if (!e.start) e.end = '';
  return db.put('events', e);
}

export async function moveEvent(e, date, start) {
  const dur = (endMin(e) ?? 0) - (toMin(e.start) ?? 0);
  e.history = [...(e.history || []), { op: 'move', from: { date: e.date, start: e.start }, at: Date.now() }];
  e.date = date || e.date;
  if (start !== undefined) {
    e.start = start || '';
    e.end = start ? fromMin(toMin(start) + (dur > 0 ? dur : TYPES[e.type].dur)) : '';
  }
  e.notified = false;
  return saveEvent(e);
}

export async function setStatus(e, status) {
  e.history = [...(e.history || []), { op: 'status', from: e.status, to: status, at: Date.now() }];
  e.status = status;
  if (status === 'done') e.doneAt = Date.now();
  return saveEvent(e);
}

// Пересечения с другими активными событиями того же дня
export function conflictsOf(e, list) {
  const s = toMin(e.start);
  if (s === null || e.status !== 'planned') return [];
  const en = endMin(e);
  return list.filter(o => o.id !== e.id && o.date === e.date && o.status === 'planned' && o.start)
    .filter(o => s < endMin(o) && toMin(o.start) < en);
}

// Поиск свободного окна заданной длины в рабочее время
export async function findFreeSlot(date, dur, list, { after = null, before = null } = {}) {
  const st = await settings();
  let from = Math.max(toMin(st.workStart) ?? 540, after ?? 0);
  const to = Math.min(toMin(st.workEnd) ?? 1140, before ?? 24 * 60);
  if (date === today()) from = Math.max(from, Math.ceil((nowMin() + 10) / 15) * 15);
  const busy = list.filter(o => o.date === date && o.status === 'planned' && o.start)
    .map(o => [toMin(o.start), endMin(o)]).sort((a, b) => a[0] - b[0]);
  let t = Math.ceil(from / 15) * 15;
  for (const [bs, be] of busy) {
    if (t + dur <= bs) break;
    if (be > t) t = Math.ceil(be / 15) * 15;
  }
  return t + dur <= to ? fromMin(t) : null;
}

export function describe(e) {
  const t = e.start ? `${e.start}${e.end ? '–' + e.end : ''}` : 'в течение дня';
  return `${t} · ${e.title}`;
}

export function nextUpcoming(list) {
  const now = Date.now();
  return list.filter(e => e.status === 'planned' && e.start && eventStart(e).getTime() + 5 * 60000 >= now)
    .sort((a, b) => eventStart(a) - eventStart(b))[0] || null;
}

// ── Утренний план и вечерний отчёт ──
export async function morningPlan(date = today()) {
  const list = await allEvents();
  const st = await settings();
  const day = onDate(list, date).filter(isOpen);
  const overdue = list.filter(e => e.status === 'planned' && e.date < date);
  const lines = [];
  const hello = st.name ? `Доброе утро, ${st.name}!` : 'Доброе утро!';
  lines.push(date === today() ? hello : `План на ${humanDate(date).toLowerCase()}`);
  if (!day.length) lines.push('На этот день ничего не запланировано.');
  else {
    const counts = countByType(day);
    lines.push(`${humanDate(date)}: ${day.length} ${plural(day.length, 'дело', 'дела', 'дел')} — ${counts}.`);
    day.forEach(e => lines.push(`• ${describe(e)}${e.location ? ` (${e.location})` : ''}${e.priority === 'high' ? ' — важно' : ''}`));
    const c = day.filter(e => conflictsOf(e, list).length);
    if (c.length) lines.push(`⚠️ Пересечения по времени: ${c.map(e => e.title).join(', ')}.`);
    const busyMin = day.reduce((s, e) => s + ((endMin(e) ?? 0) - (toMin(e.start) ?? 0)), 0);
    if (busyMin) lines.push(`Занято по расписанию: ${duration(busyMin)}.`);
  }
  if (overdue.length) lines.push(`Не закрыто с прошлых дней: ${overdue.length}. ${overdue.slice(0, 3).map(e => `«${e.title}»`).join(', ')}${overdue.length > 3 ? '…' : ''}`);
  return lines.join('\n');
}

export async function eveningReport(date = today()) {
  const list = await allEvents();
  const day = onDate(list, date);
  const done = day.filter(e => e.status === 'done');
  const canceled = day.filter(e => e.status === 'canceled');
  const open = day.filter(e => e.status === 'planned');
  const movedIn = list.filter(e => (e.history || []).some(h => h.op === 'move' && h.from.date === date) && e.date !== date);
  const listings = (await db.all('listings')).filter(l => l.foundAt && new Date(l.foundAt).toDateString() === new Date().toDateString());
  const reports = (await db.all('reports')).filter(r => new Date(r.createdAt).toDateString() === new Date().toDateString());
  const lines = [`Отчёт за ${humanDate(date, { withWeekday: false }).toLowerCase()}`];
  lines.push(`Выполнено: ${done.length} из ${day.length - canceled.length}${day.length ? ` (${Math.round(done.length / Math.max(1, day.length - canceled.length) * 100)}%)` : ''}.`);
  if (done.length) { lines.push('✓ Сделано:'); done.forEach(e => lines.push(`  • ${e.title}`)); }
  if (open.length) { lines.push('○ Не выполнено:'); open.forEach(e => lines.push(`  • ${e.title}${e.start ? ` (${e.start})` : ''}`)); }
  if (movedIn.length) { lines.push('↷ Перенесено:'); movedIn.forEach(e => lines.push(`  • ${e.title} → ${humanDate(e.date).toLowerCase()}${e.start ? ' ' + e.start : ''}`)); }
  if (canceled.length) lines.push(`Отменено: ${canceled.map(e => e.title).join(', ')}.`);
  const byType = {};
  done.forEach(e => { byType[e.type] = (byType[e.type] || 0) + 1; });
  const parts = Object.entries(byType).map(([t, n]) => `${TYPES[t].label.toLowerCase()} — ${n}`);
  if (parts.length) lines.push(`По видам: ${parts.join(', ')}.`);
  lines.push(`Новых объявлений Krisha за день: ${listings.length}.`);
  if (reports.length) lines.push(`Отчётов Instagram: ${reports.length}.`);
  const tomorrow = onDate(list, addDays(date, 1)).filter(isOpen);
  if (tomorrow.length) { lines.push(`Завтра: ${tomorrow.length} ${plural(tomorrow.length, 'дело', 'дела', 'дел')}, первое — ${describe(tomorrow[0])}.`); }
  return lines.join('\n');
}

function countByType(day) {
  const c = {};
  day.forEach(e => { c[e.type] = (c[e.type] || 0) + 1; });
  return Object.entries(c).map(([t, n]) => `${TYPES[t].label.toLowerCase()}: ${n}`).join(', ');
}
