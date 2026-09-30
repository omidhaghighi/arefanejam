// این سرویس‌ورکر دو وظیفه دارد: ۱) نوتیفیکیشن واقعی، ۲) کش کردن فایل‌های لازم
// برای کارکرد کامل اپ در حالت آفلاین (پوستهٔ اصلی اپ + صدای اذان + تنظیمات).
// استراتژی همه‌جا یکسان است: «اول شبکه، اگر نبود از کش» (network-first)؛ یعنی
// تا وقتی اینترنت هست همیشه آخرین نسخه گرفته می‌شود و همزمان در کش هم ذخیره
// می‌شود، و فقط وقتی اینترنت قطع است همان نسخهٔ ذخیره‌شدهٔ قبلی نمایش داده می‌شود.

const DEFAULT_API_URL = 'https://arefanejam.com/wp-json/arefanejam/v1';
const AZAN_OFFLINE_CACHE = 'arefanejam-azan-offline-v1';
// کش جداگانهٔ فایل صوتیِ «اعلان» (پیام صوتی مدیر)؛ عمداً از کش اذان جدا است تا حذف/جایگزینیِ
// فایل اذان هیچ‌وقت این یکی را پاک نکند و برعکس. باید دقیقاً با ANNOUNCEMENT_AUDIO_CACHE_NAME
// در js/app.js یکی باشد.
const ANNOUNCEMENT_AUDIO_CACHE = 'arefanejam-announcement-audio-v1';
// کش پوستهٔ اصلی اپ (HTML/CSS/JS/آیکون/مانیفست) برای کارکرد کامل آفلاین.
// این اسم دقیقاً باید با APP_SHELL_CACHE_NAME در js/app.js یکی باشد تا موقع
// پاک‌سازی کش‌های قدیمی، این یکی به‌اشتباه پاک نشود.
const APP_SHELL_CACHE = 'arefanejam-app-shell-v4';
// کش تصاویر بخش «کمک‌های مردمی» برای نمایش آفلاین؛ این اسم دقیقاً باید با CHARITY_MEDIA_CACHE_NAME
// در js/app.js یکی باشد. خودِ اپ تصاویر را در آن ذخیره می‌کند و این سرویس‌ورکر فقط از آن می‌خواند.
const CHARITY_MEDIA_CACHE = 'arefanejam-charity-media-v1';

// دو جایگاه ثابت و جدا در نوار اعلانات:
// ۱) STICKY_TAG: تاریخ امروز + اذان بعدی — همیشه به‌روزرسانی می‌شود، بی‌صدا
// ۲) LIVE_TAG: خبر/مناسبت/هشدار لحظهٔ اذان — با صدا یا فقط متن، بر اساس انتخاب مدیر
const STICKY_TAG = 'arefanejam-sticky';
const LIVE_TAG = 'arefanejam-live';
// نوتیفیکیشن یدکیِ «بهترین‌تلاش» وقتی اپ کاملاً بسته است و سرویس‌ورکر توسط
// Periodic Background Sync (فقط کروم/اندروید) بیدار می‌شود؛ چون سرویس‌ورکر
// نمی‌تواند فایل صوتی دلخواه را در پس‌زمینهٔ کامل پخش کند، فقط یک هشدار با
// لرزش نشان می‌دهد تا کاربر اپ را باز کند و صدای واقعی اذان پخش شود.
// همهٔ اعلان‌های «اذان» و «وقت نماز» (چه از سرور، چه محلی/آفلاین) یک تگ مشترک دارند؛
// پس اعلان جدید همیشه جای قبلی را می‌گیرد و فقط اعلانِ همان وقت در نوار می‌ماند.
const AZAN_CURRENT_TAG = 'arefanejam-azan-current';
const BG_AZAN_TAG = AZAN_CURRENT_TAG;
const BG_PRAYER_TIME_TAG = AZAN_CURRENT_TAG;
// اعلان اذان/نماز بعد از این مدت (دقیقه) دیگر «همان وقت» حساب نمی‌شود و بسته می‌شود
const AZAN_NOTIFICATION_TTL_MINUTES = 30;
const LEGACY_AZAN_TAGS = ['arefanejam-bg-azan', 'arefanejam-bg-prayer-time'];
const AZAN_TITLE_RE = /^وقت (اذان|نماز)/;

function isAzanNotification(n) {
  const tag = n.tag || '';
  if (tag === AZAN_CURRENT_TAG || LEGACY_AZAN_TAGS.indexOf(tag) !== -1) return true;
  if (n.data && n.data.kind === 'azan') return true;
  // اعلان‌های قدیمیِ سرور (تگ arefanejam-live-<id>) که هنوز روی گوشی مانده‌اند
  return tag.indexOf(LIVE_TAG + '-') === 0 && AZAN_TITLE_RE.test(n.title || '');
}
// بستن اعلان‌های اذان/نماز. keepTag اگر داده شود، همان یکی بسته نمی‌شود؛
// onlyStale=true یعنی فقط قدیمی‌ها (بیش از TTL) بسته شوند.
async function closeAzanNotifications(onlyStale) {
  try {
    const list = await self.registration.getNotifications();
    const limit = Date.now() - AZAN_NOTIFICATION_TTL_MINUTES * 60000;
    list.forEach((n) => {
      if (!isAzanNotification(n)) return;
      const ts = n.timestamp || (n.data && n.data.shownAt) || 0;
      if (!onlyStale || !ts || ts < limit) n.close();
    });
  } catch (e) { /* بی‌اهمیت */ }
}
const PRAYER_TIME_REMINDER_MINUTES = 20; // باید دقیقاً با PRAYER_TIME_REMINDER_MINUTES در js/app.js یکی باشد
// ۳) NOTE_TAG_PREFIX: یادآوریِ یادداشت شخصی کاربر — هر یادداشت جایگاه/تگ جدا دارد
// تا چند یادآوریِ هم‌زمان، جای هم را نگیرند و همه دیده شوند.
const NOTE_TAG_PREFIX = 'arefanejam-note-';

