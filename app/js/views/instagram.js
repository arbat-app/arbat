// Instagram: отчёт по ссылке на Reels (API), скриншоты с распознаванием, история и сравнение.
import { db, settings } from '../db.js';
import { icon, chev, sheet, toast, formData, confirmSheet, shareText } from '../ui.js';
import { ORGANIC, PAID, shortcodeOf, apiReport, ocrImages, parseInsightsText, derived, analyze } from '../ig.js';
import { aiEnabled, aiReelInsight } from '../ai.js';
import { notify } from '../notify.js';
import { esc, uid, dateTime, timeAgo, compact, num, money, pct, isNum } from '../util.js';

let root;
export async function render(el, params) {
  root = el;
  if (params.r) return drawReel(params.r);
  await drawList();
}
export const refresh = store => {
  if (!['reels', 'reports', 'settings'].includes(store)) return;
  const r = new URLSearchParams(location.hash.split('?')[1] || '').get('r');
  r ? drawReel(r) : drawList();
};

async function drawList() {
  const [s, reels, reports] = await Promise.all([settings(), db.all('reels'), db.all('reports')]);
  const byReel = id => reports.filter(r => r.reelId === id).sort((a, b) => b.createdAt - a.createdAt);
  reels.sort((a, b) => (byReel(b.id)[0]?.createdAt || b.createdAt) - (byReel(a.id)[0]?.createdAt || a.createdAt));
  root.innerHTML = `
    <h1 class="large-title">Instagram</h1>
    <p class="subtitle">${s.igToken ? `Подключено: @${esc(s.igUsername)} · ${s.igApi === 'facebook' ? `органика и реклама${s.adAccountId ? '' : ' (выберите рекламный аккаунт)'}` : 'органическая статистика'}` : 'Не подключено — работают отчёты по скриншотам'}</p>
    <div class="card">
      <form class="form" data-form>
        <label class="field"><span>Ссылка на Reels</span><input class="input" name="url" type="url" inputmode="url" placeholder="https://www.instagram.com/reel/…" required></label>
        <button class="btn block" type="submit">${icon('chart')}Получить отчёт</button>
      </form>
      <div class="btn-row mt">
        <button class="btn tinted" data-shots>${icon('camera')}Скриншоты</button>
        <button class="btn gray" data-manual>Вручную</button>
      </div>
      ${s.igToken ? '' : `<a class="row" href="#/settings?s=instagram" style="padding:12px 0 0"><div class="row-main"><div class="row-title" style="font-size:15px;color:var(--olive)">Подключить Instagram для автоматической статистики</div></div>${chev()}</a>`}
    </div>
    <div class="section-title">Ролики</div>
    ${reels.length ? `<div class="list">${reels.map(r => {
      const last = byReel(r.id)[0];
      return `<a class="row" href="#/instagram?r=${r.id}">
        <span class="icon-badge dark">${icon('chart')}</span>
        <div class="row-main"><div class="row-title">${esc(r.title || r.shortcode)}</div>
        <div class="row-sub">${last ? `${isNum(last.organic?.views) ? compact(last.organic.views) + ' просм.' : 'просмотры: нет данных'}${isNum(last.paid?.spend) ? ` · реклама ${money(last.paid.spend, last.paid.currency || s.currency)}` : ''} · ${timeAgo(last.createdAt)}` : 'Отчётов нет'}</div></div>
        <span class="row-end">${byReel(r.id).length}${chev()}</span></a>`;
    }).join('')}</div>` : '<div class="card empty"><b>Отчётов пока нет</b>Вставьте ссылку на ваш Reels и нажмите «Получить отчёт»</div>'}
    <p class="footnote">Данные берутся только из официального API Instagram или ваших скриншотов. Если показатель недоступен, в отчёте будет «нет данных», без подстановки цифр.</p>`;
  root.querySelector('[data-form]').onsubmit = async e => {
    e.preventDefault();
    const url = new FormData(e.target).get('url');
    const reel = await ensureReel(url);
    if (!reel) return toast('Это не похоже на ссылку на Reels или публикацию Instagram');
    await getReport(reel, e.submitter);
  };
  root.querySelector('[data-shots]').onclick = () => screenshotSheet(null);
  root.querySelector('[data-manual]').onclick = () => reviewSheet(null, {}, 'manual');
}

