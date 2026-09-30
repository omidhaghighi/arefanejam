/* پل بین اپ و اندروید (فقط داخل اپ اندرویدی Capacitor فعال می‌شود؛ در مرورگر/PWA هیچ کاری نمی‌کند).
   وظیفه: اذان‌ها و یادآوریِ یادداشت‌ها را به سیستم آلارم خود اندروید بسپارد تا حتی با اپِ بسته
   و صفحهٔ خاموش، دقیقاً سر وقت اعلان (با صدا) بیاید. */
(function () {
  var Cap = window.Capacitor;
  if (!Cap || typeof Cap.isNativePlatform !== 'function' || !Cap.isNativePlatform()) return;
  var LN = Cap.Plugins && Cap.Plugins.LocalNotifications;
  if (!LN) return;

  // صدای کانال اندروید بعد از ساخت قابل تغییر نیست؛ برای همین به ازای هر صدای اذانِ داخل اپ یک کانال جدا داریم
  // (azan-<id>) و هنگام زمان‌بندی، کانالِ «صدای فعال» انتخاب می‌شود. کانال azan-v3 فقط برای وقتی است که
  // هیچ صدایی داخل اپ نباشد (صدای پیش‌فرض گوشی).
  var CH_AZAN = 'azan-v3';
  var CH_AZAN_OLD = ['azan-v1', 'azan-v2'];
  var VOICES = (window.NATIVE_AZAN_VOICES && window.NATIVE_AZAN_VOICES.length) ? window.NATIVE_AZAN_VOICES : [];
  var DEFAULT_VOICE = window.NATIVE_AZAN_DEFAULT || '';
  function hasVoice(id) { for (var i = 0; i < VOICES.length; i++) { if (VOICES[i].id === id) return true; } return false; }
  function voiceChannel(id) { return 'azan-' + id; }
  function voiceFile(id) { return 'azan_' + id + '.mp3'; }
  // صدایی که واقعاً باید استفاده شود: صدای فعالِ سایت اگر داخل این نسخهٔ اپ هست؛ وگرنه صدای پیش‌فرضِ زمان ساخت
  function pickVoice(wanted) {
    if (wanted && hasVoice(wanted)) return wanted;
    if (DEFAULT_VOICE && hasVoice(DEFAULT_VOICE)) return DEFAULT_VOICE;
    return '';
  }
  var CH_NOTES = 'notes-v1';
  var SMALL_ICON = 'ic_stat_azan';
  var ready = false;
  var queuedSchedule = null;
  var queuedNotes = null;
  var busy = Promise.resolve();

  function hash(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) { h = ((h << 5) - h + str.charCodeAt(i)) | 0; }
    return Math.abs(h) % 900000000;
  }
  function azanId(key) { return 1 + hash(key); }            // ۱ تا ۹۰۰ میلیون
  function noteId(key) { return 1000000001 + hash(String(key)); } // بالاتر از بازهٔ اذان
  function log(e) { try { console.log('[NativeAlarms]', e); } catch (x) {} }

  function cancelByKind(kind) {
    return LN.getPending().then(function (r) {
      var mine = (r.notifications || []).filter(function (n) { return n.extra && n.extra.kind === kind; });
      if (!mine.length) return;
      return LN.cancel({ notifications: mine.map(function (n) { return { id: n.id }; }) });
    });
  }

  function applySchedule(prayers, enabled, brand, voiceId) {
    return cancelByKind('azan').then(function () {
      if (!enabled) return;
      var now = Date.now();
      var voice = pickVoice(voiceId);
      var items = [];
      (prayers || []).forEach(function (p) {
        var at = new Date(p.timeIso);
        if (at.getTime() <= now + 2000) return;
        var n = {
          id: azanId(p.key + '|' + p.timeIso),
          title: 'وقت اذان ' + p.label,
          body: brand || 'عارفان جام',
          schedule: { at: at, allowWhileIdle: true },
          channelId: voice ? voiceChannel(voice) : CH_AZAN,
          smallIcon: SMALL_ICON,
          extra: { kind: 'azan', label: p.label }
        };
        if (voice) n.sound = voiceFile(voice);
        items.push(n);
      });
      if (items.length) return LN.schedule({ notifications: items });
    }).catch(log);
  }

  function applyNotes(list) {
    return cancelByKind('note').then(function () {
      var now = Date.now();
      var items = [];
      (list || []).forEach(function (n) {
        if (!n.reminderAt || n.reminderFired || n.reminderAt <= now + 2000) return;
        items.push({
          id: noteId(n.id),
          title: n.title || 'یادآوری یادداشت',
          body: (n.content || '').slice(0, 140),
          schedule: { at: new Date(n.reminderAt), allowWhileIdle: true },
          channelId: CH_NOTES,
          smallIcon: SMALL_ICON,
          extra: { kind: 'note', noteId: n.id }
        });
      });
      if (items.length) return LN.schedule({ notifications: items });
    }).catch(log);
  }

  function enqueue(fn) { busy = busy.then(fn).catch(log); return busy; }

  window.NativeAlarms = {
    syncSchedule: function (prayers, enabled, brand, voiceId) {
      queuedSchedule = [prayers, enabled, brand, voiceId];
      if (ready) enqueue(function () { return applySchedule(prayers, enabled, brand, voiceId); });
    },
    syncNotes: function (list) {
      queuedNotes = [list];
      if (ready) enqueue(function () { return applyNotes(list); });
    }
  };

  function askExactAlarmIfNeeded() {
    if (typeof LN.checkExactNotificationSetting !== 'function') return Promise.resolve();
    return LN.checkExactNotificationSetting().then(function (r) {
      if (!r || r.exact_alarm === 'granted') return;
      var last = Number(localStorage.getItem('arefanejam_exact_asked') || 0);
      if (Date.now() - last < 24 * 3600 * 1000) return;
      localStorage.setItem('arefanejam_exact_asked', String(Date.now()));
      if (window.confirm('برای اینکه اذان و یادآورها دقیقاً سر وقت بیایند، اجازهٔ «آلارم‌ها و یادآورها» باید فعال باشد. تنظیمات باز شود؟')) {
        return LN.changeExactNotificationSetting();
      }
    }).catch(log);
  }

  function init() {
    return LN.requestPermissions().then(function () {
      var ch = [
        { id: CH_AZAN, name: 'اذان (صدای پیش‌فرض گوشی)', description: 'اعلان اذان', importance: 5, visibility: 1, vibration: true },
        { id: CH_NOTES, name: 'یادآوری یادداشت‌ها', description: 'یادآورهای یادداشت شخصی', importance: 4, visibility: 1, vibration: true }
      ];
      VOICES.forEach(function (v) {
        ch.push({ id: voiceChannel(v.id), name: 'اذان — ' + (v.name || v.id), description: 'اعلان و صدای اذان', importance: 5, visibility: 1, vibration: true, sound: voiceFile(v.id) });
      });
      try {
        if (typeof LN.deleteChannel === 'function') CH_AZAN_OLD.forEach(function (id) { LN.deleteChannel({ id: id }); });
      } catch (e) {}
      return Promise.all(ch.map(function (c) { return LN.createChannel(c); }));
    }).then(askExactAlarmIfNeeded).then(function () {
      ready = true;
      if (queuedSchedule) enqueue(function () { return applySchedule(queuedSchedule[0], queuedSchedule[1], queuedSchedule[2], queuedSchedule[3]); });
      if (queuedNotes) enqueue(function () { return applyNotes(queuedNotes[0]); });
    }).catch(log);
  }

  // اگر اذان همین الان و در حالی رسید که اپ باز است، خودِ اپ صدا را پخش می‌کند؛
  // پس اعلان صدادار را می‌بندیم تا صدا دوبار نیاید.
  LN.addListener('localNotificationReceived', function (n) {
    try {
      if (n && n.extra && n.extra.kind === 'azan' && document.visibilityState === 'visible') {
        LN.cancel({ notifications: [{ id: n.id }] });
      }
    } catch (e) {}
  });

  // لمس اعلان: اذان → پخش صدا؛ یادداشت → باز کردن همان یادداشت
  LN.addListener('localNotificationActionPerformed', function (ev) {
    var ex = (ev && ev.notification && ev.notification.extra) || {};
    setTimeout(function () {
      try {
        if (ex.kind === 'azan' && typeof playAzanSound === 'function') {
          playAzanSound(ex.label || '');
        } else if (ex.kind === 'note' && typeof switchToTab === 'function') {
          switchToTab('notes', { push: true });
          var note = getLocalNotes().find(function (n) { return n.id === ex.noteId; });
          if (note) openNoteModal(note);
        }
      } catch (e) { log(e); }
    }, 1500);
  });

  init();
})();


