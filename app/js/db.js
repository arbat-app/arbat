// IndexedDB: все данные хранятся на устройстве пользователя.
const DB_NAME = 'arbat';
const DB_VERSION = 1;
const STORES = {
  events: 'id', searches: 'id', listings: 'id', reels: 'id', reports: 'id',
  notifications: 'id', chat: 'id', settings: 'key',
};
let dbp;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const idb = req.result;
      for (const [name, keyPath] of Object.entries(STORES)) {
        if (!idb.objectStoreNames.contains(name)) idb.createObjectStore(name, { keyPath });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}
function run(store, mode, fn) {
  return open().then(idb => new Promise((resolve, reject) => {
    const t = idb.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    const r = fn(s);
    if (r && 'onsuccess' in r) r.onsuccess = () => { result = r.result; };
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

const listeners = new Set();
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(store) { listeners.forEach(fn => { try { fn(store); } catch (e) { console.error(e); } }); }

export const db = {
  all: store => run(store, 'readonly', s => s.getAll()),
  get: (store, key) => run(store, 'readonly', s => s.get(key)),
  async put(store, value) { await run(store, 'readwrite', s => { s.put(value); }); emit(store); return value; },
  async putMany(store, values) { if (!values.length) return values; await run(store, 'readwrite', s => { values.forEach(v => s.put(v)); }); emit(store); return values; },
  async del(store, key) { await run(store, 'readwrite', s => { s.delete(key); }); emit(store); },
  async clear(store) { await run(store, 'readwrite', s => { s.clear(); }); emit(store); },
  stores: Object.keys(STORES),
};

// Настройки
const DEFAULTS = {
  name: '', workStart: '09:00', workEnd: '19:00', morningTime: '08:30', eveningTime: '20:00',
  theme: 'system', voiceReplies: true, aiProvider: 'none', aiKey: '', aiModel: '',
  igToken: '', igApi: '', igUserId: '', igUsername: '', igTokenSavedAt: 0,
  adAccountId: '', currency: 'KZT', pinHash: '', pinSalt: '',
  lastMorning: '', lastEvening: '',
};
const SECRET_KEYS = ['aiKey', 'igToken', 'pinHash', 'pinSalt'];
let cache = null;
export async function settings() {
  if (cache) return cache;
  const rows = await db.all('settings');
  cache = { ...DEFAULTS };
  rows.forEach(r => { cache[r.key] = r.value; });
  return cache;
}
export async function setSetting(key, value) {
  await settings();
  cache[key] = value;
  await db.put('settings', { key, value });
}

export async function exportAll() {
  const out = { app: 'arbat', version: 1, exportedAt: new Date().toISOString(), data: {} };
  for (const s of db.stores) out.data[s] = await db.all(s);
  // Ключи и PIN не попадают в резервную копию
  out.data.settings = out.data.settings.filter(r => !SECRET_KEYS.includes(r.key));
  return out;
}
export async function importAll(json) {
  if (!json || json.app !== 'arbat' || !json.data) throw new Error('Это не резервная копия «Арбата»');
  for (const s of db.stores) {
    if (Array.isArray(json.data[s])) await db.putMany(s, json.data[s].filter(r => s !== 'settings' || !SECRET_KEYS.includes(r.key)));
  }
  cache = null;
}
