// Уведомления: лента в приложении + системные уведомления + напоминания + экспорт в Календарь Apple.
import { db, settings, setSetting } from './db.js';
import { allEvents, morningPlan, eveningReport, TYPES } from './events.js';
import { uid, eventStart, today, toMin, nowMin, pad } from './util.js';

export async function notify({ title, body = '', type = 'info', link = '', system = true }) {
  const n = { id: uid(), title, body, type, link, createdAt: Date.now(), read: false };
  await db.put('notifications', n);
  if (system) await systemNotify(title, body, link);
  return n;
}

export async function systemNotify(title, body, link = '') {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { link }, tag: uid() });
    else new Notification(title, { body, icon: 'icons/icon-192.png' });
  } catch (e) { /* без системных уведомлений лента всё равно работает */ }
}

export async function askPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'default') return Notification.requestPermission();
  return Notification.permission;
}

// Проверка напоминаний — вызывается раз в 30 секунд, пока приложение открыто
export async function tick() {
  const now = Date.now();
  const events = await allEvents();
  for (const e of events) {
    if (e.status !== 'planned' || !e.start || e.notified) continue;
    const at = eventStart(e).getTime() - (Number(e.remind) || 0) * 60000;
    if (now >= at && now < eventStart(e).getTime() + 15 * 60000) {
      e.notified = true;
      await db.put('events', e);
      const mins = Math.round((eventStart(e).getTime() - now) / 60000);
      await notify({
        title: `${TYPES[e.type].label}: ${e.title}`,
        body: `${mins > 0 ? `Через ${mins} мин` : 'Сейчас'} · ${e.start}${e.location ? ' · ' + e.location : ''}${e.phone ? ' · ' + e.phone : ''}`,
        type: 'reminder', link: `#/calendar?d=${e.date}&e=${e.id}`,
      });
    }
  }
  const st = await settings();
  const t = today();
  if (st.lastMorning !== t && nowMin() >= toMin(st.morningTime) && nowMin() < toMin(st.workEnd)) {
    await setSetting('lastMorning', t);
    await notify({ title: 'Утренний план готов', body: (await morningPlan()).split('\n').slice(1, 3).join(' '), type: 'plan', link: '#/assistant?say=morning' });
  }
  if (st.lastEvening !== t && nowMin() >= toMin(st.eveningTime)) {
    await setSetting('lastEvening', t);
    await notify({ title: 'Вечерний отчёт готов', body: (await eveningReport()).split('\n')[1] || '', type: 'report', link: '#/assistant?say=evening' });
  }
  // Расписание проверок Krisha
  const searches = await db.all('searches');
  const hm = `${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`;
  for (const s of searches) {
    if (!s.active || !s.times?.length) continue;
    const due = s.times.filter(x => x <= hm).sort().pop();
    const key = `${t} ${due}`;
    if (due && s.lastReminder !== key) {
      s.lastReminder = key;
      await db.put('searches', s);
      await notify({ title: `Проверка Krisha: ${s.name}`, body: 'Откройте поиск и нажмите «В Арбат» — новые объявления от хозяев попадут в ленту.', type: 'krisha', link: `#/krisha?run=${s.id}` });
    }
  }
}

// ── Экспорт в Календарь (iPhone/Mac): система сама напомнит, даже если приложение закрыто ──
const icsDate = (date, time) => `${date.replace(/-/g, '')}T${(time || '09:00').replace(':', '')}00`;
const icsEsc = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
export function toICS(events) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Arbat//RU', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.id}@arbat`, `DTSTAMP:${stamp}`);
    if (e.start) {
      lines.push(`DTSTART:${icsDate(e.date, e.start)}`, `DTEND:${icsDate(e.date, e.end || e.start)}`);
    } else {
      const d = e.date.replace(/-/g, '');
      const next = new Date(eventStart(e).getTime() + 86400000);
      lines.push(`DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${next.getFullYear()}${pad(next.getMonth() + 1)}${pad(next.getDate())}`);
    }
    lines.push(`SUMMARY:${icsEsc(`${TYPES[e.type].label}: ${e.title}`)}`);
    if (e.location) lines.push(`LOCATION:${icsEsc(e.location)}`);
    const desc = [e.client && `Клиент: ${e.client}`, e.phone && `Телефон: ${e.phone}`, e.notes].filter(Boolean).join('\n');
    if (desc) lines.push(`DESCRIPTION:${icsEsc(desc)}`);
    if (e.start && Number(e.remind) > 0) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(e.title)}`, `TRIGGER:-PT${Number(e.remind)}M`, 'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
