// Движок помощника: фраза → действия в ежедневнике → ответ (текст + голос).
import { db, settings } from './db.js';
import { parse, scoreEvent, PARTS } from './nlp.js';
import { aiEnabled, aiPlan } from './ai.js';
import {
  TYPES, allEvents, newEvent, saveEvent, moveEvent, setStatus, conflictsOf, findFreeSlot,
  onDate, describe, morningPlan, eveningReport, endMin,
} from './events.js';
import { uid, today, toMin, fromMin, humanDate, plural } from './util.js';

export async function addChat(role, text, extra = {}) {
  return db.put('chat', { id: uid(), role, text, createdAt: Date.now(), ...extra });
}

const HELP = `Джарвис на связи. Я веду ваш ежедневник. Можно говорить свободно, например:
• «Завтра в 10 показ на Абая 150 с Айгерим, потом встреча с нотариусом, в 3 позвонить Ерлану»
• «Перенеси показ на Абая на пятницу в 16»
• «Отмени встречу с нотариусом»
• «Отметь звонок Ерлану выполненным»
• «Что у меня завтра?» · «Когда я свободна в четверг?»
• «Утренний план» · «Вечерний отчёт»
• «Что нового на Крыше?» · «Статистика Instagram»
Если время не названо, я сам найду свободное окно и предупрежу о пересечениях.`;

// Главная точка входа
export async function handle(text) {
  const trimmed = text.trim();
  if (!trimmed) return { reply: '' };
  let intents = null, aiReply = '', usedAi = false, aiError = '';
  const events = await allEvents();
  if (await aiEnabled()) {
    try {
      const r = await aiPlan(trimmed, events);
      intents = r.actions; aiReply = r.reply || ''; usedAi = true;
    } catch (e) { aiError = e.message; }
  }
  if (!intents) intents = parse(trimmed);
  const res = await execute(intents, { usedAi });
  let reply = res.lines.join('\n');
  if (usedAi && !res.lines.length && aiReply) reply = aiReply;
  if (!reply) reply = aiReply || 'Не совсем понял. Скажите, например: «Завтра в 11 показ на Абая 10».';
  if (aiError) reply += `\n(${aiError})`;
  return { reply, created: res.created, undo: res.undo, nav: res.nav, conflicts: res.conflicts };
}

