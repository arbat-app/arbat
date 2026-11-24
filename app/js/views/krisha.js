// Krisha.kz: лента объявлений от хозяев, поиски с расписанием, подключение кнопки «В Арбат».
import { db } from '../db.js';
import { icon, sheet, toast, formData, segmented, bindSegmented, confirmSheet } from '../ui.js';
import { CITIES, CATEGORIES, SECTIONS, searchUrl, bookmarklet, importItems, inPeriod } from '../krisha.js';
import { openEventSheet } from './event-sheet.js';
import { esc, uid, timeAgo, humanDate, today, addDays } from '../util.js';

let root, tab = 'feed', filter = 'all', period = 'all', searchFilter = 'all';
const appUrl = () => location.href.split('#')[0];

export async function render(el, params) {
  root = el;
  if (params.run || params.tab === 'searches') tab = params.run ? 'feed' : 'searches';
  root.innerHTML = `
    <div class="header-row"><h1 class="large-title">Krisha.kz</h1>
      <div class="header-actions"><button class="icon-btn" data-paste aria-label="Вставить из буфера">${icon('download')}</button></div></div>
    <p class="subtitle">Только объявления от собственников, без дубликатов</p>
    ${segmented('tab', [['feed', 'Лента'], ['searches', 'Поиски'], ['setup', 'Подключение']], tab)}
    <div data-run></div>
    <div data-body class="mt"></div>`;
  bindSegmented(root, (n, v) => { tab = v; draw(); });
  root.querySelector('[data-paste]').onclick = pasteImport;
  if (params.run) {
    const s = await db.get('searches', params.run);
    if (s) root.querySelector('[data-run]').innerHTML = `<div class="card mt hstack"><span class="icon-badge dark">${icon('clock')}</span><div class="grow"><b>Время проверить «${esc(s.name)}»</b><div class="caption">Откройте поиск и нажмите закладку «В Арбат»</div></div><a class="btn small" target="_blank" rel="noopener" href="${esc(searchUrl(s))}">Открыть</a></div>`;
  }
  await draw(params.l);
  return () => markSeen();
}
export const refresh = store => { if (['listings', 'searches'].includes(store)) draw(); };

async function markSeen() {
  const ls = (await db.all('listings')).filter(l => !l.seen && l.shown);
  if (ls.length) await db.putMany('listings', ls.map(l => ({ ...l, seen: true, shown: false })));
}

async function draw(focusId) {
  const body = root.querySelector('[data-body]');
  if (tab === 'feed') await drawFeed(body, focusId);
  if (tab === 'searches') await drawSearches(body);
  if (tab === 'setup') drawSetup(body);
}

