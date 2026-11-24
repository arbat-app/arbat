// Чат с помощником: текст и голос, история, отмена последнего действия.
import { db, settings } from '../db.js';
import { icon, toast } from '../ui.js';
import { handle, addChat, applyUndo, execute } from '../assistant.js';
import { speak } from '../speech.js';
import { aiEnabled } from '../ai.js';
import { openVoice, go } from '../app.js';
import { esc, pad } from '../util.js';

let root;
export async function render(el, params) {
  root = el;
  const ai = await aiEnabled();
  root.innerHTML = `
    <div class="header-row">
      <h1 class="large-title">Джарвис</h1>
      <div class="header-actions"><button class="btn plain small" data-clear>Очистить</button></div>
    </div>
    <p class="subtitle">${ai ? 'Режим GPT · ' : 'Встроенный разбор · '}пишите или говорите свободно</p>
    <div class="scroll-x" style="margin-bottom:14px" data-sugg>
      ${['Что у меня сегодня?', 'Утренний план', 'Вечерний отчёт', 'Когда я свободна завтра?', 'Что ты умеешь?'].map(s => `<button class="chip" data-s="${esc(s)}">${esc(s)}</button>`).join('')}
    </div>
    <div class="chat" data-chat></div>
    <form class="composer" data-form>
      <button type="button" class="icon-btn" data-mic aria-label="Сказать голосом">${icon('mic')}</button>
      <textarea rows="1" placeholder="Например: завтра в 11 показ на Абая 10" data-input aria-label="Сообщение"></textarea>
      <button type="submit" class="icon-btn send" aria-label="Отправить">${icon('send')}</button>
    </form>`;
  const input = root.querySelector('[data-input]');
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(140, input.scrollHeight) + 'px'; });
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); root.querySelector('[data-form]').requestSubmit(); } });
  root.querySelector('[data-form]').onsubmit = e => { e.preventDefault(); const t = input.value.trim(); if (!t) return; input.value = ''; input.style.height = 'auto'; send(t); };
  root.querySelector('[data-mic]').onclick = () => openVoice();
  root.querySelector('[data-sugg]').onclick = e => { const b = e.target.closest('[data-s]'); if (b) send(b.dataset.s); };
  root.querySelector('[data-clear]').onclick = async () => { await db.clear('chat'); draw(); };
  root.querySelector('[data-chat]').addEventListener('click', async e => {
    const u = e.target.closest('[data-undo]');
    if (u) {
      const m = await db.get('chat', u.dataset.undo);
      if (m?.undo) { await applyUndo(m.undo); m.undo = null; m.undone = true; await db.put('chat', m); toast('Изменения отменены'); }
    }
    const fx = e.target.closest('[data-fix]');
    if (fx) {
      const [id, time] = fx.dataset.fix.split('|');
      const ev = await db.get('events', id);
      if (ev) { const { moveEvent } = await import('../events.js'); await moveEvent(ev, ev.date, time); toast(`Перенесено на ${time}`); }
    }
    const sp = e.target.closest('[data-speak]');
    if (sp) { const m = await db.get('chat', sp.dataset.speak); if (m) speak(m.text); }
  });
  await draw();
  if (params.say === 'morning') send('Утренний план');
  if (params.say === 'evening') send('Вечерний отчёт');
}
export const refresh = store => { if (store === 'chat') draw(); };

async function send(text) {
  await addChat('me', text);
  const typing = root.querySelector('[data-chat]');
  typing.insertAdjacentHTML('beforeend', '<div class="msg ai" data-typing>…</div>');
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  const res = await handle(text);
  await addChat('ai', res.reply, { undo: res.undo?.length ? res.undo : null, fixes: (res.conflicts || []).filter(c => c.free).map(c => ({ id: c.event.id, time: c.free, title: c.event.title })), nav: res.nav || null });
  const s = await settings();
  if (s.voiceReplies && res.reply.length < 600) speak(res.reply);
}

async function draw() {
  const list = (await db.all('chat')).sort((a, b) => a.createdAt - b.createdAt).slice(-80);
  const box = root.querySelector('[data-chat]');
  if (!list.length) {
    box.innerHTML = `<div class="card empty"><b>Джарвис на связи</b>Расскажите о планах. Например: «Завтра в 10 показ квартиры на Абая 150 с Айгерим, в 12:30 встреча с нотариусом, потом позвонить Ерлану». Я сам распределю дела по времени, найду свободные окна и предупрежу о пересечениях.</div>`;
    return;
  }
  let lastDay = '';
  box.innerHTML = list.map(m => {
    const d = new Date(m.createdAt);
    const day = d.toDateString();
    const sep = day !== lastDay ? `<div class="msg-time">${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</div>` : '';
    lastDay = day;
    const actions = m.role === 'ai' ? `<div class="actions">
      ${m.undo ? `<button class="btn small gray" data-undo="${m.id}">Отменить</button>` : ''}
      ${(m.fixes || []).map(f => `<button class="btn small tinted" data-fix="${f.id}|${f.time}">«${esc(f.title)}» на ${f.time}</button>`).join('')}
      ${m.nav ? `<a class="btn small tinted" href="${esc(m.nav)}">Открыть</a>` : ''}
      <button class="btn small plain" data-speak="${m.id}" aria-label="Озвучить">${icon('spark')}</button>
    </div>` : '';
    return `${sep}<div class="msg ${m.role === 'me' ? 'me' : 'ai'}">${esc(m.text)}${actions}<div class="caption" style="margin-top:4px;${m.role === 'me' ? 'color:inherit;opacity:.7' : ''}">${pad(d.getHours())}:${pad(d.getMinutes())}${m.voice ? ' · голосом' : ''}${m.undone ? ' · отменено' : ''}</div></div>`;
  }).join('');
  window.scrollTo({ top: document.body.scrollHeight });
}
