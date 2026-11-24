// «Умный» режим через OpenAI API (GPT): разбор фраз, распознавание речи, голос Джарвиса.
// Ключ хранится только на устройстве и отправляется только в OpenAI.
// Важно: подписка ChatGPT Plus не включает API — у API отдельный баланс на platform.openai.com.
import { settings, setSetting } from './db.js';
import { TYPES } from './events.js';
import { WD } from './util.js';

const BASE = 'https://api.openai.com/v1';

export async function aiEnabled() {
  const s = await settings();
  return s.aiProvider === 'openai' && !!s.aiKey;
}

async function call(path, { method = 'POST', body, json = true, key } = {}) {
  const s = await settings();
  const headers = { Authorization: `Bearer ${key || s.aiKey}` };
  if (json && body) headers['Content-Type'] = 'application/json';
  const r = await fetch(BASE + path, { method, headers, body: json && body ? JSON.stringify(body) : body });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    const code = j.error?.code || '';
    if (r.status === 401) throw new Error('Ключ OpenAI не подходит');
    if (r.status === 429 && /quota|billing/.test(code + (j.error?.message || ''))) throw new Error('На балансе OpenAI API нет средств. Подписка ChatGPT Plus не включает API — пополните баланс на platform.openai.com');
    if (r.status === 429) throw new Error('OpenAI: слишком много запросов, попробуйте через минуту');
    if (r.status === 404) { await setSetting('aiModel', ''); throw new Error('Модель OpenAI недоступна, выберу другую — повторите'); }
    throw new Error(`OpenAI: ${j.error?.message || 'ошибка ' + r.status}`);
  }
  return r;
}

