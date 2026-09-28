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
