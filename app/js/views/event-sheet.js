// Карточка события: создание, редактирование, перенос, статус, экспорт в Календарь.
import { sheet, toast, formData, segmented, bindSegmented, confirmSheet, download, icon } from '../ui.js';
import { db } from '../db.js';
import { TYPES, PRIORITIES, newEvent, saveEvent, moveEvent, setStatus, conflictsOf, findFreeSlot, allEvents, endMin } from '../events.js';
import { toICS } from '../notify.js';
import { esc, today, addDays, toMin, fromMin, humanDate, dateTime } from '../util.js';

export async function openEventSheet(existing = null, defaults = {}) {
  const isNew = !existing;
  const e = existing ? { ...existing } : newEvent({ date: defaults.date || today(), type: defaults.type || 'meeting', start: defaults.start || '', title: defaults.title || '', location: defaults.location || '', notes: defaults.notes || '', client: defaults.client || '' });
  const remindOpts = [[0, 'Без напоминания'], [5, 'За 5 мин'], [15, 'За 15 мин'], [30, 'За 30 мин'], [60, 'За 1 час'], [120, 'За 2 часа'], [1440, 'За день']];
  const historyText = (e.history || []).slice(-4).map(h => h.op === 'move'
    ? `перенос с ${humanDate(h.from.date).toLowerCase()} ${h.from.start || ''}`
    : `статус «${h.to === 'done' ? 'выполнено' : h.to === 'canceled' ? 'отменено' : 'в работе'}»`).join(' · ');
  const body = `
    <form class="form" onsubmit="return false">
      <div class="scroll-x" data-types>${Object.entries(TYPES).map(([k, t]) => `<button type="button" class="chip ${k === e.type ? 'on' : ''}" data-t="${k}">${t.label}</button>`).join('')}</div>
      <input type="hidden" name="type" value="${e.type}">
      <label class="field"><span>Название</span><input class="input" name="title" value="${esc(isNew ? (defaults.title || '') : e.title)}" placeholder="${TYPES[e.type].label}" autofocus></label>
      <div class="grid-3">
        <label class="field"><span>Дата</span><input class="input" type="date" name="date" value="${e.date}" required></label>
        <label class="field"><span>Начало</span><input class="input" type="time" name="start" value="${e.start}"></label>
        <label class="field"><span>Конец</span><input class="input" type="time" name="end" value="${e.end}"></label>
      </div>
      <div class="hstack wrap"><button type="button" class="btn tinted small" data-free>${icon('clock')}Найти свободное время</button><span data-conflict></span></div>
      <label class="field"><span>Приоритет</span>${segmented('priority', [['low', 'Низкий'], ['normal', 'Обычный'], ['high', 'Высокий']], e.priority)}</label>
      <label class="field"><span>Адрес / объект</span><input class="input" name="location" value="${esc(e.location)}" placeholder="ул. Абая 150, кв. 12"></label>
      <div class="grid-2">
        <label class="field"><span>Клиент</span><input class="input" name="client" value="${esc(e.client)}" placeholder="Имя"></label>
        <label class="field"><span>Телефон</span><input class="input" type="tel" name="phone" value="${esc(e.phone)}" placeholder="+7 7__ ___ __ __"></label>
      </div>
      <label class="field"><span>Напоминание</span><select class="select" name="remind">${remindOpts.map(([v, l]) => `<option value="${v}" ${Number(e.remind) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field"><span>Заметки</span><textarea class="textarea" name="notes" placeholder="Детали, договорённости">${esc(e.notes)}</textarea></label>
      ${isNew ? '' : `
      <div class="list">
        ${e.status !== 'done' ? '<button type="button" class="row" data-act="done"><span class="row-main row-title" style="color:var(--olive)">Отметить выполненным</span></button>' : '<button type="button" class="row" data-act="reopen"><span class="row-main row-title">Вернуть в работу</span></button>'}
        <button type="button" class="row" data-act="tomorrow"><span class="row-main row-title">Перенести на завтра</span></button>
        ${e.phone ? `<a class="row" href="tel:${esc(e.phone)}"><span class="row-main row-title">Позвонить ${esc(e.client || '')}</span></a>` : ''}
        ${e.location ? `<a class="row" target="_blank" rel="noopener" href="https://2gis.kz/search/${encodeURIComponent(e.location)}"><span class="row-main row-title">Открыть адрес в 2ГИС</span></a>` : ''}
        <button type="button" class="row" data-act="ics"><span class="row-main row-title">Добавить в Календарь iPhone</span></button>
        ${e.status !== 'canceled' ? '<button type="button" class="row" data-act="cancel"><span class="row-main row-title" style="color:var(--danger)">Отменить событие</span></button>' : ''}
        <button type="button" class="row" data-act="delete"><span class="row-main row-title" style="color:var(--danger)">Удалить</span></button>
      </div>
      <p class="footnote">${historyText ? `История: ${historyText}. ` : ''}Создано ${dateTime(e.createdAt)}.</p>`}
    </form>`;

  return sheet({
    title: isNew ? 'Новое дело' : TYPES[e.type].label,
    doneText: isNew ? 'Добавить' : 'Сохранить',
    body,
    onMount: (root, close) => {
      bindSegmented(root);
      const typeInput = root.querySelector('[name=type]');
      const startEl = root.querySelector('[name=start]'), endEl = root.querySelector('[name=end]'), dateEl = root.querySelector('[name=date]');
      async function checkConflict() {
        const out = root.querySelector('[data-conflict]');
        if (!startEl.value) { out.innerHTML = ''; return; }
        const c = conflictsOf({ ...e, date: dateEl.value, start: startEl.value, end: endEl.value, status: 'planned', type: typeInput.value }, await allEvents());
        out.innerHTML = c.length ? `<span class="conflict">Пересекается: ${c.map(x => `${esc(x.title)} ${x.start}–${x.end}`).join(', ')}</span>` : '';
      }
      root.querySelector('[data-types]').addEventListener('click', ev => {
        const b = ev.target.closest('[data-t]');
        if (!b) return;
        root.querySelectorAll('[data-t]').forEach(x => x.classList.toggle('on', x === b));
        typeInput.value = b.dataset.t;
        root.querySelector('[name=title]').placeholder = TYPES[b.dataset.t].label;
        if (startEl.value) endEl.value = fromMin(toMin(startEl.value) + TYPES[b.dataset.t].dur);
        checkConflict();
      });
      startEl.addEventListener('change', () => {
        if (startEl.value) {
          const prevDur = e.start && e.end ? toMin(e.end) - toMin(e.start) : TYPES[typeInput.value].dur;
          endEl.value = fromMin(toMin(startEl.value) + Math.max(15, prevDur));
        }
        checkConflict();
      });
      endEl.addEventListener('change', checkConflict);
      dateEl.addEventListener('change', checkConflict);
      checkConflict();
      root.querySelector('[data-free]').onclick = async () => {
        const d = startEl.value && endEl.value ? toMin(endEl.value) - toMin(startEl.value) : TYPES[typeInput.value].dur;
        const dur = d > 0 ? d : 60;
        const slot = await findFreeSlot(dateEl.value, dur, (await allEvents()).filter(x => x.id !== e.id));
        if (!slot) { toast('В этот день нет свободного окна в рабочее время'); return; }
        startEl.value = slot; endEl.value = fromMin(toMin(slot) + dur);
        checkConflict();
      };
      root.querySelectorAll('[data-act]').forEach(b => b.onclick = async () => {
        const act = b.dataset.act;
        const orig = await db.get('events', e.id);
        if (!orig) return;
        if (act === 'done') { await setStatus(orig, 'done'); toast('Выполнено'); close(true); }
        if (act === 'reopen') { await setStatus(orig, 'planned'); close(true); }
        if (act === 'cancel') { await setStatus(orig, 'canceled'); toast('Событие отменено'); close(true); }
        if (act === 'tomorrow') {
          const date = addDays(today(), 1);
          const events = (await allEvents()).filter(x => x.id !== orig.id);
          let start = orig.start;
          if (start && conflictsOf({ ...orig, date }, events).length) start = await findFreeSlot(date, (endMin(orig) - toMin(orig.start)) || 60, events) || start;
          await moveEvent(orig, date, start);
          toast(`Перенесено на завтра${start ? ' ' + start : ''}`); close(true);
        }
        if (act === 'ics') download(`${orig.title}.ics`, toICS([orig]), 'text/calendar');
        if (act === 'delete' && await confirmSheet(`Удалить «${orig.title}»?`)) { await db.del('events', orig.id); toast('Удалено'); close(true); }
      });
    },
    done: async root => {
      const f = formData(root);
      if (!f.date) throw new Error('Укажите дату');
      if (f.start && f.end && toMin(f.end) <= toMin(f.start)) throw new Error('Конец должен быть позже начала');
      const orig = isNew ? e : await db.get('events', e.id);
      const moved = !isNew && (orig.date !== f.date || orig.start !== f.start);
      if (moved) orig.history = [...(orig.history || []), { op: 'move', from: { date: orig.date, start: orig.start }, at: Date.now() }];
      Object.assign(orig, {
        type: f.type, title: f.title || TYPES[f.type].label, date: f.date, start: f.start,
        end: f.start ? (f.end || fromMin(toMin(f.start) + TYPES[f.type].dur)) : '',
        priority: f.priority, location: f.location, client: f.client, phone: f.phone, notes: f.notes, remind: Number(f.remind),
      });
      if (moved) orig.notified = false;
      await saveEvent(orig);
      const c = conflictsOf(orig, await allEvents());
      toast(c.length ? `Сохранено. Внимание: пересечение с «${c[0].title}»` : (isNew ? 'Добавлено в ежедневник' : 'Сохранено'));
      return true;
    },
  });
}