// ── Лента ──
async function drawFeed(body, focusId) {
  const [listings, searches] = await Promise.all([db.all('listings'), db.all('searches')]);
  let list = listings.filter(l => !l.hidden || filter === 'hidden').sort((a, b) => b.foundAt - a.foundAt);
  if (filter === 'new') list = list.filter(l => !l.seen);
  if (filter === 'fav') list = list.filter(l => l.favorite);
  if (filter === 'hidden') list = listings.filter(l => l.hidden);
  if (searchFilter !== 'all') list = list.filter(l => (l.searchIds || []).includes(searchFilter));
  if (period !== 'all') list = list.filter(l => inPeriod(l.pubDate || isoDay(l.foundAt), period === '7' || period === '3' ? 'days' : period, Number(period)));
  body.innerHTML = `
    <div class="scroll-x" data-f>
      ${[['all', 'Все'], ['new', 'Новые'], ['fav', 'Избранное'], ['hidden', 'Скрытые']].map(([k, l]) => `<button class="chip ${filter === k ? 'on' : ''}" data-filter="${k}">${l}</button>`).join('')}
    </div>
    <div class="scroll-x mt" data-p>
      ${[['all', 'За всё время'], ['today', 'Сегодня'], ['yesterday', 'Вчера'], ['3', '3 дня'], ['7', '7 дней']].map(([k, l]) => `<button class="chip ${period === k ? 'on' : ''}" data-period="${k}">${l}</button>`).join('')}
      ${searches.length > 1 ? `<select class="select" style="height:34px;min-height:34px;padding:0 34px 0 12px;width:auto;border-radius:17px;font-size:15px;background-position:calc(100% - 18px) 15px,calc(100% - 13px) 15px" data-sf><option value="all">Все поиски</option>${searches.map(s => `<option value="${s.id}" ${searchFilter === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>` : ''}
    </div>
    <div class="mt" data-list>
      ${list.length ? list.map(listingCard).join('') : `<div class="card empty"><b>${listings.length ? 'Ничего не найдено по фильтру' : 'Объявлений пока нет'}</b>${listings.length ? '' : 'Создайте поиск, откройте его на Krisha и нажмите закладку «В Арбат» — объявления от хозяев появятся здесь.'}
        ${listings.length ? '' : `<div class="btn-row mt"><button class="btn" data-go="searches">Создать поиск</button><button class="btn tinted" data-go="setup">Как подключить</button></div>`}</div>`}
    </div>`;
  body.querySelector('[data-f]').onclick = e => { const b = e.target.closest('[data-filter]'); if (b) { filter = b.dataset.filter; drawFeed(body); } };
  body.querySelector('[data-p]').onclick = e => { const b = e.target.closest('[data-period]'); if (b) { period = b.dataset.period; drawFeed(body); } };
  body.querySelector('[data-sf]')?.addEventListener('change', e => { searchFilter = e.target.value; drawFeed(body); });
  body.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { tab = b.dataset.go; render(root, {}); });
  body.querySelector('[data-list]').onclick = onListingAction;
  const unseen = list.filter(l => !l.seen && !l.shown);
  if (unseen.length) db.putMany('listings', unseen.map(l => ({ ...l, shown: true })));
  if (focusId) body.querySelector(`[data-lid="${CSS.escape(focusId)}"]`)?.scrollIntoView({ block: 'center' });
}
const isoDay = ts => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function listingCard(l) {
  return `<article class="listing" data-lid="${esc(l.id)}">
    <a class="listing-photo" href="${esc(l.url)}" target="_blank" rel="noopener" style="background-image:url('${esc(l.photo)}')" aria-label="Открыть на Krisha">${!l.seen ? '<span class="badge">Новое</span>' : ''}</a>
    <div class="listing-body grow">
      <div class="listing-price">${esc(l.priceText || '—')}</div>
      <div class="listing-title">${esc(l.title)}</div>
      <div class="listing-addr">${esc([l.city, l.address].filter(Boolean).join(', '))}</div>
      ${l.description ? `<div class="listing-text">${esc(l.description)}</div>` : ''}
      ${(l.priceHistory || []).length ? `<div class="caption" style="color:var(--warn)">Цена менялась: ${l.priceHistory.map(p => p.price?.toLocaleString('ru-RU')).join(' → ')}</div>` : ''}
      <div class="caption mt">Опубликовано: ${l.pubDate ? humanDate(l.pubDate, { withWeekday: false }).toLowerCase() : 'нет данных'} · найдено ${timeAgo(l.foundAt)}</div>
      <div class="listing-foot">
        <span class="badge olive">Хозяин</span>
        <div class="hstack">
          <button class="icon-btn" data-act="fav" data-id="${esc(l.id)}" aria-label="В избранное" style="${l.favorite ? 'background:var(--olive);color:var(--on-olive)' : ''}">${icon('star')}</button>
          <button class="icon-btn" data-act="show" data-id="${esc(l.id)}" aria-label="Назначить показ">${icon('calendar')}</button>
          <button class="icon-btn" data-act="hide" data-id="${esc(l.id)}" aria-label="${l.hidden ? 'Вернуть' : 'Скрыть'}">${icon(l.hidden ? 'eye' : 'trash')}</button>
          <a class="btn small" href="${esc(l.url)}" target="_blank" rel="noopener">Krisha</a>
        </div>
      </div>
    </div>
  </article>`;
}

async function onListingAction(e) {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const l = await db.get('listings', b.dataset.id);
  if (!l) return;
  if (b.dataset.act === 'fav') { l.favorite = !l.favorite; await db.put('listings', l); }
  if (b.dataset.act === 'hide') { l.hidden = !l.hidden; await db.put('listings', l); toast(l.hidden ? 'Скрыто' : 'Возвращено в ленту'); }
  if (b.dataset.act === 'show') {
    openEventSheet(null, { type: 'call', date: today(), title: `Собственник: ${l.title}`, location: l.address, notes: `${l.priceText}\n${l.url}` });
  }
}

async function pasteImport() {
  try {
    const text = await navigator.clipboard.readText();
    const data = JSON.parse(text);
    const r = await importItems(data);
    toast(resultText(r));
    tab = 'feed'; draw();
  } catch (e) {
    toast('В буфере нет данных «В Арбат». Сначала нажмите закладку на странице Krisha.');
  }
}
const resultText = r => `Новых: ${r.added}${r.dup ? `, уже были: ${r.dup}` : ''}${r.skippedFilter ? `, не подошли под фильтры: ${r.skippedFilter}` : ''}`;

// ── Поиски ──
async function drawSearches(body) {
  const searches = (await db.all('searches')).sort((a, b) => a.createdAt - b.createdAt);
  const listings = await db.all('listings');
  body.innerHTML = `
    ${searches.length ? `<div class="list">${searches.map(s => `<div class="row" style="align-items:flex-start">
      <div class="row-main">
        <div class="row-title" style="font-weight:600">${esc(s.name)}</div>
        <div class="row-sub" style="white-space:normal">${esc(summary(s))}</div>
        <div class="caption">${s.times?.length ? `Проверка: ${s.times.join(', ')}` : 'Без расписания'} · найдено ${listings.filter(l => (l.searchIds || []).includes(s.id)).length}${s.lastImport ? ` · обновлено ${timeAgo(s.lastImport)}` : ''}</div>
        <div class="btn-row mt">
          <a class="btn small" target="_blank" rel="noopener" href="${esc(searchUrl(s))}">${icon('link')}Открыть на Krisha</a>
          <button class="btn small gray" data-edit="${s.id}">Изменить</button>
        </div>
      </div>
      <label class="switch" aria-label="Активен"><input type="checkbox" data-toggle="${s.id}" ${s.active !== false ? 'checked' : ''}><span></span></label>
    </div>`).join('')}</div>` : '<div class="card empty"><b>Поисков пока нет</b>Задайте параметры — приложение построит ссылку поиска «от хозяев» и будет напоминать о проверке по расписанию</div>'}
    <button class="btn block mt" data-new>${icon('plus')}Новый поиск</button>
    <p class="footnote">Krisha.kz защищена от автоматических запросов, поэтому приложение не обращается к сайту само. В назначенное время придёт напоминание: откройте поиск и нажмите закладку «В Арбат» — новые объявления попадут в ленту, дубликаты отсеются.</p>`;
  body.querySelector('[data-new]').onclick = () => editSearch();
  body.querySelectorAll('[data-edit]').forEach(b => b.onclick = async () => editSearch(await db.get('searches', b.dataset.edit)));
  body.querySelectorAll('[data-toggle]').forEach(c => c.onchange = async () => { const s = await db.get('searches', c.dataset.toggle); s.active = c.checked; await db.put('searches', s); });
}

function summary(s) {
  const city = CITIES[s.city]?.name || '';
  const dist = s.district ? CITIES[s.city]?.districts[s.district] + ' р-н' : '';
  const parts = [SECTIONS[s.section], CATEGORIES[s.category]?.name, [city, dist].filter(Boolean).join(', ')];
  if (s.rooms?.length) parts.push(`${s.rooms.map(r => r === '5' ? '5+' : r).join(', ')}-комн.`);
  if (s.priceFrom || s.priceTo) parts.push(`цена ${s.priceFrom ? 'от ' + Number(s.priceFrom).toLocaleString('ru-RU') : ''} ${s.priceTo ? 'до ' + Number(s.priceTo).toLocaleString('ru-RU') : ''} ₸`.replace(/\s+/g, ' '));
  if (s.areaFrom || s.areaTo) parts.push(`площадь ${s.areaFrom ? 'от ' + s.areaFrom : ''} ${s.areaTo ? 'до ' + s.areaTo : ''} м²`.replace(/\s+/g, ' '));
  parts.push({ today: 'за сегодня', yesterday: 'за вчера', days: `за ${s.days || 3} дн.`, all: 'за всё время' }[s.period || 'all']);
  return parts.filter(Boolean).join(' · ');
}

async function editSearch(existing) {
  const s = existing || { id: uid(), name: '', section: 'prodazha', category: 'kvartiry', city: 'almaty', district: '', rooms: [], priceFrom: '', priceTo: '', areaFrom: '', areaTo: '', period: 'today', days: 3, times: ['09:00', '13:00', '18:00'], active: true, createdAt: Date.now() };
  const districtOptions = city => `<option value="">Весь город</option>${Object.entries(CITIES[city]?.districts || {}).map(([k, v]) => `<option value="${k}" ${s.district === k ? 'selected' : ''}>${v} р-н</option>`).join('')}`;
  const ok = await sheet({
    title: existing ? 'Поиск' : 'Новый поиск', doneText: 'Сохранить',
    body: `<form class="form" onsubmit="return false">
      <label class="field"><span>Название</span><input class="input" name="name" value="${esc(s.name)}" placeholder="2-комн. Бостандыкский до 60 млн" autofocus></label>
      ${segmented('section', Object.entries(SECTIONS), s.section)}
      <div class="grid-2">
        <label class="field"><span>Тип недвижимости</span><select class="select" name="category">${Object.entries(CATEGORIES).map(([k, c]) => `<option value="${k}" ${s.category === k ? 'selected' : ''}>${c.name}</option>`).join('')}</select></label>
        <label class="field"><span>Город / регион</span><select class="select" name="city">${Object.entries(CITIES).map(([k, c]) => `<option value="${k}" ${s.city === k ? 'selected' : ''}>${c.name}</option>`).join('')}</select></label>
      </div>
      <label class="field" data-district><span>Район</span><select class="select" name="district">${districtOptions(s.city)}</select></label>
      <div class="field" data-rooms><span>Комнат</span><div class="chips">${['1', '2', '3', '4', '5'].map(r => `<button type="button" class="chip ${s.rooms.includes(r) ? 'on' : ''}" data-room="${r}">${r === '5' ? '5+' : r}</button>`).join('')}</div></div>
      <div class="grid-2">
        <label class="field"><span>Цена от, ₸</span><input class="input" inputmode="numeric" name="priceFrom" value="${esc(s.priceFrom)}" placeholder="0"></label>
        <label class="field"><span>Цена до, ₸</span><input class="input" inputmode="numeric" name="priceTo" value="${esc(s.priceTo)}" placeholder="60 000 000"></label>
      </div>
      <div class="grid-2" data-area>
        <label class="field"><span>Площадь от, м²</span><input class="input" inputmode="decimal" name="areaFrom" value="${esc(s.areaFrom)}"></label>
        <label class="field"><span>Площадь до, м²</span><input class="input" inputmode="decimal" name="areaTo" value="${esc(s.areaTo)}"></label>
      </div>
      <label class="field"><span>Дата публикации</span>${segmented('period', [['today', 'Сегодня'], ['yesterday', 'Вчера'], ['days', 'N дней'], ['all', 'Все']], s.period)}</label>
      <label class="field" data-days ${s.period === 'days' ? '' : 'hidden'}><span>Количество дней</span><input class="input" type="number" min="1" max="60" name="days" value="${esc(s.days)}"></label>
      <label class="field"><span>Время проверок (через запятую)</span><input class="input" name="times" value="${esc((s.times || []).join(', '))}" placeholder="09:00, 13:00, 18:00"></label>
      <div class="chips" data-presets>
        <button type="button" class="chip" data-preset="09:00">Раз в день</button>
        <button type="button" class="chip" data-preset="09:00, 13:00, 18:00">3 раза</button>
        <button type="button" class="chip" data-preset="09:00, 11:00, 13:00, 15:00, 17:00, 19:00">Каждые 2 часа</button>
      </div>
      ${existing ? '<button type="button" class="btn danger block" data-del>Удалить поиск</button>' : ''}
    </form>`,
    onMount: (b, close) => {
      bindSegmented(b, (n, v) => { if (n === 'period') b.querySelector('[data-days]').hidden = v !== 'days'; });
      const rooms = new Set(s.rooms);
      b.querySelector('[data-rooms]').onclick = e => { const c = e.target.closest('[data-room]'); if (!c) return; rooms.has(c.dataset.room) ? rooms.delete(c.dataset.room) : rooms.add(c.dataset.room); c.classList.toggle('on'); };
      b._rooms = rooms;
      const cityEl = b.querySelector('[name=city]'), catEl = b.querySelector('[name=category]');
      const sync = () => {
        b.querySelector('[data-district]').hidden = !Object.keys(CITIES[cityEl.value]?.districts || {}).length;
        b.querySelector('[data-rooms]').hidden = !CATEGORIES[catEl.value].rooms;
        b.querySelector('[data-area]').hidden = !CATEGORIES[catEl.value].area;
      };
      cityEl.onchange = () => { b.querySelector('[name=district]').innerHTML = districtOptions(cityEl.value); sync(); };
      catEl.onchange = sync;
      sync();
      b.querySelector('[data-presets]').onclick = e => { const p = e.target.closest('[data-preset]'); if (p) b.querySelector('[name=times]').value = p.dataset.preset; };
      b.querySelector('[data-del]')?.addEventListener('click', async () => { if (await confirmSheet(`Удалить поиск «${s.name}»? Найденные объявления останутся.`)) { await db.del('searches', s.id); close(false); } });
    },
    done: async b => {
      const f = formData(b);
      const times = f.times.split(/[,\s]+/).map(t => t.trim()).filter(t => /^\d{1,2}:\d{2}$/.test(t)).map(t => t.padStart(5, '0')).sort();
      const num = v => v.replace(/[^\d.]/g, '');
      Object.assign(s, {
        section: f.section, category: f.category, city: f.city, district: CITIES[f.city]?.districts[f.district] ? f.district : '',
        rooms: CATEGORIES[f.category].rooms ? [...b._rooms].sort() : [], priceFrom: num(f.priceFrom), priceTo: num(f.priceTo),
        areaFrom: num(f.areaFrom), areaTo: num(f.areaTo), period: f.period, days: Number(f.days) || 3, times,
      });
      s.name = f.name || summary(s).split(' · ').slice(1, 4).join(' · ');
      await db.put('searches', s);
      toast('Поиск сохранён');
      return true;
    },
  });
  if (ok) drawSearches(root.querySelector('[data-body]'));
}

// ── Подключение ──
function drawSetup(body) {
  const code = bookmarklet(appUrl());
  body.innerHTML = `
    <div class="card">
      <div class="card-title">Кнопка «В Арбат»</div>
      <p style="margin:0 0 12px">Закладка в браузере за одно нажатие переносит все объявления от хозяев с открытой страницы Krisha в вашу ленту: фото, цену, адрес, описание, дату публикации и ссылку.</p>
      <div class="hstack wrap"><a class="bookmarklet" href="${esc(code)}" onclick="event.preventDefault();alert('Перетащите эту кнопку на панель закладок')">${icon('download')}В Арбат</a><span class="caption">← на компьютере перетащите на панель закладок</span></div>
    </div>
    <div class="card">
      <div class="card-title">На iPhone (Safari)</div>
      <ol class="steps">
        <li>Нажмите «Скопировать код» ниже.</li>
        <li>Откройте любую страницу в Safari → «Поделиться» → «Добавить закладку», назовите «В Арбат».</li>
        <li>Откройте «Закладки» → «Изменить» → выберите «В Арбат» и вставьте скопированный код в поле адреса.</li>
        <li>На странице поиска Krisha откройте закладки и нажмите «В Арбат».</li>
      </ol>
      <div class="code mt" data-code>${esc(code)}</div>
      <button class="btn tinted block mt" data-copy>Скопировать код</button>
      <p class="footnote" style="margin-left:0">Если «Арбат» установлен на экран «Домой», закладка ещё и копирует данные. Тогда откройте «Арбат» → Krisha → кнопка ${icon('download').replace('<svg', '<svg style="width:14px;height:14px;vertical-align:-2px"')} «Вставить».</p>
    </div>
    <div class="card">
      <div class="card-title">Уведомления от самой Krisha</div>
      <p style="margin:0">На Krisha.kz откройте поиск, включите фильтр «От хозяев» и нажмите «Подписаться на поиск». Krisha будет присылать уведомления о новых объявлениях — откройте ссылку и нажмите «В Арбат». На этапе 2 подключим автоматический перенос из почты.</p>
    </div>`;
  body.querySelector('[data-copy]').onclick = async () => { await navigator.clipboard.writeText(code); toast('Код скопирован'); };
}

// ── Приём данных от закладки ──
export async function renderImport(el, params) {
  root = el;
  let r, err = '';
  try {
    const data = JSON.parse(params.d || '{}');
    r = await importItems(data);
  } catch (e) { err = e.message; }
  history.replaceState(null, '', '#/import');
  el.innerHTML = `<h1 class="large-title">Импорт с Krisha</h1>
    <div class="card mt">${err ? `<b>Не удалось прочитать данные</b><p class="caption">${esc(err)}</p>` : `
      <div class="stat-grid">
        <div class="stat"><div class="v">${r.added}</div><div class="l">новых от хозяев</div></div>
        <div class="stat"><div class="v">${r.dup}</div><div class="l">уже были (дубликаты)</div></div>
      </div>
      ${r.skippedFilter ? `<p class="footnote">Не подошли под ваши поиски: ${r.skippedFilter}</p>` : ''}`}
      <a class="btn block mt" href="#/krisha">Открыть ленту</a>
    </div>`;
  tab = 'feed'; filter = r?.added ? 'new' : 'all';
}
