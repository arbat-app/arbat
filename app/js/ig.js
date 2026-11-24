// Instagram: официальное API (органика), Marketing API (реклама «Продвигать»),
// распознавание скриншотов и анализ эффективности. Никаких выдуманных цифр:
// если показатель недоступен — он остаётся пустым.
import { db, settings, setSetting } from './db.js';
import { uid, isNum } from './util.js';

const FB = 'https://graph.facebook.com/v23.0';
const IG = 'https://graph.instagram.com';

export const ORGANIC = [
  ['views', 'Просмотры'], ['reach', 'Охват'], ['likes', 'Лайки'], ['comments', 'Комментарии'],
  ['shares', 'Репосты'], ['saves', 'Сохранения'], ['profileVisits', 'Переходы в профиль'], ['follows', 'Новые подписчики'],
  ['messages', 'Обращения и сообщения'],
];
export const PAID = [
  ['spend', 'Расходы на рекламу'], ['reach', 'Охват рекламы'], ['impressions', 'Показы рекламы'], ['views', 'Просмотры из рекламы'],
  ['messages', 'Обращения и сообщения'], ['profileVisits', 'Переходы в профиль'], ['follows', 'Новые подписчики'], ['linkClicks', 'Клики по ссылке'],
];

export function shortcodeOf(url) {
  const m = String(url).match(/instagram\.com\/(?:[\w.]+\/)?(?:reels?|p|tv)\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

// ── Подключение ──
export function tokenKind(token) {
  if (/^IG/.test(token)) return 'instagram';
  if (/^EA/.test(token)) return 'facebook';
  return 'unknown';
}
async function getJSON(url) {
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) {
    const e = new Error(humanError(j.error) || `Ошибка ${r.status}`);
    e.code = j.error?.code; e.raw = j.error;
    throw e;
  }
  return j;
}
function humanError(err) {
  if (!err) return '';
  if (err.code === 190) return 'Токен недействителен или истёк — обновите его в Настройках';
  if (err.code === 10 || err.code === 200) return `Нет разрешения: ${err.message}`;
  if (err.code === 4 || err.code === 17 || err.code === 32) return 'Превышен лимит запросов Meta, попробуйте через час';
  return err.message || '';
}
const q = (params) => Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

export async function connect(token) {
  const kind = tokenKind(token);
  if (kind === 'instagram' || kind === 'unknown') {
    try {
      const me = await getJSON(`${IG}/me?${q({ fields: 'user_id,username,account_type', access_token: token })}`);
      await saveConn(token, 'instagram', me.user_id || me.id, me.username);
      return { api: 'instagram', username: me.username, accountType: me.account_type };
    } catch (e) { if (kind === 'instagram') throw e; }
  }
  const pages = await getJSON(`${FB}/me/accounts?${q({ fields: 'name,instagram_business_account{id,username}', access_token: token, limit: 50 })}`);
  const page = (pages.data || []).find(p => p.instagram_business_account);
  if (!page) throw new Error('К Facebook-аккаунту не привязан профессиональный аккаунт Instagram');
  const ig = page.instagram_business_account;
  await saveConn(token, 'facebook', ig.id, ig.username);
  return { api: 'facebook', username: ig.username };
}
async function saveConn(token, api, id, username) {
  await setSetting('igToken', token);
  await setSetting('igApi', api);
  await setSetting('igUserId', String(id));
  await setSetting('igUsername', username || '');
  await setSetting('igTokenSavedAt', Date.now());
}

// Токен Instagram Login живёт 60 дней — продлеваем, если ему больше 7 дней
export async function maybeRefreshToken() {
  const s = await settings();
  if (s.igApi !== 'instagram' || !s.igToken) return;
  if (Date.now() - (s.igTokenSavedAt || 0) < 7 * 86400000) return;
  try {
    const j = await getJSON(`${IG}/refresh_access_token?${q({ grant_type: 'ig_refresh_token', access_token: s.igToken })}`);
    if (j.access_token) { await setSetting('igToken', j.access_token); await setSetting('igTokenSavedAt', Date.now()); }
  } catch (e) { console.warn('IG refresh', e); }
}

// ── Вход через Facebook (без вставки токенов) ──
// Нужен ID приложения Meta (бесплатно, developers.facebook.com) и домен приложения в его настройках.
const FB_SCOPES = 'instagram_basic,instagram_manage_insights,pages_show_list,pages_read_engagement,business_management,ads_read';
let fbP;
function loadFbSdk(appId) {
  if (fbP) return fbP;
  fbP = new Promise((res, rej) => {
    window.fbAsyncInit = () => { window.FB.init({ appId, version: 'v23.0', cookie: true, xfbml: false }); res(window.FB); };
    const sc = document.createElement('script');
    sc.src = 'https://connect.facebook.net/ru_RU/sdk.js';
    sc.async = true;
    sc.onerror = () => { fbP = null; rej(new Error('Не удалось загрузить вход Facebook — проверьте интернет')); };
    document.head.append(sc);
  });
  return fbP;
}
export const preloadFb = appId => loadFbSdk(appId).catch(() => {});
export async function fbLogin({ silent = false } = {}) {
  const s = await settings();
  if (!s.fbAppId) throw new Error('Укажите ID приложения Meta в Настройках → Instagram');
  const FB = await loadFbSdk(s.fbAppId);
  const resp = await new Promise(res => silent ? FB.getLoginStatus(res) : FB.login(res, { scope: FB_SCOPES, return_scopes: true, auth_type: 'rerequest' }));
  const token = resp?.authResponse?.accessToken;
  if (!token) throw new Error(silent ? 'Нужно войти через Facebook ещё раз' : 'Вход отменён');
  return connect(token);
}

export async function adAccounts() {
  const s = await settings();
  if (s.igApi !== 'facebook') return [];
  const j = await getJSON(`${FB}/me/adaccounts?${q({ fields: 'id,name,currency,account_status', access_token: s.igToken, limit: 50 })}`);
  return j.data || [];
}

// ── Поиск ролика ──
async function findMedia(shortcode) {
  const s = await settings();
  const base = s.igApi === 'instagram' ? `${IG}/me/media` : `${FB}/${s.igUserId}/media`;
  let url = `${base}?${q({ fields: 'id,shortcode,permalink,caption,timestamp,media_type,media_product_type,thumbnail_url', limit: 50, access_token: s.igToken })}`;
  for (let page = 0; page < 12 && url; page++) {
    const j = await getJSON(url);
    const hit = (j.data || []).find(m => m.shortcode === shortcode || (m.permalink || '').includes(`/${shortcode}`));
    if (hit) return hit;
    url = j.paging?.next || null;
  }
  return null;
}

const IG_METRICS = ['views', 'reach', 'likes', 'comments', 'shares', 'saved', 'total_interactions', 'profile_visits', 'follows', 'ig_reels_avg_watch_time'];
async function mediaInsights(mediaId) {
  const s = await settings();
  const host = s.igApi === 'instagram' ? IG : FB;
  const metrics = s.igApi === 'facebook' ? [...IG_METRICS, 'total_views'] : IG_METRICS;
  const got = {};
  const unavailable = [];
  const read = j => (j.data || []).forEach(m => { const v = m.values?.[0]?.value ?? m.total_value?.value; if (isNum(v)) got[m.name] = v; });
  try {
    read(await getJSON(`${host}/${mediaId}/insights?${q({ metric: metrics.join(','), access_token: s.igToken })}`));
  } catch (e) {
    if (e.code === 190) throw e;
    // часть метрик не поддерживается для этого типа публикации — запрашиваем по одной
    for (const m of metrics) {
      try { read(await getJSON(`${host}/${mediaId}/insights?${q({ metric: m, access_token: s.igToken })}`)); }
      catch (err) { if (err.code === 190) throw err; unavailable.push(m); }
    }
  }
  return { got, unavailable };
}

async function adsForMedia(media) {
  const s = await settings();
  if (s.igApi !== 'facebook' || !s.adAccountId) return null;
  const act = s.adAccountId.startsWith('act_') ? s.adAccountId : `act_${s.adAccountId}`;
  let url = `${FB}/${act}/ads?${q({ fields: 'id,name,effective_status,created_time,creative{effective_instagram_media_id,source_instagram_media_id,instagram_permalink_url}', limit: 100, access_token: s.igToken })}`;
  const ads = [];
  for (let page = 0; page < 10 && url; page++) {
    const j = await getJSON(url);
    (j.data || []).forEach(ad => {
      const c = ad.creative || {};
      if (c.effective_instagram_media_id === media.id || c.source_instagram_media_id === media.id || (c.instagram_permalink_url || '').includes(media.shortcode)) ads.push(ad);
    });
    url = j.paging?.next || null;
  }
  if (!ads.length) return { found: false };
  const paid = { spend: 0, reach: 0, impressions: 0, actions: {}, from: null, to: null, ads: ads.length, currency: '' };
  let reachSummed = false;
  for (const ad of ads) {
    const j = await getJSON(`${FB}/${ad.id}/insights?${q({ fields: 'spend,reach,impressions,actions,date_start,date_stop,account_currency', date_preset: 'maximum', access_token: s.igToken })}`);
    const row = j.data?.[0];
    if (!row) continue;
    paid.spend += Number(row.spend || 0);
    paid.reach += Number(row.reach || 0); reachSummed = ads.length > 1;
    paid.impressions += Number(row.impressions || 0);
    paid.currency = row.account_currency || paid.currency;
    (row.actions || []).forEach(a => { paid.actions[a.action_type] = (paid.actions[a.action_type] || 0) + Number(a.value || 0); });
    if (!paid.from || row.date_start < paid.from) paid.from = row.date_start;
    if (!paid.to || row.date_stop > paid.to) paid.to = row.date_stop;
  }
  const A = paid.actions;
  const pick = (...keys) => { for (const k of keys) if (isNum(A[k])) return A[k]; return null; };
  const pickRe = re => { const k = Object.keys(A).find(x => re.test(x)); return k ? A[k] : null; };
  return {
    found: true,
    paid: {
      spend: paid.spend, currency: paid.currency, reach: paid.reach || null, reachApprox: reachSummed, impressions: paid.impressions || null,
      views: pick('video_view', 'ig_reels_plays') ?? null,
      messages: pick('onsite_conversion.messaging_conversation_started_7d', 'onsite_conversion.total_messaging_connection') ?? pickRe(/messaging_conversation_started/),
      profileVisits: pickRe(/profile_visit/),
      follows: pickRe(/(^|\.)(ig_)?follow/),
      linkClicks: pick('link_click'),
      from: paid.from, to: paid.to, ads: paid.ads, actions: A,
    },
  };
}

// Главная функция: отчёт по ссылке через API
export async function apiReport(reel) {
  const s = await settings();
  if (!s.igToken) throw new Error('Instagram не подключён. Откройте Настройки → Instagram, или загрузите скриншоты статистики.');
  await maybeRefreshToken();
  if (s.igApi === 'facebook' && s.fbAppId) {
    try { await getJSON(`${FB}/me?${q({ fields: 'id', access_token: s.igToken })}`); }
    catch (e) { if (e.code === 190) await fbLogin({ silent: true }); else throw e; }
  }
  const media = reel.mediaId ? { id: reel.mediaId, shortcode: reel.shortcode } : await findMedia(reel.shortcode);
  if (!media) throw new Error('Ролик не найден среди публикаций подключённого аккаунта. Проверьте, что ссылка ведёт на ваш Reels.');
  if (!reel.mediaId) {
    Object.assign(reel, { mediaId: media.id, caption: media.caption || '', postedAt: media.timestamp, thumb: media.thumbnail_url || '' });
    if (!reel.title || reel.title === reel.shortcode) reel.title = (media.caption || '').split('\n')[0].slice(0, 80) || reel.title;
    await db.put('reels', reel);
  }
  const { got, unavailable } = await mediaInsights(media.id);
  const organic = {
    views: got.views ?? null, reach: got.reach ?? null, likes: got.likes ?? null, comments: got.comments ?? null,
    shares: got.shares ?? null, saves: got.saved ?? null, profileVisits: got.profile_visits ?? null, follows: got.follows ?? null,
    interactions: got.total_interactions ?? null, avgWatchSec: isNum(got.ig_reels_avg_watch_time) ? got.ig_reels_avg_watch_time / 1000 : null,
    messages: null,
  };
  const totalViews = got.total_views ?? null;
  let paid = null, adsNote = '';
  try {
    const ads = await adsForMedia(media);
    if (ads === null) adsNote = s.igApi === 'facebook' ? 'Рекламный аккаунт не выбран в Настройках.' : 'Для рекламной статистики нужен токен Facebook с разрешением ads_read.';
    else if (!ads.found) adsNote = 'Продвижений этого ролика не найдено в рекламном аккаунте.';
    else paid = ads.paid;
  } catch (e) { adsNote = `Реклама: ${e.message}`; }
  return {
    id: uid(), reelId: reel.id, createdAt: Date.now(), source: 'api', organic, paid, totalViews,
    unavailable, note: adsNote,
  };
}

// ── Распознавание скриншотов ──
let tesseractP;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (tesseractP) return tesseractP;
  tesseractP = new Promise((res, rej) => {
    const sc = document.createElement('script');
    sc.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
    sc.onload = () => res(window.Tesseract);
    sc.onerror = () => { tesseractP = null; rej(new Error('Не удалось загрузить модуль распознавания (нужен интернет при первом запуске)')); };
    document.head.append(sc);
  });
  return tesseractP;
}
export async function ocrImages(files, onProgress) {
  const T = await loadTesseract();
  const worker = await T.createWorker(['rus', 'eng'], 1, {
    logger: m => { if (m.status === 'recognizing text') onProgress?.(m.progress); },
  });
  const texts = [];
  try {
    for (let i = 0; i < files.length; i++) {
      onProgress?.(0, i + 1, files.length);
      const { data } = await worker.recognize(files[i]);
      texts.push(data.text);
    }
  } finally { await worker.terminate(); }
  return texts;
}