// پیش‌ذخیرهٔ پوستهٔ اپ همان لحظهٔ نصب، تا حتی اگر کاربر بلافاصله آفلاین شد اپ باز شود
async function precacheShell() {
  try {
    const cache = await caches.open(APP_SHELL_CACHE);
    const files = ['index.html', 'css/style.css', 'js/iran-cities.js', 'js/app.js', 'icons/icon-192.png', 'icons/icon-512.png', '/arefanejam-manifest.json'];
    // cache: 'reload' یعنی حتی همین اولین ذخیره‌سازی هم از کش HTTP مرورگر رد نشود
    // و مستقیم از سرور گرفته شود؛ وگرنه ممکن است از همان لحظهٔ نصب، نسخهٔ قدیمیِ
    // کش‌شدهٔ مرورگر در کش سرویس‌ورکر هم تکرار شود.
    await Promise.all(files.map((f) => cache.add(new Request(new URL(f, self.location.href).href, { cache: 'reload' })).catch(() => {})));
  } catch (e) { /* مهم نیست؛ ذخیره‌سازی حین استفاده هم انجام می‌شود */ }
}
self.addEventListener('install', (event) => { self.skipWaiting(); event.waitUntil(precacheShell()); });
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim().then(rescheduleTriggers)); });

/* ---------- ذخیرهٔ زمان‌بندی اذان در IndexedDB ----------
   صفحهٔ اپ (js/app.js) هر بار اوقات شرعی را دوباره محاسبه می‌کند، همان لحظه
   زمان‌بندی امروز + آدرس فایل صوتی را برای این سرویس‌ورکر پیام می‌فرستد (postMessage)
   تا اینجا در IndexedDB ذخیره شود. سرویس‌ورکر خودش localStorage را نمی‌بیند،
   پس تنها راهش برای دسترسی به این اطلاعات - حتی وقتی صفحه‌ای باز نیست - همین
   IndexedDB است. */
const IDB_NAME = 'arefanejam-bg';
const IDB_STORE = 'kv';
function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(IDB_STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbSet(key, value) {
  try {
    const db = await idbOpen();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
  } catch (e) { /* IndexedDB در دسترس نبود؛ فقط از لایهٔ یدکی صرف‌نظر می‌شود */ }
}
async function idbGet(key) {
  try {
    const db = await idbOpen();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch (e) { return undefined; }
}

// پیام‌های صفحهٔ اپ: زمان‌بندی امروز برای لایهٔ یدکی ذخیره می‌شود
self.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg) return;
  if (msg.type === 'AREFANEJAM_SCHEDULE_SYNC') {
    // خودِ سرویس‌ورکر هم مطمئن می‌شود فایل اذان روی گوشی ذخیره شده باشد (لایهٔ دوم، علاوه بر
    // ذخیره‌سازی صفحهٔ اپ)، تا حتی اگر دانلود صفحه ناتمام ماند، اذان آفلاین پخش شود.
    event.waitUntil(ensureAzanAudioCached(msg.audioUrl));
    event.waitUntil(idbSet('schedule', {
      prayers: msg.prayers, // [{key,label,timeIso}] فقط زمان‌های واقعی اذان (بدون طلوع/غروب) — امروز و چند روز بعد
      audioUrl: msg.audioUrl || '',
      brandName: msg.brandName || 'عارفان جام',
      enabled: !!msg.enabled,
      savedAt: Date.now(),
    }).then(rescheduleTriggers));
    return;
  }
  // فهرست یادداشت‌های دارای یادآوری (از localStorage صفحه) برای کارکرد آفلاین در پس‌زمینه
  if (msg.type === 'AREFANEJAM_NOTES_SYNC') {
    event.waitUntil(saveNotesForBackground(msg.notes).then(rescheduleTriggers).then(checkBackgroundNotes));
    return;
  }
  // شناسهٔ دستگاه هم اینجا (IndexedDB) نگه داشته می‌شود، چون سرویس‌ورکر به localStorage
  // دسترسی ندارد و برای خواندنِ یادآوری‌های شخصیِ همین دستگاه، به همین شناسه نیاز دارد.
  if (msg.type === 'AREFANEJAM_CLEAR_STALE_AZAN') {
    event.waitUntil(closeAzanNotifications(true));
    return;
  }
  if (msg.type === 'AREFANEJAM_DEVICE_ID_SYNC') {
    event.waitUntil(idbSet('deviceId', msg.deviceId || ''));
    return;
  }
});

async function ensureAzanAudioCached(audioUrl) {
  try {
    if (!audioUrl || self.navigator.onLine === false) return;
    const u = new URL(audioUrl, self.location.href);
    if (u.origin !== self.location.origin) return;
    const cache = await caches.open(AZAN_OFFLINE_CACHE);
    if (await cache.match(u.href)) return;
    const res = await fetch(u.href);
    if (res && res.status === 200) await cache.put(u.href, res);
  } catch (e) { /* بی‌اهمیت؛ ذخیره‌سازی صفحهٔ اپ هم انجام می‌شود */ }
}

