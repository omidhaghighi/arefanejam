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
      offer(info);
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
      vl.textContent = 'نسخهٔ برنامه: ' + CURRENT + '  ✅ بروزرسانی موفق  |  نصب هوشمند ✅ (تست ۲)' +
        '  |  صدای اذان در پس‌زمینه: ' + (nv ? ('✅ ' + fa(nv) + ' صدا داخل اپ') : '⚠️ ندارد (صدای پیش‌فرض گوشی)');
      vl.classList.remove('hidden');
    }
    var done = showDoneIfUpdated();
    // بررسی خودکار چند ثانیه بعد از باز شدن اپ (اگر آنلاین باشد)
    setTimeout(function () { if (!done && navigator.onLine !== false) check(false); }, 5000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