export async function execute(intents, { usedAi = false } = {}) {
  const lines = [];
  const created = [];
  const undo = [];
  const conflicts = [];
  let nav = null;
  let cursor = {}; // дата → минута окончания предыдущего дела этой фразы
  const addGroup = [];

  for (const it of intents) {
    const events = await allEvents();
    switch (it.op) {
      case 'add': {
        const date = it.date || today();
        const type = TYPES[it.type] ? it.type : 'task';
        const dur = Number(it.duration) || (it.end && it.start ? toMin(it.end) - toMin(it.start) : TYPES[type].dur);
        let start = it.start || null, auto = false;
        if (!start) {
          const win = it.part ? PARTS[it.part] : null;
          const after = Math.max(win?.[0] ?? 0, cursor[date] ?? 0);
          start = await findFreeSlot(date, dur, events, { after: after || null, before: win?.[1] ?? null });
          auto = !!start;
        }
        const e = newEvent({
          type, title: it.title || TYPES[type].label, date, start: start || '',
          end: start ? (it.end && !auto ? it.end : fromMin(toMin(start) + dur)) : '',
          location: it.location || '', client: it.client || '', phone: it.phone || '', notes: it.notes || '',
          priority: it.priority || 'normal', source: usedAi ? 'ai' : 'voice',
        });
        e.autoTime = auto;
        await saveEvent(e);
        created.push(e);
        undo.push({ op: 'delete', id: e.id });
        if (start) cursor[date] = endMin(e);
        addGroup.push(e);
        break;
      }
      case 'move': {
        const target = it.id ? events.find(e => e.id === it.id) : bestMatch(it.query, events, it.fromDate);
        if (!target) { lines.push(`Не нашёл, что перенести${it.query ? ` («${it.query}»)` : ''}. Уточните название.`); break; }
        const before = { date: target.date, start: target.start, end: target.end, history: [...(target.history || [])] };
        let date = it.date || target.date, start = it.start;
        if (!start && it.part) start = await findFreeSlot(date, (endMin(target) ?? 60) - (toMin(target.start) ?? 0) || 60, events.filter(x => x.id !== target.id), { after: PARTS[it.part][0], before: PARTS[it.part][1] });
        if (!start && it.date && target.start) {
          const busy = conflictsOf({ ...target, date }, events);
          start = busy.length ? await findFreeSlot(date, (endMin(target) - toMin(target.start)) || 60, events.filter(x => x.id !== target.id)) : target.start;
        }
        await moveEvent(target, date, start ?? undefined);
        undo.push({ op: 'restore', id: target.id, before });
        lines.push(`Перенёс «${target.title}» на ${humanDate(target.date).toLowerCase()}${target.start ? ` в ${target.start}` : ''}.`);
        const c = conflictsOf(target, await allEvents());
        if (c.length) {
          const free = await findFreeSlot(target.date, (endMin(target) - toMin(target.start)) || 60, (await allEvents()).filter(x => x.id !== target.id), { after: toMin(target.start) });
          conflicts.push({ event: target, with: c, free });
        }
        break;
      }
      case 'cancel':
      case 'done': {
        const target = it.id ? events.find(e => e.id === it.id) : bestMatch(it.query, events.filter(e => e.status === 'planned'), it.fromDate);
        if (!target) { lines.push(`Не нашёл такое дело${it.query ? ` («${it.query}»)` : ''}.`); break; }
        const before = { status: target.status, history: [...(target.history || [])] };
        await setStatus(target, it.op === 'done' ? 'done' : 'canceled');
        undo.push({ op: 'restore', id: target.id, before });
        lines.push(it.op === 'done' ? `Отметил выполненным: «${target.title}».` : `Отменил: «${target.title}» (${humanDate(target.date).toLowerCase()}${target.start ? ' ' + target.start : ''}).`);
        break;
      }
      case 'list': {
        const date = it.date || today();
        const day = onDate(events, date).filter(e => e.status !== 'canceled');
        if (!day.length) lines.push(`${humanDate(date)} ничего не запланировано.`);
        else {
          lines.push(`${humanDate(date)} — ${day.length} ${plural(day.length, 'дело', 'дела', 'дел')}:`);
          day.forEach(e => lines.push(`• ${describe(e)}${e.status === 'done' ? ' ✓' : ''}`));
        }
        nav = `#/calendar?d=${date}`;
        break;
      }
      case 'free': {
        const date = it.date || today();
        const slots = await freeWindows(date, events);
        lines.push(slots.length ? `${humanDate(date)} свободно: ${slots.join(', ')}.` : `${humanDate(date)} рабочий день полностью занят.`);
        break;
      }
      case 'morning': lines.push(await morningPlan(it.date || today())); break;
      case 'evening': lines.push(await eveningReport(it.date || today())); break;
      case 'krisha': {
        const ls = (await db.all('listings')).filter(l => !l.hidden).sort((a, b) => b.foundAt - a.foundAt);
        const fresh = ls.filter(l => !l.seen);
        lines.push(fresh.length ? `Новых объявлений от хозяев: ${fresh.length}. Последнее — ${ls[0].title}, ${ls[0].priceText || ''}.` : 'Новых объявлений нет. Откройте поиск Krisha и нажмите кнопку «В Арбат», чтобы забрать свежие.');
        nav = '#/krisha';
        break;
      }
      case 'instagram': {
        const reports = (await db.all('reports')).sort((a, b) => b.createdAt - a.createdAt);
        if (!reports.length) lines.push('Отчётов по Instagram пока нет. Вставьте ссылку на Reels в разделе Instagram.');
        else {
          const r = reports[0];
          const v = r.organic?.views ?? r.paid?.views;
          lines.push(`Последний отчёт: ${v != null ? `${v.toLocaleString('ru-RU')} просмотров` : 'просмотры недоступны'}${r.paid?.spend != null ? `, расход на рекламу ${r.paid.spend.toLocaleString('ru-RU')}` : ''}.`);
        }
        nav = '#/instagram';
        break;
      }
      case 'help': lines.push(HELP); break;
    }
  }

  // Пересечения проверяем после добавления всех дел фразы
  for (const e of [...addGroup].reverse()) {
    const all = await allEvents();
    const c = conflictsOf(e, all);
    if (c.length && !conflicts.some(x => x.with.some(w => w.id === e.id))) {
      const dur = endMin(e) - toMin(e.start);
      const free = await findFreeSlot(e.date, dur, all.filter(x => x.id !== e.id), { after: toMin(e.start) });
      conflicts.push({ event: e, with: c, free });
    }
  }
  if (addGroup.length) {
    const byDate = {};
    addGroup.forEach(e => { (byDate[e.date] ||= []).push(e); });
    const head = addGroup.length === 1 ? 'Добавил' : `Добавил ${addGroup.length} ${plural(addGroup.length, 'дело', 'дела', 'дел')}`;
    const parts = Object.entries(byDate).map(([d, list]) => `${humanDate(d).toLowerCase()}: ${list.map(e => `${e.start || 'в течение дня'} — ${e.title}${e.autoTime ? ' (подобрал время)' : ''}`).join('; ')}`);
    lines.unshift(`${head} — ${parts.join('. ')}.`);
  }
  conflicts.forEach(c => {
    lines.push(`⚠️ «${c.event.title}» пересекается с «${c.with.map(w => `${w.title} ${w.start}–${w.end}`).join(', ')}».${c.free ? ` Ближайшее свободное время — ${c.free}.` : ' Свободных окон в этот день нет.'}`);
  });
  return { lines, created, undo, nav, conflicts };
}

function bestMatch(query, events, fromDate) {
  if (!query) return null;
  const cand = events.filter(e => e.status === 'planned' && e.date >= (fromDate || today()))
    .map(e => ({ e, s: scoreEvent(query, e, fromDate) })).filter(x => x.s >= 2).sort((a, b) => b.s - a.s || (a.e.date < b.e.date ? -1 : 1));
  return cand[0]?.e || null;
}

export async function freeWindows(date, events) {
  const st = await settings();
  let t = toMin(st.workStart), end = toMin(st.workEnd);
  if (date === today()) { const n = new Date(); t = Math.max(t, Math.ceil((n.getHours() * 60 + n.getMinutes()) / 15) * 15); }
  const busy = events.filter(e => e.date === date && e.status === 'planned' && e.start).map(e => [toMin(e.start), endMin(e)]).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [s, e] of busy) { if (s - t >= 30) out.push(`${fromMin(t)}–${fromMin(s)}`); t = Math.max(t, e); }
  if (end - t >= 30) out.push(`${fromMin(t)}–${fromMin(end)}`);
  return out;
}

export async function applyUndo(undo) {
  for (const u of [...undo].reverse()) {
    if (u.op === 'delete') await db.del('events', u.id);
    if (u.op === 'restore') {
      const e = await db.get('events', u.id);
      if (e) { Object.assign(e, u.before); await saveEvent(e); }
    }
  }
}
