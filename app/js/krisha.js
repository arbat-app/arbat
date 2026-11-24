// Krisha.kz: построение ссылки поиска «от хозяев», импорт со страницы, фильтры, дубликаты.
// Сайт защищён антиботом, поэтому сервер его не опрашивает: данные берутся
// со страницы, которую пользователь сам открыл в своём браузере.
import { db } from './db.js';
import { notify } from './notify.js';
import { today, addDays, ymd } from './util.js';

export const CITIES = {
  almaty: { name: 'Алматы', districts: {
    'almaty-alatauskij': 'Алатауский', 'almaty-almalinskij': 'Алмалинский', 'almaty-aujezovskij': 'Ауэзовский',
    'almaty-bostandykskij': 'Бостандыкский', 'almaty-zhetysuskij': 'Жетысуский', 'almaty-medeuskij': 'Медеуский',
    'almaty-nauryzbajskiy': 'Наурызбайский', 'almaty-turksibskij': 'Турксибский',
  } },
  astana: { name: 'Астана', districts: {} },
  shymkent: { name: 'Шымкент', districts: {} },
  'almatinskaja-oblast': { name: 'Алматинская обл.', districts: {} },
  'karagandinskaja-oblast': { name: 'Карагандинская обл.', districts: {} },
  'mangistauskaja-oblast': { name: 'Мангистауская обл.', districts: {} },
  'atyrauskaja-oblast': { name: 'Атырауская обл.', districts: {} },
  'aktjubinskaja-oblast': { name: 'Актюбинская обл.', districts: {} },
};
export const CATEGORIES = {
  kvartiry: { name: 'Квартиры', rooms: true, area: 'live.square' },
  'doma-dachi': { name: 'Дома и дачи', rooms: true, area: 'live.square' },
  uchastkov: { name: 'Участки', rooms: false, area: null },
  'kommercheskaya-nedvizhimost': { name: 'Коммерческая', rooms: false, area: null },
};
export const SECTIONS = { prodazha: 'Продажа', arenda: 'Аренда' };

export function searchUrl(s) {
  const region = s.district || s.city || 'almaty';
  const parts = ['das[who]=1'];
  const cat = CATEGORIES[s.category] || CATEGORIES.kvartiry;
  if (cat.rooms && s.rooms?.length) s.rooms.forEach(r => parts.push(`das[live.rooms][]=${r === '5' ? '5.100' : r}`));
  if (s.priceFrom) parts.push(`das[price][from]=${s.priceFrom}`);
  if (s.priceTo) parts.push(`das[price][to]=${s.priceTo}`);
  if (cat.area && s.areaFrom) parts.push(`das[${cat.area}][from]=${s.areaFrom}`);
  if (cat.area && s.areaTo) parts.push(`das[${cat.area}][to]=${s.areaTo}`);
  return `https://krisha.kz/${s.section || 'prodazha'}/${s.category || 'kvartiry'}/${region}/?${parts.join('&')}`;
}