function isAzanAudioRequest(url) {
  return /\.(mp3|ogg|wav|m4a|aac)(\?|$)/i.test(url);
}
function isSettingsRequest(url) {
  return url.indexOf('/wp-json/arefanejam/v1/settings') !== -1;
}
// اطلاعات بخش «کمک‌های مردمی» و فهرست اقلام غذایی (عمداً /charity-food/... شامل نمی‌شود چون آن‌ها ورود و ثبت‌اند)
function isCharityDataRequest(url) {
  return /\/wp-json\/arefanejam\/v1\/(charity|food-items)(\?|$)/.test(url);
}
// اگر تصویر (از سایتی غیر از خود اپ) در کش «کمک‌های مردمی» بود از همان می‌دهد؛ وگرنه مستقیم از شبکه
async function charityMediaResponse(request) {
  try {
    const cache = await caches.open(CHARITY_MEDIA_CACHE);
    const cached = await cache.match(request.url);
    if (cached) return cached;
  } catch (e) { /* کش در دسترس نبود */ }
  return fetch(request);
}

// پوستهٔ اصلی اپ: خودِ صفحه (index.html، چه با آدرس کامل و چه با ناوبری مرورگر)
// و فایل‌های ثابتِ ضروری برای نمایش آن. عمداً بر اساس نام فایل تشخیص داده
// می‌شود (نه مسیر کامل)، چون شمارهٔ نسخهٔ ?v= آن‌ها با هر آپدیت تغییر می‌کند.
function isAppShellRequest(request) {
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false; // فقط فایل‌های همین سایت
  if (request.mode === 'navigate') return true; // بازشدن/رفرش صفحهٔ اپ
  return /(^|\/)(index\.html|style\.css|app\.js|iran-cities\.js|icon-192\.png|icon-512\.png|manifest\.json|arefanejam-manifest\.json)$/.test(url.pathname);
}

// اجرای «اول شبکه، اگر نبود از کش» برای یک درخواست، با ذخیره‌سازی نسخهٔ تازه در کش.
// برای فایل‌های پوستهٔ اپ (غیر از خودِ ناوبری صفحه)، حتماً با cache:'reload' درخواست
// می‌شود تا کش HTTP خودِ مرورگر/گوشی دور زده شود؛ وگرنه حتی همین «اول شبکه» هم
// می‌تواند به‌جای رفتن واقعی به سرور، نسخهٔ قدیمیِ ذخیره‌شدهٔ مرورگر را برگرداند
// (به‌خصوص وقتی مدیر یادش می‌رود عدد ?v= را در index.html بالا ببرد).
function networkFirstThenCache(request, cacheName, isShell) {
  const fetchReq = (isShell && request.mode !== 'navigate')
    ? new Request(request.url, { headers: request.headers, credentials: request.credentials, cache: 'reload' })
    : request;
  return fetch(fetchReq)
    .then((response) => {
      if (response && response.status === 200) {
        const copy = response.clone();
        caches.open(cacheName).then((cache) => cache.put(request, copy)).catch(() => {});
      }
      return response;
    })
    .catch(async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      if (isShell) {
        // آدرس با پارامتر متفاوت (مثل ?v= یا ?_r=) هم قبول است؛ و برای هر ناوبری، صفحهٔ اصلی اپ
        const loose = await caches.match(request, { ignoreSearch: true });
        if (loose) return loose;
        if (request.mode === 'navigate') {
          const idx = await caches.match(new URL('index.html', self.location.href).href, { ignoreSearch: true });
          if (idx) return idx;
        }
      }
      return Response.error();
    });
}

// فایل صوتی اذان یا اعلان: اگر در کش گوشی باشد (اپ آن را ذخیره کرده)، همیشه از همان و با پشتیبانی
// کامل از درخواست‌های Range (لازم برای پخش صوت در مرورگرها) پاسخ داده می‌شود؛ وگرنه مستقیم از شبکه.
// هر دو کش (اذان و اعلان) چک می‌شوند چون هر دو نوع فایل صوتی از همین مسیر رد می‌شوند.
async function azanAudioResponse(request) {
  let cache = await caches.open(AZAN_OFFLINE_CACHE);
  let cached = await cache.match(request.url);
  if (!cached) {
    cache = await caches.open(ANNOUNCEMENT_AUDIO_CACHE);
    cached = await cache.match(request.url);
  }
  if (!cached) return fetch(request);
  const range = request.headers.get('range');
  const m = range && /bytes=(\d*)-(\d*)/.exec(range);
  if (!m) return cached;
  const buf = await cached.clone().arrayBuffer();
  const size = buf.byteLength;
  let start, end;
  if (m[1] === '') { start = Math.max(0, size - Number(m[2])); end = size - 1; }
  else { start = Number(m[1]); end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1); }
  if (isNaN(start) || isNaN(end) || start > end || start >= size) {
    return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + size } });
  }
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': cached.headers.get('Content-Type') || 'audio/mpeg',
      'Content-Range': 'bytes ' + start + '-' + end + '/' + size,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = request.url;
  if (request.method !== 'GET') return;

  if (isSettingsRequest(url)) {
    event.respondWith(networkFirstThenCache(request, AZAN_OFFLINE_CACHE, false));
    return;
  }

  // فقط فایل‌های صوتیِ همین سایت (اذان)؛ صوت‌های سایت‌های دیگر (مثل تلاوت قرآن) دست‌نخورده می‌مانند
  if (isAzanAudioRequest(url) && new URL(url).origin === self.location.origin) {
    event.respondWith(azanAudioResponse(request));
    return;
  }

  if (isAppShellRequest(request)) {
    event.respondWith(networkFirstThenCache(request, APP_SHELL_CACHE, true));
    return;
  }

  if (isCharityDataRequest(url)) {
    event.respondWith(networkFirstThenCache(request, AZAN_OFFLINE_CACHE, false));
    return;
  }

  if (request.destination === 'image' && new URL(url).origin !== self.location.origin) {
    event.respondWith(charityMediaResponse(request));
    return;
  }

  // بقیهٔ درخواست‌ها (سایر APIها، فونت گوگل و ...) دست‌نخورده و از شبکه
});

