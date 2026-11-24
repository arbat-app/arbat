// Встроенный разборщик русской речи: даты, время, тип дела, команды.
// Работает без интернета и без ключей. Чистые функции — легко тестировать.

const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addD = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const hm = (h, m = 0) => `${pad(h)}:${pad(m)}`;

const NUM_WORDS = {
  'ноль': 0, 'один': 1, 'одна': 1, 'одного': 1, 'час': 1, 'два': 2, 'две': 2, 'двух': 2, 'три': 3, 'трех': 3,
  'четыре': 4, 'четырех': 4, 'пять': 5, 'пяти': 5, 'шесть': 6, 'шести': 6, 'семь': 7, 'семи': 7, 'восемь': 8,
  'восьми': 8, 'девять': 9, 'девяти': 9, 'десять': 10, 'десяти': 10, 'одиннадцать': 11, 'одиннадцати': 11,
  'двенадцать': 12, 'двенадцати': 12, 'тринадцать': 13, 'четырнадцать': 14, 'пятнадцать': 15, 'шестнадцать': 16,
  'семнадцать': 17, 'восемнадцать': 18, 'девятнадцать': 19, 'двадцать': 20, 'тридцать': 30, 'сорок': 40, 'пятьдесят': 50,
};
const ORD_GEN = {
  'первого': 1, 'второго': 2, 'третьего': 3, 'четвертого': 4, 'пятого': 5, 'шестого': 6, 'седьмого': 7,
  'восьмого': 8, 'девятого': 9, 'десятого': 10, 'одиннадцатого': 11, 'двенадцатого': 12,
};
const MONTHS = ['январ', 'феврал', 'март', 'апрел', 'ма[яй]', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'];
const WEEKDAYS = [
  ['воскресень', 0], ['понедельник', 1], ['вторник', 2], ['сред', 3], ['среду', 3], ['четверг', 4], ['пятниц', 5], ['суббот', 6],
];

// Замена числительных на цифры с сохранением регистра — для заголовков
export function numify(text) {
  const n = normalize(' ' + text + ' ');
  // если длина слов не совпадает, возвращаем как есть; иначе переносим цифры в исходный текст
  let out = ' ' + text + ' ';
  out = out.replace(/(^|\s)(двадцать|тридцать|сорок|пятьдесят)\s(один|одна|два|две|три|четыре|пять|шесть|семь|восемь|девять)(?=\s)/gi, (_, sp, a, b) => `${sp}${NUM_WORDS[a.toLowerCase()] + NUM_WORDS[b.toLowerCase()]}`);
  out = out.replace(/(^|\s)(одна|один|два|две|двух|три|трех|трёх|четыре|четырех|четырёх|пять|пяти|шесть|шести|семь|семи|восемь|восьми|девять|девяти|десять|десяти|одиннадцать|одиннадцати|двенадцать|двенадцати|двадцать|тридцать|сорок|пятьдесят)(?=\s)/gi, (_, sp, w) => `${sp}${NUM_WORDS[w.toLowerCase().replace(/ё/g, 'е')]}`);
  return n ? out.trim() : text;
}

export function normalize(text) {
  let t = ' ' + text.toLowerCase().replace(/ё/g, 'е').replace(/[«»"“”]/g, '').replace(/\s+/g, ' ') + ' ';
  // «двадцать три» → 23, «тридцать» → 30
  t = t.replace(/ (двадцать|тридцать|сорок|пятьдесят) (один|одна|два|две|три|четыре|пять|шесть|семь|восемь|девять)(?= )/g,
    (_, a, b) => ` ${NUM_WORDS[a] + NUM_WORDS[b]}`);
  t = t.replace(/ (ноль|одна|один|два|две|двух|три|трех|четыре|четырех|пять|пяти|шесть|шести|семь|семи|восемь|восьми|девять|девяти|десять|десяти|одиннадцать|одиннадцати|двенадцать|двенадцати|тринадцать|четырнадцать|пятнадцать|шестнадцать|семнадцать|восемнадцать|девятнадцать|двадцать|тридцать|сорок|пятьдесят)(?= )/g,
    (_, w) => ` ${NUM_WORDS[w]}`);
  t = t.replace(/(\d{1,2}) (\d{2}) (?=(утра|дня|вечера|ночи|часов|$))/g, '$1:$2 ');
  return t;
}

// ── Дата ──
export function parseDate(t, now = new Date()) {
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let m;
  if (/ послезавтра/.test(t)) return { date: ymd(addD(base, 2)), match: /послезавтра\S*/ };
  if (/ завтра/.test(t)) return { date: ymd(addD(base, 1)), match: /(на )?завтра\S*/ };
  if (/ сегодня|сегодняшн/.test(t)) return { date: ymd(base), match: /(на )?сегодня\S*/ };
  if ((m = t.match(/ через (\d+|неделю|пару) ?(дн[еяи]й?|день|недел[юиь])?/)) && !/ через \d+ ?(час|мин)/.test(t) && !/ через (час|полчаса)/.test(t)) {
    let n = m[1] === 'неделю' ? 7 : m[1] === 'пару' ? 2 : Number(m[1]);
    if (/недел/.test(m[2] || '') && m[1] !== 'неделю') n *= 7;
    if (!Number.isNaN(n)) return { date: ymd(addD(base, n)), match: /через (\d+|неделю|пару) ?(дн[еяи]й?|день|недел[юиь])?/ };
  }
  if ((m = t.match(/ (\d{1,2}) (январ|феврал|март|апрел|ма[яй]|июн|июл|август|сентябр|октябр|ноябр|декабр)[а-я]*/))) {
    const day = Number(m[1]);
    const mi = MONTHS.findIndex(x => new RegExp('^' + x).test(m[2]));
    let d = new Date(base.getFullYear(), mi, day);
    if (d < addD(base, -1)) d = new Date(base.getFullYear() + 1, mi, day);
    return { date: ymd(d), match: new RegExp(`${m[1]} ${m[2]}[а-я]*`) };
  }
  if ((m = t.match(/ (?:на |к )?(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?(?= )/)) && !/ (в|к|с|до) \d{1,2}\.\d{2} /.test(t)) {
    const day = Number(m[1]), mon = Number(m[2]) - 1;
    if (mon >= 0 && mon < 12 && day >= 1 && day <= 31) {
      let y = m[3] ? Number(m[3].length === 2 ? '20' + m[3] : m[3]) : base.getFullYear();
      let d = new Date(y, mon, day);
      if (!m[3] && d < addD(base, -1)) d = new Date(y + 1, mon, day);
      return { date: ymd(d), match: new RegExp(`(на |к )?${m[1]}\\.${m[2]}(\\.${m[3] || ''})?`) };
    }
  }
  if ((m = t.match(/ (\d{1,2}) числа/))) {
    const day = Number(m[1]);
    let d = new Date(base.getFullYear(), base.getMonth(), day);
    if (d < base) d = new Date(base.getFullYear(), base.getMonth() + 1, day);
    return { date: ymd(d), match: /(на |к )?\d{1,2} числа/ };
  }
  for (const [stem, wd] of WEEKDAYS) {
    const re = new RegExp(` (во? |на |к |в эт[уоа]т? |в следующ[иу][йюе] |на следующ[иу][йюе] |следующ[иу][йюе] |этот |эту )?${stem}[а-я]*`);
    if ((m = t.match(re))) {
      let diff = (wd - base.getDay() + 7) % 7;
      const prefix = m[1] || '';
      if (diff === 0 && !/эт/.test(prefix)) diff = 7;
      if (/следующ/.test(prefix) && diff < 7 && base.getDay() !== 0 && wd > base.getDay() && false) diff += 7;
      return { date: ymd(addD(base, diff)), match: re };
    }
  }
  if (/ на следующей неделе/.test(t)) {
    const diff = ((1 - base.getDay() + 7) % 7) || 7;
    return { date: ymd(addD(base, diff)), match: /на следующей неделе/ };
  }
  return null;
}

// ── Время ──
function adjustHour(h, suffix, plain) {
  if (/вечера|дня/.test(suffix || '') && h < 12) return h + 12;
  if (/ночи/.test(suffix || '') && h === 12) return 0;
  if (/утра/.test(suffix || '')) return h === 12 ? 0 : h;
  // без уточнения: «в 3» в рабочем контексте — это 15:00
  if (plain && h >= 1 && h <= 7) return h + 12;
  return h;
}
export function parseTime(t, now = new Date()) {
  let m;
  // диапазон «с 14 до 16», «с 14:30 до 15»
  if ((m = t.match(/ с (\d{1,2})(?:[:.](\d{2}))?(?: (?:часов|часа|час))? ?(утра|дня|вечера)? (?:до|по) (\d{1,2})(?:[:.](\d{2}))?(?: (?:часов|часа|час))? ?(утра|дня|вечера)?/))) {
    const sh = adjustHour(Number(m[1]), m[3] || m[6], !m[3] && !m[6]);
    const eh = adjustHour(Number(m[4]), m[6] || m[3], !m[3] && !m[6]);
    if (sh < 24 && eh < 24) return { start: hm(sh, Number(m[2] || 0)), end: hm(eh, Number(m[5] || 0)), match: m[0].trim() };
  }
  if ((m = t.match(/ через (\d+|пол) ?(часов|часа|час|минуты|минут|мин)/)) || (m = t.match(/ через (час|полчаса)/))) {
    let mins;
    if (m[1] === 'час') mins = 60;
    else if (m[1] === 'полчаса') mins = 30;
    else if (m[1] === 'пол') mins = 30;
    else mins = /час/.test(m[2]) ? Number(m[1]) * 60 : Number(m[1]);
    const d = new Date(now.getTime() + mins * 60000);
    return { start: hm(d.getHours(), d.getMinutes()), relDate: ymd(d), match: m[0].trim() };
  }
  if ((m = t.match(/ (?:в|к|на) полдень/))) return { start: '12:00', match: m[0].trim() };
  if ((m = t.match(/ (?:в )?(?:половине|пол)\s?(первого|второго|третьего|четвертого|пятого|шестого|седьмого|восьмого|девятого|десятого|одиннадцатого|двенадцатого) ?(утра|дня|вечера)?/))) {
    const h = adjustHour(ORD_GEN[m[1]] - 1 || 12, m[2], !m[2]);
    return { start: hm(h % 24, 30), match: m[0].trim() };
  }
  if ((m = t.match(/ (?:в|к|на|около|после) (\d{1,2})[:.](\d{2}) ?(утра|дня|вечера|ночи)?/)) || (m = t.match(/ (\d{1,2}):(\d{2}) ?(утра|дня|вечера|ночи)?/))) {
    const h = adjustHour(Number(m[1]), m[3], !m[3] && Number(m[1]) >= 1 && Number(m[1]) <= 7 && !/^0?0$/.test(m[1]));
    if (h < 24 && Number(m[2]) < 60) return { start: hm(h, Number(m[2])), match: m[0].trim(), explicitPart: !!m[3] };
  }
  if ((m = t.match(/ на (\d{1,2}) ?(утра|дня|вечера|ночи)?(?= )(?! ?(час|мин|чел|этаж|комнат|кв|м2|м²|соток|дн|недел|числ|январ|феврал|март|апрел|ма[яй]|июн|июл|август|сентябр|октябр|ноябр|декабр))/))) {
    const raw = Number(m[1]);
    if (raw <= 23) return { start: hm(adjustHour(raw, m[2], !m[2]), 0), match: m[0].trim() };
  }
  if ((m = t.match(/ (?:в|к|около|после) (\d{1,2})(?: (часов|часа|час))? ?(утра|дня|вечера|ночи)?(?= |$)/))) {
    const raw = Number(m[1]);
    if (raw <= 23 && (m[2] || m[3] || raw <= 23)) {
      const h = adjustHour(raw, m[3], !m[3]);
      return { start: hm(h, 0), match: m[0].trim() };
    }
  }
  if ((m = t.match(/ (утром|с утра)/))) return { part: 'morning', match: m[0].trim() };
  if ((m = t.match(/ (днем|в обед|после обеда)/))) return { part: 'day', match: m[0].trim() };
  if ((m = t.match(/ (вечером)/))) return { part: 'evening', match: m[0].trim() };
  return null;
}
export const PARTS = { morning: [9 * 60, 12 * 60], day: [12 * 60, 17 * 60], evening: [17 * 60, 21 * 60] };

export function parseDuration(t) {
  let m;
  if (/ на полчаса/.test(t)) return 30;
  if (/ на полтора часа/.test(t)) return 90;
  if ((m = t.match(/ на (\d+) ?(час|часа|часов)/))) return Number(m[1]) * 60;
  if (/ на час/.test(t)) return 60;
  if ((m = t.match(/ на (\d+) ?(мин|минут|минуты)/))) return Number(m[1]);
  return null;
}

// ── Тип, приоритет, детали ──
export function detectType(t) {
  if (/^ (подготовить|отправить|забрать|подписать|распечатать|сделать|купить|написать|проверить|заказать|оплатить)/.test(t)) return 'task';
  if (/ (показ|просмотр|показать|покажу|смотреть квартир|посмотреть квартир)/.test(t)) return 'showing';
  if (/ (прин(ять|яти[ея]|имаю) объект|при[её]м объекта|прием объекта|принятие|нов(ый|ого) объект|взять объект|взять на продажу|эксклюзив|договор на (объект|продаж))/.test(t)) return 'intake';
  if (/ (переговор|торг|сделк|задаток|аванс|обсудить цен|обсуждение цен)/.test(t)) return 'negotiation';
  if (/ (позвонить|перезвонить|звонок|созвон|набрать|позвоню|прозвон)/.test(t)) return 'call';
  if (/ (встреч|встретиться|увидеться|подъехать к клиент|собрани|совещани|планерк|планёрк)/.test(t)) return 'meeting';
  return 'task';
}
export function detectPriority(t) {
  if (/ (срочно|важно|обязательно|высок\S* приоритет|в первую очередь|горит)/.test(t)) return 'high';
  if (/ (не срочно|если успею|по возможности|низк\S* приоритет|когда будет время)/.test(t)) return 'low';
  return 'normal';
}
export function extractPhone(text) {
  const m = text.match(/(\+?[78][\s-]?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2})/);
  return m ? m[1].replace(/[^\d+]/g, '') : '';
}
export function extractClient(text) {
  const m = text.match(/(?:(?:^|\s)(?:с|со)|клиент(?:ом|у|а|кой|ке)?|собственни(?:ком|цей|ку)|покупател(?:ем|ю))\s+([А-ЯЁ][а-яё]+(?:\s[А-ЯЁ][а-яё]+)?)/);
  return m ? m[1] : '';
}
export function extractLocation(text) {
  const m = text.match(/(?:по адресу|на улице|на ул\.?|в ЖК|в жк|ЖК|мкр\.?|микрорайон[ае]?)\s+([^,.;]+?)(?=\s+(?:в|к|с|со|до|на)\s+(?:\d|сегодня|завтра|послезавтра)|[,.;]|$)/i)
    || text.match(/(?:^|\s)на\s+((?:[А-ЯЁ][а-яё]+)(?:\s(?:[А-ЯЁ][а-яё]+|\d+[а-я]?(?:\/\d+)?))*(?:\s\d+[а-я]?(?:\/\d+)?)?)/);
  return m ? m[1].trim() : '';
}

const FILLER = /^(ну|так|итак|слушай|джарвис|помощник|пожалуйста|мне|у меня|нужно|надо|необходимо|запиши|записать|добавь|добавить|поставь|поставить|запланируй|запланировать|создай|напомни( мне)?|не забыть|хочу|буду|будет|еще|ещё|и|а|потом|затем|также|после этого|,)\s+/i;
export function makeTitle(original, removeParts) {
  let s = ' ' + original + ' ';
  for (const r of removeParts) if (r) s = s.replace(new RegExp(r.source || escapeRe(r), 'i'), ' ');
  s = s.replace(/\s+(в|на|к|с|до|около)\s*(?=[,.\s]*$)/i, ' ');
  s = s.replace(/\s+/g, ' ').trim().replace(/^[,.;:–—-]+|[,.;:–—-]+$/g, '').trim();
  let prev;
  do { prev = s; s = s.replace(FILLER, ''); } while (s !== prev);
  s = s.replace(/\s+(сегодня|завтра|послезавтра)$/i, '').trim();
  s = s.replace(/^(?:и|плюс|а)\s+/i, '').replace(/\s+(?:и|плюс|а)$/i, '');
  s = s.replace(/^встречу(?=\s|$)/i, 'Встреча').replace(/^(?:назначь|назначить|поставь)\s+/i, '');
  s = s.replace(/(^|\s)(на|ул\.?|улица)\s+([а-яё])([а-яё]{2,})(?=\s+\d|\s*$|\s+(?:с|со|в|к)\s)/g, (all, sp, pre, a, rest) =>
    /^(сегодн|завтр|послезавтр|недел|утр|вечер|обед|час|минут)/.test(a + rest) ? all : `${sp}${pre} ${a.toUpperCase()}${rest}`);
  return s ? s[0].toUpperCase() + s.slice(1) : '';
}
const escapeRe = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Разбиение длинной речи на отдельные дела.
// iPhone распознаёт речь без запятых, поэтому делим по словам-видам дел
// («встреча», «показ», «собрание», «позвонить»…), если перед ними стоит связка
// («и», «плюс», «потом») или время («в 5 показ», «08:00 позвонить»).
const KW_SRC = '(?:встреч[а-яё]*|собрани[а-яё]*|совещани[а-яё]*|планерк[а-яё]*|планёрк[а-яё]*|показ[а-яё]*|просмотр[а-яё]*|переговор[а-яё]*|звонок|звонк[а-яё]*|позвонить|перезвонить|созвон[а-яё]*|набрать|при[её]м объекта|принять (?:новый )?объект[а-яё]*|принятие объекта|задач[а-яё]*|подготовить|отправить|забрать|подписать|сделк[а-яё]*)';
const CONNECT_END = /(?:^|\s)(?:и|плюс|а|потом|затем|также|ещё|еще|после этого|а также)\s*$|[,.;]\s*$/i;
const TIME_END = /(?:(?:^|\s)(?:в|на|к|с|около))?\s*\d{1,2}(?:[:.]\d{2})?(?:\s(?:утра|дня|вечера|ночи|часов|часа|час))?\s*$/i;
const HAS_TIME = /(?:^|\s)(?:(?:в|на|к|с|около)\s)?\d{1,2}[:.]\d{2}|(?:^|\s)(?:в|на|к|около)\s\d{1,2}(?=\s|$)/i;

function splitByKeywords(text) {
  const kw = new RegExp(`(?:^|[\\s,.;])(${KW_SRC})(?=[\\s,.;!?]|$)`, 'gi');
  const hits = [];
  let m;
  while ((m = kw.exec(text))) hits.push(m.index + m[0].indexOf(m[1]));
  if (hits.length < 2) return [text];
  const cuts = [];
  for (let i = 1; i < hits.length; i++) {
    const prevStart = cuts.length ? cuts[cuts.length - 1] : 0;
    const gap = text.slice(prevStart, hits[i]);
    const tEnd = gap.match(TIME_END);
    if (tEnd && /\d/.test(tEnd[0])) {
      const before = gap.slice(0, gap.length - tEnd[0].length);
      const nextEnd = i + 1 < hits.length ? hits[i + 1] : text.length;
      const after = text.slice(hits[i], nextEnd);
      // время перед словом относится к следующему делу, если у предыдущего уже есть своё время
      // или у следующего дела другого времени нет
      if (HAS_TIME.test(before) || !HAS_TIME.test(after) || CONNECT_END.test(before)) {
        cuts.push(prevStart + before.length);
        continue;
      }
      cuts.push(hits[i]);
      continue;
    }
    const cm = gap.match(CONNECT_END);
    if (cm) cuts.push(prevStart + gap.length - cm[0].length);
  }
  const parts = [];
  let last = 0;
  for (const c of cuts) { parts.push(text.slice(last, c)); last = c; }
  parts.push(text.slice(last));
  return parts;
}

export function splitClauses(text) {
  const parts = numify(text)
    .replace(/\s+(потом|затем|после этого|а также|а еще|а ещё|и еще|и ещё|также)\s+/gi, '. ')
    .split(/(?<=[.!?;])\s+|\n+/)
    .flatMap(p => p.split(/,\s+(?=(?:в|во|к|с|на|потом|затем|еще|ещё|и|а|сегодня|завтра|послезавтра)\s)/i))
    .flatMap(splitByKeywords)
    .map(s => s.replace(/^[.,;!?\s]+|[.,;!?\s]+$/g, '').replace(/^(?:и|плюс|а|потом|затем|также|ещё|еще)\s+/i, '').replace(/\s+(?:и|плюс|а)$/i, '').trim())
    .filter(s => s.length > 1);
  return parts;
}

// ── Команды ──
export function detectCommand(t) {
  if (/ (что ты умеешь|помощь|как тобой пользоваться)/.test(t)) return 'help';
  if (/ (утренн\S* план|план на день|доброе утро|какой план)/.test(t)) return 'morning';
  if (/ (вечерн\S* отчет|итоги дня|отчет за день|подведи итог)/.test(t)) return 'evening';
  if (/ (перенеси|перенести|сдвинь|сдвинуть|передвинь|переставь|перенеси|перенос)/.test(t)) return 'move';
  if (/ (отмени|отменить|удали|удалить|убери|убрать|вычеркни)/.test(t)) return 'cancel';
  if (/ (отметь|отметить|выполнен|сделано|готово|закрой|я сделала|я сделал|выполнила|выполнил|завершил)/.test(t)) return 'done';
  if (/ (когда я свободн|свободн\S* (время|окн)|есть окно|свободн\S* слот)/.test(t)) return 'free';
  if (/ (крыш|krisha|объявлени)/.test(t) && !/ (показ|встреч|позвон)/.test(t)) return 'krisha';
  if (/ (инстаграм|instagram|рилс|reels|статистик)/.test(t) && !/ (показ|встреч|позвон)/.test(t)) return 'instagram';
  if (/ (что у меня|какие (у меня )?(планы|дела|встречи)|мое расписание|расписание на|что запланировано|покажи (день|расписание|план)|что сегодня|что завтра|план на)/.test(t)) return 'list';
  return 'add';
}

// Главная функция: текст → список намерений
export function parse(text, now = new Date()) {
  const whole = normalize(text);
  const cmd = detectCommand(whole);
  if (cmd !== 'add') {
    const intent = { op: cmd, text };
    if (cmd === 'move') {
      // «перенеси показ на Абая на завтра в 16» — цель после последнего «на/в» с датой/временем
      const sp = whole.match(/^(.*?)\s((?:на|в|во|к)\s(?:сегодня|завтра|послезавтра|понедельник|вторник|сред|четверг|пятниц|суббот|воскресен|\d|следующ|через|полдень|половин|пол[а-я]+ого|вечер|утр).*)$/);
      const targetPart = sp ? ' ' + sp[2] + ' ' : whole;
      const srcPart = sp ? sp[1] + ' ' : whole;
      const d = parseDate(targetPart, now);
      const tm = parseTime(targetPart.replace(/^ на (?=\d{1,2}[:.]?\d{0,2} )/, ' в '), now);
      intent.date = d?.date || tm?.relDate || null;
      intent.start = tm?.start || null;
      intent.part = tm?.part || null;
      const srcDate = parseDate(srcPart, now);
      intent.fromDate = srcDate?.date || null;
      intent.query = srcPart.replace(/ (перенеси|перенести|сдвинь|сдвинуть|передвинь|переставь|пожалуйста|мне|мою|мой|моё|мое|мои)(?= )/g, ' ').trim();
    } else if (cmd === 'cancel' || cmd === 'done') {
      const d = parseDate(whole, now);
      intent.fromDate = d?.date || null;
      intent.query = whole.replace(/ (отмени|отменить|удали|удалить|убери|убрать|вычеркни|отметь|отметить|как|выполнено|выполнена|выполнен|сделано|готово|закрой|я сделала|я сделал|выполнила|выполнил|пожалуйста|мне|сегодняшн\S*|завтрашн\S*)(?= )/g, ' ').trim();
    } else {
      const d = parseDate(whole, now);
      intent.date = d?.date || null;
    }
    return [intent];
  }

  const clauses = splitClauses(text);
  const out = [];
  let ctxDate = null;
  for (const c of clauses) {
    const t = normalize(c);
    const d = parseDate(t, now);
    const tm = parseTime(t, now);
    const dur = parseDuration(t);
    const date = d?.date || tm?.relDate || ctxDate || null;
    if (d?.date) ctxDate = d.date;
    if (tm?.start && !tm.explicitPart && !/утра|ночи/.test(t)) {
      const prevSame = [...out].reverse().find(o => o.start && o.date === date);
      const [h, mi] = tm.start.split(':').map(Number);
      if (prevSame && h < 12 && h + 12 < 24 && `${tm.start}` < prevSame.start) tm.start = hm(h + 12, mi);
    }
    const type = detectType(t);
    const removed = [];
    if (d) removed.push(d.match);
    if (tm) removed.push(new RegExp(escapeRe(tm.match).replace(/\\ /g, '\\s+').replace(/(\d{1,2}):(\d{2})/, '$1[:.]$2')));
    removed.push(/(с|в|к|на)\s+\d{1,2}([:.]\d{2})?(\s+(часов|часа|час))?(\s+(утра|дня|вечера|ночи))?(?=\s|$|,)/, /на (полчаса|полтора часа|час|\d+ ?(часа|часов|час|минут|мин))/, /(срочно|важно|обязательно|не срочно|если успею|по возможности)/,
      /(сегодня|завтра|послезавтра)/, /(утром|с утра|вечером|днем|днём)/);
    removed.push(/через \d+ ?[а-яё]+/, /через (час|полчаса)/, /(в )?(половине|пол)\s?[а-яё]+ого( (утра|дня|вечера))?/, /(в|к|на) полдень/);
    const cn = numify(c);
    let title = makeTitle(cn, removed);
    if (!title) title = { meeting: 'Встреча', showing: 'Показ', intake: 'Приём объекта', call: 'Звонок', negotiation: 'Переговоры', task: 'Задача' }[type];
    out.push({
      op: 'add', type, title, date, start: tm?.start || null, end: tm?.end || null, part: tm?.part || null,
      duration: dur, priority: detectPriority(t), client: extractClient(title), location: extractLocation(title), phone: extractPhone(c),
      text: c,
    });
  }
  return out;
}

// Сопоставление фразы с существующими событиями (для переноса/отмены)
const stem = w => w.toLowerCase().replace(/ё/g, 'е').slice(0, Math.max(4, Math.min(w.length - 1, 6)));
const STOP = new Set(['на', 'в', 'во', 'с', 'со', 'к', 'по', 'и', 'а', 'у', 'о', 'за', 'для', 'мой', 'мою', 'моё', 'это', 'эту', 'этот', 'тот', 'ту']);
export function scoreEvent(query, e, fromDate) {
  const q = normalize(query);
  let score = 0;
  const hay = normalize(`${e.title} ${e.location || ''} ${e.client || ''} ${e.notes || ''}`);
  const words = q.trim().split(' ').filter(w => w.length > 2 && !STOP.has(w));
  for (const w of words) if (hay.includes(' ' + stem(w)) || hay.includes(stem(w))) score += 2;
  const type = detectType(q);
  if (type !== 'task' && type === e.type) score += 3;
  if (fromDate && e.date === fromDate) score += 2;
  const tm = parseTime(q);
  if (tm?.start && e.start === tm.start) score += 3;
  return score;
}