async function ensureReel(url) {
  const code = shortcodeOf(url);
  if (!code) return null;
  const all = await db.all('reels');
  let reel = all.find(r => r.shortcode === code);
  if (!reel) {
    reel = { id: uid(), shortcode: code, url: `https://www.instagram.com/reel/${code}/`, title: `Reels ${code}`, createdAt: Date.now() };
    await db.put('reels', reel);
  }
  return reel;
}

async function getReport(reel, btn) {
  const s = await settings();
  if (!s.igToken) {
    toast('Instagram не подключён — загрузите скриншоты статистики');
    return screenshotSheet(reel);
  }
  const label = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.textContent = 'Получаю статистику…'; }
  try {
    const rep = await apiReport(reel);
    await db.put('reports', rep);
    await notify({ title: 'Отчёт Instagram готов', body: `${reel.title}: ${isNum(rep.organic.views) ? compact(rep.organic.views) + ' просмотров' : 'данные получены'}`, type: 'instagram', link: `#/instagram?r=${reel.id}`, system: false });
    location.hash = `#/instagram?r=${reel.id}`;
  } catch (e) {
    toast(e.message, { ms: 6000, action: 'Скриншоты', onAction: () => screenshotSheet(reel) });
  } finally { if (btn) { btn.disabled = false; btn.innerHTML = label; } }
}