// پیام Push از سرور «خالی» می‌رسد (بدون رمزنگاری محتوا)؛
// فقط سرویس‌ورکر را بیدار می‌کند تا خودش آخرین اعلان را از سایت بخواند و نمایش دهد.
self.addEventListener('push', (event) => {
  const apiUrl = DEFAULT_API_URL;
  const generalPush = fetch(apiUrl + '/settings')
    .then((res) => res.json())
    .then((data) => Promise.all([
      showStickyNotification(data),
      showLiveNotification(data),
      // اگر اپ همین الان باز است (حتی در پس‌زمینه/تب دیگر)، بدون نیاز به لمس نوتیفیکیشن،
      // همین لحظه که پوش می‌رسد صدای اعلان پخش شود؛ برای گوشی‌هایی که اپ کاملاً بسته است
      // (هیچ صفحه‌ای باز نیست)، مرورگر اجازهٔ پخش خودکار صدا را نمی‌دهد و پخش فقط با
      // لمس نوتیفیکیشن انجام می‌شود (در notificationclick پایین‌تر).
      broadcastAnnouncementAudio(data),
    ]))
    .catch(() => {
      self.registration.showNotification('عارفان جام', { body: 'اعلان جدیدی دارید. اپ را باز کنید.', tag: LIVE_TAG });
    });
  // مستقل از نتیجهٔ بالا: یادآوری‌های شخصیِ یادداشت + صفِ تضمین‌شدهٔ آلارم‌های زنده
  // (اذان/خبر/مناسبت) هم چک شود، حتی اگر این Push فقط برای موارد دیگر بوده باشد.
  event.waitUntil(Promise.all([generalPush, checkNoteReminders(), checkBackgroundNotes(), closeAzanNotifications(true).then(checkPendingAlarms)]));
});

// پخش فوریِ صدای اعلان برای هر صفحه‌ای که همین الان باز است (حتی در پس‌زمینه)؛
// شناسهٔ اعلان هم فرستاده می‌شود تا خودِ صفحه (app.js) تشخیص دهد این اعلان را قبلاً
// ندیده، وگرنه با هر Push تکراری (مثلاً پوش بی‌صدای نوتیفیکیشن ثابت هر ۳۰ دقیقه)
// دوباره و دوباره پخش می‌شد.
async function broadcastAnnouncementAudio(data) {
  const audioOn = data.announcement_audio_enabled === '1' && !!data.announcement_audio_url && !!data.announcement_text;
  if (!audioOn) return;
  const clientList = await self.clients.matchAll({ type: 'window' });
  clientList.forEach((c) => c.postMessage({
    type: 'AREFANEJAM_PLAY_ANNOUNCEMENT_AUDIO',
    url: data.announcement_audio_url,
    announcementId: data.announcement_id || '',
    text: data.announcement_text || '',
    link: data.announcement_link || '',
  }));
}

// یادآوریِ یادداشتِ شخصیِ کاربر: چون هر یادآوری فقط برای همان دستگاه ذخیره شده (نه
// همهٔ کاربران)، اینجا با شناسهٔ دستگاهِ خودمان از سرور می‌پرسیم که آیا یادآوریِ
// سررسیده و هنوز نمایش‌داده‌نشده‌ای داریم؛ اگر بله، دقیقاً با همان متنِ یادداشت
// نمایش داده و سپس به سرور اطلاع می‌دهیم که دیده شد.
async function checkNoteReminders() {
  try {
    const deviceId = await idbGet('deviceId');
    if (!deviceId) return;
    const res = await fetch(DEFAULT_API_URL + '/note-reminders/pending?device_id=' + encodeURIComponent(deviceId));
    const rows = await res.json();
    if (!Array.isArray(rows) || !rows.length) return;

    const deliveredIds = [];
    for (const r of rows) {
      await self.registration.showNotification(r.title || 'یادآوری یادداشت', {
        body: r.content || '',
        tag: NOTE_TAG_PREFIX + r.note_id,
        renotify: true,
        requireInteraction: true,
        vibrate: [200, 100, 200, 100, 200],
        data: { isNote: true, noteId: r.note_id },
      });
      deliveredIds.push(r.id);
      await markNoteFired(r.note_id);
    }
    await fetch(DEFAULT_API_URL + '/note-reminders/ack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_id: deviceId, ids: deliveredIds }),
    }).catch(() => {}); // اگر همین درخواست هم آفلاین بماند، Pushِ بعدی دوباره امتحان می‌کند
  } catch (e) { /* بی‌اهمیت؛ چک بعدی جبران می‌کند */ }
}