const LABELS = {
  views: /(просмотр|воспроизведени|\bviews?\b|\bplays\b)/i,
  reach: /(охват|охваченн|accounts reached|\breach\b)/i,
  likes: /(нравится|лайк|\blikes?\b)/i,
  comments: /(комментари|\bcomments?\b)/i,
  shares: /(репост|поделил|отправк|\bshares?\b)/i,
  saves: /(сохранени|сохранено|\bsaves?\b|\bsaved\b)/i,
  profileVisits: /(посещени\S* профил|переход\S* в профил|profile visits|profile activity|действия в профиле)/i,
  follows: /(подписк|новые подписчики|\bfollows\b|\bfollowers\b)/i,
  messages: /(сообщени|переписк|разговор|обращени|conversations|messages|messaging)/i,
  spend: /(потрачен|расход|затрат|amount spent|\bspent\b|итоговая сумма|сумма списания)/i,
  impressions: /(показы|impressions)/i,
  linkClicks: /(клики по ссылк|переходы по ссылк|link clicks)/i,
};
export function parseNumber(str) {
  if (!str) return null;
  const s = str.replace(/ /g, ' ');
  const m = s.match(/(-?\d{1,3}(?:[  ]\d{3})+(?:[.,]\d+)?|-?\d+(?:[.,]\d+)?)\s*(тыс\.?|млн|k|m|к)?/i);
  if (!m) return null;
  let v = parseFloat(m[1].replace(/[  ]/g, '').replace(',', '.'));
  const mul = (m[2] || '').toLowerCase();
  if (/тыс|^k$|^к$/.test(mul)) v *= 1000;
  if (/млн|^m$/.test(mul)) v *= 1e6;
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
}
export function parseMoney(str) {
  const m = str.replace(/ /g, ' ').match(/(\$|₸|kzt|usd|₽|руб|тг|тенге)?\s*(\d[\d  ]*(?:[.,]\d{1,2})?)\s*(\$|₸|kzt|usd|₽|руб|тг|тенге)?/i);
  if (!m) return null;
  const cur = (m[1] || m[3] || '').toLowerCase();
  const currency = /\$|usd/.test(cur) ? 'USD' : /₸|kzt|тг|тенге/.test(cur) ? 'KZT' : /₽|руб/.test(cur) ? 'RUB' : null;
  return { value: parseFloat(m[2].replace(/[  ]/g, '').replace(',', '.')), currency };
}