// ── Карточка ролика ──
async function drawReel(id) {
  const [s, reel, all] = await Promise.all([settings(), db.get('reels', id), db.all('reports')]);
  if (!reel) { root.innerHTML = '<div class="empty"><b>Ролик не найден</b><a href="#/instagram">К списку</a></div>'; return; }
  const reps = all.filter(r => r.reelId === id).sort((a, b) => b.createdAt - a.createdAt);
  const last = reps[0], prev = reps[1];
  const others = all.filter(r => r.reelId !== id);
  const latestPerReel = Object.values(others.reduce((m, r) => { if (!m[r.reelId] || m[r.reelId].createdAt < r.createdAt) m[r.reelId] = r; return m; }, {}));
  const views = latestPerReel.map(r => r.organic?.views).filter(isNum);
  const avgViews = views.length ? views.reduce((a, b) => a + b, 0) / views.length : null;
  const cur = last?.paid?.currency || s.currency;

  root.innerHTML = `
    <a class="btn plain" href="#/instagram" style="padding:0;height:32px">${icon('back')}Instagram</a>
    <h1 class="large-title" style="font-size:28px">${esc(reel.title || reel.shortcode)}</h1>
    <p class="subtitle"><a href="${esc(reel.url)}" target="_blank" rel="noopener">Открыть в Instagram</a>${reel.postedAt ? ` · опубликован ${dateTime(new Date(reel.postedAt).getTime())}` : ''}</p>
    <div class="btn-row">
      <button class="btn" data-refresh>${icon('refresh')}Обновить</button>
      <button class="btn tinted" data-shots>${icon('camera')}Скриншоты</button>
      <button class="btn gray" data-manual>Вручную</button>
    </div>
    ${last ? `
      <div class="section-title">Последний отчёт <span class="caption">${dateTime(last.createdAt)} · ${({ api: 'из API', ocr: 'по скриншотам', manual: 'вручную' })[last.source]}</span></div>
      ${kpis(last, prev, cur)}
      <div class="split mt">
        <div class="card"><div class="card-title">Органика</div>${table(ORGANIC, last.organic, prev?.organic)}</div>
        <div class="card"><div class="card-title">Реклама «Продвигать»</div>${last.paid && Object.values(last.paid).some(v => isNum(v)) ? `${table(PAID, last.paid, prev?.paid, cur)}
          ${last.paid.from || last.paid.periodText ? `<p class="caption">Период продвижения: ${esc(last.paid.from ? `${last.paid.from} — ${last.paid.to}` : last.paid.periodText)}</p>` : ''}
          ${last.paid.reachApprox ? '<p class="caption">Охват суммирован по нескольким продвижениям — возможны пересечения аудитории.</p>' : ''}`
          : `<div class="empty" style="padding:14px 0">Нет данных о рекламе${last.note ? `<div class="caption mt">${esc(last.note)}</div>` : ''}</div>`}
        </div>
      </div>
      <div class="card mt"><div class="card-title">Анализ эффективности</div>
        ${analyze(last, prev, avgViews).map(i => `<div class="insight ${i.lvl === 'bad' ? 'bad' : i.lvl === 'mid' ? 'mid' : ''}"><i></i><span>${esc(i.text)}</span></div>`).join('')}
        <div data-ai></div>
        <div class="btn-row mt"><button class="btn tinted small" data-share>${icon('share')}Поделиться отчётом</button>${await aiEnabled() ? `<button class="btn gray small" data-ai-btn>${icon('spark')}Советы ИИ</button>` : ''}</div>
      </div>
      ${last.unavailable?.length ? `<p class="footnote">Instagram не отдал для этого ролика: ${esc(last.unavailable.join(', '))}.</p>` : ''}
      ${reps.length > 1 ? `<div class="section-title">Динамика просмотров</div><div class="card">${bars(reps.slice().reverse())}</div>` : ''}
      <div class="section-title">История отчётов</div>
      <div class="list">${reps.map((r, i) => `<div class="row">
        <div class="row-main"><div class="row-title">${dateTime(r.createdAt)}</div>
        <div class="row-sub">${isNum(r.organic?.views) ? compact(r.organic.views) + ' просм.' : '—'} · охват ${compact(r.organic?.reach)}${isNum(r.paid?.spend) ? ` · ${money(r.paid.spend, r.paid.currency || cur)}` : ''} · ${({ api: 'API', ocr: 'скриншоты', manual: 'вручную' })[r.source]}</div></div>
        <button class="icon-btn" data-del="${r.id}" aria-label="Удалить отчёт">${icon('trash')}</button></div>`).join('')}</div>`
    : '<div class="card empty mt"><b>Отчётов нет</b>Нажмите «Обновить» или загрузите скриншоты статистики</div>'}
    <button class="btn danger block mt" data-del-reel>Удалить ролик и его отчёты</button>`;

  root.querySelector('[data-refresh]').onclick = e => getReport(reel, e.currentTarget);
  root.querySelector('[data-shots]').onclick = () => screenshotSheet(reel);
  root.querySelector('[data-manual]').onclick = () => reviewSheet(reel, last ? { organic: {}, paid: {} } : {}, 'manual');
  root.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { if (await confirmSheet('Удалить этот отчёт?')) await db.del('reports', b.dataset.del); });
  root.querySelector('[data-del-reel]').onclick = async () => {
    if (!(await confirmSheet('Удалить ролик и все его отчёты?'))) return;
    for (const r of reps) await db.del('reports', r.id);
    await db.del('reels', reel.id);
    location.hash = '#/instagram';
  };
  root.querySelector('[data-share]')?.addEventListener('click', () => shareText('Отчёт Instagram', reportText(reel, last, prev, avgViews, cur)));
  root.querySelector('[data-ai-btn]')?.addEventListener('click', async e => {
    e.currentTarget.disabled = true;
    const box = root.querySelector('[data-ai]');
    box.innerHTML = '<p class="caption">Анализирую…</p>';
    try { box.innerHTML = `<div class="report-text mt">${esc(await aiReelInsight({ organic: last.organic, paid: last.paid, derived: derived(last), previous: prev?.organic || null }))}</div>`; }
    catch (err) { box.innerHTML = `<p class="caption">${esc(err.message)}</p>`; }
  });
}

function kpis(r, prev, cur) {
  const o = r.organic || {}, p = r.paid || {}, d = derived(r);
  const delta = (a, b) => isNum(a) && isNum(b) && b !== 0 ? `<div class="d ${a >= b ? 'up' : 'down'}">${a >= b ? '▲' : '▼'} ${compact(Math.abs(a - b))}</div>` : '';
  const cell = (v, l, f = compact, dl = '') => `<div class="stat"><div class="v ${isNum(v) ? '' : 'na'}">${isNum(v) ? f(v) : 'нет данных'}</div><div class="l">${l}</div>${dl}</div>`;
  return `<div class="stat-grid four">
    ${cell(o.views, 'Просмотры', compact, delta(o.views, prev?.organic?.views))}
    ${cell(o.reach, 'Охват', compact, delta(o.reach, prev?.organic?.reach))}
    ${cell(d.totalMessages, 'Обращения')}
    ${cell(d.costPerMessage, 'Цена обращения', v => money(v, cur))}
  </div>`;
}