// نوتیفیکیشن ثابت تاریخ + اذان بعدی — همیشه در همان جایگاه جایگزین می‌شود، هرگز صدا/لرزش ایجاد نمی‌کند
function showStickyNotification(data) {
  if (data.sticky_notification_enabled === '') return Promise.resolve();
  const info = data.sticky_info || {};
  if (!info.jalali) return Promise.resolve();

  const custom = String(data.sticky_custom_text || '').trim(); // متن دلخواه مدیر (پیشخوان سایت)
  const lines = [info.jalali, custom, info.gregorian, info.hijri].filter(Boolean);
  if (info.next_prayer_label) {
    lines.push('اذان بعدی: ' + info.next_prayer_label + ' — ساعت ' + info.next_prayer_time);
  }

  return self.registration.showNotification(data.brand_name || 'عارفان جام', {
    body: lines.join('\n'),
    icon: data.logo_url || undefined,
    badge: data.logo_url || undefined,
    image: info.banner_url || undefined, // بنر بزرگ و رنگی، شبیه نمونهٔ پسندیده‌شده
    tag: STICKY_TAG,
    silent: true,
    requireInteraction: true,
    renotify: false, // فقط محتوا به‌روز می‌شود، بدون آزاردادن کاربر با صدا/لرزش مجدد
    data: { link: '' },
  });
}

// نوتیفیکیشن خبر/مناسبت/هشدار لحظهٔ اذان: حالا از صفِ تضمین‌شدهٔ per-device می‌آید
// (پایین‌تر، checkPendingAlarms) نه از این تابع. این تابع فقط «متن اطلاعیهٔ سادهٔ»
// جداگانه‌ای را نشان می‌دهد که مدیر سایت مستقیماً در تنظیمات فعال کرده باشد.
function showLiveNotification(data) {
  if (!data.announcement_text) return Promise.resolve();
  // پیام صوتی اعلان: کاملاً وابسته به تیک «پیام صوتی» در پیشخوان؛ اگر خاموش باشد یا
  // فایلی انتخاب نشده باشد، دقیقاً مثل قبل فقط متنی نمایش داده می‌شود.
  const audioOn = data.announcement_audio_enabled === '1' && !!data.announcement_audio_url;
  return self.registration.showNotification('عارفان جام', {
    body: data.announcement_text,
    icon: data.logo_url || undefined,
    badge: data.logo_url || undefined,
    data: {
      link: data.announcement_link || '',
      audioUrl: audioOn ? data.announcement_audio_url : '',
      announcementId: data.announcement_id || '',
      text: data.announcement_text || '',
    },
    tag: LIVE_TAG,
    renotify: true,
    // مرورگرهایی که این فیلد را می‌فهمند، همزمان با لمس نوتیفیکیشن لرزش هم می‌دهند
    vibrate: audioOn ? [200, 100, 200, 100, 200] : undefined,
  });
}

