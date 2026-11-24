// Вызов словом «Помощник» (или «Джарвис»).
// Одна сессия распознавания: ждёт слово → «Да, я вас слушаю» → принимает команду
// до паузы в речи → передаёт текст. Микрофон не перезапускается между шагами,
// потому что iPhone не разрешает включать его без касания экрана.
// Работает, пока приложение открыто на экране.
import { settings } from './db.js';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const WAKE = /(помощник|джарвис|jarvis)/i;
export const wakeSupported = () => !!SR;

let rec = null, enabled = false, paused = false, denied = false, failures = 0, restartTimer = null;
let mode = 'wake';            // 'wake' — ждём слово; 'capture' — принимаем команду
let cb = {};                  // onWake(rest), onPartial(text), onFinal(text)
let capStart = 0, capPrefix = '', capText = '', silenceTimer = null, giveUpTimer = null, ttsActive = false, heardAny = false;

const listeners = new Set();
export const onWakeState = fn => { listeners.add(fn); fn(state()); return () => listeners.delete(fn); };
const state = () => (enabled ? (paused ? 'paused' : mode === 'capture' ? 'capture' : rec ? 'listening' : 'starting') : denied ? 'denied' : 'off');
const emit = () => listeners.forEach(fn => { try { fn(state()); } catch (e) { /* noop */ } });

export async function initWake(callbacks) {
  cb = callbacks;
  const s = await settings();
  if (s.wakeWord !== false && SR) { enabled = true; run(); }
  // iPhone включает микрофон только после касания — пробуем при каждом касании, если ещё не слушаем
  const kick = () => { if (enabled && !paused && !rec) { failures = 0; run(); } };
  document.addEventListener('touchend', kick, { passive: true });
  document.addEventListener('click', kick);
}

export function startWake() { if (!SR) return false; enabled = true; paused = false; denied = false; failures = 0; run(); return true; }
export function stopWake() { enabled = false; endCapture(); clearTimeout(restartTimer); kill(); emit(); }
// Пауза — когда микрофон нужен другой функции (кнопка «Говорить», проверка голоса)
export function pauseWake() { paused = true; endCapture(); clearTimeout(restartTimer); kill(); emit(); }
export function resumeWake() { if (!enabled) return; paused = false; clearTimeout(restartTimer); restartTimer = setTimeout(run, 500); }
// Пока говорит сам помощник — его голос не считаем командой
export function setTtsActive(on) {
  ttsActive = on;
  if (!on && mode === 'capture') armGiveUp();
}
export const isCapturing = () => mode === 'capture';

function kill() { if (rec) { rec.onend = null; rec.onresult = null; try { rec.abort(); } catch (e) { /* noop */ } rec = null; } }
function endCapture() { mode = 'wake'; clearTimeout(silenceTimer); clearTimeout(giveUpTimer); capText = ''; capPrefix = ''; heardAny = false; }
function armGiveUp() { clearTimeout(giveUpTimer); giveUpTimer = setTimeout(() => { if (mode === 'capture' && !heardAny) finish(); }, 9000); }
function finish() {
  const text = capText.replace(/^[\s,.!?]+/, '').trim();
  endCapture();
  emit();
  cb.onFinal?.(text);
}

function transcriptFrom(e, from) {
  let t = '';
  for (let i = from; i < e.results.length; i++) t += ' ' + e.results[i][0].transcript;
  return t.trim();
}

function run() {
  if (!enabled || paused || rec || document.hidden) { emit(); return; }
  const r = new SR();
  r.lang = 'ru-RU'; r.continuous = true; r.interimResults = true; r.maxAlternatives = 3;
  r.onresult = e => {
    if (mode === 'wake') {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        for (let a = 0; a < e.results[i].length; a++) {
          const t = e.results[i][a].transcript;
          const m = t.match(WAKE);
          if (!m) continue;
          mode = 'capture';
          capStart = i;
          const rest = t.slice(m.index + m[0].length).replace(/^[\s,.!?]+/, '');
          capText = rest; capPrefix = ''; heardAny = rest.length > 2;
          if (heardAny) capPrefix = '';
          emit();
          cb.onWake?.(rest);
          armGiveUp();
          if (heardAny) armSilence();
          return;
        }
      }
      return;
    }
    // режим команды
    let t = transcriptFrom(e, capStart);
    const m = t.match(WAKE);
    if (m && m.index < 3) t = t.slice(m.index + m[0].length);
    t = t.replace(/^[\s,.!?]+/, '');
    if (ttsActive) { capPrefix = t; return; }        // то, что прозвучало голосом помощника, пропускаем
    let cmd = capPrefix && t.startsWith(capPrefix) ? t.slice(capPrefix.length) : t;
    cmd = cmd.replace(/(да,?\s*)?я вас слушаю[.,!]?/i, '').replace(/^[\s,.!?]+/, '').trim();
    if (cmd.length > 1) heardAny = true;
    capText = cmd;
    cb.onPartial?.(capText);
    armSilence();
  };
  r.onerror = e => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { enabled = false; denied = true; emit(); }
    else if (e.error !== 'no-speech' && e.error !== 'aborted') failures++;
  };
  r.onend = () => {
    rec = null;
    if (mode === 'capture' && heardAny) { finish(); }
    if (!enabled || paused) { emit(); return; }
    // браузер периодически завершает сессию — перезапускаем
    restartTimer = setTimeout(run, Math.min(10000, 300 * 2 ** Math.min(failures, 5)));
    emit();
  };
  try { r.start(); rec = r; } catch (e) { failures++; restartTimer = setTimeout(run, 1500); }
  emit();
}
function armSilence() { clearTimeout(silenceTimer); silenceTimer = setTimeout(() => { if (mode === 'capture' && heardAny && !ttsActive) finish(); }, 2200); }

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { endCapture(); kill(); emit(); } else if (enabled && !paused) run();
});
