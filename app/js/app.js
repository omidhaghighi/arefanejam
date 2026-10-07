/* ===================== موتور محاسبهٔ اوقات شرعی (داخلی، بدون وابستگی به سرور خارجی) ===================== */
const DtR = (d) => (d * Math.PI) / 180;
const RtD = (r) => (r * 180) / Math.PI;
const dsin = (d) => Math.sin(DtR(d));
const dcos = (d) => Math.cos(DtR(d));
const dtan = (d) => Math.tan(DtR(d));
const darcsin = (x) => RtD(Math.asin(x));
const darccos = (x) => RtD(Math.acos(Math.max(-1, Math.min(1, x))));
const darctan2 = (y, x) => RtD(Math.atan2(y, x));
const darccot = (x) => RtD(Math.atan(1 / x));
const fixAngle = (a) => { a = a % 360; return a < 0 ? a + 360 : a; };
const fixHour = (a) => { a = a % 24; return a < 0 ? a + 24 : a; };

function julianDate(year, month, day) {
  if (month <= 2) { year -= 1; month += 12; }
  const A = Math.floor(year / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + B - 1524.5;
}

function sunPosition(jd) {
  const D = jd - 2451545.0;
  const g = fixAngle(357.529 + 0.98560028 * D);
  const q = fixAngle(280.459 + 0.98564736 * D);
  const L = fixAngle(q + 1.915 * dsin(g) + 0.020 * dsin(2 * g));
  const e = 23.439 - 0.00000036 * D;
  const RA = darctan2(dcos(e) * dsin(L), dcos(L)) / 15;
  const eqt = q / 15 - fixHour(RA);
  const decl = darcsin(dsin(e) * dsin(L));
  return { declination: decl, equation: eqt };
}

const CALC_METHODS = {
  MuslimWorldLeague:     { fajr: 18,   isha: 17 },
  Egyptian:              { fajr: 19.5, isha: 17.5 },
  Karachi:               { fajr: 18,   isha: 18 },
  UmmAlQura:             { fajr: 18.5, ishaInterval: 90 },
  MoonsightingCommittee: { fajr: 18,   isha: 18 },
  NorthAmerica:          { fajr: 15,   isha: 15 },
};

/* ===== ساعت ثابت ایران (یکسان‌سازی اوقات در همهٔ گوشی‌ها) =====
   ایران از ۱۴۰۱ ساعت تابستانی ندارد و همیشه UTC+3:30 است. قبلاً اوقات با «منطقهٔ زمانی خود گوشی» حساب می‌شد؛
   پس گوشی‌ای که منطقهٔ زمانی‌اش اشتباه بود یا اطلاعات منطقه‌ای قدیمی داشت (و هنوز ساعت تابستانی ایران را اعمال می‌کرد)
   یک ساعت (یا نیم‌ساعت) متفاوت نشان می‌داد و اذان در لحظهٔ دیگری پخش می‌شد.
   وقتی موقعیت داخل ایران باشد، همهٔ زمان‌ها با UTC+3:30 ثابت ساخته و نمایش داده می‌شوند. */
const IRAN_TZ_MIN = 210;
function isIranCoords(lat, lng) {
  lat = Number(lat); lng = Number(lng);
  if (!isFinite(lat) || !isFinite(lng)) return false;
  if (lat < 25 || lat > 39.9) return false;
  const east = lat >= 30.8 ? 61.3 : 63.4;
  if (lng < 44 || lng > east) return false;
  const cities = window.IRAN_CITIES || [];
  if (!cities.length) return true;
  for (let i = 0; i < cities.length; i++) {
    const dl = cities[i].lat - lat, dg = cities[i].lng - lng;
    if (dl * dl + dg * dg <= 1.2 * 1.2) return true; // حدود ۱۲۰ کیلومتر از یکی از شهرهای ایران
  }
  return false;
}
function iranFixedNow() {
  try { return !!(state && state.coords && isIranCoords(state.coords.lat, state.coords.lng)); } catch (e) { return false; }
}
// روز میلادی (سال، ماه، روز) یک لحظه؛ در حالت ثابت به وقت ایران، وگرنه به وقت گوشی
function prayerDayParts(date, fixed) {
  if (fixed) { const t = new Date(date.getTime() + IRAN_TZ_MIN * 60000); return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()]; }
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()];
}
// لحظهٔ «ساعت hh:mm» همان روزِ date (به وقت ایران در حالت ثابت، وگرنه به وقت گوشی)
function prayerClockInstant(date, h, m, fixed) {
  if (fixed) { const [Y, M, D] = prayerDayParts(date, true); return new Date(Date.UTC(Y, M - 1, D, h, m, 0, 0) - IRAN_TZ_MIN * 60000); }
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate()); d.setHours(h, m, 0, 0); return d;
}
// روزِ i‌ام بعد از امروز (برای فهرست ۳۰ روزهٔ اذان)
function prayerDayAhead(i) {
  const base = new Date();
  if (iranFixedNow()) return new Date(base.getTime() + i * 86400000);
  const d = new Date(base); d.setDate(d.getDate() + i); return d;
}

function computePrayerTimesLocal(lat, lng, date, methodKey, asrFactor, offsets) {
  offsets = offsets || {};
  const method = CALC_METHODS[methodKey] || CALC_METHODS.MoonsightingCommittee;
  const fixedTz = isIranCoords(lat, lng);
  const tzMin = fixedTz ? IRAN_TZ_MIN : -date.getTimezoneOffset();
  const timezone = tzMin / 60;
  const [dY, dM, dD] = prayerDayParts(date, fixedTz);
  const jd = julianDate(dY, dM, dD) - lng / (15 * 24);
  const sp = sunPosition(jd + 0.5);
  const decl = sp.declination;
  const eqt = sp.equation;
  const dhuhrUTC = 12 - eqt - lng / 15;

  function hourAngle(angle) {
    const num = -dsin(angle) - dsin(decl) * dsin(lat);
    const den = dcos(decl) * dcos(lat);
    return darccos(num / den) / 15;
  }
  function asrHourAngle(factor) {
    const angle = -darccot(factor + dtan(Math.abs(lat - decl)));
    return hourAngle(angle);
  }

  const sunriseUTC = dhuhrUTC - hourAngle(0.833);
  const maghribUTC = dhuhrUTC + hourAngle(0.833);
  const fajrUTC = dhuhrUTC - hourAngle(method.fajr);
  const ishaUTC = method.ishaInterval ? maghribUTC + method.ishaInterval / 60 : dhuhrUTC + hourAngle(method.isha);
  const asrUTC = dhuhrUTC + asrHourAngle(asrFactor);

  function toLocalDate(utcHour, offsetMinutes) {
    const h = fixHour(utcHour + timezone + (offsetMinutes || 0) / 60);
    if (fixedTz) return new Date(Date.UTC(dY, dM - 1, dD, 0, 0, 0, 0) + (Math.round(h * 60) - tzMin) * 60000);
    const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    result.setHours(0, 0, 0, 0);
    result.setMinutes(Math.round(h * 60));
    return result;
  }

  return {
    fajr: toLocalDate(fajrUTC, offsets.fajr),
    sunrise: toLocalDate(sunriseUTC, offsets.sunrise),
    dhuhr: toLocalDate(dhuhrUTC, offsets.dhuhr),
    asr: toLocalDate(asrUTC, offsets.asr),
    // غروب آفتاب (نجومی) و مغرب (شرعی) از یک لحظه محاسبه می‌شوند اما هرکدام تنظیم دستی جداگانه دارند
    sunset: toLocalDate(maghribUTC, offsets.sunset),
    maghrib: toLocalDate(maghribUTC, offsets.maghrib),
    isha: toLocalDate(ishaUTC, offsets.isha),
  };
}

/* ===================== تقویم‌ها (شمسی/میلادی/قمری) - محاسبه مستقل، بدون وابستگی به ICU مرورگر ===================== */
function gregorianToJalali(gy, gm, gd) {
  const g_days_in_month = [31,28,31,30,31,30,31,31,30,31,30,31];
  let gy2 = (gm > 2) ? (gy + 1) : gy;
  let days = 355666 + (365 * gy) + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) + Math.floor((gy2 + 399) / 400) + gd + g_days_in_month.slice(0, gm - 1).reduce((a,b)=>a+b,0);
  let jy = -1595 + (33 * Math.floor(days / 12053));
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) { jy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
  let jm, jd;
  if (days < 186) { jm = 1 + Math.floor(days / 31); jd = 1 + (days % 31); }
  else { jm = 7 + Math.floor((days - 186) / 30); jd = 1 + ((days - 186) % 30); }
  return [jy, jm, jd];
}

function julianDayFromGregorian(gy, gm, gd) {
  const a = Math.floor((14 - gm) / 12);
  const y = gy + 4800 - a;
  const m = gm + 12 * a - 3;
  return gd + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
}

function jalaliToGregorian(jy, jm, jd) {
  jy += 1595;
  let days = -355668 + (365 * jy) + (Math.floor(jy / 33) * 8) + Math.floor(((jy % 33) + 3) / 4) + jd + ((jm < 7) ? (jm - 1) * 31 : ((jm - 7) * 30) + 186);
  let gy = 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * Math.floor(--days / 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) { gy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
  let gd = days + 1;
  const isLeap = (gy % 4 === 0 && gy % 100 !== 0) || (gy % 400 === 0);
  const sal_a = [0, 31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm;
  for (gm = 1; gm <= 12; gm++) { if (gd <= sal_a[gm]) break; gd -= sal_a[gm]; }
  return [gy, gm, gd];
}

function islamicFromJulianDay(jdInput) {
  const jd = Math.floor(jdInput) + 0.5;
  const islamicEpoch = 1948439.5;
  let l = jd - islamicEpoch + 10632;
  let n = Math.floor((l - 1) / 10631);
  l = l - 10631 * n + 354;
  let j = (Math.floor((10985 - l) / 5316)) * (Math.floor((50 * l) / 17719)) + (Math.floor(l / 5670)) * (Math.floor((43 * l) / 15238));
  l = l - (Math.floor((30 - j) / 15)) * (Math.floor((17719 * j) / 50)) - (Math.floor(j / 16)) * (Math.floor((15238 * j) / 43)) + 29;
  const month = Math.floor((24 * l) / 709);
  const day = l - Math.floor((709 * month) / 24);
  const year = 30 * n + j - 30;
  return [year, month, day];
}

const JALALI_MONTHS = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
const HIJRI_MONTHS = ['محرم','صفر','ربیع‌الاول','ربیع‌الثانی','جمادی‌الاول','جمادی‌الثانی','رجب','شعبان','رمضان','شوال','ذی‌القعده','ذی‌الحجه'];
const GREGORIAN_MONTHS = ['ژانویه','فوریه','مارس','آوریل','مه','ژوئن','ژوئیه','اوت','سپتامبر','اکتبر','نوامبر','دسامبر'];
const WEEKDAYS_FA = ['یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه','شنبه'];

// «الان» به وقت ایران (برای تاریخ‌های نمایش‌داده‌شده): گوشی با منطقهٔ زمانی اشتباه هم تاریخ/روز هفتهٔ درست را نشان می‌دهد.
// خروجی یک Date است که getHours/getDate محلی‌اش همان ساعت و روز ایران را می‌دهد (فقط برای نمایش، نه برای زمان‌بندی).
function iranWallNow() {
  const n = new Date();
  try {
    if (typeof iranFixedNow === 'function' && iranFixedNow()) {
      return new Date(n.getTime() + (IRAN_TZ_MIN + n.getTimezoneOffset()) * 60000);
    }
  } catch (e) {}
  return n;
}
function getCalendarStrings(date) {
  const [jy, jm, jd] = gregorianToJalali(date.getFullYear(), date.getMonth() + 1, date.getDate());
  const [hy, hm, hd] = islamicFromJulianDay(julianDayFromGregorian(date.getFullYear(), date.getMonth() + 1, date.getDate()));
  const weekday = WEEKDAYS_FA[date.getDay()];
  return {
    jalali: `${weekday} ${toPersianDigits(jd)} ${JALALI_MONTHS[jm - 1]} ${toPersianDigits(jy)}`,
    gregorian: `${weekday} ${toPersianDigits(date.getDate())} ${GREGORIAN_MONTHS[date.getMonth()]} ${toPersianDigits(date.getFullYear())}`,
    hijri: `${weekday} ${toPersianDigits(hd)} ${HIJRI_MONTHS[hm - 1]} ${toPersianDigits(hy)}`,
    parts: { weekday, day: toPersianDigits(jd), month: JALALI_MONTHS[jm - 1], year: toPersianDigits(jy) },
  };
}

/* ===================== عارفان جام - منطق اصلی اپلیکیشن ===================== */

const DEFAULT_API_URL = 'https://arefanejam.com/wp-json/arefanejam/v1';
const KAABA = { lat: 21.4225, lng: 39.8262 };

// وضعیت قبله‌نما: همین‌جا (بالای فایل) تعریف می‌شود تا هر تابعی در هر زمانی بدون خطا از آن استفاده کند
let qiblaBearing = null;            // زاویهٔ قبله از شمال حقیقی (فقط وقتی موقعیت مشخص است)
let qiblaListenerAttached = false;
let motionPermissionGranted = false; // (قبلاً تعریف نشده بود و قبله‌نما را از کار انداخته بود)
let calibrationFlipped = localStorage.getItem('arefanejam_qibla_flip') === '1';
let qiblaDeclination = 0;           // انحراف مغناطیسی (درجه، شرقی مثبت): شمال مغناطیسی ← شمال حقیقی
let qiblaDeclinationKey = '';
let qbHeading = null;               // جهت صاف‌شدهٔ گوشی (درجه، پیوسته)
let qbLastHeadingTs = 0;
let qbAligned = false;
let qbAcquiring = false;
let qbPromptKind = '';
let qbPermAsked = false;
let gotAbsoluteOrientation = false;
let gotWebkitCompass = false;
let azUpcoming = null;              // اذان بعدی برای صحنهٔ سه‌بعدی تب اذان (شمارش معکوس زنده)
let qbMapKey = '';                  // کلید آخرین نقشهٔ کشیده‌شده (مختصات + اندازه) تا بی‌دلیل دوباره کشیده نشود
let qbMapTilesOk = 0, qbMapTilesBad = 0;
const NOTES_STORAGE_KEY = 'arefanejam_local_notes';

const state = {
  apiUrl: localStorage.getItem('arefanejam_api_url') || DEFAULT_API_URL,
  settings: null,
  coords: null,
  editingNoteId: null,
  manualCity: null,
};

function toPersianDigits(str) {
  const fa = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
  return String(str).replace(/[0-9]/g, (d) => fa[d]);
}
function formatTime(date) {
  if (iranFixedNow()) {
    const t = new Date(date.getTime() + IRAN_TZ_MIN * 60000);
    return toPersianDigits(String(t.getUTCHours()).padStart(2, '0') + ':' + String(t.getUTCMinutes()).padStart(2, '0'));
  }
  return toPersianDigits(date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
}
// آدرس عکس‌ها را https می‌کند (اپ روی https اجرا می‌شود و عکس http توسط وب‌ویو بلاک می‌شود)
function secureUrl(u) {
  if (!u || typeof u !== 'string') return u || '';
  return u.replace(/^http:\/\//i, 'https://');
}
// پاسخ‌های API از کش HTTP گوشی نیایند تا تغییرات پیشخوان به همه برسد.
// settings / charity / food-items عمداً بدون پارامتر اضافه می‌مانند چون سرویس‌ورکر برای حالت آفلاین با همین آدرس کش می‌کند.
function apiFetch(path, options = {}) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
  const isGet = !options.method || String(options.method).toUpperCase() === 'GET';
  const basePath = String(path).split('?')[0];
  if (isGet && !options.cache) options = Object.assign({}, options, { cache: 'no-store' });
  if (isGet && !/^\/(settings|charity|food-items)(\?|$)/.test(path)) {
    path += (path.indexOf('?') === -1 ? '?' : '&') + '_t=' + Date.now();
  }
  const cacheKey = isGet ? apiCacheKey(basePath) : '';
  // مهلت ۲۰ ثانیه برای درخواست‌های خواندنی: اینترنتِ «وصل ولی بی‌داده/خیلی کند» دیگر اپ را بی‌پایان منتظر نگه نمی‌دارد؛
  // بعد از مهلت، همان آخرین نسخهٔ ذخیره‌شدهٔ گوشی (اگر باشد) نمایش داده می‌شود.
  let toTimer = null;
  if (isGet && !options.signal && typeof AbortController !== 'undefined') {
    const ac = new AbortController();
    const hasCachedCopy = !!(cacheKey && apiCacheRead(cacheKey) !== null);
    toTimer = setTimeout(() => { try { ac.abort(); } catch (e) {} }, hasCachedCopy ? 6000 : 20000);
    options = Object.assign({}, options, { signal: ac.signal });
  }
  return fetch(state.apiUrl.replace(/\/$/, '') + path, Object.assign({}, options, { headers }))
    .then(async (res) => {
      if (toTimer) { clearTimeout(toTimer); toTimer = null; }
      let parsed = true;
      const data = await res.json().catch(() => { parsed = false; return {}; });
      if (res.status >= 500 && cacheKey) {
        const old = apiCacheRead(cacheKey);
        if (old !== null) return old; // خطای سرور: آخرین نسخهٔ سالم
      }
      if (!res.ok) { const he = new Error(data.message || 'خطا در ارتباط با سرور'); he.httpError = true; throw he; }
      if (cacheKey && parsed) {
        apiCacheWrite(cacheKey, data);
        if (/^\/(mokatib\/|shariq\/settings)/.test(basePath)) setTimeout(() => { prefetchSiteImages(collectImageUrls(data)); }, 1500);
        else if (basePath === '/activities') setTimeout(() => { prefetchSiteImages(actCollectImages(data)); }, 1500);
      }
      return data;
    })
    .catch((err) => {
      if (toTimer) { clearTimeout(toTimer); toTimer = null; }
      // بدون اینترنت / قطع ارتباط: آخرین نسخهٔ ذخیره‌شدهٔ همین اطلاعات از حافظهٔ گوشی (خطای ۴xx سرور مستثناست)
      if (cacheKey && !(err && err.httpError)) {
        const old = apiCacheRead(cacheKey);
        if (old !== null) return old;
      }
      throw err;
    });
}

/* ---------- ذخیرهٔ آفلاینِ اطلاعات عمومی پیشخوان ----------
 * هر بار که اطلاعات با موفقیت از سایت گرفته شود، در حافظهٔ گوشی می‌ماند و اگر بعداً اینترنت نبود
 * (یا سرور خطا داد) همان آخرین نسخه نمایش داده می‌شود. فقط مسیرهای عمومیِ زیر؛ مسیرهای شخصی/ورود نه. */
const API_OFFLINE_CACHE_RE = /^\/(azan-exceptions|books|daily-deeds|dhikrs|events|gallery|mokatib\/icon|mokatib\/public-tree|mokatib\/slider|news|ramadan|hamburger-menu|social-links|theme|shariq\/settings|khatm\/settings|feedback\/settings|zakat|activities)$/;
function apiCacheKey(basePath) {
  return API_OFFLINE_CACHE_RE.test(basePath) ? ('arefanejam_api_cache:' + basePath) : '';
}
function apiCacheRead(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const o = JSON.parse(raw);
    return (o && Object.prototype.hasOwnProperty.call(o, 'data')) ? o.data : null;
  } catch (e) { return null; }
}
function apiCacheWrite(key, data) {
  try {
    const raw = JSON.stringify({ t: Date.now(), data: data });
    if (raw.length > 1500000) return; // خیلی بزرگ: حافظهٔ محدود localStorage پر نشود
    localStorage.setItem(key, raw);
  } catch (e) { /* حافظه پر بود؛ مهم نیست */ }
}

/* ---------- نمایش فوریِ آخرین نسخهٔ ذخیره‌شده + تازه‌سازی بی‌صدا (Stale-While-Revalidate) ----------
 * اول همان لحظه آخرین اطلاعاتِ ذخیره‌شدهٔ گوشی نمایش داده می‌شود (بدون انتظار برای اینترنت)،
 * بعد اطلاعات تازه از سایت گرفته می‌شود و فقط اگر با نسخهٔ نمایش‌داده‌شده فرق داشت، دوباره نمایش داده می‌شود.
 * اگر هیچ نسخهٔ ذخیره‌شده‌ای نبود (اولین بار)، مثل قبل منتظر پاسخ سایت می‌ماند. */
function apiSWR(path, apply, options) {
  const basePath = String(path).split('?')[0];
  const key = apiCacheKey(basePath);
  let shown = null;
  const cached = key ? apiCacheRead(key) : null;
  if (cached !== null) {
    try { apply(cached); shown = JSON.stringify(cached); } catch (e) { shown = null; }
  }
  return apiFetch(path, options).then((fresh) => {
    let str = null;
    try { str = JSON.stringify(fresh); } catch (e) {}
    if (shown === null || str === null || str !== shown) apply(fresh);
    return fresh;
  }).catch((err) => {
    if (shown === null) throw err; // چیزی برای نمایش نداشتیم: خطا به صدا زننده برسد
    return cached;                 // نسخهٔ ذخیره‌شده همین حالا نمایش داده شده؛ خطای شبکه مهم نیست
  });
}

/* ---------- ذخیرهٔ آفلاین عکس‌های پیشخوان ---------- */
function collectImageUrls(obj) {
  const out = [];
  (function walk(v, depth) {
    if (out.length >= 60 || depth > 8 || v == null) return;
    if (typeof v === 'string') {
      if (/^https?:\/\/\S+\.(png|jpe?g|gif|webp|svg)(\?\S*)?$/i.test(v)) out.push(v);
    } else if (Array.isArray(v)) { v.forEach((x) => walk(x, depth + 1)); }
    else if (typeof v === 'object') { Object.keys(v).forEach((k) => walk(v[k], depth + 1)); }
  })(obj, 0);
  return out;
}
let siteImagePrefetching = false;
async function prefetchSiteImages(urls) {
  if (!window.caches || !Array.isArray(urls) || !urls.length || siteImagePrefetching) return;
  if (navigator.onLine === false) return;
  siteImagePrefetching = true;
  try {
    const list = Array.from(new Set(urls.map((u) => secureUrl(u)).filter(Boolean))).slice(0, 40);
    const cache = await caches.open(SITE_MEDIA_CACHE_NAME);
    for (const u of list) {
      try {
        if (await cache.match(u)) continue;
        let res;
        try { res = await fetch(u, { mode: 'cors' }); if (!res.ok) throw new Error('bad'); }
        catch (e1) { res = await fetch(u, { mode: 'no-cors' }); } // سرور هدر CORS نداد؛ پاسخ مبهم برای نمایش عکس کافی است
        if (res && (res.ok || res.type === 'opaque')) await cache.put(u, res);
      } catch (e2) { /* این عکس ذخیره نشد؛ بقیه ادامه پیدا کنند */ }
    }
  } catch (e) { /* کش در دسترس نبود */ }
  siteImagePrefetching = false;
}

/* ---------- ناوبری تب‌ها (با پشتیبانی از برگشت دقیق و ماندگاری هنگام رفرش) ---------- */
let currentTab = sessionStorage.getItem('arefanejam_current_tab') || 'home';
let navHistory = JSON.parse(sessionStorage.getItem('arefanejam_nav_history') || '[]');

function switchToTab(tabName, opts) {
  opts = opts || {};
  // اگر همین الان (قبل از تعویض) داخل صفحهٔ خواندنِ یک سوره بودیم و داریم از آن خارج می‌شویم،
  // شمارهٔ همان سوره را نگه می‌داریم تا بعد از تعویض تب، پاپ‌آپ «تا اینجا خوانده‌اید/کامل شد»
  // را برایش بررسی کنیم. اگر مقصد هم دوباره «quran-reader» باشد (مثلاً ادامهٔ خودکار به سورهٔ
  // بعد در پخش پیوسته) این پاپ‌آپ نمایش داده نمی‌شود تا وسط پخش پیوسته مزاحم نشود.
  const leavingSurahNumber = (typeof currentSurahNumber !== 'undefined' && currentTab === 'quran-reader' && currentSurahNumber) ? currentSurahNumber : null;
  if (opts.push && currentTab !== tabName) navHistory.push(currentTab);
  currentTab = tabName;
  if (opts.push && !opts.fromPopstate) {
    try { history.pushState({ arefanejamTab: tabName }, '', location.pathname + location.search); } catch (e) {}
  }
  sessionStorage.setItem('arefanejam_current_tab', currentTab);
  sessionStorage.setItem('arefanejam_nav_history', JSON.stringify(navHistory));

  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tabName));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + tabName));

  if (tabName !== 'quran-reader') disconnectQuranReadingTracker();
  if (leavingSurahNumber && tabName !== 'quran-reader') maybeShowQuranSurahExitPopup(leavingSurahNumber);
  if (tabName === 'lesson') loadVerseOfDay();
  if (tabName === 'about') renderAboutPage();
  if (tabName === 'qibla') autoStartQibla(); else qbStopSensors();
  if (tabName === 'quran-list') onQuranListOpened();
  if (tabName === 'quran-juz') renderJuzList();
  if (tabName === 'quran-bookmarks') renderBookmarksPage();
  if (tabName === 'hifz-progress') loadHifzProgress();
  if (tabName === 'prayer-stats') renderWeeklyPrayerStats();
  if (tabName === 'prayer-checklist') renderPrayerChecklist();
  if (tabName === 'daily-deeds') openDailyDeeds();
  if (tabName === 'quran-report') renderQuranReportTab();
  if (tabName === 'date-converter') populateConverterSelects();
  if (tabName === 'zakat-calc') { loadZakatExtra(); renderZakatCharityCards(); if (navigator.onLine) loadCharitySettings(); }
  if (tabName === 'sajdah-list') renderSajdahList();
  if (tabName === 'news-list') loadNewsList();
  if (tabName === 'social') loadSocialLinks();
  if (tabName === 'gallery') loadGallery();
  if (tabName === 'books') loadBooks();
  if (tabName === 'shariq') loadShariqCategories();
  if (tabName === 'shariq-mine') loadShariqMine();
  if (tabName === 'khatm') loadKhatmList();
  if (tabName === 'khatm-mine') loadKhatmMine();
  if (tabName === 'khatm-view') loadKhatmView();
  if (tabName === 'feedback') loadFeedbackMain();
  if (tabName === 'feedback-view') loadFbView();
  if (tabName === 'activities') actOnTabOpen(); else actLeaveTab();
  if (tabName !== 'game-ayah') gaStopTimer();
  if (tabName === 'game-ayah') gaOpen();
}

document.querySelectorAll('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => { navHistory = []; switchToTab(btn.dataset.tab); });
});
document.querySelectorAll('.menu-tile[data-goto]').forEach((tile) => {
  tile.addEventListener('click', () => switchToTab(tile.dataset.goto, { push: true }));
});
function goBackInApp() {
  const prev = navHistory.pop() || 'home';
  sessionStorage.setItem('arefanejam_nav_history', JSON.stringify(navHistory));
  switchToTab(prev, { fromPopstate: true });
}
document.getElementById('hero-card').addEventListener('click', () => switchToTab('azan', { push: true }));

/* دکمهٔ برگشتِ خودِ گوشی (سخت‌افزاری/حرکت لبهٔ صفحه) را هم به همین ناوبری وصل می‌کند */
window.addEventListener('popstate', (e) => {
  if (overlayRestoring) { overlayRestoring = false; return; }
  const target = (e.state && e.state.arefanejamOverlay) || 0;
  if (overlayStack.length) {
    // هر برگشت، یک (یا چند) مرحلهٔ پنجره‌ای را می‌بندد؛ تب فعلی دست‌نخورده می‌ماند
    while (overlayStack.length > target) {
      const o = overlayStack.pop();
      try { o.undo(); } catch (err) {}
    }
    return;
  }
  if (target > 0) return; // ورودی تاریخچه‌ای قدیمی از یک پنجره؛ نادیده گرفته می‌شود
  if (hwBackActive) return; // در اپ، برگشت را فقط شنوندهٔ دکمهٔ برگشت گوشی (پایین‌تر) انجام می‌دهد
  if (currentTab !== 'home') { goBackInApp(); return; }
  maybeConfirmExit();
});

/* ---------- دکمهٔ برگشت گوشی (و حرکت لبهٔ صفحه): یک مسیر واحد و قابل‌اعتماد ----------
   قبلاً برگشت فقط به تاریخچهٔ مرورگر (popstate) وابسته بود؛ ولی جابه‌جایی با نوار پایینی، منوی همبرگری و بعضی
   پنجره‌ها ورودی تاریخچه نمی‌ساختند و اندروید گاهی کل اپ را می‌بست. حالا در اپ، رویداد backButton کاپاسیتور
   مستقیم به handleHardwareBack می‌رسد و هر بار دقیقاً «یک مرحله» برمی‌گردد، به این ترتیب:
   ۱) پرسش خروج ← خروج  ۲) پنجره‌های ثبت‌شده در تاریخچه (pushOverlay)  ۳) پنجره‌های معمولی (بدون تاریخچه)
   ۴) منوی مصحف  ۵) نمایش تمام‌صفحهٔ گالری  ۶) مرحلهٔ داخل صفحه (بازی، دستهٔ سوالات شرعی)  ۷) تب قبلی ← خانه
   ۸) در خانه: پرسش خروج. بدون اینترنت هم دقیقاً همین‌طور کار می‌کند. */
let hwBackActive = false;
const HW_MODAL_CLOSERS = {
  'note-modal': 'note-cancel-btn',
  'shariq-ask-modal': 'shariq-ask-cancel-btn',
  'khatm-new-modal': 'khatm-new-cancel-btn',
  'fb-new-modal': 'fb-new-cancel-btn',
  'quran-invite-modal': 'quran-invite-btn2',
  'quran-surah-progress-modal': 'quran-surah-progress-close',
  'azan-share-choice-modal': 'azan-share-cancel-btn',
  'charity-food-thanks-modal': 'charity-food-thanks-ok',
  'onboarding-location-modal': 'onboarding-location-later-btn',
  'city-modal': 'city-cancel-btn',
  'deeds-popup': 'deeds-popup-later',
  'alarm-modal': 'alarm-ok-btn'
};
function hwBackCloseModal() {
  const open = document.querySelectorAll('.modal:not(.hidden), .deeds-popup:not(.hidden), .alarm-overlay:not(.hidden)');
  if (!open.length) return false;
  const el = open[open.length - 1];
  if (el.id === 'exit-confirm-modal') return false;
  const btnId = HW_MODAL_CLOSERS[el.id];
  const btn = btnId ? document.getElementById(btnId) : null;
  if (btn) { try { btn.click(); } catch (e) {} }
  if (!el.classList.contains('hidden')) el.classList.add('hidden'); // دکمه‌ای نبود یا بسته نشد: همین پنجره بسته شود
  return true;
}
function handleHardwareBack() {
  try {
    const ex = document.getElementById('exit-confirm-modal');
    if (ex && !ex.classList.contains('hidden')) { ex.classList.add('hidden'); exitAppNow(); return; }
    if (overlayStack.length) {
      const before = overlayStack.length;
      try { history.go(-1); } catch (e) {}
      setTimeout(() => {
        if (overlayStack.length >= before) { // رویداد تاریخچه نیامد؛ مرحله را مستقیم ببند
          const o = overlayStack.pop();
          try { o.undo(); } catch (err) {}
        }
      }, 400);
      return;
    }
    if (hwBackCloseModal()) return;
    if (typeof qpMenuIsOpen === 'function' && qpMenuIsOpen()) { qpMenuClose(); return; }
    const lb = document.getElementById('gallery-lightbox');
    if (lb && !lb.classList.contains('hidden')) { closeGalleryLightbox(); return; }
    if (currentTab === 'game-ayah' && typeof gaGame !== 'undefined' && gaGame) { gaOpen(); return; }
    if (currentTab === 'shariq' && shariqState && shariqState.activeCategory != null) {
      document.querySelectorAll('#shariq-cats-row .shariq-chip').forEach((c) => c.classList.remove('active'));
      shariqState.activeCategory = null;
      loadShariqList(null);
      return;
    }
    if (currentTab !== 'home') { goBackInApp(); return; }
    maybeConfirmExit(true);
  } catch (err) {
    try { if (currentTab !== 'home') goBackInApp(); else maybeConfirmExit(true); } catch (e2) {}
  }
}
(function registerHardwareBack() {
  if (window.__arefHwBackReg) return;
  function tryReg() {
    try {
      const P = window.Capacitor && window.Capacitor.Plugins;
      if (!(P && P.App && typeof P.App.addListener === 'function')) return false;
      window.__arefHwBackReg = true;
      const r = P.App.addListener('backButton', function () { handleHardwareBack(); });
      if (r && typeof r.then === 'function') {
        r.then(() => { hwBackActive = true; }).catch(() => { window.__arefHwBackReg = false; });
      } else { hwBackActive = true; }
      return true;
    } catch (e) { window.__arefHwBackReg = false; return false; }
  }
  if (!tryReg()) { setTimeout(tryReg, 1200); setTimeout(tryReg, 4000); setTimeout(tryReg, 10000); }
})();

/* ---------- مراحل پنجره‌ای (پاپ‌آپ‌ها) در تاریخچه ----------
   هر پنجره یا هر مرحلهٔ داخل پنجره (مثلاً ورود به یک زیرمجموعه در چارت) یک ورودی تاریخچه می‌سازد
   تا دکمهٔ برگشت گوشی در هر بار فقط «یک مرحله» به عقب برگردد.
   این مکانیزم کاملاً محلی است (History API) و بدون اینترنت هم دقیقاً همین‌طور کار می‌کند. */
const overlayStack = [];
let overlayRestoring = false;

function pushOverlay(group, undo) {
  try {
    history.pushState({ arefanejamTab: currentTab, arefanejamOverlay: overlayStack.length + 1 }, '', location.pathname + location.search);
  } catch (e) { return false; }
  overlayStack.push({ group, undo });
  return true;
}
// steps: تعداد مراحل برگشت؛ 0 یعنی بستن کامل همهٔ مراحل آن گروه. اگر مرحله‌ای در تاریخچه نبود، fallback مستقیم اجرا می‌شود.
function overlayGo(group, steps, fallback) {
  let n = overlayStack.filter((o) => o.group === group).length;
  if (steps > 0) n = Math.min(n, steps);
  if (n > 0) { try { history.go(-n); return; } catch (e) {} }
  fallback();
}
// اگر صفحه وسط باز بودن یک پنجره رفرش شد، ورودی‌های تاریخچهٔ آن پنجره را کنار می‌گذارد
(function restoreOverlayHistoryOnLoad() {
  const st = history.state;
  if (st && st.arefanejamOverlay > 0) {
    overlayRestoring = true;
    try { history.go(-st.arefanejamOverlay); } catch (e) { overlayRestoring = false; }
    setTimeout(() => { overlayRestoring = false; }, 1500);
  }
})();

/* ---------- پیغام‌های اپ: پنجرهٔ گرافیکی سه‌بعدی + متن قابل‌ویرایش از پیشخوان ----------
   همهٔ alert/confirm های اپ حالا از اینجا می‌گذرند. متن پیش‌فرض هر پیغام در APP_MSG_REG است
   (همان فهرست در app/data/app-messages.json برای پیشخوان هم هست؛ هر دو باید یکی بمانند).
   مدیر در پیشخوان ← «پیغام‌های اپ» متن را عوض می‌کند و از مسیر /settings (فیلد app_messages) می‌رسد.
   جای متغیرها با {name} مشخص می‌شود (مثل {surah} و {reciter}) و هنگام نمایش پر می‌شود. */
const APP_MSG_REG = {
 "surah_reread_confirm": {
  "kind": "confirm",
  "tone": "info",
  "icon": "📖",
  "title": "این سوره خوانده شده است",
  "text": "سورهٔ {surah} را قبلاً به‌طور کامل خوانده‌اید. اگر می‌خواهید مجدداً بخوانید تأیید بزنید.",
  "ok": "تأیید",
  "cancel": "انصراف"
 },
 "audio_surah_dl_confirm": {
  "kind": "confirm",
  "tone": "download",
  "icon": "⬇️",
  "title": "دانلود صوت سوره",
  "text": "صوت سورهٔ {surah} با قرائت {reciter} ({count} آیه) دانلود و روی گوشی ذخیره می‌شود تا دیگر نیازی به دانلود دوباره نباشد. ممکن است از چند مگابایت تا چند ده مگابایت اینترنت مصرف کند. ادامه می‌دهید؟",
  "ok": "دانلود کن",
  "cancel": "انصراف"
 },
 "audio_surah_delete_confirm": {
  "kind": "confirm",
  "tone": "danger",
  "icon": "🗑️",
  "title": "حذف صوت ذخیره‌شده",
  "text": "صوت سورهٔ {surah} با قرائت {reciter} روی گوشی ذخیره است. برای آزاد شدن حافظه حذف شود؟",
  "ok": "حذف شود",
  "cancel": "انصراف"
 },
 "audio_surah_busy_other": {
  "kind": "alert",
  "tone": "warn",
  "icon": "⏳",
  "title": "دانلود در حال انجام",
  "text": "دانلود صوت یک سورهٔ دیگر هنوز در حال انجام است.",
  "ok": "باشه"
 },
 "audio_surah_no_storage": {
  "kind": "alert",
  "tone": "danger",
  "icon": "💾",
  "title": "ذخیره ممکن نیست",
  "text": "این دستگاه امکان ذخیرهٔ صوت را ندارد.",
  "ok": "باشه"
 },
 "audio_surah_list_loading": {
  "kind": "alert",
  "tone": "info",
  "icon": "⌛",
  "title": "کمی صبر کنید",
  "text": "فهرست کامل سوره‌ها هنوز بارگذاری نشده است؛ چند لحظه بعد دوباره امتحان کنید.",
  "ok": "باشه"
 },
 "audio_surah_need_internet": {
  "kind": "alert",
  "tone": "danger",
  "icon": "📡",
  "title": "اینترنت وصل نیست",
  "text": "برای دانلود صوت باید به اینترنت وصل باشید.",
  "ok": "باشه"
 },
 "audio_surah_fail_all": {
  "kind": "alert",
  "tone": "danger",
  "icon": "⚠️",
  "title": "دانلود انجام نشد",
  "text": "دانلود انجام نشد؛ اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.",
  "ok": "باشه"
 },
 "audio_surah_fail_some": {
  "kind": "alert",
  "tone": "warn",
  "icon": "🧩",
  "title": "دانلود ناقص ماند",
  "text": "صوت {failed} آیه دانلود نشد؛ دوباره آیکون را بزنید تا تکمیل شود.",
  "ok": "باشه"
 },
 "audio_surah_cancelled": {
  "kind": "alert",
  "tone": "info",
  "icon": "⏸️",
  "title": "دانلود متوقف شد",
  "text": "دانلود متوقف شد؛ بخش‌های دانلودشده حفظ شده‌اند و با زدن دوباره ادامه پیدا می‌کند.",
  "ok": "باشه"
 },
 "audio_page_confirm": {
  "kind": "confirm",
  "tone": "download",
  "icon": "⬇️",
  "title": "ذخیرهٔ صوت برای آفلاین",
  "text": "صوت {count} آیه دانلود و روی گوشی ذخیره می‌شود و ممکن است چند ده مگابایت اینترنت مصرف کند. ادامه می‌دهید؟",
  "ok": "دانلود کن",
  "cancel": "انصراف"
 },
 "audio_page_busy_other": {
  "kind": "alert",
  "tone": "warn",
  "icon": "⏳",
  "title": "دانلود در حال انجام",
  "text": "دانلود صوت یک بخش دیگر هنوز در حال انجام است.",
  "ok": "باشه"
 },
 "audio_page_no_storage": {
  "kind": "alert",
  "tone": "danger",
  "icon": "💾",
  "title": "ذخیره ممکن نیست",
  "text": "این مرورگر امکان ذخیرهٔ آفلاین را ندارد.",
  "ok": "باشه"
 },
 "audio_page_loading": {
  "kind": "alert",
  "tone": "info",
  "icon": "⌛",
  "title": "کمی صبر کنید",
  "text": "متن هنوز در حال بارگذاری است؛ چند لحظه صبر کنید.",
  "ok": "باشه"
 },
 "audio_page_need_internet": {
  "kind": "alert",
  "tone": "danger",
  "icon": "📡",
  "title": "اینترنت وصل نیست",
  "text": "برای ذخیرهٔ صوت باید به اینترنت وصل باشید. صوت‌های ذخیره‌شده قبلی بدون اینترنت پخش می‌شوند.",
  "ok": "باشه"
 },
 "play_ayah_fail_offline": {
  "kind": "alert",
  "tone": "danger",
  "icon": "📡",
  "title": "اینترنت قطع است",
  "text": "اتصال اینترنت شما قطع است. لطفاً اتصال را بررسی و دوباره تلاش کنید.",
  "ok": "باشه"
 },
 "play_ayah_fail_online": {
  "kind": "alert",
  "tone": "warn",
  "icon": "🔇",
  "title": "پخش ممکن نشد",
  "text": "در حال حاضر امکان پخش صوت این آیه وجود ندارد. لطفاً کمی بعد دوباره تلاش کنید.",
  "ok": "باشه"
 },
 "play_seq_fail_offline": {
  "kind": "alert",
  "tone": "danger",
  "icon": "📡",
  "title": "اینترنت قطع است",
  "text": "اتصال اینترنت شما قطع است. پخش خودکار متوقف شد.",
  "ok": "باشه"
 },
 "play_seq_fail_online": {
  "kind": "alert",
  "tone": "warn",
  "icon": "🔇",
  "title": "پخش ممکن نشد",
  "text": "پخش این آیه با هیچ‌کدام از منابع صوتی ممکن نشد. لطفاً دوباره روی آیه یا دکمهٔ پخش بزنید.",
  "ok": "باشه"
 },
 "play_text_loading": {
  "kind": "alert",
  "tone": "info",
  "icon": "⌛",
  "title": "کمی صبر کنید",
  "text": "متن هنوز در حال بارگذاری است؛ چند لحظه صبر کنید و دوباره روی دکمهٔ پخش بزنید.",
  "ok": "باشه"
 },
 "copy_ayah_done": {
  "kind": "alert",
  "tone": "success",
  "icon": "📋",
  "title": "کپی شد",
  "text": "متن آیه کپی شد.",
  "ok": "باشه"
 },
 "azan_copy_done": {
  "kind": "alert",
  "tone": "success",
  "icon": "📋",
  "title": "کپی شد",
  "text": "اوقات شرعی کپی شد.",
  "ok": "باشه"
 },
 "azan_share_not_ready": {
  "kind": "alert",
  "tone": "info",
  "icon": "📍",
  "title": "موقعیت مشخص نیست",
  "text": "هنوز اوقات شرعی محاسبه نشده؛ موقعیت مکانی را مشخص کنید.",
  "ok": "باشه"
 },
 "note_delete_confirm": {
  "kind": "confirm",
  "tone": "danger",
  "icon": "🗑️",
  "title": "حذف یادداشت",
  "text": "این یادداشت حذف شود؟",
  "ok": "حذف شود",
  "cancel": "انصراف"
 },
 "shariq_ask_sent": {
  "kind": "alert",
  "tone": "success",
  "icon": "📨",
  "title": "سؤال شما ارسال شد",
  "text": "سوال شما ارسال شد. پس از پاسخ‌گویی، پاسخ در بخش «سوالات من» و «سوالات شرعی» نمایش داده می‌شود.",
  "ok": "باشه"
 },
 "khatm_created": {
  "kind": "alert",
  "tone": "success",
  "icon": "🤲",
  "title": "ختم ثبت شد",
  "text": "ختم شما ثبت شد و برای همه نمایش داده می‌شود. هر بخشی که برداشته شود، در «درخواست‌های من» می‌بینید.",
  "ok": "باشه"
 },
 "khatm_has_open": {
  "kind": "alert",
  "tone": "warn",
  "icon": "📖",
  "title": "ختم ناتمام دارید",
  "text": "شما یک ختم ناتمام دارید. تا زمانی که قرآنِ آن کامل خوانده نشود (همهٔ بخش‌ها برداشته و انجام شود) یا آن را نبندید، نمی‌توانید درخواست جدید ثبت کنید.",
  "ok": "باشه"
 },
 "khatm_join_ok": {
  "kind": "alert",
  "tone": "success",
  "icon": "🤲",
  "title": "مشارکت ثبت شد",
  "text": "مشارکت شما ثبت شد. خدا قبول کند 🤲",
  "ok": "باشه"
 },
 "khatm_leave_ok": {
  "kind": "alert",
  "tone": "info",
  "icon": "✔️",
  "title": "مشارکت برداشته شد",
  "text": "مشارکت شما برداشته شد.",
  "ok": "باشه"
 },
 "khatm_conflict": {
  "kind": "alert",
  "tone": "warn",
  "icon": "⚡",
  "title": "بخش از دست رفت",
  "text": "بخش‌هایی که همزمان کس دیگری برداشت، به شما نرسید. لطفاً بخش دیگری انتخاب کنید.",
  "ok": "باشه"
 },
 "khatm_all_taken": {
  "kind": "alert",
  "tone": "info",
  "icon": "✅",
  "title": "ختم پر شد",
  "text": "همهٔ بخش‌های این ختم برداشته شده است.",
  "ok": "باشه"
 },
 "khatm_set_fail": {
  "kind": "alert",
  "tone": "danger",
  "icon": "⚠️",
  "title": "ثبت انجام نشد",
  "text": "ثبت انجام نشد. اینترنت را بررسی کنید و دوباره تلاش کنید.",
  "ok": "باشه"
 },
 "khatm_undo_done_confirm": {
  "kind": "confirm",
  "tone": "question",
  "icon": "❓",
  "title": "برداشتن علامت",
  "text": "علامت «انجام شد» برداشته شود؟",
  "ok": "بله، بردار",
  "cancel": "انصراف"
 },
 "khatm_done_ok": {
  "kind": "alert",
  "tone": "success",
  "icon": "🤲",
  "title": "ثبت شد",
  "text": "ثبت شد. خدا قبول کند 🤲 درخواست‌دهنده می‌بیند که ختم شما انجام شده است.",
  "ok": "باشه"
 },
 "khatm_done_fail": {
  "kind": "alert",
  "tone": "danger",
  "icon": "⚠️",
  "title": "ثبت انجام نشد",
  "text": "ثبت انجام نشد. اینترنت را بررسی کنید و دوباره تلاش کنید.",
  "ok": "باشه"
 },
 "khatm_inquire_ok": {
  "kind": "alert",
  "tone": "success",
  "icon": "🔔",
  "title": "استعلام ارسال شد",
  "text": "استعلام ارسال شد{count_text}. وقتی برداشت‌کننده اپ را باز کند می‌پرسد و با یک لمس جواب می‌دهد؛ جواب را همین‌جا می‌بینید.",
  "ok": "باشه"
 },
 "khatm_inquire_fail": {
  "kind": "alert",
  "tone": "danger",
  "icon": "⚠️",
  "title": "استعلام انجام نشد",
  "text": "استعلام انجام نشد. اینترنت را بررسی کنید و دوباره تلاش کنید.",
  "ok": "باشه"
 },
 "khatm_close_confirm": {
  "kind": "confirm",
  "tone": "question",
  "icon": "❓",
  "title": "بستن درخواست ختم",
  "text": "این درخواست بسته شود؟ دیگر در فهرست عمومی نمایش داده نمی‌شود.",
  "ok": "بله، بسته شود",
  "cancel": "انصراف"
 },
 "khatm_close_fail": {
  "kind": "alert",
  "tone": "danger",
  "icon": "⚠️",
  "title": "بستن انجام نشد",
  "text": "بستن درخواست انجام نشد. دوباره تلاش کنید.",
  "ok": "باشه"
 },
 "battery_ask": {
  "kind": "alert",
  "tone": "warn",
  "icon": "🔋",
  "title": "اجازهٔ اجرا در پس‌زمینه",
  "text": "برای اینکه اذان همیشه سر وقت و حتی با گوشی قفل پخش شود، در پنجرهٔ بعدی لطفاً «اجازه» (Allow) را بزنید.",
  "ok": "باشه"
 },
 "exact_alarm_ask": {
  "kind": "confirm",
  "tone": "warn",
  "icon": "⏰",
  "title": "اجازهٔ آلارم دقیق",
  "text": "برای اینکه اذان و یادآورها دقیقاً سر وقت بیایند، اجازهٔ «آلارم‌ها و یادآورها» باید فعال باشد. تنظیمات باز شود؟",
  "ok": "باز کن",
  "cancel": "فعلاً نه"
 },
 "api_url_saved": {
  "kind": "alert",
  "tone": "success",
  "icon": "✅",
  "title": "ذخیره شد",
  "text": "آدرس ذخیره شد. لطفاً اپ را مجدد باز کنید.",
  "ok": "باشه"
 }
};
function appMsgCfg(key) {
  const base = APP_MSG_REG[key] || { kind: 'alert', tone: 'info', icon: 'ℹ️', title: '', text: '' };
  const ov = ((state.settings || {}).app_messages || {})[key] || {};
  const pick = (a, b) => (typeof a === 'string' && a.trim() !== '') ? a : b;
  return {
    kind: base.kind, tone: base.tone, icon: base.icon,
    title: pick(ov.title, base.title),
    text: pick(ov.text, base.text),
    ok: pick(ov.ok, base.ok || 'باشه'),
    cancel: pick(ov.cancel, base.cancel || 'انصراف'),
  };
}
// «سُورَةُ الأَعْلَى» ← «الأَعْلَى» (تا در متن «سورهٔ {surah}» کلمهٔ سوره دوبار نیاید)
function msgSurahName(n) {
  return String(n || '').replace(/^\s*[\u0633][\u064B-\u065F\u0670]*[\u0648][\u064B-\u065F\u0670]*[\u0631][\u064B-\u065F\u0670]*[\u0629\u0647\u06C0][\u064B-\u065F\u0670]*\s+/, '').trim();
}
// «قاری: علافاسی» ← «علافاسی»
function msgReciterName(n) {
  return String(n || '').replace(/^\s*قاری\s*[:：]?\s*/, '').trim();
}
function appMsgFill(el, tpl, vars) {
  vars = vars || {};
  String(tpl).split(/(\{[A-Za-z_]+\})/).forEach((part) => {
    const m = /^\{([A-Za-z_]+)\}$/.exec(part);
    if (m && Object.prototype.hasOwnProperty.call(vars, m[1])) {
      const b = document.createElement('b');
      b.className = 'adlg-var';
      b.textContent = String(vars[m[1]]);
      el.appendChild(b);
    } else if (part) {
      el.appendChild(document.createTextNode(part));
    }
  });
}
let appDlgChain = Promise.resolve();
function appDialog(key, vars, opts) {
  opts = opts || {};
  const run = () => new Promise((resolve) => {
    const c = appMsgCfg(key);
    const isConfirm = (opts.kind || c.kind) === 'confirm';
    const text = opts.text || c.text || '';
    const ov = document.createElement('div');
    ov.className = 'adlg-overlay';
    ov.innerHTML =
      '<div class="adlg-card" role="dialog" aria-modal="true" data-tone="' + (opts.tone || c.tone) + '">' +
      '<div class="adlg-orb"><span class="adlg-orb-ico"></span></div>' +
      '<h3 class="adlg-title"></h3><div class="adlg-text"></div>' +
      '<div class="adlg-actions"><button type="button" class="adlg-btn adlg-ok"></button>' +
      (isConfirm ? '<button type="button" class="adlg-btn adlg-cancel"></button>' : '') +
      '</div></div>';
    ov.querySelector('.adlg-orb-ico').textContent = opts.icon || c.icon;
    const tEl = ov.querySelector('.adlg-title');
    tEl.textContent = opts.title || c.title || '';
    if (!tEl.textContent) tEl.classList.add('hidden');
    appMsgFill(ov.querySelector('.adlg-text'), text, vars);
    ov.querySelector('.adlg-ok').textContent = c.ok;
    if (isConfirm) ov.querySelector('.adlg-cancel').textContent = c.cancel;
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('is-open'));
    try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) {}

    let res = false, closed = false;
    const finish = () => {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey, true);
      ov.classList.remove('is-open');
      ov.classList.add('is-closing');
      setTimeout(() => { if (ov.parentNode) ov.parentNode.removeChild(ov); }, 220);
      resolve(res);
    };
    // دکمهٔ برگشت گوشی = «انصراف»
    const pushed = pushOverlay('appdlg', finish);
    const close = (v) => { res = v; if (pushed) overlayGo('appdlg', 0, finish); else finish(); };
    function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); close(false); } }
    document.addEventListener('keydown', onKey, true);
    ov.querySelector('.adlg-ok').addEventListener('click', () => close(true));
    if (isConfirm) ov.querySelector('.adlg-cancel').addEventListener('click', () => close(false));
    else ov.addEventListener('click', (e) => { if (e.target === ov) close(true); });
    setTimeout(() => { try { ov.querySelector('.adlg-ok').focus({ preventScroll: true }); } catch (e) {} }, 60);
  });
  appDlgChain = appDlgChain.then(run, run);
  return appDlgChain;
}
// پیغام یک‌دکمه‌ای (برای منتظر ماندن، قبلش await بگذارید)
function appAlert(key, vars, opts) { return appDialog(key, vars, Object.assign({}, opts, { kind: 'alert' })).then(() => undefined); }
// پنجرهٔ تأیید؛ نتیجه true (تأیید) یا false (انصراف/برگشت)
function appConfirm(key, vars, opts) { return appDialog(key, vars, Object.assign({}, opts, { kind: 'confirm' })); }
// خطای سرور (اگر سایت پیام مشخصی داده همان) وگرنه متن پیغامِ ثبت‌شده
function appAlertErr(key, e, vars) {
  return appAlert(key, vars, (e && e.httpError && e.message) ? { text: e.message } : undefined);
}
window.appAlert = appAlert;
window.appConfirm = appConfirm;

/* ---------- تأیید خروج از برنامه ---------- */
let exitGuardPushed = false;
// خروج واقعی از برنامه (اندروید): اول افزونهٔ App کاپاسیتور؛ در نبودش راه‌های جایگزین
function exitAppNow() {
  try {
    const P = window.Capacitor && window.Capacitor.Plugins;
    if (P && P.App && typeof P.App.exitApp === 'function') { P.App.exitApp(); return; }
  } catch (e) {}
  try { if (navigator.app && typeof navigator.app.exitApp === 'function') { navigator.app.exitApp(); return; } } catch (e) {}
  try { history.go(-Math.max(1, history.length - 1)); } catch (e) {}
  try { window.close(); } catch (e) {}
}
function maybeConfirmExit(viaNativeBack) {
  const cfg = state.exitConfirm || {};
  if (cfg.enabled === '0') { exitAppNow(); return; } // مدیر پرسش خروج را خاموش کرده: مستقیم خارج می‌شود
  const mdl = document.getElementById('exit-confirm-modal');
  // اگر پرسش خروج باز است و کاربر دوباره برگشت زد، یعنی واقعاً می‌خواهد خارج شود
  if (mdl && !mdl.classList.contains('hidden')) { mdl.classList.add('hidden'); exitAppNow(); return; }
  if (!viaNativeBack && !hwBackActive) { try { history.pushState({ arefanejamHome: true }, '', location.pathname + location.search); } catch (e) {} }
  document.getElementById('exit-confirm-message').textContent = cfg.text || 'آیا قصد خروج از برنامه را دارید؟';
  document.getElementById('exit-confirm-modal').classList.remove('hidden');
}
document.getElementById('exit-confirm-yes').addEventListener('click', () => {
  document.getElementById('exit-confirm-modal').classList.add('hidden');
  exitAppNow();
});
document.getElementById('exit-confirm-no').addEventListener('click', () => {
  document.getElementById('exit-confirm-modal').classList.add('hidden');
});

/* ---------- تقویم (شمسی/میلادی/قمری) با شبکهٔ کامل ماه ---------- */
let activeCalendar = localStorage.getItem('arefanejam_calendar_type') || 'jalali';
let selectedDate = new Date();
let calendarViewYear, calendarViewMonth;
let calendarEvents = [];

async function loadCalendarEvents() {
  try { calendarEvents = await apiFetch('/events'); renderCalendarWidget(); } catch (e) { calendarEvents = []; }
}
function findEventsForJalaliDate(jy, jm, jd) {
  return calendarEvents.filter((ev) =>
    Number(ev.jalali_month) === jm && Number(ev.jalali_day) === jd &&
    (Number(ev.recurring_yearly) === 1 || Number(ev.jalali_year) === jy)
  );
}
function findEventForJalaliDate(jy, jm, jd) { return findEventsForJalaliDate(jy, jm, jd)[0]; }
function calEsc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function jalaliMonthLength(jy, jm) {
  const [ngy, ngm, ngd] = (jm === 12) ? jalaliToGregorian(jy + 1, 1, 1) : jalaliToGregorian(jy, jm + 1, 1);
  const nextStart = new Date(ngy, ngm - 1, ngd);
  const [tgy, tgm, tgd] = jalaliToGregorian(jy, jm, 1);
  const thisStart = new Date(tgy, tgm - 1, tgd);
  return Math.round((nextStart - thisStart) / 86400000);
}

/* ---------- زمانبندی‌های شخصی کاربر روی تقویم ----------
   کاربر برای هر روز شمسی عنوان/ساعت/توضیح می‌نویسد و می‌تواند ویرایش یا حذفش کند.
   فقط روی خود گوشی (localStorage، کلید arefanejam_my_events) ذخیره می‌شود و آفلاین هم کار می‌کند.
   اگر «تکرار هر سال» روشن باشد (پیش‌فرض)، همین زمانبندی در سال‌های بعد هم در همان روز و ماه نشان داده می‌شود. */
const MYEV_KEY = 'arefanejam_my_events';
let myEvents = [];
let myevEditingId = null;
let myevDeleteArmed = false;
function myevLoad() {
  try {
    const a = JSON.parse(localStorage.getItem(MYEV_KEY) || '[]');
    myEvents = (Array.isArray(a) ? a : []).filter((e) => e && e.id && Number(e.jm) >= 1 && Number(e.jm) <= 12 && Number(e.jd) >= 1 && Number(e.jd) <= 31 && Number(e.jy) > 1000);
  } catch (e) { myEvents = []; }
}
function myevSave() { try { localStorage.setItem(MYEV_KEY, JSON.stringify(myEvents)); } catch (e) {} }
myevLoad();
function myevMatches(ev, jy, jm, jd) {
  const eJy = Number(ev.jy), eJm = Number(ev.jm), eJd = Number(ev.jd);
  if (eJm !== jm) return false;
  if (ev.yearly) { if (jy < eJy) return false; } else if (jy !== eJy) return false;
  if (eJd === jd) return true;
  // ۳۰ اسفند در سالی که ۳۰ اسفند ندارد، روی ۲۹ اسفند نشان داده می‌شود
  return eJm === 12 && eJd === 30 && jd === 29 && jalaliMonthLength(jy, 12) === 29;
}
function findMyEvents(jy, jm, jd) {
  if (!myEvents.length) return [];
  return myEvents.filter((e) => myevMatches(e, jy, jm, jd))
    .sort((a, b) => String(a.time || '99:99').localeCompare(String(b.time || '99:99')));
}
function renderMyEvents(jy, jm, jd) {
  const box = document.getElementById('my-events-block');
  if (!box) return;
  const list = findMyEvents(jy, jm, jd);
  let html = '<div class="myev-head"><b>📌 زمانبندی‌های من</b><button type="button" class="myev-add" data-myev-add="1">＋ افزودن</button></div>';
  if (!list.length) {
    html += '<p class="myev-empty">برای این روز زمانبندی ثبت نکرده‌اید.</p>';
  } else {
    html += '<div class="myev-list">' + list.map((e, i) =>
      '<div class="myev-item" style="--i:' + i + '" data-myev-id="' + calEsc(e.id) + '" role="button">' +
        '<span class="myev-time">' + (e.time ? calEsc(toPersianDigits(e.time)) : '•') + '</span>' +
        '<span class="myev-body"><b>' + calEsc(e.title) + '</b>' +
          (e.note ? '<small>' + calEsc(e.note).replace(/\r?\n/g, '<br>') + '</small>' : '') + '</span>' +
        (e.yearly ? '<span class="myev-rep" title="هر سال تکرار می‌شود">🔁</span>' : '') +
        '<span class="myev-edit" aria-hidden="true">✎</span>' +
      '</div>').join('') + '</div>';
  }
  box.innerHTML = html;
}
function myevFillSelects(jy) {
  const dSel = document.getElementById('myev-day'), mSel = document.getElementById('myev-month'), ySel = document.getElementById('myev-year');
  if (!dSel.options.length) {
    for (let d = 1; d <= 31; d++) dSel.add(new Option(toPersianDigits(d), d));
    JALALI_MONTHS.forEach((n, i) => mSel.add(new Option(n, i + 1)));
  }
  const nowJy = gregorianToJalali(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate())[0];
  const from = Math.min(nowJy - 1, jy), to = Math.max(nowJy + 10, jy);
  ySel.innerHTML = '';
  for (let y = from; y <= to; y++) ySel.add(new Option(toPersianDigits(y), y));
}
function openMyEventModal(id) {
  const ev = id ? myEvents.find((e) => e.id === id) : null;
  myevEditingId = ev ? ev.id : null;
  myevDeleteArmed = false;
  const [sy, sm, sd] = gregorianToJalali(selectedDate.getFullYear(), selectedDate.getMonth() + 1, selectedDate.getDate());
  const jy = ev ? Number(ev.jy) : sy, jm = ev ? Number(ev.jm) : sm, jd = ev ? Number(ev.jd) : sd;
  myevFillSelects(jy);
  document.getElementById('myev-modal-title').textContent = ev ? 'ویرایش زمانبندی' : 'زمانبندی جدید';
  document.getElementById('myev-day').value = jd;
  document.getElementById('myev-month').value = jm;
  document.getElementById('myev-year').value = jy;
  document.getElementById('myev-title').value = ev ? ev.title : '';
  document.getElementById('myev-time').value = ev ? (ev.time || '') : '';
  document.getElementById('myev-note').value = ev ? (ev.note || '') : '';
  document.getElementById('myev-yearly').checked = ev ? !!ev.yearly : true;
  document.getElementById('myev-err').textContent = '';
  const delBtn = document.getElementById('myev-delete-btn');
  delBtn.classList.toggle('hidden', !ev);
  delBtn.textContent = 'حذف';
  document.getElementById('myev-modal').classList.remove('hidden');
  pushOverlay('myev', closeMyEventModal);
  setTimeout(() => { try { if (!ev) document.getElementById('myev-title').focus({ preventScroll: true }); } catch (e) {} }, 80);
}
function closeMyEventModal() {
  document.getElementById('myev-modal').classList.add('hidden');
  myevEditingId = null;
  myevDeleteArmed = false;
}
function myevSaveFromForm() {
  const title = document.getElementById('myev-title').value.replace(/\s+/g, ' ').trim();
  const errEl = document.getElementById('myev-err');
  if (!title) { errEl.textContent = 'لطفاً عنوان زمانبندی را بنویسید.'; document.getElementById('myev-title').focus(); return; }
  const jy = parseInt(document.getElementById('myev-year').value, 10);
  const jm = parseInt(document.getElementById('myev-month').value, 10);
  let jd = parseInt(document.getElementById('myev-day').value, 10);
  const maxD = jm <= 6 ? 31 : 30; // ۳۰ اسفند در سال کبیسه هست؛ در سال‌های دیگر روی ۲۹ اسفند نشان داده می‌شود
  if (jd > maxD) jd = maxD;
  const rec = {
    id: myevEditingId || ('me' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
    jy, jm, jd, title,
    time: document.getElementById('myev-time').value || '',
    note: document.getElementById('myev-note').value.trim(),
    yearly: document.getElementById('myev-yearly').checked,
  };
  const idx = myEvents.findIndex((e) => e.id === rec.id);
  if (idx >= 0) myEvents[idx] = rec; else myEvents.push(rec);
  myevSave();
  const len = jalaliMonthLength(jy, jm);
  const [gy, gm, gd] = jalaliToGregorian(jy, jm, Math.min(jd, len));
  selectedDate = new Date(gy, gm - 1, gd);
  overlayGo('myev', 0, closeMyEventModal);
  renderCalendarWidget();
}
function myevDeleteCurrent() {
  if (!myevEditingId) return;
  const btn = document.getElementById('myev-delete-btn');
  if (!myevDeleteArmed) { // حذف دومرحله‌ای: بار اول فقط هشدار می‌دهد
    myevDeleteArmed = true;
    btn.textContent = 'مطمئنید؟ حذف';
    setTimeout(() => { if (myevDeleteArmed) { myevDeleteArmed = false; btn.textContent = 'حذف'; } }, 3500);
    return;
  }
  myEvents = myEvents.filter((e) => e.id !== myevEditingId);
  myevSave();
  overlayGo('myev', 0, closeMyEventModal);
  renderCalendarWidget();
}
(function setupMyEvents() {
  const box = document.getElementById('my-events-block');
  if (box) box.addEventListener('click', (e) => {
    if (e.target.closest('[data-myev-add]')) { openMyEventModal(null); return; }
    const it = e.target.closest('[data-myev-id]');
    if (it) openMyEventModal(it.getAttribute('data-myev-id'));
  });
  const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
  on('myev-save-btn', myevSaveFromForm);
  on('myev-cancel-btn', () => overlayGo('myev', 0, closeMyEventModal));
  on('myev-delete-btn', myevDeleteCurrent);
  const modal = document.getElementById('myev-modal');
  if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) overlayGo('myev', 0, closeMyEventModal); });
})();

function renderMonthGrid() {
  const grid = document.getElementById('month-grid');
  grid.innerHTML = '';
  document.getElementById('month-label').textContent = JALALI_MONTHS[calendarViewMonth - 1] + ' ' + toPersianDigits(calendarViewYear);

  const [gy1, gm1, gd1] = jalaliToGregorian(calendarViewYear, calendarViewMonth, 1);
  const firstDate = new Date(gy1, gm1 - 1, gd1);
  const leadIndex = (firstDate.getDay() + 1) % 7; // هفته فارسی از شنبه شروع می‌شود
  const monthLen = jalaliMonthLength(calendarViewYear, calendarViewMonth);
  const __iw = iranWallNow();
  const todayJalali = gregorianToJalali(__iw.getFullYear(), __iw.getMonth() + 1, __iw.getDate());

  for (let i = 0; i < leadIndex; i++) {
    const empty = document.createElement('div');
    empty.className = 'month-cell empty';
    grid.appendChild(empty);
  }
  for (let day = 1; day <= monthLen; day++) {
    const [cgy, cgm, cgd] = jalaliToGregorian(calendarViewYear, calendarViewMonth, day);
    const cellDate = new Date(cgy, cgm - 1, cgd);
    const isToday = todayJalali[0] === calendarViewYear && todayJalali[1] === calendarViewMonth && todayJalali[2] === day;
    const isSelected = cellDate.toDateString() === selectedDate.toDateString();
    const isFriday = cellDate.getDay() === 5;
    const evCount = findEventsForJalaliDate(calendarViewYear, calendarViewMonth, day).length;
    const myCount = findMyEvents(calendarViewYear, calendarViewMonth, day).length;
    const hasEvent = evCount > 0;
    const cell = document.createElement('div');
    cell.className = 'month-cell' + (isToday ? ' is-today' : '') + (isSelected ? ' is-selected' : '') + (isFriday && !isSelected ? ' is-friday' : '') + (hasEvent ? ' has-event' : '') + (myCount ? ' has-my' : '');
    const num = document.createElement('span');
    num.className = 'month-cell-num';
    num.textContent = toPersianDigits(day);
    cell.appendChild(num);
    if (hasEvent || myCount) {
      // نقطه‌های مناسبت‌های رسمی (رنگی) + نقطهٔ بنفش برای زمانبندی شخصی کاربر؛ حداکثر ۳ نقطه
      const dots = document.createElement('span');
      dots.className = 'month-cell-dots';
      const offDots = Math.min(evCount, myCount ? 2 : 3);
      dots.innerHTML = '<i></i>'.repeat(offDots) + (myCount ? '<i class="my"></i>' : '');
      cell.appendChild(dots);
    }
    cell.addEventListener('click', () => { selectedDate = cellDate; renderCalendarWidget(); });
    grid.appendChild(cell);
  }
}

function renderCalendarWidget() {
  const [jy, jm, jd] = gregorianToJalali(selectedDate.getFullYear(), selectedDate.getMonth() + 1, selectedDate.getDate());
  calendarViewYear = jy; calendarViewMonth = jm;

  const isToday = selectedDate.toDateString() === new Date().toDateString();
  const todayBtnEl = document.getElementById('calendar-today-btn');
  const todayWasHidden = todayBtnEl.classList.contains('hidden');
  todayBtnEl.classList.toggle('hidden', isToday);
  if (todayWasHidden && !isToday) { // آیکون «برگشت به امروز» با یک حرکت کوتاه ظاهر می‌شود
    todayBtnEl.classList.remove('is-pop'); void todayBtnEl.offsetWidth; todayBtnEl.classList.add('is-pop');
  }
  const strs = getCalendarStrings(selectedDate);
  document.getElementById('calendar-main-date').textContent = strs[activeCalendar];
  const others = ['jalali', 'gregorian', 'hijri'].filter((c) => c !== activeCalendar);
  document.getElementById('calendar-sub-date').textContent = others.map((c) => strs[c]).join(' | ');
  document.querySelectorAll('.cal-tab').forEach((t) => t.classList.toggle('active', t.dataset.cal === activeCalendar));
  renderMonthGrid();

  // کارت بزرگ تاریخ (عدد روز + نام هفته + شمارندهٔ مناسبت‌ها)
  const bigEl = document.getElementById('calendar-day-big');
  if (bigEl) {
    let bigDay, bigMon;
    if (activeCalendar === 'gregorian') { bigDay = selectedDate.getDate(); bigMon = GREGORIAN_MONTHS[selectedDate.getMonth()]; }
    else if (activeCalendar === 'hijri') {
      const hj = islamicFromJulianDay(julianDayFromGregorian(selectedDate.getFullYear(), selectedDate.getMonth() + 1, selectedDate.getDate()));
      bigDay = hj[2]; bigMon = HIJRI_MONTHS[hj[1] - 1];
    } else { bigDay = jd; bigMon = JALALI_MONTHS[jm - 1]; }
    bigEl.innerHTML = '<b>' + toPersianDigits(bigDay) + '</b><small>' + bigMon + '</small>';
    const wdEl = document.getElementById('calendar-weekday');
    if (wdEl) wdEl.textContent = strs.parts.weekday + (isToday ? ' · امروز' : '');
    const hero = document.getElementById('cal-hero');
    if (hero) hero.classList.toggle('is-friday', selectedDate.getDay() === 5);
  }

  const eventCardEl = document.getElementById('calendar-event-card');
  const events = findEventsForJalaliDate(jy, jm, jd);
  const cntEl = document.getElementById('calendar-ev-count');
  if (cntEl) { cntEl.hidden = !events.length; cntEl.textContent = events.length ? toPersianDigits(events.length) + ' مناسبت' : ''; }
  if (events.length) {
    eventCardEl.innerHTML = '<div class="ev-list">' + events.map((event, i) => {
      const img = event.image_url ? secureUrl(event.image_url) : '';
      const okc = (c) => (/^#[0-9a-fA-F]{3,8}$/.test(c || '') ? c : '');
      const evStyle = (okc(event.bg_color) ? 'background:' + okc(event.bg_color) + ';' : '');
      const tStyle = okc(event.title_color) ? ' style="color:' + okc(event.title_color) + '"' : '';
      const pStyle = okc(event.text_color) ? ' style="color:' + okc(event.text_color) + '"' : '';
      return `
      <div class="event-card${img ? ' has-img' : ''}" style="--i:${i};${evStyle}">
        ${img ? `<img src="${calEsc(img)}" alt="" loading="lazy" data-ev-zoom="${calEsc(img)}" data-ev-name="${calEsc(event.title)}">` : '<span class="event-card-ic">✦</span>'}
        <div class="event-card-text">
          <h4${tStyle}>${calEsc(event.title)}</h4>
          ${event.description ? `<p${pStyle}>${calEsc(event.description).replace(/\r?\n/g, '<br>')}</p>` : ''}
        </div>
      </div>`;
    }).join('') + '</div>';
  } else {
    eventCardEl.innerHTML = '';
  }
  renderMyEvents(jy, jm, jd);
}
(function setupCalEventZoom() {
  const el = document.getElementById('calendar-event-card');
  if (!el) return;
  el.addEventListener('click', (e) => {
    const im = e.target.closest('[data-ev-zoom]');
    if (im) openRmzZoom(im.getAttribute('data-ev-zoom'), im.getAttribute('data-ev-name') || '');
  });
})();
document.querySelectorAll('.cal-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    activeCalendar = tab.dataset.cal;
    localStorage.setItem('arefanejam_calendar_type', activeCalendar);
    renderCalendarWidget();
  });
});
document.getElementById('calendar-tools-btn').addEventListener('click', () => switchToTab('date-converter', { push: true }));
document.getElementById('calendar-today-btn').addEventListener('click', () => {
  selectedDate = new Date();
  renderCalendarWidget();
});
// رفتن به ماه قبل/بعد (delta = -1 یا +1). با دکمه‌های ‹ › و با کشیدن انگشت روی تقویم استفاده می‌شود.
function calShiftMonth(delta) {
  let m = calendarViewMonth + delta, y = calendarViewYear;
  if (m < 1) { m = 12; y--; } else if (m > 12) { m = 1; y++; }
  calendarViewMonth = m; calendarViewYear = y;
  const t = new Date();
  const tj = gregorianToJalali(t.getFullYear(), t.getMonth() + 1, t.getDate());
  if (tj[0] === y && tj[1] === m) selectedDate = t; // برگشت به ماه جاری = انتخاب خودِ امروز
  else { const [gy, gm, gd] = jalaliToGregorian(y, m, 1); selectedDate = new Date(gy, gm - 1, gd); }
  renderCalendarWidget();
  const grid = document.getElementById('month-grid');
  if (grid) { // حرکت کوتاه ماه تازه از سمت درست وارد می‌شود
    grid.classList.remove('slide-next', 'slide-prev'); void grid.offsetWidth;
    grid.classList.add(delta > 0 ? 'slide-next' : 'slide-prev');
  }
}
document.getElementById('calendar-today-btn').addEventListener('click', () => {
  selectedDate = new Date();
  renderCalendarWidget();
  const grid = document.getElementById('month-grid');
  if (grid) { grid.classList.remove('slide-next', 'slide-prev'); void grid.offsetWidth; grid.classList.add('slide-prev'); }
});
document.getElementById('month-prev-btn').addEventListener('click', () => calShiftMonth(-1));
document.getElementById('month-next-btn').addEventListener('click', () => calShiftMonth(1));
// کشیدن انگشت روی تقویم: چون اپ راست‌به‌چپ است، کشیدن به «راست» = ماه بعد و کشیدن به «چپ» = ماه قبل
// (هم‌جهت با فلش ‹ که ماه بعد را نشان می‌دهد). برای وارونه‌کردن جهت، CAL_SWIPE_RIGHT_IS_NEXT را false کنید.
const CAL_SWIPE_RIGHT_IS_NEXT = true;
(function setupCalendarSwipe() {
  const zones = [document.getElementById('month-grid'), document.querySelector('.month-grid-header')].filter(Boolean);
  let sx = null, sy = null, st = 0;
  zones.forEach((z) => {
    z.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) { sx = null; return; }
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now();
    }, { passive: true });
    z.addEventListener('touchcancel', () => { sx = null; }, { passive: true });
    z.addEventListener('touchend', (e) => {
      if (sx === null) return;
      const dx = e.changedTouches[0].clientX - sx;
      const dy = e.changedTouches[0].clientY - sy;
      const dt = Date.now() - st;
      sx = null; sy = null;
      if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy) * 1.4 || dt > 900) return; // لمس ساده یا اسکرول عمودی نیست
      const goNext = CAL_SWIPE_RIGHT_IS_NEXT ? dx > 0 : dx < 0;
      calShiftMonth(goNext ? 1 : -1);
    }, { passive: true });
  });
})();
renderCalendarWidget();

/* ---------- تنظیمات عمومی از سایت ---------- */
// این تنظیمات (از جمله azan_audio_url) هر بار با موفقیت دریافت شوند، در گوشی
// ذخیره می‌شوند تا اگر بعداً هنگام باز شدن اپ اینترنت نبود، همچنان محاسبهٔ اوقات
// شرعی و پخش صدای اذان با آخرین تنظیماتِ شناخته‌شده کار کند.
const SETTINGS_CACHE_KEY = 'arefanejam_settings_cache';
// باید دقیقاً با AZAN_OFFLINE_CACHE در push-worker.js یکی باشد؛ اسم کش آفلاینِ صدای اذان است
// تا موقع پاک‌سازی کش‌های قدیمی، این یکی به‌اشتباه پاک نشود.
const AZAN_OFFLINE_CACHE_NAME = 'arefanejam-azan-offline-v1';
// کش جداگانهٔ فایل صوتیِ «اعلان» (پیام صوتی مدیر) برای پخش آفلاین؛ عمداً از کش اذان جدا
// است تا جایگزینی فایل اذان این یکی را پاک نکند. باید دقیقاً با ANNOUNCEMENT_AUDIO_CACHE
// در push-worker.js یکی باشد.
const ANNOUNCEMENT_AUDIO_CACHE_NAME = 'arefanejam-announcement-audio-v1';
const ANNOUNCEMENT_AUDIO_META_KEY = 'arefanejam_announcement_audio_meta';
// باید دقیقاً با APP_SHELL_CACHE در push-worker.js یکی باشد؛ اسم کشِ پوستهٔ اصلی
// اپ (HTML/CSS/JS/آیکون) است که کارکرد کامل آفلاین را ممکن می‌کند، تا موقع
// پاک‌سازی کش‌های قدیمی، این یکی هم به‌اشتباه پاک نشود.
const APP_SHELL_CACHE_NAME = 'arefanejam-app-shell-v4';
// کش صوت تلاوت‌های ذخیره‌شدهٔ قرآن برای پخش آفلاین؛ باید از پاک‌سازی کش‌های قدیمی مستثنا باشد.
const QURAN_AUDIO_CACHE_NAME = 'arefanejam-quran-audio-v1';
// ذخیرهٔ آفلاینِ محتوای بخش «کمک‌های مردمی»: متن/کارت‌ها/لینک‌ها در localStorage و تصاویر در این کش.
// اسم کش باید دقیقاً با CHARITY_MEDIA_CACHE در push-worker.js یکی باشد و از پاک‌سازی کش‌های قدیمی مستثنا بماند.
const CHARITY_CACHE_KEY = 'arefanejam_charity_cache';
const FOOD_ITEMS_CACHE_KEY = 'arefanejam_food_items_cache';
const CHARITY_MEDIA_CACHE_NAME = 'arefanejam-charity-media-v1';
// عکس‌هایی که مدیر در پیشخوان گذاشته (مکاتب، چارت، اسلایدر، گالری، ...) برای دیدن آفلاین؛
// باید دقیقاً با SITE_MEDIA_CACHE در push-worker.js یکی باشد و از پاک‌سازی کش‌های قدیمی مستثنا بماند.
const SITE_MEDIA_CACHE_NAME = 'arefanejam-site-media-v1';

// فایل صوتی اذان را کامل (یک‌بار) دانلود و در حافظهٔ خودِ گوشی ذخیره می‌کند و آماده نگه می‌دارد؛
// وقت اذان صدا از همین نسخهٔ محلی پخش می‌شود، پس بدون اینترنت هم کار می‌کند.
// اگر مدیر فایل اذان را عوض کند (آدرس یا حجم فایل تغییر کند) خودکار دوباره دانلود می‌شود.
const AZAN_META_KEY = 'arefanejam_azan_audio_meta';
let azanEl = null;          // عنصر صوتیِ آماده از فایل ذخیره‌شدهٔ گوشی
let azanReadyUrl = '';
let azanBusy = false;
let azanLastCheck = 0;
let azanUnlocked = false;

function normalizeAzanUrl(url) {
  if (!url) return '';
  if (location.protocol === 'https:') url = url.replace(/^http:\/\//i, 'https://');
  return url;
}

async function prefetchAzanAudioForOffline() {
  const url = normalizeAzanUrl(state.settings && state.settings.azan_audio_url);
  if (!url || !window.caches || azanBusy) return;
  if (azanEl && azanReadyUrl === url && Date.now() - azanLastCheck < 6 * 3600 * 1000) return;
  azanBusy = true;
  try {
    const cache = await caches.open(AZAN_OFFLINE_CACHE_NAME);
    let meta = null;
    try { meta = JSON.parse(localStorage.getItem(AZAN_META_KEY) || 'null'); } catch (e) {}
    let cached = await cache.match(url);
    let needDownload = !cached || !meta || meta.url !== url;
    if (!needDownload && navigator.onLine) {
      try {
        const head = await fetch(url, { method: 'HEAD' });
        const len = Number(head.headers.get('content-length'));
        if (head.ok && len && len !== meta.size) needDownload = true;
      } catch (e) {}
    }
    let downloaded = false;
    if (needDownload && navigator.onLine) {
      const res = await fetch(url + (url.indexOf('?') > -1 ? '&' : '?') + '_=' + Date.now());
      if (res.status === 200) {
        const blob = await res.blob();
        if (blob.size > 0) {
          await cache.put(url, new Response(blob, { status: 200, headers: { 'Content-Type': res.headers.get('Content-Type') || 'audio/mpeg' } }));
          try { localStorage.setItem(AZAN_META_KEY, JSON.stringify({ url, size: blob.size })); } catch (e) {}
          downloaded = true;
          const keys = await cache.keys();
          for (const k of keys) {
            if (k.url !== url && /\.(mp3|ogg|wav|m4a|aac)(\?|$)/i.test(k.url)) await cache.delete(k);
          }
        }
      }
    }
    if (downloaded || !azanEl || azanReadyUrl !== url) {
      cached = await cache.match(url);
      if (cached && currentAzanAudio !== azanEl) {
        const blob = await cached.blob();
        if (azanEl && azanEl._blobUrl) { try { URL.revokeObjectURL(azanEl._blobUrl); } catch (e) {} }
        const el = new Audio();
        el.preload = 'auto';
        el._blobUrl = URL.createObjectURL(blob);
        el.src = el._blobUrl;
        azanEl = el;
        azanReadyUrl = url;
        azanUnlocked = false;
      }
    }
    azanLastCheck = Date.now();
  } catch (e) {
    console.warn('ذخیرهٔ آفلاین اذان انجام نشد.', e);
  } finally {
    azanBusy = false;
  }
}

// دقیقاً مثل prefetchAzanAudioForOffline بالا، ولی برای فایل صوتیِ «اعلان» (پیام صوتی
// مدیر) و در کش جداگانهٔ خودش؛ تا وقتی مدیر تیک «پیام صوتی» را روشن و فایلی انتخاب کرده
// باشد، همان لحظه که اپ باز می‌شود فایل دانلود و روی گوشی ذخیره می‌شود، پس لحظهٔ نمایش
// واقعیِ اعلان (چه با اپ باز، چه با لمس نوتیفیکیشن) حتی بدون اینترنت هم پخش می‌شود.
let announcementAudioEl = null;
let announcementAudioReadyUrl = '';
let announcementAudioBusy = false;
let announcementAudioLastCheck = 0;

async function prefetchAnnouncementAudioForOffline() {
  const s = state.settings || {};
  if (s.announcement_audio_enabled !== '1') return;
  const url = normalizeAzanUrl(s.announcement_audio_url);
  if (!url || !window.caches || announcementAudioBusy) return;
  if (announcementAudioEl && announcementAudioReadyUrl === url && Date.now() - announcementAudioLastCheck < 6 * 3600 * 1000) return;
  announcementAudioBusy = true;
  try {
    const cache = await caches.open(ANNOUNCEMENT_AUDIO_CACHE_NAME);
    let meta = null;
    try { meta = JSON.parse(localStorage.getItem(ANNOUNCEMENT_AUDIO_META_KEY) || 'null'); } catch (e) {}
    let cached = await cache.match(url);
    let needDownload = !cached || !meta || meta.url !== url;
    if (!needDownload && navigator.onLine) {
      try {
        const head = await fetch(url, { method: 'HEAD' });
        const len = Number(head.headers.get('content-length'));
        if (head.ok && len && len !== meta.size) needDownload = true;
      } catch (e) {}
    }
    let downloaded = false;
    if (needDownload && navigator.onLine) {
      const res = await fetch(url + (url.indexOf('?') > -1 ? '&' : '?') + '_=' + Date.now());
      if (res.status === 200) {
        const blob = await res.blob();
        if (blob.size > 0) {
          await cache.put(url, new Response(blob, { status: 200, headers: { 'Content-Type': res.headers.get('Content-Type') || 'audio/mpeg' } }));
          try { localStorage.setItem(ANNOUNCEMENT_AUDIO_META_KEY, JSON.stringify({ url, size: blob.size })); } catch (e) {}
          downloaded = true;
          const keys = await cache.keys();
          for (const k of keys) { if (k.url !== url) await cache.delete(k); }
        }
      }
    }
    if (downloaded || !announcementAudioEl || announcementAudioReadyUrl !== url) {
      cached = await cache.match(url);
      if (cached && currentAnnouncementAudio !== announcementAudioEl) {
        const blob = await cached.blob();
        if (announcementAudioEl && announcementAudioEl._blobUrl) { try { URL.revokeObjectURL(announcementAudioEl._blobUrl); } catch (e) {} }
        const el = new Audio();
        el.preload = 'auto';
        el._blobUrl = URL.createObjectURL(blob);
        el.src = el._blobUrl;
        announcementAudioEl = el;
        announcementAudioReadyUrl = url;
      }
    }
    announcementAudioLastCheck = Date.now();
  } catch (e) {
    console.warn('ذخیرهٔ آفلاین صدای اعلان انجام نشد.', e);
  } finally {
    announcementAudioBusy = false;
  }
}

// پخش صدای اعلان: اول از نسخهٔ ذخیره‌شدهٔ خودِ گوشی (بدون نیاز به اینترنت)، وگرنه مستقیم
// از آدرس اینترنتی. کاملاً وابسته به تیک «پیام صوتی» در پیشخوان (اگر خاموش باشد، کاری
// نمی‌کند و اعلان دقیقاً مثل قبل فقط متنی می‌ماند).
let currentAnnouncementAudio = null;
function playAnnouncementAudio(url, force) {
  const s = state.settings || {};
  // اگر پیام از خودِ سرویس‌ورکر (Push واقعی) رسیده، یعنی سرور همین الان تأیید کرده که
  // صدا فعال است؛ دیگر لازم نیست منتظر به‌روزرسانیِ state.settings این صفحه بمانیم
  // (ممکن است هنوز settings تازه نگرفته باشد) — force این حالت را پوشش می‌دهد.
  if (!force && s.announcement_audio_enabled !== '1') return;
  const finalUrl = normalizeAzanUrl(url || s.announcement_audio_url);
  if (!finalUrl) return;
  if (currentAnnouncementAudio) { currentAnnouncementAudio.pause(); currentAnnouncementAudio = null; }
  const usingLocal = !!(announcementAudioEl && announcementAudioReadyUrl === finalUrl);
  const audio = usingLocal ? announcementAudioEl : new Audio(finalUrl);
  try { audio.currentTime = 0; } catch (e) {}
  audio.muted = false;
  currentAnnouncementAudio = audio;
  const pr = audio.play();
  if (pr && pr.catch) {
    pr.catch(() => {
      if (currentAnnouncementAudio !== audio) return;
      if (usingLocal) {
        const online = new Audio(finalUrl);
        currentAnnouncementAudio = online;
        online.play().catch(() => { if (currentAnnouncementAudio === online) currentAnnouncementAudio = null; });
      } else {
        currentAnnouncementAudio = null;
      }
    });
  }
  audio.addEventListener('ended', () => { if (currentAnnouncementAudio === audio) currentAnnouncementAudio = null; }, { once: true });
}

// مرورگرها پخش خودکار صدا را بدون تعامل کاربر محدود می‌کنند؛ با اولین لمس کاربر روی صفحه،
// عنصر صوتی اذان یک‌بار بی‌صدا «باز» می‌شود تا وقت اذان بدون مشکل پخش شود.
function unlockAzanAudio() {
  const a = azanEl;
  if (!a || azanUnlocked || currentAzanAudio) return;
  azanUnlocked = true;
  a.muted = true;
  const pr = a.play();
  if (pr && pr.then) {
    pr.then(() => {
      if (currentAzanAudio === a) { a.muted = false; return; }
      a.pause(); a.currentTime = 0; a.muted = false;
    }).catch(() => { a.muted = false; azanUnlocked = false; });
  }
}
['pointerdown', 'touchstart', 'keydown'].forEach((ev) => document.addEventListener(ev, unlockAzanAudio, { passive: true }));

/* متن‌های قابل ویرایش بخش «گزارش قرآن» از پیشخوان مدیر؛ اگر خالی باشد همان متن پیش‌فرض اپ می‌ماند */
function applyQuranReportTexts() {
  const s = state.settings || {};
  const map = [
    ['quran-today-title', s.quran_today_title],
    ['quran-today-desc', s.quran_today_desc],
    ['quran-progress-title', s.quran_progress_title],
    ['quran-progress-desc', s.quran_progress_desc],
  ];
  map.forEach(([id, text]) => {
    if (!text) return; // خالی یعنی همان متن پیش‌فرض داخل index.html نگه داشته شود
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  });
}

function applyCachedSettingsUi(cached) {
  state.settings = cached;
  document.getElementById('topbar-title').textContent = cached.brand_name || 'عارفان جام';
  if (cached.logo_url) document.getElementById('topbar-logo').src = secureUrl(cached.logo_url);
  applyQuranReportTexts();
  renderAnnouncement();
  updateStickyNotification(null);
  prefetchAzanAudioForOffline();
  prefetchAnnouncementAudioForOffline();
}
function applyFreshSettingsUi() {
  document.getElementById('topbar-title').textContent = state.settings.brand_name || 'عارفان جام';
  if (state.settings.logo_url) document.getElementById('topbar-logo').src = secureUrl(state.settings.logo_url);
  applyQuranReportTexts();
  renderAnnouncement();
  checkForNewAnnouncement();
  maybeShowIntroSplash();
  updateStickyNotification(null); // نمایش فوری تاریخ امروز، حتی قبل از آماده‌شدن موقعیت مکانی برای اذان بعدی
  prefetchAzanAudioForOffline();
  prefetchAnnouncementAudioForOffline();
  checkQuranInvitePopup();
  checkQuranInactivityPopup();
}
/* ---------- کاشی‌های «بیشتر» (سرگرمی / عبادت): آیکون و نوشته از پیشخوان ---------- */
function applyMoreTiles(st) {
  try {
    if (!st || typeof st !== 'object') return;
    const setBadge = (id, url, emoji) => {
      const b = document.getElementById(id); if (!b) return;
      if (url) {
        const key = 'u:' + url;
        if (b.dataset.k === key) return;
        b.dataset.k = key; b.textContent = '';
        const im = document.createElement('img'); im.alt = ''; im.className = 'tile-img-icon'; im.src = secureUrl(url);
        b.appendChild(im);
        try { prefetchSiteImages([secureUrl(url)]); } catch (e) {}
      } else if (emoji) { b.dataset.k = 'e:' + emoji; b.textContent = emoji; }
    };
    setBadge('fun-tile-badge', st.fun_tile_icon_url, st.fun_tile_icon_emoji);
    setBadge('ibadah-tile-badge', st.ibadah_tile_icon_url, st.ibadah_tile_icon_emoji);
    if (st.fun_tile_label) {
      const l = document.getElementById('fun-tile-label'); if (l) l.textContent = st.fun_tile_label;
      const t = document.querySelector('#tab-fun .section-block h3'); if (t) t.textContent = st.fun_tile_label;
    }
    if (st.ibadah_tile_label) {
      const l = document.getElementById('ibadah-tile-label'); if (l) l.textContent = st.ibadah_tile_label;
      if (typeof MENU_GROUPS !== 'undefined' && MENU_GROUPS.ibadah) MENU_GROUPS.ibadah.title = st.ibadah_tile_label;
    }
  } catch (e) {}
}
function loadSettings() {
  // 1) اگر تنظیماتِ دفعهٔ قبل روی گوشی هست، همین الان و بدون انتظار برای اینترنت استفاده می‌شود
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(SETTINGS_CACHE_KEY) || 'null'); } catch (e) {}
  const hasCache = !!(cached && typeof cached === 'object');
  let shownStr = null;
  if (hasCache) {
    try { shownStr = JSON.stringify(cached); applyCachedSettingsUi(cached); applyMoreTiles(cached); } catch (e) {}
  }
  // 2) تنظیمات تازه از سایت (در پس‌زمینه اگر نسخهٔ ذخیره‌شده داریم)
  const fresh = apiFetch('/settings').then((data) => {
    state.settings = data;
    applyMoreTiles(data);
    try { localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(data)); } catch (e) {}
    let str = null;
    try { str = JSON.stringify(data); } catch (e) {}
    if (!hasCache || str !== shownStr) { applyFreshSettingsUi(); if (hasCache) { try { computePrayerTimes(); } catch (e) {} } }
    else { try { maybeShowIntroSplash(); checkForNewAnnouncement(); checkQuranInvitePopup(); checkQuranInactivityPopup(); } catch (e) {} }
  }).catch((err) => {
    console.warn('تنظیمات سایت دریافت نشد.', err);
    if (!hasCache) return;
    try { checkQuranInvitePopup(); checkQuranInactivityPopup(); } catch (e) {}
  });
  // با نسخهٔ ذخیره‌شده: بی‌درنگ ادامهٔ راه‌اندازی (اوقات شرعی، موقعیت، ...)؛ بدون آن: منتظر سایت (مثل قبل)
  return hasCache ? Promise.resolve() : fresh;
}

/* ---------- کلیپ معرفی (Splash) ---------- */
/* ---------- تشخیص آفلاین/آنلاین ---------- */
function updateOfflineBanner() {
  document.getElementById('offline-banner').classList.toggle('hidden', navigator.onLine);
}
document.getElementById('offline-reload-btn').addEventListener('click', () => location.reload());
window.addEventListener('offline', updateOfflineBanner);
window.addEventListener('online', () => {
  updateOfflineBanner();
  // وقتی اینترنت دوباره وصل شد، برای جلوگیری از هنگ کردن، صفحه با یک تأخیر کوتاه و امن دوباره لود می‌شود
  // در حالت پس‌زمینه رفرش نمی‌کنیم؛ رفرش صدای نگه‌دارندهٔ اپ را قطع می‌کند
  // (بارگذاری مجدد کل برنامه با هر بار وصل شدن اینترنت حذف شد؛ باعث کندی و پریدن صفحه می‌شد)
  try { if (typeof sendHeartbeat === 'function') sendHeartbeat(); } catch (e) {}
});
updateOfflineBanner();

/* ---------- بارگذاری مجدد دستی (دکمهٔ نوار بالا) + غیرفعال‌سازی کشیدن به پایین برای رفرش ---------- */
function hardReloadApp() {
  // داخل اپ اندروید: این دکمه «بروزرسانی» است (بررسی APK جدید و ظاهر جدید از سایت)؛ در مرورگر/PWA مثل قبل بارگذاری مجدد
  if (window.NativeUpdate && typeof window.NativeUpdate.manual === 'function') { window.NativeUpdate.manual(); return; }
  const btn = document.getElementById('topbar-reload-btn');
  const overlay = document.getElementById('reload-overlay');
  if (btn) { btn.disabled = true; btn.classList.add('spinning'); }
  if (overlay) overlay.classList.remove('hidden');
  setTimeout(() => {
    // با اضافه‌کردن یک پارامتر یکتا، از کش مرورگر عبور کرده و آخرین نسخهٔ صفحه (متناسب با آخرین تنظیمات پیشخوان) لود می‌شود
    const url = new URL(window.location.href);
    url.searchParams.set('_r', Date.now().toString());
    window.location.replace(url.toString());
  }, 250);
}
const topbarReloadBtn = document.getElementById('topbar-reload-btn');
if (topbarReloadBtn) topbarReloadBtn.addEventListener('click', hardReloadApp);

(function preventPullToRefresh() {
  const scrollEl = document.getElementById('content');
  let startY = 0;
  let blocking = false;
  let touchTarget = null;
  // اگر لمس داخل هر عنصر قابل‌اسکرولی (مثل پنجره‌های باز شده و چارت) شروع شده و آن عنصر پایین‌تر از بالای خودش است،
  // کشیدن به پایین یعنی «اسکرول به بالا» و نباید مسدود شود.
  function insideScrolledContainer(el) {
    for (let n = el; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      if (n.scrollTop > 0) return true;
    }
    return false;
  }
  document.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    startY = e.touches[0].clientY;
    touchTarget = e.target;
    // کشیدن به پایین فقط زمانی باید مسدود شود که همه‌ی کانتینرهای قابل‌اسکرول در بالای خودشان باشند
    blocking = (window.scrollY <= 0) && (!scrollEl || scrollEl.scrollTop <= 0) && !insideScrolledContainer(touchTarget);
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (!blocking || e.touches.length !== 1) return;
    const deltaY = e.touches[0].clientY - startY;
    if (deltaY > 0 && (window.scrollY <= 0) && (!scrollEl || scrollEl.scrollTop <= 0) && !insideScrolledContainer(touchTarget)) {
      e.preventDefault();
    }
  }, { passive: false });
})();

function maybeShowIntroSplash() {
  // صفحهٔ شروع (ویدیو/عکس/گیف) داخل index.html مدیریت می‌شود (ArefIntro)؛ اینجا فقط تنظیمات تازه را می‌دهیم.
  // فقط هنگام لود اپ نشان داده می‌شود و هیچ دکمهٔ دانلودی ندارد.
  try { if (window.ArefIntro) window.ArefIntro.update(state.settings || {}); } catch (e) {}
}

function renderAnnouncement() {
  const s = state.settings || {};
  const banner = document.getElementById('announcement-banner');
  if (!s.announcement_text || !s.announcement_id) { banner.classList.add('hidden'); return; }
  const dismissedId = localStorage.getItem('arefanejam_announcement_dismissed');
  if (dismissedId === s.announcement_id) { banner.classList.add('hidden'); return; }
  document.getElementById('announcement-text-el').textContent = s.announcement_text;
  const linkBtn = document.getElementById('announcement-link-btn');
  if (s.announcement_link) {
    linkBtn.href = s.announcement_link;
    linkBtn.classList.remove('hidden');
    linkBtn.onclick = () => trackClick('announcement_link');
  } else { linkBtn.classList.add('hidden'); }
  banner.classList.remove('hidden');
}
document.getElementById('announcement-dismiss-btn').addEventListener('click', () => {
  const s = state.settings || {};
  if (s.announcement_id) localStorage.setItem('arefanejam_announcement_dismissed', s.announcement_id);
  document.getElementById('announcement-banner').classList.add('hidden');
});

function playAlarmSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1108].forEach((freq, i) => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.28);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.28 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.28 + 0.25);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.28); osc.stop(ctx.currentTime + i * 0.28 + 0.26);
    });
  } catch (e) { /* ignore */ }
}

function showAlarmModal(title, message, link, linkTrackName) {
  document.getElementById('alarm-title-text').textContent = title;
  document.getElementById('alarm-message-text').textContent = message;
  document.getElementById('alarm-modal').classList.remove('hidden');
  // اگر صدای اذان یا پیام صوتیِ اعلان در حال پخش است، صدای هشدار عمومی روی آن سوار نشود
  if (!currentAzanAudio && !currentAnnouncementAudio) playAlarmSound();
  if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
  const okBtn = document.getElementById('alarm-ok-btn');
  const linkBtn = document.getElementById('alarm-link-btn');
  // وقتی این هشدار همان صدای اذان است، متن دکمه صریحاً «توقف اذان» باشد
  okBtn.textContent = currentAzanAudio ? 'توقف اذان' : 'متوجه شدم';
  okBtn.onclick = () => {
    document.getElementById('alarm-modal').classList.add('hidden');
    stopAzanSound();
  };
  if (link) {
    linkBtn.classList.remove('hidden');
    linkBtn.onclick = () => {
      if (linkTrackName) trackClick(linkTrackName);
      window.open(link, '_blank');
      document.getElementById('alarm-modal').classList.add('hidden');
    };
  } else {
    linkBtn.classList.add('hidden');
  }
}

function checkForNewAnnouncement() {
  const s = state.settings || {};
  if (!s.announcement_text || !s.announcement_id) return;
  const lastSeen = localStorage.getItem('arefanejam_announcement_seen');
  if (lastSeen === s.announcement_id) return;
  localStorage.setItem('arefanejam_announcement_seen', s.announcement_id);
  if (s.announcement_audio_enabled === '1' && s.announcement_audio_url) playAnnouncementAudio(s.announcement_audio_url);
  showAlarmModal('اعلان جدید از دارالحفظ', s.announcement_text, s.announcement_link, 'announcement_link_clicked');
  renderAnnouncement();
}

/* ---------- پاپ‌آپ زمان‌بندی‌شدهٔ «دعوت به قرآن» ----------
   تصمیم «الان وقتش رسیده یا نه» کاملاً محلی و بر اساس ساعت خودِ گوشی گرفته می‌شود،
   روی همان state.settings که یا تازه از سرور آمده یا (وقتی آفلاین) از کش
   localStorage بازیابی شده؛ به همین دلیل این قابلیت بدون اینترنت هم کار می‌کند. */
const QURAN_POPUP_SEEN_PREFIX = 'arefanejam_quran_popup_seen_';

function pad2(n) { return String(n).padStart(2, '0'); }

function checkQuranInvitePopup() {
  const s = state.settings || {};
  const p = s.quran_popup;
  if (!p) return;
  if (!document.getElementById('quran-invite-modal').classList.contains('hidden')) return; // یکی همین الان باز است

  // نمایش آزمایشی (دکمهٔ «نمایش آزمایشی همین الان» در پیشخوان)؛ مستقل از فعال/غیرفعال بودن و زمان‌بندی
  if (p.test_id) {
    const testSeenKey = QURAN_POPUP_SEEN_PREFIX + 'test';
    if (localStorage.getItem(testSeenKey) !== p.test_id) {
      localStorage.setItem(testSeenKey, p.test_id);
      if (p.text) { showQuranInvitePopup(p); return; }
    }
  }

  if (!p.active || !p.text) return;
  const schedule = Array.isArray(p.schedule) ? p.schedule : [];
  if (!schedule.length) return;
  if (!document.getElementById('quran-invite-modal').classList.contains('hidden')) return; // یکی همین الان باز است

  const now = new Date();
  const todayKey = now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate());
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  for (let idx = 0; idx < schedule.length; idx++) {
    const slot = schedule[idx];
    if (!slot || !slot.time) continue;
    const parts = slot.time.split(':');
    const slotMinutes = (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);

    let eligible = false;
    let seenKey = '';
    if (slot.type === 'once') {
      if (!slot.date) continue;
      eligible = (slot.date === todayKey) && (nowMinutes >= slotMinutes);
      seenKey = QURAN_POPUP_SEEN_PREFIX + 'once_' + idx + '_' + slot.date;
    } else {
      eligible = nowMinutes >= slotMinutes;
      seenKey = QURAN_POPUP_SEEN_PREFIX + 'daily_' + idx + '_' + todayKey;
    }
    if (!eligible) continue;
    if (localStorage.getItem(seenKey)) continue;
    localStorage.setItem(seenKey, '1');
    showQuranInvitePopup(p);
    break; // در هر چک، فقط یک پاپ‌آپ نشان داده می‌شود تا چند مورد عقب‌افتاده روی هم نیایند
  }
}

function showQuranInvitePopup(p) {
  const textEl = document.getElementById('quran-invite-text');
  applyMokatibPopupText(textEl, { text: p.text, textColor: p.text_color, font: p.font, effect: p.effect });
  document.getElementById('quran-invite-btn1').textContent = p.btn1_text || 'بزن بریم';
  document.getElementById('quran-invite-btn2').textContent = p.btn2_text || 'ان‌شاءالله بعدا';
  document.getElementById('quran-invite-modal').classList.remove('hidden');
}
document.getElementById('quran-invite-btn1').addEventListener('click', () => {
  document.getElementById('quran-invite-modal').classList.add('hidden');
  navHistory = [];
  switchToTab('quran-list', { push: true });
});
document.getElementById('quran-invite-btn2').addEventListener('click', () => {
  document.getElementById('quran-invite-modal').classList.add('hidden');
});
setInterval(checkQuranInvitePopup, 30000); // چک زمان‌بندی مستقل از شبکه، هر ۳۰ ثانیه (آفلاین هم اجرا می‌شود)

/* ---------- یادآوری «چند روز است قرآن نخوانده‌ای» ----------
   برخلاف پاپ‌آپِ بالا که شرطش رسیدن به یک ساعتِ مشخص است، شرط این یکی «تعداد
   روزهای پیاپیِ بدون خواندن» است. «آخرین روزی که واقعاً چیزی خوانده شده» از
   همان لاگِ محلیِ arefanejam_quran_read_log (همان چیزی که تب «گزارش قرآن» هم
   از رویش ساخته می‌شود) به دست می‌آید؛ پس این تشخیص هم کاملاً محلی و بدون نیاز
   به اینترنت است. اگر کاربر تا امروز اصلاً چیزی نخوانده، مبنا «اولین روزی که
   اپ را باز کرده» در نظر گرفته می‌شود، نه امروز، تا کاربر تازه‌نصب‌کرده همان
   لحظهٔ اول این یادآوری را نبیند. */
const QURAN_FIRST_SEEN_KEY = 'arefanejam_first_seen_date';
const QURAN_INACTIVITY_SEEN_KEY = 'arefanejam_quran_inactivity_seen_date';

function getQuranFirstSeenDateKey() {
  let v = null;
  try { v = localStorage.getItem(QURAN_FIRST_SEEN_KEY); } catch (e) {}
  if (!v) {
    v = dailyDeedsDateKey();
    try { localStorage.setItem(QURAN_FIRST_SEEN_KEY, v); } catch (e) {}
  }
  return v;
}

// آخرین تاریخی (کلید YYYY-M-D) که دست‌کم یک آیه در آن واقعاً خوانده شده؛ اگر هیچ‌وقت چیزی خوانده نشده، null
function getLastQuranReadDateKey() {
  const log = getQuranReadLog();
  const keys = Object.keys(log).filter((k) => log[k] && log[k].ayahs && log[k].ayahs.length).sort();
  return keys.length ? keys[keys.length - 1] : null;
}

// فاصلهٔ روز بین دو کلید تاریخِ «YYYY-M-D» (بدون درگیر شدن با ساعت/منطقهٔ زمانی)
function daysBetweenDateKeys(fromKey, toKey) {
  const parse = (k) => {
    const p = k.split('-').map((n) => parseInt(n, 10));
    return new Date(p[0], (p[1] || 1) - 1, p[2] || 1);
  };
  return Math.round((parse(toKey) - parse(fromKey)) / 86400000);
}

function checkQuranInactivityPopup() {
  const s = state.settings || {};
  const inact = s.quran_popup && s.quran_popup.inactivity;
  if (!inact || !inact.active || !inact.text) return;
  if (!document.getElementById('quran-invite-modal').classList.contains('hidden')) return; // یکی همین الان باز است

  const todayKey = dailyDeedsDateKey();
  const baseKey = getLastQuranReadDateKey() || getQuranFirstSeenDateKey();
  const daysSince = daysBetweenDateKeys(baseKey, todayKey);
  const threshold = Math.max(1, parseInt(inact.days, 10) || 3);
  if (daysSince < threshold) return;

  let seenDate = null;
  try { seenDate = localStorage.getItem(QURAN_INACTIVITY_SEEN_KEY); } catch (e) {}
  if (seenDate === todayKey) return; // امروز قبلاً نشان داده شده
  try { localStorage.setItem(QURAN_INACTIVITY_SEEN_KEY, todayKey); } catch (e) {}

  // همان ظاهر (فونت/رنگ/افکت) و متن دکمه‌های پاپ‌آپ اصلی، فقط با متنِ اختصاصیِ این یادآوری
  showQuranInvitePopup(Object.assign({}, s.quran_popup, { text: inact.text }));
}
setInterval(checkQuranInactivityPopup, 30000); // مستقل از شبکه؛ آفلاین هم اجرا می‌شود

function checkForNewServerAlarm() {
  const s = state.settings || {};
  const a = s.latest_alarm;
  if (!a || !a.id) return;
  const lastSeen = localStorage.getItem('arefanejam_server_alarm_seen');
  if (lastSeen === a.id) return;
  localStorage.setItem('arefanejam_server_alarm_seen', a.id);
  // وقت اذان: وقتی اپ باز است، محاسبهٔ محلیِ دقیق‌تر (بر اساس موقعیت خودِ کاربر) همین الان
  // صدای اذان را پخش می‌کند؛ این آلارم سروری فقط برای وقتی است که اپ کاملاً بسته باشد.
  if (a.type === 'azan') return;
  showAlarmModal(a.title || 'اعلان جدید', a.body || '', a.link || '', 'server_alarm_clicked');
}

setInterval(async () => {
  try {
    state.settings = await apiFetch('/settings');
    try { localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(state.settings)); } catch (e) {}
    prefetchAzanAudioForOffline();
    checkForNewAnnouncement();
    checkForNewServerAlarm();
    checkQuranInvitePopup();
    checkQuranInactivityPopup();
  } catch (e) {}
}, 20000);

function renderAboutPage() {
  const s = state.settings || {};
  document.getElementById('about-text-el').textContent = s.about_text || 'اطلاعاتی ثبت نشده است.';
  const linksBlock = document.getElementById('about-links-block');
  linksBlock.innerHTML = '';
  [1, 2, 3].forEach((i) => {
    const label = s['link' + i + '_label']; const url = s['link' + i + '_url'];
    if (label && url) {
      const a = document.createElement('a');
      a.href = url; a.target = '_blank'; a.rel = 'noopener';
      a.className = 'about-link-btn'; a.textContent = label;
      a.addEventListener('click', () => trackClick('about_link' + i));
      linksBlock.appendChild(a);
    }
  });
}

/* ---------- موقعیت مکانی و اوقات شرعی ---------- */
const COORDS_CACHE_KEY = 'arefanejam_last_coords';

function loadCachedCoords() {
  try {
    const cached = JSON.parse(localStorage.getItem(COORDS_CACHE_KEY) || 'null');
    if (cached && cached.lat && cached.lng) return cached;
  } catch (e) {}
  return null;
}
function saveCoordsCache(coords, label, extra) {
  try { localStorage.setItem(COORDS_CACHE_KEY, JSON.stringify(Object.assign({}, coords, { label, ts: Date.now() }, extra || {}))); } catch (e) {}
}

/* گرفتن دقیق‌ترین موقعیت ممکن: چند ثانیه نمونه می‌گیرد (GPS با دقت بالا) و بهترین را برمی‌گرداند.
   زود می‌ایستد اگر دقت به حد کافی خوب شد (≤ ۲۵ متر) و بعد از ~۱۰ ثانیه با بهترین نمونهٔ موجود تمام می‌شود. */
function getPreciseFix(maxMs) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject({ code: 2 }); return; }
    let best = null, done = false, watchId = null;
    const finish = (err) => {
      if (done) return; done = true;
      try { if (watchId !== null) navigator.geolocation.clearWatch(watchId); } catch (e) {}
      clearTimeout(tSoft); clearTimeout(tHard);
      if (best) resolve(best); else reject(err || { code: 3 });
    };
    const tSoft = setTimeout(() => { if (best) finish(); }, maxMs || 10000);
    const tHard = setTimeout(() => finish({ code: 3 }), (maxMs || 10000) + 12000);
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!best || pos.coords.accuracy < best.accuracy) {
          best = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, altitude: pos.coords.altitude };
        }
        if (best.accuracy <= 25) finish();
      },
      (err) => { if (err && err.code === 1) finish(err); else if (!best) { /* منتظر ادامه می‌مانیم تا زمان تمام شود */ } },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    );
  });
}

// متن موقعیت مکانی را همزمان در تب «اذان» و تب «قبله» (در صورت وجود) به‌روزرسانی می‌کند
function setLocationLabel(text) {
  const azanEl = document.getElementById('azan-location-label');
  if (azanEl) azanEl.textContent = text;
  const qiblaEl = document.getElementById('qibla-location-label');
  if (qiblaEl) qiblaEl.textContent = text;
}


// دکمهٔ کوچک «موقعیت من» در صفحهٔ خانه: تا وقتی موقعیت مشخص نشده کمی می‌تپد تا توجه کاربر جلب شود؛
// به‌محض مشخص‌شدن مختصات (حتی از پیش‌فرض ادمین)، حالت آرام می‌گیرد و متنش نام شهر را نشان می‌دهد.
function updateHomeLocationBtnState() {
  const btn = document.getElementById('home-location-btn');
  if (!btn) return;
  const textEl = document.getElementById('home-location-btn-text');
  if (state.coords) {
    btn.classList.remove('is-unresolved');
    if (textEl) textEl.textContent = state.manualCity ? state.manualCity.name : (state.activeCityName || 'موقعیت من');
  } else if (textEl) {
    textEl.textContent = 'موقعیت من';
  }
}

/* موقعیت فقط یک بار مشخص می‌شود و ذخیره می‌ماند. بعد از آن اپ دیگر سراغ GPS نمی‌رود؛
   فقط وقتی کاربر خودش «موقعیت دقیق من» یا «انتخاب شهر» را بزند عوض می‌شود. */
let autoGpsTriedThisLaunch = false;
function resolveCoordinates(skipLiveGPS) {
  return new Promise((resolve) => {
    // اگر کاربر شهر را دستی انتخاب کرده، همان اولویت دارد
    if (state.manualCity) {
      state.coords = { lat: state.manualCity.lat, lng: state.manualCity.lng };
      state.activeCityName = state.manualCity.name; // قبلاً بعد از بستن/باز کردن اپ نام شهر خالی می‌ماند و جدول دقیق شهر اعمال نمی‌شد
      setLocationLabel('شهر انتخابی: ' + state.manualCity.name);
      refreshQiblaCompassIfReady();
      resolve(state.coords);
      return;
    }

    const useAdminLocation = () => {
      const s = state.settings || {};
      if (s.latitude && s.longitude) {
        const coords = { lat: parseFloat(s.latitude), lng: parseFloat(s.longitude) };
        state.coords = coords;
        state.activeCityName = s.city_name || null;
        setLocationLabel('بر اساس شهر پیش‌فرض' + (s.city_name ? ' (' + s.city_name + ')' : ''));
        refreshQiblaCompassIfReady();
        resolve(coords);
      } else {
        setLocationLabel('موقعیت مکانی پیدا نشد. لطفاً GPS گوشی را روشن کنید یا شهر خود را از فهرست انتخاب کنید.');
        resolve(null);
      }
    };

    // موقعیت ذخیره‌شده (GPS یا شهر انتخابی): همان استفاده می‌شود و دیگر GPS پرسیده نمی‌شود
    const cached = loadCachedCoords();
    if (cached) {
      state.coords = { lat: cached.lat, lng: cached.lng };
      { const nc = findNearestCity(cached.lat, cached.lng); state.activeCityName = nc ? nc.name : (state.activeCityName || null); } // همیشه از روی همین مختصات؛ نه نام شهرِ مانده از تنظیمات پیش‌فرض
      setLocationLabel(cached.label ? cached.label : 'بر اساس آخرین موقعیت ذخیره‌شده');
      refreshQiblaCompassIfReady();
      // موقعیت‌های GPS قدیمیِ کم‌دقت: فقط یک بار، بی‌صدا و در پس‌زمینه با دقت بالا اصلاح می‌شوند
      if (!cached.precise && /دستگاه|دقیق/.test(cached.label || '') && !localStorage.getItem('arefanejam_geo_refined') && !localStorage.getItem('arefanejam_geo_denied')) {
        localStorage.setItem('arefanejam_geo_refined', '1');
        getPreciseFix(10000).then((fix) => applyPreciseFix(fix, true)).catch(() => {});
      }
      resolve(state.coords);
      return;
    }

    // هنوز موقعیتی ذخیره نشده: تا مشخص شدن، مقدار پیش‌فرض ادمین نشان داده می‌شود
    const s0 = state.settings || {};
    if (s0.latitude && s0.longitude && !state.coords) {
      state.coords = { lat: parseFloat(s0.latitude), lng: parseFloat(s0.longitude) };
      state.activeCityName = s0.city_name || null;
      setLocationLabel('بر اساس شهر پیش‌فرض' + (s0.city_name ? ' (' + s0.city_name + ')' : '') + ' — در حال یافتن موقعیت دقیق...');
      refreshQiblaCompassIfReady();
      computePrayerTimes();
    }

    // اگر کاربر قبلاً دسترسی را رد کرده، دیگر خودکار نمی‌پرسیم (فقط با دکمهٔ «موقعیت دقیق من»)
    if (!navigator.geolocation || skipLiveGPS || autoGpsTriedThisLaunch || localStorage.getItem('arefanejam_geo_denied')) { return useAdminLocation(); }
    autoGpsTriedThisLaunch = true;

    getPreciseFix(10000).then((fix) => {
      applyPreciseFix(fix, false);
      resolve(state.coords);
    }).catch((err) => {
      if (err && err.code === 1) {
        try { localStorage.setItem('arefanejam_geo_denied', '1'); } catch (e) {}
        setLocationLabel('دسترسی به موقعیت مکانی رد شده است. از دکمهٔ «موقعیت دقیق من» یا انتخاب شهر استفاده کنید.');
      }
      useAdminLocation();
    });
  });
}

// نتیجهٔ یک موقعیت دقیق GPS را ذخیره و در همه‌جا (اذان، قبله) اعمال می‌کند
function applyPreciseFix(fix, silent) {
  const coords = { lat: fix.lat, lng: fix.lng };
  state.coords = coords;
  state.manualCity = null;
  try { localStorage.removeItem('arefanejam_manual_city'); localStorage.removeItem('arefanejam_geo_denied'); } catch (e) {}
  const nearest = findNearestCity(coords.lat, coords.lng);
  state.activeCityName = nearest ? nearest.name : null;
  const label = nearest ? `موقعیت دقیق شما (نزدیک‌ترین شهر: ${nearest.name})` : 'بر اساس موقعیت مکانی دستگاه شما';
  saveCoordsCache(coords, label, { precise: true, acc: Math.round(fix.accuracy || 0), alt: fix.altitude || 0 });
  setLocationLabel(label);
  refreshQiblaCompassIfReady();
  computePrayerTimes();
}

function setupLocation(skipLiveGPS) {
  resolveCoordinates(skipLiveGPS).then((coords) => { if (coords) computePrayerTimes(); });
}

/* ---------- انتخاب شهر دستی ---------- */
function populateCityList(filter) {
  const listEl = document.getElementById('city-list');
  listEl.innerHTML = '';
  const cities = (window.IRAN_CITIES || []).filter((c) => !filter || c.name.includes(filter));
  cities.slice(0, 60).forEach((c) => {
    const row = document.createElement('div');
    row.className = 'city-row';
    row.textContent = c.name;
    row.addEventListener('click', () => {
      state.manualCity = c;
      state.activeCityName = c.name;
      localStorage.setItem('arefanejam_manual_city', JSON.stringify(c));
      state.coords = { lat: c.lat, lng: c.lng };
      saveCoordsCache(state.coords, 'شهر انتخابی: ' + c.name);
      setLocationLabel('شهر انتخابی: ' + c.name);
      // بلافاصله و در پس‌زمینه به‌روزرسانی می‌شود؛ کاربر نیازی به بستن/بازکردن اپ ندارد
      refreshQiblaCompassIfReady();
      document.getElementById('city-modal').classList.add('hidden');
      computePrayerTimes();
      if (currentTab === 'qibla') {
        autoStartQibla();
        const qiblaCityBtn = document.getElementById('qibla-city-picker-btn');
        if (qiblaCityBtn) {
          qiblaCityBtn.classList.add('is-success');
          setTimeout(() => qiblaCityBtn.classList.remove('is-success'), 650);
        }
      }
    });
    listEl.appendChild(row);
  });
}
document.getElementById('city-picker-btn').addEventListener('click', () => {
  populateCityList('');
  document.getElementById('city-modal').classList.remove('hidden');
});
document.getElementById('city-search-input').addEventListener('input', (e) => populateCityList(e.target.value.trim()));
document.getElementById('city-cancel-btn').addEventListener('click', () => document.getElementById('city-modal').classList.add('hidden'));

/* ---------- گزارش اختلاف ساعت اذان (زیر اوقات اذان) ---------- */
function azrFillCities() {
  const sel = document.getElementById('azr-city');
  if (!sel) return;
  const cur = (typeof effectiveCityName === 'function' ? effectiveCityName() : '') || state.activeCityName || '';
  const names = (window.IRAN_CITIES || []).map((c) => c.name).sort((a, b) => a.localeCompare(b, 'fa'));
  if (cur && names.indexOf(cur) < 0) names.unshift(cur);
  const prev = sel.value;
  sel.innerHTML = '';
  names.forEach((n) => { const o = document.createElement('option'); o.value = n; o.textContent = n; sel.appendChild(o); });
  sel.value = prev && names.indexOf(prev) >= 0 ? prev : (cur && names.indexOf(cur) >= 0 ? cur : names[0] || '');
}
(function setupAzanReport() {
  const btn = document.getElementById('azr-send');
  if (!btn) return;
  const msg = (t, ok) => { const m = document.getElementById('azr-msg'); m.textContent = t || ''; m.className = 'azr-msg' + (t ? (ok ? ' is-ok' : ' is-err') : ''); };
  azrFillCities();
  const card = document.getElementById('azan-report-card');
  if (card) card.addEventListener('focusin', azrFillCities, { once: true });
  btn.addEventListener('click', async () => {
    const city = document.getElementById('azr-city').value;
    const prayer = document.getElementById('azr-prayer').value;
    const time = document.getElementById('azr-time').value;
    if (!city) { msg('شهر را انتخاب کنید.'); return; }
    if (!/^\d{2}:\d{2}$/.test(time)) { msg('ساعت صحیح را وارد کنید.'); return; }
    if (navigator.onLine === false) { msg('برای ارسال به اینترنت نیاز است.'); return; }
    let appTime = '';
    try {
      const p = (lastPrayerList || []).find((x) => x.key === prayer);
      if (p && p.time) appTime = formatTime(p.time);
    } catch (e) {}
    const now = new Date();
    const j = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
    btn.disabled = true; msg('در حال ارسال...', true);
    try {
      const device_id = await ensureDeviceId();
      await apiFetch('/azan-report', { method: 'POST', body: JSON.stringify({ device_id, city, prayer, time, app_time: appTime, jy: j[0], jm: j[1], jd: j[2], app_version: String(window.NATIVE_APP_VERSION || '') }) });
      msg('ممنون! گزارش شما ارسال شد و پس از بررسی، ساعت اصلاح می‌شود.', true);
      document.getElementById('azr-time').value = '';
    } catch (e) {
      msg((e && e.message) ? String(e.message).slice(0, 120) : 'ارسال نشد. دوباره تلاش کنید.');
    }
    btn.disabled = false;
  });
})();

function findNearestCity(lat, lng) {
  let nearest = null, minDist = Infinity;
  (window.IRAN_CITIES || []).forEach((c) => {
    const d = Math.pow(c.lat - lat, 2) + Math.pow(c.lng - lng, 2);
    if (d < minDist) { minDist = d; nearest = c; }
  });
  return nearest;
}

function fetchExactGPSLocation(onDone) {
  if (!navigator.geolocation) { onDone('دستگاه یا مرورگر شما از GPS پشتیبانی نمی‌کند.'); return; }
  getPreciseFix(10000).then((fix) => {
    applyPreciseFix(fix, false);
    if (currentTab === 'qibla') autoStartQibla();
    onDone(null);
  }).catch((err) => {
    const messages = {
      1: 'دسترسی به موقعیت مکانی رد شده است. از تنظیمات گوشی، مجوز «مکان» اپ را روی مجاز بگذارید.',
      2: 'موقعیت مکانی در دسترس نیست (GPS گوشی را روشن کنید).',
      3: 'زمان جست‌وجوی موقعیت به پایان رسید. بیرون از ساختمان یا کنار پنجره دوباره امتحان کنید.',
    };
    if (err && err.code === 1) { try { localStorage.setItem('arefanejam_geo_denied', '1'); } catch (e) {} }
    onDone(messages[err && err.code] || ('خطای ناشناخته در دریافت موقعیت (کد ' + (err && err.code) + ')'));
  });
}

document.getElementById('azan-gps-btn').addEventListener('click', () => {
  const btn = document.getElementById('azan-gps-btn');
  const original = btn.textContent;
  btn.textContent = 'در حال یافتن موقعیت...';
  fetchExactGPSLocation((error) => {
    btn.textContent = original;
    if (error) setLocationLabel(error);
  });
});

document.getElementById('azan-share-btn').addEventListener('click', openAzanShareChoiceModal);

document.getElementById('city-gps-btn').addEventListener('click', () => {
  const btn = document.getElementById('city-gps-btn');
  btn.textContent = 'در حال یافتن موقعیت...';
  fetchExactGPSLocation((error) => {
    btn.textContent = '📍 شهر من در فهرست نیست — یافتن موقعیت دقیق با GPS';
    if (error) { btn.textContent = error; }
    else { document.getElementById('city-modal').classList.add('hidden'); }
  });
});

// دکمه‌های موقعیت مکانی در خودِ تب «قبله‌نما» — کاربر می‌تواند بدون رفتن به تب اذان،
// شهر خود را از فهرست یا با GPS مشخص کند و قبله‌نما همان لحظه به‌روزرسانی می‌شود
document.getElementById('qibla-city-picker-btn').addEventListener('click', () => {
  populateCityList('');
  document.getElementById('city-modal').classList.remove('hidden');
});

document.getElementById('home-location-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  populateCityList('');
  document.getElementById('city-modal').classList.remove('hidden');
});


try {
  const savedCity = JSON.parse(localStorage.getItem('arefanejam_manual_city') || 'null');
  if (savedCity) state.manualCity = savedCity;
} catch (e) {}

/* ---------- محاسبه و نمایش اوقات ---------- */
// اوقات شرعی دقیق تربت‌جام برای سال ۱۴۰۵ (منبع: جدول رسمی PDF کاربر)
// ترتیب هر مقدار: [فجر, طلوع, ظهر شرعی, عصر حنفی, مغرب/غروب, عشاء]
// کلید: ماه‌روز شمسی (MM-DD) — این جدول هرساله در همین تاریخ‌های شمسی دوباره استفاده می‌شود
const TORBAT_JAM_EXACT_TIMES = {
  "01-01": ["04:22","05:31","11:35","15:55","17:39","18:49"],
  "01-02": ["04:20","05:30","11:35","15:55","17:40","18:50"],
  "01-03": ["04:19","05:29","11:35","15:56","17:41","18:51"],
  "01-04": ["04:17","05:27","11:34","15:56","17:42","18:52"],
  "01-05": ["04:16","05:26","11:34","15:57","17:42","18:53"],
  "01-06": ["04:14","05:24","11:34","15:57","17:43","18:53"],
  "01-07": ["04:13","05:23","11:33","15:58","17:44","18:54"],
  "01-08": ["04:11","05:21","11:33","15:59","17:45","18:55"],
  "01-09": ["04:10","05:20","11:33","15:59","17:46","18:56"],
  "01-10": ["04:08","05:19","11:33","16:00","17:46","18:57"],
  "01-11": ["04:07","05:17","11:32","16:00","17:47","18:58"],
  "01-12": ["04:05","05:16","11:32","16:01","17:48","18:59"],
  "01-13": ["04:03","05:14","11:32","16:01","17:49","19:00"],
  "01-14": ["04:02","05:13","11:31","16:01","17:50","19:01"],
  "01-15": ["04:00","05:12","11:31","16:02","17:50","19:02"],
  "01-16": ["03:59","05:10","11:31","16:02","17:51","19:02"],
  "01-17": ["03:57","05:09","11:30","16:03","17:52","19:03"],
  "01-18": ["03:56","05:07","11:30","16:03","17:53","19:04"],
  "01-19": ["03:54","05:06","11:30","16:04","17:53","19:05"],
  "01-20": ["03:53","05:05","11:29","16:04","17:54","19:06"],
  "01-21": ["03:51","05:03","11:29","16:05","17:55","19:07"],
  "01-22": ["03:50","05:02","11:29","16:05","17:56","19:08"],
  "01-23": ["03:48","05:00","11:29","16:06","17:57","19:09"],
  "01-24": ["03:47","04:59","11:28","16:06","17:57","19:10"],
  "01-25": ["03:45","04:58","11:28","16:06","17:58","19:11"],
  "01-26": ["03:44","04:56","11:28","16:07","17:59","19:12"],
  "01-27": ["03:42","04:55","11:27","16:07","18:00","19:13"],
  "01-28": ["03:40","04:54","11:27","16:08","18:01","19:14"],
  "01-29": ["03:39","04:53","11:27","16:08","18:01","19:15"],
  "01-30": ["03:38","04:51","11:27","16:08","18:02","19:16"],
  "01-31": ["03:36","04:50","11:27","16:09","18:03","19:17"],
  "02-01": ["03:35","04:49","11:26","16:09","18:04","19:18"],
  "02-02": ["03:33","04:48","11:26","16:10","18:05","19:19"],
  "02-03": ["03:32","04:46","11:26","16:10","18:05","19:20"],
  "02-04": ["03:30","04:45","11:26","16:11","18:06","19:21"],
  "02-05": ["03:29","04:44","11:25","16:11","18:07","19:22"],
  "02-06": ["03:27","04:43","11:25","16:11","18:08","19:23"],
  "02-07": ["03:26","04:42","11:25","16:12","18:09","19:24"],
  "02-08": ["03:25","04:40","11:25","16:12","18:09","19:25"],
  "02-09": ["03:23","04:39","11:25","16:13","18:10","19:26"],
  "02-10": ["03:22","04:38","11:25","16:13","18:11","19:27"],
  "02-11": ["03:21","04:37","11:24","16:13","18:12","19:28"],
  "02-12": ["03:19","04:36","11:24","16:14","18:13","19:30"],
  "02-13": ["03:18","04:35","11:24","16:14","18:14","19:31"],
  "02-14": ["03:17","04:34","11:24","16:15","18:14","19:32"],
  "02-15": ["03:15","04:33","11:24","16:15","18:15","19:33"],
  "02-16": ["03:14","04:32","11:24","16:16","18:16","19:34"],
  "02-17": ["03:13","04:31","11:24","16:16","18:17","19:35"],
  "02-18": ["03:12","04:30","11:24","16:16","18:18","19:36"],
  "02-19": ["03:10","04:29","11:24","16:17","18:18","19:37"],
  "02-20": ["03:09","04:28","11:24","16:17","18:19","19:38"],
  "02-21": ["03:08","04:27","11:24","16:18","18:20","19:39"],
  "02-22": ["03:07","04:26","11:24","16:18","18:21","19:40"],
  "02-23": ["03:06","04:25","11:24","16:18","18:22","19:41"],
  "02-24": ["03:05","04:25","11:24","16:19","18:22","19:42"],
  "02-25": ["03:04","04:24","11:24","16:19","18:23","19:43"],
  "02-26": ["03:03","04:23","11:24","16:20","18:24","19:45"],
  "02-27": ["03:02","04:22","11:24","16:20","18:25","19:46"],
  "02-28": ["03:01","04:22","11:24","16:20","18:26","19:47"],
  "02-29": ["03:00","04:21","11:24","16:21","18:26","19:48"],
  "02-30": ["02:59","04:20","11:24","16:21","18:27","19:49"],
  "02-31": ["02:58","04:20","11:24","16:22","18:28","19:50"],
  "03-01": ["02:57","04:19","11:24","16:22","18:29","19:51"],
  "03-02": ["02:56","04:18","11:24","16:23","18:29","19:52"],
  "03-03": ["02:55","04:18","11:24","16:23","18:30","19:53"],
  "03-04": ["02:54","04:17","11:24","16:23","18:31","19:54"],
  "03-05": ["02:54","04:17","11:24","16:24","18:32","19:55"],
  "03-06": ["02:53","04:16","11:24","16:24","18:32","19:56"],
  "03-07": ["02:52","04:16","11:24","16:24","18:33","19:57"],
  "03-08": ["02:52","04:15","11:25","16:25","18:34","19:57"],
  "03-09": ["02:51","04:15","11:25","16:25","18:34","19:58"],
  "03-10": ["02:50","04:15","11:25","16:26","18:35","19:59"],
  "03-11": ["02:50","04:14","11:25","16:26","18:36","20:00"],
  "03-12": ["02:49","04:14","11:25","16:26","18:36","20:01"],
  "03-13": ["02:49","04:14","11:25","16:27","18:37","20:02"],
  "03-14": ["02:48","04:13","11:25","16:27","18:38","20:03"],
  "03-15": ["02:48","04:13","11:26","16:28","18:38","20:03"],
  "03-16": ["02:47","04:13","11:26","16:28","18:39","20:04"],
  "03-17": ["02:47","04:13","11:26","16:28","18:39","20:05"],
  "03-18": ["02:47","04:12","11:26","16:29","18:40","20:05"],
  "03-19": ["02:47","04:12","11:26","16:29","18:40","20:06"],
  "03-20": ["02:46","04:12","11:26","16:29","18:41","20:07"],
  "03-21": ["02:46","04:12","11:27","16:30","18:41","20:07"],
  "03-22": ["02:46","04:12","11:27","16:30","18:42","20:08"],
  "03-23": ["02:46","04:12","11:27","16:30","18:42","20:08"],
  "03-24": ["02:46","04:12","11:27","16:30","18:43","20:09"],
  "03-25": ["02:46","04:12","11:28","16:31","18:43","20:09"],
  "03-26": ["02:46","04:12","11:28","16:31","18:43","20:10"],
  "03-27": ["02:46","04:12","11:28","16:31","18:44","20:10"],
  "03-28": ["02:46","04:12","11:28","16:32","18:44","20:11"],
  "03-29": ["02:46","04:12","11:28","16:32","18:44","20:11"],
  "03-30": ["02:46","04:13","11:29","16:32","18:45","20:11"],
  "03-31": ["02:46","04:13","11:29","16:32","18:45","20:12"],
  "04-01": ["02:46","04:13","11:29","16:33","18:45","20:12"],
  "04-02": ["02:47","04:13","11:29","16:33","18:45","20:12"],
  "04-03": ["02:47","04:13","11:29","16:33","18:46","20:12"],
  "04-04": ["02:47","04:14","11:30","16:33","18:46","20:12"],
  "04-05": ["02:47","04:14","11:30","16:33","18:46","20:12"],
  "04-06": ["02:48","04:14","11:30","16:34","18:46","20:12"],
  "04-07": ["02:48","04:15","11:30","16:34","18:46","20:12"],
  "04-08": ["02:49","04:15","11:31","16:34","18:46","20:12"],
  "04-09": ["02:49","04:15","11:31","16:34","18:46","20:12"],
  "04-10": ["02:50","04:16","11:31","16:34","18:46","20:12"],
  "04-11": ["02:50","04:16","11:31","16:34","18:46","20:12"],
  "04-12": ["02:51","04:17","11:31","16:34","18:46","20:12"],
  "04-13": ["02:51","04:17","11:32","16:34","18:46","20:12"],
  "04-14": ["02:52","04:18","11:32","16:34","18:46","20:12"],
  "04-15": ["02:53","04:18","11:32","16:34","18:46","20:11"],
  "04-16": ["02:53","04:19","11:32","16:34","18:45","20:11"],
  "04-17": ["02:54","04:19","11:32","16:34","18:45","20:11"],
  "04-18": ["02:55","04:20","11:32","16:34","18:45","20:10"],
  "04-19": ["02:55","04:20","11:33","16:34","18:45","20:10"],
  "04-20": ["02:56","04:21","11:33","16:34","18:44","20:09"],
  "04-21": ["02:57","04:22","11:33","16:34","18:44","20:09"],
  "04-22": ["02:58","04:22","11:33","16:34","18:44","20:08"],
  "04-23": ["02:59","04:23","11:33","16:34","18:43","20:08"],
  "04-24": ["03:00","04:23","11:33","16:34","18:43","20:07"],
  "04-25": ["03:00","04:24","11:33","16:34","18:43","20:06"],
  "04-26": ["03:01","04:25","11:33","16:34","18:42","20:06"],
  "04-27": ["03:02","04:25","11:34","16:33","18:42","20:05"],
  "04-28": ["03:03","04:26","11:34","16:33","18:41","20:04"],
  "04-29": ["03:04","04:27","11:34","16:33","18:41","20:03"],
  "04-30": ["03:05","04:28","11:34","16:33","18:40","20:03"],
  "04-31": ["03:06","04:28","11:34","16:33","18:40","20:02"],
  "05-01": ["03:07","04:29","11:34","16:32","18:39","20:01"],
  "05-02": ["03:08","04:30","11:34","16:32","18:38","20:00"],
  "05-03": ["03:09","04:30","11:34","16:32","18:38","19:59"],
  "05-04": ["03:10","04:31","11:34","16:31","18:37","19:58"],
  "05-05": ["03:11","04:32","11:34","16:31","18:36","19:57"],
  "05-06": ["03:12","04:33","11:34","16:31","18:35","19:56"],
  "05-07": ["03:13","04:33","11:34","16:30","18:35","19:55"],
  "05-08": ["03:14","04:34","11:34","16:30","18:34","19:54"],
  "05-09": ["03:15","04:35","11:34","16:29","18:33","19:53"],
  "05-10": ["03:16","04:36","11:34","16:29","18:32","19:52"],
  "05-11": ["03:17","04:37","11:34","16:28","18:31","19:51"],
  "05-12": ["03:18","04:37","11:34","16:28","18:30","19:50"],
  "05-13": ["03:19","04:38","11:34","16:27","18:30","19:48"],
  "05-14": ["03:20","04:39","11:34","16:27","18:29","19:47"],
  "05-15": ["03:21","04:40","11:34","16:26","18:28","19:46"],
  "05-16": ["03:22","04:40","11:34","16:26","18:27","19:45"],
  "05-17": ["03:23","04:41","11:33","16:25","18:26","19:44"],
  "05-18": ["03:24","04:42","11:33","16:25","18:25","19:42"],
  "05-19": ["03:25","04:43","11:33","16:24","18:24","19:41"],
  "05-20": ["03:26","04:43","11:33","16:23","18:23","19:40"],
  "05-21": ["03:27","04:44","11:33","16:23","18:22","19:38"],
  "05-22": ["03:28","04:45","11:33","16:22","18:20","19:37"],
  "05-23": ["03:29","04:46","11:33","16:21","18:19","19:36"],
  "05-24": ["03:30","04:47","11:32","16:20","18:18","19:34"],
  "05-25": ["03:31","04:47","11:32","16:20","18:17","19:33"],
  "05-26": ["03:32","04:48","11:32","16:19","18:16","19:31"],
  "05-27": ["03:33","04:49","11:32","16:18","18:15","19:30"],
  "05-28": ["03:34","04:50","11:32","16:17","18:13","19:29"],
  "05-29": ["03:35","04:50","11:31","16:16","18:12","19:27"],
  "05-30": ["03:36","04:51","11:31","16:16","18:11","19:26"],
  "05-31": ["03:37","04:52","11:31","16:15","18:10","19:24"],
  "06-01": ["03:38","04:53","11:31","16:14","18:08","19:23"],
  "06-02": ["03:39","04:53","11:30","16:13","18:07","19:21"],
  "06-03": ["03:40","04:54","11:30","16:12","18:06","19:20"],
  "06-04": ["03:41","04:55","11:30","16:11","18:05","19:18"],
  "06-05": ["03:42","04:56","11:29","16:10","18:03","19:17"],
  "06-06": ["03:43","04:56","11:29","16:09","18:02","19:15"],
  "06-07": ["03:44","04:57","11:29","16:08","18:01","19:14"],
  "06-08": ["03:45","04:58","11:29","16:07","17:59","19:12"],
  "06-09": ["03:46","04:59","11:28","16:06","17:58","19:11"],
  "06-10": ["03:47","04:59","11:28","16:05","17:56","19:09"],
  "06-11": ["03:48","05:00","11:28","16:04","17:55","19:07"],
  "06-12": ["03:49","05:01","11:27","16:03","17:54","19:06"],
  "06-13": ["03:49","05:01","11:27","16:02","17:52","19:04"],
  "06-14": ["03:50","05:02","11:27","16:01","17:51","19:03"],
  "06-15": ["03:51","05:03","11:26","16:00","17:49","19:01"],
  "06-16": ["03:52","05:04","11:26","15:59","17:48","19:00"],
  "06-17": ["03:53","05:04","11:25","15:58","17:47","18:58"],
  "06-18": ["03:54","05:05","11:25","15:57","17:45","18:56"],
  "06-19": ["03:55","05:06","11:25","15:55","17:44","18:55"],
  "06-20": ["03:55","05:06","11:24","15:54","17:42","18:53"],
  "06-21": ["03:56","05:07","11:24","15:53","17:41","18:52"],
  "06-22": ["03:57","05:08","11:24","15:52","17:39","18:50"],
  "06-23": ["03:58","05:09","11:23","15:51","17:38","18:49"],
  "06-24": ["03:59","05:09","11:23","15:50","17:36","18:47"],
  "06-25": ["04:00","05:10","11:22","15:48","17:35","18:45"],
  "06-26": ["04:00","05:11","11:22","15:47","17:33","18:44"],
  "06-27": ["04:01","05:11","11:22","15:46","17:32","18:42"],
  "06-28": ["04:02","05:12","11:21","15:45","17:31","18:41"],
  "06-29": ["04:03","05:13","11:21","15:44","17:29","18:39"],
  "06-30": ["04:04","05:14","11:21","15:42","17:28","18:38"],
  "06-31": ["04:04","05:14","11:20","15:41","17:26","18:36"],
  "07-01": ["04:05","05:15","11:20","15:40","17:25","18:34"],
  "07-02": ["04:06","05:16","11:19","15:39","17:23","18:33"],
  "07-03": ["04:07","05:17","11:19","15:38","17:22","18:31"],
  "07-04": ["04:08","05:17","11:19","15:36","17:20","18:30"],
  "07-05": ["04:08","05:18","11:18","15:35","17:19","18:28"],
  "07-06": ["04:09","05:19","11:18","15:34","17:17","18:27"],
  "07-07": ["04:10","05:20","11:18","15:33","17:16","18:25"],
  "07-08": ["04:11","05:20","11:17","15:31","17:14","18:24"],
  "07-09": ["04:12","05:21","11:17","15:30","17:13","18:23"],
  "07-10": ["04:12","05:22","11:17","15:29","17:12","18:21"],
  "07-11": ["04:13","05:23","11:16","15:28","17:10","18:20"],
  "07-12": ["04:14","05:23","11:16","15:26","17:09","18:18"],
  "07-13": ["04:15","05:24","11:16","15:25","17:07","18:17"],
  "07-14": ["04:15","05:25","11:15","15:24","17:06","18:15"],
  "07-15": ["04:16","05:26","11:15","15:23","17:05","18:14"],
  "07-16": ["04:17","05:27","11:15","15:22","17:03","18:13"],
  "07-17": ["04:18","05:27","11:15","15:20","17:02","18:11"],
  "07-18": ["04:19","05:28","11:14","15:19","17:00","18:10"],
  "07-19": ["04:19","05:29","11:14","15:18","16:59","18:09"],
  "07-20": ["04:20","05:30","11:14","15:17","16:58","18:07"],
  "07-21": ["04:21","05:31","11:14","15:16","16:56","18:06"],
  "07-22": ["04:22","05:32","11:13","15:14","16:55","18:05"],
  "07-23": ["04:23","05:32","11:13","15:13","16:54","18:03"],
  "07-24": ["04:24","05:33","11:13","15:12","16:53","18:02"],
  "07-25": ["04:24","05:34","11:13","15:11","16:51","18:01"],
  "07-26": ["04:25","05:35","11:12","15:10","16:50","18:00"],
  "07-27": ["04:26","05:36","11:12","15:09","16:49","17:59"],
  "07-28": ["04:27","05:37","11:12","15:08","16:48","17:57"],
  "07-29": ["04:28","05:38","11:12","15:06","16:46","17:56"],
  "07-30": ["04:28","05:39","11:12","15:05","16:45","17:55"],
  "08-01": ["04:29","05:39","11:12","15:04","16:44","17:54"],
  "08-02": ["04:30","05:40","11:12","15:03","16:43","17:53"],
  "08-03": ["04:31","05:41","11:11","15:02","16:42","17:52"],
  "08-04": ["04:32","05:42","11:11","15:01","16:41","17:51"],
  "08-05": ["04:33","05:43","11:11","15:00","16:39","17:50"],
  "08-06": ["04:34","05:44","11:11","14:59","16:38","17:49"],
  "08-07": ["04:34","05:45","11:11","14:58","16:37","17:48"],
  "08-08": ["04:35","05:46","11:11","14:57","16:36","17:47"],
  "08-09": ["04:36","05:47","11:11","14:56","16:35","17:46"],
  "08-10": ["04:37","05:48","11:11","14:55","16:34","17:45"],
  "08-11": ["04:38","05:49","11:11","14:54","16:33","17:44"],
  "08-12": ["04:39","05:50","11:11","14:53","16:32","17:43"],
  "08-13": ["04:40","05:51","11:11","14:53","16:31","17:43"],
  "08-14": ["04:41","05:52","11:11","14:52","16:30","17:42"],
  "08-15": ["04:41","05:53","11:11","14:51","16:30","17:41"],
  "08-16": ["04:42","05:54","11:11","14:50","16:29","17:40"],
  "08-17": ["04:43","05:55","11:11","14:49","16:28","17:40"],
  "08-18": ["04:44","05:56","11:11","14:48","16:27","17:39"],
  "08-19": ["04:45","05:57","11:12","14:48","16:26","17:38"],
  "08-20": ["04:46","05:58","11:12","14:47","16:25","17:38"],
  "08-21": ["04:47","05:59","11:12","14:46","16:25","17:37"],
  "08-22": ["04:48","06:00","11:12","14:46","16:24","17:36"],
  "08-23": ["04:48","06:01","11:12","14:45","16:23","17:36"],
  "08-24": ["04:49","06:02","11:12","14:44","16:23","17:35"],
  "08-25": ["04:50","06:03","11:13","14:44","16:22","17:35"],
  "08-26": ["04:51","06:04","11:13","14:43","16:21","17:34"],
  "08-27": ["04:52","06:05","11:13","14:42","16:21","17:34"],
  "08-28": ["04:53","06:06","11:13","14:42","16:20","17:33"],
  "08-29": ["04:54","06:07","11:13","14:41","16:20","17:33"],
  "08-30": ["04:55","06:08","11:14","14:41","16:19","17:33"],
  "09-01": ["04:56","06:09","11:14","14:41","16:19","17:32"],
  "09-02": ["04:56","06:10","11:14","14:40","16:18","17:32"],
  "09-03": ["04:57","06:11","11:14","14:40","16:18","17:32"],
  "09-04": ["04:58","06:12","11:15","14:39","16:18","17:32"],
  "09-05": ["04:59","06:13","11:15","14:39","16:17","17:31"],
  "09-06": ["05:00","06:14","11:15","14:39","16:17","17:31"],
  "09-07": ["05:01","06:15","11:16","14:38","16:17","17:31"],
  "09-08": ["05:01","06:16","11:16","14:38","16:16","17:31"],
  "09-09": ["05:02","06:17","11:16","14:38","16:16","17:31"],
  "09-10": ["05:03","06:18","11:17","14:38","16:16","17:31"],
  "09-11": ["05:04","06:18","11:17","14:38","16:16","17:30"],
  "09-12": ["05:05","06:19","11:18","14:37","16:16","17:30"],
  "09-13": ["05:05","06:20","11:18","14:37","16:16","17:30"],
  "09-14": ["05:06","06:21","11:18","14:37","16:16","17:30"],
  "09-15": ["05:07","06:22","11:19","14:37","16:16","17:31"],
  "09-16": ["05:08","06:23","11:19","14:37","16:16","17:31"],
  "09-17": ["05:08","06:23","11:20","14:37","16:16","17:31"],
  "09-18": ["05:09","06:24","11:20","14:37","16:16","17:31"],
  "09-19": ["05:10","06:25","11:20","14:37","16:16","17:31"],
  "09-20": ["05:10","06:26","11:21","14:38","16:16","17:31"],
  "09-21": ["05:11","06:26","11:21","14:38","16:16","17:31"],
  "09-22": ["05:12","06:27","11:22","14:38","16:16","17:32"],
  "09-23": ["05:12","06:28","11:22","14:38","16:16","17:32"],
  "09-24": ["05:13","06:29","11:23","14:38","16:17","17:32"],
  "09-25": ["05:14","06:29","11:23","14:39","16:17","17:32"],
  "09-26": ["05:14","06:30","11:23","14:39","16:17","17:33"],
  "09-27": ["05:15","06:30","11:24","14:39","16:18","17:33"],
  "09-28": ["05:15","06:31","11:24","14:40","16:18","17:34"],
  "09-29": ["05:16","06:31","11:25","14:40","16:18","17:34"],
  "09-30": ["05:16","06:32","11:25","14:40","16:19","17:34"],
  "10-01": ["05:17","06:32","11:26","14:41","16:19","17:35"],
  "10-02": ["05:17","06:33","11:26","14:41","16:20","17:35"],
  "10-03": ["05:18","06:33","11:27","14:42","16:20","17:36"],
  "10-04": ["05:18","06:34","11:27","14:42","16:21","17:36"],
  "10-05": ["05:19","06:34","11:28","14:43","16:21","17:37"],
  "10-06": ["05:19","06:34","11:28","14:43","16:22","17:37"],
  "10-07": ["05:19","06:35","11:29","14:44","16:22","17:38"],
  "10-08": ["05:20","06:35","11:29","14:45","16:23","17:39"],
  "10-09": ["05:20","06:35","11:29","14:45","16:24","17:39"],
  "10-10": ["05:20","06:36","11:30","14:46","16:24","17:40"],
  "10-11": ["05:20","06:36","11:30","14:47","16:25","17:40"],
  "10-12": ["05:21","06:36","11:31","14:47","16:26","17:41"],
  "10-13": ["05:21","06:36","11:31","14:48","16:26","17:42"],
  "10-14": ["05:21","06:36","11:32","14:49","16:27","17:42"],
  "10-15": ["05:21","06:36","11:32","14:50","16:28","17:43"],
  "10-16": ["05:21","06:36","11:33","14:50","16:29","17:44"],
  "10-17": ["05:21","06:36","11:33","14:51","16:30","17:45"],
  "10-18": ["05:21","06:36","11:33","14:52","16:30","17:45"],
  "10-19": ["05:22","06:36","11:34","14:53","16:31","17:46"],
  "10-20": ["05:22","06:36","11:34","14:54","16:32","17:47"],
  "10-21": ["05:22","06:36","11:35","14:55","16:33","17:48"],
  "10-22": ["05:21","06:36","11:35","14:56","16:34","17:49"],
  "10-23": ["05:21","06:36","11:35","14:57","16:35","17:49"],
  "10-24": ["05:21","06:36","11:36","14:58","16:36","17:50"],
  "10-25": ["05:21","06:35","11:36","14:58","16:37","17:51"],
  "10-26": ["05:21","06:35","11:36","14:59","16:38","17:52"],
  "10-27": ["05:21","06:35","11:37","15:00","16:39","17:53"],
  "10-28": ["05:21","06:35","11:37","15:01","16:40","17:54"],
  "10-29": ["05:20","06:34","11:37","15:02","16:41","17:54"],
  "10-30": ["05:20","06:34","11:38","15:03","16:42","17:55"],
  "11-01": ["05:20","06:33","11:38","15:04","16:43","17:56"],
  "11-02": ["05:20","06:33","11:38","15:05","16:44","17:57"],
  "11-03": ["05:19","06:33","11:39","15:06","16:45","17:58"],
  "11-04": ["05:19","06:32","11:39","15:07","16:46","17:59"],
  "11-05": ["05:19","06:32","11:39","15:08","16:47","18:00"],
  "11-06": ["05:18","06:31","11:39","15:09","16:48","18:01"],
  "11-07": ["05:18","06:31","11:40","15:10","16:49","18:02"],
  "11-08": ["05:17","06:30","11:40","15:11","16:50","18:03"],
  "11-09": ["05:17","06:29","11:40","15:12","16:51","18:03"],
  "11-10": ["05:16","06:29","11:40","15:13","16:52","18:04"],
  "11-11": ["05:16","06:28","11:40","15:14","16:53","18:05"],
  "11-12": ["05:15","06:27","11:41","15:16","16:54","18:06"],
  "11-13": ["05:14","06:27","11:41","15:17","16:55","18:07"],
  "11-14": ["05:14","06:26","11:41","15:18","16:56","18:08"],
  "11-15": ["05:13","06:25","11:41","15:19","16:57","18:09"],
  "11-16": ["05:12","06:24","11:41","15:20","16:58","18:10"],
  "11-17": ["05:12","06:23","11:41","15:21","16:59","18:11"],
  "11-18": ["05:11","06:23","11:41","15:22","17:00","18:12"],
  "11-19": ["05:10","06:22","11:42","15:23","17:01","18:13"],
  "11-20": ["05:10","06:21","11:42","15:24","17:02","18:14"],
  "11-21": ["05:09","06:20","11:42","15:25","17:03","18:15"],
  "11-22": ["05:08","06:19","11:42","15:26","17:04","18:16"],
  "11-23": ["05:07","06:18","11:42","15:26","17:06","18:16"],
  "11-24": ["05:06","06:17","11:42","15:27","17:07","18:17"],
  "11-25": ["05:05","06:16","11:42","15:28","17:08","18:18"],
  "11-26": ["05:04","06:15","11:42","15:29","17:09","18:19"],
  "11-27": ["05:03","06:14","11:42","15:30","17:10","18:20"],
  "11-28": ["05:02","06:13","11:42","15:31","17:11","18:21"],
  "11-29": ["05:01","06:12","11:42","15:32","17:12","18:22"],
  "11-30": ["05:00","06:11","11:42","15:33","17:13","18:23"],
  "12-01": ["04:59","06:10","11:42","15:34","17:14","18:24"],
  "12-02": ["04:58","06:08","11:41","15:35","17:15","18:25"],
  "12-03": ["04:57","06:07","11:41","15:36","17:15","18:26"],
  "12-04": ["04:56","06:06","11:41","15:36","17:16","18:26"],
  "12-05": ["04:55","06:05","11:41","15:37","17:17","18:27"],
  "12-06": ["04:54","06:04","11:41","15:38","17:18","18:28"],
  "12-07": ["04:53","06:02","11:41","15:39","17:19","18:29"],
  "12-08": ["04:51","06:01","11:41","15:40","17:20","18:30"],
  "12-09": ["04:50","06:00","11:41","15:41","17:21","18:31"],
  "12-10": ["04:49","05:59","11:40","15:41","17:22","18:32"],
  "12-11": ["04:48","05:57","11:40","15:42","17:23","18:33"],
  "12-12": ["04:47","05:56","11:40","15:43","17:24","18:33"],
  "12-13": ["04:45","05:55","11:40","15:44","17:25","18:34"],
  "12-14": ["04:44","05:54","11:40","15:44","17:26","18:35"],
  "12-15": ["04:43","05:52","11:39","15:45","17:27","18:36"],
  "12-16": ["04:41","05:51","11:39","15:46","17:27","18:37"],
  "12-17": ["04:40","05:50","11:39","15:47","17:28","18:38"],
  "12-18": ["04:39","05:48","11:39","15:47","17:29","18:39"],
  "12-19": ["04:37","05:47","11:38","15:48","17:30","18:40"],
  "12-20": ["04:36","05:45","11:38","15:49","17:31","18:40"],
  "12-21": ["04:35","05:44","11:38","15:49","17:32","18:41"],
  "12-22": ["04:33","05:43","11:38","15:50","17:33","18:42"],
  "12-23": ["04:32","05:41","11:37","15:51","17:33","18:43"],
  "12-24": ["04:30","05:40","11:37","15:51","17:34","18:44"],
  "12-25": ["04:29","05:39","11:37","15:52","17:35","18:45"],
  "12-26": ["04:28","05:37","11:37","15:52","17:36","18:46"],
  "12-27": ["04:26","05:36","11:36","15:53","17:37","18:46"],
  "12-28": ["04:25","05:34","11:36","15:54","17:38","18:47"],
  "12-29": ["04:23","05:33","11:36","15:54","17:38","18:48"],
};
const PRAYER_ICONS = { fajr: '🌙', sunrise: '🌅', dhuhr: '☀️', asr: '🌤', sunset: '🌆', maghrib: '🌇', isha: '✨' };
/* ---------- اشتراک‌گذاری اوقات شرعی همراه با یک آیهٔ قرآن ----------
   آیهٔ همراهِ اشتراک‌گذاری، هر روز یکی از تمام ۶۲۳۶ آیهٔ قرآن است (به‌ترتیبِ شمارهٔ
   روز سال) — دقیقاً همان آیه‌ای که در بخش «آیه امروز» (تب درس) نشان داده می‌شود؛
   کلید کش بین این دو بخش مشترک است تا یک‌بار گرفته‌شود و دوباره از شبکه خواسته نشود.
   ترتیب اولویت برای پیدا کردنِ آیه: ۱) کشِ امروز، ۲) دریافت از سرور (اگر آنلاین)،
   ۳) متنِ کاملِ آفلاینِ قرآن که قبلاً روی گوشی ذخیره شده (بخش «قرآن» → حالت فقط متن)،
   ۴) اگر هیچ‌کدام در دسترس نبود (مثلاً اولین بازِ کاملاً آفلاینِ اپ)، یکی از چند آیهٔ
   ثابتِ دربارهٔ نماز که همیشه همراه خودِ اپ است — تا اشتراک‌گذاری هرگز کاملاً بی‌آیه نماند. */
const PRAYER_VERSES = [
  { arabic: 'أَقِمِ الصَّلَاةَ لِدُلُوكِ الشَّمْسِ إِلَىٰ غَسَقِ اللَّيْلِ وَقُرْآنَ الْفَجْرِ', translation: 'نماز را از زوال آفتاب (ظهر) تا تاریکی شب برپا دار و همچنین قرآن فجر (نماز صبح) را.', ref: 'اسراء — آیه ۷۸' },
  { arabic: 'وَأَقِيمُوا الصَّلَاةَ وَآتُوا الزَّكَاةَ وَارْكَعُوا مَعَ الرَّاكِعِينَ', translation: 'و نماز برپا دارید و زکات بدهید و همراه رکوع‌کنندگان رکوع کنید.', ref: 'بقره — آیه ۴۳' },
  { arabic: 'إِنَّ الصَّلَاةَ تَنْهَىٰ عَنِ الْفَحْشَاءِ وَالْمُنكَرِ', translation: 'به‌راستی نماز از زشتی و ناپسندی بازمی‌دارد.', ref: 'عنکبوت — آیه ۴۵' },
  { arabic: 'حَافِظُوا عَلَى الصَّلَوَاتِ وَالصَّلَاةِ الْوُسْطَىٰ وَقُومُوا لِلَّهِ قَانِتِينَ', translation: 'بر نمازها و به‌ویژه نماز میانه مواظبت کنید و فروتنانه برای خدا بایستید.', ref: 'بقره — آیه ۲۳۸' },
  { arabic: 'وَاسْتَعِينُوا بِالصَّبْرِ وَالصَّلَاةِ ۚ وَإِنَّهَا لَكَبِيرَةٌ إِلَّا عَلَى الْخَاشِعِينَ', translation: 'از صبر و نماز یاری بجویید، و این کار جز بر فروتنان، سخت و گران است.', ref: 'بقره — آیه ۱۵۳' },
  { arabic: 'قَدْ أَفْلَحَ الْمُؤْمِنُونَ الَّذِينَ هُمْ فِي صَلَاتِهِمْ خَاشِعُونَ', translation: 'به‌راستی مؤمنانی که در نمازشان فروتن‌اند، رستگار شدند.', ref: 'مؤمنون — آیات ۱ و ۲' },
];
function getDailyPrayerVerse() {
  const d = new Date();
  const dayIndex = Math.floor(d.getTime() / 86400000); // شمارهٔ روز، برای ثابت‌ماندن آیه در طول یک روز
  return PRAYER_VERSES[dayIndex % PRAYER_VERSES.length];
}

let todayShareVerse = null;     // آیهٔ آمادهٔ امروز برای اشتراک‌گذاری (از کل قرآن)، یا null تا وقتی آماده شود
let todayShareVerseDate = '';   // برای اینکه بفهمیم این آیه مال همین امروز است یا باید دوباره ساخته شود

function shareVerseCacheKey() { return 'arefanejam_verse_' + new Date().toDateString(); }
function todaysAyahNumber() {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  return (dayOfYear % 6236) + 1; // بین ۱ تا ۶۲۳۶؛ یعنی طی حدود ۱۷ سال، همهٔ آیات قرآن یک‌بار پوشش داده می‌شوند
}
// از متن آفلاینِ ذخیره‌شدهٔ کل قرآن (۱۱۴ سوره)، آیهٔ با شمارهٔ سراسری داده‌شده را پیدا می‌کند
function resolveAyahFromOfflineSurahs(surahs, globalAyahNumber) {
  let remaining = globalAyahNumber;
  for (const sr of surahs) {
    const ayahs = sr.ayahs || [];
    if (remaining <= ayahs.length) {
      const ayah = ayahs[remaining - 1];
      return { arabic: ayah.text, translation: '', surah: sr.name, ayahNum: (ayah && ayah.numberInSurah) || remaining };
    }
    remaining -= ayahs.length;
  }
  return null;
}
// از همان لحظهٔ باز شدن اپ، آیهٔ امروز را آماده می‌کند تا لحظهٔ لمسِ دکمهٔ اشتراک‌گذاری
// چیزی از قبل حاضر باشد (منتظر شبکه یا دیتابیس نماند)
async function prepareTodayShareVerse() {
  const todayKey = new Date().toDateString();
  if (todayShareVerse && todayShareVerseDate === todayKey) return;
  const cacheKey = shareVerseCacheKey();
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try { todayShareVerse = JSON.parse(cached); todayShareVerseDate = todayKey; return; } catch (e) {}
  }
  const ayahNumber = todaysAyahNumber();
  try {
    const off = await offlineVerseWithTranslation(ayahNumber);
    if (off) { localStorage.setItem(cacheKey, JSON.stringify(off)); todayShareVerse = off; todayShareVerseDate = todayKey; return; }
  } catch (e) {}
  if (navigator.onLine) {
    try {
      const res = await fetch(`https://api.alquran.cloud/v1/ayah/${ayahNumber}/editions/quran-uthmani,fa.makarem`);
      const json = await res.json();
      const [arabic, translation] = json.data;
      const verseData = { arabic: arabic.text, translation: translation.text, surah: arabic.surah.name, ayahNum: arabic.numberInSurah };
      localStorage.setItem(cacheKey, JSON.stringify(verseData));
      todayShareVerse = verseData;
      todayShareVerseDate = todayKey;
      return;
    } catch (e) { /* شبکه جواب نداد؛ سراغ نسخهٔ آفلاین می‌رویم */ }
  }
  try {
    const offlineSurahs = await getOfflineQuranText();
    if (offlineSurahs) {
      const resolved = resolveAyahFromOfflineSurahs(offlineSurahs, ayahNumber);
      if (resolved) { todayShareVerse = resolved; todayShareVerseDate = todayKey; return; }
    }
  } catch (e) {}
  // هیچ‌کدام آماده نبود (مثلاً اولین بازِ کاملاً آفلاینِ اپ)؛ در همین حالت می‌ماند تا
  // buildAzanShareText خودش از آیهٔ ثابتِ پشتیبان (getDailyPrayerVerse) استفاده کند
}
function formatVerseRef(verse) {
  if (verse.ref) return verse.ref;
  if (verse.surah) return verse.surah + (verse.ayahNum ? ' — آیه ' + toPersianDigits(verse.ayahNum) : '');
  return '';
}

let lastPrayerList = [];
let lastPrayerCurrentKey = '';

/* متنِ نهاییِ اشتراک‌گذاری را از آخرین اوقات شرعیِ محاسبه‌شده (کاملاً محلی، بدون نیاز
   به شبکه) به‌همراه یک آیهٔ نماز می‌سازد. */
function buildAzanShareText() {
  const s = state.settings || {};
  const brand = s.brand_name || 'عارفان جام';
  const cityName = (state.activeCityName || '').trim();
  const cal = getCalendarStrings(iranWallNow());
  const NON_PRAYER_KEYS = ['sunrise', 'sunset'];

  const lines = [];
  lines.push('🕌 اوقات شرعی' + (cityName ? ' — ' + cityName : ''));
  lines.push('📅 ' + cal.jalali);
  lines.push('📅 ' + cal.gregorian);
  lines.push('📅 ' + cal.hijri);
  lines.push('');
  (lastPrayerList.length ? lastPrayerList : []).forEach((p) => {
    const marker = (!NON_PRAYER_KEYS.includes(p.key) && p.key === lastPrayerCurrentKey) ? ' ●' : '';
    lines.push((PRAYER_ICONS[p.key] || '') + ' ' + p.label + ': ' + formatTime(p.time) + marker);
  });

  const verse = todayShareVerse || getDailyPrayerVerse();
  lines.push('');
  lines.push('«' + verse.arabic + '»');
  if (verse.translation) lines.push(verse.translation);
  const verseRef = formatVerseRef(verse);
  if (verseRef) lines.push('— ' + verseRef);
  lines.push('');
  lines.push(brand);

  return lines.join('\n');
}

/* ---------- تصویر جدول‌مانندِ اوقات شرعی برای اشتراک‌گذاری ----------
   کاملاً با Canvas و به‌صورت محلی روی خودِ گوشی ساخته می‌شود (بدون نیاز به هیچ
   تصویر یا فونتِ خارجیِ غیرقابل‌کش، پس آفلاین هم کار می‌کند). نام هر نماز در یک
   ستون (سمت راست) و ساعتش دقیقاً روبه‌رویش (سمت چپ) با یک خط‌چین ظریف بین‌شان،
   شبیه یک جدول واقعی چیده می‌شود؛ ردیفِ نمازِ جاری با رنگ طلاییِ برند مشخص می‌شود. */
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function buildAzanShareCanvas() {
  const s = state.settings || {};
  const brand = s.brand_name || 'عارفان جام';
  const cityName = (state.activeCityName || '').trim();
  const cal = getCalendarStrings(iranWallNow());
  const NON_PRAYER_KEYS = ['sunrise', 'sunset'];
  const rows = lastPrayerList.length ? lastPrayerList : [];

  const EMERALD = '#143C36', EMERALD_LIGHT = '#1E5A50', GOLD = '#B08D4E', GOLD_LIGHT = '#D9BD87';
  const PAPER = '#FAF7F0', PAPER_ALT = '#F1EADA', INK = '#23302C', LINE = '#E2D8C0';

  const W = 720;
  const headerH = cityName ? 226 : 196;
  const rowH = 68;
  const footerH = 64;
  const H = headerH + rows.length * rowH + footerH;
  const R = 30;

  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.direction = 'rtl';
  ctx.textBaseline = 'middle';

  roundRectPath(ctx, 0, 0, W, H, R);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);

  // --- هدر: گرادیان زمردی هم‌رنگ نوتیفیکیشن ثابت اپ ---
  const grad = ctx.createLinearGradient(0, 0, 0, headerH);
  grad.addColorStop(0, EMERALD);
  grad.addColorStop(1, EMERALD_LIGHT);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, headerH);

  // نور مورب ظریف روی هدر
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.moveTo(-40, 0); ctx.lineTo(W * 0.6, 0); ctx.lineTo(W * 0.32, headerH); ctx.lineTo(-160, headerH);
  ctx.closePath(); ctx.fill();
  ctx.restore();

  // هلال ماه + ستارهٔ کوچک تزئینی، سمت چپِ هدر
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = GOLD_LIGHT;
  ctx.beginPath(); ctx.arc(64, 54, 22, 0, Math.PI * 2); ctx.fill();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath(); ctx.arc(72, 46, 17, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  drawStar(ctx, 100, 78, 5, GOLD_LIGHT, 0.85);

  // متن‌های هدر
  ctx.textAlign = 'center';
  ctx.fillStyle = GOLD_LIGHT;
  ctx.font = "700 30px 'Vazirmatn', sans-serif";
  ctx.fillText('🕌 ' + brand, W / 2, 56);

  let y = 92;
  if (cityName) {
    ctx.fillStyle = '#FFFFFF';
    ctx.font = "600 18px 'Vazirmatn', sans-serif";
    ctx.fillText(cityName, W / 2, y);
    y += 30;
  }
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.font = "500 16px 'Vazirmatn', sans-serif";
  [cal.jalali, cal.gregorian, cal.hijri].forEach((line) => { ctx.fillText(line, W / 2, y); y += 25; });

  // نوار طلاییِ نازک زیر هدر
  ctx.fillStyle = GOLD;
  ctx.fillRect(0, headerH - 6, W, 6);

  // --- ردیف‌های جدول ---
  const padX = 34;
  rows.forEach((p, i) => {
    const ry = headerH + i * rowH;
    const isCurrent = !NON_PRAYER_KEYS.includes(p.key) && p.key === lastPrayerCurrentKey;
    ctx.fillStyle = isCurrent ? '#F1E4C9' : (i % 2 === 0 ? PAPER : PAPER_ALT);
    ctx.fillRect(0, ry, W, rowH);
    if (isCurrent) { ctx.fillStyle = GOLD; ctx.fillRect(W - 6, ry, 6, rowH); }

    const labelText = (PRAYER_ICONS[p.key] || '') + '  ' + p.label;
    const timeText = formatTime(p.time);

    ctx.textAlign = 'right';
    ctx.font = (isCurrent ? '700 ' : '600 ') + '24px \'Vazirmatn\', sans-serif';
    ctx.fillStyle = isCurrent ? EMERALD : INK;
    ctx.fillText(labelText, W - padX, ry + rowH / 2);
    const labelW = ctx.measureText(labelText).width;

    ctx.textAlign = 'left';
    ctx.font = (isCurrent ? '700 ' : '600 ') + '24px \'Vazirmatn\', sans-serif';
    ctx.fillStyle = isCurrent ? EMERALD : '#4A5A55';
    ctx.fillText(timeText, padX, ry + rowH / 2);
    const timeW = ctx.measureText(timeText).width;

    // خط‌چینِ ظریفِ «جدول‌طور» بین نام و ساعت
    const dashStartX = W - padX - labelW - 14;
    const dashEndX = padX + timeW + 14;
    if (dashStartX > dashEndX) {
      ctx.save();
      ctx.strokeStyle = isCurrent ? 'rgba(176,141,78,0.55)' : LINE;
      ctx.lineWidth = 2;
      ctx.setLineDash([2, 6]);
      ctx.beginPath();
      ctx.moveTo(dashStartX, ry + rowH / 2);
      ctx.lineTo(dashEndX, ry + rowH / 2);
      ctx.stroke();
      ctx.restore();
    }

    if (i < rows.length - 1) {
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, ry + rowH); ctx.lineTo(W, ry + rowH);
      ctx.stroke();
    }
  });

  // --- فوتر ---
  const footerY = headerH + rows.length * rowH;
  ctx.fillStyle = PAPER_ALT;
  ctx.fillRect(0, footerY, W, footerH);
  ctx.fillStyle = GOLD;
  ctx.fillRect(0, footerY, W, 4);
  ctx.textAlign = 'center';
  ctx.fillStyle = EMERALD;
  ctx.font = "700 18px 'Vazirmatn', sans-serif";
  ctx.fillText(brand, W / 2, footerY + footerH / 2 + 2);

  ctx.restore(); // پایان clip گوشه‌های گرد
  return canvas;
}

function drawStar(ctx, cx, cy, r, color, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha != null ? alpha : 1;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? r : r / 2.3;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    const px = cx + radius * Math.cos(angle);
    const py = cy + radius * Math.sin(angle);
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

async function shareAzanTimesAsImage() {
  const s = state.settings || {};
  const title = (s.brand_name || 'عارفان جام') + ' — اوقات شرعی';
  const cal = getCalendarStrings(iranWallNow());
  const caption = title + '\n' + cal.jalali;

  try {
    const canvas = buildAzanShareCanvas();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (blob) {
      const file = new File([blob], 'azan-times.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ title, text: caption, files: [file] });
        return;
      }
      // مرورگر اشتراک‌گذاریِ فایل را پشتیبانی نمی‌کند (نسخه‌های قدیمی)؛ تصویر را
      // دانلود کن تا کاربر خودش از گالری/دانلودهای گوشی به اشتراک بگذارد.
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'azan-times.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      return;
    }
  } catch (e) { /* اگر به هر دلیلی ساخت/اشتراکِ تصویر شکست خورد، به نسخهٔ متنی برمی‌گردیم */ }

  shareAzanTimesAsText();
}

function shareAzanTimesAsText() {
  const text = buildAzanShareText();
  const s = state.settings || {};
  const title = (s.brand_name || 'عارفان جام') + ' — اوقات شرعی';
  if (navigator.share) {
    navigator.share({ title, text }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => appAlert('azan_copy_done'));
  }
}

function openAzanShareChoiceModal() {
  if (!lastPrayerList.length) { appAlert('azan_share_not_ready'); return; }
  document.getElementById('azan-share-choice-modal').classList.remove('hidden');
}
function closeAzanShareChoiceModal() {
  document.getElementById('azan-share-choice-modal').classList.add('hidden');
}
document.getElementById('azan-share-image-btn').addEventListener('click', () => { closeAzanShareChoiceModal(); shareAzanTimesAsImage(); });
document.getElementById('azan-share-text-btn').addEventListener('click', () => { closeAzanShareChoiceModal(); shareAzanTimesAsText(); });
document.getElementById('azan-share-cancel-btn').addEventListener('click', closeAzanShareChoiceModal);

const PRAYER_PLAYED_PREFIX = 'arefanejam_azan_played_';

// ساختِ فهرست اوقات شرعیِ یک روز مشخص (بدون نمایش در صفحه)؛ هم برای نمایش امروز و هم برای
// سپردنِ اذان‌های چند روز آینده به سرویس‌ورکر (آلارم آفلاین) استفاده می‌شود.
/* اوقاتی که مدیر در پیشخوان (رمضان ویژه ← مخفی/نمایان کردن اوقات) «مخفی» کرده؛ فقط در روزهای ماه رمضان اثر دارد.
   روزهای رمضان: بین تاریخ شروع و پایان پیشخوان؛ اگر خالی بود ماه قمری رمضان. حداقل یک اذان واقعی همیشه می‌ماند. */
const PRAYER_HIDE_KEYS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'sunset', 'maghrib', 'isha'];
function isRamadanDay(date) {
  try {
    const s = state.settings || {};
    const custom = ramadanCustomRange({ start_date: s.ramadan_start, end_date: s.ramadan_end });
    const d0 = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    if (custom) return d0 >= custom.start && d0 <= custom.end;
    return islamicFromJulianDay(julianDayFromGregorian(d0.getFullYear(), d0.getMonth() + 1, d0.getDate()))[1] === 9;
  } catch (e) { return false; }
}
// forceRamadan=true: برای جدول رمضان (همیشه رمضان است)
function hiddenPrayerKeys(date, forceRamadan) {
  try {
    const st = state.settings || {};
    if (st.ramadan_active !== '1') return new Set();
    const raw = st.ramadan_hidden_prayers || [];
    const arr = Array.isArray(raw) ? raw : String(raw).split(',');
    const set = new Set(arr.map((x) => String(x).trim()).filter((k) => PRAYER_HIDE_KEYS.indexOf(k) !== -1));
    if (!set.size) return set;
    if (!forceRamadan && !isRamadanDay(date || new Date())) return new Set();
    if (['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'].every((k) => set.has(k))) return new Set();
    return set;
  } catch (e) { return new Set(); }
}
/* نام شهری که اوقات بر اساس آن انتخاب می‌شود (جدول دقیق + استثناها).
   قبلاً فقط به «نام شهرِ ثبت‌شده» وابسته بود؛ پس گوشی‌ای که GPS‌اش نزدیک‌ترین شهر را چیز دیگری حساب می‌کرد
   یا شهرش دستی انتخاب شده بود، اوقات نجومی (چند دقیقه متفاوت) می‌گرفت. حالا هر گوشیِ داخل محدودهٔ تربت‌جام
   (تا ۳۵ کیلومتر از مرکز شهر) همان جدول تربت‌جام را می‌گیرد. */
const TORBAT_JAM_CENTER = { lat: 35.24306, lng: 60.625 };
function effectiveCityName() {
  const named = (state.activeCityName || '').trim();
  try {
    if (state.coords) {
      const dLat = (state.coords.lat - TORBAT_JAM_CENTER.lat) * 111;
      const dLng = (state.coords.lng - TORBAT_JAM_CENTER.lng) * 111 * Math.cos(TORBAT_JAM_CENTER.lat * Math.PI / 180);
      if (Math.sqrt(dLat * dLat + dLng * dLng) <= 35) return 'تربت جام';
    }
  } catch (e) {}
  return named;
}
// includeHidden=true: فهرست کامل (فقط برای صحنهٔ آسمان تب اذان که به فجر/طلوع/غروب نیاز دارد)
function buildPrayerListForDate(date, includeHidden) {
  const s = state.settings || {};
  const asrFactor = (s.asr_method === 'Shafi') ? 1 : 2;
  const offsets = {
    fajr: s.offset_fajr, sunrise: s.offset_sunrise, dhuhr: s.offset_dhuhr,
    asr: s.offset_asr, maghrib: s.offset_maghrib, sunset: s.offset_sunset, isha: s.offset_isha,
  };
  const times = computePrayerTimesLocal(state.coords.lat, state.coords.lng, date, s.calc_method, asrFactor, offsets);

  const fixedTz = isIranCoords(state.coords.lat, state.coords.lng);
  const [egy, egm, egd] = prayerDayParts(date, fixedTz);
  const [ejy, ejm, ejd] = gregorianToJalali(egy, egm, egd);
  const cityForTimes = effectiveCityName();

  // برای شهر تربت‌جام، به‌جای محاسبهٔ نجومی، از جدول دقیق اوقات شرعی (طبق تقویم رسمی تربت‌جام) استفاده می‌شود.
  // این جدول همراه خود اپ ذخیره شده، پس کاملاً آفلاین کار می‌کند و نیازی به اینترنت ندارد.
  // اگر تاریخ روز جاری در جدول نباشد (مثلاً بعد از پایان سال ۱۴۰۵)، به‌صورت خودکار به محاسبهٔ نجومی برمی‌گردد.
  if (normCityName(cityForTimes) === normCityName('تربت جام')) {
    const tjKey = String(ejm).padStart(2, '0') + '-' + String(ejd).padStart(2, '0');
    const tjRow = TORBAT_JAM_EXACT_TIMES[tjKey];
    if (tjRow) {
      const [tjFajr, tjSunrise, tjDhuhr, tjAsr, tjMaghrib, tjIsha] = tjRow;
      const toExactDate = (hhmm) => {
        const [h, m] = hhmm.split(':').map(Number);
        return prayerClockInstant(date, h, m, fixedTz); // ساعت جدول = وقت ایران؛ مستقل از منطقهٔ زمانی گوشی
      };
      times.fajr = toExactDate(tjFajr);
      times.sunrise = toExactDate(tjSunrise);
      times.dhuhr = toExactDate(tjDhuhr);
      times.asr = toExactDate(tjAsr);
      times.maghrib = toExactDate(tjMaghrib);
      // «غروب آفتاب» جدا از اذان مغرب است و مقدار تصحیح آن از تنظیمات پیشخوان (همان قسمت
      // «اصلاح دستی اوقات شرعی» که برای فجر/ظهر/عصر/مغرب/عشاء هم هست) خوانده می‌شود؛
      // با مقدار پیش‌فرض -۱۰ یعنی ۱۰ دقیقه قبل از اذان مغرب.
      const sunsetOffsetMin = Number.isFinite(Number(s.offset_sunset)) ? Number(s.offset_sunset) : -10;
      times.sunset = new Date(times.maghrib.getTime() + sunsetOffsetMin * 60000);
    }
  }

  const exception = findAzanException(ejm, ejd, cityForTimes);
  if (exception) {
    times.fajr = applyTimeOverride(times.fajr, exception.fajr);
    times.dhuhr = applyTimeOverride(times.dhuhr, exception.dhuhr);
    times.asr = applyTimeOverride(times.asr, exception.asr);
    times.maghrib = applyTimeOverride(times.maghrib, exception.maghrib);
    times.isha = applyTimeOverride(times.isha, exception.isha);
  }

  const list = [
    { key: 'fajr', label: 'فجر', time: times.fajr },
    { key: 'sunrise', label: 'طلوع آفتاب', time: times.sunrise },
    { key: 'dhuhr', label: 'ظهر', time: times.dhuhr },
    { key: 'asr', label: 'عصر', time: times.asr },
    { key: 'sunset', label: 'غروب آفتاب', time: times.sunset },
    { key: 'maghrib', label: 'مغرب', time: times.maghrib },
    { key: 'isha', label: 'عشاء', time: times.isha },
  ];
  if (includeHidden) return list;
  const hid = hiddenPrayerKeys(date);
  return hid.size ? list.filter((p) => !hid.has(p.key)) : list;
}

function computePrayerTimes() {
  if (!state.coords) return;
  const s = state.settings || {};
  const date = new Date();
  const list = buildPrayerListForDate(date);
  const fullList = buildPrayerListForDate(date, true);

  const now = new Date();
  let currentKey = list[0].key;
  list.forEach((p) => { if (now >= p.time) currentKey = p.key; });
  const NON_PRAYER_KEYS = ['sunrise', 'sunset'];
  let upcoming = list.find((p) => p.time > now && !NON_PRAYER_KEYS.includes(p.key));
  if (!upcoming) {
    // بعد از اذان عشاء: «اذان بعدی» فجر «فردا» است (قبلاً فجر امروزِ گذشته نشان داده می‌شد و شمارش معکوس خالی می‌ماند)
    try {
      const tomorrowList = buildPrayerListForDate(prayerDayAhead(1));
      upcoming = tomorrowList.find((p) => p.time > now && !NON_PRAYER_KEYS.includes(p.key));
    } catch (e) {}
    if (!upcoming) upcoming = list.find((p) => !NON_PRAYER_KEYS.includes(p.key));
  }

  lastPrayerList = list;
  lastPrayerCurrentKey = currentKey;
  prepareTodayShareVerse();

  renderPrayerList('home-prayer-list', list, currentKey);
  azRenderDayList(list, currentKey);
  let heroKey = fullList[0].key;
  fullList.forEach((p) => { if (now >= p.time) heroKey = p.key; });
  try { renderAzanHero(fullList, heroKey, upcoming); } catch (e) { try { console.warn('azan-hero', e); } catch (e2) {} }

  document.getElementById('home-next-prayer-name').textContent = upcoming.label;
  document.getElementById('home-next-prayer-time').textContent = formatTime(upcoming.time);
  updateCountdown(upcoming.time);

  checkAzanAlarm(list, now);
  checkPrayerTimeAlarm(list, now);
  scheduleNextAzanTimer(list, now);
  updateStickyNotification(upcoming);
  syncScheduleToServiceWorker(list);
  try { weatherEnsure(); } catch (e) {}
}

/* ---------- ارسال زمان‌بندی امروز به سرویس‌ورکر (لایهٔ یدکیِ پخش اذان در پس‌زمینه) ----------
   سرویس‌ورکر به localStorage دسترسی ندارد، پس با هر بار محاسبهٔ اوقات شرعی، زمان‌بندی
   امروز + آدرس صدای اذان از اینجا برایش پیام‌رسانی و در IndexedDB خودش ذخیره می‌شود
   تا اگر اپ کاملاً بسته شد و Periodic Background Sync سرویس‌ورکر را بیدار کرد، بتواند
   بدون نیاز به شبکه بفهمد الان وقت کدام اذان است. */
let lastScheduleSyncKey = '';
// سوییچ «فعال‌سازی پخش اذان» (صفحهٔ اذان) که فقط خود کاربر می‌تواند خاموشش کند؛ پیش‌فرض روشن است.
// اگر هنوز مقداردهی نشده باشد (یا خطایی بدهد) «روشن» حساب می‌شود تا اذان هرگز بی‌دلیل قطع نشود.
function bgModeOnSafe() {
  try { return isBgModeOn(); } catch (e) { return true; }
}
function syncScheduleToServiceWorker(list) {
  const swReady = ('serviceWorker' in navigator) && !!navigator.serviceWorker.controller;
  if (!swReady && !window.NativeAlarms) return;
  const s = state.settings || {};
  const NON_PRAYER_KEYS = ['sunrise', 'sunset'];
  // امروز + ۳ روز بعد، تا اگر اپ چند روز باز نشد هم اذان‌ها و یادآوری «وقت نماز» آفلاین سر وقت بیایند
  // (هر بار اپ باز شود، همین فهرست با زمان‌های دقیق‌تر دوباره جایگزین می‌شود).
  const allLists = [list];
  try {
    for (let i = 1; i <= 30; i++) {
      const d = prayerDayAhead(i);
      allLists.push(buildPrayerListForDate(d));
    }
  } catch (e) { /* اگر محاسبه برای روزهای بعد شکست خورد، فقط امروز فرستاده می‌شود */ }
  // nativePrayers: 30 days ahead for the native azan (works offline for a month without opening the app)
  // prayers: only the first 7 days (as before) for the service worker
  const nativePrayers = [];
  allLists.forEach((dayList) => dayList
    .filter((p) => !NON_PRAYER_KEYS.includes(p.key))
    .forEach((p) => nativePrayers.push({ key: p.key, label: p.label, timeIso: p.time.toISOString() })));
  const prayers = nativePrayers.slice(0, 7 * 5);
  // اذان فقط وقتی فعال است که مدیر خاموشش نکرده باشد و کاربر هم سوییچ «فعال‌سازی پخش اذان» را روشن گذاشته باشد
  const enabled = s.azan_enabled !== '' && bgModeOnSafe();
  const voiceId = s.azan_voice_active || '';
  const key = JSON.stringify(nativePrayers) + '|' + (s.azan_audio_url || '') + '|' + voiceId + '|' + enabled;
  if (key === lastScheduleSyncKey) return; // چیزی تغییر نکرده
  lastScheduleSyncKey = key;
  // نسخهٔ اندروید (Capacitor): آلارم‌ها به سیستم آلارم خود اندروید سپرده می‌شوند
  if (window.NativeAlarms) window.NativeAlarms.syncSchedule(nativePrayers, enabled, s.brand_name || 'عارفان جام', voiceId, normalizeAzanUrl(s.azan_audio_url) || '');
  if (!swReady) return;
  navigator.serviceWorker.controller.postMessage({
    type: 'AREFANEJAM_SCHEDULE_SYNC',
    prayers,
    audioUrl: s.azan_audio_url || '',
    brandName: s.brand_name || 'عارفان جام',
    enabled,
  });
}

// وقتی سرویس‌ورکر (مثلاً بعد از لمس نوتیفیکیشن یا بیداری با Periodic Background Sync)
// تشخیص داد الان وقت اذان است، به همین صفحه پیام می‌دهد تا صدای واقعی اذان را پخش کند.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    const msg = event.data;
    if (!msg) return;
    if (msg.type === 'AREFANEJAM_PLAY_AZAN_NOW') {
      playAzanSound(msg.prayerLabel || (state.settings && state.settings.brand_name) || '');
      return;
    }
    // کاربر روی نوتیفیکیشنِ یادآوریِ یک یادداشت لمس کرده؛ همان یادداشت باز شود.
    if (msg.type === 'AREFANEJAM_OPEN_NOTE') {
      switchToTab('notes', { push: true });
      const note = getLocalNotes().find((n) => n.id === msg.noteId);
      if (note) openNoteModal(note);
      return;
    }
    // یک اعلانِ صوتی رسیده: یا کاربر لمس کرده، یا (مورد اصلی) همین الان که Push رسید و
    // اپ از قبل باز بوده (حتی در پس‌زمینه)، بدون نیاز به لمس، همین لحظه پخش می‌شود.
    if (msg.type === 'AREFANEJAM_PLAY_ANNOUNCEMENT_AUDIO') {
      // اگر این همان اعلانی است که قبلاً دیده/پخش شده (مثلاً پوش تکراریِ نوتیفیکیشن
      // ثابت هر ۳۰ دقیقه، یا لمس نوتیفیکیشن روی یک صفحهٔ از قبل بازشده)، دوباره پخش نشود.
      if (msg.announcementId) {
        if (localStorage.getItem('arefanejam_announcement_seen') === msg.announcementId) return;
        localStorage.setItem('arefanejam_announcement_seen', msg.announcementId);
      }
      playAnnouncementAudio(msg.url, true);
      if (msg.text) {
        showAlarmModal('اعلان جدید از دارالحفظ', msg.text, msg.link || '', 'announcement_link_clicked');
        renderAnnouncement();
      }
      return;
    }
  });
}

/* ---------- رساندن شناسهٔ دستگاه به سرویس‌ورکر ----------
   سرویس‌ورکر برای خواندنِ یادآوریِ یادداشت‌های همین دستگاه (وقتی با Push بیدار
   می‌شود) به همین شناسه نیاز دارد؛ چون به localStorage دسترسی ندارد، از همین راه
   (postMessage) در IndexedDB خودش ذخیره می‌کند. */
function syncDeviceIdToServiceWorker(deviceId) {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller || !deviceId) return;
  navigator.serviceWorker.controller.postMessage({ type: 'AREFANEJAM_DEVICE_ID_SYNC', deviceId });
}
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    ensureDeviceId().then(syncDeviceIdToServiceWorker);
  });
}

/* ---------- نوتیفیکیشن ثابت بالای گوشی: تاریخ امروز + اذان بعدی ----------
   وقتی کاربر نوتیفیکیشن اپ را فعال کرده باشد، این تابع هر بار که اپ باز/فعال است
   محتوای نوتیفیکیشن را در همان جایگاه (tag) به‌روز می‌کند، بدون صدا یا لرزش
   (renotify: false)، تا فقط اطلاعات تازه شود و کاربر آزار نبیند.
   توجه: طبق محدودیت اندروید، هیچ اپ وبی نمی‌تواند این نوتیفیکیشن را کاملاً
   غیرقابل‌بستن کند؛ اگر کاربر آن را کنار بزند، سرور هم جداگانه هر نیم‌ساعت یک‌بار
   (و سر هر وقت اذان) آن را دوباره برای دستگاه‌های مشترک می‌فرستد. */
let lastStickyBody = '';
let lastStickyUpcoming = null;
function updateStickyNotification(upcoming) {
  const s = state.settings || {};
  const hasNative = !!(window.NativeAlarms && typeof window.NativeAlarms.syncSticky === 'function');
  if (s.sticky_notification_enabled === '') {
    if (hasNative) window.NativeAlarms.syncSticky(null); // خاموش شد: نوتیفیکیشن ثابت را بردار
    return;
  }
  if (upcoming) lastStickyUpcoming = upcoming;

  const cal = getCalendarStrings(iranWallNow());
  const brand = s.brand_name || 'عارفان جام';
  const custom = String(s.sticky_custom_text || '').trim(); // متنی که مدیر در پیشخوان سایت نوشته
  const lines = [cal.jalali];
  if (custom) lines.push(custom);
  lines.push(cal.gregorian, cal.hijri);
  if (upcoming) lines.push('اذان بعدی: ' + upcoming.label + ' — ساعت ' + formatTime(upcoming.time));
  // تصاویر دلخواه مدیر برای نوتیفیکیشن ثابت (پیشخوان ← تنظیمات ← نوتیفیکیشن ثابت)
  const stkBgUrl = secureUrl(String(s.sticky_bg_url || ''));
  const stkTileUrl = secureUrl(String(s.sticky_tile_url || ''));
  const stkIconUrl = secureUrl(String(s.sticky_icon_url || ''));
  const stkSmallIconUrl = secureUrl(String(s.sticky_small_icon_url || '')); // آیکون کوچک دایره‌ای کنار نام اپ در اعلان
  const stkBgDim = Math.max(0, Math.min(90, parseInt(s.sticky_bg_dim, 10) || 0));
  const stkTileOpacity = Math.max(5, Math.min(100, parseInt(s.sticky_tile_opacity, 10) || 35));
  const body = lines.join('\n') + '|' + [stkBgUrl, stkTileUrl, stkIconUrl, stkSmallIconUrl, stkBgDim, stkTileOpacity].join('|');
  if (body === lastStickyBody) return; // چیزی تغییر نکرده، دوباره ننویس
  lastStickyBody = body;

  // نسخهٔ اندروید (Capacitor): نوتیفیکیشن بومیِ ثابت که روی صفحهٔ قفل هم دیده می‌شود
  if (hasNative) {
    const extra = lines.filter((l) => l !== cal.jalali && l !== custom);
    window.NativeAlarms.syncSticky({
      title: brand + ' — ' + cal.jalali,       // نام اپ + تاریخ امروز
      text: custom || extra[extra.length - 1] || cal.gregorian, // متن مدیر (اگر نبود، اذان بعدی)
      lines: (custom ? [custom] : []).concat(extra),
      // کارت گرافیکی سه‌بعدی (فقط APKهای جدید آن را نشان می‌دهند؛ بقیه همان نوتیفیکیشن ساده)
      card: {
        brand,
        weekday: cal.parts.weekday,
        day: cal.parts.day,
        month: cal.parts.month,
        year: cal.parts.year,
        jalali: cal.jalali,
        hijri: cal.hijri,
        gregorian: cal.gregorian,
        custom: custom || '',
        next: upcoming ? 'اذان بعدی: ' + upcoming.label + ' — ساعت ' + formatTime(upcoming.time) : '',
        nextName: upcoming ? String(upcoming.label) : '',
        nextTime: upcoming ? formatTime(upcoming.time) : '',
        bgUrl: stkBgUrl,
        tileUrl: stkTileUrl,
        iconUrl: stkIconUrl,
        smallIconUrl: stkSmallIconUrl,
        bgDim: stkBgDim,
        tileAlpha: stkTileOpacity,
      },
    });
    return;
  }
}
// هر بار اپ دوباره باز/جلو آمد، تاریخ (و متن) نوتیفیکیشن ثابت دوباره تازه می‌شود (مثلاً بعد از تغییر روز)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { lastStickyBody = ''; updateStickyNotification(lastStickyUpcoming); }
});

/* ---------- مرور روزهای دیگر در اوقات اذان (کشیدن چپ/راست) ---------- */
let azDayOffset = 0;
const AZ_WEEKDAYS = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه', 'شنبه'];
function azRenderDayList(todayList, currentKey, dir) {
  const el = document.getElementById('azan-prayer-list');
  if (!el || !state.coords) return;
  let list = todayList, cur = currentKey;
  const date = prayerDayAhead(azDayOffset);
  if (azDayOffset !== 0) {
    try { list = buildPrayerListForDate(date); cur = null; } catch (e) { list = todayList; }
  }
  renderPrayerList('azan-prayer-list', list, cur);
  try {
    const fixedTz = isIranCoords(state.coords.lat, state.coords.lng);
    const [gy, gm, gd] = prayerDayParts(date, fixedTz);
    const [jy, jm, jd] = gregorianToJalali(gy, gm, gd);
    const wd = new Date(Date.UTC(gy, gm - 1, gd)).getUTCDay();
    const t = document.getElementById('azd-title'), sub = document.getElementById('azd-sub');
    const rel = azDayOffset === 0 ? 'امروز' : azDayOffset === 1 ? 'فردا' : azDayOffset === -1 ? 'دیروز' : '';
    if (t) t.textContent = (rel ? rel + ' · ' : '') + AZ_WEEKDAYS[wd] + ' ' + toPersianDigits(jd) + ' ' + JALALI_MONTHS[jm - 1];
    if (sub) sub.textContent = azDayOffset === 0 ? '' : 'برای برگشت به امروز لمس کنید';
  } catch (e) {}
  if (dir) { el.classList.remove('azd-in-next', 'azd-in-prev'); void el.offsetWidth; el.classList.add(dir > 0 ? 'azd-in-next' : 'azd-in-prev'); }
}
function azGoDay(delta) {
  azDayOffset = Math.max(-366, Math.min(366, azDayOffset + delta));
  const list = lastPrayerList || [];
  azRenderDayList(list, lastPrayerCurrentKey, delta);
}
(function setupAzanDaySwipe() {
  const el = document.getElementById('azan-prayer-list');
  if (!el) return;
  const prev = document.getElementById('azd-prev'), next = document.getElementById('azd-next'), mid = document.getElementById('azd-mid');
  if (prev) prev.addEventListener('click', () => azGoDay(-1));
  if (next) next.addEventListener('click', () => azGoDay(1));
  if (mid) mid.addEventListener('click', () => { if (azDayOffset !== 0) { const d = azDayOffset; azDayOffset = 0; azRenderDayList(lastPrayerList || [], lastPrayerCurrentKey, d > 0 ? -1 : 1); } });
  let x0 = null, y0 = null;
  el.addEventListener('touchstart', (e) => { const t = e.touches[0]; x0 = t.clientX; y0 = t.clientY; }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (x0 === null) return;
    const t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
    x0 = null;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    azGoDay(dx < 0 ? 1 : -1); // کشیدن به چپ = روز بعد، به راست = روز قبل
  }, { passive: true });
})();

function renderPrayerList(elId, list, currentKey) {
  const el = document.getElementById(elId);
  el.innerHTML = '';
  list.forEach((p) => {
    const row = document.createElement('div');
    row.className = 'prayer-row prayer-' + p.key + (p.key === currentKey ? ' current-prayer' : '');
    row.innerHTML = `<span class="prayer-name-wrap"><span class="prayer-icon-badge"><span class="prayer-icon">${PRAYER_ICONS[p.key] || ''}</span></span>${p.label}</span><span class="prayer-time">${formatTime(p.time)}</span>`;
    el.appendChild(row);
  });
}

/* ---------- صحنهٔ سه‌بعدی تب اذان ----------
   آسمان بر اساس وقتِ فعلی عوض می‌شود (سحر، طلوع، روز، عصر، غروب، مغرب، شب)،
   خورشید بین طلوع و غروب و ماه بین غروب و طلوعِ بعدی روی یک کمان حرکت می‌کند.
   همه‌چیز محلی است و بدون اینترنت کار می‌کند. */
function renderAzanHero(list, currentKey, upcoming) {
  const hero = document.getElementById('az-hero');
  if (!hero || !list || !list.length) return;
  const now = new Date();
  const byKey = {}; list.forEach((p) => { byKey[p.key] = p.time; });
  let phase = currentKey;
  if (now < byKey.fajr) phase = 'night';
  hero.setAttribute('data-phase', phase);

  // خورشید یا ماه روی کمان
  const DAY = 86400000;
  const sr = byKey.sunrise.getTime(), ss = byKey.sunset.getTime(), t = now.getTime();
  let p, moon = false;
  if (t >= sr && t <= ss) { p = (t - sr) / (ss - sr); }
  else {
    moon = true;
    let s0 = ss, s1 = sr + DAY;
    if (t < sr) { s0 = ss - DAY; s1 = sr; }
    p = (t - s0) / (s1 - s0);
  }
  p = Math.max(0, Math.min(1, p));
  const amp = moon ? 120 : 150;
  const x = 8 + 84 * p;
  const y = 196 - amp * Math.sin(Math.PI * p);
  hero.setAttribute('data-body', moon ? 'moon' : 'sun');
  hero.style.setProperty('--ax', x.toFixed(1) + '%');
  hero.style.setProperty('--ay', y.toFixed(0) + 'px');

  azUpcoming = upcoming || null;
  const nameEl = document.getElementById('az-next-name'), timeEl = document.getElementById('az-next-time');
  if (upcoming) {
    if (nameEl) nameEl.textContent = upcoming.label;
    if (timeEl) timeEl.textContent = formatTime(upcoming.time);
  }
  azHeroTick();
}

function azHeroTick() {
  const el = document.getElementById('az-next-count');
  if (!el || !azUpcoming) return;
  let diff = azUpcoming.time - new Date();
  if (diff <= 0) diff += 86400000; // اذانِ فردا
  const h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000), s = Math.floor((diff % 60000) / 1000);
  el.textContent = 'تا اذان: ' + toPersianDigits(h) + ' ساعت و ' + toPersianDigits(String(m).padStart(2, '0')) + ' دقیقه و ' + toPersianDigits(String(s).padStart(2, '0')) + ' ثانیه';
}
setInterval(() => { if (currentTab === 'azan' && !document.hidden) azHeroTick(); }, 1000);

function updateCountdown(upcomingTime) {
  const el = document.getElementById('home-countdown');
  const diffMs = upcomingTime - new Date();
  if (diffMs <= 0) { el.textContent = ''; return; }
  const h = Math.floor(diffMs / 3600000);
  const m = Math.floor((diffMs % 3600000) / 60000);
  el.textContent = 'زمان باقی‌مانده: ' + toPersianDigits(h) + ' ساعت و ' + toPersianDigits(m) + ' دقیقه';
}

function checkAzanAlarm(list, now) {
  const todayKey = now.toDateString();
  list.forEach((p) => {
    if (p.key === 'sunrise' || p.key === 'sunset') return; // این دو، اذان محسوب نمی‌شوند
    const diffMinutes = (now - p.time) / 60000;
    if (diffMinutes >= 0 && diffMinutes < 2) {
      const storeKey = PRAYER_PLAYED_PREFIX + p.key + '_' + todayKey;
      if (!sessionStorage.getItem(storeKey)) {
        sessionStorage.setItem(storeKey, '1');
        playAzanSound(p.label);
      }
    }
  });
}

/* ---------- یادآوریِ «وقت نماز»: دقیقاً ۲۰ دقیقه بعد از هر اذان ----------
   این یک هشدار جداگانه از خودِ آلارم اذان است (فقط یک‌بار، بدون تکرار صدای اذان)
   و هدفش این است که کاربر متوجه شود الان وقت برپاییِ نماز است. برای مغرب این
   یادآوری لازم نیست، چون بلافاصله بعد از اذان مغرب وقت نماز است. کاملاً محلی و
   بر پایهٔ اوقات شرعیِ همین گوشی محاسبه می‌شود، پس بدون اینترنت هم کار می‌کند. */
const PRAYER_TIME_REMINDER_MINUTES = 20;
const PRAYER_TIME_PLAYED_PREFIX = 'arefanejam_prayer_time_played_';
function checkPrayerTimeAlarm(list, now) {
  const s = state.settings || {};
  if (s.azan_enabled === '') return; // مدیر پخش اذان را کاملاً خاموش کرده است
  const todayKey = now.toDateString();
  list.forEach((p) => {
    if (p.key === 'sunrise' || p.key === 'sunset' || p.key === 'maghrib') return;
    const reminderTime = new Date(p.time.getTime() + PRAYER_TIME_REMINDER_MINUTES * 60000);
    const diffMinutes = (now - reminderTime) / 60000;
    if (diffMinutes >= 0 && diffMinutes < 2) {
      const storeKey = PRAYER_TIME_PLAYED_PREFIX + p.key + '_' + todayKey;
      if (!sessionStorage.getItem(storeKey)) {
        sessionStorage.setItem(storeKey, '1');
        showAlarmModal('وقت نماز ' + p.label + ' رسیده است', 'وقت نماز ' + p.label + ' فرا رسیده است.');
      }
    }
  });
}

// اگر مرورگر پخش صدا را مسدود کرد (مثلاً صفحه قفل است و صدای نگه‌دارنده هنوز شروع نشده)،
// یک نوتیفیکیشن محلی (بدون نیاز به اینترنت) با لرزش نشان داده می‌شود؛ لمس آن، اذان را
// همان لحظه پخش می‌کند (سرویس‌ورکر پیام AREFANEJAM_PLAY_AZAN_NOW را برای همین تگ می‌فرستد).
function showAzanFallbackNotification(prayerLabel) {
  if (!('serviceWorker' in navigator) || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  navigator.serviceWorker.getRegistration('push-worker.js').then((reg) => {
    if (!reg) return;
    reg.showNotification((state.settings && state.settings.brand_name) || 'عارفان جام', {
      body: 'وقت نماز ' + (prayerLabel || '') + ' است. برای پخش اذان لمس کنید.',
      tag: 'arefanejam-azan-current',
      renotify: true,
      timestamp: Date.now(),
      requireInteraction: true,
      vibrate: [200, 100, 200, 100, 200],
      data: { link: '', kind: 'azan', playAzan: true },
    }).catch(() => {});
  }).catch(() => {});
}

let currentAzanAudio = null;
function playAzanSound(prayerLabel) {
  const s = state.settings || {};
  if (s.azan_enabled === '') return; // مدیر پخش اذان را کاملاً خاموش کرده است
  // in the Android app the native azan service plays the sound (works offline and with locked phone);
  // playing it here too would make two azans at once
  if (window.NativeAlarms && typeof window.NativeAlarms.isNativeAzan === 'function' && window.NativeAlarms.isNativeAzan()) return;
  if (currentAzanAudio) { currentAzanAudio.pause(); currentAzanAudio = null; }
  const url = normalizeAzanUrl(s.azan_audio_url);
  if (url) {
    // اول از نسخهٔ ذخیره‌شدهٔ خودِ گوشی (بدون نیاز به اینترنت)، بعد از آدرس اینترنتی، در نهایت صدای هشدار ساده
    const usingLocal = !!(azanEl && azanReadyUrl === url);
    const audio = usingLocal ? azanEl : new Audio(url);
    try { audio.currentTime = 0; } catch (e) {}
    audio.muted = false;
    currentAzanAudio = audio;
    const fallback = () => {
      if (currentAzanAudio !== audio) return;
      if (usingLocal) {
        const online = new Audio(url);
        currentAzanAudio = online;
        online.play().catch(() => { if (currentAzanAudio === online) { playAlarmSound(); showAzanFallbackNotification(prayerLabel); } });
      } else {
        playAlarmSound();
        showAzanFallbackNotification(prayerLabel);
      }
    };
    const pr = audio.play();
    if (pr && pr.catch) pr.catch(fallback);
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: 'وقت نماز ' + prayerLabel,
        artist: 'عارفان جام',
      });
      navigator.mediaSession.setActionHandler('pause', () => stopAzanSound());
      navigator.mediaSession.setActionHandler('stop', () => stopAzanSound());
    }
  } else {
    playAlarmSound();
    if (document.hidden) showAzanFallbackNotification(prayerLabel);
  }
  if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);
  showAlarmModal('وقت نماز فرا رسید', 'وقت نماز ' + prayerLabel + ' است.');
}

function stopAzanSound() {
  if (currentAzanAudio) {
    currentAzanAudio.pause();
    try { currentAzanAudio.currentTime = 0; } catch (e) {}
    currentAzanAudio = null;
  }
  if (typeof refreshKeepAliveSession === 'function') refreshKeepAliveSession();
  document.getElementById('alarm-modal').classList.add('hidden');
}

// قبلاً با پس‌زمینه‌رفتنِ تب (خاموش‌شدن صفحهٔ گوشی) صدای اذان قطع می‌شد؛ چون اکثر
// مرورگرهای اندروید تا وقتی صدایی در حال پخش است تب را معلق نمی‌کنند، دیگر با
// hidden شدن صفحه صدا را قطع نمی‌کنیم تا اذان در پس‌زمینه هم کامل پخش شود.
// فقط وقتی خودِ صفحه واقعاً بسته/ترک می‌شود (pagehide) پخش متوقف می‌شود.
window.addEventListener('pagehide', () => { stopAzanSound(); });

setInterval(() => { if (state.coords) computePrayerTimes(); }, 30000);

// تایمر دقیق روی لحظهٔ اذان بعدی + بررسی فوری هنگام برگشتن به اپ (مرورگر تایمرهای پس‌زمینه را کند می‌کند)
let azanTimerId = null;
function scheduleNextAzanTimer(list, now) {
  clearTimeout(azanTimerId);
  // هم لحظهٔ خودِ اذان‌ها و هم لحظهٔ یادآوریِ «وقت نماز» (۲۰ دقیقه بعد، به‌جز مغرب)
  // به‌عنوان نقاطِ بیداریِ دقیق در نظر گرفته می‌شوند تا هر دو هشدار سر وقت اجرا شوند.
  const upcomingTimes = [];
  list.forEach((p) => {
    if (p.key === 'sunrise' || p.key === 'sunset') return;
    if (p.time > now) upcomingTimes.push(p.time);
    if (p.key !== 'maghrib') {
      const reminderTime = new Date(p.time.getTime() + PRAYER_TIME_REMINDER_MINUTES * 60000);
      if (reminderTime > now) upcomingTimes.push(reminderTime);
    }
  });
  if (!upcomingTimes.length) return;
  const nextTime = upcomingTimes.reduce((earliest, t) => (t < earliest ? t : earliest));
  const ms = Math.min(nextTime - now + 300, 2147000000);
  azanTimerId = setTimeout(() => { if (state.coords) computePrayerTimes(); }, ms);
}
function recheckAzanNow() { if (state.coords) computePrayerTimes(); }
document.addEventListener('visibilitychange', () => { if (!document.hidden) recheckAzanNow(); });
window.addEventListener('focus', recheckAzanNow);
window.addEventListener('pageshow', recheckAzanNow);
// لحظهٔ قفل‌شدن صفحه/رفتن به پس‌زمینه هنوز «لمس کاربر» معتبر است؛ اگر صدای نگه‌دارنده
// (که اپ را زنده نگه می‌دارد) به هر دلیل متوقف بود، همین‌جا دوباره روشنش می‌کنیم.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  try {
    ensureKeepAlive();
  } catch (e) {}
});

/* ---------- حالت پس‌زمینه: پخش اذان با قفل‌بودن صفحه ----------
   یک صدای کاملاً بی‌صدا (بی‌نهایت تکرارشونده) پخش می‌شود تا اندروید اپ را «در حال پخش رسانه» بداند
   و آن را نکُشد و تایمرها کند نشوند. وقت اذان، فایل اذان همان‌جا پخش می‌شود.
   وقتی اپ کاملاً بسته شود (حذف از لیست اخیر) این روش کار نمی‌کند؛ محدودیت مرورگرهاست. */
const BG_MODE_KEY = 'arefanejam_bg_mode';
// وضعیت حالت پس‌زمینه در دو جا نگه‌داری می‌شود (localStorage + کوکی ۱۰ ساله) تا اگر یکی
// از بین رفت، دیگری جایگزین شود. فقط خودِ کاربر می‌تواند آن را خاموش کند.
function readBgMode() {
  let v = null;
  try { v = localStorage.getItem(BG_MODE_KEY); } catch (e) {}
  if (v === null || v === undefined) {
    const m = (document.cookie || '').match(/(?:^|;\s*)arefanejam_bg_mode=([01])/);
    if (m) v = m[1];
  }
  return v;
}
function writeBgMode(on) {
  const v = on ? '1' : '0';
  try { localStorage.setItem(BG_MODE_KEY, v); } catch (e) {}
  try { document.cookie = 'arefanejam_bg_mode=' + v + '; max-age=315360000; path=/; SameSite=Lax'; } catch (e) {}
}
function isBgModeOn() { return readBgMode() === '1'; }
// پیش‌فرض روشن (فقط اولین اجرا)؛ اگر کاربر خاموش کند ('0') دوباره خودکار روشن نمی‌شود.
if (readBgMode() === null) writeBgMode(true);
else writeBgMode(readBgMode() === '1'); // هر دو محل همیشه هم‌مقدار بمانند
// از پاک‌شدنِ خودکارِ داده‌های اپ (وقتی حافظهٔ گوشی کم می‌شود) جلوگیری می‌کند
try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) {}

let keepAliveEl = null;
let keepAliveUrl = null;
let keepAliveLastTick = 0;

function buildSilentWavUrl() {
  // صدای نگه‌دارنده: موج ۵۰ هرتزِ بسیار ضعیف (زیر آستانهٔ شنیدن و غیرقابل پخش با بلندگوی گوشی)
  // ولی نه آن‌قدر ضعیف که کروم آن را «سکوت» حساب کند و پخش را رها کند. طول ۶ ثانیه است
  // (بیشتر از ۵ ثانیه) تا اندروید آن را «پخش رسانهٔ واقعی» بداند و اپ را با قفل‌شدن صفحه
  // نکُشد. ۳۰۰ دورِ کامل در ۶ ثانیه است، پس تکرار (loop) بدون تق‌تق است.
  const rate = 8000, seconds = 6, n = rate * seconds;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o, str) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(60 * Math.sin(2 * Math.PI * 50 * i / rate)), true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

// کارت «در حال پخش» در نوار اعلانات/صفحهٔ قفل: همین کارت است که اندروید را مجبور می‌کند
// اپ را زنده نگه دارد. دکمهٔ توقف عمداً کار نمی‌کند؛ خاموش‌کردن فقط از سوییچ داخل اپ است.
function refreshKeepAliveSession() {
  if (!('mediaSession' in navigator) || !isBgModeOn()) return;
  try {
    const s = state.settings || {};
    navigator.mediaSession.metadata = new MediaMetadata({
      title: 'پخش اذان فعال است',
      artist: s.brand_name || 'عارفان جام',
      album: 'اذان در پس‌زمینه',
      artwork: s.logo_url ? [{ src: s.logo_url, sizes: '512x512' }] : [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
    });
    navigator.mediaSession.playbackState = 'playing';
    const keep = () => ensureKeepAlive();
    ['play', 'pause', 'stop'].forEach((a) => { try { navigator.mediaSession.setActionHandler(a, keep); } catch (e) {} });
    ['seekbackward', 'seekforward', 'previoustrack', 'nexttrack', 'seekto'].forEach((a) => { try { navigator.mediaSession.setActionHandler(a, null); } catch (e) {} });
  } catch (e) {}
}

function updateBgStatus() {
  const el = document.getElementById('bg-mode-status');
  if (!el) return;
  if (!isBgModeOn()) { el.textContent = 'پخش اذان در پس‌زمینه خاموش است.'; return; }
  const playing = !!(keepAliveEl && !keepAliveEl.paused);
  el.textContent = playing
    ? '✅ فعال است: اذان با قفل‌بودن صفحه و بدون اینترنت پخش می‌شود.'
    : '⚠️ روشن است ولی گوشی اجازهٔ شروع نداد؛ یک بار روی صفحه بزنید تا فعال شود.';
}

function createKeepAlive() {
  if (keepAliveEl) { try { keepAliveEl.pause(); } catch (e) {} keepAliveEl = null; }
  if (!keepAliveUrl) keepAliveUrl = buildSilentWavUrl();
  const el = new Audio(keepAliveUrl);
  el.loop = true;
  el.preload = 'auto';
  el.setAttribute('playsinline', '');
  // رویداد timeupdate از تایمرهای کندشده تأثیر نمی‌گیرد؛ یک چک اضافه برای وقت اذان
  el.addEventListener('timeupdate', () => {
    if (Date.now() - keepAliveLastTick > 5000) {
      keepAliveLastTick = Date.now();
      if (state.coords) computePrayerTimes();
    }
  });
  // هر توقفِ ناخواسته (تماس، پخش‌کنندهٔ دیگر، سیستم) → خیلی زود دوباره ادامه
  el.addEventListener('pause', () => setTimeout(ensureKeepAlive, 1500));
  ['ended', 'error', 'stalled', 'emptied'].forEach((ev) => el.addEventListener(ev, () => {
    if (keepAliveEl === el) { keepAliveEl = null; setTimeout(ensureKeepAlive, 1000); }
  }));
  el.addEventListener('playing', () => { refreshKeepAliveSession(); updateBgStatus(); });
  keepAliveEl = el;
}

// این تابع هر چند بار صدا زده شود ضرری ندارد؛ فقط اگر لازم باشد پخش را (دوباره) شروع می‌کند.
function ensureKeepAlive() {
  if (!isBgModeOn()) return;
  if (!keepAliveEl || keepAliveEl.error) createKeepAlive();
  if (keepAliveEl.paused) {
    const pr = keepAliveEl.play();
    if (pr && pr.then) pr.then(() => { refreshKeepAliveSession(); updateBgStatus(); }).catch(() => updateBgStatus());
  } else {
    refreshKeepAliveSession();
  }
  updateBgStatus();
}
function startKeepAlive() { ensureKeepAlive(); }

function stopKeepAlive() {
  if (keepAliveEl) { try { keepAliveEl.pause(); } catch (e) {} }
  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.playbackState = 'none';
      navigator.mediaSession.metadata = null;
      ['play', 'pause', 'stop'].forEach((a) => { try { navigator.mediaSession.setActionHandler(a, null); } catch (e) {} });
    } catch (e) {}
  }
  updateBgStatus();
}

function setBgMode(on) {
  writeBgMode(on);
  const t = document.getElementById('bg-mode-toggle');
  if (t) t.checked = !!on;
  // اذان بومی/سرویس‌ورکر با وضعیت جدید سوییچ فوراً دوباره زمان‌بندی (یا لغو) شود
  try { lastScheduleSyncKey = ''; if (state.coords) computePrayerTimes(); } catch (e) {}
  if (on) {
    // کاربر خودش اذان را روشن کرد: اگر هنوز «بهینه‌سازی باتری» مانع است، درخواست مجوز (فقط در اپ اندروید)
    try { if (window.NativeAlarms && typeof window.NativeAlarms.requestBattery === 'function') window.NativeAlarms.requestBattery(true); } catch (e) {}
    ensureKeepAlive();
  } else {
    stopKeepAlive();
  }
}

(function initBgMode() {
  const t = document.getElementById('bg-mode-toggle');
  if (t) { t.checked = isBgModeOn(); t.addEventListener('change', () => setBgMode(t.checked)); }
  updateBgStatus();
  if (!isBgModeOn()) return;
  // قفل وب: به مرورگر می‌گوید این صفحه کار مهمی در دست دارد و نباید آن را «منجمد» کند
  try {
    if (navigator.locks && navigator.locks.request) {
      navigator.locks.request('arefanejam-bg-keepalive', { mode: 'shared' }, () => new Promise(() => {})).catch(() => {});
    }
  } catch (e) {}
  ensureKeepAlive();
  // مرورگر بدون لمس ممکن است اجازهٔ پخش ندهد؛ با اولین لمس/کلید ادامه می‌دهیم
  ['pointerdown', 'touchstart', 'click', 'keydown'].forEach((ev) => document.addEventListener(ev, ensureKeepAlive, { passive: true }));
  // هر بار که اپ دوباره دیده شد/برگشت/از حالت انجماد درآمد/اینترنت آمد
  document.addEventListener('visibilitychange', ensureKeepAlive);
  window.addEventListener('pageshow', ensureKeepAlive);
  window.addEventListener('focus', ensureKeepAlive);
  window.addEventListener('online', ensureKeepAlive);
  document.addEventListener('resume', ensureKeepAlive);
  // نگهبان: هر ۱۰ ثانیه مطمئن می‌شود صدای نگه‌دارنده هنوز پخش می‌شود
  setInterval(ensureKeepAlive, 10000);
})();

/* ---------- چک‌لیست روزانه نماز ---------- */
const PRAYER_LOG_KEY = 'arefanejam_prayer_log';
const CHECKLIST_PRAYERS = [
  { key: 'fajr', label: 'فجر' }, { key: 'dhuhr', label: 'ظهر' }, { key: 'asr', label: 'عصر' },
  { key: 'maghrib', label: 'مغرب' }, { key: 'isha', label: 'عشاء' },
];

function getPrayerLog() {
  try { return JSON.parse(localStorage.getItem(PRAYER_LOG_KEY) || '{}'); } catch (e) { return {}; }
}
function renderPrayerChecklist() {
  const todayKey = new Date().toDateString();
  const log = getPrayerLog();
  const todayLog = log[todayKey] || {};
  const el = document.getElementById('prayer-checklist');
  el.innerHTML = '';
  let doneCount = 0;
  CHECKLIST_PRAYERS.forEach((p) => {
    const done = !!todayLog[p.key];
    if (done) doneCount++;
    const row = document.createElement('div');
    row.className = 'checklist-row' + (done ? ' is-done' : '');
    row.innerHTML = `<label><input type="checkbox" data-prayer="${p.key}" ${done ? 'checked' : ''}> ${p.label}</label>`;
    el.appendChild(row);
  });
  document.getElementById('prayer-log-summary').textContent =
    toPersianDigits(doneCount) + ' از ' + toPersianDigits(5) + ' نماز امروز ثبت شده';

  el.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const log2 = getPrayerLog();
      if (!log2[todayKey]) log2[todayKey] = {};
      log2[todayKey][cb.dataset.prayer] = cb.checked;
      localStorage.setItem(PRAYER_LOG_KEY, JSON.stringify(log2));
      renderPrayerChecklist();
    });
  });
}
renderPrayerChecklist();


/* ---------- محاسبه اعمال روزانه (کاملاً آفلاین‌پذیر) ----------
   فهرست اعمال را مدیر در پیشخوان تعریف می‌کند. اپ آخرین فهرست را در localStorage
   نگه می‌دارد؛ اگر اینترنت نبود، همان نسخهٔ ذخیره‌شده نمایش داده می‌شود.
   تیک‌ها و تأیید روزانهٔ کاربر هم فقط روی گوشی (localStorage) ذخیره می‌شود،
   پس ثبت و مشاهده بدون اینترنت هم کار می‌کند. */
const DAILY_DEEDS_ITEMS_KEY = 'arefanejam_daily_deeds_items';
const DAILY_DEEDS_LOG_KEY = 'arefanejam_daily_deeds_log';
const DEEDS_POPUP_TEXT_KEY = 'arefanejam_deeds_popup_text';
let dailyDeedsItems = [];
let dailyDeedsDraft = {};

/* متن دلخواهِ مدیر سایت (متن + رنگ + فونت) که بالای پاپ‌آپ «محاسبه اعمال» نمایش داده می‌شود.
   مثل فهرست اعمال، آخرین نسخهٔ آن روی گوشی کش می‌شود تا آفلاین هم در دسترس باشد. */
function readCachedDeedsPopupText() {
  try {
    const cached = JSON.parse(localStorage.getItem(DEEDS_POPUP_TEXT_KEY) || 'null');
    if (cached && typeof cached === 'object') return cached;
  } catch (e) {}
  return { text: '', color: '', font: 'default' };
}

function dailyDeedsDateKey(d) {
  d = d || new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function getDailyDeedsLog() {
  try { return JSON.parse(localStorage.getItem(DAILY_DEEDS_LOG_KEY) || '{}') || {}; } catch (e) { return {}; }
}
function saveDailyDeedsLog(log) {
  try { localStorage.setItem(DAILY_DEEDS_LOG_KEY, JSON.stringify(log)); } catch (e) {}
}
function readCachedDailyDeeds() {
  try {
    const cached = JSON.parse(localStorage.getItem(DAILY_DEEDS_ITEMS_KEY) || '[]');
    return Array.isArray(cached) ? cached : [];
  } catch (e) { return []; }
}
async function loadDailyDeedsItems() {
  try {
    const r = await apiFetch('/daily-deeds');
    if (r && Array.isArray(r.items)) {
      dailyDeedsItems = r.items;
      try { localStorage.setItem(DAILY_DEEDS_ITEMS_KEY, JSON.stringify(r.items)); } catch (e) {}
      if (r.popup && typeof r.popup === 'object') {
        try { localStorage.setItem(DEEDS_POPUP_TEXT_KEY, JSON.stringify(r.popup)); } catch (e) {}
      }
      return;
    }
  } catch (e) { /* آفلاین یا خطای سرور: از نسخهٔ ذخیره‌شده استفاده می‌شود */ }
  dailyDeedsItems = readCachedDailyDeeds();
}

function openDailyDeeds() {
  // ابتدا فوری با نسخهٔ ذخیره‌شده نمایش بده، سپس در صورت وجود اینترنت به‌روز کن
  dailyDeedsItems = readCachedDailyDeeds();
  const todayEntry = getDailyDeedsLog()[dailyDeedsDateKey()] || {};
  dailyDeedsDraft = {};
  (todayEntry.done || []).forEach((id) => { dailyDeedsDraft[id] = true; });
  renderDailyDeeds();
  loadDailyDeedsItems().then(() => { if (currentTab === 'daily-deeds') renderDailyDeeds(); });
}

function renderDailyDeeds() {
  const key = dailyDeedsDateKey();
  const entry = getDailyDeedsLog()[key] || {};
  const listEl = document.getElementById('daily-deeds-list');
  const summaryEl = document.getElementById('daily-deeds-summary');
  const statusEl = document.getElementById('daily-deeds-status');
  const confirmBtn = document.getElementById('daily-deeds-confirm');
  if (!listEl) return;

  try {
    document.getElementById('daily-deeds-date').textContent = new Date().toLocaleDateString('fa-IR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  } catch (e) { document.getElementById('daily-deeds-date').textContent = key; }

  listEl.innerHTML = '';
  if (!dailyDeedsItems.length) {
    listEl.innerHTML = '<p class="muted-text small">هنوز فهرستی تعریف نشده است. لطفاً یک‌بار با اینترنت وارد این بخش شوید.</p>';
    summaryEl.textContent = '';
    confirmBtn.classList.add('hidden');
    statusEl.textContent = '';
    renderDailyDeedsHistory();
    return;
  }
  confirmBtn.classList.remove('hidden');

  let doneCount = 0;
  dailyDeedsItems.forEach((it) => {
    const done = !!dailyDeedsDraft[it.id];
    if (done) doneCount++;
    const row = document.createElement('div');
    row.className = 'checklist-row' + (done ? ' is-done' : '');
    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = done;
    cb.addEventListener('change', () => {
      dailyDeedsDraft[it.id] = cb.checked;
      renderDailyDeeds();
    });
    label.appendChild(cb);
    label.appendChild(document.createTextNode(' ' + (it.icon ? it.icon + ' ' : '') + it.title));
    row.appendChild(label);
    listEl.appendChild(row);
  });

  summaryEl.textContent = toPersianDigits(doneCount) + ' از ' + toPersianDigits(dailyDeedsItems.length) + ' مورد انتخاب شده';
  const confirmedIds = (entry.done || []).slice().sort().join(',');
  const draftIds = dailyDeedsItems.filter((it) => dailyDeedsDraft[it.id]).map((it) => it.id).sort().join(',');
  const unchanged = entry.confirmed && confirmedIds === draftIds;
  confirmBtn.textContent = entry.confirmed ? 'به‌روزرسانی تأیید امروز' : 'تأیید و ثبت امروز';
  confirmBtn.disabled = !!unchanged;
  statusEl.textContent = entry.confirmed
    ? (unchanged ? '✅ اعمال امروز ثبت شده است.' : 'تغییری در انتخاب‌ها داده‌اید؛ برای ثبت، دوباره تأیید کنید.')
    : '';
  renderDailyDeedsHistory();
}

/* گزارش اعمال: هفته (۷ روز اخیر)، ماه (۳۰ روز اخیر)، سال (۳۶۵ روز اخیر) */
const DEEDS_RANGES = {
  7:   { word: 'هفته', recent: '۷ روز اخیر' },
  30:  { word: 'ماه',  recent: '۳۰ روز اخیر' },
  365: { word: 'سال',  recent: '۳۶۵ روز اخیر' },
};
let dailyDeedsRange = 7;
function renderDailyDeedsWeekReport() {
  const el = document.getElementById('daily-deeds-week-report');
  const totalEl = document.getElementById('daily-deeds-week-total');
  if (!el) return;
  const range = DEEDS_RANGES[dailyDeedsRange] ? dailyDeedsRange : 7;
  const meta = DEEDS_RANGES[range];
  const titleEl = document.getElementById('daily-deeds-report-title');
  if (titleEl) titleEl.textContent = 'گزارش ' + meta.word + ' (' + meta.recent + ')';
  document.querySelectorAll('#daily-deeds-range button').forEach((b) => b.classList.toggle('active', Number(b.dataset.range) === range));
  const log = getDailyDeedsLog();
  const counts = {}; // id -> { title, count }
  const currentTitles = {};
  (dailyDeedsItems.length ? dailyDeedsItems : readCachedDailyDeeds()).forEach((it) => {
    currentTitles[it.id] = (it.icon ? it.icon + ' ' : '') + it.title;
  });
  let confirmedDays = 0, totalDeeds = 0;
  for (let i = 0; i < range; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const e = log[dailyDeedsDateKey(d)];
    if (!e || !e.confirmed) continue;
    confirmedDays++;
    (e.done || []).forEach((id) => {
      const title = (e.titles && e.titles[id]) || currentTitles[id];
      if (!title) return;
      if (!counts[id]) counts[id] = { title, count: 0 };
      counts[id].count++;
      totalDeeds++;
    });
  }
  // اعمالی که هنوز در فهرست هستند ولی در این بازه انجام نشده‌اند هم با عدد صفر نشان داده می‌شوند
  Object.keys(currentTitles).forEach((id) => {
    if (!counts[id]) counts[id] = { title: currentTitles[id], count: 0 };
  });
  const rows = Object.values(counts).sort((a, b) => b.count - a.count);
  el.innerHTML = '';
  if (!rows.length) { totalEl.textContent = ''; return; }
  totalEl.textContent = confirmedDays
    ? 'در این ' + meta.word + ' ' + toPersianDigits(totalDeeds) + ' عمل نیک ثبت کرده‌اید (در ' + toPersianDigits(confirmedDays) + ' روز از ' + toPersianDigits(range) + ' روز).'
    : 'در ' + meta.recent + ' هنوز عملی ثبت نشده است.';
  const max = Math.max(1, rows[0].count);
  rows.forEach((r) => {
    const row = document.createElement('div');
    row.className = 'daily-deeds-history-row is-block' + (r.count ? '' : ' is-empty');
    row.innerHTML = '<div class="deeds-row-top"><span></span><span class="deeds-count"></span></div><div class="deeds-bar"><i></i></div>';
    row.querySelector('span').textContent = r.title;
    row.querySelector('.deeds-count').textContent = toPersianDigits(r.count) + ' بار';
    row.querySelector('i').style.width = r.count ? Math.max(4, Math.round((r.count / max) * 100)) + '%' : '0%';
    el.appendChild(row);
  });
}
document.querySelectorAll('#daily-deeds-range button').forEach((b) => {
  b.addEventListener('click', () => {
    dailyDeedsRange = Number(b.dataset.range) || 7;
    try { localStorage.setItem('arefanejam_deeds_range', String(dailyDeedsRange)); } catch (e) {}
    renderDailyDeedsWeekReport();
  });
});
try { const r = Number(localStorage.getItem('arefanejam_deeds_range')); if (DEEDS_RANGES[r]) dailyDeedsRange = r; } catch (e) {}

function renderDailyDeedsHistory() {
  renderDailyDeedsWeekReport();
  const el = document.getElementById('daily-deeds-history');
  if (!el) return;
  const log = getDailyDeedsLog();
  el.innerHTML = '';
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const e = log[dailyDeedsDateKey(d)];
    const row = document.createElement('div');
    row.className = 'daily-deeds-history-row' + (e && e.confirmed ? '' : ' is-empty');
    let dayLabel;
    try { dayLabel = d.toLocaleDateString('fa-IR', { weekday: 'long', month: 'long', day: 'numeric' }); } catch (x) { dayLabel = dailyDeedsDateKey(d); }
    const result = e && e.confirmed
      ? toPersianDigits((e.done || []).length) + ' از ' + toPersianDigits(e.total || 0)
      : 'ثبت نشده';
    row.innerHTML = '<span></span><strong></strong>';
    row.children[0].textContent = dayLabel;
    row.children[1].textContent = result;
    el.appendChild(row);
  }
}

function saveDailyDeedsForToday(draft) {
  const log = getDailyDeedsLog();
  const done = dailyDeedsItems.filter((it) => draft[it.id]).map((it) => it.id);
  // عنوان هر عمل هم همان لحظه ذخیره می‌شود تا اگر مدیر بعداً عنوان را عوض یا حذف کرد، گزارش گذشته سالم بماند
  const titles = {};
  dailyDeedsItems.forEach((it) => { if (draft[it.id]) titles[it.id] = (it.icon ? it.icon + ' ' : '') + it.title; });
  log[dailyDeedsDateKey()] = { confirmed: true, done, titles, total: dailyDeedsItems.length, at: Date.now() };
  // نگهداری ۴۰۰ روز اخیر (برای گزارش سالانه) تا حافظه بیهوده پر نشود
  const keys = Object.keys(log).sort();
  while (keys.length > 400) delete log[keys.shift()];
  saveDailyDeedsLog(log);
}
document.getElementById('daily-deeds-confirm').addEventListener('click', () => {
  saveDailyDeedsForToday(dailyDeedsDraft);
  renderDailyDeeds();
});

/* ---------- میزان قرآن خوانده‌شده (روزانه، خودکار و کاملاً آفلاین) ----------
   برخلاف نسخهٔ قبلی (که کاربر باید عدد+واحد را خودش وارد می‌کرد)، این بخش دیگر
   هیچ ورودی دستی ندارد: همین که کاربر وارد بخش «قرآن کریم» می‌شود و آیه‌ای را
   واقعاً روی صفحه می‌بیند (نه فقط لحظه‌ای رد شدن هنگام اسکرول تند)، همان آیه
   به‌صورت خودکار برای «امروز» ثبت می‌شود. تشخیص «واقعاً خوانده شدن» با
   IntersectionObserver روی هر بلوک آیه انجام می‌شود: وقتی بخش عمدهٔ یک آیه در
   ناحیهٔ دیدِ کاربر بماند و حداقل ۱٫۲ ثانیه همان‌جا بماند (dwell time)، آن آیه
   «خوانده‌شده» علامت می‌خورد. چون هر آیهٔ قرآن از قبل شمارهٔ صفحه/جزء مشخصی دارد
   (چه در حالت آنلاین از API و چه در حالت آفلاین از متن ذخیره‌شده در IndexedDB)،
   نیازی نیست کاربر چیزی مثل «فلان جزء/سوره» را دستی مشخص کند؛ همه‌چیز از همان
   محتوایی که واقعاً باز کرده استخراج می‌شود. کل این سازوکار فقط با localStorage
   کار می‌کند، پس بدون اینترنت هم کاملاً فعال است. */
const QURAN_READ_LOG_KEY = 'arefanejam_quran_read_log';
const QURAN_READ_DWELL_MS = 1200;
const QURAN_READ_VISIBLE_THRESHOLD = 0.6;
let quranReadObserver = null;
// وقتی کاربر مستقیم به یک آیهٔ خاص می‌پرد (مثلاً از جست‌وجو، بوکمارک، یا پاپ‌آپ «ادامه»)،
// صفحه با اسکرولِ نرم (smooth) به آن آیه می‌رود؛ در همین حین، آیه‌های میانی هم برای یک لحظه
// از جلوی چشم رد می‌شوند. بدون این پرچم، ردیاب معمولیِ زیر همان عبورِ لحظه‌ای را با «واقعاً
// خواندن» اشتباه می‌گرفت و کاربری که مثلاً مستقیم به آیهٔ ۲۰ پریده، اشتباهاً «آیات ۱ تا ۱۹ را
// هم خوانده» ثبت می‌شد. تا وقتی این پرچم روشن است، ردیاب هیچ رویداد دیده‌شدن/ردشدنی را پردازش
// نمی‌کند؛ فقط بعد از اینکه اسکرول کاملاً بند بیاید (کاربر واقعاً روی یک آیه توقف کند) دوباره
// فعال می‌شود.
let quranProgrammaticScrollActive = false;

// صبر می‌کند تا اسکرولِ ناحیهٔ rootEl کاملاً بند بیاید (برای تشخیصِ پایانِ اسکرولِ نرمِ پرشی).
// چون نه‌همهٔ مرورگرها رویداد «scrollend» را دارند، از یک تایمرِ بی‌صدا (debounce) هم به‌عنوان
// جایگزین/محافظ استفاده می‌شود؛ در بدترین حالت هم حداکثر timeoutMs صبر می‌کند و بعد آزاد می‌شود.
function waitForQuranScrollSettle(rootEl, timeoutMs) {
  return new Promise((resolve) => {
    if (!rootEl) { resolve(); return; }
    let done = false;
    let debounceTimer = null;
    let maxTimer = null;
    const finish = () => {
      if (done) return;
      done = true;
      try { rootEl.removeEventListener('scroll', onScroll); } catch (e) {}
      try { rootEl.removeEventListener('scrollend', finish); } catch (e) {}
      clearTimeout(debounceTimer);
      clearTimeout(maxTimer);
      resolve();
    };
    const onScroll = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(finish, 150);
    };
    rootEl.addEventListener('scroll', onScroll, { passive: true });
    rootEl.addEventListener('scrollend', finish, { passive: true }); // مرورگرهای جدید
    debounceTimer = setTimeout(finish, 200); // اگر اصلاً اسکرولی رخ نداد (از قبل همان‌جا بوده)
    maxTimer = setTimeout(finish, timeoutMs || 2500); // محافظ نهایی
  });
}

/* ---------- پیشرفت کلی ختم قرآن (نوار سبز) ----------
   برخلاف «arefanejam_quran_read_log» که فقط ۶۰ روز اخیر را نگه می‌دارد، این بخش
   شمارهٔ سراسری (global) هر آیه‌ای را که کاربر تا به‌حال دست‌کم یک‌بار واقعاً
   خوانده، برای همیشه (بدون محدودیت روز) در یک کلید جدا در localStorage نگه
   می‌دارد تا با پاک‌سازی روزهای قدیمی از بین نرود. کل قرآن ۶۲۳۶ آیه دارد (همان
   عددی که در بخش دانلود آفلاین متن قرآن هم استفاده شده)، پس درصد پیشرفت هم
   کاملاً محلی و بدون نیاز به اینترنت محاسبه می‌شود. */
const QURAN_TOTAL_AYAHS = 6236;
const QURAN_OVERALL_PROGRESS_KEY = 'arefanejam_quran_overall_progress';

function getQuranOverallProgressSet() {
  try {
    const arr = JSON.parse(localStorage.getItem(QURAN_OVERALL_PROGRESS_KEY) || '[]');
    return new Set(Array.isArray(arr) ? arr : []);
  } catch (e) { return new Set(); }
}
function saveQuranOverallProgressSet(set) {
  try { localStorage.setItem(QURAN_OVERALL_PROGRESS_KEY, JSON.stringify(Array.from(set))); } catch (e) {}
}
// ثبت خودکار یک آیه در پیشرفت کلی (idempotent)؛ خروجی: آیا چیزی تغییر کرد
function markAyahInOverallProgress(globalAyahNumber) {
  if (!globalAyahNumber) return false;
  const set = getQuranOverallProgressSet();
  if (set.has(globalAyahNumber)) return false;
  set.add(globalAyahNumber);
  saveQuranOverallProgressSet(set);
  return true;
}
function renderQuranOverallProgress() {
  const ringEl = document.getElementById('quran-progress-ring-fill');
  const percentEl = document.getElementById('quran-progress-percent');
  const textEl = document.getElementById('quran-progress-text');
  if (!ringEl || !percentEl || !textEl) return;
  const readCount = getQuranOverallProgressSet().size;
  const percent = Math.min(100, (readCount / QURAN_TOTAL_AYAHS) * 100);
  const remaining = Math.max(0, QURAN_TOTAL_AYAHS - readCount);
  const circumference = 2 * Math.PI * 60; // r=60 در SVG
  const offset = circumference - (percent / 100) * circumference;
  ringEl.style.strokeDasharray = circumference.toFixed(2);
  ringEl.style.strokeDashoffset = offset.toFixed(2);
  percentEl.textContent = toPersianDigits(percent.toFixed(percent >= 10 ? 0 : 1)) + '٪';
  if (!readCount) {
    textEl.textContent = 'هنوز از این قرآن چیزی خوانده نشده — با باز کردن یک سوره شروع کنید.';
  } else {
    textEl.textContent = toPersianDigits(readCount) + ' از ' + toPersianDigits(QURAN_TOTAL_AYAHS) + ' آیه خوانده‌شده — ' + toPersianDigits(remaining) + ' آیه باقی مانده';
  }
}

function getQuranReadLog() {
  try { return JSON.parse(localStorage.getItem(QURAN_READ_LOG_KEY) || '{}') || {}; } catch (e) { return {}; }
}
function saveQuranReadLog(log) {
  // نگهداری فقط ۶۰ روز اخیر تا حافظهٔ گوشی بیهوده پر نشود
  const keys = Object.keys(log).sort();
  while (keys.length > 60) delete log[keys.shift()];
  try { localStorage.setItem(QURAN_READ_LOG_KEY, JSON.stringify(log)); } catch (e) {}
}
// ثبت خودکار یک آیه به‌عنوان «خوانده‌شدهٔ امروز» (idempotent: تکرار همان آیه در همان روز اثر اضافه‌ای ندارد)
function recordQuranAyahRead(ayah) {
  if (!ayah || !ayah.number) return;
  const key = dailyDeedsDateKey();
  const log = getQuranReadLog();
  const entry = log[key] || { ayahs: [], pages: [], juzs: [], bySurah: {} };
  if (!entry.bySurah) entry.bySurah = {};
  let changed = false;
  if (entry.ayahs.indexOf(ayah.number) === -1) { entry.ayahs.push(ayah.number); changed = true; }
  if (ayah.page && entry.pages.indexOf(ayah.page) === -1) { entry.pages.push(ayah.page); changed = true; }
  if (ayah.juz && entry.juzs.indexOf(ayah.juz) === -1) { entry.juzs.push(ayah.juz); changed = true; }
  if (ayah.surahNumber) {
    const sKey = String(ayah.surahNumber);
    const sEntry = entry.bySurah[sKey] || { name: ayah.surahName || '', ayahs: [], juzs: [] };
    if (!sEntry.juzs) sEntry.juzs = [];
    if (ayah.surahName && !sEntry.name) sEntry.name = ayah.surahName;
    if (ayah.numberInSurah && sEntry.ayahs.indexOf(ayah.numberInSurah) === -1) { sEntry.ayahs.push(ayah.numberInSurah); changed = true; }
    if (ayah.juz && sEntry.juzs.indexOf(ayah.juz) === -1) { sEntry.juzs.push(ayah.juz); changed = true; }
    entry.bySurah[sKey] = sEntry;
  }
  const overallChanged = markAyahInOverallProgress(ayah.number);
  if (!changed && !overallChanged) return;
  if (changed) {
    entry.at = Date.now();
    log[key] = entry;
    saveQuranReadLog(log);
  }
  if (currentTab === 'quran-report') { renderQuranAmountToday(); renderQuranAmountWeek(); renderQuranOverallProgress(); }
}
/* ---------- «کامل خوانده‌شدن» هر آیه (برای قابلیت ادامهٔ سورهٔ نیمه‌کاره) ----------
   مجموعهٔ arefanejam_quran_overall_progress (بالا) فقط یعنی «این آیه دست‌کم یک‌بار
   دیده شده» (۶۰٪ آیه، ۱٫۲ ثانیه) و همچنان برای آمار/نوار کلی پیشرفت همان‌طور می‌ماند.
   اما برای تشخیصِ «کاربر تا کجای این سوره را واقعاً تا آخر خوانده»، این کافی نیست:
   ممکن است کاربر وسط یک آیهٔ بلند از صفحه خارج شده باشد و فقط نیمهٔ اول آن را دیده
   باشد. اینجا یک مجموعهٔ جداگانه و سخت‌گیرانه‌تر نگه می‌داریم که فقط وقتی یک آیه
   را «کامل» می‌داند که کاربر پس از دیدنش، از رویش رد شده (یعنی پایین‌ترین لبهٔ آن
   بلوک کاملاً از بالای ناحیهٔ دیدِ کاربر عبور کرده، نه اینکه هنوز به آن نرسیده یا
   وسط راه به بالا برگشته). با این مجموعه، اگر کاربر یک آیه را نیمه‌کاره رها کرده
   باشد، پاپ‌آپ «ادامه» او را از همان ابتدای همان آیه (نه آیهٔ بعدی) ادامه می‌دهد. */
const QURAN_FULLY_READ_KEY = 'arefanejam_quran_fully_read_progress';
function getQuranFullyReadSet() {
  try {
    const arr = JSON.parse(localStorage.getItem(QURAN_FULLY_READ_KEY) || '[]');
    return new Set(Array.isArray(arr) ? arr : []);
  } catch (e) { return new Set(); }
}
function saveQuranFullyReadSet(set) {
  try { localStorage.setItem(QURAN_FULLY_READ_KEY, JSON.stringify(Array.from(set))); } catch (e) {}
}
function markAyahFullyRead(globalAyahNumber) {
  if (!globalAyahNumber) return;
  const set = getQuranFullyReadSet();
  if (set.has(globalAyahNumber)) return;
  set.add(globalAyahNumber);
  saveQuranFullyReadSet(set);
}
// انتقالِ یک‌بارهٔ پیشرفتِ قدیمی: قبل از این تغییر، پاپ‌آپِ «ادامه» از همان مجموعهٔ
// «دیده‌شده»ٔ کلی استفاده می‌کرد. برای اینکه پیشرفتِ قبلیِ کاربر (قبل از نصب این نسخه)
// خالی به نظر نرسد، یک‌بار مجموعهٔ «دیده‌شده» را در مجموعهٔ «کامل خوانده‌شده» کپی
// می‌کنیم؛ از این به بعد، هر آیهٔ تازه فقط با همان قاعدهٔ سخت‌گیرانهٔ جدید ثبت می‌شود.
let quranFullyReadMigrationChecked = false;
function ensureQuranFullyReadMigrated() {
  if (quranFullyReadMigrationChecked) return;
  quranFullyReadMigrationChecked = true;
  try {
    if (localStorage.getItem('arefanejam_quran_fully_read_migrated_v1')) return;
    if (getQuranFullyReadSet().size === 0) {
      const overall = getQuranOverallProgressSet();
      if (overall.size > 0) saveQuranFullyReadSet(overall);
    }
    localStorage.setItem('arefanejam_quran_fully_read_migrated_v1', '1');
  } catch (e) {}
}

let quranReadScrollTarget = null;
let quranReadScrollHandler = null;

// جلوگیری از نشتِ observer/تایمرها/اسکرول‌لیسنرِ قبلی هر بار که محتوای تازه (سورهٔ/جزء دیگر) بارگذاری می‌شود
function disconnectQuranReadingTracker() {
  if (quranReadObserver) { try { quranReadObserver.disconnect(); } catch (e) {} quranReadObserver = null; }
  if (quranReadScrollTarget && quranReadScrollHandler) {
    try { quranReadScrollTarget.removeEventListener('scroll', quranReadScrollHandler); } catch (e) {}
  }
  quranReadScrollTarget = null;
  quranReadScrollHandler = null;
}
// اتصال ردیاب خودکار به بلوک‌های آیهٔ همین صفحه (سوره یا جزء) — بدون هیچ دخالت کاربر.
// ayahs باید از قبل با surahNumber/surahName غنی‌سازی شده باشند (نگاه کنید به محل فراخوانی
// در renderSurahContent/renderJuzContent) تا هنگام ثبت، اسم سوره و شمارهٔ آیهٔ داخل سوره هم معلوم باشد.
function attachQuranReadingTracker(rootEl, ayahs, blocks) {
  disconnectQuranReadingTracker();
  if (!('IntersectionObserver' in window) || !ayahs || !blocks || !ayahs.length) return;
  quranReadObserver = new IntersectionObserver((entries) => {
    if (quranProgrammaticScrollActive) return; // در حال عبورِ لحظه‌ایِ پرشی؛ چیزی ثبت نشود
    entries.forEach((entry) => {
      const idx = Number(entry.target.dataset.quranTrackIndex);
      if (Number.isNaN(idx)) return;
      const ratio = entry.intersectionRatio;
      if (ratio >= QURAN_READ_VISIBLE_THRESHOLD) {
        // به‌قدر کافی دیده می‌شود؛ تایمرِ دیده‌شدن را (اگر از قبل شروع نشده) شروع کن
        if (!entry.target._quranDwellTimer) {
          entry.target._quranDwellTimer = setTimeout(() => {
            entry.target._quranDwellTimer = null;
            entry.target._quranSeen = true; // این آیه دست‌کم یک‌بار به‌قدر کافی دیده شده
            recordQuranAyahRead(ayahs[idx]);
            // اگر کل محتوای این صفحه همین الان هم بدون نیاز به اسکرول در صفحه جا می‌شود
            // (مثلاً سورهٔ خیلی کوتاهی مثل حمد که کاملاً در یک صفحه‌نمایش جا می‌شود)، این
            // آیه هیچ‌وقت از بالای ناحیهٔ دید «رد» نمی‌شود تا شرطِ ratio===0 پایین‌تر فعال
            // شود؛ چون دیگر چیزی برای اسکرول‌کردن نیست، همین‌که به‌قدر کافی دیده شده را هم
            // «کامل خوانده‌شده» حساب می‌کنیم (وگرنه چنین سوره‌هایی هیچ‌وقت کامل ثبت نمی‌شدند).
            if (!entry.target._quranFullyMarked && rootEl.scrollHeight - rootEl.clientHeight <= 6) {
              entry.target._quranFullyMarked = true;
              markAyahFullyRead(ayahs[idx].number);
              entry.target.classList.add('ayah-read-highlight');
              maybeNotifyQuranSurahLiveProgress(ayahs[idx]);
            }
          }, QURAN_READ_DWELL_MS);
        }
        return;
      }
      if (entry.target._quranDwellTimer) {
        clearTimeout(entry.target._quranDwellTimer);
        entry.target._quranDwellTimer = null;
      }
      // «کامل رد شدن» را فقط دقیقاً وقتی بررسی کن که نسبت دیده‌شدن به صفر رسیده
      // باشد (یعنی کاملاً از ناحیهٔ دید خارج شده)، نه فقط از زیر آستانهٔ ۶۰٪ رد شده
      // باشد — وگرنه هنوز ۴۰٪ از آیه توی صفحه است و «کامل» حساب کردنش اشتباه است.
      if (ratio === 0 && entry.target._quranSeen && !entry.target._quranFullyMarked) {
        const rootTop = entry.rootBounds ? entry.rootBounds.top : 0;
        if (entry.boundingClientRect.bottom <= rootTop) {
          entry.target._quranFullyMarked = true;
          markAyahFullyRead(ayahs[idx].number);
          entry.target.classList.add('ayah-read-highlight'); // هایلایتِ فوریِ همین لحظه
          maybeNotifyQuranSurahLiveProgress(ayahs[idx]);
        }
      }
    });
  }, { root: rootEl, threshold: [0, QURAN_READ_VISIBLE_THRESHOLD] });
  blocks.forEach((block, i) => {
    block.dataset.quranTrackIndex = i;
    block._quranSeen = false;
    block._quranFullyMarked = false;
    quranReadObserver.observe(block);
  });
  // حالت خاص: اگر آخرین آیهٔ سوره همان‌قدر کوتاه باشد که هیچ‌وقت از بالای صفحه رد
  // نشود (چون دیگر چیزی برای اسکرول‌کردنِ بیشتر نیست)، وقتی کاربر تا انتهای صفحه
  // اسکرول کند و آن را دیده باشد، همان را هم «کامل» حساب کن.
  quranReadScrollTarget = rootEl;
  quranReadScrollHandler = () => {
    if (quranProgrammaticScrollActive) return; // در حال عبورِ لحظه‌ایِ پرشی؛ چیزی ثبت نشود
    if (rootEl.scrollHeight - rootEl.scrollTop - rootEl.clientHeight > 6) return;
    const lastBlock = blocks[blocks.length - 1];
    const lastAyah = ayahs[ayahs.length - 1];
    if (lastBlock && lastBlock._quranSeen && !lastBlock._quranFullyMarked && lastAyah) {
      lastBlock._quranFullyMarked = true;
      markAyahFullyRead(lastAyah.number);
      lastBlock.classList.add('ayah-read-highlight');
      maybeNotifyQuranSurahLiveProgress(lastAyah);
    }
  };
  rootEl.addEventListener('scroll', quranReadScrollHandler, { passive: true });
}
// هرباری که یک آیهٔ تازه «کامل خوانده‌شده» ثبت می‌شود (همان لحظه، بدون نیاز به خروج از
// صفحه)، پیامِ «تا اینجا خوانده‌اید» / «این سوره کامل شد» را (اگر مدیر سایت فعال کرده
// باشد) بلافاصله نشان بده. عمداً فقط وقتی کاربر مشغولِ خواندنِ یک سورهٔ مجزا است اجرا
// می‌شود (نه در نمای «جزء» که هر آیه ممکن است سورهٔ متفاوتی داشته باشد و شمارشِ زیر فقط
// برای یک سوره در آنِ واحد معنی دارد)؛ در نمای جزء، رفتارِ قبلی (نمایش لحظهٔ خروج از
// صفحه) دست‌نخورده باقی می‌ماند.
// پیامِ «تا اینجا خوانده‌اید» عمداً بعد از هر تک آیه نشان داده نمی‌شود (که خودش آزاردهنده
// و پشتِ‌سرِهم می‌شد)، بلکه هر ۵ آیه یک‌بار؛ اما پیامِ «این سوره کامل شد» همیشه دقیقاً
// همان لحظهٔ رسیدن به آخرین آیه، فقط یک‌بار برای هر سوره.
const QURAN_LIVE_PROGRESS_STEP = 5;
const quranLiveNotifiedKeys = new Set();
function maybeNotifyQuranSurahLiveProgress(ayah) {
  if (!ayah || !ayah.surahNumber) return;
  if (typeof currentSurahNumber === 'undefined' || ayah.surahNumber !== currentSurahNumber) return;
  const surahNumber = ayah.surahNumber;
  const s = state.settings || {};
  const progressCfg = (s.quran_popup && s.quran_popup.surah_progress) || {};
  const completeCfg = (s.quran_popup && s.quran_popup.surah_complete) || {};
  if (!progressCfg.active && !completeCfg.active) return; // مدیر سایت هیچ‌کدام را فعال نکرده
  getSurahMaxReadAyah(surahNumber).then(({ max, total }) => {
    if (!total || max <= 0) return;
    const isComplete = max >= total;
    if (!isComplete && max % QURAN_LIVE_PROGRESS_STEP !== 0) return; // هنوز به آستانهٔ بعدی نرسیده
    const notifyKey = surahNumber + ':' + (isComplete ? 'complete' : max);
    if (quranLiveNotifiedKeys.has(notifyKey)) return; // همین نقطه از همین سوره قبلاً نشان داده شده
    quranLiveNotifiedKeys.add(notifyKey);
    getSurahNameByNumber(surahNumber).then((name) => {
      if (isComplete) {
        if (!completeCfg.active || !completeCfg.text) return;
        showQuranSurahCompletePopup(surahNumber, name, completeCfg);
      } else {
        if (!progressCfg.active || !progressCfg.text) return;
        showQuranSurahProgressPopup(max, total, name, progressCfg);
      }
      // هم‌زمان بیس‌لاینِ پاپ‌آپِ «لحظهٔ خروج» را هم به همین‌جا برسان تا وقتی کاربر واقعاً
      // این صفحه را ترک می‌کند، دوباره همین خبر را (که همین الان دید) تکرار نبیند.
      quranExitPopupBaselineSurah = surahNumber;
      quranExitPopupBaselineMax = max;
    });
  }).catch(() => {});
}
// روی بلوک‌های تازه‌رندرشده، آیه‌هایی را که از قبل (در بازدیدهای گذشته) «کامل خوانده‌شده»
// بودند بلافاصله هایلایت می‌کند تا کاربر همان لحظهٔ باز کردنِ سوره ببیند کجاها را قبلاً
// خوانده — و در ضمن، ابزار خودِ کاربر برای راستی‌آزمایی درستیِ ردیابی باشد.
function highlightPreviouslyReadAyahs(ayahs, blocks) {
  const fullySet = getQuranFullyReadSet();
  (blocks || []).forEach((block, i) => {
    const ayah = ayahs && ayahs[i];
    if (ayah && fullySet.has(ayah.number)) block.classList.add('ayah-read-highlight');
  });
}
// تبدیل فهرستی از شماره‌آیه‌های داخل سوره به بازه‌های خوانا، مثلاً [1,2,3,5,7,8] -> «آیات ۱ تا ۳، آیهٔ ۵، آیات ۷ تا ۸»
function formatAyahRanges(nums) {
  const arr = Array.from(new Set(nums)).sort((a, b) => a - b);
  if (!arr.length) return '';
  const parts = [];
  let start = arr[0], prev = arr[0];
  for (let i = 1; i <= arr.length; i++) {
    const cur = arr[i];
    if (cur === prev + 1) { prev = cur; continue; }
    parts.push(start === prev ? ('آیهٔ ' + toPersianDigits(start)) : ('آیات ' + toPersianDigits(start) + ' تا ' + toPersianDigits(prev)));
    start = cur; prev = cur;
  }
  return parts.join('، ');
}
// فهرست خطوطِ جدا برای هر سوره‌ای که در آن روز خوانده شده (هر سوره روی خط خودش، برای نمایش زیر هم)
function getQuranReadEntryLines(e) {
  if (!e) return [];
  const lines = [];
  const bySurah = e.bySurah || {};
  Object.keys(bySurah).forEach((sKey) => {
    const s = bySurah[sKey];
    if (!s.ayahs || !s.ayahs.length) return;
    let line = 'سورهٔ ' + (s.name || sKey) + ' — ' + formatAyahRanges(s.ayahs);
    if (s.juzs && s.juzs.length) {
      const juzLabel = s.juzs.length > 1 ? 'جزءهای' : 'جزء';
      line += ' (' + juzLabel + ' ' + s.juzs.slice().sort((a, b) => a - b).map(toPersianDigits).join('، ') + ')';
    }
    lines.push(line);
  });
  // سازگاری با داده‌های ثبت‌شده در نسخهٔ قبلی که هنوز اطلاعات سوره را نداشتند
  if (!lines.length && e.juzs && e.juzs.length) {
    const juzLabel = e.juzs.length > 1 ? 'جزءهای' : 'جزء';
    lines.push(juzLabel + ' ' + e.juzs.slice().sort((a, b) => a - b).map(toPersianDigits).join('، '));
  }
  return lines;
}
// صفحهٔ جدید و مستقل «گزارش قرآن» (مسیر کوتاه‌شده: بیشتر ← محاسبه اعمال ← گزارش قرآن)
function renderQuranReportTab() {
  applyQuranReportTexts();
  renderQuranAmountToday();
  renderQuranAmountWeek();
  renderQuranOverallProgress();
}
function renderQuranAmountToday() {
  const statusEl = document.getElementById('quran-amount-status');
  if (!statusEl) return;
  const entry = getQuranReadLog()[dailyDeedsDateKey()];
  const ayahCount = entry && entry.ayahs ? entry.ayahs.length : 0;
  const pageCount = entry && entry.pages ? entry.pages.length : 0;
  if (ayahCount) {
    let msg = '✅ امروز ' + toPersianDigits(ayahCount) + ' آیه از قرآن خوانده‌اید';
    if (pageCount) msg += ' (حدود ' + toPersianDigits(pageCount) + ' صفحه)';
    msg += ' — جزئیات سوره‌ها و آیات در «میزان قرآن این هفته» همین پایین است.';
    statusEl.textContent = msg;
  } else {
    statusEl.textContent = 'امروز هنوز چیزی از بخش «قرآن کریم» نخوانده‌اید؛ با باز کردن و خواندن یک سوره، این‌جا خودکار به‌روز می‌شود.';
  }
}
function renderQuranAmountWeek() {
  const el = document.getElementById('quran-amount-week-report');
  const totalEl = document.getElementById('quran-amount-week-total');
  if (!el) return;
  const log = getQuranReadLog();
  let totalAyahs = 0, totalPages = 0, recordedDays = 0;
  el.innerHTML = '';
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const e = log[dailyDeedsDateKey(d)];
    const ayahCount = e && e.ayahs ? e.ayahs.length : 0;
    const pageCount = e && e.pages ? e.pages.length : 0;
    const lines = ayahCount ? getQuranReadEntryLines(e) : [];
    const row = document.createElement('div');
    row.className = 'daily-deeds-history-row' + (lines.length ? ' is-block' : '') + (ayahCount ? '' : ' is-empty');
    let dayLabel;
    try { dayLabel = d.toLocaleDateString('fa-IR', { weekday: 'long', month: 'long', day: 'numeric' }); } catch (x) { dayLabel = dailyDeedsDateKey(d); }
    const result = ayahCount ? (toPersianDigits(ayahCount) + ' آیه' + (pageCount ? ' (' + toPersianDigits(pageCount) + ' صفحه)' : '')) : 'خوانده نشده';
    if (lines.length) {
      row.innerHTML = '<div class="deeds-row-top"><span></span><strong></strong></div>';
      row.children[0].children[0].textContent = dayLabel;
      row.children[0].children[1].textContent = result;
      lines.forEach((line) => {
        const p = document.createElement('p');
        p.className = 'quran-read-detail-line';
        p.textContent = '📖 ' + line;
        row.appendChild(p);
      });
    } else {
      row.innerHTML = '<span></span><strong></strong>';
      row.children[0].textContent = dayLabel;
      row.children[1].textContent = result;
    }
    el.appendChild(row);
    if (ayahCount) { recordedDays++; totalAyahs += ayahCount; totalPages += pageCount; }
  }
  if (!recordedDays) {
    if (totalEl) totalEl.textContent = 'در ۷ روز اخیر هنوز چیزی ثبت نشده است.';
    return;
  }
  let summary = toPersianDigits(totalAyahs) + ' آیه';
  if (totalPages) summary += ' (مجموعاً حدود ' + toPersianDigits(totalPages) + ' صفحه)';
  if (totalEl) totalEl.textContent = 'در این هفته (' + toPersianDigits(recordedDays) + ' از ۷ روز): ' + summary;
}

/* ---------- پاپ‌آپ خودکار (فاصلهٔ زمانی از پیشخوان قابل‌تنظیم است، در هر صفحه‌ای که کاربر باشد، آفلاین هم کار می‌کند) ---------- */
const DEEDS_POPUP_LAST_KEY = 'arefanejam_deeds_popup_last';
let deedsPopupDraft = {};

function getDeedsPopupIntervalMs() {
  const cfg = readCachedDeedsPopupText();
  const minutes = Number(cfg && cfg.interval_minutes);
  return (minutes > 0 ? minutes : 300) * 60 * 1000; // پیش‌فرض ۳۰۰ دقیقه (۵ ساعت) اگر هنوز تنظیمی از سرور نرسیده باشد
}

function deedsPopupIsBlocked() {
  // اگر پنجرهٔ مهم دیگری (مثل آلارم/اعلان) باز است، همین لحظه مزاحم نشود؛ در بررسی بعدی نمایش داده می‌شود
  const alarm = document.getElementById('alarm-modal');
  if (alarm && !alarm.classList.contains('hidden')) return true;
  return false;
}
function applyDeedsPopupCustomText() {
  const el = document.getElementById('deeds-popup-custom-text');
  if (!el) return;
  const cfg = readCachedDeedsPopupText();
  const text = (cfg && cfg.text) ? String(cfg.text).trim() : '';
  if (!text) {
    el.classList.add('hidden');
    el.textContent = '';
    return;
  }
  el.textContent = text;
  el.style.color = cfg.color || '';
  el.className = 'deeds-popup-custom-text mokatib-popup-font-' + (cfg.font || 'default');
}

function renderDeedsPopup() {
  const listEl = document.getElementById('deeds-popup-list');
  listEl.innerHTML = '';
  let doneCount = 0;
  dailyDeedsItems.forEach((it) => {
    const done = !!deedsPopupDraft[it.id];
    if (done) doneCount++;
    const row = document.createElement('div');
    row.className = 'checklist-row' + (done ? ' is-done' : '');
    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = done;
    cb.addEventListener('change', () => { deedsPopupDraft[it.id] = cb.checked; renderDeedsPopup(); });
    label.appendChild(cb);
    label.appendChild(document.createTextNode(' ' + (it.icon ? it.icon + ' ' : '') + it.title));
    row.appendChild(label);
    listEl.appendChild(row);
  });
  document.getElementById('deeds-popup-summary').textContent =
    toPersianDigits(doneCount) + ' از ' + toPersianDigits(dailyDeedsItems.length) + ' مورد انتخاب شده';
}
function showDeedsPopup() {
  const items = readCachedDailyDeeds();
  if (!items.length) return false;
  dailyDeedsItems = items;
  const entry = getDailyDeedsLog()[dailyDeedsDateKey()] || {};
  deedsPopupDraft = {};
  (entry.done || []).forEach((id) => { deedsPopupDraft[id] = true; });
  applyDeedsPopupCustomText();
  renderDeedsPopup();
  document.getElementById('deeds-popup').classList.remove('hidden');
  return true;
}
function closeDeedsPopup() {
  document.getElementById('deeds-popup').classList.add('hidden');
}
function checkDeedsPopupDue() {
  const popup = document.getElementById('deeds-popup');
  if (!popup || !popup.classList.contains('hidden')) return;
  let last = Number(localStorage.getItem(DEEDS_POPUP_LAST_KEY) || 0);
  const now = Date.now();
  if (!last || last > now) {
    // اولین اجرا (یا تغییر ساعت گوشی): شمارش فاصلهٔ تنظیم‌شده از همین لحظه شروع می‌شود
    try { localStorage.setItem(DEEDS_POPUP_LAST_KEY, String(now)); } catch (e) {}
    return;
  }
  if (now - last < getDeedsPopupIntervalMs()) return;
  if (deedsPopupIsBlocked()) return;
  if (showDeedsPopup()) {
    try { localStorage.setItem(DEEDS_POPUP_LAST_KEY, String(now)); } catch (e) {}
  }
}
document.getElementById('deeds-popup-confirm').addEventListener('click', () => {
  saveDailyDeedsForToday(deedsPopupDraft);
  closeDeedsPopup();
  if (currentTab === 'daily-deeds') openDailyDeeds();
});
document.getElementById('deeds-popup-later').addEventListener('click', closeDeedsPopup);
setInterval(checkDeedsPopupDue, 60 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDeedsPopupDue(); });

/* ---------- قبله‌نما (بدون متن؛ با هشدار روشن‌کردن مکان) ---------- */
// نکته: متغیرهای وضعیت قبله‌نما (qiblaBearing، motionPermissionGranted، qbHeading، ...) بالای فایل، کنار KAABA، تعریف شده‌اند.
// علت خراب‌بودن قبله‌نما: motionPermissionGranted هیچ‌جا تعریف نشده بود و autoStartQibla همان ابتدا خطا می‌داد.

function qbEl(id) { return document.getElementById(id); }
function qbNative() {
  try { return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AppUpdater) || null; } catch (e) { return null; }
}
// «موقعیت مشخص‌شده» یعنی شهر انتخابی یا موقعیت ذخیره‌شدهٔ GPS؛ شهر پیش‌فرض ادمین حساب نمی‌شود
function qbHasLocation() { return !!(state.manualCity || loadCachedCoords()); }

function bearingToQibla(lat, lng) {
  const toRad = (d) => d * Math.PI / 180;
  const toDeg = (r) => r * 180 / Math.PI;
  const lat1 = toRad(lat), lat2 = toRad(KAABA.lat);
  const dLng = toRad(KAABA.lng - lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// قطب‌نمای گوشی شمال «مغناطیسی» را نشان می‌دهد ولی زاویهٔ قبله نسبت به شمال «حقیقی» است.
// در ایران این اختلاف حدود ۳ تا ۶ درجه است. در اپ اندروید از مدل مغناطیسی خود اندروید گرفته می‌شود (دقیق)؛
// بیرون از اپ (مرورگر) مقدار تقریبی ۵ درجه برای ایران استفاده می‌شود.
function updateQiblaDeclination() {
  if (!state.coords) return;
  const key = state.coords.lat.toFixed(2) + ',' + state.coords.lng.toFixed(2);
  if (key === qiblaDeclinationKey) return;
  qiblaDeclinationKey = key;
  const lat = state.coords.lat, lng = state.coords.lng;
  qiblaDeclination = (lat > 24 && lat < 40 && lng > 43 && lng < 64) ? 5 : 0;
  try {
    const AUp = qbNative();
    if (AUp && AUp.magneticDeclination) {
      AUp.magneticDeclination({ lat: lat, lng: lng, alt: (loadCachedCoords() || {}).alt || 0 }).then((r) => {
        if (r && typeof r.declination === 'number' && qiblaDeclinationKey === key) qiblaDeclination = r.declination;
      }).catch(() => {});
    }
  } catch (e) {}
}

/* ----- نمایش ----- */
function qbSetAligned(on) {
  if (on === qbAligned) return;
  qbAligned = on;
  const s = qbEl('qb-scene');
  if (s) s.classList.toggle('is-aligned', on);
  if (on) { try { if (navigator.vibrate) navigator.vibrate([20, 50, 30]); } catch (e) {} }
}

function qbRender() {
  const s = qbEl('qb-scene');
  if (!s) return;
  const has = qiblaBearing !== null && qbHasLocation();
  s.classList.toggle('no-loc', !has);
  if (!has) qbSetAligned(false);
  qbDraw();
  try { qbUpdateCityName(); qbMapUpdate(); } catch (e) { try { console.warn('qibla-map', e); } catch (e2) {} }
}

// صفحهٔ قطب‌نما با شمال می‌چرخد؛ نشان کعبه روی همان صفحه در زاویهٔ قبله است.
// وقتی نشان کعبه به نشانگر ثابت بالا برسد، رو به قبله‌اید.
function qbDraw() {
  const dial = qbEl('qb-dial');
  const kmark = qbEl('qb-kmark');
  const kbadge = qbEl('qb-kbadge');
  if (!dial || !kmark || !kbadge) return;
  const hasHeading = qbHeading !== null;
  const h = hasHeading ? qbHeading : 0;
  dial.style.transform = 'rotate(' + (-h).toFixed(2) + 'deg)';
  const tl = qbEl('qb-turn-l'), tr = qbEl('qb-turn-r');
  if (qiblaBearing === null) {
    if (tl) tl.style.opacity = '0';
    if (tr) tr.style.opacity = '0';
    return;
  }
  const rel = qiblaBearing - h;
  kmark.style.transform = 'rotate(' + rel.toFixed(2) + 'deg)';
  kbadge.style.transform = 'rotate(' + (-rel).toFixed(2) + 'deg)';
  if (!hasHeading) { qbSetAligned(false); return; }
  // اختلاف نسبت به بالا، در بازهٔ ۱۸۰- تا ۱۸۰ (مثبت = نشان کعبه سمت راست = گوشی را به راست بچرخانید)
  const d = ((rel % 360) + 540) % 360 - 180;
  const ad = Math.abs(d);
  if (!qbAligned && ad <= 3) qbSetAligned(true);
  else if (qbAligned && ad > 5) qbSetAligned(false);
  const k = qbAligned ? 0 : Math.min(1, Math.max(0, (ad - 3) / 22));
  if (tr) tr.style.opacity = d > 0 ? String(k) : '0';
  if (tl) tl.style.opacity = d < 0 ? String(k) : '0';
}

// هر جا مختصات جدیدی به دست بیاید (GPS، شهر دستی)، بلافاصله و در پس‌زمینه زاویهٔ قبله هماهنگ می‌شود
function refreshQiblaCompassIfReady() {
  updateHomeLocationBtnState();
  if (!state.coords || !qbHasLocation()) { qiblaBearing = null; qbRender(); return; }
  qiblaBearing = bearingToQibla(state.coords.lat, state.coords.lng);
  updateQiblaDeclination();
  qbRender();
}

/* ----- نام شهر زیر قبله‌نما ----- */
function qbUpdateCityName() {
  const el = qbEl('qb-city-name');
  if (!el) return;
  let txt = 'انتخاب شهر';
  if (state.manualCity && state.manualCity.name) {
    txt = state.manualCity.name;
  } else {
    const c = loadCachedCoords();
    if (c) {
      let near = null;
      try { near = findNearestCity(c.lat, c.lng); } catch (e) {}
      txt = near ? near.name + ' (موقعیت دقیق)' : 'موقعیت دقیق من';
    }
  }
  if (el.textContent !== txt) el.textContent = txt;
}

/* ----- نقشه: خط از موقعیت کاربر تا کعبه ----- */
// نقشهٔ ساده بدون کتابخانه: کاشی‌های OpenStreetMap + خط روی SVG. اگر اینترنت نباشد، فقط خطوط شبکه + خط قبله کشیده می‌شود.
function qbMercator(lat, lng, z) {
  const s = 256 * Math.pow(2, z);
  const x = (lng + 180) / 360 * s;
  const sin = Math.sin(Math.max(-85.05, Math.min(85.05, lat)) * Math.PI / 180);
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s;
  return { x: x, y: y };
}
function qbDistanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r, dLng = (lng2 - lng1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
// نقاط مسیر کوتاه‌ترین راه (دایرهٔ عظیمه) بین دو نقطه؛ در فاصله‌های کم عملاً خط مستقیم است
function qbGreatCircle(lat1, lng1, lat2, lng2, n) {
  const r = Math.PI / 180, d = 180 / Math.PI;
  const p1 = lat1 * r, l1 = lng1 * r, p2 = lat2 * r, l2 = lng2 * r;
  const dd = 2 * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2));
  const pts = [];
  if (!dd) return [{ lat: lat1, lng: lng1 }, { lat: lat2, lng: lng2 }];
  let prevLng = lng1;
  for (let i = 0; i <= n; i++) {
    const f = i / n, A = Math.sin((1 - f) * dd) / Math.sin(dd), B = Math.sin(f * dd) / Math.sin(dd);
    const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
    const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
    const z = A * Math.sin(p1) + B * Math.sin(p2);
    const la = Math.atan2(z, Math.sqrt(x * x + y * y)) * d;
    let lo = Math.atan2(y, x) * d;
    while (lo - prevLng > 180) lo -= 360;     // پیوستگی طول جغرافیایی (عبور از ±۱۸۰)
    while (lo - prevLng < -180) lo += 360;
    prevLng = lo;
    pts.push({ lat: la, lng: lo });
  }
  return pts;
}

/* ---------- مسیر زمینی تا مکه (جاده) + مسیر هوایی ---------- */
let qbLand = null, qbLandBusy = '';
function qbLandKey(c) { return c.lat.toFixed(2) + ',' + c.lng.toFixed(2); }
function qbHttpJson(url, ms) {
  return new Promise((resolve) => {
    let done = false;
    const fin = (v) => { if (!done) { done = true; resolve(v); } };
    setTimeout(() => fin(null), ms || 12000);
    try {
      fetch(url).then((r) => r.ok ? r.json() : null).then(fin).catch(() => {
        try {
          const H = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp;
          if (H && H.get) H.get({ url: url }).then((r) => fin(r && r.data ? (typeof r.data === 'string' ? JSON.parse(r.data) : r.data) : null)).catch(() => fin(null));
          else fin(null);
        } catch (e) { fin(null); }
      });
    } catch (e) { fin(null); }
  });
}
// ساده‌سازی مسیر (Douglas–Peucker) تا مسیر کامل بماند ولی سنگین نشود (تلورانس ≈ ۱۵۰ متر)
function qbSimplify(pts, tol) {
  const n = pts.length;
  if (n < 3) return pts;
  const keep = new Uint8Array(n); keep[0] = 1; keep[n - 1] = 1;
  const st = [[0, n - 1]];
  const k = Math.cos((pts[0].lat || 0) * Math.PI / 180);
  while (st.length) {
    const [i0, i1] = st.pop();
    const A = pts[i0], B = pts[i1];
    const ax = A.lng * k, ay = A.lat, bx = B.lng * k, by = B.lat;
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    let md = -1, mi = -1;
    for (let i = i0 + 1; i < i1; i++) {
      const px = pts[i].lng * k, py = pts[i].lat;
      let t = L2 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
      t = Math.max(0, Math.min(1, t));
      const ex = ax + t * dx - px, ey = ay + t * dy - py;
      const d = ex * ex + ey * ey;
      if (d > md) { md = d; mi = i; }
    }
    if (md > tol * tol && mi > 0) { keep[mi] = 1; st.push([i0, mi], [mi, i1]); }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i]);
  return out;
}
// مسیر جاده‌ای کامل از موقعیت کاربر تا کعبه (چند سرور مسیریابی، مسیر کامل نه ساده‌شده)؛
// اگر جاده‌ای نبود (مثلاً آن‌سوی اقیانوس) pts خالی و km صفر است
async function qbFetchLand(c) {
  const key = qbLandKey(c);
  try {
    const cached = JSON.parse(localStorage.getItem('arefanejam_qb_land2:' + key) || 'null');
    if (cached && Array.isArray(cached.pts)) { qbLand = Object.assign({ key: key }, cached); return qbLand; }
  } catch (e) {}
  if (qbLandBusy === key || navigator.onLine === false) return null;
  qbLandBusy = key;
  const coords = c.lng.toFixed(5) + ',' + c.lat.toFixed(5) + ';' + KAABA.lng + ',' + KAABA.lat;
  const q = '?overview=full&geometries=geojson&steps=false&alternatives=false';
  const servers = [
    'https://router.project-osrm.org/route/v1/driving/',
    'https://routing.openstreetmap.de/routed-car/route/v1/driving/'
  ];
  let res = null, noRoute = 0;
  for (let attempt = 0; attempt < 2 && !res; attempt++) {
    for (const base of servers) {
      const j = await qbHttpJson(base + coords + q, 30000);
      if (j && j.code === 'Ok' && j.routes && j.routes[0] && j.routes[0].geometry) {
        const co = j.routes[0].geometry.coordinates || [];
        let pts = co.map((p) => ({ lat: p[1], lng: p[0] }));
        let km = (j.routes[0].distance || 0) / 1000;
        if (pts.length > 1) {
          // اتصال مسیر به خود نقطهٔ کاربر و کعبه (مسیریاب به نزدیک‌ترین جاده می‌چسباند)
          const f = pts[0], l = pts[pts.length - 1];
          km += qbDistanceKm(c.lat, c.lng, f.lat, f.lng) + qbDistanceKm(l.lat, l.lng, KAABA.lat, KAABA.lng);
          pts.unshift({ lat: c.lat, lng: c.lng });
          pts.push({ lat: KAABA.lat, lng: KAABA.lng });
          pts = qbSimplify(pts, 0.0015);
          res = { pts: pts, km: km };
          break;
        }
      } else if (j && (j.code === 'NoRoute' || j.code === 'NoSegment')) {
        noRoute++;
      }
    }
    if (!res && noRoute >= servers.length) { res = { pts: [], km: 0 }; break; } // هر دو سرور: جاده‌ای نیست
  }
  qbLandBusy = '';
  if (!res) return null;           // خطای شبکه؛ بعداً دوباره تلاش می‌شود
  try { localStorage.setItem('arefanejam_qb_land2:' + key, JSON.stringify(res)); } catch (e) {}
  qbLand = Object.assign({ key: key }, res);
  return qbLand;
}
function qbFmtKm(km) { return toPersianDigits(String(Math.round(km)).replace(/\B(?=(\d{3})+(?!\d))/g, '٬')) + ' کیلومتر'; }
function qbMapUpdate() {
  const card = qbEl('qb-map-card');
  if (!card) return;
  const c = (qbHasLocation() && state.coords) ? state.coords : null;
  if (!c) { card.classList.add('hidden'); qbMapKey = ''; return; }
  card.classList.remove('hidden');
  const box = qbEl('qb-map'), tilesEl = qbEl('qb-map-tiles'), svg = qbEl('qb-map-svg');
  const W = box.clientWidth, H = box.clientHeight;
  if (!W || !H) return;                         // تب قبله هنوز نمایان نیست
  const landK = qbLandKey(c);
  const land = (qbLand && qbLand.key === landK) ? qbLand : null;
  const key = c.lat.toFixed(4) + ',' + c.lng.toFixed(4) + ',' + W + 'x' + H + ',' + (state.manualCity ? 1 : 0) + ',' + (land ? land.pts.length : 'x');
  if (key === qbMapKey) return;
  qbMapKey = key;
  if (!land) {
    qbFetchLand(c).then((r) => { if (r && qbLand && qbLand.key === qbLandKey(c)) { qbMapKey = ''; try { qbMapUpdate(); } catch (e) {} } });
  }

  const dist = qbDistanceKm(c.lat, c.lng, KAABA.lat, KAABA.lng);
  const distEl = qbEl('qb-map-dist');
  if (distEl) distEl.textContent = dist < 1 ? 'شما در کنار کعبه‌اید' : qbFmtKm(dist) + ' (هوایی)';
  const legEl = qbEl('qb-map-legend');
  if (legEl) {
    if (dist < 1) legEl.innerHTML = '';
    else {
      let lh = '<span class="qb-leg"><i class="qb-leg-air"></i>✈️ مسیر هوایی (مستقیم): <b>' + qbFmtKm(dist) + '</b></span>';
      if (land && land.pts.length) lh += '<span class="qb-leg"><i class="qb-leg-land"></i>🚗 مسیر زمینی (جاده): <b>' + qbFmtKm(land.km) + '</b></span>';
      else if (land) lh += '<span class="qb-leg qb-leg-none">🚗 مسیر زمینی: جاده‌ای تا مکه وجود ندارد (مثلاً جدا از خشکی)</span>';
      else lh += '<span class="qb-leg qb-leg-none">🚗 مسیر زمینی: با اینترنت محاسبه می‌شود…</span>';
      legEl.innerHTML = lh;
    }
  }

  // کعبه را هم‌طولِ نزدیک‌ترین نسخهٔ نقشه نسبت به کاربر می‌گیریم (برای کاربران خیلی دور)
  let kLng = KAABA.lng;
  while (kLng - c.lng > 180) kLng -= 360;
  while (kLng - c.lng < -180) kLng += 360;
  const path = qbGreatCircle(c.lat, c.lng, KAABA.lat, kLng, 64);

  // بزرگ‌ترین زوم که کل مسیر داخل قاب جا شود
  const pad = 46;
  let minLat = 90, maxLat = -90, minLng = 1e9, maxLng = -1e9;
  const boundPts = (land && land.pts.length) ? path.concat(land.pts.filter((q) => Math.abs(q.lng - c.lng) < 200)) : path;
  boundPts.forEach((p) => { minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat); minLng = Math.min(minLng, p.lng); maxLng = Math.max(maxLng, p.lng); });
  let zf = 1;
  for (let z = 14; z >= 1; z -= 0.25) {
    const a = qbMercator(maxLat, minLng, z), b = qbMercator(minLat, maxLng, z);
    if ((b.x - a.x) <= W - 2 * pad && (b.y - a.y) <= H - 2 * pad) { zf = z; break; }
  }
  if (dist < 1) zf = 12;
  const cMid = qbMercator((minLat + maxLat) / 2, (minLng + maxLng) / 2, zf);
  const ox = cMid.x - W / 2, oy = cMid.y - H / 2;
  const proj = (lat, lng) => { const p = qbMercator(lat, lng, zf); return { x: p.x - ox, y: p.y - oy }; };

  // کاشی‌ها
  tilesEl.innerHTML = '';
  qbMapTilesOk = 0; qbMapTilesBad = 0;
  const note = qbEl('qb-map-note'); if (note) note.classList.add('hidden');
  const zi = Math.max(0, Math.min(18, Math.floor(zf)));
  const ts = 256 * Math.pow(2, zf - zi), n = Math.pow(2, zi);
  const x0 = Math.floor(ox / ts), x1 = Math.floor((ox + W) / ts), y0 = Math.max(0, Math.floor(oy / ts)), y1 = Math.min(n - 1, Math.floor((oy + H) / ts));
  let total = 0;
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const wx = ((tx % n) + n) % n;
      const img = document.createElement('img');
      img.alt = ''; img.draggable = false; img.decoding = 'async';
      img.style.left = (tx * ts - ox).toFixed(1) + 'px';
      img.style.top = (ty * ts - oy).toFixed(1) + 'px';
      img.style.width = img.style.height = (ts + 0.6).toFixed(1) + 'px';
      total++;
      img.onload = () => { qbMapTilesOk++; };
      img.onerror = () => {
        qbMapTilesBad++; img.remove();
        if (qbMapTilesOk === 0 && qbMapTilesBad >= total && note) note.classList.remove('hidden');
      };
      img.src = 'https://tile.openstreetmap.org/' + zi + '/' + wx + '/' + ty + '.png';
      tilesEl.appendChild(img);
    }
  }

  // لایهٔ SVG: شبکهٔ جغرافیایی کمرنگ + خط قبله + نشانگرها
  const step = zf >= 8 ? 1 : zf >= 6 ? 2 : zf >= 4.5 ? 5 : zf >= 3 ? 10 : 20;
  let g = '';
  for (let la = -80; la <= 80; la += step) {
    const p = proj(la, 0).y;
    if (p >= 0 && p <= H) g += '<line x1="0" y1="' + p.toFixed(1) + '" x2="' + W + '" y2="' + p.toFixed(1) + '"/>';
  }
  const lngA = Math.floor((ox / (256 * Math.pow(2, zf)) * 360 - 180) / step) * step;
  const lngB = (ox + W) / (256 * Math.pow(2, zf)) * 360 - 180;
  for (let lo = lngA; lo <= lngB + step; lo += step) {
    const p = proj(0, lo).x;
    if (p >= 0 && p <= W) g += '<line x1="' + p.toFixed(1) + '" y1="0" x2="' + p.toFixed(1) + '" y2="' + H + '"/>';
  }
  const pts = path.map((p) => { const q = proj(p.lat, p.lng); return q.x.toFixed(1) + ',' + q.y.toFixed(1); });
  const A = proj(c.lat, c.lng), B = proj(KAABA.lat, kLng);
  const flip = A.x > B.x; // برچسب‌ها طوری که روی هم نیفتند
  let out = '<g stroke="#F3DDAA" stroke-opacity=".16" stroke-width=".7">' + g + '</g>';
  if (dist >= 1) {
    out += '<polyline points="' + pts.join(' ') + '" fill="none" stroke="#071C18" stroke-opacity=".55" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>';
    out += '<polyline points="' + pts.join(' ') + '" fill="none" stroke="#F6E4B4" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>';
    out += '<polyline class="qb-map-flow" points="' + pts.join(' ') + '" fill="none" stroke="#B08D4E" stroke-width="3.2" stroke-dasharray="7 19" stroke-linecap="round" stroke-linejoin="round"/>';
  }
  // مسیر زمینی (جاده): آبی خط‌چین، زیر خط هوایی
  if (land && land.pts.length > 1 && dist >= 1) {
    const lp = land.pts.map((q) => { const w = proj(q.lat, q.lng); return w.x.toFixed(1) + ',' + w.y.toFixed(1); }).join(' ');
    out += '<polyline points="' + lp + '" fill="none" stroke="#071C18" stroke-opacity=".55" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>';
    out += '<polyline points="' + lp + '" fill="none" stroke="#4FC3F7" stroke-width="3.2" stroke-dasharray="2 7" stroke-linecap="round" stroke-linejoin="round"/>';
  }
  // نشانگر کاربر
  out += '<circle class="qb-map-user-pulse" cx="' + A.x.toFixed(1) + '" cy="' + A.y.toFixed(1) + '" r="7" fill="#2E9BFF" fill-opacity=".55"/>';
  out += '<circle cx="' + A.x.toFixed(1) + '" cy="' + A.y.toFixed(1) + '" r="7.5" fill="#2E9BFF" stroke="#fff" stroke-width="2.5"/>';
  // نشانگر کعبه
  const kx = B.x, ky = B.y;
  out += '<g transform="translate(' + kx.toFixed(1) + ' ' + ky.toFixed(1) + ')"><circle r="15" fill="#0A2420" fill-opacity=".85" stroke="#F3DDAA" stroke-width="2"/>'
    + '<rect x="-7.5" y="-7.5" width="15" height="15" rx="1.5" fill="#15151a" stroke="#F3DDAA" stroke-width=".8"/><rect x="-7.5" y="-3.8" width="15" height="3.2" fill="#D9BD87"/></g>';
  // برچسب‌ها
  const lab = (x, y, t, anchor) => '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" text-anchor="' + anchor + '" font-family="Vazirmatn, sans-serif" font-size="12" font-weight="700" fill="#fff" stroke="#0A2420" stroke-width="3" paint-order="stroke">' + t + '</text>';
  out += lab(kx, ky + 31, 'مکه مکرمه', 'middle');
  out += lab(A.x, A.y + (A.y > H - 40 ? -16 : 26), 'شما', 'middle');
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  svg.innerHTML = out;
}
window.addEventListener('resize', () => { if (currentTab === 'qibla') { qbMapKey = ''; try { qbMapUpdate(); } catch (e) {} } });

/* ----- سنسور جهت ----- */
// جهت «رو به‌روی گوشی» نسبت به شمال مغناطیسی، با جبران کج‌بودن گوشی (alpha/beta/gamma).
// گوشی تقریباً افقی: جهتِ بالای گوشی؛ گوشی ایستاده: جهتِ پشت گوشی.
function headingFromEuler(alphaDeg, betaDeg, gammaDeg) {
  const d = Math.PI / 180;
  const a = alphaDeg * d, b = betaDeg * d, g = gammaDeg * d;
  const cA = Math.cos(a), sA = Math.sin(a), cB = Math.cos(b), sB = Math.sin(b), cG = Math.cos(g), sG = Math.sin(g);
  const zUp = cG * cB; // مؤلفهٔ عمودی محور z گوشی؛ نزدیک ±۱ یعنی گوشی افقی است
  let east, north;
  if (Math.abs(zUp) > 0.6) { east = -sA * cB; north = cA * cB; }
  else { east = -sG * cA - cG * sB * sA; north = -sG * sA + cG * sB * cA; }
  if (Math.abs(east) < 1e-6 && Math.abs(north) < 1e-6) return null;
  return (Math.atan2(east, north) / d + 360) % 360;
}

function handleOrientationAbs(event) {
  if (event.alpha === null || event.alpha === undefined) return;
  gotAbsoluteOrientation = true;
  let h = headingFromEuler(event.alpha, event.beta || 0, event.gamma || 0);
  if (h === null) return;
  if (calibrationFlipped) h = (360 - h) % 360;
  applyHeading(h);
}

function handleOrientation(event) {
  // iOS: جهت قطب‌نما را خود سیستم می‌دهد
  if (typeof event.webkitCompassHeading === 'number') {
    gotWebkitCompass = true;
    let h = event.webkitCompassHeading;
    if (calibrationFlipped) h = (360 - h) % 360;
    applyHeading(h);
    return;
  }
  // اندروید: رویداد «نسبی» جهت واقعی ندارد؛ فقط اگر مطلق باشد و رویداد absolute نیامده استفاده می‌شود
  if (gotAbsoluteOrientation || event.absolute !== true || event.alpha === null) return;
  gotAbsoluteOrientation = true;
  let h = headingFromEuler(event.alpha, event.beta || 0, event.gamma || 0);
  if (h === null) return;
  if (calibrationFlipped) h = (360 - h) % 360;
  applyHeading(h);
}

function applyHeading(magHeading) {
  qbLastHeadingTs = Date.now();
  // شمال مغناطیسی ← شمال حقیقی
  const target = (magHeading + qiblaDeclination + 360) % 360;
  if (qbHeading === null) {
    qbHeading = target;
  } else {
    // فیلتر نرم‌کننده روی زاویه؛ زاویه «پیوسته» نگه داشته می‌شود تا در گذر از ۰/۳۶۰ صفحه یک دور کامل نچرخد
    const cur = ((qbHeading % 360) + 360) % 360;
    let diff = target - cur;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    const k = Math.min(0.5, 0.07 + Math.abs(diff) / 120);
    qbHeading += k * diff;
  }
  const s = qbEl('qb-scene');
  if (s && s.classList.contains('is-calib')) s.classList.remove('is-calib');
  qbDraw();
}

async function qbStartSensors() {
  if (qiblaListenerAttached) return;
  try {
    if (!motionPermissionGranted) {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const perm = await DeviceOrientationEvent.requestPermission();
        if (perm !== 'granted') return;
      }
      motionPermissionGranted = true;
    }
  } catch (e) { return; }
  if (qiblaListenerAttached) return;
  qiblaListenerAttached = true;
  qbLastHeadingTs = Date.now();
  window.addEventListener('deviceorientationabsolute', handleOrientationAbs, true);
  window.addEventListener('deviceorientation', handleOrientation, true);
}

function qbStopSensors() {
  if (!qiblaListenerAttached) return;
  qiblaListenerAttached = false;
  try {
    window.removeEventListener('deviceorientationabsolute', handleOrientationAbs, true);
    window.removeEventListener('deviceorientation', handleOrientation, true);
  } catch (e) {}
}

// اگر چند ثانیه هیچ جهتی نرسید (سنسور نیاز به کالیبره دارد)، نشانهٔ ∞ نمایش داده می‌شود
setInterval(() => {
  try {
    const s = qbEl('qb-scene');
    if (!s || currentTab !== 'qibla') return;
    s.classList.toggle('is-calib', qiblaListenerAttached && qbHasLocation() && (Date.now() - qbLastHeadingTs > 3500));
  } catch (e) {}
}, 1000);

/* ----- هشدار روشن‌کردن مکان ----- */
function qbPromptOpen() {
  const box = qbEl('qibla-loc-prompt');
  return !!(box && !box.classList.contains('hidden'));
}
function qbHidePrompt() {
  const box = qbEl('qibla-loc-prompt');
  if (box) box.classList.add('hidden');
}
function qbShowPrompt(kind) {
  qbPromptKind = kind;
  const box = qbEl('qibla-loc-prompt');
  if (!box) return;
  const A = qbNative();
  const canOpen = !!(A && A.openLocationSettings);
  const texts = {
    off: {
      title: 'مکان گوشی خاموش است',
      text: canOpen
        ? 'برای پیدا کردن قبله، مکان (Location) گوشی را روشن کنید و دوباره به اپ برگردید.'
        : 'نوار بالای گوشی را پایین بکشید، دکمهٔ «مکان / Location» را روشن کنید و دوباره به اپ برگردید.',
      btn: canOpen ? 'روشن کردن مکان' : 'روشن کردم، دوباره بررسی کن'
    },
    perm: {
      title: 'اجازهٔ مکان داده نشده',
      text: canOpen
        ? 'اپ اجازهٔ دسترسی به مکان ندارد. «باز کردن تنظیمات» را بزنید، مجوز «مکان» را روی «مجاز» بگذارید و برگردید.'
        : 'از تنظیمات گوشی ← برنامه‌ها ← عارفان جام ← مجوزها، «مکان» را روی «مجاز» بگذارید و برگردید.',
      btn: canOpen ? 'باز کردن تنظیمات' : 'دوباره بررسی کن'
    },
    weak: {
      title: 'موقعیت پیدا نشد',
      text: 'اگر مکان گوشی روشن است، کنار پنجره یا بیرون از ساختمان بروید و دوباره تلاش کنید.',
      btn: 'تلاش دوباره'
    }
  };
  const t = texts[kind] || texts.weak;
  const card = box.querySelector('.qb-prompt-card');
  if (card) card.setAttribute('data-kind', kind);
  qbEl('qb-prompt-title').textContent = t.title;
  qbEl('qb-prompt-text').textContent = t.text;
  qbEl('qb-prompt-primary').textContent = t.btn;
  box.classList.remove('hidden');
}

function qbLocStatus() {
  const A = qbNative();
  if (!A || !A.locationStatus) return Promise.resolve(null);
  try { return Promise.resolve(A.locationStatus()).then((r) => r || null).catch(() => null); } catch (e) { return Promise.resolve(null); }
}

// دکمهٔ اصلی هشدار: باز کردن تنظیمات مکان / تنظیمات مجوز اپ (اگر APK جدید باشد)، وگرنه فقط دوباره بررسی می‌کند
function qbPromptPrimary() {
  const A = qbNative();
  const canOpen = !!(A && A.openLocationSettings);
  try {
    if (qbPromptKind === 'off' && canOpen) { Promise.resolve(A.openLocationSettings({})).catch(() => {}); return; }
    if (qbPromptKind === 'perm' && canOpen && qbPermAsked) { Promise.resolve(A.openLocationSettings({ app: true })).catch(() => {}); return; }
  } catch (e) {}
  qbFetchGps(true);
}

// گرفتن موقعیت دقیق برای قبله‌نما. اگر نشد، هشدار مناسب نشان داده می‌شود.
async function qbFetchGps(userInitiated) {
  if (qbAcquiring) return false;
  qbAcquiring = true;
  const btn = qbEl('qibla-gps-btn');
  const scene = qbEl('qb-scene');
  if (btn) { btn.classList.add('is-loading'); btn.disabled = true; }
  if (scene) scene.classList.add('is-locating');
  let st = null;
  try {
    st = await qbLocStatus();
    if (st && st.enabled === false) { qbShowPrompt('off'); return false; }
    if (!navigator.geolocation) { qbShowPrompt('off'); return false; }
    const fix = await getPreciseFix(st ? 12000 : 8000);
    applyPreciseFix(fix, false);
    qbHidePrompt();
    qbPermAsked = false;
    if (btn) { btn.classList.add('is-success'); setTimeout(() => btn.classList.remove('is-success'), 700); }
    if (currentTab === 'qibla') qbStartSensors();
    return true;
  } catch (err) {
    const code = err && err.code;
    if (code === 1) {
      qbPermAsked = true;
      try { localStorage.setItem('arefanejam_geo_denied', '1'); } catch (e) {}
      qbShowPrompt('perm');
    } else if (code === 3 || (code === 2 && st && st.enabled === true)) {
      qbShowPrompt('weak');
    } else {
      qbShowPrompt('off');
    }
    return false;
  } finally {
    qbAcquiring = false;
    if (btn) { btn.classList.remove('is-loading'); btn.disabled = false; }
    if (scene) scene.classList.remove('is-locating');
  }
}

async function autoStartQibla() {
  try {
    const c = state.manualCity || loadCachedCoords();
    if (c) {
      // موقعیت از قبل مشخص است (شهر انتخابی یا GPS ذخیره‌شده): همان استفاده می‌شود
      state.coords = { lat: c.lat, lng: c.lng };
      qbHidePrompt();
      refreshQiblaCompassIfReady();
      await qbStartSensors();
      return;
    }
    // موقعیتی از قبل مشخص نشده: تا مشخص شدن، قبله‌ای نشان داده نمی‌شود و اگر مکان خاموش بود هشدار می‌آید
    qiblaBearing = null;
    qbRender();
    if (qbAcquiring) return;
    await qbFetchGps(false);
  } catch (e) {
    try { console.warn('qibla', e); } catch (e2) {}
  }
}

qbEl('qibla-gps-btn').addEventListener('click', () => { qbFetchGps(true); });
qbEl('qb-prompt-primary').addEventListener('click', qbPromptPrimary);
qbEl('qb-prompt-close').addEventListener('click', qbHidePrompt);
qbEl('qb-prompt-city').addEventListener('click', () => {
  populateCityList('');
  document.getElementById('city-modal').classList.remove('hidden');
});
// برگشت از تنظیمات گوشی (مثلاً بعد از روشن‌کردن مکان): اگر هشدار باز است خودکار دوباره بررسی می‌شود
document.addEventListener('visibilitychange', () => {
  if (currentTab !== 'qibla') return;
  if (document.hidden) { qbStopSensors(); return; }
  if (qbHasLocation()) qbStartSensors();
  else if (qbPromptOpen()) qbFetchGps(false);
});

qbEl('qibla-flip-toggle').checked = calibrationFlipped;
qbEl('qibla-flip-toggle').addEventListener('change', (e) => {
  calibrationFlipped = e.target.checked;
  localStorage.setItem('arefanejam_qibla_flip', calibrationFlipped ? '1' : '0');
});

/* ---------- یادداشت‌ها (با قابلیت یادآوری) ---------- */
function getLocalNotes() {
  try { return JSON.parse(localStorage.getItem(NOTES_STORAGE_KEY) || '[]'); } catch (e) { return []; }
}
function formatReminderDate(ts) {
  const d = new Date(ts);
  const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  const hh = toPersianDigits(String(d.getHours()).padStart(2, '0'));
  const mm = toPersianDigits(String(d.getMinutes()).padStart(2, '0'));
  return `${toPersianDigits(jd)} ${JALALI_MONTHS[jm - 1]} ${toPersianDigits(jy)} — ${hh}:${mm}`;
}
function saveLocalNotes(notes) {
  localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
  syncNotesToServiceWorker(notes);
}

/* ---------- سپردن یادآوریِ یادداشت‌ها به سرویس‌ورکر (کارکرد آفلاین و با اپ بسته) ----------
   سرویس‌ورکر به localStorage دسترسی ندارد؛ پس هر بار یادداشتی ذخیره/ویرایش/حذف شود (و هر بار
   اپ باز شود)، فهرست یادداشت‌های دارای یادآوری برایش فرستاده و در IndexedDB نگه‌داری می‌شود. */
function syncNotesToServiceWorker(notes) {
  try {
    const swReady = ('serviceWorker' in navigator) && !!navigator.serviceWorker.controller;
    if (!swReady && !window.NativeAlarms) return;
    const list = (notes || getLocalNotes())
      .filter((n) => n && n.reminderAt)
      .map((n) => ({ id: n.id, title: n.title || '', content: n.content || '', reminderAt: n.reminderAt, reminderFired: !!n.reminderFired }));
    if (window.NativeAlarms) window.NativeAlarms.syncNotes(list);
    if (!swReady) return;
    navigator.serviceWorker.controller.postMessage({ type: 'AREFANEJAM_NOTES_SYNC', notes: list });
  } catch (e) { /* بی‌اهمیت */ }
}
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => syncNotesToServiceWorker());
  navigator.serviceWorker.ready.then(() => syncNotesToServiceWorker()).catch(() => {});
}
function loadNotes() { renderNotes(getLocalNotes()); }

function renderNotes(notes) {
  const el = document.getElementById('notes-list');
  el.innerHTML = '';
  if (!notes.length) { el.innerHTML = '<p class="note-empty">هنوز یادداشتی ثبت نکرده‌اید.</p>'; return; }
  notes.slice().sort((a, b) => b.updatedAt - a.updatedAt).forEach((n) => {
    const card = document.createElement('div');
    card.className = 'note-card';
    const reminderLine = n.reminderAt ? `<p class="note-reminder">⏰ ${formatReminderDate(n.reminderAt)}</p>` : '';
    card.innerHTML = `<h4>${n.title || 'بدون عنوان'}</h4><p>${(n.content || '').replace(/</g, '&lt;')}</p>${reminderLine}`;
    card.addEventListener('click', () => openNoteModal(n));
    el.appendChild(card);
  });
}

function populateReminderSelects() {
  const daySel = document.getElementById('reminder-jalali-day');
  const monthSel = document.getElementById('reminder-jalali-month');
  const yearSel = document.getElementById('reminder-jalali-year');
  daySel.innerHTML = '';
  for (let d = 1; d <= 31; d++) daySel.innerHTML += `<option value="${d}">${toPersianDigits(d)}</option>`;
  monthSel.innerHTML = '';
  JALALI_MONTHS.forEach((m, i) => { monthSel.innerHTML += `<option value="${i + 1}">${m}</option>`; });
  yearSel.innerHTML = '';
  const [ty] = gregorianToJalali(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());
  for (let y = ty; y <= ty + 2; y++) yearSel.innerHTML += `<option value="${y}">${toPersianDigits(y)}</option>`;
}
populateReminderSelects();

function openNoteModal(note) {
  state.editingNoteId = note ? note.id : null;
  document.getElementById('note-modal-title').textContent = note ? 'ویرایش یادداشت' : 'یادداشت جدید';
  document.getElementById('note-title-input').value = note ? note.title : '';
  document.getElementById('note-content-input').value = note ? note.content : '';
  document.getElementById('note-delete-btn').classList.toggle('hidden', !note);
  const reminderToggle = document.getElementById('note-reminder-toggle');
  const reminderFields = document.getElementById('note-reminder-fields');
  const hasReminder = !!(note && note.reminderAt);
  reminderToggle.checked = hasReminder;
  reminderFields.classList.toggle('hidden', !hasReminder);
  const baseDate = hasReminder ? new Date(note.reminderAt) : new Date();
  const [jy, jm, jd] = gregorianToJalali(baseDate.getFullYear(), baseDate.getMonth() + 1, baseDate.getDate());
  document.getElementById('reminder-jalali-year').value = jy;
  document.getElementById('reminder-jalali-month').value = jm;
  document.getElementById('reminder-jalali-day').value = jd;
  document.getElementById('reminder-time-input').value =
    String(baseDate.getHours()).padStart(2, '0') + ':' + String(baseDate.getMinutes()).padStart(2, '0');
  document.getElementById('note-modal').classList.remove('hidden');
}

document.getElementById('note-reminder-toggle').addEventListener('change', (e) => {
  document.getElementById('note-reminder-fields').classList.toggle('hidden', !e.target.checked);
});
document.getElementById('note-add-btn').addEventListener('click', () => openNoteModal(null));
document.getElementById('note-cancel-btn').addEventListener('click', () => document.getElementById('note-modal').classList.add('hidden'));

document.getElementById('note-save-btn').addEventListener('click', () => {
  const title = document.getElementById('note-title-input').value.trim();
  const content = document.getElementById('note-content-input').value.trim();
  const hasReminder = document.getElementById('note-reminder-toggle').checked;
  let reminderAt = null;
  if (hasReminder) {
    const jy = parseInt(document.getElementById('reminder-jalali-year').value, 10);
    const jm = parseInt(document.getElementById('reminder-jalali-month').value, 10);
    const jd = parseInt(document.getElementById('reminder-jalali-day').value, 10);
    const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd);
    const timeVal = document.getElementById('reminder-time-input').value || '00:00';
    const [hh, mm] = timeVal.split(':').map(Number);
    reminderAt = new Date(gy, gm - 1, gd, hh, mm).getTime();
  }
  const notes = getLocalNotes();
  let savedNote = null;

  if (state.editingNoteId) {
    const idx = notes.findIndex((n) => n.id === state.editingNoteId);
    if (idx > -1) {
      notes[idx].title = title; notes[idx].content = content;
      notes[idx].reminderAt = reminderAt; notes[idx].reminderFired = false;
      notes[idx].updatedAt = Date.now();
      savedNote = notes[idx];
    }
  } else {
    savedNote = { id: 'n' + Date.now(), title, content, reminderAt, reminderFired: false, updatedAt: Date.now() };
    notes.push(savedNote);
  }
  saveLocalNotes(notes);
  // یادآوری (اگر تنظیم شده) روی سرور هم ثبت می‌شود تا اگر اپ کاملاً بسته یا گوشی
  // قفل بود هم سر وقتش با نوتیفیکیشن واقعی نشان داده شود؛ اگر یادآوری خاموش/حذف
  // شده باشد، همین تابع نسخهٔ سرور را هم پاک می‌کند.
  if (savedNote) syncNoteReminder(savedNote);
  document.getElementById('note-modal').classList.add('hidden');
  loadNotes();
});

document.getElementById('note-delete-btn').addEventListener('click', async () => {
  if (!state.editingNoteId) return;
  if (!(await appConfirm('note_delete_confirm'))) return;
  const deletedNoteId = state.editingNoteId;
  saveLocalNotes(getLocalNotes().filter((n) => n.id !== deletedNoteId));
  syncNoteReminder({ id: deletedNoteId, title: '', content: '', reminderAt: null });
  document.getElementById('note-modal').classList.add('hidden');
  loadNotes();
});

function checkNoteReminders() {
  const notes = getLocalNotes();
  const now = Date.now();
  let changed = false;
  notes.forEach((n) => {
    if (n.reminderAt && !n.reminderFired && n.reminderAt <= now) {
      n.reminderFired = true;
      changed = true;
      showAlarmModal('یادآوری یادداشت', n.title || n.content || 'یادداشت شما');
    }
  });
  if (changed) saveLocalNotes(notes);
}
setInterval(checkNoteReminders, 30000);

/* ---------- همگام‌سازی یادآوریِ یادداشت با سرور (برای کارکرد در حالت قفل/بسته/آفلاین) ----------
   اپ فقط زمانی که باز است می‌تواند یادآوری را نشان دهد (تابع بالا)؛ برای اینکه یادآوری
   حتی با صفحهٔ قفل یا اپ کاملاً بسته هم دیده شود، همان یادآوری برای همین دستگاه روی
   سرور هم ذخیره می‌شود تا سرور سر وقتش یک Web Push واقعی برایش بفرستد. اگر همین لحظه
   اینترنت نباشد، درخواست در یک صفِ محلی می‌ماند و با اولین اتصال دوباره امتحان می‌شود. */
const REMINDER_SYNC_QUEUE_KEY = 'arefanejam_reminder_sync_queue';
function getReminderSyncQueue() {
  try { return JSON.parse(localStorage.getItem(REMINDER_SYNC_QUEUE_KEY) || '{}'); } catch (e) { return {}; }
}
function setReminderSyncQueue(q) { localStorage.setItem(REMINDER_SYNC_QUEUE_KEY, JSON.stringify(q)); }

async function syncNoteReminder(note) {
  const device_id = await ensureDeviceId();
  const payload = {
    device_id,
    note_id: note.id,
    title: note.title || '',
    content: note.content || '',
    remind_at: note.reminderAt ? Math.floor(note.reminderAt / 1000) : 0,
  };
  const queue = getReminderSyncQueue();
  queue[note.id] = payload; // تا وقتی سرور تأیید نکرده، در صف می‌ماند
  setReminderSyncQueue(queue);
  try {
    await apiFetch('/note-reminders', { method: 'POST', body: JSON.stringify(payload) });
    delete queue[note.id];
    setReminderSyncQueue(queue);
  } catch (e) { /* آفلاین بود؛ retryQueuedNoteReminders بعداً دوباره امتحان می‌کند */ }
}

async function retryQueuedNoteReminders() {
  const queue = getReminderSyncQueue();
  const noteIds = Object.keys(queue);
  if (!noteIds.length) return;
  for (const noteId of noteIds) {
    try {
      await apiFetch('/note-reminders', { method: 'POST', body: JSON.stringify(queue[noteId]) });
      delete queue[noteId];
    } catch (e) { /* همچنان آفلاین؛ برای دفعهٔ بعد می‌ماند */ }
  }
  setReminderSyncQueue(queue);
}
window.addEventListener('online', retryQueuedNoteReminders);
setInterval(retryQueuedNoteReminders, 60000);

/* ---------- درس امروز (آیه/حدیث) ---------- */
async function loadVerseOfDay() {
  const s = state.settings || {};
  const audioEl = document.getElementById('lesson-audio');
  if (s.daily_arabic) {
    document.getElementById('lesson-heading').textContent = 'درس امروز';
    renderVerse({ arabic: s.daily_arabic, translation: s.daily_translation || '', surah: s.daily_source || '', ayahNum: '' });
    if (s.daily_audio_url) { audioEl.src = s.daily_audio_url; audioEl.classList.remove('hidden'); }
    else audioEl.classList.add('hidden');
    return;
  }
  audioEl.classList.add('hidden');
  document.getElementById('lesson-heading').textContent = 'آیه امروز';
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  const ayahNumber = (dayOfYear % 6236) + 1;
  const cacheKey = 'arefanejam_verse_' + new Date().toDateString();
  const cached = localStorage.getItem(cacheKey);
  if (cached) { renderVerse(JSON.parse(cached)); return; }
  try {
    const off = await offlineVerseWithTranslation(ayahNumber);
    if (off) { localStorage.setItem(cacheKey, JSON.stringify(off)); renderVerse(off); return; }
  } catch (e) {}
  try {
    const res = await fetch(`https://api.alquran.cloud/v1/ayah/${ayahNumber}/editions/quran-uthmani,fa.makarem`);
    const json = await res.json();
    const [arabic, translation] = json.data;
    const verseData = { arabic: arabic.text, translation: translation.text, surah: arabic.surah.name, ayahNum: arabic.numberInSurah };
    localStorage.setItem(cacheKey, JSON.stringify(verseData));
    renderVerse(verseData);
  } catch (err) { document.getElementById('verse-arabic-text').textContent = 'در این لحظه امکان دریافت آیه وجود ندارد.'; }
}
function renderVerse(v) {
  document.getElementById('verse-arabic-text').textContent = v.arabic;
  document.getElementById('verse-translation-text').textContent = v.translation;
  document.getElementById('verse-ref-text').textContent = v.ayahNum ? `${v.surah} — آیه ${toPersianDigits(v.ayahNum)}` : v.surah;
}

/* ---------- تسبیح دیجیتال ---------- */
/* ظاهر: ۳۳ مهرهٔ سه‌بعدی دور دکمه. با هر پیشرفت، مهره‌ها یک گام می‌چرخند و مهره‌های شمرده‌شده طلایی می‌شوند.
   شناسه‌های قبلی (tasbih-count, tasbih-ring-progress, ...) حفظ شده‌اند. */
const TASBIH_KEY = 'arefanejam_tasbih_count';
const TASBIH_TARGET_KEY = 'arefanejam_tasbih_target';
const TASBIH_ROUNDS_KEY = 'arefanejam_tasbih_rounds';
let tasbihCount = parseInt(localStorage.getItem(TASBIH_KEY) || '0', 10);
let tasbihTarget = parseInt(localStorage.getItem(TASBIH_TARGET_KEY) || '33', 10);
let tasbihRounds = parseInt(localStorage.getItem(TASBIH_ROUNDS_KEY) || '0', 10) || 0;
const TASBIH_RING_CIRC = 2 * Math.PI * 82;
const TB_BEADS = 33;
let tbRot = 0, tbPrevP = -1, tbBuilt = false, tbCompleting = false;
function tbBuildBeads() {
  const g = document.getElementById('tasbih-beads-g');
  if (!g || tbBuilt) return;
  const NS = 'http://www.w3.org/2000/svg';
  const R = 100;
  for (let k = 0; k < TB_BEADS; k++) {
    const th = -(k / TB_BEADS) * 2 * Math.PI; // زاویه از بالا (ساعت‌گرد)؛ مهره‌ها خلاف جهت چیده شده‌اند
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', (R * Math.sin(th)).toFixed(2));
    c.setAttribute('cy', (-R * Math.cos(th)).toFixed(2));
    c.setAttribute('r', '6.6');
    c.setAttribute('class', 'tb-bead');
    c.setAttribute('fill', 'url(#tbBeadOff)');
    g.appendChild(c);
  }
  tbBuilt = true;
}
function renderTasbih() {
  document.getElementById('tasbih-count').textContent = toPersianDigits(tasbihCount);
  document.getElementById('tasbih-target-label').textContent = 'هدف: ' + toPersianDigits(tasbihTarget);
  const roundsEl = document.getElementById('tasbih-rounds');
  if (roundsEl) roundsEl.textContent = toPersianDigits(tasbihRounds);
  const ring = document.getElementById('tasbih-ring-progress');
  if (ring) {
    const ratio = tasbihTarget > 0 ? Math.min(tasbihCount / tasbihTarget, 1) : 0;
    ring.style.strokeDasharray = String(TASBIH_RING_CIRC);
    ring.style.strokeDashoffset = String(TASBIH_RING_CIRC * (1 - ratio));
  }
  try {
    tbBuildBeads();
    const g = document.getElementById('tasbih-beads-g');
    if (!g) return;
    const p = tasbihTarget > 0 ? Math.min(TB_BEADS - 1, Math.floor(tasbihCount * TB_BEADS / tasbihTarget)) : 0;
    const first = tbPrevP < 0;
    if (first) tbRot = p;
    else if (tbCompleting) tbRot += (TB_BEADS - tbPrevP);
    else if (p > tbPrevP) tbRot += (p - tbPrevP);
    tbPrevP = p; tbCompleting = false;
    if (first) g.style.transition = 'none';
    g.style.transform = 'rotate(' + (tbRot * 360 / TB_BEADS).toFixed(3) + 'deg)';
    if (first) { void g.getBoundingClientRect(); g.style.transition = ''; }
    const beads = g.children;
    for (let k = 0; k < beads.length; k++) {
      const lit = (((tbRot - 1 - k) % TB_BEADS) + TB_BEADS) % TB_BEADS < p;
      beads[k].classList.toggle('on', lit);
      beads[k].setAttribute('fill', lit ? 'url(#tbBeadOn)' : 'url(#tbBeadOff)');
    }
  } catch (_) { /* ظاهر مهره‌ها نباید شمارش را خراب کند */ }
}
function tbVibrate(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (_) {} }
document.getElementById('tasbih-counter-btn').addEventListener('click', (e) => {
  tasbihCount++;
  const btn = e.currentTarget;
  const dial = document.getElementById('tasbih-dial');
  btn.classList.remove('is-tapped');
  void btn.offsetWidth;
  btn.classList.add('is-tapped');
  tbVibrate(10);
  if (tasbihCount >= tasbihTarget) {
    tbVibrate([70, 40, 140]);
    btn.classList.add('is-complete');
    if (dial) dial.classList.add('is-complete');
    setTimeout(() => { btn.classList.remove('is-complete'); if (dial) dial.classList.remove('is-complete'); }, 1000);
    tasbihCount = 0;
    tasbihRounds++;
    tbCompleting = true;
    localStorage.setItem(TASBIH_ROUNDS_KEY, String(tasbihRounds));
  }
  localStorage.setItem(TASBIH_KEY, String(tasbihCount));
  renderTasbih();
});
document.getElementById('tasbih-reset-btn').addEventListener('click', () => {
  tasbihCount = 0; tasbihRounds = 0;
  localStorage.setItem(TASBIH_KEY, '0'); localStorage.setItem(TASBIH_ROUNDS_KEY, '0');
  renderTasbih();
});
document.getElementById('tasbih-target-btn').addEventListener('click', () => {
  const options = [33, 99, 100];
  tasbihTarget = options[(options.indexOf(tasbihTarget) + 1) % options.length];
  localStorage.setItem(TASBIH_TARGET_KEY, String(tasbihTarget));
  renderTasbih();
});
renderTasbih();

/* ---------- قرآن کریم (فهرست سوره‌ها و متن با ترجمه) ---------- */

/* ---------- حالت «فقط متن قرآن» (بدون ترجمه) + ذخیرهٔ آفلاین ----------
   کاربر می‌تواند بین «با ترجمه» و «فقط متن» جابه‌جا شود. در حالت فقط متن:
   ۱) متن کاملِ قرآن (عثمانی، ۶۲۳۶ آیه) یک‌بار دانلود و در IndexedDB گوشی ذخیره می‌شود،
      پس بعد از آن همهٔ سوره‌ها و جزءها بدون اینترنت باز می‌شوند.
   ۲) قاری‌ها دقیقاً همان قاری‌های حالت ترجمه‌دار هستند (یک انتخاب مشترک).
   ۳) صوت هر سوره/جزء را می‌توان با دکمهٔ «ذخیرهٔ صوت برای آفلاین» روی گوشی ذخیره کرد
      و بعد بدون اینترنت پخش شد (این قابلیت برای هر دو حالت کار می‌کند). */
const QURAN_MODE_KEY = 'arefanejam_quran_mode'; // 'translation' | 'text'
const QURAN_IDB_NAME = 'arefanejam-quran';
const QURAN_IDB_STORE = 'kv';
const QURAN_TEXT_IDB_KEY = 'quran-uthmani-v1';
let quranTextMemo = null;
let quranTextPromise = null;
let quranOfflineState = 'idle'; // idle | loading | ready | needs-net | error

// حالت «فقط متن» حذف شد (جایش را «مصحف صفحه‌ای» گرفته)؛ هر کاربری که قبلاً آن را انتخاب کرده بود خودکار به
// «مصحف صفحه‌ای» می‌رود. تنها انتخاب دیگر «قرآن با ترجمه» است.
function getQuranMode() {
  return localStorage.getItem(QURAN_MODE_KEY) === 'translation' ? 'translation' : 'page';
}

function quranIdbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(QURAN_IDB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(QURAN_IDB_STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function quranIdbGet(key) {
  try {
    const db = await quranIdbOpen();
    return await new Promise((resolve, reject) => {
      const req = db.transaction(QURAN_IDB_STORE, 'readonly').objectStore(QURAN_IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch (e) { return undefined; }
}
async function quranIdbSet(key, value) {
  const db = await quranIdbOpen();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(QURAN_IDB_STORE, 'readwrite');
    tx.objectStore(QURAN_IDB_STORE).put(value, key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// متن کامل قرآنِ ذخیره‌شده روی گوشی (آرایهٔ ۱۱۴ سوره) یا null
async function getOfflineQuranText() {
  if (quranTextMemo) return quranTextMemo;
  const stored = await quranIdbGet(QURAN_TEXT_IDB_KEY);
  if (stored && Array.isArray(stored.surahs) && stored.surahs.length === 114) {
    quranTextMemo = stored.surahs;
    return quranTextMemo;
  }
  // متن قرآن داخل خود اپ (فایل data/quran-uthmani.json): بدون اینترنت و بدون دانلود
  const bundled = await loadBundledQuranText();
  if (bundled) { quranTextMemo = bundled; return quranTextMemo; }
  return null;
}

/* ---------- متن قرآن و ترجمهٔ فارسی داخل خود اپ ----------
   فایل‌های data/quran-uthmani.json (متن عثمانی با شمارهٔ صفحه و جزء) و data/fa-makarem.json (ترجمهٔ فارسی)
   همراه APK و بروزرسانی ظاهر اپ می‌آیند؛ پس کاربر هیچ‌وقت لازم نیست برای متن قرآن اینترنت وصل کند.
   اگر فایلی نبود یا خراب بود، همان روش قبلی (دانلود از اینترنت) به کار می‌افتد. */
const BUNDLED_QURAN_URL = 'data/quran-uthmani.json';
const BUNDLED_TRANSLATION_URL = 'data/fa-makarem.json';
let bundledQuranPromise = null;
let bundledTransPromise = null;
let quranTransMemo = null;

function validQuranSurahs(surahs) {
  if (!Array.isArray(surahs) || surahs.length !== 114) return false;
  return surahs.reduce((n, sr) => n + (sr && sr.ayahs ? sr.ayahs.length : 0), 0) === 6236;
}
async function fetchBundledSurahs(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const surahs = (json && json.data && json.data.surahs) || (json && json.surahs);
    return validQuranSurahs(surahs) ? surahs : null;
  } catch (e) { return null; }
}
function loadBundledQuranText() {
  if (!bundledQuranPromise) bundledQuranPromise = fetchBundledSurahs(BUNDLED_QURAN_URL);
  return bundledQuranPromise;
}
async function getOfflineTranslation() {
  if (quranTransMemo) return quranTransMemo;
  if (!bundledTransPromise) bundledTransPromise = fetchBundledSurahs(BUNDLED_TRANSLATION_URL);
  quranTransMemo = await bundledTransPromise;
  return quranTransMemo;
}
// سورهٔ کامل به شکل [عربی، ترجمه] (همان ساختار پاسخ اینترنتی)، یا null اگر ترجمهٔ داخلی نباشد
async function offlineSurahEditions(number) {
  const ar = await getOfflineQuranText();
  const tr = await getOfflineTranslation();
  if (!ar || !tr) return null;
  const a = ar.find((s) => s.number === number);
  const t = tr.find((s) => s.number === number);
  if (!a || !t || a.ayahs.length !== t.ayahs.length) return null;
  return [a, { ayahs: t.ayahs }];
}
async function offlineJuzEditions(juz) {
  const ar = await getOfflineQuranText();
  const tr = await getOfflineTranslation();
  if (!ar || !tr) return null;
  const arAyahs = [], trAyahs = [];
  ar.forEach((sr, si) => {
    const tsr = tr.find((s) => s.number === sr.number);
    if (!tsr || tsr.ayahs.length !== sr.ayahs.length) return;
    sr.ayahs.forEach((a, k) => {
      if (a.juz !== juz) return;
      arAyahs.push(Object.assign({}, a, { surah: { number: sr.number, name: sr.name } }));
      trAyahs.push(tsr.ayahs[k]);
    });
  });
  if (!arAyahs.length) return null;
  return [{ ayahs: arAyahs }, { ayahs: trAyahs }];
}
// آیهٔ سراسری (۱ تا ۶۲۳۶) همراه ترجمه، یا null
async function offlineVerseWithTranslation(globalAyahNumber) {
  const ar = await getOfflineQuranText();
  const tr = await getOfflineTranslation();
  if (!ar || !tr) return null;
  let remaining = globalAyahNumber;
  for (const sr of ar) {
    if (remaining <= sr.ayahs.length) {
      const tsr = tr.find((s) => s.number === sr.number);
      const a = sr.ayahs[remaining - 1];
      const t = tsr && tsr.ayahs[remaining - 1];
      if (!a || !t) return null;
      return { arabic: a.text, translation: t.text, surah: sr.name, ayahNum: a.numberInSurah };
    }
    remaining -= sr.ayahs.length;
  }
  return null;
}
function normFaSearch(s) {
  return String(s).replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[\u064A\u0649]/g, '\u06CC').replace(/\u0643/g, '\u06A9')
    .replace(/[\u200C\u200F\u200E]/g, ' ').replace(/\s+/g, ' ').trim();
}
// جست‌وجوی آفلاین در ترجمهٔ فارسی؛ null یعنی ترجمهٔ داخلی نیست (از اینترنت جست‌وجو می‌شود)
async function offlineSearchMatches(q) {
  const ar = await getOfflineQuranText();
  const tr = await getOfflineTranslation();
  if (!ar || !tr) return null;
  const needle = normFaSearch(q);
  if (!needle) return [];
  const out = [];
  for (const tsr of tr) {
    const sr = ar.find((s) => s.number === tsr.number);
    if (!sr) continue;
    for (let k = 0; k < tsr.ayahs.length; k++) {
      if (normFaSearch(tsr.ayahs[k].text).indexOf(needle) !== -1) {
        out.push({ surah: { number: sr.number, name: sr.name }, numberInSurah: tsr.ayahs[k].numberInSurah || (sr.ayahs[k] && sr.ayahs[k].numberInSurah) || (k + 1), text: tsr.ayahs[k].text });
        if (out.length >= 40) return out;
      }
    }
  }
  return out;
}

async function doDownloadQuranText(force) {
  setQuranOfflineState('loading');
  try {
    if (await loadBundledQuranText()) { await getOfflineQuranText(); setQuranOfflineState('ready'); return true; }
    if (!force && await getOfflineQuranText()) { setQuranOfflineState('ready'); return true; }
    if (!navigator.onLine) { setQuranOfflineState('needs-net'); return false; }
    const res = await fetch('https://api.alquran.cloud/v1/quran/quran-uthmani');
    const json = await res.json();
    const surahs = json && json.data && json.data.surahs;
    // اعتبارسنجی: ۱۱۴ سوره و ۶۲۳۶ آیه؛ وگرنه داده ناقص است و ذخیره نمی‌شود
    if (!Array.isArray(surahs) || surahs.length !== 114) throw new Error('bad quran data');
    const total = surahs.reduce((n, sr) => n + (sr.ayahs ? sr.ayahs.length : 0), 0);
    if (total !== 6236) throw new Error('bad quran data');
    await quranIdbSet(QURAN_TEXT_IDB_KEY, { surahs, savedAt: Date.now() });
    quranTextMemo = surahs;
    // فهرست سوره‌ها هم آفلاین در دسترس باشد
    try {
      if (!localStorage.getItem('arefanejam_surah_list_cache')) {
        localStorage.setItem('arefanejam_surah_list_cache', JSON.stringify(surahs.map((sr) => ({
          number: sr.number, name: sr.name, englishName: sr.englishName, numberOfAyahs: sr.ayahs.length,
        }))));
      }
    } catch (e) {}
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
    setQuranOfflineState('ready');
    return true;
  } catch (e) {
    console.warn('ذخیرهٔ آفلاین متن قرآن انجام نشد.', e);
    setQuranOfflineState(navigator.onLine ? 'error' : 'needs-net');
    return false;
  }
}
function downloadQuranTextForOffline(force) {
  if (!quranTextPromise) quranTextPromise = doDownloadQuranText(force).finally(() => { quranTextPromise = null; });
  return quranTextPromise;
}

function setQuranOfflineState(state) {
  quranOfflineState = state;
  renderQuranOfflineStatus();
}
function renderQuranOfflineStatus() {
  const el = document.getElementById('quran-offline-status');
  if (!el) return;
  if (getQuranMode() === 'translation') { el.classList.add('hidden'); return; }
  const msgs = {
    idle: '',
    loading: '⏳ در حال ذخیرهٔ متن قرآن روی گوشی برای استفادهٔ آفلاین...',
    ready: '✅ متن کامل قرآن روی گوشی ذخیره است و بدون اینترنت هم کار می‌کند.',
    'needs-net': '📶 برای استفادهٔ آفلاین، یک‌بار با اینترنت وصل شوید تا متن قرآن ذخیره شود.',
    error: '⚠️ ذخیرهٔ متن قرآن انجام نشد. ',
  };
  el.classList.toggle('hidden', !msgs[quranOfflineState]);
  el.textContent = msgs[quranOfflineState] || '';
  if (quranOfflineState === 'error' || quranOfflineState === 'needs-net') {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'secondary-btn small-btn'; b.style.marginRight = '6px';
    b.textContent = 'تلاش دوباره';
    b.addEventListener('click', () => downloadQuranTextForOffline(true));
    el.appendChild(b);
  }
}
function syncQuranModeUi() {
  const mode = getQuranMode();
  document.querySelectorAll('#quran-mode-switch button').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  renderQuranOfflineStatus();
}
function onQuranListOpened() {
  syncQuranModeUi();
  downloadQuranTextForOffline(false);
  // فهرست سوره‌ها باید هر بار که این تب باز می‌شود (از هر مسیری: نوار پایین، دکمهٔ
  // پاپ‌آپ دعوت به قرآن، کاشی‌های صفحهٔ خانه، یا دکمهٔ برگشت) نمایش داده شود؛
  // قبلاً این کار فقط با کلیک مستقیم روی دکمهٔ «قرآن» در نوار پایین انجام می‌شد
  // و از مسیرهای دیگر (مثل پاپ‌آپ) فهرست خالی می‌ماند. loadSurahList خودش هم
  // آفلاین کار می‌کند: اول از کش localStorage و در نبود آن از متن آفلاین ذخیره‌شدهٔ قرآن می‌خواند.
  if (!document.getElementById('quran-surah-list').children.length) loadSurahList();
  else { renderContinueReadingButton(); refreshSurahAudioIcons(); }
}
document.querySelectorAll('#quran-mode-switch button').forEach((b) => {
  b.addEventListener('click', () => {
    localStorage.setItem(QURAN_MODE_KEY, b.dataset.mode);
    syncQuranModeUi();
    if (b.dataset.mode !== 'translation') downloadQuranTextForOffline(false);
  });
});

// سورهٔ فقط‌متن: اول حافظهٔ آفلاین، بعد سورهٔ قبلاً بازشده در حالت ترجمه‌دار، آخر شبکه
async function loadSurahTextOnly(number) {
  const all = await getOfflineQuranText();
  if (all) { const sr = all.find((x) => x.number === number); if (sr) return sr; }
  try {
    const c = JSON.parse(localStorage.getItem('arefanejam_surah_' + number) || 'null');
    if (c && c[0] && c[0].ayahs) return c[0];
  } catch (e) {}
  const res = await fetch(`https://api.alquran.cloud/v1/surah/${number}/quran-uthmani`);
  const json = await res.json();
  if (!json || !json.data || !json.data.ayahs) throw new Error('no data');
  return json.data;
}
async function loadJuzTextOnly(juz) {
  const all = await getOfflineQuranText();
  if (all) {
    const ayahs = [];
    all.forEach((sr) => sr.ayahs.forEach((a) => {
      if (a.juz === juz) ayahs.push(Object.assign({}, a, { surah: { number: sr.number, name: sr.name } }));
    }));
    if (ayahs.length) return { ayahs };
  }
  const res = await fetch(`https://api.alquran.cloud/v1/juz/${juz}/quran-uthmani`);
  const json = await res.json();
  if (!json || !json.data || !json.data.ayahs) throw new Error('no data');
  return json.data;
}
// renderSurahContent/renderJuzContent ساختار [عربی، ترجمه] می‌خواهند؛ در حالت فقط متن ترجمهٔ خالی می‌دهیم (با CSS پنهان است)
function withEmptyTranslation(arabicEdition) {
  return [arabicEdition, { ayahs: arabicEdition.ayahs.map(() => ({ text: '' })) }];
}

/* ---------- ذخیرهٔ صوت تلاوت برای پخش آفلاین ---------- */
let ayahBlobUrl = null;
function setRecitationSrcFromBlob(blob) {
  if (ayahBlobUrl) { try { URL.revokeObjectURL(ayahBlobUrl); } catch (e) {} }
  ayahBlobUrl = URL.createObjectURL(blob);
  recitationAudio.src = ayahBlobUrl;
}
async function findCachedAyahAudio(reciter, globalAyah) {
  if (!window.caches) return null;
  try {
    const cache = await caches.open(QURAN_AUDIO_CACHE_NAME);
    for (const b of AUDIO_BITRATES) {
      const hit = await cache.match(buildAudioUrl(reciter, b, globalAyah));
      if (hit) { const blob = await hit.blob(); if (blob && blob.size > 0) return blob; }
    }
  } catch (e) {}
  return null;
}
// مجموعهٔ شمارهٔ آیه‌هایی که صوتشان برای این قاری روی گوشی ذخیره شده
async function getCachedAyahSet(reciter) {
  const set = new Set();
  if (!window.caches) return set;
  try {
    const cache = await caches.open(QURAN_AUDIO_CACHE_NAME);
    const keys = await cache.keys();
    keys.forEach((k) => {
      const m = /\/quran\/audio\/\d+\/([^/]+)\/(\d+)\.mp3/.exec(k.url);
      if (m && m[1] === reciter) set.add(Number(m[2]));
    });
  } catch (e) {}
  return set;
}

let audioDownloadCtl = null; // { cancelled, owner }
function currentQueueOwner() { return playbackQueue.length ? playbackQueue[0].number : null; }

async function refreshAudioOfflineStatus() {
  const btn = document.getElementById('audio-offline-btn');
  if (!btn) return;
  if (audioDownloadCtl && audioDownloadCtl.owner === currentQueueOwner()) return; // پیشرفت دانلود در حال نمایش است
  if (!playbackQueue.length) { btn.textContent = '⬇️ ذخیرهٔ صوت برای آفلاین'; return; }
  const set = await getCachedAyahSet(currentReciter);
  const total = playbackQueue.length;
  const have = playbackQueue.filter((a) => set.has(a.number)).length;
  if (audioDownloadCtl && audioDownloadCtl.owner === currentQueueOwner()) return;
  if (have === total) btn.textContent = '✅ صوت این بخش با این قاری آفلاین ذخیره است';
  else if (have > 0) btn.textContent = `⬇️ ادامهٔ ذخیرهٔ صوت آفلاین (${toPersianDigits(have)} از ${toPersianDigits(total)})`;
  else btn.textContent = '⬇️ ذخیرهٔ صوت برای آفلاین';
}
function setAudioOfflineMsg(text) {
  const el = document.getElementById('audio-offline-msg');
  if (!el) return;
  el.textContent = text || '';
  el.classList.toggle('hidden', !text);
}

async function downloadAudioForOffline() {
  const btn = document.getElementById('audio-offline-btn');
  if (audioDownloadCtl) {
    if (audioDownloadCtl.owner === currentQueueOwner()) { audioDownloadCtl.cancelled = true; }
    else appAlert('audio_page_busy_other');
    return;
  }
  if (!window.caches) { appAlert('audio_page_no_storage'); return; }
  if (!playbackQueue.length) { appAlert('audio_page_loading'); return; }
  if (!navigator.onLine) { appAlert('audio_page_need_internet'); return; }
  const reciter = currentReciter;
  const list = playbackQueue.slice();
  const have = await getCachedAyahSet(reciter);
  const todo = list.filter((a) => !have.has(a.number));
  if (!todo.length) { refreshAudioOfflineStatus(); return; }
  if (!(await appConfirm('audio_page_confirm', { count: toPersianDigits(todo.length) }))) return;
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
  const ctl = { cancelled: false, owner: list[0].number };
  audioDownloadCtl = ctl;
  setAudioOfflineMsg('');
  const cache = await caches.open(QURAN_AUDIO_CACHE_NAME);
  const queue = todo.slice();
  let done = 0, failed = 0;
  const showProgress = () => {
    if (ctl.owner === currentQueueOwner()) {
      btn.textContent = `⏳ در حال ذخیره ${toPersianDigits(done + failed)} از ${toPersianDigits(todo.length)} (برای توقف بزنید)`;
    }
  };
  showProgress();
  async function worker() {
    while (queue.length && !ctl.cancelled) {
      const ayah = queue.shift();
      let ok = false;
      try { ok = await downloadAyahToCache(cache, reciter, ayah.number); } catch (e) {}
      if (ok) done++; else failed++;
      showProgress();
      if (done === 0 && failed >= 4) ctl.cancelled = true; // احتمالاً اینترنت قطع است یا دسترسی به سرور صوت ممکن نیست
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  audioDownloadCtl = null;
  if (done === 0 && failed > 0) setAudioOfflineMsg('ذخیرهٔ صوت انجام نشد؛ اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.');
  else if (failed > 0) setAudioOfflineMsg(`صوت ${toPersianDigits(failed)} آیه ذخیره نشد؛ دوباره دکمه را بزنید تا تکمیل شود.`);
  else if (ctl.cancelled) setAudioOfflineMsg('ذخیره‌سازی متوقف شد؛ آیه‌های ذخیره‌شده حفظ شده‌اند.');
  else setAudioOfflineMsg('صوت این بخش ذخیره شد و بدون اینترنت پخش می‌شود.');
  refreshAudioOfflineStatus();
  refreshSurahAudioIcons();
}
document.getElementById('audio-offline-btn').addEventListener('click', downloadAudioForOffline);

async function loadSurahList() {
  const cacheKey = 'arefanejam_surah_list_cache';
  const cached = localStorage.getItem(cacheKey);
  if (cached) { renderSurahList(JSON.parse(cached)); }
  renderContinueReadingButton();
  if (!cached) {
    try {
      const all = await getOfflineQuranText();
      if (all) {
        const list = all.map((sr) => ({ number: sr.number, name: sr.name, englishName: sr.englishName, englishNameTranslation: sr.englishNameTranslation, revelationType: sr.revelationType, numberOfAyahs: sr.ayahs.length }));
        try { localStorage.setItem(cacheKey, JSON.stringify(list)); } catch (e2) {}
        renderSurahList(list);
        return;
      }
    } catch (e) {}
  }
  try {
    const res = await fetch('https://api.alquran.cloud/v1/surah');
    const json = await res.json();
    localStorage.setItem(cacheKey, JSON.stringify(json.data));
    renderSurahList(json.data);
  } catch (e) {
    if (!cached) {
      const all = await getOfflineQuranText();
      if (all) renderSurahList(all.map((sr) => ({ number: sr.number, name: sr.name, englishName: sr.englishName, numberOfAyahs: sr.ayahs.length })));
      else document.getElementById('quran-surah-list').innerHTML = '<p class="note-empty">در حال حاضر امکان دریافت فهرست سوره‌ها نیست.</p>';
    }
  }
}

/* ---------- «ادامهٔ سورهٔ نیمه‌کاره» ----------
   اگر کاربر قبلاً بخشی از یک سوره را خوانده و رفته سراغ سورهٔ دیگر، وقتی دوباره
   همان سوره را از فهرست باز کند، آخرین آیه‌ای که واقعاً خوانده از روی همان
   مجموعهٔ همیشگیِ arefanejam_quran_overall_progress (نگاه کنید به بخش «پیشرفت
   کلی ختم قرآن») به دست می‌آید — پس محدود به ۶۰ روز اخیر نیست و کاملاً آفلاین
   هم کار می‌کند. برای تبدیل «شمارهٔ سراسری آیه» به «شمارهٔ آیه داخل سوره» فقط
   به تعداد آیات هر سوره نیاز داریم که از متن آفلاین ذخیره‌شدهٔ قرآن (در صورت
   وجود) یا از کش فهرست سوره‌ها خوانده می‌شود؛ هیچ عددی به‌صورت دستی در کد
   نوشته نشده تا همیشه با همان دیتای واقعی اپ هم‌خوان بماند. */
const QURAN_RESUME_MIN_AYAH = 3; // اگر فقط یکی‌دو آیهٔ اول را دیده، ارزش پرسیدن ندارد

let surahOffsetsCache = null; // { counts: {شماره‌سوره: تعداد آیات}, offsets: {شماره‌سوره: شمارهٔ سراسریِ قبل از این سوره} }
async function getSurahOffsets() {
  if (surahOffsetsCache) return surahOffsetsCache;
  let counts = null;
  try {
    const offlineText = await getOfflineQuranText();
    if (offlineText && offlineText.length) {
      counts = {};
      offlineText.forEach((sr) => { counts[sr.number] = sr.ayahs.length; });
    }
  } catch (e) {}
  if (!counts) {
    try {
      const cached = JSON.parse(localStorage.getItem('arefanejam_surah_list_cache') || 'null');
      if (Array.isArray(cached) && cached.length) {
        counts = {};
        cached.forEach((sr) => { counts[sr.number] = sr.numberOfAyahs; });
      }
    } catch (e) {}
  }
  if (!counts || Object.keys(counts).length < 114) return null;
  const offsets = {};
  let running = 0;
  for (let n = 1; n <= 114; n++) {
    offsets[n] = running;
    running += counts[n] || 0;
  }
  surahOffsetsCache = { counts, offsets };
  return surahOffsetsCache;
}

// نام یک سوره از روی شماره‌اش؛ اول از متن آفلاینِ کامل قرآن (در صورت ذخیره‌شدن روی
// گوشی) و در غیر این صورت از کش فهرست سوره‌ها می‌خواند، پس بدون اینترنت هم کار می‌کند.
async function getSurahNameByNumber(surahNumber) {
  try {
    const offlineText = await getOfflineQuranText();
    if (offlineText && offlineText.length) {
      const sr = offlineText.find((s) => s.number === surahNumber);
      if (sr && sr.name) return sr.name;
    }
  } catch (e) {}
  try {
    const cached = JSON.parse(localStorage.getItem('arefanejam_surah_list_cache') || 'null');
    if (Array.isArray(cached)) {
      const sr = cached.find((s) => s.number === surahNumber);
      if (sr && sr.name) return sr.name;
    }
  } catch (e) {}
  return 'سورهٔ ' + toPersianDigits(surahNumber);
}

// آخرین آیهٔ داخل‌سوره‌ای که تابه‌حال واقعاً تا انتها خوانده شده؛ اگر چیزی برای پرسیدن نیست، null.
// عمداً از مجموعهٔ «کامل خوانده‌شده» استفاده می‌شود (نه مجموعهٔ «دیده‌شده»‌ی کلی)، چون اگر
// کاربر وسط یک آیه رها کرده باشد نباید آن آیه را رد شده حساب کنیم — باید همان آیهٔ نیمه‌کاره
// دوباره از اولش پیشنهاد شود، نه آیهٔ بعدی.
// بیشترین شمارهٔ آیهٔ داخل‌سوره‌ای که تا انتها «کامل» خوانده شده (مجموعهٔ سخت‌گیرانهٔ
// QURAN_FULLY_READ_KEY)؛ چون ردیابی از ابتدای سوره و به‌ترتیبِ اسکرول انجام می‌شود، این عدد هم
// یعنی «تا کجای سوره خوانده‌اید» و هم «چند آیه از آن خوانده‌اید». اگر چیزی خوانده نشده، صفر
// برمی‌گردد. هم پاپ‌آپ «ادامهٔ سورهٔ نیمه‌کاره» و هم پاپ‌آپ «تا اینجا خوانده‌اید/کامل شد» از
// همین یک تابع استفاده می‌کنند تا هر دو دقیقاً همان یک منطق را برای همهٔ سوره‌ها اجرا کنند.
async function getSurahMaxReadAyah(surahNumber) {
  ensureQuranFullyReadMigrated();
  const data = await getSurahOffsets();
  if (!data || !data.counts[surahNumber]) return { max: 0, total: 0 };
  const total = data.counts[surahNumber];
  const offset = data.offsets[surahNumber];
  const fullySet = getQuranFullyReadSet();
  let max = 0;
  for (let i = total; i >= 1; i--) {
    if (fullySet.has(offset + i)) { max = i; break; }
  }
  return { max: max, total: total };
}

async function getSurahResumePoint(surahNumber) {
  const { max: maxInSurah, total } = await getSurahMaxReadAyah(surahNumber);
  if (!total) return null;
  if (maxInSurah < QURAN_RESUME_MIN_AYAH) return null; // خیلی کم است، پرسیدن لازم نیست
  if (maxInSurah >= total) return null; // این سوره قبلاً کامل خوانده شده
  return { ayah: maxInSurah, total: total };
}

function showQuranResumePrompt(number, name, resume, continuousAutoPlay) {
  const s = state.settings || {};
  const cfg = (s.quran_popup && s.quran_popup.resume) || {};
  const template = cfg.text || 'شما تا آیهٔ {ayah} این سوره را خوانده‌اید. آیا ادامه بدهیم؟';
  const text = template.replace(/\{ayah\}/g, toPersianDigits(resume.ayah));
  document.getElementById('quran-resume-text').textContent = text;
  document.getElementById('quran-resume-btn-continue').textContent = cfg.btn1_text || 'ادامه می‌دهم';
  document.getElementById('quran-resume-btn-restart').textContent = cfg.btn2_text || 'از اول می‌خوانم';

  // نوار پیشرفتِ کلیِ ختم قرآن (چند درصد از کل ۶۲۳۶ آیه تا الان خوانده شده)؛ کاملاً
  // محلی و آفلاین، از همان مجموعهٔ arefanejam_quran_overall_progress محاسبه می‌شود.
  const overallReadCount = getQuranOverallProgressSet().size;
  const overallPercent = Math.min(100, (overallReadCount / QURAN_TOTAL_AYAHS) * 100);
  // درصدِ واقعی همیشه در متنِ زیر نوار درست نوشته می‌شود؛ اما عرضِ خودِ نوار حداقل ۴٪
  // در نظر گرفته می‌شود، وگرنه با درصدهای خیلی کوچک (مثلاً کسی که تازه شروع کرده و
  // فقط همین چند آیه را خوانده) عرض نوار کمتر از یک پیکسل می‌شود و عملاً هیچ سبزی
  // دیده نمی‌شود — با این‌که کد درست کار می‌کند.
  const visualPercent = overallReadCount > 0 ? Math.max(overallPercent, 4) : 0;
  const progressFillEl = document.getElementById('quran-resume-progress-fill');
  const progressCaptionEl = document.getElementById('quran-resume-progress-caption');
  if (progressCaptionEl) {
    progressCaptionEl.textContent = toPersianDigits(overallPercent.toFixed(overallPercent >= 10 ? 0 : 1)) +
      '٪ از کل قرآن خوانده‌اید (' + toPersianDigits(overallReadCount) + ' از ' + toPersianDigits(QURAN_TOTAL_AYAHS) + ' آیه)';
  }
  if (progressFillEl) {
    // اول صفر می‌کنیم تا هر بار که پاپ‌آپ باز می‌شود، پرشدنِ نوار به‌صورت انیمیشنی دیده شود
    progressFillEl.style.width = '0%';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => { progressFillEl.style.width = visualPercent.toFixed(1) + '%'; });
    });
  }

  document.getElementById('quran-resume-modal').classList.remove('hidden');
  document.getElementById('quran-resume-btn-continue').onclick = () => {
    document.getElementById('quran-resume-modal').classList.add('hidden');
    const nextAyah = Math.min(resume.ayah + 1, resume.total);
    // با تأیید کاربر، علاوه بر رفتن به آیهٔ بعدی، پخش صوت هم از همان‌جا خودکار شروع شود.
    openSurahReader(number, name, { skipResumeCheck: true, scrollToAyah: nextAyah, autoPlay: true });
  };
  document.getElementById('quran-resume-btn-restart').onclick = () => {
    document.getElementById('quran-resume-modal').classList.add('hidden');
    // اگر این پاپ‌آپ به‌خاطر تمام‌شدنِ خودکارِ سورهٔ قبلی (در وسط پخش پیوسته) باز شده،
    // با زدن «از اول می‌خوانم» هم پخش قطع نشود و از آیهٔ اول همین سوره ادامه پیدا کند؛
    // اما وقتی کاربر خودش از فهرست سوره‌ها روی این سوره زده، رفتار قبلی (بدون پخش خودکار) حفظ شود.
    openSurahReader(number, name, { skipResumeCheck: true, autoPlay: !!continuousAutoPlay });
  };
}

/* ---------- پاپ‌آپ «تا اینجا خوانده‌اید» / «این سوره کامل شد» ----------
   برخلاف پاپ‌آپ «ادامهٔ سورهٔ نیمه‌کاره» بالا که فقط لحظهٔ «باز کردنِ» یک سورهٔ نیمه‌خوانده را
   می‌پاید، این یکی لحظهٔ «خروج» از صفحهٔ خواندنِ هر سوره را می‌پاید (برگشت به فهرست/رفتن به تب
   دیگر) — برای هر ۱۱۴ سوره یکسان. کاملاً محلی و روی همان مجموعهٔ QURAN_FULLY_READ_KEY سوار است
   (نه یک درخواست تازه به سرور)، پس آفلاین هم دقیقاً همین‌طور کار می‌کند. با یک «عددِ پایه» که
   لحظهٔ باز شدنِ سوره ثبت می‌شود، از نمایشِ همان پیام تکراری (وقتی کاربر چیز تازه‌ای نخوانده)
   جلوگیری می‌شود؛ فقط وقتی در همین بازدید دست‌کم یک آیهٔ تازه کامل خوانده شده باشد نشان داده
   می‌شود. اگر تا انتهای سوره خوانده شده باشد، پیامِ «کامل شد» (با دو دکمه)؛ وگرنه پیامِ
   «تا اینجا خوانده‌اید» نشان داده می‌شود. */
let quranExitPopupBaselineSurah = null;
let quranExitPopupBaselineMax = 0;

async function primeQuranExitPopupBaseline(surahNumber) {
  quranExitPopupBaselineSurah = surahNumber;
  quranExitPopupBaselineMax = 0;
  try {
    const { max } = await getSurahMaxReadAyah(surahNumber);
    quranExitPopupBaselineMax = max;
  } catch (e) {}
}

async function maybeShowQuranSurahExitPopup(surahNumber) {
  const s = state.settings || {};
  const progressCfg = (s.quran_popup && s.quran_popup.surah_progress) || {};
  const completeCfg = (s.quran_popup && s.quran_popup.surah_complete) || {};
  if (!progressCfg.active && !completeCfg.active) return; // مدیر سایت هیچ‌کدام را فعال نکرده
  try {
    const { max, total } = await getSurahMaxReadAyah(surahNumber);
    if (!total || max <= 0) return;
    const isNewProgress = quranExitPopupBaselineSurah !== surahNumber || max > quranExitPopupBaselineMax;
    if (!isNewProgress) return; // چیز تازه‌ای در این بازدید خوانده نشده
    const name = await getSurahNameByNumber(surahNumber);
    if (max >= total) {
      if (completeCfg.active && completeCfg.text) showQuranSurahCompletePopup(surahNumber, name, completeCfg);
    } else if (progressCfg.active && progressCfg.text) {
      showQuranSurahProgressPopup(max, total, name, progressCfg);
    }
  } catch (e) {}
}

function showQuranSurahProgressPopup(ayah, total, name, cfg) {
  const text = (cfg.text || '')
    .replace(/\{ayah\}/g, toPersianDigits(ayah))
    .replace(/\{total\}/g, toPersianDigits(total))
    .replace(/\{surah\}/g, name);
  document.getElementById('quran-surah-progress-text').textContent = text;
  document.getElementById('quran-surah-progress-modal').classList.remove('hidden');
}
document.getElementById('quran-surah-progress-close').addEventListener('click', () => {
  document.getElementById('quran-surah-progress-modal').classList.add('hidden');
});

function showQuranSurahCompletePopup(number, name, cfg) {
  const text = (cfg.text || '').replace(/\{surah\}/g, name);
  document.getElementById('quran-surah-complete-text').textContent = text;
  document.getElementById('quran-surah-complete-btn-again').textContent = cfg.btn1_text || 'دوباره همین سوره';
  document.getElementById('quran-surah-complete-btn-next').textContent = cfg.btn2_text || 'سورهٔ بعد';
  document.getElementById('quran-surah-complete-modal').classList.remove('hidden');
  document.getElementById('quran-surah-complete-btn-again').onclick = () => {
    document.getElementById('quran-surah-complete-modal').classList.add('hidden');
    openSurahReader(number, name, { skipResumeCheck: true });
  };
  document.getElementById('quran-surah-complete-btn-next').onclick = async () => {
    document.getElementById('quran-surah-complete-modal').classList.add('hidden');
    const nextNumber = number >= 114 ? 1 : number + 1;
    const nextName = await getSurahNameByNumber(nextNumber);
    openSurahReader(nextNumber, nextName, { skipResumeCheck: true });
  };
}

function setContinueReadingLabel(btn, text) {
  btn.innerHTML = '<span class="qs-cont-ico">▶</span><span class="qs-cont-txt"><small>ادامه مطالعه</small><b></b></span><span class="qs-cont-chev">‹</span>';
  btn.querySelector('b').textContent = text;
}
function renderContinueReadingButton() {
  const btn = document.getElementById('continue-reading-btn');
  const playbackPos = getPlaybackPosition();
  if (playbackPos && playbackPos.surahName) {
    setContinueReadingLabel(btn, `${playbackPos.surahName} — آیه ${toPersianDigits(playbackPos.numberInSurah)}`);
    btn.classList.remove('hidden');
    btn.onclick = () => openSurahReader(playbackPos.surahNumber, playbackPos.surahName, { skipResumeCheck: true, resumePage: true });
    return;
  }
  const last = getLastRead();
  if (last) {
    setContinueReadingLabel(btn, last.name);
    btn.classList.remove('hidden');
    btn.onclick = () => openSurahReader(last.number, last.name, { skipResumeCheck: true, resumePage: true });
  } else {
    btn.classList.add('hidden');
  }
}

// برای جست‌وجوی نام سوره: اعراب و تفاوت‌های نگارشی (ي/ی، ك/ک، أ/إ/آ/ٱ) نادیده گرفته می‌شود
function qsNorm(t) {
  return String(t || '').toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '')
    .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627')
    .replace(/\u064A/g, '\u06CC').replace(/\u0649/g, '\u06CC').replace(/\u0643/g, '\u06A9').replace(/\u0629/g, '\u0647')
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}
let qsAllSurahs = [];
function renderSurahList(surahs, filter) {
  const el = document.getElementById('quran-surah-list');
  if (surahs && surahs.length) qsAllSurahs = surahs;
  const list = qsAllSurahs;
  const q = qsNorm(filter && filter.trim());
  el.innerHTML = '';
  el.classList.toggle('qs-anim', !q);
  const shown = list.filter((s) => !q || qsNorm(s.name).includes(q) || qsNorm(s.englishName).includes(q) || String(s.number) === q);
  if (!shown.length) { el.innerHTML = '<p class="note-empty">سوره‌ای با این نام پیدا نشد.</p>'; return; }
  shown.forEach((s) => {
    const row = document.createElement('div');
    row.className = 'qs-row';
    const rev = s.revelationType === 'Meccan' ? '<span class="qs-tag qs-meccan">مکی</span>' : (s.revelationType === 'Medinan' ? '<span class="qs-tag qs-medinan">مدنی</span>' : '');
    row.innerHTML = `
      <span class="qs-num"><b>${toPersianDigits(s.number)}</b></span>
      <span class="qs-info">
        <span class="qs-name"></span>
        <span class="qs-meta"><span class="qs-en"></span>${rev}<span class="qs-count">${toPersianDigits(s.numberOfAyahs)} آیه</span></span>
      </span>
      <button type="button" class="qs-dl" data-n="${s.number}" aria-label="دانلود سوره" title="دانلود سوره">دانلود سوره</button>
      <span class="qs-chev">‹</span>`;
    row.querySelector('.qs-name').textContent = s.name;
    const dlBtn = row.querySelector('.qs-dl');
    dlBtn.dataset.name = s.name || '';
    dlBtn.addEventListener('click', (ev) => { ev.stopPropagation(); onSurahAudioClick(dlBtn); });
    row.querySelector('.qs-en').textContent = s.englishName || '';
    row.addEventListener('click', () => openSurahReader(s.number, s.name));
    el.appendChild(row);
  });
  refreshSurahAudioIcons();
}

/* ---------- دانلود صوت یک سورهٔ کامل (آیکون ⬇ جلوی هر سوره) ----------
   با لمس آیکون، اپ می‌پرسد «کدام قاری؟»؛ بعد از انتخاب، صوت همان قاری برای همان سوره روی گوشی ذخیره می‌شود
   (کش «arefanejam-quran-audio-v1» که پخش‌کنندهٔ قرآن هم از آن می‌خواند) و قرائت از همان صدا پخش می‌شود.
   ⬇ = دانلود نشده، ✅ = کامل ذخیره است، وسط دانلود درصد نمایش داده می‌شود (لمس = توقف).
   راه‌های دریافت هر آیه: ۱) fetch عادی از cdn.islamic.network ۲) اگر مرورگر داخل اپ (CORS) اجازه نداد، HTTP بومی کاپاسیتور
   ۳) سرور دومِ cdn.alquran.cloud. */
let surahAudioDl = null; // { num, cancelled }
let silentDl = null;     // دانلود بی‌صدای سورهٔ آیه‌ای که کاربر لمس کرده { num, reciter, cancelled }
let silentBackoffUntil = 0;
let lastAudioDlError = '';
let audioSrcPref = 0;
function surahInfoByNumber(n) {
  const list = (qsAllSurahs || []).slice().sort((a, b) => a.number - b.number);
  if (list.length < 114) return null;
  let start = 0;
  for (const s of list) {
    const c = Number(s.numberOfAyahs) || 0;
    if (s.number === n) return c ? { num: n, name: s.name, from: start + 1, count: c } : null;
    start += c;
  }
  return null;
}
function surahOfGlobalAyah(g) {
  const list = (qsAllSurahs || []).slice().sort((a, b) => a.number - b.number);
  if (list.length < 114) return null;
  let start = 0;
  for (const s of list) {
    const c = Number(s.numberOfAyahs) || 0;
    if (g > start && g <= start + c) return { num: s.number, name: s.name, from: start + 1, count: c };
    start += c;
  }
  return null;
}
function surahAudioRange(n) {
  const i = surahInfoByNumber(n);
  return i ? { from: i.from, count: i.count } : null;
}
function currentReciterName() {
  const r = RECITERS.find((x) => x.id === currentReciter);
  return r ? r.name : currentReciter;
}
function reciterNameById(id) {
  const r = RECITERS.find((x) => x.id === id);
  return r ? r.name : id;
}
// مجموعهٔ آیه‌های ذخیره‌شده برای همهٔ قاری‌ها (یک بار خواندن کش)
async function getCachedAyahMap() {
  const map = {};
  if (!window.caches) return map;
  try {
    const cache = await caches.open(QURAN_AUDIO_CACHE_NAME);
    const keys = await cache.keys();
    keys.forEach((k) => {
      const m = /\/quran\/audio\/\d+\/([^/]+)\/(\d+)\.mp3/.exec(k.url);
      if (m) (map[m[1]] || (map[m[1]] = new Set())).add(Number(m[2]));
    });
  } catch (e) {}
  return map;
}
function countInRange(set, r) {
  let c = 0;
  if (!set) return 0;
  for (let i = 0; i < r.count; i++) if (set.has(r.from + i)) c++;
  return c;
}

/* ---- دریافت صوت یک آیه ---- */
function audioDlSources(reciter, g) {
  const list = [];
  [128, 64, 192].forEach((b) => { const u = buildAudioUrl(reciter, b, g); list.push({ key: u, url: u }); });
  list.push({ key: buildAudioUrl(reciter, 128, g), url: 'https://cdn.alquran.cloud/media/audio/ayah/' + reciter + '/' + g });
  return list;
}
async function fetchAudioBlob(url) {
  try {
    const res = await fetch(url);
    if (res.ok) {
      const blob = await res.blob();
      if (blob && blob.size > 1000) return blob;
      lastAudioDlError = 'فایل ناقص';
    } else { lastAudioDlError = 'HTTP ' + res.status; }
  } catch (e) { lastAudioDlError = String((e && e.message) || e).slice(0, 60); }
  // روش دوم: HTTP بومی اندروید (محدودیت CORS مرورگر را ندارد)
  try {
    const CH = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp;
    if (CH && typeof CH.get === 'function') {
      const r = await CH.get({ url: url, responseType: 'blob', connectTimeout: 15000, readTimeout: 40000 });
      if (r && r.status === 200 && typeof r.data === 'string' && r.data.length > 1400) {
        const bin = atob(r.data);
        const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        return new Blob([u8], { type: 'audio/mpeg' });
      }
      if (r && r.status && r.status !== 200) lastAudioDlError = 'HTTP ' + r.status;
    }
  } catch (e) { lastAudioDlError = String((e && e.message) || e).slice(0, 60); }
  return null;
}
async function downloadAyahToCache(cache, reciter, g) {
  const srcs = audioDlSources(reciter, g);
  for (let k = 0; k < srcs.length; k++) {
    const idx = (audioSrcPref + k) % srcs.length;
    const src = srcs[idx];
    const blob = await fetchAudioBlob(src.url);
    if (!blob) continue;
    try {
      await cache.put(src.key, new Response(blob, { status: 200, headers: { 'Content-Type': 'audio/mpeg' } }));
    } catch (e) { lastAudioDlError = 'ذخیره: ' + String((e && e.message) || e).slice(0, 50); return false; }
    audioSrcPref = idx;
    return true;
  }
  return false;
}
async function runSurahDownload(ctl, reciter, todo, workers, onProgress) {
  let done = 0, failed = 0;
  try {
    const cache = await caches.open(QURAN_AUDIO_CACHE_NAME);
    const queue = todo.slice();
    const worker = async () => {
      while (queue.length && !ctl.cancelled) {
        const g = queue.shift();
        let ok = false;
        try { ok = await downloadAyahToCache(cache, reciter, g); } catch (e) { lastAudioDlError = String((e && e.message) || e).slice(0, 60); }
        if (ok) done++; else failed++;
        if (onProgress) onProgress(done, failed);
        if (done === 0 && failed >= 4) ctl.cancelled = true; // احتمالاً اینترنت قطع است یا سرور صوت در دسترس نیست
      }
    };
    const ws = [];
    for (let i = 0; i < workers; i++) ws.push(worker());
    await Promise.all(ws);
  } catch (e) { lastAudioDlError = String((e && e.message) || e).slice(0, 60); }
  return { done, failed };
}

function setSurahDlState(b, st, have, total, pct) {
  b.classList.remove('is-done', 'is-part', 'is-busy');
  if (st === 'done') { b.textContent = '✅'; b.classList.add('is-done'); b.title = 'صوت این سوره روی گوشی ذخیره است'; }
  else if (st === 'busy') { b.textContent = toPersianDigits(pct) + '٪'; b.classList.add('is-busy'); b.title = 'در حال دانلود (برای توقف بزنید)'; }
  else if (st === 'part') { b.textContent = 'دانلود سوره'; b.classList.add('is-part'); b.title = 'ادامهٔ دانلود صوت (' + toPersianDigits(have) + ' از ' + toPersianDigits(total) + ' آیه ذخیره است)'; }
  else { b.textContent = 'دانلود سوره'; b.title = 'دانلود سوره'; }
}
async function refreshSurahAudioIcons() {
  try {
    const btns = document.querySelectorAll('#quran-surah-list .qs-dl');
    if (!btns.length) return;
    const have = await getCachedAyahSet(currentReciter);
    btns.forEach((b) => {
      const n = Number(b.dataset.n);
      if (surahAudioDl && surahAudioDl.num === n) return;
      const r = surahAudioRange(n);
      if (!r) return;
      const c = countInRange(have, r);
      setSurahDlState(b, c === r.count ? 'done' : (c > 0 ? 'part' : 'none'), c, r.count);
    });
  } catch (e) { /* بی‌صدا */ }
}

/* ---- پنجرهٔ «کدام قاری را دانلود کنم؟» ---- */
function pickReciterForSurah(info) {
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.className = 'adlg-overlay';
    ov.innerHTML =
      '<div class="adlg-card rcpick-card" role="dialog" aria-modal="true" data-tone="download">' +
      '<div class="adlg-orb"><span class="adlg-orb-ico">🎙️</span></div>' +
      '<h3 class="adlg-title"></h3><div class="adlg-text"></div>' +
      '<div class="rcpick-list"></div>' +
      '<div class="adlg-actions"><button type="button" class="adlg-btn adlg-cancel">انصراف</button></div></div>';
    ov.querySelector('.adlg-title').textContent = 'دانلود صوت سورهٔ ' + msgSurahName(info.name);
    ov.querySelector('.adlg-text').textContent = 'قاری مورد نظر را انتخاب کنید. صوت همان قاری روی گوشی ذخیره می‌شود و قرآن با همان صدا خوانده می‌شود.';
    const listEl = ov.querySelector('.rcpick-list');
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('is-open'));

    let res = null, closed = false;
    const finish = () => {
      if (closed) return;
      closed = true;
      ov.classList.remove('is-open');
      ov.classList.add('is-closing');
      setTimeout(() => { if (ov.parentNode) ov.parentNode.removeChild(ov); }, 220);
      resolve(res);
    };
    const pushed = pushOverlay('appdlg', finish);
    const close = (v) => { res = v; if (pushed) overlayGo('appdlg', 0, finish); else finish(); };
    ov.querySelector('.adlg-cancel').addEventListener('click', () => close(null));
    ov.addEventListener('click', (e) => { if (e.target === ov) close(null); });

    const range = { from: info.from, count: info.count };
    const render = async () => {
      const map = await getCachedAyahMap();
      listEl.innerHTML = '';
      RECITERS.forEach((r) => {
        const c = countInRange(map[r.id], range);
        const full = c === info.count;
        const row = document.createElement('div');
        row.className = 'rcpick-row' + (r.id === currentReciter ? ' is-current' : '');
        const main = document.createElement('button');
        main.type = 'button';
        main.className = 'rcpick-main';
        const nm = document.createElement('span'); nm.className = 'rcpick-name'; nm.textContent = r.name;
        const st = document.createElement('span'); st.className = 'rcpick-st';
        st.textContent = full ? '✅ ذخیره شده — انتخاب' : (c > 0 ? ('⬇ ادامه (' + toPersianDigits(c) + ' از ' + toPersianDigits(info.count) + ')') : '⬇ دانلود');
        main.appendChild(nm); main.appendChild(st);
        main.addEventListener('click', () => close({ id: r.id, mode: full ? 'use' : 'download' }));
        row.appendChild(main);
        if (c > 0) {
          const del = document.createElement('button');
          del.type = 'button'; del.className = 'rcpick-del'; del.textContent = '🗑'; del.title = 'حذف از گوشی';
          let armed = false, t = null;
          del.addEventListener('click', async () => {
            if (!armed) {
              armed = true; del.textContent = 'حذف؟'; del.classList.add('is-armed');
              t = setTimeout(() => { armed = false; del.textContent = '🗑'; del.classList.remove('is-armed'); }, 3000);
              return;
            }
            clearTimeout(t);
            try {
              const cache = await caches.open(QURAN_AUDIO_CACHE_NAME);
              const keys = await cache.keys();
              for (const k of keys) {
                const m = /\/quran\/audio\/\d+\/([^/]+)\/(\d+)\.mp3/.exec(k.url);
                if (m && m[1] === r.id) { const g = Number(m[2]); if (g >= range.from && g < range.from + range.count) await cache.delete(k); }
              }
            } catch (e) {}
            refreshSurahAudioIcons();
            refreshAudioOfflineStatus();
            render();
          });
          row.appendChild(del);
        }
        listEl.appendChild(row);
      });
    };
    render();
  });
}

async function onSurahAudioClick(btn) {
  const n = Number(btn.dataset.n);
  if (surahAudioDl) {
    if (surahAudioDl.num === n) surahAudioDl.cancelled = true;
    else appAlert('audio_surah_busy_other');
    return;
  }
  if (!window.caches) { appAlert('audio_surah_no_storage'); return; }
  const info = surahInfoByNumber(n);
  if (!info) { appAlert('audio_surah_list_loading'); return; }

  const pick = await pickReciterForSurah(info);
  if (!pick) return;
  applyReciter(pick.id, { fromDownload: true }); // قاریِ انتخابی همان قاریِ پخش می‌شود
  if (pick.mode === 'use') return;

  const reciter = pick.id;
  const r = { from: info.from, count: info.count };
  const have = await getCachedAyahSet(reciter);
  const todo = [];
  for (let i = 0; i < r.count; i++) if (!have.has(r.from + i)) todo.push(r.from + i);
  if (!todo.length) { refreshSurahAudioIcons(); return; }
  if (!navigator.onLine) { appAlert('audio_surah_need_internet'); return; }
  if (silentDl) silentDl.cancelled = true;
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}

  const ctl = { num: n, cancelled: false };
  surahAudioDl = ctl;
  lastAudioDlError = '';
  setSurahDlState(btn, 'busy', 0, todo.length, 0);
  const res = await runSurahDownload(ctl, reciter, todo, 3, (done, failed) => {
    setSurahDlState(btn, 'busy', done, todo.length, Math.min(99, Math.round((done + failed) * 100 / todo.length)));
  });
  surahAudioDl = null;
  await refreshSurahAudioIcons();
  refreshAudioOfflineStatus();
  const detail = lastAudioDlError ? (' (کد خطا: ' + lastAudioDlError + ')') : '';
  if (res.done === 0 && res.failed > 0) appAlert('audio_surah_fail_all', null, { text: appMsgCfg('audio_surah_fail_all').text + detail });
  else if (res.failed > 0) appAlert('audio_surah_fail_some', { failed: toPersianDigits(res.failed) });
  else if (ctl.cancelled) appAlert('audio_surah_cancelled');
}

/* ---- لمس یک آیه: اگر صوت سورهٔ آن ذخیره نیست، بی‌صدا و در پس‌زمینه کل سوره با همین قاری ذخیره می‌شود ---- */
async function silentEnsureSurahAudio(globalAyah) {
  try {
    if (!window.caches || !navigator.onLine || surahAudioDl) return;
    if (Date.now() < silentBackoffUntil) return;
    const info = surahOfGlobalAyah(Number(globalAyah));
    if (!info) return;
    const reciter = currentReciter;
    if (silentDl && !silentDl.cancelled && silentDl.num === info.num && silentDl.reciter === reciter) return;
    if (silentDl) silentDl.cancelled = true;
    const have = await getCachedAyahSet(reciter);
    const g = Number(globalAyah);
    const todo = [];
    // اول آیه‌های بعد از آیهٔ لمس‌شده (تا پخش پیوسته از حافظه ادامه پیدا کند)، بعد آیه‌های قبل، و آیهٔ لمس‌شده آخر
    for (let x = g + 1; x < info.from + info.count; x++) if (!have.has(x)) todo.push(x);
    for (let x = info.from; x < g; x++) if (!have.has(x)) todo.push(x);
    if (!todo.length) return; // خودِ آیهٔ لمس‌شده را playAudioWithFallback همان لحظه دانلود می‌کند
    const ctl = { num: info.num, reciter: reciter, cancelled: false };
    silentDl = ctl;
    const res = await runSurahDownload(ctl, reciter, todo, 2, null);
    if (silentDl === ctl) silentDl = null;
    if (res.done === 0 && res.failed > 0) silentBackoffUntil = Date.now() + 5 * 60 * 1000;
    refreshSurahAudioIcons();
    refreshAudioOfflineStatus();
  } catch (e) { /* بی‌صدا */ }
}

document.getElementById('quran-search-input').addEventListener('input', (e) => {
  renderSurahList(null, e.target.value);
});

let currentSurahNumber = null;
const RECITERS = [
  { id: 'ar.alafasy', name: 'علافاسی' },
  { id: 'ar.abdulbasitmurattal', name: 'عبدالباسط' },
  { id: 'ar.husary', name: 'حصری' },
  { id: 'ar.minshawi', name: 'منشاوی' },
  { id: 'ar.abdurrahmaansudais', name: 'سدیس' },
  { id: 'ar.mahermuaiqly', name: 'ماهر المعیقلی' },
  { id: 'ar.shaatree', name: 'ابوبکر شاطری' },
  { id: 'ar.hudhaify', name: 'حذیفی' },
  { id: 'ar.muhammadjibreel', name: 'محمد جبریل' },
  { id: 'ar.abdullahbasfar', name: 'عبدالله بصفر' },
];
let currentReciter = localStorage.getItem('arefanejam_reciter') || 'ar.alafasy';
if (!RECITERS.some((r) => r.id === currentReciter)) currentReciter = 'ar.alafasy';
const recitationAudio = new Audio();

// فهرست قاری‌ها داخل همان select قدیمی هم ساخته می‌شود (پنهان است؛ فقط برای هماهنگی)
(function fillReciterSelect() {
  const sel = document.getElementById('reciter-select');
  if (!sel) return;
  sel.innerHTML = '';
  RECITERS.forEach((r) => { const o = document.createElement('option'); o.value = r.id; o.textContent = 'قاری: ' + r.name; sel.appendChild(o); });
  sel.value = currentReciter;
})();

/* نوار نام قاری‌ها بالای همهٔ صفحه‌های قرآن (فهرست سوره‌ها، متن سوره، مصحف صفحه‌ای، جزءها، جست‌وجو، نشان‌شده‌ها) */
function renderReciterBars() {
  document.querySelectorAll('.rc-bar').forEach((bar) => {
    if (!bar.dataset.built) {
      bar.dataset.built = '1';
      bar.innerHTML = '<span class="rc-lab">🎙️ قاری</span>';
      RECITERS.forEach((r) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'rc-chip'; b.dataset.id = r.id; b.textContent = r.name;
        b.addEventListener('click', () => applyReciter(r.id));
        bar.appendChild(b);
      });
    }
    bar.querySelectorAll('.rc-chip').forEach((c) => c.classList.toggle('is-active', c.dataset.id === currentReciter));
    const act = bar.querySelector('.rc-chip.is-active');
    if (act && bar.offsetParent !== null) { try { act.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (e) {} }
  });
}
function applyReciter(id, opts) {
  if (!RECITERS.some((r) => r.id === id)) return;
  const changed = id !== currentReciter;
  currentReciter = id;
  localStorage.setItem('arefanejam_reciter', id);
  const sel = document.getElementById('reciter-select');
  if (sel) sel.value = id;
  renderReciterBars();
  refreshAudioOfflineStatus();
  refreshSurahAudioIcons();
  if (!changed) return;
  if (silentDl) silentDl.cancelled = true;
  // اگر همین الان قرآن پخش می‌شود، از همین آیه با صدای قاری جدید ادامه بده
  if (isSequentialPlaying && playbackQueue.length && playQueueIndex >= 0 && playQueueIndex < playbackQueue.length) {
    playbackSession++;
    try { recitationAudio.pause(); } catch (e) {}
    playCurrentQueueItem(window.__currentSurahName || '');
  }
}
renderReciterBars();
document.getElementById('reciter-select').addEventListener('change', (e) => applyReciter(e.target.value));

const savedFontSize = localStorage.getItem('arefanejam_arabic_font_size') || '22';
document.documentElement.style.setProperty('--arabic-font-size', savedFontSize + 'px');
document.getElementById('arabic-font-slider').value = savedFontSize;
document.getElementById('arabic-font-slider').addEventListener('input', (e) => {
  document.documentElement.style.setProperty('--arabic-font-size', e.target.value + 'px');
  localStorage.setItem('arefanejam_arabic_font_size', e.target.value);
});

async function openSurahReader(number, name, opts) {
  opts = opts || {};
  if (!opts.skipResumeCheck) {
    try {
      const resume = await getSurahResumePoint(number);
      if (resume) { showQuranResumePrompt(number, name, resume, !!opts.autoPlay); return; }
      const rd = await getSurahMaxReadAyah(number);
      if (rd && rd.total && rd.max >= rd.total) {
        const again = await appConfirm('surah_reread_confirm', { surah: msgSurahName(name) });
        if (!again) return;
      }
    } catch (e) {} // در صورت هر خطایی (مثلاً هنوز دادهٔ آفلاین آماده نیست) مستقیم برو سراغ باز کردن سوره
  }
  if (getQuranMode() === 'page') {
    openQuranPageReader({ surahNumber: number, name: name, scrollToAyah: opts.scrollToAyah, autoPlay: opts.autoPlay, resumePage: opts.resumePage });
    return;
  }
  qpSetMode(false);
  resetPlaybackForNewContent();
  currentSurahNumber = number;
  primeQuranExitPopupBaseline(number);
  switchToTab('quran-reader', { push: true });
  document.getElementById('quran-reader-title').textContent = name;
  const contentEl = document.getElementById('quran-reader-content');
  contentEl.innerHTML = '<p class="muted-text">در حال بارگذاری...</p>';
  localStorage.setItem('arefanejam_last_read', JSON.stringify({ number, name, ts: Date.now() }));
  const textOnly = getQuranMode() === 'text';
  contentEl.classList.toggle('text-only', textOnly);
  contentEl.classList.toggle('mushaf-page', textOnly);
  if (textOnly) {
    try {
      renderSurahContent(withEmptyTranslation(await loadSurahTextOnly(number)), opts.scrollToAyah, opts.autoPlay);
    } catch (e) {
      contentEl.innerHTML = '<p class="note-empty">متن این سوره هنوز روی گوشی ذخیره نشده است. یک‌بار با اینترنت وصل شوید تا متن قرآن ذخیره شود.</p>';
    }
    return;
  }
  try {
    const off = await offlineSurahEditions(number); // متن + ترجمهٔ داخل اپ
    if (off) { renderSurahContent(off, opts.scrollToAyah, opts.autoPlay); return; }
  } catch (e) {}
  const cacheKey = 'arefanejam_surah_' + number;
  const cached = localStorage.getItem(cacheKey);
  if (cached) { renderSurahContent(JSON.parse(cached), opts.scrollToAyah, opts.autoPlay); return; }
  try {
    const res = await fetch(`https://api.alquran.cloud/v1/surah/${number}/editions/quran-uthmani,fa.makarem`);
    const json = await res.json();
    localStorage.setItem(cacheKey, JSON.stringify(json.data));
    renderSurahContent(json.data, opts.scrollToAyah, opts.autoPlay);
  } catch (e) {
    contentEl.innerHTML = '<p class="note-empty">در این لحظه امکان دریافت متن سوره نیست.</p>';
  }
}

function getLastRead() {
  try { return JSON.parse(localStorage.getItem('arefanejam_last_read') || 'null'); } catch (e) { return null; }
}

function getBookmarks() {
  try { return JSON.parse(localStorage.getItem('arefanejam_bookmarks') || '[]'); } catch (e) { return []; }
}
function isBookmarked(globalAyah) { return getBookmarks().some((b) => b.globalAyah === globalAyah); }
function toggleBookmark(ayah, surahName, btn) {
  let bookmarks = getBookmarks();
  if (isBookmarked(ayah.number)) {
    bookmarks = bookmarks.filter((b) => b.globalAyah !== ayah.number);
    btn.classList.remove('is-bookmarked');
  } else {
    bookmarks.push({ globalAyah: ayah.number, surahNumber: currentSurahNumber, surahName, ayahNumInSurah: ayah.numberInSurah, text: ayah.text });
    btn.classList.add('is-bookmarked');
  }
  localStorage.setItem('arefanejam_bookmarks', JSON.stringify(bookmarks));
}

function shareAyah(text, ref) {
  const fullText = `${text}\n\n${ref}\n\nعارفان جام`;
  if (navigator.share) {
    navigator.share({ text: fullText }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(fullText).then(() => appAlert('copy_ayah_done'));
  }
}

let playbackQueue = [];
let playbackBlocks = [];
let playQueueIndex = -1;
let isSequentialPlaying = false;
let playbackSession = 0;

/* هر بار که محتوای جدیدی (سوره یا جزء) قرار است بارگذاری شود، این تابع صدای در حال پخش را
   متوقف و صف پخش را خالی می‌کند تا محتوای قبلی با محتوای جدید تداخل پیدا نکند (رفع خطای
   «بعد از رفتن به فهرست جزءها و برگشتن، قرآن پخش نمی‌شود»). */
function resetPlaybackForNewContent() {
  disconnectQuranReadingTracker();
  playbackSession++;
  isSequentialPlaying = false;
  playQueueIndex = -1;
  playbackQueue = [];
  playbackBlocks = [];
  try { recitationAudio.pause(); } catch (e) {}
  const btn = document.getElementById('surah-play-btn');
  if (btn) btn.textContent = '🔊 پخش کل سوره';
  document.querySelectorAll('.ayah-block.is-playing').forEach((b) => b.classList.remove('is-playing'));
}

function getPlaybackPosition() {
  try { return JSON.parse(localStorage.getItem('arefanejam_playback_position') || 'null'); } catch (e) { return null; }
}
function savePlaybackPosition(ayah, surahName) {
  localStorage.setItem('arefanejam_playback_position', JSON.stringify({
    surahNumber: currentSurahNumber, surahName: surahName || '',
    numberInSurah: ayah.numberInSurah, globalAyah: ayah.number, ts: Date.now(),
  }));
}

function renderSurahContent(data, scrollToAyah, autoPlay) {
  const [arabicEdition, translationEdition] = data;
  const contentEl = document.getElementById('quran-reader-content');
  contentEl.innerHTML = '';
  playbackQueue = []; playbackBlocks = [];

  const savedPos = getPlaybackPosition();
  if (savedPos && savedPos.surahNumber === currentSurahNumber) {
    const banner = document.createElement('div');
    banner.className = 'continue-playback-banner';
    banner.innerHTML = `<span>🔊 آخرین‌بار تا آیه ${toPersianDigits(savedPos.numberInSurah)} گوش داده بودید</span>
      <button class="secondary-btn small-btn" id="resume-playback-btn">ادامه پخش</button>`;
    contentEl.appendChild(banner);
    banner.querySelector('#resume-playback-btn').addEventListener('click', () => {
      const idx = arabicEdition.ayahs.findIndex((a) => a.number === savedPos.globalAyah);
      startSequentialPlayback(arabicEdition.ayahs, playbackBlocks, idx >= 0 ? idx : 0, arabicEdition.name);
    });
  }

  const isMushafMode = contentEl.classList.contains('mushaf-page');
  arabicEdition.ayahs.forEach((ayah, i) => {
    const block = document.createElement('div');
    block.className = 'ayah-block';
    const bookmarked = isBookmarked(ayah.number);
    const ayahNumHtml = isMushafMode
      ? `<span class="ayah-num">${toPersianDigits(ayah.numberInSurah)}</span>`
      : `<span class="ayah-num">﴿${toPersianDigits(ayah.numberInSurah)}﴾</span>`;
    block.innerHTML = `
      <p class="ayah-arabic ayah-text-clickable">${ayah.text} ${ayahNumHtml}</p>
      <p class="ayah-translation">${translationEdition.ayahs[i].text}</p>
      <div class="ayah-actions">
        <button class="ayah-action-btn bookmark-btn ${bookmarked ? 'is-bookmarked' : ''}">🔖</button>
        <button class="ayah-action-btn share-btn">📤</button>
      </div>`;
    block.querySelector('.ayah-text-clickable').addEventListener('click', () => {
      if (isSequentialPlaying && playbackQueue[playQueueIndex] === ayah) {
        recitationAudio.pause();
        isSequentialPlaying = false;
        block.classList.remove('is-playing');
        document.getElementById('surah-play-btn').textContent = '🔊 پخش کل سوره';
        return;
      }
      silentEnsureSurahAudio(ayah.number);
      startSequentialPlayback(playbackQueue, playbackBlocks, i, arabicEdition.name);
    });
    block.querySelector('.bookmark-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleBookmark(ayah, arabicEdition.name, e.target);
    });
    block.querySelector('.share-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      shareAyah(ayah.text, `آیه ${toPersianDigits(ayah.numberInSurah)}`);
    });
    contentEl.appendChild(block);
    playbackQueue.push(ayah);
    playbackBlocks.push(block);
  });
  window.__currentSurahName = arabicEdition.name;
  setAudioOfflineMsg('');
  refreshAudioOfflineStatus();
  const surahNumber = currentSurahNumber, surahName = arabicEdition.name;
  const trackedAyahs = arabicEdition.ayahs.map((a) => Object.assign({}, a, { surahNumber, surahName }));
  attachQuranReadingTracker(document.getElementById('content'), trackedAyahs, playbackBlocks);
  highlightPreviouslyReadAyahs(trackedAyahs, playbackBlocks);

  // اگر کاربر از پیام «ادامهٔ سورهٔ نیمه‌کاره»، جست‌وجو یا بوکمارک وارد شده، صفحه را به همان
  // آیه ببر. چون این یک پرشِ مستقیم است (نه خواندنِ واقعیِ آیه‌های میانی)، تا پایانِ این
  // اسکرولِ نرم، ردیابِ «خواندن» را موقتاً خاموش می‌کنیم (quranProgrammaticScrollActive) تا
  // آیه‌های میانی که فقط یک لحظه از جلوی چشم رد می‌شوند، اشتباهاً «خوانده‌شده» ثبت نشوند.
  if (scrollToAyah) {
    const idx = arabicEdition.ayahs.findIndex((a) => a.numberInSurah === scrollToAyah);
    if (idx >= 0 && playbackBlocks[idx]) {
      quranProgrammaticScrollActive = true;
      const contentEl = document.getElementById('content');
      setTimeout(() => {
        try { playbackBlocks[idx].scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
        waitForQuranScrollSettle(contentEl, 2500).then(() => { quranProgrammaticScrollActive = false; });
      }, 50);
      // اگر کاربر روی «ادامه می‌دهم» زده (autoPlay)، علاوه بر بردن صفحه به آیهٔ بعدی،
      // پخش صوت هم دقیقاً از همان آیه به‌صورت خودکار شروع شود. از همان مسیر پخش
      // سکانسیِ موجود (که خودش اول صوت آفلاینِ ذخیره‌شده را امتحان می‌کند و اگر
      // نبود سراغ اینترنت می‌رود) استفاده می‌کنیم تا در حالت آفلاین هم — در صورت
      // ذخیره‌بودن صوت آن آیه روی گوشی — کار کند.
      if (autoPlay) {
        startSequentialPlayback(playbackQueue, playbackBlocks, idx, arabicEdition.name);
      }
    }
  } else if (autoPlay && playbackQueue.length) {
    // ورود تازه به این سوره (بدون آیهٔ مشخص برای پرش) با درخواست پخش خودکار —
    // مثلاً وقتی سورهٔ قبلی تمام شده و پخش پیوسته به این سوره رسیده — از آیهٔ اول شروع شود.
    startSequentialPlayback(playbackQueue, playbackBlocks, 0, arabicEdition.name);
  }
}

/* بیت‌ریت‌هایی که برای هر آیه امتحان می‌شوند (بعضی قاری‌ها ممکن است در همهٔ بیت‌ریت‌ها
   روی سرور موجود نباشند). */
const AUDIO_BITRATES = [128, 64, 192];
function buildAudioUrl(reciter, bitrate, globalAyahNumber, cacheBust) {
  return `https://cdn.islamic.network/quran/audio/${bitrate}/${reciter}/${globalAyahNumber}.mp3` + (cacheBust ? ('?r=' + cacheBust) : '');
}

/* پخش یک آیه با تلاش‌های پیاپی: ابتدا قاری انتخاب‌شدهٔ کاربر در بیت‌ریت‌های مختلف، و در
   صورت شکست همهٔ آن‌ها، قاری پیش‌فرض (علافاسی) به‌عنوان جایگزین امتحان می‌شود تا کاربر با
   یک قاریِ خاص کاملاً بدون صدا نماند. `session` جلوی اجرای نتیجهٔ یک تلاشِ قدیمی را بعد از
   عوض‌شدن صفحه (مثلاً رفتن به فهرست جزءها) می‌گیرد. */
const ayahDlInflight = {};
// یک آیه را (با قاری مشخص) در حافظهٔ صوت ذخیره می‌کند؛ درخواست تکراری همان لحظه یکی می‌شود. true = ذخیره شد
function ensureAyahCached(reciter, g, maxMs) {
  const k = reciter + '|' + g;
  if (!ayahDlInflight[k]) {
    ayahDlInflight[k] = (async () => {
      try {
        const cache = await caches.open(QURAN_AUDIO_CACHE_NAME);
        return await downloadAyahToCache(cache, reciter, g);
      } catch (e) { return false; }
      finally { setTimeout(() => { delete ayahDlInflight[k]; }, 500); }
    })();
  }
  return Promise.race([ayahDlInflight[k], new Promise((r) => setTimeout(() => r(false), maxMs || 12000))]);
}
function playAudioWithFallback(globalAyahNumber, session, onStart, onFail) {
  const reciterCandidates = currentReciter === 'ar.alafasy' ? ['ar.alafasy'] : [currentReciter, 'ar.alafasy'];
  const attempts = [];
  reciterCandidates.forEach((r) => AUDIO_BITRATES.forEach((b) => attempts.push({ reciter: r, bitrate: b })));
  let i = 0;
  function tryNext() {
    if (session !== playbackSession) return;
    if (i >= attempts.length) { onFail(); return; }
    const a = attempts[i];
    i++;
    if (ayahBlobUrl) { try { URL.revokeObjectURL(ayahBlobUrl); } catch (e) {} ayahBlobUrl = null; }
    recitationAudio.src = buildAudioUrl(a.reciter, a.bitrate, globalAyahNumber, i > 1 ? Date.now() : null);
    recitationAudio.play().then(() => {
      if (session !== playbackSession) return;
      onStart(a.reciter !== currentReciter);
    }).catch(() => { tryNext(); });
  }
  // اول: اگر صوت این آیه با قاری انتخاب‌شده روی گوشی ذخیره شده باشد، از همان (بدون اینترنت) پخش می‌شود.
  // اگر ذخیره نبود و اینترنت وصل است، همین آیه فوراً دانلود و ذخیره می‌شود و بعد پخش می‌شود (بدون انتظار برای کاربر)
  findCachedAyahAudio(currentReciter, globalAyahNumber).then(async (blob) => {
    if (session !== playbackSession) return;
    if (!blob && navigator.onLine !== false && window.caches) {
      try { await ensureAyahCached(currentReciter, globalAyahNumber, 12000); } catch (e) {}
      if (session !== playbackSession) return;
      try { blob = await findCachedAyahAudio(currentReciter, globalAyahNumber); } catch (e) { blob = null; }
    }
    if (!blob) { tryNext(); return; }
    setRecitationSrcFromBlob(blob);
    recitationAudio.play().then(() => {
      if (session !== playbackSession) return;
      onStart(false);
    }).catch(() => { tryNext(); });
  }).catch(() => { tryNext(); });
}

function playAyahAudio(globalAyahNumber, blockEl) {
  document.querySelectorAll('.ayah-block.is-playing').forEach((b) => b.classList.remove('is-playing'));
  blockEl.classList.add('is-playing');
  const session = playbackSession;
  playAudioWithFallback(globalAyahNumber, session, () => {
    showMiniPlayer(window.__currentSurahName || '');
  }, () => {
    if (session !== playbackSession) return;
    blockEl.classList.remove('is-playing');
    appAlert(navigator.onLine === false ? 'play_ayah_fail_offline' : 'play_ayah_fail_online');
  });
}

function startSequentialPlayback(ayahsList, blocksList, startIndex, surahName) {
  playbackQueue = ayahsList;
  playbackBlocks = blocksList;
  playQueueIndex = startIndex || 0;
  isSequentialPlaying = true;
  document.getElementById('surah-play-btn').textContent = '⏸ در حال پخش... (برای توقف بزنید)';
  playCurrentQueueItem(surahName);
}
function playCurrentQueueItem(surahName) {
  if (playQueueIndex < 0 || playQueueIndex >= playbackQueue.length) {
    isSequentialPlaying = false;
    document.getElementById('surah-play-btn').textContent = '🔊 پخش کل سوره';
    // این سوره تا انتها پخش شد. اگر داخل یک سورهٔ مستقل هستیم (نه فهرست جزء، که
    // خودش از قبل چند سوره را پشت‌سرهم دارد) و به آخرین سورهٔ قرآن نرسیده‌ایم،
    // خودکار برو سراغ سورهٔ بعد و همان شرط «قبلاً تا کجا خوانده‌ای» را دوباره
    // روی آن بررسی کن؛ اگر سورهٔ بعد هم قبلاً ناتمام خوانده شده، همان پاپ‌آپ ادامه/از‌اول
    // نشان داده می‌شود، وگرنه خودش از آیهٔ اول سورهٔ بعد با صدا ادامه پیدا می‌کند.
    // در حالت «مصحف صفحه‌ای» با تمام‌شدن آیه‌های این صفحه، خودکار صفحهٔ بعد باز می‌شود و پخش ادامه پیدا می‌کند
    if (qpActive) { qpPlaybackFinishedPage(); return; }
    if (currentSurahNumber && currentSurahNumber < 114) {
      goToNextSurahAfterFinish(currentSurahNumber, playbackSession);
    }
    return;
  }
  const ayah = playbackQueue[playQueueIndex];
  const block = playbackBlocks[playQueueIndex];
  // یک صفحهٔ مصحف ممکن است آیه‌های دو سورهٔ مختلف داشته باشد؛ نام/شمارهٔ سورهٔ همین آیه ثبت شود
  if (qpActive && ayah && ayah.surahNumber) {
    currentSurahNumber = ayah.surahNumber;
    surahName = ayah.surahName;
    window.__currentSurahName = ayah.surahName;
  }
  document.querySelectorAll('.ayah-block.is-playing').forEach((b) => b.classList.remove('is-playing'));
  if (block) {
    block.classList.add('is-playing');
    block.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  savePlaybackPosition(ayah, surahName || window.__currentSurahName);
  const session = playbackSession;
  playAudioWithFallback(ayah.number, session, () => {
    showMiniPlayer((surahName || window.__currentSurahName || '') + ' — آیه ' + toPersianDigits(ayah.numberInSurah));
  }, () => {
    if (session !== playbackSession) return;
    isSequentialPlaying = false;
    document.getElementById('surah-play-btn').textContent = '🔊 پخش کل سوره';
    appAlert(navigator.onLine === false ? 'play_seq_fail_offline' : 'play_seq_fail_online');
  });
}
// بعد از تمام‌شدن کامل یک سوره در حالت پخش پیوسته، خودکار سراغ سورهٔ بعد می‌رود.
// `session` همان شمارهٔ نشستِ پخش لحظهٔ پایان سوره است؛ اگر تا وقتی نام سورهٔ بعد
// (که ممکن است نیاز به خواندن IndexedDB داشته باشد) آماده شود کاربر جای دیگری رفته
// یا پخش را عوض کرده، دیگر این ناوبریِ خودکار انجام نمی‌شود.
async function goToNextSurahAfterFinish(finishedSurahNumber, session) {
  const nextNumber = finishedSurahNumber + 1;
  let nextName;
  try {
    nextName = await getSurahNameByNumber(nextNumber);
  } catch (e) {
    return;
  }
  if (session !== playbackSession) return;
  openSurahReader(nextNumber, nextName, { autoPlay: true });
}
recitationAudio.addEventListener('ended', () => {
  if (isSequentialPlaying) {
    playQueueIndex++;
    playCurrentQueueItem();
  } else {
    document.querySelectorAll('.ayah-block.is-playing').forEach((b) => b.classList.remove('is-playing'));
  }
});

document.getElementById('surah-play-btn').addEventListener('click', () => {
  if (!playbackQueue.length) {
    appAlert('play_text_loading');
    return;
  }
  if (isSequentialPlaying) {
    recitationAudio.pause();
    isSequentialPlaying = false;
    document.getElementById('surah-play-btn').textContent = '🔊 پخش کل سوره';
    document.querySelectorAll('.ayah-block.is-playing').forEach((b) => b.classList.remove('is-playing'));
    return;
  }
  const savedPos = getPlaybackPosition();
  let startIndex = 0;
  if (savedPos && savedPos.surahNumber === currentSurahNumber) {
    const idx = playbackQueue.findIndex((a) => a.number === savedPos.globalAyah);
    if (idx >= 0) startIndex = idx;
  }
  startSequentialPlayback(playbackQueue, playbackBlocks, startIndex);
});


/* ---------- جست‌وجو در قرآن ---------- */
let searchDebounce = null;
document.getElementById('quran-fulltext-search').addEventListener('input', (e) => {
  clearTimeout(searchDebounce);
  const q = e.target.value.trim();
  const resultsEl = document.getElementById('quran-search-results');
  if (q.length < 2) { resultsEl.innerHTML = ''; return; }
  resultsEl.innerHTML = '<p class="muted-text small">در حال جست‌وجو...</p>';
  searchDebounce = setTimeout(async () => {
    try {
      const offMatches = await offlineSearchMatches(q); // اگر ترجمهٔ داخل اپ هست، بدون اینترنت
      let json;
      if (offMatches) json = { data: { matches: offMatches } };
      else {
        const res = await fetch(`https://api.alquran.cloud/v1/search/${encodeURIComponent(q)}/all/fa.makarem`);
        json = await res.json();
      }
      resultsEl.innerHTML = '';
      if (!json.data || !json.data.matches || !json.data.matches.length) {
        resultsEl.innerHTML = '<p class="note-empty">نتیجه‌ای پیدا نشد.</p>';
        return;
      }
      json.data.matches.slice(0, 40).forEach((m) => {
        const row = document.createElement('div');
        row.className = 'city-row';
        row.innerHTML = `<strong>${m.surah.name}</strong> — آیه ${toPersianDigits(m.numberInSurah)}<br><span class="muted-text small">${m.text}</span>`;
        row.addEventListener('click', () => openSurahReader(m.surah.number, m.surah.name, { skipResumeCheck: true, scrollToAyah: m.numberInSurah }));
        resultsEl.appendChild(row);
      });
    } catch (err) {
      resultsEl.innerHTML = '<p class="note-empty">خطا در جست‌وجو. اتصال اینترنت را بررسی کنید.</p>';
    }
  }, 500);
});

/* ---------- جزءهای قرآن ---------- */
let selectedJuz = null;
const JUZ_COLORS = ['#7FB56F','#6FA3B5','#D98E7C','#A99BCF','#D9BD87','#8FAFA6'];
function renderJuzList() {
  const el = document.getElementById('quran-juz-grid');
  if (el.children.length) return;
  el.innerHTML = '';
  for (let j = 1; j <= 30; j++) {
    const cell = document.createElement('div');
    cell.className = 'juz-cell';
    cell.style.background = JUZ_COLORS[j % JUZ_COLORS.length];
    cell.textContent = toPersianDigits(j);
    cell.addEventListener('click', () => {
      selectedJuz = j;
      document.querySelectorAll('.juz-cell').forEach((c) => c.classList.remove('is-selected'));
      cell.classList.add('is-selected');
      document.getElementById('play-selected-juz-btn').classList.remove('hidden');
    });
    el.appendChild(cell);
  }
}
document.getElementById('play-selected-juz-btn').addEventListener('click', () => {
  if (selectedJuz) openJuzReader(selectedJuz);
});
async function openJuzReader(juzNumber) {
  if (getQuranMode() === 'page') { openQuranPageReader({ juz: juzNumber }); return; }
  qpSetMode(false);
  resetPlaybackForNewContent();
  switchToTab('quran-reader', { push: true });
  currentSurahNumber = null;
  quranExitPopupBaselineSurah = null;
  document.getElementById('quran-reader-title').textContent = 'جزء ' + toPersianDigits(juzNumber);
  const contentEl = document.getElementById('quran-reader-content');
  contentEl.innerHTML = '<p class="muted-text">در حال بارگذاری...</p>';
  const textOnly = getQuranMode() === 'text';
  contentEl.classList.toggle('text-only', textOnly);
  contentEl.classList.remove('mushaf-page'); // حالت پیوسته فقط برای خواندن یک سوره است، نه جزء
  if (textOnly) {
    try {
      renderJuzContent(withEmptyTranslation(await loadJuzTextOnly(juzNumber)));
    } catch (e) {
      contentEl.innerHTML = '<p class="note-empty">متن این جزء هنوز روی گوشی ذخیره نشده است. یک‌بار با اینترنت وصل شوید تا متن قرآن ذخیره شود.</p>';
    }
    return;
  }
  try {
    const off = await offlineJuzEditions(juzNumber); // متن + ترجمهٔ داخل اپ
    if (off) { renderJuzContent(off); return; }
  } catch (e) {}
  const cacheKey = 'arefanejam_juz_' + juzNumber;
  const cached = localStorage.getItem(cacheKey);
  if (cached) { renderJuzContent(JSON.parse(cached)); return; }
  try {
    const res = await fetch(`https://api.alquran.cloud/v1/juz/${juzNumber}/editions/quran-uthmani,fa.makarem`);
    const json = await res.json();
    localStorage.setItem(cacheKey, JSON.stringify(json.data));
    renderJuzContent(json.data);
  } catch (e) { contentEl.innerHTML = '<p class="note-empty">در این لحظه امکان دریافت متن جزء نیست.</p>'; }
}
function renderJuzContent(data) {
  const [arabicEdition, translationEdition] = data;
  const contentEl = document.getElementById('quran-reader-content');
  contentEl.innerHTML = '';
  playbackQueue = []; playbackBlocks = [];
  arabicEdition.ayahs.forEach((ayah, i) => {
    const block = document.createElement('div');
    block.className = 'ayah-block';
    const bookmarked = isBookmarked(ayah.number);
    block.innerHTML = `
      <p class="muted-text small">${ayah.surah.name} — آیه ${toPersianDigits(ayah.numberInSurah)}</p>
      <p class="ayah-arabic ayah-text-clickable">${ayah.text}</p>
      <p class="ayah-translation">${translationEdition.ayahs[i].text}</p>
      <div class="ayah-actions">
        <button class="ayah-action-btn bookmark-btn ${bookmarked ? 'is-bookmarked' : ''}">🔖</button>
        <button class="ayah-action-btn share-btn">📤</button>
      </div>`;
    block.querySelector('.ayah-text-clickable').addEventListener('click', () => {
      if (isSequentialPlaying && playbackQueue[playQueueIndex] === ayah) {
        recitationAudio.pause();
        isSequentialPlaying = false;
        block.classList.remove('is-playing');
        document.getElementById('surah-play-btn').textContent = '🔊 پخش کل سوره';
        return;
      }
      silentEnsureSurahAudio(ayah.number);
      startSequentialPlayback(playbackQueue, playbackBlocks, i, 'جزء');
    });
    block.querySelector('.bookmark-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      const prevSurah = currentSurahNumber;
      currentSurahNumber = ayah.surah.number;
      toggleBookmark(ayah, ayah.surah.name, e.target);
      currentSurahNumber = prevSurah;
    });
    block.querySelector('.share-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      shareAyah(ayah.text, `${ayah.surah.name} — آیه ${toPersianDigits(ayah.numberInSurah)}`);
    });
    contentEl.appendChild(block);
    playbackQueue.push(ayah);
    playbackBlocks.push(block);
  });
  window.__currentSurahName = 'جزء';
  setAudioOfflineMsg('');
  refreshAudioOfflineStatus();
  const trackedAyahs = arabicEdition.ayahs.map((a) => Object.assign({}, a, {
    surahNumber: a.surah ? a.surah.number : null,
    surahName: a.surah ? a.surah.name : '',
  }));
  attachQuranReadingTracker(document.getElementById('content'), trackedAyahs, playbackBlocks);
  highlightPreviouslyReadAyahs(trackedAyahs, playbackBlocks);
}

/* ---------- نشان‌شده‌ها ---------- */
function renderBookmarksPage() {
  const el = document.getElementById('quran-bookmarks-list');
  const bookmarks = getBookmarks();
  el.innerHTML = '';
  if (!bookmarks.length) { el.innerHTML = '<p class="note-empty">هنوز آیه‌ای نشان نکرده‌اید.</p>'; return; }
  bookmarks.forEach((b) => {
    const card = document.createElement('div');
    card.className = 'note-card';
    card.innerHTML = `<h4>${b.surahName} — آیه ${toPersianDigits(b.ayahNumInSurah)}</h4><p style="white-space:normal">${b.text}</p>`;
    card.addEventListener('click', () => openSurahReader(b.surahNumber, b.surahName, { skipResumeCheck: true, scrollToAyah: b.ayahNumInSurah }));
    el.appendChild(card);
  });
}

/* ---------- پیشرفت حفظ شخصی ---------- */
async function loadHifzProgress() {
  const cacheKey = 'arefanejam_surah_list_cache';
  let surahs = [];
  const cached = localStorage.getItem(cacheKey);
  if (cached) surahs = JSON.parse(cached);
  else {
    try {
      const res = await fetch('https://api.alquran.cloud/v1/surah');
      const json = await res.json();
      surahs = json.data;
      localStorage.setItem(cacheKey, JSON.stringify(surahs));
    } catch (e) { return; }
  }
  renderHifzProgressList(surahs);
}
function getHifzProgressMap() {
  try { return JSON.parse(localStorage.getItem('arefanejam_hifz_progress') || '{}'); } catch (e) { return {}; }
}
function renderHifzProgressList(surahs) {
  const el = document.getElementById('hifz-list');
  el.innerHTML = '';
  const progressMap = getHifzProgressMap();
  let done = 0, inProgress = 0;
  surahs.forEach((s) => {
    const status = progressMap[s.number] || 'not_started';
    if (status === 'completed') done++;
    if (status === 'in_progress') inProgress++;
    const item = document.createElement('div');
    item.className = 'hifz-item';
    item.innerHTML = `
      <div style="display:flex;align-items:center">
        <span class="surah-num">${toPersianDigits(s.number)}</span>
        <div class="surah-info">
          <span class="surah-name">${s.name}</span>
          <span class="surah-meta">${toPersianDigits(s.numberOfAyahs)} آیه</span>
        </div>
      </div>
      <select data-surah="${s.number}">
        <option value="not_started" ${status === 'not_started' ? 'selected' : ''}>شروع نشده</option>
        <option value="in_progress" ${status === 'in_progress' ? 'selected' : ''}>در حال حفظ</option>
        <option value="completed" ${status === 'completed' ? 'selected' : ''}>حفظ شده</option>
      </select>`;
    el.appendChild(item);
  });
  document.getElementById('hifz-count-done').textContent = toPersianDigits(done);
  document.getElementById('hifz-count-progress').textContent = toPersianDigits(inProgress);
  el.querySelectorAll('select').forEach((sel) => {
    sel.addEventListener('change', () => {
      const map = getHifzProgressMap();
      map[sel.dataset.surah] = sel.value;
      localStorage.setItem('arefanejam_hifz_progress', JSON.stringify(map));
      loadHifzProgress();
    });
  });
}

/* ---------- آمار هفتگی نماز ---------- */
const WEEKDAY_SHORT2 = ['ی','د','س','چ','پ','ج','ش'];
function renderWeeklyPrayerStats() {
  const el = document.getElementById('prayer-stats-chart');
  el.innerHTML = '';
  const log = getPrayerLog();
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toDateString();
    const dayLog = log[key] || {};
    const count = CHECKLIST_PRAYERS.filter((p) => dayLog[p.key]).length;
    const pct = Math.round((count / 5) * 100);
    const wrap = document.createElement('div');
    wrap.className = 'stats-bar-wrap';
    wrap.innerHTML = `
      <div class="stats-bar" style="height:90px"><div class="stats-bar-fill" style="height:${pct}%"></div></div>
      <span class="stats-bar-label">${WEEKDAY_SHORT2[d.getDay()]}</span>
      <span class="stats-bar-label">${toPersianDigits(count)}/۵</span>`;
    el.appendChild(wrap);
  }
}

/* ---------- شمارش تا رمضان ---------- */
function hijriToApproxGregorian(hy, hm, hd) {
  let lowJd = julianDayFromGregorian(1900, 1, 1);
  let highJd = julianDayFromGregorian(2100, 1, 1);
  for (let iter = 0; iter < 40; iter++) {
    const midJd = Math.floor((lowJd + highJd) / 2);
    const [iy, im, id] = islamicFromJulianDay(midJd);
    if (iy < hy || (iy === hy && im < hm) || (iy === hy && im === hm && id < hd)) lowJd = midJd;
    else highJd = midJd;
  }
  const jd = highJd;
  const a = jd + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d2 = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d2) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  const day = e - Math.floor((153 * m + 2) / 5) + 1;
  const month = m + 3 - 12 * Math.floor(m / 10);
  const year = 100 * b + d2 - 4800 + Math.floor(m / 10);
  return [year, month, day];
}
/* تاریخ دستی شروع و پایان رمضان (از پیشخوان سایت). فقط اگر هر دو درست و معتبر باشند برمی‌گردد؛ وگرنه null و محاسبهٔ تقریبی قبلی استفاده می‌شود. */
function ramadanCustomRange(r) {
  if (!r) return null;
  const parse = (v) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || ''));
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  };
  const start = parse(r.start_date);
  const end = parse(r.end_date);
  if (!start || !end || end < start) return null;
  const total = Math.round((end - start) / 86400000) + 1;
  if (total < 1 || total > 31) return null;
  return { start, end, total };
}
function ramadanFaDate(d) {
  const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  const names = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
  return toPersianDigits(jd) + ' ' + names[jm - 1] + ' ' + toPersianDigits(jy);
}
/* تاریخ کوتاه شمسی برای ستون «تاریخ» جدول رمضان (مثلاً «۱۲ اسفند») */
function ramadanFaShort(d) {
  const [, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  const names = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
  return toPersianDigits(jd) + ' ' + names[jm - 1];
}
function renderRamadanCountdown(r) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysEl = document.getElementById('ramadan-days-left');
  const labelEl = document.getElementById('ramadan-date-label');
  const duaEl = document.getElementById('ramadan-dua-text');
  const custom = ramadanCustomRange(r);
  if (custom && today <= custom.end) {
    if (today < custom.start) {
      const daysLeft = Math.round((custom.start - today) / 86400000);
      daysEl.textContent = toPersianDigits(daysLeft) + ' روز';
      labelEl.textContent = 'شروع ماه رمضان: ' + ramadanFaDate(custom.start);
      duaEl.classList.toggle('hidden', daysLeft > 30);
    } else {
      const dayNo = Math.round((today - custom.start) / 86400000) + 1;
      daysEl.textContent = 'روز ' + toPersianDigits(dayNo) + ' از ' + toPersianDigits(custom.total);
      labelEl.textContent = 'ماه رمضان تا ' + ramadanFaDate(custom.end) + ' ادامه دارد';
      duaEl.classList.add('hidden');
    }
    return;
  }
  const [hy] = islamicFromJulianDay(julianDayFromGregorian(now.getFullYear(), now.getMonth() + 1, now.getDate()));
  let targetHy = hy;
  let [gy, gm, gd] = hijriToApproxGregorian(targetHy, 9, 1);
  let target = new Date(gy, gm - 1, gd);
  if (target < now) {
    targetHy += 1;
    [gy, gm, gd] = hijriToApproxGregorian(targetHy, 9, 1);
    target = new Date(gy, gm - 1, gd);
  }
  const daysLeft = Math.ceil((target - now) / 86400000);
  daysEl.textContent = toPersianDigits(daysLeft) + ' روز';
  labelEl.textContent =
    'تخمین شروع رمضان ' + toPersianDigits(targetHy) + ' — تاریخ دقیق بر اساس رؤیت هلال اعلام می‌شود';
  duaEl.classList.toggle('hidden', daysLeft > 30);
}
/* تعداد روزهای ماه رمضان در سال قمری hy (۲۹ یا ۳۰ روز) */
function ramadanTotalDays(hy) {
  const [ry, rm, rd] = hijriToApproxGregorian(hy, 9, 1);
  const [sy, sm, sd] = hijriToApproxGregorian(hy, 10, 1);
  const start = new Date(ry, rm - 1, rd);
  const end = new Date(sy, sm - 1, sd);
  return Math.round((end - start) / 86400000);
}

/* ---------- مبدل تاریخ ---------- */
function populateConverterSelects() {
  const daySel = document.getElementById('conv-day');
  const monthSel = document.getElementById('conv-month');
  const yearSel = document.getElementById('conv-year');
  daySel.innerHTML = ''; monthSel.innerHTML = ''; yearSel.innerHTML = '';
  for (let d = 1; d <= 31; d++) daySel.innerHTML += `<option value="${d}">${toPersianDigits(d)}</option>`;
  JALALI_MONTHS.forEach((m, i) => { monthSel.innerHTML += `<option value="${i + 1}">${m}</option>`; });
  const [ty] = gregorianToJalali(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());
  for (let y = ty - 2; y <= ty + 2; y++) yearSel.innerHTML += `<option value="${y}" ${y === ty ? 'selected' : ''}>${toPersianDigits(y)}</option>`;
  daySel.value = new Date().getDate();
}
document.getElementById('conv-btn').addEventListener('click', () => {
  const jy = parseInt(document.getElementById('conv-year').value, 10);
  const jm = parseInt(document.getElementById('conv-month').value, 10);
  const jd = parseInt(document.getElementById('conv-day').value, 10);
  const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd);
  const d = new Date(gy, gm - 1, gd);
  const strs = getCalendarStrings(d);
  document.getElementById('conv-result-gregorian').textContent = 'میلادی: ' + strs.gregorian;
  document.getElementById('conv-result-hijri').textContent = 'قمری: ' + strs.hijri;
});

/* ---------- محاسبه‌گر زکات ---------- */
// تبدیل ارقام فارسی/عربی و جداکننده‌ها به عدد
function zkParseAmount(str) {
  const t = String(str || '')
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[^0-9]/g, '');
  return t ? parseInt(t, 10) : 0;
}
function zkFmt(n) { return toPersianDigits(Math.round(n).toLocaleString('en-US')).replace(/,/g, '٬'); }

(function setupZakatCalc() {
  const input = document.getElementById('zakat-amount-input');
  const btn = document.getElementById('zakat-calc-btn');
  const msg = document.getElementById('zakat-msg');
  const card = document.getElementById('zakat-result-card');
  const resEl = document.getElementById('zakat-result');
  if (!input || !btn) return;
  let anim = 0;

  function showMsg(t) { msg.textContent = t || ''; msg.hidden = !t; }
  input.addEventListener('input', () => {
    const n = zkParseAmount(input.value);
    input.value = n ? zkFmt(n) : '';
    showMsg('');
  });
  document.querySelectorAll('#zakat-chips .zk-chip').forEach((c) => {
    c.addEventListener('click', () => {
      input.value = zkFmt(parseInt(c.dataset.v, 10));
      showMsg('');
      calc();
    });
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); calc(); } });

  function calc() {
    const amount = zkParseAmount(input.value);
    if (!amount || amount <= 0) { card.hidden = true; showMsg('لطفاً مبلغ را وارد کنید.'); return; }
    showMsg('');
    const zakat = amount * 0.025;
    document.getElementById('zakat-row-total').textContent = zkFmt(amount) + ' تومان';
    document.getElementById('zakat-row-zakat').textContent = zkFmt(zakat) + ' تومان';
    document.getElementById('zakat-row-rest').textContent = zkFmt(amount - zakat) + ' تومان';
    card.hidden = false;
    card.classList.remove('zk-pop'); void card.offsetWidth; card.classList.add('zk-pop');
    // شمارش تا عدد نهایی (اگر کاربر «کاهش حرکت» را روشن کرده باشد بی‌انیمیشن)
    cancelAnimationFrame(anim);
    const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still) { resEl.textContent = zkFmt(zakat); }
    else {
      const t0 = performance.now(), dur = 700;
      const step = (now) => {
        const k = Math.min(1, (now - t0) / dur);
        const e = 1 - Math.pow(1 - k, 3);
        resEl.textContent = zkFmt(zakat * e);
        if (k < 1) anim = requestAnimationFrame(step); else resEl.textContent = zkFmt(zakat);
      };
      anim = requestAnimationFrame(step);
    }
    setTimeout(() => { try { card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (_) {} }, 80);
  }
  btn.addEventListener('click', calc);
})();

/* ---- محتوای تکمیلی زیر ماشین‌حساب (از پیشخوان: عارفان جام ← محاسبه‌گر زکات) ----
 * بلوک‌ها: text | image | video | audio | link. برای نوع تازه، یک case به zkRenderBlock اضافه کنید
 * و همان نوع را در includes/class-zakat.php (ثابت TYPES و فرم) هم اضافه کنید. */
function zkAttr(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function zkHost(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (_) { return ''; } }
function zkIsVideoFile(u) { return /\.(mp4|webm|ogv|m4v|mov)(\?|#|$)/i.test(String(u || '')); }
function zkRenderBlock(b) {
  const url = secureUrl(b.url || '');
  const title = b.title ? `<h5 class="zk-blk-title">${zkAttr(b.title)}</h5>` : '';
  switch (b.type) {
    case 'text':
      return `<div class="zk-blk zk-blk-text">${title}${b.text ? `<p>${zkAttr(b.text)}</p>` : ''}</div>`;
    case 'image':
      return `<figure class="zk-blk zk-blk-image"><img src="${zkAttr(url)}" alt="${zkAttr(b.title || '')}" loading="lazy" data-zk-zoom="${zkAttr(url)}" data-zk-name="${zkAttr(b.title || '')}">${b.title ? `<figcaption>${zkAttr(b.title)}</figcaption>` : ''}</figure>`;
    case 'video':
      if (zkIsVideoFile(url)) {
        return `<div class="zk-blk zk-blk-video">${title}<video src="${zkAttr(url)}" controls playsinline preload="metadata"></video></div>`;
      }
      return `<button type="button" class="zk-blk zk-blk-link zk-blk-vidlink" data-zk-link="${zkAttr(url)}" data-zk-kind="video"><span class="zk-blk-ic">▶</span><span class="zk-blk-lt"><b>${zkAttr(b.title || 'مشاهدهٔ ویدیو')}</b><small>${zkAttr(zkHost(url))}</small></span><span class="zk-blk-go">‹</span></button>`;
    case 'audio':
      return `<div class="zk-blk zk-blk-audio"><div class="zk-blk-audio-head"><span class="zk-blk-ic">🎧</span><b>${zkAttr(b.title || 'فایل صوتی')}</b></div><audio src="${zkAttr(url)}" controls preload="none"></audio></div>`;
    case 'link':
      return `<button type="button" class="zk-blk zk-blk-link" data-zk-link="${zkAttr(url)}" data-zk-kind="link"><span class="zk-blk-ic">🔗</span><span class="zk-blk-lt"><b>${zkAttr(b.label || b.title || 'مشاهدهٔ لینک')}</b><small>${zkAttr(zkHost(url))}</small></span><span class="zk-blk-go">‹</span></button>`;
    default:
      return '';
  }
}
async function loadZakatExtra() {
  const wrap = document.getElementById('zakat-extra');
  const list = document.getElementById('zakat-extra-list');
  const ttl = document.getElementById('zakat-extra-title');
  if (!wrap || !list) return;
  try {
    const d = await apiFetch('/zakat');
    const blocks = (d && d.enabled && Array.isArray(d.blocks)) ? d.blocks : [];
    if (!blocks.length) { wrap.hidden = true; list.innerHTML = ''; return; }
    ttl.textContent = d.title || '';
    ttl.hidden = !d.title;
    list.innerHTML = blocks.map(zkRenderBlock).join('');
    wrap.hidden = false;
  } catch (e) {
    // بدون اینترنت و بدون نسخهٔ ذخیره‌شده: بخش تکمیلی نشان داده نمی‌شود
    if (!list.innerHTML) wrap.hidden = true;
  }
}
(function setupZakatExtraEvents() {
  const list = document.getElementById('zakat-extra-list');
  if (!list) return;
  list.addEventListener('click', (e) => {
    const img = e.target.closest('[data-zk-zoom]');
    if (img) { openRmzZoom(img.getAttribute('data-zk-zoom'), img.getAttribute('data-zk-name') || ''); return; }
    const lk = e.target.closest('[data-zk-link]');
    if (lk) {
      trackClick('zakat_' + (lk.getAttribute('data-zk-kind') || 'link'));
      window.open(lk.getAttribute('data-zk-link'), '_blank');
    }
  });
  list.addEventListener('play', (e) => {
    if (e.target && (e.target.tagName === 'VIDEO' || e.target.tagName === 'AUDIO')) {
      // فقط یک رسانه هم‌زمان پخش شود
      list.querySelectorAll('video,audio').forEach((m) => { if (m !== e.target) m.pause(); });
    }
  }, true);
})();

/* ---------- آیات سجده (فقه حنفی) ---------- */
const SAJDAH_AYAHS_HANAFI = [
  { surah: 'اعراف', ayah: 206, num: 7 }, { surah: 'رعد', ayah: 15, num: 13 }, { surah: 'نحل', ayah: 50, num: 16 },
  { surah: 'اسراء', ayah: 109, num: 17 }, { surah: 'مریم', ayah: 58, num: 19 }, { surah: 'حج', ayah: 18, num: 22 },
  { surah: 'فرقان', ayah: 60, num: 25 }, { surah: 'نمل', ayah: 26, num: 27 }, { surah: 'سجده', ayah: 15, num: 32 },
  { surah: 'ص', ayah: 24, num: 38 }, { surah: 'فصلت', ayah: 38, num: 41 }, { surah: 'نجم', ayah: 62, num: 53 },
  { surah: 'انشقاق', ayah: 21, num: 84 }, { surah: 'علق', ayah: 19, num: 96 },
];
/* ---------- آیات سجده: کارت‌های زیبا، متن و ترجمهٔ آفلاین، «سجده کردم» و پیشرفت ---------- */
const SAJDAH_DONE_KEY = 'arefanejam_sajdah_done';
function sajdahDoneGet() { try { return JSON.parse(localStorage.getItem(SAJDAH_DONE_KEY) || '{}') || {}; } catch (e) { return {}; } }
function sajdahDoneSet(o) { try { localStorage.setItem(SAJDAH_DONE_KEY, JSON.stringify(o)); } catch (e) {} }
function sajdahUpdateProgress() {
  const done = sajdahDoneGet();
  const n = SAJDAH_AYAHS_HANAFI.filter((s) => done[s.num + ':' + s.ayah]).length;
  const total = SAJDAH_AYAHS_HANAFI.length;
  const fill = document.getElementById('sj-prog-fill'), txt = document.getElementById('sj-prog-text'), hero = document.getElementById('sj-hero');
  if (fill) fill.style.width = Math.round(n / total * 100) + '%';
  if (txt) txt.textContent = n >= total ? 'ماشاءالله! همهٔ ۱۴ سجده را به‌جا آوردید 🌟' : toPersianDigits(n) + ' از ' + toPersianDigits(total) + ' سجده به‌جا آورده شده';
  if (hero) hero.classList.toggle('is-complete', n >= total);
}
async function sajdahLoadText(card, s) {
  const arEl = card.querySelector('.sj-ar'), trEl = card.querySelector('.sj-tr');
  if (arEl.dataset.loaded) return;
  try {
    const ar = await getOfflineQuranText();
    const sr = ar && ar.find((x) => x.number === s.num);
    const a = sr && sr.ayahs.find((x) => x.numberInSurah === s.ayah);
    arEl.textContent = a ? a.text : 'برای دیدن متن آیه، متن قرآن باید در برنامه باشد.';
    try {
      const tr = await getOfflineTranslation();
      const tsr = tr && tr.find((x) => x.number === s.num);
      const t = tsr && tsr.ayahs.find((x) => x.numberInSurah === s.ayah);
      if (t) trEl.textContent = t.text;
    } catch (e) {}
    arEl.dataset.loaded = '1';
  } catch (e) { arEl.textContent = ''; }
}
function renderSajdahList() {
  const el = document.getElementById('sajdah-list-content');
  if (!el) return;
  if (!el.children.length) {
    SAJDAH_AYAHS_HANAFI.forEach((s, i) => {
      const key = s.num + ':' + s.ayah;
      const card = document.createElement('div');
      card.className = 'sj-card';
      card.style.setProperty('--i', i);
      card.innerHTML =
        '<div class="sj-card-top">' +
          '<div class="sj-medal"><span>' + toPersianDigits(i + 1) + '</span></div>' +
          '<div class="sj-card-title"><b>سورهٔ ' + s.surah + '</b><small>آیهٔ ' + toPersianDigits(s.ayah) + ' · سورهٔ شمارهٔ ' + toPersianDigits(s.num) + '</small></div>' +
          '<div class="sj-chev" aria-hidden="true">﹀</div>' +
        '</div>' +
        '<div class="sj-card-body">' +
          '<p class="sj-ar"></p><p class="sj-tr"></p>' +
          '<div class="sj-actions">' +
            '<button type="button" class="sj-btn sj-btn-done"></button>' +
            '<button type="button" class="sj-btn sj-btn-read">📖 خواندن سوره</button>' +
          '</div>' +
        '</div>';
      const doneBtn = card.querySelector('.sj-btn-done');
      const paint = () => {
        const on = !!sajdahDoneGet()[key];
        card.classList.toggle('is-done', on);
        doneBtn.textContent = on ? '✅ سجده کردم (لمس = برداشتن)' : '🤲 سجده کردم';
      };
      paint();
      card.querySelector('.sj-card-top').addEventListener('click', () => {
        const open = !card.classList.contains('is-open');
        card.classList.toggle('is-open', open);
        if (open) sajdahLoadText(card, s);
      });
      doneBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const d = sajdahDoneGet();
        if (d[key]) delete d[key]; else { d[key] = 1; try { if (navigator.vibrate) navigator.vibrate(25); } catch (er) {} }
        sajdahDoneSet(d); paint(); sajdahUpdateProgress();
      });
      card.querySelector('.sj-btn-read').addEventListener('click', (e) => {
        e.stopPropagation();
        (async () => {
          let nm = 'سورهٔ ' + s.surah;
          try { nm = await getSurahNameByNumber(s.num); } catch (er) {}
          try { openSurahReader(s.num, nm); } catch (er) {}
        })();
      });
      el.appendChild(card);
    });
  }
  sajdahUpdateProgress();
}

/* توجه: بارگذاری فهرست سوره‌ها اکنون داخل onQuranListOpened() انجام می‌شود که از
   switchToTab برای هر مسیر ورود به این تب صدا زده می‌شود (شامل کلیک روی این دکمه)،
   پس دیگر نیازی به شنوندهٔ جداگانه برای همین دکمه نیست (از دوبار اجرا شدن جلوگیری می‌کند). */

/* ---------- حالت تاریک ---------- */
const darkModeToggle = document.getElementById('dark-mode-toggle');
const topbarDarkBtn = document.getElementById('topbar-dark-toggle');
function applyDarkMode(enabled) {
  document.body.classList.toggle('dark-mode', enabled);
  darkModeToggle.checked = enabled;
  topbarDarkBtn.textContent = enabled ? '☀️' : '🌙';
  localStorage.setItem('arefanejam_dark_mode', enabled ? '1' : '0');
}
applyDarkMode(localStorage.getItem('arefanejam_dark_mode') === '1');
darkModeToggle.addEventListener('change', (e) => applyDarkMode(e.target.checked));
topbarDarkBtn.addEventListener('click', () => applyDarkMode(!document.body.classList.contains('dark-mode')));

/* ---------- رنگ‌بندی سفارشی مدیر ---------- */
function applyThemeColors(theme) {
  if (!theme) return;
  const root = document.documentElement.style;
  if (theme.primary) { root.setProperty('--emerald', theme.primary); root.setProperty('--emerald-light', theme.primary); }
  if (theme.accent) { root.setProperty('--gold', theme.accent); }
  if (theme.background) { root.setProperty('--paper', theme.background); }
  if (theme.text) { root.setProperty('--ink', theme.text); }
}
async function loadTheme() {
  try { await apiSWR('/theme', applyThemeColors); } catch (e) { /* از رنگ‌های پیش‌فرض استفاده می‌شود */ }
}

/* ---------- ردیابی کلیک روی لینک‌ها/ویدیوها ---------- */
async function trackClick(linkType) {
  const device_id = await ensureDeviceId();
  apiFetch('/track-click', { method: 'POST', body: JSON.stringify({ link_type: linkType, device_id }) }).catch(() => {});
}

/* ---------- اصلاح دستی اوقات (استثنای یک روز خاص) ---------- */
let azanExceptions = [];
async function loadAzanExceptions() {
  try {
    azanExceptions = await apiFetch('/azan-exceptions');
    try { localStorage.setItem('arefanejam_azan_exceptions', JSON.stringify(azanExceptions)); } catch (e) {}
  } catch (e) {
    try { azanExceptions = JSON.parse(localStorage.getItem('arefanejam_azan_exceptions') || '[]'); } catch (e2) { azanExceptions = []; }
  }
  if (!Array.isArray(azanExceptions)) azanExceptions = [];
}
// نام شهر را یکدست می‌کند (نیم‌فاصله/فاصله، ی و ک عربی، اعراب، ارقام) تا «تربت‌جام» و «تربت جام» یکی حساب شوند
function normCityName(n) {
  return String(n == null ? '' : n)
    .replace(/[\u200c\u200d\u200f\u200e\s]+/g, '')
    .replace(/[\u064a\u0649]/g, '\u06cc').replace(/\u0643/g, '\u06a9')
    .replace(/[\u064b-\u065f\u0670]/g, '')
    .toLowerCase();
}
function findAzanException(jm, jd, cityName) {
  const nc = normCityName(cityName);
  const specific = azanExceptions.find((e) => Number(e.jalali_month) === jm && Number(e.jalali_day) === jd && e.city_name && nc && normCityName(e.city_name) === nc);
  if (specific) return specific;
  return azanExceptions.find((e) => Number(e.jalali_month) === jm && Number(e.jalali_day) === jd && !e.city_name);
}
function applyTimeOverride(date, hhmm) {
  if (!hhmm) return date;
  const [h, m] = hhmm.split(':').map(Number);
  if (iranFixedNow()) return prayerClockInstant(date, h, m, true);
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d;
}

/* ---------- بیشتر: منوهای گروه‌بندی‌شده ---------- */
const MENU_GROUPS = {
  quran: { title: 'قرآن و مطالعه', items: [
    { icon: '📖', label: 'درس امروز', goto: 'lesson' },
    { icon: '🔍', label: 'جست‌وجو در قرآن', goto: 'quran-search' },
    { icon: '🔢', label: 'فهرست جزءها', goto: 'quran-juz' },
    { icon: '🔖', label: 'نشان‌شده‌ها', goto: 'quran-bookmarks' },
    { icon: '📊', label: 'پیشرفت حفظ من', goto: 'hifz-progress' },
    { icon: '🕋', label: 'آیات سجده', goto: 'sajdah-list' },
  ]},
  deeds: { title: 'محاسبه اعمال', items: [
    { icon: '✅', label: 'چک‌لیست نماز', goto: 'prayer-checklist' },
    { icon: '📈', label: 'آمار هفتگی نماز', goto: 'prayer-stats' },
    { icon: '🤲', label: 'محاسبه اعمال روزانه', goto: 'daily-deeds' },
    { icon: '📿', label: 'تسبیح دیجیتال', goto: 'tasbih' },
    { icon: '📖', label: 'گزارش قرآن', goto: 'quran-report' },
  ]},
  ibadah: { title: 'عبادت', items: [
    { icon: '💰', label: 'محاسبه‌گر زکات', goto: 'zakat-calc' },
  ]},
  personal: { title: 'شخصی و اطلاعات', items: [
    { icon: '📝', label: 'یادداشت‌های من', goto: 'notes' },
    { icon: 'ℹ️', label: 'درباره ما', goto: 'about' },
  ]},
  media: { title: 'اطلاع‌رسانی', items: [
    { icon: '📰', label: 'اخبار', goto: 'news-list' },
    { icon: '🌐', label: 'فضای مجازی', goto: 'social' },
    { icon: '🖼️', label: 'فعالیت‌های فرهنگی', goto: 'gallery' },
    { icon: '📚', label: 'کتاب‌ها', goto: 'books' },
  ]},
};
// رنگ‌های شاد و متنوع برای کاشی‌های زیرمنو (به‌ترتیب چرخشی روی آیتم‌ها اعمال می‌شود)
const SUBMENU_TILE_COLORS = [
  ['#4CC26B', '#1F8F49'], ['#3FA0E8', '#1D6FB8'], ['#F0B429', '#B9840D'],
  ['#B159D8', '#7B32A0'], ['#E8745A', '#B84C34'], ['#29AEC7', '#0F7C90'],
  ['#F0973D', '#C46A15'], ['#E85A8A', '#B22F5E'],
];
function openMenuGroup(key) {
  const group = MENU_GROUPS[key];
  if (!group) return;
  document.getElementById('submenu-title').textContent = group.title;
  const listEl = document.getElementById('submenu-list');
  listEl.innerHTML = '';
  group.items.forEach((item, i) => {
    const [c, cd] = SUBMENU_TILE_COLORS[i % SUBMENU_TILE_COLORS.length];
    const tile = document.createElement('button');
    tile.className = 'menu-tile';
    tile.style.setProperty('--tile-c', c);
    tile.style.setProperty('--tile-cd', cd);
    tile.innerHTML = `<span class="menu-tile-badge">${item.icon}</span><span class="menu-tile-label">${item.label}</span>`;
    tile.addEventListener('click', () => switchToTab(item.goto, { push: true }));
    listEl.appendChild(tile);
  });
  switchToTab('submenu', { push: true });
}
document.querySelectorAll('[data-group]').forEach((btn) => {
  btn.addEventListener('click', () => openMenuGroup(btn.dataset.group));
});

/* ---------- پخش‌کنندهٔ کوچک صوتی ---------- */
function showMiniPlayer(label) {
  document.getElementById('mini-player').classList.remove('hidden');
  document.getElementById('mini-player-label').textContent = label || '';
  document.getElementById('mini-player-toggle').textContent = '⏸';
}
document.getElementById('mini-player-toggle').addEventListener('click', () => {
  if (recitationAudio.paused) { recitationAudio.play(); document.getElementById('mini-player-toggle').textContent = '⏸'; }
  else { recitationAudio.pause(); document.getElementById('mini-player-toggle').textContent = '▶'; }
});
document.getElementById('mini-player-close').addEventListener('click', () => {
  recitationAudio.pause();
  isSequentialPlaying = false;
  document.getElementById('mini-player').classList.add('hidden');
  document.querySelectorAll('.ayah-block.is-playing').forEach((b) => b.classList.remove('is-playing'));
});
document.getElementById('mini-player-seek').addEventListener('input', (e) => {
  if (recitationAudio.duration) recitationAudio.currentTime = (e.target.value / 100) * recitationAudio.duration;
});
recitationAudio.addEventListener('timeupdate', () => {
  if (recitationAudio.duration) {
    document.getElementById('mini-player-seek').value = (recitationAudio.currentTime / recitationAudio.duration) * 100;
  }
});
recitationAudio.addEventListener('pause', () => { document.getElementById('mini-player-toggle').textContent = '▶'; });
recitationAudio.addEventListener('play', () => { document.getElementById('mini-player-toggle').textContent = '⏸'; });

/* ---------- رمضان: شمارش + برنامه ویژه ---------- */
/* ---------- گالری عکس‌های رمضان: قاب مربع + اسلاید چپ/راست + جستجو با نام + زوم ---------- */
// متن را برای جستجو یکدست می‌کند (ی/ک عربی، اعراب، ارقام فارسی و عربی، نیم‌فاصله، حروف بزرگ و کوچک)
function rmzNorm(t) {
  return String(t || '').toLowerCase()
    .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک')
    .replace(/[ً-ٟـ]/g, '')
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[‌‍‎‏]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
function renderRamadanGallery(r) {
  const block = document.getElementById('ramadan-gallery-block');
  if (!block) return;
  const items = (Array.isArray(r.gal_items) ? r.gal_items : []).filter((it) => it && it.url);
  block.innerHTML = '';
  if (!items.length) { block.style.display = 'none'; return; }
  block.style.display = '';

  const widthPct = ({ small: 45, medium: 70, large: 100 })[r.gal_size] || 70;
  const align = ['left', 'center', 'right'].indexOf(r.gal_align) > -1 ? r.gal_align : 'center';
  const fit = r.gal_fit === 'contain' ? 'contain' : 'cover';

  const wrap = document.createElement('div');
  wrap.className = 'rmz-gal';
  if (r.gal_hint && String(r.gal_hint).trim()) {
    const hint = document.createElement('p');
    hint.className = 'rmz-gal-hint';
    hint.textContent = r.gal_hint;
    wrap.appendChild(hint);
  }
  const searchRow = document.createElement('div');
  searchRow.className = 'rmz-gal-search';
  const input = document.createElement('input');
  input.type = 'search';
  input.placeholder = 'نام عکس را بنویسید...';
  input.setAttribute('aria-label', 'جستجوی عکس');
  searchRow.appendChild(input);
  wrap.appendChild(searchRow);

  const frame = document.createElement('div');
  frame.className = 'rmz-gal-frame';
  frame.style.width = widthPct + '%';
  if (align === 'left') { frame.style.marginLeft = '0'; frame.style.marginRight = 'auto'; }
  else if (align === 'right') { frame.style.marginLeft = 'auto'; frame.style.marginRight = '0'; }
  else { frame.style.marginLeft = 'auto'; frame.style.marginRight = 'auto'; }
  frame.innerHTML =
    '<div class="rmz-gal-square">' +
      '<div class="rmz-gal-scroller" dir="ltr"></div>' +
      '<button type="button" class="rmz-gal-arrow rmz-gal-prev" aria-label="قبلی">‹</button>' +
      '<button type="button" class="rmz-gal-arrow rmz-gal-next" aria-label="بعدی">›</button>' +
      '<span class="rmz-gal-count"></span>' +
    '</div>' +
    '<div class="rmz-gal-dots"></div>' +
    '<p class="rmz-gal-caption"></p>';
  wrap.appendChild(frame);
  const empty = document.createElement('p');
  empty.className = 'rmz-gal-empty hidden';
  empty.textContent = 'عکسی با این نام پیدا نشد.';
  wrap.appendChild(empty);
  block.appendChild(wrap);

  const scroller = frame.querySelector('.rmz-gal-scroller');
  const dotsEl = frame.querySelector('.rmz-gal-dots');
  const captionEl = frame.querySelector('.rmz-gal-caption');
  const countEl = frame.querySelector('.rmz-gal-count');
  const prevBtn = frame.querySelector('.rmz-gal-prev');
  const nextBtn = frame.querySelector('.rmz-gal-next');
  let shown = [];
  let cur = 0;

  function updateInfo() {
    const n = shown.length;
    if (!n) return;
    cur = Math.max(0, Math.min(n - 1, Math.round(scroller.scrollLeft / Math.max(1, scroller.clientWidth))));
    const it = shown[cur];
    captionEl.textContent = it.name || '';
    captionEl.style.display = it.name ? '' : 'none';
    countEl.textContent = n > 1 ? toPersianDigits(cur + 1) + ' / ' + toPersianDigits(n) : '';
    countEl.style.display = n > 1 ? '' : 'none';
    dotsEl.querySelectorAll('.rmz-gal-dot').forEach((d, i) => d.classList.toggle('active', i === cur));
    prevBtn.style.display = n > 1 ? '' : 'none';
    nextBtn.style.display = n > 1 ? '' : 'none';
  }
  function show(list) {
    shown = list;
    scroller.innerHTML = '';
    dotsEl.innerHTML = '';
    empty.classList.toggle('hidden', list.length > 0);
    frame.style.display = list.length ? '' : 'none';
    list.forEach((it, i) => {
      const slide = document.createElement('div');
      slide.className = 'rmz-slide';
      const img = document.createElement('img');
      img.src = secureUrl(it.url);
      img.alt = it.name || '';
      img.draggable = false;
      img.style.objectFit = fit;
      img.loading = 'lazy';
      slide.appendChild(img);
      slide.addEventListener('click', () => openRmzZoom(it.url, it.name || ''));
      scroller.appendChild(slide);
      if (list.length > 1 && list.length <= 10) {
        const d = document.createElement('span');
        d.className = 'rmz-gal-dot';
        d.addEventListener('click', () => { scroller.scrollTo({ left: i * scroller.clientWidth, behavior: 'smooth' }); });
        dotsEl.appendChild(d);
      }
    });
    scroller.scrollLeft = 0;
    cur = 0;
    updateInfo();
  }
  let raf = 0;
  scroller.addEventListener('scroll', () => {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; updateInfo(); });
  });
  prevBtn.addEventListener('click', () => scroller.scrollBy({ left: -scroller.clientWidth, behavior: 'smooth' }));
  nextBtn.addEventListener('click', () => scroller.scrollBy({ left: scroller.clientWidth, behavior: 'smooth' }));

  input.addEventListener('input', () => {
    const q = rmzNorm(input.value);
    if (!q) { show(items); return; }
    const qc = q.replace(/ /g, '');
    show(items.filter((it) => {
      const nm = rmzNorm(it.name);
      return nm.indexOf(q) > -1 || nm.replace(/ /g, '').indexOf(qc) > -1;
    }));
  });
  show(items);
}

/* نمایش تمام‌صفحهٔ یک عکس با زوم (دو انگشت، دوبار لمس، چرخ ماوس) و جابه‌جایی با کشیدن */
let rmzZoomEl = null;
function closeRmzZoomDirect() {
  if (rmzZoomEl) { rmzZoomEl.remove(); rmzZoomEl = null; }
}
function openRmzZoom(url, name) {
  if (!url) return;
  closeRmzZoomDirect();
  const root = document.createElement('div');
  root.className = 'rmz-zoom';
  root.innerHTML =
    '<div class="rmz-zoom-top"><button type="button" class="rmz-zoom-close" aria-label="بستن">✕</button><span class="rmz-zoom-name"></span></div>' +
    '<div class="rmz-zoom-stage"><img alt="" draggable="false"></div>' +
    '<div class="rmz-zoom-help">دو انگشت یا دوبار لمس برای زوم</div>';
  root.querySelector('.rmz-zoom-name').textContent = name || '';
  const stage = root.querySelector('.rmz-zoom-stage');
  const img = stage.querySelector('img');
  img.src = secureUrl(url);
  document.body.appendChild(root);
  rmzZoomEl = root;
  pushOverlay('rmzoom', closeRmzZoomDirect);
  root.querySelector('.rmz-zoom-close').addEventListener('click', () => overlayGo('rmzoom', 0, closeRmzZoomDirect));
  root.addEventListener('contextmenu', (e) => e.preventDefault());
  setTimeout(() => { const h = root.querySelector('.rmz-zoom-help'); if (h) h.style.opacity = '0'; }, 2500);

  let scale = 1, tx = 0, ty = 0;
  const MAX = 6;
  const pointers = new Map();
  let startDist = 0, startScale = 1;
  let dragX = 0, dragY = 0, dragTX = 0, dragTY = 0, moved = 0;
  let lastTap = { t: 0, x: 0, y: 0 };

  function apply() { img.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')'; }
  function clamp() {
    const mx = Math.max(0, (img.clientWidth * scale - stage.clientWidth) / 2);
    const my = Math.max(0, (img.clientHeight * scale - stage.clientHeight) / 2);
    tx = Math.max(-mx, Math.min(mx, tx));
    ty = Math.max(-my, Math.min(my, ty));
  }
  // نقطهٔ (px,py) نسبت به مرکز قاب، حین زوم ثابت می‌ماند
  function zoomAt(newScale, px, py) {
    newScale = Math.max(1, Math.min(MAX, newScale));
    const ratio = newScale / scale;
    tx = px - (px - tx) * ratio;
    ty = py - (py - ty) * ratio;
    scale = newScale;
    if (scale === 1) { tx = 0; ty = 0; }
    clamp(); apply();
  }
  function rel(x, y) {
    const b = stage.getBoundingClientRect();
    return [x - (b.left + b.width / 2), y - (b.top + b.height / 2)];
  }

  stage.addEventListener('pointerdown', (e) => {
    try { stage.setPointerCapture(e.pointerId); } catch (x) {}
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) { dragX = e.clientX; dragY = e.clientY; dragTX = tx; dragTY = ty; moved = 0; }
    else if (pointers.size === 2) {
      const p = Array.from(pointers.values());
      startDist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      startScale = scale; moved = 99;
    }
  });
  stage.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && startDist > 0) {
      const p = Array.from(pointers.values());
      const dist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      const m = rel((p[0].x + p[1].x) / 2, (p[0].y + p[1].y) / 2);
      zoomAt(startScale * (dist / startDist), m[0], m[1]);
    } else if (pointers.size === 1) {
      const dx = e.clientX - dragX, dy = e.clientY - dragY;
      moved = Math.max(moved, Math.hypot(dx, dy));
      if (scale > 1) { tx = dragTX + dx; ty = dragTY + dy; clamp(); apply(); }
    }
  });
  function endPtr(e) {
    const wasSingle = pointers.size === 1;
    pointers.delete(e.pointerId);
    if (pointers.size === 1) {
      const p = Array.from(pointers.values())[0];
      dragX = p.x; dragY = p.y; dragTX = tx; dragTY = ty;
    }
    if (wasSingle && moved < 10 && e.type === 'pointerup') {
      const now = Date.now();
      if (now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 40) {
        const m = rel(e.clientX, e.clientY);
        if (scale > 1) zoomAt(1, 0, 0); else zoomAt(2.5, m[0], m[1]);
        lastTap = { t: 0, x: 0, y: 0 };
      } else { lastTap = { t: now, x: e.clientX, y: e.clientY }; }
    }
  }
  stage.addEventListener('pointerup', endPtr);
  stage.addEventListener('pointercancel', endPtr);
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const m = rel(e.clientX, e.clientY);
    zoomAt(scale * (e.deltaY < 0 ? 1.2 : 1 / 1.2), m[0], m[1]);
  }, { passive: false });
}

async function loadRamadanPage() {
  renderRamadanCountdown(null);
  try {
    const r = await apiFetch('/ramadan');
    renderRamadanCountdown(r);
    renderRamadanContent(r);
  } catch (e) { /* ignore */ }
}
function renderRamadanContent(r) {
  const contentBlock = document.getElementById('ramadan-content-block');
  contentBlock.innerHTML = '';
  if (r.text || r.image_url || r.video_url) {
    const card = document.createElement('div');
    card.className = 'verse-card';
    card.style.margin = '10px 18px';
    let html = '';
    if (r.image_url) {
      const sqW = ({ small: 45, medium: 70, large: 100 })[r.sq_size] || 70;
      const sqA = r.sq_align === 'left' ? 'margin:0 auto 10px 0' : (r.sq_align === 'right' ? 'margin:0 0 10px auto' : 'margin:0 auto 10px');
      const sqF = r.sq_fit === 'contain' ? 'contain' : 'cover';
      html += `<div class="rmz-sq" style="width:${sqW}%;${sqA}"><img id="ramadan-main-img" src="${secureUrl(r.image_url)}" style="object-fit:${sqF}"></div>`;
    }
    if (r.video_url) html += `<video id="ramadan-video-el" src="${r.video_url}" controls style="width:100%;border-radius:10px;margin-bottom:10px"></video>`;
    if (r.text) html += `<p class="verse-translation">${r.text}</p>`;
    if (r.link_url) html += `<button class="secondary-btn small-btn" id="ramadan-link-btn" style="margin-top:8px">مشاهده لینک</button>`;
    card.innerHTML = html;
    contentBlock.appendChild(card);
    const mainImg = card.querySelector('#ramadan-main-img');
    if (mainImg) mainImg.addEventListener('click', () => openRmzZoom(r.image_url, ''));
    if (r.link_url) {
      document.getElementById('ramadan-link-btn').addEventListener('click', () => {
        trackClick('ramadan_link');
        window.open(r.link_url, '_blank');
      });
    }
    const ramadanVideoEl = document.getElementById('ramadan-video-el');
    if (ramadanVideoEl) ramadanVideoEl.addEventListener('play', () => trackClick('ramadan_video'), { once: true });
  }

  renderRamadanGallery(r);

  const specialBlock = document.getElementById('ramadan-special-block');
  specialBlock.innerHTML = '';
  if (r.active === '1') {
    const now = new Date();
    let [hy, hm, hd] = islamicFromJulianDay(julianDayFromGregorian(now.getFullYear(), now.getMonth() + 1, now.getDate()));
    let totalRamadanDays = ramadanTotalDays(hy);
    /* اگر تاریخ شروع و پایان رمضان از پیشخوان تعیین شده باشد، همان ملاک است */
    const custom = ramadanCustomRange(r);
    if (custom) {
      const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      totalRamadanDays = custom.total;
      if (today0 >= custom.start && today0 <= custom.end) {
        hm = 9;
        hd = Math.round((today0 - custom.start) / 86400000) + 1;
      } else {
        hm = 0;
        hd = 0;
      }
    }
    const days = r.days || {};
    let dayLabel = 'برنامهٔ ویژهٔ رمضان (فعال)';
    if (hm === 9) {
      dayLabel = `امروز روز ${toPersianDigits(hd)} از ${toPersianDigits(totalRamadanDays)} ماه رمضان است`;
    }

    let rowsHtml = '';
    const rmCols = [['fajr', 'سحر'], ['dhuhr', 'ظهر'], ['asr', 'عصر'], ['maghrib', 'افطار'], ['isha', 'عشاء']];
    const rmHid = hiddenPrayerKeys(null, true);
    const rmShown = rmCols.filter((c) => !rmHid.has(c[0]));
    // تاریخ هر روز رمضان برای نوشتن نام روز هفته (شنبه، یکشنبه، ...)
    let rmStart = custom ? custom.start : null;
    if (!rmStart) { const g = hijriToApproxGregorian(hy, 9, 1); rmStart = new Date(g[0], g[1] - 1, g[2]); }
    for (let day = 1; day <= totalRamadanDays; day++) {
      const t = days[day] || {};
      const isToday = hm === 9 && day === hd;
      const dayDate = new Date(rmStart.getFullYear(), rmStart.getMonth(), rmStart.getDate() + day - 1);
      const wd = WEEKDAYS_FA[dayDate.getDay()];
      const dt = ramadanFaShort(dayDate);
      rowsHtml += `
        <tr class="${isToday ? 'is-today' : ''}">
          <td>${isToday ? '<span class="ramadan-day-badge"></span>' : ''}${toPersianDigits(day)}</td>
          <td class="ramadan-wd-col">${wd}</td>
          <td class="ramadan-dt-col">${dt}</td>
          ${rmShown.map((c) => `<td>${toPersianDigits(t[c[0]] || '—')}</td>`).join('')}
        </tr>`;
    }

    const card = document.createElement('div');
    card.className = 'ramadan-special-card';
    const cardBg = r.bg_color || '#0E2E29';
    card.style.background = cardBg;
    card.style.color = r.text_color || '#FFFFFF';
    const cellPaddingV = Number.isFinite(parseInt(r.cell_padding_v, 10)) ? parseInt(r.cell_padding_v, 10) : 10;
    const cellPaddingH = Number.isFinite(parseInt(r.cell_padding_h, 10)) ? parseInt(r.cell_padding_h, 10) : 6;
    const fontSize = Number.isFinite(parseInt(r.font_size, 10)) ? parseInt(r.font_size, 10) : 14;
    const fontColor = r.font_color || r.text_color || '#FFFFFF';
    card.style.setProperty('--ramadan-cell-py', cellPaddingV + 'px');
    card.style.setProperty('--ramadan-cell-px', cellPaddingH + 'px');
    card.style.setProperty('--ramadan-header-bg', cardBg);
    card.style.setProperty('--ramadan-font-size', fontSize + 'px');
    card.style.setProperty('--ramadan-font-color', fontColor);
    card.innerHTML = `
      <h4>${dayLabel}</h4>
      <div class="ramadan-schedule-wrap">
        <table class="ramadan-schedule-table">
          <thead><tr><th>روز</th><th class="ramadan-wd-col">هفته</th><th class="ramadan-dt-col">تاریخ</th>${rmShown.map((c) => `<th>${c[1]}</th>`).join('')}</tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>`;
    specialBlock.appendChild(card);
    const todayRow = card.querySelector('.ramadan-schedule-table tr.is-today');
    if (todayRow) todayRow.scrollIntoView({ block: 'nearest' });
  }
}
/* ---------- جشن عید فطر: آتش‌بازی + پیام تبریک + فایل صوتی ----------
 * روز عید فطر = «یک روز بعد از تاریخ پایان ماه رمضان» که مدیر در پیشخوان (رمضان ویژه) تعیین کرده است.
 * متن تبریک و فایل صوتی هم از همان صفحه می‌آید (eid_enabled / eid_title / eid_text / eid_audio_url / eid_repeat).
 * فایل صوتی از چند روز قبل در گوشی ذخیره می‌شود تا در روز عید بدون اینترنت هم پخش شود. */
const EID_AUDIO_CACHE_NAME = 'arefanejam-eid-audio-v1';
const EID_SHOWN_KEY = 'arefanejam_eid_shown';
let eidState = null;

function eidTodayKey(r) {
  const custom = ramadanCustomRange(r);
  if (!custom) return '';
  const eid = new Date(custom.end.getFullYear(), custom.end.getMonth(), custom.end.getDate() + 1);
  const n = new Date();
  const today = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  if (today.getTime() !== eid.getTime()) return '';
  return eid.getFullYear() + '-' + String(eid.getMonth() + 1).padStart(2, '0') + '-' + String(eid.getDate()).padStart(2, '0');
}

async function eidPrefetchAudio(url) {
  if (!url || !window.caches || !navigator.onLine) return;
  try {
    const cache = await caches.open(EID_AUDIO_CACHE_NAME);
    if (await cache.match(url)) return;
    const res = await fetch(url + (url.indexOf('?') > -1 ? '&' : '?') + '_=' + Date.now());
    if (res.status !== 200) return;
    const blob = await res.blob();
    if (!blob.size) return;
    await cache.put(url, new Response(blob, { status: 200, headers: { 'Content-Type': res.headers.get('Content-Type') || 'audio/mpeg' } }));
    const keep = new URL(url, location.href).href;
    const keys = await cache.keys();
    for (const k of keys) { if (k.url !== keep) await cache.delete(k); }
  } catch (e) { /* مهم نیست؛ در روز عید مستقیم از اینترنت پخش می‌شود */ }
}

async function eidMakeAudio(url) {
  let src = url;
  let blobUrl = '';
  try {
    if (window.caches) {
      const cache = await caches.open(EID_AUDIO_CACHE_NAME);
      const hit = await cache.match(url);
      if (hit) {
        const b = await hit.blob();
        blobUrl = URL.createObjectURL(b);
        src = blobUrl;
      }
    }
  } catch (e) {}
  const a = new Audio();
  a.preload = 'auto';
  a.src = src;
  return { audio: a, blobUrl };
}

/* آتش‌بازی: موشک از پایین بالا می‌رود و به صورت گلِ رنگی منفجر می‌شود */
/* تنظیمات «متن رنگی در آتش‌بازی» از پیشخوان: فهرست کلمه‌ها با رنگ هر کلمه (eid_fx_words) و فاصلهٔ نمایش (eid_fx_every).
 * اگر مدیر متنی ننوشته باشد null برمی‌گردد و آتش‌بازی مثل قبل است. */
let eidFxCfg = null;
function eidFxFrom(r) {
  r = r || {};
  let words = [];
  if (Array.isArray(r.eid_fx_words)) {
    words = r.eid_fx_words.map((x) => ({
      t: String((x && x.t) || '').trim().slice(0, 30),
      c: /^#[0-9a-f]{3,8}$/i.test(String((x && x.c) || '')) ? x.c : '#F3D98A',
    })).filter((x) => x.t).slice(0, 12);
  }
  if (!words.length) return null;
  const every = Math.max(3, Math.min(30, parseInt(r.eid_fx_every, 10) || 6));
  return { words, every };
}

function eidStartFireworks(canvas, gentle, fx) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let w = 0, h = 0, raf = 0, timer = 0, last = 0, stopped = false;
  const rockets = [], sparks = [], tsparks = [];
  let txtPts = null, txtLoopTimer = 0;
  // فونت زیبای فارسی (Lalezar، همان که در index.html بارگذاری می‌شود) را قبل از ساخت متن آماده کن؛ بعد چیدمان دوباره ساخته می‌شود
  if (fx && fx.words && document.fonts && document.fonts.load) {
    const sample = fx.words.map((x) => x.t).join(' ');
    Promise.all([document.fonts.load('48px Lalezar', sample), document.fonts.load('700 48px Vazirmatn', sample)])
      .then(() => { txtPts = null; }).catch(() => {});
  }
  function resize() {
    txtPts = null; // اندازهٔ صفحه عوض شد؛ چیدمان متن دوباره ساخته می‌شود
    w = window.innerWidth; h = window.innerHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);
  function launch() {
    rockets.push({
      x: w * (0.12 + Math.random() * 0.76), y: h + 8,
      vx: (Math.random() - 0.5) * 1.2,
      v: h * 0.0115 + Math.random() * h * 0.004,
      ty: h * (0.12 + Math.random() * 0.34),
      hue: Math.floor(Math.random() * 360),
    });
  }
  /* متنِ رنگی: هر کلمه با رنگ خودش روی یک بومِ پنهان نوشته می‌شود و از روی پیکسل‌هایش نقطه‌های هدف ساخته می‌شود؛
     جرقه‌ها از مرکز انفجار پخش می‌شوند و بعد به شکل متن می‌نشینند، کمی می‌مانند و محو می‌شوند. */
  function buildText() {
    if (!fx || !fx.words || !fx.words.length) return null;
    const maxW = Math.min(w * 0.9, 440);
    const family = "Lalezar, Vazirmatn, Tahoma, sans-serif"; // خط ضخم و خوش‌فرم فارسی؛ اگر نبود Vazirmatn
    const maxH = h * 0.3; // متن هرچقدر بلند باشد، از ۳۰٪ ارتفاع صفحه بیشتر نمی‌شود (خودکار کوچک می‌شود)
    const mc = document.createElement('canvas').getContext('2d');
    let fs = Math.max(26, Math.min(64, Math.round(w * 0.14)));
    let lines = [], gap = 0;
    for (let tries = 0; tries < 20; tries++) {
      mc.font = fs + 'px ' + family;
      gap = fs * 0.34;
      lines = [];
      let cur = { items: [], w: 0 };
      let tooWide = false;
      fx.words.forEach((wd) => {
        const ww = mc.measureText(wd.t).width;
        if (ww > maxW) tooWide = true;
        if (cur.items.length && cur.w + gap + ww > maxW) { lines.push(cur); cur = { items: [], w: 0 }; }
        cur.w += cur.items.length ? gap + ww : ww;
        cur.items.push({ t: wd.t, c: wd.c, w: ww });
      });
      lines.push(cur);
      if ((!tooWide && lines.length * fs * 1.4 <= maxH) || fs <= 18) break;
      fs = Math.floor(fs * 0.9);
    }
    const lineH = fs * 1.4, pad = 10;
    const ow = Math.ceil(maxW + pad * 2), oh = Math.ceil(lines.length * lineH + pad * 2);
    const oc = document.createElement('canvas');
    oc.width = ow; oc.height = oh;
    const c2 = oc.getContext('2d');
    c2.font = fs + 'px ' + family;
    c2.textBaseline = 'middle';
    c2.textAlign = 'right';
    c2.lineJoin = 'round';
    c2.lineWidth = Math.max(1.5, fs * 0.07); // کمی ضخیم‌ترش می‌کنیم تا نقطه‌ها و دندانه‌های حروف فارسی بعد از نقطه‌نقطه‌شدن نمانند
    try { c2.direction = 'rtl'; } catch (e) {}
    lines.forEach((ln, li) => {
      let x = (ow + ln.w) / 2; // وسط‌چین؛ اولین کلمه سمت راست
      const y = pad + li * lineH + lineH / 2;
      ln.items.forEach((it) => {
        c2.fillStyle = it.c; c2.strokeStyle = it.c;
        c2.strokeText(it.t, x, y);
        c2.fillText(it.t, x, y);
        x -= it.w + gap;
      });
    });
    let data;
    try { data = c2.getImageData(0, 0, ow, oh).data; } catch (e) { return null; }
    let cnt = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 128) cnt++;
    if (!cnt) return null;
    const limit = gentle ? 700 : 1100; // تعداد نقطه‌های متن؛ بیشتر = نوشتهٔ تمیزتر
    const step = Math.max(2, Math.ceil(Math.sqrt(cnt / limit)));
    const pts = [];
    for (let y = 0; y < oh; y += step) {
      for (let x = 0; x < ow; x += step) {
        const k = (y * ow + x) * 4;
        if (data[k + 3] > 128) pts.push({ x, y, col: data[k] + ',' + data[k + 1] + ',' + data[k + 2] });
      }
    }
    return { pts, ow, oh, size: step * 1.12 };
  }
  function launchText() {
    rockets.push({
      x: w * (0.35 + Math.random() * 0.3), y: h + 8,
      vx: (Math.random() - 0.5) * 0.6, v: h * 0.0125,
      ty: h * (0.2 + Math.random() * 0.08), hue: 45, text: true,
    });
  }
  function explodeText(x, y) {
    if (!txtPts) txtPts = buildText();
    if (!txtPts || !txtPts.pts.length) { explode(x, y, 45); return; }
    const T = txtPts;
    const ox = Math.max(4, Math.min(w - T.ow - 4, x - T.ow / 2));
    const oy = Math.max(8, Math.min(h - T.oh - 8, y - T.oh / 2));
    const hold = 100 + Math.random() * 20;
    for (let i = 0; i < T.pts.length; i++) {
      const p = T.pts[i];
      const ang = Math.random() * 6.2832, sp = 2 + Math.random() * 5.5;
      tsparks.push({ x, y, tx: ox + p.x, ty: oy + p.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, age: 0, hold, life: 1, col: p.col, size: T.size });
    }
    if (tsparks.length > 2400) tsparks.splice(0, tsparks.length - 2400);
  }
  function explode(x, y, hue) {
    const ring = Math.random() < 0.4;
    const n = ring ? 54 : 70 + Math.floor(Math.random() * 30);
    const power = 3 + Math.random() * 2.2;
    const gold = Math.random() < 0.3;
    for (let i = 0; i < n; i++) {
      const ang = ring ? (i / n) * Math.PI * 2 : Math.random() * Math.PI * 2;
      const sp = ring ? power : power * (0.25 + Math.random() * 0.85);
      sparks.push({
        x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        life: 1, decay: 0.008 + Math.random() * 0.01,
        hue: gold ? 42 + Math.random() * 10 : hue + (Math.random() - 0.5) * 30,
        sat: gold ? 95 : 100, light: gold ? 62 : 58, size: 1.4 + Math.random() * 1.6,
      });
    }
    const cap = gentle ? 500 : 1100;
    if (sparks.length > cap) sparks.splice(0, sparks.length - cap);
  }
  function frame(t) {
    if (stopped) return;
    const dt = Math.min((t - (last || t)) / 16.67, 3);
    last = t;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i];
      r.x += r.vx * dt; r.y -= r.v * dt; r.v *= Math.pow(0.992, dt);
      sparks.push({ x: r.x, y: r.y, vx: (Math.random() - 0.5) * 0.4, vy: 0.6, life: 0.7, decay: 0.05, hue: 40, sat: 90, light: 70, size: 1.6 });
      if (r.y <= r.ty || r.v < 2) { if (r.text) explodeText(r.x, r.y); else explode(r.x, r.y, r.hue); rockets.splice(i, 1); }
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.vx *= Math.pow(0.985, dt); s.vy = s.vy * Math.pow(0.985, dt) + 0.045 * dt;
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= s.decay * dt;
      if (s.life <= 0) { sparks.splice(i, 1); continue; }
      ctx.fillStyle = 'hsla(' + s.hue + ',' + s.sat + '%,' + s.light + '%,' + s.life.toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.size * (0.5 + s.life * 0.5), 0, 6.2832); ctx.fill();
    }
    // جرقه‌های متن: اول پخش می‌شوند، بعد به جای خود در متن می‌نشینند، کمی می‌مانند و محو می‌شوند
    ctx.globalCompositeOperation = 'source-over';
    for (let i = tsparks.length - 1; i >= 0; i--) {
      const s = tsparks[i];
      s.age += dt;
      if (s.age < 14) {
        s.x += s.vx * dt; s.y += s.vy * dt;
        const f = Math.pow(0.9, dt); s.vx *= f; s.vy *= f;
      } else if (s.age < s.hold) {
        const k = 1 - Math.pow(0.86, dt);
        s.x += (s.tx - s.x) * k; s.y += (s.ty - s.y) * k;
      } else {
        s.life -= 0.022 * dt; s.y += 0.25 * dt;
      }
      if (s.life <= 0) { tsparks.splice(i, 1); continue; }
      ctx.fillStyle = 'rgba(' + s.col + ',' + s.life.toFixed(2) + ')';
      ctx.fillRect(s.x - s.size / 2, s.y - s.size / 2, s.size, s.size);
    }
    raf = requestAnimationFrame(frame);
  }
  function loop() {
    if (stopped) return;
    const k = gentle ? 1 : 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < k; i++) setTimeout(launch, i * 180);
    timer = setTimeout(loop, gentle ? 1300 + Math.random() * 1500 : 600 + Math.random() * 700);
  }
  for (let i = 0; i < (gentle ? 2 : 4); i++) setTimeout(launch, i * 250);
  timer = setTimeout(loop, gentle ? 1800 : 1200);
  function textLoop() {
    if (stopped) return;
    launchText();
    txtLoopTimer = setTimeout(textLoop, (fx.every + (gentle ? 3 : 0)) * 1000);
  }
  if (fx && fx.words && fx.words.length) txtLoopTimer = setTimeout(textLoop, gentle ? 2500 : 2200);
  raf = requestAnimationFrame(frame);
  return function stop() {
    stopped = true;
    cancelAnimationFrame(raf); clearTimeout(timer); clearTimeout(txtLoopTimer);
    window.removeEventListener('resize', resize);
  };
}

function closeEidDirect() {
  const st = eidState;
  if (!st) return;
  eidState = null;
  try { st.stopFx(); } catch (e) {}
  try { if (st.audio) { st.audio.pause(); st.audio.removeAttribute('src'); st.audio.load(); } } catch (e) {}
  try { if (st.blobUrl) URL.revokeObjectURL(st.blobUrl); } catch (e) {}
  try { st.el.remove(); } catch (e) {}
  // بعد از بستن کارت تبریک، آتش‌بازی ملایم در همهٔ بخش‌های اپ ادامه پیدا می‌کند
  if (eidAmbientWanted) { const w = eidAmbientWanted; eidAmbientWanted = null; eidAmbientStart(w.key, w.preview); }
}

/* ---------- آتش‌بازی ملایم در همهٔ بخش‌های اپ (روز عید) ----------
 * یک بوم تمام‌صفحهٔ شفاف که لمس‌ها را رد می‌کند (pointer-events: none)؛ پس همهٔ صفحه‌ها مثل قبل کار می‌کنند.
 * کاربر با دکمهٔ کوچک «✕ آتش‌بازی» می‌تواند آن را برای همان روز خاموش کند. با رفتن اپ به پس‌زمینه متوقف می‌شود
 * و فقط تا آخر روز عید (نیمه‌شب) می‌ماند. مدیر از پیشخوان (رمضان ویژه) می‌تواند آن را خاموش کند (eid_ambient). */
const EID_AMBIENT_OFF_KEY = 'arefanejam_eid_ambient_off';
let eidAmbient = null;
let eidAmbientWanted = null;

function eidAmbientStart(key, preview) {
  if (eidAmbient) return;
  if (eidState) { eidAmbientWanted = { key, preview: !!preview }; return; } // کارت تبریک باز است؛ بعد از بستنش شروع می‌شود
  if (!preview) { try { if (localStorage.getItem(EID_AMBIENT_OFF_KEY) === key) return; } catch (e) {} }
  const canvas = document.createElement('canvas');
  canvas.className = 'eid-ambient';
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'eid-ambient-off';
  chip.textContent = '✕ آتش‌بازی';
  document.body.appendChild(canvas);
  document.body.appendChild(chip);
  const st = { canvas, chip, key, stopFx: eidStartFireworks(canvas, true, eidFxCfg), timer: 0 };
  chip.addEventListener('click', () => {
    if (!preview) { try { localStorage.setItem(EID_AMBIENT_OFF_KEY, key); } catch (e) {} }
    eidAmbientStop();
  });
  if (!preview) {
    const n = new Date();
    const ms = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1).getTime() - n.getTime();
    st.timer = setTimeout(eidAmbientStop, Math.max(1000, ms));
  }
  eidAmbient = st;
}

function eidAmbientStop() {
  const st = eidAmbient;
  eidAmbient = null;
  eidAmbientWanted = null;
  if (!st) return;
  try { st.stopFx(); } catch (e) {}
  try { clearTimeout(st.timer); } catch (e) {}
  try { st.canvas.remove(); } catch (e) {}
  try { st.chip.remove(); } catch (e) {}
}

function showEidCelebration(r, key, audioUrl, preview) {
  if (eidState) return;
  if (!preview) { try { localStorage.setItem(EID_SHOWN_KEY, key); } catch (e) {} } // در حالت تست، «امروز نشان داده شد» ثبت نمی‌شود
  const el = document.createElement('div');
  el.className = 'eid-overlay';
  el.setAttribute('dir', 'rtl');
  el.innerHTML = '<canvas class="eid-canvas"></canvas>' +
    '<div class="eid-card">' +
    '<div class="eid-moon">🌙</div>' +
    '<h2 class="eid-title"></h2>' +
    '<p class="eid-text"></p>' +
    '<div class="eid-actions"><button type="button" class="eid-btn eid-sound" hidden></button>' +
    '<button type="button" class="eid-btn eid-close">بستن</button></div>' +
    '</div>';
  el.querySelector('.eid-title').textContent = r.eid_title || 'عید سعید فطر مبارک 🌙';
  el.querySelector('.eid-text').textContent = r.eid_text || 'عید سعید فطر بر شما مبارک باد.\nطاعات و عبادات شما قبول درگاه حق.';
  document.body.appendChild(el);
  const st = { el, audio: null, blobUrl: '', stopFx: eidStartFireworks(el.querySelector('.eid-canvas'), false, eidFxFrom(r)) };
  eidState = st;
  pushOverlay('eid', closeEidDirect);
  el.querySelector('.eid-close').addEventListener('click', () => overlayGo('eid', 0, closeEidDirect));

  if (!audioUrl) return;
  const btn = el.querySelector('.eid-sound');
  const setLabel = () => { btn.textContent = (st.audio && !st.audio.paused && !st.audio.ended) ? '🔇 قطع صدا' : '🔊 پخش صدا'; };
  const tryPlay = () => {
    if (!st.audio) return;
    try { if (st.audio.ended) st.audio.currentTime = 0; } catch (e) {}
    const p = st.audio.play();
    if (p && p.then) p.then(setLabel).catch(setLabel); else setLabel();
  };
  eidMakeAudio(audioUrl).then((o) => {
    if (eidState !== st) { try { if (o.blobUrl) URL.revokeObjectURL(o.blobUrl); } catch (e) {} return; }
    st.audio = o.audio; st.blobUrl = o.blobUrl;
    ['play', 'pause', 'ended'].forEach((ev) => st.audio.addEventListener(ev, setLabel));
    btn.hidden = false;
    setLabel();
    tryPlay(); // اگر اندروید پخش خودکار را نپذیرفت، با لمس دکمه یا لمس صفحه پخش می‌شود
  });
  btn.addEventListener('click', () => {
    if (!st.audio) return;
    if (!st.audio.paused && !st.audio.ended) st.audio.pause(); else tryPlay();
  });
  let touched = false;
  el.addEventListener('pointerdown', (e) => {
    if (touched || e.target.closest('.eid-btn')) return;
    touched = true;
    if (st.audio && st.audio.paused && !st.audio.ended && st.audio.currentTime === 0) tryPlay();
  });
}

async function checkEidCelebration(opts) {
  opts = opts || {};
  if (eidState) return;
  try {
    const r = await apiFetch('/ramadan');
    if (!r || r.eid_enabled !== '1') return;
    eidFxCfg = eidFxFrom(r);
    const audioUrl = normalizeAzanUrl(r.eid_audio_url || '');
    if (audioUrl) eidPrefetchAudio(audioUrl);
    const key = eidTodayKey(r);
    if (!key) return;
    let last = '';
    try { last = localStorage.getItem(EID_SHOWN_KEY) || ''; } catch (e) {}
    const repeat = r.eid_repeat === '1' && !opts.resume;
    if (last !== key || repeat) showEidCelebration(r, key, audioUrl);
    // آتش‌بازی ملایم در همهٔ بخش‌های اپ؛ اگر کارت تبریک باز شد، بعد از بستنش شروع می‌شود (خاموش فقط با تیک «نه» در پیشخوان)
    if (r.eid_ambient !== '') eidAmbientStart(key, false);
  } catch (e) { /* بدون اینترنت و بدون نسخهٔ ذخیره‌شده: چیزی نشان داده نمی‌شود */ }
}

/* تست جشن عید فطر: بدون توجه به تاریخ و بدون ثبت «نمایش داده شد» (دکمهٔ «تست جشن عید» در پنل مخفی صفحهٔ «بیشتر»).
 * متن تبریک و فایل صوتی همان‌هایی است که در پیشخوان (رمضان ویژه ← جشن عید فطر) ذخیره کرده‌اید. */
async function previewEidCelebration() {
  if (eidState) return { ok: false, msg: 'جشن همین الان روی صفحه است.' };
  let r = null;
  try { r = await apiFetch('/ramadan'); } catch (e) { r = null; }
  if (!r) r = {};
  const audioUrl = normalizeAzanUrl(r.eid_audio_url || '');
  eidFxCfg = eidFxFrom(r);
  showEidCelebration(r, 'preview', audioUrl, true);
  const ambient = r.eid_ambient !== '';
  if (ambient) eidAmbientStart('preview', true);
  return {
    ok: true,
    ambient,
    hasFx: !!eidFxCfg,
    enabled: r.eid_enabled === '1',
    hasAudio: !!audioUrl,
    hasTitle: !!r.eid_title,
  };
}
window.previewEidCelebration = previewEidCelebration;

/* ---------- جلسه خیرین ---------- */
// این بخش باید بدون اینترنت هم دیده شود؛ پس هر بار که اطلاعاتش با موفقیت از سایت گرفته شد
// در گوشی ذخیره می‌شود (متن‌ها در localStorage و تصاویر در کش مخصوص) و وقتی اینترنت نبود
// یا کند بود، همان نسخهٔ ذخیره‌شده نمایش داده می‌شود. ویدیوها به‌خاطر حجم بالا ذخیره نمی‌شوند.
function charityReadCache(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
}
function charityWriteCache(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* حافظه پر بود؛ مهم نیست */ }
}
// بدون مهلت، وقتی اینترنت «وصل ولی بی‌جان» است درخواست می‌تواند مدت‌ها معلق بماند و بخش هیچ‌وقت نمایش داده نشود
function charityFetchWithTimeout(path, ms) {
  return Promise.race([
    apiFetch(path),
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms || 10000)),
  ]);
}
function charityNetworkMessage(err, fallback) {
  const offline = !navigator.onLine || (err && (err instanceof TypeError || err.message === 'timeout' || /failed to fetch|networkerror|load failed/i.test(err.message || '')));
  return offline ? 'این کار به اینترنت نیاز دارد. لطفاً اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.' : ((err && err.message) || fallback);
}
function hasCharityContent(c) {
  return !!(c && (c.text || c.image_url || c.video_url || c.gateway_url || (c.cards || []).length || (c.media_items || []).length));
}
function applyFoodItemsVisibility(items) {
  const block = document.getElementById('charity-food-block');
  if (block) block.classList.toggle('hidden', !(Array.isArray(items) && items.length > 0));
}
async function prefetchCharityMediaForOffline(c) {
  if (!window.caches || !c) return;
  const urls = [];
  if (c.image_url) urls.push(c.image_url);
  (c.media_items || []).forEach((it) => { if (it && it.url && it.type !== 'video') urls.push(it.url); });
  const unique = Array.from(new Set(urls.map((u) => { try { return new URL(u, location.href).href; } catch (e) { return ''; } }).filter(Boolean))).slice(0, 40);
  try {
    const cache = await caches.open(CHARITY_MEDIA_CACHE_NAME);
    // تصاویری که دیگر در صفحه نیستند از کش حذف شوند تا حافظه بی‌جهت پر نشود
    const existing = await cache.keys();
    await Promise.all(existing.filter((r) => unique.indexOf(r.url) === -1 && (window.__socialIconUrls || []).indexOf(r.url) === -1).map((r) => cache.delete(r)));
    for (const u of unique) {
      if (await cache.match(u)) continue;
      try {
        let res;
        try {
          res = await fetch(u, { mode: 'cors' });
          if (!res.ok) throw new Error('bad');
        } catch (e1) {
          res = await fetch(u, { mode: 'no-cors' }); // سرور هدر CORS نداد؛ پاسخ مبهم هم برای نمایش تصویر کافی است
        }
        if (res && (res.ok || res.type === 'opaque')) await cache.put(u, res);
      } catch (e2) { /* این تصویر ذخیره نشد؛ بقیه ادامه پیدا کنند */ }
    }
  } catch (e) { /* کش در دسترس نبود */ }
}
let charityRefreshing = null;
function loadCharitySettings() {
  const tile = document.getElementById('charity-tile');
  if (tile) tile.classList.remove('hidden'); // همیشه فعال است، حتی آفلاین
  // ۱) فوراً از نسخهٔ ذخیره‌شدهٔ گوشی (بدون منتظر ماندن برای شبکه)
  const cachedCharity = charityReadCache(CHARITY_CACHE_KEY);
  if (cachedCharity && !window.__charityData) window.__charityData = cachedCharity;
  applyFoodItemsVisibility(charityReadCache(FOOD_ITEMS_CACHE_KEY));
  if (currentTab === 'charity') renderCharityPage();
  if (currentTab === 'zakat-calc') renderZakatCharityCards();
  // ۲) تازه‌سازی از سایت (اگر اینترنت باشد)
  if (charityRefreshing) return charityRefreshing;
  charityRefreshing = (async () => {
    try {
      const foodItems = await charityFetchWithTimeout('/food-items');
      charityWriteCache(FOOD_ITEMS_CACHE_KEY, foodItems);
      applyFoodItemsVisibility(foodItems);
    } catch (e) { /* آفلاین: همان نسخهٔ ذخیره‌شده می‌ماند */ }
    try {
      const c = await charityFetchWithTimeout('/charity');
      window.__charityData = c;
      charityWriteCache(CHARITY_CACHE_KEY, c);
      prefetchCharityMediaForOffline(c);
    } catch (e) { /* آفلاین: همان نسخهٔ ذخیره‌شده می‌ماند */ }
    // فقط اگر محتوا واقعاً تغییر کرده، صفحه دوباره ساخته شود (تا پخش ویدیو یا اسکرول کاربر به‌هم نخورد)
    if (currentTab === 'charity' && window.__charityRenderedSig !== JSON.stringify(window.__charityData || null)) renderCharityPage();
    if (currentTab === 'zakat-calc') renderZakatCharityCards();
  })().then(() => { charityRefreshing = null; }, () => { charityRefreshing = null; });
  return charityRefreshing;
}
// نمایش شمارهٔ کارت خیرین (هم در صفحهٔ «خیرین» و هم زیر ماشین‌حساب زکات؛ ظاهر یکسان)
function charityCardNumberHtml(card2, i) {
  return `<div class="charity-card-number">
      <span>${card2.label || 'کارت ' + toPersianDigits(i + 1)}<br><strong>${card2.number}</strong></span>
      <button class="copy-btn" data-copy="${card2.number}">کپی</button>
    </div>`;
}
function bindCharityCopyButtons(root) {
  root.querySelectorAll('.copy-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      navigator.clipboard?.writeText(btn.dataset.copy).then(() => { btn.textContent = 'کپی شد'; setTimeout(() => { btn.textContent = 'کپی'; }, 1500); });
    });
  });
}
// کارت‌های خیرین زیر ماشین‌حساب زکات (از همان دادهٔ صفحهٔ خیرین؛ آفلاین هم از نسخهٔ ذخیره‌شده)
function renderZakatCharityCards() {
  const wrap = document.getElementById('zakat-charity');
  const list = document.getElementById('zakat-charity-list');
  if (!wrap || !list) return;
  const cached = window.__charityData || charityReadCache(CHARITY_CACHE_KEY);
  const cards = (cached && Array.isArray(cached.cards)) ? cached.cards.filter((x) => x && x.number) : [];
  if (!cards.length) { wrap.hidden = true; list.innerHTML = ''; return; }
  list.innerHTML = cards.map((c2, i) => charityCardNumberHtml(c2, i)).join('');
  bindCharityCopyButtons(list);
  wrap.hidden = false;
}
function renderCharityPage() {
  const c = window.__charityData || {};
  const el = document.getElementById('charity-content');
  window.__charityRenderedSig = JSON.stringify(window.__charityData || null);
  el.innerHTML = '';
  if (!hasCharityContent(c)) {
    const empty = document.createElement('p');
    empty.className = 'note-empty';
    empty.textContent = window.__charityData
      ? 'فعلاً موردی برای نمایش ثبت نشده است.'
      : 'اطلاعات این بخش هنوز دریافت نشده است. یک‌بار با اینترنت وارد این صفحه شوید؛ از آن پس بدون اینترنت هم نمایش داده می‌شود.';
    el.appendChild(empty);
    return;
  }
  const card = document.createElement('div');
  card.className = 'charity-card';
  let html = '';
  if (c.image_url || c.video_url) {
    html += `<div class="charity-main-media">`;
    if (c.image_url) html += `<img src="${c.image_url}" class="charity-main-media-el">`;
    if (c.video_url) html += `<video id="charity-video-el" src="${c.video_url}" controls class="charity-main-media-el"></video>`;
    html += `</div>`;
  }
  if (c.text) html += `<p class="muted-text" style="margin-bottom:14px">${c.text}</p>`;
  (c.cards || []).forEach((card2, i) => { html += charityCardNumberHtml(card2, i); });
  if ((c.media_items || []).length) {
    const cols = parseInt(c.media_columns, 10) || 2;
    html += `<div class="charity-media-grid" style="grid-template-columns:repeat(${cols},1fr)">`;
    (c.media_items || []).forEach((item, i) => {
      html += `<div class="charity-media-item">`;
      if (item.type === 'video') {
        html += `<video src="${item.url}" controls class="charity-media-el" data-media-index="${i}"></video>`;
      } else if (item.url) {
        html += `<img src="${item.url}" class="charity-media-el" loading="lazy">`;
      }
      if (item.caption) html += `<div class="charity-media-caption">${item.caption}</div>`;
      html += `</div>`;
    });
    html += `</div>`;
  }
  if (c.gateway_url) html += `<button id="charity-gateway-btn" class="secondary-btn" style="width:100%;margin-top:10px">💳 پرداخت آنلاین</button>`;
  card.innerHTML = html;
  el.appendChild(card);

  bindCharityCopyButtons(el);
  const gatewayBtn = document.getElementById('charity-gateway-btn');
  if (gatewayBtn) {
    gatewayBtn.addEventListener('click', () => {
      trackClick('charity_gateway');
      window.open(c.gateway_url, '_blank');
    });
  }
  const charityVideoEl = document.getElementById('charity-video-el');
  if (charityVideoEl) charityVideoEl.addEventListener('play', () => trackClick('charity_video'), { once: true });
  el.querySelectorAll('.charity-media-grid video.charity-media-el').forEach((v) => {
    v.addEventListener('play', () => trackClick('charity_video'), { once: true });
  });
  // ویدیو ذخیرهٔ آفلاین ندارد؛ اگر بدون اینترنت باز نشد، به‌جای کادر خالی یک توضیح کوتاه نشان بده
  el.querySelectorAll('video').forEach((v) => {
    v.addEventListener('error', () => {
      if (v.dataset.errNoted) return;
      v.dataset.errNoted = '1';
      const note = document.createElement('p');
      note.className = 'muted-text small';
      note.style.textAlign = 'center';
      note.textContent = 'پخش این ویدیو به اینترنت نیاز دارد.';
      v.insertAdjacentElement('afterend', note);
    });
  });
  // تصویری که نه در کش بود و نه با اینترنت گرفته شد، کادر خراب نشان ندهد
  el.querySelectorAll('img').forEach((img) => {
    img.addEventListener('error', () => { img.style.display = 'none'; });
  });
}
document.querySelector('[data-goto="ramadan-countdown"]').addEventListener('click', loadRamadanPage);
document.querySelector('[data-goto="charity"]').addEventListener('click', () => {
  renderCharityPage(); // فوری، از نسخهٔ موجود/ذخیره‌شده
  if (navigator.onLine) loadCharitySettings(); // اگر اینترنت هست، تازه‌ترین اطلاعات را هم بگیر
});

/* ---------- اقلام غذایی: ورود سوپرمارکت با کد و تیک‌زدن اقلام اهدایی ---------- */
(function () {
  const codeStep    = document.getElementById('charity-food-code-step');
  const itemsStep   = document.getElementById('charity-food-items-step');
  const codeInput   = document.getElementById('charity-food-code-input');
  const codeError   = document.getElementById('charity-food-code-error');
  const itemsList   = document.getElementById('charity-food-items-list');
  const smNameEl    = document.getElementById('charity-food-sm-name');
  const saveMsg     = document.getElementById('charity-food-save-msg');
  if (!codeStep) return;

  let currentCode = '';

  function showCodeError(msg) {
    codeError.textContent = msg;
    codeError.classList.remove('hidden');
  }

  function loadSupermarketStatus(code) {
    codeError.classList.add('hidden');
    apiFetch('/charity-food/status?code=' + encodeURIComponent(code))
      .then((res) => {
        currentCode = code;
        smNameEl.textContent = res.supermarket_name;
        itemsList.innerHTML = '';
        (res.items || []).forEach((it) => {
          const row = document.createElement('div');
          row.className = 'charity-food-item-row';

          const label = document.createElement('label');
          label.style.display = 'flex';
          label.style.alignItems = 'center';
          label.style.gap = '10px';
          label.style.flex = '1';
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.value = it.id;
          cb.checked = !!it.checked;
          const span = document.createElement('span');
          span.className = 'charity-food-item-label';
          span.textContent = (it.icon ? it.icon + ' ' : '') + it.name;
          label.appendChild(cb);
          label.appendChild(span);
          row.appendChild(label);

          if (it.unit) {
            const qtyWrap = document.createElement('div');
            qtyWrap.className = 'charity-food-item-qty-wrap';

            const minusBtn = document.createElement('button');
            minusBtn.type = 'button';
            minusBtn.className = 'charity-food-item-qty-btn';
            minusBtn.textContent = '−';

            const qtyInput = document.createElement('input');
            qtyInput.type = 'number';
            qtyInput.min = '1';
            qtyInput.step = '1';
            qtyInput.inputMode = 'decimal';
            qtyInput.className = 'charity-food-item-qty-input';
            qtyInput.dataset.itemId = it.id;
            qtyInput.value = it.quantity ? it.quantity : '1';

            const plusBtn = document.createElement('button');
            plusBtn.type = 'button';
            plusBtn.className = 'charity-food-item-qty-btn';
            plusBtn.textContent = '+';

            const qtyUnit = document.createElement('span');
            qtyUnit.className = 'charity-food-item-qty-unit';
            qtyUnit.textContent = it.unit;

            function setQtyDisabled(disabled) {
              qtyInput.disabled = disabled;
              minusBtn.disabled = disabled;
              plusBtn.disabled = disabled;
            }
            setQtyDisabled(!cb.checked);

            minusBtn.addEventListener('click', () => {
              const val = Math.max(1, (parseFloat(qtyInput.value) || 1) - 1);
              qtyInput.value = val;
            });
            plusBtn.addEventListener('click', () => {
              const val = (parseFloat(qtyInput.value) || 0) + 1;
              qtyInput.value = val;
            });
            cb.addEventListener('change', () => {
              setQtyDisabled(!cb.checked);
              if (cb.checked && !qtyInput.value) qtyInput.value = '1';
            });

            qtyWrap.appendChild(minusBtn);
            qtyWrap.appendChild(qtyInput);
            qtyWrap.appendChild(plusBtn);
            qtyWrap.appendChild(qtyUnit);
            row.appendChild(qtyWrap);
          }

          itemsList.appendChild(row);
        });
        codeStep.classList.add('hidden');
        itemsStep.classList.remove('hidden');
        saveMsg.classList.add('hidden');
      })
      .catch((err) => showCodeError(charityNetworkMessage(err, 'کد وارد شده معتبر نیست.')));
  }

  document.getElementById('charity-food-code-submit').addEventListener('click', () => {
    const code = (codeInput.value || '').trim().toUpperCase();
    if (!code) { showCodeError('لطفاً کد را وارد کنید.'); return; }
    loadSupermarketStatus(code);
  });
  codeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('charity-food-code-submit').click();
  });

  document.getElementById('charity-food-save-btn').addEventListener('click', () => {
    const checkedBoxes = Array.from(itemsList.querySelectorAll('input[type=checkbox]:checked'));

    let missingQty = false;
    const selections = checkedBoxes.map((cb) => {
      const qtyInput = itemsList.querySelector('.charity-food-item-qty-input[data-item-id="' + cb.value + '"]');
      const qty = qtyInput ? parseFloat(qtyInput.value) : null;
      if (qtyInput && (!qty || qty <= 0)) missingQty = true;
      return { id: parseInt(cb.value, 10), quantity: qty || null };
    });

    if (missingQty) {
      saveMsg.classList.remove('hidden');
      saveMsg.style.color = 'var(--danger)';
      saveMsg.textContent = 'لطفاً برای اقلامی که تیک زده‌اید، مقدار را وارد کنید.';
      return;
    }

    apiFetch('/charity-food/save', { method: 'POST', body: JSON.stringify({ code: currentCode, selections }) })
      .then((res) => {
        saveMsg.classList.add('hidden');
        const thanksMsg = (res && res.thanks_message) ? res.thanks_message : 'انتخاب‌های شما با موفقیت ذخیره شد. سپاس از همراهی شما 🙏';
        document.getElementById('charity-food-thanks-message').textContent = thanksMsg;
        document.getElementById('charity-food-thanks-modal').classList.remove('hidden');
      })
      .catch((err) => {
        saveMsg.classList.remove('hidden');
        saveMsg.style.color = 'var(--danger)';
        saveMsg.textContent = charityNetworkMessage(err, 'خطا در ذخیره‌سازی. دوباره تلاش کنید.');
      });
  });

  document.getElementById('charity-food-thanks-ok').addEventListener('click', () => {
    document.getElementById('charity-food-thanks-modal').classList.add('hidden');
  });

  document.getElementById('charity-food-exit-btn').addEventListener('click', () => {
    currentCode = '';
    codeInput.value = '';
    itemsStep.classList.add('hidden');
    codeStep.classList.remove('hidden');
  });
})();

/* ---------- اخبار ---------- */
let newsCache = [];
async function loadNewsList() {
  const el = document.getElementById('news-list-content');
  el.innerHTML = '<p class="muted-text small">در حال بارگذاری...</p>';
  try {
    newsCache = await apiFetch('/news');
    el.innerHTML = '';
    if (!newsCache.length) { el.innerHTML = '<p class="note-empty">فعلاً خبری ثبت نشده است.</p>'; return; }
    newsCache.forEach((n, i) => {
      const card = document.createElement('div');
      card.className = 'news-card';
      card.innerHTML = `${n.image ? `<img src="${n.image}">` : ''}<h4>${n.title}</h4><p class="muted-text small">${n.excerpt}</p><span class="news-date">${n.date}</span>`;
      card.addEventListener('click', () => openNewsDetail(i));
      el.appendChild(card);
    });
  } catch (e) { el.innerHTML = '<p class="note-empty">در حال حاضر امکان دریافت اخبار نیست.</p>'; }
}
function openNewsDetail(index) {
  const n = newsCache[index];
  if (!n) return;
  document.getElementById('news-detail-title').textContent = n.title;
  document.getElementById('news-detail-content').innerHTML =
    (n.image ? `<img src="${n.image}" style="width:100%;border-radius:10px;margin-bottom:12px">` : '') +
    `<div class="muted-text">${n.content}</div>`;
  switchToTab('news-detail', { push: true });
}

/* ---------- فضای مجازی ---------- */
// هر لینک: { label, url, icon? }. لوگو را مدیر از پیشخوان سایت (فضای مجازی) آپلود می‌کند.
// فهرست در گوشی ذخیره می‌شود تا بدون اینترنت هم کارت‌ها دیده شوند؛ تصویر لوگوها هم در
// همان کش تصاویرِ آفلاین می‌رود (و از پاک‌سازی کش «کمک‌های مردمی» مستثنا است).
const SOCIAL_CACHE_KEY = 'arefanejam_social_cache';
window.__socialIconUrls = [];
const SOCIAL_BRANDS = [
  { re: /instagram|اینستا/i, bg: 'linear-gradient(135deg,#F9CE34,#EE2A7B 50%,#6228D7)', glyph: '📷' },
  { re: /telegram|t\.me|تلگرام/i, bg: 'linear-gradient(135deg,#37AEE2,#1E96C8)', glyph: '✈️' },
  { re: /rubika|روبیکا/i, bg: 'linear-gradient(135deg,#B43EF0,#6A1FC2)', glyph: '💬' },
  { re: /aparat|آپارات/i, bg: 'linear-gradient(135deg,#F0245E,#C2104A)', glyph: '▶️' },
  { re: /youtube|youtu\.be|یوتیوب/i, bg: 'linear-gradient(135deg,#FF4B4B,#CC0000)', glyph: '▶️' },
  { re: /twitter|x\.com|توییتر/i, bg: 'linear-gradient(135deg,#2B2B2B,#000)', glyph: '✖️' },
  { re: /facebook|fb\.com|فیسبوک/i, bg: 'linear-gradient(135deg,#3B8BFF,#1459C9)', glyph: '👍' },
  { re: /eitaa|ایتا/i, bg: 'linear-gradient(135deg,#F79A42,#E2601A)', glyph: '💬' },
  { re: /bale|بله/i, bg: 'linear-gradient(135deg,#3CC5A8,#1C8F7A)', glyph: '💬' },
  { re: /whatsapp|واتساپ|واتس/i, bg: 'linear-gradient(135deg,#3EE07C,#18A34A)', glyph: '📞' },
  { re: /آپارات|سایت|site|www\.|\.com|\.ir/i, bg: 'linear-gradient(135deg,#1A6E78,#0B3440)', glyph: '🌐' },
];
function socialBrandFor(l) {
  const hay = (l.label || '') + ' ' + (l.url || '');
  for (const b of SOCIAL_BRANDS) if (b.re.test(hay)) return b;
  return { bg: 'linear-gradient(135deg,#C9A45A,#8A6C36)', glyph: (l.label || '•').trim().charAt(0) };
}
function socialHost(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
}
function renderSocialLinks(links) {
  const el = document.getElementById('social-links-content');
  if (!el) return;
  el.innerHTML = '';
  if (!Array.isArray(links) || !links.length) { el.innerHTML = '<p class="note-empty">لینکی ثبت نشده است.</p>'; return; }
  const grid = document.createElement('div');
  grid.className = 'social-grid';
  links.forEach((l, i) => {
    const a = document.createElement('a');
    a.href = l.url; a.target = '_blank'; a.rel = 'noopener';
    a.className = 'social-card';
    const brand = socialBrandFor(l);
    const logo = document.createElement('span');
    logo.className = 'social-logo';
    const fallback = () => {
      logo.classList.remove('has-img');
      logo.style.background = brand.bg;
      logo.innerHTML = '';
      const g = document.createElement('span');
      g.className = 'social-glyph';
      g.textContent = brand.glyph;
      logo.appendChild(g);
    };
    if (l.icon) {
      logo.classList.add('has-img');
      const img = document.createElement('img');
      img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
      img.addEventListener('error', fallback);
      img.src = l.icon;
      logo.appendChild(img);
    } else {
      fallback();
    }
    const name = document.createElement('span');
    name.className = 'social-name';
    name.textContent = l.label;
    const host = document.createElement('span');
    host.className = 'social-host';
    host.textContent = socialHost(l.url);
    a.appendChild(logo); a.appendChild(name); a.appendChild(host);
    a.addEventListener('click', () => trackClick('social_link_' + i));
    grid.appendChild(a);
  });
  el.appendChild(grid);
}
async function prefetchSocialIconsForOffline(links) {
  if (!window.caches || !Array.isArray(links)) return;
  const urls = Array.from(new Set(links.map((l) => l && l.icon).filter(Boolean).map((u) => { try { return new URL(u, location.href).href; } catch (e) { return ''; } }).filter(Boolean))).slice(0, 30);
  window.__socialIconUrls = urls;
  try {
    const cache = await caches.open(CHARITY_MEDIA_CACHE_NAME);
    for (const u of urls) {
      if (await cache.match(u)) continue;
      try {
        let res;
        try { res = await fetch(u, { mode: 'cors' }); if (!res.ok) throw new Error('bad'); }
        catch (e1) { res = await fetch(u, { mode: 'no-cors' }); }
        if (res && (res.ok || res.type === 'opaque')) await cache.put(u, res);
      } catch (e2) { /* این لوگو ذخیره نشد؛ بقیه ادامه پیدا کنند */ }
    }
  } catch (e) { /* کش در دسترس نبود */ }
}
async function loadSocialLinks() {
  const el = document.getElementById('social-links-content');
  // ۱) فوراً از نسخهٔ ذخیره‌شده (آفلاین هم کار می‌کند)
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(SOCIAL_CACHE_KEY) || 'null'); } catch (e) {}
  if (Array.isArray(cached) && cached.length) {
    window.__socialIconUrls = cached.map((l) => l && l.icon).filter(Boolean);
    renderSocialLinks(cached);
  } else {
    el.innerHTML = '<p class="muted-text small">در حال بارگذاری...</p>';
  }
  // ۲) تازه‌سازی از سایت
  try {
    const links = await apiFetch('/social-links');
    if (!Array.isArray(links)) throw new Error('bad');
    const sig = JSON.stringify(links);
    if (!cached || JSON.stringify(cached) !== sig) renderSocialLinks(links);
    try { localStorage.setItem(SOCIAL_CACHE_KEY, sig); } catch (e) {}
    prefetchSocialIconsForOffline(links);
  } catch (e) {
    if (!(Array.isArray(cached) && cached.length)) el.innerHTML = '<p class="note-empty">در حال حاضر در دسترس نیست.</p>';
  }
}

/* ---------- گالری فرهنگی: حالت، کش تصاویر و صف بارگذاری ---------- */
const galleryState = { items: [], icon: '', current: 0, cache: null };

function galleryCacheOpen() {
  if (!('caches' in window)) return Promise.resolve(null);
  if (!galleryState.cache) galleryState.cache = caches.open('arefanejam-gallery-v1').catch(() => null);
  return galleryState.cache;
}

// یک‌بار عکس را می‌گیرد؛ اگر قبلاً در حافظهٔ مرورگر/گوشی ذخیره شده باشد از همان‌جا می‌خواند
// تا دفعات بعد نیازی به دانلود مجدد نباشد.
async function galleryLoadImage(url) {
  if (!url) return url;
  try {
    const cache = await galleryCacheOpen();
    if (cache) {
      let resp = await cache.match(url);
      if (!resp) {
        resp = await fetch(url, { credentials: 'omit' });
        if (resp && resp.ok) { try { await cache.put(url, resp.clone()); } catch (e) {} }
      }
      if (resp && resp.ok) return URL.createObjectURL(await resp.blob());
    }
  } catch (e) {}
  return url; // در صورت هر مشکلی، بارگذاری مستقیم آدرس اصلی
}

// صف بارگذاری با محدودیت هم‌زمانی: به‌جای باز کردن هم‌زمان همهٔ عکس‌ها،
// چند تای محدود هم‌زمان و بقیه به‌ترتیب («دونه‌دونه») بارگذاری می‌شوند تا سرعت کلی بالاتر برود.
function createGalleryQueue(concurrency) {
  let active = 0;
  const queue = [];
  function runNext() {
    if (active >= concurrency || !queue.length) return;
    active++;
    const job = queue.shift();
    job.task().then(job.resolve, job.reject).finally(() => { active--; runNext(); });
  }
  return function enqueue(task) {
    return new Promise((resolve, reject) => { queue.push({ task, resolve, reject }); runNext(); });
  };
}
const galleryQueue = createGalleryQueue(3);

function galleryGuessExt(url) {
  const m = (url || '').split('?')[0].match(/\.[a-zA-Z0-9]{2,4}$/);
  return m ? m[0] : '.jpg';
}

async function downloadGalleryImage(url, idx) {
  if (!url) return;
  try {
    const cache = await galleryCacheOpen();
    let blob = null;
    if (cache) {
      let resp = await cache.match(url);
      if (!resp) resp = await fetch(url, { credentials: 'omit' });
      if (resp && resp.ok) { try { await cache.put(url, resp.clone()); } catch (e) {} blob = await resp.blob(); }
    }
    if (!blob) { const r = await fetch(url); blob = await r.blob(); }
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = 'arefanejam-gallery-' + (idx + 1) + galleryGuessExt(url);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
  } catch (e) {
    // در صورت بروز محدودیت (مثلاً CORS با دامنهٔ دیگر)، حداقل عکس در تب جدید باز شود
    window.open(url, '_blank');
  }
}

/* ---------- گالری فرهنگی: نمایش گرید و بارگذاری تنبل/تدریجی ---------- */
function galleryObserveThumb(wrap, imgEl, url) {
  const start = () => {
    galleryQueue(() => galleryLoadImage(url)).then((src) => {
      imgEl.addEventListener('load', () => imgEl.classList.add('loaded'), { once: true });
      imgEl.src = src;
    });
  };
  const contentEl = document.getElementById('content');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => { if (entry.isIntersecting) { io.unobserve(wrap); start(); } });
    }, { root: contentEl, rootMargin: '300px 0px' });
    io.observe(wrap);
  } else {
    start();
  }
}

async function loadGallery() {
  const el = document.getElementById('gallery-content');
  el.innerHTML = '<p class="muted-text small">در حال بارگذاری...</p>';
  try {
    const data = await apiFetch('/gallery');
    const items = Array.isArray(data) ? data.map((u) => ({ thumb: u, full: u })) : (data.items || []);
    galleryState.items = items;
    galleryState.icon = (data && data.icon) || '';
    el.innerHTML = '';
    if (!items.length) { el.innerHTML = '<p class="note-empty">عکسی ثبت نشده است.</p>'; return; }

    const lightboxIcon = document.getElementById('gallery-lightbox-download-icon');
    if (lightboxIcon) {
      if (galleryState.icon) lightboxIcon.src = galleryState.icon;
      else lightboxIcon.removeAttribute('src');
    }

    items.forEach((item, idx) => {
      const cell = document.createElement('div');
      cell.className = 'gallery-item';

      const thumbWrap = document.createElement('div');
      thumbWrap.className = 'gallery-item-thumb-wrap';
      const img = document.createElement('img');
      img.alt = 'عکس فعالیت فرهنگی';
      img.draggable = false;
      const spinner = document.createElement('div');
      spinner.className = 'gallery-thumb-spinner';
      thumbWrap.appendChild(img);
      thumbWrap.appendChild(spinner);
      thumbWrap.addEventListener('click', () => openGalleryLightbox(idx));

      const dlBtn = document.createElement('button');
      dlBtn.type = 'button';
      dlBtn.className = 'gallery-item-download-btn';
      dlBtn.innerHTML = (galleryState.icon ? '<img class="gallery-download-icon" src="' + galleryState.icon + '" alt="">' : '') + '<span>دانلود</span>';
      dlBtn.addEventListener('click', (e) => { e.stopPropagation(); downloadGalleryImage(item.full, idx); });

      cell.appendChild(thumbWrap);
      cell.appendChild(dlBtn);
      el.appendChild(cell);

      galleryObserveThumb(thumbWrap, img, item.thumb);
    });
  } catch (e) { el.innerHTML = '<p class="note-empty">در حال حاضر در دسترس نیست.</p>'; }
}
// جلوگیری از باز شدن منوی راست‌کلیک/نگه‌داشتن انگشت روی عکس‌های گالری (برای جلوگیری از ذخیرهٔ مستقیم عکس)
document.getElementById('gallery-content')?.addEventListener('contextmenu', (e) => e.preventDefault());

/* ---------- گالری فرهنگی: نمایش تمام‌صفحه (لایت‌باکس) با زوم و اسلاید ---------- */
const galleryLightbox = {};
function initGalleryLightboxOnce() {
  if (galleryLightbox.ready) return;
  galleryLightbox.root = document.getElementById('gallery-lightbox');
  galleryLightbox.stage = document.getElementById('gallery-lightbox-stage');
  galleryLightbox.counter = document.getElementById('gallery-lightbox-counter');
  galleryLightbox.backBtn = document.getElementById('gallery-lightbox-back');
  galleryLightbox.downloadBtn = document.getElementById('gallery-lightbox-download');
  if (!galleryLightbox.root) return;

  galleryLightbox.backBtn.addEventListener('click', closeGalleryLightbox);
  galleryLightbox.downloadBtn.addEventListener('click', () => {
    const item = galleryState.items[galleryState.current];
    if (item) downloadGalleryImage(item.full, galleryState.current);
  });
  galleryLightbox.root.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('keydown', (e) => {
    if (galleryLightbox.root.classList.contains('hidden')) return;
    const rtl = document.documentElement.dir === 'rtl';
    if (e.key === 'Escape') closeGalleryLightbox();
    if (e.key === 'ArrowLeft') goToGallerySlide(galleryState.current + (rtl ? -1 : 1));
    if (e.key === 'ArrowRight') goToGallerySlide(galleryState.current + (rtl ? 1 : -1));
  });
  galleryLightbox.ready = true;
}

function openGalleryLightbox(index) {
  initGalleryLightboxOnce();
  if (!galleryLightbox.root) return;
  galleryState.current = index;
  galleryLightbox.root.classList.remove('hidden');
  renderGallerySlide();
}
function closeGalleryLightbox() {
  if (!galleryLightbox.root) return;
  galleryLightbox.root.classList.add('hidden');
  galleryLightbox.stage.innerHTML = '';
}
function goToGallerySlide(newIndex) {
  if (newIndex < 0 || newIndex >= galleryState.items.length) return;
  galleryState.current = newIndex;
  renderGallerySlide();
}

async function renderGallerySlide() {
  const item = galleryState.items[galleryState.current];
  if (!item) return;
  galleryLightbox.counter.textContent = (galleryState.current + 1) + ' / ' + galleryState.items.length;
  galleryLightbox.stage.innerHTML = '<div class="gallery-thumb-spinner" style="position:absolute;inset:0"></div>';

  const src = await galleryQueue(() => galleryLoadImage(item.full));
  // اگر کاربر سریع اسلاید را عوض کرده باشد، این نتیجهٔ قدیمی نادیده گرفته شود
  if (galleryState.items[galleryState.current] !== item) return;

  const slide = document.createElement('div');
  slide.className = 'gallery-lightbox-slide';
  const img = document.createElement('img');
  img.src = src;
  img.draggable = false;
  img.addEventListener('contextmenu', (e) => e.preventDefault());
  slide.appendChild(img);
  galleryLightbox.stage.innerHTML = '';
  galleryLightbox.stage.appendChild(slide);

  attachGalleryGestures(slide, img);

  // پیش‌بارگذاری عکس بعدی و قبلی تا رد کردن اسلایدی سریع‌تر باشد
  const next = galleryState.items[galleryState.current + 1];
  const prev = galleryState.items[galleryState.current - 1];
  if (next) galleryQueue(() => galleryLoadImage(next.full));
  if (prev) galleryQueue(() => galleryLoadImage(prev.full));
}

function attachGalleryGestures(slide, img) {
  let scale = 1, translateX = 0, translateY = 0;
  let startDist = 0, startScale = 1;
  const pointers = new Map();
  let dragging = false, dragStartX = 0, dragStartY = 0, dragStartTX = 0, dragStartTY = 0;
  let swipeStartX = null, swipeDeltaX = 0;
  let lastTapTime = 0;

  function applyTransform() { img.style.transform = 'translate(' + translateX + 'px,' + translateY + 'px) scale(' + scale + ')'; }
  function clampPan() {
    const maxX = (slide.clientWidth * (scale - 1)) / 2 + 40;
    const maxY = (slide.clientHeight * (scale - 1)) / 2 + 40;
    translateX = Math.max(-maxX, Math.min(maxX, translateX));
    translateY = Math.max(-maxY, Math.min(maxY, translateY));
  }
  function resetZoom() { scale = 1; translateX = 0; translateY = 0; applyTransform(); }
  function toggleZoom() { if (scale > 1) resetZoom(); else { scale = 2.2; applyTransform(); } }

  slide.addEventListener('pointerdown', (e) => {
    slide.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      dragging = true;
      dragStartX = e.clientX; dragStartY = e.clientY;
      dragStartTX = translateX; dragStartTY = translateY;
      swipeStartX = (scale === 1) ? e.clientX : null;
      swipeDeltaX = 0;
    } else if (pointers.size === 2) {
      const pts = Array.from(pointers.values());
      startDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      startScale = scale;
      swipeStartX = null;
    }
  });

  slide.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const pts = Array.from(pointers.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (startDist > 0) {
        scale = Math.max(1, Math.min(4, startScale * (dist / startDist)));
        clampPan();
        applyTransform();
      }
    } else if (pointers.size === 1 && dragging) {
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      if (scale > 1) {
        translateX = dragStartTX + dx;
        translateY = dragStartTY + dy;
        clampPan();
        applyTransform();
      } else if (swipeStartX !== null) {
        swipeDeltaX = e.clientX - swipeStartX;
        slide.style.transform = 'translateX(' + swipeDeltaX + 'px)';
        slide.style.opacity = String(Math.max(0.4, 1 - Math.abs(swipeDeltaX) / 400));
      }
    }
  });

  function endPointer(e) {
    pointers.delete(e.pointerId);
    if (pointers.size === 0) {
      dragging = false;
      if (scale === 1 && swipeStartX !== null) {
        slide.style.transition = 'transform .2s ease, opacity .2s ease';
        if (Math.abs(swipeDeltaX) > 80) {
          const rtl = document.documentElement.dir === 'rtl';
          const dir = swipeDeltaX < 0 ? 1 : -1;
          const targetIndex = galleryState.current + (rtl ? -dir : dir);
          if (targetIndex >= 0 && targetIndex < galleryState.items.length) {
            slide.style.transform = 'translateX(' + (swipeDeltaX < 0 ? '-100%' : '100%') + ')';
            slide.style.opacity = '0';
            setTimeout(() => goToGallerySlide(targetIndex), 180);
          } else {
            slide.style.transform = 'translateX(0)'; slide.style.opacity = '1';
          }
        } else {
          slide.style.transform = 'translateX(0)'; slide.style.opacity = '1';
        }
        swipeStartX = null; swipeDeltaX = 0;
      }
      const now = Date.now();
      if (now - lastTapTime < 300) toggleZoom();
      lastTapTime = now;
    }
  }
  slide.addEventListener('pointerup', endPointer);
  slide.addEventListener('pointercancel', endPointer);
  slide.addEventListener('dblclick', toggleZoom);
}

/* ---------- کتاب‌ها ---------- */
async function loadBooks() {
  const el = document.getElementById('books-content');
  el.innerHTML = '<p class="muted-text small" style="padding:0 18px">در حال بارگذاری...</p>';
  try {
    const books = await apiFetch('/books');
    el.innerHTML = '';
    if (!books.length) { el.innerHTML = '<p class="note-empty">کتابی ثبت نشده است.</p>'; return; }
    books.forEach((b) => {
      const card = document.createElement('div');
      card.className = 'book-card';
      card.innerHTML = `
        ${b.image_url ? `<img src="${b.image_url}">` : ''}
        <div class="book-card-info">
          <h4>${b.title}</h4>
          <p class="muted-text small">${b.description || ''}</p>
          ${b.price ? `<p class="book-card-price">${b.price}</p>` : ''}
          ${b.video_url ? `<video src="${b.video_url}" controls style="width:100%;border-radius:8px;margin:6px 0"></video>` : ''}
          ${b.purchase_link ? `<button class="secondary-btn small-btn book-buy-btn" data-link="${b.purchase_link}" data-id="${b.id}">خرید کتاب</button>` : ''}
        </div>`;
      el.appendChild(card);
    });
    el.querySelectorAll('.book-buy-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        trackClick('book_purchase_' + btn.dataset.id);
        window.open(btn.dataset.link, '_blank');
      });
    });
  } catch (e) { el.innerHTML = '<p class="note-empty">در حال حاضر در دسترس نیست.</p>'; }
}

/* ---------- سوالات شرعی ---------- */
const shariqState = { categories: [], activeCategory: null, list: [] };

function shariqIconMarkup(s) {
  if (s.nav_icon_image) return `<img src="${secureUrl(s.nav_icon_image)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  return s.nav_icon_emoji || '❓';
}
function applyShariqSettings(s) {
  if (!s || typeof s !== 'object') return;
  document.getElementById('shariq-nav-icon').innerHTML = shariqIconMarkup(s);
  document.getElementById('shariq-nav-label').textContent = s.nav_label || 'سوالات شرعی';
  document.getElementById('shariq-tile-badge').innerHTML = shariqIconMarkup(s);
  document.getElementById('shariq-tile-label').textContent = s.nav_label || 'سوالات شرعی';
  document.getElementById('shariq-page-title').textContent = s.nav_label || 'سوالات شرعی';
}
async function loadShariqSettings() {
  try { await apiSWR('/shariq/settings', applyShariqSettings); } catch (e) { /* ignore */ }
}

/* ---------- دریافت مطمئنِ اطلاعات «سوالات شرعی» ---------- */
function shariqEsc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function shariqText(s) { return shariqEsc(s).replace(/\r?\n/g, '<br>'); }
// درخواست ساده (بدون هدر Content-Type تا نیازی به preflight نباشد) + پارامتر زمان تا هیچ کشی وسط راه جواب قدیمی ندهد
async function shariqGet(path) {
  const sep = path.indexOf('?') === -1 ? '?' : '&';
  const url = state.apiUrl.replace(/\/$/, '') + path + sep + '_t=' + Date.now();
  const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), 20000) : null;
  let res;
  try {
    res = await fetch(url, { method: 'GET', cache: 'no-store', signal: ctrl ? ctrl.signal : undefined });
  } catch (e) {
    const err = new Error('network'); err.code = 'network'; throw err;
  } finally { if (timer) clearTimeout(timer); }
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch (e) {
    // اگر سایت قبل از JSON یک هشدار PHP چاپ کرده باشد، از اولین [ یا { به بعد خوانده می‌شود
    const i = text.search(/[\[{]/);
    if (i > 0) { try { data = JSON.parse(text.slice(i)); } catch (e2) { data = null; } }
  }
  if (!res.ok) { const err = new Error((data && data.message) || ('HTTP ' + res.status)); err.code = 'http_' + res.status; throw err; }
  if (data === null) { const err = new Error('bad_json'); err.code = 'bad_json'; throw err; }
  return data;
}
function shariqAsArray(d) {
  if (Array.isArray(d)) return d;
  if (d && Array.isArray(d.items)) return d.items;
  if (d && d.data && Array.isArray(d.data)) return d.data;
  if (d && typeof d === 'object' && !d.code) {
    const v = Object.values(d);
    if (v.length && v.every((x) => x && typeof x === 'object')) return v;
  }
  return [];
}
function shariqReason(e) {
  const c = (e && e.code) || '';
  if (c === 'network') return 'اتصال به سایت برقرار نشد (اینترنت یا فایروال سایت)';
  if (c === 'bad_json') return 'پاسخ سایت قابل خواندن نبود (خطای PHP یا کش سایت)';
  if (c.indexOf('http_') === 0) return 'سایت خطا برگرداند (' + toPersianDigits(c.slice(5)) + ')';
  return 'خطای ناشناخته';
}
function shariqCacheGet(key) { try { return JSON.parse(localStorage.getItem('arefanejam_shariq_' + key) || 'null'); } catch (e) { return null; } }
function shariqCacheSet(key, val) { try { localStorage.setItem('arefanejam_shariq_' + key, JSON.stringify(val)); } catch (e) {} }
function shariqErrorBox(e, retryId) {
  return '<div class="shariq-empty"><span class="shariq-empty-icon">⚠️</span>در حال حاضر امکان دریافت اطلاعات نیست.'
    + '<br><span class="muted-text small">' + shariqEsc(shariqReason(e)) + '</span>'
    + '<br><button type="button" class="shariq-chip" id="' + retryId + '" style="margin-top:12px">تلاش دوباره</button></div>';
}

async function loadShariqCategories() {
  const row = document.getElementById('shariq-cats-row');
  row.innerHTML = '';
  try {
    shariqState.categories = shariqAsArray(await shariqGet('/shariq/categories'));
    shariqCacheSet('cats', shariqState.categories);
  } catch (e) { shariqState.categories = shariqAsArray(shariqCacheGet('cats')); }

  const allChip = document.createElement('button');
  allChip.className = 'shariq-chip active';
  allChip.textContent = 'همه';
  allChip.style.animationDelay = '0s';
  allChip.addEventListener('click', () => selectShariqCategory(null, allChip));
  row.appendChild(allChip);

  shariqState.categories.forEach((c, i) => {
    const chip = document.createElement('button');
    chip.className = 'shariq-chip';
    chip.style.animationDelay = `${(i + 1) * 0.05}s`;
    chip.textContent = `${c.name} (${toPersianDigits(c.count)})`;
    chip.addEventListener('click', () => selectShariqCategory(c.id, chip));
    row.appendChild(chip);
  });

  shariqState.activeCategory = null;
  loadShariqList(null);
}

function selectShariqCategory(categoryId, chipEl) {
  shariqState.activeCategory = categoryId;
  document.querySelectorAll('#shariq-cats-row .shariq-chip').forEach((c) => c.classList.remove('active'));
  chipEl.classList.add('active');
  loadShariqList(categoryId);
}

async function loadShariqList(categoryId) {
  const el = document.getElementById('shariq-list-content');
  el.innerHTML = '<p class="muted-text small" style="padding:0 18px">در حال بارگذاری...</p>';
  const cacheKey = 'list_' + (categoryId || 'all');
  let fromCache = false;
  try {
    const path = categoryId ? `/shariq/questions?category_id=${categoryId}` : '/shariq/questions';
    shariqState.list = shariqAsArray(await shariqGet(path));
    shariqCacheSet(cacheKey, shariqState.list);
  } catch (e) {
    const cached = shariqAsArray(shariqCacheGet(cacheKey));
    if (!cached.length) {
      el.innerHTML = shariqErrorBox(e, 'shariq-retry-btn');
      const b = document.getElementById('shariq-retry-btn');
      if (b) b.addEventListener('click', () => loadShariqList(categoryId));
      return;
    }
    shariqState.list = cached;
    fromCache = true;
  }
  el.innerHTML = '';
  if (!shariqState.list.length) {
    el.innerHTML = '<div class="shariq-empty"><span class="shariq-empty-icon">🕊️</span>هنوز پاسخی در این بخش ثبت نشده است.</div>';
    return;
  }
  if (fromCache) {
    const note = document.createElement('p');
    note.className = 'muted-text small';
    note.style.padding = '0 18px';
    note.textContent = 'اتصال به سایت برقرار نشد؛ آخرین نسخهٔ ذخیره‌شده نمایش داده می‌شود.';
    el.appendChild(note);
  }
  shariqState.list.forEach((item, i) => {
    const card = document.createElement('div');
    card.className = 'shariq-item';
    card.style.animationDelay = `${Math.min(i, 8) * 0.06}s`;
    card.innerHTML = `
      <button type="button" class="shariq-q">${shariqText(item.question_text)}</button>
      <div class="shariq-a-wrap"><div class="shariq-a">${shariqText(item.answer_text)}</div></div>`;
    const qBtn = card.querySelector('.shariq-q');
    const wrap = card.querySelector('.shariq-a-wrap');
    qBtn.addEventListener('click', () => {
      const opening = !wrap.classList.contains('is-open');
      el.querySelectorAll('.shariq-a-wrap').forEach((w) => w.classList.remove('is-open'));
      el.querySelectorAll('.shariq-q').forEach((q) => q.classList.remove('is-open'));
      if (opening) { wrap.classList.add('is-open'); qBtn.classList.add('is-open'); }
    });
    el.appendChild(card);
  });
}

/* ---------- پرسیدن سوال جدید ---------- */
document.getElementById('shariq-ask-btn').addEventListener('click', () => {
  document.getElementById('shariq-question-input').value = '';
  document.getElementById('shariq-ask-error').classList.add('hidden');
  document.getElementById('shariq-ask-modal').classList.remove('hidden');
});
document.getElementById('shariq-ask-cancel-btn').addEventListener('click', () => {
  document.getElementById('shariq-ask-modal').classList.add('hidden');
});
document.getElementById('shariq-ask-submit-btn').addEventListener('click', async () => {
  const text = document.getElementById('shariq-question-input').value.trim();
  const errEl = document.getElementById('shariq-ask-error');
  if (text.length < 3) {
    errEl.textContent = 'لطفاً سوال خود را کامل‌تر بنویسید.';
    errEl.classList.remove('hidden');
    return;
  }
  try {
    const device_id = await ensureDeviceId();
    await apiFetch('/shariq/ask', { method: 'POST', body: JSON.stringify({ device_id, question_text: text }) });
    document.getElementById('shariq-ask-modal').classList.add('hidden');
    appAlert('shariq_ask_sent');
  } catch (e) {
    errEl.textContent = 'ارسال سوال با خطا مواجه شد. دوباره تلاش کنید.';
    errEl.classList.remove('hidden');
  }
});
document.getElementById('shariq-mine-btn').addEventListener('click', () => switchToTab('shariq-mine', { push: true }));

async function loadShariqMine() {
  const el = document.getElementById('shariq-mine-content');
  el.innerHTML = '<p class="muted-text small" style="padding:0 18px">در حال بارگذاری...</p>';
  try {
    const device_id = await ensureDeviceId();
    const rows = shariqAsArray(await shariqGet('/shariq/mine?device_id=' + encodeURIComponent(device_id)));
    el.innerHTML = '';
    if (!rows.length) {
      el.innerHTML = '<div class="shariq-empty"><span class="shariq-empty-icon">✍️</span>هنوز سوالی نپرسیده‌اید.</div>';
      return;
    }
    rows.forEach((r, i) => {
      const card = document.createElement('div');
      card.className = 'shariq-item shariq-mine-item';
      card.style.animationDelay = `${Math.min(i, 8) * 0.06}s`;
      const statusLabel = r.status === 'answered' ? 'پاسخ داده شده' : 'در انتظار پاسخ';
      card.innerHTML = `
        <div class="shariq-q">${shariqText(r.question_text)}</div>
        <span class="shariq-status ${r.status === 'answered' ? 'is-answered' : 'is-pending'}">${statusLabel}${r.category_name ? ' — ' + shariqEsc(r.category_name) : ''}</span>
        ${r.answer_text ? `<div class="shariq-a">${shariqText(r.answer_text)}</div>` : ''}`;
      el.appendChild(card);
    });
  } catch (e) {
    el.innerHTML = shariqErrorBox(e, 'shariq-mine-retry-btn');
    const b = document.getElementById('shariq-mine-retry-btn');
    if (b) b.addEventListener('click', loadShariqMine);
  }
}

/* ---------- ختم قرآن (تقسیم قرآن به بخش‌ها و برداشتن بخش با تیک) ----------
   بدون نام کاربری و رمز: فقط از «شناسهٔ پنهان دستگاه» (ensureDeviceId) برای تشخیص درخواست‌ها و بخش‌های خودِ کاربر
   استفاده می‌شود. این شناسه هیچ‌جا نمایش داده نمی‌شود و در پاسخ عمومی سایت هم برای دیگران نمی‌آید.
   درخواست‌دهنده «واحد» (جزء/سوره/صفحه/آیه) و «تعداد برای هر نفر» را تعیین می‌کند؛ قرآن به N بخش تقسیم می‌شود. */
const KHATM_NAME_KEY = 'arefanejam_khatm_name';
const KHATM_SEEN_KEY = 'arefanejam_khatm_seen';   // { شناسهٔ درخواست: تعداد بخش‌های برداشته‌شدهٔ دیده‌شده }
const KHATM_HAS_KEY = 'arefanejam_khatm_has';     // '1' یعنی این گوشی حداقل یک درخواست ثبت کرده
const KHATM_TOTALS = { juz: 30, surah: 114, page: 604, ayah: 6236 };
const KHATM_UNIT_FA = { juz: 'جزء', surah: 'سوره', page: 'صفحه', ayah: 'آیه' };
const KHATM_MAX_PORTIONS = 700;
let khatmViewId = 0;
let khatmViewData = null;
let khatmSel = new Set();
let khatmCreateUnit = 'juz';

function khatmAgo(sec) {
  sec = Math.max(0, Number(sec) || 0);
  if (sec < 60) return 'همین الان';
  if (sec < 3600) return toPersianDigits(Math.floor(sec / 60)) + ' دقیقه پیش';
  if (sec < 86400) return toPersianDigits(Math.floor(sec / 3600)) + ' ساعت پیش';
  return toPersianDigits(Math.floor(sec / 86400)) + ' روز پیش';
}
function khatmErr(e, fallback) {
  return (e && e.httpError && e.message) ? e.message : fallback;
}
function khatmSeenGet() { try { return JSON.parse(localStorage.getItem(KHATM_SEEN_KEY) || '{}') || {}; } catch (e) { return {}; } }
function khatmSeenSet(v) { try { localStorage.setItem(KHATM_SEEN_KEY, JSON.stringify(v)); } catch (e) {} }
let khatmMineNews = false;        // کسی بخشی از ختم من را برداشته یا انجام داده
let khatmInquiryPending = false;  // درخواست‌دهنده از من پرسیده «انجام دادید؟» و هنوز جواب نداده‌ام
function khatmSetNewsDot(mineNews) {
  if (mineNews !== undefined) khatmMineNews = !!mineNews;
  const tile = document.getElementById('khatm-more-tile');
  if (tile) tile.classList.toggle('has-news', khatmMineNews || khatmInquiryPending);
  const dot = document.getElementById('khatm-mine-dot');
  if (dot) dot.classList.toggle('hidden', !khatmMineNews);
}
function khatmSetInquiry(on) {
  khatmInquiryPending = !!on;
  khatmSetNewsDot();
}
// یک خط خلاصه: «۳ از ۷ بخش برداشته شده — ۱ بخش انجام شده»
function khatmCountsText(taken, total, done) {
  return toPersianDigits(taken) + ' از ' + toPersianDigits(total) + ' بخش برداشته شده'
    + (taken > 0 ? ' — ' + toPersianDigits(done) + ' بخش انجام شده' : '');
}
function khatmProgressHtml(taken, total, done) {
  const p1 = Math.min(100, Math.round(taken * 100 / (total || 1)));
  const p2 = Math.min(100, Math.round(done * 100 / (total || 1)));
  return `<div class="khatm-progress"><div class="khatm-progress-bar" style="width:${p1}%"></div><div class="khatm-progress-done" style="width:${p2}%"></div></div>`;
}

/* نام سوره‌ها و تعداد آیه‌ها (از متن داخل اپ) برای نوشتن دقیق هر بخش؛ اگر نبود، فقط شماره نمایش داده می‌شود */
let khatmMetaPromise = null;
function khatmMeta() {
  if (!khatmMetaPromise) {
    khatmMetaPromise = (async () => {
      try {
        const all = await getOfflineQuranText();
        if (Array.isArray(all) && all.length === 114) {
          const names = all.map((sr) => sr.name || '');
          const counts = all.map((sr) => (sr.ayahs || []).length);
          return { names, counts };
        }
      } catch (e) {}
      return { names: [], counts: [] };
    })();
  }
  return khatmMetaPromise;
}
// اسم سوره بدون پیشوند «سُورَةُ» (در متن داخل اپ اسم‌ها با آن شروع می‌شوند و اینجا «سوره» جداگانه نوشته می‌شود)
function khatmSurahName(meta, n) {
  let nm = (meta.names && meta.names[n - 1]) || '';
  const m = nm.match(/^(\S+)\s+(.+)$/);
  if (m && m[1].replace(/[\u064B-\u065F\u0670]/g, '') === 'سورة') nm = m[2];
  return nm || toPersianDigits(n);
}
// شمارهٔ کلی آیه (۱ تا ۶۲۳۶) ← «سوره و شمارهٔ آیه»
function khatmAyahLoc(meta, g) {
  if (!meta.counts || meta.counts.length !== 114) return null;
  let left = g;
  for (let i = 0; i < 114; i++) {
    if (left <= meta.counts[i]) return { s: i + 1, a: left };
    left -= meta.counts[i];
  }
  return null;
}
// برچسب بخش شمارهٔ k
function khatmLabel(unit, per, k, meta) {
  const T = KHATM_TOTALS[unit] || 0;
  const a = (k - 1) * per + 1;
  const b = Math.min(k * per, T);
  const fa = toPersianDigits;
  if (unit === 'juz') return a === b ? 'جزء ' + fa(a) : 'جزء ' + fa(a) + ' تا ' + fa(b);
  if (unit === 'page') return a === b ? 'صفحه ' + fa(a) : 'صفحه ' + fa(a) + ' تا ' + fa(b);
  if (unit === 'surah') {
    return a === b ? 'سوره ' + khatmSurahName(meta, a) : 'سوره ' + khatmSurahName(meta, a) + ' تا سوره ' + khatmSurahName(meta, b);
  }
  // آیه: فقط «سوره و شمارهٔ آیه» نوشته می‌شود (نه شمارهٔ کلی ۱ تا ۶۲۳۶) تا کاربر دقیقاً بفهمد کجا را بخواند
  const la = khatmAyahLoc(meta, a), lb = khatmAyahLoc(meta, b);
  if (la && lb) {
    const cnt = (s) => meta.counts[s - 1];
    const nm = (s) => khatmSurahName(meta, s);
    if (la.s === lb.s) {
      if (la.a === 1 && lb.a === cnt(lb.s)) return 'سوره ' + nm(la.s) + ' (کامل)';
      if (la.a === lb.a) return 'سوره ' + nm(la.s) + '، آیه ' + fa(la.a);
      return 'سوره ' + nm(la.s) + '، آیه ' + fa(la.a) + ' تا ' + fa(lb.a);
    }
    const from = la.a === 1 ? 'ابتدای سوره ' + nm(la.s) : 'سوره ' + nm(la.s) + '، آیه ' + fa(la.a);
    const to = lb.a === cnt(lb.s) ? 'پایان سوره ' + nm(lb.s) : 'سوره ' + nm(lb.s) + '، آیه ' + fa(lb.a);
    return 'از ' + from + '\nتا ' + to;
  }
  // اگر متن قرآن داخل اپ نبود، ناچار شمارهٔ کلی آیه
  return a === b ? 'آیهٔ شمارهٔ ' + fa(a) + ' قرآن' : 'آیهٔ شمارهٔ ' + fa(a) + ' تا ' + fa(b) + ' قرآن';
}

// متن دکمه‌ها: پیش‌فرض‌ها اینجاست و مدیر از پیشخوان (ختم قرآن ← متن دکمه‌ها) می‌تواند عوض کند
const KHATM_L_DEFAULT = {
  btn_new: '➕ درخواست ختم جدید', btn_mine: 'درخواست‌های من', btn_join: '🤲 شرکت در این ختم',
  btn_pick: 'یک بخش آزاد برای من', btn_confirm: 'تأیید مشارکت من ({n} بخش)', btn_confirm_empty: 'تأیید',
  btn_done: '✔ انجام دادم', btn_done_state: '✅ انجام شد', btn_done_all: '✔ همهٔ بخش‌های من را انجام دادم',
  btn_ask: '🔔 استعلام: انجام دادید؟', btn_ask_all: '🔔 استعلام از همه', btn_close: 'بستن درخواست',
  btn_submit: 'ثبت و اعلام به همه'
};
let KHATM_L = Object.assign({}, KHATM_L_DEFAULT);
function khatmApplyLabels(labels) {
  KHATM_L = Object.assign({}, KHATM_L_DEFAULT);
  if (labels && typeof labels === 'object') {
    Object.keys(KHATM_L_DEFAULT).forEach((k) => {
      if (typeof labels[k] === 'string' && labels[k].trim()) KHATM_L[k] = labels[k].trim();
    });
  }
  const setT = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
  setT('khatm-new-btn', KHATM_L.btn_new);
  const mineBtn = document.getElementById('khatm-mine-btn');
  if (mineBtn) { const dot = document.getElementById('khatm-mine-dot'); mineBtn.textContent = KHATM_L.btn_mine + ' '; if (dot) mineBtn.appendChild(dot); }
  setT('khatm-view-pick-btn', KHATM_L.btn_pick);
  setT('khatm-new-submit-btn', KHATM_L.btn_submit);
  try { if (typeof khatmUpdateConfirmState === 'function') khatmUpdateConfirmState(); } catch (e) {}
}

async function loadKhatmSettings() {
  try {
    const s = await apiFetch('/khatm/settings');
    khatmApplyLabels(s && s.labels);
    const tile = document.getElementById('khatm-more-tile');
    if (tile) tile.classList.toggle('hidden', s && s.enabled === false);
    if (s && s.nav_label) {
      const l1 = document.getElementById('khatm-tile-label'); if (l1) l1.textContent = s.nav_label;
      const l2 = document.getElementById('khatm-page-title'); if (l2) l2.textContent = s.nav_label;
    }
  } catch (e) { /* بدون اینترنت: همان نام پیش‌فرض می‌ماند */ }
}

function khatmDescribe(r) {
  return 'هر نفر ' + toPersianDigits(r.per_person) + ' ' + (KHATM_UNIT_FA[r.unit] || '') + ' — ' + toPersianDigits(r.portions) + ' بخش';
}

async function loadKhatmList() {
  const el = document.getElementById('khatm-list-content');
  el.innerHTML = '<p class="muted-text small" style="padding:0 18px">در حال بارگذاری...</p>';
  try {
    const device_id = await ensureDeviceId();
    const rows = shariqAsArray(await shariqGet('/khatm/list?device_id=' + encodeURIComponent(device_id)));
    khatmSetInquiry(rows.some((r) => Number(r.my_ask) > 0));
    el.innerHTML = '';
    if (!rows.length) {
      el.innerHTML = '<div class="shariq-empty"><span class="shariq-empty-icon">📖</span>هنوز ختمی تعریف نشده است.<br>اولین ختم را شما ثبت کنید.</div>';
      return;
    }
    rows.forEach((r, i) => {
      const card = document.createElement('div');
      card.className = 'shariq-item khatm-item';
      card.style.animationDelay = `${Math.min(i, 8) * 0.06}s`;
      const who = r.requester_name ? shariqEsc(r.requester_name) : 'یک کاربر';
      const taken = Number(r.taken_count) || 0;
      const total = Number(r.portions) || 1;
      const doneN = Number(r.done_count) || 0;
      let badge = '';
      if (Number(r.my_ask) > 0) badge = '<span class="khatm-badge is-ask">❓ درخواست‌دهنده پرسیده: انجام دادید؟</span>';
      else if (r.mine) badge = '<span class="khatm-badge is-wait">درخواست شما</span>';
      else if (Number(r.my_count) > 0) badge = `<span class="khatm-badge">${Number(r.my_done) >= Number(r.my_count) ? '✅ ختم شما انجام شد' : '🤲 ' + toPersianDigits(r.my_count) + ' بخش از شما'}</span>`;
      const full = taken >= total;
      card.innerHTML = `
        <div class="khatm-title">${shariqEsc(r.title)}</div>
        ${r.note ? `<div class="khatm-note">${shariqText(r.note)}</div>` : ''}
        <div class="khatm-meta"><span>👤 ${who}</span><span>🕒 ${khatmAgo(r.age)}</span><span>📚 ${khatmDescribe(r)}</span></div>
        ${khatmProgressHtml(taken, total, doneN)}
        <div class="khatm-meta"><span>${khatmCountsText(taken, total, doneN)}${full ? ' — ظرفیت تکمیل است' : ''}</span>${badge}</div>
        <div class="khatm-actions"><button type="button" class="secondary-btn small-btn khatm-open-btn">${full ? 'مشاهده' : shariqEsc(KHATM_L.btn_join)}</button></div>`;
      card.querySelector('.khatm-open-btn').addEventListener('click', () => openKhatmView(r.id));
      el.appendChild(card);
    });
  } catch (e) {
    el.innerHTML = shariqErrorBox(e, 'khatm-retry-btn');
    const b = document.getElementById('khatm-retry-btn');
    if (b) b.addEventListener('click', loadKhatmList);
  }
}

function openKhatmView(id) {
  khatmViewId = Number(id) || 0;
  switchToTab('khatm-view', { push: true });
}

function khatmUpdateConfirmState() {
  const d = khatmViewData;
  const btn = document.getElementById('khatm-view-confirm-btn');
  const msg = document.getElementById('khatm-view-msg');
  if (!d || !btn) return;
  const mineNow = new Set((d.taken || []).filter((t) => t.mine).map((t) => t.p));
  let changed = mineNow.size !== khatmSel.size;
  if (!changed) khatmSel.forEach((p) => { if (!mineNow.has(p)) changed = true; });
  btn.disabled = !changed || d.status !== 'open';
  btn.textContent = khatmSel.size ? KHATM_L.btn_confirm.replace(/\{n\}/g, toPersianDigits(khatmSel.size)) : KHATM_L.btn_confirm_empty;
  msg.textContent = d.status !== 'open'
    ? 'این ختم بسته شده است.'
    : 'بخش‌هایی را که می‌خواهید بخوانید تیک بزنید و «تأیید» را بزنید. برای انصراف از یک بخش، تیکش را بردارید و دوباره تأیید کنید.';
}

let khatmViewMeta = null;
function khatmRenderViewInfo() {
  const d = khatmViewData;
  if (!d) return;
  const total = Number(d.portions) || 1;
  const takenArr = d.taken || [];
  const takenCount = takenArr.length;
  const doneCount = takenArr.filter((t) => t.done).length;
  document.getElementById('khatm-view-info').textContent =
    khatmDescribe(d) + ' — ' + khatmCountsText(takenCount, total, doneCount)
    + (d.requester_name ? ' — درخواست‌دهنده: ' + d.requester_name : '');
  const bar = document.getElementById('khatm-view-bar');
  if (bar) bar.style.width = Math.min(100, Math.round(takenCount * 100 / total)) + '%';
  const bar2 = document.getElementById('khatm-view-bar-done');
  if (bar2) bar2.style.width = Math.min(100, Math.round(doneCount * 100 / total)) + '%';
}

// «بخش‌های من»: بخش‌هایی که قبلاً تأیید و برداشته‌ام + تیک «ختم این بخش را انجام دادم»
function renderKhatmMyDone() {
  const box = document.getElementById('khatm-view-mine');
  const d = khatmViewData;
  if (!box) return;
  const mine = d ? (d.taken || []).filter((t) => t.mine).sort((a, b) => a.p - b.p) : [];
  if (!d || !mine.length) { box.classList.add('hidden'); box.innerHTML = ''; return; }
  const meta = khatmViewMeta || { names: [], counts: [] };
  const pending = mine.filter((t) => !t.done);
  const asked = mine.some((t) => t.ask);
  box.classList.remove('hidden');
  box.innerHTML = `<h4 class="khatm-mydone-title">بخش‌های من</h4>
    ${asked ? '<p class="khatm-ask-note">❓ درخواست‌دهنده پرسیده است: ختم‌تان را انجام داده‌اید؟ بعد از خواندن، «انجام دادم» را بزنید.</p>' : ''}
    <p class="muted-text small">بعد از اینکه سهم خود را خواندید، «انجام دادم» را بزنید تا درخواست‌دهنده بفهمد ختم شما انجام شده است.</p>`;
  mine.forEach((t) => {
    const row = document.createElement('div');
    row.className = 'khatm-mydone-row' + (t.done ? ' is-done' : '');
    row.innerHTML = `<span class="khatm-mydone-txt">${shariqEsc(khatmLabel(d.unit, d.per_person, t.p, meta))}</span>
      <button type="button" class="${t.done ? 'ghost-btn' : 'secondary-btn'} small-btn khatm-mydone-btn">${shariqEsc(t.done ? KHATM_L.btn_done_state : KHATM_L.btn_done)}</button>`;
    row.querySelector('.khatm-mydone-btn').addEventListener('click', () => khatmMarkDone([t.p], !t.done));
    box.appendChild(row);
  });
  if (pending.length > 1) {
    const all = document.createElement('button');
    all.type = 'button';
    all.className = 'secondary-btn khatm-mydone-all';
    all.textContent = KHATM_L.btn_done_all;
    all.addEventListener('click', () => khatmMarkDone(pending.map((t) => t.p), true));
    box.appendChild(all);
  }
}

async function khatmMarkDone(ps, done) {
  const d = khatmViewData;
  if (!d) return;
  if (!done && !(await appConfirm('khatm_undo_done_confirm'))) return;
  try {
    const device_id = await ensureDeviceId();
    await apiFetch('/khatm/done', { method: 'POST', body: JSON.stringify({ device_id, request_id: d.id, portions: ps, done: !!done }) });
    (d.taken || []).forEach((t) => { if (t.mine && ps.indexOf(t.p) >= 0) { t.done = !!done; if (done) t.ask = false; } });
    khatmRenderViewInfo();
    renderKhatmMyDone();
    // خانهٔ همان بخش در جدول هم به‌روز شود (برای بخش‌های من ظاهرش همان تیک‌خورده می‌ماند)
    khatmSetInquiry((d.taken || []).some((t) => t.mine && t.ask));
    if (done) appAlert('khatm_done_ok');
  } catch (e) {
    appAlertErr('khatm_done_fail', e);
  }
}

async function loadKhatmView() {
  const grid = document.getElementById('khatm-view-grid');
  grid.innerHTML = '<p class="muted-text small" style="padding:0 4px">در حال بارگذاری...</p>';
  try {
    const device_id = await ensureDeviceId();
    const d = await shariqGet('/khatm/view?id=' + encodeURIComponent(khatmViewId) + '&device_id=' + encodeURIComponent(device_id));
    const meta = await khatmMeta();
    khatmViewData = d;
    khatmSel = new Set((d.taken || []).filter((t) => t.mine).map((t) => t.p));
    document.getElementById('khatm-view-title').textContent = d.title || '';
    const noteEl = document.getElementById('khatm-view-note');
    noteEl.textContent = d.note || '';
    noteEl.classList.toggle('hidden', !d.note);
    const total = Number(d.portions) || 1;
    khatmViewMeta = meta;
    khatmRenderViewInfo();
    renderKhatmMyDone();
    document.getElementById('khatm-view-name').value = localStorage.getItem(KHATM_NAME_KEY) || '';

    const takenMap = {};
    (d.taken || []).forEach((t) => { takenMap[t.p] = t; });
    grid.innerHTML = '';
    for (let k = 1; k <= total; k++) {
      const t = takenMap[k];
      const other = t && !t.mine;
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'khatm-tile' + (other ? ' is-taken' : '') + (khatmSel.has(k) ? ' is-sel' : '');
      tile.dataset.p = String(k);
      const label = khatmLabel(d.unit, d.per_person, k, meta);
      tile.innerHTML = `<span class="khatm-box">${other || khatmSel.has(k) ? '✓' : ''}</span>
        <span class="khatm-tile-txt">${shariqEsc(label)}${other ? `<span class="khatm-tile-by">${t.done ? '✅ انجام شد' : (t.name ? shariqEsc(t.name) : 'برداشته شده')}</span>` : ''}</span>`;
      if (!other && d.status === 'open') {
        tile.addEventListener('click', () => {
          if (khatmSel.has(k)) khatmSel.delete(k); else khatmSel.add(k);
          const on = khatmSel.has(k);
          tile.classList.toggle('is-sel', on);
          tile.querySelector('.khatm-box').textContent = on ? '✓' : '';
          khatmUpdateConfirmState();
        });
      }
      grid.appendChild(tile);
    }
    khatmUpdateConfirmState();
  } catch (e) {
    khatmViewData = null;
    grid.innerHTML = shariqErrorBox(e, 'khatm-view-retry-btn');
    const b = document.getElementById('khatm-view-retry-btn');
    if (b) b.addEventListener('click', loadKhatmView);
  }
}

async function loadKhatmMine() {
  const el = document.getElementById('khatm-mine-content');
  el.innerHTML = '<p class="muted-text small" style="padding:0 18px">در حال بارگذاری...</p>';
  try {
    const device_id = await ensureDeviceId();
    const rows = shariqAsArray(await shariqGet('/khatm/mine?device_id=' + encodeURIComponent(device_id)));
    const meta = await khatmMeta();
    // هرچه الان دیده شد «دیده‌شده» حساب می‌شود و نقطهٔ قرمز خاموش می‌شود
    const seen = {};
    rows.forEach((r) => { seen[r.id] = Number(r.accept_count) || 0; });
    khatmSeenSet(seen);
    khatmSetNewsDot(false);
    el.innerHTML = '';
    if (!rows.length) {
      el.innerHTML = '<div class="shariq-empty"><span class="shariq-empty-icon">✍️</span>هنوز درخواستی ثبت نکرده‌اید.</div>';
      return;
    }
    rows.forEach((r, i) => {
      const card = document.createElement('div');
      card.className = 'shariq-item khatm-item';
      card.style.animationDelay = `${Math.min(i, 8) * 0.06}s`;
      const open = r.status === 'open';
      const total = Number(r.portions) || 1;
      const taken = Array.isArray(r.taken) ? r.taken : [];
      const doneN = taken.filter((t) => t.done).length;
      const pendingN = taken.length - doneN;
      // گروه‌بندی بخش‌ها بر اساس شرکت‌کننده (کد ناشناس هر نفر)
      const groups = {};
      const order = [];
      taken.forEach((t) => {
        if (!groups[t.who]) { groups[t.who] = { name: t.name, parts: [] }; order.push(t.who); }
        groups[t.who].parts.push(t);
      });
      const lines = order.map((w, idx) => {
        const g = groups[w];
        const nm = g.name ? shariqEsc(g.name) : 'شرکت‌کنندهٔ ' + toPersianDigits(idx + 1);
        const gDone = g.parts.filter((t) => t.done).length;
        const gAsked = g.parts.some((t) => t.asked);
        const parts = g.parts.map((t) => (t.done ? '✅ ' : '⏳ ') + shariqEsc(khatmLabel(r.unit, r.per_person, t.p, meta))).join('<br>');
        const status = gDone === g.parts.length
          ? '<span class="khatm-badge">✅ ختم خود را انجام داد</span>'
          : '<span class="khatm-badge is-wait">' + toPersianDigits(gDone) + ' از ' + toPersianDigits(g.parts.length) + ' انجام شده' + (gAsked ? ' — استعلام شد' : '') + '</span>';
        const askBtn = (open && gDone < g.parts.length)
          ? `<button type="button" class="ghost-btn small-btn khatm-ask-btn" data-who="${shariqEsc(w)}">${shariqEsc(KHATM_L.btn_ask)}</button>` : '';
        return `<div class="khatm-who"><div class="khatm-who-head"><b>${nm}</b>${status}</div><div class="khatm-who-parts">${parts}</div>${askBtn}</div>`;
      }).join('');
      card.innerHTML = `
        <div class="khatm-title">${shariqEsc(r.title)}</div>
        ${r.note ? `<div class="khatm-note">${shariqText(r.note)}</div>` : ''}
        <div class="khatm-meta"><span>🕒 ${khatmAgo(r.age)}</span><span>📚 ${khatmDescribe(r)}</span>${open ? '' : (r.completed ? '<span class="khatm-badge">✅ ختم کامل شد</span>' : '<span class="khatm-badge is-wait">بسته شده</span>')}</div>
        ${khatmProgressHtml(taken.length, total, doneN)}
        <div class="khatm-meta"><span>${taken.length ? '🤲 ' : '⏳ '}${khatmCountsText(taken.length, total, doneN)}</span></div>
        ${taken.length ? `<div class="khatm-meta"><span>${doneN >= taken.length ? '✅ همهٔ برداشت‌کنندگان ختم خود را انجام داده‌اند' : '⏳ ' + toPersianDigits(pendingN) + ' بخش هنوز انجام نشده'}</span></div>` : ''}
        ${lines ? `<div class="khatm-accepts">${lines}</div>` : ''}
        <div class="khatm-actions">
          <button type="button" class="secondary-btn small-btn khatm-view-btn">مشاهدهٔ بخش‌ها</button>
          ${(open && pendingN > 0) ? '<button type="button" class="ghost-btn small-btn khatm-ask-all-btn">' + shariqEsc(KHATM_L.btn_ask_all) + '</button>' : ''}
          ${open ? '<button type="button" class="ghost-btn small-btn khatm-close-btn">' + shariqEsc(KHATM_L.btn_close) + '</button>' : ''}
        </div>`;
      card.querySelector('.khatm-view-btn').addEventListener('click', () => openKhatmView(r.id));
      const cb = card.querySelector('.khatm-close-btn');
      if (cb) cb.addEventListener('click', () => closeKhatmRequest(r.id));
      card.querySelectorAll('.khatm-ask-btn').forEach((b) => b.addEventListener('click', () => khatmInquire(r.id, b.dataset.who, b)));
      const ab = card.querySelector('.khatm-ask-all-btn');
      if (ab) ab.addEventListener('click', () => khatmInquire(r.id, 'all', ab));
      el.appendChild(card);
    });
  } catch (e) {
    el.innerHTML = shariqErrorBox(e, 'khatm-mine-retry-btn');
    const b = document.getElementById('khatm-mine-retry-btn');
    if (b) b.addEventListener('click', loadKhatmMine);
  }
}

// استعلام از یک برداشت‌کننده (یا همه): در اپ او «❓ درخواست‌دهنده پرسیده» نشان داده می‌شود
async function khatmInquire(requestId, who, btn) {
  if (btn) btn.disabled = true;
  try {
    const device_id = await ensureDeviceId();
    const res = await apiFetch('/khatm/inquire', { method: 'POST', body: JSON.stringify({ device_id, request_id: Number(requestId), who }) });
    appAlert('khatm_inquire_ok', { count_text: (res && res.asked ? ' (' + toPersianDigits(res.asked) + ' بخش)' : '') });
    loadKhatmMine();
  } catch (e) {
    appAlertErr('khatm_inquire_fail', e);
    if (btn) btn.disabled = false;
  }
}

async function closeKhatmRequest(id) {
  if (!(await appConfirm('khatm_close_confirm'))) return;
  try {
    const device_id = await ensureDeviceId();
    await apiFetch('/khatm/close', { method: 'POST', body: JSON.stringify({ device_id, request_id: Number(id) }) });
    loadKhatmMine();
  } catch (e) {
    appAlertErr('khatm_close_fail', e);
  }
}

// اگر کسی بخشی از ختمِ ثبت‌شده توسط این گوشی را برداشته باشد، فقط یک نقطهٔ قرمز کوچک روی کاشی «ختم قرآن» می‌افتد
async function khatmCheckNews() {
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    const device_id = await ensureDeviceId();
    // ۱) آیا درخواست‌دهنده‌ای از من «انجام دادید؟» پرسیده؟
    try {
      const list = shariqAsArray(await shariqGet('/khatm/list?device_id=' + encodeURIComponent(device_id)));
      khatmSetInquiry(list.some((r) => Number(r.my_ask) > 0));
    } catch (e) { /* بی‌صدا */ }
    // ۲) آیا کسی بخشی از ختم من را برداشته یا انجام داده؟
    if (localStorage.getItem(KHATM_HAS_KEY) !== '1') return;
    const rows = shariqAsArray(await shariqGet('/khatm/mine?device_id=' + encodeURIComponent(device_id)));
    const seen = khatmSeenGet();
    const news = rows.some((r) => (Number(r.accept_count) || 0) > (Number(seen[r.id]) || 0));
    khatmSetNewsDot(news);
  } catch (e) { /* بی‌صدا */ }
}

// پیش‌نمایش زندهٔ تقسیم در پنجرهٔ «درخواست ختم جدید»
function khatmUpdatePreview() {
  const $ = (id) => document.getElementById(id);
  const unit = khatmCreateUnit;
  const T = KHATM_TOTALS[unit];
  const fa = toPersianDigits;
  document.querySelectorAll('#khatm-unit-row .shariq-chip').forEach((c) => c.classList.toggle('active', c.dataset.unit === unit));
  $('khatm-per-label').textContent = 'هر نفر چند ' + KHATM_UNIT_FA[unit] + ' بخواند؟ (از ' + fa(T) + ')';
  const per = parseInt($('khatm-new-per').value, 10);
  const pv = $('khatm-new-preview');
  const submit = $('khatm-new-submit-btn');
  if (!per || per < 1 || per > T) {
    pv.textContent = 'عددی بین ۱ و ' + fa(T) + ' بنویسید.';
    pv.classList.add('is-bad'); submit.disabled = true;
    return;
  }
  const portions = Math.ceil(T / per);
  if (portions > KHATM_MAX_PORTIONS) {
    pv.textContent = 'با این عدد قرآن به ' + fa(portions) + ' بخش تقسیم می‌شود که زیاد است (حداکثر ' + fa(KHATM_MAX_PORTIONS) + '). عدد بزرگ‌تری بنویسید.';
    pv.classList.add('is-bad'); submit.disabled = true;
    return;
  }
  const last = T - (portions - 1) * per;
  pv.classList.remove('is-bad'); submit.disabled = false;
  pv.textContent = 'قرآن به ' + fa(portions) + ' بخش تقسیم می‌شود؛ هر نفر ' + fa(per) + ' ' + KHATM_UNIT_FA[unit]
    + (last !== per ? ' (بخش آخر ' + fa(last) + ' ' + KHATM_UNIT_FA[unit] + ')' : '') + '.';
}

(function setupKhatmUi() {
  try {
    const $ = (id) => document.getElementById(id);
    $('khatm-mine-btn').addEventListener('click', () => switchToTab('khatm-mine', { push: true }));

    // ثبت درخواست جدید
    $('khatm-new-btn').addEventListener('click', async () => {
      // فقط یک ختمِ ناتمام: اگر ختم باز و کامل‌نشده‌ای دارد، همین‌جا جلویش گرفته می‌شود (بدون اینترنت، سرور هم بررسی می‌کند)
      try {
        const device_id = await ensureDeviceId();
        const mine = shariqAsArray(await shariqGet('/khatm/mine?device_id=' + encodeURIComponent(device_id)));
        if (mine.some((r) => r.status === 'open' && !r.completed)) {
          await appAlert('khatm_has_open');
          switchToTab('khatm-mine', { push: true });
          return;
        }
      } catch (e) { /* بدون اینترنت: سرور هنگام ثبت بررسی می‌کند */ }
      $('khatm-new-title').value = '';
      $('khatm-new-note').value = '';
      $('khatm-new-name').value = localStorage.getItem(KHATM_NAME_KEY) || '';
      $('khatm-new-error').classList.add('hidden');
      khatmCreateUnit = 'juz';
      $('khatm-new-per').value = '1';
      khatmUpdatePreview();
      $('khatm-new-modal').classList.remove('hidden');
    });
    document.querySelectorAll('#khatm-unit-row .shariq-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        khatmCreateUnit = chip.dataset.unit;
        // عدد پیشنهادی هر واحد که تقسیم معقولی بدهد
        $('khatm-new-per').value = ({ juz: '1', surah: '1', page: '5', ayah: '100' })[khatmCreateUnit];
        khatmUpdatePreview();
      });
    });
    $('khatm-new-per').addEventListener('input', khatmUpdatePreview);
    $('khatm-new-cancel-btn').addEventListener('click', () => $('khatm-new-modal').classList.add('hidden'));
    $('khatm-new-submit-btn').addEventListener('click', async () => {
      const title = $('khatm-new-title').value.trim();
      const note = $('khatm-new-note').value.trim();
      const name = $('khatm-new-name').value.trim();
      const per = parseInt($('khatm-new-per').value, 10) || 0;
      const errEl = $('khatm-new-error');
      if (title.length < 3) {
        errEl.textContent = 'لطفاً عنوان درخواست را کامل‌تر بنویسید.';
        errEl.classList.remove('hidden');
        return;
      }
      const btn = $('khatm-new-submit-btn');
      btn.disabled = true;
      try {
        const device_id = await ensureDeviceId();
        await apiFetch('/khatm/create', { method: 'POST', body: JSON.stringify({ device_id, title, note, name, unit: khatmCreateUnit, per_person: per }) });
        try { localStorage.setItem(KHATM_HAS_KEY, '1'); if (name) localStorage.setItem(KHATM_NAME_KEY, name); } catch (e) {}
        $('khatm-new-modal').classList.add('hidden');
        loadKhatmList();
        appAlert('khatm_created');
      } catch (e) {
        errEl.textContent = khatmErr(e, 'ثبت درخواست انجام نشد. اینترنت را بررسی کنید و دوباره تلاش کنید.');
        errEl.classList.remove('hidden');
      } finally { btn.disabled = false; khatmUpdatePreview(); }
    });

    // صفحهٔ شرکت در ختم
    $('khatm-view-pick-btn').addEventListener('click', () => {
      const d = khatmViewData;
      if (!d || d.status !== 'open') return;
      const used = new Set((d.taken || []).map((t) => t.p));
      for (let k = 1; k <= d.portions; k++) {
        if (!used.has(k) && !khatmSel.has(k)) {
          khatmSel.add(k);
          const tile = document.querySelector('#khatm-view-grid .khatm-tile[data-p="' + k + '"]');
          if (tile) {
            tile.classList.add('is-sel');
            tile.querySelector('.khatm-box').textContent = '✓';
            try { tile.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {}
          }
          khatmUpdateConfirmState();
          return;
        }
      }
      appAlert('khatm_all_taken');
    });
    $('khatm-view-confirm-btn').addEventListener('click', async () => {
      const d = khatmViewData;
      if (!d) return;
      const btn = $('khatm-view-confirm-btn');
      const name = $('khatm-view-name').value.trim();
      btn.disabled = true;
      try {
        const device_id = await ensureDeviceId();
        const res = await apiFetch('/khatm/set', { method: 'POST', body: JSON.stringify({ device_id, request_id: d.id, name, portions: Array.from(khatmSel) }) });
        try { if (name) localStorage.setItem(KHATM_NAME_KEY, name); } catch (e) {}
        const conflicts = (res && res.conflicts) || [];
        await loadKhatmView();
        if (conflicts.length) {
          appAlert('khatm_conflict');
        } else {
          appAlert(khatmSel.size ? 'khatm_join_ok' : 'khatm_leave_ok');
        }
      } catch (e) {
        appAlertErr('khatm_set_fail', e);
        khatmUpdateConfirmState();
      }
    });
  } catch (e) { /* خطای این بخش نباید اجرای بقیهٔ اپ را متوقف کند */ }
})();

/* ---------- تسبیحات (ذکرهای مدیریت‌شده) ---------- */
const DHIKR_ICONS = ['📿', '🕌', '🌙', '✨', '🌿', '🕋', '💚', '⭐'];
function selectDhikrCard(card) {
  document.querySelectorAll('#dhikr-cards .dhikr-card').forEach((c) => c.classList.remove('is-active'));
  card.classList.add('is-active');

  const arabicEl = document.getElementById('dhikr-arabic-text');
  const virtueBox = document.getElementById('dhikr-virtue-box');
  const virtueText = document.getElementById('dhikr-virtue-text');

  arabicEl.classList.remove('dhikr-fade-in');
  virtueBox.classList.add('hidden');
  virtueText.textContent = '';

  const arabic = card.dataset.arabic || '';
  const virtue = card.dataset.virtue || '';

  requestAnimationFrame(() => {
    arabicEl.textContent = arabic;
    arabicEl.classList.add('dhikr-fade-in');
    if (virtue) {
      virtueText.textContent = virtue;
      virtueBox.classList.remove('hidden');
      virtueBox.classList.remove('dhikr-fade-in');
      void virtueBox.offsetWidth;
      virtueBox.classList.add('dhikr-fade-in');
    }
  });

  if (card.dataset.target) {
    tasbihTarget = parseInt(card.dataset.target, 10) || 33;
    tasbihCount = 0;
    localStorage.setItem(TASBIH_TARGET_KEY, String(tasbihTarget));
    localStorage.setItem(TASBIH_KEY, '0');
    tasbihRounds = 0; localStorage.setItem(TASBIH_ROUNDS_KEY, '0');
    renderTasbih();
  }
}
async function loadDhikrList() {
  const wrap = document.getElementById('dhikr-cards');
  try {
    const dhikrs = await apiFetch('/dhikrs');
    dhikrs.forEach((d, idx) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'dhikr-card';
      card.dataset.id = d.id;
      card.dataset.arabic = d.arabic_text || '';
      card.dataset.virtue = d.virtue || '';
      card.dataset.target = d.target_count || 33;
      card.innerHTML = `<span class="dhikr-card-icon">${DHIKR_ICONS[idx % DHIKR_ICONS.length]}</span><span class="dhikr-card-title">${d.title}</span>`;
      wrap.appendChild(card);
    });
  } catch (e) { /* ignore */ }
  wrap.addEventListener('click', (e) => {
    const card = e.target.closest('.dhikr-card');
    if (card) selectDhikrCard(card);
  });
}
loadDhikrList();

/* ---------- مکاتب (نظارت سلسله‌مراتبی) ---------- */
const mokatibState = {
  token: sessionStorage.getItem('arefanejam_mokatib_token') || '',
  allMosques: [],
  publicMosques: [],
  currentMosqueId: null,
};

function applyMokatibIcon(d) {
  const icon = d && d.icon;
  if (icon) document.getElementById('mokatib-tile-badge').innerHTML = `<img src="${secureUrl(icon)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
}
async function loadMokatibIcon() {
  try { await apiSWR('/mokatib/icon', applyMokatibIcon); } catch (e) { /* ignore */ }
}
loadMokatibIcon();

/* اسلایدر تبلیغاتی مکاتب: در تمام صفحات بخش مکاتب (مهمان و ناظر واردشده) نمایش داده می‌شود */
function setupMokatibSliderBehavior(holder, count) {
  if (count <= 1) return;
  const track = holder.querySelector('.mokatib-slider-track');
  const dots = holder.querySelectorAll('.mokatib-slider-dot');
  let idx = 0;
  let timer = null;

  function goTo(i) {
    idx = ((i % count) + count) % count;
    track.style.transform = `translateX(-${idx * 100}%)`;
    dots.forEach((d, di) => d.classList.toggle('active', di === idx));
  }
  function restartTimer() {
    if (timer) clearInterval(timer);
    timer = setInterval(() => goTo(idx + 1), 4500);
  }

  dots.forEach((d, di) => d.addEventListener('click', () => { goTo(di); restartTimer(); }));
  restartTimer();
}

async function loadMokatibSlider() {
  const holders = document.querySelectorAll('.mokatib-slider-holder');
  if (!holders.length) return;
  try {
    await apiSWR('/mokatib/slider', renderMokatibSlider);
  } catch (e) {
    holders.forEach((h) => { h.style.display = 'none'; h.innerHTML = ''; });
  }
}
function renderMokatibSlider(data) {
  const holders = document.querySelectorAll('.mokatib-slider-holder');
  if (!holders.length) return;
  {
    const images = (data && Array.isArray(data.images)) ? data.images : [];
    if (!data || !data.enabled || !images.length) {
      holders.forEach((h) => { h.style.display = 'none'; h.innerHTML = ''; });
      return;
    }
    // «جایگاه» هر عکس (بالا/وسط/پایین) که مدیر برای همان عکس انتخاب کرده؛ اگر چیزی
    // انتخاب نشده باشد پیش‌فرض «وسط» است تا عکس بدون هیچ تنظیم اضافه‌ای هم خوش‌فرم بماند.
    const posMap = { top: 'center top', center: 'center center', bottom: 'center bottom' };
    const slidesHtml = images.map((img) => {
      const objectPos = posMap[img.pos] || posMap.center;
      return `<div class="mokatib-slide"><img src="${img.full || img.thumb}" alt="" style="object-position:${objectPos}"></div>`;
    }).join('');
    const dotsHtml = images.length > 1
      ? `<div class="mokatib-slider-dots">${images.map((_, i) => `<span class="mokatib-slider-dot${i === 0 ? ' active' : ''}"></span>`).join('')}</div>`
      : '';
    const heightPx = (Number(data.height) > 0) ? Number(data.height) : 160;
    holders.forEach((holder) => {
      holder.style.display = '';
      holder.innerHTML = `<div class="mokatib-slider" style="height:${heightPx}px"><div class="mokatib-slider-track">${slidesHtml}</div></div>${dotsHtml}`;
      setupMokatibSliderBehavior(holder, images.length);
    });
  }
}
loadMokatibSlider();

document.getElementById('mokatib-tile').addEventListener('click', () => {
  if (mokatibState.token) { switchToTab('mokatib-home', { push: true }); loadMokatibHome(); }
  else { switchToTab('mokatib-public', { push: true }); loadMokatibPublicTree(); }
});

document.getElementById('mokatib-public-login-link').addEventListener('click', () => {
  switchToTab('mokatib-login', { push: true });
});

document.getElementById('mokatib-public-btn1').addEventListener('click', () => {
  const popup = (mokatibState.publicBtn1Popup) || { image: '', text: '' };
  if (!popup.image && !popup.text) return; // چیزی برای نمایش تنظیم نشده
  const imgEl = document.getElementById('mokatib-public-btn1-popup-img');
  const wrapEl = document.getElementById('mokatib-public-btn1-popup-imgwrap');
  const textEl = document.getElementById('mokatib-public-btn1-popup-text');
  if (popup.image) {
    imgEl.src = secureUrl(popup.image);
    wrapEl.style.display = 'block';
    if (mokatibBtn1ImageViewer) mokatibBtn1ImageViewer.reset();
  } else {
    wrapEl.style.display = 'none';
    imgEl.removeAttribute('src');
  }
  applyMokatibPopupText(textEl, popup);
  document.getElementById('mokatib-public-btn1-popup').classList.remove('hidden');
  pushOverlay('btn1', closeMokatibBtn1Popup);
});
function closeMokatibBtn1Popup() {
  exitImageViewerFullscreen(document.getElementById('mokatib-public-btn1-popup-imgwrap'));
  document.getElementById('mokatib-public-btn1-popup').classList.add('hidden');
}
document.getElementById('mokatib-public-btn1-popup-close').addEventListener('click', () => {
  overlayGo('btn1', 0, closeMokatibBtn1Popup);
});

const MOKATIB_POPUP_FONT_CLASSES = ['mokatib-popup-font-default', 'mokatib-popup-font-lalezar', 'mokatib-popup-font-aref-ruqaa', 'mokatib-popup-font-amiri-quran'];
const MOKATIB_POPUP_FX_CLASSES = ['mokatib-popup-fx-fade', 'mokatib-popup-fx-slide-up', 'mokatib-popup-fx-zoom-in', 'mokatib-popup-fx-bounce', 'mokatib-popup-fx-typewriter'];
let mokatibTypewriterTimer = null;

function applyMokatibPopupText(textEl, popup) {
  if (mokatibTypewriterTimer) { clearInterval(mokatibTypewriterTimer); mokatibTypewriterTimer = null; }
  textEl.classList.remove(...MOKATIB_POPUP_FONT_CLASSES, ...MOKATIB_POPUP_FX_CLASSES, 'mokatib-caret-blink');
  // eslint-disable-next-line no-unused-expressions
  void textEl.offsetWidth; // ری‌استارت انیمیشن حتی اگر همان افکتِ قبلی دوباره انتخاب شود

  textEl.classList.add('mokatib-popup-font-' + (popup.font || 'default'));
  textEl.style.color = popup.textColor || '';

  const effect = popup.effect || 'fade';
  const fullText = popup.text || '';
  if (effect === 'typewriter') {
    textEl.classList.add('mokatib-popup-fx-typewriter', 'mokatib-caret-blink');
    textEl.textContent = '';
    let i = 0;
    mokatibTypewriterTimer = setInterval(() => {
      i += 1;
      textEl.textContent = fullText.slice(0, i);
      if (i >= fullText.length) { clearInterval(mokatibTypewriterTimer); mokatibTypewriterTimer = null; }
    }, 35);
  } else {
    textEl.textContent = fullText;
    if (effect !== 'none') textEl.classList.add('mokatib-popup-fx-' + effect);
  }
}

/* ===== نمایشگر عکس با زوم/چرخش/تمام‌صفحه: پینچ دو انگشتی و درگ روی موبایل، اسکرول و درگ با موس روی دسکتاپ ===== */
function setupImageViewer(wrapEl) {
  const stage = wrapEl.querySelector('.img-viewer-stage');
  const img = wrapEl.querySelector('.img-viewer-img');
  const MIN_SCALE = 1, MAX_SCALE = 5;
  let scale = 1, rotation = 0, tx = 0, ty = 0;
  let isPanning = false, panStartX = 0, panStartY = 0, startTx = 0, startTy = 0;
  let pinchStartDist = 0, pinchStartScale = 1;
  let lastTapTime = 0;

  function clampScale(s) { return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s)); }
  function apply() { img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale}) rotate(${rotation}deg)`; }
  function reset() { scale = 1; rotation = 0; tx = 0; ty = 0; apply(); }
  function dist(t1, t2) {
    const dx = t1.clientX - t2.clientX, dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  stage.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      pinchStartDist = dist(e.touches[0], e.touches[1]);
      pinchStartScale = scale;
    } else if (e.touches.length === 1 && scale > 1) {
      isPanning = true;
      panStartX = e.touches[0].clientX; panStartY = e.touches[0].clientY;
      startTx = tx; startTy = ty;
    }
  }, { passive: true });

  stage.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const d = dist(e.touches[0], e.touches[1]);
      if (pinchStartDist > 0) { scale = clampScale(pinchStartScale * (d / pinchStartDist)); apply(); }
    } else if (isPanning && e.touches.length === 1) {
      e.preventDefault();
      tx = startTx + (e.touches[0].clientX - panStartX);
      ty = startTy + (e.touches[0].clientY - panStartY);
      apply();
    }
  }, { passive: false });

  stage.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) pinchStartDist = 0;
    if (e.touches.length === 0) isPanning = false;
    const now = Date.now();
    if (now - lastTapTime < 300 && e.changedTouches.length === 1) {
      scale = (scale > 1) ? 1 : 2.2; tx = 0; ty = 0; apply();
    }
    lastTapTime = now;
  });

  // دسکتاپ: چرخ ماوس برای زوم، درگ برای جابه‌جایی وقتی بزرگ‌نمایی شده
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    scale = clampScale(scale + (e.deltaY < 0 ? 0.25 : -0.25));
    apply();
  }, { passive: false });

  let mouseDown = false;
  stage.addEventListener('mousedown', (e) => {
    if (scale <= 1) return;
    mouseDown = true;
    panStartX = e.clientX; panStartY = e.clientY; startTx = tx; startTy = ty;
  });
  window.addEventListener('mousemove', (e) => {
    if (!mouseDown) return;
    tx = startTx + (e.clientX - panStartX);
    ty = startTy + (e.clientY - panStartY);
    apply();
  });
  window.addEventListener('mouseup', () => { mouseDown = false; });

  wrapEl.querySelectorAll('.img-viewer-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (action === 'zoomin') { scale = clampScale(scale + 0.4); apply(); }
      else if (action === 'zoomout') { scale = clampScale(scale - 0.4); apply(); }
      else if (action === 'rotate') { rotation = (rotation + 90) % 360; apply(); }
      else if (action === 'reset') { reset(); }
      else if (action === 'fullscreen') { toggleImageViewerFullscreen(wrapEl); }
    });
  });

  return { reset };
}

function toggleImageViewerFullscreen(wrapEl) {
  const isNativeFs = document.fullscreenElement || document.webkitFullscreenElement;
  if (!isNativeFs && !wrapEl.classList.contains('force-fullscreen')) {
    if (wrapEl.requestFullscreen) wrapEl.requestFullscreen().catch(() => wrapEl.classList.add('force-fullscreen'));
    else if (wrapEl.webkitRequestFullscreen) wrapEl.webkitRequestFullscreen();
    else wrapEl.classList.add('force-fullscreen'); // بازگشتی برای مرورگرهایی مثل سافاری iOS که Fullscreen API روی عنصر دلخواه را پشتیبانی نمی‌کنند
  } else {
    exitImageViewerFullscreen(wrapEl);
  }
}
function exitImageViewerFullscreen(wrapEl) {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else if (document.webkitFullscreenElement && document.webkitExitFullscreen) document.webkitExitFullscreen();
  wrapEl.classList.remove('force-fullscreen');
}

const mokatibBtn1ImageViewer = setupImageViewer(document.getElementById('mokatib-public-btn1-popup-imgwrap'));

/* ===== دکمهٔ دوم صفحهٔ عمومی مکاتب: پنجرهٔ چارت دکمه‌ای (متن بالا + دکمهٔ هر مورد ثبت‌شده) ===== */
const mokatibBtn2ImageViewer = setupImageViewer(document.getElementById('mokatib-btn2-detail-imgwrap'));
let mokatibBtn2Path = [];

/* اسلایدر عکس‌های هر مورد (زیر عکس اصلی در پنجرهٔ تمام‌صفحهٔ مکاتب)؛ اسلاید خودکار، نقطه‌ها و کشیدن با انگشت */
let mokatibDetailSliderTimer = null;
function clearMokatibDetailSlider() {
  if (mokatibDetailSliderTimer) { clearInterval(mokatibDetailSliderTimer); mokatibDetailSliderTimer = null; }
  const holder = document.getElementById('mokatib-btn2-detail-slider');
  if (holder) { holder.classList.add('hidden'); holder.innerHTML = ''; }
}
function renderMokatibDetailSlider(urls) {
  clearMokatibDetailSlider();
  const holder = document.getElementById('mokatib-btn2-detail-slider');
  const list = (urls || []).map((u) => secureUrl(u)).filter(Boolean);
  if (!holder || !list.length) return;
  const slidesHtml = list.map((u) => `<div class="mokatib-slide"><img src="${u}" alt="" draggable="false"></div>`).join('');
  const dotsHtml = list.length > 1
    ? `<div class="mokatib-slider-dots">${list.map((_, i) => `<span class="mokatib-slider-dot${i === 0 ? ' active' : ''}"></span>`).join('')}</div>`
    : '';
  holder.innerHTML = `<div class="mokatib-slider"><div class="mokatib-slider-track">${slidesHtml}</div></div>${dotsHtml}`;
  holder.classList.remove('hidden');
  if (list.length <= 1) return;
  const slider = holder.querySelector('.mokatib-slider');
  const track = holder.querySelector('.mokatib-slider-track');
  const dots = holder.querySelectorAll('.mokatib-slider-dot');
  const count = list.length;
  let idx = 0;
  function goTo(i) {
    idx = ((i % count) + count) % count;
    track.style.transform = `translateX(-${idx * 100}%)`;
    dots.forEach((d, di) => d.classList.toggle('active', di === idx));
  }
  function restart() {
    if (mokatibDetailSliderTimer) clearInterval(mokatibDetailSliderTimer);
    mokatibDetailSliderTimer = setInterval(() => goTo(idx + 1), 4500);
  }
  dots.forEach((d, di) => d.addEventListener('click', () => { goTo(di); restart(); }));
  let sx = null, sy = null;
  slider.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  slider.addEventListener('touchend', (e) => {
    if (sx === null) return;
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    sx = null; sy = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) { goTo(dx < 0 ? idx + 1 : idx - 1); restart(); }
  }, { passive: true });
  restart();
}

/* قانون «کلمه هرگز تقسیم نشود»: اگر کلمه در یک خط جا نشد، کل کلمه به خط بعد می‌رود.
   اگر حتی تنها در یک خط هم جا نمی‌شد (کلمهٔ خیلی بلند)، نوشته کمی کوچک می‌شود تا کامل و بی‌بریدگی دیده شود.
   ۱) اول پیوندِ کلمه‌ها (فاصلهٔ چسبان) برداشته می‌شود تا هر کلمه خودش جابه‌جا شود؛ ۲) بعد در صورت نیاز اندازهٔ نوشته کم می‌شود. */
function mkFitText(el) {
  if (!el || !el.isConnected) return;
  const over = () => el.scrollWidth > el.clientWidth + 1;
  if (el.clientWidth < 5 || !over()) return;
  if (/\u00A0/.test(el.textContent)) {
    el.textContent = el.textContent.replace(/\u00A0/g, ' ');
    if (!over()) return;
  }
  let fs = parseFloat(getComputedStyle(el).fontSize) || 14;
  const min = Math.max(8, fs * 0.55);
  let guard = 40;
  while (over() && fs > min && guard-- > 0) { fs -= 0.5; el.style.fontSize = fs + 'px'; }
}
function mkFitAll() {
  document.querySelectorAll('#mokatib-btn2-buttons .mokatib-btn2-name, #mokatib-btn2-buttons .mokatib-btn2-place, #mokatib-btn2-buttons .mokatib-btn2-imam, #mokatib-btn2-detail-name, #mokatib-btn2-detail-info').forEach(mkFitText);
}
function mkFitSoon() {
  requestAnimationFrame(() => { mkFitAll(); requestAnimationFrame(mkFitAll); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { mkFitAll(); }).catch(() => {});
}

/* مرتب‌کردن نوشتار دکمه‌های مساجد: فاصلهٔ اضافه حذف، فاصلهٔ قبل از «(»، و کلمه‌هایی که نباید از هم جدا شوند
   (مثل «رسول الله» یا «مولوی + نام») با فاصلهٔ چسبان به هم بسته می‌شوند تا در شکستن خط وسط کلمه‌ها نیفتند. */
function mkTidy(t) {
  let x = String(t == null ? '' : t).replace(/[\u200B\u200E\u200F]/g, '').replace(/\s+/g, ' ').trim();
  x = x.replace(/\s*([(（])\s*/g, ' $1').replace(/\s*([)）])/g, '$1');
  const NB = '\u00A0';
  x = x.replace(/(محمد|رسول)\s+(رسول|الله)/g, '$1' + NB + '$2');
  x = x.replace(/(رسول|عبد|ابو|ابی|ابن)\s+(الله|الرحمن|الرحیم|العظیم|الدین|ذر|بکر)/g, '$1' + NB + '$2');
  x = x.replace(/(مولوی|مولانا|مفتی|شیخ|حاج|دکتر|آقای|حافظ|قاری|مهندس)\s+(?!مولوی|مولانا|مفتی|شیخ|حاج|دکتر|آقای|حافظ|قاری|مهندس)/g, '$1' + NB); // فقط لقب به نام بعدی بچسبد، زنجیره نشود
  x = x.replace(/(\s)(\S{1,2})\s+(?=\S)/g, '$1$2' + NB); // کلمهٔ خیلی کوتاه به کلمهٔ بعدی بچسبد
  return x;
}
/* نوشتار چندخطی (مثل اکسل): مدیر در پیشخوان با Alt+Enter داخل خود فیلد به خط بعد می‌رود.
   اگر در نام یا مسئول شکست خط دستی باشد، همان خط‌ها عیناً نمایش داده می‌شوند (بدون شکستن خودکار نام/محله). */
function mkHasBreak(t) { return /\n/.test(String(t == null ? '' : t).replace(/\r/g, '').trim()); }
function mkTidyLines(t) {
  return String(t == null ? '' : t).replace(/\r/g, '').split('\n').map((l) => mkTidy(l).trim()).filter(Boolean).join('\n');
}
function mkSplitName(name) {
  const t = String(name == null ? '' : name).replace(/\s+/g, ' ').trim();
  const m = /^(.*?)\s*[(（]\s*([^)）]+?)\s*[)）]\s*$/.exec(t);
  if (m && m[1]) return { main: m[1], place: m[2] };
  return { main: t, place: '' };
}

function renderMokatibBtn2View() {
  const parentId = mokatibBtn2Path.length ? mokatibBtn2Path[mokatibBtn2Path.length - 1] : null;
  const mosques = mokatibState.publicMosques || [];
  const detailBlock = document.getElementById('mokatib-btn2-detail');
  const grid = document.getElementById('mokatib-btn2-buttons');

  if (parentId !== null) {
    const m = mosques.find((x) => Number(x.id) === Number(parentId));
    if (m) {
      renderMokatibDetailSlider(m.slides);
      detailBlock.classList.remove('hidden');
      const dNameEl = document.getElementById('mokatib-btn2-detail-name');
      dNameEl.textContent = mkTidyLines(m.name);
      dNameEl.style.whiteSpace = 'pre-line';
      dNameEl.style.fontSize = Number(m.name_size) > 0 ? (Number(m.name_size) + 4) + 'px' : '';
      const dInfoEl = document.getElementById('mokatib-btn2-detail-info');
      dInfoEl.textContent = m.imam_name ? 'مسئول: ' + mkTidyLines(m.imam_name) : '';
      dInfoEl.style.whiteSpace = 'pre-line';
      dInfoEl.style.fontSize = Number(m.imam_size) > 0 ? (Number(m.imam_size) + 1.5) + 'px' : '';
      mkFitSoon();
      const imgEl = document.getElementById('mokatib-btn2-detail-img');
      const wrapEl = document.getElementById('mokatib-btn2-detail-imgwrap');
      if (m.image_url) {
        imgEl.src = secureUrl(m.image_url);
        wrapEl.style.display = 'block';
        if (mokatibBtn2ImageViewer) mokatibBtn2ImageViewer.reset();
      } else {
        wrapEl.style.display = 'none';
        imgEl.removeAttribute('src');
      }
    }
  } else {
    clearMokatibDetailSlider();
    detailBlock.classList.add('hidden');
  }

  grid.innerHTML = '';
  const columns = (mokatibState.publicBtn2Popup && mokatibState.publicBtn2Popup.columns) || 3;
  // عرض هر دکمه از روی این متغیر در CSS محاسبه می‌شود (به‌جای grid-template-columns)
  // تا دکمه‌ها همیشه هم‌اندازه و کل ردیف (حتی سطر ناقص) وسط‌چین بماند.
  grid.style.setProperty('--btn2-cols', columns);
  const children = mosques.filter((x) => (parentId === null ? !x.parent_id : Number(x.parent_id) === Number(parentId)));
  if (!children.length) {
    if (parentId === null) grid.innerHTML = '<p class="note-empty">موردی ثبت نشده است.</p>';
    return;
  }
  children.forEach((m) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'secondary-btn' + (m.imam_name ? '' : ' mk-no-imam');
    // نام مسجد: بخش اصلی در یک خط (مرتب و متوازن)، نام محله (داخل پرانتز) جدا زیرش
    const manualName = mkHasBreak(m.name); // شکست خط دستی (Alt+Enter) → همان خط‌ها
    const parts = manualName ? { main: m.name, place: '' } : mkSplitName(m.name);
    const nameEl = document.createElement('span');
    nameEl.className = 'mokatib-btn2-name' + (manualName ? ' mk-multiline' : '');
    nameEl.textContent = manualName ? mkTidyLines(m.name) : mkTidy(parts.main);
    if (Number(m.name_size) > 0) nameEl.style.fontSize = Number(m.name_size) + 'px';
    btn.appendChild(nameEl);
    if (parts.place) {
      const placeEl = document.createElement('span');
      placeEl.className = 'mokatib-btn2-place';
      placeEl.textContent = mkTidy(parts.place);
      if (Number(m.name_size) > 0) placeEl.style.fontSize = (Number(m.name_size) * 0.82) + 'px';
      btn.appendChild(placeEl);
    }
    if (m.imam_name) {
      const imamEl = document.createElement('span');
      const manualImam = mkHasBreak(m.imam_name);
      imamEl.className = 'mokatib-btn2-imam' + (manualImam ? ' mk-multiline' : '');
      imamEl.textContent = 'مسئول:\u00A0' + (manualImam ? mkTidyLines(m.imam_name) : mkTidy(m.imam_name));
      if (Number(m.imam_size) > 0) imamEl.style.fontSize = Number(m.imam_size) + 'px';
      btn.appendChild(imamEl);
    }
    btn.title = String(m.name || '').replace(/\s*\n\s*/g, ' ') + (m.imam_name ? ' — مسئول: ' + String(m.imam_name).replace(/\s*\n\s*/g, ' ') : '');
    if (m.btn_color) btn.style.background = m.btn_color;
    btn.addEventListener('click', () => {
      mokatibBtn2Path.push(m.id);
      renderMokatibBtn2View();
      pushOverlay('btn2', undoMokatibBtn2Step);
    });
    grid.appendChild(btn);
  });
  mkFitSoon();
}

function undoMokatibBtn2Step() {
  mokatibBtn2Path.pop();
  renderMokatibBtn2View();
}
function closeMokatibBtn2Popup() {
  clearMokatibDetailSlider();
  exitImageViewerFullscreen(document.getElementById('mokatib-btn2-detail-imgwrap'));
  document.getElementById('mokatib-public-btn2-popup').classList.add('hidden');
}
document.getElementById('mokatib-public-btn2').addEventListener('click', () => {
  const popup = mokatibState.publicBtn2Popup || { text: '' };
  const textEl = document.getElementById('mokatib-btn2-popup-text');
  textEl.classList.toggle('hidden', !popup.text);
  if (popup.text) applyMokatibPopupText(textEl, popup);
  mokatibBtn2Path = [];
  renderMokatibBtn2View();
  document.getElementById('mokatib-public-btn2-popup').classList.remove('hidden');
  pushOverlay('btn2', closeMokatibBtn2Popup);
});
document.getElementById('mokatib-btn2-popup-close').addEventListener('click', () => {
  overlayGo('btn2', 0, closeMokatibBtn2Popup);
});
document.getElementById('mokatib-btn2-back').addEventListener('click', () => {
  overlayGo('btn2', 1, undoMokatibBtn2Step);
});

const MOKATIB_PUBLIC_CACHE_KEY = 'arefanejam_mokatib_public_cache';

function applyMokatibPublicData(data) {
  document.getElementById('mokatib-public-head-name').textContent = (data.head && data.head.name) || 'دفتر مرکزی امور مکاتب';
  document.getElementById('mokatib-public-head-desc').textContent = (data.head && data.head.desc) || '';
  const pubChart = document.getElementById('mokatib-public-chart-img');
  if (pubChart) {
    const chartUrl = secureUrl(data.head && data.head.chart);
    if (chartUrl) { pubChart.src = chartUrl; pubChart.style.display = 'block'; }
    else { pubChart.removeAttribute('src'); pubChart.style.display = 'none'; }
  }

  const btns = data.public_buttons || {};
  const textEl = document.getElementById('mokatib-public-buttons-text');
  const btn1 = document.getElementById('mokatib-public-btn1');
  const btn2 = document.getElementById('mokatib-public-btn2');
  const btnRow = btn1.closest('.mokatib-public-btn-row');
  textEl.textContent = btns.text || '';
  textEl.classList.toggle('hidden', !btns.text);
  btn1.textContent = btns.btn1 || '';
  btn2.textContent = btns.btn2 || '';
  btn1.style.background = btns.btn1_color || '';
  btn2.style.background = btns.btn2_color || '';
  const hasBtn1 = !!btns.btn1, hasBtn2 = !!btns.btn2;
  btn1.classList.toggle('hidden', !hasBtn1);
  btn2.classList.toggle('hidden', !hasBtn2);
  if (btnRow) btnRow.classList.toggle('hidden', !hasBtn1 && !hasBtn2);

  mokatibState.publicBtn1Popup = {
    image: btns.btn1_popup_image || '',
    text: btns.btn1_popup_text || '',
    textColor: btns.btn1_popup_text_color || '',
    font: btns.btn1_popup_font || 'default',
    effect: btns.btn1_popup_effect || 'fade',
  };
  mokatibState.publicBtn2Popup = {
    text: btns.btn2_popup_text || '',
    textColor: btns.btn2_popup_text_color || '',
    font: btns.btn2_popup_font || 'default',
    effect: btns.btn2_popup_effect || 'fade',
    columns: Math.max( 1, Math.min( 6, parseInt( btns.btn2_columns, 10 ) || 3 ) ),
  };
  mokatibState.publicMosques = data.mosques || [];
}

async function loadMokatibPublicTree() {
  const wrap = document.getElementById('mokatib-public-tree');
  // اول همان لحظه آخرین نسخهٔ ذخیره‌شده روی گوشی (عکس‌ها و نام‌ها)، بعد تازه‌سازی بی‌صدا از سایت
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(MOKATIB_PUBLIC_CACHE_KEY) || 'null'); } catch (e2) {}
  let shown = null;
  if (cached) {
    try {
      shown = JSON.stringify(cached);
      applyMokatibPublicData(cached);
      renderMokatibPublicTreeBody(wrap);
    } catch (e3) { shown = null; cached = null; }
  }
  if (!cached) wrap.innerHTML = '<p class="muted-text small">در حال بارگذاری...</p>';
  try {
    const data = await apiFetch('/mokatib/public-tree');
    try { localStorage.setItem(MOKATIB_PUBLIC_CACHE_KEY, JSON.stringify(data)); } catch (e) {}
    let str = null;
    try { str = JSON.stringify(data); } catch (e) {}
    if (shown === null || str === null || str !== shown) {
      applyMokatibPublicData(data);
      renderMokatibPublicTreeBody(wrap);
    }
  } catch (e) {
    // آفلاین یا خطای شبکه: اگر نسخهٔ ذخیره‌شده نمایش داده شده باشد همان می‌ماند
    if (!cached) wrap.innerHTML = '<p class="note-empty">در حال حاضر امکان بارگذاری چارت وجود ندارد.</p>';
  }
}

function renderMokatibPublicTreeBody(wrap) {
  wrap.innerHTML = '';
  if (!mokatibState.publicMosques.length) {
    wrap.innerHTML = '<p class="note-empty">موردی ثبت نشده است.</p>';
    return;
  }
  const rootUl = renderFamilyTreeLevel(null, true);
  wrap.appendChild(rootUl);
}

function renderFamilyTreeLevel(parentId, isRootLevel) {
  const children = mokatibState.publicMosques.filter((m) => (parentId === null ? !m.parent_id : Number(m.parent_id) === Number(parentId)));
  const ul = document.createElement('ul');
  if (!isRootLevel) ul.classList.add('collapsed');
  children.forEach((m) => {
    const li = document.createElement('li');
    const hasChildren = mokatibState.publicMosques.some((x) => Number(x.parent_id) === Number(m.id));

    const node = document.createElement('div');
    node.className = 'family-tree-node' + (hasChildren ? '' : ' leaf');
    node.innerHTML = (hasChildren ? '<span class="ft-toggle">›</span>' : '') +
      '<span>' + m.name + '</span>' +
      (m.imam_name ? '<span class="ft-imam">— ' + m.imam_name + '</span>' : '');

    li.appendChild(node);

    if (hasChildren) {
      const childUl = renderFamilyTreeLevel(m.id, false);
      li.appendChild(childUl);
      node.addEventListener('click', () => {
        const isOpen = node.classList.toggle('is-open');
        childUl.classList.toggle('collapsed', !isOpen);
      });
    }
    ul.appendChild(li);
  });
  return ul;
}

function mokatibFetch(path, options = {}) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
  if (mokatibState.token) headers['X-Mokatib-Token'] = mokatibState.token;
  const isGet = !options.method || String(options.method).toUpperCase() === 'GET';
  if (isGet) {
    options = Object.assign({}, options, { cache: 'no-store' });
    path += (path.indexOf('?') === -1 ? '?' : '&') + '_t=' + Date.now();
  }
  return fetch(state.apiUrl.replace(/\/$/, '') + path, Object.assign({}, options, { headers }))
    .then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'خطا');
      return data;
    });
}

document.getElementById('mokatib-login-btn').addEventListener('click', async () => {
  const username = document.getElementById('mokatib-username').value.trim();
  const password = document.getElementById('mokatib-password').value;
  const errEl = document.getElementById('mokatib-login-error');
  errEl.textContent = '';
  try {
    const data = await mokatibFetch('/mokatib/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    mokatibState.token = data.token;
    sessionStorage.setItem('arefanejam_mokatib_token', data.token);
    switchToTab('mokatib-home');
    loadMokatibHome();
  } catch (e) { errEl.textContent = 'نام کاربری یا رمز عبور اشتباه است.'; }
});

document.getElementById('mokatib-logout-btn').addEventListener('click', () => {
  mokatibState.token = '';
  sessionStorage.removeItem('arefanejam_mokatib_token');
  switchToTab('mokatib-login');
});

async function loadMokatibHome() {
  try {
    const head = await mokatibFetch('/mokatib/head');
    document.getElementById('mokatib-head-name').textContent = head.name || 'دفتر مرکزی امور مکاتب';
    document.getElementById('mokatib-head-desc').textContent = head.desc || '';
    const chartImg = document.getElementById('mokatib-chart-img');
    if (head.chart) { chartImg.src = secureUrl(head.chart); chartImg.style.display = 'block'; }
    mokatibState.allMosques = await mokatibFetch('/mokatib/mosques');
    renderMokatibTree(null, 'mokatib-tree-list');
  } catch (e) {
    mokatibState.token = '';
    sessionStorage.removeItem('arefanejam_mokatib_token');
    switchToTab('mokatib-login');
  }
}

function renderMokatibTree(parentId, listElId) {
  const el = document.getElementById(listElId);
  el.innerHTML = '';
  const children = mokatibState.allMosques.filter((m) => (parentId === null ? !m.parent_id : Number(m.parent_id) === Number(parentId)));
  if (!children.length) { el.innerHTML = '<p class="note-empty">موردی ثبت نشده است.</p>'; return; }
  children.forEach((m) => {
    const row = document.createElement('div');
    row.className = 'city-row';
    row.innerHTML = `<strong>${m.name}</strong>${m.imam_name ? ' — مسئول: ' + m.imam_name : ''}`;
    row.addEventListener('click', () => openMokatibMosque(m.id));
    el.appendChild(row);
  });
}

function renderFullMokatibChart(parentId, container) {
  const children = mokatibState.allMosques.filter((m) => (parentId === null ? !m.parent_id : Number(m.parent_id) === Number(parentId)));
  if (!children.length) return;
  const ul = document.createElement('ul');
  children.forEach((m) => {
    const li = document.createElement('li');
    const node = document.createElement('span');
    node.className = 'org-chart-node';
    node.textContent = m.name + (m.imam_name ? ' (' + m.imam_name + ')' : '');
    li.appendChild(node);
    renderFullMokatibChart(m.id, li);
    ul.appendChild(li);
  });
  container.appendChild(ul);
}

document.getElementById('mokatib-chart-btn').addEventListener('click', () => {
  const wrap = document.getElementById('mokatib-chart-tree');
  wrap.innerHTML = '';
  if (!mokatibState.allMosques.length) {
    wrap.innerHTML = '<p class="note-empty">موردی ثبت نشده است.</p>';
  } else {
    renderFullMokatibChart(null, wrap);
  }
  document.getElementById('mokatib-chart-modal').classList.remove('hidden');
  pushOverlay('chart', closeMokatibChartModal);
});
function closeMokatibChartModal() {
  document.getElementById('mokatib-chart-modal').classList.add('hidden');
}
document.getElementById('mokatib-chart-close-btn').addEventListener('click', () => {
  overlayGo('chart', 0, closeMokatibChartModal);
});

function openMokatibMosque(mosqueId) {
  const m = mokatibState.allMosques.find((x) => Number(x.id) === Number(mosqueId));
  if (!m) return;
  mokatibState.currentMosqueId = mosqueId;
  document.getElementById('mokatib-mosque-name').textContent = m.name;
  document.getElementById('mokatib-mosque-info').textContent =
    [m.address, m.imam_name ? 'مسئول: ' + m.imam_name : '', m.phone, m.extra_info].filter(Boolean).join(' | ');
  renderMokatibTree(mosqueId, 'mokatib-mosque-children-list');
  loadMokatibMeetings(mosqueId, 0);
  switchToTab('mokatib-mosque', { push: true });
}

const monthSelectEl = document.getElementById('mokatib-search-month');
JALALI_MONTHS.forEach((m, i) => { monthSelectEl.innerHTML += `<option value="${i + 1}">${m}</option>`; });
monthSelectEl.addEventListener('change', () => {
  loadMokatibMeetings(mokatibState.currentMosqueId, parseInt(monthSelectEl.value, 10));
});

async function loadMokatibMeetings(mosqueId, month) {
  const el = document.getElementById('mokatib-meetings-list');
  el.innerHTML = '<p class="muted-text small" style="padding:0 18px">در حال بارگذاری...</p>';
  try {
    let url = `/mokatib/meetings?mosque_id=${mosqueId}`;
    if (month) url += `&month=${month}`;
    const meetings = await mokatibFetch(url);
    el.innerHTML = '';
    if (!meetings.length) { el.innerHTML = '<p class="note-empty">جلسه‌ای ثبت نشده است.</p>'; return; }
    meetings.forEach((mt) => {
      const card = document.createElement('div');
      card.className = 'meeting-card';
      const photosHtml = (mt.photo_urls || []).map((p) => `<img src="${p}">`).join('');
      card.innerHTML = `
        <span class="meeting-date">${toPersianDigits(mt.jalali_day)} ${JALALI_MONTHS[mt.jalali_month - 1]} ${toPersianDigits(mt.jalali_year)}</span>
        <h4>${mt.title || 'جلسه'}</h4>
        <p class="muted-text small" style="white-space:normal">${mt.resolutions_text || ''}</p>
        ${photosHtml ? `<div class="meeting-photos">${photosHtml}</div>` : ''}`;
      el.appendChild(card);
    });
  } catch (e) { el.innerHTML = '<p class="note-empty">خطا در دریافت اطلاعات.</p>'; }
}

(function setupDevPanelToggle() {
  let tapCount = 0, tapTimer = null;
  const trigger = document.getElementById('footer-credit-tap');
  if (!trigger) return;
  trigger.addEventListener('click', () => {
    tapCount++;
    clearTimeout(tapTimer);
    tapTimer = setTimeout(() => { tapCount = 0; }, 2500);
    if (tapCount >= 5) { tapCount = 0; document.getElementById('dev-panel').classList.toggle('hidden'); }
  });
})();

document.getElementById('settings-save-api-btn').addEventListener('click', () => {
  const url = document.getElementById('settings-api-url').value.trim();
  if (url) {
    state.apiUrl = url;
    localStorage.setItem('arefanejam_api_url', url);
    appAlert('api_url_saved');
  }
});

/* ---------- شناسه یکتای دستگاه (توسط سرور اختصاص داده می‌شود) ---------- */
let deviceIdPromise = null;
function ensureDeviceId() {
  const existing = localStorage.getItem('arefanejam_device_id');
  if (existing) return Promise.resolve(existing);
  if (!deviceIdPromise) {
    deviceIdPromise = apiFetch('/register-device', { method: 'POST' })
      .then((res) => {
        const id = res && res.device_id;
        if (id) { localStorage.setItem('arefanejam_device_id', id); return id; }
        return 'dev-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
      })
      .catch(() => 'dev-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10));
  }
  return deviceIdPromise;
}
/* ---------- آمار نصب/آنلاین (heartbeat) ---------- */
async function sendHeartbeat() {
  const device_id = await ensureDeviceId();
  apiFetch('/heartbeat', { method: 'POST', body: JSON.stringify({ device_id }) }).catch(() => {});
  syncDeviceIdToServiceWorker(device_id);
}
sendHeartbeat();
setInterval(() => { if (!document.hidden) sendHeartbeat(); }, 60000);

/* ---------- درخواست اولیهٔ موقعیت مکانی (اولین باز کردن اپ) ----------
   اگر مجوز موقعیت مکانی هنوز مشخص نشده، به‌جای درخواست خاموش (که ممکن است بدون توضیح
   توسط کاربر رد شود)، اول پنجرهٔ خوش‌آمدگویی توضیح می‌دهد که این مجوز برای چیست؛ در همین حین
   اپ با آخرین موقعیت شناخته‌شده یا موقعیت پیش‌فرض ادمین کار می‌کند تا کاربر معطل نماند. */
function initLocationFlow() {
  if (state.manualCity || loadCachedCoords() || localStorage.getItem('arefanejam_location_prompted') || !navigator.geolocation) {
    setupLocation();
    return;
  }
  const askLater = () => { setupLocation(true); showLocationOnboarding(); };
  if (navigator.permissions && navigator.permissions.query) {
    navigator.permissions.query({ name: 'geolocation' }).then((status) => {
      if (status.state === 'prompt') { askLater(); return; }
      localStorage.setItem('arefanejam_location_prompted', '1');
      setupLocation();
    }).catch(askLater);
  } else {
    askLater();
  }
}
function showLocationOnboarding() {
  setTimeout(() => {
    const m = document.getElementById('onboarding-location-modal');
    if (m) m.classList.remove('hidden');
  }, 800);
}
document.getElementById('onboarding-location-yes-btn').addEventListener('click', () => {
  localStorage.setItem('arefanejam_location_prompted', '1');
  document.getElementById('onboarding-location-modal').classList.add('hidden');
  const btn = document.getElementById('onboarding-location-yes-btn');
  const original = btn.textContent;
  btn.textContent = 'در حال یافتن موقعیت...';
  btn.disabled = true;
  fetchExactGPSLocation((error) => {
    btn.textContent = original;
    btn.disabled = false;
    if (error) setLocationLabel(error);
  });
});
document.getElementById('onboarding-location-later-btn').addEventListener('click', () => {
  localStorage.setItem('arefanejam_location_prompted', '1');
  document.getElementById('onboarding-location-modal').classList.add('hidden');
});

/* ---------- ثبت زودهنگام سرویس‌ورکر، مستقل از نوتیفیکیشن ----------
   قبلاً push-worker.js (که کش‌کردن فایل صوتی اذان برای پخش آفلاین را انجام می‌دهد)
   فقط وقتی ثبت می‌شد که کاربر نوتیفیکیشن را فعال می‌کرد؛ یعنی کاربرانی که هیچ‌وقت
   نوتیفیکیشن را روشن نمی‌کردند، اصلاً کش آفلاینی برای اذان نداشتند. حالا مستقل از
   نوتیفیکیشن و بدون نیاز به اجازهٔ کاربر، همان اول بازشدنِ اپ ثبت می‌شود تا کش آفلاین
   اذان برای همهٔ کاربران کار کند. */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('push-worker.js').then((reg) => {
    // هر بار اپ باز می‌شود، فوراً از سرور می‌پرسد که آیا نسخهٔ تازه‌تری از سرویس‌ورکر
    // (push-worker.js) هست یا نه؛ به این ترتیب هر آپدیتی حداکثر با یک بار باز کردن
    // اپ روی گوشی اعمال می‌شود، نه با تا ۲۴ ساعت تأخیرِ پیش‌فرض مرورگر.
    reg.update().catch(() => {});
    // ثبت Periodic Background Sync: لایهٔ یدکیِ هشدار اذان وقتی اپ کاملاً بسته است.
    // فقط در کروم/اندروید (و فقط برای اپ نصب‌شده روی گوشی) در دسترس است؛ در بقیهٔ
    // مرورگرها (از جمله سافاری) بی‌سروصدا نادیده گرفته می‌شود.
    if (reg && 'periodicSync' in reg) {
      reg.periodicSync.register('arefanejam-azan-check', { minInterval: 20 * 60 * 1000 }).catch(() => {});
    } else if (reg && 'sync' in reg) {
      // یدکِ یدک: اگر Periodic Sync نبود ولی Background Sync معمولی بود، حداقل
      // با هر بار وصل‌شدن دوبارهٔ اینترنت یک چک انجام می‌شود.
      reg.sync.register('arefanejam-azan-check').catch(() => {});
    }
  }).catch(() => {});
}

/* ---------- راه‌اندازی اولیه ---------- */
document.getElementById('settings-api-url').value = state.apiUrl;
switchToTab(currentTab);
loadSettings().then(() => { initLocationFlow(); });
prepareTodayShareVerse();
loadCalendarEvents();
loadTheme();
loadAzanExceptions();
loadDailyDeedsItems().then(checkDeedsPopupDue);
loadCharitySettings();
loadShariqSettings();
loadKhatmSettings();
setTimeout(khatmCheckNews, 9000);
loadNotes();
setTimeout(checkEidCelebration, 2500);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) eidAmbientStop(); // اپ در پس‌زمینه است: بوم را نگه ندار (مصرف باتری)
  else checkEidCelebration({ resume: true });
});

if ('serviceWorker' in navigator) {
  // فقط سرویس‌ورکرهای قدیمیِ غیرمرتبط با نوتیفیکیشن پاک می‌شوند
  // (push-worker.js را دست نمی‌زنیم چون خود اپ برای اعلان‌های واقعی و کش آفلاین اذان به آن نیاز دارد).
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((reg) => {
      const url = (reg.active && reg.active.scriptURL) || (reg.installing && reg.installing.scriptURL) || (reg.waiting && reg.waiting.scriptURL) || '';
      if (!url.includes('push-worker.js')) reg.unregister();
    });
  });
  if (window.caches) {
    // کش‌های «پخش آفلاین اذان» و «پوستهٔ اصلی اپ» حذف نشوند؛ قبلاً این خط با هر بار
    // باز شدن اپ همهٔ کش‌ها را پاک می‌کرد و در نتیجه چیزی برای کارکرد آفلاین باقی نمی‌ماند.
    caches.keys().then((keys) => keys.forEach((k) => {
      if (k !== AZAN_OFFLINE_CACHE_NAME && k !== APP_SHELL_CACHE_NAME && k !== QURAN_AUDIO_CACHE_NAME && k !== ANNOUNCEMENT_AUDIO_CACHE_NAME && k !== CHARITY_MEDIA_CACHE_NAME && k !== SITE_MEDIA_CACHE_NAME && k !== EID_AUDIO_CACHE_NAME) caches.delete(k);
    }));
  }
}


/* ---------- پاک‌سازی اعلان‌های قدیمیِ اذان/نماز ----------
   فقط اعلانِ همان وقت باید در نوار اعلانات بماند. سرویس‌ورکر خودش قدیمی‌ها را
   می‌بندد؛ اینجا هم هنگام باز شدن اپ / برگشت به آن یک بار از او می‌خواهیم
   (بدون هیچ اینترنتی کار می‌کند). */
function clearStaleAzanNotifications() {
  try {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.getRegistration('push-worker.js').then((reg) => {
      const w = reg && (reg.active || navigator.serviceWorker.controller);
      if (w) w.postMessage({ type: 'AREFANEJAM_CLEAR_STALE_AZAN' });
    }).catch(() => {});
  } catch (e) {}
}
clearStaleAzanNotifications();
setTimeout(clearStaleAzanNotifications, 4000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) clearStaleAzanNotifications(); });
window.addEventListener('focus', clearStaleAzanNotifications);
setInterval(clearStaleAzanNotifications, 5 * 60 * 1000);


/* ---------- باز شدن اپ با لمس اعلان اذان ----------
   وقتی اپ کاملاً بسته بود و کاربر اعلان اذان را لمس کرد، سرویس‌ورکر اپ را با
   ?azan=<نماز>&at=<زمان> باز می‌کند؛ پیام مستقیم ممکن است پیش از آماده‌شدن صفحه گم شود.
   اینجا صبر می‌کنیم تنظیمات (حتی از کش آفلاین) بیاید و سپس اذان پخش می‌شود. */
(function playAzanFromLaunchLink() {
  let label = '', at = 0;
  try {
    const q = new URLSearchParams(location.search);
    if (!q.has('azan')) return;
    label = q.get('azan') || '';
    at = Number(q.get('at') || 0);
    history.replaceState(null, '', location.pathname + location.hash);
  } catch (e) { return; }
  if (at && Date.now() - at > 30 * 60000) return; // قدیمی است؛ دیگر پخش نشود
  let tries = 0;
  const timer = setInterval(() => {
    tries++;
    const s = state.settings || {};
    if (s.azan_audio_url !== undefined || tries > 12) {
      clearInterval(timer);
      playAzanSound(label);
    }
  }, 500);
})();

/* ===================== مصحف صفحه‌ای =====================
   قرآن را مثل مصحف چاپی (۶۰۴ صفحه) نشان می‌دهد: هر بار فقط یک صفحه، با نوار بالای «جزء / شمارهٔ صفحه / سوره»،
   و با کشیدن انگشت به چپ و راست صفحه عوض می‌شود. دادهٔ آن همان متن آفلاینِ ذخیره‌شدهٔ قرآن است (فیلد page
   هر آیه)، پس بعد از اولین ذخیره بدون اینترنت هم کار می‌کند. ردیابِ خواندن، پخش صوت، نشان‌کردن و اشتراک‌گذاری
   همان سازوکارهای قبلی را به کار می‌برند. (از var استفاده شده تا حتی اگر کدی زودتر صدا زده شود خطا ندهد.) */
var QURAN_TOTAL_PAGES = 604;
var QPAGE_LAST_KEY = 'arefanejam_quran_last_page';
var QP_BASMALA = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ';
var qpActive = false;      // الان خواننده در حالت مصحف صفحه‌ای است؟
var qpIndex = null;        // ایندکس صفحات؛ qpIndex[شمارهٔ صفحه] = آیه‌های همان صفحه
var qpPage = 0;            // صفحهٔ نمایش‌داده‌شده
var qpAyahs = [];          // آیه‌های صفحهٔ فعلی
var qpSelectedIdx = -1;    // آیهٔ انتخاب‌شده (برای نوار گزینه‌ها)
var qpLoadToken = 0;

function qpSetMode(on) {
  qpActive = !!on;
  const sec = document.getElementById('tab-quran-reader');
  if (sec) sec.classList.toggle('page-mode', qpActive);
}

function qpNormalizeWord(w) {
  return String(w).replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '').replace(/\u0671/g, '\u0627');
}
// در متن قرآنِ ذخیره‌شده، «بسم الله...» اول آیهٔ ۱ همهٔ سوره‌ها (جز حمد و توبه) چسبیده است؛ در مصحف
// به‌صورت یک خطِ جدا زیر عنوان سوره می‌آید. فقط اگر مطمئن باشیم همان چهار کلمه است جدا می‌کنیم؛ وگرنه متن دست‌نخورده می‌ماند.
function qpAyahText(ayah) {
  if (ayah.numberInSurah !== 1 || ayah.surahNumber === 1 || ayah.surahNumber === 9) return ayah.text;
  const words = String(ayah.text).trim().split(/\s+/);
  if (words.length > 4 && qpNormalizeWord(words[0]) === 'بسم' && qpNormalizeWord(words[3]).indexOf('الرح') === 0) {
    return words.slice(4).join(' ');
  }
  return ayah.text;
}

async function qpEnsureData() {
  if (qpIndex) return qpIndex;
  let surahs = await getOfflineQuranText();
  if (!surahs) {
    await downloadQuranTextForOffline(false);
    surahs = await getOfflineQuranText();
  }
  if (!surahs) return null;
  const pages = [];
  for (let p = 0; p <= QURAN_TOTAL_PAGES; p++) pages.push([]);
  surahs.forEach((sr) => (sr.ayahs || []).forEach((a) => {
    if (a.page >= 1 && a.page <= QURAN_TOTAL_PAGES) {
      pages[a.page].push(Object.assign({}, a, { surahNumber: sr.number, surahName: sr.name, surahAyahCount: sr.ayahs.length }));
    }
  }));
  let filled = 0;
  for (let p = 1; p <= QURAN_TOTAL_PAGES; p++) if (pages[p].length) filled++;
  if (filled < 600) return null; // دادهٔ ناقص/بدون شمارهٔ صفحه
  qpIndex = pages;
  return qpIndex;
}

function qpFindPage(idx, surahNumber, ayahInSurah) {
  for (let p = 1; p <= QURAN_TOTAL_PAGES; p++) {
    const list = idx[p];
    for (let i = 0; i < list.length; i++) {
      if (list[i].surahNumber === surahNumber && list[i].numberInSurah === ayahInSurah) return p;
    }
  }
  return 1;
}
function qpFindPageOfJuz(idx, juz) {
  for (let p = 1; p <= QURAN_TOTAL_PAGES; p++) {
    if (idx[p].some((a) => a.juz === juz)) return p;
  }
  return 1;
}

// ورود به خواندنِ صفحه‌ای؛ opts: { surahNumber, scrollToAyah, juz, page, autoPlay, resumePage }
async function openQuranPageReader(opts) {
  opts = opts || {};
  resetPlaybackForNewContent();
  qpSetMode(true);
  switchToTab('quran-reader', { push: true });
  const pageEl = document.getElementById('qp-page');
  const token = ++qpLoadToken;
  document.getElementById('qp-juz').textContent = '—';
  document.getElementById('qp-page-num').textContent = '—';
  document.getElementById('qp-surah').textContent = '—';
  document.getElementById('qp-count').textContent = '—';
  qpClearSelection();
  pageEl.innerHTML = '<p class="muted-text qp-msg">در حال آماده‌سازی صفحات قرآن...</p>';
  const idx = await qpEnsureData();
  if (token !== qpLoadToken) return; // کاربر در این فاصله چیز دیگری را باز کرده
  if (!idx) {
    pageEl.innerHTML = '<p class="note-empty">برای استفاده از مصحف صفحه‌ای، یک‌بار با اینترنت وصل شوید تا متن قرآن روی گوشی ذخیره شود (بعد از آن بدون اینترنت هم کار می‌کند).</p>';
    return;
  }
  let page = Number(opts.page) || 0;
  if (!page && opts.juz) page = qpFindPageOfJuz(idx, opts.juz);
  if (!page && opts.surahNumber) {
    if (opts.resumePage && !opts.scrollToAyah) {
      const saved = Number(localStorage.getItem(QPAGE_LAST_KEY));
      if (saved >= 1 && saved <= QURAN_TOTAL_PAGES && idx[saved].some((a) => a.surahNumber === opts.surahNumber)) page = saved;
    }
    if (!page) page = qpFindPage(idx, opts.surahNumber, opts.scrollToAyah || 1);
  }
  if (!page) {
    const saved = Number(localStorage.getItem(QPAGE_LAST_KEY));
    page = (saved >= 1 && saved <= QURAN_TOTAL_PAGES) ? saved : 1;
  }
  qpShowPage(page, { focusSurah: opts.surahNumber, focusAyah: opts.scrollToAyah, autoPlay: opts.autoPlay });
}

// نمایش یک صفحه؛ o: { dir (+1 بعد / -1 قبل)، focusSurah، focusAyah، autoPlay }
function qpShowPage(page, o) {
  o = o || {};
  if (!qpIndex) return;
  page = Math.max(1, Math.min(QURAN_TOTAL_PAGES, Number(page) || 1));
  const ayahs = qpIndex[page];
  if (!ayahs || !ayahs.length) return;
  resetPlaybackForNewContent();
  qpPage = page;
  qpAyahs = ayahs;
  qpClearSelection();
  try { localStorage.setItem(QPAGE_LAST_KEY, String(page)); } catch (e) {}

  const first = ayahs[0];
  const prevSurah = currentSurahNumber;
  currentSurahNumber = first.surahNumber;
  if (prevSurah !== currentSurahNumber) primeQuranExitPopupBaseline(currentSurahNumber);
  try { localStorage.setItem('arefanejam_last_read', JSON.stringify({ number: first.surahNumber, name: first.surahName, ts: Date.now() })); } catch (e) {}

  // نوار بالا
  document.getElementById('qp-juz').textContent = 'جزء ' + toPersianDigits(first.juz);
  document.getElementById('qp-page-num').textContent = toPersianDigits(page);
  document.getElementById('qp-surah').textContent = first.surahName;
  document.getElementById('qp-count').textContent = 'صفحهٔ ' + toPersianDigits(page) + ' از ' + toPersianDigits(QURAN_TOTAL_PAGES);
  document.getElementById('qp-prev').disabled = page <= 1;
  document.getElementById('qp-next').disabled = page >= QURAN_TOTAL_PAGES;
  if (typeof qpMenuRefresh === 'function') qpMenuRefresh();

  // متن صفحه
  const pageEl = document.getElementById('qp-page');
  pageEl.innerHTML = '';
  const blocks = [];
  let para = null;
  ayahs.forEach((ayah, i) => {
    if (ayah.numberInSurah === 1) {
      const banner = document.createElement('div');
      banner.className = 'qp-surah-banner';
      banner.textContent = ayah.surahName;
      pageEl.appendChild(banner);
      if (ayah.surahNumber !== 1 && ayah.surahNumber !== 9) {
        const bs = document.createElement('div');
        bs.className = 'qp-basmala';
        bs.textContent = QP_BASMALA;
        pageEl.appendChild(bs);
      }
      para = null;
    }
    if (!para) {
      para = document.createElement('p');
      para.className = 'qp-text';
      pageEl.appendChild(para);
    }
    const span = document.createElement('span');
    span.className = 'ayah-block qp-ayah';
    span.appendChild(document.createTextNode(qpAyahText(ayah) + ' '));
    const mark = document.createElement('span');
    mark.className = 'qp-end';
    mark.textContent = toPersianDigits(ayah.numberInSurah);
    span.appendChild(mark);
    span.addEventListener('click', () => qpSelectAyah(i));
    para.appendChild(span);
    para.appendChild(document.createTextNode(' '));
    blocks.push(span);
    if (ayah.numberInSurah === ayah.surahAyahCount) para.classList.add('qp-text-end');
  });

  playbackQueue = ayahs;
  playbackBlocks = blocks;
  window.__currentSurahName = first.surahName;

  // برگشت به بالای صفحه + انیمیشن ورق‌خوردن (فقط اگر کاربر همین‌جا در حال خواندن است)
  const content = document.getElementById('content');
  if (currentTab === 'quran-reader') {
    content.style.scrollBehavior = 'auto';
    content.scrollTop = 0;
    content.style.scrollBehavior = '';
  }
  pageEl.classList.remove('qp-in-next', 'qp-in-prev');
  if (o.dir) {
    void pageEl.offsetWidth;
    pageEl.classList.add(o.dir > 0 ? 'qp-in-next' : 'qp-in-prev');
  }

  // ردیابِ خودکارِ «خواندن» (همان سازوکار قبلی) روی آیه‌های همین صفحه
  attachQuranReadingTracker(content, ayahs, blocks);
  highlightPreviouslyReadAyahs(ayahs, blocks);

  // پرش به یک آیهٔ مشخص (ادامهٔ سوره، جست‌وجو، نشان‌شده‌ها) و/یا پخش خودکار
  let startIdx = 0;
  let hasFocus = false;
  if (o.focusAyah) {
    const fi = ayahs.findIndex((a) => a.numberInSurah === o.focusAyah && (!o.focusSurah || a.surahNumber === o.focusSurah));
    if (fi >= 0) { startIdx = fi; hasFocus = true; }
  }
  if (hasFocus) {
    qpSelectAyah(startIdx, false);
    if (currentTab === 'quran-reader') {
      quranProgrammaticScrollActive = true;
      setTimeout(() => {
        try { blocks[startIdx].scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
        waitForQuranScrollSettle(content, 2500).then(() => { quranProgrammaticScrollActive = false; });
      }, 50);
    }
  }
  if (o.autoPlay) startSequentialPlayback(playbackQueue, playbackBlocks, startIdx, ayahs[startIdx].surahName);
}

function qpGo(delta) {
  if (!qpIndex || !qpPage) return;
  const p = qpPage + delta;
  if (p < 1 || p > QURAN_TOTAL_PAGES) return;
  qpShowPage(p, { dir: delta });
}

// تمام‌شدنِ پخشِ همهٔ آیه‌های این صفحه → صفحهٔ بعد و ادامهٔ پخش
function qpPlaybackFinishedPage() {
  if (!qpActive || qpPage >= QURAN_TOTAL_PAGES) return;
  qpShowPage(qpPage + 1, { dir: 1, autoPlay: true });
}

/* ---------- انتخاب آیه و نوار گزینه‌ها ---------- */
function qpClearSelection() {
  qpSelectedIdx = -1;
  document.querySelectorAll('#qp-page .qp-selected').forEach((b) => b.classList.remove('qp-selected'));
  const bar = document.getElementById('qp-actions');
  if (bar) bar.classList.add('hidden');
}
function qpSelectAyah(i, showBar) {
  const ayah = qpAyahs[i];
  if (!ayah) return;
  if (showBar !== false && qpSelectedIdx === i) { qpClearSelection(); return; } // دوباره زدن روی همان آیه = بستن
  if (showBar !== false && typeof qpMenuClose === 'function') qpMenuClose();
  qpSelectedIdx = i;
  playbackBlocks.forEach((b, k) => b.classList.toggle('qp-selected', k === i));
  const bar = document.getElementById('qp-actions');
  if (showBar === false) { bar.classList.add('hidden'); return; }
  document.getElementById('qp-act-label').textContent = ayah.surahName + ' — آیه ' + toPersianDigits(ayah.numberInSurah);
  document.getElementById('qp-act-bookmark').classList.toggle('is-bookmarked', isBookmarked(ayah.number));
  bar.classList.remove('hidden');
}

document.getElementById('qp-act-play').addEventListener('click', () => {
  const i = qpSelectedIdx;
  if (i < 0 || !qpAyahs[i]) return;
  if (isSequentialPlaying && playbackQueue[playQueueIndex] === qpAyahs[i]) {
    recitationAudio.pause();
    isSequentialPlaying = false;
    document.querySelectorAll('.ayah-block.is-playing').forEach((b) => b.classList.remove('is-playing'));
    return;
  }
  silentEnsureSurahAudio(qpAyahs[i].number);
  startSequentialPlayback(playbackQueue, playbackBlocks, i, qpAyahs[i].surahName);
});
document.getElementById('qp-act-bookmark').addEventListener('click', (e) => {
  const a = qpAyahs[qpSelectedIdx];
  if (!a) return;
  const prev = currentSurahNumber;
  currentSurahNumber = a.surahNumber; // toggleBookmark شمارهٔ سوره را از همین متغیر برمی‌دارد
  toggleBookmark(Object.assign({}, a, { text: qpAyahText(a) }), a.surahName, e.currentTarget);
  currentSurahNumber = prev;
});
document.getElementById('qp-act-share').addEventListener('click', () => {
  const a = qpAyahs[qpSelectedIdx];
  if (!a) return;
  shareAyah(qpAyahText(a), a.surahName + ' — آیه ' + toPersianDigits(a.numberInSurah));
});
document.getElementById('qp-act-close').addEventListener('click', qpClearSelection);

/* ---------- ورق‌زدن: کشیدنِ انگشت، دکمه‌ها و کلیدهای جهت‌دار ---------- */
// مصحف راست‌به‌چپ است: صفحهٔ بعد سمت چپ قرار دارد؛ پس کشیدنِ انگشت به «راست» = صفحهٔ بعد، و به «چپ» = صفحهٔ قبل.
(function initQuranPageSwipe() {
  const el = document.getElementById('qp-swipe');
  if (!el) return;
  let sx = 0, sy = 0, st = 0, on = false;
  el.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) { on = false; return; }
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now(); on = true;
  }, { passive: true });
  el.addEventListener('touchcancel', () => { on = false; }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (!on) return;
    on = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy;
    if (Date.now() - st > 800) return;                         // کشیدنِ خیلی کند، ورق‌زدن حساب نمی‌شود
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return; // کم‌حرکت یا بیشتر عمودی (اسکرول)
    qpGo(dx > 0 ? 1 : -1);
  }, { passive: true });
  document.getElementById('qp-prev').addEventListener('click', () => qpGo(-1));
  document.getElementById('qp-next').addEventListener('click', () => qpGo(1));
  document.addEventListener('keydown', (e) => {
    if (!qpActive || currentTab !== 'quran-reader') return;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === 'ArrowLeft') qpGo(1);
    else if (e.key === 'ArrowRight') qpGo(-1);
  });
})();

// اسلایدر اندازهٔ فونت صفحه‌ای؛ با همان تنظیمِ ذخیره‌شدهٔ بخش‌های دیگر هماهنگ است
(function initQuranPageFontSlider() {
  const s = document.getElementById('qp-font-slider');
  if (!s) return;
  s.value = localStorage.getItem('arefanejam_arabic_font_size') || '22';
  s.addEventListener('input', (e) => {
    document.documentElement.style.setProperty('--arabic-font-size', e.target.value + 'px');
    try { localStorage.setItem('arefanejam_arabic_font_size', e.target.value); } catch (err) {}
    const classic = document.getElementById('arabic-font-slider');
    if (classic) classic.value = e.target.value;
  });
})();

/* ---------- منوی پایین مصحف (جست‌وجو، نشانهٔ صفحه، حالت شب، فهرست، جزءها، صفحه‌ها، اشتراک‌گذاری...) ----------
   با دکمهٔ 📖 باز و بسته می‌شود. «نشانهٔ صفحه» جدا از «آیات نشان‌شده» است: فقط شمارهٔ یک صفحه را نگه می‌دارد تا بعداً
   با «رفتن به نشانه» به همان صفحه برگردید. */
var QPAGE_MARK_KEY = 'arefanejam_quran_page_mark';
var qpMsgTimer = null;

function qpMenuEl() { return document.getElementById('qp-menu'); }
function qpMenuIsOpen() { const m = qpMenuEl(); return !!m && !m.classList.contains('hidden'); }
function qpMenuOpen() {
  const m = qpMenuEl(); if (!m) return;
  qpClearSelection();
  m.classList.remove('hidden');
  document.getElementById('qp-menu-toggle').setAttribute('aria-expanded', 'true');
  qpMenuRefresh();
}
function qpMenuClose() {
  const m = qpMenuEl(); if (!m) return;
  m.classList.add('hidden');
  const g = document.getElementById('qp-menu-goto'); if (g) g.classList.add('hidden');
  qpMenuMsg('');
  const t = document.getElementById('qp-menu-toggle'); if (t) t.setAttribute('aria-expanded', 'false');
}
function qpMenuMsg(text) {
  const el = document.getElementById('qp-menu-msg');
  if (!el) return;
  clearTimeout(qpMsgTimer);
  if (!text) { el.classList.add('hidden'); el.textContent = ''; return; }
  el.textContent = text;
  el.classList.remove('hidden');
  qpMsgTimer = setTimeout(() => el.classList.add('hidden'), 2600);
}
function qpGetMark() {
  try {
    const m = JSON.parse(localStorage.getItem(QPAGE_MARK_KEY) || 'null');
    if (m && m.page >= 1 && m.page <= QURAN_TOTAL_PAGES) return m;
  } catch (e) {}
  return null;
}
function qpMenuRefresh() {
  const dark = document.body.classList.contains('dark-mode');
  const th = document.getElementById('qp-mi-theme');
  if (th) {
    th.querySelector('.qp-menu-ico').textContent = dark ? '☀️' : '🌙';
    th.querySelector('span:last-child').textContent = dark ? 'حالت روز' : 'حالت شب';
  }
  const sv = document.getElementById('qp-mi-save');
  if (sv) {
    const mk = qpGetMark();
    const here = !!(mk && mk.page === qpPage);
    sv.classList.toggle('is-on', here);
    sv.querySelector('span:last-child').textContent = here ? 'نشانه ذخیره است' : 'ذخیرهٔ نشانه';
  }
}
function qpToLatinDigits(s) {
  return String(s)
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}
function qpJumpTo(p) {
  if (!qpIndex) return;
  p = Math.max(1, Math.min(QURAN_TOTAL_PAGES, Number(p) || 0));
  if (!p) return;
  qpShowPage(p, { dir: p === qpPage ? 0 : (p > qpPage ? 1 : -1) });
}

(function initQuranPageMenu() {
  const toggle = document.getElementById('qp-menu-toggle');
  const menu = qpMenuEl();
  if (!toggle || !menu) return;
  toggle.addEventListener('click', () => { if (qpMenuIsOpen()) qpMenuClose(); else qpMenuOpen(); });

  const goBox = document.getElementById('qp-menu-goto');
  const goInput = document.getElementById('qp-goto-input');
  function doGoto() {
    const n = parseInt(qpToLatinDigits(goInput.value).replace(/[^0-9]/g, ''), 10);
    if (!n || n < 1 || n > QURAN_TOTAL_PAGES) { qpMenuMsg('یک عدد از ۱ تا ' + toPersianDigits(QURAN_TOTAL_PAGES) + ' وارد کنید.'); return; }
    goInput.value = '';
    qpMenuClose();
    qpJumpTo(n);
  }
  document.getElementById('qp-goto-btn').addEventListener('click', doGoto);
  goInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doGoto(); } });

  menu.addEventListener('click', (e) => {
    const btn = e.target.closest('.qp-menu-item');
    if (!btn) return;
    const act = btn.dataset.act;
    switch (act) {
      case 'search':    qpMenuClose(); switchToTab('quran-search', { push: true }); break;
      case 'index':     qpMenuClose(); switchToTab('quran-list', { push: true }); break;
      case 'juz':       qpMenuClose(); switchToTab('quran-juz', { push: true }); break;
      case 'bookmarks': qpMenuClose(); switchToTab('quran-bookmarks', { push: true }); break;
      case 'more':      qpMenuClose(); switchToTab('more', { push: true }); break;
      case 'theme':
        applyDarkMode(!document.body.classList.contains('dark-mode'));
        qpMenuRefresh();
        break;
      case 'mark-save': {
        if (!qpPage) break;
        const first = qpAyahs[0];
        try { localStorage.setItem(QPAGE_MARK_KEY, JSON.stringify({ page: qpPage, surah: first ? first.surahName : '', ts: Date.now() })); } catch (err) {}
        qpMenuRefresh();
        qpMenuMsg('نشانه روی صفحهٔ ' + toPersianDigits(qpPage) + ' ذخیره شد.');
        break;
      }
      case 'mark-go': {
        const mk = qpGetMark();
        if (!mk) { qpMenuMsg('هنوز نشانه‌ای ذخیره نکرده‌اید. اول روی «ذخیرهٔ نشانه» بزنید.'); break; }
        qpMenuClose();
        qpJumpTo(mk.page);
        break;
      }
      case 'pages':
        goBox.classList.toggle('hidden');
        if (!goBox.classList.contains('hidden')) { qpMenuMsg(''); setTimeout(() => { try { goInput.focus(); } catch (err) {} }, 50); }
        break;
      case 'share': {
        if (!qpAyahs.length) break;
        const text = qpAyahs.map((a) => qpAyahText(a) + ' ﴿' + toPersianDigits(a.numberInSurah) + '﴾').join(' ');
        shareAyah(text, 'قرآن کریم — ' + qpAyahs[0].surahName + ' — صفحهٔ ' + toPersianDigits(qpPage));
        break;
      }
      case 'play':
        if (!qpAyahs.length) break;
        if (isSequentialPlaying) {
          recitationAudio.pause();
          isSequentialPlaying = false;
          document.querySelectorAll('.ayah-block.is-playing').forEach((b) => b.classList.remove('is-playing'));
        } else {
          qpMenuClose();
          startSequentialPlayback(playbackQueue, playbackBlocks, 0, qpAyahs[0].surahName);
        }
        break;
    }
  });

  // اگر حالت تاریک از جای دیگر (بالای صفحه یا تنظیمات) عوض شد، برچسب منو هم هماهنگ شود
  document.addEventListener('click', () => { setTimeout(qpMenuRefresh, 0); }, true);
})();

/* ---------- آب‌وهوا بر اساس موقعیت (کارت گرافیکی صفحهٔ خانه) ----------
   منبع داده: Open-Meteo (رایگان، بدون کلید). مختصات همان state.coords است (GPS یا شهر انتخابی)،
   پس با عوض شدن موقعیت، آب‌وهوا هم خودکار عوض می‌شود. آخرین نتیجه ذخیره می‌ماند و آفلاین هم نشان داده می‌شود. */
const WX_CACHE_KEY = 'arefanejam_weather_cache';
const WX_NAMES_KEY = 'arefanejam_weather_names';
const WX_MAX_AGE = 30 * 60 * 1000;
let wxBusy = false, wxLastTry = 0, wxData = null, wxRenderedKey = '', wxRenderedStamp = '', wxPlaceKey = '';

function wxInfo(code) {
  const c = Number(code);
  if (c === 0) return { kind: 'clear', text: 'آسمان صاف' };
  if (c === 1) return { kind: 'clear', text: 'عمدتاً صاف' };
  if (c === 2) return { kind: 'partly', text: 'نیمه‌ابری' };
  if (c === 3) return { kind: 'cloudy', text: 'ابری' };
  if (c === 45 || c === 48) return { kind: 'fog', text: 'مه‌آلود' };
  if (c >= 51 && c <= 55) return { kind: 'rain', text: 'نم‌نم باران' };
  if (c === 56 || c === 57) return { kind: 'rain', text: 'نم‌نم باران یخ‌زده' };
  if (c === 61) return { kind: 'rain', text: 'باران ضعیف' };
  if (c === 63) return { kind: 'rain', text: 'باران' };
  if (c === 65) return { kind: 'rain', text: 'باران شدید' };
  if (c === 66 || c === 67) return { kind: 'rain', text: 'باران یخ‌زده' };
  if (c === 71) return { kind: 'snow', text: 'برف ضعیف' };
  if (c === 73) return { kind: 'snow', text: 'برف' };
  if (c === 75) return { kind: 'snow', text: 'برف سنگین' };
  if (c === 77) return { kind: 'snow', text: 'دانه‌های برف' };
  if (c >= 80 && c <= 82) return { kind: 'rain', text: c === 82 ? 'رگبار شدید' : 'رگبار' };
  if (c === 85 || c === 86) return { kind: 'snow', text: 'بارش برف' };
  if (c === 95) return { kind: 'thunder', text: 'رعدوبرق' };
  if (c === 96 || c === 99) return { kind: 'thunder', text: 'رعدوبرق و تگرگ' };
  return { kind: 'cloudy', text: 'نامشخص' };
}

/* آیکون‌های SVG (بدون فایل عکس) */
function wxIcon(kind, isDay) {
  const sun = '<g stroke="#FFB300" stroke-width="3" stroke-linecap="round"><path d="M32 6v6M32 52v6M6 32h6M52 32h6M13.6 13.6l4.2 4.2M46.2 46.2l4.2 4.2M13.6 50.4l4.2-4.2M46.2 17.8l4.2-4.2"/></g><circle cx="32" cy="32" r="12" fill="#FFD54A"/><circle cx="28" cy="28" r="5" fill="#FFF3B0" opacity=".7"/>';
  const moon = '<path d="M40 8a24 24 0 1 0 16 38A19 19 0 0 1 40 8z" fill="#F7EBB5"/><circle cx="26" cy="30" r="3" fill="#E4D48C" opacity=".6"/><circle cx="34" cy="42" r="2" fill="#E4D48C" opacity=".6"/>';
  const cloud = (fill, dy) => '<path transform="translate(0 ' + (dy || 0) + ')" d="M16 48a10 10 0 0 1 1.4-19.9A15 15 0 0 1 46 30.5 8.8 8.8 0 0 1 46 48z" fill="' + fill + '"/>';
  let body = '';
  if (kind === 'clear') body = isDay ? sun : moon;
  else if (kind === 'partly') body = '<g transform="translate(-8 -9) scale(.72)">' + (isDay ? sun : moon) + '</g>' + cloud('#F4F8FC', 4);
  else if (kind === 'cloudy') body = '<g transform="translate(10 -4) scale(.7)">' + cloud('#B9C6D3', 0) + '</g>' + cloud('#E6EDF4', 2);
  else if (kind === 'fog') body = cloud('#D5DEE6', -6) + '<g stroke="#B7C3CD" stroke-width="3.2" stroke-linecap="round"><path d="M12 46h40M18 53h34M12 60h28" opacity=".9"/></g>';
  else if (kind === 'rain') body = cloud('#C9D6E3', -6) + '<g stroke="#4FA3F7" stroke-width="3.4" stroke-linecap="round"><path d="M22 46l-3 8M33 46l-3 8M44 46l-3 8"/></g>';
  else if (kind === 'snow') body = cloud('#DCE6F0', -6) + '<g fill="#fff" stroke="#9DB7D1" stroke-width="1"><circle cx="21" cy="50" r="3"/><circle cx="33" cy="54" r="3"/><circle cx="45" cy="50" r="3"/></g>';
  else if (kind === 'thunder') body = cloud('#8E9BAE', -8) + '<path d="M35 38l-9 13h7l-4 11 13-15h-8l5-9z" fill="#FFD43B" stroke="#E5A800" stroke-width="1" stroke-linejoin="round"/>';
  return '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' + body + '</svg>';
}

/* لایهٔ متحرک آسمان بر اساس وضعیت و روز/شب */
function wxFxHtml(kind, isDay) {
  const cloud = (cls) => '<svg class="wx-cloud ' + cls + '" viewBox="0 0 120 60" aria-hidden="true"><path d="M26 54a18 18 0 0 1 2-35.8A28 28 0 0 1 84 22a16 16 0 0 1 4 32z" fill="currentColor"/></svg>';
  let h = '';
  if (!isDay) {
    let stars = '';
    for (let i = 0; i < 22; i++) stars += '<i style="left:' + ((i * 47 + 13) % 100) + '%;top:' + ((i * 29 + 7) % 55) + '%;animation-delay:' + ((i * 0.37) % 3).toFixed(2) + 's"></i>';
    if (kind === 'clear' || kind === 'partly') h += '<div class="wx-stars">' + stars + '</div>';
    if (kind === 'clear' || kind === 'partly') h += '<div class="wx-moon"></div>';
  } else if (kind === 'clear' || kind === 'partly') {
    h += '<div class="wx-sunorb"><span></span></div>';
  }
  if (kind === 'partly') h += cloud('c1') + cloud('c3');
  if (kind === 'cloudy' || kind === 'rain' || kind === 'thunder') h += cloud('c1 dark') + cloud('c2 dark') + cloud('c3 dark');
  if (kind === 'snow') h += cloud('c1') + cloud('c2');
  if (kind === 'fog') h += '<div class="wx-fogband f1"></div><div class="wx-fogband f2"></div><div class="wx-fogband f3"></div>';
  if (kind === 'rain' || kind === 'thunder') {
    let d = '';
    for (let i = 0; i < 46; i++) d += '<i style="left:' + ((i * 37 + 5) % 100) + '%;animation-delay:-' + ((i * 0.23) % 1.6).toFixed(2) + 's;animation-duration:' + (0.55 + (i % 5) * 0.12).toFixed(2) + 's"></i>';
    h += '<div class="wx-rain">' + d + '</div>';
  }
  if (kind === 'snow') {
    let f = '';
    for (let i = 0; i < 34; i++) f += '<i style="left:' + ((i * 31 + 9) % 100) + '%;width:' + (3 + (i % 4)) + 'px;height:' + (3 + (i % 4)) + 'px;animation-delay:-' + ((i * 0.41) % 6).toFixed(2) + 's;animation-duration:' + (4 + (i % 5)) + 's"></i>';
    h += '<div class="wx-snow">' + f + '</div>';
  }
  if (kind === 'thunder') h += '<div class="wx-flash"></div>';
  return h;
}

function wxNum(n, d) { return toPersianDigits((Math.round(Number(n) * (d ? 10 : 1)) / (d ? 10 : 1)).toString().replace('-', '−')); }
function wxTemp(n) { return wxNum(n) + '°'; }
function wxKm(la1, ln1, la2, ln2) {
  const R = 6371, rad = Math.PI / 180;
  const dLa = (la2 - la1) * rad, dLn = (ln2 - ln1) * rad;
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * rad) * Math.cos(la2 * rad) * Math.sin(dLn / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
const WX_DAYS = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
function wxUvLabel(u) { return u < 3 ? 'کم' : u < 6 ? 'متوسط' : u < 8 ? 'زیاد' : u < 11 ? 'بسیار زیاد' : 'شدید'; }
function wxWindLabel(k) { return k < 6 ? 'آرام' : k < 20 ? 'نسیم' : k < 39 ? 'باد' : k < 62 ? 'باد شدید' : 'طوفانی'; }
function wxMin(s) { const m = /T(\d\d):(\d\d)/.exec(s || ''); return m ? (+m[1]) * 60 + (+m[2]) : null; }

async function wxFetchJson(url) {
  try {
    const ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    const t = ctl ? setTimeout(() => ctl.abort(), 15000) : null;
    const res = await fetch(url, { cache: 'no-store', signal: ctl ? ctl.signal : undefined });
    if (t) clearTimeout(t);
    if (res.ok) return await res.json();
  } catch (e) {}
  try {
    const CH = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp;
    if (CH && typeof CH.get === 'function') {
      const r = await CH.get({ url: url, connectTimeout: 15000, readTimeout: 20000 });
      if (r && r.status === 200) return (typeof r.data === 'string') ? JSON.parse(r.data) : r.data;
    }
  } catch (e) {}
  return null;
}

function wxReadCache() {
  try { const c = JSON.parse(localStorage.getItem(WX_CACHE_KEY) || 'null'); if (c && c.data && c.key) return c; } catch (e) {}
  return null;
}

/* نام محل: شهر انتخابی ← شهر نزدیک (تا ۴۰ کیلومتر) ← نام‌یابی آنلاین ← «موقعیت شما» */
async function wxResolvePlace(lat, lng) {
  if (state.manualCity && state.manualCity.name) return state.manualCity.name;
  const nc = findNearestCity(lat, lng);
  const cc = loadCachedCoords();
  if (state.activeCityName && !(cc && cc.precise)) return state.activeCityName;
  if (nc && wxKm(lat, lng, nc.lat, nc.lng) <= 40) return nc.name;
  const nk = lat.toFixed(2) + ',' + lng.toFixed(2);
  let names = {};
  try { names = JSON.parse(localStorage.getItem(WX_NAMES_KEY) || '{}') || {}; } catch (e) {}
  if (names[nk]) return names[nk];
  const j = await wxFetchJson('https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=' + lat.toFixed(4) + '&longitude=' + lng.toFixed(4) + '&localityLanguage=fa');
  const nm = j && (j.city || j.locality || j.principalSubdivision);
  if (nm) {
    names[nk] = nm;
    try { const ks = Object.keys(names); if (ks.length > 12) delete names[ks[0]]; localStorage.setItem(WX_NAMES_KEY, JSON.stringify(names)); } catch (e) {}
    return nm;
  }
  if (nc && wxKm(lat, lng, nc.lat, nc.lng) <= 150) return 'نزدیک ' + nc.name;
  return 'موقعیت شما';
}

function wxRender(entry, offline) {
  const card = document.getElementById('wx-card');
  if (!card || !entry || !entry.data) return;
  const d = entry.data, cur = d.current || {}, hr = d.hourly || {}, dy = d.daily || {};
  if (!cur || cur.temperature_2m === undefined || !dy.time) return;
  const off = Number(d.utc_offset_seconds || 0) * 1000;
  const nowStr = new Date(Date.now() + off).toISOString().slice(0, 16); // ساعت محلیِ همان مکان
  const isDay = cur.is_day === 1 || cur.is_day === true;
  const info = wxInfo(cur.weather_code);

  card.setAttribute('data-kind', info.kind);
  card.setAttribute('data-day', isDay ? '1' : '0');
  card.classList.remove('is-loading', 'is-error');

  const fxKey = info.kind + (isDay ? 'd' : 'n');
  const fx = document.getElementById('wx-fx');
  if (fx && fx.getAttribute('data-fx') !== fxKey) { fx.innerHTML = wxFxHtml(info.kind, isDay); fx.setAttribute('data-fx', fxKey); }

  document.getElementById('wx-place').textContent = entry.place || 'موقعیت شما';
  document.getElementById('wx-icon').innerHTML = wxIcon(info.kind, isDay);
  document.getElementById('wx-temp').textContent = wxNum(cur.temperature_2m);
  document.getElementById('wx-cond').textContent = info.text;
  const sub = [];
  if (dy.temperature_2m_max) sub.push('<span>▲ ' + wxTemp(dy.temperature_2m_max[0]) + '</span>');
  if (dy.temperature_2m_min) sub.push('<span>▼ ' + wxTemp(dy.temperature_2m_min[0]) + '</span>');
  if (cur.apparent_temperature !== undefined) sub.push('<span>احساس ' + wxTemp(cur.apparent_temperature) + '</span>');
  document.getElementById('wx-sub').innerHTML = sub.join('');

  // قطعه‌های آمار
  const rainP = dy.precipitation_probability_max ? dy.precipitation_probability_max[0] : null;
  const uv = dy.uv_index_max ? dy.uv_index_max[0] : null;
  const wd = Number(cur.wind_direction_10m || 0);
  const chips = [
    ['💧', 'رطوبت', wxNum(cur.relative_humidity_2m) + '٪', ''],
    ['💨', 'باد', wxNum(cur.wind_speed_10m) + ' km/h', '<b class="wx-arrow" style="transform:rotate(' + Math.round(wd + 180) + 'deg)">↑</b> ' + wxWindLabel(cur.wind_speed_10m)],
    ['☔', 'احتمال بارش', rainP === null ? '—' : wxNum(rainP) + '٪', ''],
    ['🧭', 'فشار هوا', wxNum(cur.surface_pressure) + ' hPa', ''],
    ['🕶️', 'شاخص UV', uv === null ? '—' : wxNum(uv, 1), uv === null ? '' : wxUvLabel(uv)],
  ];
  document.getElementById('wx-chips').innerHTML = chips.map((c) =>
    '<div class="wx-chip"><span class="wx-chip-ic">' + c[0] + '</span><span class="wx-chip-k">' + c[1] + '</span><span class="wx-chip-v">' + c[2] + '</span>' + (c[3] ? '<span class="wx-chip-s">' + c[3] + '</span>' : '') + '</div>').join('');

  // کمان خورشید (طلوع تا غروب)
  const sr = wxMin(dy.sunrise && dy.sunrise[0]), ss = wxMin(dy.sunset && dy.sunset[0]), nm = wxMin(nowStr);
  const sunEl = document.getElementById('wx-sun');
  if (sr !== null && ss !== null && nm !== null && ss > sr) {
    const t = Math.max(0, Math.min(1, (nm - sr) / (ss - sr)));
    const up = nm >= sr && nm <= ss;
    const x = 200 - ((1 - t) * (1 - t) * 10 + 2 * (1 - t) * t * 100 + t * t * 190);
    const y = (1 - t) * (1 - t) * 60 + 2 * (1 - t) * t * (-36) + t * t * 60;
    const left = Math.max(0, ss - nm), lh = Math.floor(left / 60), lm = left % 60;
    sunEl.innerHTML =
      '<svg viewBox="0 0 200 74" class="wx-sun-svg" aria-hidden="true"><path d="M190 60Q100 -36 10 60" class="wx-sun-track"/>' +
      (up ? '<path d="M190 60Q100 -36 10 60" class="wx-sun-done" pathLength="100" stroke-dasharray="' + (t * 100).toFixed(1) + ' 100"/>' : '') +
      '<line x1="4" y1="60" x2="196" y2="60" class="wx-sun-ground"/>' +
      (up ? '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="9" class="wx-sun-glow"/><circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="5.5" class="wx-sun-dot"/>' : '<text x="100" y="40" text-anchor="middle" class="wx-sun-night">🌙</text>') +
      '</svg>' +
      '<div class="wx-sun-row"><span>🌅 طلوع ' + toPersianDigits(String(dy.sunrise[0]).slice(11, 16)) + '</span>' +
      (up ? '<span class="wx-sun-mid">' + (lh ? toPersianDigits(lh) + ' ساعت و ' : '') + toPersianDigits(lm) + ' دقیقه تا غروب</span>' : '') +
      '<span>🌇 غروب ' + toPersianDigits(String(dy.sunset[0]).slice(11, 16)) + '</span></div>';
    sunEl.classList.remove('hidden');
  } else { sunEl.classList.add('hidden'); }

  // ساعت‌به‌ساعت (۲۴ ساعت آینده)
  let i0 = 0;
  const hTimes = hr.time || [];
  const nowH = nowStr.slice(0, 13) + ':00';
  for (let i = 0; i < hTimes.length; i++) { if (hTimes[i] >= nowH) { i0 = i; break; } }
  let hh = '';
  for (let i = i0; i < Math.min(hTimes.length, i0 + 24); i++) {
    const inf = wxInfo(hr.weather_code[i]);
    const p = hr.precipitation_probability ? hr.precipitation_probability[i] : null;
    hh += '<div class="wx-hour' + (i === i0 ? ' is-now' : '') + '"><span class="wx-hour-t">' + (i === i0 ? 'اکنون' : toPersianDigits(hTimes[i].slice(11, 13)) + ':۰۰') + '</span>' +
      '<span class="wx-hour-ic">' + wxIcon(inf.kind, hr.is_day ? hr.is_day[i] === 1 : true) + '</span>' +
      '<span class="wx-hour-v">' + wxTemp(hr.temperature_2m[i]) + '</span>' +
      '<span class="wx-hour-p">' + (p >= 20 ? '💧' + wxNum(p) + '٪' : '&nbsp;') + '</span></div>';
  }
  document.getElementById('wx-hours').innerHTML = hh;

  // ۷ روز آینده
  const mins = dy.temperature_2m_min || [], maxs = dy.temperature_2m_max || [];
  const lo = Math.min.apply(null, mins), hi = Math.max.apply(null, maxs), span = Math.max(1, hi - lo);
  let dd = '';
  for (let i = 0; i < dy.time.length; i++) {
    const inf = wxInfo(dy.weather_code[i]);
    const dt = new Date(dy.time[i] + 'T00:00:00Z');
    const name = i === 0 ? 'امروز' : (i === 1 ? 'فردا' : WX_DAYS[dt.getUTCDay()]);
    const a = ((mins[i] - lo) / span) * 100, b = ((maxs[i] - lo) / span) * 100;
    const p = dy.precipitation_probability_max ? dy.precipitation_probability_max[i] : null;
    dd += '<div class="wx-day"><span class="wx-day-n">' + name + '</span><span class="wx-day-ic" title="' + inf.text + '">' + wxIcon(inf.kind, true) + '</span>' +
      '<span class="wx-day-p">' + (p >= 20 ? '💧' + wxNum(p) + '٪' : '') + '</span>' +
      '<span class="wx-day-lo">' + wxTemp(mins[i]) + '</span>' +
      '<span class="wx-day-bar"><i style="right:' + a.toFixed(1) + '%;left:' + (100 - b).toFixed(1) + '%"></i></span>' +
      '<span class="wx-day-hi">' + wxTemp(maxs[i]) + '</span></div>';
  }
  document.getElementById('wx-days').innerHTML = dd;

  const ageMin = Math.round((Date.now() - entry.ts) / 60000);
  document.getElementById('wx-foot').textContent = 'بروزرسانی: ' + formatTime(new Date(entry.ts)) + (offline ? ' • ذخیره‌شده (بدون اینترنت)' : '') + ' • Open-Meteo';
  card.classList.toggle('is-stale', !!offline && ageMin > 180);
  wxRenderedKey = entry.key;
  wxRenderedStamp = nowH;
}

function wxShowState(kind, cond, sub) {
  const card = document.getElementById('wx-card');
  if (!card) return;
  card.setAttribute('data-kind', kind);
  card.classList.toggle('is-loading', kind === 'loading');
  card.classList.toggle('is-error', kind === 'error');
  if (kind === 'loading') card.setAttribute('data-kind', 'cloudy');
  document.getElementById('wx-cond').textContent = cond;
  document.getElementById('wx-sub').textContent = sub || '';
  if (kind === 'error') { document.getElementById('wx-temp').textContent = '--'; document.getElementById('wx-icon').innerHTML = wxIcon('cloudy', true); }
}

function weatherEnsure(force) {
  try { return weatherEnsureRun(force).catch(() => {}); } catch (e) { return null; }
}
async function weatherEnsureRun(force) {
  const card = document.getElementById('wx-card');
  if (!card || !state.coords) return;
  const lat = Number(state.coords.lat), lng = Number(state.coords.lng);
  if (!isFinite(lat) || !isFinite(lng)) return;
  const key = lat.toFixed(2) + ',' + lng.toFixed(2);
  card.classList.remove('hidden');

  let cached = wxReadCache();
  if (cached && cached.key !== key) cached = null;
  const fresh = cached && (Date.now() - cached.ts) < WX_MAX_AGE;

  if (cached && wxRenderedKey !== key) wxRender(cached, !navigator.onLine);
  else if (cached && wxRenderedStamp !== (new Date(Date.now() + Number(cached.data.utc_offset_seconds || 0) * 1000).toISOString().slice(0, 13) + ':00')) wxRender(cached, !fresh && !navigator.onLine);
  if (!cached && wxRenderedKey !== key) wxShowState('loading', 'در حال دریافت آب‌وهوا...', 'بر اساس موقعیت شما');

  // نام محل (اگر عوض شده)
  const pk = key + '|' + (state.manualCity ? state.manualCity.name : '');
  if (pk !== wxPlaceKey && cached) {
    wxPlaceKey = pk;
    wxResolvePlace(lat, lng).then((nm) => { document.getElementById('wx-place').textContent = nm; const c = wxReadCache(); if (c && c.key === key) { c.place = nm; try { localStorage.setItem(WX_CACHE_KEY, JSON.stringify(c)); } catch (e) {} } }).catch(() => {});
  }

  if (fresh && !force) return;
  if (wxBusy) return;
  if (!force && Date.now() - wxLastTry < 60000) return;
  wxLastTry = Date.now();
  wxBusy = true;
  card.classList.add('is-busy');
  try {
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat.toFixed(3) + '&longitude=' + lng.toFixed(3) +
      '&current=temperature_2m,apparent_temperature,relative_humidity_2m,is_day,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure' +
      '&hourly=temperature_2m,weather_code,precipitation_probability,is_day' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max' +
      '&timezone=auto&forecast_days=7&wind_speed_unit=kmh';
    const data = await wxFetchJson(url);
    // اگر در این فاصله موقعیت عوض شده، نتیجهٔ قدیمی را کنار بگذار
    const k2 = state.coords ? Number(state.coords.lat).toFixed(2) + ',' + Number(state.coords.lng).toFixed(2) : key;
    if (data && data.current && k2 === key) {
      const place = await wxResolvePlace(lat, lng).catch(() => 'موقعیت شما');
      const entry = { key: key, ts: Date.now(), data: data, place: place };
      try { localStorage.setItem(WX_CACHE_KEY, JSON.stringify(entry)); } catch (e) {}
      wxPlaceKey = key + '|' + (state.manualCity ? state.manualCity.name : '');
      wxRender(entry, false);
    } else if (!data && !cached) {
      wxShowState('error', 'دریافت آب‌وهوا ممکن نشد', 'اینترنت را بررسی کنید و دکمهٔ ⟳ را بزنید');
    } else if (!data && cached) {
      wxRender(cached, true);
    }
  } catch (e) {
    if (!cached) wxShowState('error', 'دریافت آب‌وهوا ممکن نشد', 'اینترنت را بررسی کنید و دکمهٔ ⟳ را بزنید');
  }
  wxBusy = false;
  card.classList.remove('is-busy');
}

(function wxInit() {
  const btn = document.getElementById('wx-refresh');
  if (btn) btn.addEventListener('click', (e) => { e.stopPropagation(); weatherEnsure(true); });
  const place = document.getElementById('wx-place-btn');
  if (place) place.addEventListener('click', (e) => {
    e.stopPropagation();
    populateCityList('');
    document.getElementById('city-modal').classList.remove('hidden');
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { try { weatherEnsure(); } catch (e) {} } });
  window.addEventListener('online', () => { try { weatherEnsure(true); } catch (e) {} });
  setInterval(() => { if (!document.hidden) { try { weatherEnsure(); } catch (e) {} } }, 10 * 60 * 1000);
  if (state.coords) { try { weatherEnsure(); } catch (e) {} }
})();

// نشانهٔ «اجرای کامل app.js» برای بروزرسانی ظاهر اپ از سایت (اگر تا اینجا نرسد، اپ به نسخهٔ داخلی برمی‌گردد)
/* ---------- منوی همبرگری (جایگزین فلش برگشت بالای صفحه) ----------
   مورد‌های منو را مدیر در پیشخوان ← «☰ منوی همبرگری» تعریف و با کشیدن‌ورها کردن مرتب می‌کند (مسیر /hamburger-menu).
   نوع‌ها: tab (بخشی از اپ یا یکی از گروه‌های صفحهٔ «بیشتر»: target = group:...)، link (بیرونی)، text (صفحهٔ متنی)،
   home، back، heading (عنوان گروه) و divider (خط). برای نوع تازه: hbRunItem + ثابت TYPES در class-hamburger-menu.php.
   آخرین منوی دریافت‌شده آفلاین هم می‌ماند (API_OFFLINE_CACHE_RE). اگر هنوز هیچ منویی نرسیده باشد، منوی پیش‌فرض کوچک نشان داده می‌شود. */
const HB_DEFAULT = { enabled: true, title: 'منو', footer: '', items: [
  { type: 'home', icon: '🏠', title: 'صفحهٔ اصلی' },
  { type: 'tab', target: 'more', icon: '☰', title: 'بیشتر' },
  { type: 'tab', target: 'about', icon: 'ℹ️', title: 'درباره ما' },
] };
let hbData = HB_DEFAULT;
let hbPending = null;
let hbOpenNow = false;
const HB_MAIN_TABS = ['home', 'quran-list', 'azan', 'qibla', 'shariq', 'more'];

function hbApplyEnabled() {
  const btn = document.getElementById('topbar-menu-btn');
  if (btn) btn.classList.toggle('hidden', hbData.enabled === false);
}
async function hbLoad() {
  try {
    const d = await apiFetch('/hamburger-menu');
    if (d && Array.isArray(d.items)) { hbData = d; hbApplyEnabled(); if (hbOpenNow) hbRender(); }
  } catch (e) { /* همان داده‌ٔ قبلی/پیش‌فرض می‌ماند */ }
}
function hbRender() {
  const list = document.getElementById('hb-list');
  document.getElementById('hb-title').textContent = hbData.title || 'منو';
  const foot = document.getElementById('hb-foot');
  foot.textContent = hbData.footer || '';
  foot.classList.toggle('hidden', !hbData.footer);
  list.innerHTML = '';
  (hbData.items || []).forEach((it, i) => {
    if (it.type === 'divider') { const hr = document.createElement('div'); hr.className = 'hb-divider'; list.appendChild(hr); return; }
    if (it.type === 'heading') {
      const h = document.createElement('div'); h.className = 'hb-heading';
      h.textContent = ((it.icon ? it.icon + ' ' : '') + (it.title || '')).trim(); list.appendChild(h); return;
    }
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'hb-item' + ((it.type === 'tab' && it.target === currentTab) || (it.type === 'home' && currentTab === 'home') ? ' is-current' : '');
    b.style.setProperty('--i', i);
    const ic = document.createElement('span'); ic.className = 'hb-item-ic'; ic.textContent = it.icon || '•';
    const tx = document.createElement('span'); tx.className = 'hb-item-tx'; tx.textContent = it.title || '';
    const ch = document.createElement('span'); ch.className = 'hb-item-ch'; ch.textContent = it.type === 'link' ? '↗' : '‹';
    b.append(ic, tx, ch);
    b.addEventListener('click', () => hbChoose(it));
    list.appendChild(b);
  });
}
function hbOpen() {
  if (hbOpenNow) return;
  hbRender();
  hbOpenNow = true;
  const dr = document.getElementById('hb-drawer');
  dr.classList.remove('hidden');
  dr.setAttribute('aria-hidden', 'false');
  document.getElementById('topbar-menu-btn').setAttribute('aria-expanded', 'true');
  document.getElementById('topbar-menu-btn').classList.add('is-open');
  requestAnimationFrame(() => requestAnimationFrame(() => dr.classList.add('is-open')));
  pushOverlay('hb', hbCloseNow);
  hbLoad(); // تازه‌سازی بی‌صدای منو برای دفعهٔ بعد
}
function hbCloseNow() {
  if (!hbOpenNow) return;
  hbOpenNow = false;
  const dr = document.getElementById('hb-drawer');
  dr.classList.remove('is-open');
  dr.setAttribute('aria-hidden', 'true');
  document.getElementById('topbar-menu-btn').setAttribute('aria-expanded', 'false');
  document.getElementById('topbar-menu-btn').classList.remove('is-open');
  setTimeout(() => { if (!hbOpenNow) dr.classList.add('hidden'); }, 260);
  if (hbPending) { const f = hbPending; hbPending = null; setTimeout(f, 40); }
}
function hbClose() { overlayGo('hb', 0, hbCloseNow); }
// اول منو بسته می‌شود (تا تاریخچهٔ دکمهٔ برگشت گوشی به‌هم نریزد)، بعد کار مورد انتخابی اجرا می‌شود
function hbChoose(it) { hbPending = () => hbRunItem(it); hbClose(); }
function hbRunItem(it) {
  switch (it.type) {
    case 'home': navHistory = []; switchToTab('home'); break;
    case 'back': goBackInApp(); break;
    case 'link': if (it.url) { try { window.open(it.url, '_blank'); } catch (e) { location.href = it.url; } } break;
    case 'text': hbShowPage(it.title, it.text); break;
    case 'tab': {
      const t = String(it.target || '');
      if (t.indexOf('group:') === 0) { openMenuGroup(t.slice(6)); break; }
      if (!document.getElementById('tab-' + t)) break;
      if (HB_MAIN_TABS.indexOf(t) >= 0) { navHistory = []; switchToTab(t); } else switchToTab(t, { push: true });
      break;
    }
  }
}
function hbShowPage(title, text) {
  document.getElementById('hb-page-title').textContent = title || '';
  document.getElementById('hb-page-text').textContent = text || '';
  document.getElementById('hb-page').classList.remove('hidden');
  pushOverlay('hbpage', closeHbPage);
}
function closeHbPage() { document.getElementById('hb-page').classList.add('hidden'); }
document.getElementById('topbar-menu-btn').addEventListener('click', () => { if (hbOpenNow) hbClose(); else hbOpen(); });
document.getElementById('hb-backdrop').addEventListener('click', hbClose);
document.getElementById('hb-close').addEventListener('click', hbClose);
document.getElementById('hb-page-close').addEventListener('click', () => overlayGo('hbpage', 0, closeHbPage));
document.getElementById('hb-page').addEventListener('click', (e) => { if (e.target.id === 'hb-page') overlayGo('hbpage', 0, closeHbPage); });
hbLoad();

/* ---------- سرگرمی ← بازی «حدس آیه» ----------
   بیشتر ← سرگرمی ← حدس آیه قرآنی. اول کاربر رشته را از فهرست ثابت GA_CATS (۱ جزء، ۲ جزء، ۵ جزء اول، ۵ جزء آخر، ۱۵، ۲۰، ۳۰ جزء) انتخاب می‌کند؛ هر دور ۱۰ سؤال:
   «صفحهٔ N مصحف (عثمان طاها): از آیهٔ a سورهٔ X، ۸ خط به پایین بیا و تا ابتدای آیهٔ b را بخوان».
   بدون زمان‌بندی: همراه سؤال ۵ کلمهٔ اول آیهٔ شروع نشان داده می‌شود؛ تا ۲ بار «راهنمایی» می‌گیرد و هر بار ۴ کلمهٔ بعدی باز می‌شود (۵ ← ۹ ← ۱۳)؛
   بعد خودش «نمایش پاسخ» را می‌زند، می‌گوید درست خواند یا نه؛ در پایان امتیاز جمع می‌شود.
   شمارهٔ صفحه‌ها همان فیلد page متن داخل اپ (data/quran-uthmani.json، مصحف مدینه ۶۰۴ صفحه) است.
   ⚠ فایل متن اپ شمارهٔ «خط» ندارد؛ جای هر آیه روی صفحه (از ۱۵ خط) با برآورد از طول متن حساب می‌شود (GA_LINES = ۸) و حدود ±۱ خط خطا دارد.
   برای دقت کامل باید داده‌ی واقعی خط‌بندی مصحف مدینه (ابتدای هر خط) به اپ داده شود. */
var GA_ROUNDS = 10;
var GA_LINES = 8;
var GA_TOL = 0.75;
var GA_FIRST_WORDS = 5;   // کلمه‌های اول که همراه سؤال نشان داده می‌شود
var GA_HINTS = 2;         // حداکثر راهنمایی
var GA_HINT_WORDS = 4;    // هر راهنمایی چند کلمهٔ بعدی را باز می‌کند
function gaRange(a, b) { const r = []; for (let i = a; i <= b; i++) r.push(i); return r; }
// رشته‌ها (ثابت). برای تغییر جزءهای هر رشته فقط آرایهٔ juz همان مورد را عوض کنید.
var GA_CATS = [
  { id: '1',  label: '۱ جزء',     note: 'جزء اول و جزء آخر', juz: [1, 30] },
  { id: '2',  label: '۲ جزء',     note: '۲ جزء اول',          juz: [1, 2] },
  { id: '3f', label: '۳ جزء اول', note: 'جزء ۱ تا ۳',         juz: gaRange(1, 3) },
  { id: '3l', label: '۳ جزء آخر', note: 'جزء ۲۸ تا ۳۰',       juz: gaRange(28, 30) },
  { id: '5f', label: '۵ جزء اول', note: 'جزء ۱ تا ۵',         juz: gaRange(1, 5) },
  { id: '5l', label: '۵ جزء آخر', note: 'جزء ۲۶ تا ۳۰',       juz: gaRange(26, 30) },
  { id: '15', label: '۱۵ جزء',    note: '۱۵ جزء اول',         juz: gaRange(1, 15) },
  { id: '20', label: '۲۰ جزء',    note: '۲۰ جزء اول',         juz: gaRange(1, 20) },
  { id: '30', label: '۳۰ جزء',    note: 'کل قرآن',            juz: gaRange(1, 30) }
];
GA_CATS.forEach((c) => { c.set = {}; c.juz.forEach((j) => { c.set[j] = true; }); });
function gaCat(id) { return GA_CATS.find((c) => c.id === String(id)) || GA_CATS[GA_CATS.length - 1]; }
var gaTimer = null;
var gaGame = null;
var gaDataPromise = null;

function gaEsc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function gaStopTimer() { if (gaTimer) { clearInterval(gaTimer); gaTimer = null; } }
function gaRoot() { return document.getElementById('ga-root'); }
function gaShuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const k = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[k]; a[k] = t; }
  return a;
}
function gaWords(t) { return String(t).split(/\s+/).filter(Boolean).length; }
// بسم‌الله اول سوره‌ها (جز فاتحه و توبه) در متن آیهٔ ۱ چسبیده است؛ برای سؤال حذف می‌شود
function gaStripBsm(t, n, s) {
  if (n !== 1 || s === 1 || s === 9) return t;
  const w = String(t).split(' ');
  const first = (w[0] || '').replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '').replace(/ٱ/g, 'ا');
  return (w.length > 4 && first === 'بسم') ? w.slice(4).join(' ') : t;
}
// برآورد جای هر آیه روی صفحه (۱۵ خط؛ صفحهٔ ۱ و ۲ هشت خط). خطِ سرسوره/بسم‌الله هم جا می‌گیرند. G = جای شروع آیه بر حسب «خط» از اول قرآن
function gaWidth(t) {
  const letters = String(t).replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '').replace(/\s+/g, '').length;
  return letters + 0.9 * gaWords(t) + 2;
}
function gaPageCap(p) { return p <= 2 ? 8 : 15; }
function gaComputeLines(flat, pages) {
  let top = 0;
  for (let p = 1; p <= 604; p++) {
    const cap = gaPageCap(p), list = pages[p] || [];
    let fixed = 0, W = 0;
    list.forEach((i) => { if (flat[i].n === 1) fixed += (flat[i].s === 9 || flat[i].s === 1) ? 1 : 2; W += gaWidth(flat[i].t); });
    const T = Math.max(1, cap - fixed);
    let fixedBefore = 0, wBefore = 0;
    list.forEach((i) => {
      if (flat[i].n === 1) fixedBefore += (flat[i].s === 9 || flat[i].s === 1) ? 1 : 2;
      flat[i].G = top + fixedBefore + T * wBefore / (W || 1);
      flat[i].top = top; flat[i].cap = cap;
      wBefore += gaWidth(flat[i].t);
    });
    top += cap;
  }
}
function gaData() {
  if (!gaDataPromise) {
    gaDataPromise = (async () => {
      try {
        const all = await getOfflineQuranText();
        if (!Array.isArray(all) || all.length !== 114) return null;
        const flat = [], pages = {};
        all.forEach((sr) => {
          (sr.ayahs || []).forEach((a) => {
            const o = { s: sr.number, n: a.numberInSurah, p: a.page, j: a.juz, t: gaStripBsm(a.text, a.numberInSurah, sr.number) };
            (pages[o.p] = pages[o.p] || []).push(flat.length);
            flat.push(o);
          });
        });
        gaComputeLines(flat, pages);
        const meta = await khatmMeta();
        return { flat, pages, meta };
      } catch (e) { return null; }
    })().then((d) => { if (!d) gaDataPromise = null; return d; });
  }
  return gaDataPromise;
}
// آیا جزء j در رشتهٔ cat هست؟
function gaAllowed(cat, j) { return !!cat.set[j]; }
// ۱۰ سؤال با صفحه‌های متفاوت از جزءهای رشتهٔ انتخابی: شروع از یک آیهٔ همان صفحه، پایان = ابتدای آیه‌ای که حدود GA_LINES خط پایین‌تر و در همان صفحه است
function gaBuild(D, cat) {
  const F = D.flat;
  const pages = gaShuffle(Object.keys(D.pages).map(Number).filter((p) => p >= 3));
  const qs = [];
  for (const p of pages) {
    if (qs.length >= GA_ROUNDS) break;
    const idxs = gaShuffle(D.pages[p].slice());
    for (const i of idxs) {
      if (!gaAllowed(cat, F[i].j)) continue;
      const target = F[i].G + GA_LINES;
      let best = -1, bd = 99;
      for (let e = i + 1; e < F.length && F[e].p === p; e++) {
        const d = Math.abs(F[e].G - target);
        if (d < bd) { bd = d; best = e; }
        if (F[e].G > target + 2) break;
      }
      if (best < 0 || bd > GA_TOL) continue;
      let ok = true;
      for (let x = i; x <= best; x++) if (!gaAllowed(cat, F[x].j)) { ok = false; break; }
      if (!ok) continue;
      qs.push({ page: p, from: i, to: best });
      break;
    }
  }
  return qs;
}
function gaDots(g, curDone) {
  let h = '<div class="ga-dots">';
  for (let i = 0; i < g.qs.length; i++) {
    let cls = 'ga-dot';
    if (i < g.res.length) cls += g.res[i] ? ' ok' : ' bad';
    else if (i === g.i && !curDone) cls += ' cur';
    h += `<span class="${cls}"></span>`;
  }
  return h + '</div>';
}
function gaHeaderHtml(g, curDone) {
  return `<div class="ga-head">
    <span class="ga-head-q">سؤال ${toPersianDigits(g.i + 1)} از ${toPersianDigits(g.qs.length)}</span>
    <span class="ga-head-c">${g.cat.label}</span>
    <span class="ga-head-s">⭐ امتیاز: ${toPersianDigits(g.score)}</span>
  </div>${gaDots(g, curDone)}`;
}

function gaOpen() {
  gaStopTimer();
  gaGame = null;
  let cats = '';
  GA_CATS.forEach((c) => { cats += `<button class="ga-cat" data-id="${c.id}"><b>${c.label}</b><span>${c.note}</span></button>`; });
  gaRoot().innerHTML = `<div class="ga-card ga-intro">
    <div class="ga-hero">🧩</div>
    <h3 class="ga-title">حدس آیه قرآنی</h3>
    <p class="ga-pick-title">رشتهٔ خود را انتخاب کنید</p>
    <p class="muted-text small ga-pick-note">هر رشته مشخص می‌کند سؤال‌ها از کدام جزءهای قرآن پرسیده شود</p>
    <div class="ga-cats ga-cats-7">${cats}</div>
    <ul class="ga-rules">
      <li>هر دور <b>${toPersianDigits(GA_ROUNDS)} سؤال</b> بر اساس <b>مصحف عثمان طاها</b> (شمارهٔ واقعی صفحه‌ها)؛ هر سؤال حدود <b>${toPersianDigits(GA_LINES)} خط</b> است</li>
      <li>همراه هر سؤال <b>${toPersianDigits(GA_FIRST_WORDS)} کلمهٔ اول</b> آیه نشان داده می‌شود تا ادامه را تشخیص دهید.</li>
      <li>اگر نتوانستید حدس بزنید تا <b>${toPersianDigits(GA_HINTS)} بار</b> می‌توانید «راهنمایی» بگیرید؛ هر بار <b>${toPersianDigits(GA_HINT_WORDS)} کلمهٔ بعدی</b> باز می‌شود.</li>
      <li>بدون محدودیت زمان؛ بعد خودتان «نمایش پاسخ» را می‌زنید و می‌گویید درست خواندید یا نه.</li>
    </ul>
  </div>`;
  gaRoot().querySelectorAll('.ga-cat').forEach((b) => b.addEventListener('click', () => gaStart(b.dataset.id)));
}

async function gaStart(id) {
  const cat = gaCat(id || (gaGame && gaGame.cat && gaGame.cat.id));
  gaRoot().innerHTML = '<div class="ga-card"><p class="muted-text">…</p></div>';
  const D = await gaData();
  if (currentTab !== 'game-ayah') return;
  if (!D) {
    gaRoot().innerHTML = '<div class="ga-card"><p class="muted-text">متن قرآن در دسترس نیست؛ لطفاً یک‌بار با اینترنت اپ را باز کنید و دوباره تلاش کنید.</p><button class="secondary-btn" id="ga-retry-btn">تلاش دوباره</button></div>';
    document.getElementById('ga-retry-btn').addEventListener('click', gaOpen);
    return;
  }
  const qs = gaBuild(D, cat);
  if (!qs.length) {
    gaRoot().innerHTML = '<div class="ga-card"><p class="muted-text">برای این رشته سؤالی ساخته نشد.</p><button class="secondary-btn" id="ga-retry-btn">بازگشت</button></div>';
    document.getElementById('ga-retry-btn').addEventListener('click', gaOpen);
    return;
  }
  gaGame = { D, cat, qs, i: 0, score: 0, res: [], hints: 0, toks: null };
  gaShowQuestion();
}

// کلمه‌های پاسخ پشت‌سرهم (از آیهٔ شروع به بعد)؛ نشانهٔ پایان آیه (﴿n﴾) کلمه حساب نمی‌شود
function gaTokens(D, q) {
  const t = [];
  for (let x = q.from; x < q.to; x++) {
    const o = D.flat[x];
    String(o.t).split(/\s+/).filter(Boolean).forEach((w) => t.push({ w, m: false }));
    t.push({ w: '﴿' + toPersianDigits(o.n) + '﴾', m: true });
  }
  return t;
}
// فقط n کلمهٔ اول (و نشانهٔ آیه‌ای که درست بعد از آخرین کلمه می‌آید)؛ کلمه‌های بعد از prev با رنگ تازه
function gaRevealHtml(toks, n, prev) {
  let c = 0, h = '';
  for (const k of toks) {
    if (!k.m) { if (c >= n) break; c++; }
    else if (c === 0 || c > n) continue;
    const cls = k.m ? 'ga-num' : (c > prev ? 'ga-new' : '');
    h += `<span${cls ? ' class="' + cls + '"' : ''}>${gaEsc(k.w)}</span> `;
  }
  return h + (toks.filter((k) => !k.m).length > n ? '<span class="ga-dots-more">…</span>' : '');
}
function gaWordCount(toks) { return toks.filter((k) => !k.m).length; }

function gaShowQuestion() {
  gaStopTimer();
  const g = gaGame, D = g.D, q = g.qs[g.i];
  const a = D.flat[q.from], b = D.flat[q.to];
  const nm = (s) => gaEsc(khatmSurahName(D.meta, s));
  g.hints = 0;
  g.toks = gaTokens(D, q);
  gaRoot().innerHTML = `${gaHeaderHtml(g, false)}
  <div class="ga-card">
    <div class="ga-page-chip">📖 صفحهٔ ${toPersianDigits(q.page)} <small>(مصحف عثمان طاها)</small></div>
    <p class="ga-q">از <b>آیهٔ ${toPersianDigits(a.n)}</b> سورهٔ <b>${nm(a.s)}</b><br><b>${toPersianDigits(GA_LINES)} خط</b> به پایین بیا<br>و تا ابتدای <b>آیهٔ ${toPersianDigits(b.n)}</b>${b.s !== a.s ? ' سورهٔ <b>' + nm(b.s) + '</b>' : ''}<br>را بخوان</p>
    <div class="ga-first">
      <p class="ga-first-label" id="ga-first-label"></p>
      <div class="ga-first-text" id="ga-first-text" dir="rtl"></div>
    </div>
    <button class="ghost-btn ga-hint-btn" id="ga-hint-btn"></button>
    <p class="muted-text small ga-hint">وقتی خواندید یا آماده بودید، پاسخ را ببینید</p>
    <button class="secondary-btn ga-show" id="ga-show-btn">نمایش پاسخ</button>
  </div>`;
  gaRenderFirst(0);
  document.getElementById('ga-hint-btn').addEventListener('click', gaHint);
  document.getElementById('ga-show-btn').addEventListener('click', gaShowAnswer);
}
function gaRenderFirst(prevWords) {
  const g = gaGame, toks = g.toks;
  const n = Math.min(GA_FIRST_WORDS + g.hints * GA_HINT_WORDS, gaWordCount(toks));
  document.getElementById('ga-first-text').innerHTML = gaRevealHtml(toks, n, prevWords);
  document.getElementById('ga-first-label').textContent = g.hints === 0
    ? `${toPersianDigits(GA_FIRST_WORDS)} کلمهٔ اول آیه:`
    : `${toPersianDigits(n)} کلمهٔ اول (راهنمایی ${toPersianDigits(g.hints)} از ${toPersianDigits(GA_HINTS)}):`;
  const btn = document.getElementById('ga-hint-btn');
  const left = GA_HINTS - g.hints;
  if (left <= 0 || n >= gaWordCount(toks)) btn.classList.add('hidden');
  else { btn.classList.remove('hidden'); btn.textContent = `💡 راهنمایی (+${toPersianDigits(GA_HINT_WORDS)} کلمه) — ${toPersianDigits(left)} بار مانده`; }
}
function gaHint() {
  const g = gaGame;
  if (!g || g.hints >= GA_HINTS) return;
  const prev = Math.min(GA_FIRST_WORDS + g.hints * GA_HINT_WORDS, gaWordCount(g.toks));
  g.hints++;
  gaRenderFirst(prev);
}

function gaShowAnswer() {
  const g = gaGame, D = g.D, q = g.qs[g.i];
  const nm = (s) => gaEsc(khatmSurahName(D.meta, s));
  const a = D.flat[q.from], last = D.flat[q.to - 1];
  let ref;
  if (a.s === last.s) ref = `سورهٔ ${nm(a.s)}، ` + (a.n === last.n ? `آیهٔ ${toPersianDigits(a.n)}` : `آیهٔ ${toPersianDigits(a.n)} تا ${toPersianDigits(last.n)}`);
  else ref = `از سورهٔ ${nm(a.s)} آیهٔ ${toPersianDigits(a.n)} تا سورهٔ ${nm(last.s)} آیهٔ ${toPersianDigits(last.n)}`;
  let txt = '';
  for (let x = q.from; x < q.to; x++) {
    const o = D.flat[x];
    if (x > q.from && o.s !== D.flat[x - 1].s) txt += `<div class="ga-surah-sep">سورهٔ ${nm(o.s)}</div>`;
    txt += `<span class="ga-ayah">${gaEsc(o.t)} <span class="ga-num">﴿${toPersianDigits(o.n)}﴾</span></span> `;
  }
  gaRoot().innerHTML = `${gaHeaderHtml(g, true)}
  <div class="ga-card">
    <div class="ga-page-chip">📖 صفحهٔ ${toPersianDigits(q.page)} <small>(مصحف عثمان طاها)</small></div>
    <p class="ga-ans-label">پاسخ درست</p>
    <div class="ga-answer" dir="rtl">${txt}</div>
    <p class="muted-text small ga-ref">${ref}</p>
    ${g.hints ? `<p class="muted-text small ga-ref">راهنمایی استفاده‌شده: ${toPersianDigits(g.hints)} از ${toPersianDigits(GA_HINTS)}</p>` : ''}
    <p class="muted-text small ga-approx">پایان پاسخ حدوداً ${toPersianDigits(GA_LINES)} خط بعد است و ممکن است حدود یک خط با مصحف چاپی فرق داشته باشد.</p>
    <p class="ga-judge-q">جوابت درست بود؟</p>
    <div class="ga-judge">
      <button class="ga-yes" id="ga-yes-btn">✅ بله، درست بود</button>
      <button class="ga-no" id="ga-no-btn">❌ نه، درست نبود</button>
    </div>
  </div>`;
  let done = false;
  const judge = (ok) => { if (done) return; done = true; gaJudge(ok); };
  document.getElementById('ga-yes-btn').addEventListener('click', () => judge(true));
  document.getElementById('ga-no-btn').addEventListener('click', () => judge(false));
}

function gaJudge(ok) {
  const g = gaGame;
  if (!g) return;
  g.res.push(!!ok);
  if (ok) g.score++;
  g.i++;
  if (g.i >= g.qs.length) gaShowResult(); else gaShowQuestion();
}

function gaShowResult() {
  const g = gaGame, sc = g.score, tot = g.qs.length;
  let icon, msg;
  if (sc === tot) { icon = '🏆'; msg = 'ماشاءالله! همهٔ پاسخ‌ها درست بود.'; }
  else if (sc >= tot * 0.8) { icon = '🥇'; msg = 'آفرین! حافظهٔ قوی و آیه‌شناسی عالی.'; }
  else if (sc >= tot * 0.5) { icon = '🌟'; msg = 'خوب بود! با کمی مرور بهتر هم می‌شود.'; }
  else { icon = '📖'; msg = 'ادامه بده؛ با مرور بیشتر پیشرفت می‌کنی. دوباره تلاش کن!'; }
  gaRoot().innerHTML = `<div class="ga-card ga-result">
    <div class="ga-hero">${icon}</div>
    <h3 class="ga-title">نتیجهٔ نهایی</h3>
    <div class="ga-score"><b>${toPersianDigits(sc)}</b><span> از ${toPersianDigits(tot)}</span></div>
    <p class="muted-text small">رشتهٔ ${g.cat.label} (${g.cat.note}) — ${toPersianDigits(Math.round(sc * 100 / tot))}٪ پاسخ‌ها درست بود</p>
    ${gaDots(g, true)}
    <p class="ga-msg">${msg}</p>
    <div class="ga-result-btns">
      <button class="secondary-btn" id="ga-again-btn">🔄 دور جدید (همین رشته)</button>
      <button class="ghost-btn" id="ga-cat-btn">تغییر رشته</button>
      <button class="ghost-btn" id="ga-back-btn">بازگشت به سرگرمی</button>
    </div>
  </div>`;
  document.getElementById('ga-again-btn').addEventListener('click', () => gaStart(g.cat.id));
  document.getElementById('ga-cat-btn').addEventListener('click', gaOpen);
  document.getElementById('ga-back-btn').addEventListener('click', goBackInApp);
}

/* ---------- نظر و پشتیبانی: امتیاز به اپ + گفتگو (تیکت) با پشتیبان ----------
   بیشتر ← «نظر و پشتیبانی». کاربر ۱ تا ۵ ستاره می‌دهد و می‌تواند انتقاد/پیشنهاد/مشکل بفرستد. هر گفتگو باز می‌ماند و
   وقتی پشتیبان جواب داد، روی کاشی نقطهٔ قرمز می‌افتد و کاربر پاسخ را همان‌جا می‌بیند و می‌تواند ادامه بدهد.
   امنیت: هر متنی که کاربر یا پشتیبان می‌نویسد فقط با textContent نمایش داده می‌شود (هرگز innerHTML)، پس هیچ کدی اجرا نمی‌شود؛
   سرور هم تگ‌ها را پاک می‌کند. لینک‌ها کلیک‌پذیر نمی‌شوند. متغیرهای وضعیت عمداً var هستند (switchToTab ممکن است زودتر صدا زده شود). */
var FB_CATS = { suggestion: 'پیشنهاد', criticism: 'انتقاد', problem: 'مشکل فنی', other: 'سایر' };
var FB_STATUS = { open: '⏳ در انتظار پاسخ', answered: '✅ پاسخ داده شد', closed: '🔒 بسته شد' };
var FB_CACHE_MAIN = 'arefanejam_feedback_main';
var FB_NAME_KEY = 'arefanejam_feedback_name';
var FB_VIEW_KEY = 'arefanejam_fb_view';
var fbCategory = 'suggestion';
var fbViewId = 0;
var fbBusy = false;
var fbLastCheck = 0;

function fbEl(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = String(text);   // فقط متن؛ هیچ HTML پردازش نمی‌شود
  return e;
}
function fbById(id) { return document.getElementById(id); }
function fbJsonGet(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
function fbJsonSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

function fbSetDot(on) {
  const tile = fbById('feedback-more-tile');
  if (tile) tile.classList.toggle('has-news', !!on);
}

async function loadFeedbackSettings() {
  try {
    const s = await apiFetch('/feedback/settings');
    const tile = fbById('feedback-more-tile');
    if (tile) tile.classList.toggle('hidden', s && s.enabled === false);
    if (s && s.nav_label) {
      const a = fbById('feedback-tile-label'); if (a) a.textContent = String(s.nav_label);
      const b = fbById('feedback-page-title'); if (b) b.textContent = String(s.nav_label);
    }
    if (s && s.intro) { const c = fbById('feedback-intro'); if (c) c.textContent = String(s.intro); }
  } catch (e) { /* بدون اینترنت: متن‌های پیش‌فرض */ }
}

// آیا پشتیبان به گفتگوی من جواب داده؟ (نقطهٔ قرمز روی کاشی)
async function fbCheckNews() {
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    fbLastCheck = Date.now();
    const device_id = await ensureDeviceId();
    const d = await shariqGet('/feedback/mine?device_id=' + encodeURIComponent(device_id));
    fbSetDot(d && Number(d.unread) > 0);
  } catch (e) { /* بی‌صدا */ }
}

function fbRenderStars(v) {
  v = Math.max(0, Math.min(5, Number(v) || 0));
  document.querySelectorAll('#fb-stars .fb-star').forEach((b) => {
    b.classList.toggle('on', Number(b.dataset.v) <= v);
  });
  const m = fbById('fb-rate-msg');
  if (m && !fbBusy) m.textContent = v ? ('امتیاز شما: ' + toPersianDigits(v) + ' از ۵ — برای تغییر، دوباره ستاره بزنید.') : 'برای امتیاز دادن یکی از ستاره‌ها را لمس کنید.';
}

async function fbRate(v) {
  const m = fbById('fb-rate-msg');
  const prev = Number(localStorage.getItem('arefanejam_fb_rating')) || 0;
  fbRenderStars(v);
  fbBusy = true;
  if (m) m.textContent = 'در حال ثبت...';
  try {
    const device_id = await ensureDeviceId();
    await apiFetch('/feedback/rate', { method: 'POST', body: JSON.stringify({ device_id, rating: v, app_version: String(window.NATIVE_APP_VERSION || '') }) });
    try { localStorage.setItem('arefanejam_fb_rating', String(v)); } catch (e) {}
    fbBusy = false;
    fbRenderStars(v);
    if (m) m.textContent = 'ممنون از امتیاز شما 🌷 (' + toPersianDigits(v) + ' از ۵)';
  } catch (e) {
    fbBusy = false;
    fbRenderStars(prev);
    if (m) m.textContent = khatmErr(e, 'ثبت امتیاز انجام نشد. اینترنت را بررسی کنید و دوباره تلاش کنید.');
  }
}

function fbRenderList(rows) {
  const el = fbById('fb-list');
  el.textContent = '';
  if (!rows.length) {
    const box = fbEl('div', 'shariq-empty');
    box.appendChild(fbEl('span', 'shariq-empty-icon', '💬'));
    box.appendChild(document.createTextNode('هنوز پیامی نفرستاده‌اید.'));
    el.appendChild(box);
    return;
  }
  rows.forEach((r, i) => {
    const card = fbEl('div', 'shariq-item khatm-item fb-item');
    card.style.animationDelay = (Math.min(i, 8) * 0.06) + 's';
    card.appendChild(fbEl('div', 'khatm-title', r.subject || '—'));
    if (r.preview) card.appendChild(fbEl('div', 'khatm-note fb-preview', (r.last_sender === 'admin' ? 'پشتیبان: ' : 'شما: ') + r.preview));
    const meta = fbEl('div', 'khatm-meta');
    meta.appendChild(fbEl('span', '', '🏷 ' + (FB_CATS[r.category] || 'سایر')));
    meta.appendChild(fbEl('span', '', '🕒 ' + khatmAgo(r.age)));
    meta.appendChild(fbEl('span', '', '💬 ' + toPersianDigits(r.count || 0)));
    card.appendChild(meta);
    const meta2 = fbEl('div', 'khatm-meta');
    meta2.appendChild(fbEl('span', 'khatm-badge' + (r.status === 'open' ? ' is-wait' : ''), FB_STATUS[r.status] || FB_STATUS.open));
    if (r.unread) meta2.appendChild(fbEl('span', 'khatm-badge is-ask', '🔔 پاسخ جدید'));
    card.appendChild(meta2);
    const act = fbEl('div', 'khatm-actions');
    const btn = fbEl('button', 'secondary-btn small-btn', 'مشاهدهٔ گفتگو');
    btn.type = 'button';
    btn.addEventListener('click', () => openFbView(r.id));
    act.appendChild(btn);
    card.appendChild(act);
    el.appendChild(card);
  });
}

async function loadFeedbackMain() {
  const el = fbById('fb-list');
  fbRenderStars(Number(localStorage.getItem('arefanejam_fb_rating')) || 0);
  const cached = fbJsonGet(FB_CACHE_MAIN);
  if (cached && Array.isArray(cached.tickets)) fbRenderList(cached.tickets);
  else el.textContent = 'در حال بارگذاری...';
  try {
    const device_id = await ensureDeviceId();
    const d = await shariqGet('/feedback/mine?device_id=' + encodeURIComponent(device_id));
    const rows = Array.isArray(d && d.tickets) ? d.tickets : [];
    fbJsonSet(FB_CACHE_MAIN, { rating: Number(d && d.rating) || 0, tickets: rows });
    if (d && Number(d.rating) > 0) { try { localStorage.setItem('arefanejam_fb_rating', String(Number(d.rating))); } catch (e) {} }
    fbRenderStars(Number(d && d.rating) || Number(localStorage.getItem('arefanejam_fb_rating')) || 0);
    fbSetDot(rows.some((r) => r.unread));
    fbRenderList(rows);
  } catch (e) {
    if (!(cached && Array.isArray(cached.tickets))) {
      el.textContent = '';
      const box = fbEl('div', 'shariq-empty');
      box.appendChild(fbEl('span', 'shariq-empty-icon', '⚠️'));
      box.appendChild(document.createTextNode('در حال حاضر امکان دریافت گفتگوها نیست. اینترنت را بررسی کنید.'));
      el.appendChild(box);
    }
  }
}

function openFbView(id) {
  fbViewId = Number(id) || 0;
  try { sessionStorage.setItem(FB_VIEW_KEY, String(fbViewId)); } catch (e) {}
  switchToTab('feedback-view', { push: true });
}

function fbRenderThread(t) {
  fbById('fb-view-title').textContent = t.subject || '—';
  fbById('fb-view-meta').textContent = (FB_CATS[t.category] || 'سایر') + ' — ' + (FB_STATUS[t.status] || '');
  const box = fbById('fb-thread');
  box.textContent = '';
  (t.messages || []).forEach((m) => {
    const mine = m.from !== 'admin';
    const b = fbEl('div', 'fb-msg ' + (mine ? 'from-user' : 'from-admin'));
    b.appendChild(fbEl('div', 'fb-msg-head', (mine ? 'شما' : 'پشتیبان') + ' — ' + khatmAgo(m.age)));
    b.appendChild(fbEl('div', 'fb-msg-body', m.body || ''));   // textContent + white-space: pre-wrap
    box.appendChild(b);
  });
  const wrap = fbById('fb-reply-wrap');
  const closedNote = fbById('fb-view-closed');
  const blocked = !!t.closed || !!t.full;
  wrap.classList.toggle('hidden', blocked);
  closedNote.classList.toggle('hidden', !blocked);
  closedNote.textContent = t.closed ? 'این گفتگو توسط پشتیبان بسته شده است. اگر موضوع تازه‌ای دارید، از صفحهٔ قبل «ارسال انتقاد یا پیشنهاد» را بزنید.' : 'این گفتگو به سقف تعداد پیام رسیده است. یک گفتگوی تازه شروع کنید.';
  fbById('fb-reply-err').classList.add('hidden');
  try { window.scrollTo(0, document.body.scrollHeight); } catch (e) {}
}

async function loadFbView() {
  const id = fbViewId || Number(sessionStorage.getItem(FB_VIEW_KEY)) || 0;
  if (!id) { switchToTab('feedback'); return; }
  fbViewId = id;
  const cacheKey = 'arefanejam_feedback_t_' + id;
  const cached = fbJsonGet(cacheKey);
  if (cached && Array.isArray(cached.messages)) fbRenderThread(cached);
  else { fbById('fb-view-title').textContent = '...'; fbById('fb-thread').textContent = 'در حال بارگذاری...'; }
  try {
    const device_id = await ensureDeviceId();
    const t = await shariqGet('/feedback/ticket?device_id=' + encodeURIComponent(device_id) + '&id=' + id);
    fbJsonSet(cacheKey, t);
    fbRenderThread(t);
    fbCheckNews();
  } catch (e) {
    if (!(cached && Array.isArray(cached.messages))) {
      fbById('fb-thread').textContent = (e && e.code === 'http_404') ? 'این گفتگو پیدا نشد.' : 'در حال حاضر امکان دریافت گفتگو نیست. اینترنت را بررسی کنید.';
    }
  }
}

(function setupFeedbackUi() {
  try {
    const $ = fbById;
    const hideNew = () => $('fb-new-modal').classList.add('hidden');
    const closeNew = hideNew;
    const updateCounter = (taId, cId) => {
      const ta = $(taId), c = $(cId);
      if (ta && c) c.textContent = toPersianDigits(ta.value.length) + ' / ' + toPersianDigits(ta.maxLength > 0 ? ta.maxLength : 200);
    };

    // ستاره‌ها
    document.querySelectorAll('#fb-stars .fb-star').forEach((b) => {
      b.addEventListener('click', () => fbRate(Number(b.dataset.v)));
    });

    // پنجرهٔ پیام جدید
    function setCat(cat) {
      fbCategory = FB_CATS[cat] ? cat : 'other';
      document.querySelectorAll('#fb-cat-row .shariq-chip').forEach((c) => c.classList.toggle('active', c.dataset.cat === fbCategory));
    }
    document.querySelectorAll('#fb-cat-row .shariq-chip').forEach((c) => c.addEventListener('click', () => setCat(c.dataset.cat)));
    $('fb-new-btn').addEventListener('click', () => {
      $('fb-new-subject').value = '';
      $('fb-new-message').value = '';
      $('fb-new-error').classList.add('hidden');
      setCat('suggestion');
      updateCounter('fb-new-message', 'fb-new-count');
      $('fb-new-modal').classList.remove('hidden');
    });
    $('fb-new-cancel-btn').addEventListener('click', closeNew);
    $('fb-new-modal').addEventListener('click', (e) => { if (e.target.id === 'fb-new-modal') closeNew(); });
    $('fb-new-message').addEventListener('input', () => updateCounter('fb-new-message', 'fb-new-count'));
    $('fb-reply-text').addEventListener('input', () => updateCounter('fb-reply-text', 'fb-reply-count'));

    $('fb-new-submit-btn').addEventListener('click', async () => {
      const errEl = $('fb-new-error');
      const message = $('fb-new-message').value.trim();
      const subject = $('fb-new-subject').value.trim();
      if (message.length < 5) {
        errEl.textContent = 'لطفاً متن پیام را کامل‌تر بنویسید.';
        errEl.classList.remove('hidden');
        return;
      }
      const btn = $('fb-new-submit-btn');
      btn.disabled = true; btn.textContent = 'در حال ارسال…';
      try {
        const device_id = await ensureDeviceId();
        const r = await apiFetch('/feedback/create', { method: 'POST', body: JSON.stringify({ device_id, subject, message, category: fbCategory, app_version: String(window.NATIVE_APP_VERSION || '') }) });
        hideNew();
        if (r && r.id) openFbView(r.id); else loadFeedbackMain();
      } catch (e) {
        errEl.textContent = khatmErr(e, 'ارسال انجام نشد. اینترنت را بررسی کنید و دوباره تلاش کنید.');
        errEl.classList.remove('hidden');
        try { errEl.scrollIntoView({ block: 'center' }); } catch (e2) {}
      } finally { btn.disabled = false; btn.textContent = 'ارسال'; }
    });

    // پاسخ در یک گفتگو
    $('fb-reply-btn').addEventListener('click', async () => {
      const errEl = $('fb-reply-err');
      const message = $('fb-reply-text').value.trim();
      if (message.length < 2) { errEl.textContent = 'متن پیام خالی است.'; errEl.classList.remove('hidden'); return; }
      const btn = $('fb-reply-btn');
      btn.disabled = true;
      try {
        const device_id = await ensureDeviceId();
        await apiFetch('/feedback/reply', { method: 'POST', body: JSON.stringify({ device_id, id: fbViewId, message }) });
        $('fb-reply-text').value = '';
        updateCounter('fb-reply-text', 'fb-reply-count');
        errEl.classList.add('hidden');
        loadFbView();
      } catch (e) {
        errEl.textContent = khatmErr(e, 'ارسال انجام نشد. اینترنت را بررسی کنید و دوباره تلاش کنید.');
        errEl.classList.remove('hidden');
      } finally { btn.disabled = false; }
    });
  } catch (e) { try { console.error('feedback ui', e); } catch (e2) {} }
})();

// با برگشتن به اپ، اگر مدتی گذشته باشد دوباره می‌پرسد آیا پاسخی آمده
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && Date.now() - fbLastCheck > 60000) fbCheckNews();
});
loadFeedbackSettings();
setTimeout(fbCheckNews, 10000);

/* ---------- فعالیت‌های حوزه: آیکون‌های درختی که مدیر در پیشخوان تعریف می‌کند ----------
   پیشخوان ← عارفان جام ← «فعالیت‌های حوزه». داده از GET /activities می‌آید (آفلاین هم ذخیره می‌شود).
   هر آیکون: عکس + نوشته (+ ایموجی جایگزین)؛ داخلش می‌تواند «بلوک محتوا» (متن/عکس/ویدیو/صوت/لینک؛ همان zkRenderBlock زکات)
   و/یا «آیکون‌های زیرمجموعه» داشته باشد که دقیقاً با ظاهر کاشی‌های «بیشتر» (menu-tile) نشان داده می‌شوند. عمق تا ۶ مرحله.
   ناوبری: actPath فهرست شناسهٔ آیکون‌های بازشده است؛ هر ورود به یک آیکون یک مرحلهٔ تاریخچه (pushOverlay('act')) می‌سازد
   تا دکمهٔ برگشت گوشی در هر بار فقط یک مرحله به عقب برگردد.
   ⚠ متغیرهای وضعیت عمداً با var تعریف شده‌اند: switchToTab ممکن است قبل از رسیدن اجرا به این خط‌ها صدا زده شود (با let خطای TDZ می‌دهد). */
var actData = null;
var actPath = [];

function actCollectImages(d) {
  const out = [];
  const push = (u) => { if (typeof u === 'string' && /^https?:\/\//i.test(u) && out.indexOf(u) < 0) out.push(u); };
  try {
    push(d && d.tile_icon_url);
    const queue = (d && Array.isArray(d.items)) ? d.items.slice() : [];
    const all = [];
    while (queue.length && all.length < 400) { const n = queue.shift(); all.push(n); (n.children || []).forEach((c) => queue.push(c)); }
    all.forEach((n) => push(n.icon_url));   // اول همهٔ آیکون‌ها (کوچک و مهم)
    all.forEach((n) => (n.blocks || []).forEach((b) => { if (b.type === 'image') push(b.url); }));
  } catch (e) {}
  return out;
}
function actBadgeHtml(n) {
  if (n && n.icon_url) return `<img class="act-badge-img" src="${zkAttr(secureUrl(n.icon_url))}" alt="" loading="lazy">`;
  return zkAttr((n && n.icon_emoji) || '📌');
}
function actApplyTile(d) {
  try {
    const tile = document.getElementById('activities-more-tile');
    if (!tile) return;
    const has = !!(d && d.enabled); // کاشی به‌محض روشن بودن بخش دیده می‌شود، حتی اگر هنوز آیکونی ساخته نشده باشد
    tile.classList.toggle('hidden', !has);
    if (!has) return;
    const b = document.getElementById('activities-tile-badge');
    const l = document.getElementById('activities-tile-label');
    if (l) l.textContent = d.title || 'فعالیت‌های حوزه';
    if (b) {
      const key = (d.tile_icon_url ? 'u:' + d.tile_icon_url : 'e:' + (d.tile_icon_emoji || ''));
      if (b.dataset.k !== key) {
        b.dataset.k = key;
        if (d.tile_icon_url) b.innerHTML = `<img class="act-badge-img" src="${zkAttr(secureUrl(d.tile_icon_url))}" alt="">`;
        else b.textContent = d.tile_icon_emoji || '🏛️';
      }
    }
  } catch (e) {}
}
function actFindNode(list, id) {
  for (let i = 0; i < (list || []).length; i++) if (String(list[i].id) === String(id)) return list[i];
  return null;
}
// مسیر باز را با داده‌ٔ فعلی می‌سنجد (اگر مدیر آیکونی را حذف کرده بود، مسیر کوتاه می‌شود) و زنجیرهٔ آیکون‌ها را برمی‌گرداند
function actChain() {
  let list = (actData && actData.items) || [];
  const chain = [], valid = [];
  for (let i = 0; i < actPath.length; i++) {
    const n = actFindNode(list, actPath[i]);
    if (!n) break;
    chain.push(n); valid.push(actPath[i]);
    list = n.children || [];
  }
  actPath = valid;
  return chain;
}
function actScrollTop() { try { const c = document.getElementById('content'); if (c) c.scrollTop = 0; } catch (e) {} }
function actRender() {
  const grid = document.getElementById('act-grid');
  if (!grid) return;
  const blocksEl = document.getElementById('act-blocks');
  const titleEl = document.getElementById('act-title');
  const crumbsEl = document.getElementById('act-crumbs');
  const backBtn = document.getElementById('act-back-btn');
  const introEl = document.getElementById('act-intro');
  const emptyEl = document.getElementById('act-empty');

  const chain = actChain();
  const node = chain.length ? chain[chain.length - 1] : null;
  const list = node ? (node.children || []) : ((actData && actData.items) || []);
  const secTitle = (actData && actData.title) || 'فعالیت‌های حوزه';

  titleEl.textContent = node ? (node.title || '') : secTitle;
  const crumbs = chain.length ? [secTitle].concat(chain.slice(0, -1).map((n) => n.title || '')) : [];
  crumbsEl.textContent = crumbs.join(' › ');
  crumbsEl.classList.toggle('hidden', !crumbs.length);
  backBtn.classList.toggle('hidden', !chain.length);
  if (node && node.intro) { introEl.textContent = node.intro; introEl.classList.remove('hidden'); }
  else { introEl.textContent = ''; introEl.classList.add('hidden'); }

  grid.innerHTML = list.map((n) =>
    `<button type="button" class="menu-tile act-tile" data-act-id="${zkAttr(n.id)}"><span class="menu-tile-badge">${actBadgeHtml(n)}</span><span class="menu-tile-label">${zkAttr(n.title || '')}</span></button>`
  ).join('');
  grid.classList.toggle('hidden', !list.length);

  const blocks = node ? (node.blocks || []) : [];
  blocksEl.innerHTML = blocks.map(zkRenderBlock).join('');

  let msg = '';
  if (!list.length && !blocks.length) {
    if (node) msg = 'هنوز محتوایی در این بخش گذاشته نشده است.';
    else if (!actData) msg = navigator.onLine === false ? 'برای دیدن این بخش، یک‌بار باید به اینترنت وصل شوید؛ بعد از آن آفلاین هم دیده می‌شود.' : 'در حال بارگذاری…';
    else msg = 'فعلاً موردی ثبت نشده است.';
  }
  emptyEl.textContent = msg;
  emptyEl.classList.toggle('hidden', !msg);
  actScrollTop();
}
function actPopOne() {
  if (!actPath.length) return;
  actPath.pop();
  if (currentTab === 'activities') actRender();
}
function actEnter(id) {
  actPath.push(String(id));
  pushOverlay('act', actPopOne);
  actRender();
}
function actOnTabOpen() {
  try {
    actRender();
    actLoad();
  } catch (e) { try { console.error('activities', e); } catch (e2) {} }
}
// با رفتن به تب دیگر، مسیر باز و مراحل تاریخچهٔ آن پاک می‌شود تا دکمهٔ برگشت یک مرحلهٔ بی‌اثر نداشته باشد
function actLeaveTab() {
  if (!actPath || !actPath.length) return;
  actPath = [];
  overlayGo('act', 0, function () {});
}
function actLoad() {
  return apiSWR('/activities', (d) => {
    actData = (d && typeof d === 'object') ? d : null;
    actApplyTile(actData);
    if (currentTab === 'activities') actRender();
  }).catch(() => { if (currentTab === 'activities') actRender(); });
}
(function setupActivitiesEvents() {
  try {
    const grid = document.getElementById('act-grid');
    const blocks = document.getElementById('act-blocks');
    const back = document.getElementById('act-back-btn');
    if (!grid || !blocks || !back) return;
    grid.addEventListener('click', (e) => {
      const t = e.target.closest('[data-act-id]');
      if (t) actEnter(t.getAttribute('data-act-id'));
    });
    back.addEventListener('click', () => overlayGo('act', 1, actPopOne));
    blocks.addEventListener('click', (e) => {
      const img = e.target.closest('[data-zk-zoom]');
      if (img) { openRmzZoom(img.getAttribute('data-zk-zoom'), img.getAttribute('data-zk-name') || ''); return; }
      const lk = e.target.closest('[data-zk-link]');
      if (lk) {
        trackClick('activities_' + (lk.getAttribute('data-zk-kind') || 'link'));
        window.open(lk.getAttribute('data-zk-link'), '_blank');
      }
    });
    blocks.addEventListener('play', (e) => {
      if (e.target && (e.target.tagName === 'VIDEO' || e.target.tagName === 'AUDIO')) {
        blocks.querySelectorAll('video,audio').forEach((m) => { if (m !== e.target) m.pause(); });
      }
    }, true);
  } catch (e) { try { console.error('activities ui', e); } catch (e2) {} }
})();
actLoad();


window.__arefBooted = true;
