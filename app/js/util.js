// Даты, числа, форматирование — всё на русском.
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
export const pad = n => String(n).padStart(2, '0');
export const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => ymd(new Date());
export function parseYmd(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
export function addDays(s, n) { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
export const toMin = t => { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
export const fromMin = m => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
export const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
export function eventStart(e) { const d = parseYmd(e.date); const m = toMin(e.start) ?? 0; d.setHours(Math.floor(m / 60), m % 60, 0, 0); return d; }

export const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
export const WD_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
export const WD = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

export function humanDate(s, { withWeekday = true } = {}) {
  const t = today();
  if (s === t) return 'Сегодня';
  if (s === addDays(t, 1)) return 'Завтра';
  if (s === addDays(t, -1)) return 'Вчера';
  if (s === addDays(t, 2)) return 'Послезавтра';
  const d = parseYmd(s);
  const base = `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
  return withWeekday ? `${base}, ${WD[d.getDay()]}` : base;
}
export function longDate(d = new Date()) { return `${WD[d.getDay()]}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`; }
export function timeAgo(ts) {
  const diff = Math.round((Date.now() - ts) / 60000);
  if (diff < 1) return 'только что';
  if (diff < 60) return `${diff} мин назад`;
  const h = Math.round(diff / 60);
  if (h < 24) return `${h} ч назад`;
  return dateTime(ts);
}
export function dateTime(ts) { const d = new Date(ts); return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`; }
export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
export function duration(min) {
  if (min < 60) return `${min} мин`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}
export function untilText(ms) {
  const m = Math.round(ms / 60000);
  if (m <= 0) return 'сейчас';
  if (m < 60) return `через ${m} мин`;
  const h = Math.floor(m / 60), r = m % 60;
  if (h < 24) return `через ${h} ч${r ? ` ${r} мин` : ''}`;
  const d = Math.round(h / 24);
  return `через ${d} ${plural(d, 'день', 'дня', 'дней')}`;
}
const nf = new Intl.NumberFormat('ru-RU');
export const isNum = v => typeof v === 'number' && isFinite(v);
export const num = v => isNum(v) ? nf.format(Math.round(v * 100) / 100) : '—';
export function compact(v) {
  if (!isNum(v)) return '—';
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace('.', ',')} млн`;
  if (Math.abs(v) >= 1e4) return `${(v / 1e3).toFixed(v >= 1e5 ? 0 : 1).replace('.', ',')} тыс.`;
  return nf.format(Math.round(v));
}
export function money(v, cur = 'KZT') {
  if (!isNum(v)) return '—';
  const n = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: v < 100 ? 2 : 0 }).format(v);
  if (cur === 'USD') return `$${n}`;
  const sign = { KZT: '₸', RUB: '₽', EUR: '€' }[cur] || cur;
  return `${n} ${sign}`;
}
export const pct = v => isNum(v) ? `${(v * 100).toFixed(v < 0.1 ? 2 : 1).replace('.', ',')}%` : '—';
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
