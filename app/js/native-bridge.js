/* پل بین اپ و اندروید (فقط داخل اپ اندرویدی Capacitor فعال می‌شود؛ در مرورگر/PWA هیچ کاری نمی‌کند).
   وظیفه: اذان‌ها و یادآوریِ یادداشت‌ها را به سیستم آلارم خود اندروید بسپارد تا حتی با اپِ بسته
   و صفحهٔ خاموش، دقیقاً سر وقت اعلان (با صدا) بیاید. */
(function () {
  var Cap = window.Capacitor;
  if (!Cap || typeof Cap.isNativePlatform !== 'function' || !Cap.isNativePlatform()) return;
  var LN = Cap.Plugins && Cap.Plugins.LocalNotifications;
  if (!LN) return;
  // iOS: بدون پلاگین بومیِ اذان (AzanReceiver/AzanService مخصوص اندروید است). اذان، درس بعد از نماز و یادآور یادداشت‌ها با اعلان‌های محلی
  // خود iOS زمان‌بندی می‌شود. محدودیت‌های iOS: حداکثر ۶۴ اعلان هم‌زمان، و صدای اعلان حداکثر ۳۰ ثانیه (فایل azan_<id>.caf که هنگام ساخت
  // اپ iOS در گیت‌هاب از صدای اذان سایت ساخته می‌شود). هر بار که اپ باز می‌شود، برنامهٔ ۶-۷ روز آینده دوباره چیده می‌شود.
  var IS_IOS = false;
  try { IS_IOS = (typeof Cap.getPlatform === 'function' && Cap.getPlatform() === 'ios'); } catch (e) { IS_IOS = false; }
  var IOS_MAX_NOTIFS = 54;   // اذان + درس؛ ۱۰ جای دیگر برای یادآور یادداشت‌ها می‌ماند (سقف iOS: ۶۴)
  var IOS_MAX_NOTES = 8;
  var LESSONS = [
    "Qخداوند با صابران است؛ پس در سختی‌ها صبر را رها نکن.",
    "Hکارها به نیت‌هاست و برای هر کس همان است که نیت کرده است.",
    "Qهر که از خدا بترسد، خدا برایش راه خروجی می‌گشاید و از جایی که گمان ندارد روزی‌اش می‌دهد.",
    "Hمسلمان کسی است که مسلمانان از زبان و دستش در امان باشند.",
    "Qبی‌گمان همراه هر سختی، آسانی‌ای هست.",
    "Hهیچ‌یک از شما مؤمن نیست تا آنچه را برای خود دوست دارد برای برادرش هم دوست بدارد.",
    "Qمرا یاد کنید تا شما را یاد کنم و شکرگزارم باشید و ناسپاسی نکنید.",
    "Hهر که به خدا و روز آخرت ایمان دارد، سخن خوب بگوید یا سکوت کند.",
    "Qآگاه باشید، تنها با یاد خدا دل‌ها آرام می‌گیرد.",
    "Hهر که به خدا و روز آخرت ایمان دارد، مهمانش را گرامی بدارد.",
    "Qخدا می‌فرماید: من نزدیکم و دعای دعاکننده را وقتی مرا بخواند اجابت می‌کنم.",
    "Hبهترین شما کسی است که قرآن را بیاموزد و به دیگران بیاموزاند.",
    "Qاگر شکرگزار باشید، نعمت را برایتان بیشتر می‌کنم.",
    "Hلبخند زدن تو به روی برادرت صدقه است.",
    "Qخدا هیچ‌کس را جز به اندازهٔ توانش تکلیف نمی‌کند.",
    "Hپاکیزگی نیمی از ایمان است.",
    "Qبه پدر و مادر نیکی کن؛ و حتی «اف» هم به آن‌ها نگو و با آن‌ها نیکو سخن بگو.",
    "Hبهترین شما، خوش‌اخلاق‌ترین شماست.",
    "Qبا مردم نیکو سخن بگویید.",
    "Hسنگین‌ترین چیز در ترازوی اعمال، خوش‌اخلاقی است.",
    "Qبدی را با نیکی دفع کن؛ آن‌گاه کسی که با تو دشمنی داشت، چون دوستی گرم خواهد شد.",
    "Hخدا مهربان است و مهربانی را در همهٔ کارها دوست دارد.",
    "Qخدا به عدالت و نیکی و بخشش به خویشاوندان فرمان می‌دهد.",
    "Hبه مهربانان، خدای مهربان رحم می‌کند؛ به اهل زمین مهربانی کنید تا آسمانیان بر شما مهربان باشند.",
    "Qدر نیکی و پرهیزگاری یکدیگر را یاری کنید، نه در گناه و دشمنی.",
    "Hهر که به مردم رحم نکند، خدا به او رحم نمی‌کند.",
    "Qمؤمنان با هم برادرند؛ پس میان برادرانتان آشتی برقرار کنید.",
    "Hمؤمن برای مؤمن مانند ساختمانی است که اجزایش یکدیگر را محکم نگه می‌دارند.",
    "Qاز بسیاری گمان‌های بد دوری کنید و از عیب‌جویی و غیبت یکدیگر بپرهیزید.",
    "Hدین، خیرخواهی است.",
    "Qدر راه خدا انفاق کنید و نیکی کنید؛ خدا نیکوکاران را دوست دارد.",
    "Hدعا همان عبادت است.",
    "Qبه نیکی واقعی نمی‌رسید مگر آنکه از آنچه دوست دارید ببخشید.",
    "Hخشنودی پروردگار در خشنودی پدر و مادر است.",
    "Qبگو: نماز و عبادت و زندگی و مرگ من، همه برای خدا، پروردگار جهانیان است.",
    "Hنمازهای پنجگانه مانند نهری جاری در برابر خانهٔ توست که هر روز پنج بار در آن شست‌وشو می‌کنی؛ دیگر چه آلودگی‌ای می‌ماند؟",
    "Qنماز را برپا دار؛ همانا نماز از کار زشت و ناپسند باز می‌دارد.",
    "Hنخستین چیزی که در قیامت از بنده حساب می‌شود، نماز است.",
    "Qاز صبر و نماز کمک بگیرید.",
    "Hدو کلمه بر زبان سبک و در ترازو سنگین و نزد خدا محبوب‌اند: «سبحان‌الله و بحمده، سبحان‌الله العظیم».",
    "Qخدا توبه‌کنندگان و پاکیزگان را دوست دارد.",
    "Hهر که راهی برای دانش‌آموزی بپیماید، خدا راه بهشت را برایش آسان می‌کند.",
    "Qای بندگان من که بر خود زیاده‌روی کرده‌اید، از رحمت خدا ناامید نشوید؛ او همهٔ گناهان را می‌بخشد.",
    "Hهر که به کار نیکی راهنمایی کند، همانند انجام‌دهندهٔ آن پاداش دارد.",
    "Qهر که ذره‌ای نیکی کند آن را می‌بیند و هر که ذره‌ای بدی کند آن را می‌بیند.",
    "Hصدقه از مال کم نمی‌کند.",
    "Qپیمانه و ترازو را با عدالت تمام بدهید.",
    "Hدست بخشنده از دست گیرنده بهتر است.",
    "Qبه پیمان خود وفا کنید؛ زیرا از پیمان پرسیده می‌شود.",
    "Hقوی کسی نیست که در کشتی پیروز شود؛ قوی کسی است که هنگام خشم خود را نگه دارد.",
    "Qهیچ‌کس بار گناه دیگری را بر دوش نمی‌کشد.",
    "Hمردی از پیامبر نصیحت خواست؛ فرمود: «خشمگین مشو».",
    "Qهر که بر خدا توکل کند، خدا او را کافی است.",
    "Hنشانهٔ منافق سه چیز است: سخن می‌گوید دروغ می‌گوید، وعده می‌دهد خلاف می‌کند، امانت به او سپرده شود خیانت می‌کند.",
    "Qخدا را بسیار یاد کنید تا رستگار شوید.",
    "Hراستگویی به نیکی راه می‌برد و نیکی به بهشت می‌رساند.",
    "Qاز آنچه در زمین حلال و پاکیزه است بخورید.",
    "Hدر دنیا چنان باش که گویی غریبی یا رهگذری.",
    "Qبگو: آیا آنان که می‌دانند با آنان که نمی‌دانند برابرند؟",
    "Hدو نعمت است که بسیاری از مردم در آن زیان می‌بینند: تندرستی و فراغت.",
    "Qبگو: پروردگارا، دانشم را بیفزا.",
    "Hثروت واقعی به داشتن مال فراوان نیست؛ ثروت واقعی بی‌نیازی دل است.",
    "Qبا راستگویان باشید.",
    "Hآنچه تو را به تردید می‌اندازد رها کن و به سراغ آنچه در آن تردید نیست برو.",
    "Qآنان که خشم خود را فرو می‌خورند و از مردم درمی‌گذرند، نیکوکارانند و خدا نیکوکاران را دوست دارد.",
    "Hاز خوبیِ اسلام آدمی این است که کاری را که به او مربوط نیست رها کند.",
    "Qدر زمین با تکبر راه مرو؛ خدا هیچ متکبر خودستایی را دوست ندارد.",
    "Hمحبوب‌ترین عمل نزد خدا، نماز در وقتش است.",
    "Qهر که کار شایسته کند، مرد باشد یا زن، در حالی که مؤمن است، به او زندگی پاکیزه می‌دهیم.",
    "Hهر که در برآوردن نیاز برادرش بکوشد، خدا نیاز او را برآورده می‌کند.",
    "Qپروردگارا، در دنیا به ما نیکی ده و در آخرت نیکی ده و ما را از عذاب آتش نگه دار.",
    "Hهر که عیب مسلمانی را بپوشاند، خدا در دنیا و آخرت عیب او را می‌پوشاند.",
    "Hهیچ کار نیکی را کوچک مشمار، حتی اینکه برادرت را با چهرهٔ گشاده ببینی.",
    "Hایمان شاخه‌های بسیار دارد؛ برترینش گفتن «لا اله الا الله» و کمترینش برداشتن آزار از سر راه است و حیا نیز شاخه‌ای از ایمان است.",
    "Hسخن پاک و نیکو صدقه است."
  ];
  function lessonPrayerIndex(k) { return ({ fajr: 0, dhuhr: 1, asr: 2, maghrib: 3, isha: 4 })[k]; }
  function lessonFor(t, key) {
    var pidx = lessonPrayerIndex(key);
    if (pidx === undefined || !LESSONS.length) return null;
    var day = Math.floor((t - new Date(t).getTimezoneOffset() * 60000) / 86400000);
    var raw = LESSONS[(day * 5 + pidx) % LESSONS.length];
    return { title: raw.charAt(0) === 'Q' ? 'درسی از قرآن' : 'درسی از حدیث', body: raw.slice(1) };
  }

  // صدای کانال اندروید بعد از ساخت قابل تغییر نیست؛ برای همین به ازای هر صدای اذانِ داخل اپ یک کانال جدا داریم
  // (azan-<id>) و هنگام زمان‌بندی، کانالِ «صدای فعال» انتخاب می‌شود. کانال azan-v3 فقط برای وقتی است که
  // هیچ صدایی داخل اپ نباشد (صدای پیش‌فرض گوشی).
  var CH_AZAN = 'azan-v3';
  var CH_AZAN_OLD = ['azan-v1', 'azan-v2'];
  var VOICES = (window.NATIVE_AZAN_VOICES && window.NATIVE_AZAN_VOICES.length) ? window.NATIVE_AZAN_VOICES : [];
  var DEFAULT_VOICE = window.NATIVE_AZAN_DEFAULT || '';
  function hasVoice(id) { for (var i = 0; i < VOICES.length; i++) { if (VOICES[i].id === id) return true; } return false; }
  function voiceChannel(id) { return 'azan-' + id; }
  function voiceFile(id) { return 'azan_' + id + (IS_IOS ? '.caf' : '.mp3'); }
  // صدایی که واقعاً باید استفاده شود: صدای فعالِ سایت اگر داخل این نسخهٔ اپ هست؛ وگرنه صدای پیش‌فرضِ زمان ساخت
  function pickVoice(wanted) {
    if (wanted && hasVoice(wanted)) return wanted;
    if (DEFAULT_VOICE && hasVoice(DEFAULT_VOICE)) return DEFAULT_VOICE;
    return '';
  }
  var CH_NOTES = 'notes-v1';
  var CH_STICKY = 'sticky-v1';   // نوتیفیکیشن ثابت (تاریخ + متن مدیر): بی‌صدا، ولی روی صفحهٔ قفل دیده می‌شود
  var STICKY_ID = 777000001;
  var queuedSticky = null;       // null = هنوز چیزی نیامده؛ {p: payload|null} = آخرین درخواست
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

  function applyScheduleLegacy(prayers, enabled, brand, voiceId) {
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

  // iOS: اذان (+ ۱۰ دقیقه بعد، درس کوتاه) با اعلان محلی؛ به‌ترتیب زمان، حداکثر IOS_MAX_NOTIFS تای اول
  function applyScheduleIOS(prayers, enabled, brand, voiceId) {
    return cancelByKind('azan').then(function () { return cancelByKind('lesson'); }).then(function () {
      if (!enabled) return;
      var now = Date.now();
      var voice = pickVoice(voiceId);
      var items = [];
      (prayers || []).forEach(function (p) {
        var t = new Date(p.timeIso).getTime();
        if (!(t > now + 2000)) return;
        var n = { id: azanId(p.key + '|' + p.timeIso), title: 'وقت اذان ' + p.label, body: brand || 'عارفان جام',
                  schedule: { at: new Date(t) }, extra: { kind: 'azan', label: p.label }, _t: t };
        if (voice) n.sound = voiceFile(voice);
        items.push(n);
        var ls = lessonFor(t, p.key);
        if (ls) {
          var lt = t + 10 * 60 * 1000;
          items.push({ id: azanId('lesson|' + p.key + '|' + p.timeIso), title: ls.title, body: ls.body,
                       schedule: { at: new Date(lt) }, extra: { kind: 'lesson' }, _t: lt });
        }
      });
      items.sort(function (a, b) { return a._t - b._t; });
      items = items.slice(0, IOS_MAX_NOTIFS).map(function (n) { delete n._t; return n; });
      if (items.length) return LN.schedule({ notifications: items });
    }).catch(log);
  }

  /* Native azan (AzanReceiver/AzanService in the APK): plays the azan with the phone locked, the app closed
     and NO internet. If the APK is old (no such method) or it fails, the old notification way is used. */
  var nativeAzan = false;
  function applySchedule(prayers, enabled, brand, voiceId, url) {
    if (IS_IOS) return applyScheduleIOS(prayers, enabled, brand, voiceId);
    var AUp = Cap.Plugins && Cap.Plugins.AppUpdater;
    if (AUp && typeof AUp.scheduleAzan === 'function') {
      var items = [];
      var now = Date.now();
      (prayers || []).forEach(function (p) {
        var t = new Date(p.timeIso).getTime();
        if (t > now + 2000) items.push({ t: t, l: p.label, k: p.key });
      });
      return AUp.scheduleAzan({ items: items, enabled: !!enabled, url: url || '', voice: pickVoice(voiceId), brand: brand || '' })
        .then(function () {
          nativeAzan = true;
          return cancelByKind('azan'); // remove old-style azan notifications so the azan is not played twice
        })
        .catch(function (e) {
          log(e);
          nativeAzan = false;
          return ready ? applyScheduleLegacy(prayers, enabled, brand, voiceId) : null;
        });
    }
    return applyScheduleLegacy(prayers, enabled, brand, voiceId);
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
      if (IS_IOS) items = items.slice(0, IOS_MAX_NOTES);
      if (items.length) return LN.schedule({ notifications: items });
    }).catch(log);
  }

  // نوتیفیکیشن ثابت: نام اپ + تاریخ امروز (عنوان) و متن دلخواه مدیر (متن). همیشه با همان شناسه جایگزین می‌شود.
  function applyStickyPlain(p) {
    var n = {
      id: STICKY_ID,
      title: p.title || 'عارفان جام',
      body: p.text || '',
      channelId: CH_STICKY,
      smallIcon: SMALL_ICON,
      ongoing: true,
      autoCancel: false,
      extra: { kind: 'sticky' }
    };
    if (p.lines && p.lines.length > 1) n.largeBody = p.lines.join('\n');
    return LN.schedule({ notifications: [n] }).catch(log);
  }
  // نسخهٔ گرافیکی (کارت سه‌بعدی) با پلاگین بومی؛ اگر APK قدیمی بود یا خطا داد، همان نوتیفیکیشن ساده نشان داده می‌شود.
  function applySticky(p) {
    var AUp = Cap.Plugins && Cap.Plugins.AppUpdater;
    if (!p) {
      if (AUp && typeof AUp.hideSticky === 'function') { try { AUp.hideSticky().catch(log); } catch (e) { log(e); } }
      return LN.cancel({ notifications: [{ id: STICKY_ID }] }).catch(log);
    }
    if (AUp && p.card && typeof AUp.showSticky === 'function') {
      return AUp.showSticky(p.card).catch(function (e) { log(e); return applyStickyPlain(p); });
    }
    return applyStickyPlain(p);
  }

  function enqueue(fn) { busy = busy.then(fn).catch(log); return busy; }

  window.NativeAlarms = {
    syncSchedule: function (prayers, enabled, brand, voiceId, url) {
      queuedSchedule = [prayers, enabled, brand, voiceId, url];
      var AUp = Cap.Plugins && Cap.Plugins.AppUpdater;
      var hasNative = !!(AUp && typeof AUp.scheduleAzan === 'function');
      // native azan does not need notification permission / channels to be ready
      if (ready || hasNative) enqueue(function () { return applySchedule(prayers, enabled, brand, voiceId, url); });
    },
    isNativeAzan: function () { return nativeAzan; },
    requestBattery: function (force) { return askBattery(!!force); },
    syncNotes: function (list) {
      queuedNotes = [list];
      if (ready) enqueue(function () { return applyNotes(list); });
    },
    syncSticky: function (payload) {
      if (IS_IOS) return;   // اعلان ثابت (ongoing) در iOS وجود ندارد
      queuedSticky = { p: payload };
      if (ready) enqueue(function () { return applySticky(payload); });
    }
  };

  /* بهینه‌سازی باتری: اگر گوشی اپ را «محدود» کند، آلارم اذان ممکن است نیاید.
     بار اول که اپ نصب و باز می‌شود پنجرهٔ مجوز اندروید نشان داده می‌شود (کاربر «اجازه» را می‌زند).
     اگر قبول نکرد، حداکثر روزی یک بار و تا ۵ بار دوباره پرسیده می‌شود. اگر کاربر خودش سوییچ
     «فعال‌سازی پخش اذان» را خاموش کرده باشد، اصلاً پرسیده نمی‌شود.
     نیاز به مجوز REQUEST_IGNORE_BATTERY_OPTIMIZATIONS در Manifest (در build-apk.yml اضافه شده) و APK جدید دارد؛
     در APK قدیمی این متدها نیستند و هیچ اتفاقی نمی‌افتد. */
  var BAT_ASK_KEY = 'arefanejam_battery_asked'; // {n: تعداد دفعات پرسیده‌شده, ts: آخرین زمان}
  function bgSwitchOn() {
    try { var v = localStorage.getItem('arefanejam_bg_mode'); return v === null || v === '1'; } catch (e) { return true; }
  }
  function askBattery(force) {
    var AUp = Cap.Plugins && Cap.Plugins.AppUpdater;
    if (!AUp || typeof AUp.batteryStatus !== 'function' || typeof AUp.requestBatteryExemption !== 'function') return Promise.resolve();
    if (!bgSwitchOn()) return Promise.resolve();
    return AUp.batteryStatus().then(function (r) {
      if (!r || r.ignoring) return;
      var st = {};
      try { st = JSON.parse(localStorage.getItem(BAT_ASK_KEY) || '{}'); } catch (e) {}
      var n = Number(st.n) || 0, ts = Number(st.ts) || 0;
      if (!force && n > 0 && (n >= 3 || Date.now() - ts < 3 * 24 * 3600 * 1000)) return;
      try { localStorage.setItem(BAT_ASK_KEY, JSON.stringify({ n: n + 1, ts: Date.now() })); } catch (e) {}
      var shown;
      if (typeof window.appAlert === 'function') shown = window.appAlert('battery_ask');
      else { try { window.alert('برای اینکه اذان همیشه سر وقت و حتی با گوشی قفل پخش شود، در پنجرهٔ بعدی لطفاً «اجازه» (Allow) را بزنید.'); } catch (e) {} }
      return Promise.resolve(shown).then(function () { return AUp.requestBatteryExemption(); });
    }).catch(log);
  }

  function askExactAlarmIfNeeded() {
    if (typeof LN.checkExactNotificationSetting !== 'function') return Promise.resolve();
    return LN.checkExactNotificationSetting().then(function (r) {
      if (!r || r.exact_alarm === 'granted') return;
      var last = Number(localStorage.getItem('arefanejam_exact_asked') || 0);
      if (Date.now() - last < 24 * 3600 * 1000) return;
      localStorage.setItem('arefanejam_exact_asked', String(Date.now()));
      var ask = (typeof window.appConfirm === 'function')
        ? window.appConfirm('exact_alarm_ask')
        : Promise.resolve(window.confirm('برای اینکه اذان و یادآورها دقیقاً سر وقت بیایند، اجازهٔ «آلارم‌ها و یادآورها» باید فعال باشد. تنظیمات باز شود؟'));
      return Promise.resolve(ask).then(function (ok) {
        if (ok) return LN.changeExactNotificationSetting();
      });
    }).catch(log);
  }

  /* مجوزهای مرحله‌ای (برای اینکه کاربر تازه‌وارد زیر فشار نباشد):
     ۱) اولین باز شدن: فقط «موقعیت مکانی» (پنجرهٔ خوش‌آمدگویی داخل app.js) — اذان پیش‌فرض روشن است و برای پخش اذان بومی مجوز دیگری لازم نیست.
     ۲) باز شدن دوم (پس از تعیین موقعیت): مجوز اعلان‌ها.  ۳) حداقل یک روز بعد: مجوز اجرا در پس‌زمینه (باتری).
     ۴) حداقل دو روز بعد: «آلارم‌ها و یادآورها».  هر بار حداکثر یکی و با فاصلهٔ ≥ ۲۰ ساعت.
     ۵) «نصب از منبع ناشناس» هر ۳ روز یک‌بار یادآوری می‌شود (permReminder پایین‌تر؛ اولین بار ۳ روز بعد از نصب).
     وضعیت در localStorage ← arefanejam_perm_stage = {first, sessions, notif, bat, exact, last}. */
  var STAGE_KEY = 'arefanejam_perm_stage';
  var DAY_MS = 24 * 3600 * 1000;
  function stGet() { try { return JSON.parse(localStorage.getItem(STAGE_KEY) || 'null') || null; } catch (e) { return null; } }
  function stSet(o) { try { localStorage.setItem(STAGE_KEY, JSON.stringify(o)); } catch (e) {} }
  function locationDone() {
    try {
      return !!(localStorage.getItem('arefanejam_location_prompted') || localStorage.getItem('arefanejam_last_coords') || localStorage.getItem('arefanejam_manual_city'));
    } catch (e) { return true; }
  }
  (function countSession() {
    var s = stGet(), now = Date.now();
    if (!s) {
      var old = false;
      try { old = !!localStorage.getItem('arefanejam_device_id'); } catch (e) {}   // نصب قدیمی‌تر: دیگر معطل نمی‌ماند
      s = old ? { first: now - 10 * DAY_MS, sessions: 5, notif: 0, bat: 0, exact: 0, last: 0 } : { first: now, sessions: 0, notif: 0, bat: 0, exact: 0, last: 0 };
    }
    s.sessions = (Number(s.sessions) || 0) + 1;
    stSet(s);
  })();
  var permStepBusy = false;
  function permStep() {
    try {
      if (permStepBusy) return Promise.resolve();
      var s = stGet(); if (!s) return Promise.resolve();
      var now = Date.now();
      if (!locationDone()) return Promise.resolve();                       // اول فقط مکان
      if (s.last && now - s.last < 20 * 3600 * 1000) return Promise.resolve();
      var step = null;
      if (!s.notif) { if (s.sessions >= (IS_IOS ? 1 : 2)) { s.notif = 1; step = function () { return LN.requestPermissions(); }; } }
      else if (IS_IOS) { step = null; }                                    // iOS: باتری/آلارم دقیق ندارد
      else if (!s.bat) { if (now - s.first >= DAY_MS) { s.bat = 1; step = function () { return askBattery(false); }; } }
      else if (!s.exact) { if (now - s.first >= 2 * DAY_MS) { s.exact = 1; step = askExactAlarmIfNeeded; } }
      else { step = function () { return askBattery(false); }; }          // اگر باتری را نپذیرفته: هر ۳ روز، حداکثر ۳ بار
      if (!step) return Promise.resolve();
      s.last = now; stSet(s);
      permStepBusy = true;
      return Promise.resolve().then(step).catch(log).then(function () { permStepBusy = false; });
    } catch (e) { permStepBusy = false; log(e); return Promise.resolve(); }
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') setTimeout(permStep, 2500); });

  function init() {
    return Promise.resolve().then(function () {
      if (IS_IOS) return;   // iOS کانال ندارد
      var ch = [
        { id: CH_AZAN, name: 'اذان (صدای پیش‌فرض گوشی)', description: 'اعلان اذان', importance: 5, visibility: 1, vibration: true },
        { id: CH_NOTES, name: 'یادآوری یادداشت‌ها', description: 'یادآورهای یادداشت شخصی', importance: 4, visibility: 1, vibration: true },
        { id: CH_STICKY, name: 'تاریخ و پیام روز', description: 'نوتیفیکیشن ثابت تاریخ و پیام روز (بی‌صدا)', importance: 2, visibility: 1, vibration: false }
      ];
      VOICES.forEach(function (v) {
        ch.push({ id: voiceChannel(v.id), name: 'اذان — ' + (v.name || v.id), description: 'اعلان و صدای اذان', importance: 5, visibility: 1, vibration: true, sound: voiceFile(v.id) });
      });
      try {
        if (typeof LN.deleteChannel === 'function') CH_AZAN_OLD.forEach(function (id) { LN.deleteChannel({ id: id }); });
      } catch (e) {}
      return Promise.all(ch.map(function (c) { return LN.createChannel(c); }));
    }).then(function () {
      ready = true;
      if (queuedSchedule) enqueue(function () { return applySchedule(queuedSchedule[0], queuedSchedule[1], queuedSchedule[2], queuedSchedule[3], queuedSchedule[4]); });
      if (queuedNotes) enqueue(function () { return applyNotes(queuedNotes[0]); });
      if (queuedSticky) enqueue(function () { return applySticky(queuedSticky.p); });
      // چند ثانیه بعد، اگر نوبت یکی از مجوزهای مرحله‌ای رسیده باشد (نه در اولین باز شدن)
      setTimeout(permStep, 8000);
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
  // iOS: بروزرسانی APK/خودکار و یادآوری «منبع ناشناس» مخصوص اندروید است؛ نسخهٔ iOS از طریق TestFlight/App Store بروز می‌شود.
  try { if (typeof Cap.getPlatform === 'function' && Cap.getPlatform() === 'ios') return; } catch (e) {}

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
  var AUTO_KEY = 'arefanejam_auto_mode';         // '1' = این نصب خودکار بوده (بعدش هیچ پیامی نشان داده نشود)
  var PROMPT_KEY = 'arefanejam_auto_prompt';     // {v, ts} آخرین باری که پنجرهٔ تأیید اندروید نشان داده شد
  var PROMPT_MS = 24 * 3600 * 1000;              // پنجرهٔ تأیید برای هر نسخه حداکثر یک بار در روز
  var RETRY_MS = 3 * 3600 * 1000;                // بعد از شکست، ۳ ساعت بعد دوباره
  var RECHECK_MS = 10 * 60 * 1000;               // بررسی دوره‌ای وقتی اپ باز مانده (قبلاً ۶ ساعت؛ برای رسیدن سریع‌تر بروزرسانی ۱۰ دقیقه)
  var RESUME_MS = 2 * 60 * 1000;                 // بعد از برگشتن به اپ، اگر آخرین بررسی قدیمی‌تر از این بود دوباره می‌پرسد (قبلاً ۱ ساعت)
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
    lsSet(AUTO_KEY, '1');
    if (st && st.silentLikely && !forceForeground) {
      pendingSilent = info; // بدون هیچ پیامی؛ هنگام خروج کاربر از اپ نصب می‌شود
      autoBusy = false;
      return;
    }
    // نصب بی‌صدا ممکن نیست (یا قبلاً جواب نداده): پنجرهٔ تأیید اندروید برای هر نسخه حداکثر روزی یک بار
    var pv = '', pt = 0;
    try { var po = JSON.parse(lsGet(PROMPT_KEY) || '{}'); pv = String(po.v || ''); pt = Number(po.ts || 0); } catch (e) {}
    autoBusy = false;
    if (pv === String(info.version) && Date.now() - pt < PROMPT_MS) return;
    lsSet(PROMPT_KEY, JSON.stringify({ v: String(info.version), ts: Date.now() }));
    busyUpdating = true;
    doInstall(info, true);
  }

  function autoUpdate(info) {
    var P = AU();
    if (!P || typeof P.status !== 'function') { offer(info); return; }
    if (busyUpdating || autoBusy) return;

    var f = readFail(info.version);
    if (f.n >= 2) { // دو بار دانلود نشد (احتمالاً اینترنت ضعیف): بدون هیچ پیامی، فردا دوباره تلاش می‌کنیم
      if (Date.now() - f.ts < PROMPT_MS) return;
      lsDel(FAIL_KEY);
    }
    if (f.n > 0 && Date.now() - f.ts < RETRY_MS) return;

    autoBusy = true;
    var forceForeground = lsGet(ATTEMPT_KEY) === String(info.version); // نصب بی‌صدا قبلاً جواب نداده
    var stInfo = null;

    P.status().then(function (st) {
      stInfo = st || {};
      var ready = stInfo.hasApk && (lsGet(READY_KEY) === String(info.version) || String(stInfo.bgReady || '') === String(info.version));
      if (ready) return;
      if (navigator.onLine === false || stInfo.online === false) { throw new Error('offline'); }
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
      if (String((e && (e.message || e)) || '').indexOf('offline') !== -1) return; // بدون اینترنت: شکست حساب نمی‌شود، با برگشتن اینترنت دوباره امتحان می‌شود
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
    lsDel(AUTO_KEY); // بروزرسانی دستی: بعد از نصب پیام موفقیت نشان داده شود
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
      if (String((e && (e.message || e)) || '').indexOf('offline') !== -1) { showError(info, 'اینترنت وصل نیست. بعد از اتصال دوباره تلاش کنید.'); return; }
      showError(info, 'دانلود انجام نشد. اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.');
    });
  }

  function doInstall(info, auto) {
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
            { label: 'ادامهٔ نصب', primary: true, keepOpen: true, onClick: function () { doInstall(info, auto); } },
            { label: 'بستن', onClick: function () { busyUpdating = false; waitingPermission = false; } }
          ]
        });
        window.__updInfo = info;
        window.__updAuto = !!auto;
        return;
      }
      waitingPermission = false;
      busyUpdating = false;
      if (auto) return; // خودکار: فقط پنجرهٔ خود اندروید (اگر لازم بود) نشان داده می‌شود، پیام اضافهٔ ما نه
      render({
        mode: 'success', icon: 'check',
        title: 'آمادهٔ نصب است',
        from: CURRENT, to: info.version,
        message: 'در صفحهٔ نصب اندروید روی «نصب» بزنید. بعد از پایان، «باز کردن» را انتخاب کنید تا نسخهٔ جدید اجرا شود.\n\nاگر اندروید نوشت «برنامه نصب نشد چون بسته با بسته موجود تداخل دارد»، یعنی امضای اپ نصب‌شده با نسخهٔ جدید فرق دارد؛ راه‌حلش در همین پنجره بعد از برگشت به اپ نوشته می‌شود.',
        buttons: [
          { label: 'نصب دوباره', keepOpen: true, onClick: function () { doInstall(info); } },
          { label: 'بستن', primary: true }
        ]
      });
      conflictInfo = info;
      conflictAt = Date.now();
    }).catch(function (e) {
      log(e);
      showError(info, 'باز کردن نصب‌کننده انجام نشد. دوباره تلاش کنید.');
    });
  }

  // بعد از برگشتن از صفحهٔ تنظیمات، اگر منتظر اجازه بودیم، نصب را خودکار ادامه می‌دهیم
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && waitingPermission && window.__updInfo) doInstall(window.__updInfo, window.__updAuto);
  });

  // بعد از نصب دستی: اگر اپ دوباره روی همان نسخهٔ قدیمی باز شد، احتمالاً اندروید به‌خاطر «تداخل امضا» نصب را رد کرده
  var conflictInfo = null, conflictAt = 0;
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible' || !conflictInfo || waitingPermission || busyUpdating) return;
    if (Date.now() - conflictAt < 4000) return;
    var info = conflictInfo; conflictInfo = null;
    if (!isNewer(info.version, CURRENT)) return;
    render({
      mode: 'info', icon: 'warn',
      title: 'نصب نسخهٔ جدید انجام نشد؟',
      from: CURRENT, to: info.version,
      message: 'اگر اندروید نوشت «بسته با بستهٔ موجود تداخل دارد»، علتش تعویض کلید امضای امنیتی اپ است و فقط «یک بار» لازم است اپ را پاک و دوباره نصب کنید:\n' +
               '۱) روی آیکون «عارفان جام» نگه دارید ← «حذف / Uninstall».\n' +
               '۲) APK جدید را با دکمهٔ «دانلود APK جدید» بگیرید و نصب کنید.\n' +
               'بعد از آن، بروزرسانی‌ها مثل قبل خودکار و بدون مشکل می‌آیند.\n' +
               'توجه: با حذف اپ، اطلاعات ذخیره‌شدهٔ روی گوشی (مثل یادداشت‌ها، سابقهٔ اعمال و تنظیمات شخصی) پاک می‌شود.',
      buttons: [
        { label: 'دانلود APK جدید', primary: true, onClick: function () { try { browserFallback(info.apk_url); } catch (e) {} } },
        { label: 'بستن' }
      ]
    });
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
    lsDel(READY_KEY); lsDel(ATTEMPT_KEY); lsDel(FAIL_KEY); lsDel(PROMPT_KEY);
    try { var P = AU(); if (P) P.cleanup(); } catch (e2) {}
    if (lsGet(AUTO_KEY) === '1') { lsDel(AUTO_KEY); return false; } // بروزرسانی خودکار: هیچ پیامی نشان داده نمی‌شود
    render({
      mode: 'success', icon: 'check',
      title: 'بروزرسانی انجام شد',
      to: CURRENT,
      message: 'اپ با موفقیت به نسخهٔ جدید بروزرسانی شد. ممنون که همراه ما هستید.',
      buttons: [{ label: 'باشه', primary: true }]
    });
    return true;
  }

  /* ===== یادآوری «بروزرسانی خودکار را فعال کنید» (هر ۳ روز یک بار) =====
     فقط وقتی «اجازهٔ نصب از این منبع» داده نشده باشد (همان خط «نصب بی‌صدا: ⚠️ اجازهٔ نصب از این منبع داده نشده» صفحهٔ بیشتر).
     «تأیید» ← صفحهٔ تنظیمات گوشی (نصب برنامه‌های ناشناس برای همین اپ) باز می‌شود؛ «رد» ← ۳ روز بعد دوباره. */
  var PERM_KEY = 'arefanejam_perm_remind_ts';
  var PERM_MS = 3 * 24 * 3600 * 1000;
  var permBusy = false;

  // پنجرهٔ یادآوری (هم برای یادآوری خودکار هر ۳ روز، هم برای ۵ ضربه روی خط وضعیت)
  function showPermDialog() {
    render({
      mode: 'info', icon: 'warn',
      title: 'بروزرسانی خودکار را فعال کنید',
      message: 'بروزرسانی خودکار را فعال کنید تا از تمام قابلیت‌های نرم‌افزار بهره‌مند شوید.\n\n' +
               'با زدن «تأیید»، صفحهٔ تنظیمات گوشی باز می‌شود؛ گزینهٔ «اجازهٔ نصب از این منبع» را روشن کنید و به اپ برگردید.',
      buttons: [
        { label: 'تأیید', primary: true, onClick: function () {
            var Q = AU();
            if (Q && typeof Q.openInstallSettings === 'function') {
              try { Q.openInstallSettings().catch(function (e) { log(e); }); } catch (e) { log(e); }
            } else {
              // APK قدیمی (بدون این بخش): راهنمای دستی
              setTimeout(function () {
                render({
                  mode: 'info', icon: 'warn',
                  title: 'فعال‌سازی دستی',
                  message: 'تنظیمات گوشی ← برنامه‌ها ← «عارفان جام» ← «نصب برنامه‌های ناشناس» (Install unknown apps) را روشن کنید.',
                  buttons: [{ label: 'باشه', primary: true }]
                });
              }, 50);
            }
          } },
        { label: 'رد', onClick: function () { } }
      ]
    });
  }

  function permReminder(force) {
    try {
      if (permBusy || ui || busyUpdating || autoBusy || waitingPermission) return;
      var P = AU();
      if (!P || typeof P.status !== 'function') return;
      if (!force) {
        var last = Number(lsGet(PERM_KEY) || 0);
        if (!last) { lsSet(PERM_KEY, String(Date.now())); return; }   // اولین باز شدن: اصلاً نمی‌پرسد؛ اولین یادآوری ۳ روز بعد
        if (Date.now() - last < PERM_MS) return;
      }
      permBusy = true;
      P.status().then(function (s) {
        permBusy = false;
        if (!s) return;
        if (s.canInstall !== false) {                      // اجازه داده شده (یا اندروید قدیمی)
          if (force) toast('✅ اجازهٔ نصب از این منبع از قبل فعال است.', 3500);
          return;
        }
        if (ui || busyUpdating || autoBusy || waitingPermission) return;
        lsSet(PERM_KEY, String(Date.now()));               // چه تأیید چه رد، ۳ روز بعد دوباره
        showPermDialog();
      }).catch(function () { permBusy = false; });
    } catch (e) { permBusy = false; log(e); }
  }

  // ۵ ضربهٔ پشت‌سرهم (در ۴ ثانیه) روی خط وضعیت «نسخهٔ برنامه … نصب بی‌صدا: ⚠️» صفحهٔ «بیشتر»: همان لحظه همین پنجره می‌آید
  var permTaps = 0, permTapTs = 0;
  document.addEventListener('click', function (ev) {
    try {
      var t = ev.target;
      if (!t || !t.closest || !t.closest('#app-version-line')) return;
      var now = Date.now();
      if (now - permTapTs > 4000) permTaps = 0;
      permTapTs = now;
      permTaps++;
      if (permTaps >= 5) { permTaps = 0; permReminder(true); }
    } catch (e) { log(e); }
  });

  /* ===== دکمهٔ «بروزرسانی» نوار بالا (🔄 بالا سمت چپ) =====
     با هر بار زدن: اول نسخهٔ جدید APK از سایت پرسیده می‌شود؛ اگر بود پنجرهٔ «نسخهٔ جدید آماده است» می‌آید.
     اگر APK جدید نبود، «بروزرسانی ظاهر اپ از سایت» بررسی و همان لحظه اعمال می‌شود. اگر هیچ‌کدام نبود: «برنامه به‌روز است». */
  var manualBusy = false;
  var manualRun = 0;

  function setReloadBtnBusy(on) {
    var b = document.getElementById('topbar-reload-btn');
    if (!b) return;
    b.disabled = !!on;
    b.classList.toggle('spinning', !!on);
  }

  function withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(new Error('timeout')); }, ms);
      promise.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
    });
  }

  // اگر بررسی پس‌زمینهٔ ظاهر اپ همین الان مشغول است، چند ثانیه صبر می‌کنیم تا تمام شود
  function waitWebIdle() {
    return new Promise(function (resolve) {
      var n = 0;
      (function tick() {
        if (!webBusy || n > 75) { resolve(); return; }
        n++; setTimeout(tick, 400);
      })();
    });
  }

  // نتیجه: 'staged' (نسخهٔ جدید ظاهر آماده است) | 'none' (چیزی برای بروزرسانی نیست) | 'error'
  function webManualCheck() {
    var P = AU();
    if (!P || typeof P.webStatus !== 'function' || typeof P.webSync !== 'function') return Promise.resolve('none');
    return waitWebIdle().then(function () {
      webBusy = true;
      webLastCheck = Date.now();
      var st = {};
      return P.webStatus().then(function (s) {
        st = s || {};
        if (st.stagedId) return 'staged';
        return withTimeout(webManifestFetch(), 15000).then(function (m) {
          if (!m || !m.enabled || !m.id || !m.base || !m.files || !m.files.length) return 'none';
          if (m.id === st.activeId) return 'none';
          if (m.id === st.badId && Date.now() - (st.badTs || 0) < WEB_BAD_MS) return 'none';
          return P.webSync({ id: m.id, base: m.base, files: m.files }).then(function () { return 'staged'; });
        });
      }).then(function (r) { webBusy = false; return r; }, function (e) { webBusy = false; log(e); return 'error'; });
    });
  }

  function manualFinish(run) {
    if (run !== manualRun) return;
    manualBusy = false;
    setReloadBtnBusy(false);
  }

  function manualUpdate() {
    if (manualBusy || busyUpdating) return;
    var run = ++manualRun;
    manualBusy = true;
    setReloadBtnBusy(true);

    if (navigator.onLine === false) {
      manualFinish(run);
      render({
        mode: 'error', icon: 'warn',
        title: 'اینترنت وصل نیست',
        message: 'برای بروزرسانی باید گوشی به اینترنت وصل باشد. اتصال را بررسی کنید و دوباره تلاش کنید.',
        buttons: [{ label: 'باشه', primary: true }]
      });
      return;
    }

    render({
      mode: 'progress', icon: 'arrow',
      title: 'در حال بررسی بروزرسانی…',
      message: 'لطفاً چند لحظه صبر کنید.',
      buttons: [{ label: 'لغو', onClick: function () { if (run === manualRun) { manualRun++; manualBusy = false; setReloadBtnBusy(false); } } }]
    });

    var apiOk = true;
    lastCheckTs = Date.now();
    withTimeout(fetchInfo(), 15000).catch(function (e) { log(e); apiOk = false; return null; }).then(function (info) {
      if (run !== manualRun) return;
      var announced = !!(info && info.enabled && info.version && info.apk_url);
      if (announced && isNewer(info.version, CURRENT)) {
        // APK جدید هست: پنجرهٔ «نسخهٔ جدید آماده است» (با دکمهٔ بروزرسانی)
        manualFinish(run);
        offer(info);
        return;
      }
      return webManualCheck().then(function (r) {
        if (run !== manualRun) return;
        if (r === 'staged') {
          var P = AU();
          render({
            mode: 'progress', icon: 'check',
            title: 'در حال بروزرسانی اپ…',
            message: 'نسخهٔ جدید ظاهر اپ دانلود شد؛ در چند لحظه اپ دوباره باز می‌شود.'
          });
          setTimeout(function () {
            if (!P || typeof P.webApply !== 'function') { manualFinish(run); closeModal(); return; }
            P.webApply().then(function () {
              // صفحه با نسخهٔ جدید دوباره بارگذاری می‌شود؛ اگر نشد، خودمان بارگذاری می‌کنیم
              setTimeout(function () { try { location.reload(); } catch (e) {} }, 4000);
            }).catch(function (e) {
              log(e);
              manualFinish(run);
              render({
                mode: 'error', icon: 'warn',
                title: 'بروزرسانی کامل نشد',
                message: 'نسخهٔ جدید اعمال نشد. دوباره تلاش کنید.',
                buttons: [{ label: 'تلاش دوباره', primary: true, onClick: function () { manualUpdate(); } }, { label: 'بستن' }]
              });
            });
          }, 700);
          return;
        }
        manualFinish(run);
        if (r === 'error' && !apiOk) {
          render({
            mode: 'error', icon: 'warn',
            title: 'بررسی انجام نشد',
            message: 'اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.',
            buttons: [{ label: 'تلاش دوباره', primary: true, onClick: function () { manualUpdate(); } }, { label: 'بستن' }]
          });
          return;
        }
        render({
          mode: 'success', icon: 'check',
          title: 'برنامه به‌روز است',
          message: 'شما از آخرین نسخه استفاده می‌کنید.\nنسخهٔ شما: ' + CURRENT + (announced ? '   |   آخرین نسخهٔ سایت: ' + info.version : ''),
          buttons: [{ label: 'باشه', primary: true }]
        });
      });
    }).catch(function (e) {
      log(e);
      if (run !== manualRun) return;
      manualFinish(run);
      render({
        mode: 'error', icon: 'warn',
        title: 'بررسی انجام نشد',
        message: 'اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.',
        buttons: [{ label: 'باشه', primary: true }]
      });
    });
  }

  window.NativeUpdate = { manual: manualUpdate };

  /* ===== پنل مخفی «تست اذان بومی» =====
     با ۵ بار زدن پشت‌سرهم روی خط «نسخهٔ برنامه» (صفحهٔ بیشتر) یک صفحهٔ تمام‌صفحه باز می‌شود؛ کاربر عادی چیزی نمی‌بیند.
     تست از همان مسیر اذان واقعی (آلارم ← سرویس ← صدا) رد می‌شود، فقط زمانش ۱ تا ۱۵ دقیقهٔ دیگر است. */
  function setupAzanTest(vl) {
    var taps = 0, tapTs = 0, overlay = null, out = null;
    vl.addEventListener('click', function () {
      var now = Date.now();
      taps = (now - tapTs < 1500) ? taps + 1 : 1;
      tapTs = now;
      if (taps < 5) return;
      taps = 0;
      if (!overlay) build();
      overlay.style.display = 'block';
      refresh();
    });

    function btn(label, fn, strong) {
      var b = el('button', null, label);
      b.type = 'button';
      b.style.cssText = 'margin:4px;padding:11px 14px;border-radius:12px;border:0;font-size:14px;font-family:inherit;' +
        (strong ? 'background:#C9A24D;color:#143C36;font-weight:700;' : 'background:#1f5a50;color:#fff;');
      b.addEventListener('click', function () { try { fn(); } catch (e) { show('خطا: ' + e); } });
      return b;
    }
    function show(t) { if (out) out.textContent = t; }
    function hhmmss(t) { try { return new Date(t).toLocaleTimeString('fa-IR'); } catch (e) { return String(t); } }
    function errText(e) { try { return (e && e.message) ? e.message : (typeof e === 'string' ? e : JSON.stringify(e)); } catch (x) { return String(e); } }

    // اطلاعات سمت وب؛ همیشه نشان داده می‌شود تا صفحه هرگز خالی نماند
    function head(P) {
      return ['نسخهٔ برنامه: ' + CURRENT,
              'بخش بومی (AppUpdater): ' + (P ? '✅ هست' : '❌ پیدا نشد'),
              'azanDiag: ' + (P ? typeof P.azanDiag : '-') + '  |  testAzan: ' + (P ? typeof P.testAzan : '-')].join('\n');
    }

    function refresh() {
      var P = AU(), h = head(P);
      show(h + '\n\n⏳ در حال دریافت گزارش…');
      if (!P || typeof P.azanDiag !== 'function') { show(h + '\n\n❌ این APK قدیمی است (بخش تست اذان ندارد). APK جدید را نصب کنید.'); return; }
      var done = false;
      var timer = setTimeout(function () {
        if (!done) show(h + '\n\n⚠️ تا ۵ ثانیه پاسخی از بخش بومی نیامد. احتمالاً APK نصب‌شده قدیمی است؛ آخرین APK را نصب کنید.');
      }, 5000);
      var pr;
      try { pr = P.azanDiag(); } catch (e) { done = true; clearTimeout(timer); show(h + '\n\n❌ خطا: ' + errText(e)); return; }
      Promise.resolve(pr).then(function (d) {
        done = true; clearTimeout(timer);
        d = d || {};
        var L = [h, ''];
        L.push('اندروید (SDK): ' + d.sdk);
        L.push('اذان بومی: ' + (d.enabled ? '✅ روشن' : '❌ خاموش') + ' — ' + fa(d.items || 0) + ' وقت ذخیره‌شده');
        L.push('اذان بعدی: ' + (d.nextT ? ((d.nextLabel || '') + ' ساعت ' + hhmmss(d.nextT)) : '⚠️ هیچ وقتی ذخیره نشده (یک بار اپ را آنلاین باز کنید)'));
        L.push('فایل صدای ذخیره‌شده روی گوشی (برای آفلاین): ' + (d.fileKb > 0 ? ('✅ ' + fa(d.fileKb) + ' کیلوبایت') : '❌ ندارد — یک بار آنلاین باز کنید و ۳۰ ثانیه صبر کنید'));
        L.push('صدای داخل APK: ' + (d.bundled ? '✅ دارد' : 'ندارد'));
        L.push('اعلان‌ها: ' + (d.notif ? '✅ مجاز' : '⚠️ بسته است (صدا پخش می‌شود ولی اعلان دیده نمی‌شود)'));
        L.push('بهینه‌سازی باتری: ' + (d.batteryFree ? '✅ آزاد (Unrestricted)' : '⚠️ فعال؛ در شیائومی/هواوی/سامسونگ ممکن است اذان را ببندد'));
        L.push('');
        L.push('گزارش لحظه‌ای (از قدیم به جدید):');
        L.push(d.log ? d.log : '(هنوز چیزی ثبت نشده)');
        show(L.join('\n'));
      }).catch(function (e) {
        done = true; clearTimeout(timer);
        show(h + '\n\n❌ خطا از بخش بومی: ' + errText(e));
      });
    }

    function test(sec) {
      var P = AU(), h = head(P);
      if (!P || typeof P.testAzan !== 'function') { show(h + '\n\n❌ این APK قدیمی است؛ APK جدید را نصب کنید.'); return; }
      show(h + '\n\n⏳ در حال ثبت تست…');
      Promise.resolve(P.testAzan({ seconds: sec })).then(function (r) {
        show('✅ تست ثبت شد؛ اذان آزمایشی ساعت ' + hhmmss(r && r.t) + ' پخش می‌شود.\n\n' +
          'حالا این کارها را انجام دهید:\n' +
          '۱) اینترنت (وای‌فای و دیتا) را قطع کنید یا حالت پرواز بزنید\n' +
          '۲) اپ را از لیست برنامه‌های اخیر کاملاً ببندید (Swipe)\n' +
          '۳) گوشی را قفل کنید و صبر کنید\n\n' +
          'بعد از پخش (یا اگر پخش نشد)، اپ را باز کنید ← ۵ بار روی خط نسخه بزنید ← «گزارش» را بزنید.');
      }).catch(function (e) { show(h + '\n\n❌ خطا: ' + errText(e)); });
    }

    // تست جشن عید فطر: بدون توجه به تاریخ، همان صفحهٔ آتش‌بازی + تبریک + صدا را نشان می‌دهد (چیزی ذخیره نمی‌شود)
    function eidTest() {
      if (typeof window.previewEidCelebration !== 'function') { show('❌ بخش جشن عید در این نسخهٔ ظاهر اپ نیست؛ اپ را یک بار ببندید و باز کنید تا بروزرسانی ظاهر برسد.'); return; }
      show('⏳ در حال آماده‌سازی جشن…');
      Promise.resolve(window.previewEidCelebration()).then(function (r) {
        if (!r || !r.ok) { show('⚠️ ' + ((r && r.msg) || 'انجام نشد')); return; }
        overlay.style.display = 'none';
        // بعد از بستن جشن و برگشت به این پنل، وضعیت را می‌بیند
        show('✅ جشن نمایش داده شد.\n' +
          'جشن عید در پیشخوان: ' + (r.enabled ? '✅ فعال' : '⚠️ خاموش است (در روز عید واقعی دیده نمی‌شود؛ تیک «فعال‌سازی جشن» را بزنید)') + '\n' +
          'فایل صوتی: ' + (r.hasAudio ? '✅ تنظیم شده' : 'ندارد') + '\n' +
          'متن رنگی در آتش‌بازی: ' + (r.hasFx ? '✅ تنظیم شده (هر چند ثانیه یک‌بار به شکل متن منفجر می‌شود)' : 'ندارد (در پیشخوان ننوشته‌اید)') + '\n' +
          'آتش‌بازی در همهٔ بخش‌ها: ' + (r.ambient ? '✅ روشن (بعد از بستن کارت تبریک، روی همهٔ صفحه‌ها می‌آید؛ برای توقف «✕ آتش‌بازی» پایین-چپ را بزنید)' : '⚠️ در پیشخوان خاموش شده') + '\n' +
          'متن تبریک شما: ' + (r.hasTitle ? '✅ تنظیم شده' : 'پیش‌فرض (در پیشخوان ننوشته‌اید)'));
      }).catch(function (e) { show('❌ خطا: ' + errText(e)); });
    }

    function build() {
      overlay = el('div');
      overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:100000;background:#0f2e29;color:#fff;overflow:auto;' +
        '-webkit-overflow-scrolling:touch;direction:rtl;text-align:right;font-family:inherit;' +
        'padding:calc(env(safe-area-inset-top,0px) + 14px) 14px calc(env(safe-area-inset-bottom,0px) + 24px);';
      var top = el('div');
      top.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;';
      var ttl = el('div', null, '🔔 تست اذان بومی (آفلاین / قفل / اپ بسته)');
      ttl.style.cssText = 'font-weight:700;font-size:15px;';
      top.appendChild(ttl);
      top.appendChild(btn('✕ بستن', function () { overlay.style.display = 'none'; }));
      overlay.appendChild(top);
      var row = el('div');
      row.appendChild(btn('تست ۱ دقیقه دیگر', function () { test(60); }, true));
      row.appendChild(btn('تست ۳ دقیقه دیگر', function () { test(180); }, true));
      row.appendChild(btn('گزارش', refresh));
      row.appendChild(btn('🎆 تست جشن عید فطر', eidTest, true));
      row.appendChild(btn('توقف صدا', function () {
        var P = AU();
        if (P && typeof P.stopAzan === 'function') Promise.resolve(P.stopAzan()).then(refresh).catch(function (e) { show('❌ خطا: ' + errText(e)); });
      }));
      overlay.appendChild(row);
      out = el('div');
      out.style.cssText = 'white-space:pre-wrap;word-break:break-word;font-size:13px;line-height:2;margin-top:10px;padding:12px;border-radius:12px;background:rgba(255,255,255,.08);color:#fff;min-height:120px;';
      overlay.appendChild(out);
      document.body.appendChild(overlay);
    }
  }

  function wire() {
    var rb = document.getElementById('topbar-reload-btn');
    if (rb) rb.title = 'بروزرسانی';
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
      try {
        var PS = AU();
        // اول کار پس‌زمینه ثبت می‌شود (bgConfig) و بعد وضعیت خوانده می‌شود؛ وگرنه ممکن بود وضعیت «غیرفعال» دیده شود
        // چون هنوز ثبت نشده بود.
        var preBg = (PS && typeof PS.bgConfig === 'function')
          ? Promise.resolve(PS.bgConfig({ api: apiBase() })).catch(function () {})
          : Promise.resolve();
        if (PS && typeof PS.status === 'function') preBg.then(function () { return PS.status(); }).then(function (s) {
          var why = '';
          if (!s) return;
          if (s.silentLikely) why = '✅ فعال';
          else if (s.sdk < 31) why = '⚠️ اندروید زیر ۱۲ (همیشه یک تأیید لازم است)';
          else if (!s.canInstall) why = '⚠️ اجازهٔ نصب از این منبع داده نشده';
          else if (!s.selfInstaller) why = '⚠️ با اولین بروزرسانی از داخل اپ فعال می‌شود';
          vl.textContent += '  |  نصب بی‌صدا: ' + why;
          var bgTxt = (typeof s.bgJob === 'undefined') ? '⚠️ نیاز به APK جدید (این APK بخش جدید را ندارد)'
            : (s.bgJob ? '✅ فعال' : '⚠️ ثبت نشد (اپ را یک بار ببندید و باز کنید)');
          vl.textContent += '  |  دانلود پس‌زمینه: ' + bgTxt + (s.bgReady ? (' (نسخهٔ ' + s.bgReady + ' آماده است)') : '');
        }).catch(function () {});
      } catch (e) {}
      showWebLine();
      setupAzanTest(vl);
    }
    // آدرس سایت را به بخش بومی می‌دهیم تا دانلود پس‌زمینه (حتی با اپ بسته) از همان سایت بپرسد
    try { var PB = AU(); if (PB && typeof PB.bgConfig === 'function') PB.bgConfig({ api: apiBase() }).catch(function () {}); } catch (eb) {}
    // با برگشتن اینترنت، بدون منتظر ماندن برای زمان‌سنج، بررسی می‌شود
    window.addEventListener('online', function () { setTimeout(function () { check(false); }, 2500); });
    watchBoot();
    var done = showDoneIfUpdated();
    // بررسی خودکار چند ثانیه بعد از باز شدن اپ (اگر آنلاین باشد)
    setTimeout(function () { if (!done && navigator.onLine !== false) check(false); }, 2000);
    setTimeout(function () { if (navigator.onLine !== false) webCheck(); }, 3000);
    // یادآوری فعال‌سازی «اجازهٔ نصب» (هر ۳ روز)؛ کمی بعد از بررسی بروزرسانی تا پنجره‌ها روی هم نیایند
    setTimeout(permReminder, 14000);
    setInterval(permReminder, 3600 * 1000);
    setInterval(function () { if (navigator.onLine !== false) webCheck(); }, RECHECK_MS);
    // اگر اپ مدت زیادی باز بماند یا از پس‌زمینه برگردد، دوباره از سایت می‌پرسد (بروزرسانی خودکار)
    setInterval(function () { if (navigator.onLine !== false) check(false); }, RECHECK_MS);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && navigator.onLine !== false && Date.now() - lastCheckTs > RESUME_MS) check(false);
    });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') setTimeout(permReminder, 3000);
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
  var webPending = false;      // نسخهٔ جدید ظاهر دانلود و «آماده» شده و منتظر اعمال است
  var lastTouchTs = Date.now();
  ['touchstart', 'click', 'scroll', 'keydown'].forEach(function (ev) {
    document.addEventListener(ev, function () { lastTouchTs = Date.now(); }, { passive: true, capture: true });
  });

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
        webPending = true;
        if (Date.now() - sessionStart < 60000 && !userIsTyping()) webApplyStaged();
      });
    }).catch(log).then(function () { webBusy = false; });
  }

  // اپ که بعد از مدتی از پس‌زمینه برگردد مثل باز شدن تازه است؛ نسخهٔ آماده را همان موقع اعمال می‌کنیم
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      webHiddenAt = Date.now();
      // کاربر از اپ خارج شد: نسخهٔ آمادهٔ ظاهر همین حالا (نامرئی) اعمال می‌شود تا دفعهٔ بعد که اپ را باز کرد نسخهٔ جدید را ببیند
      if (webPending && !userIsTyping()) { webPending = false; webApplyStaged(); }
      return;
    }
    if (webHiddenAt && Date.now() - webHiddenAt > 30000 && !userIsTyping()) { webHiddenAt = 0; webApplyStaged(); }
    if (navigator.onLine !== false && Date.now() - webLastCheck > RESUME_MS) webCheck();
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

  // اگر نسخهٔ آماده منتظر است و کاربر ۲۰ ثانیه است به صفحه دست نزده (و تایپ نمی‌کند)، همان لحظه اعمال می‌شود
  setInterval(function () {
    if (!webPending || document.visibilityState !== 'visible') return;
    if (Date.now() - lastTouchTs < 20000 || userIsTyping()) return;
    webPending = false;
    webApplyStaged();
  }, 5000);

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