/* بروزرسانی داخل اپ (فقط اپ اندرویدی Capacitor).
   نسخهٔ نصب‌شده با آخرین نسخهٔ اعلام‌شده در سایت مقایسه می‌شود. اگر جدیدتر بود، یک پنجرهٔ گرافیکی نشان داده می‌شود:
   دانلود با نوار پیشرفت (داخل خود اپ، بدون مرورگر) ← دکمهٔ نصب ← بعد از نصب و باز شدن اپ، پیام «بروزرسانی انجام شد».
   نصب روی نسخهٔ قبلی انجام می‌شود (هر دو نسخه با یک کلید امضا ساخته می‌شوند)؛ نیازی به حذف اپ قبلی نیست. */
(function () {
  var Cap = window.Capacitor;
  if (!Cap || typeof Cap.isNativePlatform !== 'function' || !Cap.isNativePlatform()) return;

  var CURRENT = String(window.NATIVE_APP_VERSION || '0.0.0');
  var DEFAULT_API = 'https://arefanejam.com/wp-json/arefanejam/v1';
  var LATER_KEY = 'arefanejam_update_later';
  var TARGET_KEY = 'arefanejam_update_target';
  var LATER_MS = 24 * 3600 * 1000; // بعد از «بعداً»، تا ۲۴ ساعت خودکار دوباره نمی‌پرسد
  var checking = false;
  var busyUpdating = false;
  var pollTimer = null;
  var waitingPermission = false;
  var ui = null;

  // ---- حالت «بروزرسانی خودکار» (وقتی در پیشخوان سایت روشن باشد) ----
  var READY_KEY = 'arefanejam_auto_ready_v';     // نسخه‌ای که APK آن قبلاً دانلود شده
  var ATTEMPT_KEY = 'arefanejam_auto_attempt_v'; // نسخه‌ای که یک بار نصب بی‌صدا برایش تلاش شده
  var FAIL_KEY = 'arefanejam_auto_fail';         // {v, n, ts}
  var RETRY_MS = 3 * 3600 * 1000;                // بعد از شکست، ۳ ساعت بعد دوباره
  var RECHECK_MS = 6 * 3600 * 1000;              // بررسی دوره‌ای وقتی اپ باز مانده
  var autoBusy = false;
  var pendingSilent = null;
  var lastCheckTs = 0;
  var toastEl = null;
  var toastTimer = null;

  function log(e) { try { console.log('[AppUpdate]', e); } catch (x) {} }
  function AU() { return Cap.Plugins && Cap.Plugins.AppUpdater; }

  function apiBase() {
    var b = '';
    try { b = localStorage.getItem('arefanejam_api_url') || ''; } catch (e) {}
    return (b || DEFAULT_API).replace(/\/$/, '');
  }

  // مقایسهٔ نسخه‌ها مثل 1.10.0 و 1.9.3 (عددی، نه رشته‌ای)
  function isNewer(remote, local) {
    var a = String(remote).split('.').map(function (n) { return parseInt(n, 10) || 0; });
    var b = String(local).split('.').map(function (n) { return parseInt(n, 10) || 0; });
    for (var i = 0; i < Math.max(a.length, b.length); i++) {
      var x = a[i] || 0, y = b[i] || 0;
      if (x > y) return true;
      if (x < y) return false;
    }
    return false;
  }

  function fa(n) { try { return Number(n).toLocaleString('fa-IR'); } catch (e) { return String(n); } }
  function mb(bytes) { return fa((bytes / 1048576).toFixed(1)); }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  var ICONS = {
    arrow: '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11"/><path d="M7 11l5 5 5-5"/><path d="M5 20h14"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="38" height="38" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path class="upd-check-path" d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    warn: '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8v5"/><path d="M12 17h.01"/><path d="M10.3 3.9L2.5 17.5A2 2 0 004.2 20.5h15.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/></svg>'
  };

  function closeModal() {
    var m = document.getElementById('app-update-modal');
    if (m) m.remove();
    ui = null;
    stopPoll();
  }

  // ساخت پنجره (فقط یک بار؛ بعد از آن فقط محتوا عوض می‌شود تا انیمیشن نرم بماند)
  function buildUi() {
    var old = document.getElementById('app-update-modal');
    if (old) old.remove();
    var modal = el('div', 'modal');
    modal.id = 'app-update-modal';
    var box = el('div', 'modal-box upd-card');
    var icon = el('div', 'upd-icon');
    var title = el('h3', 'upd-title');
    var vers = el('div', 'upd-vers');
    var msg = el('p', 'upd-msg');
    var notes = el('div', 'upd-notes');
    var prog = el('div', 'upd-progress');
    var bar = el('div', 'upd-bar');
    var fill = el('div', 'upd-fill');
    bar.appendChild(fill);
    var pct = el('div', 'upd-pct');
    prog.appendChild(bar); prog.appendChild(pct);
    var actions = el('div', 'upd-actions');
    [icon, title, vers, msg, notes, prog, actions].forEach(function (n) { box.appendChild(n); });
    modal.appendChild(box);
    document.body.appendChild(modal);
    ui = { modal: modal, box: box, icon: icon, title: title, vers: vers, msg: msg, notes: notes, prog: prog, fill: fill, pct: pct, actions: actions };
    return ui;
  }

  // o: {mode: 'info'|'progress'|'success'|'error', icon, title, from, to, message, notes, percent, pctText, buttons:[{label, primary, onClick, keepOpen}]}
  function render(o) {
    if (!ui) buildUi();
    ui.box.className = 'modal-box upd-card upd-' + (o.mode || 'info');
    ui.icon.innerHTML = ICONS[o.icon || 'arrow'];
    ui.title.textContent = o.title || '';
    ui.vers.textContent = '';
    if (o.to) {
      if (o.from) {
        var a = el('span', 'upd-chip', o.from);
        var arr = el('span', 'upd-arrow', '←');
        ui.vers.appendChild(a); ui.vers.appendChild(arr);
      }
      ui.vers.appendChild(el('span', 'upd-chip upd-chip-new', o.to));
    }
    ui.vers.style.display = o.to ? '' : 'none';
    ui.msg.textContent = o.message || '';
    ui.msg.style.display = o.message ? '' : 'none';
    ui.notes.textContent = o.notes || '';
    ui.notes.style.display = o.notes ? '' : 'none';
    var showProg = typeof o.percent === 'number' || o.indeterminate;
    ui.prog.style.display = showProg ? '' : 'none';
    ui.prog.classList.toggle('upd-indeterminate', !!o.indeterminate);
    if (typeof o.percent === 'number') ui.fill.style.width = Math.max(0, Math.min(100, o.percent)) + '%';
    ui.pct.textContent = o.pctText || '';
    ui.actions.textContent = '';
    (o.buttons || []).forEach(function (b) {
      var btn = el('button', b.primary ? 'upd-btn upd-btn-primary' : 'upd-btn', b.label);
      btn.type = 'button';
      btn.addEventListener('click', function () {
        if (!b.keepOpen) closeModal();
        if (b.onClick) b.onClick();
      });
      ui.actions.appendChild(btn);
    });
  }

  function stopPoll() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

  function fetchInfo() {
    return fetch(apiBase() + '/app-update?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); });
  }

  // اگر اپ قدیمی (بدون بخش نصب داخلی) باشد، مثل قبل با مرورگر باز می‌شود
  function browserFallback(url) {
    var B = Cap.Plugins && Cap.Plugins.Browser;
    try { if (B && typeof B.open === 'function') { B.open({ url: url }); return; } } catch (e) { log(e); }
    try { window.open(url, '_blank'); } catch (e2) { location.href = url; }
  }

  function lsGet(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

  // پیام کوچک پایین صفحه (بدون مزاحمت برای کاربر)
  function toast(text, ms) {
    try {
      if (!toastEl) {
        toastEl = el('div', 'upd-toast');
        toastEl.style.cssText = 'position:fixed;left:12px;right:12px;bottom:18px;z-index:99999;margin:0 auto;max-width:420px;' +
          'padding:11px 16px;border-radius:14px;background:#143C36;color:#fff;font-size:13px;line-height:1.8;text-align:center;' +
          'box-shadow:0 8px 24px rgba(20,60,54,.35);direction:rtl;';
        document.body.appendChild(toastEl);
      }
      toastEl.textContent = text;
      toastEl.style.display = '';
      if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
      if (ms) toastTimer = setTimeout(hideToast, ms);
    } catch (e) { log(e); }
  }
  function hideToast() { if (toastEl) toastEl.style.display = 'none'; }

  function readFail(v) {
    try { var o = JSON.parse(lsGet(FAIL_KEY) || '{}'); if (o && String(o.v) === String(v)) return o; } catch (e) {}
    return { v: v, n: 0, ts: 0 };
  }
  function addFail(v) {
    var o = readFail(v);
    lsSet(FAIL_KEY, JSON.stringify({ v: String(v), n: (o.n || 0) + 1, ts: Date.now() }));
  }

  // نصب بی‌صدا: فقط وقتی کاربر از اپ خارج شد (اندروید بروزرسانی بی‌صدا را برای اپ در حال نمایش قبول نمی‌کند)
  function installSilentNow() {
    var info = pendingSilent;
    if (!info) return;
    pendingSilent = null;
    var P = AU();
    if (!P) return;
    lsSet(ATTEMPT_KEY, String(info.version));
    try { P.install().catch(function (e) { log(e); }); } catch (e) { log(e); }
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden' && pendingSilent) installSilentNow();
  });

  // بعد از دانلود: یا برای هنگام خروج از اپ نگه می‌داریم (بی‌صدا)، یا همین حالا نصب را نشان می‌دهیم
  function afterAutoDownload(info, st, forceForeground) {
    lsSet(TARGET_KEY, String(info.version));
    if (st && st.silentLikely && !forceForeground) {
      pendingSilent = info;
      toast('بروزرسانی ' + info.version + ' آماده شد و هنگام خروج از برنامه خودکار نصب می‌شود.', 7000);
      autoBusy = false;
      return;
    }
    hideToast();
    autoBusy = false;
    busyUpdating = true;
    doInstall(info); // اجازهٔ نصب یا تأیید یک‌باره را با پنجرهٔ ساده نشان می‌دهد
  }

  function autoUpdate(info) {
    var P = AU();
    if (!P || typeof P.status !== 'function') { offer(info); return; }
    if (busyUpdating || autoBusy) return;

    var f = readFail(info.version);
    if (f.n >= 2) { offer(info); return; } // دو بار خودکار نشد ← از کاربر می‌خواهیم دستی بزند
    if (f.n > 0 && Date.now() - f.ts < RETRY_MS) return;

    autoBusy = true;
    var forceForeground = lsGet(ATTEMPT_KEY) === String(info.version); // نصب بی‌صدا قبلاً جواب نداده
    var stInfo = null;

    P.status().then(function (st) {
      stInfo = st || {};
      var ready = stInfo.hasApk && lsGet(READY_KEY) === String(info.version);
      if (ready) return;
      toast('در حال دانلود خودکار نسخهٔ جدید…', 0);
      stopPoll();
      pollTimer = setInterval(function () {
        P.progress().then(function (r) {
          if (!r || r.state !== 'downloading' || !(r.total > 0)) return;
          toast('دانلود خودکار نسخهٔ جدید: ' + fa(Math.floor(r.loaded * 100 / r.total)) + '٪', 0);
        }).catch(function () {});
      }, 500);
      return P.download({ url: info.apk_url }).then(function () {
        stopPoll();
        lsSet(READY_KEY, String(info.version));
      });
    }).then(function () {
      afterAutoDownload(info, stInfo, forceForeground);
    }).catch(function (e) {
      log(e);
      stopPoll();
      hideToast();
      autoBusy = false;
      addFail(info.version);
    });
  }

  function offer(info) {
    render({
      mode: 'info', icon: 'arrow',
      title: 'نسخهٔ جدید آماده است',
      from: CURRENT, to: info.version,
      message: 'با زدن «بروزرسانی»، نسخهٔ جدید دانلود و نصب می‌شود. اطلاعات و تنظیمات شما حفظ می‌شود و نیازی به حذف اپ قبلی نیست.',
      notes: info.notes || '',
      buttons: [
        { label: 'بروزرسانی', primary: true, keepOpen: true, onClick: function () { startUpdate(info); } },
        { label: 'بعداً', onClick: function () {
            try { localStorage.setItem(LATER_KEY + '_v', String(info.version)); localStorage.setItem(LATER_KEY + '_ts', String(Date.now())); } catch (e) {}
          } }
      ]
    });
  }

  function showError(info, text) {
    busyUpdating = false;
    stopPoll();
    render({
      mode: 'error', icon: 'warn',
      title: 'بروزرسانی کامل نشد',
      message: text || 'اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.',
      buttons: [
        { label: 'تلاش دوباره', primary: true, keepOpen: true, onClick: function () { startUpdate(info); } },
        { label: 'بستن' }
      ]
    });
  }

  function startUpdate(info) {
    var P = AU();
    if (!P) { closeModal(); browserFallback(info.apk_url); return; }
    if (busyUpdating) return;
    busyUpdating = true;
    waitingPermission = false;
    try { localStorage.setItem(TARGET_KEY, String(info.version)); } catch (e) {}

    render({
      mode: 'progress', icon: 'arrow',
      title: 'در حال دانلود…',
      from: CURRENT, to: info.version,
      message: 'لطفاً تا پایان دانلود اپ را نبندید.',
      percent: 0, pctText: fa(0) + '٪',
      buttons: [{ label: 'لغو', keepOpen: false, onClick: function () { try { P.cancel(); } catch (e) {} busyUpdating = false; } }]
    });

    stopPoll();
    pollTimer = setInterval(function () {
      P.progress().then(function (r) {
        if (!r || r.state !== 'downloading' || !ui) return;
        if (r.total > 0) {
          var p = Math.floor(r.loaded * 100 / r.total);
          ui.fill.style.width = p + '%';
          ui.pct.textContent = fa(p) + '٪  —  ' + mb(r.loaded) + ' از ' + mb(r.total) + ' مگابایت';
        }
      }).catch(function () {});
    }, 300);

    P.download({ url: info.apk_url }).then(function () {
      stopPoll();
      render({
        mode: 'progress', icon: 'check', title: 'دانلود کامل شد',
        from: CURRENT, to: info.version,
        message: 'در حال باز کردن صفحهٔ نصب…',
        percent: 100, pctText: fa(100) + '٪'
      });
      setTimeout(function () { doInstall(info); }, 900);
    }).catch(function (e) {
      var m = String((e && (e.message || e)) || '');
      if (m.indexOf('cancelled') !== -1) { busyUpdating = false; stopPoll(); closeModal(); return; }
      log(e);
      showError(info, 'دانلود انجام نشد. اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.');
    });
  }

  function doInstall(info) {
    var P = AU();
    P.install().then(function (r) {
      var st = r && r.status;
      if (st === 'needs_permission') {
        waitingPermission = true;
        render({
          mode: 'info', icon: 'warn',
          title: 'یک اجازه لازم است',
          from: CURRENT, to: info.version,
          message: 'در صفحهٔ تنظیماتی که باز شد، گزینهٔ «اجازه‌ی نصب از این منبع» را روشن کنید و به اپ برگردید. نصب خودکار ادامه پیدا می‌کند.',
          buttons: [
            { label: 'ادامهٔ نصب', primary: true, keepOpen: true, onClick: function () { doInstall(info); } },
            { label: 'بستن', onClick: function () { busyUpdating = false; waitingPermission = false; } }
          ]
        });
        window.__updInfo = info;
        return;
      }
      waitingPermission = false;
      busyUpdating = false;
      render({
        mode: 'success', icon: 'check',
        title: 'آمادهٔ نصب است',
        from: CURRENT, to: info.version,
        message: 'در صفحهٔ نصب اندروید روی «نصب» بزنید. بعد از پایان، «باز کردن» را انتخاب کنید تا نسخهٔ جدید اجرا شود.',
        buttons: [
          { label: 'نصب دوباره', keepOpen: true, onClick: function () { doInstall(info); } },
          { label: 'بستن', primary: true }
        ]
      });
    }).catch(function (e) {
      log(e);
      showError(info, 'باز کردن نصب‌کننده انجام نشد. دوباره تلاش کنید.');
    });
  }

  // بعد از برگشتن از صفحهٔ تنظیمات، اگر منتظر اجازه بودیم، نصب را خودکار ادامه می‌دهیم
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && waitingPermission && window.__updInfo) doInstall(window.__updInfo);
  });

  function check(manual) {
    if (checking || busyUpdating) return;
    checking = true;
    lastCheckTs = Date.now();
    fetchInfo().then(function (info) {
      var announced = !!(info && info.enabled && info.version && info.apk_url);
      var available = announced && isNewer(info.version, CURRENT);
      if (!available) {
        if (manual) render({
          mode: 'success', icon: 'check',
          title: announced ? 'برنامه به‌روز است' : 'نسخهٔ جدیدی اعلام نشده',
          message: (announced ? 'شما از آخرین نسخه استفاده می‌کنید.' : 'فعلاً نسخهٔ جدیدی برای اپ اعلام نشده است.') +
                   '\nنسخهٔ شما: ' + CURRENT + (announced ? '   |   آخرین نسخهٔ سایت: ' + info.version : ''),
          buttons: [{ label: 'باشه', primary: true }]
        });
        return;
      }
      if (!manual) {
        var last = 0, lastV = '';
        try { last = Number(localStorage.getItem(LATER_KEY + '_ts') || 0); lastV = localStorage.getItem(LATER_KEY + '_v') || ''; } catch (e) {}
        if (lastV === String(info.version) && Date.now() - last < LATER_MS) return;
      }
      if (info.auto === true && !manual) autoUpdate(info);
      else offer(info);
    }).catch(function (e) {
      log(e);
      if (manual) render({
        mode: 'error', icon: 'warn',
        title: 'بررسی انجام نشد',
        message: 'اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.',
        buttons: [{ label: 'باشه', primary: true }]
      });
    }).then(function () { checking = false; });
  }

  // اگر قبلاً بروزرسانی شروع شده بود و الان اپ روی همان نسخه (یا بالاتر) باز شده، یعنی نصب موفق بوده
  function showDoneIfUpdated() {
    var target = '';
    try { target = localStorage.getItem(TARGET_KEY) || ''; } catch (e) {}
    if (!target) return false;
    if (isNewer(target, CURRENT)) return false; // هنوز نصب نشده (مثلاً کاربر نصب را لغو کرده)
    try { localStorage.removeItem(TARGET_KEY); } catch (e) {}
    lsDel(READY_KEY); lsDel(ATTEMPT_KEY); lsDel(FAIL_KEY);
    try { var P = AU(); if (P) P.cleanup(); } catch (e2) {}
    render({
      mode: 'success', icon: 'check',
      title: 'بروزرسانی انجام شد',
      to: CURRENT,
      message: 'اپ با موفقیت به نسخهٔ جدید بروزرسانی شد. ممنون که همراه ما هستید.',
      buttons: [{ label: 'باشه', primary: true }]
    });
    return true;
  }

  function wire() {
    var tile = document.getElementById('app-update-tile');
    if (tile) {
      tile.classList.remove('hidden');
      tile.addEventListener('click', function () { check(true); });
    }
    var vl = document.getElementById('app-version-line');
    if (vl) {
      var nv = (window.NATIVE_AZAN_VOICES && window.NATIVE_AZAN_VOICES.length) || 0;
      vl.textContent = 'نسخهٔ برنامه: ' + CURRENT +
        '  |  صدای اذان در پس‌زمینه: ' + (nv ? ('✅ ' + fa(nv) + ' صدا داخل اپ') : '⚠️ ندارد (صدای پیش‌فرض گوشی)');
      vl.classList.remove('hidden');
      showWebLine();
    }
    watchBoot();
    var done = showDoneIfUpdated();
    // بررسی خودکار چند ثانیه بعد از باز شدن اپ (اگر آنلاین باشد)
    setTimeout(function () { if (!done && navigator.onLine !== false) check(false); }, 5000);
    setTimeout(function () { if (navigator.onLine !== false) webCheck(); }, 9000);
    setInterval(function () { if (navigator.onLine !== false) webCheck(); }, RECHECK_MS);
    // اگر اپ مدت زیادی باز بماند یا از پس‌زمینه برگردد، دوباره از سایت می‌پرسد (بروزرسانی خودکار)
    setInterval(function () { if (navigator.onLine !== false) check(false); }, RECHECK_MS);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && navigator.onLine !== false && Date.now() - lastCheckTs > 3600 * 1000) check(false);
    });
  }


  /* ================== بروزرسانی «ظاهر اپ» از سایت (بدون ساخت APK) ==================
     فایل‌های پوشهٔ app/ افزونهٔ سایت (همان که اپ اصلاً از آن ساخته شده) با هش مقایسه می‌شوند؛
     اگر فرق داشت، در پس‌زمینه دانلود و «آماده» می‌شوند و در باز شدن بعدی اپ (یا وقتی کاربر بعد از
     مدتی به اپ برمی‌گردد) اعمال می‌شوند. اگر نسخهٔ جدید خراب باشد، خودکار به نسخهٔ داخل APK برمی‌گردد. */
  var WEB_BAD_MS = 24 * 3600 * 1000; // نسخهٔ خراب‌شده تا ۲۴ ساعت دوباره امتحان نمی‌شود
  var webBusy = false;
  var webHiddenAt = 0;
  var webLastCheck = 0;
  var sessionStart = Date.now();

  function webManifestFetch() {
    return fetch(apiBase() + '/web-manifest?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); });
  }

  function webApplyStaged() {
    var P = AU();
    if (!P || typeof P.webStatus !== 'function') return;
    P.webStatus().then(function (s) {
      if (s && s.stagedId) return P.webApply();
    }).catch(log);
  }

  function userIsTyping() {
    var a = document.activeElement;
    return !!(a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable));
  }

  function webCheck() {
    var P = AU();
    if (!P || typeof P.webStatus !== 'function' || webBusy) return;
    webBusy = true;
    webLastCheck = Date.now();
    var st = {};
    P.webStatus().then(function (s) {
      st = s || {};
      return webManifestFetch();
    }).then(function (m) {
      if (!m || !m.enabled || !m.id || !m.base || !m.files || !m.files.length) return;
      if (m.id === st.activeId || m.id === st.stagedId) return;
      if (m.id === st.badId && Date.now() - (st.badTs || 0) < WEB_BAD_MS) return;
      return P.webSync({ id: m.id, base: m.base, files: m.files }).then(function () {
        // اگر اپ همین چند ثانیه پیش باز شده و کاربر مشغول کاری نیست، همین حالا اعمال شود؛ وگرنه دفعهٔ بعد
        if (Date.now() - sessionStart < 25000 && !userIsTyping()) webApplyStaged();
      });
    }).catch(log).then(function () { webBusy = false; });
  }

  // اپ که بعد از مدتی از پس‌زمینه برگردد مثل باز شدن تازه است؛ نسخهٔ آماده را همان موقع اعمال می‌کنیم
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') { webHiddenAt = Date.now(); return; }
    if (webHiddenAt && Date.now() - webHiddenAt > 30000 && !userIsTyping()) { webHiddenAt = 0; webApplyStaged(); }
    if (navigator.onLine !== false && Date.now() - webLastCheck > 3600 * 1000) webCheck();
  });

  // تأیید سالم بودن: وقتی app.js تا آخر اجرا شد (window.__arefBooted)، اپ به بومی خبر می‌دهد
  function watchBoot() {
    var tries = 0;
    var t = setInterval(function () {
      tries++;
      var P = AU();
      if (window.__arefBooted && P && typeof P.webConfirm === 'function') {
        clearInterval(t);
        P.webConfirm().catch(log);
      } else if (tries > 40) {
        clearInterval(t);
      }
    }, 500);
  }

  function showWebLine() {
    var P = AU();
    var vl = document.getElementById('app-version-line');
    if (!P || !vl || typeof P.webStatus !== 'function') return;
    P.webStatus().then(function (s) {
      var id = s && s.activeId ? String(s.activeId).slice(0, 6) : '';
      vl.textContent += '  |  ظاهر اپ: ' + (id ? ('از سایت (' + id + ')') : 'داخلی');
    }).catch(function () {});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
