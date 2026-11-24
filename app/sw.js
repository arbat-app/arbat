// Service Worker: офлайн-режим и открытие приложения по нажатию на уведомление.
const VERSION = 'arbat-v4';
const CORE = [
  './', './index.html', './manifest.webmanifest', './css/app.css', './icons/icon.svg', './icons/icon-192.png', './icons/icon-180.png',
  './js/app.js', './js/db.js', './js/ui.js', './js/util.js', './js/events.js', './js/nlp.js', './js/assistant.js', './js/ai.js',
  './js/speech.js', './js/notify.js', './js/krisha.js', './js/ig.js', './js/wake.js',
  './js/views/home.js', './js/views/calendar.js', './js/views/krisha.js', './js/views/instagram.js', './js/views/assistant.js',
  './js/views/notifications.js', './js/views/settings.js', './js/views/event-sheet.js',
];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Свои файлы: сначала сеть (обновления приходят сразу), без сети — из кэша
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin === location.origin) {
    e.respondWith(fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }).then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html'))));
  } else if (/cdn\.jsdelivr\.net/.test(url.host)) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return res; })));
  }
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const link = e.notification.data?.link || '#/home';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const c = list[0];
    if (c) { c.postMessage({ link }); return c.focus(); }
    return self.clients.openWindow('./' + link);
  }));
});