// آلارمِ زنده (وقت اذان/خبر/مناسبت): هر آلارم برای همین دستگاه در سرور صف شده و تا
// وقتی اینجا واقعاً نمایش داده و تأیید (ack) نشود، در صف می‌ماند — یعنی برخلاف روش
// قبلی (که فقط تا ۱۰ دقیقه بعد از ساخته‌شدن «تازه» حساب می‌شد)، حتی اگر گوشی ساعت‌ها
// آفلاین/قفل بوده باشد، به‌محض اولین Push بعد از وصل‌شدن دوباره، حتماً نمایش داده می‌شود.
async function checkPendingAlarms() {
  try {
    const deviceId = await idbGet('deviceId');
    if (!deviceId) return;
    const res = await fetch(DEFAULT_API_URL + '/alarms/pending?device_id=' + encodeURIComponent(deviceId));
    const rows = await res.json();
    if (!Array.isArray(rows) || !rows.length) return;

    const deliveredIds = rows.map((a) => a.id);
    // اگر چند اعلان اذان/نماز در صف مانده (مثلاً گوشی ساعت‌ها آفلاین بوده)، فقط «آخرین»
    // نمایش داده می‌شود؛ بقیه فقط تأیید (ack) می‌شوند تا نوار اعلانات شلوغ نشود.
    const azanRows = rows.filter((a) => a.type === 'azan');
    const lastAzan = azanRows.length ? azanRows[azanRows.length - 1] : null;
    for (const a of rows) {
      if (a.type === 'azan' && a !== lastAzan) continue;
      const silent = !a.sound;
      const isAzan = a.type === 'azan';
      if (isAzan) await closeAzanNotifications(false); // قبلی‌ها کنار برود
      await self.registration.showNotification(a.title || 'عارفان جام', {
        body: a.body || '',
        tag: isAzan ? AZAN_CURRENT_TAG : LIVE_TAG + '-' + a.alarm_id,
        renotify: true,
        silent,
        timestamp: Date.now(),
        vibrate: silent ? undefined : [200, 100, 200, 100, 200],
        requireInteraction: isAzan,
        data: { link: a.link || '', kind: isAzan ? 'azan' : '', playAzan: isAzan && /^وقت اذان/.test(a.title || ''), shownAt: Date.now() },
      });
    }
    await fetch(DEFAULT_API_URL + '/alarms/ack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_id: deviceId, ids: deliveredIds }),
    }).catch(() => {}); // اگر همین درخواست هم آفلاین بماند، Pushِ بعدی دوباره امتحان می‌کند
  } catch (e) { /* بی‌اهمیت؛ چک بعدی جبران می‌کند */ }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const tag = event.notification.tag || '';
  const isBgAzan = !!(event.notification.data && event.notification.data.playAzan);
  const isNote = tag.indexOf(NOTE_TAG_PREFIX) === 0;
  const noteId = isNote ? tag.slice(NOTE_TAG_PREFIX.length) : ((event.notification.data && event.notification.data.noteId) || '');
  const link = event.notification.data && event.notification.data.link;
  const audioUrl = event.notification.data && event.notification.data.audioUrl;
  const announcementId = event.notification.data && event.notification.data.announcementId;
  const announcementText = event.notification.data && event.notification.data.text;
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(async (clientList) => {
      let client = clientList.find((c) => 'focus' in c);
      if (client) {
        client.focus();
        if (link && client.navigate) client.navigate(link);
      } else if (self.clients.openWindow) {
        let openUrl = link || './index.html';
        if (isBgAzan && !link) {
          const nt = ((event.notification.title || '') + ' ' + (event.notification.body || ''));
          const lbl = ['فجر', 'ظهر', 'عصر', 'مغرب', 'عشاء'].find((l) => nt.indexOf(l) !== -1) || '';
          const at = (event.notification.data && event.notification.data.shownAt) || event.notification.timestamp || Date.now();
          openUrl = './index.html?azan=' + encodeURIComponent(lbl) + '&at=' + at;
        }
        client = await self.clients.openWindow(openUrl);
      }
      // این هشدار برای وقت اذان بود: به صفحه پیام بده تا همین الان صدای اذان را پخش کند.
      // چون این کار درست پس از یک تعامل واقعی کاربر (لمس نوتیفیکیشن) انجام می‌شود،
      // مرورگر معمولاً اجازهٔ پخش خودکار صدا را می‌دهد.
      if (isBgAzan && client && 'postMessage' in client) {
        client.postMessage({ type: 'AREFANEJAM_PLAY_AZAN_NOW' });
      }
      // این هشدار برای یادآوریِ یک یادداشت بود: به صفحه بگو همان یادداشت را باز کند.
      if (isNote && client && 'postMessage' in client) {
        client.postMessage({ type: 'AREFANEJAM_OPEN_NOTE', noteId });
      }
      // این اعلان صدای دلخواه داشت: به صفحه بگو همین الان پخشش کند (نسخهٔ ذخیره‌شدهٔ
      // گوشی در دسترس است، پس حتی بدون اینترنت هم پخش می‌شود).
      if (audioUrl && client && 'postMessage' in client) {
        client.postMessage({ type: 'AREFANEJAM_PLAY_ANNOUNCEMENT_AUDIO', url: audioUrl, announcementId: announcementId || '', text: announcementText || '', link: link || '' });
      }
    })
  );
});

/* ---------- لایهٔ یدکیِ «بهترین‌تلاش» برای حالت کاملاً بسته ----------
   وقتی اپ کاملاً بسته است، هیچ راهی برای پخش خودِ فایل صوتی اذان از داخل
   سرویس‌ورکر وجود ندارد (مرورگرها این قابلیت را به سرویس‌ورکرها نمی‌دهند).
   Periodic Background Sync فقط در کروم/اندروید و با بازهٔ زمانیِ دست خودِ
   مرورگر (معمولاً چند ساعت، نه دقیق) سرویس‌ورکر را بیدار می‌کند؛ اینجا با
   همان زمان‌بندیِ ذخیره‌شده در IndexedDB چک می‌کنیم که آیا همین الان (یا در
   چند دقیقهٔ اخیر) وقت یکی از اذان‌هاست و اگر بله، یک نوتیفیکیشن با لرزش
   نشان می‌دهیم تا کاربر اپ را باز کند. */
const BG_AZAN_WINDOW_MINUTES = 20; // اگر مرورگر دیرتر بیدار کرد، تا این مدت بعد از وقت اذان هنوز هشدار بده
self.addEventListener('periodicsync', (event) => {
  if (event.tag !== 'arefanejam-azan-check') return;
  event.waitUntil(checkBackgroundAzan().then(checkBackgroundNotes).then(rescheduleTriggers));
});
// برخی مرورگرها periodicsync را ندارند ولی sync معمولی (رویداد اتصال دوبارهٔ
// اینترنت) را دارند؛ همان لحظه هم یک چک انجام می‌شود، ضرری ندارد.
self.addEventListener('sync', (event) => {
  if (event.tag !== 'arefanejam-azan-check') return;
  event.waitUntil(checkBackgroundAzan().then(checkBackgroundNotes).then(rescheduleTriggers));
});