function table(defs, data = {}, prevData = {}, cur) {
  return `<table class="metric-table"><tbody>${defs.map(([k, label]) => {
    const v = data?.[k];
    const pv = prevData?.[k];
    const shown = !isNum(v) ? '<span class="na">нет данных</span>' : k === 'spend' ? money(v, cur) : num(v);
    const dl = isNum(v) && isNum(pv) && v !== pv ? `<span class="delta ${v > pv ? 'up' : 'down'}">${v > pv ? '+' : ''}${compact(v - pv)}</span>` : '';
    return `<tr><td>${label}</td><td>${shown}${dl}</td></tr>`;
  }).join('')}</tbody></table>`;
}

function bars(reps) {
  const vals = reps.map(r => r.organic?.views);
  const max = Math.max(...vals.filter(isNum), 1);
  return `<div class="bars">${reps.map((r, i) => `<div class="b ${i === reps.length - 1 ? 'last' : ''}" style="height:${isNum(vals[i]) ? Math.max(3, vals[i] / max * 100) : 2}%" title="${isNum(vals[i]) ? num(vals[i]) : 'нет данных'}"></div>`).join('')}</div>
    <div class="bars-x">${reps.map(r => `<span>${new Date(r.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</span>`).join('')}</div>`;
}

function reportText(reel, r, prev, avgViews, cur) {
  const o = r.organic || {}, p = r.paid || {}, d = derived(r);
  const line = (l, v, f = num) => `${l}: ${isNum(v) ? f(v) : 'нет данных'}`;
  const out = [`Отчёт по ролику «${reel.title}»`, reel.url, `Дата: ${dateTime(r.createdAt)}`, '', 'ОРГАНИКА'];
  ORGANIC.forEach(([k, l]) => out.push(line(l, o[k])));
  out.push('', 'РЕКЛАМА');
  if (p && Object.values(p).some(isNum)) {
    PAID.forEach(([k, l]) => out.push(line(l, p[k], k === 'spend' ? v => money(v, cur) : num)));
    out.push(line('Стоимость обращения', d.costPerMessage, v => money(v, cur)));
    if (p.from) out.push(`Период: ${p.from} — ${p.to}`);
  } else out.push('нет данных');
  out.push('', 'АНАЛИЗ', ...analyze(r, prev, avgViews).map(i => `• ${i.text}`));
  return out.join('\n');
}

// ── Скриншоты ──
async function screenshotSheet(reel) {
  let files = [];
  await sheet({
    title: 'Скриншоты статистики',
    body: `<div class="form">
      <p class="caption" style="margin:0 4px">Сделайте скриншоты в Instagram: ролик → «Посмотреть статистику», а для рекламы — «Посмотреть результаты продвижения». Распознавание идёт на вашем устройстве, бесплатно.</p>
      ${reel ? '' : '<label class="field"><span>Ссылка на Reels</span><input class="input" name="url" type="url" placeholder="https://www.instagram.com/reel/…"></label>'}
      <label class="drop" data-drop>${icon('camera')}<div><b>Выберите или перетащите скриншоты</b></div><div class="caption">Можно несколько: органика и продвижение</div>
        <input type="file" accept="image/*" multiple hidden data-file></label>
      <div class="thumbs" data-thumbs></div>
      <div class="progress" hidden data-prog><i></i></div>
      <div class="caption" data-status></div>
      <button class="btn block" data-run disabled>Распознать и сформировать отчёт</button>
    </div>`,
    onMount: (b, close) => {
      const input = b.querySelector('[data-file]'), drop = b.querySelector('[data-drop]');
      const setFiles = list => {
        files = [...list].filter(f => f.type.startsWith('image/'));
        b.querySelector('[data-thumbs]').innerHTML = files.map(f => `<img src="${URL.createObjectURL(f)}" alt="">`).join('');
        b.querySelector('[data-run]').disabled = !files.length;
      };
      input.onchange = () => setFiles(input.files);
      drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('over'));
      drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); setFiles(e.dataTransfer.files); });
      b.querySelector('[data-run]').onclick = async e => {
        let target = reel;
        if (!target) {
          const url = b.querySelector('[name=url]').value;
          if (url) { target = await ensureReel(url); if (!target) return toast('Ссылка не распознана'); }
        }
        e.currentTarget.disabled = true;
        const prog = b.querySelector('[data-prog]'), status = b.querySelector('[data-status]');
        prog.hidden = false;
        status.textContent = 'Загружаю модуль распознавания (при первом запуске ~20 МБ)…';
        try {
          const texts = await ocrImages(files, (p, i, n) => {
            if (i) status.textContent = `Распознаю скриншот ${i} из ${n}…`;
            prog.querySelector('i').style.width = `${Math.round((p || 0) * 100)}%`;
          });
          const parsed = parseInsightsText(texts);
          close(true);
          reviewSheet(target, parsed, 'ocr', texts);
        } catch (err) { status.textContent = err.message; e.currentTarget.disabled = false; }
      };
    },
  });
}