// Автовыбор актуальных моделей из доступных ключу
export async function pickModels(key) {
  const r = await call('/models', { method: 'GET', key });
  const ids = ((await r.json()).data || []).map(m => m.id);
  const ver = id => { const m = id.match(/gpt-(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : 0; };
  const chat = ids.filter(id => /^gpt-\d+(\.\d+)?o?-mini$/.test(id)).sort((a, b) => ver(b) - ver(a))[0]
    || ids.filter(id => /^gpt-\d/.test(id) && !/(audio|realtime|tts|transcribe|search|image|nano)/.test(id)).sort((a, b) => ver(b) - ver(a))[0];
  const stt = ['gpt-4o-transcribe', 'gpt-4o-mini-transcribe', 'whisper-1'].find(m => ids.includes(m)) || ids.find(id => /transcribe/.test(id)) || 'whisper-1';
  const tts = ids.filter(id => /tts/.test(id) && /gpt/.test(id)).sort()[0] || ['tts-1-hd', 'tts-1'].find(m => ids.includes(m)) || 'tts-1';
  if (!chat) throw new Error('Не найдена подходящая модель GPT для этого ключа');
  return { chat, stt, tts };
}
async function models() {
  const s = await settings();
  if (s.aiModel && s.sttModel && s.ttsModel) return { chat: s.aiModel, stt: s.sttModel, tts: s.ttsModel };
  const m = await pickModels(s.aiKey);
  await setSetting('aiModel', m.chat); await setSetting('sttModel', m.stt); await setSetting('ttsModel', m.tts);
  return m;
}

async function chat(messages, { json = false } = {}) {
  const { chat: model } = await models();
  const body = { model, messages };
  if (json) body.response_format = { type: 'json_object' };
  const r = await call('/chat/completions', { body });
  const j = await r.json();
  return j.choices?.[0]?.message?.content || '';
}

// Разбор фразы в действия над ежедневником
export async function aiPlan(text, events, now = new Date()) {
  const s = await settings();
  const pad = n => String(n).padStart(2, '0');
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const ctx = events.filter(e => e.status === 'planned' && e.date >= today).slice(0, 80)
    .map(e => ({ id: e.id, type: e.type, title: e.title, date: e.date, start: e.start || null, end: e.end || null, location: e.location || undefined, client: e.client || undefined }));
  const system = `Ты — Джарвис, голосовой ИИ-помощник риелтора из Казахстана. Говоришь по-русски, вежливо и кратко, в мужском роде, обращаешься на «вы».
Сегодня ${today}, ${WD[now.getDay()]}, сейчас ${pad(now.getHours())}:${pad(now.getMinutes())}. Рабочее время: ${s.workStart}–${s.workEnd}.
Типы дел: ${Object.entries(TYPES).map(([k, v]) => `${k} (${v.label})`).join(', ')}.
Текущие запланированные дела (JSON): ${JSON.stringify(ctx)}

Верни ТОЛЬКО JSON: {"actions":[...], "reply":"краткий ответ"}
Действия:
- {"op":"add","type":"...","title":"кратко, словами пользователя","date":"YYYY-MM-DD","start":"HH:MM"|null,"end":"HH:MM"|null,"duration":минуты|null,"part":"morning|day|evening"|null,"location":""|null,"client":""|null,"phone":""|null,"priority":"high|normal|low","notes":""|null}
- {"op":"move","id":"id из списка","date":"YYYY-MM-DD"|null,"start":"HH:MM"|null}
- {"op":"cancel","id":"..."} · {"op":"done","id":"..."}
- {"op":"list","date":"YYYY-MM-DD"} · {"op":"morning"} · {"op":"evening"} · {"op":"free","date":"YYYY-MM-DD"} · {"op":"krisha"} · {"op":"instagram"} · {"op":"help"}
Правила: не выдумывай время — если его не назвали, ставь null (приложение само найдёт свободное окно). Одна фраза может содержать несколько дел. «В 3» без уточнения в рабочем контексте — 15:00. Если не ясно, какое дело перенести или отменить, не возвращай действие, а уточни в reply.`;
  const raw = await chat([{ role: 'system', content: system }, { role: 'user', content: text }], { json: true });
  const parsed = JSON.parse(raw.replace(/^```json|```$/g, '').trim());
  if (!Array.isArray(parsed.actions)) throw new Error('Неверный ответ GPT');
  return parsed;
}

// Распознавание речи (точнее встроенного, работает и в приложении на экране «Домой»)
export async function aiTranscribe(blob) {
  const { stt } = await models();
  const ext = /mp4|m4a|aac/.test(blob.type) ? 'm4a' : /ogg/.test(blob.type) ? 'ogg' : 'webm';
  const fd = new FormData();
  fd.append('file', blob, `voice.${ext}`);
  fd.append('model', stt);
  fd.append('language', 'ru');
  fd.append('prompt', 'Риелтор диктует планы: показы квартир, встречи с клиентами, звонки, адреса Алматы и Астаны, ЖК, суммы в тенге.');
  const r = await call('/audio/transcriptions', { body: fd, json: false });
  return ((await r.json()).text || '').trim();
}

// Голос Джарвиса: спокойный, сдержанный мужской голос ИИ-дворецкого
export const VOICES = [['onyx', 'Онекс — низкий, спокойный'], ['ash', 'Эш — ровный, деловой'], ['echo', 'Эхо — мягкий'], ['fable', 'Фейбл — выразительный'], ['verse', 'Вёрс — живой']];
export async function aiSpeech(text) {
  const s = await settings();
  const { tts } = await models();
  const body = { model: tts, voice: s.ttsVoice || 'onyx', input: text.slice(0, 1500), response_format: 'mp3' };
  if (/gpt/.test(tts)) body.instructions = 'Говори по-русски голосом сдержанного интеллектуального ИИ-ассистента в духе британского дворецкого: низкий ровный тембр, спокойная уверенная интонация, чёткая дикция, лёгкая ирония, без эмоциональных всплесков, умеренный темп.';
  const r = await call('/audio/speech', { body });
  return r.blob();
}

// Советы по ролику
export async function aiReelInsight(summary) {
  return chat([
    { role: 'system', content: 'Ты — маркетолог по недвижимости в Казахстане. Отвечай по-русски маркированным списком из 3–4 конкретных советов.' },
    { role: 'user', content: `Данные ролика Instagram (не придумывай отсутствующие цифры): ${JSON.stringify(summary)}` },
  ]);
}
