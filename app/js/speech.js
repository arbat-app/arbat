// Голос: распознавание и синтез речи в стиле Джарвиса.
// С ключом OpenAI: запись → распознавание GPT, ответ — голос OpenAI с лёгкой «цифровой» обработкой.
// Без ключа: встроенное распознавание Safari/Chrome и мужской системный голос.
import { settings } from './db.js';
import { aiEnabled, aiTranscribe, aiSpeech } from './ai.js';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const canRecognize = () => !!SR;

// ── Аудио: разблокировка на iPhone (нужно первое касание) ──
let ctx = null;
export function unlockAudio() {
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const b = ctx.createBuffer(1, 1, 22050), src = ctx.createBufferSource();
    src.buffer = b; src.connect(ctx.destination); src.start(0);
  } catch (e) { /* без Web Audio звук пойдёт через системный голос */ }
}

// ── Распознавание ──
// Колбэки: onPartial(text), onFinal(text), onError(msg), onEnd(), onLevel(0..1)
export function listen(cb) {
  unlockAudio();
  const ctl = { stop() {}, cancel() {} };
  aiEnabled().then(ai => {
    if (ai && navigator.mediaDevices?.getUserMedia && window.MediaRecorder) Object.assign(ctl, listenRecorder(cb));
    else if (SR) Object.assign(ctl, listenWebSpeech(cb));
    else { cb.onError?.('Этот браузер не распознаёт речь. Откройте приложение в Safari или подключите GPT в Настройках.'); cb.onEnd?.(); }
  });
  return { stop: () => ctl.stop(), cancel: () => ctl.cancel() };
}

function listenWebSpeech({ onPartial, onFinal, onError, onEnd }) {
  const rec = new SR();
  rec.lang = 'ru-RU'; rec.interimResults = true; rec.continuous = true; rec.maxAlternatives = 1;
  let finalText = '', cancelled = false, silenceTimer;
  const armSilence = () => { clearTimeout(silenceTimer); silenceTimer = setTimeout(() => rec.stop(), 2600); };
  rec.onresult = e => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += (finalText ? ' ' : '') + r[0].transcript.trim(); else interim += r[0].transcript;
    }
    onPartial?.((finalText + ' ' + interim).trim());
    armSilence();
  };
  rec.onerror = e => {
    const map = { 'not-allowed': 'Нет доступа к микрофону. Разрешите его в настройках.', 'no-speech': 'Ничего не слышно — попробуйте ещё раз.', network: 'Для распознавания речи нужен интернет.', 'audio-capture': 'Микрофон не найден.', aborted: '' };
    const msg = map[e.error] ?? `Ошибка распознавания: ${e.error}`;
    if (msg) onError?.(msg);
  };
  rec.onend = () => { clearTimeout(silenceTimer); if (!cancelled && finalText) onFinal?.(finalText); onEnd?.(); };
  try { rec.start(); armSilence(); } catch (e) { onError?.('Не удалось включить микрофон'); onEnd?.(); }
  return { stop: () => rec.stop(), cancel: () => { cancelled = true; rec.abort(); } };
}