// Проверка и правка распознанных значений перед сохранением
async function reviewSheet(reel, parsed = {}, source = 'manual', texts = []) {
  const s = await settings();
  const o = parsed.organic || {}, p = parsed.paid || {};
  const input = (prefix, k, v) => `<input class="input" inputmode="decimal" name="${prefix}.${k}" value="${isNum(v) ? v : ''}" placeholder="нет данных">`;
  await sheet({
    title: source === 'ocr' ? 'Проверьте данные' : 'Ввод статистики', doneText: 'Сохранить', wide: true,
    body: `<form class="form" onsubmit="return false">
      ${source === 'ocr' ? `<p class="caption" style="margin:0 4px">Распознано полей: ${parsed.found?.length || 0}. Проверьте значения; то, что не распознано, оставьте пустым или введите со скриншота.</p>` : ''}
      ${reel ? '' : '<label class="field"><span>Ссылка на Reels</span><input class="input" name="url" type="url" placeholder="https://www.instagram.com/reel/…" required></label>'}
      <div class="split">
        <div class="card"><div class="card-title">Органика</div><div class="form">${ORGANIC.map(([k, l]) => `<label class="field"><span>${l}</span>${input('o', k, o[k])}</label>`).join('')}</div></div>
        <div class="card"><div class="card-title">Реклама «Продвигать»</div><div class="form">
          ${PAID.map(([k, l]) => `<label class="field"><span>${l}</span>${input('p', k, p[k])}</label>`).join('')}
          <label class="field"><span>Валюта</span><select class="select" name="p.currency">${['KZT', 'USD', 'RUB', 'EUR'].map(c => `<option ${((p.currency || s.currency) === c) ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
          <div class="grid-2"><label class="field"><span>Начало</span><input class="input" type="date" name="p.from"></label><label class="field"><span>Конец</span><input class="input" type="date" name="p.to"></label></div>
          ${p.periodText ? `<p class="caption">На скриншоте период: ${esc(p.periodText)}</p>` : ''}
        </div></div>
      </div>
      ${texts.length ? `<details><summary class="caption">Распознанный текст</summary><div class="code" style="max-height:200px;white-space:pre-wrap">${esc(texts.join('\n———\n'))}</div></details>` : ''}
    </form>`,
    done: async b => {
      const f = formData(b);
      let target = reel;
      if (!target) { target = await ensureReel(f.url); if (!target) throw new Error('Укажите ссылку на Reels'); }
      const val = v => { if (v === '' || v == null) return null; const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
      const organic = Object.fromEntries(ORGANIC.map(([k]) => [k, val(f[`o.${k}`])]));
      const paid = Object.fromEntries(PAID.map(([k]) => [k, val(f[`p.${k}`])]));
      paid.currency = f['p.currency'];
      paid.from = f['p.from'] || null; paid.to = f['p.to'] || null;
      if (p.periodText) paid.periodText = p.periodText;
      const hasPaid = PAID.some(([k]) => isNum(paid[k]));
      if (!Object.values(organic).some(isNum) && !hasPaid) throw new Error('Заполните хотя бы один показатель');
      await db.put('reports', { id: uid(), reelId: target.id, createdAt: Date.now(), source, organic, paid: hasPaid ? paid : null });
      toast('Отчёт сохранён');
      location.hash = `#/instagram?r=${target.id}`;
      return true;
    },
  });
}