async function checkBackgroundAzan() {
  await closeAzanNotifications(true);
  const schedule = await idbGet('schedule');
  if (!schedule || !schedule.enabled || !Array.isArray(schedule.prayers)) return;
  const now = Date.now();
  const lastShownId = (await idbGet('lastBgAzanShown')) || '';

  for (const p of schedule.prayers) {
    const t = new Date(p.timeIso).getTime();
    if (isNaN(t)) continue;
    const diffMinutes = (now - t) / 60000;
    const uniqueId = p.key + '_' + new Date(p.timeIso).toDateString();
    if (diffMinutes >= 0 && diffMinutes < BG_AZAN_WINDOW_MINUTES && lastShownId !== uniqueId) {
      await idbSet('lastBgAzanShown', uniqueId);
      // اگر یک صفحهٔ باز (ولو در پس‌زمینه) پیدا شد، مستقیماً به آن بگو صدا را پخش کند
      const clientList = await self.clients.matchAll({ type: 'window' });
      if (clientList.length) {
        clientList.forEach((c) => c.postMessage({ type: 'AREFANEJAM_PLAY_AZAN_NOW', prayerLabel: p.label }));
        return;
      }
      await closeAzanNotifications(false);
      await self.registration.showNotification(schedule.brandName || 'عارفان جام', {
        body: 'وقت اذان ' + p.label + ' فرا رسیده است. برای پخش اذان، اپ را باز کنید.',
        tag: AZAN_CURRENT_TAG,
        renotify: true,
        timestamp: Date.now(),
        vibrate: [200, 100, 200, 100, 200],
        requireInteraction: true,
        data: { link: '', kind: 'azan', playAzan: true, shownAt: Date.now() },
      });
      return;
    }
  }

  // یادآوریِ «وقت نماز» ۲۰ دقیقه بعد از هر اذان (به‌جز مغرب) — همان لایهٔ یدکی،
  // فقط برای وقتی که اپ کاملاً بسته باشد و Periodic Background Sync دیر بیدار کند.
  const lastShownPrayerTimeId = (await idbGet('lastBgPrayerTimeShown')) || '';
  for (const p of schedule.prayers) {
    if (p.key === 'maghrib') continue; // بلافاصله بعد از اذان مغرب وقت نماز است، یادآوری لازم نیست
    const azanTime = new Date(p.timeIso).getTime();
    if (isNaN(azanTime)) continue;
    const reminderTime = azanTime + PRAYER_TIME_REMINDER_MINUTES * 60000;
    const diffMinutes = (now - reminderTime) / 60000;
    const uniqueId = p.key + '_' + new Date(p.timeIso).toDateString();
    if (diffMinutes >= 0 && diffMinutes < BG_AZAN_WINDOW_MINUTES && lastShownPrayerTimeId !== uniqueId) {
      await idbSet('lastBgPrayerTimeShown', uniqueId);
      await closeAzanNotifications(false);
      await self.registration.showNotification(schedule.brandName || 'عارفان جام', {
        body: 'وقت نماز ' + p.label + ' رسیده است.',
        tag: AZAN_CURRENT_TAG,
        renotify: true,
        timestamp: Date.now(),
        vibrate: [200, 100, 200, 100, 200],
        requireInteraction: true,
        data: { link: '', kind: 'azan', playAzan: false, shownAt: Date.now() },
      });
      return;
    }
  }
}


/* ---------- آلارم آفلاین اذان و یادآوری یادداشت (بدون اینترنت و حتی با اپ بسته) ----------
   سه لایه، از قوی‌ترین به ضعیف‌ترین (همهٔ آن‌ها کاملاً محلی‌اند و اینترنت نمی‌خواهند):
   ۱) Notification Triggers (TimestampTrigger): اگر مرورگر گوشی پشتیبانی کند، همهٔ اذان‌ها،
      یادآوری «وقت نماز» و یادآوری یادداشت‌ها از قبل به خودِ سیستم‌عامل سپرده می‌شوند و
      سر وقت، حتی با اپ بسته و بدون اینترنت، نمایش داده می‌شوند.
   ۲) Periodic Background Sync (کروم/اندروید): سرویس‌ورکر گاهی بیدار می‌شود و اگر وقت
      اذان یا یادآوری رسیده بود، همان لحظه اعلان محلی نشان می‌دهد.
   ۳) خودِ اپ: هر بار باز شود (یا وقتی باز است) طبق روال قبلی صدای اذان/پنجرهٔ یادآوری را
      نشان می‌دهد و زمان‌بندی‌ها را دوباره به سرویس‌ورکر می‌سپارد.
   توجه: نوتیفیکیشنِ زمان‌بندی‌شده فقط اعلان + لرزش است؛ پخش خودِ فایل صوتی اذان با لمس
   اعلان (که اپ را باز می‌کند) انجام می‌شود، چون مرورگرها صدای دلخواه را از پس‌زمینه اجازه نمی‌دهند. */
const SCHED_TAG_PREFIX = 'arefanejam-sched-';
const NOTE_FIRE_WINDOW_HOURS = 24; // یادآوری یادداشتی که تا این مدت گذشته و هنوز نمایش داده نشده، دیرهنگام هم نشان داده شود

function supportsTriggers() {
  try {
    return typeof TimestampTrigger !== 'undefined' && 'showTrigger' in Notification.prototype;
  } catch (e) { return false; }
}

async function saveNotesForBackground(notes) {
  const list = Array.isArray(notes) ? notes.filter((n) => n && n.id && n.reminderAt) : [];
  const fired = (await idbGet('notesFired')) || {};
  // یادداشتی که خودِ اپ آن را نمایش داده، در سرویس‌ورکر هم «انجام‌شده» ثبت شود
  list.forEach((n) => { if (n.reminderFired) fired[n.id] = n.reminderAt; });
  // یادداشت‌های حذف‌شده یا بدون یادآوری از فهرست «انجام‌شده» پاک شوند
  Object.keys(fired).forEach((id) => { if (!list.some((n) => n.id === id)) delete fired[id]; });
  await idbSet('notesFired', fired);
  await idbSet('notes', list);
}

async function markNoteFired(noteId) {
  try {
    const list = (await idbGet('notes')) || [];
    const n = list.find((x) => x.id === noteId);
    if (!n) return;
    const fired = (await idbGet('notesFired')) || {};
    fired[noteId] = n.reminderAt;
    await idbSet('notesFired', fired);
  } catch (e) { /* بی‌اهمیت */ }
}

