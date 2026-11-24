// Настройки: профиль, время, уведомления, Instagram, ИИ, PIN-код, резервная копия.
import { db, settings, setSetting, exportAll, importAll } from '../db.js';
import { icon, chev, sheet, toast, segmented, bindSegmented, confirmSheet, download } from '../ui.js';
import { askPermission } from '../notify.js';
import { connect, adAccounts, fbLogin, preloadFb } from '../ig.js';
import { pickModels, VOICES } from '../ai.js';
import { speak, unlockAudio, systemVoiceName } from '../speech.js';
import { applyTheme, hashPin } from '../app.js';
import { startWake, stopWake, wakeSupported } from '../wake.js';
import { allEvents } from '../events.js';
import { toICS } from '../notify.js';
import { esc, today, timeAgo } from '../util.js';

let root;
export async function render(el, params) {
  root = el;
  await draw();
  if (params.s === 'instagram') igSheet();
}

async function draw() {
  const s = await settings();
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  root.innerHTML = `
    <h1 class="large-title">Настройки</h1>
    <div class="section-title">Профиль и рабочий день</div>
    <div class="card form">
      <label class="field"><span>Ваше имя</span><input class="input" data-k="name" value="${esc(s.name)}" placeholder="Как к вам обращаться"></label>
      <div class="grid-2">
        <label class="field"><span>Начало дня</span><input class="input" type="time" data-k="workStart" value="${s.workStart}"></label>
        <label class="field"><span>Конец дня</span><input class="input" type="time" data-k="workEnd" value="${s.workEnd}"></label>
      </div>
      <div class="grid-2">
        <label class="field"><span>Утренний план в</span><input class="input" type="time" data-k="morningTime" value="${s.morningTime}"></label>
        <label class="field"><span>Вечерний отчёт в</span><input class="input" type="time" data-k="eveningTime" value="${s.eveningTime}"></label>
      </div>
      <label class="field"><span>Оформление</span>${segmented('theme', [['light', 'Светлая'], ['dark', 'Тёмная']], s.theme)}</label>
      <label class="field"><span>Валюта рекламы по умолчанию</span><select class="select" data-k="currency">${['KZT', 'USD', 'RUB', 'EUR'].map(c => `<option ${s.currency === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
    </div>

    <div class="section-title">Уведомления и голос</div>
    <div class="list">
      <div class="row"><div class="row-main"><div class="row-title">Системные уведомления</div><div class="row-sub">${{ granted: 'Включены', denied: 'Запрещены в настройках браузера', default: 'Не включены', unsupported: 'Не поддерживаются этим браузером' }[perm]}</div></div>${perm === 'default' ? '<button class="btn small" data-perm>Включить</button>' : ''}</div>
      <div class="row"><div class="row-main"><div class="row-title">Вызов словом «Помощник»</div><div class="row-sub">${wakeSupported() ? 'Скажите «Помощник» — Джарвис ответит «Да, я вас слушаю». Работает, пока приложение открыто' : 'Этот браузер не поддерживает — откройте в Safari'}</div></div><label class="switch"><input type="checkbox" data-wake ${s.wakeWord ? 'checked' : ''} ${wakeSupported() ? '' : 'disabled'}><span></span></label></div>
      <div class="row"><div class="row-main"><div class="row-title">Отвечать голосом</div><div class="row-sub">Помощник озвучивает ответы</div></div><label class="switch"><input type="checkbox" data-k="voiceReplies" ${s.voiceReplies ? 'checked' : ''}><span></span></label></div>
      <button class="row" data-voice-check><div class="row-main"><div class="row-title">Проверка голоса</div><div class="row-sub">Микрофон, распознавание, слово «Помощник», голос ответа</div></div>${chev()}</button>
      <button class="row" data-ics-all><div class="row-main"><div class="row-title">Все дела → Календарь Apple</div><div class="row-sub">Напоминания от системы, даже при закрытом приложении</div></div>${chev()}</button>
    </div>
    ${!standalone ? '<p class="footnote">На iPhone: Safari → «Поделиться» → «На экран «Домой»». Так «Арбат» работает как приложение и может присылать уведомления (iOS 16.4+).</p>' : ''}

    <div class="section-title">Подключения</div>
    <div class="list">
      <button class="row icon-row" data-ig><span class="icon-badge dark">${icon('chart')}</span><div class="row-main"><div class="row-title">Instagram</div><div class="row-sub">${s.igToken ? `@${esc(s.igUsername)} · ${s.igApi === 'facebook' ? 'Facebook Login (органика + реклама)' : 'Instagram Login (органика)'}` : 'Не подключено'}</div></div>${chev()}</button>
      <button class="row icon-row" data-ai><span class="icon-badge">${icon('spark')}</span><div class="row-main"><div class="row-title">Джарвис на GPT</div><div class="row-sub">${s.aiProvider === 'openai' && s.aiKey ? `Включён · ${esc(s.aiModel || 'модель выбирается автоматически')}` : `Выключен — встроенный разбор, голос: ${esc(systemVoiceName())}`}</div></div>${chev()}</button>
    </div>

    <div class="section-title">Безопасность и данные</div>
    <div class="list">
      <button class="row icon-row" data-pin><span class="icon-badge neutral">${icon('lock')}</span><div class="row-main"><div class="row-title">Код-пароль</div><div class="row-sub">${s.pinHash ? 'Включён · блокировка через 5 минут в фоне' : 'Выключен'}</div></div>${chev()}</button>
      <button class="row icon-row" data-export><span class="icon-badge neutral">${icon('upload')}</span><div class="row-main"><div class="row-title">Сохранить резервную копию</div><div class="row-sub">Файл JSON без ключей и паролей</div></div>${chev()}</button>
      <label class="row icon-row" style="cursor:pointer"><span class="icon-badge neutral">${icon('download')}</span><div class="row-main"><div class="row-title">Восстановить из копии</div><div class="row-sub">Или перенести данные на другое устройство</div></div><input type="file" accept="application/json,.json" hidden data-import>${chev()}</label>
      <button class="row icon-row" data-wipe><span class="icon-badge neutral" style="color:var(--danger)">${icon('trash')}</span><div class="row-main"><div class="row-title" style="color:var(--danger)">Удалить все данные</div></div></button>
    </div>
    <p class="footnote">Все данные хранятся только на этом устройстве (IndexedDB). Ключи Instagram и OpenAI отправляются только в Meta и OpenAI. </p>
    <p class="footnote">Арбат · версия 1.0 · этап 1</p>`;

  root.querySelectorAll('[data-k]').forEach(el => el.addEventListener('change', async () => {
    const v = el.type === 'checkbox' ? el.checked : el.value;
    await setSetting(el.dataset.k, v);
    toast('Сохранено');
  }));
  bindSegmented(root, async (n, v) => { await setSetting('theme', v); applyTheme(); });
  root.querySelector('[data-wake]')?.addEventListener('change', async e => {
    await setSetting('wakeWord', e.target.checked);
    if (e.target.checked) { startWake(); toast('Скажите «Помощник»'); } else stopWake();
  });
  root.querySelector('[data-perm]')?.addEventListener('click', async () => { const r = await askPermission(); toast(r === 'granted' ? 'Уведомления включены' : 'Уведомления не разрешены'); draw(); });
  root.querySelector('[data-voice-check]').onclick = voiceCheck;
  root.querySelector('[data-ics-all]').onclick = async () => {
    const list = (await allEvents()).filter(e => e.status === 'planned' && e.date >= today());
    if (!list.length) return toast('Нет предстоящих дел');
    download(`Арбат — все дела.ics`, toICS(list), 'text/calendar');
  };
  root.querySelector('[data-ig]').onclick = igSheet;
  root.querySelector('[data-ai]').onclick = aiSheet;
  root.querySelector('[data-pin]').onclick = pinSheet;
  root.querySelector('[data-export]').onclick = async () => download(`arbat-backup-${today()}.json`, JSON.stringify(await exportAll(), null, 1));
  root.querySelector('[data-import]').onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    try { await importAll(JSON.parse(await f.text())); toast('Данные восстановлены'); draw(); } catch (err) { toast(err.message); }
  };
  root.querySelector('[data-wipe]').onclick = async () => {
    if (!(await confirmSheet('Удалить все дела, объявления, отчёты и настройки на этом устройстве? Отменить будет нельзя.', { ok: 'Удалить всё' }))) return;
    for (const st of db.stores) await db.clear(st);
    location.reload();
  };
}

async function igSheet() {
  const s = await settings();
  await sheet({
    title: 'Instagram', doneText: 'Сохранить',
    body: `<div class="form">
      ${s.igToken ? `<div class="card"><b>Вход выполнен: @${esc(s.igUsername)}</b><div class="caption">${s.igApi === 'facebook' ? 'Органика и реклама через Facebook' : 'Органическая статистика'} · ${timeAgo(s.igTokenSavedAt)}</div>
        ${s.igApi === 'facebook' ? '<label class="field mt"><span>Рекламный аккаунт (статистика «Продвигать»)</span><select class="select" data-ad><option value="">Загрузка…</option></select></label>' : ''}
        <button class="btn danger" data-off style="padding:0">Выйти</button></div>` : ''}
      <label class="field"><span>ID приложения Meta</span><input class="input" name="appId" inputmode="numeric" value="${esc(s.fbAppId)}" placeholder="например, 1234567890123456"></label>
      <button type="button" class="btn block" data-login style="background:#1877f2;color:#fff">Войти через Facebook / Instagram</button>
      <p class="caption" style="margin:0 4px">Откроется окно Meta: войдите в аккаунт, к которому привязан ваш Instagram, и разрешите доступ к статистике и рекламе. Пароль вводится только на сайте Meta — приложение его не видит.</p>
      <div class="card">
        <div class="card-title">Один раз: создать приложение Meta (бесплатно)</div>
        <ol class="steps">
          <li>Instagram → Настройки → Тип аккаунта → «Автор» или «Бизнес». В Центре аккаунтов свяжите Instagram с Facebook.</li>
          <li><a href="https://developers.facebook.com/apps" target="_blank" rel="noopener">developers.facebook.com/apps</a> → «Создать приложение» → тип «Бизнес».</li>
          <li>Добавьте продукт «Вход через Facebook для бизнеса», в настройках укажите домен приложения: <code>${esc(location.host)}</code>.</li>
          <li>Скопируйте «ID приложения» (вверху страницы) и вставьте сюда.</li>
        </ol>
        <p class="caption">Приложение остаётся в режиме разработки: проверка Meta и оплата не нужны, доступ есть только у вас.</p>
      </div>
      <details><summary class="caption">Вставить токен вручную</summary>
        <label class="field mt"><span>Токен доступа</span><textarea class="textarea" name="token" placeholder="IGAA… или EAA…" style="min-height:70px;font-family:ui-monospace,Menlo,monospace;font-size:13px"></textarea></label>
      </details>
    </div>`,
    onMount: async (b, close) => {
      const appEl = b.querySelector('[name=appId]');
      appEl.addEventListener('change', () => { setSetting('fbAppId', appEl.value.trim()); if (appEl.value.trim()) preloadFb(appEl.value.trim()); });
      if (s.fbAppId) preloadFb(s.fbAppId);
      b.querySelector('[data-login]').onclick = async e => {
        await setSetting('fbAppId', appEl.value.trim());
        if (!appEl.value.trim()) return toast('Сначала вставьте ID приложения Meta');
        e.currentTarget.disabled = true;
        try { const r = await fbLogin(); toast(`Вход выполнен: @${r.username}`); close(true); draw(); setTimeout(igSheet, 300); }
        catch (err) { toast(err.message, { ms: 6000 }); }
        finally { e.currentTarget.disabled = false; }
      };
      b.querySelector('[data-off]')?.addEventListener('click', async () => {
        for (const k of ['igToken', 'igApi', 'igUserId', 'igUsername', 'adAccountId']) await setSetting(k, '');
        toast('Вы вышли из Instagram'); close(false); draw();
      });
      const sel = b.querySelector('[data-ad]');
      if (sel) {
        try {
          const list = await adAccounts();
          sel.innerHTML = list.length ? `<option value="">— не выбран —</option>${list.map(a => `<option value="${a.id}" ${s.adAccountId === a.id ? 'selected' : ''}>${esc(a.name)} · ${a.currency}</option>`).join('')}` : '<option value="">Рекламных аккаунтов не найдено</option>';
          if (list.length === 1 && !s.adAccountId) { sel.value = list[0].id; await setSetting('adAccountId', list[0].id); }
        } catch (err) { sel.innerHTML = `<option value="">${esc(err.message)}</option>`; }
        sel.onchange = async () => { await setSetting('adAccountId', sel.value); toast('Рекламный аккаунт выбран'); draw(); };
      }
    },
    done: async b => {
      await setSetting('fbAppId', b.querySelector('[name=appId]').value.trim());
      const token = b.querySelector('[name=token]').value.trim();
      if (token) { const r = await connect(token); toast(`Подключено: @${r.username}`); }
      draw();
      return true;
    },
  });
}

async function aiSheet() {
  const s = await settings();
  await sheet({
    title: 'Джарвис на GPT', doneText: 'Сохранить',
    body: `<div class="form">
      <div class="list"><div class="row"><div class="row-main"><div class="row-title">Использовать GPT</div><div class="row-sub">Понимает сложные фразы, точнее распознаёт речь, говорит голосом Джарвиса</div></div><label class="switch"><input type="checkbox" name="on" ${s.aiProvider === 'openai' ? 'checked' : ''}><span></span></label></div></div>
      <label class="field"><span>Ключ OpenAI API</span><input class="input" name="key" type="password" autocomplete="off" value="${esc(s.aiKey)}" placeholder="sk-…"></label>
      <label class="field"><span>Голос Джарвиса</span><select class="select" name="voice">${VOICES.map(([v, l]) => `<option value="${v}" ${(s.ttsVoice || 'onyx') === v ? 'selected' : ''}>${l}</option>`).join('')}<option value="system" ${s.jarvisVoice === 'system' ? 'selected' : ''}>Системный мужской (бесплатно)</option></select></label>
      <button type="button" class="btn tinted block" data-test>Прослушать голос</button>
      <div class="card">
        <div class="card-title">Важно про оплату</div>
        <p style="margin:0 0 8px">Подписка ChatGPT Plus <b>не включает</b> API: у API отдельный баланс с оплатой за использование. Для одного риелтора это обычно несколько сотен тенге в месяц — разбор фразы стоит доли цента, голосовой ответ — около цента.</p>
        <ol class="steps">
          <li>Откройте <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">platform.openai.com/api-keys</a> и войдите тем же аккаунтом, что и в ChatGPT.</li>
          <li>В разделе Billing пополните баланс (от 5 $) и поставьте лимит расходов в месяц.</li>
          <li>Нажмите «Create new secret key» и вставьте ключ сюда.</li>
        </ol>
        <p class="caption">Без ключа Джарвис работает бесплатно: встроенный разбор и системный голос.</p>
      </div>
    </div>`,
    onMount: b => {
      b.querySelector('[data-test]').onclick = async () => {
        unlockAudio();
        const key = b.querySelector('[name=key]').value.trim();
        const voice = b.querySelector('[name=voice]').value;
        const prev = { aiProvider: s.aiProvider, aiKey: s.aiKey, ttsVoice: s.ttsVoice, jarvisVoice: s.jarvisVoice };
        if (voice !== 'system' && key) { await setSetting('aiKey', key); await setSetting('aiProvider', 'openai'); await setSetting('ttsVoice', voice); }
        await setSetting('jarvisVoice', voice === 'system' ? 'system' : 'ai');
        await speak('Добрый день. Джарвис на связи. Все системы работают в штатном режиме.');
        if (voice !== 'system' && key) for (const [k, v] of Object.entries(prev)) await setSetting(k, v);
      };
    },
    done: async b => {
      const on = b.querySelector('[name=on]').checked;
      const key = b.querySelector('[name=key]').value.trim();
      const voice = b.querySelector('[name=voice]').value;
      if (on && !key) throw new Error('Вставьте ключ или выключите GPT');
      if (on) {
        const m = await pickModels(key);
        await setSetting('aiModel', m.chat); await setSetting('sttModel', m.stt); await setSetting('ttsModel', m.tts);
        toast(`GPT подключён: ${m.chat}`);
      }
      await setSetting('aiKey', key);
      await setSetting('aiProvider', on ? 'openai' : 'none');
      await setSetting('jarvisVoice', voice === 'system' ? 'system' : 'ai');
      if (voice !== 'system') await setSetting('ttsVoice', voice);
      draw();
      return true;
    },
  });
}

// Пошаговая проверка голоса на устройстве — результат можно скопировать и отправить
async function voiceCheck() {
  await sheet({
    title: 'Проверка голоса',
    body: `<div class="form">
      <p class="caption" style="margin:0 4px">Нажмите «Начать». Когда попросит — скажите вслух: «Помощник, встреча завтра в 10».</p>
      <div class="list" data-steps></div>
      <button class="btn block" data-run>Начать проверку</button>
      <button class="btn tinted block" data-copy hidden>Скопировать результат</button>
    </div>`,
    onMount: b => {
      const box = b.querySelector('[data-steps]');
      const lines = [];
      const add = (ok, title, detail = '') => {
        lines.push(`${ok === true ? '✅' : ok === false ? '❌' : 'ℹ️'} ${title}${detail ? ': ' + detail : ''}`);
        box.insertAdjacentHTML('beforeend', `<div class="row"><span style="font-size:20px">${ok === true ? '✅' : ok === false ? '❌' : 'ℹ️'}</span><div class="row-main"><div class="row-title" style="white-space:normal">${esc(title)}</div>${detail ? `<div class="row-sub" style="white-space:normal">${esc(detail)}</div>` : ''}</div></div>`);
      };
      b.querySelector('[data-run]').onclick = async e => {
        e.currentTarget.hidden = true;
        unlockAudio();
        const ua = navigator.userAgent;
        const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
        add(null, 'Устройство', `${/iPhone|iPad/.test(ua) ? 'iPhone/iPad' : 'другое'}, ${(ua.match(/OS (\d+)_(\d+)/) || []).slice(1).join('.') ? 'iOS ' + (ua.match(/OS (\d+)_(\d+)/) || []).slice(1).join('.') : ''} · ${standalone ? 'установлено на экран «Домой»' : 'открыто в браузере'}`);
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        add(!!SR, 'Распознавание речи браузером', SR ? 'есть' : 'нет — нужен GPT или Safari');
        try {
          const st = await navigator.mediaDevices.getUserMedia({ audio: true });
          st.getTracks().forEach(t => t.stop());
          add(true, 'Доступ к микрофону', 'разрешён');
        } catch (err) { add(false, 'Доступ к микрофону', `${err.name}: разрешите микрофон для сайта в Настройках iPhone → Safari → Микрофон`); }
        if (SR) {
          add(null, 'Скажите: «Помощник, встреча завтра в 10»');
          const heard = await new Promise(res => {
            const r = new SR(); r.lang = 'ru-RU'; r.interimResults = false; r.continuous = false;
            let text = '';
            const t = setTimeout(() => { try { r.stop(); } catch (x) { /* noop */ } }, 8000);
            r.onresult = ev => { text = [...ev.results].map(x => x[0].transcript).join(' '); };
            r.onerror = ev => { text = `ошибка: ${ev.error}`; };
            r.onend = () => { clearTimeout(t); res(text); };
            try { r.start(); } catch (x) { clearTimeout(t); res(`ошибка запуска: ${x.message}`); }
          });
          const okText = heard && !/^ошибка/.test(heard);
          add(okText, 'Распознано', heard || 'ничего не услышано');
          if (okText) add(/помощник|джарвис/i.test(heard), 'Слово «Помощник»', /помощник|джарвис/i.test(heard) ? 'узнаётся' : 'не узнано — попробуйте сказать чётче');
        }
        const ru = ('speechSynthesis' in window ? speechSynthesis.getVoices() : []).filter(v => /^ru/i.test(v.lang));
        add(ru.length > 0, 'Русские голоса', ru.map(v => v.name).join(', ') || 'нет');
        add(null, 'Голос ответа', systemVoiceName());
        const s = await settings();
        add(null, 'Режим GPT', s.aiProvider === 'openai' && s.aiKey ? `включён (${s.aiModel || 'модель выберется'})` : 'выключен');
        await Promise.race([new Promise(res => speak('Проверка завершена. Джарвис на связи.', { onEnd: res })), new Promise(res => setTimeout(res, 7000))]);
        add(null, 'Прозвучала фраза «Проверка завершена»?', 'если нет — проверьте громкость и бесшумный режим');
        const copy = b.querySelector('[data-copy]');
        copy.hidden = false;
        copy.onclick = async () => { await navigator.clipboard.writeText(lines.join('\n')); toast('Скопировано — вставьте в сообщение'); };
      };
    },
  });
}

async function pinSheet() {
  const s = await settings();
  await sheet({
    title: 'Код-пароль', doneText: s.pinHash ? 'Изменить' : 'Включить',
    body: `<div class="form">
      <label class="field"><span>Новый код из 4 цифр</span><input class="input" name="pin" type="password" inputmode="numeric" maxlength="4" pattern="\\d{4}" autocomplete="new-password" autofocus></label>
      <label class="field"><span>Повторите код</span><input class="input" name="pin2" type="password" inputmode="numeric" maxlength="4" autocomplete="new-password"></label>
      ${s.pinHash ? '<button type="button" class="btn danger block" data-off>Выключить код-пароль</button>' : ''}
      <p class="caption">Код хранится в виде хеша PBKDF2. Если забудете код — данные можно восстановить только из резервной копии.</p>
    </div>`,
    onMount: (b, close) => b.querySelector('[data-off]')?.addEventListener('click', async () => { await setSetting('pinHash', ''); await setSetting('pinSalt', ''); toast('Код выключен'); close(false); draw(); }),
    done: async b => {
      const pin = b.querySelector('[name=pin]').value, pin2 = b.querySelector('[name=pin2]').value;
      if (!/^\d{4}$/.test(pin)) throw new Error('Введите 4 цифры');
      if (pin !== pin2) throw new Error('Коды не совпадают');
      const { salt, hash } = await hashPin(pin);
      await setSetting('pinSalt', salt); await setSetting('pinHash', hash);
      toast('Код-пароль включён'); draw();
      return true;
    },
  });
}
