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
  // دو روش ایرانی (فقه جعفری): مغرب با زاویه، نه لحظهٔ غروب (۴٫۵° تهران / ۴° قم پایین‌تر از افق)
  Tehran:                { fajr: 17.7, isha: 14, maghrib: 4.5 },
  Qom:                   { fajr: 16,   isha: 14, maghrib: 4 },
};
// ام‌القری: عشاء ۹۰ دقیقه بعد از مغرب، و ۱۲۰ دقیقه در ماه رمضان (طبق روش رسمی)
CALC_METHODS.UmmAlQura.ishaIntervalRamadan = 120;

/* ===== روش محاسبهٔ اذان که «خود کاربر» از صفحهٔ اذان انتخاب می‌کند =====
   'default' = پیش‌فرض عارفان جام (سریع): همان رفتار قبلی (جدول دقیق تربت‌جام + روش و اصلاحیه‌های پیشخوان).
   هر مقدار دیگر = محاسبهٔ نجومی خالص با همان روش برای هر شهر (بدون جدول و بدون اصلاحیه‌های پیشخوان). */
const AZAN_METHOD_KEY = 'arefanejam_azan_calc_method';
// روش «پیش‌فرض عارفان جام» همیشه بر پایهٔ زاویهٔ ۱۵ درجه است (فجر ۱۵° · عشاء ۱۵°)
const AZAN_DEFAULT_CALC = 'NorthAmerica';
const AZAN_DEFAULT_METHOD_NAME = 'پیش‌فرض عارفان جام (سریع)';
const AZAN_METHOD_OPTIONS = [
  { key: 'default',           name: AZAN_DEFAULT_METHOD_NAME,           desc: '۱۵ درجه (فجر ۱۵° · عشاء ۱۵°)' },
  { key: 'Tehran',            name: 'مؤسسه ژئوفیزیک دانشگاه تهران',       desc: 'فجر ۱۷٫۷° · عشاء ۱۴° · مغرب ۴٫۵° (روش صدا و سیما)' },
  { key: 'Egyptian',          name: 'مرکز مطالعات مصر',                   desc: 'فجر ۱۹٫۵° · عشاء ۱۷٫۵°' },
  { key: 'UmmAlQura',         name: 'ام‌القری، مکه',                      desc: 'فجر ۱۸٫۵° · عشاء ۹۰ دقیقه بعد از مغرب (۱۲۰ دقیقه در رمضان)' },
  { key: 'MuslimWorldLeague', name: 'باشگاه مسلمانان دنیا',               desc: 'فجر ۱۸° · عشاء ۱۷°' },
  { key: 'Qom',               name: 'مؤسسه لواء قم',                      desc: 'فجر ۱۶° · عشاء ۱۴° · مغرب ۴°' },
  { key: 'Karachi',           name: 'دانشگاه علوم اسلامی کراچی',          desc: 'فجر ۱۸° · عشاء ۱۸°' },
  { key: 'NorthAmerica',      name: 'جامعه اسلامی شمال آمریکا',           desc: 'فجر ۱۵° · عشاء ۱۵°' },
];
function getUserCalcMethod() {
  try {
    const v = localStorage.getItem(AZAN_METHOD_KEY);
    if (v && v !== 'default' && CALC_METHODS[v] && AZAN_METHOD_OPTIONS.some((o) => o.key === v)) return v;
  } catch (e) {}
  return 'default';
}
function setUserCalcMethod(key) {
  try { if (!key || key === 'default') localStorage.removeItem(AZAN_METHOD_KEY); else localStorage.setItem(AZAN_METHOD_KEY, key); } catch (e) {}
}
/* ===== تنظیمات پیشرفتهٔ اذان (صفحهٔ «تنظیمات»؛ فقط روی همین گوشی ذخیره می‌شود) =====
   off: اذان هر وقت جداگانه خاموش · adj: اصلاح دقیقه‌ای هر وقت (−۳۰ تا +۳۰) · pre: یادآوری N دقیقه قبل از اذان (۰ = خاموش)
   post: یادآوری «وقت نماز» N دقیقه بعد از اذان (۰ = خاموش؛ پیش‌فرض ۲۰ مثل قبل) · voice: صدای اذان از میان صداهای داخل اپ */
const AZ_PREFS_KEY = 'arefanejam_azan_prefs';
const AZ_PRAYERS = [['fajr', 'فجر'], ['dhuhr', 'ظهر'], ['asr', 'عصر'], ['maghrib', 'مغرب'], ['isha', 'عشاء']];
let azPrefsCache = null;
function azPrefs() {
  if (azPrefsCache) return azPrefsCache;
  let p = {};
  try { p = JSON.parse(localStorage.getItem(AZ_PREFS_KEY) || '{}') || {}; } catch (e) { p = {}; }
  p.off = (p.off && typeof p.off === 'object') ? p.off : {};
  p.adj = (p.adj && typeof p.adj === 'object') ? p.adj : {};
  p.pre = Number(p.pre) > 0 ? Number(p.pre) : 0;
  p.post = (p.post === undefined || p.post === null || !isFinite(Number(p.post))) ? 20 : Math.max(0, Number(p.post));
  p.voice = String(p.voice || '');
  azPrefsCache = p;
  return p;
}
function azPrefsSave() { try { localStorage.setItem(AZ_PREFS_KEY, JSON.stringify(azPrefs())); } catch (e) {} }
function azOff(key) { return !!azPrefs().off[key]; }
function azAdj(key) { const v = Number(azPrefs().adj[key]); return isFinite(v) ? Math.max(-30, Math.min(30, Math.round(v))) : 0; }
function userCalcMethodName() {
  const k = getUserCalcMethod();
  const o = AZAN_METHOD_OPTIONS.find((x) => x.key === k);
  return o ? o.name : AZAN_DEFAULT_METHOD_NAME;
}

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
  const sunsetUTC = dhuhrUTC + hourAngle(0.833);
  const maghribUTC = method.maghrib ? dhuhrUTC + hourAngle(method.maghrib) : sunsetUTC;
  const fajrUTC = dhuhrUTC - hourAngle(method.fajr);
  let ishaInt = method.ishaInterval;
  if (ishaInt && method.ishaIntervalRamadan) { try { if (isRamadanDay(date)) ishaInt = method.ishaIntervalRamadan; } catch (e) {} }
  const ishaUTC = ishaInt ? maghribUTC + ishaInt / 60 : dhuhrUTC + hourAngle(method.isha);
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
    sunset: toLocalDate(sunsetUTC, offsets.sunset),
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
let gotNativeHeading = false;       // سنسور بومی اندروید (برای گوشی‌های قدیمی که وب‌ویو جهت مطلق نمی‌دهد)
let qbNativeHandle = null;
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
/* ---------- صرفه‌جویی در ترافیک سایت ----------
 * ۱) «سطح صرفه‌جویی» را مدیر از پیشخوان (🚦 ترافیک) تعیین می‌کند؛ مقدارها داخل /settings ← traffic می‌آیند،
 *    در گوشی می‌مانند (arefanejam_traffic_prof) و فاصلهٔ پرسیدن‌های دوره‌ای اپ را بلندتر می‌کنند.
 * ۲) «سایت قطع است» (خطای ۵xx / صفحهٔ HTML هاست / قطع شبکه): چند دقیقه هیچ پرسش دوره‌ای نمی‌فرستد و
 *    همه‌چیز از آخرین نسخهٔ ذخیره‌شدهٔ گوشی نمایش داده می‌شود؛ بعد خودش دوباره امتحان می‌کند.
 * ۳) اثر انگشت _h: اگر اطلاعات سایت عوض نشده باشد فقط {"__same":1} برمی‌گردد. */
var TRAFFIC_PROF_KEY = 'arefanejam_traffic_prof';
var TRAFFIC_DEFAULTS = { level: 0, settings_s: 120, hb_s: 60, fb_s: 90, pv_s: 0, upd_min: 30 };
var trafficProfCache = null;
function trafficProf() {
  if (trafficProfCache) return trafficProfCache;
  let p = null;
  try { p = JSON.parse(localStorage.getItem(TRAFFIC_PROF_KEY) || 'null'); } catch (e) {}
  trafficProfCache = Object.assign({}, TRAFFIC_DEFAULTS, (p && typeof p === 'object') ? p : {});
  return trafficProfCache;
}
function trafficApply(t) {
  if (!t || typeof t !== 'object') return;
  const n = {};
  Object.keys(TRAFFIC_DEFAULTS).forEach((k) => { const v = Number(t[k]); n[k] = (isFinite(v) && v >= 0) ? v : TRAFFIC_DEFAULTS[k]; });
  trafficProfCache = n;
  try { localStorage.setItem(TRAFFIC_PROF_KEY, JSON.stringify(n)); } catch (e) {}
}
function trafficSec(key, dflt) { const v = Number(trafficProf()[key]); return (isFinite(v) && v >= 0) ? v : dflt; }
var sdUntil = 0, sdFails = 0, sdLastFail = 0;
function siteDownNow() { return Date.now() < sdUntil; }
function siteDownMark() {
  const now = Date.now();
  if (now - sdLastFail < 3000) return;   // ده‌ها درخواست هم‌زمان = یک شکست
  sdLastFail = now; sdFails = Math.min(sdFails + 1, 6);
  sdUntil = now + [0, 1, 2, 4, 8, 15, 30][sdFails] * 60000;
}
function siteDownClear() { sdFails = 0; sdUntil = 0; }
window.__arefSiteDown = siteDownNow;
// اجرای دوره‌ای با فاصلهٔ قابل‌تغییر (کلید در پروفایل ترافیک؛ ۰ = اجرا نشود)
function tPeriodic(key, fn, defSec) {
  (function loop() {
    const sec = trafficSec(key, defSec);
    setTimeout(() => {
      try { if (sec > 0 && !document.hidden && !siteDownNow()) fn(); } catch (e) {}
      loop();
    }, sec > 0 ? sec * 1000 : 60000);
  })();
}
async function apiSha16(text) {
  try {
    if (!window.crypto || !crypto.subtle || typeof TextEncoder === 'undefined') return '';
    const b = new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text)));
    let h = '';
    for (let i = 0; i < 8; i++) h += (b[i] < 16 ? '0' : '') + b[i].toString(16);
    return h;
  } catch (e) { return ''; }
}
function settingsStale() {
  try { const d = JSON.parse(localStorage.getItem('arefanejam_settings_cache') || 'null'); return (d && typeof d === 'object') ? d : null; } catch (e) { return null; }
}
function apiSameSource(basePath, cacheKey) {
  try {
    if (basePath === '/settings') {
      const h = localStorage.getItem('arefanejam_settings_h') || '';
      const d = settingsStale();
      return (h && d) ? { h: h, data: d } : null;
    }
    if (!cacheKey) return null;
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (o && o.h && Object.prototype.hasOwnProperty.call(o, 'data')) return { h: String(o.h), data: o.data };
  } catch (e) {}
  return null;
}
// پاسخ‌های API از کش HTTP گوشی نیایند تا تغییرات پیشخوان به همه برسد.
// settings / charity / food-items عمداً بدون پارامتر اضافه می‌مانند چون سرویس‌ورکر برای حالت آفلاین با همین آدرس کش می‌کند.
function apiFetch(path, options = {}) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
  const isGet = !options.method || String(options.method).toUpperCase() === 'GET';
  const origPath = String(path);                    // آدرس اصلی (قبل از افزودن _t) برای کلید ذخیرهٔ آفلاین
  const basePath = origPath.split('?')[0];
  if (isGet && !options.cache) options = Object.assign({}, options, { cache: 'no-store' });
  const optsBase = options;                         // بدون signal؛ برای تلاش دوباره
  if (isGet && !/^\/(settings|charity|food-items)(\?|$)/.test(path)) {
    path += (path.indexOf('?') === -1 ? '?' : '&') + '_t=' + Date.now();
  }
  const cacheKey = isGet ? apiCacheKey(basePath, origPath) : '';
  const cacheable = !!(cacheKey || (isGet && basePath === '/settings'));
  // سایت قطع است: بدون پرسیدن از سایت، همان آخرین نسخهٔ ذخیره‌شده (مگر کاربر عمداً بخواهد: options.force)
  if (cacheable && !options.force && siteDownNow()) {
    return (async () => {
      const old = basePath === '/settings' ? settingsStale() : await apiStale(cacheKey);
      if (old !== null && old !== undefined) return old;
      return apiFetch(origPath, Object.assign({}, optsBase, { force: true }));
    })();
  }
  const same = (cacheable && !options.noSame) ? apiSameSource(basePath, cacheKey) : null;
  if (same && /^[0-9a-f]{16}$/.test(same.h)) path += (path.indexOf('?') === -1 ? '?' : '&') + '_h=' + same.h;
  // مهلت ۲۰ ثانیه برای درخواست‌های خواندنی: اینترنتِ «وصل ولی بی‌داده/خیلی کند» دیگر اپ را بی‌پایان منتظر نگه نمی‌دارد؛
  // بعد از مهلت، همان آخرین نسخهٔ ذخیره‌شدهٔ گوشی (اگر باشد) نمایش داده می‌شود.
  let toTimer = null;
  if (isGet && !options.signal && typeof AbortController !== 'undefined') {
    const ac = new AbortController();
    const hasCachedCopy = !!(cacheKey && apiCacheRead(cacheKey) !== null) || !!(basePath === '/settings' && settingsStale());
    toTimer = setTimeout(() => { try { ac.abort(); } catch (e) {} }, hasCachedCopy ? 6000 : 20000);
    options = Object.assign({}, options, { signal: ac.signal });
  }
  return fetch(state.apiUrl.replace(/\/$/, '') + path, Object.assign({}, options, { headers }))
    .then(async (res) => {
      if (toTimer) { clearTimeout(toTimer); toTimer = null; }
      const raw = await res.text().catch(() => '');
      let parsed = true, data = {};
      try { data = JSON.parse(raw); } catch (e) { parsed = false; data = {}; }
      // «سایت در دسترس نیست»: خطای سرور (۵xx، مثل ۵۰۹ اتمام ترافیک)، یا پاسخی که JSON نیست
      // (صفحهٔ HTML تعلیق/محدودیت هاست یا فایروال، حتی با کد ۲۰۰). در این حالت هیچ‌وقت «{}» خالی نشان داده
      // یا ذخیره نمی‌شود؛ آخرین نسخهٔ سالمِ گوشی (حافظه یا کش پشتیبان) برمی‌گردد.
      const htmlLike = !parsed && /^\s*</.test(raw);
      const unavailable = res.status >= 500 || (!parsed && (htmlLike || !res.ok));
      if (unavailable) {
        siteDownMark();
        if (isGet) {
          const old = basePath === '/settings' ? settingsStale() : (cacheKey ? await apiStale(cacheKey) : null);
          if (old !== null && old !== undefined) return old;
          if (res.status < 500) { const ue = new Error('site_unavailable'); throw ue; } // بدون httpError: بالادستی مثل «اینترنت نیست» رفتار می‌کند
        }
      }
      if (res.ok && parsed) siteDownClear();
      // «تغییر نکرده»: سایت فقط تأیید کرد که نسخهٔ ذخیره‌شدهٔ ما هنوز درست است
      if (parsed && res.ok && data && data.__same === 1 && Object.keys(data).length === 1) {
        if (same && same.data !== null && same.data !== undefined) return same.data;
        return apiFetch(origPath, Object.assign({}, optsBase, { noSame: true }));
      }
      if (!res.ok) { const he = new Error(data.message || 'خطا در ارتباط با سرور'); he.httpError = true; throw he; }
      if (cacheable && parsed) {
        const h = await apiSha16(raw);
        if (cacheKey) apiCacheWrite(cacheKey, data, h);
        else if (basePath === '/settings' && h && data && typeof data === 'object' && Object.keys(data).length >= 3) {
          try { localStorage.setItem('arefanejam_settings_cache', JSON.stringify(data)); localStorage.setItem('arefanejam_settings_h', h); } catch (e) {}
        }
        if (basePath === '/activities') setTimeout(() => { prefetchSiteImages(actCollectImages(data)); }, 1500);
        else if (/^\/(mokatib\/|shariq\/settings|ads-page|ad-banners)/.test(basePath)) setTimeout(() => { prefetchSiteImages(collectImageUrls(data)); }, 1500);
      }
      return data;
    })
    .catch(async (err) => {
      if (toTimer) { clearTimeout(toTimer); toTimer = null; }
      if (!(err && err.httpError) && navigator.onLine !== false) siteDownMark();
      // بدون اینترنت / قطع ارتباط: آخرین نسخهٔ ذخیره‌شدهٔ همین اطلاعات از حافظهٔ گوشی (خطای ۴xx سرور مستثناست)
      if (cacheKey && !(err && err.httpError)) {
        const old = await apiStale(cacheKey);
        if (old !== null) return old;
      }
      throw err;
    });
}

/* ---------- ذخیرهٔ آفلاینِ اطلاعات عمومی پیشخوان ----------
 * هر بار که اطلاعات با موفقیت از سایت گرفته شود، در حافظهٔ گوشی می‌ماند و اگر بعداً اینترنت نبود
 * (یا سرور خطا داد) همان آخرین نسخه نمایش داده می‌شود. فقط مسیرهای عمومیِ زیر؛ مسیرهای شخصی/ورود نه. */
var moreIconsData = { shape: 'round', icons: {} }; // بیشتر: تصویر دلخواه آیکون‌ها (بالای فایل تعریف شده تا هر کدی بتواند هر زمان صدایش کند)
var moreIconsLastLoad = 0;
const API_OFFLINE_CACHE_RE = /^\/(azan-exceptions|books|daily-deeds|dhikrs|events|gallery|mokatib\/icon|mokatib\/public-tree|mokatib\/slider|news|ramadan|hamburger-menu|more-icons|social-links|theme|shariq\/settings|khatm\/settings|feedback\/settings|zakat|activities|ads-page|ad-banners|bottom-nav|students\/settings)$/;
// مسیرهایی که پارامتر آدرس (مثل league یا device_id) جزو هویتشان است؛ کلید ذخیره با کل آدرس ساخته می‌شود
const API_OFFLINE_QUERY_RE = /^\/(contest\/(settings|board|season)|khatm\/list|shariq\/categories|app-share)$/;
// نسخهٔ پشتیبان همهٔ این اطلاعات در «کش» گوشی (نه localStorage): ظرفیتش بزرگ است و با پر شدن localStorage از بین نمی‌رود.
const API_MIRROR_CACHE_NAME = 'arefanejam-api-mirror-v1';
function apiCacheKey(basePath, fullPath) {
  if (API_OFFLINE_CACHE_RE.test(basePath)) return 'arefanejam_api_cache:' + basePath;
  if (API_OFFLINE_QUERY_RE.test(basePath)) return 'arefanejam_api_cache:' + String(fullPath || basePath);
  return '';
}
function apiCacheRead(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const o = JSON.parse(raw);
    return (o && Object.prototype.hasOwnProperty.call(o, 'data')) ? o.data : null;
  } catch (e) { return null; }
}
function apiCacheWrite(key, data, h) {
  let raw;
  try { raw = JSON.stringify({ t: Date.now(), data: data, h: h || undefined }); } catch (e) { return; }
  apiMirrorWrite(key, raw);            // همیشه یک نسخهٔ پشتیبان در کش گوشی
  if (raw.length > 1500000) return;    // خیلی بزرگ: حافظهٔ محدود localStorage پر نشود (نسخهٔ پشتیبان بالا ذخیره شد)
  try { localStorage.setItem(key, raw); }
  catch (e) {
    // حافظهٔ localStorage پر است: قدیمی‌ترین اطلاعات ذخیره‌شده را کنار می‌گذارد و یک‌بار دوباره تلاش می‌کند
    try { apiCacheEvict(key, 6); localStorage.setItem(key, raw); } catch (e2) { /* مهم نیست؛ نسخهٔ پشتیبان هست */ }
  }
}
function apiCacheEvict(except, n) {
  const rows = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || k === except || k.indexOf('arefanejam_api_cache:') !== 0) continue;
    let t = 0; try { t = (JSON.parse(localStorage.getItem(k)) || {}).t || 0; } catch (e) {}
    rows.push([t, k]);
  }
  rows.sort((a, b) => a[0] - b[0]);
  rows.slice(0, n).forEach((r) => { try { localStorage.removeItem(r[1]); } catch (e) {} });
}
function apiMirrorUrl(key) { return 'https://offline.arefanejam.invalid/' + encodeURIComponent(key); }
function apiMirrorWrite(key, raw) {
  try {
    if (!window.caches || raw.length > 8000000) return;
    caches.open(API_MIRROR_CACHE_NAME)
      .then((c) => c.put(apiMirrorUrl(key), new Response(raw, { headers: { 'Content-Type': 'application/json' } })))
      .catch(() => {});
  } catch (e) {}
}
async function apiMirrorRead(key) {
  try {
    if (!window.caches) return null;
    const c = await caches.open(API_MIRROR_CACHE_NAME);
    const r = await c.match(apiMirrorUrl(key));
    if (!r) return null;
    const o = JSON.parse(await r.text());
    return (o && Object.prototype.hasOwnProperty.call(o, 'data')) ? o.data : null;
  } catch (e) { return null; }
}
// آخرین نسخهٔ سالم: اول حافظهٔ سریع، بعد نسخهٔ پشتیبان
async function apiStale(key) {
  const a = apiCacheRead(key);
  if (a !== null) return a;
  return apiMirrorRead(key);
}
// اگر localStorage پاک یا کم شده بود، از نسخهٔ پشتیبان برمی‌گردد تا اپ سریع و آفلاین مثل قبل کار کند
async function apiMirrorRestore() {
  try {
    if (!window.caches) return;
    const c = await caches.open(API_MIRROR_CACHE_NAME);
    const reqs = await c.keys();
    for (const rq of reqs) {
      let key; try { key = decodeURIComponent(new URL(rq.url).pathname.slice(1)); } catch (e) { continue; }
      if (!key || key.indexOf('arefanejam_api_cache:') !== 0 || localStorage.getItem(key) !== null) continue;
      const r = await c.match(rq); if (!r) continue;
      const raw = await r.text();
      if (raw.length > 1500000) continue;
      try { localStorage.setItem(key, raw); } catch (e) { break; }
    }
  } catch (e) {}
}
setTimeout(apiMirrorRestore, 1500);
// درخواست «ذخیرهٔ ماندگار» تا اندروید در کمبود حافظه این اطلاعات را اول از همه پاک نکند
try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) {}

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
  // «مکاتب»: اگر ناظر وارد شده باشد، از هر راهی (منوی پایین، همبرگری، کاشی) صفحهٔ ناظر باز شود
  try { if (tabName === 'mokatib-public' && mokatibState.token) tabName = 'mokatib-home'; } catch (e) {}
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

  if (tabName !== 'charity') pauseCharityVideos();
  if (tabName !== 'quran-reader') disconnectQuranReadingTracker();
  if (leavingSurahNumber && tabName !== 'quran-reader') maybeShowQuranSurahExitPopup(leavingSurahNumber);
  if (tabName === 'lesson') loadVerseOfDay();
  if (tabName === 'about') renderAboutPage();
  if (tabName === 'qibla') autoStartQibla(); else qbStopSensors();
  if (tabName === 'quran-list') onQuranListOpened();
  if (tabName === 'more') loadMoreIcons(false);
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
  if (tabName === 'shariq') { if (typeof shariqSetView === 'function') shariqSetView('qa'); loadShariqCategories(); }
  if (tabName === 'shariq-mine') loadShariqMine();
  if (tabName === 'khatm') loadKhatmList();
  if (tabName === 'khatm-mine') loadKhatmMine();
  if (tabName === 'khatm-view') loadKhatmView();
  if (tabName === 'feedback') loadFeedbackMain();
  if (tabName === 'feedback-view') loadFbView();
  if (tabName === 'activities') actOnTabOpen(); else actLeaveTab();
  if (tabName === 'ads') adsOnTabOpen();
  if (tabName === 'settings') { try { settingsOnTabOpen(); } catch (e) {} }
  if (tabName === 'students') { try { window.stuOnTabOpen(); } catch (e) {} }
  // مکاتب: بارگذاری داده همین‌جا انجام می‌شود (نه فقط با کلیک کاشی «بیشتر»)، تا از منوی پایین هم کامل باز شود
  if (tabName === 'mokatib-public') { try { loadMokatibPublicTree(); } catch (e) {} }
  if (tabName === 'mokatib-home') { try { loadMokatibHome(); } catch (e) {} }
  try { bnrRenderTab(tabName); } catch (e) {}
  pvOnTabSwitch(tabName);
  if (tabName !== 'game-ayah') gaStopTimer();
  if (tabName === 'game-ayah') gaOpen();
  if (tabName !== 'contest') { try { cnLeave(); } catch (e) {} }
  if (tabName === 'contest') cnOpen();
  if (tabName === 'fun') { try { loadContestSettings(); } catch (e) {} }
}

/* دکمه‌های نوار پایین: یک شنوندهٔ مشترک روی خود نوار (تا دکمه‌های ساخته‌شده از پیشخوان ← «منوی پایین اپ» هم کار کنند).
   مقصد می‌تواند یکی از گروه‌های صفحهٔ «بیشتر» هم باشد (group:...). */
(function () {
  const nav = document.querySelector('.bottom-nav');
  if (!nav) return;
  nav.addEventListener('click', (e) => {
    const btn = e.target.closest ? e.target.closest('.nav-btn') : null;
    if (!btn || !nav.contains(btn)) return;
    const t = String(btn.dataset.tab || '');
    if (t.indexOf('group:') === 0) { try { openMenuGroup(t.slice(6)); } catch (err) {} return; }
    if (!t) return;
    navHistory = [];
    switchToTab(t);
  });
})();
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
  'shariq-scholar-modal': 'sch-close-btn',
  'khatm-new-modal': 'khatm-new-cancel-btn',
  'fb-new-modal': 'fb-new-cancel-btn',
  'quran-invite-modal': 'quran-invite-btn2',
  'quran-surah-progress-modal': 'quran-surah-progress-close',
  'azan-share-choice-modal': 'azan-share-cancel-btn',
  'charity-food-thanks-modal': 'charity-food-thanks-ok',
  'onboarding-location-modal': 'onboarding-location-later-btn',
  'city-modal': 'city-cancel-btn',
  'azan-method-modal': 'azan-method-cancel-btn',
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
    if (currentTab === 'contest' && typeof cnInGame === 'function' && cnInGame()) { cnConfirmExit(); return; }
    if (currentTab === 'contest' && (cnS.phase === 'fl' || cnS.phase === 'review' || cnS.phase === 'season' || cnS.phase === 'prac')) { cnOpen(); return; }
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
 "azan_share_img_old": {
  "kind": "alert",
  "tone": "info",
  "icon": "📲",
  "title": "نیاز به نسخهٔ جدیدتر",
  "text": "ارسال عکس اوقات شرعی در این نسخهٔ اپ ممکن نیست. با نصب نسخهٔ جدید اپ کار می‌کند؛ فعلاً متن اوقات شرعی ارسال می‌شود.",
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
 "notif_ask": {
  "kind": "alert",
  "tone": "warn",
  "icon": "🔔",
  "title": "اعلان‌های برنامه بسته است",
  "text": "اعلان‌های «عارفان جام» روی گوشی شما خاموش است و پیام‌ها و خبرهای تازه به شما نمی‌رسد. لطفاً از تنظیمات گوشی ← برنامه‌ها ← عارفان جام ← اعلان‌ها (Notifications)، اعلان‌ها را روشن کنید.",
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
  try { renderCalAzan(); } catch (e) { try { console.warn('cal-azan', e); } catch (e2) {} }
}
/* ساعت اذان (اوقات شرعی) دقیقاً برای روزِ انتخاب‌شده در تقویم؛ با همان شهر، روش محاسبه و اصلاحیه‌های تنظیمات اذان */
function calAzanInstant(d) {
  // ظهرِ همان تاریخ در منطقهٔ زمانیِ محاسبه (ایران ثابت یا ساعت گوشی) تا مرز نیمه‌شب روز را جابه‌جا نکند
  const y = d.getFullYear(), m = d.getMonth(), day = d.getDate();
  if (state.coords && isIranCoords(state.coords.lat, state.coords.lng)) return new Date(Date.UTC(y, m, day, 12, 0, 0) - IRAN_TZ_MIN * 60000);
  return new Date(y, m, day, 12, 0, 0);
}
function renderCalAzan() {
  const el = document.getElementById('cal-azan-block');
  if (!el) return;
  if (!state.coords) {
    el.innerHTML = '<div class="cal-azan-card"><div class="cal-azan-empty">برای دیدن ساعت اذان این روز، ابتدا شهر یا موقعیت خود را در بخش «اذان» مشخص کنید.</div></div>';
    return;
  }
  const list = buildPrayerListForDate(calAzanInstant(selectedDate));
  const strs = getCalendarStrings(selectedDate);
  let city = '';
  try { city = effectiveCityName() || ''; } catch (e) {}
  let h = '<div class="cal-azan-card"><div class="cal-azan-head"><b>🕌 ساعت اذان ' + calEsc(strs[activeCalendar]) + '</b>' + (city ? '<small>' + calEsc(city) + '</small>' : '') + '</div><div class="cal-azan-grid">';
  list.forEach((p) => {
    h += '<div class="cal-azan-item cal-azan-' + p.key + '"><span class="cal-azan-name">' + (PRAYER_ICONS[p.key] || '') + ' ' + calEsc(p.label) + '</span><span class="cal-azan-time">' + formatTime(p.time) + '</span></div>';
  });
  h += '</div></div>';
  el.innerHTML = h;
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
// ویدیوهایی که کاربر یک‌بار پخش کرده؛ کامل روی گوشی می‌مانند تا دفعهٔ بعد ترافیکی مصرف نشود. از پاک‌سازی کش‌های قدیمی مستثنا بماند.
const VIDEO_CACHE_NAME = 'arefanejam-video-cache-v1';

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
  applyReciterNames();
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
    // پاسخ خالی/نامعتبر (مثلاً صفحهٔ محدودیت هاست) هرگز جای تنظیمات سالمِ گوشی را نگیرد
    if (!data || typeof data !== 'object' || Object.keys(data).length < 3) throw new Error('bad_settings');
    state.settings = data;
    trafficApply(data.traffic);
    applyReciterNames();
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

let quranInviteResumeMode = false; // true فقط وقتی پاپ‌آپ «چند روز است قرآن نخوانده‌ای» باز شده
function showQuranInvitePopup(p, opts) {
  quranInviteResumeMode = !!(opts && opts.resumeLast);
  const textEl = document.getElementById('quran-invite-text');
  applyMokatibPopupText(textEl, { text: p.text, textColor: p.text_color, font: p.font, effect: p.effect });
  document.getElementById('quran-invite-btn1').textContent = p.btn1_text || 'بزن بریم';
  document.getElementById('quran-invite-btn2').textContent = p.btn2_text || 'ان‌شاءالله بعدا';
  document.getElementById('quran-invite-modal').classList.remove('hidden');
}
/* با تأیید یادآورِ «چند روز است قرآن نخوانده‌ای»: آخرین سوره‌ای که کاربر در آن بوده پیدا می‌شود و خواندن + پخش صوت
   از آیهٔ بعدِ آخرین آیهٔ خوانده‌شده شروع می‌شود (مثلاً تا آیهٔ ۱۲۵ بقره خوانده → شروع از آیهٔ ۱۲۶). کاملاً محلی و آفلاین. */
async function resumeQuranFromLastPosition() {
  const pb = getPlaybackPosition();
  const lr = getLastRead();
  const pbOk = !!(pb && pb.surahNumber);
  const lrOk = !!(lr && lr.number);
  if (!pbOk && !lrOk) {
    // کاربر هنوز هیچ‌چیز نخوانده/نشنیده: از اول قرآن (سورهٔ حمد، آیهٔ ۱) خواندن و پخش صوت شروع می‌شود
    let fname = '';
    try { fname = await getSurahNameByNumber(1); } catch (e) {}
    navHistory = [];
    openSurahReader(1, fname || 'الفاتحة', { skipResumeCheck: true, scrollToAyah: 1, autoPlay: true });
    return true;
  }
  let number, name;
  if (pbOk && (!lrOk || (Number(pb.ts) || 0) >= (Number(lr.ts) || 0))) { number = Number(pb.surahNumber); name = pb.surahName; }
  else { number = Number(lr.number); name = lr.name; }
  if (!(number >= 1 && number <= 114)) return false;
  let last = 0, total = 0;
  try { const rd = await getSurahMaxReadAyah(number); last = rd.max || 0; total = rd.total || 0; } catch (e) {}
  if (pbOk && Number(pb.surahNumber) === number && Number(pb.numberInSurah) > last) last = Number(pb.numberInSurah);
  if (total && last >= total) { number = number >= 114 ? 1 : number + 1; name = ''; last = 0; } // این سوره تمام شده؛ سورهٔ بعد از اول
  if (!name || number !== Number(pb && pb.surahNumber) && number !== Number(lr && lr.number)) { try { name = await getSurahNameByNumber(number); } catch (e) {} }
  const nextAyah = Math.max(1, last + 1);
  navHistory = [];
  openSurahReader(number, name || ('سورهٔ ' + toPersianDigits(number)), { skipResumeCheck: true, scrollToAyah: nextAyah, autoPlay: true });
  return true;
}
document.getElementById('quran-invite-btn1').addEventListener('click', async () => {
  document.getElementById('quran-invite-modal').classList.add('hidden');
  if (quranInviteResumeMode) {
    quranInviteResumeMode = false;
    unlockRecitationAudio();   // باید همین‌جا و همزمان با لمس کاربر باشد (قبل از هر await)
    let ok = false;
    try { ok = await resumeQuranFromLastPosition(); } catch (e) { ok = false; }
    if (ok) return;
  }
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
  showQuranInvitePopup(Object.assign({}, s.quran_popup, { text: inact.text }), { resumeLast: true });
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

// کم‌کردن فشار روی سایت: تنظیمات فقط وقتی اپ روی صفحه است و هر ۲ دقیقه پرسیده می‌شود
// (و یک‌بار هم وقتی کاربر به اپ برمی‌گردد، اگر از آخرین پرسیدن بیش از ۳۰ ثانیه گذشته باشد).
let settingsPollLast = 0;
async function pollSettingsNow() {
  if (document.hidden || siteDownNow()) return;
  settingsPollLast = Date.now();
  try {
    const fresh = await apiFetch('/settings');
    if (!fresh || typeof fresh !== 'object' || Object.keys(fresh).length < 3) return;
    state.settings = fresh;
    trafficApply(fresh.traffic);
    try { localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(state.settings)); } catch (e) {}
    applyReciterNames();
    prefetchAzanAudioForOffline();
    checkForNewAnnouncement();
    checkForNewServerAlarm();
    checkQuranInvitePopup();
    checkQuranInactivityPopup();
  } catch (e) {}
}
tPeriodic('settings_s', pollSettingsNow, 120);
document.addEventListener('visibilitychange', () => {
  const ss = trafficSec('settings_s', 120);
  if (!document.hidden && Date.now() - settingsPollLast > (ss > 0 ? Math.max(30000, ss * 500) : 600000)) pollSettingsNow();
});

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
function cityKey(t) {
  return String(t == null ? '' : t).replace(/[\u200c\u200d\u200f\u200e\s]+/g, '').replace(/[\u064a\u0649]/g, '\u06cc').replace(/\u0643/g, '\u06a9').replace(/[\u064b-\u065f\u0670]/g, '').toLowerCase();
}
function pickCity(c) {
  state.manualCity = { name: c.name, lat: c.lat, lng: c.lng };
  state.activeCityName = c.name;
  localStorage.setItem('arefanejam_manual_city', JSON.stringify(state.manualCity));
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
}
/* فهرست کامل شهرهای ایران (همهٔ شهرهای رسمی، بزرگ و کوچک) به‌صورت گروه‌بندی‌شده بر اساس استان؛
   جست‌وجو هم روی نام شهر و هم روی نام استان کار می‌کند. بدون محدودیت تعداد. */
function populateCityList(filter) {
  const listEl = document.getElementById('city-list');
  const inp = document.getElementById('city-search-input');
  if (!filter && inp) inp.value = '';
  listEl.innerHTML = '';
  const q = cityKey(filter);
  const all = window.IRAN_CITIES || [];
  const cities = all.filter((c) => !q || cityKey(c.name).includes(q) || cityKey(c.province).includes(q));
  const frag = document.createDocumentFragment();
  const info = document.createElement('div');
  info.className = 'city-count';
  info.textContent = cities.length ? (q ? cities.length + ' شهر پیدا شد' : 'همهٔ شهرهای ایران (' + all.length + ' شهر) — بر اساس استان') : 'شهری پیدا نشد. اگر شهر شما در فهرست نیست، از دکمهٔ GPS بالا استفاده کنید.';
  frag.appendChild(info);
  const byProv = new Map();
  cities.forEach((c) => {
    const p = c.province || 'سایر';
    if (!byProv.has(p)) byProv.set(p, []);
    byProv.get(p).push(c);
  });
  Array.from(byProv.keys()).sort((a, b) => a.localeCompare(b, 'fa')).forEach((p) => {
    const h = document.createElement('div');
    h.className = 'city-prov';
    h.textContent = 'استان ' + p + ' (' + byProv.get(p).length + ')';
    frag.appendChild(h);
    byProv.get(p).slice().sort((a, b) => (b.core ? 1 : 0) - (a.core ? 1 : 0) || a.name.localeCompare(b.name, 'fa')).forEach((c) => {
      const row = document.createElement('div');
      row.className = 'city-row';
      row.textContent = c.name;
      row.addEventListener('click', () => pickCity(c));
      frag.appendChild(row);
    });
  });
  listEl.appendChild(frag);
  listEl.scrollTop = 0;
}
document.getElementById('city-picker-btn').addEventListener('click', () => {
  populateCityList('');
  document.getElementById('city-modal').classList.remove('hidden');
});
document.getElementById('city-search-input').addEventListener('input', (e) => populateCityList(e.target.value.trim()));
document.getElementById('city-cancel-btn').addEventListener('click', () => document.getElementById('city-modal').classList.add('hidden'));

/* ---------- انتخاب روش محاسبهٔ اذان (صفحهٔ اذان) ---------- */
function refreshAzanMethodUi() {
  const el = document.getElementById('azan-method-name');
  if (el) el.textContent = userCalcMethodName();
}
function renderAzanMethodList() {
  const box = document.getElementById('azan-method-list');
  if (!box) return;
  const cur = getUserCalcMethod();
  box.innerHTML = '';
  AZAN_METHOD_OPTIONS.forEach((o) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'amm-row' + (o.key === cur ? ' on' : '');
    row.setAttribute('role', 'radio');
    row.setAttribute('aria-checked', o.key === cur ? 'true' : 'false');
    row.innerHTML = '<span class="amm-dot" aria-hidden="true"></span><span class="amm-txt"><b></b><small></small></span>';
    row.querySelector('b').textContent = o.name;
    row.querySelector('small').textContent = o.desc;
    if (o.key === 'default') {
      const note = String((state.settings && state.settings.azan_default_note) || '').trim();
      if (note) {
        const extra = document.createElement('small');
        extra.className = 'amm-extra';
        extra.textContent = note;
        row.querySelector('.amm-txt').appendChild(extra);
      }
    }
    row.addEventListener('click', () => {
      setUserCalcMethod(o.key);
      refreshAzanMethodUi();
      document.getElementById('azan-method-modal').classList.add('hidden');
      lastScheduleSyncKey = '';
      try { if (state.coords) computePrayerTimes(); } catch (e) {}
    });
    box.appendChild(row);
  });
}
(function setupAzanMethod() {
  const btn = document.getElementById('azan-method-btn');
  if (!btn) return;
  refreshAzanMethodUi();
  btn.addEventListener('click', () => { renderAzanMethodList(); document.getElementById('azan-method-modal').classList.remove('hidden'); });
  const cancel = document.getElementById('azan-method-cancel-btn');
  if (cancel) cancel.addEventListener('click', () => document.getElementById('azan-method-modal').classList.add('hidden'));
})();

function findNearestCity(lat, lng) {
  // نزدیک‌ترین شهر از کل فهرست؛ ولی اگر یکی از شهرهای اصلی (core) تا ۲۰ کیلومتر نزدیک باشد همان برگردانده می‌شود
  // تا نام‌های قبلی (جدول دقیق تربت‌جام و استثناهای پیشخوان) مثل قبل کار کنند.
  let nearest = null, minDist = Infinity, core = null, coreDist = Infinity;
  (window.IRAN_CITIES || []).forEach((c) => {
    const d = Math.pow(c.lat - lat, 2) + Math.pow((c.lng - lng) * Math.cos(lat * Math.PI / 180), 2);
    if (d < minDist) { minDist = d; nearest = c; }
    if (c.core && d < coreDist) { coreDist = d; core = c; }
  });
  if (core && Math.sqrt(coreDist) * 111 <= 20) return core;
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
  btn.classList.add('is-busy');
  setLocationLabel('در حال یافتن موقعیت...');
  fetchExactGPSLocation((error) => {
    btn.classList.remove('is-busy');
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

  // --- واترمارک خیلی کمرنگ (متن، پررنگی، رنگ و زاویه از پیشخوان؛ متن خالی = بدون واترمارک) ---
  try {
    const wmRaw = (s.wm_text === undefined || s.wm_text === null) ? 'دارالحفظ خواجه عزیزالله' : String(s.wm_text);
    const wmText = wmRaw.trim();
    if (wmText) {
      let wmOp = parseFloat(s.wm_opacity); if (!isFinite(wmOp)) wmOp = 10;
      wmOp = Math.max(0, Math.min(100, wmOp)) / 100;
      let wmDeg = parseFloat(s.wm_angle); if (!isFinite(wmDeg)) wmDeg = -30;
      const wmColor = /^#[0-9a-fA-F]{3,8}$/.test(String(s.wm_color || '')) ? s.wm_color : '#777777';
      if (wmOp > 0) {
        const rad = wmDeg * Math.PI / 180;
        const ca = Math.abs(Math.cos(rad)), sa = Math.abs(Math.sin(rad));
        // طول مجاز نوشته در همان جهت چرخش (تا از کادر بیرون نزند)
        const maxLen = Math.min(ca > 0.001 ? (W * 0.86) / ca : 1e9, sa > 0.001 ? (H * 0.86) / sa : 1e9);
        ctx.save();
        ctx.globalAlpha = wmOp;
        ctx.fillStyle = wmColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        let fs = 64;
        ctx.font = "700 " + fs + "px 'Vazirmatn', sans-serif";
        const tw = ctx.measureText(wmText).width;
        if (tw > maxLen) { fs = Math.max(10, Math.floor(fs * maxLen / tw)); ctx.font = "700 " + fs + "px 'Vazirmatn', sans-serif"; }
        ctx.translate(W / 2, H / 2);
        ctx.rotate(rad);
        ctx.fillText(wmText, 0, 0);
        ctx.restore();
      }
    }
  } catch (e) { /* واترمارک اختیاری است؛ خطا نباید ساخت عکس را خراب کند */ }

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

// نسخهٔ اندروید (Capacitor): WebView اندروید navigator.share و دانلودِ فایل ندارد، پس اشتراک با افزونهٔ بومی انجام می‌شود
function azanNativeShare() {
  try {
    const C = window.Capacitor;
    return (C && typeof C.isNativePlatform === 'function' && C.isNativePlatform() && C.Plugins && C.Plugins.AppUpdater) || null;
  } catch (e) { return null; }
}

async function shareAzanTimesAsImage() {
  const s = state.settings || {};
  const title = (s.brand_name || 'عارفان جام') + ' — اوقات شرعی';
  const cal = getCalendarStrings(iranWallNow());
  const caption = title + '\n' + cal.jalali;

  const nat = azanNativeShare();
  if (nat) {
    try {
      const png = buildAzanShareCanvas().toDataURL('image/png');
      await nat.shareImage({ base64: String(png).split(',')[1] || '', title, text: caption });
      return;
    } catch (e) {
      // APK قدیمی (بدون متد اشتراک تصویر) یا خطای ساخت/ارسال: به نسخهٔ متنی برمی‌گردیم
      const msg = String((e && (e.message || e.errorMessage)) || e || '');
      if (/not implemented|unimplemented/i.test(msg)) { try { await appAlert('azan_share_img_old'); } catch (e2) {} }
      shareAzanTimesAsText();
      return;
    }
  }

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
  const nat = azanNativeShare();
  if (nat) {
    nat.shareText({ title, text }).catch(() => {
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => appAlert('azan_copy_done')).catch(() => {});
    });
    return;
  }
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
  // روشی که کاربر خودش انتخاب کرده؛ 'default' = رفتار قبلی (جدول تربت‌جام + اصلاحیه‌های پیشخوان)
  const userMethod = getUserCalcMethod();
  const customMethod = userMethod !== 'default';
  const times = computePrayerTimesLocal(state.coords.lat, state.coords.lng, date, customMethod ? userMethod : AZAN_DEFAULT_CALC, asrFactor, customMethod ? {} : offsets);

  const fixedTz = isIranCoords(state.coords.lat, state.coords.lng);
  const [egy, egm, egd] = prayerDayParts(date, fixedTz);
  const [ejy, ejm, ejd] = gregorianToJalali(egy, egm, egd);
  const cityForTimes = effectiveCityName();

  // برای شهر تربت‌جام، به‌جای محاسبهٔ نجومی، از جدول دقیق اوقات شرعی (طبق تقویم رسمی تربت‌جام) استفاده می‌شود.
  // این جدول همراه خود اپ ذخیره شده، پس کاملاً آفلاین کار می‌کند و نیازی به اینترنت ندارد.
  // اگر تاریخ روز جاری در جدول نباشد (مثلاً بعد از پایان سال ۱۴۰۵)، به‌صورت خودکار به محاسبهٔ نجومی برمی‌گردد.
  if (!customMethod && normCityName(cityForTimes) === normCityName('تربت جام')) {
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

  const exception = customMethod ? null : findAzanException(ejm, ejd, cityForTimes);
  if (exception) {
    times.fajr = applyTimeOverride(times.fajr, exception.fajr);
    times.dhuhr = applyTimeOverride(times.dhuhr, exception.dhuhr);
    times.asr = applyTimeOverride(times.asr, exception.asr);
    times.maghrib = applyTimeOverride(times.maghrib, exception.maghrib);
    times.isha = applyTimeOverride(times.isha, exception.isha);
  }

  // اصلاح دقیقه‌ای که خود کاربر در «تنظیمات» برای هر وقت گذاشته (روی نمایش و اذان هر دو اثر دارد)
  ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'].forEach((k) => { const a = azAdj(k); if (a && times[k]) times[k] = new Date(times[k].getTime() + a * 60000); });

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

  try { renderCalAzan(); } catch (e) {}
  checkAzanAlarm(list, now);
  checkPrayerTimeAlarm(list, now);
  checkPreAzanAlarm(list, now);
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
    .filter((p) => !NON_PRAYER_KEYS.includes(p.key) && !azOff(p.key))
    .forEach((p) => nativePrayers.push({ key: p.key, label: p.label, timeIso: p.time.toISOString() })));
  const prayers = nativePrayers.slice(0, 7 * 5);
  // اذان فقط وقتی فعال است که مدیر خاموشش نکرده باشد و کاربر هم سوییچ «فعال‌سازی پخش اذان» را روشن گذاشته باشد
  const enabled = s.azan_enabled !== '' && bgModeOnSafe();
  const voiceId = azPrefs().voice || s.azan_voice_active || '';
  const preM = azPrefs().pre;
  const key = JSON.stringify(nativePrayers) + '|' + (s.azan_audio_url || '') + '|' + voiceId + '|' + enabled + '|' + preM;
  if (key === lastScheduleSyncKey) return; // چیزی تغییر نکرده
  lastScheduleSyncKey = key;
  // نسخهٔ اندروید (Capacitor): آلارم‌ها به سیستم آلارم خود اندروید سپرده می‌شوند
  if (window.NativeAlarms) window.NativeAlarms.syncSchedule(nativePrayers, enabled, s.brand_name || 'عارفان جام', voiceId, normalizeAzanUrl(s.azan_audio_url) || '');
  if (window.NativeAlarms && typeof window.NativeAlarms.syncPre === 'function') window.NativeAlarms.syncPre(enabled && preM > 0 ? nativePrayers.slice(0, 35) : [], preM);
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
        // برای کد بومی (وقتی اپ بسته است): منطقهٔ زمانی تاریخ کارت (۲۱۰ = وقت ایران؛ نبودن = ساعت گوشی) و لحظهٔ اذان بعدی
        tzMin: (typeof iranFixedNow === 'function' && iranFixedNow()) ? IRAN_TZ_MIN : undefined,
        nextAt: (upcoming && upcoming.time && typeof upcoming.time.getTime === 'function') ? upcoming.time.getTime() : 0,
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
    if (azOff(p.key)) return; // کاربر اذان این وقت را خاموش کرده
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
/* یادآوری «N دقیقه تا اذان» وقتی اپ باز است (نسخهٔ وب). در اپ اندروید همین یادآوری با اعلان بومی (NativeAlarms.syncPre) می‌آید. */
const PRE_PLAYED_PREFIX = 'arefanejam_pre_played_';
function checkPreAzanAlarm(list, now) {
  if (window.NativeAlarms) return;
  const preM = azPrefs().pre;
  if (!preM) return;
  const s = state.settings || {};
  if (s.azan_enabled === '') return;
  const todayKey = now.toDateString();
  list.forEach((p) => {
    if (p.key === 'sunrise' || p.key === 'sunset' || azOff(p.key)) return;
    const at = new Date(p.time.getTime() - preM * 60000);
    const diffMinutes = (now - at) / 60000;
    if (diffMinutes >= 0 && diffMinutes < 2 && p.time > now) {
      const storeKey = PRE_PLAYED_PREFIX + p.key + '_' + preM + '_' + todayKey;
      if (!sessionStorage.getItem(storeKey)) {
        sessionStorage.setItem(storeKey, '1');
        showAlarmModal(toPersianDigits(preM) + ' دقیقه تا اذان ' + p.label, 'به وقت اذان ' + p.label + ' ' + toPersianDigits(preM) + ' دقیقه مانده است.');
      }
    }
  });
}
function checkPrayerTimeAlarm(list, now) {
  const s = state.settings || {};
  if (s.azan_enabled === '') return; // مدیر پخش اذان را کاملاً خاموش کرده است
  const todayKey = now.toDateString();
  const postM = azPrefs().post;
  if (!postM) return; // کاربر یادآوری «وقت نماز» را خاموش کرده
  list.forEach((p) => {
    if (p.key === 'sunrise' || p.key === 'sunset' || p.key === 'maghrib') return;
    if (azOff(p.key)) return;
    const reminderTime = new Date(p.time.getTime() + postM * 60000);
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
    const postM = azPrefs().post, preM = azPrefs().pre;
    if (p.key !== 'maghrib' && postM > 0) {
      const reminderTime = new Date(p.time.getTime() + postM * 60000);
      if (reminderTime > now) upcomingTimes.push(reminderTime);
    }
    if (preM > 0 && !window.NativeAlarms) {
      const preTime = new Date(p.time.getTime() - preM * 60000);
      if (preTime > now) upcomingTimes.push(preTime);
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
  qbNoSensorUpdate();
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

// وب‌ویوی قدیمی (کروم قبل از ۵۰ یا مرورگر پیش‌فرض اندروید ۴): رویداد deviceorientation همان جهت «مطلق» (نسبت به شمال) را می‌دهد
// ولی event.absolute را درست پر نمی‌کند و رویداد deviceorientationabsolute هم وجود ندارد.
function qbOldWebview() {
  try {
    const ua = navigator.userAgent || '';
    const m = /Chrome\/(\d+)/.exec(ua);
    if (m) return parseInt(m[1], 10) < 50;
    return /Android [2-4]\./.test(ua);
  } catch (e) { return false; }
}

/* ----- انتخاب‌گر منبع جهت -----
   چند منبع هم‌زمان گوش داده می‌شود: «native» (بردار چرخش بومی)، «webabs» (deviceorientationabsolute وب‌ویو)،
   «native2» (شتاب‌سنج+مغناطیس‌سنج بومی)، «websensor» (AbsoluteOrientationSensor). بعضی گوشی‌ها منبعی را «فعال» نشان می‌دهند
   ولی جهتش هیچ‌وقت عوض نمی‌شود (صفحه نمی‌چرخد). اگر یک منبع ثابت مانده و منبع دیگری در همان بازه حرکت دارد، منبع متحرک انتخاب می‌شود. */
const QB_ORDER = ['native', 'webabs', 'native2', 'websensor'];
const qbSamples = {};
const qbCounts = {};
function qbRecord(name, h) {
  const now = Date.now();
  const a = qbSamples[name] || (qbSamples[name] = []);
  a.push({ t: now, h: h });
  while (a.length && now - a[0].t > 4000) a.shift();
  qbCounts[name] = (qbCounts[name] || 0) + 1;
}
// بیشترین فاصلهٔ زاویه‌ای از اولین نمونه در ۴ ثانیهٔ اخیر؛ null یعنی هنوز دادهٔ کافی نیست (کمتر از ۲ ثانیه)
function qbRange(name) {
  const a = qbSamples[name];
  if (!a || a.length < 5 || a[a.length - 1].t - a[0].t < 2000) return null;
  let m = 0;
  for (let i = 1; i < a.length; i++) {
    const d = Math.abs((((a[i].h - a[0].h) % 360) + 540) % 360 - 180);
    if (d > m) m = d;
  }
  return m;
}
/* ----- داور گیروسکوپ (ترفند «قطب‌نمای ثابت») -----
   بعضی گوشی‌ها سنسور جهت را «فعال» نشان می‌دهند ولی بعد از یک چرخش ریز دیگر عوض نمی‌شود. گیروسکوپ (devicemotion) مستقل از
   آن‌ها می‌گوید گوشی واقعاً چند درجه چرخیده. هر منبعی که با چرخش واقعی جور نباشد «ناسالم» حساب می‌شود و کنار می‌رود؛
   اگر هیچ منبعی سالم نبود، صفحه با خودِ گیروسکوپ (نسبت به آخرین جهت شناخته‌شده) می‌چرخد تا قطب‌نما هیچ‌وقت ثابت نماند. */
const qbGy = { on: false, raw: 0, last: 0, sgn: 1, n: 0, ring: [], ux: 0, uy: 0, uz: 1, haveG: false, anchorH: null, anchorC: 0, hist: [], flipVotes: 0, lastDg: 0 };
const qbTrust = {};          // qbTrust[منبع] = true (با چرخش واقعی جور بود) / false (ثابت یا ناجور) / undefined (هنوز معلوم نیست)
let qbGyroMode = false;
let qbDecT = 0, qbDecVal = null;

function qbWrap(d) { return ((d % 360) + 540) % 360 - 180; }
function qbGyroNow() { return qbGy.sgn * qbGy.raw; }
function qbGyroDelta(ms) {
  const r = qbGy.ring;
  if (r.length < 5) return null;
  const now = r[r.length - 1].t;
  if (now - r[0].t < ms * 0.8) return null;
  let i = 0;
  while (i < r.length - 1 && r[i].t < now - ms) i++;
  return qbGy.sgn * (r[r.length - 1].c - r[i].c);
}
function qbSrcDelta(name, ms) {
  const a = qbSamples[name];
  if (!a || a.length < 4) return null;
  const last = a[a.length - 1];
  if (Date.now() - last.t > 1500) return null;
  let i = 0;
  while (i < a.length - 1 && a[i].t < last.t - ms) i++;
  if (last.t - a[i].t < ms * 0.7) return null;
  let d = ((last.h - a[i].h) % 360 + 540) % 360 - 180;
  return calibrationFlipped ? -d : d;
}
function qbOnMotion(ev) {
  try {
    const r = ev.rotationRate, g = ev.accelerationIncludingGravity;
    if (!r || !g || g.x == null || g.y == null || g.z == null || r.alpha == null || r.beta == null || r.gamma == null) return;
    const now = Date.now();
    // جهت «بالا» از گرانش (نرم‌شده)
    const m = Math.sqrt(g.x * g.x + g.y * g.y + g.z * g.z) || 1;
    const k = qbGy.haveG ? 0.12 : 1;
    qbGy.ux += k * (g.x / m - qbGy.ux); qbGy.uy += k * (g.y / m - qbGy.uy); qbGy.uz += k * (g.z / m - qbGy.uz);
    qbGy.haveG = true;
    const dt = qbGy.last ? Math.min(0.2, Math.max(0, (now - qbGy.last) / 1000)) : 0;
    qbGy.last = now;
    qbGy.n++;
    // سرعت زاویه‌ای (درجه بر ثانیه) حول محور عمودی؛ جهت قطب‌نما در چرخش ساعت‌گرد زیاد می‌شود
    const yawCcw = r.beta * qbGy.ux + r.gamma * qbGy.uy + r.alpha * qbGy.uz;
    qbGy.raw += -yawCcw * dt;
    qbGy.ring.push({ t: now, c: qbGy.raw });
    while (qbGy.ring.length && now - qbGy.ring[0].t > 4500) qbGy.ring.shift();
    qbChoose();
    if (qbGyroMode && qbGy.anchorH !== null) {
      qbSource = 'gyro';
      applyHeading((qbGy.anchorH + (qbGyroNow() - qbGy.anchorC) + 3600) % 360);
    }
  } catch (e) {}
}
function qbStartGyro() {
  if (qbGy.on) return;
  qbGy.on = true; qbGy.last = 0; qbGy.ring = []; qbGy.haveG = false;
  try { window.addEventListener('devicemotion', qbOnMotion, true); } catch (e) {}
}
function qbStopGyro() {
  qbGy.on = false;
  try { window.removeEventListener('devicemotion', qbOnMotion, true); } catch (e) {}
  qbGy.ring = []; qbGy.anchorH = null; qbGy.hist = []; qbGy.flipVotes = 0;
  QB_ORDER.forEach((n) => { delete qbTrust[n]; });
  qbGyroMode = false; qbDecT = 0; qbDecVal = null;
}
// هر ~۰٫۳ ثانیه، وقتی گوشی واقعاً می‌چرخد، منبع‌ها با گیروسکوپ مقایسه می‌شوند
function qbJudge(live) {
  const W = 2000;
  const dg = qbGyroDelta(W);
  if (dg === null) return;
  qbGy.lastDg = dg;
  if (Math.abs(dg) < 15) return;
  const tol = Math.max(15, Math.abs(dg) * 0.4);
  let flipHit = 0, any = 0;
  live.forEach((n) => {
    const ds = qbSrcDelta(n, W);
    if (ds === null) return;
    any++;
    qbTrust[n] = Math.abs(qbWrap(ds - dg)) <= tol;
    // اگر منبعی درست و به‌اندازه ولی «برعکس» می‌چرخد، علامت گیروسکوپ اشتباه فرض شده است
    if (!qbTrust[n] && Math.abs(dg) >= 25 && Math.abs(ds) >= 25 && Math.abs(qbWrap(ds + dg)) <= tol) flipHit++;
  });
  if (any && flipHit && !live.some((n) => qbTrust[n] === true)) {
    if (++qbGy.flipVotes >= 3) { qbGy.sgn = -qbGy.sgn; qbGy.flipVotes = 0; qbGy.anchorC = qbGyroNow(); }
  } else if (flipHit === 0) qbGy.flipVotes = 0;
}
function qbChoose() {
  const now = Date.now();
  if (qbDecT && now - qbDecT < 250) return qbDecVal;
  const live = QB_ORDER.filter((n) => { const a = qbSamples[n]; return a && a.length && now - a[a.length - 1].t < 1500; });
  qbJudge(live);
  let res;
  const judged = QB_ORDER.some((n) => qbTrust[n] !== undefined);
  if (judged) {
    const good = live.filter((n) => qbTrust[n] === true);
    const unknown = live.filter((n) => qbTrust[n] === undefined);
    if (good.length) res = good[0];
    else if (unknown.length) res = unknown[0];
    else res = (qbGy.on && qbGy.n > 5 && qbGy.anchorH !== null) ? 'gyro' : (qbGpsFresh() ? 'gps' : (live[0] || null));
  } else if (!live.length) {
    res = (qbGy.on && qbGy.n > 5 && qbGy.anchorH !== null && now - qbLastHeadingTs > 2000) ? 'gyro' : (qbGpsFresh() ? 'gps' : null);
  } else {
    const moving = live.filter((n) => { const r = qbRange(n); return r === null || r >= 3; });
    res = moving.length ? moving[0] : live[0];
  }
  if (res === 'gyro' && !qbGyroMode && qbGy.hist.length) {
    // منبع ثابت از لحظهٔ شروع چرخش خراب بوده؛ مرجع را به قبل از چرخش (~۲ ثانیه پیش) برمی‌گردانیم
    let e = qbGy.hist[0];
    for (let i = 0; i < qbGy.hist.length; i++) { if (qbGy.hist[i].t <= now - 2000) e = qbGy.hist[i]; }
    qbGy.anchorH = e.h; qbGy.anchorC = e.c;
  }
  qbGyroMode = (res === 'gyro');
  qbDecT = now; qbDecVal = res;
  return res;
}
function qbFeed(name, h) {
  if (typeof h !== 'number' || isNaN(h)) return;
  qbRecord(name, h);
  if (qbChoose() !== name) return;
  qbSource = name;
  if (calibrationFlipped) h = (360 - h) % 360;
  qbGy.anchorH = h; qbGy.anchorC = qbGyroNow();   // نقطهٔ مرجع برای حالت گیروسکوپ
  qbGy.hist.push({ t: Date.now(), h: h, c: qbGy.anchorC });
  while (qbGy.hist.length && Date.now() - qbGy.hist[0].t > 6000) qbGy.hist.shift();
  applyHeading(h);
}

function handleOrientationAbs(event) {
  if (event.alpha === null || event.alpha === undefined) return;
  gotAbsoluteOrientation = true;
  const h = headingFromEuler(event.alpha, event.beta || 0, event.gamma || 0);
  if (h === null) return;
  qbFeed('webabs', h);
}

function handleOrientation(event) {
  // iOS: جهت قطب‌نما را خود سیستم می‌دهد
  if (typeof event.webkitCompassHeading === 'number') {
    gotWebkitCompass = true;
    qbFeed('webabs', event.webkitCompassHeading);
    return;
  }
  // اندروید: رویداد «نسبی» جهت واقعی ندارد؛ فقط اگر مطلق باشد و رویداد absolute نیامده استفاده می‌شود
  if (gotAbsoluteOrientation || event.alpha === null || event.alpha === undefined) return;
  if (event.absolute !== true && !qbOldWebview()) return;
  const h = headingFromEuler(event.alpha, event.beta || 0, event.gamma || 0);
  if (h === null) return;
  qbFeed('webabs', h);
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
  if (s && !qbGyroMode && s.classList.contains('is-calib')) s.classList.remove('is-calib');
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
  qbKickN = 0;
  qbNsAutoDone = false; qbStartedAt = Date.now();
  window.addEventListener('deviceorientationabsolute', handleOrientationAbs, true);
  window.addEventListener('deviceorientation', handleOrientation, true);
  qbStartNativeCompass();
  qbStartGyro();
  // ترفند ۲: اگر ~۲ ثانیه هیچ جهتی نرسید، سنسور استاندارد AbsoluteOrientationSensor (کروم ۶۷+) امتحان می‌شود
  clearTimeout(qbGenericTimer);
  qbGenericTimer = setTimeout(qbStartGenericSensor, 2000);
}

let qbNativeSrc = '';
let qbSource = '';            // منبع جهت فعلی (برای تشخیص عیب؛ ۵ ضربهٔ سریع روی صفحهٔ قطب‌نما)
let qbNativeAcc = 3;          // دقت سنسور مغناطیسی بومی (۰ تا ۳)
let qbGenericTimer = null;
let qbGenericSensor = null;
function qbStartGenericSensor() {
  try {
    if (!qiblaListenerAttached || gotNativeHeading || gotAbsoluteOrientation || gotWebkitCompass || qbGenericSensor) return;
    if (typeof window.AbsoluteOrientationSensor !== 'function') return;
    const sen = new window.AbsoluteOrientationSensor({ frequency: 30, referenceFrame: 'device' });
    sen.addEventListener('reading', () => {
      if (!sen.quaternion) return;
      const x = sen.quaternion[0], y = sen.quaternion[1], z = sen.quaternion[2], w = sen.quaternion[3];
      const r8 = 1 - 2 * (x * x + y * y);
      let east, north;
      if (Math.abs(r8) > 0.6) { east = 2 * (x * y - z * w); north = 1 - 2 * (x * x + z * z); }
      else { east = -2 * (x * z + y * w); north = -2 * (y * z - x * w); }
      if (Math.abs(east) < 1e-6 && Math.abs(north) < 1e-6) return;
      let h = (Math.atan2(east, north) * 180 / Math.PI + 360) % 360;
      qbFeed('websensor', h);
    });
    sen.addEventListener('error', () => {});
    sen.start();
    qbGenericSensor = sen;
  } catch (e) {}
}
function qbStopGenericSensor() {
  clearTimeout(qbGenericTimer);
  try { if (qbGenericSensor) qbGenericSensor.stop(); } catch (e) {}
  qbGenericSensor = null;
}

// سنسور بومی اندروید (با APK جدید): روی همهٔ گوشی‌ها کار می‌کند، حتی بدون گیروسکوپ و با وب‌ویوی قدیمی.
// (بردار چرخش ← شتاب‌سنج + میدان مغناطیسی ← سنسور قدیمی جهت). هر وقت جهت بومی رسید، سنسورهای وب نادیده گرفته می‌شوند.
function qbStartNativeCompass() {
  try {
    const A = qbNative();
    if (!A || !A.startQiblaSensor || !A.addListener) return;
    if (!qbNativeHandle) {
      qbNativeHandle = 'pending';
      Promise.resolve(A.addListener('qiblaHeading', (e) => {
        if (!qiblaListenerAttached || !e || typeof e.heading !== 'number') return;
        gotNativeHeading = true;
        if (typeof e.accuracy === 'number') qbNativeAcc = e.accuracy;
        qbNativeSrc = e.source || '?';
        qbFeed('native', ((e.heading % 360) + 360) % 360);
      })).then((hd) => { qbNativeHandle = hd || null; }).catch(() => { qbNativeHandle = null; });
      // منبع دوم بومی (شتاب‌سنج + مغناطیس‌سنج) که هم‌زمان با بردار چرخش اجرا می‌شود
      Promise.resolve(A.addListener('qiblaHeading2', (e) => {
        if (!qiblaListenerAttached || !e || typeof e.heading !== 'number') return;
        qbFeed('native2', ((e.heading % 360) + 360) % 360);
      })).catch(() => {});
    }
    Promise.resolve(A.startQiblaSensor()).catch(() => {});
  } catch (e) {}
}
function qbStopNativeCompass() {
  try {
    const A = qbNative();
    gotNativeHeading = false;
    if (A && A.stopQiblaSensor) Promise.resolve(A.stopQiblaSensor()).catch(() => {});
  } catch (e) {}
}

// اگر ~۲٫۵ ثانیه هیچ جهتی نرسید، سنسورها دوباره ثبت می‌شوند (حداکثر ۶ بار، با فاصلهٔ ۵ ثانیه)
let qbKickT = 0, qbKickN = 0;
function qbKick() {
  const now = Date.now();
  if (now - qbKickT < 5000 || qbKickN >= 6 || !qiblaListenerAttached) return;
  qbKickT = now; qbKickN++;
  try { qbStopNativeCompass(); setTimeout(() => { if (qiblaListenerAttached) qbStartNativeCompass(); }, 300); } catch (e) {}
  try {
    window.removeEventListener('deviceorientationabsolute', handleOrientationAbs, true);
    window.removeEventListener('deviceorientation', handleOrientation, true);
    window.addEventListener('deviceorientationabsolute', handleOrientationAbs, true);
    window.addEventListener('deviceorientation', handleOrientation, true);
  } catch (e) {}
}

function qbStopSensors() {
  if (!qiblaListenerAttached) return;
  qiblaListenerAttached = false;
  QB_ORDER.forEach((n) => { qbSamples[n] = []; });
  qbStopGenericSensor();
  qbStopNativeCompass();
  qbStopGyro();
  qbGpsStop();
  try {
    window.removeEventListener('deviceorientationabsolute', handleOrientationAbs, true);
    window.removeEventListener('deviceorientation', handleOrientation, true);
  } catch (e) {}
}


/* ----- قبله‌یابی بدون قطب‌نما (برای گوشی‌های بدون سنسور جهت یا با سنسور خراب) -----
   موقعیت خورشید از روی مکان و ساعت گوشی حساب می‌شود (بدون هیچ سنسوری)؛ شب هم ستارهٔ قطب (شمال) مرجع است.
   زاویهٔ قبله از شمال حقیقی است و موقعیت خورشید هم نسبت به شمال حقیقی؛ پس انحراف مغناطیسی لازم نیست. */
function qbSunPos(lat, lng, date) {
  const R = Math.PI / 180;
  const n = date.getTime() / 86400000 + 2440587.5 - 2451545.0;
  const L = (280.460 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * R;
  const lam = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * R;
  const eps = (23.439 - 0.0000004 * n) * R;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lam));
  const gmst = ((18.697374558 + 24.06570982441908 * n) % 24 + 24) % 24;
  const ha = (gmst * 15 + lng) * R - ra;
  const la = lat * R;
  const el = Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(ha)) / R;
  const az = (Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(la) - Math.tan(dec) * Math.cos(la)) / R + 180 + 360) % 360;
  return { az: az, el: el };
}

/* ----- جهت از روی GPS (راه رفتن) -----
   GPS فقط وقتی جهت می‌دهد که گوشی حرکت کند (جهت حرکت). کاربر گوشی را رو به جلو می‌گیرد و چند قدم راه می‌رود؛ جهت حرکت = شمال حقیقی.
   این جهت (۱) نقطهٔ مرجع گیروسکوپ می‌شود تا بعد از ایستادن هم با چرخش گوشی ادامه بدهد، (۲) سنسورهای جهت را راستی‌آزمایی می‌کند
   (ثابت یا ناجور ← ناسالم)، (۳) در گوشی بدون گیروسکوپ و بدون سنسور، تا ۱۰ ثانیه بعد از هر راه رفتن خودش جهت می‌دهد. */
const qbGps = { on: false, id: null, ref: null, last: null, acc: null, msg: '', bad: {} };
function qbGpsFresh() { return !!(qbGps.last && Date.now() - qbGps.last.t < 10000); }
function qbBearing(lat1, lng1, lat2, lng2) {
  const R = Math.PI / 180, p1 = lat1 * R, p2 = lat2 * R, dl = (lng2 - lng1) * R;
  const y = Math.sin(dl) * Math.cos(p2), x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (Math.atan2(y, x) / R + 360) % 360;
}
function qbGpsFix(trueH) {
  const now = Date.now();
  qbGps.last = { t: now, h: trueH };
  const magH = (((trueH - qiblaDeclination) % 360) + 360) % 360;
  // راستی‌آزمایی سنسورها با جهت حرکت (فرض: گوشی رو به جلو گرفته شده)
  QB_ORDER.forEach((n) => {
    const a = qbSamples[n];
    if (!a || !a.length || now - a[a.length - 1].t > 1500) return;
    let h = a[a.length - 1].h; if (calibrationFlipped) h = (360 - h) % 360;
    const err = Math.abs(qbWrap(((h + qiblaDeclination) % 360) - trueH));
    if (err <= 25) { qbTrust[n] = true; qbGps.bad[n] = 0; }
    else if (err > 40 && (qbGps.bad[n] = (qbGps.bad[n] || 0) + 1) >= 2) qbTrust[n] = false;
  });
  qbGy.anchorH = magH; qbGy.anchorC = qbGyroNow();
  qbGy.hist.push({ t: now, h: magH, c: qbGy.anchorC });
  qbDecT = 0;
  const res = qbChoose();
  if (res === 'gyro' || res === 'gps') { qbSource = res; for (let i = 0; i < 10; i++) applyHeading(magH); }
}
function qbGpsOnPos(pos) {
  try {
    const c = pos.coords, now = Date.now();
    qbGps.acc = c.accuracy;
    let h = null;
    if (typeof c.heading === 'number' && !isNaN(c.heading) && typeof c.speed === 'number' && c.speed >= 0.7 && c.accuracy <= 40) h = c.heading;
    else if (c.accuracy <= 30) {
      const p = { lat: c.latitude, lng: c.longitude, t: now };
      if (!qbGps.ref) qbGps.ref = p;
      else {
        const d = qbDistanceKm(qbGps.ref.lat, qbGps.ref.lng, p.lat, p.lng) * 1000;
        if (d >= Math.max(8, 1.5 * c.accuracy)) { h = qbBearing(qbGps.ref.lat, qbGps.ref.lng, p.lat, p.lng); qbGps.ref = p; }
        else if (now - qbGps.ref.t > 20000) qbGps.ref = p;
      }
    }
    if (h !== null) qbGpsFix(h);
    qbNoSensorUpdate();
  } catch (e) {}
}
function qbGpsStart() {
  if (qbGps.on) return;
  if (!navigator.geolocation) { qbGps.msg = 'این گوشی GPS را در اپ در دسترس نمی‌گذارد.'; qbNoSensorUpdate(); return; }
  qbGps.on = true; qbGps.ref = null; qbGps.bad = {}; qbGps.msg = '';
  try {
    qbGps.id = navigator.geolocation.watchPosition(qbGpsOnPos, (err) => {
      qbGps.msg = (err && err.code === 1) ? 'اجازهٔ مکان داده نشده است؛ مکان گوشی را برای اپ روشن کنید.' : 'GPS در دسترس نیست؛ بیرون از ساختمان امتحان کنید.';
      qbNoSensorUpdate();
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
  } catch (e) { qbGps.on = false; }
  qbNoSensorUpdate();
}
function qbGpsStop() {
  try { if (qbGps.id !== null) navigator.geolocation.clearWatch(qbGps.id); } catch (e) {}
  qbGps.id = null; qbGps.on = false; qbGps.ref = null;
}

let qbNsOpen = false, qbNsAutoDone = false, qbStartedAt = 0, qbGyroSince = 0;
function qbNoSensorUpdate() {
  try {
    const card = qbEl('qb-nosensor'), txt = qbEl('qb-nosensor-text'), note = qbEl('qb-nosensor-note');
    if (!card || !txt) return;
    if (!qbNsOpen || qiblaBearing === null || !state.coords) { card.classList.add('hidden'); return; }
    const sp = qbSunPos(state.coords.lat, state.coords.lng, new Date());
    const P = (v) => toPersianDigits(String(Math.round(v)));
    const turn = (refAz) => { const rel = (((qiblaBearing - refAz) % 360) + 360) % 360; return rel <= 180 ? { d: rel, dir: 'راست' } : { d: 360 - rel, dir: 'چپ' }; };
    let t, msg;
    if (sp.el >= 5) {
      t = turn(sp.az);
      msg = 'الان خورشید بالای افق است. رو به خورشید بایستید، سپس حدود ' + P(t.d) + ' درجه به سمت ' + t.dir + ' بچرخید؛ همان‌جا قبله است.';
      if (note) note.textContent = 'ارتفاع خورشید حدود ' + P(sp.el) + ' درجه است. ۹۰ درجه مثل گوشهٔ یک کتاب است. ساعت و تاریخ گوشی باید درست باشد.' + (sp.el > 75 ? ' (خورشید تقریباً بالای سر است؛ دقت کم می‌شود.)' : '');
    } else {
      const north = state.coords.lat >= 0;
      t = turn(north ? 0 : 180);
      msg = 'الان خورشید پایین است. ' + (north ? 'ستارهٔ قطب (شمال) را پیدا کنید' : 'رو به جنوب بایستید') + ' و رو به آن بایستید، سپس حدود ' + P(t.d) + ' درجه به سمت ' + t.dir + ' بچرخید؛ همان‌جا قبله است.';
      if (note) note.textContent = north ? 'ستارهٔ قطب با دو ستارهٔ آخر «ملاقه» (صورت فلکی دب اکبر) پیدا می‌شود. زاویهٔ قبله از شمال: ' + P(qiblaBearing) + ' درجه.' : 'زاویهٔ قبله از شمال: ' + P(qiblaBearing) + ' درجه.';
    }
    txt.textContent = msg;
    const gb = qbEl('qb-gps-btn'), gs = qbEl('qb-gps-status');
    if (gb) gb.textContent = qbGps.on ? '⏹ توقف GPS' : '📡 پیدا کردن جهت با GPS (چند قدم راه بروید)';
    if (gs) {
      let st = '';
      if (qbGps.on) {
        const g = qbGps.last;
        if (g) st = 'جهت از GPS: ' + P(g.h) + '° (' + P((Date.now() - g.t) / 1000) + ' ثانیه پیش). ' + ((qbGy.on && qbGy.n > 5) ? 'حالا می‌توانید بایستید و بچرخید؛ صفحه با گیروسکوپ ادامه می‌دهد. اگر بعد از چند دقیقه کج شد، دوباره چند قدم راه بروید.' : 'این گوشی گیروسکوپ ندارد؛ جهت فقط هنگام راه رفتن به‌روز می‌شود.');
        else st = 'GPS روشن است' + (qbGps.acc ? ' (دقت ' + P(qbGps.acc) + ' متر)' : '') + '. گوشی را رو به جلو بگیرید و بیرون از ساختمان حدود ۱۰ تا ۲۰ قدم در یک مسیر مستقیم راه بروید.';
      }
      if (qbGps.msg) st = qbGps.msg + ' ' + st;
      gs.textContent = st;
    }
    card.classList.remove('hidden');
  } catch (e) {}
}
(function () {
  const b = qbEl('qb-nosensor-btn'), x = qbEl('qb-nosensor-x');
  if (b) b.addEventListener('click', () => { qbNsOpen = !qbNsOpen; if (!qbNsOpen) qbGpsStop(); qbNoSensorUpdate(); });
  if (x) x.addEventListener('click', () => { qbNsOpen = false; qbGpsStop(); qbNoSensorUpdate(); });
  const gb = qbEl('qb-gps-btn');
  if (gb) gb.addEventListener('click', () => { if (qbGps.on) qbGpsStop(); else { qbGps.msg = ''; qbGps.last = null; qbGpsStart(); } qbNoSensorUpdate(); });
})();

// اگر چند ثانیه هیچ جهتی نرسید (سنسور نیاز به کالیبره دارد)، نشانهٔ ∞ نمایش داده می‌شود
setInterval(() => {
  try {
    const s = qbEl('qb-scene');
    if (!s || currentTab !== 'qibla') return;
    s.classList.toggle('is-calib', qiblaListenerAttached && qbHasLocation() && (qbGyroMode || Date.now() - qbLastHeadingTs > 3500 || (gotNativeHeading && qbNativeAcc <= 0)));
    if (qiblaListenerAttached && !qbGyroMode && Date.now() - qbLastHeadingTs > 2500) qbKick();
    const nowT = Date.now();
    if (qbGyroMode) { if (!qbGyroSince) qbGyroSince = nowT; } else qbGyroSince = 0;
    if (qiblaListenerAttached && qbHasLocation() && !qbNsAutoDone && ((nowT - qbLastHeadingTs > 5000) || (qbGyroSince && nowT - qbGyroSince > 8000))) { qbNsAutoDone = true; }
    if (qbNsOpen) qbNoSensorUpdate();
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
// تشخیص عیب (بدون نوشته در صفحه): ۵ ضربهٔ سریع روی قطب‌نما، گزارش کوتاهی نشان می‌دهد تا برای گوشی‌های قدیمی بشود علت را دقیق فهمید
(function () {
  let taps = [];
  const c = qbEl('qb-compass');
  if (!c) return;
  c.addEventListener('click', () => {
    const now = Date.now();
    taps = taps.filter((t) => now - t < 3000); taps.push(now);
    if (taps.length < 5) return;
    taps = [];
    const m = /Chrome\/(\d+)/.exec(navigator.userAgent || '');
    const A = qbNative();
    const info = [
      'WebView: ' + (m ? m[1] : '?'),
      'Android: ' + ((/Android ([\d.]+)/.exec(navigator.userAgent || '') || [])[1] || '?'),
      'منبع جهت: ' + (qbSource || 'هیچ') + (qbNativeSrc ? ' (بومی: ' + qbNativeSrc + ')' : ''),
      QB_ORDER.map((n) => { const a = qbSamples[n] || [], r = qbRange(n); return n + ': ' + (qbCounts[n] || 0) + ' نمونه' + (a.length ? '، آخرین ' + Math.round(a[a.length - 1].h) + '°' : '') + (r === null ? '' : '، حرکت ' + Math.round(r) + '°'); }).join('\n'),
      'گیروسکوپ: ' + (qbGy.n ? qbGy.n + ' نمونه، چرخش ۲ ثانیهٔ اخیر ' + Math.round(qbGy.lastDg) + '°' + (qbGy.sgn < 0 ? '، علامت برعکس' : '') : 'نمونه‌ای نرسید'),
      'داوری منبع‌ها: ' + (QB_ORDER.filter((n) => qbTrust[n] !== undefined).map((n) => n + (qbTrust[n] ? ' ✓' : ' ✗')).join('، ') || 'هنوز چرخش کافی نبوده') + (qbGyroMode ? ' ← حالت گیروسکوپ' : ''),
      'GPS: ' + (qbGps.on ? 'روشن' + (qbGps.acc ? '، دقت ' + Math.round(qbGps.acc) + ' متر' : '') : 'خاموش') + (qbGps.last ? '، آخرین جهت ' + Math.round(qbGps.last.h) + '°' : ''),
      'سنسور بومی: ' + (A && A.startQiblaSensor ? 'هست' : 'نیست (APK قدیمی)'),
      'AbsoluteOrientationSensor: ' + (typeof window.AbsoluteOrientationSensor === 'function' ? 'هست' : 'نیست'),
      'DeviceOrientationEvent: ' + (typeof window.DeviceOrientationEvent !== 'undefined' ? 'هست' : 'نیست'),
      'مکان: ' + (qbHasLocation() ? 'مشخص' : 'نامشخص'),
      'جهت قبله: ' + (qiblaBearing === null ? '—' : Math.round(qiblaBearing) + '°')
    ];
    try { alert(info.join('\n')); } catch (e) {}
  });
})();
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
  { id: 'ar.ahmedajamy', name: 'احمد العجمی' },
  { id: 'ar.hanirifai', name: 'هانی الرفاعی' },
  { id: 'ar.saoodshuraym', name: 'سعود الشریم' },
  { id: 'ar.muhammadayyoub', name: 'محمد ایوب' },
  { id: 'ar.ibrahimakhbar', name: 'ابراهیم الاخضر' },
  { id: 'ar.husarymujawwad', name: 'حصری (مجوّد)' },
  { id: 'ar.minshawimujawwad', name: 'منشاوی (مجوّد)' },
];
let currentReciter = localStorage.getItem('arefanejam_reciter') || 'ar.alafasy';
if (!RECITERS.some((r) => r.id === currentReciter)) currentReciter = 'ar.alafasy';
const recitationAudio = new Audio();
/* «بازکردن قفل صدا» برای پخش خودکار بعد از تأیید یادآوری: مرورگر/WebView اجازهٔ پخش را فقط در لحظهٔ لمس کاربر می‌دهد، اما پیدا کردن
   آخرین آیه و آماده‌شدن صوت چند ثانیه (گاهی بیشتر) طول می‌کشد و اجازه می‌پرد. پس همان لحظهٔ لمس، روی همین المنت یک صدای بی‌صدا و بسیار
   کوتاه پخش می‌کنیم؛ بعد از آن پخش آیه‌ها روی همین المنت هر وقت آماده شدند بدون مانع شروع می‌شود. */
let recitationUnlocking = false;
const SILENT_WAV_URI = 'data:audio/wav;base64,UklGRmQGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YUAGAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA';
function unlockRecitationAudio() {
  try {
    if (!recitationAudio.paused) return;          // همین الان صدایی در حال پخش است؛ قفل باز است
    recitationUnlocking = true;
    recitationAudio.src = SILENT_WAV_URI;
    const pr = recitationAudio.play();
    if (pr && pr.catch) pr.catch(() => {});
    setTimeout(() => { recitationUnlocking = false; }, 600);
  } catch (e) { recitationUnlocking = false; }
}

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
/* نام دلخواه قاری‌ها از پیشخوان (← نام قاری‌ها): از /settings (فیلد reciter_names) می‌آید و روی RECITERS اعمال می‌شود؛ شناسه‌ها عوض نمی‌شوند.
   قبل از ساخته شدن RECITERS صدا زده شود خطا نمی‌دهد (بی‌صدا رد می‌شود) و بعد از ساخته شدن دوباره صدا زده می‌شود. */
function applyReciterNames() {
  try {
    const map = ((state.settings || {}).reciter_names) || {};
    let changed = false;
    RECITERS.forEach((r) => {
      if (r._orig === undefined) r._orig = r.name;
      const nm = String(map[r.id] || '').trim() || r._orig;
      if (nm !== r.name) { r.name = nm; changed = true; }
    });
    if (!changed) return;
    const sel = document.getElementById('reciter-select');
    if (sel) Array.prototype.forEach.call(sel.options, (o) => { const r = RECITERS.find((x) => x.id === o.value); if (r) o.textContent = 'قاری: ' + r.name; });
    document.querySelectorAll('.rc-chip').forEach((c) => { const r = RECITERS.find((x) => x.id === c.dataset.id); if (r) c.textContent = r.name; });
  } catch (e) { /* RECITERS هنوز ساخته نشده */ }
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
applyReciterNames();
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
  try { trackPage('item:surah:' + number, 'سوره ' + msgSurahName(name)); } catch (e) {}
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
/* ---------- پیش‌دانلودِ غلتان: همین‌که صوت یک آیه شروع به پخش شد، صوت دو آیهٔ بعدی (حتی اگر به سورهٔ بعد یا صفحهٔ بعد برسد)
   بی‌صدا دانلود و ذخیره می‌شود؛ با شروع پخش هر آیه، دو آیهٔ بعدش هم همین‌طور — پس کاربر هنگام گوش‌دادن مدام منتظر دانلود نمی‌ماند.
   آیه‌هایی که از قبل ذخیره‌اند رد می‌شوند؛ بدون اینترنت کاری نمی‌کند (و صدای ذخیره‌شده خودش آفلاین پخش می‌شود). */
const AUDIO_LOOKAHEAD = 2;
async function isAyahCachedQuick(reciter, g) {
  try {
    const cache = await caches.open(QURAN_AUDIO_CACHE_NAME);
    for (const b of AUDIO_BITRATES) { if (await cache.match(buildAudioUrl(reciter, b, g))) return true; }
  } catch (e) {}
  return false;
}
function prefetchNextAyahs(fromGlobal) {
  try {
    if (!window.caches || navigator.onLine === false) return;
    const reciter = currentReciter;
    const base = Number(fromGlobal);
    if (!(base >= 1)) return;
    (async () => {
      for (let n = 1; n <= AUDIO_LOOKAHEAD; n++) {
        const g = base + n;
        if (g > QURAN_TOTAL_AYAHS || navigator.onLine === false) break;
        if (await isAyahCachedQuick(reciter, g)) continue;
        await ensureAyahCached(reciter, g, 20000);
      }
    })().catch(() => {});
  } catch (e) {}
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
    prefetchNextAyahs(globalAyahNumber);
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
    prefetchNextAyahs(ayah.number);
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
  if (recitationUnlocking) return; // پایان صدای بی‌صدای «باز کردن قفل»، نه پایان یک آیه
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
/* صفحهٔ «فهرست جزءها» از اپ حذف شد (به درخواست مدیر). خواندن/پخش جزء از مسیرهای دیگر (openJuzReader) سر جایش است. */
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

/* ---------- آمار بازدید صفحه‌ها (هر صفحه/آیتمی که اضافه شود خودکار شمرده می‌شود) ----------
   - هر بار تب عوض شود (switchToTab) یک بازدید ثبت می‌شود؛ برای آیتم‌های داخل صفحه (فعالیت‌ها، سوره‌ها، ...) از
     trackPage('item:نوع:شناسه', 'نام خوانا') استفاده کنید تا در پیشخوان ← آمار کاربران ← «بازدید آیتم‌ها» بیاید.
   - بدون اینترنت: بازدیدها در گوشی صف می‌شوند و با برگشتن اینترنت (با زمان واقعی خودشان) فرستاده می‌شوند.
   - «الان در کدام صفحه‌اند»: heartbeat هر ۶۰ ثانیه (و همان لحظهٔ عوض‌شدن صفحه) صفحهٔ فعلی را هم می‌فرستد. */
var PV_QUEUE_KEY = 'arefanejam_pv_queue';
var pvLast = { key: '', t: 0 };
var pvFlushing = false;
var pvPingTimer = null;
var pvHiddenAt = 0;
var curPageKey = '';
function pvQueueRead() { try { const q = JSON.parse(localStorage.getItem(PV_QUEUE_KEY) || '[]'); return Array.isArray(q) ? q : []; } catch (e) { return []; } }
function pvQueueWrite(q) { try { localStorage.setItem(PV_QUEUE_KEY, JSON.stringify(q.slice(-200))); } catch (e) {} }
function currentPageKey() { return curPageKey || (typeof currentTab !== 'undefined' ? currentTab : '') || ''; }
var pvSoonTimer = null;
function pvFlushSoon() {
  const d = trafficSec('pv_s', 0);
  if (d <= 0) { pvFlush(); return; }
  if (pvSoonTimer) return;
  pvSoonTimer = setTimeout(() => { pvSoonTimer = null; pvFlush(); }, d * 1000);
}
async function pvFlush() {
  if (pvFlushing || siteDownNow()) return;
  if (!pvQueueRead().length || navigator.onLine === false) return;
  pvFlushing = true;
  let pvFailed = false;
  try {
    const device_id = await ensureDeviceId();
    const batch = pvQueueRead().slice(0, 40);
    if (batch.length) {
      const now = Date.now();
      const items = batch.map((e) => ({ page: e.p, label: e.l || undefined, ago: Math.max(0, Math.round((now - e.t) / 1000)) }));
      await apiFetch('/track-page', { method: 'POST', body: JSON.stringify({ device_id, items }) });
      pvQueueWrite(pvQueueRead().slice(batch.length));
    }
  } catch (e) { pvFailed = true; /* صف می‌ماند؛ بار بعد دوباره تلاش می‌شود (بدون حلقهٔ تکرار) */ }
  pvFlushing = false;
  if (!pvFailed && pvQueueRead().length && navigator.onLine !== false) setTimeout(pvFlush, 1500);
}
function trackPage(key, label) {
  try {
    key = String(key || '');
    if (!key) return;
    const now = Date.now();
    if (pvLast.key === key && now - pvLast.t < 4000) return; // دوبار اجرای پشت‌سرهم یک بازدید حساب شود
    pvLast = { key: key, t: now };
    const q = pvQueueRead();
    q.push({ p: key, l: String(label || '').slice(0, 60), t: now });
    pvQueueWrite(q);
    pvFlushSoon();
  } catch (e) {}
}
function pvPingSoon() {
  const hb = trafficSec('hb_s', 60);
  if (hb === 0 || hb >= 120) return;   // حالت صرفه‌جویی: heartbeat دوره‌ای کافی است
  clearTimeout(pvPingTimer);
  pvPingTimer = setTimeout(() => { try { sendHeartbeat(); } catch (e) {} }, 1200);
}
function pvOnTabSwitch(tabName) {
  try {
    let pk = String(tabName || ''), pl = '';
    if (pk === 'submenu') {
      const t = document.getElementById('submenu-title');
      pk = 'submenu:' + (window.__menuGroupKey || '');
      pl = 'منو: ' + (t ? t.textContent.trim() : '');
    } else {
      const h = document.querySelector('#tab-' + pk + ' h2, #tab-' + pk + ' h3');
      pl = h ? h.textContent.trim() : '';
      if (pl.length < 2 || pl === '—') pl = '';
    }
    curPageKey = pk;
    trackPage(pk, pl);
    pvPingSoon();
  } catch (e) {}
}
document.addEventListener('visibilitychange', () => {
  try {
    if (document.hidden) { pvHiddenAt = Date.now(); sendHeartbeat(); return; } // صفحه '' می‌رود: کاربر از «الان آنلاین هر صفحه» خارج می‌شود
    if (pvHiddenAt && Date.now() - pvHiddenAt > 60000) trackPage(currentPageKey()); // برگشت از پس‌زمینه = بازدید تازه
    pvFlush();
    sendHeartbeat();
  } catch (e) {}
});
window.addEventListener('online', () => { try { pvFlush(); } catch (e) {} });

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

/* ---------- بیشتر: تصویر دلخواهِ هر آیکون (مدیر از پیشخوان ← «🖼️ آیکون‌های بیشتر» تعیین می‌کند) ----------
   هر کاشی کلید data-ikey دارد (main:… برای صفحهٔ بیشتر، sub:… برای زیرمنوها). اگر برای کلید تصویری تعیین شده باشد،
   همان به‌جای ایموجی نشان داده می‌شود؛ وگرنه ایموجی/آیکون قبلی می‌ماند. آفلاین هم کار می‌کند (فهرست در localStorage و عکس‌ها در کش). */
function applyMoreIconToTile(tile) {
  try {
    if (!tile || !tile.dataset) return;
    const key = tile.dataset.ikey; if (!key) return;
    const badge = tile.querySelector('.menu-tile-badge'); if (!badge) return;
    const raw = moreIconsData.icons && moreIconsData.icons[key];
    if (raw) {
      const url = String(secureUrl(raw)).replace(/["'()\\\s]/g, (c) => encodeURIComponent(c));
      badge.classList.add('has-custom-icon');
      badge.classList.toggle('cicon-free', moreIconsData.shape === 'free');
      badge.style.setProperty('background-image', 'url("' + url + '")', 'important');
    } else if (badge.classList.contains('has-custom-icon')) {
      badge.classList.remove('has-custom-icon', 'cicon-free');
      badge.style.removeProperty('background-image');
    }
  } catch (e) {}
}
function applyMoreIcons() {
  document.querySelectorAll('#tab-more .menu-tile[data-ikey], #submenu-list .menu-tile[data-ikey]').forEach(applyMoreIconToTile);
}
// تعداد آیکون در هر ردیف «بیشتر» (۲ تا ۵؛ پیش‌فرض ۳). مقدار برای باز شدن بعدی (بدون چشمک‌زدن) در localStorage می‌ماند.
function applyMoreCols(n) {
  try {
    n = parseInt(n, 10); if (!(n >= 2 && n <= 5)) n = 3;
    document.documentElement.setAttribute('data-more-cols', String(n));
    localStorage.setItem('arefanejam_more_cols', String(n));
  } catch (e) {}
}
function loadMoreIcons(force) {
  if (!force && Date.now() - moreIconsLastLoad < 60000) return;
  moreIconsLastLoad = Date.now();
  try {
    apiSWR('/more-icons', (d) => {
      if (!d || typeof d !== 'object') return;
      const icons = (d.icons && typeof d.icons === 'object' && !Array.isArray(d.icons)) ? d.icons : {};
      moreIconsData = { shape: d.shape === 'free' ? 'free' : 'round', icons: icons };
      applyMoreCols(d.cols);
      applyMoreIcons();
      try { prefetchSiteImages(Object.keys(icons).map((k) => icons[k]).filter(Boolean)); } catch (e) {}
    }).catch(() => {});
  } catch (e) {}
}

/* ---------- بیشتر: منوهای گروه‌بندی‌شده ---------- */
const MENU_GROUPS = {
  quran: { title: 'قرآن و مطالعه', items: [
    { icon: '📖', label: 'درس امروز', goto: 'lesson' },
    { icon: '🔍', label: 'جست‌وجو در قرآن', goto: 'quran-search' },
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
  window.__menuGroupKey = key;
  document.getElementById('submenu-title').textContent = group.title;
  const listEl = document.getElementById('submenu-list');
  listEl.innerHTML = '';
  group.items.forEach((item, i) => {
    const [c, cd] = SUBMENU_TILE_COLORS[i % SUBMENU_TILE_COLORS.length];
    const tile = document.createElement('button');
    tile.className = 'menu-tile';
    tile.style.setProperty('--tile-c', c);
    tile.style.setProperty('--tile-cd', cd);
    tile.dataset.ikey = 'sub:' + item.goto;
    tile.innerHTML = `<span class="menu-tile-badge">${item.icon}</span><span class="menu-tile-label">${item.label}</span>`;
    applyMoreIconToTile(tile);
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
    '<div class="rmz-gal-square rmz-natural">' +
      '<div class="rmz-gal-scroller" dir="ltr"></div>' +
      '<button type="button" class="rmz-gal-arrow rmz-gal-prev" aria-label="قبلی">‹</button>' +
      '<button type="button" class="rmz-gal-arrow rmz-gal-next" aria-label="بعدی">›</button>' +
      '<span class="rmz-gal-count"></span>' +
    '</div>' +
    '<div class="rmz-gal-dots"></div>' +
    '<p class="rmz-gal-caption"></p>' +
    '<p class="rmz-gal-tip">برای بزرگ‌نمایی و زوم، یک بار روی عکس بزنید</p>';
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
    // ارتفاع قاب = ارتفاع کامل عکس فعلی (نسبت اصلی عکس حفظ می‌شود)
    const curImg = scroller.children[cur] && scroller.children[cur].querySelector('img');
    scroller.style.height = (n > 1 && curImg && curImg.offsetHeight > 0) ? curImg.offsetHeight + 'px' : '';
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
      img.loading = 'lazy';
      img.addEventListener('load', () => updateInfo());
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
  window.__rmzGalUpdate = updateInfo;
  if (!window.__rmzGalResizeBound) { window.__rmzGalResizeBound = true; window.addEventListener('resize', () => { try { if (window.__rmzGalUpdate) window.__rmzGalUpdate(); } catch (e) {} }); }
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
  const rmTopMedia = (Array.isArray(r.top_media) ? r.top_media : []).filter((it) => it && it.url);
  if (r.text || r.image_url || r.video_url || rmTopMedia.length) {
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
    if (r.video_url) html += `<video id="ramadan-video-el" src="${secureUrl(r.video_url)}" controls playsinline preload="metadata" style="width:100%;border-radius:10px;margin-bottom:10px"></video>`;
    /* عکس‌ها و ویدیوهای دلخواه (از پیشخوان ← رمضان ویژه ← «عکس و ویدیوی بالای جدول») به ترتیب */
    if (rmTopMedia.length) {
      html += '<div class="rmz-media">';
      rmTopMedia.forEach((it, i) => {
        html += '<div class="rmz-media-item">';
        if (it.type === 'video') html += `<video class="rmz-media-el" src="${secureUrl(it.url)}" controls playsinline preload="metadata"></video>`;
        else html += `<img class="rmz-media-el" data-rmz-i="${i}" src="${secureUrl(it.url)}" loading="lazy" alt="">`;
        if (it.caption) html += `<div class="rmz-media-caption">${String(it.caption).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch])}</div>`;
        html += '</div>';
      });
      html += '</div>';
    }
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
    card.querySelectorAll('img.rmz-media-el').forEach((im) => {
      im.addEventListener('click', () => { const it = rmTopMedia[parseInt(im.dataset.rmzI, 10)]; if (it) openRmzZoom(it.url, it.caption || ''); });
      im.addEventListener('error', () => { im.style.display = 'none'; });
    });
    card.querySelectorAll('video').forEach((v) => {
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
    /* رنگ ردیف‌های یکی‌درمیان (از پیشخوان ← رمضان ویژه)؛ اگر فعال نباشد رنگ‌بندی خودکار CSS استفاده می‌شود */
    const rmHex = (v) => (/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(String(v || '')) ? v : '');
    if (r.row_custom === '1' && rmHex(r.row_color_a) && rmHex(r.row_color_b)) {
      card.style.setProperty('--ramadan-row-a', r.row_color_a);
      card.style.setProperty('--ramadan-row-b', r.row_color_b);
    }
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
      (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(btn.dataset.copy) : Promise.reject()).then(() => { btn.textContent = 'کپی شد'; setTimeout(() => { btn.textContent = 'کپی'; }, 1500); }).catch(() => {});
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
/* ویدیوهای صفحهٔ خیرین: وقتی کاربر از صفحه یا از حالت تمام‌صفحه برمی‌گردد یا اپ به پس‌زمینه می‌رود، متوقف شوند */
function pauseCharityVideos() {
  try {
    document.querySelectorAll('#charity-content video').forEach((v) => { try { v.pause(); } catch (e) {} });
  } catch (e) {}
}
(function () {
  function onFsChange() {
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    if (fsEl) { window.__charityFsVideo = (fsEl.tagName === 'VIDEO' && fsEl.closest && fsEl.closest('#charity-content')) ? fsEl : null; return; }
    const v = window.__charityFsVideo; window.__charityFsVideo = null;
    if (v) { try { v.pause(); } catch (e) {} }
  }
  document.addEventListener('fullscreenchange', onFsChange);
  document.addEventListener('webkitfullscreenchange', onFsChange);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseCharityVideos(); });
  window.addEventListener('pagehide', pauseCharityVideos);
})();
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
    // بالا: اول عکس (تمام‌عرض)، زیرش ویدیوی مستطیلی تمام‌عرض با نسبت واقعی خودش
    html += `<div class="charity-main-media">`;
    if (c.image_url) html += `<img src="${c.image_url}" class="charity-main-img">`;
    if (c.video_url) html += `<video id="charity-video-el" src="${c.video_url}" controls playsinline webkit-playsinline preload="metadata" class="charity-main-video"></video>`;
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
  if (charityVideoEl) {
    charityVideoEl.addEventListener('play', () => trackClick('charity_video'), { once: true });
    // نسبت واقعی ویدیو (افقی/عمودی) را بگیر تا کادر دقیقاً به اندازهٔ ویدیو باشد
    charityVideoEl.addEventListener('loadedmetadata', () => {
      const vw = charityVideoEl.videoWidth, vh = charityVideoEl.videoHeight;
      if (vw && vh) charityVideoEl.style.aspectRatio = vw + ' / ' + vh;
    });
  }
  // هر ویدیوی این صفحه: با خروج از حالت تمام‌صفحه (iOS) متوقف شود
  el.querySelectorAll('video').forEach((v) => {
    v.addEventListener('webkitendfullscreen', () => { try { v.pause(); } catch (e) {} });
  });
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
(function () { const g = document.getElementById('gallery-content'); if (g) g.addEventListener('contextmenu', (e) => e.preventDefault()); })();

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
  // دکمهٔ «سوالات شرعی» ممکن است در منوی پایین (که مدیر ساخته) نباشد؛ پس همه‌جا بررسی می‌کنیم
  const nIc = document.getElementById('shariq-nav-icon'); if (nIc) nIc.innerHTML = shariqIconMarkup(s);
  const nLb = document.getElementById('shariq-nav-label'); if (nLb) nLb.textContent = s.nav_label || 'سوالات شرعی';
  const tBd = document.getElementById('shariq-tile-badge'); if (tBd) tBd.innerHTML = shariqIconMarkup(s);
  const tLb = document.getElementById('shariq-tile-label'); if (tLb) tLb.textContent = s.nav_label || 'سوالات شرعی';
  const pTt = document.getElementById('shariq-page-title'); if (pTt) pTt.textContent = s.nav_label || 'سوالات شرعی';
}
async function loadShariqSettings() {
  try { await apiSWR('/shariq/settings', applyShariqSettings); } catch (e) { /* ignore */ }
}

/* ---------- دریافت مطمئنِ اطلاعات «سوالات شرعی» ---------- */
function shariqEsc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function shariqText(s) { return shariqEsc(s).replace(/\r?\n/g, '<br>'); }
// باز/بسته کردن کادر پاسخ با انیمیشن، بدون سقف ارتفاع: پاسخ هر قدر بلند باشد کامل دیده می‌شود
function shariqSetWrap(wrap, open) {
  if (!wrap) return;
  if (wrap._shT) { clearTimeout(wrap._shT); wrap._shT = null; }
  if (open) {
    wrap.classList.add('is-open');
    wrap.style.maxHeight = wrap.scrollHeight + 'px';
    wrap._shT = setTimeout(() => { wrap.style.maxHeight = 'none'; wrap._shT = null; }, 420);
  } else if (wrap.classList.contains('is-open')) {
    wrap.style.maxHeight = wrap.scrollHeight + 'px';
    void wrap.offsetHeight;
    wrap.classList.remove('is-open');
    wrap.style.maxHeight = '';
  }
}
// درخواست ساده (بدون هدر Content-Type تا نیازی به preflight نباشد) + پارامتر زمان تا هیچ کشی وسط راه جواب قدیمی ندهد
// اطلاعات عمومیِ مسابقه/ختم/دسته‌بندی‌ها: اگر سایت در دسترس نبود، آخرین نسخهٔ سالم نمایش داده می‌شود
async function shariqGet(path) {
  const staleKey = apiCacheKey(String(path).split('?')[0], String(path)) || '';
  const cacheable = staleKey && API_OFFLINE_QUERY_RE.test(String(path).split('?')[0]);
  try {
    const data = await shariqGetRaw(path);
    if (cacheable) apiCacheWrite(staleKey, data);
    return data;
  } catch (e) {
    const c = (e && e.code) || '';
    if (cacheable && (c === 'network' || c === 'bad_json' || /^http_5/.test(c) || (e && e.nonJson))) {
      const old = await apiStale(staleKey);
      if (old !== null) return old;
    }
    throw e;
  }
}
async function shariqGetRaw(path) {
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
  if (!res.ok) { const err = new Error((data && data.message) || ('HTTP ' + res.status)); err.code = 'http_' + res.status; err.nonJson = (data === null); throw err; }
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
  try { schCheck(false); } catch (e) {}
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
      ${item.answered_by ? '<div class="shariq-by-line">✍️ پاسخ‌دهنده: ' + shariqEsc(item.answered_by) + '</div>' : ''}
      <div class="shariq-a-wrap"><div class="shariq-a">${shariqText(item.answer_text)}${item.answered_by ? '<span class="shariq-by">پاسخ‌دهنده: ' + shariqEsc(item.answered_by) + '</span>' : ''}</div></div>`;
    const qBtn = card.querySelector('.shariq-q');
    const wrap = card.querySelector('.shariq-a-wrap');
    qBtn.addEventListener('click', () => {
      const opening = !wrap.classList.contains('is-open');
      el.querySelectorAll('.shariq-a-wrap').forEach((w) => { if (w !== wrap || !opening) shariqSetWrap(w, false); });
      el.querySelectorAll('.shariq-q').forEach((q) => q.classList.remove('is-open'));
      if (opening) { shariqSetWrap(wrap, true); qBtn.classList.add('is-open'); }
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
        ${r.answer_text ? `<div class="shariq-a">${shariqText(r.answer_text)}${r.answered_by_name ? '<span class="shariq-by">پاسخ‌دهنده: ' + shariqEsc(r.answered_by_name) + '</span>' : ''}</div>` : ''}`;
      el.appendChild(card);
    });
  } catch (e) {
    el.innerHTML = shariqErrorBox(e, 'shariq-mine-retry-btn');
    const b = document.getElementById('shariq-mine-retry-btn');
    if (b) b.addEventListener('click', loadShariqMine);
  }
}

/* ---------- فتوا (تب کنار «پرسش و پاسخ») ---------- */
function shariqSetView(v) {
  const fatwa = v === 'fatwa';
  shariqState.view = fatwa ? 'fatwa' : 'qa';
  const b1 = document.getElementById('shariq-view-qa'), b2 = document.getElementById('shariq-view-fatwa');
  if (b1) b1.classList.toggle('active', !fatwa);
  if (b2) b2.classList.toggle('active', fatwa);
  const cats = document.getElementById('shariq-cats-row'), list = document.getElementById('shariq-list-content'), fat = document.getElementById('shariq-fatwa-content');
  if (cats) cats.classList.toggle('hidden', fatwa);
  if (list) list.classList.toggle('hidden', fatwa);
  if (fat) fat.classList.toggle('hidden', !fatwa);
  const fcats = document.getElementById('shariq-fatwa-cats'); if (fcats) fcats.classList.toggle('hidden', !fatwa);
  if (fatwa) loadShariqFatwas();
}
async function loadShariqFatwas() {
  const el = document.getElementById('shariq-fatwa-content');
  el.innerHTML = '<p class="muted-text small" style="padding:0 18px">در حال بارگذاری...</p>';
  let list, fromCache = false;
  try {
    list = shariqAsArray(await shariqGet('/shariq/fatwas'));
    shariqCacheSet('fatwas', list);
  } catch (e) {
    list = shariqAsArray(shariqCacheGet('fatwas'));
    if (!list.length) {
      el.innerHTML = shariqErrorBox(e, 'shariq-fatwa-retry-btn');
      const b = document.getElementById('shariq-fatwa-retry-btn');
      if (b) b.addEventListener('click', loadShariqFatwas);
      return;
    }
    fromCache = true;
  }
  shariqState.fatwas = list; shariqState.fatwaFromCache = fromCache; shariqState.fatwaCat = null;
  shariqRenderFatwas();
}
function shariqRenderFatwas() {
  const el = document.getElementById('shariq-fatwa-content');
  const row = document.getElementById('shariq-fatwa-cats');
  const all = shariqState.fatwas || [];
  // چیپ‌های دسته‌بندی فتوا (فقط دسته‌هایی که فتوا دارند)
  const cats = [];
  all.forEach((f) => { if (f.category_id && f.category_name && !cats.some((c) => c.id === f.category_id)) cats.push({ id: f.category_id, name: f.category_name }); });
  row.innerHTML = '';
  if (cats.length) {
    const mk = (label, id) => {
      const chip = document.createElement('button');
      chip.className = 'shariq-chip' + (shariqState.fatwaCat === id ? ' active' : '');
      chip.textContent = label;
      chip.addEventListener('click', () => { shariqState.fatwaCat = id; shariqRenderFatwas(); });
      row.appendChild(chip);
    };
    mk('همه', null);
    cats.forEach((c) => mk(c.name, c.id));
  }
  const list = shariqState.fatwaCat ? all.filter((f) => f.category_id === shariqState.fatwaCat) : all;
  el.innerHTML = '';
  if (!list.length) {
    el.innerHTML = '<div class="shariq-empty"><span class="shariq-empty-icon">📜</span>هنوز فتوایی درج نشده است.</div>';
    return;
  }
  if (shariqState.fatwaFromCache) {
    const note = document.createElement('p');
    note.className = 'muted-text small'; note.style.padding = '0 18px';
    note.textContent = 'اتصال به سایت برقرار نشد؛ آخرین نسخهٔ ذخیره‌شده نمایش داده می‌شود.';
    el.appendChild(note);
  }
  list.forEach((item, i) => {
    const card = document.createElement('div');
    card.className = 'shariq-item shariq-fatwa-item';
    card.style.animationDelay = `${Math.min(i, 8) * 0.06}s`;
    card.innerHTML = `
      <button type="button" class="shariq-q">${shariqText(item.title)}</button>
      ${item.teacher ? '<div class="shariq-by-line">✍️ نویسنده: ' + shariqEsc(item.teacher) + '</div>' : ''}
      <div class="shariq-a-wrap"><div class="shariq-a">${shariqText(item.body)}${item.teacher ? '<span class="shariq-by">نویسندهٔ فتوا: ' + shariqEsc(item.teacher) + '</span>' : ''}</div></div>`;
    const qBtn = card.querySelector('.shariq-q'), wrap = card.querySelector('.shariq-a-wrap');
    qBtn.addEventListener('click', () => {
      const opening = !wrap.classList.contains('is-open');
      el.querySelectorAll('.shariq-a-wrap').forEach((w) => { if (w !== wrap || !opening) shariqSetWrap(w, false); });
      el.querySelectorAll('.shariq-q').forEach((q) => q.classList.remove('is-open'));
      if (opening) { shariqSetWrap(wrap, true); qBtn.classList.add('is-open'); }
    });
    el.appendChild(card);
  });
}
document.getElementById('shariq-view-qa').addEventListener('click', () => shariqSetView('qa'));
document.getElementById('shariq-view-fatwa').addEventListener('click', () => shariqSetView('fatwa'));

/* ---------- پنل مخفی عالم پاسخ‌دهنده ----------
   ورود اولیه: ۱۰ ضربهٔ پشت‌سرهم (در ۸ ثانیه) روی خودِ صفحهٔ «سوالات شرعی» (نه روی دکمه‌ها و کارت‌ها). بعد از ورود موفق، دکمهٔ «ورود به حساب من» فقط برای همان عالم داخل صفحهٔ «سوالات شرعی» دیده می‌شود (تا وقتی توکن ورود هست)؛ با «خروج از حساب» دکمه هم محو می‌شود.
   حساب عالم را فقط مدیر از پیشخوان می‌سازد. توکن ورود در localStorage می‌ماند و مثل «دانش‌آموزان» همه درخواست‌ها POST هستند. */
const SCH_TOKEN_KEY = 'arefanejam_shariq_sch_token';
const SCH = { token: '', name: '', cats: [], fcats: [], fatwas: [], pending: [], mine: [], tab: 'pending' };
function schEl(id) { return document.getElementById(id); }
function schTokenLoad() { try { return localStorage.getItem(SCH_TOKEN_KEY) || ''; } catch (e) { return ''; } }
function schTokenSave(t) { try { if (t) localStorage.setItem(SCH_TOKEN_KEY, t); else localStorage.removeItem(SCH_TOKEN_KEY); } catch (e) {} schSyncEnterBtn(); }
// دکمهٔ «ورود به حساب من» فقط وقتی عالم وارد شده (توکن دارد) دیده می‌شود
function schSyncEnterBtn() { const b = document.getElementById('shariq-scholar-enter-btn'); if (b) b.classList.toggle('hidden', !schTokenLoad()); }
async function schApi(path, body) {
  const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), 25000) : null;
  let res;
  try {
    res = await fetch(state.apiUrl.replace(/\/$/, '') + path, {
      method: 'POST', cache: 'no-store', signal: ctrl ? ctrl.signal : undefined,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({}, body || {}, SCH.token ? { token: SCH.token } : {}))
    });
  } catch (e) { const er = new Error('اتصال به سایت برقرار نشد؛ اینترنت را بررسی کنید.'); er.network = true; throw er; }
  finally { if (timer) clearTimeout(timer); }
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch (e) { const i = text.search(/[\[{]/); if (i > 0) { try { data = JSON.parse(text.slice(i)); } catch (e2) {} } }
  if (!res.ok || !data) {
    const er = new Error((data && data.message) || 'خطا در ارتباط با سرور');
    er.status = res.status;
    er.code = (data && data.code) || '';
    throw er;
  }
  return data;
}
// خطای ۴۰۱: ورود لازم است؛ اگر عالم توسط مدیر حذف شده باشد پیام حذف در همان گوشی نشان داده می‌شود (پاسخ‌های او در سایت می‌مانند)
function schAuthFail(e) {
  SCH.token = ''; schTokenSave('');
  if (e && e.code === 'scholar_deleted') {
    SCH.pending = []; SCH.mine = []; SCH.fatwas = [];
    schClose();
    try { window.alert(e.message || 'شما حذف شدید و اجازهٔ پاسخ‌دادن ندارید.'); } catch (er) {}
    return;
  }
  schShow('login');
}
// بررسی بی‌صدای وضعیت حساب (فقط اگر عالم وارد شده باشد): با حذف عالم توسط مدیر، دکمهٔ ورود محو و پیام نمایش داده می‌شود
let schCheckBusy = false, schCheckLast = 0;
async function schCheck(force) {
  if (schCheckBusy || !schTokenLoad()) return;
  if (!force && Date.now() - schCheckLast < 30000) return;
  schCheckBusy = true; schCheckLast = Date.now();
  try {
    SCH.token = schTokenLoad();
    await schApi('/shariq/scholar/check', {});
  } catch (e) {
    if (e.status === 401) schAuthFail(e);
  } finally { schCheckBusy = false; }
}
function schShow(which) {
  schEl('sch-login').classList.toggle('hidden', which !== 'login');
  schEl('sch-panel').classList.toggle('hidden', which !== 'panel');
  schEl('shariq-scholar-modal').classList.toggle('sch-full', which === 'panel');   // پنل عالم تمام‌صفحه؛ پنجرهٔ ورود کوچک
}
function schClose() { const m = schEl('shariq-scholar-modal'); m.classList.add('hidden'); m.classList.remove('sch-full'); }
function schMsg(t, bad) {
  const m = schEl('sch-msg');
  if (!t) { m.classList.add('hidden'); m.textContent = ''; return; }
  m.textContent = t; m.style.color = bad ? '#a5473c' : ''; m.classList.remove('hidden');
}
async function schOpen() {
  schEl('shariq-scholar-modal').classList.remove('hidden');
  schEl('sch-login-error').classList.add('hidden');
  SCH.token = schTokenLoad();
  if (!SCH.token) { schShow('login'); return; }
  schShow('panel'); schEl('sch-list').innerHTML = '<p class="muted-text small">در حال بارگذاری...</p>';
  await schReload(true);
}
async function schReload(silentLoginOnFail) {
  try {
    const d = await schApi('/shariq/scholar/data', {});
    SCH.name = d.name || ''; SCH.cats = d.categories || []; SCH.pending = d.pending || []; SCH.mine = d.mine || []; SCH.fatwas = d.fatwas || []; SCH.fcats = d.fcats || [];
    schEl('sch-title').textContent = SCH.name ? 'خوش آمدید، ' + SCH.name : 'پاسخ به سوالات';
    schMsg('');
    schRender();
  } catch (e) {
    if (e.status === 401) { schAuthFail(e); return; }
    schEl('sch-list').innerHTML = '';
    schMsg(e.message, true);
  }
}
function schCatOptions(selId) {
  let h = '<option value="">— بدون دسته‌بندی —</option>';
  SCH.cats.forEach((c) => { h += '<option value="' + c.id + '"' + (String(selId) === String(c.id) ? ' selected' : '') + '>' + shariqEsc(c.name) + '</option>'; });
  h += '<option value="__new">➕ دسته‌بندی جدید...</option>';
  return h;
}
// بعد از ساخت دسته‌بندی تازه، فهرست کشویی همهٔ کارت‌ها به‌روز می‌شود (بدون پاک شدن پاسخ‌های نیمه‌نوشته)
function schRefreshSelects() {
  schEl('sch-list').querySelectorAll('select.sch-cat').forEach((sel) => {
    const cur = sel.value;
    sel.innerHTML = schCatOptions(cur === '__new' ? '' : cur);
    if (cur === '__new') sel.value = '__new';
  });
}
function schFatwaCatOptions(selId) {
  let h = '<option value="">— بدون دسته‌بندی —</option>';
  SCH.fcats.forEach((c) => { h += '<option value="' + c.id + '"' + (String(selId) === String(c.id) ? ' selected' : '') + '>' + shariqEsc(c.name) + '</option>'; });
  h += '<option value="__new">➕ دسته‌بندی جدید...</option>';
  return h;
}
// کارت فرم فتوا: f = null یعنی فتوای جدید
function schFatwaCard(f) {
  const card = document.createElement('div');
  card.className = 'sch-q sch-fatwa-card';
  card.innerHTML =
    (f ? '' : '<p class="sch-q-text">➕ فتوای جدید</p>') +
    '<input type="text" class="sch-f-title" maxlength="250" placeholder="موضوع / عنوان فتوا">' +
    '<textarea class="sch-f-body" rows="6" placeholder="متن فتوا..." maxlength="8000"></textarea>' +
    '<select class="sch-cat">' + schFatwaCatOptions(f ? f.category_id : '') + '</select>' +
    '<input type="text" class="sch-newcat hidden" maxlength="80" placeholder="نام دسته‌بندی جدید">' +
    '<p class="muted-text small hidden sch-err" style="color:#a5473c"></p>' +
    '<div class="sch-row"><button type="button" class="secondary-btn small-btn sch-save">' + (f ? 'به‌روزرسانی فتوا' : 'ثبت فتوا') + '</button>' +
    (f ? '<button type="button" class="ghost-btn small-btn sch-del" style="color:#a5473c">حذف</button>' : '') + '</div>';
  const ti = card.querySelector('.sch-f-title'), bo = card.querySelector('.sch-f-body'), sel = card.querySelector('.sch-cat'), nc = card.querySelector('.sch-newcat'), er = card.querySelector('.sch-err'), btn = card.querySelector('.sch-save');
  if (f) { ti.value = f.title; bo.value = f.body; }
  sel.addEventListener('change', () => { nc.classList.toggle('hidden', sel.value !== '__new'); if (sel.value === '__new') nc.focus(); });
  btn.addEventListener('click', async () => {
    er.classList.add('hidden');
    const body = { title: ti.value.trim(), body: bo.value.trim() };
    if (f) body.id = f.id;
    if (body.title.length < 2 || body.body.length < 3) { er.textContent = 'موضوع و متن فتوا را بنویسید.'; er.classList.remove('hidden'); return; }
    if (sel.value === '__new') {
      if (!nc.value.trim()) { er.textContent = 'نام دسته‌بندی جدید را بنویسید.'; er.classList.remove('hidden'); return; }
      body.new_category = nc.value.trim();
    } else if (sel.value) body.category_id = Number(sel.value);
    btn.disabled = true; const old = btn.textContent; btn.textContent = 'در حال ثبت...';
    try {
      const d = await schApi('/shariq/scholar/fatwa-save', body);
      SCH.fatwas = d.fatwas || []; SCH.fcats = d.fcats || [];
      shariqCacheSet('fatwas', null);
      schRender();
    } catch (e) {
      btn.disabled = false; btn.textContent = old;
      if (e.status === 401) { schAuthFail(e); return; }
      er.textContent = e.message; er.classList.remove('hidden');
    }
  });
  const del = card.querySelector('.sch-del');
  if (del) del.addEventListener('click', async () => {
    if (!window.confirm('این فتوا حذف شود؟')) return;
    del.disabled = true;
    try {
      const d = await schApi('/shariq/scholar/fatwa-delete', { id: f.id });
      SCH.fatwas = d.fatwas || []; SCH.fcats = d.fcats || [];
      shariqCacheSet('fatwas', null);
      schRender();
    } catch (e) { del.disabled = false; if (e.status === 401) { schAuthFail(e); return; } er.textContent = e.message; er.classList.remove('hidden'); }
  });
  return card;
}
function schRender() {
  const box = schEl('sch-list');
  const isFatwa = SCH.tab === 'fatwa';
  const pend = SCH.tab === 'pending';
  schEl('sch-tab-pending').classList.toggle('active', pend);
  schEl('sch-tab-mine').classList.toggle('active', SCH.tab === 'mine');
  schEl('sch-tab-fatwa').classList.toggle('active', isFatwa);
  schEl('sch-tab-fatwa').textContent = 'فتواهای من (' + toPersianDigits(SCH.fatwas.length) + ')';
  if (isFatwa) {
    box.innerHTML = '';
    box.appendChild(schFatwaCard(null));
    SCH.fatwas.forEach((f) => box.appendChild(schFatwaCard(f)));
    return;
  }
  schEl('sch-tab-pending').textContent = 'در انتظار پاسخ (' + toPersianDigits(SCH.pending.length) + ')';
  schEl('sch-tab-mine').textContent = 'پاسخ‌های من (' + toPersianDigits(SCH.mine.length) + ')';
  const list = pend ? SCH.pending : SCH.mine;
  box.innerHTML = '';
  if (!list.length) {
    box.innerHTML = '<div class="shariq-empty"><span class="shariq-empty-icon">' + (pend ? '🕊️' : '✍️') + '</span>' + (pend ? 'سوال بی‌پاسخی نیست.' : 'هنوز پاسخی ثبت نکرده‌اید.') + '</div>';
    return;
  }
  list.forEach((q) => {
    const card = document.createElement('div');
    card.className = 'sch-q';
    card.innerHTML =
      '<p class="sch-q-text">' + shariqEsc(q.question_text) + '</p>' +
      '<p class="sch-q-meta">' + shariqEsc(pend ? (q.created_at || '') : (q.answered_at || '')) + '</p>' +
      '<textarea class="sch-answer" rows="8" placeholder="پاسخ را بنویسید..."></textarea>' +
      '<select class="sch-cat">' + schCatOptions(pend ? '' : q.category_id) + '</select>' +
      '<input type="text" class="sch-newcat hidden" maxlength="80" placeholder="نام دسته‌بندی جدید (مثلاً: احکام نماز)">' +
      '<p class="muted-text small hidden sch-err" style="color:#a5473c"></p>' +
      '<button type="button" class="secondary-btn small-btn sch-save">' + (pend ? 'ثبت پاسخ' : 'به‌روزرسانی پاسخ') + '</button>';
    const ta = card.querySelector('.sch-answer'), sel = card.querySelector('.sch-cat'), nc = card.querySelector('.sch-newcat'), er = card.querySelector('.sch-err'), btn = card.querySelector('.sch-save');
    if (!pend) ta.value = q.answer_text || '';
    sel.addEventListener('change', () => { nc.classList.toggle('hidden', sel.value !== '__new'); if (sel.value === '__new') nc.focus(); });
    btn.addEventListener('click', async () => {
      const txt = ta.value.trim();
      er.classList.add('hidden');
      if (txt.length < 3) { er.textContent = 'متن پاسخ را بنویسید.'; er.classList.remove('hidden'); return; }
      const body = { question_id: q.id, answer_text: txt };
      if (sel.value === '__new') {
        const nm = nc.value.trim();
        if (!nm) { er.textContent = 'نام دسته‌بندی جدید را بنویسید.'; er.classList.remove('hidden'); return; }
        body.new_category = nm;
      } else if (sel.value) body.category_id = Number(sel.value);
      btn.disabled = true; const old = btn.textContent; btn.textContent = 'در حال ثبت...';
      try {
        const d = await schApi('/shariq/scholar/answer', body);
        if (d && Array.isArray(d.categories)) SCH.cats = d.categories;
        shariqCacheSet('cats', null); // فهرست دسته‌های عمومی دفعهٔ بعد تازه گرفته شود
        await schReloadKeepDrafts();
      } catch (e) {
        btn.disabled = false; btn.textContent = old;
        if (e.status === 401) { schAuthFail(e); return; }
        er.textContent = e.message; er.classList.remove('hidden');
        if (e.status === 409 || e.status === 404) schReloadKeepDrafts();
      }
    });
    box.appendChild(card);
  });
}
// بعد از ثبت پاسخ: فهرست‌ها تازه می‌شود (سوال پاسخ‌داده‌شده از «در انتظار» می‌رود) و دسته‌بندی‌های تازه در کشویی می‌نشینند
async function schReloadKeepDrafts() {
  if (SCH.tab === 'fatwa') { await schReload(); return; }
  const drafts = {};
  schEl('sch-list').querySelectorAll('.sch-q').forEach((c, i) => {
    const t = c.querySelector('.sch-answer').value, s = c.querySelector('.sch-cat').value, n = c.querySelector('.sch-newcat').value;
    const key = (SCH.tab === 'pending' ? SCH.pending : SCH.mine)[i];
    if (key) drafts[key.id] = { t, s, n };
  });
  await schReload();
  schEl('sch-list').querySelectorAll('.sch-q').forEach((c, i) => {
    const q = (SCH.tab === 'pending' ? SCH.pending : SCH.mine)[i];
    const d = q && drafts[q.id];
    if (!d) return;
    c.querySelector('.sch-answer').value = d.t;
    const sel = c.querySelector('.sch-cat'); sel.value = d.s;
    if (d.s === '__new') { const nc = c.querySelector('.sch-newcat'); nc.classList.remove('hidden'); nc.value = d.n; }
  });
}
schEl('sch-tab-pending').addEventListener('click', () => { SCH.tab = 'pending'; schRender(); });
schEl('sch-tab-mine').addEventListener('click', () => { SCH.tab = 'mine'; schRender(); });
schEl('sch-tab-fatwa').addEventListener('click', () => { SCH.tab = 'fatwa'; schRender(); });
schEl('sch-close-btn').addEventListener('click', schClose);
schEl('sch-login-cancel').addEventListener('click', schClose);
schEl('sch-logout-btn').addEventListener('click', async () => {
  try { await schApi('/shariq/scholar/logout', {}); } catch (e) {}
  SCH.token = ''; schTokenSave(''); SCH.pending = []; SCH.mine = [];
  schClose();
});
async function schDoLogin() {
  const un = schEl('sch-username').value.trim(), pw = schEl('sch-password').value;
  const er = schEl('sch-login-error');
  er.classList.add('hidden');
  if (!un || !pw) { er.textContent = 'نام کاربری و رمز عبور را وارد کنید.'; er.classList.remove('hidden'); return; }
  const btn = schEl('sch-login-btn'); btn.disabled = true;
  SCH.token = '';
  try {
    const d = await schApi('/shariq/scholar/login', { username: un, password: pw });
    SCH.token = d.token; schTokenSave(d.token);
    schEl('sch-password').value = '';
    SCH.tab = 'pending';
    schShow('panel'); schEl('sch-list').innerHTML = '<p class="muted-text small">در حال بارگذاری...</p>';
    await schReload();
  } catch (e) { er.textContent = e.message; er.classList.remove('hidden'); }
  finally { btn.disabled = false; }
}
schEl('sch-login-btn').addEventListener('click', schDoLogin);
schEl('sch-password').addEventListener('keydown', (e) => { if (e.key === 'Enter') schDoLogin(); });
// ۱۰ ضربه روی صفحه (نه روی دکمه، کارت، فیلد و ...)
(function schSecretTaps() {
  const tab = document.getElementById('tab-shariq');
  if (!tab) return;
  let taps = [];
  tab.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('button, a, input, textarea, select, .shariq-item')) { taps = []; return; }
    const now = Date.now();
    taps = taps.filter((t) => now - t < 8000); taps.push(now);
    if (taps.length >= 10) { taps = []; schOpen(); }
  });
  // دکمهٔ ورود دوباره به حساب (فقط برای عالمِ واردشده دیده می‌شود)
  const enter = document.getElementById('shariq-scholar-enter-btn');
  if (enter) enter.addEventListener('click', () => { schOpen(); });
  schSyncEnterBtn();
  setTimeout(() => { schCheck(true); }, 5000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schCheck(false); });
  setInterval(() => { if (!document.hidden && !siteDownNow()) schCheck(false); }, 60000);
})();

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
    let rows = shariqAsArray(await shariqGet('/khatm/list?device_id=' + encodeURIComponent(device_id)));
    // پشتیبان: ختم‌های باز خودِ این گوشی همیشه در فهرست دیده شوند (حتی اگر فهرست عمومی کم‌وکاست برگردد)
    try {
      const mineRows = shariqAsArray(await shariqGet('/khatm/mine?device_id=' + encodeURIComponent(device_id)));
      const have = new Set(rows.map((r) => Number(r.id)));
      mineRows.forEach((m) => { if (m && m.status === 'open' && !have.has(Number(m.id))) rows.push(m); });
      rows.sort((a, b) => (Number(a.age) || 0) - (Number(b.age) || 0));
    } catch (e) { /* بی‌صدا */ }
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
      if (btn.dataset.busy === '1') return; // جلوگیری از ارسال دوباره (لمس پشت‌سرهم)
      btn.dataset.busy = '1';
      const name = $('khatm-view-name').value.trim();
      btn.disabled = true;
      try {
        const device_id = await ensureDeviceId();
        const res = await apiFetch('/khatm/set', { method: 'POST', body: JSON.stringify({ device_id, request_id: d.id, name, portions: Array.from(khatmSel) }) });
        try { if (name) localStorage.setItem(KHATM_NAME_KEY, name); } catch (e) {}
        const conflicts = (res && res.conflicts) || [];
        await loadKhatmView();
        // فقط بخش‌هایی که واقعاً دست شخص دیگری است «تعارض» حساب می‌شوند (بخشِ خودِ همین گوشی نه)
        const mineAfter = new Set(((khatmViewData && khatmViewData.taken) || []).filter((t) => t.mine).map((t) => t.p));
        const realConflicts = conflicts.filter((x) => !mineAfter.has(Number(x)));
        if (realConflicts.length) {
          appAlert('khatm_conflict');
        } else {
          appAlert(khatmSel.size ? 'khatm_join_ok' : 'khatm_leave_ok');
        }
      } catch (e) {
        appAlertErr('khatm_set_fail', e);
        khatmUpdateConfirmState();
      } finally { btn.dataset.busy = '0'; }
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
  switchToTab(mokatibState.token ? 'mokatib-home' : 'mokatib-public', { push: true }); // بارگذاری داده داخل switchToTab
});

document.getElementById('mokatib-public-login-link').addEventListener('click', () => {
  switchToTab('mokatib-login', { push: true });
});

document.getElementById('mokatib-public-btn1').addEventListener('click', () => {
  const popup = (mokatibState.publicBtn1Popup) || { image: '', text: '' };
  const subItems = (mokatibState.publicSub && mokatibState.publicSub.items) || [];
  if (!popup.image && !popup.text && !subItems.length) return; // چیزی برای نمایش تنظیم نشده
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
  textEl.style.display = popup.text ? '' : 'none';
  mokatibSubPath = [];
  renderMokatibSub();
  document.getElementById('mokatib-public-btn1-popup').classList.remove('hidden');
  pushOverlay('btn1', closeMokatibBtn1Popup);
});
function closeMokatibBtn1Popup() {
  exitImageViewerFullscreen(document.getElementById('mokatib-public-btn1-popup-imgwrap'));
  exitImageViewerFullscreen(document.getElementById('mokatib-sub-detail-imgwrap'));
  mokatibSubPath = [];
  document.getElementById('mokatib-public-btn1-popup').classList.add('hidden');
}
document.getElementById('mokatib-public-btn1-popup-close').addEventListener('click', () => {
  overlayGo('btn1', 0, closeMokatibBtn1Popup);
});

/* ===== چارت زیرمجموعه‌ها داخل پنجرهٔ دکمهٔ اول (کاملاً جدا از چارت مساجد) =====
   دادهٔ آن از پیشخوان ← «مکاتب: چارت زیرمجموعه» می‌آید (data.subchart در /mokatib/public-tree).
   هر مورد: name، person (مسئول/توضیح کوتاه زیر نام)، info، image، color، parent (۰ = سطح اول). */
let mokatibSubPath = [];
function renderMokatibSub() {
  const sub = mokatibState.publicSub || { items: [], columns: 3, heading: '' };
  const items = sub.items || [];
  const wrap = document.getElementById('mokatib-sub-wrap');
  const popup = mokatibState.publicBtn1Popup || { image: '' };
  const mainImgWrap = document.getElementById('mokatib-public-btn1-popup-imgwrap');
  const mainText = document.getElementById('mokatib-public-btn1-popup-text');
  if (!wrap) return;
  const parentId = mokatibSubPath.length ? mokatibSubPath[mokatibSubPath.length - 1] : 0;
  const node = parentId ? items.find((x) => Number(x.id) === Number(parentId)) : null;
  if (parentId && !node) { mokatibSubPath = []; return renderMokatibSub(); }
  wrap.classList.toggle('hidden', !items.length);
  // داخل یک مورد، عکس و متن اصلیِ بالای پنجره پنهان می‌شود تا جا برای زیرمجموعه‌ها باشد
  mainImgWrap.style.display = (!node && popup.image) ? 'block' : 'none';
  if (mainText) mainText.style.display = (!node && mainText.textContent) ? '' : 'none';
  const headEl = document.getElementById('mokatib-sub-heading');
  headEl.textContent = sub.heading || '';
  headEl.classList.toggle('hidden', !sub.heading || !!node);
  const detail = document.getElementById('mokatib-sub-detail');
  if (node) {
    detail.classList.remove('hidden');
    const nEl = document.getElementById('mokatib-sub-detail-name');
    nEl.textContent = mkTidyLines(node.name); nEl.style.whiteSpace = 'pre-line';
    const pEl = document.getElementById('mokatib-sub-detail-person');
    pEl.textContent = node.person ? mkTidyLines(node.person) : ''; pEl.classList.toggle('hidden', !node.person);
    const iEl = document.getElementById('mokatib-sub-detail-info');
    iEl.textContent = node.info || ''; iEl.classList.toggle('hidden', !node.info);
    const imgEl = document.getElementById('mokatib-sub-detail-img');
    const wEl = document.getElementById('mokatib-sub-detail-imgwrap');
    if (node.image) {
      imgEl.src = secureUrl(node.image); wEl.style.display = 'block';
      if (mokatibSubImageViewer) mokatibSubImageViewer.reset();
    } else { wEl.style.display = 'none'; imgEl.removeAttribute('src'); }
  } else {
    detail.classList.add('hidden');
    exitImageViewerFullscreen(document.getElementById('mokatib-sub-detail-imgwrap'));
  }
  const grid = document.getElementById('mokatib-sub-buttons');
  grid.innerHTML = '';
  grid.style.setProperty('--btn2-cols', sub.columns || 3);
  items.filter((x) => Number(x.parent || 0) === Number(parentId)).forEach((m) => {
    const hasKids = items.some((x) => Number(x.parent || 0) === Number(m.id));
    const clickable = hasKids || !!m.image || !!m.info;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'secondary-btn' + (m.person ? '' : ' mk-no-imam');
    const manual = mkHasBreak(m.name);
    const nameEl = document.createElement('span');
    nameEl.className = 'mokatib-btn2-name' + (manual ? ' mk-multiline' : '');
    nameEl.textContent = manual ? mkTidyLines(m.name) : mkTidy(m.name);
    btn.appendChild(nameEl);
    if (m.person) {
      const pe = document.createElement('span');
      const pm = mkHasBreak(m.person);
      pe.className = 'mokatib-btn2-imam' + (pm ? ' mk-multiline' : '');
      pe.textContent = pm ? mkTidyLines(m.person) : mkTidy(m.person);
      btn.appendChild(pe);
    }
    if (m.color) btn.style.background = m.color;
    if (clickable) {
      btn.addEventListener('click', () => {
        mokatibSubPath.push(m.id);
        renderMokatibSub();
        pushOverlay('btn1', undoMokatibSubStep);
        try { document.querySelector('#mokatib-public-btn1-popup .modal-box').scrollTop = 0; } catch (e) {}
      });
    } else { btn.style.cursor = 'default'; }
    grid.appendChild(btn);
  });
}
function undoMokatibSubStep() { mokatibSubPath.pop(); renderMokatibSub(); }
document.getElementById('mokatib-sub-back').addEventListener('click', () => {
  overlayGo('btn1', 1, undoMokatibSubStep);
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
const mokatibSubImageViewer = setupImageViewer(document.getElementById('mokatib-sub-detail-imgwrap'));

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
/* عنوان فرد هر مورد چارت مکاتب: «امام» یا «مسئول» (پیش‌فرض). از سایت با فیلد role می‌آید. */
function mkRoleLabel(m) {
  return (m && m.role === 'imam') ? 'امام' : 'مسئول';
}

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
      dInfoEl.textContent = m.imam_name ? mkRoleLabel(m) + ': ' + mkTidyLines(m.imam_name) : '';
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
      imamEl.textContent = mkRoleLabel(m) + ':\u00A0' + (manualImam ? mkTidyLines(m.imam_name) : mkTidy(m.imam_name));
      if (Number(m.imam_size) > 0) imamEl.style.fontSize = Number(m.imam_size) + 'px';
      btn.appendChild(imamEl);
    }
    btn.title = String(m.name || '').replace(/\s*\n\s*/g, ' ') + (m.imam_name ? ' — ' + mkRoleLabel(m) + ': ' + String(m.imam_name).replace(/\s*\n\s*/g, ' ') : '');
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
  const sc = data.subchart || {};
  mokatibState.publicSub = {
    heading: sc.heading || '',
    columns: Math.max(1, Math.min(6, parseInt(sc.columns, 10) || 3)),
    items: Array.isArray(sc.items) ? sc.items : [],
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
    switchToTab('mokatib-home'); // loadMokatibHome داخل switchToTab صدا زده می‌شود
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
    row.innerHTML = `<strong>${m.name}</strong>${m.imam_name ? ' — ' + mkRoleLabel(m) + ': ' + m.imam_name : ''}`;
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
    [m.address, m.imam_name ? mkRoleLabel(m) + ': ' + m.imam_name : '', m.phone, m.extra_info].filter(Boolean).join(' | ');
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

/* ---------- «معرفی اپ به دوستان» (صفحهٔ بیشتر) ----------
 * متن و لینک از GET /app-share می‌آید (پیشخوان ← تنظیمات ← بروزرسانی داخل اپ)؛ آخرین مقدار برای حالت آفلاین ذخیره می‌شود.
 * اشتراک (فقط متن + لینک سایت، بدون ارسال فایل): افزونهٔ بومی (shareText) ← navigator.share ← کپی در کلیپ‌بورد. */
(function setupShareAppTile() {
  const tile = document.getElementById('app-share-tile');
  if (!tile) return;
  const KEY = 'arefanejam_app_share_v1';
  const label = document.getElementById('app-share-label');
  const baseLabel = label ? label.textContent : '';
  const flash = (msg) => { if (!label) return; label.textContent = msg; setTimeout(() => { label.textContent = baseLabel; }, 2200); };
  async function getShareInfo() {
    // لینک گیت‌هاب هرگز به دوستان فرستاده نمی‌شود (صفحهٔ Releases نباید دیده شود)؛ به‌جایش لینک دانلود مستقیمِ خود سایت
    const SITE_GET_APP = String(DEFAULT_API_URL).replace(/\/+$/, '') + '/get-app';
    const okLink = (i) => !!(i && i.link) && !/^https?:\/\/([a-z0-9-]+\.)*github(usercontent)?\.com\//i.test(String(i.link));
    const fix = (i) => ({ text: String((i && i.text) || '').trim() || 'اپ «عارفان جام» را نصب کن:', link: okLink(i) ? String(i.link) : SITE_GET_APP });
    let info = null;
    try { info = await apiFetch('/app-share'); } catch (e) { info = null; }
    if (info && info.link) { info = fix(info); try { localStorage.setItem(KEY, JSON.stringify(info)); } catch (e) {} return info; }
    try { const c = JSON.parse(localStorage.getItem(KEY) || 'null'); if (c && c.link) return fix(c); } catch (e) {}
    return { text: 'اپ «عارفان جام» را نصب کن:', link: SITE_GET_APP };
  }
  tile.addEventListener('click', async () => {
    const info = await getShareInfo();
    const title = 'عارفان جام';
    const text = String(info.text || '').trim() + '\n' + String(info.link || '').trim();
    try { trackClick('app_share'); } catch (e) {}
    const nat = azanNativeShare();
    if (nat && typeof nat.shareText === 'function') {
      try { await nat.shareText({ title, text }); return; } catch (e) { /* ادامه با روش بعدی */ }
    }
    if (navigator.share) {
      try { await navigator.share({ title, text }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(text); flash('✓ لینک کپی شد'); } catch (e) { flash('اشتراک‌گذاری ممکن نشد'); }
  });
})();

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
        if (id) { localStorage.setItem('arefanejam_device_id', id); try { if (typeof window.arefNativeDevice === 'function') window.arefNativeDevice(id); } catch (e) {} return id; }
        return 'dev-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
      })
      .catch(() => 'dev-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10));
  }
  return deviceIdPromise;
}
/* ---------- آمار نصب/آنلاین (heartbeat) ---------- */
var hbLast = 0;
async function sendHeartbeat() {
  const hbS = trafficSec('hb_s', 60);
  if (hbS === 0 || hbS >= 120) {   // حالت صرفه‌جویی: بدون ارسال «خروج به پس‌زمینه» و با فاصلهٔ حداقل نصف دوره
    if (document.hidden) return;
    if (Date.now() - hbLast < (hbS > 0 ? hbS * 500 : 600000)) return;
  }
  if (siteDownNow()) return;
  hbLast = Date.now();
  const device_id = await ensureDeviceId();
  apiFetch('/heartbeat', { method: 'POST', body: JSON.stringify({ device_id, page: document.hidden ? '' : currentPageKey() }) }).catch(() => {});
  syncDeviceIdToServiceWorker(device_id);
  try { pvFlush(); } catch (e) {}
}
sendHeartbeat();
tPeriodic('hb_s', sendHeartbeat, 60);

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
      if (k !== AZAN_OFFLINE_CACHE_NAME && k !== APP_SHELL_CACHE_NAME && k !== QURAN_AUDIO_CACHE_NAME && k !== ANNOUNCEMENT_AUDIO_CACHE_NAME && k !== CHARITY_MEDIA_CACHE_NAME && k !== SITE_MEDIA_CACHE_NAME && k !== API_MIRROR_CACHE_NAME && k !== EID_AUDIO_CACHE_NAME && k !== VIDEO_CACHE_NAME) caches.delete(k);
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
    span.addEventListener('click', () => qpTapAyah(i));
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
  if (o.autoPlay) {
    silentEnsureSurahAudio(ayahs[startIdx].number); // پیش‌دانلود آیه‌های بعدیِ این سوره (مثلاً بعد از رفتنِ خودکار به صفحهٔ بعد)
    startSequentialPlayback(playbackQueue, playbackBlocks, startIdx, ayahs[startIdx].surahName);
  }
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
// لمس آیه در مصحف صفحه‌ای: آیه انتخاب می‌شود و همان لحظه صدایش (با دانلود خودکار) پخش می‌شود؛
// بعد آیه‌های بعدی به ترتیب (و با رسیدن به آخر صفحه، صفحهٔ بعد) دانلود و خوانده می‌شوند.
// دوباره لمس‌کردنِ همان آیه = توقف پخش و رها شدن انتخاب.
function qpStopPlayback() {
  playbackSession++; // دانلود/پخشِ نیمه‌کاره‌ٔ قبلی بعداً خودش شروع نشود
  try { recitationAudio.pause(); } catch (e) {}
  isSequentialPlaying = false;
  const pb = document.getElementById('surah-play-btn');
  if (pb) pb.textContent = '🔊 پخش کل سوره';
  document.querySelectorAll('.ayah-block.is-playing').forEach((b) => b.classList.remove('is-playing'));
}
function qpTapAyah(i) {
  const a = qpAyahs[i];
  if (!a) return;
  if (qpSelectedIdx === i) { qpSelectAyah(i); qpStopPlayback(); return; }
  qpSelectAyah(i);
  playbackSession++; // درخواست‌های نیمه‌کاره‌ٔ آیهٔ قبلی لغو شوند
  silentEnsureSurahAudio(a.number); // آیه‌های بعدیِ همین سوره را بی‌صدا در پس‌زمینه دانلود می‌کند
  startSequentialPlayback(playbackQueue, playbackBlocks, i, a.surahName);
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
  document.getElementById('qp-act-bookmark').classList.toggle('is-bookmarked', isBookmarked(ayah.number));
  bar.classList.remove('hidden');
}

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
      h.textContent = (it.title || '').trim(); list.appendChild(h); return;
    }
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'hb-item' + ((it.type === 'tab' && it.target === currentTab) || (it.type === 'home' && currentTab === 'home') ? ' is-current' : '');
    b.style.setProperty('--i', i);
    const ic = document.createElement('span'); ic.className = 'hb-item-ic';
    if (it.img) {
      ic.classList.add('has-img');
      const im = document.createElement('img'); im.alt = ''; im.loading = 'lazy'; im.decoding = 'async'; im.src = secureUrl(it.img);
      im.addEventListener('error', () => { im.remove(); ic.classList.remove('has-img'); ic.textContent = '•'; });
      ic.appendChild(im);
    } else ic.textContent = '•';
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
      if (HB_MAIN_TABS.indexOf(t) >= 0 || document.querySelector('.bottom-nav .nav-btn[data-tab="' + t + '"]')) { navHistory = []; switchToTab(t); } else switchToTab(t, { push: true });
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
loadMoreIcons(true);

/* ---------- صفحهٔ «تنظیمات» (بیشتر ← ⚙️ تنظیمات، و چرخ‌دندهٔ پایین-راست منوی همبرگری) ----------
   سوییچ پخش اذان همان عنصر قبلی است (فقط جایش عوض شده؛ شناسه‌ها #bg-mode-toggle / #bg-mode-status ثابت‌اند).
   دکمه‌های شهر / GPS / روش محاسبه همان دکمه‌های صفحهٔ اذان را صدا می‌زنند. بخش «پایداری و تست اذان» فقط در اپ اندروید دیده می‌شود. */
function settingsPlugin() { try { return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AppUpdater; } catch (e) { return null; } }
function settingsOnTabOpen() {
  const loc = document.getElementById('azan-location-label'), myLoc = document.getElementById('set-loc-label');
  if (loc && myLoc) myLoc.textContent = loc.textContent;
  try { refreshAzanMethodUi(); } catch (e) {}
  const mn = document.getElementById('azan-method-name'), myMn = document.getElementById('set-method-name');
  if (mn && myMn) myMn.textContent = mn.textContent;
  const nat = document.getElementById('set-native-block');
  if (nat) nat.classList.toggle('hidden', typeof window.openAzanTestPanel !== 'function');
  try { updateBgStatus(); } catch (e) {}
}
(function setupSettingsPage() {
  const $ = (id) => document.getElementById(id);
  const proxy = (mine, orig) => { const m = $(mine); if (m) m.addEventListener('click', () => { const o = $(orig); if (o) o.click(); }); };
  proxy('set-city-btn', 'city-picker-btn');
  proxy('set-gps-btn', 'azan-gps-btn');
  proxy('set-method-btn', 'azan-method-btn');
  const open = $('azan-open-settings');
  if (open) open.addEventListener('click', () => switchToTab('settings', { push: true }));
  // برچسب شهر و نام روش را زنده نگه می‌دارد (بعد از انتخاب شهر/GPS/روش)
  [['azan-location-label', 'set-loc-label'], ['azan-method-name', 'set-method-name']].forEach((p) => {
    const src = $(p[0]), dst = $(p[1]);
    if (!src || !dst || !window.MutationObserver) return;
    new MutationObserver(() => { dst.textContent = src.textContent; }).observe(src, { childList: true, characterData: true, subtree: true });
  });
  const msg = (t) => { const m = $('set-native-msg'); if (m) m.textContent = t || ''; };
  const bat = $('set-battery-btn');
  if (bat) bat.addEventListener('click', () => {
    try {
      if (window.NativeAlarms && typeof window.NativeAlarms.requestBattery === 'function') {
        Promise.resolve(window.NativeAlarms.requestBattery(true)).then(() => msg('اگر پنجرهٔ مجوز آمد «اجازه» را بزنید. اگر پنجره‌ای نیامد، یعنی مجوز از قبل داده شده است.'));
      } else msg('این بخش فقط در اپ اندروید کار می‌کند.');
    } catch (e) { msg('انجام نشد.'); }
  });
  const test = $('set-test-btn');
  if (test) test.addEventListener('click', () => { if (typeof window.openAzanTestPanel === 'function') window.openAzanTestPanel(); else msg('این بخش فقط در اپ اندروید کار می‌کند.'); });
  const stop = $('set-stop-btn');
  if (stop) stop.addEventListener('click', () => {
    const P = settingsPlugin();
    if (P && typeof P.stopAzan === 'function') Promise.resolve(P.stopAzan()).then(() => msg('✅ اذان متوقف شد.')).catch(() => msg('انجام نشد.'));
    else msg('این APK قدیمی است یا اذانی در حال پخش نیست.');
  });
  /* ----- تنظیمات پیشرفتهٔ اذان ----- */
  const applyAz = () => { try { lastScheduleSyncKey = ''; if (state.coords) computePrayerTimes(); } catch (e) {} };
  const offBox = $('set-az-off'), adjBox = $('set-az-adj');
  const adjLabel = (v) => (v === 0 ? 'بدون تغییر' : (v > 0 ? '+' : '−') + toPersianDigits(Math.abs(v)) + ' دقیقه');
  const adjEls = {};
  AZ_PRAYERS.forEach((pr) => {
    const k = pr[0], name = pr[1];
    if (offBox) {
      const row = document.createElement('label'); row.className = 'switch-row';
      const sp = document.createElement('span'); sp.textContent = 'اذان ' + name;
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !azOff(k);
      cb.addEventListener('change', () => { azPrefs().off[k] = !cb.checked; azPrefsSave(); applyAz(); });
      row.append(sp, cb); offBox.appendChild(row);
    }
    if (adjBox) {
      const row = document.createElement('div'); row.className = 'set-adj-row';
      const nm = document.createElement('span'); nm.className = 'set-adj-name'; nm.textContent = name;
      const minus = document.createElement('button'); minus.type = 'button'; minus.className = 'set-step'; minus.textContent = '−'; minus.setAttribute('aria-label', 'یک دقیقه کمتر');
      const val = document.createElement('span'); val.className = 'set-adj-val'; val.textContent = adjLabel(azAdj(k));
      const plus = document.createElement('button'); plus.type = 'button'; plus.className = 'set-step'; plus.textContent = '+'; plus.setAttribute('aria-label', 'یک دقیقه بیشتر');
      const step = (d) => {
        const v = Math.max(-30, Math.min(30, azAdj(k) + d));
        azPrefs().adj[k] = v; azPrefsSave(); val.textContent = adjLabel(v); applyAz();
      };
      minus.addEventListener('click', () => step(-1));
      plus.addEventListener('click', () => step(1));
      adjEls[k] = val;
      row.append(nm, minus, val, plus); adjBox.appendChild(row);
    }
  });
  const adjReset = $('set-az-adj-reset');
  if (adjReset) adjReset.addEventListener('click', () => {
    azPrefs().adj = {}; azPrefsSave();
    Object.keys(adjEls).forEach((k) => { adjEls[k].textContent = adjLabel(0); });
    applyAz();
  });
  const preSel = $('set-az-pre');
  if (preSel) { preSel.value = String(azPrefs().pre); preSel.addEventListener('change', () => { azPrefs().pre = Number(preSel.value) || 0; azPrefsSave(); applyAz(); }); }
  const postSel = $('set-az-post');
  if (postSel) { postSel.value = String(azPrefs().post); if (postSel.value !== String(azPrefs().post)) postSel.value = '20'; postSel.addEventListener('change', () => { azPrefs().post = Number(postSel.value) || 0; azPrefsSave(); applyAz(); }); }
  const voiceSel = $('set-az-voice'), voiceNote = $('set-az-voice-note');
  if (voiceSel) {
    const voices = (window.NATIVE_AZAN_VOICES && window.NATIVE_AZAN_VOICES.length) ? window.NATIVE_AZAN_VOICES : [];
    const def = document.createElement('option'); def.value = ''; def.textContent = 'پیش‌فرض (صدای انتخاب‌شده توسط سایت)';
    voiceSel.appendChild(def);
    voices.forEach((v) => { const o = document.createElement('option'); o.value = v.id; o.textContent = v.name || v.id; voiceSel.appendChild(o); });
    voiceSel.value = azPrefs().voice;
    if (voiceSel.value !== azPrefs().voice) voiceSel.value = '';
    voiceSel.addEventListener('change', () => { azPrefs().voice = voiceSel.value; azPrefsSave(); applyAz(); });
    if (voiceNote) voiceNote.textContent = voices.length > 1
      ? 'صدای انتخابی از بعد از اذان بعدی اعمال می‌شود. (فقط در اپ اندروید)'
      : 'فعلاً فقط یک صدا داخل اپ است؛ وقتی چند صدا اضافه شود اینجا قابل انتخاب می‌شود. (فقط در اپ اندروید)';
  }
  const gear = $('hb-settings');
  if (gear) gear.addEventListener('click', () => hbChoose({ type: 'tab', target: 'settings' }));
})();

/* ---------- منوی پایین اپ (قابل‌مدیریت از پیشخوان ← «🧭 منوی پایین اپ») ----------
   مسیر /bottom-nav: { custom, items: [{tab, label, icon, image}] }. اگر custom=false همان شش دکمهٔ پیش‌فرض است.
   ساخت دکمه‌ها در window.__bnavBuild (اسکریپت کوچک داخل index.html زیر نوار پایین) انجام می‌شود تا هم با اولین نمایش
   (از کش گوشی، پیش از لود app.js) و هم اینجا (بعد از دریافت تازه) یک منطق داشته باشند. کلیک: شنوندهٔ مشترک بالای فایل. */
var bnavLastLoad = 0;
function bnavApply(d) {
  if (!d || typeof d !== 'object') return;
  try {
    if (typeof window.__bnavBuild === 'function') window.__bnavBuild(d);
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === currentTab));
    // اگر «سوالات شرعی» داخل منو هست و نوشته/آیکونش از تنظیمات خودش می‌آید، دوباره از کش بگیر
    if (document.getElementById('shariq-nav-label') || document.getElementById('shariq-nav-icon')) loadShariqSettings();
    const imgs = [];
    (d.items || []).forEach((it) => { if (it && it.image) imgs.push(it.image); });
    if (imgs.length) prefetchSiteImages(imgs);
  } catch (e) {}
}
function bnavLoad(force) {
  if (!force && Date.now() - bnavLastLoad < 60000) return;
  bnavLastLoad = Date.now();
  try { apiSWR('/bottom-nav', bnavApply).catch(() => {}); } catch (e) {}
}
bnavLoad(true);
document.addEventListener('visibilitychange', () => { if (!document.hidden) bnavLoad(false); });
window.addEventListener('online', () => bnavLoad(true));

/* ---------- سرگرمی ← بازی «حدس آیه» ----------
   بیشتر ← سرگرمی ← حدس آیه قرآنی. اول کاربر رشته را از فهرست ثابت GA_CATS (۱ جزء، ۲ جزء، ۳ و ۵ جزء اول، ۳ و ۵ جزء آخر، ۱۵ جزء اول، ۱۵ جزء آخر، ۲۰، ۳۰ جزء) انتخاب می‌کند؛ هر دور ۱۰ سؤال:
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
  { id: '15l', label: '۱۵ جزء آخر', note: 'جزء ۱۶ تا ۳۰',      juz: gaRange(16, 30) },
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
    <div id="ga-voice" class="ga-voice hidden"></div>
    <p class="muted-text small ga-hint">وقتی خواندید یا آماده بودید، پاسخ را ببینید</p>
    <button class="secondary-btn ga-show" id="ga-show-btn">نمایش پاسخ</button>
  </div>`;
  gaRenderFirst(0);
  document.getElementById('ga-hint-btn').addEventListener('click', gaHint);
  document.getElementById('ga-show-btn').addEventListener('click', gaShowAnswer);
  gaVoiceInit();
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
/* ---------- 🎤 «بخوان تا بسنجم» در بازی حدس آیه ----------
   کاربر آیه‌های سؤال را با صدا می‌خواند؛ پنجرهٔ تشخیص گفتار گوشی (عربی) متن را برمی‌گرداند و اینجا کلمه‌به‌کلمه با متن آیه مقایسه می‌شود.
   ⚠ فقط «درستیِ کلمه‌ها» سنجیده می‌شود، نه تجوید و مخرج حروف؛ و دقتش به موتور گفتار گوشی بستگی دارد (املای عثمانی و عربی استاندارد
   با مقایسهٔ «اسکلت حروف» و شباهت فازی تا حدی جبران می‌شود). فقط در اپ اندروید با APK جدید (متد speechListen) دکمه دیده می‌شود. */
var GA_VOICE_PASS = 0.75;      // حداقل درصد کلمه‌های درست برای «درست خواندی»
var gaVoiceBusy = false;
function gaNormAr(w) {
  return String(w || '')
    .replace(/[\u0640\u064B-\u065F\u0670\u06D6-\u06ED\u200c\u200d\u200e\u200f]/g, '')   // تطویل و حرکات و علامت‌های قرآنی
    .replace(/[إأآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ی/g, 'ي').replace(/ك|ک/g, 'ك').replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/ء/g, '')
    .replace(/[^\u0621-\u063A\u0641-\u064A]/g, '');
}
function gaSkel(w) {            // اسکلت: حروف صدادار (ا و ي) حذف می‌شود تا «السموات/السماوات» و «الرحمن/الرحمان» یکی شوند
  const k = gaNormAr(w).replace(/[اويى]/g, '');
  return k || gaNormAr(w);
}
function gaLev(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = new Array(n + 1), cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    const t = prev; prev = cur; cur = t;
  }
  return prev[n];
}
function gaWordMatch(e, s) {    // e: کلمهٔ آیه، s: کلمهٔ گفته‌شده (هر دو از قبل {n, k} دارند)
  if (e.n && e.n === s.n) return true;
  if (e.k && e.k === s.k) return true;
  const L = Math.max(e.k.length, s.k.length);
  if (L < 3) return false;
  return 1 - gaLev(e.k, s.k) / L >= 0.7;
}
// مقایسهٔ ترتیبی (LCS روی کلمه‌ها): هر کلمهٔ آیه «درست» یا «جاافتاده/اشتباه» می‌شود. کلمه‌های اضافهٔ گفته‌شده نادیده گرفته می‌شود.
function gaVoiceScore(expWords, spokenText) {
  const E = expWords.map((w) => ({ w, n: gaNormAr(w), k: gaSkel(w) })).filter((x) => x.n);
  const S = String(spokenText || '').split(/\s+/).map((w) => ({ n: gaNormAr(w), k: gaSkel(w) })).filter((x) => x.n);
  const m = E.length, n = S.length;
  if (!m) return { pct: 0, marks: [] };
  const dp = [];
  for (let i = 0; i <= m; i++) dp.push(new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    dp[i][j] = gaWordMatch(E[i - 1], S[j - 1]) ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  }
  const marks = new Array(m).fill(false);
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (gaWordMatch(E[i - 1], S[j - 1]) && dp[i][j] === dp[i - 1][j - 1] + 1) { marks[i - 1] = true; i--; j--; }
    else if (dp[i - 1][j] >= dp[i][j - 1]) i--; else j--;
  }
  return { pct: dp[m][n] / m, marks, words: E.map((x) => x.w) };
}
function gaVoiceNative() {
  const C = window.Capacitor;
  return !!(C && typeof C.isNativePlatform === 'function' && C.isNativePlatform() && C.Plugins && C.Plugins.AppUpdater);
}
function gaVoiceInit() {
  const box = document.getElementById('ga-voice');
  if (!box || !gaVoiceNative()) return;
  const AUp = window.Capacitor.Plugins.AppUpdater;
  if (typeof AUp.speechAvailable !== 'function') return;
  const g = gaGame, qi = g && g.i;
  AUp.speechAvailable().then((r) => {
    if (!r || !r.ok) return;
    if (!gaGame || gaGame.i !== qi || !document.getElementById('ga-voice')) return;   // سؤال عوض شده
    box.classList.remove('hidden');
    box.innerHTML = '<button class="ghost-btn ga-mic-btn" id="ga-mic-btn">🎤 بخوان تا بسنجم</button>' +
      '<p class="muted-text small ga-mic-note">آیه‌های این سؤال را با صدا بخوانید؛ اپ می‌گوید کلمه‌ها درست بود یا نه (تجوید سنجیده نمی‌شود).</p>';
    document.getElementById('ga-mic-btn').addEventListener('click', gaVoiceListen);
  }).catch(() => { /* APK قدیمی: دکمه نمایش داده نمی‌شود */ });
}
function gaVoiceListen() {
  if (gaVoiceBusy || !gaGame) return;
  const g = gaGame, D = g.D, q = g.qs[g.i], qi = g.i;
  const box = document.getElementById('ga-voice');
  const exp = [];
  for (let x = q.from; x < q.to; x++) String(D.flat[x].t).split(/\s+/).filter(Boolean).forEach((w) => exp.push(w));
  gaVoiceBusy = true;
  const AUp = window.Capacitor.Plugins.AppUpdater;
  AUp.speechListen({ prompt: 'آیه‌های این سؤال را بخوانید' }).then((r) => {
    gaVoiceBusy = false;
    if (!gaGame || gaGame.i !== qi || !document.getElementById('ga-voice')) return;
    const list = (r && r.results) || [];
    if (!list.length) { gaVoiceShowMsg(box, r && r.cancelled ? 'چیزی شنیده نشد. دوباره امتحان کنید.' : 'صدایی تشخیص داده نشد. دوباره امتحان کنید.'); return; }
    let best = null;
    list.forEach((t) => { const sc = gaVoiceScore(exp, t); if (!best || sc.pct > best.pct) best = sc; });
    gaVoiceShowResult(box, best, exp.length);
  }).catch((e) => {
    gaVoiceBusy = false;
    const m = String((e && (e.message || e.errorMessage)) || e || '');
    gaVoiceShowMsg(box, /unavailable/i.test(m) ? 'این گوشی برنامهٔ تشخیص گفتار (گوگل) ندارد یا غیرفعال است.' : 'تشخیص صدا انجام نشد. دوباره امتحان کنید.');
  });
}
function gaVoiceShowMsg(box, msg) {
  if (!box) return;
  box.innerHTML = '<p class="ga-mic-msg">' + gaEsc(msg) + '</p><button class="ghost-btn ga-mic-btn" id="ga-mic-btn">🎤 دوباره بخوان</button>';
  document.getElementById('ga-mic-btn').addEventListener('click', gaVoiceListen);
}
function gaVoiceShowResult(box, sc, total) {
  const pct = Math.round(sc.pct * 100);
  const ok = sc.pct >= GA_VOICE_PASS;
  const ws = sc.words.map((w, i) => '<span class="' + (sc.marks[i] ? 'ga-vok' : 'ga-vbad') + '">' + gaEsc(w) + '</span>').join(' ');
  const hit = sc.marks.filter(Boolean).length;
  box.innerHTML = '<div class="ga-vres ' + (ok ? 'ok' : 'bad') + '">' +
    '<div class="ga-vpct">' + toPersianDigits(pct) + '٪</div>' +
    '<p class="ga-vtitle">' + (ok ? '✅ ماشاءالله، درست خواندی' : '❌ هنوز کامل نبود') + '</p>' +
    '<p class="muted-text small">' + toPersianDigits(hit) + ' کلمه از ' + toPersianDigits(total) + ' کلمه تشخیص داده شد. سبز: درست، قرمز: جاافتاده یا متفاوت.</p>' +
    '<div class="ga-vwords" dir="rtl">' + ws + '</div>' +
    '<div class="ga-vbtns">' +
      (ok ? '<button class="secondary-btn" id="ga-vnext-btn">ادامه ✅ (درست حساب شود)</button>' : '') +
      '<button class="ghost-btn" id="ga-mic-btn">🎤 دوباره بخوان</button>' +
    '</div></div>';
  document.getElementById('ga-mic-btn').addEventListener('click', gaVoiceListen);
  const nx = document.getElementById('ga-vnext-btn');
  if (nx) { let done = false; nx.addEventListener('click', () => { if (done) return; done = true; gaJudge(true); }); }
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

// آیا پشتیبان به گفتگوی من جواب داده؟ (نقطهٔ قرمز روی کاشی + اعلان داخل اپ «پاسخ شما در بخش نظرات داده شد»).
// وقتی اپ بسته/در پس‌زمینه است، همین پاسخ را کد بومی از راه /inbox?device_id=... به‌صورت اعلان اندروید می‌آورد.
const FB_NOTED_KEY = 'arefanejam_fb_noted';
function fbCancelNotice() { try { if (typeof window.arefCancelFeedbackNotice === 'function') window.arefCancelFeedbackNotice(); } catch (e) {} }
function fbBanner(ticketId) {
  try {
    const old = document.getElementById('fb-banner'); if (old) old.remove();
    const b = fbEl('div', 'fb-banner');
    b.id = 'fb-banner';
    b.setAttribute('role', 'alert');
    b.appendChild(fbEl('span', '', '💬'));
    b.appendChild(fbEl('b', '', 'پاسخ شما در بخش نظرات داده شد'));
    const go = fbEl('button', 'fb-banner-go', 'مشاهده');
    go.type = 'button';
    const x = fbEl('button', 'fb-banner-x', '✕');
    x.type = 'button';
    x.setAttribute('aria-label', 'بستن');
    const close = () => { try { b.remove(); } catch (e) {} };
    go.addEventListener('click', (e) => { e.stopPropagation(); close(); if (ticketId) openFbView(ticketId); else switchToTab('feedback', { push: true }); });
    x.addEventListener('click', (e) => { e.stopPropagation(); close(); });
    b.addEventListener('click', () => { close(); if (ticketId) openFbView(ticketId); else switchToTab('feedback', { push: true }); });
    b.appendChild(go); b.appendChild(x);
    document.body.appendChild(b);
    try { if (navigator.vibrate) navigator.vibrate([120, 60, 120]); } catch (e) {}
    setTimeout(close, 15000);
  } catch (e) {}
}
async function fbCheckNews() {
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    if (siteDownNow()) return;
    fbLastCheck = Date.now();
    const device_id = await ensureDeviceId();
    const d = await shariqGet('/feedback/mine?device_id=' + encodeURIComponent(device_id));
    const rows = Array.isArray(d && d.tickets) ? d.tickets : [];
    try { localStorage.setItem('arefanejam_fb_has', rows.length ? '1' : '0'); } catch (e) {}
    const unread = rows.filter((r) => r && r.unread);
    fbSetDot(unread.length > 0 || Number(d && d.unread) > 0);
    if (!unread.length) {
      try { localStorage.removeItem(FB_NOTED_KEY); } catch (e) {}
      fbCancelNotice();
      return;
    }
    // هر پاسخ تازه (تعداد پیام‌های گفتگو عوض می‌شود) فقط یک‌بار اعلام می‌شود
    const rev = unread.map((r) => r.id + ':' + r.count).join(',');
    let noted = '';
    try { noted = localStorage.getItem(FB_NOTED_KEY) || ''; } catch (e) {}
    if (!document.hidden && noted !== rev) {
      try { localStorage.setItem(FB_NOTED_KEY, rev); } catch (e) {}
      fbCancelNotice();
      if (fbViewId !== Number(unread[0].id) || currentTab !== 'feedback-view') fbBanner(unread[0].id);
    }
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
        try { localStorage.setItem('arefanejam_fb_has', '1'); } catch (e) {}
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
  if (!document.hidden && Date.now() - fbLastCheck > Math.max(60000, trafficSec('fb_s', 90) * 500)) fbCheckNews();
});
loadFeedbackSettings();
setTimeout(fbCheckNews, 10000);
// تا وقتی اپ روی صفحه است، هر ۹۰ ثانیه می‌پرسد آیا پاسخی آمده (پاسخ در همان لحظه داخل اپ نشان داده شود)
// فقط گوشی‌هایی که تیکت دارند (یا هنوز بررسی نشده‌اند) هر چند دقیقه می‌پرسند؛ بقیه فقط هنگام باز شدن/برگشتن
tPeriodic('fb_s', () => { if (localStorage.getItem('arefanejam_fb_has') !== '0') fbCheckNews(); }, 90);

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
  try { const n = actFindHere(String(id)); trackPage('item:act:' + id, 'فعالیت: ' + ((n && n.title) || id)); } catch (e) {}
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
// پیدا کردن آیکون با شناسه در فهرست فعلی (سطح جاری)، و رفتن به یک بخش اپ (همان منطق منوی همبرگری)
function actFindHere(id) {
  try {
    const chain = actChain();
    const node = chain.length ? chain[chain.length - 1] : null;
    const list = node ? (node.children || []) : ((actData && actData.items) || []);
    return list.find((x) => String(x.id) === String(id)) || null;
  } catch (e) { return null; }
}
function actGoTab(t) {
  t = String(t || '');
  if (t.indexOf('group:') === 0) { openMenuGroup(t.slice(6)); return true; }
  if (!document.getElementById('tab-' + t)) return false;
  switchToTab(t, { push: true }); // همیشه با تاریخچه: دکمهٔ برگشت گوشی به صفحهٔ فعالیت‌ها برمی‌گردد
  return true;
}
(function setupActivitiesEvents() {
  try {
    const grid = document.getElementById('act-grid');
    const blocks = document.getElementById('act-blocks');
    const back = document.getElementById('act-back-btn');
    if (!grid || !blocks || !back) return;
    grid.addEventListener('click', (e) => {
      const t = e.target.closest('[data-act-id]');
      if (!t) return;
      // هدایت: اگر مدیر برای این آیکون «رفتن به بخش اپ / لینک» گذاشته باشد، به‌جای باز شدن محتوا همان انجام می‌شود
      const gn = actFindHere(t.getAttribute('data-act-id'));
      if (gn && gn.go_type === 'tab' && gn.go_tab) { try { trackClick('activities_goto'); } catch (e2) {} if (actGoTab(gn.go_tab)) return; }
      if (gn && gn.go_type === 'link' && /^https?:\/\//i.test(gn.go_url || '')) { try { trackClick('activities_golink'); } catch (e2) {} try { window.open(gn.go_url, '_blank'); } catch (e3) { location.href = gn.go_url; } return; }
      actEnter(t.getAttribute('data-act-id'));
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

/* ---------- تبلیغات (بیشتر ← 📢 تبلیغات): محتوا را مدیر در پیشخوان می‌نویسد ----------
   پیشخوان ← عارفان جام ← «📢 تبلیغات». داده از GET /ads-page می‌آید (آفلاین هم ذخیره می‌شود).
   تا اولین دریافت، همان متن ثابت داخل index.html (#ads-static) دیده می‌شود؛ بعد از دریافت، #ads-dyn ساخته و جایگزین می‌شود.
   کاشی «تبلیغات» در «بیشتر» با کلید «نمایش بخش» پیشخوان پنهان/نمایان می‌شود.
   ⚠ متغیرها عمداً با var هستند (switchToTab ممکن است قبل از رسیدن اجرا به این خط‌ها صدا زده شود). */
var adsData = null;
function adsTel(n) { return 'tel:' + String(n || '').replace(/[^0-9+*#]/g, ''); }
function adsRender(d) {
  try {
    const tile = document.getElementById('ads-more-tile');
    const tl = document.getElementById('ads-tile-label');
    if (tile) tile.classList.toggle('hidden', !!d && d.enabled === false);
    if (tl && d && d.tile_title) tl.textContent = d.tile_title;
    const dyn = document.getElementById('ads-dyn');
    const st = document.getElementById('ads-static');
    if (!dyn || !st || !d || typeof d !== 'object') return;
    const a = zkAttr;
    let h = '';
    if (d.hero_title || d.hero_text || d.hero_icon) {
      h += '<div class="ad-hero"><div class="ad-hero-glow"></div>' +
        (d.hero_icon ? '<div class="ad-hero-icon">' + a(d.hero_icon) + '</div>' : '') +
        (d.hero_title ? '<h2 class="ad-hero-title">' + a(d.hero_title) + '</h2>' : '') +
        (d.hero_text ? '<p class="ad-hero-text">' + a(d.hero_text).replace(/\n/g, '<br>') + '</p>' : '') + '</div>';
    }
    const ads = Array.isArray(d.ads) ? d.ads : [];
    if (ads.length) {
      h += '<div class="section-block">' + (d.ads_title ? '<h3>' + a(d.ads_title) + '</h3>' : '') + '<div class="ad-cards">';
      ads.forEach((x) => {
        const link = /^https?:\/\//i.test(x.link || '') ? x.link : '';
        h += '<div class="ad-card">' +
          (x.image ? '<div class="ad-card-img" data-ad-zoom="' + a(secureUrl(x.image)) + '" data-ad-name="' + a(x.title || '') + '"><img src="' + a(secureUrl(x.image)) + '" alt="' + a(x.title || '') + '" loading="lazy"></div>' : '') +
          '<div class="ad-card-body">' +
          (x.title ? '<div class="ad-card-title">' + a(x.title) + '</div>' : '') +
          (x.text ? '<div class="ad-card-text">' + a(x.text).replace(/\n/g, '<br>') + '</div>' : '') +
          ((x.phone || link) ? '<div class="ad-card-btns">' +
            (x.phone ? '<a class="ad-card-btn ad-card-call" data-ad-track="call" href="' + a(adsTel(x.phone)) + '">📞 <span dir="ltr">' + a(x.phone) + '</span></a>' : '') +
            (link ? '<a class="ad-card-btn ad-card-link" data-ad-track="link" data-ad-link="' + a(link) + '" href="' + a(link) + '">🔗 ' + a(x.link_label || 'مشاهده') + '</a>' : '') +
            '</div>' : '') +
          '</div></div>';
      });
      h += '</div></div>';
    }
    const phones = Array.isArray(d.phones) ? d.phones : [];
    if (phones.length) {
      h += '<div class="section-block">' + (d.phones_title ? '<h3>' + a(d.phones_title) + '</h3>' : '') +
        (d.phones_hint ? '<p class="muted-text small">' + a(d.phones_hint) + '</p>' : '') + '<div class="ad-phones">';
      phones.forEach((p) => {
        h += '<a class="ad-phone" data-ad-track="phone" href="' + a(adsTel(p.number)) + '"><span class="ad-phone-ic">' + a(p.icon || '📞') + '</span>' +
          '<span class="ad-phone-tx">' + (p.label ? '<small>' + a(p.label) + '</small>' : '') + '<b dir="ltr">' + a(p.number) + '</b></span><span class="ad-phone-go">‹</span></a>';
      });
      h += '</div></div>';
    }
    const plans = Array.isArray(d.plans) ? d.plans : [];
    if (plans.length) {
      h += '<div class="section-block">' + (d.plans_title ? '<h3>' + a(d.plans_title) + '</h3>' : '') + '<div class="ad-plans">';
      plans.forEach((p) => {
        const col = /^(bronze|silver|gold)$/.test(p.color) ? p.color : 'gold';
        const feats = String(p.features || '').split(/\r?\n/).map((t) => t.trim()).filter(Boolean);
        h += '<div class="ad-plan ad-plan-' + col + (p.best ? ' ad-plan-best' : '') + '">' +
          (p.best ? '<div class="ad-plan-ribbon">' + a(p.ribbon || 'پیشنهاد ویژه') + '</div>' : '') +
          (p.badge ? '<div class="ad-plan-badge">' + a(p.badge) + '</div>' : '') +
          '<div class="ad-plan-name">' + a(p.name) + '</div>' +
          (p.price ? '<div class="ad-plan-price"><b>' + a(p.price) + '</b>' + (p.unit ? ' <small>' + a(p.unit) + '</small>' : '') + '</div>' : '') +
          (feats.length ? '<ul class="ad-plan-list">' + feats.map((t) => '<li>' + a(t) + '</li>').join('') + '</ul>' : '') + '</div>';
      });
      h += '</div>' + (d.note ? '<p class="muted-text small ad-note">' + a(d.note) + '</p>' : '') + '</div>';
    } else if (d.note) {
      h += '<div class="section-block"><p class="muted-text small ad-note">' + a(d.note) + '</p></div>';
    }
    if (d.cta_enabled && d.cta_number) {
      h += '<div class="section-block"><a class="ad-cta" data-ad-track="cta" href="' + a(adsTel(d.cta_number)) + '"><span>📞</span><b>' + a(d.cta_text || 'همین حالا تماس بگیرید') + '</b></a></div>';
    }
    dyn.innerHTML = h;
    dyn.classList.remove('hidden');
    st.classList.add('hidden');
  } catch (e) { try { console.error('ads', e); } catch (e2) {} }
}
function adsLoad() {
  return apiSWR('/ads-page', (d) => {
    adsData = (d && typeof d === 'object') ? d : null;
    adsRender(adsData);
  }).catch(() => {});
}
function adsOnTabOpen() { adsLoad(); }
(function setupAdsEvents() {
  try {
    const dyn = document.getElementById('ads-dyn');
    if (!dyn) return;
    dyn.addEventListener('click', (e) => {
      const z = e.target.closest('[data-ad-zoom]');
      if (z) { e.preventDefault(); openRmzZoom(z.getAttribute('data-ad-zoom'), z.getAttribute('data-ad-name') || ''); return; }
      const t = e.target.closest('[data-ad-track]');
      if (!t) return;
      try { trackClick('ads_' + t.getAttribute('data-ad-track')); } catch (e2) {}
      const lk = t.getAttribute('data-ad-link');
      if (lk) { e.preventDefault(); window.open(lk, '_blank'); }
    });
  } catch (e) { try { console.error('ads ui', e); } catch (e2) {} }
})();
adsLoad();


/* ---------- بنرهای تبلیغاتی در همهٔ بخش‌های اپ ----------
   پیشخوان ← عارفان جام ← «🖼️ بنرهای اپ». داده از GET /ad-banners می‌آید (آفلاین هم ذخیره می‌شود).
   برای هر بنر مدیر بخش‌ها (scope: all = همه به‌جز sections، some = فقط sections)، جایگاه (top/bottom)، اندازه، لینک/تلفن
   و بازهٔ زمانی را تعیین می‌کند. بنر داخل جریان صفحه است: یک کادر `.bnr-slot` اول یا آخر همان `.tab-panel` (روی محتوا نمی‌افتد).
   کلید بخش = نام تب (id پنل بدون «tab-»)؛ پس هر پنل تازه‌ای که اضافه شود خودکار بنر می‌گیرد (برای انتخاب در پیشخوان: SLOTS در class-ad-banners.php).
   چند بنر در یک جایگاه به‌نوبت (هر ۶ ثانیه) عوض می‌شوند. فقط مدیر بنر را پنهان/حذف می‌کند؛ بنر ناقص یا بدون عکس نمایش داده نمی‌شود.
   ⚠ متغیرها عمداً با var هستند (switchToTab ممکن است قبل از رسیدن اجرا به این خط‌ها صدا زده شود). */
var bnrData = null;
var bnrLastLoad = 0;
function bnrIsLive(b) {
  const now = Math.floor(Date.now() / 1000);
  if (!b || !b.image) return false;
  if (b.from && now < b.from) return false;
  if (b.to && now > b.to) return false;
  return true;
}
function bnrMatches(b, tab) {
  const secs = Array.isArray(b.sections) ? b.sections : [];
  return b.scope === 'some' ? secs.indexOf(tab) > -1 : secs.indexOf(tab) === -1;
}
function bnrRenderTab(tab) {
  const panel = document.getElementById('tab-' + tab);
  if (!panel) return;
  ['top', 'bottom'].forEach((pos) => {
    let slot = null;
    for (const ch of panel.children) { if (ch.classList && ch.classList.contains('bnr-slot') && ch.getAttribute('data-pos') === pos) { slot = ch; break; } }
    const all = (bnrData && bnrData.enabled !== false && Array.isArray(bnrData.banners)) ? bnrData.banners : [];
    const list = all.filter((b) => (b.pos === 'bottom' ? 'bottom' : 'top') === pos && bnrMatches(b, tab) && bnrIsLive(b));
    if (!list.length) { if (slot) { slot.innerHTML = ''; slot.removeAttribute('data-sig'); slot.classList.add('hidden'); } return; }
    if (!slot) {
      slot = document.createElement('div');
      slot.className = 'bnr-slot';
      slot.setAttribute('data-pos', pos);
      if (pos === 'top') panel.insertBefore(slot, panel.firstChild); else panel.appendChild(slot);
    }
    const sig = list.map((b) => b.id + ':' + b.image + ':' + b.size + ':' + b.height + ':' + (b.label ? 1 : 0) + ':' + (b.link || '') + ':' + (b.phone || '')).join('|');
    slot.classList.remove('hidden');
    if (slot.getAttribute('data-sig') === sig) return;
    slot.setAttribute('data-sig', sig);
    const start = Math.floor(Math.random() * list.length);
    slot.innerHTML = list.map((b, i) => {
      const size = /^(slim|normal|big)$/.test(b.size) ? b.size : 'normal';
      const act = (/^https?:\/\//i.test(b.link || '') ? 'link' : (b.phone ? 'tel' : ''));
      const hh = Math.max(30, Math.min(250, parseInt(b.height, 10) || ({ slim: 40, normal: 56, big: 80 }[size] || 56)));
      return '<div class="bnr-item bnr-' + size + (i === start ? ' on' : '') + (act ? ' bnr-click' : '') + '" style="height:' + hh + 'px"' +
        ' data-bnr-id="' + zkAttr(b.id) + '"' + (act ? ' data-bnr-act="' + act + '"' : '') +
        (act === 'link' ? ' data-bnr-link="' + zkAttr(b.link) + '"' : '') + (act === 'tel' ? ' data-bnr-tel="' + zkAttr(b.phone) + '"' : '') +
        (act ? ' role="link"' : '') + '>' +
        '<img src="' + zkAttr(secureUrl(b.image)) + '" alt="' + zkAttr(b.name || 'تبلیغ') + '" loading="lazy" draggable="false">' +
        (b.label ? '<span class="bnr-tag">تبلیغ</span>' : '') + '</div>';
    }).join('');
  });
}
function bnrLoad() {
  bnrLastLoad = Date.now();
  return apiSWR('/ad-banners', (d) => {
    bnrData = (d && typeof d === 'object') ? d : null;
    try { bnrRenderTab(currentTab); } catch (e) {}
  }).catch(() => {});
}
(function setupBanners() {
  try {
    document.addEventListener('click', (e) => {
      const it = e.target.closest ? e.target.closest('.bnr-item[data-bnr-act]') : null;
      if (!it) return;
      try { trackClick('banner_' + it.getAttribute('data-bnr-id')); } catch (e2) {}
      if (it.getAttribute('data-bnr-act') === 'link') window.open(it.getAttribute('data-bnr-link'), '_blank');
      else window.location.href = adsTel(it.getAttribute('data-bnr-tel'));
    });
    // عکسی که باز نشد (آفلاین بدون کش / حذف‌شده): همان بنر پنهان شود تا کادر خالی نماند
    document.addEventListener('error', (e) => {
      const t = e.target;
      if (t && t.tagName === 'IMG' && t.closest && t.closest('.bnr-item')) {
        const it = t.closest('.bnr-item'); const slot = it.parentNode;
        it.remove();
        if (slot && !slot.querySelector('.bnr-item')) slot.classList.add('hidden');
        else if (slot && !slot.querySelector('.bnr-item.on')) slot.querySelector('.bnr-item').classList.add('on');
      }
    }, true);
    // چرخش خودکار بنرهای هم‌جایگاه (فقط صفحهٔ باز)
    setInterval(() => {
      if (document.hidden) return;
      document.querySelectorAll('.tab-panel.active > .bnr-slot:not(.hidden)').forEach((slot) => {
        const items = slot.querySelectorAll('.bnr-item');
        if (items.length < 2) return;
        let cur = 0; items.forEach((x, i) => { if (x.classList.contains('on')) cur = i; });
        items[cur].classList.remove('on');
        items[(cur + 1) % items.length].classList.add('on');
      });
    }, 6000);
    // تازه‌سازی با برگشتن به اپ (حداکثر هر ۵ دقیقه) و پایان بازهٔ زمانی بنرها
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      if (Date.now() - bnrLastLoad > 300000) bnrLoad(); else { try { bnrRenderTab(currentTab); } catch (e) {} }
    });
  } catch (e) { try { console.error('banners', e); } catch (e2) {} }
})();
bnrLoad();

/* ============================================================
   دانش‌آموزان (مرحلهٔ ۱: ورود + سلسله‌مراتب؛ مرحلهٔ ۲: ولی/سرپرست + حضور و غیاب + اعلان به والدین)
   پیشخوان: عارفان جام ← 🎓 دانش‌آموزان. همهٔ درخواست‌ها POST و توکن داخل بدنه است (/students/*).
   اطلاعات شخصی هیچ‌جا در کش آفلاین نمی‌ماند؛ فقط توکن ورود در localStorage.
   برای افزودن امکان تازه (نمره/حضور و غیاب/آزمون): بخش جدید در stuRenderView و مسیر جدید در class-students.php.
   ============================================================ */
(function () {
  try {
    const TOKEN_KEY = 'arefanejam_stu_token';
    const LEVEL = { head: 1, manager: 2, deputy: 3, dean: 4, teacher: 5, accountant: 6, janitor: 6, driver: 6, student: 7, parent: 8 };
    const LABEL = { head: 'رئیس سازمان', manager: 'مدیر', deputy: 'معاون', dean: 'ناظم', teacher: 'معلم', accountant: 'حسابدار', janitor: 'سرایدار', driver: 'راننده', student: 'دانش‌آموز', parent: 'ولی / سرپرست' };
    const ICON = { head: '👑', manager: '🏫', deputy: '🧑‍💼', dean: '📏', teacher: '👨‍🏫', accountant: '🧾', janitor: '🔑', driver: '🚌', student: '🎓', parent: '👪' };
    const REL = { father: 'پدر', mother: 'مادر', guardian: 'سرپرست', grandpa: 'پدربزرگ', grandma: 'مادربزرگ', uncle: 'عمو', mamu: 'دایی', aunt: 'عمه', khaleh: 'خاله', brother: 'برادر', sister: 'خواهر', other: 'ولی دیگر' };
    // هر نقش چه نقش‌هایی را می‌تواند زیر نظر داشته باشد (همان جدول سرور؛ سرور هم دوباره کنترل می‌کند)
    const ALL_STAFF = ['deputy', 'dean', 'teacher', 'accountant', 'janitor', 'driver', 'student', 'parent'];
    const CREATE = { head: ['manager'].concat(ALL_STAFF), manager: ALL_STAFF, deputy: ['dean', 'teacher', 'student', 'parent'], dean: ['student', 'parent'], teacher: ['student', 'parent'], student: ['parent'] };
    const ATT_ROLES = ['head', 'manager', 'deputy', 'dean', 'teacher'];
    const ATT = { present: ['حاضر', '✅', 'ح'], absent: ['غایب', '❌', 'غ'], late: ['تأخیر', '⏰', 'ت'], excused: ['غیبت موجه', '📝', 'م'] };
    const S = { token: '', me: null, users: [], viewId: null, busy: false, sheet: null };
    try { S.token = localStorage.getItem(TOKEN_KEY) || ''; } catch (e) {}

    const $ = (id) => document.getElementById(id);
    const esc = (s) => zkAttr(s);
    const fa = (n) => toPersianDigits(String(n));

    function setToken(t) {
      S.token = t || '';
      try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch (e) {}
    }

    function stuFetch(path, body) {
      const payload = Object.assign({}, body || {}, S.token ? { token: S.token } : {});
      return fetch(state.apiUrl.replace(/\/$/, '') + path, {
        method: 'POST', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const err = new Error(data.message || 'خطا در ارتباط با سرور');
          err.status = res.status; err.httpError = true;
          if (res.status === 401 && S.token && path !== '/students/login') stuForceLogout('نشست شما تمام شده؛ دوباره وارد شوید.');
          throw err;
        }
        return data;
      }).catch((e) => {
        if (e && e.httpError) throw e;
        const err = new Error('اتصال اینترنت لازم است؛ اینترنت را بررسی کنید.');
        err.offline = true; throw err;
      });
    }

    /* ----- تنظیمات عمومی (عنوان/روشن بودن) ----- */
    function applySettings(d) {
      try {
        const tile = $('students-more-tile');
        const on = !d || d.enabled !== false;
        if (tile) {
          tile.classList.toggle('hidden', !on);
          const l = $('students-tile-label'); if (l && d && d.title) l.textContent = d.title;
        }
        const t = $('stu-title'); if (t && d && d.title) t.textContent = d.title;
        const intro = $('stu-intro');
        if (intro) { const txt = (d && d.intro) || ''; intro.textContent = txt; intro.classList.toggle('hidden', !txt); }
      } catch (e) {}
    }
    function loadSettings() { return apiSWR('/students/settings', applySettings).catch(() => {}); }

    /* ----- ورود / خروج ----- */
    function showOnly(which) {
      $('stu-login').classList.toggle('hidden', which !== 'login');
      $('stu-main').classList.toggle('hidden', which !== 'main');
    }
    function stuForceLogout(msg) {
      setToken(''); S.me = null; S.users = []; S.viewId = null;
      const e = $('stu-login-error'); if (e) e.textContent = msg || '';
      showOnly('login');
    }
    async function doLogin() {
      const un = $('stu-username').value.trim();
      const pw = $('stu-password').value;
      const err = $('stu-login-error'); err.textContent = '';
      if (!un || !pw) { err.textContent = 'نام کاربری و رمز عبور را وارد کنید.'; return; }
      const btn = $('stu-login-btn'); btn.disabled = true;
      try {
        const d = await stuFetch('/students/login', { username: un, password: pw });
        setToken(d.token); S.me = d.me; S.viewId = null;
        $('stu-password').value = '';
        await stuRefreshUsers();
        showOnly('main'); stuRender();
      } catch (e) { err.textContent = e.message || 'ورود انجام نشد.'; }
      btn.disabled = false;
    }
    async function doLogout() {
      try { await stuFetch('/students/logout', {}); } catch (e) {}
      stuForceLogout('');
      $('stu-username').value = ''; $('stu-password').value = '';
    }

    async function stuRefreshUsers() {
      if (!S.me || !S.me.can_add && S.me.children === 0) { S.users = []; return; }
      const d = await stuFetch('/students/list', {});
      S.users = d.users || [];
    }
    async function stuRefreshAll() {
      const d = await stuFetch('/students/me', {});
      S.me = d.me;
      await stuRefreshUsers();
    }

    window.stuOnTabOpen = async function () {
      loadSettings();
      if (!S.token) { showOnly('login'); return; }
      showOnly('main');
      if (S.me) stuRender(); else $('stu-main').innerHTML = '<p class="muted-text small center-block">در حال بارگذاری…</p>';
      try {
        await stuRefreshAll();
        if (S.viewId && !findUser(S.viewId)) S.viewId = null;
        stuRender();
      } catch (e) {
        if (!S.token) return;
        if (!S.me) { $('stu-main').innerHTML = '<p class="error-text center-block">' + esc(e.message) + '</p><div class="center-block"><button class="ghost-btn" id="stu-retry">تلاش دوباره</button></div>'; const r = $('stu-retry'); if (r) r.onclick = window.stuOnTabOpen; }
      }
    };

    /* ----- نمایش ----- */
    function findUser(id) {
      if (S.me && S.me.id === id) return S.me;
      return S.users.find((u) => u.id === id) || null;
    }
    function childrenOf(id) { return S.users.filter((u) => u.parent_id === id); }
    function pathTo(u) { // مافوق‌ها از رئیس تا پدر مستقیم (فقط تا جایی که کاربر واردشده می‌بیند)
      const out = []; let cur = u; let guard = 0;
      while (cur && cur.parent_id && guard++ < 12) {
        const p = findUser(cur.parent_id);
        if (!p) break;
        out.unshift(p); cur = p;
      }
      return out;
    }
    function row(label, val) {
      if (!val) return '';
      return '<div class="stu-row"><span class="stu-row-l">' + esc(label) + '</span><span class="stu-row-v">' + esc(val).replace(/\n/g, '<br>') + '</span></div>';
    }
    function chip(u) { return '<span class="stu-chip stu-chip-' + esc(u.role) + '">' + (ICON[u.role] || '') + ' ' + esc((u.role === 'parent' && u.relation_label) ? u.relation_label : (u.role_label || LABEL[u.role] || '')) + '</span>'; }
    /* ----- تاریخ شمسی ----- */
    function parseD(str) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0) : null; }
    function fmtD(dt) { return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0'); }
    function jal(str, withDay) {
      const dt = parseD(str); if (!dt) return str || '';
      const j = gregorianToJalali(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
      return (withDay ? WEEKDAYS_FA[dt.getDay()] + ' ' : '') + toPersianDigits(j[2]) + ' ' + JALALI_MONTHS[j[1] - 1] + (withDay ? ' ' + toPersianDigits(j[0]) : '');
    }
    function attBadge(st) { const a = ATT[st]; return a ? '<span class="stu-att stu-att-' + st + '">' + a[1] + ' ' + a[0] + '</span>' : ''; }

    function stuRender() {
      const box = $('stu-main');
      try { svStop(); } catch (e) {}
      if (!S.me) return;
      const isMe = (S.viewId == null) || S.viewId === S.me.id;
      const u = isMe ? S.me : (findUser(S.viewId) || S.me);
      const meView = u.id === S.me.id;
      let h = '';
      if (!meView) {
        const par = findUser(u.parent_id);
        h += '<div class="stu-topbar"><button type="button" class="ghost-btn small-btn" data-stu="up">‹ ' + esc(par ? par.full_name : 'بازگشت') + '</button></div>';
      }
      // کارت اطلاعات
      h += '<div class="stu-card">';
      h += '<div class="stu-avatar stu-av-' + esc(u.role) + '">' + esc((u.full_name || '؟').trim().charAt(0)) + '</div>';
      h += '<h3 class="stu-name">' + esc(u.full_name) + '</h3>';
      h += '<div class="stu-chips">' + chip(u) + (u.active ? '' : '<span class="stu-chip stu-chip-off">⛔ غیرفعال</span>') + '</div>';
      h += '<div class="stu-rows">';
      h += row('نام کاربری', u.username);
      h += row('تلفن', u.phone);
      if (meView) {
        const ch = (S.me.chain || []).map((c) => c.full_name + ' (' + c.role_label + ')').join(' ‹ ');
        h += row('زیر نظر', ch);
      } else {
        const p = pathTo(u).map((c) => c.full_name).join(' ‹ ');
        h += row('زیر نظر', p);
      }
      h += row('توضیحات', u.info);
      h += '</div>';
      h += '<div class="stu-actions">';
      if (meView) {
        h += '<button type="button" class="ghost-btn small-btn" data-stu="profile">✏️ ویرایش نام و تلفن</button>';
        h += '<button type="button" class="ghost-btn small-btn" data-stu="password">🔑 تغییر رمز</button>';
        h += '<button type="button" class="ghost-btn small-btn" data-stu="logout">🚪 خروج</button>';
      } else {
        h += '<button type="button" class="ghost-btn small-btn" data-stu="edit">✏️ ویرایش</button>';
        if (u.children > 0) h += '<button type="button" class="ghost-btn small-btn" disabled title="ابتدا زیرمجموعه‌ها را حذف کنید">🗑️ حذف</button>';
        else h += '<button type="button" class="danger-btn small-btn" data-stu="delete">🗑️ حذف</button>';
      }
      h += '</div></div>';

      if (meView && S.me.features && S.me.features.length) h += '<div class="section-block"><h3>امکانات شما</h3><ul class="stu-feat">' + S.me.features.map((f) => '<li>' + esc(f) + '</li>').join('') + '</ul></div>';
      if (meView) h += '<div class="section-block"><button type="button" class="secondary-btn sv-hub-btn" data-stu="sv-home">🏫 خدمات مدرسه</button><p class="muted-text small">تیکت، نمرات و وضعیت درسی، آزمون آنلاین، انضباطی، شهریه و سرویس مدرسه (بر اساس نقش شما).</p></div>';
      else if (u.role === 'student' && ['head', 'manager', 'deputy', 'dean', 'teacher'].indexOf(S.me.role) !== -1) h += '<div class="section-block"><button type="button" class="secondary-btn sv-hub-btn" data-stu="sv-ov" data-id="' + u.id + '" data-back="cancel">📊 وضعیت درسی ' + esc(u.full_name) + '</button></div>';
      const myRole = S.me.role;
      const viewerIsStaff = !!CREATE[myRole] && myRole !== 'student';
      // ولی: فرزند + اعلان‌ها
      if (meView && u.role === 'parent') {
        h += '<div class="section-block"><h3>اعلان‌ها</h3><div id="stu-notif-box"><p class="muted-text small">در حال بارگذاری…</p></div></div>';
        if (u.linked) h += '<div class="section-block"><h3>حضور و غیاب ' + esc(u.linked.full_name) + '</h3><div id="stu-att-box" data-sid="' + u.linked.id + '"></div></div>';
      }
      // دانش‌آموز: حضور و غیاب
      if (u.role === 'student') h += '<div class="section-block"><h3>حضور و غیاب</h3><div id="stu-att-box" data-sid="' + u.id + '"></div></div>';
      // ثبت حضور و غیاب (مسئولان)
      if (S.me.can_att && ATT_ROLES.indexOf(u.role) !== -1) {
        h += '<div class="section-block stu-sheet-open"><button type="button" class="secondary-btn" style="width:100%" data-stu="sheet">📋 ثبت حضور و غیاب' + (u.id === S.me.id ? '' : ' (زیر نظر ' + esc(u.full_name) + ')') + '</button><p class="muted-text small">پس از ثبت، ولی/سرپرست دانش‌آموز در اپ مطلع می‌شود.</p></div>';
      }
      // زیرمجموعه‌ها / اولیا
      const isStu = u.role === 'student';
      const canHaveKids = !!CREATE[u.role] && (!isStu || viewerIsStaff);
      if (canHaveKids) {
        const kids = childrenOf(u.id);
        h += '<div class="section-block"><h3>' + (isStu ? 'اولیا (پدر، مادر، سرپرست)' : 'زیرمجموعه‌ها') + (kids.length ? ' (' + fa(kids.length) + ')' : '') + '</h3>';
        if (!kids.length) h += '<p class="muted-text small">' + (isStu ? 'هنوز ولی یا سرپرستی تعریف نشده؛ تا تعریف نشود اعلان حضور و غیاب به کسی نمی‌رسد.' : 'هنوز کسی اضافه نشده است.') + '</p>';
        else {
          h += '<div class="stu-list">';
          kids.forEach((k) => {
            const lab = (k.role === 'parent' && k.relation_label) ? k.relation_label : (k.role_label || LABEL[k.role]);
            h += '<button type="button" class="stu-item' + (k.active ? '' : ' is-off') + '" data-stu="open" data-id="' + k.id + '">' +
              '<span class="stu-avatar stu-av-sm stu-av-' + esc(k.role) + '">' + esc((k.full_name || '؟').trim().charAt(0)) + '</span>' +
              '<span class="stu-item-main"><b>' + esc(k.full_name) + '</b><small>' + esc(lab) + (k.children && k.role !== 'student' ? ' · ' + fa(k.children) + ' زیرمجموعه' : '') + (k.role === 'student' && k.children ? ' · ' + fa(k.children) + ' ولی' : '') + '</small></span>' +
              '<span class="stu-item-go">‹</span></button>';
          });
          h += '</div>';
        }
        h += '<button type="button" class="secondary-btn stu-add-btn" data-stu="add">' + (isStu ? '➕ افزودن ولی / سرپرست' : '➕ افزودن کاربر جدید') + '</button></div>';
      }
      box.innerHTML = h;
      try { window.scrollTo(0, 0); } catch (e) {}
      loadAttBox(); if (meView && u.role === 'parent') loadNotifs();
    }

    /* ----- حضور و غیابِ یک دانش‌آموز (خلاصه + فهرست) ----- */
    async function loadAttBox() {
      const el = $('stu-att-box'); if (!el) return;
      const sid = parseInt(el.getAttribute('data-sid'), 10);
      el.innerHTML = '<p class="muted-text small">در حال بارگذاری…</p>';
      try {
        const d = await stuFetch('/students/att/history', { student_id: sid, limit: 30 });
        const cur = $('stu-att-box'); if (!cur || cur.getAttribute('data-sid') !== String(sid)) return;
        let h = '<div class="stu-att-sum">';
        Object.keys(ATT).forEach((k) => { h += '<div class="stu-att-cnt stu-att-' + k + '"><b>' + fa(d.summary[k] || 0) + '</b><small>' + ATT[k][0] + '</small></div>'; });
        h += '</div>';
        if (!d.records.length) h += '<p class="muted-text small">هنوز حضور و غیابی ثبت نشده است.</p>';
        else {
          h += '<div class="stu-att-list">';
          d.records.forEach((r) => { h += '<div class="stu-att-row"><span>' + esc(jal(r.att_date, true)) + '</span>' + attBadge(r.status) + (r.note ? '<small>' + esc(r.note) + '</small>' : '') + '</div>'; });
          h += '</div>';
        }
        cur.innerHTML = h;
      } catch (e) { const c = $('stu-att-box'); if (c) c.innerHTML = '<p class="error-text">' + esc(e.message) + '</p>'; }
    }

    /* ----- اعلان‌های ولی ----- */
    const NOTIF_IC = { exam: '📝', grade: '🧮', discipline: '⚖️', fee: '💰', bus: '🚌', notice: '📢' };
    function notifText(n) {
      if (n.kind && n.kind !== 'attendance') return (n.student && n.kind !== 'notice' ? 'فرزند شما «' + n.student + '» — ' : '') + fa(n.note || '');
      const st = ATT[n.status] ? ATT[n.status][0] : n.status_label;
      return 'فرزند شما «' + n.student + '» در ' + jal(n.date, true) + ' «' + st + '» ثبت شد.' + (n.note ? ' (' + n.note + ')' : '');
    }
    async function loadNotifs() {
      const box = $('stu-notif-box'); if (!box) return;
      try {
        const d = await stuFetch('/students/notifs', {});
        const el = $('stu-notif-box'); if (!el) return;
        let h = '<div class="stu-notif-head"><button type="button" class="ghost-btn small-btn" data-stu="refresh">🔄 تازه‌سازی</button></div>';
        if (!d.items.length) h += '<p class="muted-text small">اعلانی وجود ندارد. هر رویداد مدرسه دربارهٔ فرزندتان (حضور و غیاب، نمره، آزمون، انضباطی، شهریه، سرویس مدرسه و اعلان‌ها) اینجا خبر داده می‌شود.</p>';
        else {
          if (d.unread) h += '<p class="stu-notif-new">🔔 ' + fa(d.unread) + ' اعلان جدید</p>';
          h += '<div class="stu-notif-list">';
          d.items.forEach((n) => { h += '<div class="stu-notif stu-att-' + esc(n.status) + (n.read ? '' : ' is-new') + '">' + (NOTIF_IC[n.kind] || (ATT[n.status] ? ATT[n.status][1] : '🔔')) + '<span>' + esc(notifText(n)) + '</span></div>'; });
          h += '</div>';
        }
        el.innerHTML = h;
        if (d.unread) { stuFetch('/students/notifs/read', {}).then(() => { if (S.me) S.me.unread = 0; }).catch(() => {}); }
      } catch (e) { const c = $('stu-notif-box'); if (c) c.innerHTML = '<p class="error-text">' + esc(e.message) + '</p>'; }
    }

    /* ----- برگهٔ ثبت حضور و غیاب ----- */
    async function openSheet(scopeId, date) {
      const box = $('stu-main');
      box.innerHTML = '<p class="muted-text small center-block">در حال بارگذاری…</p>';
      try {
        const d = await stuFetch('/students/att/sheet', { scope_id: scopeId, date: date || '' });
        S.sheet = { scope: scopeId, date: d.date, today: d.today, name: d.scope_name, students: d.students, draft: {} };
        d.students.forEach((x) => { S.sheet.draft[x.id] = { status: x.status || '', note: x.note || '' }; });
        renderSheet();
      } catch (e) { box.innerHTML = '<div class="stu-topbar"><button type="button" class="ghost-btn small-btn" data-stu="cancel">‹ بازگشت</button></div><p class="error-text center-block">' + esc(e.message) + '</p>'; }
    }
    function renderSheet() {
      const sh = S.sheet; if (!sh) return;
      const box = $('stu-main');
      const atToday = sh.date >= sh.today;
      let h = '<div class="stu-topbar"><button type="button" class="ghost-btn small-btn" data-stu="cancel">‹ بازگشت</button></div><div class="stu-card stu-sheet">';
      h += '<h3>حضور و غیاب' + (sh.name ? ' — ' + esc(sh.name) : '') + '</h3>';
      h += '<div class="stu-datebar"><button type="button" class="ghost-btn small-btn" data-stu="sheet-prev">›</button><b>' + esc(jal(sh.date, true)) + '</b><button type="button" class="ghost-btn small-btn" data-stu="sheet-next"' + (atToday ? ' disabled' : '') + '>‹</button></div>';
      if (!sh.students.length) h += '<p class="muted-text small">دانش‌آموزی زیر نظر این بخش تعریف نشده است.</p>';
      else {
        h += '<div class="stu-sheet-tools"><button type="button" class="ghost-btn small-btn" data-stu="sheet-all">✅ همه حاضر</button></div><div class="stu-sheet-list">';
        sh.students.forEach((x) => {
          const dr = sh.draft[x.id] || { status: '', note: '' };
          h += '<div class="stu-sheet-row"><div class="stu-sheet-name">' + esc(x.full_name) + '</div><div class="stu-sheet-btns">';
          Object.keys(ATT).forEach((k) => { h += '<button type="button" class="stu-st stu-att-' + k + (dr.status === k ? ' on' : '') + '" data-stu="sheet-set" data-id="' + x.id + '" data-s="' + k + '" title="' + ATT[k][0] + '">' + ATT[k][1] + '<small>' + ATT[k][0] + '</small></button>'; });
          h += '</div>' + ((dr.status && dr.status !== 'present') ? '<input type="text" class="stu-note" data-id="' + x.id + '" maxlength="120" placeholder="توضیح (اختیاری)" value="' + esc(dr.note) + '">' : '') + '</div>';
        });
        h += '</div><p class="error-text" id="stu-sheet-err"></p><button type="button" class="secondary-btn" id="stu-sheet-save" style="width:100%" data-stu="sheet-save">ذخیره و اطلاع به اولیا</button>';
      }
      h += '</div>';
      box.innerHTML = h;
      box.querySelectorAll('.stu-note').forEach((inp) => inp.addEventListener('input', () => { const dr = sh.draft[inp.getAttribute('data-id')]; if (dr) dr.note = inp.value; }));
    }
    async function saveSheet() {
      const sh = S.sheet; if (!sh) return;
      const err = $('stu-sheet-err'); err.textContent = '';
      const items = sh.students.map((x) => ({ student_id: x.id, status: (sh.draft[x.id] || {}).status || '', note: (sh.draft[x.id] || {}).note || '' })).filter((i) => i.status);
      if (!items.length) { err.textContent = 'وضعیتی انتخاب نشده است.'; return; }
      const btn = $('stu-sheet-save'); btn.disabled = true;
      try {
        const d = await stuFetch('/students/att/save', { date: sh.date, items });
        const msg = d.saved ? ('حضور و غیاب ' + fa(d.saved) + ' نفر ذخیره شد' + (d.notified ? ' و برای ' + fa(d.notified) + ' ولی/سرپرست اعلان رفت.' : '؛ اما برای این دانش‌آموزان ولی/سرپرستی تعریف نشده است.')) : 'تغییری نسبت به قبل نبود.';
        try { await appAlert('stu_done', null, { text: msg, title: 'انجام شد', icon: '✅', tone: 'success' }); } catch (e) {}
      } catch (e) { err.textContent = e.message || 'ذخیره نشد.'; }
      const b2 = $('stu-sheet-save'); if (b2) b2.disabled = false;
    }

    /* ----- فرم‌ها ----- */
    function field(label, inner) { return '<label class="stu-f"><span>' + esc(label) + '</span>' + inner + '</label>'; }
    function renderForm(kind, u) {
      const box = $('stu-main');
      let h = '<div class="stu-topbar"><button type="button" class="ghost-btn small-btn" data-stu="cancel">‹ انصراف</button></div><div class="stu-card stu-form">';
      if (kind === 'add') {
        const parent = u;
        const mine = ((S.me && S.me.can_add_roles) || []).map((x) => x.role);
        const roles = (CREATE[parent.role] || []).filter((r) => mine.indexOf(r) !== -1);
        if (parent.role !== 'student') { const i = roles.indexOf('parent'); if (i !== -1) roles.splice(i, 1); }
        h += '<h3>' + (parent.role === 'student' ? 'افزودن ولی / سرپرست برای «' : 'افزودن کاربر زیر نظر «') + esc(parent.full_name) + '»</h3>';
        h += field('نقش', '<select id="stu-f-role">' + roles.map((r) => '<option value="' + r + '">' + esc(LABEL[r]) + '</option>').join('') + '</select>');
        h += '<p class="muted-text small" id="stu-f-feat"></p>';
        if (parent.role === 'student') h += field('نسبت', '<select id="stu-f-rel">' + Object.keys(REL).map((k) => '<option value="' + k + '">' + esc(REL[k]) + '</option>').join('') + '</select>');
        h += field('نام و نام خانوادگی', '<input type="text" id="stu-f-name" maxlength="80">');
        h += field('نام کاربری (انگلیسی)', '<input type="text" id="stu-f-user" dir="ltr" maxlength="32" autocapitalize="none" autocomplete="off" placeholder="مثلاً ali.rezaei">');
        h += field('رمز عبور (حداقل ۶ نویسه)', '<input type="text" id="stu-f-pass" dir="ltr" maxlength="100" autocomplete="off">');
        h += field('تلفن (اختیاری)', '<input type="tel" id="stu-f-phone" dir="ltr" maxlength="20">');
        h += field('توضیحات (اختیاری)', '<textarea id="stu-f-info" rows="3" maxlength="1000"></textarea>');
      } else if (kind === 'edit') {
        h += '<h3>ویرایش «' + esc(u.full_name) + '»</h3>';
        h += field('نام و نام خانوادگی', '<input type="text" id="stu-f-name" maxlength="80" value="' + esc(u.full_name) + '">');
        h += field('تلفن', '<input type="tel" id="stu-f-phone" dir="ltr" maxlength="20" value="' + esc(u.phone) + '">');
        if (u.role === 'parent') h += field('نسبت', '<select id="stu-f-rel">' + Object.keys(REL).map((k) => '<option value="' + k + '"' + (u.relation === k ? ' selected' : '') + '>' + esc(REL[k]) + '</option>').join('') + '</select>');
        h += field('توضیحات', '<textarea id="stu-f-info" rows="3" maxlength="1000">' + esc(u.info) + '</textarea>');
        h += field('رمز جدید (اگر نمی‌خواهید عوض شود خالی بگذارید)', '<input type="text" id="stu-f-pass" dir="ltr" maxlength="100" autocomplete="off">');
        h += '<label class="stu-f stu-f-check"><input type="checkbox" id="stu-f-active"' + (u.active ? ' checked' : '') + '> <span>حساب فعال است</span></label>';
      } else if (kind === 'profile') {
        h += '<h3>ویرایش اطلاعات من</h3>';
        h += field('نام و نام خانوادگی', '<input type="text" id="stu-f-name" maxlength="80" value="' + esc(u.full_name) + '">');
        h += field('تلفن', '<input type="tel" id="stu-f-phone" dir="ltr" maxlength="20" value="' + esc(u.phone) + '">');
      } else if (kind === 'password') {
        h += '<h3>تغییر رمز عبور</h3>';
        h += field('رمز فعلی', '<input type="password" id="stu-f-old" dir="ltr" autocomplete="current-password">');
        h += field('رمز جدید (حداقل ۶ نویسه)', '<input type="password" id="stu-f-new" dir="ltr" autocomplete="new-password">');
      }
      h += '<p class="error-text" id="stu-f-err"></p><button type="button" class="secondary-btn" id="stu-f-save" style="width:100%">ذخیره</button></div>';
      box.innerHTML = h;
      try { window.scrollTo(0, 0); } catch (e) {}
      $('stu-f-save').onclick = () => submitForm(kind, u);
      if (kind === 'add') {   // توضیح امکانات هر نقش زیر انتخاب نقش
        const sel = $('stu-f-role'), feat = $('stu-f-feat');
        const showFeat = () => {
          if (!sel || !feat) return;
          const it = ((S.me && S.me.can_add_roles) || []).find((x) => x.role === sel.value);
          feat.textContent = it && it.features && it.features.length ? 'امکانات این نقش: ' + it.features.join('، ') : '';
        };
        if (sel) { sel.addEventListener('change', showFeat); showFeat(); }
      }
    }
    async function submitForm(kind, u) {
      const err = $('stu-f-err'); err.textContent = '';
      const val = (id) => { const e = $(id); return e ? e.value : ''; };
      const btn = $('stu-f-save'); btn.disabled = true;
      try {
        if (kind === 'add') {
          await stuFetch('/students/save', { role: val('stu-f-role'), parent_id: u.id, full_name: val('stu-f-name'), username: val('stu-f-user'), password: val('stu-f-pass'), phone: val('stu-f-phone'), info: val('stu-f-info'), relation: val('stu-f-rel') });
        } else if (kind === 'edit') {
          await stuFetch('/students/save', { id: u.id, full_name: val('stu-f-name'), phone: val('stu-f-phone'), info: val('stu-f-info'), relation: val('stu-f-rel'), password: val('stu-f-pass'), active: $('stu-f-active').checked ? 1 : 0 });
        } else if (kind === 'profile') {
          await stuFetch('/students/profile', { full_name: val('stu-f-name'), phone: val('stu-f-phone') });
        } else if (kind === 'password') {
          const d = await stuFetch('/students/password', { old_password: val('stu-f-old'), new_password: val('stu-f-new') });
          if (d && d.token) setToken(d.token);
        }
        await stuRefreshAll();
        stuRender();
        if (kind === 'password') { try { await appAlert('stu_done', null, { text: 'رمز عبور شما تغییر کرد.', title: 'انجام شد', icon: '✅', tone: 'success' }); } catch (e) {} }
      } catch (e) { err.textContent = e.message || 'ذخیره نشد.'; btn.disabled = false; }
    }

    async function doDelete(u) {
      let ok = false;
      try { ok = await appConfirm('stu_delete_confirm', { name: u.full_name }, { text: 'کاربر {name} برای همیشه حذف شود؟', title: 'حذف کاربر', icon: '🗑️', tone: 'danger' }); } catch (e) { ok = false; }
      if (!ok) return;
      try {
        await stuFetch('/students/delete', { id: u.id });
        S.viewId = u.parent_id;
        await stuRefreshAll();
        stuRender();
      } catch (e) { try { await appAlert('stu_err', null, { text: e.message || 'حذف نشد.', title: 'خطا', icon: '⚠️', tone: 'warn' }); } catch (e2) {} }
    }

    /* =====================================================================
       خدمات مدرسه: تیکت، نمرات، وضعیت درسی، انضباطی، شهریه، سرویس مدرسه،
       اعلان به اولیا و آزمون آنلاین. همهٔ صفحه‌ها داخل #stu-main رسم می‌شوند و
       دکمه‌ها با data-stu="sv-..." به SVA وصل‌اند. (سرور دسترسی هر نقش را دوباره کنترل می‌کند.)
       ===================================================================== */
    const SV = { fields: [], teachers: [], students: null, qs: {}, take: null, timer: null, saveT: null, editField: 0, ovId: 0, ovBack: 'sv-home', feeBack: 'sv-home', bus: null };
    const SVA = {};
    const EXM_LET = ['الف', 'ب', 'ج', 'د', 'ه', 'و'];
    const inRoles = (arr) => !!S.me && arr.indexOf(S.me.role) !== -1;
    const isMgr = () => inRoles(['head', 'manager']);
    const gv = (id) => { const e = $(id); return e ? e.value : ''; };
    const latin = (s) => String(s == null ? '' : s)
      .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
      .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
      .replace(/٫/g, '.').replace(/[٬،,]/g, '').trim();
    const money = (n) => fa(String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '٬')) + ' تومان';
    const todayStr = () => fmtD(new Date());
    const dtFa = (s) => (s ? jal(String(s).slice(0, 10)) + ' ' + fa(String(s).slice(11, 16)) : '');
    const tsFa = (ts) => { if (!ts) return ''; const d = new Date(ts * 1000); return jal(fmtD(d)) + ' ' + fa(String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')); };
    const svBtn = (act, label, extra, cls) => '<button type="button" class="' + (cls || 'ghost-btn small-btn') + '" data-stu="' + act + '"' + (extra || '') + '>' + label + '</button>';
    const svId = (id) => ' data-id="' + id + '"';

    function svStop() {
      if (SV.timer) { clearInterval(SV.timer); SV.timer = null; }
      if (SV.saveT) { clearTimeout(SV.saveT); SV.saveT = null; }
      SV.take = null;
    }
    function svShell(title, back, inner) {
      $('stu-main').innerHTML = '<div class="stu-topbar"><button type="button" class="ghost-btn small-btn" data-stu="' + (back || 'cancel') + '">‹ بازگشت</button></div>' +
        '<div class="stu-card sv-card"><h3 class="sv-title">' + esc(title) + '</h3>' + inner + '<p class="error-text" id="sv-err"></p></div>';
      try { window.scrollTo(0, 0); } catch (e) {}
    }
    function svLoading(title, back) { svShell(title, back, '<p class="muted-text small center-block">در حال بارگذاری…</p>'); }
    function svErr(e) {
      const m = (e && e.message) || String(e || 'خطا');
      const el = $('sv-err');
      if (el) { el.textContent = m; try { el.scrollIntoView({ block: 'center' }); } catch (e2) {} }
      else { try { appAlert('stu_err', null, { text: m, title: 'خطا', icon: '⚠️', tone: 'warn' }); } catch (e3) {} }
    }
    async function svAsk(text, title) {
      try { return !!(await appConfirm('sv_confirm', {}, { text, title: title || 'تأیید', icon: '❓', tone: 'danger' })); } catch (e) { return false; }
    }
    async function svDispatch(act, t) {
      const f = SVA[act]; if (!f) return;
      const id = parseInt(t.getAttribute('data-id'), 10) || 0;
      try { await f(t, id); } catch (e) { svErr(e); }
    }
    async function svStudents(force) {
      if (!SV.students || force) { const d = await stuFetch('/school/students', {}); SV.students = d.students || []; }
      return SV.students;
    }
    function svChecks(list, cls, checked) {
      return list.map((s) => '<label class="sv-chk"><input type="checkbox" class="' + cls + '" value="' + s.id + '"' + (checked && checked(s) ? ' checked' : '') + '> ' + esc(s.name) + '</label>').join('');
    }
    function svPicked(cls) { return Array.prototype.map.call(document.querySelectorAll('#stu-main .' + cls + ':checked'), (c) => parseInt(c.value, 10)); }

    /* ---------- منوی خدمات ---------- */
    SVA['sv-home'] = async () => {
      svStop();
      const r = S.me.role, items = [];
      const add = (act, ic, label, sub, id, extra) => items.push('<button type="button" class="sv-menu-item" data-stu="' + act + '"' + (id ? svId(id) : '') + (extra || '') + '><span class="sv-mi-ic">' + ic + '</span><span class="sv-mi-main"><b>' + esc(label) + '</b><small>' + esc(sub) + '</small></span><span class="sv-badge hidden" id="sv-b-' + act + '"></span><span class="stu-item-go">‹</span></button>');
      const kid = (S.me.linked && S.me.linked.id) || 0;
      if (r === 'janitor') add('sv-tk', '🎫', 'گزارش و تیکت به مدیر', 'تعمیرات، نظافت، تجهیزات و موارد فوری');
      if (r === 'student') add('sv-ov', '📊', 'وضعیت درسی من', 'حضور و غیاب، نمرات، آزمون‌ها، انضباطی', S.me.id);
      if (r === 'parent' && kid) {
        add('sv-ov', '📊', 'وضعیت درسی ' + S.me.linked.full_name, 'حضور و غیاب، نمرات، آزمون‌ها، انضباطی', kid);
        add('sv-fee-st', '💰', 'شهریه و پرداخت‌ها', 'هزینه‌ها، پرداخت‌شده و مانده', kid);
        add('sv-bus', '🚌', 'سرویس مدرسه', 'راننده و شمارهٔ تماس');
      }
      if (inRoles(['head', 'manager', 'deputy', 'dean', 'teacher'])) add('sv-stl', '🎓', 'وضعیت درسی دانش‌آموزان', 'حضور و غیاب، نمرات، آزمون‌ها، انضباطی');
      if (inRoles(['student', 'teacher', 'head', 'manager'])) add('sv-ex', '📝', 'آزمون آنلاین', r === 'student' ? 'آزمون‌های من' : (r === 'teacher' ? 'ساخت آزمون، بانک سوال، پیشنهاد سوال' : 'بانک سوال، تأیید پیشنهادها، رشته‌ها'));
      if (inRoles(['head', 'manager', 'deputy', 'teacher'])) add('sv-gr', '🧮', 'ثبت نمره', 'ثبت نمرهٔ کل کلاس و اعلام به اولیا');
      if (inRoles(['head', 'manager', 'deputy', 'dean'])) add('sv-dc', '⚖️', 'موارد انضباطی', 'تشویق، تذکر و تخلف با اعلان به اولیا');
      if (inRoles(['head', 'manager', 'accountant'])) add('sv-fee', '💰', 'شهریه و حسابداری', 'ثبت هزینه و پرداخت، مانده حساب');
      if (inRoles(['head', 'manager', 'deputy', 'driver'])) add('sv-bus', '🚌', 'سرویس مدرسه', r === 'driver' ? 'دانش‌آموزان من و اعلان به اولیا' : 'تخصیص دانش‌آموز به راننده');
      if (inRoles(['head', 'manager', 'deputy'])) add('sv-an', '📢', 'اعلان به همهٔ اولیا', 'یک پیام عمومی از طرف مدرسه');
      if (r !== 'janitor') add('sv-tk', '🎫', 'تیکت‌ها', r === 'head' || r === 'manager' ? 'پیام به همه و پاسخ به پیام‌ها' : 'پیام به مدیر');
      svShell('🏫 خدمات مدرسه', 'cancel', '<div class="sv-menu">' + items.join('') + '</div>');
      stuFetch('/tickets/list', {}).then((d) => {
        const b = $('sv-b-sv-tk');
        if (b && d.unread) { b.textContent = fa(d.unread); b.classList.remove('hidden'); }
      }).catch(() => {});
    };

    /* ---------- تیکت ---------- */
    SVA['sv-tk'] = async () => {
      svLoading('🎫 تیکت‌ها', 'sv-home');
      const d = await stuFetch('/tickets/list', {});
      let h = svBtn('sv-tk-new', '➕ تیکت جدید', '', 'secondary-btn sv-wide');
      if (!d.items.length) h += '<p class="muted-text small">هنوز تیکتی ندارید.</p>';
      else {
        h += '<div class="stu-list sv-list">';
        d.items.forEach((t) => {
          h += '<button type="button" class="stu-item" data-stu="sv-tk-open"' + svId(t.id) + '><span class="stu-item-main"><b>' + esc(t.subject) + (t.unread ? ' 🔴' : '') + '</b><small>' + esc(t.other) + (t.other_role ? ' · ' + esc(t.other_role) : '') + (t.status === 'closed' ? ' · 🔒 بسته' : '') + '</small><small>' + esc(t.last) + '</small></span><span class="stu-item-go">‹</span></button>';
        });
        h += '</div>';
      }
      svShell('🎫 تیکت‌ها', 'sv-home', h);
    };
    SVA['sv-tk-new'] = async () => {
      svLoading('🎫 تیکت جدید', 'sv-tk');
      const d = await stuFetch('/tickets/targets', {});
      if (!d.targets.length) { svShell('🎫 تیکت جدید', 'sv-tk', '<p class="muted-text small">گیرنده‌ای برای تیکت پیدا نشد.</p>'); return; }
      const opts = d.targets.map((x) => '<option value="' + x.id + '">' + esc(x.name) + ' — ' + esc(x.label) + '</option>').join('');
      let h = field('گیرنده', '<select id="sv-t-to">' + opts + '</select>');
      h += field('موضوع', '<input type="text" id="sv-t-sub" maxlength="160">');
      if (S.me.role === 'janitor') h += '<div class="sv-btns">' + ['تعمیرات', 'نظافت', 'تجهیزات', 'حادثه / فوری'].map((s) => svBtn('sv-tk-preset', esc(s), ' data-s="' + esc(s) + '"')).join('') + '</div>';
      h += field('پیام', '<textarea id="sv-t-body" rows="5" maxlength="2000"></textarea>');
      h += svBtn('sv-tk-create', 'ارسال تیکت', '', 'secondary-btn sv-wide');
      svShell('🎫 تیکت جدید', 'sv-tk', h);
    };
    SVA['sv-tk-preset'] = async (t) => { const el = $('sv-t-sub'); if (el) el.value = t.getAttribute('data-s') || ''; };
    SVA['sv-tk-create'] = async (t) => {
      t.disabled = true;
      try {
        const d = await stuFetch('/tickets/new', { to_id: parseInt(gv('sv-t-to'), 10) || 0, subject: gv('sv-t-sub'), body: gv('sv-t-body') });
        await SVA['sv-tk-open'](null, d.id);
      } finally { t.disabled = false; }
    };
    SVA['sv-tk-open'] = async (t, id) => {
      svLoading('🎫 تیکت', 'sv-tk');
      const d = await stuFetch('/tickets/get', { id });
      let h = '<p class="muted-text small">گفتگو با ' + esc(d.other) + (d.status === 'closed' ? ' · 🔒 بسته‌شده' : '') + '</p><div class="sv-thread">';
      d.messages.forEach((m) => { h += '<div class="sv-msg' + (m.mine ? ' mine' : '') + '"><small>' + esc(m.mine ? 'شما' : m.name) + ' · ' + esc(dtFa(m.at)) + '</small><p>' + esc(m.body).replace(/\n/g, '<br>') + '</p></div>'; });
      h += '</div>' + field('پاسخ', '<textarea id="sv-t-body" rows="3" maxlength="2000"></textarea>');
      h += '<div class="stu-actions">' + svBtn('sv-tk-reply', '📨 ارسال پاسخ', svId(id), 'secondary-btn') + (d.status === 'open' ? svBtn('sv-tk-close', '🔒 بستن تیکت', svId(id)) : '') + '</div>';
      svShell('🎫 ' + d.subject, 'sv-tk', h);
    };
    SVA['sv-tk-reply'] = async (t, id) => {
      t.disabled = true;
      try { await stuFetch('/tickets/reply', { id, body: gv('sv-t-body') }); await SVA['sv-tk-open'](null, id); } finally { t.disabled = false; }
    };
    SVA['sv-tk-close'] = async (t, id) => {
      if (!(await svAsk('این تیکت بسته شود؟ با ارسال پاسخ دوباره باز می‌شود.', 'بستن تیکت'))) return;
      await stuFetch('/tickets/close', { id });
      await SVA['sv-tk']();
    };

    /* ---------- فهرست دانش‌آموزان و وضعیت درسی ---------- */
    SVA['sv-stl'] = async () => {
      svLoading('🎓 دانش‌آموزان', 'sv-home');
      const list = await svStudents(true);
      let h = '';
      if (!list.length) h = '<p class="muted-text small">دانش‌آموزی در دسترس شما نیست.</p>';
      else {
        h += '<div class="stu-list sv-list">';
        list.forEach((s) => { h += '<button type="button" class="stu-item" data-stu="sv-ov"' + svId(s.id) + ' data-back="sv-stl"><span class="stu-avatar stu-av-sm stu-av-student">' + esc((s.name || '؟').trim().charAt(0)) + '</span><span class="stu-item-main"><b>' + esc(s.name) + '</b></span><span class="stu-item-go">‹</span></button>'; });
        h += '</div>';
      }
      svShell('🎓 وضعیت درسی دانش‌آموزان', 'sv-home', h);
    };
    const DISC_IC = { praise: '🌟', warning: '⚠️', violation: '🚫' };
    async function svOverview(id, back) {
      SV.ovId = id; SV.ovBack = back || 'sv-home';
      svLoading('📊 وضعیت درسی', SV.ovBack);
      const d = await stuFetch('/school/overview', { student_id: id });
      const sm = d.att.summary;
      let h = '<p class="sv-who">' + esc(d.student.name) + '</p>';
      h += '<div class="sv-sec"><h4>حضور و غیاب (۹۰ روز اخیر)</h4><div class="sv-chips"><span class="stu-att stu-att-present">✅ حاضر ' + fa(sm.present) + '</span><span class="stu-att stu-att-absent">❌ غایب ' + fa(sm.absent) + '</span><span class="stu-att stu-att-late">⏰ تأخیر ' + fa(sm.late) + '</span><span class="stu-att stu-att-excused">📝 موجه ' + fa(sm.excused) + '</span></div>';
      if (d.att.recent.length) { h += '<div class="sv-mini">'; d.att.recent.forEach((r) => { h += '<div>' + esc(jal(r.att_date, true)) + ' ' + attBadge(r.status) + (r.note ? ' <small>' + esc(r.note) + '</small>' : '') + '</div>'; }); h += '</div>'; }
      h += '</div>';
      if (d.fees) h += '<div class="sv-sec"><h4>شهریه</h4><p>هزینه‌ها: <b>' + money(d.fees.charged) + '</b> · پرداخت‌شده: <b>' + money(d.fees.paid) + '</b> · مانده: <b class="' + (d.fees.balance > 0 ? 'sv-neg' : 'sv-pos') + '">' + money(d.fees.balance) + '</b></p>' + svBtn('sv-fee-st', 'جزئیات شهریه', svId(id) + ' data-back="sv-ov-back"') + '</div>';
      if (d.bus) h += '<div class="sv-sec"><h4>سرویس مدرسه</h4><p>راننده: <b>' + esc(d.bus.name) + '</b>' + (d.bus.phone ? ' · ' + esc(fa(d.bus.phone)) : '') + '</p></div>';
      h += '<div class="sv-sec"><h4>نمرات</h4>';
      if (!d.grades.length) h += '<p class="muted-text small">نمره‌ای ثبت نشده است.</p>';
      d.grades.forEach((g) => {
        h += '<div class="sv-subj"><div class="sv-subj-h"><b>' + esc(g.subject) + '</b><span>میانگین ' + fa(g.avg) + '٪</span></div>';
        g.items.forEach((i) => { h += '<div class="sv-grow"><span>' + esc(i.title) + ' <small>' + esc(jal(i.date)) + '</small></span><b>' + fa(i.score) + ' از ' + fa(i.max) + '</b>' + (i.can_delete ? '<button type="button" class="sv-x" data-stu="sv-gr-del"' + svId(i.id) + ' title="حذف">🗑️</button>' : '') + '</div>'; });
        h += '</div>';
      });
      h += '</div><div class="sv-sec"><h4>آزمون‌های آنلاین</h4>';
      if (!d.exams.length) h += '<p class="muted-text small">آزمونی ثبت نشده است.</p>';
      d.exams.forEach((e) => { h += '<div class="sv-grow"><span>' + esc(e.title) + ' <small>' + esc(dtFa(e.at)) + '</small></span><b>' + fa(e.score) + ' از ' + fa(e.total) + '</b></div>'; });
      h += '</div><div class="sv-sec"><h4>موارد انضباطی</h4>';
      if (!d.discipline.length) h += '<p class="muted-text small">موردی ثبت نشده است.</p>';
      d.discipline.forEach((x) => { h += '<div class="sv-grow"><span>' + (DISC_IC[x.kind] || '') + ' <b>' + esc(x.kind_label) + '</b>: ' + esc(x.body) + ' <small>' + esc(jal(x.date)) + '</small></span></div>'; });
      h += '</div>';
      svShell('📊 وضعیت درسی', SV.ovBack, h);
    }
    SVA['sv-ov'] = async (t, id) => { await svOverview(id || (S.me.linked && S.me.linked.id) || S.me.id, (t && t.getAttribute('data-back')) || 'sv-home'); };
    SVA['sv-gr-del'] = async (t, id) => {
      if (!(await svAsk('این نمره حذف شود؟', 'حذف نمره'))) return;
      await stuFetch('/grades/delete', { id });
      await svOverview(SV.ovId, SV.ovBack);
    };

    /* ---------- ثبت نمره ---------- */
    SVA['sv-gr'] = async () => {
      svLoading('🧮 ثبت نمره', 'sv-home');
      const list = await svStudents(true);
      let fl = [];
      if (S.me.role === 'teacher') { try { fl = (await stuFetch('/exams/fields', {})).fields || []; } catch (e) { fl = []; } }
      if (!list.length) { svShell('🧮 ثبت نمره', 'sv-home', '<p class="muted-text small">دانش‌آموزی برای ثبت نمره ندارید.</p>'); return; }
      let h = field('درس', '<input type="text" id="sv-g-sub" list="sv-g-dl" maxlength="90" value="' + esc(fl[0] ? fl[0].name : '') + '"><datalist id="sv-g-dl">' + fl.map((x) => '<option value="' + esc(x.name) + '">').join('') + '</datalist>');
      h += field('عنوان (میان‌ترم، کوییز، تکلیف…)', '<input type="text" id="sv-g-title" maxlength="150">');
      h += field('بیشترین نمره', '<input type="text" inputmode="decimal" id="sv-g-max" value="20">');
      h += field('تاریخ', '<input type="date" id="sv-g-date" value="' + todayStr() + '">');
      h += '<p class="muted-text small">نمرهٔ هر دانش‌آموز را بنویسید (خالی بماند = ثبت نمی‌شود). بعد از ثبت، اولیای دانش‌آموز مطلع می‌شوند.</p><div class="sv-rows">';
      list.forEach((s) => { h += '<label class="sv-row"><span>' + esc(s.name) + '</span><input type="text" inputmode="decimal" class="sv-g-sc" data-id="' + s.id + '"></label>'; });
      h += '</div>' + svBtn('sv-gr-save', 'ثبت نمره‌ها', '', 'secondary-btn sv-wide');
      svShell('🧮 ثبت نمره', 'sv-home', h);
    };
    SVA['sv-gr-save'] = async (t) => {
      const items = [];
      document.querySelectorAll('#stu-main .sv-g-sc').forEach((i) => { const v = latin(i.value); if (v !== '') items.push({ student_id: parseInt(i.getAttribute('data-id'), 10), score: v }); });
      t.disabled = true;
      try {
        const r = await stuFetch('/grades/bulk', { subject: gv('sv-g-sub'), title: gv('sv-g-title'), max: latin(gv('sv-g-max')), date: gv('sv-g-date'), items });
        svShell('🧮 ثبت نمره', 'sv-home', '<p class="sv-okmsg">✅ نمرهٔ ' + fa(r.saved) + ' دانش‌آموز ثبت شد و به اولیا اعلام شد.</p>' + svBtn('sv-gr', 'ثبت نمرهٔ دیگر', '', 'secondary-btn sv-wide'));
      } finally { t.disabled = false; }
    };

    /* ---------- موارد انضباطی ---------- */
    SVA['sv-dc'] = async () => {
      svLoading('⚖️ موارد انضباطی', 'sv-home');
      const [list, ld] = await Promise.all([svStudents(true), stuFetch('/disc/list', {})]);
      let h = '';
      if (!list.length) h += '<p class="muted-text small">دانش‌آموزی در دسترس شما نیست.</p>';
      else {
        h += field('دانش‌آموز', '<select id="sv-d-st">' + list.map((s) => '<option value="' + s.id + '">' + esc(s.name) + '</option>').join('') + '</select>');
        h += field('نوع', '<select id="sv-d-kind"><option value="praise">🌟 تشویق</option><option value="warning" selected>⚠️ تذکر</option><option value="violation">🚫 مورد انضباطی</option></select>');
        h += field('توضیح', '<textarea id="sv-d-body" rows="3" maxlength="480"></textarea>');
        h += field('تاریخ', '<input type="date" id="sv-d-date" value="' + todayStr() + '">');
        h += svBtn('sv-dc-save', 'ثبت و اطلاع به اولیا', '', 'secondary-btn sv-wide');
      }
      h += '<h4>آخرین موارد ثبت‌شده</h4>';
      if (!ld.items.length) h += '<p class="muted-text small">موردی ثبت نشده است.</p>';
      ld.items.forEach((x) => { h += '<div class="sv-item"><b>' + (DISC_IC[x.kind] || '') + ' ' + esc(x.student) + ' — ' + esc(x.kind_label) + '</b><small>' + esc(x.body) + '</small><small>' + esc(jal(x.date)) + (x.by ? ' · ' + esc(x.by) : '') + '</small>' + (x.can_delete ? '<div class="stu-actions">' + svBtn('sv-dc-del', '🗑️ حذف', svId(x.id), 'danger-btn small-btn') + '</div>' : '') + '</div>'; });
      svShell('⚖️ موارد انضباطی', 'sv-home', h);
    };
    SVA['sv-dc-save'] = async (t) => {
      t.disabled = true;
      try {
        await stuFetch('/disc/save', { student_id: parseInt(gv('sv-d-st'), 10) || 0, kind: gv('sv-d-kind'), body: gv('sv-d-body'), date: gv('sv-d-date') });
        await SVA['sv-dc']();
      } finally { t.disabled = false; }
    };
    SVA['sv-dc-del'] = async (t, id) => {
      if (!(await svAsk('این مورد حذف شود؟', 'حذف'))) return;
      await stuFetch('/disc/delete', { id });
      await SVA['sv-dc']();
    };

    /* ---------- شهریه ---------- */
    SVA['sv-fee'] = async () => {
      svLoading('💰 شهریه و حسابداری', 'sv-home');
      const d = await stuFetch('/fees/summary', {});
      let h = '<div class="sv-sum"><span>کل هزینه‌ها<b>' + money(d.charged) + '</b></span><span>دریافتی<b>' + money(d.paid) + '</b></span><span>مانده<b class="sv-neg">' + money(d.charged - d.paid) + '</b></span></div>';
      h += svBtn('sv-fee-new', '➕ ثبت هزینه برای دانش‌آموزان', '', 'secondary-btn sv-wide');
      if (!d.students.length) h += '<p class="muted-text small">دانش‌آموزی در دسترس نیست.</p>';
      else {
        h += '<div class="stu-list sv-list">';
        d.students.forEach((s) => { h += '<button type="button" class="stu-item" data-stu="sv-fee-st"' + svId(s.id) + ' data-back="sv-fee"><span class="stu-item-main"><b>' + esc(s.name) + '</b><small>هزینه ' + money(s.charged) + ' · پرداخت ' + money(s.paid) + '</small></span><span class="sv-bal ' + (s.balance > 0 ? 'sv-neg' : 'sv-pos') + '">' + (s.balance > 0 ? money(s.balance) : (s.charged ? '✅ تسویه' : '—')) + '</span><span class="stu-item-go">‹</span></button>'; });
        h += '</div>';
      }
      svShell('💰 شهریه و حسابداری', 'sv-home', h);
    };
    async function svFeeStudent(sid, back) {
      SV.feeBack = back || 'sv-home';
      svLoading('💰 شهریه', SV.feeBack === 'sv-ov-back' ? 'sv-ov-back' : SV.feeBack);
      const d = await stuFetch('/fees/student', { student_id: sid });
      let h = '<p class="sv-who">' + esc(d.student.name) + '</p>';
      if (!d.fees.length) h += '<p class="muted-text small">هزینه‌ای ثبت نشده است.</p>';
      d.fees.forEach((f) => {
        const left = f.amount - f.paid;
        h += '<div class="sv-item"><b>' + esc(f.title) + '</b><small>مبلغ ' + money(f.amount) + ' · پرداخت‌شده ' + money(f.paid) + ' · مانده <span class="' + (left > 0 ? 'sv-neg' : 'sv-pos') + '">' + (left > 0 ? money(left) : 'تسویه') + '</span></small>' + (f.due ? '<small>سررسید: ' + esc(jal(f.due)) + '</small>' : '') + (f.note ? '<small>' + esc(f.note) + '</small>' : '');
        f.pays.forEach((p) => { h += '<small class="sv-pay">• ' + money(p.amount) + ' — ' + esc(jal(p.date)) + (p.note ? ' (' + esc(p.note) + ')' : '') + '</small>'; });
        if (d.can_edit) {
          if (left > 0) h += '<div class="sv-payrow"><input type="text" inputmode="numeric" id="sv-p-' + f.id + '" placeholder="مبلغ پرداخت (تومان)">' + svBtn('sv-fee-pay', 'ثبت پرداخت', svId(f.id) + ' data-sid="' + sid + '"', 'secondary-btn small-btn') + '</div>';
          h += '<div class="stu-actions">' + svBtn('sv-fee-del', '🗑️ حذف هزینه', svId(f.id) + ' data-sid="' + sid + '"', 'danger-btn small-btn') + '</div>';
        }
        h += '</div>';
      });
      svShell('💰 شهریه', SV.feeBack, h);
    }
    SVA['sv-fee-st'] = async (t, id) => {
      const back = (t && t.getAttribute('data-back')) || 'sv-home';
      await svFeeStudent(id, back);
    };
    SVA['sv-ov-back'] = async () => { await svOverview(SV.ovId, SV.ovBack); };
    SVA['sv-fee-pay'] = async (t, id) => {
      const sid = parseInt(t.getAttribute('data-sid'), 10) || 0;
      t.disabled = true;
      try { await stuFetch('/fees/pay', { fee_id: id, amount: parseInt(latin(gv('sv-p-' + id)), 10) || 0, date: todayStr() }); await svFeeStudent(sid, SV.feeBack); } finally { t.disabled = false; }
    };
    SVA['sv-fee-del'] = async (t, id) => {
      if (!(await svAsk('این هزینه با همهٔ پرداخت‌هایش حذف شود؟', 'حذف هزینه'))) return;
      await stuFetch('/fees/delete', { fee_id: id });
      await svFeeStudent(parseInt(t.getAttribute('data-sid'), 10) || 0, SV.feeBack);
    };
    SVA['sv-fee-new'] = async () => {
      svLoading('➕ ثبت هزینه', 'sv-fee');
      const list = await svStudents(true);
      let h = field('عنوان هزینه (مثلاً شهریه مهر)', '<input type="text" id="sv-f-title" maxlength="150">');
      h += field('مبلغ (تومان)', '<input type="text" inputmode="numeric" id="sv-f-amount">');
      h += field('سررسید (اختیاری)', '<input type="date" id="sv-f-due">');
      h += field('توضیح (اختیاری)', '<input type="text" id="sv-f-note" maxlength="250">');
      h += '<h4>دانش‌آموزان</h4><label class="sv-chk"><input type="checkbox" data-all=".sv-f-st"> انتخاب همه</label><div class="sv-rows">' + svChecks(list, 'sv-f-st') + '</div>';
      h += svBtn('sv-fee-charge', 'ثبت هزینه و اطلاع به اولیا', '', 'secondary-btn sv-wide');
      svShell('➕ ثبت هزینه', 'sv-fee', h);
    };
    SVA['sv-fee-charge'] = async (t) => {
      t.disabled = true;
      try {
        const r = await stuFetch('/fees/charge', { title: gv('sv-f-title'), amount: parseInt(latin(gv('sv-f-amount')), 10) || 0, due_date: gv('sv-f-due'), note: gv('sv-f-note'), student_ids: svPicked('sv-f-st') });
        svShell('➕ ثبت هزینه', 'sv-fee', '<p class="sv-okmsg">✅ هزینه برای ' + fa(r.saved) + ' دانش‌آموز ثبت شد و به اولیا اعلام شد.</p>' + svBtn('sv-fee', 'بازگشت به فهرست', '', 'secondary-btn sv-wide'));
      } finally { t.disabled = false; }
    };

    /* ---------- سرویس مدرسه ---------- */
    SVA['sv-bus'] = async () => {
      svLoading('🚌 سرویس مدرسه', 'sv-home');
      const d = await stuFetch('/bus/overview', {});
      SV.bus = d;
      let h = '';
      if (d.mode === 'driver') {
        if (!d.students.length) h = '<p class="muted-text small">هنوز دانش‌آموزی به سرویس شما اختصاص داده نشده است.</p>';
        else {
          h += '<p class="muted-text small">دانش‌آموزان را انتخاب و نوع اعلان را بزنید؛ اولیای آن‌ها فوراً مطلع می‌شوند.</p><label class="sv-chk"><input type="checkbox" data-all=".sv-bs"> انتخاب همه</label><div class="sv-rows">';
          d.students.forEach((s) => { h += '<label class="sv-chk"><input type="checkbox" class="sv-bs" value="' + s.id + '"> ' + esc(s.name) + (s.parent ? ' <small>— ' + esc(s.parent) + (s.phone ? ' · ' + esc(fa(s.phone)) : '') + '</small>' : '') + '</label>'; });
          h += '</div><div class="sv-btns">' + svBtn('sv-bus-n', '✅ سوار شد', ' data-k="board"') + svBtn('sv-bus-n', '🏠 پیاده شد', ' data-k="drop"') + svBtn('sv-bus-n', '🚌 سرویس حرکت کرد', ' data-k="leave"') + svBtn('sv-bus-n', '⏰ تأخیر دارم', ' data-k="late"') + '</div>';
          h += field('پیام دلخواه (اختیاری)', '<input type="text" id="sv-bn-text" maxlength="120">') + svBtn('sv-bus-n', '📨 ارسال پیام دلخواه', ' data-k="custom"', 'secondary-btn sv-wide') + '<p class="sv-okmsg" id="sv-ok"></p>';
        }
      } else if (d.mode === 'manage') {
        h += '<p class="muted-text small">راننده را انتخاب کنید و دانش‌آموزان سرویس او را مشخص کنید.</p>';
        if (!d.drivers.length) h += '<p class="muted-text small">هنوز راننده‌ای تعریف نشده است (از صفحهٔ کاربران، نقش «راننده» بسازید).</p>';
        d.drivers.forEach((x) => { h += '<button type="button" class="stu-item" data-stu="sv-bus-drv"' + svId(x.id) + '><span class="stu-avatar stu-av-sm stu-av-driver">🚌</span><span class="stu-item-main"><b>' + esc(x.name) + '</b><small>' + fa(x.students.length) + ' دانش‌آموز' + (x.phone ? ' · ' + esc(fa(x.phone)) : '') + '</small></span><span class="stu-item-go">‹</span></button>'; });
      } else {
        h = d.driver ? '<p>راننده سرویس: <b>' + esc(d.driver.name) + '</b>' + (d.driver.phone ? '<br>تلفن: ' + esc(fa(d.driver.phone)) : '') + '</p><p class="muted-text small">وقتی راننده سوار/پیاده شدن یا تأخیر را اعلام کند، همین‌جا و در اعلان‌ها خبر می‌دهیم.</p>' : '<p class="muted-text small">برای این دانش‌آموز هنوز سرویسی ثبت نشده است.</p>';
      }
      svShell('🚌 سرویس مدرسه', 'sv-home', h);
    };
    SVA['sv-bus-n'] = async (t) => {
      const k = t.getAttribute('data-k');
      const r = await stuFetch('/bus/notify', { student_ids: svPicked('sv-bs'), kind: k, text: gv('sv-bn-text') });
      const ok = $('sv-ok'); if (ok) ok.textContent = '✅ برای ' + fa(r.students) + ' دانش‌آموز اعلام شد.';
      const e = $('sv-err'); if (e) e.textContent = '';
    };
    SVA['sv-bus-drv'] = async (t, id) => {
      const d = SV.bus; if (!d || d.mode !== 'manage') return;
      const drv = d.drivers.filter((x) => x.id === id)[0]; if (!drv) return;
      let h = '<p class="sv-who">' + esc(drv.name) + '</p><label class="sv-chk"><input type="checkbox" data-all=".sv-ba"> انتخاب همه</label><div class="sv-rows">';
      d.students.forEach((s) => { h += '<label class="sv-chk"><input type="checkbox" class="sv-ba" value="' + s.id + '"' + (s.driver_id === id ? ' checked' : '') + '> ' + esc(s.name) + (s.driver_id && s.driver_id !== id ? ' <small>(راننده دیگر)</small>' : '') + '</label>'; });
      h += '</div>' + svBtn('sv-bus-assign', 'ذخیرهٔ دانش‌آموزان این راننده', svId(id), 'secondary-btn sv-wide');
      svShell('🚌 ' + drv.name, 'sv-bus', h);
    };
    SVA['sv-bus-assign'] = async (t, id) => {
      t.disabled = true;
      try { await stuFetch('/bus/assign', { driver_id: id, student_ids: svPicked('sv-ba') }); await SVA['sv-bus'](); } finally { t.disabled = false; }
    };

    /* ---------- اعلان عمومی ---------- */
    SVA['sv-an'] = async () => {
      svShell('📢 اعلان به اولیا', 'sv-home', field('متن اعلان', '<textarea id="sv-an-text" rows="4" maxlength="220"></textarea>') + '<p class="muted-text small">این پیام برای اولیای همهٔ دانش‌آموزان فعالِ شما ارسال می‌شود.</p>' + svBtn('sv-an-send', '📢 ارسال اعلان', '', 'secondary-btn sv-wide'));
    };
    SVA['sv-an-send'] = async (t) => {
      const text = gv('sv-an-text').trim();
      if (!text) { svErr(new Error('متن اعلان را بنویسید.')); return; }
      if (!(await svAsk('این اعلان برای همهٔ اولیا ارسال شود؟', 'ارسال اعلان'))) return;
      t.disabled = true;
      try {
        const r = await stuFetch('/school/announce', { text });
        svShell('📢 اعلان به اولیا', 'sv-home', '<p class="sv-okmsg">✅ اعلان برای ' + fa(r.sent) + ' نفر ارسال شد.</p>');
      } finally { t.disabled = false; }
    };

    /* ---------- آزمون آنلاین ---------- */
    const Q_STATUS = { approved: 'تأییدشده', pending: 'در انتظار تأیید', rejected: 'ردشده' };
    const exWindow = (e) => (e.open_from_ts || e.open_until_ts) ? '<small>بازهٔ آزمون: ' + (e.open_from_ts ? 'از ' + esc(tsFa(e.open_from_ts)) + ' ' : '') + (e.open_until_ts ? 'تا ' + esc(tsFa(e.open_until_ts)) : '') + '</small>' : '';

    SVA['sv-ex'] = async () => {
      svStop();
      if (S.me.role === 'student') { await svExStudent(); return; }
      let b = '';
      if (S.me.role === 'teacher') b = svBtn('sv-ex-new', '➕ ساخت آزمون') + svBtn('sv-ex-bank', '📚 بانک سوال') + svBtn('sv-ex-qnew', '💡 پیشنهاد سوال');
      else b = svBtn('sv-ex-bank', '📚 بانک سوال') + svBtn('sv-ex-pend', '🕓 پیشنهادهای معلمان') + svBtn('sv-ex-flds', '🗂️ رشته‌ها و معلم‌ها') + svBtn('sv-ex-qnew', '➕ سوال جدید');
      svShell('📝 آزمون آنلاین', 'sv-home', '<div class="sv-btns">' + b + '</div><h4>آزمون‌ها</h4><div id="sv-body"><p class="muted-text small">در حال بارگذاری…</p></div>');
      const d = await stuFetch('/exams/ex/list', {});
      const box = $('sv-body'); if (!box) return;
      if (!d.items.length) { box.innerHTML = '<p class="muted-text small">هنوز آزمونی ساخته نشده است.</p>'; return; }
      let h = '';
      d.items.forEach((e) => {
        h += '<div class="sv-item"><b>' + esc(e.title) + '</b><small>' + esc(e.field) + (e.teacher && !e.mine ? ' · ' + esc(e.teacher) : '') + ' · ' + fa(e.qcount) + ' سوال · ' + fa(e.duration_min) + ' دقیقه</small><small>شرکت‌کرده: ' + fa(e.done) + ' از ' + fa(e.assigned) + (e.avg !== null && e.avg !== undefined ? ' · میانگین ' + fa(e.avg) + '٪' : '') + (e.status === 'closed' ? ' · 🔒 بسته' : '') + '</small>' + exWindow(e) +
          '<div class="stu-actions">' + svBtn('sv-ex-res', '📋 نتایج', svId(e.id)) + (e.status === 'open' ? svBtn('sv-ex-close', '🔒 بستن', svId(e.id)) : '') + svBtn('sv-ex-del', '🗑️ حذف', svId(e.id), 'danger-btn small-btn') + '</div></div>';
      });
      box.innerHTML = h;
    };
    async function svExStudent() {
      svLoading('📝 آزمون‌های من', 'sv-home');
      const d = await stuFetch('/exams/ex/list', {});
      let h = '';
      if (!d.items.length) h = '<p class="muted-text small">آزمونی برای شما تعریف نشده است.</p>';
      d.items.forEach((e) => {
        let a = '';
        if (e.state === 'available') a = svBtn('sv-ex-start', '▶️ شروع آزمون', svId(e.id), 'secondary-btn small-btn');
        else if (e.state === 'running') a = svBtn('sv-ex-start', '⏱️ ادامهٔ آزمون', svId(e.id), 'secondary-btn small-btn');
        else if (e.state === 'done') a = '<b>نمره: ' + fa(e.score) + ' از ' + fa(e.total) + '</b> ' + svBtn('sv-ex-me', '📊 مشاهده', svId(e.id));
        else if (e.state === 'upcoming') a = '<small>هنوز شروع نشده' + (e.open_from_ts ? ' — از ' + esc(tsFa(e.open_from_ts)) : '') + '</small>';
        else if (e.state === 'ended') a = '<small>زمان شرکت گذشته است.</small>';
        else a = '<small>این آزمون بسته شده است.</small>';
        h += '<div class="sv-item"><b>' + esc(e.title) + '</b><small>' + esc(e.field) + ' · ' + fa(e.qcount) + ' سوال · ' + fa(e.duration_min) + ' دقیقه</small>' + exWindow(e) + '<div class="stu-actions">' + a + '</div></div>';
      });
      svShell('📝 آزمون‌های من', 'sv-home', h);
    }
    SVA['sv-ex-start'] = async (t, id) => {
      if (!(await svAsk('آزمون شروع شود؟ بعد از شروع، زمان متوقف نمی‌شود و فقط یک بار می‌توانید شرکت کنید.', 'شروع آزمون'))) return;
      t.disabled = true;
      try {
        const d = await stuFetch('/exams/take/start', { exam_id: id });
        if (d.done) svExResult(d.result); else svTake(id, d);
      } finally { t.disabled = false; }
    };
    function svTake(id, d) {
      svStop();
      SV.take = { id, ans: d.answers || {}, end: Date.now() + d.remaining * 1000, sent: false, retryAt: 0 };
      let h = '<div class="exm-timer"><span>⏱️ زمان باقی‌مانده</span><b id="exm-left">--:--</b></div><p class="muted-text small">پاسخ‌ها خودکار ذخیره می‌شوند و با پایان زمان، آزمون خودکار ثبت می‌شود.</p>';
      d.questions.forEach((q, i) => {
        h += '<div class="exm-q"><p class="exm-qt"><b>' + fa(i + 1) + '.</b> ' + esc(q.t) + '</p>';
        q.o.forEach((o, j) => { h += '<label class="exm-opt"><input type="radio" name="exq' + q.id + '" data-q="' + q.id + '" value="' + j + '"' + (SV.take.ans[q.id] === j ? ' checked' : '') + '><span>' + EXM_LET[j] + ') ' + esc(o) + '</span></label>'; });
        h += '</div>';
      });
      h += svBtn('sv-ex-submit', '✅ ثبت نهایی پاسخ‌ها', svId(id), 'secondary-btn sv-wide');
      svShell('📝 ' + d.title, 'sv-ex', h);
      SV.timer = setInterval(() => {
        const el = $('exm-left');
        if (!el || !SV.take) { svStop(); return; }
        const left = Math.max(0, Math.ceil((SV.take.end - Date.now()) / 1000));
        el.textContent = fa(String(Math.floor(left / 60)).padStart(2, '0') + ':' + String(left % 60).padStart(2, '0'));
        if (el.parentNode) el.parentNode.classList.toggle('is-low', left <= 60);
        if (left <= 0 && !SV.take.sent && Date.now() >= SV.take.retryAt) { SV.take.sent = true; svExSubmit(SV.take.id, true); }
      }, 1000);
    }
    async function svExSubmit(id, auto) {
      const tk = SV.take;
      const ans = tk ? tk.ans : {};
      if (!auto && !(await svAsk('پاسخ‌ها ثبت نهایی شود؟ بعد از ثبت نمی‌توانید تغییر دهید.', 'ثبت نهایی'))) return;
      try {
        const d = await stuFetch('/exams/take/submit', { exam_id: id, answers: ans });
        svStop();
        svExResult(d.result);
      } catch (e) {
        if (SV.take) { SV.take.sent = false; SV.take.retryAt = Date.now() + 5000; }
        svErr(e);
      }
    }
    SVA['sv-ex-submit'] = async (t, id) => { await svExSubmit(id, false); };
    function svExResult(r) {
      let h = '<div class="exm-score"><b>' + fa(r.score) + '</b><span>از ' + fa(r.total) + '</span><small>' + fa(r.percent) + '٪</small></div>';
      if (r.review) {
        r.review.forEach((q, i) => {
          h += '<div class="exm-q"><p class="exm-qt"><b>' + fa(i + 1) + '.</b> ' + esc(q.t) + '</p>';
          q.o.forEach((o, j) => { h += '<div class="exm-rv' + (j === q.c ? ' ok' : (j === q.a ? ' bad' : '')) + '">' + EXM_LET[j] + ') ' + esc(o) + (j === q.c ? ' ✅' : '') + (j === q.a && j !== q.c ? ' ❌ پاسخ شما' : '') + '</div>'; });
          if (q.a < 0) h += '<small class="muted-text">بدون پاسخ</small>';
          h += '</div>';
        });
      }
      svShell('📝 ' + r.title, 'sv-ex', h);
    }
    SVA['sv-ex-me'] = async (t, id) => { const d = await stuFetch('/exams/take/result', { exam_id: id }); svExResult(d.result); };
    SVA['sv-ex-res'] = async (t, id) => {
      svLoading('📋 نتایج آزمون', 'sv-ex');
      const d = await stuFetch('/exams/ex/results', { exam_id: id });
      const st = { notstarted: 'شرکت نکرده', running: 'در حال آزمون', done: '' };
      let h = '<p class="muted-text small">' + fa(d.qcount) + ' سوال' + (d.avg !== null ? ' · میانگین کلاس ' + fa(d.avg) + '٪' : '') + '</p>';
      d.rows.forEach((r) => { h += '<div class="sv-grow"><span>' + esc(r.name) + '</span><b>' + (r.state === 'done' ? fa(r.score) + ' از ' + fa(r.total) + ' (' + fa(r.percent) + '٪)' : st[r.state]) + '</b></div>'; });
      svShell('📋 ' + d.title, 'sv-ex', h);
    };
    SVA['sv-ex-close'] = async (t, id) => {
      if (!(await svAsk('آزمون بسته شود؟ دانش‌آموزانی که شروع نکرده‌اند دیگر نمی‌توانند شرکت کنند.', 'بستن آزمون'))) return;
      await stuFetch('/exams/ex/close', { exam_id: id }); await SVA['sv-ex']();
    };
    SVA['sv-ex-del'] = async (t, id) => {
      if (!(await svAsk('آزمون با همهٔ نتایجش حذف شود؟', 'حذف آزمون'))) return;
      await stuFetch('/exams/ex/delete', { exam_id: id }); await SVA['sv-ex']();
    };

    /* --- بانک سوال --- */
    async function svBankRender(fid, status) {
      const d = await stuFetch('/exams/q/list', { field_id: fid || 0, status: status || '' });
      SV.qs = {}; d.questions.forEach((q) => { SV.qs[q.id] = q; });
      let h = '<div class="sv-filter"><select id="sv-qf"><option value="0">همهٔ رشته‌ها</option>' + SV.fields.map((f) => '<option value="' + f.id + '"' + (f.id === fid ? ' selected' : '') + '>' + esc(f.name) + '</option>').join('') + '</select>';
      if (isMgr()) h += '<select id="sv-qs"><option value="">همهٔ وضعیت‌ها</option>' + Object.keys(Q_STATUS).map((k) => '<option value="' + k + '"' + (k === status ? ' selected' : '') + '>' + Q_STATUS[k] + '</option>').join('') + '</select>';
      h += '</div>' + svBtn('sv-ex-qnew', isMgr() ? '➕ سوال جدید' : '💡 پیشنهاد سوال', '', 'secondary-btn sv-wide');
      if (!d.questions.length) h += '<p class="muted-text small">سوالی پیدا نشد.</p>';
      d.questions.forEach((q) => { h += svQCard(q); });
      svShell('📚 بانک سوال', 'sv-ex', h);
    }
    function svQCard(q, pend) {
      const own = q.author_id === S.me.id;
      const canEdit = isMgr() || (own && q.status !== 'approved');
      let h = '<div class="sv-item sv-q st-' + q.status + '"><div class="sv-q-top"><span class="stu-chip">' + esc(Q_STATUS[q.status] || q.status) + '</span><small>' + esc(q.field) + ' · ' + esc(q.author) + '</small></div><p class="exm-qt">' + esc(q.text) + '</p>';
      q.options.forEach((o, j) => { h += '<div class="exm-rv' + (j === q.correct ? ' ok' : '') + '">' + EXM_LET[j] + ') ' + esc(o) + (j === q.correct ? ' ✅' : '') + '</div>'; });
      if (q.status === 'rejected' && q.note) h += '<small class="error-text">دلیل رد: ' + esc(q.note) + '</small>';
      if (pend) h += '<input type="text" class="sv-rn" id="sv-rn-' + q.id + '" maxlength="250" placeholder="دلیل رد (اختیاری)"><div class="stu-actions">' + svBtn('sv-ex-qok', '✅ تأیید', svId(q.id), 'secondary-btn small-btn') + svBtn('sv-ex-qno', '❌ رد', svId(q.id), 'danger-btn small-btn') + '</div>';
      if (canEdit) h += '<div class="stu-actions">' + svBtn('sv-ex-qedit', '✏️ ویرایش', svId(q.id)) + svBtn('sv-ex-qdel', '🗑️ حذف', svId(q.id), 'danger-btn small-btn') + '</div>';
      return h + '</div>';
    }
    async function svLoadFields() { const d = await stuFetch('/exams/fields', {}); SV.fields = d.fields || []; SV.teachers = d.teachers || []; return d; }
    SVA['sv-ex-bank'] = async () => { svLoading('📚 بانک سوال', 'sv-ex'); await svLoadFields(); await svBankRender(0, ''); };
    SVA['sv-ex-pend'] = async () => {
      svLoading('🕓 پیشنهادهای معلمان', 'sv-ex');
      await svLoadFields();
      const d = await stuFetch('/exams/q/list', { status: 'pending' });
      SV.qs = {}; d.questions.forEach((q) => { SV.qs[q.id] = q; });
      let h = d.questions.length ? '' : '<p class="muted-text small">پیشنهاد تأییدنشده‌ای وجود ندارد.</p>';
      d.questions.forEach((q) => { h += svQCard(q, true); });
      svShell('🕓 پیشنهادهای معلمان', 'sv-ex', h);
    };
    SVA['sv-ex-qok'] = async (t, id) => { await stuFetch('/exams/q/decide', { id, approve: true }); await SVA['sv-ex-pend'](); };
    SVA['sv-ex-qno'] = async (t, id) => { await stuFetch('/exams/q/decide', { id, approve: false, note: gv('sv-rn-' + id) }); await SVA['sv-ex-pend'](); };
    SVA['sv-ex-qdel'] = async (t, id) => {
      if (!(await svAsk('این سوال حذف شود؟ (آزمون‌هایی که قبلاً ساخته شده‌اند تغییر نمی‌کنند.)', 'حذف سوال'))) return;
      await stuFetch('/exams/q/delete', { id }); await svBankRender(0, '');
    };
    async function svQForm(q) {
      if (!SV.fields.length) await svLoadFields();
      if (!SV.fields.length) { svShell('💡 سوال', 'sv-ex', '<p class="muted-text small">' + (isMgr() ? 'ابتدا از «رشته‌ها و معلم‌ها» یک رشته بسازید.' : 'مدیر هنوز رشته‌ای به شما اختصاص نداده است.') + '</p>'); return; }
      const o = (q && q.options) || [];
      let h = field('رشته', '<select id="sv-q-field">' + SV.fields.map((f) => '<option value="' + f.id + '"' + (q && q.field_id === f.id ? ' selected' : '') + '>' + esc(f.name) + '</option>').join('') + '</select>');
      h += field('متن سوال', '<textarea id="sv-q-text" rows="3" maxlength="1000">' + esc(q ? q.text : '') + '</textarea>');
      h += '<p class="muted-text small">حداقل دو گزینه را پر کنید (تا شش گزینه).</p>';
      for (let i = 0; i < 6; i++) h += field('گزینهٔ ' + EXM_LET[i], '<input type="text" class="sv-o" maxlength="300" value="' + esc(o[i] || '') + '">');
      h += field('گزینهٔ درست', '<select id="sv-q-c">' + EXM_LET.map((l, i) => '<option value="' + i + '"' + (q && q.correct === i ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>');
      h += svBtn('sv-ex-qsave', isMgr() ? 'ذخیرهٔ سوال' : 'ارسال برای تأیید مدیر', q ? svId(q.id) : '', 'secondary-btn sv-wide');
      svShell(q ? '✏️ ویرایش سوال' : (isMgr() ? '➕ سوال جدید' : '💡 پیشنهاد سوال'), 'sv-ex-bank', h);
    }
    SVA['sv-ex-qnew'] = async () => { await svQForm(null); };
    SVA['sv-ex-qedit'] = async (t, id) => { await svQForm(SV.qs[id] || null); };
    SVA['sv-ex-qsave'] = async (t, id) => {
      const vals = Array.prototype.map.call(document.querySelectorAll('#stu-main .sv-o'), (i) => i.value.trim());
      const c = parseInt(gv('sv-q-c'), 10) || 0;
      const opts = []; let nc = -1;
      vals.forEach((v, i) => { if (v) { if (i === c) nc = opts.length; opts.push(v); } });
      if (nc < 0) { svErr(new Error('گزینهٔ درست نباید خالی باشد.')); return; }
      t.disabled = true;
      try {
        const r = await stuFetch('/exams/q/save', { id: id || 0, field_id: parseInt(gv('sv-q-field'), 10) || 0, text: gv('sv-q-text'), options: opts, correct: nc });
        svShell('📚 سوال', 'sv-ex-bank', '<p class="sv-okmsg">' + (r.pending ? '✅ سوال برای تأیید مدیر ارسال شد. بعد از تأیید در بانک سوال قرار می‌گیرد.' : '✅ سوال ذخیره شد.') + '</p>' + svBtn('sv-ex-bank', 'رفتن به بانک سوال', '', 'secondary-btn sv-wide'));
      } finally { t.disabled = false; }
    };

    /* --- رشته‌ها و معلم‌ها (مدیر) --- */
    function svFieldsRender() {
      let h = '<div class="sv-filter"><input type="text" id="sv-fname" maxlength="80" placeholder="نام رشته، مثلاً ریاضی" value="' + esc(SV.editField ? ((SV.fields.filter((f) => f.id === SV.editField)[0] || {}).name || '') : '') + '">' + svBtn('sv-ex-fsave', SV.editField ? 'ذخیرهٔ نام' : '➕ افزودن', '', 'secondary-btn small-btn') + '</div>';
      if (!SV.fields.length) h += '<p class="muted-text small">هنوز رشته‌ای تعریف نشده است.</p>';
      SV.fields.forEach((f) => {
        h += '<div class="sv-item"><b>' + esc(f.name) + '</b><small>معلم‌ها: ' + (f.teachers && f.teachers.length ? esc(f.teachers.map((x) => x.name).join('، ')) : 'هیچ‌کدام') + '</small><small>' + fa(f.q_count || 0) + ' سوال تأییدشده</small><div class="stu-actions">' + svBtn('sv-ex-ftch', '👥 معلم‌ها', svId(f.id)) + svBtn('sv-ex-fedit', '✏️ تغییر نام', svId(f.id)) + svBtn('sv-ex-fdel', '🗑️ حذف', svId(f.id), 'danger-btn small-btn') + '</div></div>';
      });
      svShell('🗂️ رشته‌ها و معلم‌ها', 'sv-ex', h);
    }
    SVA['sv-ex-flds'] = async () => { svLoading('🗂️ رشته‌ها و معلم‌ها', 'sv-ex'); SV.editField = 0; await svLoadFields(); svFieldsRender(); };
    SVA['sv-ex-fedit'] = async (t, id) => { SV.editField = id; svFieldsRender(); };
    SVA['sv-ex-fsave'] = async () => {
      await stuFetch('/exams/field/save', { id: SV.editField || 0, name: gv('sv-fname') });
      SV.editField = 0; await svLoadFields(); svFieldsRender();
    };
    SVA['sv-ex-fdel'] = async (t, id) => {
      if (!(await svAsk('این رشته حذف شود؟ (فقط اگر سوال یا آزمونی نداشته باشد حذف می‌شود.)', 'حذف رشته'))) return;
      await stuFetch('/exams/field/delete', { id }); await svLoadFields(); svFieldsRender();
    };
    SVA['sv-ex-ftch'] = async (t, id) => {
      const f = SV.fields.filter((x) => x.id === id)[0]; if (!f) return;
      const on = {}; (f.teachers || []).forEach((x) => { on[x.id] = 1; });
      let h = '<p class="muted-text small">معلم‌هایی که فقط سوال‌های همین رشته را می‌بینند و برایش آزمون می‌سازند:</p>';
      h += SV.teachers.length ? '<div class="sv-rows">' + svChecks(SV.teachers, 'sv-ft', (s) => !!on[s.id]) + '</div>' : '<p class="muted-text small">معلمی تعریف نشده است.</p>';
      h += svBtn('sv-ex-ftsave', 'ذخیره', svId(id), 'secondary-btn sv-wide');
      svShell('👥 معلم‌های ' + f.name, 'sv-ex-flds', h);
    };
    SVA['sv-ex-ftsave'] = async (t, id) => {
      await stuFetch('/exams/field/teachers', { field_id: id, teacher_ids: svPicked('sv-ft') });
      await svLoadFields(); svFieldsRender();
    };

    /* --- ساخت آزمون (معلم) --- */
    async function svNewLoadQs() {
      const box = $('sv-n-qs'); if (!box) return;
      const fid = parseInt(gv('sv-n-field'), 10) || 0;
      box.innerHTML = '<p class="muted-text small">در حال بارگذاری…</p>';
      const d = await stuFetch('/exams/q/list', { field_id: fid, status: 'approved' });
      const b2 = $('sv-n-qs'); if (!b2) return;
      if (!d.questions.length) { b2.innerHTML = '<p class="muted-text small">بانک سوالِ تأییدشدهٔ این رشته خالی است.</p>'; return; }
      b2.innerHTML = '<label class="sv-chk"><input type="checkbox" data-all=".sv-n-q"> انتخاب همه</label>' + d.questions.map((q) => '<label class="sv-chk"><input type="checkbox" class="sv-n-q" value="' + q.id + '"> ' + esc(q.text.length > 90 ? q.text.slice(0, 90) + '…' : q.text) + '</label>').join('');
    }
    SVA['sv-ex-new'] = async () => {
      svLoading('➕ آزمون جدید', 'sv-ex');
      const [fd, list] = await Promise.all([svLoadFields(), svStudents(true)]);
      if (!SV.fields.length) { svShell('➕ آزمون جدید', 'sv-ex', '<p class="muted-text small">مدیر هنوز رشته‌ای به شما اختصاص نداده است؛ از مدیر بخواهید در «رشته‌ها و معلم‌ها» شما را اضافه کند.</p>'); return; }
      if (!list.length) { svShell('➕ آزمون جدید', 'sv-ex', '<p class="muted-text small">دانش‌آموزی در کلاس شما نیست.</p>'); return; }
      let h = field('عنوان آزمون', '<input type="text" id="sv-n-title" maxlength="160">');
      h += field('رشته', '<select id="sv-n-field">' + SV.fields.map((f) => '<option value="' + f.id + '">' + esc(f.name) + '</option>').join('') + '</select>');
      h += field('زمان آزمون (دقیقه)', '<input type="text" inputmode="numeric" id="sv-n-dur" value="20">');
      h += field('شروع بازهٔ آزمون (اختیاری)', '<input type="datetime-local" id="sv-n-from">');
      h += field('پایان بازهٔ شرکت (اختیاری)', '<input type="datetime-local" id="sv-n-until">');
      h += '<label class="sv-chk"><input type="checkbox" id="sv-n-rev"> بعد از آزمون پاسخ‌های درست به دانش‌آموز نشان داده شود</label>';
      h += '<h4>سوال‌ها</h4><div id="sv-n-qs"></div><h4>دانش‌آموزان</h4><label class="sv-chk"><input type="checkbox" data-all=".sv-n-st"> انتخاب همه</label><div class="sv-rows">' + svChecks(list, 'sv-n-st') + '</div>';
      h += svBtn('sv-ex-nsave', 'ساخت آزمون', '', 'secondary-btn sv-wide');
      svShell('➕ آزمون جدید', 'sv-ex', h);
      await svNewLoadQs();
    };
    SVA['sv-ex-nsave'] = async (t) => {
      const ts = (v) => { if (!v) return 0; const x = new Date(v).getTime(); return isNaN(x) ? 0 : Math.floor(x / 1000); };
      t.disabled = true;
      try {
        await stuFetch('/exams/ex/save', {
          title: gv('sv-n-title'), field_id: parseInt(gv('sv-n-field'), 10) || 0, duration_min: parseInt(latin(gv('sv-n-dur')), 10) || 0,
          open_from_ts: ts(gv('sv-n-from')), open_until_ts: ts(gv('sv-n-until')), review: !!($('sv-n-rev') && $('sv-n-rev').checked),
          question_ids: svPicked('sv-n-q'), student_ids: svPicked('sv-n-st'),
        });
        await SVA['sv-ex']();
      } finally { t.disabled = false; }
    };

    /* تغییر مقدار فیلدها (انتخاب همه، پاسخ آزمون، فیلتر بانک، رشتهٔ آزمون) */
    function svChange(t) {
      if (t.hasAttribute && t.hasAttribute('data-all')) {
        const on = t.checked;
        document.querySelectorAll('#stu-main ' + t.getAttribute('data-all')).forEach((c) => { c.checked = on; });
        return;
      }
      if (t.matches && t.matches('.exm-opt input') && SV.take) {
        SV.take.ans[t.getAttribute('data-q')] = parseInt(t.value, 10);
        const eid = SV.take.id, snap = JSON.parse(JSON.stringify(SV.take.ans));
        if (SV.saveT) clearTimeout(SV.saveT);
        SV.saveT = setTimeout(() => { SV.saveT = null; stuFetch('/exams/take/save', { exam_id: eid, answers: snap }).catch(() => {}); }, 700);
        return;
      }
      if (t.id === 'sv-n-field') { svNewLoadQs().catch(svErr); return; }
      if (t.id === 'sv-qf' || t.id === 'sv-qs') { svBankRender(parseInt(gv('sv-qf'), 10) || 0, gv('sv-qs')).catch(svErr); }
    }
    document.addEventListener('change', (ev) => {
      const t = ev.target;
      if (!t || !t.closest || !t.closest('#tab-students')) return;
      svChange(t);
    });

    /* ----- رویدادها ----- */
    document.addEventListener('click', (ev) => {
      const t = ev.target && ev.target.closest ? ev.target.closest('#tab-students [data-stu]') : null;
      if (!t || !S.me) return;
      const act = t.getAttribute('data-stu');
      if (act.indexOf('sv-') === 0) { svDispatch(act, t); return; }
      const cur = (S.viewId == null) ? S.me : (findUser(S.viewId) || S.me);
      if (act === 'logout') doLogout();
      else if (act === 'profile') renderForm('profile', S.me);
      else if (act === 'password') renderForm('password', S.me);
      else if (act === 'add') renderForm('add', cur);
      else if (act === 'edit') renderForm('edit', cur);
      else if (act === 'delete') doDelete(cur);
      else if (act === 'cancel') { S.sheet = null; stuRender(); }
      else if (act === 'sheet') openSheet(cur.id, '');
      else if (act === 'sheet-prev' || act === 'sheet-next') {
        if (!S.sheet) return;
        const dt = parseD(S.sheet.date); dt.setDate(dt.getDate() + (act === 'sheet-prev' ? -1 : 1));
        const nd = fmtD(dt); if (nd > S.sheet.today) return;
        openSheet(S.sheet.scope, nd);
      }
      else if (act === 'sheet-all') { if (S.sheet) { S.sheet.students.forEach((x) => { S.sheet.draft[x.id] = { status: 'present', note: '' }; }); renderSheet(); } }
      else if (act === 'sheet-set') {
        if (!S.sheet) return; const id = parseInt(t.getAttribute('data-id'), 10); const st = t.getAttribute('data-s');
        const dr = S.sheet.draft[id] || (S.sheet.draft[id] = { status: '', note: '' });
        dr.status = (dr.status === st) ? '' : st; if (dr.status === 'present') dr.note = '';
        renderSheet();
      }
      else if (act === 'sheet-save') saveSheet();
      else if (act === 'refresh') { loadNotifs(); }
      else if (act === 'open') { S.viewId = parseInt(t.getAttribute('data-id'), 10) || null; stuRender(); }
      else if (act === 'up') { S.viewId = (cur.parent_id && cur.parent_id !== S.me.id && findUser(cur.parent_id)) ? cur.parent_id : null; stuRender(); }
    });
    const lb = $('stu-login-btn'); if (lb) lb.addEventListener('click', doLogin);
    ['stu-username', 'stu-password'].forEach((id) => { const e = $(id); if (e) e.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') doLogin(); }); });

    loadSettings();
  } catch (e) { try { console.error('students', e); } catch (e2) {} }
})();

/* ======================================================================
   مسابقهٔ آنلاین قرآنی + لیگ (سرگرمی ← مسابقه)
   - آنلاین: بدون اینترنت اجازهٔ شروع نمی‌دهد؛ اگر وسط ۱۰ سؤال اینترنت قطع شود دور لغو می‌شود و هیچ چیزی ارسال نمی‌شود.
   - فقط دو درخواست برای هر دور: /contest/start (گرفتن ۱۰ سؤال) و /contest/submit (ارسال همهٔ پاسخ‌ها، فقط با دکمهٔ «ارسال» در سؤال ۱۰).
   - کاربر به سؤال قبل برنمی‌گردد؛ هر سؤال فقط «seconds» ثانیه (از پیشخوان، پیش‌فرض ۱۵) وقت دارد (ساعت دیواری، با رفتن به پس‌زمینه متوقف نمی‌شود).
   - سؤال‌ها و جواب‌ها را سرور می‌سازد/تصحیح می‌کند؛ جواب درست هرگز قبل از ارسال داخل گوشی نیست.
   - متغیرها عمداً با var تعریف شده‌اند (switchToTab ممکن است قبل از رسیدن اجرا به این خط‌ها صدا زده شود؛ با let خطای TDZ می‌دهد).
   ====================================================================== */
var cnS = { phase: 'idle', settings: null, me: null, round: null, device: '', i: 0, answers: [], qStart: 0, deadline: 0, limitMs: 15000, locked: false, board: 0 };
var cnTimer = null, cnAdvance = null;

function cnRoot() { return document.getElementById('cn-root'); }
function cnEsc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function cnFa(n) { return toPersianDigits(n); }
function cnStopTimers() {
  if (cnTimer) { clearInterval(cnTimer); cnTimer = null; }
  if (cnAdvance) { clearTimeout(cnAdvance); cnAdvance = null; }
}
function cnSetPlaying(on) { try { document.getElementById('tab-contest').classList.toggle('cn-playing', !!on); } catch (e) {} }
function cnInGame() { return cnS.phase === 'count' || cnS.phase === 'play' || cnS.phase === 'send' || cnS.phase === 'sending'; }

// خروج از صفحه (یا لغو): هیچ چیزی ارسال نمی‌شود
function cnLeave() {
  if (cnS.phase === 'idle') return;
  cnStopTimers();
  cnS.phase = 'idle'; cnS.answers = []; cnS.round = null; cnS.locked = false;
  cnSetPlaying(false);
}

async function cnPost(path, body) {
  const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), 25000) : null;
  let res;
  try {
    res = await fetch(state.apiUrl.replace(/\/$/, '') + path, {
      method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}), signal: ctrl ? ctrl.signal : undefined
    });
  } catch (e) {
    const err = new Error('network'); err.code = 'network'; throw err;
  } finally { if (timer) clearTimeout(timer); }
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch (e) {
    const i = text.search(/[\[{]/);
    if (i > 0) { try { data = JSON.parse(text.slice(i)); } catch (e2) { data = null; } }
  }
  if (!res.ok) {
    const err = new Error((data && data.message) || ('HTTP ' + res.status));
    err.code = 'http_' + res.status; err.serverMsg = !!(data && data.message); throw err;
  }
  if (data === null) { const err = new Error('bad_json'); err.code = 'bad_json'; throw err; }
  return data;
}
function cnErrText(e) {
  if (e && e.serverMsg) return e.message;
  return 'ارتباط با سرور برقرار نشد. اینترنت را بررسی کنید و دوباره تلاش کنید.';
}

/* نام بخش و پنهان‌کردن کاشی (فقط وقتی صفحهٔ «سرگرمی» باز می‌شود؛ برای کم‌کردن ترافیک) */
async function loadContestSettings() {
  if (!navigator.onLine) return;
  try {
    const s = await shariqGet('/contest/settings');
    const tile = document.getElementById('contest-more-tile');
    if (tile) tile.classList.toggle('hidden', s && s.enabled === false);
    if (s && s.nav_label) {
      const a = document.getElementById('contest-tile-label'); if (a) a.textContent = s.nav_label;
      const b = document.getElementById('cn-page-title'); if (b) b.textContent = s.nav_label;
    }
  } catch (e) { /* بدون اینترنت: نام پیش‌فرض */ }
}

function cnOfflineHtml(title, text) {
  return `<div class="ga-card cn-card">
    <div class="ga-hero">📡</div>
    <h3 class="ga-title">${cnEsc(title)}</h3>
    <p class="cn-note">${cnEsc(text)}</p>
    <button class="secondary-btn ga-start" id="cn-retry-btn">تلاش دوباره</button>
  </div>`;
}
function cnShowOffline() {
  cnStopTimers();
  cnS.phase = 'offline';
  cnRoot().innerHTML = cnOfflineHtml('اینترنت شما خاموش است', 'برای انجام مسابقه اینترنت خود را روشن کنید.');
  document.getElementById('cn-retry-btn').addEventListener('click', cnOpen);
  try { appAlert('contest_offline', null, { text: 'برای انجام مسابقه اینترنت خود را روشن کنید.', title: 'اینترنت قطع است', icon: '📡', tone: 'warn' }); } catch (e) {}
}

/* ---------- صفحهٔ اصلی مسابقه ---------- */
async function cnOpen() {
  cnStopTimers(); cnSetPlaying(false);
  cnS.locked = false; cnS.answers = []; cnS.round = null; cnS.leagueId = 0;
  if (!navigator.onLine) { if (cnShowCachedOffline()) return; cnShowOffline(); return; }
  cnS.phase = 'loading';
  // نمایش فوری آخرین وضعیت ذخیره‌شده (تا منتظر سرور نمانید)، بعد به‌روزرسانی از سرور
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem('arefCnHome') || 'null'); } catch (e) { cached = null; }
  if (cached && cached.me && cached.settings) {
    cnS.settings = cached.settings; cnS.me = cached.me; cnS.season = cached.season || null; cnS.phase = 'home';
    cnRenderHome(false);
  } else {
    cnRoot().innerHTML = '<div class="ga-card cn-card"><p class="muted-text">در حال بارگذاری…</p></div>';
  }
  let res;
  try {
    cnS.device = await ensureDeviceId();
    res = await cnPost('/contest/join', { device_id: cnS.device });
  } catch (e) {
    if (currentTab !== 'contest') return;
    if (cached && cnS.phase === 'home') { cnOfflineBanner(); return; } // همان وضعیت ذخیره‌شده می‌ماند
    cnS.phase = 'error';
    cnRoot().innerHTML = cnOfflineHtml('ارتباط برقرار نشد', cnErrText(e));
    document.getElementById('cn-retry-btn').addEventListener('click', cnOpen);
    return;
  }
  if (currentTab !== 'contest') return;
  try { localStorage.setItem('arefCnHome', JSON.stringify({ settings: res.settings, me: res.me, season: res.season || null })); } catch (e) {}
  const ob = document.getElementById('cn-off-banner'); if (ob) ob.remove();
  if (cached && cnS.phase !== 'home') return; // کاربر همین حالا وارد جای دیگری شده
  const same = cached && JSON.stringify(cached.me) === JSON.stringify(res.me) && JSON.stringify(cached.settings) === JSON.stringify(res.settings);
  cnS.settings = res.settings; cnS.me = res.me; cnS.season = res.season || null; cnS.phase = 'home';
  if (!same) cnRenderHome(false);
}

/* آفلاین: آخرین وضعیت و امتیاز ذخیره‌شده روی گوشی نمایش داده می‌شود (بازی کردن نیاز به اینترنت دارد) */
function cnSaveHome() {
  try { if (cnS.settings && cnS.me) localStorage.setItem('arefCnHome', JSON.stringify({ settings: cnS.settings, me: cnS.me, season: cnS.season || null })); } catch (e) {}
}
function cnOfflineBanner() {
  const r = cnRoot(); if (!r || document.getElementById('cn-off-banner')) return;
  r.insertAdjacentHTML('afterbegin', '<div class="ga-card cn-card cn-off" id="cn-off-banner"><p class="cn-note cn-warn">📡 اینترنت وصل نیست؛ آخرین وضعیت و امتیاز ذخیره‌شدهٔ شما نمایش داده می‌شود. برای بازی کردن اینترنت را روشن کنید.</p></div>');
}
function cnShowCachedOffline() {
  let c = null;
  try { c = JSON.parse(localStorage.getItem('arefCnHome') || 'null'); } catch (e) { c = null; }
  if (!c || !c.me || !c.settings) return false;
  cnS.settings = c.settings; cnS.me = c.me; cnS.season = c.season || null; cnS.phase = 'home';
  cnRenderHome(false);
  cnOfflineBanner();
  return true;
}
window.addEventListener('online', () => {
  if (currentTab === 'contest' && cnS.phase === 'home' && document.getElementById('cn-off-banner')) cnOpen();
});

function cnLeagueClass(i) { return 'cn-l' + Math.max(0, Math.min(2, i | 0)); }

function cnRenderHome(scrollBoard) {
  const s = cnS.settings || {}, me = cnS.me || {};
  const lg = s.leagues || [];
  let nextTxt = '';
  if (me.next) nextTxt = `تا «${cnEsc(me.next.name)}» <b>${cnFa(me.next.need)}</b> امتیاز مانده`;
  else nextTxt = 'شما در بالاترین لیگ هستید 👑';
  let plays;
  if (me.plays_left < 0) plays = '';
  else if (me.plays_left === 0) plays = `<p class="cn-note cn-warn">سهمیهٔ امروز شما تمام شد؛ فردا دوباره بیایید.</p>`;
  else plays = `<p class="cn-note">دورهای باقی‌ماندهٔ امروز: <b>${cnFa(me.plays_left)}</b> از ${cnFa(s.daily_limit)}</p>`;
  const canPlay = me.plays_left !== 0;
  let chips = '';
  lg.forEach((l, i) => {
    chips += `<button type="button" class="cn-chip ${cnLeagueClass(i)}" data-l="${i}">${cnEsc(l.name)}${i === me.league ? ' ⭐' : ''}</button>`;
  });
  cnRoot().innerHTML = `
  <div class="ga-card cn-card cn-profile">
    <div class="cn-hero">🏆</div>
    <div class="cn-yourname">نام شما در مسابقه</div>
    <div class="cn-nick" dir="ltr">${cnEsc(me.nick)}</div>
    <div class="cn-badge ${cnLeagueClass(me.league)}">${cnEsc(me.league_name)}</div>
    ${(me.gold || me.silver || me.bronze) ? `<div class="cn-troph">جایزه‌های لیگ دوستان:${cnTroph(me.gold, me.silver, me.bronze)}</div>` : ''}
    <div class="cn-stats">
      <div><b>${cnNum(me.points)}</b><span>امتیاز</span></div>
      <div><b>${cnFa(me.rank)}</b><span>رتبه از ${cnFa(me.league_size)}</span></div>
      <div><b>${cnFa(me.rounds)}</b><span>دور</span></div>
      <div><b>${cnFa(me.avg)}</b><span>میانگین دور</span></div>
    </div>
    <p class="cn-note">${nextTxt}</p>
    ${plays}
    <button class="secondary-btn ga-start" id="cn-start-btn" ${canPlay ? '' : 'disabled'}>🚀 شروع مسابقه (${cnFa(s.questions || 10)} سؤال)</button>
  </div>
  ${cnSeasonCardHtml(me)}
  <div class="ga-card cn-card cn-prac">
    <h3 class="cn-h">📖 تمرین آزاد و مرور من</h3>
    <p class="cn-note">بدون امتیاز و بدون محدودیت؛ فقط برای یادگیری. محدودهٔ دلخواه (جزء یا سوره) را انتخاب کنید.</p>
    ${cnScopeHtml('pr')}
    <button class="secondary-btn ga-start" id="cn-prac-btn">🎯 شروع تمرین (۱۰ سؤال)</button>
    <button class="ghost-btn" id="cn-mis-btn" style="width:100%;margin-top:8px">📝 مرور من (${cnFa(cnMisList().length)} اشتباه ذخیره‌شده)</button>
  </div>
  <div class="ga-card cn-card cn-friend">
    <h3 class="cn-h">👥 لیگ دوستان</h3>
    <p class="cn-note">با دوستانتان یک لیگ جدا بسازید یا وارد لیگ‌های باز شوید. نفرات اول تا سوم هر لیگ دوستان، در لیگ اصلی هم امتیاز می‌گیرند.</p>
    <p class="cn-note">آی‌دی شما برای دعوت: <b dir="ltr">${cnEsc(me.nick)}</b></p>
    <button class="secondary-btn ga-start" id="cn-fl-btn">👥 لیگ‌های دوستان${me.invites ? ' 🔴 ' + cnFa(me.invites) + ' دعوت' : ''}</button>
  </div>
  <div class="ga-card cn-card cn-rules">
    <h3 class="cn-h">قوانین</h3>
    <ul class="ga-rules">
      <li>هر دور <b>${cnFa(s.questions || 10)} سؤال</b> است: «آیهٔ بعد از این آیه چیست؟» با ۴ گزینه (فقط ۳ کلمهٔ اول آیه).</li>
      <li>برای هر سؤال فقط <b>${cnFa(s.seconds || 15)} ثانیه</b> وقت دارید و به سؤال قبلی <b>برنمی‌گردید</b>.</li>
      <li>پاسخ درست ۶۰ تا ۱۰۰ امتیاز دارد (هرچه سریع‌تر، بیشتر)؛ پاسخ غلط یا بی‌پاسخ ۰. امتیاز دور = <b>میانگین ${cnFa(s.questions || 10)} سؤال</b> (۰ تا ۱۰۰).</li>
      <li>پاسخ‌ها فقط در سؤال آخر با دکمهٔ «ارسال» یک‌جا فرستاده می‌شود. مجموع امتیاز دورها، لیگ شما را مشخص می‌کند.</li>
      <li>مسابقه آنلاین است؛ اگر وسط بازی اینترنت قطع شود، دور لغو می‌شود و چیزی ثبت نمی‌شود.</li>
    </ul>
  </div>
  <div class="ga-card cn-card" id="cn-board-card">
    <h3 class="cn-h">🏅 جدول رده‌بندی لیگ‌ها</h3>
    <div class="cn-chips">${chips}</div>
    <p class="muted-text small" id="cn-league-note"></p>
    <div id="cn-board"></div>
  </div>`;
  document.getElementById('cn-start-btn').addEventListener('click', cnStart);
  document.getElementById('cn-fl-btn').addEventListener('click', () => cnFlHome());
  cnScopeWire('pr');
  document.getElementById('cn-prac-btn').addEventListener('click', cnPracStart);
  document.getElementById('cn-mis-btn').addEventListener('click', cnMisOpen);
  const sb = document.getElementById('cn-season-btn'); if (sb) sb.addEventListener('click', cnSeasonOpen);
  cnRoot().querySelectorAll('.cn-chip').forEach((b) => b.addEventListener('click', () => cnLoadBoard(Number(b.dataset.l))));
  cnLoadBoard(typeof me.league === 'number' ? me.league : 0);
  if (scrollBoard) { try { document.getElementById('cn-board-card').scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {} }
}

async function cnLoadBoard(idx) {
  cnS.board = idx;
  const box = document.getElementById('cn-board');
  if (!box) return;
  document.querySelectorAll('#cn-board-card .cn-chip').forEach((b) => b.classList.toggle('on', Number(b.dataset.l) === idx));
  const lg = ((cnS.settings || {}).leagues || [])[idx];
  const note = document.getElementById('cn-league-note');
  if (note && lg) note.textContent = idx === 0 ? 'از همان ابتدا' : `از ${toPersianDigits(lg.min)} امتیاز به بالا`;
  if (!navigator.onLine) { box.innerHTML = '<p class="muted-text small" style="text-align:center;padding:10px">برای دیدن جدول رده‌بندی اینترنت لازم است.</p>'; return; }
  box.innerHTML = '<p class="muted-text small">در حال بارگذاری…</p>';
  try {
    const d = await shariqGet('/contest/board?league=' + idx + '&device_id=' + encodeURIComponent(cnS.device));
    if (cnS.board !== idx || !document.getElementById('cn-board')) return;
    if (d && d.me) { cnS.me = Object.assign({}, cnS.me || {}, d.me); }
    if (d && d.season) cnS.season = d.season;
    cnSaveHome();
    if (!d.rows || !d.rows.length) { box.innerHTML = '<p class="muted-text small" style="text-align:center;padding:10px">هنوز کسی در این لیگ نیست.</p>'; return; }
    const medal = ['🥇', '🥈', '🥉'];
    let h = '<div class="cn-table"><div class="cn-tr cn-th"><span>#</span><span>نام</span><span>امتیاز</span><span>دور</span></div>';
    let meShown = false;
    d.rows.forEach((r) => {
      if (r.me) meShown = true;
      h += `<div class="cn-tr${r.me ? ' me' : ''}"><span>${r.rank <= 3 ? medal[r.rank - 1] : cnFa(r.rank)}</span><span class="cn-rn" dir="ltr">${cnEsc(r.nick)}${r.me ? ' (شما)' : ''}${cnTroph(r.g, r.s, r.b) ? '<small class="cn-tr-t">' + cnTroph(r.g, r.s, r.b) + '</small>' : ''}</span><span>${cnNum(r.points)}</span><span>${cnFa(r.rounds)}</span></div>`;
    });
    h += '</div>';
    if (d.me && d.me.league === idx && !meShown) {
      h += `<div class="cn-table cn-table-me"><div class="cn-tr me"><span>${cnFa(d.me.rank)}</span><span class="cn-rn" dir="ltr">${cnEsc(d.me.nick)} (شما)</span><span>${cnNum(d.me.points)}</span><span>${cnFa(d.me.rounds)}</span></div></div>`;
    }
    h += `<p class="muted-text small" style="text-align:center;margin-top:8px">${cnFa(d.size)} نفر در «${cnEsc(d.name)}» · جدول هر نیم‌دقیقه به‌روز می‌شود</p>`;
    box.innerHTML = h;
  } catch (e) {
    if (document.getElementById('cn-board')) box.innerHTML = '<p class="muted-text small" style="text-align:center">' + cnEsc(cnErrText(e)) + '</p>';
  }
}

/* ---------- شروع دور ---------- */
async function cnStart() {
  if (cnS.phase !== 'home' && cnS.phase !== 'fl') return;
  if (!navigator.onLine) { cnShowOffline(); return; }
  const btn = document.getElementById('cn-start-btn') || document.getElementById('cn-fl-start');
  if (btn) { btn.dataset.t = btn.textContent; btn.disabled = true; btn.textContent = 'در حال آماده‌سازی…'; }
  let res;
  try {
    res = await cnPost('/contest/start', { device_id: cnS.device, league_id: cnS.leagueId || 0 });
  } catch (e) {
    if (currentTab !== 'contest') return;
    if (btn) { btn.disabled = false; btn.textContent = btn.dataset.t || 'شروع'; }
    try { appAlert('contest_start_err', null, { text: cnErrText(e), title: 'شروع نشد', icon: '⚠️', tone: 'warn' }); } catch (e2) {}
    return;
  }
  if (currentTab !== 'contest') return;
  cnS.round = res; cnS.i = 0; cnS.answers = []; cnS.okList = []; cnS.locked = true;
  cnS.limitMs = (Number(res.seconds) || 15) * 1000;
  cnS.phase = 'count';
  cnSetPlaying(true);
  cnCountdown(3);
}
function cnCountdown(n) {
  if (cnS.phase !== 'count') return;
  if (!navigator.onLine) { cnAbort(); return; }
  if (n <= 0) { cnShowQuestion(); return; }
  cnRoot().innerHTML = `<div class="ga-card cn-card cn-ready"><p class="cn-note">آماده باشید…</p><div class="cn-big">${cnFa(n)}</div>
    <p class="muted-text small">هر سؤال ${cnFa(cnS.limitMs / 1000)} ثانیه · بدون برگشت به سؤال قبل</p></div>`;
  cnAdvance = setTimeout(() => cnCountdown(n - 1), 1000);
}

/* ---------- نمایش سؤال ---------- */
function cnDots() {
  let h = '<div class="ga-dots">';
  const n = cnS.round.questions.length;
  for (let k = 0; k < n; k++) {
    const r = (cnS.okList || [])[k];
    h += `<span class="ga-dot${r === true ? ' ok' : (r === false ? ' bad' : (k < cnS.i ? ' ok' : ''))}${k === cnS.i ? ' cur' : ''}"></span>`;
  }
  return h + '</div>';
}
function cnShowQuestion() {
  cnStopTimers();
  if (!navigator.onLine) { cnAbort(); return; }
  const r = cnS.round, q = r.questions[cnS.i];
  cnS.phase = 'play'; cnS.locked = false;
  const last = cnS.i === r.questions.length - 1;
  let opts = '';
  q.options.forEach((o, k) => { opts += `<button type="button" class="cn-opt" data-k="${k}"><span class="cn-opt-n">${cnFa(k + 1)}</span><span class="cn-opt-t" dir="rtl">${cnEsc(o)} …</span></button>`; });
  cnRoot().innerHTML = `
  <div class="ga-head"><span class="ga-head-q">سؤال ${cnFa(cnS.i + 1)} از ${cnFa(r.questions.length)}</span><span class="cn-time" id="cn-time">${cnFa(cnS.limitMs / 1000)}</span></div>
  <div class="cn-bar"><i id="cn-bar-fill"></i></div>
  ${cnDots()}
  <div class="ga-card cn-card cn-qcard">
    <p class="cn-qtitle">آیهٔ بعد از این آیه چیست؟</p>
    <div class="cn-verse" dir="rtl">${cnEsc(q.text)}</div>
    <div class="cn-opts" id="cn-opts">${opts}</div>
    <div id="cn-after"></div>
  </div>`;
  cnRoot().querySelectorAll('.cn-opt').forEach((b) => b.addEventListener('click', () => cnPick(Number(b.dataset.k))));
  cnS.qStart = Date.now();
  cnS.deadline = cnS.qStart + cnS.limitMs;
  cnTick();
  cnTimer = setInterval(cnTick, 100);
  try { window.scrollTo(0, 0); const sc = document.querySelector('.tab-panel.active'); if (sc) sc.scrollTop = 0; } catch (e) {}
}
function cnTick() {
  if (cnS.phase !== 'play' || cnS.locked) return;
  const left = cnS.deadline - Date.now();
  if (left <= 0) { cnTimeout(); return; }
  const fill = document.getElementById('cn-bar-fill'), tm = document.getElementById('cn-time');
  if (fill) { fill.style.width = (100 * left / cnS.limitMs).toFixed(1) + '%'; fill.classList.toggle('urgent', left <= 5000); }
  if (tm) { tm.textContent = cnFa(Math.ceil(left / 1000)); tm.classList.toggle('urgent', left <= 5000); }
}
function cnLock(choice, ms, timedOut) {
  cnS.locked = true;
  if (cnTimer) { clearInterval(cnTimer); cnTimer = null; }
  cnS.answers.push({ c: choice, t: Math.max(0, Math.min(cnS.limitMs, Math.round(ms))) });
  const qa = cnS.round.questions[cnS.i];
  const known = qa && typeof qa.a === 'number';
  document.querySelectorAll('#cn-opts .cn-opt').forEach((b) => {
    b.disabled = true;
    const k = Number(b.dataset.k);
    if (known) {
      // رنگ فوری: پاسخ درست سبز، پاسخ اشتباهِ انتخاب‌شده قرمز (و جواب درست سبز نشان داده می‌شود)
      if (k === qa.a) b.classList.add('right');
      else if (k === choice) b.classList.add('wrong');
    } else if (k === choice) b.classList.add('sel');
  });
  if (known) {
    cnS.okList = cnS.okList || [];
    cnS.okList[cnS.i] = (choice === qa.a);
    const dots = document.querySelectorAll('.ga-dots .ga-dot');
    if (dots[cnS.i]) { dots[cnS.i].classList.remove('cur'); dots[cnS.i].classList.add(choice === qa.a ? 'ok' : 'bad'); }
  }
  const last = cnS.i === cnS.round.questions.length - 1;
  const fill = document.getElementById('cn-bar-fill'); if (fill && timedOut) fill.style.width = '0%';
  if (last) {
    cnS.phase = 'send';
    const after = document.getElementById('cn-after');
    if (after) after.innerHTML = `
      <p class="cn-note ${timedOut ? 'cn-warn' : ''}">${timedOut ? '⏱ زمان این سؤال تمام شد. ' : '✅ '}پاسخ هر ${cnFa(cnS.round.questions.length)} سؤال ثبت شد. برای دریافت نتیجه، پاسخ‌ها را ارسال کنید.</p>
      <p class="cn-note cn-warn hidden" id="cn-send-msg"></p>
      <button class="secondary-btn ga-start" id="cn-send-btn">📤 ارسال پاسخ‌ها</button>`;
    const sb = document.getElementById('cn-send-btn'); if (sb) sb.addEventListener('click', cnSend);
  } else {
    cnAdvance = setTimeout(() => { cnS.i++; cnShowQuestion(); }, timedOut ? 1100 : 900);
  }
}
function cnPick(k) {
  if (cnS.phase !== 'play' || cnS.locked) return;
  const now = Date.now();
  if (now > cnS.deadline + 150) { cnTimeout(); return; }
  cnLock(k, now - cnS.qStart, false);
}
function cnTimeout() {
  if (cnS.phase !== 'play' || cnS.locked) return;
  const fill = document.getElementById('cn-time'); if (fill) fill.textContent = cnFa(0);
  cnLock(-1, cnS.limitMs, true);
}

/* ---------- قطع اینترنت وسط بازی: لغو، بدون هیچ ارسالی ---------- */
function cnAbort() {
  cnStopTimers(); cnSetPlaying(false);
  cnS.phase = 'aborted'; cnS.answers = []; cnS.round = null; cnS.locked = false;
  if (currentTab !== 'contest') return;
  cnRoot().innerHTML = `<div class="ga-card cn-card">
    <div class="ga-hero">📡</div>
    <h3 class="ga-title">اینترنت قطع شد</h3>
    <p class="cn-note">این دور لغو شد و <b>هیچ پاسخی ارسال و هیچ امتیازی ثبت نشد</b> (از سهمیهٔ امروز هم کم نمی‌شود). اینترنت را روشن کنید و دوباره شروع کنید.</p>
    <button class="secondary-btn ga-start" id="cn-back-btn">بازگشت به مسابقه</button>
  </div>`;
  document.getElementById('cn-back-btn').addEventListener('click', cnOpen);
  try { appAlert('contest_aborted', null, { text: 'اینترنت قطع شد؛ این دور لغو شد و هیچ پاسخی ارسال نشد.', title: 'مسابقه لغو شد', icon: '📡', tone: 'warn' }); } catch (e) {}
}
window.addEventListener('offline', () => {
  if (currentTab !== 'contest') return;
  if (cnS.phase === 'play' || cnS.phase === 'count') { cnAbort(); return; }
  if (cnS.phase === 'send') {
    const m = document.getElementById('cn-send-msg');
    if (m) { m.textContent = 'اینترنت قطع است؛ پاسخ‌ها ارسال نشد. بعد از وصل‌شدن اینترنت، «ارسال پاسخ‌ها» را بزنید.'; m.classList.remove('hidden'); }
  }
});
window.addEventListener('online', () => {
  if (currentTab !== 'contest') return;
  if (cnS.phase === 'offline' || cnS.phase === 'error') cnOpen();
  if (cnS.phase === 'send') { const m = document.getElementById('cn-send-msg'); if (m) m.classList.add('hidden'); }
});

/* ---------- ارسال پاسخ‌ها (فقط با دکمه در سؤال آخر) ---------- */
async function cnSend() {
  if (cnS.phase !== 'send') return;
  const msg = document.getElementById('cn-send-msg'), btn = document.getElementById('cn-send-btn');
  if (!navigator.onLine) {
    if (msg) { msg.textContent = 'اینترنت وصل نیست؛ پاسخ‌ها ارسال نشد. اینترنت را روشن کنید و دوباره بزنید.'; msg.classList.remove('hidden'); }
    return;
  }
  cnS.phase = 'sending';
  if (msg) msg.classList.add('hidden');
  if (btn) { btn.disabled = true; btn.textContent = 'در حال ارسال…'; }
  let res;
  try {
    res = await cnPost('/contest/submit', { device_id: cnS.device, round_id: cnS.round.round_id, answers: cnS.answers });
  } catch (e) {
    if (currentTab !== 'contest') return;
    if (e.code === 'network' || e.code === 'bad_json' || /^http_5/.test(e.code || '')) {
      cnS.phase = 'send';
      if (btn) { btn.disabled = false; btn.textContent = '📤 ارسال پاسخ‌ها'; }
      if (msg) { msg.textContent = 'ارسال انجام نشد (ارتباط با سرور). اینترنت را بررسی کنید و دوباره «ارسال پاسخ‌ها» را بزنید؛ پاسخ‌های شما نگه داشته شده است.'; msg.classList.remove('hidden'); }
      return;
    }
    cnS.phase = 'error2'; cnSetPlaying(false);
    cnRoot().innerHTML = `<div class="ga-card cn-card"><div class="ga-hero">⚠️</div><h3 class="ga-title">ثبت نشد</h3>
      <p class="cn-note">${cnEsc(cnErrText(e))}</p><button class="secondary-btn ga-start" id="cn-back-btn">بازگشت به مسابقه</button></div>`;
    document.getElementById('cn-back-btn').addEventListener('click', cnOpen);
    return;
  }
  if (currentTab !== 'contest') return;
  cnShowResult(res);
}

function cnShowResult(res) {
  cnStopTimers(); cnSetPlaying(false);
  const me = res.me || cnS.me || {};
  cnS.me = me; cnS.phase = 'result'; cnS.round = null; cnS.answers = []; cnSaveHome();
  cnMisAdd(res.detail);
  const sc = Number(res.score) || 0;
  const emoji = sc >= 85 ? '🏆' : sc >= 60 ? '🎉' : sc >= 30 ? '👍' : '💪';
  let rev = '';
  (res.detail || []).forEach((d, i) => {
    rev += `<div class="cn-rev ${d.ok ? 'ok' : 'bad'}">
      <div class="cn-rev-h"><b>${cnFa(i + 1)}</b> ${d.ok ? '✅' : (d.chosen ? '❌' : '⏱')} <span>${d.pts ? '+' + cnFa(d.pts) : '۰'}</span></div>
      <div class="cn-rev-v" dir="rtl">${cnEsc(d.text)}</div>
      <div class="cn-rev-a" dir="rtl"><small>آیهٔ بعد:</small> ${cnEsc(d.correct)} …</div>
      ${(!d.ok) ? `<div class="cn-rev-c" dir="rtl"><small>${d.chosen ? 'پاسخ شما:' : 'بی‌پاسخ'}</small> ${d.chosen ? cnEsc(d.chosen) + ' …' : ''}</div>` : ''}
    </div>`;
  });
  if (res.league) { cnRenderLeagueResult(res, rev); return; }
  const canAgain = me.plays_left !== 0;
  cnRoot().innerHTML = `
  <div class="ga-card cn-card cn-result">
    <div class="ga-hero">${emoji}</div>
    <p class="cn-note">امتیاز این دور (میانگین ${cnFa((res.detail || []).length)} سؤال)</p>
    <div class="ga-score"><b>${cnFa(sc)}</b> از ۱۰۰</div>
    <p class="cn-note">✅ ${cnFa(res.correct)} پاسخ درست از ${cnFa((res.detail || []).length)}</p>
    ${res.promoted ? `<p class="cn-promo">🎉 تبریک! به «${cnEsc(me.league_name)}» رسیدید!</p>` : ''}
    <div class="cn-stats">
      <div><b>${cnNum(me.points)}</b><span>مجموع امتیاز</span></div>
      <div><b>${cnFa(me.rank)}</b><span>رتبه از ${cnFa(me.league_size)}</span></div>
    </div>
    <p class="cn-note"><span class="cn-badge ${cnLeagueClass(me.league)}">${cnEsc(me.league_name)}</span></p>
    ${me.plays_left === 0 ? '<p class="cn-note cn-warn">سهمیهٔ امروز شما تمام شد؛ فردا دوباره بیایید.</p>' : (me.plays_left > 0 ? `<p class="cn-note">دورهای باقی‌ماندهٔ امروز: <b>${cnFa(me.plays_left)}</b></p>` : '')}
    <div class="ga-result-btns">
      ${canAgain ? '<button class="secondary-btn" id="cn-again-btn">🔁 دور جدید</button>' : ''}
      <button class="ghost-btn" id="cn-board-btn">🏅 جدول رده‌بندی</button>
    </div>
  </div>
  <div class="ga-card cn-card cn-review"><h3 class="cn-h">مرور سؤال‌ها</h3>${rev}</div>`;
  const ag = document.getElementById('cn-again-btn');
  if (ag) ag.addEventListener('click', async () => { await cnOpen(); if (cnS.phase === 'home') cnStart(); });
  document.getElementById('cn-board-btn').addEventListener('click', async () => { await cnOpen(); if (cnS.phase === 'home') { try { document.getElementById('cn-board-card').scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {} } });
  try { window.scrollTo(0, 0); } catch (e) {}
}

/* ======================================================================
   لیگ دوستان (لیگ جدا برای ۲ تا ۱۰۰ نفر، ۱ تا ۵ روز)
   - دورهای این لیگ‌ها جدا حساب می‌شوند و به امتیاز لیگ اصلی اضافه نمی‌شوند؛ فقط نفرات ۱ تا ۳ در پایان لیگ جایزهٔ امتیاز می‌گیرند (سرور می‌دهد).
   - عضویت: دعوت با «آی‌دی» (همان نام لاتین) ← تأیید دعوت‌شده؛ یا درخواست عضویت ← تأیید سازنده.
   ====================================================================== */
cnS.leagueId = 0; cnS.flTab = 'mine';

function cnTroph(g, s, b) {
  let t = '';
  if (g) t += ' 🥇' + cnFa(g);
  if (s) t += ' 🥈' + cnFa(s);
  if (b) t += ' 🥉' + cnFa(b);
  return t;
}
function cnFlTime(sec) {
  sec = Math.max(0, Number(sec) || 0);
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  if (d > 0) return cnFa(d) + ' روز و ' + cnFa(h) + ' ساعت';
  if (h > 0) return cnFa(h) + ' ساعت و ' + cnFa(m) + ' دقیقه';
  return cnFa(Math.max(1, m)) + ' دقیقه';
}
function cnFlMyBadge(l) {
  const m = { owner: '👑 سازندهٔ لیگ', member: '✅ عضو', invited: '📩 دعوت‌شده', requested: '⏳ در انتظار تأیید' }[l.my];
  return m ? `<span class="cn-fl-badge ${l.my}">${m}</span>` : '';
}
function cnFlAwardsText(f) {
  const a = (f && f.award) || [0, 0, 0];
  return `🥇 ${cnFa(a[0])}+ &nbsp; 🥈 ${cnFa(a[1])}+ &nbsp; 🥉 ${cnFa(a[2])}+ امتیاز در لیگ اصلی`;
}
async function cnFlDo(act, body) {
  if (!navigator.onLine) { cnShowOffline(); return null; }
  try { return await cnPost('/contest/fl/' + act, Object.assign({ device_id: cnS.device }, body || {})); }
  catch (e) {
    try { appAlert('contest_fl_err', null, { text: cnErrText(e), title: 'انجام نشد', icon: '⚠️', tone: 'warn' }); } catch (e2) {}
    return null;
  }
}
function cnFlErrCard(e, retry) {
  cnRoot().innerHTML = cnOfflineHtml('ارتباط برقرار نشد', cnErrText(e));
  document.getElementById('cn-retry-btn').addEventListener('click', retry);
}

/* ---------- فهرست لیگ‌ها ---------- */
async function cnFlHome(tab) {
  cnStopTimers(); cnSetPlaying(false);
  cnS.phase = 'fl'; cnS.leagueId = 0;
  if (!navigator.onLine) { cnShowOffline(); return; }
  if (tab) cnS.flTab = tab;
  cnRoot().innerHTML = '<div class="ga-card cn-card"><p class="muted-text">در حال بارگذاری…</p></div>';
  let d;
  try { d = await shariqGet('/contest/fl/list?device_id=' + encodeURIComponent(cnS.device)); }
  catch (e) { if (currentTab === 'contest') cnFlErrCard(e, () => cnFlHome()); return; }
  if (currentTab !== 'contest' || cnS.phase !== 'fl') return;
  cnS.fl = d;
  const list = cnS.flTab === 'open' ? (d.open || []) : (d.mine || []);
  let cards = '';
  list.forEach((l) => {
    const ended = l.status !== 'active' || l.left <= 0;
    let btns = `<button type="button" class="ghost-btn small-btn" data-act="view" data-id="${l.id}">مشاهده</button>`;
    if (!ended && l.my === 'invited') btns = `<button type="button" class="secondary-btn small-btn" data-act="accept" data-id="${l.id}">✅ پذیرش دعوت</button><button type="button" class="ghost-btn small-btn" data-act="decline" data-id="${l.id}">رد</button>` + btns;
    else if (!ended && !l.my && l.members < l.max) btns = `<button type="button" class="secondary-btn small-btn" data-act="join" data-id="${l.id}">🙋 درخواست عضویت</button>` + btns;
    cards += `<div class="cn-fl-card${ended ? ' ended' : ''}">
      <div class="cn-fl-t">${cnEsc(l.title)} ${cnFlMyBadge(l)}</div>
      <div class="cn-fl-m"><span>👑 <bdi dir="ltr">${cnEsc(l.owner)}</bdi></span><span>👥 ${cnFa(l.members)} از ${cnFa(l.max)}</span><span>${ended ? '🏁 پایان یافته' : '⏳ ' + cnFlTime(l.left)}</span><span>📚 ${cnScopeLabel(l.scope)}</span></div>
      <div class="cn-fl-b">${btns}</div></div>`;
  });
  if (!cards) cards = `<p class="muted-text small" style="text-align:center;padding:14px 4px">${cnS.flTab === 'open' ? 'فعلاً لیگ بازی وجود ندارد.' : 'هنوز در هیچ لیگی نیستید. یک لیگ بسازید یا از «لیگ‌های باز» درخواست بدهید.'}</p>`;
  cnRoot().innerHTML = `
  <div class="ga-card cn-card">
    <h3 class="cn-h">👥 لیگ دوستان</h3>
    <p class="cn-note">با دوستانتان یک لیگ جدا (۱ تا ۵ روز، ۲ تا ۱۰۰ نفر) بسازید. دورهای این لیگ‌ها فقط برای همان لیگ حساب می‌شود؛ ولی <b>نفرات اول تا سوم</b> هر لیگ در لیگ اصلی هم امتیاز می‌گیرند:<br>${cnFlAwardsText(d.friend)}</p>
    <p class="cn-note">آی‌دی شما برای دعوت: <b dir="ltr">${cnEsc((cnS.me || {}).nick)}</b></p>
    <button class="secondary-btn ga-start" id="cn-fl-new">➕ ساخت لیگ جدید</button>
    <button class="ghost-btn" id="cn-fl-back" style="width:100%;margin-top:8px">↩ بازگشت به مسابقه</button>
  </div>
  <div class="ga-card cn-card">
    <div class="cn-chips">
      <button type="button" class="cn-chip cn-l0${cnS.flTab === 'mine' ? ' on' : ''}" data-tab="mine">لیگ‌های من${d.invites ? ' 🔴' + cnFa(d.invites) : ''}</button>
      <button type="button" class="cn-chip cn-l1${cnS.flTab === 'open' ? ' on' : ''}" data-tab="open">لیگ‌های باز</button>
    </div>
    <div id="cn-fl-list">${cards}</div>
  </div>`;
  document.getElementById('cn-fl-new').addEventListener('click', cnFlNew);
  document.getElementById('cn-fl-back').addEventListener('click', cnOpen);
  cnRoot().querySelectorAll('.cn-chip[data-tab]').forEach((b) => b.addEventListener('click', () => cnFlHome(b.dataset.tab)));
  document.getElementById('cn-fl-list').addEventListener('click', async (e) => {
    const b = e.target.closest ? e.target.closest('button[data-act]') : null;
    if (!b) return;
    const id = Number(b.dataset.id), act = b.dataset.act;
    if (act === 'view') { cnFlView(id); return; }
    b.disabled = true;
    const r = await cnFlDo(act === 'join' ? 'join' : 'respond', { league_id: id, action: act });
    if (r && act === 'join') { try { appAlert('contest_fl_ok', null, { text: r.status === 'member' ? 'عضو لیگ شدید.' : 'درخواست شما برای سازندهٔ لیگ ارسال شد. بعد از تأیید او وارد لیگ می‌شوید.', title: 'انجام شد', icon: '✅', tone: 'success' }); } catch (e2) {} }
    if (currentTab === 'contest' && cnS.phase === 'fl') cnFlHome(r && act === 'join' ? 'mine' : undefined);
  });
}

/* ---------- ساخت لیگ ---------- */
async function cnFlNew() {
  cnS.phase = 'fl';
  await cnSurahNames();
  const f = (cnS.fl && cnS.fl.friend) || {};
  cnRoot().innerHTML = `<div class="ga-card cn-card cn-form">
    <h3 class="cn-h">➕ ساخت لیگ دوستان</h3>
    <label class="cn-lbl">نام لیگ</label>
    <input type="text" id="cn-new-title" class="cn-input" maxlength="40" placeholder="مثلاً: دوستان مسجد">
    <label class="cn-lbl">مدت لیگ</label>
    <select id="cn-new-days" class="cn-input">${[1, 2, 3, 4, 5].map((n) => `<option value="${n}">${cnFa(n)} روز</option>`).join('')}</select>
    <label class="cn-lbl">حداکثر تعداد افراد (۲ تا ۱۰۰)</label>
    <input type="number" id="cn-new-max" class="cn-input" min="2" max="100" value="10" inputmode="numeric">
    <p class="muted-text small">توجه: جایزهٔ لیگ اصلی فقط وقتی داده می‌شود که حداقل ۲۰ نفر در این لیگ بازی کنند.</p>
    <label class="cn-lbl">محدودهٔ سؤال‌ها (مثلاً برای کلاس یا مدرسه)</label>
    ${cnScopeHtml('nw')}
    <label class="cn-lbl">آی‌دی دوستان برای دعوت (اختیاری)</label>
    <textarea id="cn-new-inv" class="cn-input" rows="3" dir="ltr" placeholder="Kami47 Zafo88 Rili12"></textarea>
    <p class="muted-text small">آی‌دی‌ها را با فاصله یا ویرگول جدا کنید. هر دعوت‌شده باید در لیگ خودش «پذیرش» بزند. بقیه هم می‌توانند از «لیگ‌های باز» درخواست بدهند و شما تأیید می‌کنید.</p>
    <p class="muted-text small">جایزه: ${cnFlAwardsText(f)} (برای نفرات ۱ تا ۳؛ فقط وقتی حداقل ${cnFa(f.award_min || 20)} نفر در لیگ بازی کرده باشند).</p>
    <p class="cn-note cn-warn hidden" id="cn-new-err"></p>
    <button class="secondary-btn ga-start" id="cn-new-go">ثبت و شروع لیگ</button>
    <button class="ghost-btn" id="cn-new-back" style="width:100%;margin-top:8px">انصراف</button>
  </div>`;
  cnScopeWire('nw');
  document.getElementById('cn-new-back').addEventListener('click', () => cnFlHome());
  document.getElementById('cn-new-go').addEventListener('click', async () => {
    const err = document.getElementById('cn-new-err'); err.classList.add('hidden');
    const title = document.getElementById('cn-new-title').value.trim();
    const max = parseInt(document.getElementById('cn-new-max').value, 10);
    if (title.length < 3) { err.textContent = 'نام لیگ حداقل ۳ حرف باشد.'; err.classList.remove('hidden'); return; }
    if (!(max >= 2 && max <= 100)) { err.textContent = 'تعداد افراد باید بین ۲ تا ۱۰۰ باشد.'; err.classList.remove('hidden'); return; }
    const btn = document.getElementById('cn-new-go'); btn.disabled = true; btn.textContent = 'در حال ساخت…';
    const r = await cnFlDo('create', Object.assign({ title, days: Number(document.getElementById('cn-new-days').value), max, invites: document.getElementById('cn-new-inv').value }, cnScopeRead('nw')));
    if (!r) { btn.disabled = false; btn.textContent = 'ثبت و شروع لیگ'; return; }
    let msg = 'لیگ ساخته شد.';
    if (r.invited && r.invited.length) msg += ' دعوت برای ' + r.invited.length + ' نفر ارسال شد.';
    if (r.unknown && r.unknown.length) msg += ' آی‌دی‌های پیدا‌نشده: ' + r.unknown.join('، ');
    try { appAlert('contest_fl_ok', null, { text: msg, title: 'انجام شد', icon: '✅', tone: 'success' }); } catch (e) {}
    cnFlView(r.league_id);
  });
}

/* ---------- صفحهٔ یک لیگ ---------- */
async function cnFlView(id) {
  cnStopTimers(); cnSetPlaying(false);
  cnS.phase = 'fl'; cnS.leagueId = 0; cnS.flId = id;
  if (!navigator.onLine) { cnShowOffline(); return; }
  cnRoot().innerHTML = '<div class="ga-card cn-card"><p class="muted-text">در حال بارگذاری…</p></div>';
  let d;
  try { d = await shariqGet('/contest/fl/view?league_id=' + id + '&device_id=' + encodeURIComponent(cnS.device)); }
  catch (e) {
    if (currentTab !== 'contest') return;
    if (e.serverMsg) { try { appAlert('contest_fl_err', null, { text: e.message, title: 'لیگ', icon: '⚠️', tone: 'warn' }); } catch (e2) {} cnFlHome(); }
    else cnFlErrCard(e, () => cnFlView(id));
    return;
  }
  if (currentTab !== 'contest' || cnS.phase !== 'fl') return;
  const l = d.league, st = d.state, my = l.my, f = d.friend || {};
  const active = d.active;
  const medal = ['🥇', '🥈', '🥉'];
  let rows = '<div class="cn-table"><div class="cn-tr cn-th"><span>#</span><span>نام</span><span>امتیاز</span><span>دور</span></div>';
  d.board.forEach((r) => {
    const ico = (!active && r.place) ? medal[r.place - 1] : (r.rank <= 3 && r.rounds > 0 ? medal[r.rank - 1] : cnFa(r.rank));
    rows += `<div class="cn-tr${r.me ? ' me' : ''}"><span>${ico}</span><span class="cn-rn" dir="ltr">${cnEsc(r.nick)}${r.owner ? ' 👑' : ''}${r.me ? ' (شما)' : ''}</span><span>${cnFa(r.points)}${r.award ? '<small class="cn-aw"> +' + cnFa(r.award) + '</small>' : ''}</span><span>${cnFa(r.rounds)}</span></div>`;
  });
  rows += '</div>';
  let action = '';
  if (active && my === 'owner' || active && my === 'member') {
    const pl = st ? st.plays_left : -1;
    action = `<p class="cn-note">امتیاز شما در این لیگ: <b>${cnFa(st ? st.points : 0)}</b> · رتبه ${cnFa(st ? st.rank : '-')} از ${cnFa(st ? st.size : '-')}</p>
      ${pl === 0 ? '<p class="cn-note cn-warn">سهمیهٔ امروز شما در این لیگ تمام شد؛ فردا دوباره بیایید.</p>' : (pl > 0 ? `<p class="cn-note">دورهای باقی‌ماندهٔ امروز: <b>${cnFa(pl)}</b></p>` : '')}
      <button class="secondary-btn ga-start" id="cn-fl-start" ${pl === 0 ? 'disabled' : ''}>🚀 شروع دور برای این لیگ</button>
      <p class="muted-text small">امتیاز این دورها فقط برای همین لیگ است.</p>`;
  } else if (active && my === 'invited') {
    action = `<p class="cn-note">شما به این لیگ دعوت شده‌اید.</p><button class="secondary-btn ga-start" id="cn-fl-accept">✅ پذیرش دعوت</button><button class="ghost-btn" id="cn-fl-decline" style="width:100%;margin-top:8px">رد دعوت</button>`;
  } else if (active && my === 'requested') {
    action = `<p class="cn-note">⏳ درخواست شما ارسال شده؛ منتظر تأیید سازندهٔ لیگ باشید.</p><button class="ghost-btn" id="cn-fl-leave" style="width:100%">لغو درخواست</button>`;
  } else if (active && !my) {
    action = l.members >= l.max ? '<p class="cn-note cn-warn">ظرفیت این لیگ تکمیل است.</p>' : `<button class="secondary-btn ga-start" id="cn-fl-join">🙋 درخواست عضویت</button>`;
  }
  if (active && my === 'member') action += `<button class="ghost-btn" id="cn-fl-leave" style="width:100%;margin-top:8px">خروج از لیگ</button>`;
  let ownerBox = '';
  if (my === 'owner' && active) {
    let pend = '';
    (d.pending || []).forEach((p) => {
      pend += `<div class="cn-pend"><span dir="ltr">${cnEsc(p.nick)}</span><em>${p.status === 'requested' ? 'درخواست عضویت' : 'دعوت‌شده (منتظر پذیرش)'}</em>
        ${p.status === 'requested' ? `<button type="button" class="secondary-btn small-btn" data-d="approve" data-mid="${p.mid}">تأیید</button>` : ''}
        <button type="button" class="ghost-btn small-btn" data-d="reject" data-mid="${p.mid}">${p.status === 'requested' ? 'رد' : 'حذف'}</button></div>`;
    });
    ownerBox = `<div class="ga-card cn-card cn-owner"><h3 class="cn-h">👑 مدیریت لیگ</h3>
      <div id="cn-pend">${pend || '<p class="muted-text small">درخواست یا دعوت در انتظاری نیست.</p>'}</div>
      <label class="cn-lbl">دعوت با آی‌دی</label>
      <input type="text" id="cn-inv-in" class="cn-input" dir="ltr" placeholder="Kami47 Zafo88">
      <button class="secondary-btn" id="cn-inv-go" style="width:100%;margin-top:6px">ارسال دعوت</button>
      <button class="ghost-btn" id="cn-fl-cancel" style="width:100%;margin-top:14px;color:var(--danger)">لغو کامل لیگ</button></div>`;
  }
  let status;
  if (active) status = '⏳ ' + cnFlTime(l.left) + ' مانده';
  else status = '🏁 پایان یافته' + (d.finalized ? (d.board.some((r) => r.place) ? ' — جایزه‌ها داده شد' : ' — جایزه‌ای داده نشد (برای جایزه حداقل ۲۰ نفر باید در لیگ بازی کنند)') : '');
  cnRoot().innerHTML = `
  <div class="ga-card cn-card">
    <h3 class="cn-h">${cnEsc(l.title)} ${cnFlMyBadge(l)}</h3>
    <div class="cn-fl-m"><span>👑 <bdi dir="ltr">${cnEsc(l.owner)}</bdi></span><span>👥 ${cnFa(l.members)} از ${cnFa(l.max)}</span><span>📅 ${cnFa(l.days)} روزه</span><span>📚 ${cnScopeLabel(l.scope)}</span></div>
    <p class="cn-note"><b>${status}</b></p>
    <p class="cn-note">جایزهٔ نفرات ۱ تا ۳ در لیگ اصلی:<br>${cnFlAwardsText(f)}</p>
    ${action}
  </div>
  ${ownerBox}
  <div class="ga-card cn-card"><h3 class="cn-h">🏅 رده‌بندی این لیگ</h3>${d.board.length ? rows : '<p class="muted-text small">هنوز عضوی نیست.</p>'}</div>
  <button class="ghost-btn" id="cn-fl-home" style="width:100%;margin:6px 0 4px">↩ فهرست لیگ‌ها</button>
  <button class="ghost-btn" id="cn-fl-refresh" style="width:100%;margin:0 0 4px">🔄 به‌روزرسانی</button>`;
  const on = (sel, fn) => { const el = document.getElementById(sel); if (el) el.addEventListener('click', fn); };
  const after = async (act, body, okText) => {
    const r = await cnFlDo(act, Object.assign({ league_id: id }, body || {}));
    if (r && okText) { try { appAlert('contest_fl_ok', null, { text: okText, title: 'انجام شد', icon: '✅', tone: 'success' }); } catch (e) {} }
    if (currentTab === 'contest' && cnS.phase === 'fl') { if (r && (act === 'leave' || act === 'cancel')) cnFlHome(); else cnFlView(id); }
    return r;
  };
  on('cn-fl-home', () => cnFlHome());
  on('cn-fl-refresh', () => cnFlView(id));
  on('cn-fl-start', () => { cnS.leagueId = id; cnStart(); });
  on('cn-fl-join', () => after('join', {}, 'درخواست شما برای سازندهٔ لیگ ارسال شد. بعد از تأیید او وارد لیگ می‌شوید.'));
  on('cn-fl-accept', () => after('respond', { action: 'accept' }));
  on('cn-fl-decline', () => after('respond', { action: 'decline' }).then(() => {}));
  on('cn-fl-leave', async () => { if (await appConfirm('contest_fl_leave', null, { text: 'از این لیگ خارج می‌شوید؟', title: 'خروج', icon: '❓', tone: 'question' })) after('leave', {}); });
  on('cn-fl-cancel', async () => { if (await appConfirm('contest_fl_cancel', null, { text: 'لیگ به‌طور کامل لغو می‌شود و جایزه‌ای داده نمی‌شود. مطمئنید؟', title: 'لغو لیگ', icon: '⚠️', tone: 'warn' })) after('cancel', {}); });
  on('cn-inv-go', () => {
    const v = (document.getElementById('cn-inv-in').value || '').trim();
    if (!v) return;
    cnFlDo('invite', { league_id: id, nicks: v }).then((r) => {
      if (!r) return;
      let msg = r.invited.length ? 'دعوت برای ' + r.invited.length + ' نفر ارسال شد.' : 'دعوتی ارسال نشد.';
      if (r.unknown.length) msg += ' آی‌دی‌های پیدا‌نشده: ' + r.unknown.join('، ');
      if (r.skipped.length) msg += ' قبلاً عضو/دعوت‌شده یا ظرفیت پر: ' + r.skipped.join('، ');
      try { appAlert('contest_fl_ok', null, { text: msg, title: 'نتیجهٔ دعوت', icon: 'ℹ️', tone: 'info' }); } catch (e) {}
      if (currentTab === 'contest' && cnS.phase === 'fl') cnFlView(id);
    });
  });
  const pend = document.getElementById('cn-pend');
  if (pend) pend.addEventListener('click', (e) => {
    const b = e.target.closest ? e.target.closest('button[data-d]') : null;
    if (!b) return;
    b.disabled = true;
    after('decide', { mid: Number(b.dataset.mid), action: b.dataset.d });
  });
}

/* نتیجهٔ دور لیگ دوستان */
function cnRenderLeagueResult(res, rev) {
  const lg = res.league, sc = Number(res.score) || 0;
  cnS.phase = 'result'; cnS.round = null; cnS.answers = [];
  const emoji = sc >= 85 ? '🏆' : sc >= 60 ? '🎉' : sc >= 30 ? '👍' : '💪';
  const canAgain = lg.plays_left !== 0;
  cnRoot().innerHTML = `
  <div class="ga-card cn-card cn-result">
    <div class="ga-hero">${emoji}</div>
    <p class="cn-note">امتیاز این دور (میانگین ${cnFa((res.detail || []).length)} سؤال)</p>
    <div class="ga-score"><b>${cnFa(sc)}</b> از ۱۰۰</div>
    <p class="cn-note">✅ ${cnFa(res.correct)} پاسخ درست از ${cnFa((res.detail || []).length)}</p>
    <p class="cn-note">این دور فقط برای «<b>${cnEsc(lg.title)}</b>» حساب شد و به امتیاز لیگ اصلی اضافه نمی‌شود. جایزهٔ لیگ اصلی فقط به نفرات ۱ تا ۳ پایان لیگ می‌رسد.</p>
    <div class="cn-stats">
      <div><b>${cnFa(lg.points)}</b><span>امتیاز در این لیگ</span></div>
      <div><b>${cnFa(lg.rank)}</b><span>رتبه از ${cnFa(lg.size)}</span></div>
    </div>
    ${lg.plays_left === 0 ? '<p class="cn-note cn-warn">سهمیهٔ امروز شما در این لیگ تمام شد.</p>' : (lg.plays_left > 0 ? `<p class="cn-note">دورهای باقی‌ماندهٔ امروز: <b>${cnFa(lg.plays_left)}</b></p>` : '')}
    <div class="ga-result-btns">
      ${canAgain ? '<button class="secondary-btn" id="cn-again-btn">🔁 دور دیگر برای این لیگ</button>' : ''}
      <button class="ghost-btn" id="cn-board-btn">🏅 رده‌بندی این لیگ</button>
    </div>
  </div>
  <div class="ga-card cn-card cn-review"><h3 class="cn-h">مرور سؤال‌ها</h3>${rev}</div>`;
  const ag = document.getElementById('cn-again-btn');
  if (ag) ag.addEventListener('click', async () => { await cnFlView(lg.id); if (cnS.phase === 'fl') { cnS.leagueId = lg.id; cnStart(); } });
  document.getElementById('cn-board-btn').addEventListener('click', () => cnFlView(lg.id));
  try { window.scrollTo(0, 0); } catch (e) {}
}

// دکمهٔ برگشت گوشی وسط بازی: تأیید خروج (با خروج، دور لغو می‌شود و چیزی ارسال نمی‌شود)
function cnConfirmExit() {
  appConfirm('contest_exit', null, { text: 'اگر خارج شوید این دور لغو می‌شود و هیچ پاسخی ارسال نمی‌شود. خارج می‌شوید؟', title: 'خروج از مسابقه', icon: '⚠️', tone: 'warn' })
    .then((yes) => { if (yes && cnInGame()) { cnLeave(); goBackInApp(); } });
}

/* ======================================================================
   فصل (سیزن)، محدودهٔ جزء/سوره، تمرین آزاد و «مرور من»
   - امتیاز کل هیچ‌وقت صفر نمی‌شود؛ در پایان فصل مدال/جایزه، صعود و سقوط (با کسر امتیاز) اعمال می‌شود (سرور).
   - «مرور من»: اشتباهات خود کاربر روی همین گوشی ذخیره می‌شود (localStorage)؛ تمرینش بدون امتیاز است.
   ====================================================================== */
function cnNum(n) {
  n = Number(n) || 0;
  return '<span dir="ltr">' + (n < 0 ? '−' : '') + cnFa(Math.abs(n)) + '</span>';
}
var cnSNames = null;
async function cnSurahNames() {
  if (cnSNames) return cnSNames;
  try {
    const all = await getOfflineQuranText();
    if (Array.isArray(all) && all.length === 114) cnSNames = all.map((sr) => sr.name);
  } catch (e) {}
  return cnSNames;
}
function cnScopeLabel(sc) {
  if (!sc || !sc.t) return 'کل قرآن';
  if (sc.t === 'juz') return sc.a === sc.b ? 'جزء ' + cnFa(sc.a) : 'جزء ' + cnFa(sc.a) + ' تا ' + cnFa(sc.b);
  const nm = (n) => (cnSNames && cnSNames[n - 1]) ? cnSNames[n - 1] : 'سورهٔ ' + cnFa(n);
  return sc.a === sc.b ? nm(sc.a) : nm(sc.a) + ' تا ' + nm(sc.b);
}
function cnScopeHtml(p) {
  const jz = (sel) => { let h = ''; for (let i = 1; i <= 30; i++) h += `<option value="${i}"${i === sel ? ' selected' : ''}>جزء ${cnFa(i)}</option>`; return h; };
  const sr = (sel) => { let h = ''; for (let i = 1; i <= 114; i++) h += `<option value="${i}"${i === sel ? ' selected' : ''}>${cnFa(i)}. ${cnEsc((cnSNames && cnSNames[i - 1]) || 'سوره')}</option>`; return h; };
  return `<select id="cn-${p}-t" class="cn-input"><option value="">کل قرآن</option><option value="juz">محدودهٔ جزء</option><option value="surah">محدودهٔ سوره</option></select>
  <div id="cn-${p}-juz" class="cn-scope hidden"><span>از</span><select id="cn-${p}-ja" class="cn-input">${jz(1)}</select><span>تا</span><select id="cn-${p}-jb" class="cn-input">${jz(1)}</select></div>
  <div id="cn-${p}-surah" class="cn-scope hidden"><span>از</span><select id="cn-${p}-sa" class="cn-input">${sr(1)}</select><span>تا</span><select id="cn-${p}-sb" class="cn-input">${sr(1)}</select></div>`;
}
function cnScopeWire(p) {
  const t = document.getElementById('cn-' + p + '-t'); if (!t) return;
  const upd = () => {
    document.getElementById('cn-' + p + '-juz').classList.toggle('hidden', t.value !== 'juz');
    document.getElementById('cn-' + p + '-surah').classList.toggle('hidden', t.value !== 'surah');
  };
  t.addEventListener('change', upd); upd();
  // اگر «تا» کوچک‌تر از «از» شد، یکسان شود
  [['ja', 'jb'], ['sa', 'sb']].forEach((pr) => {
    const a = document.getElementById('cn-' + p + '-' + pr[0]), b = document.getElementById('cn-' + p + '-' + pr[1]);
    if (!a || !b) return;
    a.addEventListener('change', () => { if (Number(b.value) < Number(a.value)) b.value = a.value; });
    b.addEventListener('change', () => { if (Number(b.value) < Number(a.value)) a.value = b.value; });
  });
}
function cnScopeRead(p) {
  const t = (document.getElementById('cn-' + p + '-t') || {}).value || '';
  if (t === 'juz') return { scope_type: 'juz', scope_a: Number(document.getElementById('cn-' + p + '-ja').value), scope_b: Number(document.getElementById('cn-' + p + '-jb').value) };
  if (t === 'surah') return { scope_type: 'surah', scope_a: Number(document.getElementById('cn-' + p + '-sa').value), scope_b: Number(document.getElementById('cn-' + p + '-sb').value) };
  return {};
}

/* ---------- فصل ---------- */
function cnSeasonLeft(sec) { return sec < 0 ? 'پایان فصل با اعلام مدیر' : (sec <= 0 ? 'در حال پایان' : cnFlTime(sec) + ' مانده'); }
function cnSeasonCardHtml(me) {
  const se = cnS.season;
  if (!se) return '';
  return `<div class="ga-card cn-card cn-season">
    <h3 class="cn-h">📅 فصل ${cnFa(se.no)}</h3>
    <p class="cn-note">⏳ ${cnSeasonLeft(se.left)}</p>
    <div class="cn-stats"><div><b>${cnNum(me.gain || 0)}</b><span>امتیاز این فصل</span></div>
      <div><b>${cnFa((me.sg || 0) + (me.ss || 0) + (me.sb || 0))}</b><span>مدال فصل‌ها</span></div></div>
    ${(me.sg || me.ss || me.sb) ? `<div class="cn-troph">مدال‌های همیشگی:${cnTroph(me.sg, me.ss, me.sb)}</div>` : ''}
    <p class="cn-note">در پایان فصل برترین‌های هر لیگ مدال و جایزه می‌گیرند، نفرات برتر صعود و نفرات آخر سقوط می‌کنند.</p>
    <button class="ghost-btn" id="cn-season-btn" style="width:100%">🏆 جزئیات فصل</button>
  </div>`;
}
async function cnSeasonOpen() {
  cnStopTimers(); cnSetPlaying(false);
  cnS.phase = 'season';
  if (!navigator.onLine) { cnShowOffline(); return; }
  cnRoot().innerHTML = '<div class="ga-card cn-card"><p class="muted-text">در حال بارگذاری…</p></div>';
  let d;
  try { d = await shariqGet('/contest/season?device_id=' + encodeURIComponent(cnS.device)); }
  catch (e) { if (currentTab === 'contest') { cnS.phase = 'error'; cnRoot().innerHTML = cnOfflineHtml('ارتباط برقرار نشد', cnErrText(e)); document.getElementById('cn-retry-btn').addEventListener('click', cnSeasonOpen); } return; }
  if (currentTab !== 'contest' || cnS.phase !== 'season') return;
  const se = d.season, me = d.me, ru = d.rules;
  const medal = ['🥇', '🥈', '🥉'];
  let top = '';
  (d.top || []).forEach((r) => {
    top += `<div class="cn-tr${r.me ? ' me' : ''}"><span>${r.rank <= 3 ? medal[r.rank - 1] : cnFa(r.rank)}</span><span class="cn-rn" dir="ltr">${cnEsc(r.nick)}${r.me ? ' (شما)' : ''}${cnTroph(r.sg, r.ss, r.sb) ? '<small class="cn-tr-t">' + cnTroph(r.sg, r.ss, r.sb) + '</small>' : ''}</span><span>${cnNum(r.gain)}</span><span></span></div>`;
  });
  let hist = '';
  (d.history || []).forEach((h) => {
    const parts = [];
    if (h.place) parts.push(medal[h.place - 1] + ' رتبهٔ ' + cnFa(h.place));
    if (h.move === 1) parts.push('⬆️ صعود');
    if (h.move === -1) parts.push('⬇️ سقوط');
    if (h.bonus) parts.push((h.bonus > 0 ? '+' : '−') + cnFa(Math.abs(h.bonus)) + ' امتیاز');
    hist += `<div class="cn-hist"><b>فصل ${cnFa(h.season)}</b> · ${cnEsc(h.league)}<br><span>${parts.join(' · ')}</span></div>`;
  });
  cnRoot().innerHTML = `
  <div class="ga-card cn-card">
    <h3 class="cn-h">📅 فصل ${cnFa(se.no)}</h3>
    <p class="cn-note">⏳ ${cnSeasonLeft(se.left)}</p>
    <div class="cn-stats"><div><b>${cnNum(me.gain)}</b><span>امتیاز این فصل</span></div><div><b>${cnFa(me.rank)}</b><span>رتبهٔ فصلی در «${cnEsc(me.league_name)}»</span></div></div>
    ${(me.sg || me.ss || me.sb) ? `<div class="cn-troph">مدال‌های همیشگی شما:${cnTroph(me.sg, me.ss, me.sb)}</div>` : ''}
  </div>
  <div class="ga-card cn-card cn-rules"><h3 class="cn-h">قوانین پایان فصل</h3><ul class="ga-rules">
    <li>امتیاز کل شما <b>هرگز صفر نمی‌شود</b>؛ فقط «امتیاز فصل» از ابتدای هر فصل شمرده می‌شود.</li>
    <li>۳ نفر برتر هر لیگ (حداقل ${cnFa(ru.min)} بازیکن فعال) مدال همیشگی 🥇🥈🥉 و جایزهٔ ${cnFa(ru.award[0])} / ${cnFa(ru.award[1])} / ${cnFa(ru.award[2])} امتیاز می‌گیرند.</li>
    ${ru.promo_n ? `<li>${cnFa(ru.promo_n)} نفر برتر هر لیگ <b>صعود</b> می‌کنند (+${cnFa(ru.promo_bonus)} امتیاز و ورود به لیگ بالاتر).</li>` : ''}
    ${ru.demo_n ? `<li>${cnFa(ru.demo_n)} نفر آخر هر لیگ (از لیگ دوم به بعد) <b>سقوط</b> می‌کنند: ${cnFa(ru.demo_penalty)} امتیاز کم می‌شود و به لیگ پایین‌تر می‌روند. امتیاز در پایین‌ترین لیگ می‌تواند منفی شود.</li>` : ''}
  </ul></div>
  <div class="ga-card cn-card"><h3 class="cn-h">🏅 برترین‌های این فصل در «${cnEsc(me.league_name)}»</h3>
    ${top ? `<div class="cn-table"><div class="cn-tr cn-th"><span>#</span><span>نام</span><span>امتیاز فصل</span><span></span></div>${top}</div>` : '<p class="muted-text small" style="text-align:center">هنوز کسی در این فصل امتیاز نگرفته است.</p>'}</div>
  ${hist ? `<div class="ga-card cn-card"><h3 class="cn-h">📜 سابقهٔ شما در فصل‌ها</h3>${hist}</div>` : ''}
  <button class="ghost-btn" id="cn-season-back" style="width:100%;margin:6px 0 4px">↩ بازگشت به مسابقه</button>`;
  document.getElementById('cn-season-back').addEventListener('click', cnOpen);
  try { window.scrollTo(0, 0); } catch (e) {}
}

/* ---------- مرور اشتباهات (ذخیره روی همین گوشی) ---------- */
function cnMisList() {
  try { const a = JSON.parse(localStorage.getItem('arefMistakes') || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
}
function cnMisSave(a) { try { localStorage.setItem('arefMistakes', JSON.stringify(a.slice(0, 100))); } catch (e) {} }
function cnMisAdd(detail) {
  if (!Array.isArray(detail)) return;
  let a = cnMisList();
  detail.forEach((d) => {
    if (d.ok || !d.text || !Array.isArray(d.options) || typeof d.answer !== 'number') return;
    a = a.filter((x) => x.t !== d.text);
    a.unshift({ t: d.text, o: d.options, a: d.answer });
  });
  cnMisSave(a);
}
function cnMisOpen() {
  cnStopTimers(); cnSetPlaying(false);
  const list = cnMisList();
  cnS.phase = 'review';
  if (!list.length) {
    cnRoot().innerHTML = `<div class="ga-card cn-card"><div class="ga-hero">🎉</div><h3 class="ga-title">اشتباهی ذخیره نشده</h3>
      <p class="cn-note">سؤال‌هایی که در مسابقه یا تمرین اشتباه جواب بدهید اینجا جمع می‌شود تا دوباره تمرینشان کنید.</p>
      <button class="secondary-btn ga-start" id="cn-mis-back">↩ بازگشت</button></div>`;
    document.getElementById('cn-mis-back').addEventListener('click', cnOpen);
    return;
  }
  const qs = list.slice().sort(() => Math.random() - 0.5).slice(0, 10).map((x) => ({ text: x.t, options: x.o, answer: x.a }));
  cnRunPractice(qs, '📝 مرور من', true);
}

/* ---------- تمرین آزاد با محدوده (از سرور؛ بدون امتیاز) ---------- */
async function cnPracStart() {
  if (!navigator.onLine) { cnShowOffline(); return; }
  const btn = document.getElementById('cn-prac-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'در حال آماده‌سازی…'; }
  let res;
  try { res = await cnPost('/contest/practice', Object.assign({ device_id: cnS.device }, cnScopeRead('pr'))); }
  catch (e) {
    if (currentTab !== 'contest') return;
    if (btn) { btn.disabled = false; btn.textContent = '🎯 شروع تمرین (۱۰ سؤال)'; }
    try { appAlert('contest_prac_err', null, { text: cnErrText(e), title: 'شروع نشد', icon: '⚠️', tone: 'warn' }); } catch (e2) {}
    return;
  }
  if (currentTab !== 'contest') return;
  cnRunPractice(res.questions || [], '🎯 تمرین آزاد', false);
}

/* اجرای تمرین: جواب هر سؤال همان لحظه نشان داده می‌شود؛ هیچ امتیازی ثبت نمی‌شود */
function cnRunPractice(qs, title, isReview) {
  cnS.phase = 'prac';
  const st = { i: 0, ok: 0, wrongQs: [], rightTexts: [] };
  const show = () => {
    if (cnS.phase !== 'prac') return;
    if (st.i >= qs.length) { done(); return; }
    const q = qs[st.i];
    cnRoot().innerHTML = `<div class="ga-card cn-card cn-qcard">
      <div class="cn-fl-m"><span>${cnEsc(title)}</span><span>${cnFa(st.i + 1)} از ${cnFa(qs.length)}</span></div>
      <p class="cn-note">آیهٔ بعد از این آیه کدام است؟ <small>(بدون امتیاز)</small></p>
      <div class="cn-verse" dir="rtl">${cnEsc(q.text)}</div>
      <div class="cn-opts">${q.options.map((o, k) => `<button type="button" class="cn-opt" data-k="${k}"><span class="cn-opt-n">${cnFa(k + 1)}</span><span class="cn-opt-t" dir="rtl">${cnEsc(o)} …</span></button>`).join('')}</div>
      <button class="secondary-btn ga-start hidden" id="cn-prac-next">${st.i + 1 >= qs.length ? 'پایان' : 'سؤال بعدی ◀'}</button>
      <button class="ghost-btn" id="cn-prac-quit" style="width:100%;margin-top:8px">خروج از تمرین</button></div>`;
    let locked = false;
    cnRoot().querySelectorAll('.cn-opt').forEach((b) => b.addEventListener('click', () => {
      if (locked) return; locked = true;
      const k = Number(b.dataset.k), good = (k === q.answer);
      cnRoot().querySelectorAll('.cn-opt').forEach((x) => { x.disabled = true; if (Number(x.dataset.k) === q.answer) x.classList.add('right'); });
      if (!good) b.classList.add('wrong');
      if (good) { st.ok++; st.rightTexts.push(q.text); } else st.wrongQs.push(q);
      document.getElementById('cn-prac-next').classList.remove('hidden');
    }));
    document.getElementById('cn-prac-next').addEventListener('click', () => { st.i++; show(); });
    document.getElementById('cn-prac-quit').addEventListener('click', cnOpen);
    try { window.scrollTo(0, 0); } catch (e) {}
  };
  const done = () => {
    let a = cnMisList();
    if (isReview) a = a.filter((x) => st.rightTexts.indexOf(x.t) < 0); // درست جواب‌داده‌شده‌ها از فهرست خارج می‌شوند
    st.wrongQs.forEach((q) => { a = a.filter((x) => x.t !== q.text); a.unshift({ t: q.text, o: q.options, a: q.answer }); });
    cnMisSave(a);
    cnRoot().innerHTML = `<div class="ga-card cn-card cn-result"><div class="ga-hero">${st.ok === qs.length ? '🏆' : '👍'}</div>
      <p class="cn-note">${cnEsc(title)} تمام شد (بدون امتیاز)</p>
      <div class="ga-score"><b>${cnFa(st.ok)}</b> از ${cnFa(qs.length)}</div>
      <p class="cn-note">${isReview ? `${cnFa(st.ok)} مورد از فهرست اشتباهات خارج شد؛ ${cnFa(a.length)} مورد باقی است.` : (st.wrongQs.length ? `${cnFa(st.wrongQs.length)} اشتباه به «مرور من» اضافه شد.` : 'همه را درست جواب دادید!')}</p>
      <div class="ga-result-btns">
        ${(isReview && a.length) ? '<button class="secondary-btn" id="cn-pr-again">🔁 مرور دوباره</button>' : ''}
        <button class="ghost-btn" id="cn-pr-back">↩ بازگشت</button></div></div>`;
    const ag = document.getElementById('cn-pr-again'); if (ag) ag.addEventListener('click', cnMisOpen);
    document.getElementById('cn-pr-back').addEventListener('click', cnOpen);
  };
  show();
}


/* ---------- ذخیرهٔ خودکار ویدیوها روی گوشی (دانلود یک‌بار، دفعات بعد بدون ترافیک) ----------
 * هر <video> که آدرس اینترنتی دارد (ویدیوهای بارگذاری‌شده در سایت: کمک‌های مردمی، رمضان ویژه، زکات، گالری، ...)
 * با اولین «پخش» کامل روی گوشی ذخیره می‌شود (Cache Storage با اسم VIDEO_CACHE_NAME) و از همان لحظه
 * همیشه از روی گوشی پخش می‌شود (بدون اینترنت و بدون ترافیک). دانلود فقط یک بار است و همان فایل پخش می‌شود،
 * پس ترافیک دو برابر نمی‌شود. اگر ذخیره ممکن نشد (قطعی، جا نبود، سرور اجازه نداد) پخش مستقیمِ قبلی انجام می‌شود.
 * سقف حافظه VC_MAX_BYTES است؛ از سقف که بگذرد قدیمی‌ترین ویدیوها خودکار پاک می‌شوند.
 * ویدیوی تازه = آدرس تازه؛ اگر مدیر ویدیوی جدید بگذارد خودکار دوباره یک‌بار دانلود می‌شود. */
(function videoCacheModule() {
  try {
    if (!window.caches || !window.ReadableStream || typeof TransformStream === 'undefined') return;
    const IDX_KEY = 'arefanejam_video_cache_idx';
    const VC_MAX_BYTES = 700 * 1024 * 1024;
    const inflight = {};

    function vcKey(u) { return String(u || '').replace(/#.*$/, '').replace(/^http:\/\//i, 'https://'); }
    function vcMime(u) {
      const m = /\.(mp4|webm|ogv|m4v|mov)(\?|#|$)/i.exec(String(u || ''));
      const e = m ? m[1].toLowerCase() : 'mp4';
      return e === 'webm' ? 'video/webm' : e === 'ogv' ? 'video/ogg' : e === 'mov' ? 'video/quicktime' : 'video/mp4';
    }
    function vcFa(n) { return (typeof toPersianDigits === 'function') ? toPersianDigits(String(n)) : String(n); }
    function vcMb(b) { return vcFa((b / 1048576).toFixed(1).replace('.', '٫')); }
    function idxRead() { try { return JSON.parse(localStorage.getItem(IDX_KEY) || '{}') || {}; } catch (e) { return {}; } }
    function idxWrite(o) { try { localStorage.setItem(IDX_KEY, JSON.stringify(o)); } catch (e) {} }
    function idxTouch(k) { const o = idxRead(); if (o[k]) { o[k].t = Date.now(); idxWrite(o); } }
    function idxForget(k) { const o = idxRead(); if (o[k]) { delete o[k]; idxWrite(o); } }
    async function evictIfNeeded(keepKey) {
      try {
        const o = idxRead();
        let sum = 0; Object.keys(o).forEach((k) => { sum += (o[k].s || 0); });
        if (sum <= VC_MAX_BYTES) return;
        const cache = await caches.open(VIDEO_CACHE_NAME);
        const order = Object.keys(o).filter((k) => k !== keepKey).sort((a, b) => (o[a].t || 0) - (o[b].t || 0));
        for (const k of order) {
          if (sum <= VC_MAX_BYTES) break;
          sum -= (o[k].s || 0);
          try { await cache.delete(k); } catch (e) {}
          delete o[k];
        }
        idxWrite(o);
      } catch (e) {}
    }

    /* ---- ظاهر: نوار کوچک زیر ویدیو ---- */
    if (!document.getElementById('vc-style')) {
      const st = document.createElement('style');
      st.id = 'vc-style';
      st.textContent = '.vc-bar{direction:rtl;text-align:center;font-size:12px;line-height:1.8;margin:4px 0 8px;padding:5px 10px;border-radius:10px;background:rgba(127,127,127,.12);color:inherit}'
        + '.vc-bar.vc-ok{font-size:11px;opacity:.75;background:transparent;padding:2px 6px;margin:2px 0 6px}'
        + '.vc-prog{height:5px;border-radius:3px;background:rgba(127,127,127,.3);overflow:hidden;margin:5px 0}'
        + '.vc-prog i{display:block;height:100%;width:0;background:#1f8a70;transition:width .25s}'
        + '.vc-bar button{font:inherit;font-size:12px;border:1px solid rgba(127,127,127,.5);background:transparent;color:inherit;border-radius:8px;padding:2px 10px;margin-top:2px}';
      document.head.appendChild(st);
    }
    function barOf(v) {
      let b = v.__vcBar;
      if (!b || !b.isConnected) {
        b = document.createElement('div');
        b.className = 'vc-bar';
        if (v.parentNode) v.insertAdjacentElement('afterend', b);
        v.__vcBar = b;
      }
      return b;
    }
    function barText(v, text, ok) {
      const b = barOf(v);
      b.className = 'vc-bar' + (ok ? ' vc-ok' : '');
      b.textContent = text;
      return b;
    }
    function barClear(v) { if (v.__vcBar) { try { v.__vcBar.remove(); } catch (e) {} v.__vcBar = null; } }

    /* ---- دانلود کامل داخل Cache Storage (مشترک بین چند ویدیوی هم‌آدرس) ---- */
    function proxyUrl(orig) {
      try {
        const api = (typeof DEFAULT_API_URL === 'string' && DEFAULT_API_URL) ? DEFAULT_API_URL : '';
        if (!api) return '';
        if (new URL(orig).hostname !== new URL(api).hostname) return '';
        return api.replace(/\/+$/, '') + '/media-file?u=' + encodeURIComponent(orig);
      } catch (e) { return ''; }
    }
    function downloadOnce(key, orig) {
      if (inflight[key]) return inflight[key];
      const job = { listeners: [], ctl: new AbortController(), refs: 0 };
      job.promise = (async () => {
        try {
          try {
            if (navigator.storage && navigator.storage.estimate) {
              const e = await navigator.storage.estimate();
              if (e && e.quota && e.usage != null && (e.quota - e.usage) < 60 * 1048576) return false; // جای کافی نیست
            }
          } catch (e0) {}
          const cache = await caches.open(VIDEO_CACHE_NAME);
          const tries = [orig];
          const px = proxyUrl(orig); if (px) tries.push(px);
          for (const u of tries) {
            let res;
            try { res = await fetch(u, { mode: 'cors', credentials: 'omit', signal: job.ctl.signal }); }
            catch (e1) { if (job.ctl.signal.aborted) return false; continue; }
            if (!res || res.status !== 200 || !res.body) continue; // سرور CORS نداد یا فایل نبود؛ راه بعدی
            const total = Number(res.headers.get('content-length')) || 0;
            if (total > VC_MAX_BYTES) return false;
            const enc = res.headers.get('content-encoding');
            let loaded = 0;
            const counter = new TransformStream({
              transform(chunk, c) { loaded += chunk.byteLength; job.listeners.forEach((f) => { try { f(loaded, total); } catch (e2) {} }); c.enqueue(chunk); },
            });
            try {
              await cache.put(key, new Response(res.body.pipeThrough(counter), { status: 200, headers: { 'Content-Type': vcMime(orig) } }));
            } catch (e3) {
              try { await cache.delete(key); } catch (e4) {}
              if (job.ctl.signal.aborted) return false;
              continue;
            }
            if (loaded < 1000 || (total && !enc && loaded !== total)) { try { await cache.delete(key); } catch (e5) {} continue; }
            const o = idxRead(); o[key] = { s: loaded, t: Date.now() }; idxWrite(o);
            evictIfNeeded(key);
            return true;
          }
          return false;
        } catch (e) { return false; }
        finally { delete inflight[key]; }
      })();
      inflight[key] = job;
      return job;
    }

    /* ---- جایگزینی آدرس اینترنتی با نسخهٔ ذخیره‌شدهٔ روی گوشی ---- */
    async function useCached(v) {
      const st = v.__vc;
      if (!st) return false;
      try {
        const cache = await caches.open(VIDEO_CACHE_NAME);
        const hit = await cache.match(st.key);
        if (!hit) { idxForget(st.key); return false; }
        const blob = await hit.blob();
        if (!blob || blob.size < 1000) { try { await cache.delete(st.key); } catch (e) {} idxForget(st.key); return false; }
        if (v.__vc !== st) return false; // در این فاصله آدرس ویدیو عوض شد
        const typed = /^video\//.test(blob.type || '') ? blob : new Blob([blob], { type: vcMime(st.orig) });
        if (st.blobUrl) { try { URL.revokeObjectURL(st.blobUrl); } catch (e) {} }
        st.blobUrl = URL.createObjectURL(typed);
        st.state = 'cached';
        v.preload = 'metadata';
        v.setAttribute('src', st.blobUrl);
        idxTouch(st.key);
        barText(v, '📱 روی گوشی ذخیره است؛ بدون اینترنت و بدون ترافیک پخش می‌شود', true);
        return true;
      } catch (e) { return false; }
    }
    function giveUpCached(v) {
      const st = v.__vc; if (!st) return;
      st.state = 'direct';
      v.preload = 'metadata';
      v.setAttribute('src', st.orig);
    }

    function setup(v) {
      if (v.__vc) return;
      const raw = v.getAttribute('src') || '';
      if (!/^https?:\/\//i.test(raw)) return;
      const st = { orig: raw, key: vcKey(raw), state: 'new', blobUrl: '' };
      v.__vc = st;
      if (idxRead()[st.key]) {
        st.state = 'swapping';
        v.preload = 'none'; // تا آماده شدن نسخهٔ گوشی، هیچ درخواستی به سایت نرود
        useCached(v).then((ok) => { if (!ok && v.__vc === st) giveUpCached(v); });
      }
    }
    function startDownload(v) {
      const st = v.__vc;
      st.state = 'downloading';
      const job = downloadOnce(st.key, st.orig);
      const bar = barText(v, '⬇️ در حال ذخیرهٔ ویدیو روی گوشی… (فقط همین یک بار)');
      const prog = document.createElement('div'); prog.className = 'vc-prog'; const fill = document.createElement('i'); prog.appendChild(fill);
      const lab = document.createElement('div');
      const btn = document.createElement('button'); btn.type = 'button'; btn.textContent = '▶ پخش مستقیم بدون ذخیره';
      bar.textContent = ''; bar.appendChild(document.createTextNode('⬇️ در حال ذخیرهٔ ویدیو روی گوشی (فقط همین یک بار)')); bar.appendChild(prog); bar.appendChild(lab); bar.appendChild(btn);
      let cancelled = false;
      const onProg = (loaded, total) => {
        if (total) { const p = Math.min(100, Math.round(loaded * 100 / total)); fill.style.width = p + '%'; lab.textContent = vcFa(p) + '٪ — ' + vcMb(loaded) + ' از ' + vcMb(total) + ' مگابایت'; }
        else { fill.style.width = '40%'; lab.textContent = vcMb(loaded) + ' مگابایت'; }
      };
      job.listeners.push(onProg);
      job.refs++;
      const direct = () => {
        cancelled = true;
        st.state = 'direct'; st.noCache = true;
        job.refs--; if (job.refs <= 0) { try { job.ctl.abort(); } catch (e) {} }
        barClear(v);
        try { v.play(); } catch (e) {}
      };
      btn.addEventListener('click', direct);
      job.promise.then(async (ok) => {
        if (cancelled || v.__vc !== st) return;
        job.refs--;
        if (ok && await useCached(v)) {
          try { await v.play(); } catch (e) { barText(v, '✅ روی گوشی ذخیره شد؛ دکمهٔ پخش را بزنید', true); }
          return;
        }
        st.state = 'direct';
        barText(v, 'ذخیره روی گوشی ممکن نشد؛ ویدیو مستقیم پخش می‌شود', true);
        try { v.play(); } catch (e) {}
      });
    }

    /* اولین «پخش» ویدیوی ذخیره‌نشده: متوقف، دانلود کامل، بعد پخش از روی گوشی */
    document.addEventListener('play', (e) => {
      const v = e.target;
      if (!v || v.tagName !== 'VIDEO') return;
      const st = v.__vc;
      if (!st) return;
      if (st.state === 'new') {
        if (navigator.onLine === false) { st.state = 'direct'; return; }
        e.stopImmediatePropagation();
        try { v.pause(); } catch (e1) {}
        startDownload(v);
      } else if (st.state === 'downloading' || st.state === 'swapping') {
        e.stopImmediatePropagation();
        try { v.pause(); } catch (e2) {}
      }
    }, true);

    function onSrcAttr(v) {
      const raw = v.getAttribute('src') || '';
      if (/^blob:/i.test(raw)) return;
      const st = v.__vc;
      if (st && raw === st.orig) return;
      if (st) {
        if (st.blobUrl) { try { URL.revokeObjectURL(st.blobUrl); } catch (e) {} }
        barClear(v); v.__vc = null;
      }
      if (raw) setup(v);
    }
    function dropped(node) {
      if (node.nodeType !== 1) return;
      const list = node.tagName === 'VIDEO' ? [node] : (node.querySelectorAll ? Array.from(node.querySelectorAll('video')) : []);
      list.forEach((v) => {
        const st = v.__vc;
        if (!st || !st.blobUrl) return;
        setTimeout(() => { if (!v.isConnected && st.blobUrl) { try { URL.revokeObjectURL(st.blobUrl); } catch (e) {} st.blobUrl = ''; } }, 4000);
      });
    }
    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === 'attributes') { if (m.target && m.target.tagName === 'VIDEO') onSrcAttr(m.target); continue; }
        m.addedNodes.forEach((n) => {
          if (n.nodeType !== 1) return;
          if (n.tagName === 'VIDEO') setup(n);
          else if (n.querySelectorAll) n.querySelectorAll('video').forEach(setup);
        });
        m.removedNodes.forEach(dropped);
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
    document.querySelectorAll('video').forEach(setup);

    // برای آینده: اطلاع از حجم و پاک‌کردن ویدیوهای ذخیره‌شده
    window.arefVideoCache = {
      size() { const o = idxRead(); let s = 0; Object.keys(o).forEach((k) => { s += (o[k].s || 0); }); return s; },
      async clear() { try { await caches.delete(VIDEO_CACHE_NAME); } catch (e) {} idxWrite({}); },
    };
  } catch (err) { /* این قابلیت اختیاری است؛ هر خطایی باعث توقف اپ نشود */ }
})();

window.__arefBooted = true;