// اجرای پشت‌سرهم (تا دو زمان‌بندیِ هم‌زمان با هم تداخل نکنند)
let triggerQueue = Promise.resolve();
function rescheduleTriggers() {
  triggerQueue = triggerQueue.then(doRescheduleTriggers).catch(() => {});
  return triggerQueue;
}

async function doRescheduleTriggers() {
  if (!supportsTriggers()) return;
  try {
    // ۱) همهٔ زمان‌بندی‌های آیندهٔ قبلی پاک شود (اذان و یادآوری یادداشت)، تا تغییر مکان/ویرایش/حذف اعمال شود
    const existing = await self.registration.getNotifications({ includeTriggered: true });
    const nowMs = Date.now();
    existing.forEach((n) => {
      const tag = n.tag || '';
      if (tag.indexOf(SCHED_TAG_PREFIX) !== 0 && tag.indexOf(NOTE_TAG_PREFIX) !== 0) return;
      const ts = n.showTrigger && n.showTrigger.timestamp;
      if (ts && ts > nowMs) n.close();
    });

    // ۲) اذان‌ها و یادآوری «وقت نماز»
    const schedule = await idbGet('schedule');
    if (schedule && schedule.enabled && Array.isArray(schedule.prayers)) {
      const brand = schedule.brandName || 'عارفان جام';
      for (const p of schedule.prayers) {
        const t = new Date(p.timeIso).getTime();
        if (isNaN(t)) continue;
        const dayKey = new Date(t).toDateString().replace(/\s+/g, '-');
        if (t > nowMs + 1000) {
          await self.registration.showNotification(brand, {
            body: 'وقت اذان ' + p.label + ' فرا رسیده است. برای پخش اذان لمس کنید.',
            tag: SCHED_TAG_PREFIX + 'azan-' + p.key + '-' + dayKey,
            showTrigger: new TimestampTrigger(t),
            timestamp: t,
            renotify: true,
            requireInteraction: true,
            vibrate: [200, 100, 200, 100, 200],
            data: { link: '', kind: 'azan', playAzan: true, shownAt: t },
          });
        }
        if (p.key !== 'maghrib') {
          const rt = t + PRAYER_TIME_REMINDER_MINUTES * 60000;
          if (rt > nowMs + 1000) {
            await self.registration.showNotification(brand, {
              body: 'وقت نماز ' + p.label + ' رسیده است.',
              tag: SCHED_TAG_PREFIX + 'prayer-' + p.key + '-' + dayKey,
              showTrigger: new TimestampTrigger(rt),
              timestamp: rt,
              renotify: true,
              requireInteraction: true,
              vibrate: [200, 100, 200, 100, 200],
              data: { link: '', kind: 'azan', playAzan: false, shownAt: rt },
            });
          }
        }
      }
    }

    // ۳) یادآوری یادداشت‌ها
    const notes = (await idbGet('notes')) || [];
    const fired = (await idbGet('notesFired')) || {};
    for (const n of notes) {
      if (!n.reminderAt || n.reminderAt <= nowMs + 1000 || fired[n.id] === n.reminderAt) continue;
      await self.registration.showNotification(n.title || 'یادآوری یادداشت', {
        body: n.content || '',
        tag: NOTE_TAG_PREFIX + n.id,
        showTrigger: new TimestampTrigger(n.reminderAt),
        timestamp: n.reminderAt,
        renotify: true,
        requireInteraction: true,
        vibrate: [200, 100, 200, 100, 200],
        data: { isNote: true, noteId: n.id },
      });
    }
  } catch (e) { /* اگر مرورگر این قابلیت را نداشت یا رد کرد، لایه‌های دیگر کار می‌کنند */ }
}

// لایهٔ دوم برای یادداشت‌ها: هر وقت سرویس‌ورکر بیدار شد (Periodic Sync / Push / Sync / پیام اپ)،
// یادآوری‌های سررسیده‌ای که هنوز نمایش داده نشده‌اند را همین‌جا و بدون اینترنت نشان بده.
async function checkBackgroundNotes() {
  try {
    const notes = (await idbGet('notes')) || [];
    if (!notes.length) return;
    const fired = (await idbGet('notesFired')) || {};
    const now = Date.now();
    let changed = false;
    for (const n of notes) {
      if (!n.reminderAt || n.reminderAt > now || fired[n.id] === n.reminderAt) continue;
      if (now - n.reminderAt > NOTE_FIRE_WINDOW_HOURS * 3600000) continue; // خیلی قدیمی؛ خودِ اپ موقع باز شدن نشان می‌دهد
      // اگر Notification Triggers همین اعلان را از قبل نمایش داده، دوباره نشان نده
      const shown = await self.registration.getNotifications({ tag: NOTE_TAG_PREFIX + n.id });
      fired[n.id] = n.reminderAt;
      changed = true;
      if (shown.length) continue;
      await self.registration.showNotification(n.title || 'یادآوری یادداشت', {
        body: n.content || '',
        tag: NOTE_TAG_PREFIX + n.id,
        renotify: true,
        requireInteraction: true,
        vibrate: [200, 100, 200, 100, 200],
        data: { isNote: true, noteId: n.id },
      });
    }
    if (changed) await idbSet('notesFired', fired);
  } catch (e) { /* بی‌اهمیت؛ چک بعدی جبران می‌کند */ }
}
