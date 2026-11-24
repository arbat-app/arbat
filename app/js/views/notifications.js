// Лента уведомлений.
import { db } from '../db.js';
import { icon } from '../ui.js';
import { askPermission } from '../notify.js';
import { esc, timeAgo } from '../util.js';

const ICONS = { reminder: 'clock', krisha: 'building', plan: 'sun', report: 'moon', instagram: 'chart', info: 'bell' };
let root;
export async function render(el) {
  root = el;
  await draw();
}
export const refresh = store => { if (store === 'notifications') draw(); };

async function draw() {
  const list = (await db.all('notifications')).sort((a, b) => b.createdAt - a.createdAt).slice(0, 200);
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  root.innerHTML = `
    <div class="header-row"><h1 class="large-title">Уведомления</h1>
      <div class="header-actions">${list.some(n => !n.read) ? '<button class="btn plain small" data-all>Прочитать все</button>' : ''}</div></div>
    ${perm === 'default' ? `<div class="card hstack mt"><span class="icon-badge">${icon('bell')}</span><div class="grow"><b>Включите системные уведомления</b><div class="caption">Напоминания о встречах и новых объявлениях</div></div><button class="btn small" data-perm>Включить</button></div>` : ''}
    ${perm === 'denied' ? '<p class="footnote">Системные уведомления запрещены в настройках браузера. Лента ниже работает всегда.</p>' : ''}
    <div class="list mt">${list.length ? list.map(n => `<a class="row icon-row notif ${n.read ? '' : 'unread'}" href="${esc(n.link || '#/notifications')}" data-id="${n.id}">
      <span class="icon-badge ${n.read ? 'neutral' : ''}">${icon(ICONS[n.type] || 'bell')}</span>
      <div class="row-main"><div class="row-title" style="white-space:normal">${esc(n.title)}</div><div class="row-sub" style="white-space:normal">${esc(n.body)}</div><div class="caption">${timeAgo(n.createdAt)}</div></div>
    </a>`).join('') : '<div class="empty"><b>Пока пусто</b>Здесь появятся напоминания, новые объявления и отчёты</div>'}</div>
    ${list.length ? '<button class="btn danger block mt" data-clear>Очистить ленту</button>' : ''}`;
  root.querySelector('[data-perm]')?.addEventListener('click', async () => { await askPermission(); draw(); });
  root.querySelector('[data-all]')?.addEventListener('click', async () => { await db.putMany('notifications', list.map(n => ({ ...n, read: true }))); });
  root.querySelector('[data-clear]')?.addEventListener('click', async () => { await db.clear('notifications'); });
  root.querySelectorAll('[data-id]').forEach(a => a.addEventListener('click', async () => { const n = list.find(x => x.id === a.dataset.id); if (n && !n.read) await db.put('notifications', { ...n, read: true }); }));
}
