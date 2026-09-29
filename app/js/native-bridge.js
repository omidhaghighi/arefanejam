/* پل بین اپ و اندروید (فقط داخل اپ اندرویدی Capacitor فعال می‌شود؛ در مرورگر/PWA هیچ کاری نمی‌کند).
   وظیفه: اذان‌ها و یادآوریِ یادداشت‌ها را به سیستم آلارم خود اندروید بسپارد تا حتی با اپِ بسته
   و صفحهٔ خاموش، دقیقاً سر وقت اعلان (با صدا) بیاید. */
(function () {
  var Cap = window.Capacitor;
  if (!Cap || typeof Cap.isNativePlatform !== 'function' || !Cap.isNativePlatform()) return;
  var LN = Cap.Plugins && Cap.Plugins.LocalNotifications;
  if (!LN) return;

  var CH_AZAN = 'azan-v1';
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

  function applySchedule(prayers, enabled, brand) {
    return cancelByKind('azan').then(function () {
      if (!enabled) return;
      var now = Date.now();
      var items = [];
      (prayers || []).forEach(function (p) {
        var at = new Date(p.timeIso);
        if (at.getTime() <= now + 2000) return;
        var n = {
          id: azanId(p.key + '|' + p.timeIso),
          title: 'وقت اذان ' + p.label,
          body: brand || 'عارفان جام',
          schedule: { at: at, allowWhileIdle: true },
          channelId: CH_AZAN,
          smallIcon: SMALL_ICON,
          extra: { kind: 'azan', label: p.label }
        };
        if (window.NATIVE_AZAN_SOUND) n.sound = 'azan.mp3';
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
    syncSchedule: function (prayers, enabled, brand) {
      queuedSchedule = [prayers, enabled, brand];
      if (ready) enqueue(function () { return applySchedule(prayers, enabled, brand); });
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
        { id: CH_AZAN, name: 'اذان', description: 'اعلان و صدای اذان', importance: 5, visibility: 1, vibration: true },
        { id: CH_NOTES, name: 'یادآوری یادداشت‌ها', description: 'یادآورهای یادداشت شخصی', importance: 4, visibility: 1, vibration: true }
      ];
      if (window.NATIVE_AZAN_SOUND) ch[0].sound = 'azan.mp3';
      return Promise.all(ch.map(function (c) { return LN.createChannel(c); }));
    }).then(askExactAlarmIfNeeded).then(function () {
      ready = true;
      if (queuedSchedule) enqueue(function () { return applySchedule(queuedSchedule[0], queuedSchedule[1], queuedSchedule[2]); });
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
   نسخهٔ نصب‌شده با آخرین نسخهٔ اعلام‌شده در سایت مقایسه می‌شود؛ اگر جدیدتر بود پنجره‌ای با دو گزینهٔ
   «بروزرسانی» و «بعداً» نشان داده می‌شود. «بروزرسانی» فایل APK را دانلود می‌کند و بعد از نصب، روی نسخهٔ قبلی
   جایگزین می‌شود (نیازی به حذف اپ قبلی نیست، چون هر دو نسخه با یک کلید امضا ساخته می‌شوند). */
(function () {
  var Cap = window.Capacitor;
  if (!Cap || typeof Cap.isNativePlatform !== 'function' || !Cap.isNativePlatform()) return;

  var CURRENT = String(window.NATIVE_APP_VERSION || '0.0.0');
  var DEFAULT_API = 'https://arefanejam.com/wp-json/arefanejam/v1';
  var LATER_KEY = 'arefanejam_update_later';
  var LATER_MS = 24 * 3600 * 1000; // بعد از «بعداً»، تا ۲۴ ساعت خودکار دوباره نمی‌پرسد
  var checking = false;

  function log(e) { try { console.log('[AppUpdate]', e); } catch (x) {} }

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

  function closeModal() {
    var m = document.getElementById('app-update-modal');
    if (m) m.remove();
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function openModal(o) {
    closeModal();
    var modal = el('div', 'modal');
    modal.id = 'app-update-modal';
    var box = el('div', 'modal-box app-update-box');
    box.appendChild(el('h3', '', o.title));
    if (o.versionLine) box.appendChild(el('p', 'app-update-ver', o.versionLine));
    if (o.message) box.appendChild(el('p', 'muted-text', o.message));
    if (o.notes) box.appendChild(el('div', 'app-update-notes', o.notes));
    if (o.hint) box.appendChild(el('p', 'muted-text app-update-hint', o.hint));
    var actions = el('div', 'modal-actions');
    (o.buttons || []).forEach(function (b) {
      var btn = el('button', b.primary ? 'secondary-btn small-btn' : 'ghost-btn small-btn', b.label);
      btn.type = 'button';
      btn.addEventListener('click', function () { closeModal(); if (b.onClick) b.onClick(); });
      actions.appendChild(btn);
    });
    box.appendChild(actions);
    modal.appendChild(box);
    document.body.appendChild(modal);
  }

  function startDownload(url) {
    var B = Cap.Plugins && Cap.Plugins.Browser;
    try {
      if (B && typeof B.open === 'function') { B.open({ url: url }); return; }
    } catch (e) { log(e); }
    try { window.open(url, '_blank'); } catch (e2) { location.href = url; }
  }

  function fetchInfo() {
    return fetch(apiBase() + '/app-update?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); });
  }

  function check(manual) {
    if (checking) return;
    checking = true;
    fetchInfo().then(function (info) {
      var announced = !!(info && info.enabled && info.version && info.apk_url);
      var available = announced && isNewer(info.version, CURRENT);
      if (!available) {
        if (manual) openModal({
          title: announced ? 'برنامه به‌روز است ✅' : 'نسخهٔ جدیدی اعلام نشده',
          versionLine: 'نسخهٔ شما: ' + CURRENT + (announced ? '   |   آخرین نسخهٔ سایت: ' + info.version : ''),
          message: announced
            ? 'شما از آخرین نسخه استفاده می‌کنید.'
            : 'فعلاً نسخهٔ جدیدی برای اپ اعلام نشده است.',
          buttons: [{ label: 'باشه', primary: true }]
        });
        return;
      }
      if (!manual) {
        var last = 0, lastV = '';
        try { last = Number(localStorage.getItem(LATER_KEY + '_ts') || 0); lastV = localStorage.getItem(LATER_KEY + '_v') || ''; } catch (e) {}
        if (lastV === String(info.version) && Date.now() - last < LATER_MS) return;
      }
      openModal({
        title: 'نسخهٔ جدید آماده است 🎉',
        versionLine: CURRENT + '  ←  ' + info.version,
        notes: info.notes || '',
        hint: 'با زدن «بروزرسانی»، فایل نسخهٔ جدید دانلود می‌شود. بعد از پایان دانلود روی آن بزنید و «نصب» را انتخاب کنید. نیازی به حذف نسخهٔ قبلی نیست و اطلاعات شما حفظ می‌شود.',
        buttons: [
          { label: 'بروزرسانی', primary: true, onClick: function () { startDownload(info.apk_url); } },
          { label: 'بعداً', onClick: function () {
              try { localStorage.setItem(LATER_KEY + '_v', String(info.version)); localStorage.setItem(LATER_KEY + '_ts', String(Date.now())); } catch (e) {}
            } }
        ]
      });
    }).catch(function (e) {
      log(e);
      if (manual) openModal({
        title: 'بررسی انجام نشد',
        message: 'اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.',
        hint: 'جزئیات فنی: ' + String((e && e.message) || e),
        buttons: [{ label: 'باشه', primary: true }]
      });
    }).then(function () { checking = false; });
  }

  function wire() {
    var tile = document.getElementById('app-update-tile');
    if (tile) {
      tile.classList.remove('hidden');
      tile.addEventListener('click', function () { check(true); });
    }
    // بررسی خودکار چند ثانیه بعد از باز شدن اپ (اگر آنلاین باشد)
    setTimeout(function () { if (navigator.onLine !== false) check(false); }, 5000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
