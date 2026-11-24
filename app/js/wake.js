// Активация голосом: приложение слушает слово «Помощник» (или «Джарвис»),
// отвечает «Да, я вас слушаю» и принимает команды.
// Работает, пока приложение открыто на экране (ограничение iOS и браузеров).
import { settings } from './db.js';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const WAKE = /(помощник|джарвис|jarvis)/i;
export const wakeSupported = () => !!SR;

let rec = null, denied = false, enabled = false, paused = false, onWakeCb = null, restartTimer = null, failures = 0;
const listeners = new Set();
export const onWakeState = fn => { listeners.add(fn); fn(state()); return () => listeners.delete(fn); };
const state = () => (enabled ? (paused ? 'paused' : rec ? 'listening' : 'starting') : denied ? 'denied' : 'off');
const emit = () => listeners.forEach(fn => fn(state()));

export async function initWake(onWake) {
  onWakeCb = onWake;
  const s = await settings();
  if (s.wakeWord && SR) startWake();
}

export function startWake() {
  if (!SR) return false;
  enabled = true; paused = false; failures = 0; denied = false;
  run();
  return true;
}
export function stopWake() {
  enabled = false;
  clearTimeout(restartTimer);
  kill();
  emit();
}
function kill() { if (rec) { rec.onend = null; try { rec.abort(); } catch (e) { /* noop */ } rec = null; } }
// Пауза, пока идёт диалог или говорит сам помощник — чтобы не слышать себя
export function pauseWake() { paused = true; clearTimeout(restartTimer); kill(); emit(); }
export function resumeWake() {
  if (!enabled) return;
  paused = false;
  clearTimeout(restartTimer);
  restartTimer = setTimeout(run, 600);
}

function run() {
  if (!enabled || paused || rec || document.hidden) { emit(); return; }
  const r = new SR();
  r.lang = 'ru-RU'; r.continuous = true; r.interimResults = true; r.maxAlternatives = 3;
  r.onresult = e => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      for (let a = 0; a < e.results[i].length; a++) {
        const t = e.results[i][a].transcript;
        const m = t.match(WAKE);
        if (!m) continue;
        // Если сразу после слова продиктована команда — передаём её дальше
        const rest = e.results[i].isFinal ? t.slice(m.index + m[0].length).replace(/^[\s,.!?]+/, '').trim() : '';
        failures = 0;
        pauseWake();
        onWakeCb?.(rest.length > 6 ? rest : '');
        return;
      }
    }
  };
  r.onerror = e => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { enabled = false; denied = true; emit(); } else failures++;
  };
  r.onend = () => {
    rec = null;
    if (!enabled || paused) { emit(); return; }
    // браузер периодически завершает сессию — перезапускаем, при сбоях реже
    restartTimer = setTimeout(run, Math.min(15000, 400 * 2 ** Math.min(failures, 5)));
    emit();
  };
  try { r.start(); rec = r; } catch (e) { failures++; restartTimer = setTimeout(run, 2000); }
  emit();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { kill(); emit(); } else if (enabled && !paused) run();
});