// ── Кнопка-закладка «В Арбат» ──
export function bookmarklet(appUrl) {
  const code = `(()=>{const A=${JSON.stringify(appUrl)};const T=(r,s)=>(r.querySelector(s)?.textContent||'').replace(/\\s+/g,' ').trim();const M=n=>document.querySelector('meta[property="'+n+'"]')?.content||'';let items=[];const cards=[...document.querySelectorAll('.a-card[data-id]')];if(cards.length){items=cards.map(c=>({id:c.dataset.id,o:(c.querySelector('.label-user-owner,.user-label-owner')||c.querySelector('.user-owner'))?1:0,t:T(c,'.a-card__title'),p:T(c,'.a-card__price'),a:T(c,'.a-card__subtitle'),d:T(c,'.a-card__text-preview').slice(0,500),i:c.querySelector('picture[data-full-src]')?.dataset.fullSrc||c.querySelector('img')?.src||'',s:[...c.querySelectorAll('.a-card__stats-item')].map(x=>x.textContent.trim()).join('|')}))}else{const m=location.pathname.match(/\\/a\\/show\\/(\\d+)/);if(m){const ph=[...new Set([...document.querySelectorAll('[data-photo-url],img[src*="krisha-photos"],picture[data-full-src]')].map(x=>x.dataset.photoUrl||x.dataset.fullSrc||x.src))].slice(0,12);items=[{id:m[1],o:/Хозяин недвижимости|Собственник/.test(document.body.innerText)?1:0,t:T(document,'h1')||M('og:title'),p:T(document,'.offer__price')||T(document,'.offer__sidebar-header .offer__price'),a:T(document,'.offer__location')||T(document,'.offer__advert-title'),d:(T(document,'.js-description')||T(document,'.offer__description')||M('og:description')).slice(0,2000),i:M('og:image')||ph[0]||'',ph,s:T(document,'.offer__date')||T(document,'.a-nb-views')||''}]}}if(!items.length){alert('Арбат: на этой странице нет объявлений Krisha');return}const own=items.filter(x=>x.o);const data=JSON.stringify({v:1,src:location.href,at:Date.now(),items:own});try{navigator.clipboard&&navigator.clipboard.writeText(data)}catch(e){}const url=A+'#/import?d='+encodeURIComponent(data);if(url.length>60000){alert('Арбат: скопировано '+own.length+' объявл. Откройте Арбат → Krisha → «Вставить»');return}const w=window.open(url,'arbat');if(!w)location.href=url})()`;
  return 'javascript:' + encodeURI(code).replace(/#/g, '%23');
}

// ── Разбор данных карточки ──
const MON = { 'янв': 0, 'фев': 1, 'мар': 2, 'апр': 3, 'мая': 4, 'май': 4, 'июн': 5, 'июл': 6, 'авг': 7, 'сен': 8, 'окт': 9, 'ноя': 10, 'дек': 11 };
export function parseKrishaDate(str, now = new Date()) {
  if (!str) return null;
  const s = str.toLowerCase();
  if (/сегодня/.test(s)) return ymd(now);
  if (/вчера/.test(s)) return addDays(ymd(now), -1);
  const m = s.match(/(\d{1,2})\s+(янв|фев|мар|апр|мая|май|июн|июл|авг|сен|окт|ноя|дек)/);
  if (!m) return null;
  let d = new Date(now.getFullYear(), MON[m[2]], Number(m[1]));
  if (d > new Date(now.getTime() + 86400000)) d = new Date(now.getFullYear() - 1, MON[m[2]], Number(m[1]));
  return ymd(d);
}
export function parsePrice(str) {
  if (!str) return null;
  const s = str.replace(/\u00a0/g, ' ');
  const mln = s.match(/([\d.,]+)\s*млн/);
  if (mln) return Math.round(parseFloat(mln[1].replace(',', '.')) * 1e6);
  const digits = s.replace(/[^\d]/g, '');
  return digits ? Number(digits) : null;
}
export function parseTitle(t) {
  const rooms = t.match(/(\d+)-комнатн/)?.[1];
  const area = t.match(/([\d.,]+)\s*м²/)?.[1];
  return { rooms: rooms ? Number(rooms) : null, area: area ? parseFloat(area.replace(',', '.')) : null };
}

export function normalizeItem(x, now = new Date()) {
  const { rooms, area } = parseTitle(x.t || '');
  const statParts = (x.s || '').split('|').map(p => p.trim()).filter(Boolean);
  const pubDate = statParts.map(p => parseKrishaDate(p, now)).find(Boolean) || null;
  const city = statParts.find(p => !parseKrishaDate(p, now) && !/\d/.test(p)) || '';
  const priceNum = parsePrice(x.p);
  return {
    id: String(x.id), url: `https://krisha.kz/a/show/${x.id}`, title: x.t || 'Объявление', priceText: (x.p || '').replace(/\s+/g, ' ').trim(),
    price: priceNum, address: x.a || '', city, description: x.d || '', photo: x.i || '', photos: x.ph || (x.i ? [x.i] : []),
    rooms, area, pubDate, owner: !!x.o,
  };
}

export function matches(l, s) {
  if (s.rooms?.length && l.rooms != null) {
    const ok = s.rooms.some(r => r === '5' ? l.rooms >= 5 : Number(r) === l.rooms);
    if (!ok) return false;
  }
  if (s.priceFrom && l.price != null && l.price < Number(s.priceFrom)) return false;
  if (s.priceTo && l.price != null && l.price > Number(s.priceTo)) return false;
  if (s.areaFrom && l.area != null && l.area < Number(s.areaFrom)) return false;
  if (s.areaTo && l.area != null && l.area > Number(s.areaTo)) return false;
  if (l.pubDate && !inPeriod(l.pubDate, s.period, s.days)) return false;
  return true;
}
export function inPeriod(date, period, days) {
  const t = today();
  if (period === 'today') return date === t;
  if (period === 'yesterday') return date === addDays(t, -1);
  if (period === 'days') return date >= addDays(t, -(Math.max(1, Number(days) || 3) - 1));
  return true;
}

// Импорт: только хозяева, без дубликатов, с привязкой к поискам
export async function importItems(payload) {
  const items = (payload.items || []).filter(x => x && x.id);
  const searches = (await db.all('searches')).filter(s => s.active !== false);
  const existing = new Map((await db.all('listings')).map(l => [l.id, l]));
  const now = Date.now();
  let added = 0, dup = 0, skippedOwner = 0, skippedFilter = 0;
  const fresh = [];
  for (const raw of items) {
    const l = normalizeItem(raw);
    if (!l.owner) { skippedOwner++; continue; }
    const matched = searches.filter(s => matches(l, s)).map(s => s.id);
    if (searches.length && !matched.length) { skippedFilter++; continue; }
    const old = existing.get(l.id);
    if (old) {
      dup++;
      // обновляем цену/описание, если изменились, но время обнаружения сохраняем
      const changed = old.price !== l.price;
      Object.assign(old, { ...l, foundAt: old.foundAt, seen: old.seen, favorite: old.favorite, hidden: old.hidden, searchIds: [...new Set([...(old.searchIds || []), ...matched])] });
      if (changed && old.price != null) old.priceHistory = [...(old.priceHistory || []), { price: l.price, at: now }];
      fresh.push(old);
      continue;
    }
    fresh.push({ ...l, foundAt: now, seen: false, favorite: false, hidden: false, searchIds: matched, source: payload.src || '' });
    added++;
  }
  await db.putMany('listings', fresh);
  if (added) {
    const first = fresh.find(f => !existing.has(f.id));
    await notify({ title: `Krisha: ${added} ${added === 1 ? 'новое объявление' : added < 5 ? 'новых объявления' : 'новых объявлений'} от хозяев`, body: first ? `${first.title} — ${first.priceText}` : '', type: 'krisha', link: '#/krisha' });
  }
  for (const s of searches) { s.lastImport = now; }
  await db.putMany('searches', searches);
  return { added, dup, skippedOwner, skippedFilter, total: items.length };
}