// Разбор распознанного текста: значение ищем в той же строке, затем в соседних
export function parseInsightsText(texts) {
  const organic = {}, paid = {};
  const found = [];
  for (const text of texts) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const isPaid = /(продвижени|промоакци|реклам|promotion|boost|потрачен|бюджет|amount spent)/i.test(text);
    let period = null;
    const pm = text.match(/(\d{1,2}\s*[а-я]{3,6}\.?(?:\s*\d{4})?)\s*[–—-]\s*(\d{1,2}\s*[а-я]{3,6}\.?(?:\s*\d{4})?)/i);
    if (pm) period = `${pm[1]} – ${pm[2]}`;
    lines.forEach((line, i) => {
      for (const [key, re] of Object.entries(LABELS)) {
        if (!re.test(line)) continue;
        const after = line.slice(line.search(re)).replace(re, '');
        const candidates = [after, lines[i + 1] || '', lines[i - 1] || ''];
        let val = null;
        if (key === 'spend') {
          for (const c of candidates) { const mm = parseMoney(c); if (mm && mm.value) { val = mm; break; } }
          if (val) { if (paid.spend == null) { paid.spend = val.value; if (val.currency) paid.currency = val.currency; found.push(key); } }
          continue;
        }
        for (const c of candidates) { if (/[a-zа-я]{4,}/i.test(c.replace(/(тыс|млн)/gi, '')) && c !== after) continue; const v = parseNumber(c); if (v != null) { val = v; break; } }
        if (val == null) continue;
        const target = isPaid && ['reach', 'impressions', 'messages', 'profileVisits', 'follows', 'linkClicks', 'views'].includes(key) ? paid : organic;
        if (target[key] == null) { target[key] = val; found.push(key); }
      }
    });
    if (isPaid && period) paid.periodText = period;
  }
  return { organic, paid, found };
}