// Запись с автоостановкой по тишине → распознавание GPT
function listenRecorder({ onPartial, onFinal, onError, onEnd, onLevel }) {
  let rec, stream, cancelled = false, raf, stopped = false;
  const chunks = [];
  const finish = () => { if (stopped) return; stopped = true; cancelAnimationFrame(raf); if (rec?.state === 'recording') rec.stop(); };
  (async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) { onError?.('Нет доступа к микрофону. Разрешите его в настройках.'); onEnd?.(); return; }
    const type = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find(t => MediaRecorder.isTypeSupported?.(t)) || '';
    rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    rec.ondataavailable = e => e.data.size && chunks.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      if (cancelled || !chunks.length) { onEnd?.(); return; }
      onPartial?.('Распознаю…');
      try {
        const text = await aiTranscribe(new Blob(chunks, { type: rec.mimeType || type || 'audio/webm' }));
        if (text) onFinal?.(text); else onError?.('Ничего не расслышал — попробуйте ещё раз.');
      } catch (e) { onError?.(e.message); }
      onEnd?.();
    };
    rec.start(250);
    onPartial?.('Слушаю…');
    // Детектор тишины: остановка через 1,8 с тишины после речи, максимум 90 с
    try {
      const src = ctx.createMediaStreamSource(stream), an = ctx.createAnalyser();
      an.fftSize = 1024; src.connect(an);
      const buf = new Float32Array(an.fftSize);
      let spoke = false, quietSince = performance.now();
      const started = performance.now();
      const loop = () => {
        an.getFloatTimeDomainData(buf);
        const rms = Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length);
        onLevel?.(Math.min(1, rms * 8));
        const now = performance.now();
        if (rms > 0.025) { spoke = true; quietSince = now; }
        if ((spoke && now - quietSince > 1800) || now - started > 90000 || (!spoke && now - started > 8000)) return finish();
        raf = requestAnimationFrame(loop);
      };
      loop();
    } catch (e) { /* без анализатора — остановка кнопкой «Готово» */ }
  })();
  return { stop: finish, cancel: () => { cancelled = true; finish(); } };
}

// ── Синтез речи ──
let sysVoice = null;
function pickVoice() {
  const vs = speechSynthesis.getVoices().filter(v => /^ru/i.test(v.lang));
  const male = ['Yuri (Enhanced)', 'Yuri (Premium)', 'Yuri', 'Юрий', 'Maxim', 'Максим', 'Dmitri', 'Pavel', 'Павел'];
  sysVoice = male.map(n => vs.find(v => v.name.includes(n))).find(Boolean) || vs.find(v => /male|муж/i.test(v.name)) || vs[0] || null;
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
export const systemVoiceName = () => sysVoice?.name || 'системный';

let current = null;
const clean = t => t.replace(/[•✓○↷⚠️]/g, '').replace(/—/g, ',').replace(/\n+/g, '. ');

export async function speak(text, { onEnd } = {}) {
  stopSpeaking();
  if (!text) { onEnd?.(); return; }
  const s = await settings();
  if (await aiEnabled() && s.jarvisVoice !== 'system') {
    try { await playJarvis(await aiSpeech(clean(text)), onEnd); return; } catch (e) { console.warn('TTS', e); }
  }
  speakSystem(text, onEnd);
}

function speakSystem(text, onEnd) {
  if (!('speechSynthesis' in window)) { onEnd?.(); return; }
  const u = new SpeechSynthesisUtterance(clean(text).replace(/(\d{2}):(\d{2})/g, (_, h, m) => m === '00' ? `${Number(h)} ноль ноль` : `${Number(h)} ${m}`).slice(0, 900));
  u.lang = 'ru-RU';
  if (sysVoice) u.voice = sysVoice;
  u.rate = 1.0; u.pitch = 0.82;
  u.onend = () => onEnd?.(); u.onerror = () => onEnd?.();
  speechSynthesis.speak(u);
}

// Воспроизведение с обработкой: лёгкий «цифровой» отзвук и тёплый низ
async function playJarvis(blob, onEnd) {
  unlockAudio();
  const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
  const src = ctx.createBufferSource(); src.buffer = buf;
  const low = ctx.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 180; low.gain.value = 3;
  const high = ctx.createBiquadFilter(); high.type = 'highshelf'; high.frequency.value = 5000; high.gain.value = 2;
  const delay = ctx.createDelay(); delay.delayTime.value = 0.022;
  const fb = ctx.createGain(); fb.gain.value = 0.22;
  const wet = ctx.createGain(); wet.gain.value = 0.16;
  src.connect(low); low.connect(high); high.connect(ctx.destination);
  high.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(ctx.destination);
  src.onended = () => { if (current === src) current = null; onEnd?.(); };
  current = src;
  src.start();
}

export function stopSpeaking() {
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  if (current) { try { current.onended = null; current.stop(); } catch (e) { /* noop */ } current = null; }
}