// ── Анализ эффективности (только по реальным данным) ──
const sum = (...v) => { const n = v.filter(isNum); return n.length ? n.reduce((a, b) => a + b, 0) : null; };
const div = (a, b) => (isNum(a) && isNum(b) && b > 0) ? a / b : null;

export function derived(r) {
  const o = r.organic || {}, p = r.paid || {};
  const interactions = isNum(o.interactions) ? o.interactions : sum(o.likes, o.comments, o.shares, o.saves);
  return {
    interactions,
    er: div(interactions, o.reach),
    saveShareRate: div(sum(o.saves, o.shares), o.reach),
    profileRate: div(o.profileVisits, o.reach),
    followConv: div(o.follows, o.profileVisits),
    cpm: div(p.spend, p.reach) != null ? div(p.spend, p.reach) * 1000 : null,
    costPerMessage: div(p.spend, p.messages),
    costPerFollow: div(p.spend, p.follows),
    costPerVisit: div(p.spend, p.profileVisits),
    totalMessages: sum(o.messages, p.messages),
    paidShareViews: isNum(r.totalViews) && isNum(o.views) && r.totalViews > 0 ? (r.totalViews - o.views) / r.totalViews : null,
  };
}

export function analyze(r, prev, avgViews) {
  const d = derived(r);
  const o = r.organic || {}, p = r.paid || {};
  const out = [];
  const cur = ({ KZT: '₸', USD: '$', RUB: '₽', EUR: '€' })[p.currency] || p.currency || '';
  const fmtP = v => `${(v * 100).toFixed(1).replace('.', ',')}%`;
  if (d.er != null) {
    const lvl = d.er >= 0.05 ? 'good' : d.er >= 0.02 ? 'mid' : 'bad';
    out.push({ lvl, text: `Вовлечённость ${fmtP(d.er)} от охвата — ${lvl === 'good' ? 'высокая' : lvl === 'mid' ? 'средняя' : 'низкая'} (ориентир для Reels недвижимости: от 2–5%).` });
  }
  if (d.saveShareRate != null) {
    const lvl = d.saveShareRate >= 0.02 ? 'good' : d.saveShareRate >= 0.007 ? 'mid' : 'bad';
    out.push({ lvl, text: `Сохранения и репосты — ${fmtP(d.saveShareRate)} охвата: ${lvl === 'good' ? 'контент ценный, его сохраняют и пересылают' : lvl === 'mid' ? 'нормально; добавьте пользу — цены, планировки, советы' : 'ролик мало сохраняют; попробуйте подборки и полезные списки'}.` });
  }
  if (d.profileRate != null) out.push({ lvl: d.profileRate >= 0.01 ? 'good' : 'mid', text: `В профиль переходят ${fmtP(d.profileRate)} охваченных${d.followConv != null ? `, из них подписываются ${fmtP(d.followConv)}` : ''}.` });
  if (isNum(o.avgWatchSec)) out.push({ lvl: o.avgWatchSec >= 7 ? 'good' : 'mid', text: `Среднее время просмотра — ${o.avgWatchSec.toFixed(1).replace('.', ',')} с. ${o.avgWatchSec < 5 ? 'Усильте первые 2 секунды: цена или вид из окна сразу.' : ''}` });
  if (isNum(p.spend)) {
    if (d.costPerMessage != null) out.push({ lvl: 'mid', text: `Стоимость одного обращения — ${d.costPerMessage.toFixed(0)} ${cur} (${p.messages} обращ. за ${p.spend.toLocaleString('ru-RU')} ${cur}).` });
    else out.push({ lvl: 'bad', text: 'Реклама не принесла обращений (или Instagram не передал их число). Проверьте цель продвижения: «Больше сообщений».' });
    if (d.cpm != null) out.push({ lvl: 'mid', text: `Стоимость 1000 охвата рекламы — ${d.cpm.toFixed(0)} ${cur}.` });
    if (d.costPerFollow != null) out.push({ lvl: 'mid', text: `Стоимость подписчика из рекламы — ${d.costPerFollow.toFixed(0)} ${cur}.` });
  }
  if (d.paidShareViews != null) out.push({ lvl: 'mid', text: `Доля просмотров из рекламы — ${fmtP(d.paidShareViews)}.` });
  if (prev) {
    const dv = isNum(o.views) && isNum(prev.organic?.views) ? o.views - prev.organic.views : null;
    if (dv != null) out.push({ lvl: dv > 0 ? 'good' : 'mid', text: `С прошлого замера просмотры ${dv >= 0 ? 'выросли' : 'снизились'} на ${Math.abs(dv).toLocaleString('ru-RU')}.` });
  }
  if (isNum(avgViews) && isNum(o.views) && avgViews > 0) {
    const k = o.views / avgViews;
    out.push({ lvl: k >= 1.2 ? 'good' : k >= 0.8 ? 'mid' : 'bad', text: `Просмотры ${k >= 1 ? 'выше' : 'ниже'} среднего по вашим роликам в ${k >= 1 ? k.toFixed(1).replace('.', ',') : (1 / k).toFixed(1).replace('.', ',')} раза.` });
  }
  if (!out.length) out.push({ lvl: 'mid', text: 'Недостаточно данных для анализа — добавьте охват и взаимодействия.' });
  return out;
}
