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

function computePrayerTimesLocal(lat, lng, date, methodKey, asrFactor, offsets) {
  offsets = offsets || {};
  const method = CALC_METHODS[methodKey] || CALC_METHODS.MoonsightingCommittee;
  const timezone = -date.getTimezoneOffset() / 60;
  const jd = julianDate(date.getFullYear(), date.getMonth() + 1, date.getDate()) - lng / (15 * 24);
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

function getCalendarStrings(date) {
  const [jy, jm, jd] = gregorianToJalali(date.getFullYear(), date.getMonth() + 1, date.getDate());
  const [hy, hm, hd] = islamicFromJulianDay(julianDayFromGregorian(date.getFullYear(), date.getMonth() + 1, date.getDate()));
  const weekday = WEEKDAYS_FA[date.getDay()];
  return {
    jalali: `${weekday} ${toPersianDigits(jd)} ${JALALI_MONTHS[jm - 1]} ${toPersianDigits(jy)}`,
    gregorian: `${weekday} ${toPersianDigits(date.getDate())} ${GREGORIAN_MONTHS[date.getMonth()]} ${toPersianDigits(date.getFullYear())}`,
    hijri: `${weekday} ${toPersianDigits(hd)} ${HIJRI_MONTHS[hm - 1]} ${toPersianDigits(hy)}`,
  };
}

/* ===================== عارفان جام - منطق اصلی اپلیکیشن ===================== */

const DEFAULT_API_URL = 'https://arefanejam.com/wp-json/arefanejam/v1';
const KAABA = { lat: 21.4225, lng: 39.8262 };
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
  return toPersianDigits(date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
}
function apiFetch(path, options = {}) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
  return fetch(state.apiUrl.replace(/\/$/, '') + path, Object.assign({}, options, { headers }))
    .then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'خطا در ارتباط با سرور');
      return data;
    });
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
  document.getElementById('topbar-back').classList.toggle('hidden', tabName === 'home');

  if (tabName !== 'quran-reader') disconnectQuranReadingTracker();
  if (leavingSurahNumber && tabName !== 'quran-reader') maybeShowQuranSurahExitPopup(leavingSurahNumber);
  if (tabName === 'lesson') loadVerseOfDay();
  if (tabName === 'about') renderAboutPage();
  if (tabName === 'qibla') autoStartQibla();
  if (tabName === 'quran-list') onQuranListOpened();
  if (tabName === 'quran-juz') renderJuzList();
  if (tabName === 'quran-bookmarks') renderBookmarksPage();
  if (tabName === 'hifz-progress') loadHifzProgress();
  if (tabName === 'prayer-stats') renderWeeklyPrayerStats();
  if (tabName === 'prayer-checklist') renderPrayerChecklist();
  if (tabName === 'daily-deeds') openDailyDeeds();
  if (tabName === 'quran-report') renderQuranReportTab();
  if (tabName === 'date-converter') populateConverterSelects();
  if (tabName === 'sajdah-list') renderSajdahList();
  if (tabName === 'news-list') loadNewsList();
  if (tabName === 'social') loadSocialLinks();
  if (tabName === 'gallery') loadGallery();
  if (tabName === 'books') loadBooks();
  if (tabName === 'shariq') loadShariqCategories();
  if (tabName === 'shariq-mine') loadShariqMine();
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
document.getElementById('topbar-back').addEventListener('click', () => {
  if (overlayStack.length) { history.back(); return; }
  goBackInApp();
});
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
  if (currentTab !== 'home') { goBackInApp(); return; }
  maybeConfirmExit();
});

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

/* ---------- تأیید خروج از برنامه ---------- */
let exitGuardPushed = false;
function maybeConfirmExit() {
  const cfg = state.exitConfirm || {};
  if (cfg.enabled === '0') return; // مدیر این قابلیت را خاموش کرده؛ اجازه بده خروج طبیعی انجام شود
  try { history.pushState({ arefanejamHome: true }, '', location.pathname + location.search); } catch (e) {}
  document.getElementById('exit-confirm-message').textContent = cfg.text || 'آیا قصد خروج از برنامه را دارید؟';
  document.getElementById('exit-confirm-modal').classList.remove('hidden');
}
document.getElementById('exit-confirm-yes').addEventListener('click', () => {
  document.getElementById('exit-confirm-modal').classList.add('hidden');
  try { history.go(-2); } catch (e) {}
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
function findEventForJalaliDate(jy, jm, jd) {
  return calendarEvents.find((ev) =>
    Number(ev.jalali_month) === jm && Number(ev.jalali_day) === jd &&
    (Number(ev.recurring_yearly) === 1 || Number(ev.jalali_year) === jy)
  );
}

function jalaliMonthLength(jy, jm) {
  const [ngy, ngm, ngd] = (jm === 12) ? jalaliToGregorian(jy + 1, 1, 1) : jalaliToGregorian(jy, jm + 1, 1);
  const nextStart = new Date(ngy, ngm - 1, ngd);
  const [tgy, tgm, tgd] = jalaliToGregorian(jy, jm, 1);
  const thisStart = new Date(tgy, tgm - 1, tgd);
  return Math.round((nextStart - thisStart) / 86400000);
}

function renderMonthGrid() {
  const grid = document.getElementById('month-grid');
  grid.innerHTML = '';
  document.getElementById('month-label').textContent = JALALI_MONTHS[calendarViewMonth - 1] + ' ' + toPersianDigits(calendarViewYear);

  const [gy1, gm1, gd1] = jalaliToGregorian(calendarViewYear, calendarViewMonth, 1);
  const firstDate = new Date(gy1, gm1 - 1, gd1);
  const leadIndex = (firstDate.getDay() + 1) % 7; // هفته فارسی از شنبه شروع می‌شود
  const monthLen = jalaliMonthLength(calendarViewYear, calendarViewMonth);
  const todayJalali = gregorianToJalali(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());

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
    const hasEvent = !!findEventForJalaliDate(calendarViewYear, calendarViewMonth, day);
    const cell = document.createElement('div');
    cell.className = 'month-cell' + (isToday ? ' is-today' : '') + (isSelected ? ' is-selected' : '') + (isFriday && !isSelected ? ' is-friday' : '') + (hasEvent ? ' has-event' : '');
    cell.textContent = toPersianDigits(day);
    cell.addEventListener('click', () => { selectedDate = cellDate; renderCalendarWidget(); });
    grid.appendChild(cell);
  }
}

function renderCalendarWidget() {
  const [jy, jm, jd] = gregorianToJalali(selectedDate.getFullYear(), selectedDate.getMonth() + 1, selectedDate.getDate());
  calendarViewYear = jy; calendarViewMonth = jm;

  const isToday = selectedDate.toDateString() === new Date().toDateString();
  document.getElementById('calendar-today-btn').classList.toggle('hidden', isToday);
  const strs = getCalendarStrings(selectedDate);
  document.getElementById('calendar-main-date').textContent = strs[activeCalendar];
  const others = ['jalali', 'gregorian', 'hijri'].filter((c) => c !== activeCalendar);
  document.getElementById('calendar-sub-date').textContent = others.map((c) => strs[c]).join(' | ');
  document.querySelectorAll('.cal-tab').forEach((t) => t.classList.toggle('active', t.dataset.cal === activeCalendar));
  renderMonthGrid();

  const eventCardEl = document.getElementById('calendar-event-card');
  const event = findEventForJalaliDate(jy, jm, jd);
  if (event) {
    eventCardEl.innerHTML = `
      <div class="event-card">
        ${event.image_url ? `<img src="${event.image_url}" alt="">` : ''}
        <div class="event-card-text">
          <h4>${event.title}</h4>
          <p>${event.description || ''}</p>
        </div>
      </div>`;
  } else {
    eventCardEl.innerHTML = '';
  }
}
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
document.getElementById('month-prev-btn').addEventListener('click', () => {
  calendarViewMonth--;
  if (calendarViewMonth < 1) { calendarViewMonth = 12; calendarViewYear--; }
  const [gy, gm, gd] = jalaliToGregorian(calendarViewYear, calendarViewMonth, 1);
  selectedDate = new Date(gy, gm - 1, gd);
  renderCalendarWidget();
});
document.getElementById('month-next-btn').addEventListener('click', () => {
  calendarViewMonth++;
  if (calendarViewMonth > 12) { calendarViewMonth = 1; calendarViewYear++; }
  const [gy, gm, gd] = jalaliToGregorian(calendarViewYear, calendarViewMonth, 1);
  selectedDate = new Date(gy, gm - 1, gd);
  renderCalendarWidget();
});
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

async function loadSettings() {
  try {
    state.settings = await apiFetch('/settings');
    try { localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(state.settings)); } catch (e) {}
    document.getElementById('topbar-title').textContent = state.settings.brand_name || 'عارفان جام';
    if (state.settings.logo_url) document.getElementById('topbar-logo').src = state.settings.logo_url;
    applyQuranReportTexts();
    renderAnnouncement();
    checkForNewAnnouncement();
    maybeShowIntroSplash();
    updateStickyNotification(null); // نمایش فوری تاریخ امروز، حتی قبل از آماده‌شدن موقعیت مکانی برای اذان بعدی
    prefetchAzanAudioForOffline();
    prefetchAnnouncementAudioForOffline();
    checkQuranInvitePopup();
    checkQuranInactivityPopup();
  } catch (err) {
    console.warn('تنظیمات سایت دریافت نشد.', err);
    // آفلاین در همان بازِ اول اپ: آخرین تنظیماتِ ذخیره‌شدهٔ گوشی را جایگزین کن
    // تا محاسبهٔ اوقات شرعی و پخش اذان متوقف نشود.
    try {
      const cached = JSON.parse(localStorage.getItem(SETTINGS_CACHE_KEY) || 'null');
      if (cached) {
        state.settings = cached;
        document.getElementById('topbar-title').textContent = cached.brand_name || 'عارفان جام';
        if (cached.logo_url) document.getElementById('topbar-logo').src = cached.logo_url;
        applyQuranReportTexts();
        prefetchAzanAudioForOffline();
        prefetchAnnouncementAudioForOffline();
        checkQuranInvitePopup();
        checkQuranInactivityPopup();
      }
    } catch (e2) {}
  }
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
  if (localStorage.getItem('arefanejam_bg_mode') === '1') return;
  setTimeout(() => location.reload(), 1200);
});
updateOfflineBanner();

/* ---------- بارگذاری مجدد دستی (دکمهٔ نوار بالا) + غیرفعال‌سازی کشیدن به پایین برای رفرش ---------- */
function hardReloadApp() {
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
  const s = state.settings || {};
  if (!s.intro_video_url) return;
  const splash = document.getElementById('intro-splash');
  const video = document.getElementById('intro-video');
  video.src = s.intro_video_url;
  splash.classList.remove('hidden');
  const hide = () => splash.classList.add('hidden');
  video.addEventListener('ended', hide, { once: true });
  document.getElementById('intro-skip-btn').addEventListener('click', hide, { once: true });
  video.play().catch(hide);
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
function saveCoordsCache(coords, label) {
  localStorage.setItem(COORDS_CACHE_KEY, JSON.stringify(Object.assign({}, coords, { label, ts: Date.now() })));
}

// متن موقعیت مکانی را همزمان در تب «اذان» و تب «قبله» (در صورت وجود) به‌روزرسانی می‌کند
function setLocationLabel(text) {
  const azanEl = document.getElementById('azan-location-label');
  if (azanEl) azanEl.textContent = text;
  const qiblaEl = document.getElementById('qibla-location-label');
  if (qiblaEl) qiblaEl.textContent = text;
}

// هر جا مختصات جدیدی به دست بیاید (GPS، شهر دستی، یا موقعیت پیش‌فرض ادمین)، بلافاصله و
// در پس‌زمینه زاویهٔ قبله را با جدیدترین مختصات هماهنگ می‌کند — بدون نیاز به بستن/بازکردن اپ
// یا رفتن به تب قبله. اگر کاربر همان لحظه در تب قبله باشد، عقربه فوراً روی جهت درست می‌رود.
function refreshQiblaCompassIfReady() {
  updateHomeLocationBtnState();
  if (!state.coords) return;
  qiblaBearing = bearingToQibla(state.coords.lat, state.coords.lng);
  const degEl = document.getElementById('qibla-degree');
  if (degEl) degEl.textContent = 'زاویه قبله: ' + toPersianDigits(Math.round(qiblaBearing)) + '°';
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

function resolveCoordinates(skipLiveGPS) {
  return new Promise((resolve) => {
    // اگر کاربر شهر را دستی انتخاب کرده، همان اولویت دارد
    if (state.manualCity) {
      state.coords = { lat: state.manualCity.lat, lng: state.manualCity.lng };
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

    // نمایش سریع مقدار کش‌شده (اگر وجود دارد) تا کاربر منتظر نماند
    const cached = loadCachedCoords();
    if (cached) {
      state.coords = { lat: cached.lat, lng: cached.lng };
      setLocationLabel((cached.label ? cached.label : 'بر اساس آخرین موقعیت شناخته‌شده') + ' (در حال به‌روزرسانی...)');
      refreshQiblaCompassIfReady();
      computePrayerTimes();
    }

    if (!navigator.geolocation || skipLiveGPS) { return useAdminLocation(); }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        state.coords = coords;
        state.manualCity = null;
        localStorage.removeItem('arefanejam_manual_city');
        const nearestC = findNearestCity(coords.lat, coords.lng);
        state.activeCityName = nearestC ? nearestC.name : null;
        setLocationLabel('بر اساس موقعیت مکانی دستگاه شما');
        refreshQiblaCompassIfReady();
        saveCoordsCache(coords, 'بر اساس موقعیت مکانی دستگاه شما');
        resolve(coords);
      },
      (err) => {
        if (!cached) {
          if (err.code === 1) {
            setLocationLabel('دسترسی به موقعیت مکانی رد شده است. از تنظیمات گوشی «مکان» را فعال کنید، یا شهر خود را از فهرست انتخاب کنید.');
          }
          useAdminLocation();
        } else {
          resolve(state.coords);
        }
      },
      { timeout: 4000, maximumAge: 900000, enableHighAccuracy: false }
    );
  });
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
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      state.manualCity = null;
      localStorage.removeItem('arefanejam_manual_city');
      const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      state.coords = coords;
      const nearest = findNearestCity(coords.lat, coords.lng);
      state.activeCityName = nearest ? nearest.name : null;
      const label = nearest
        ? `موقعیت دقیق شما (نزدیک‌ترین شهر: ${nearest.name})`
        : 'بر اساس موقعیت مکانی دستگاه شما';
      saveCoordsCache(coords, label);
      setLocationLabel(label);
      // بلافاصله و در پس‌زمینه به‌روزرسانی می‌شود؛ کاربر نیازی به بستن/بازکردن اپ ندارد
      refreshQiblaCompassIfReady();
      computePrayerTimes();
      if (currentTab === 'qibla') autoStartQibla();
      onDone(null);
    },
    (err) => {
      const messages = {
        1: 'دسترسی به موقعیت مکانی رد شده است. روی آیکون قفل/اطلاعات کنار آدرس سایت در مرورگر بزنید و دسترسی «Location» را روی Allow بگذارید.',
        2: 'موقعیت مکانی در دسترس نیست (GPS گوشی را روشن کنید).',
        3: 'زمان جست‌وجوی موقعیت به پایان رسید. دوباره امتحان کنید.',
      };
      onDone(messages[err.code] || ('خطای ناشناخته در دریافت موقعیت (کد ' + err.code + ')'));
    },
    { timeout: 12000, enableHighAccuracy: true, maximumAge: 0 }
  );
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

document.getElementById('qibla-gps-btn').addEventListener('click', () => {
  const btn = document.getElementById('qibla-gps-btn');
  const textEl = btn.querySelector('.location-chip-text');
  const original = textEl.textContent;
  textEl.textContent = 'در حال یافتن...';
  btn.classList.add('is-loading');
  btn.disabled = true;
  fetchExactGPSLocation((error) => {
    btn.classList.remove('is-loading');
    btn.disabled = false;
    textEl.textContent = original;
    if (error) {
      document.getElementById('qibla-status').textContent = error;
    } else {
      btn.classList.add('is-success');
      setTimeout(() => btn.classList.remove('is-success'), 650);
    }
  });
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
  const cal = getCalendarStrings(new Date());
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
  const cal = getCalendarStrings(new Date());
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
  const cal = getCalendarStrings(new Date());
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
    navigator.clipboard.writeText(text).then(() => alert('اوقات شرعی کپی شد.'));
  }
}

function openAzanShareChoiceModal() {
  if (!lastPrayerList.length) { alert('هنوز اوقات شرعی محاسبه نشده؛ موقعیت مکانی را مشخص کنید.'); return; }
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
function buildPrayerListForDate(date) {
  const s = state.settings || {};
  const asrFactor = (s.asr_method === 'Shafi') ? 1 : 2;
  const offsets = {
    fajr: s.offset_fajr, sunrise: s.offset_sunrise, dhuhr: s.offset_dhuhr,
    asr: s.offset_asr, maghrib: s.offset_maghrib, sunset: s.offset_sunset, isha: s.offset_isha,
  };
  const times = computePrayerTimesLocal(state.coords.lat, state.coords.lng, date, s.calc_method, asrFactor, offsets);

  const [ejy, ejm, ejd] = gregorianToJalali(date.getFullYear(), date.getMonth() + 1, date.getDate());

  // برای شهر تربت‌جام، به‌جای محاسبهٔ نجومی، از جدول دقیق اوقات شرعی (طبق تقویم رسمی تربت‌جام) استفاده می‌شود.
  // این جدول همراه خود اپ ذخیره شده، پس کاملاً آفلاین کار می‌کند و نیازی به اینترنت ندارد.
  // اگر تاریخ روز جاری در جدول نباشد (مثلاً بعد از پایان سال ۱۴۰۵)، به‌صورت خودکار به محاسبهٔ نجومی برمی‌گردد.
  if ((state.activeCityName || '').trim() === 'تربت جام') {
    const tjKey = String(ejm).padStart(2, '0') + '-' + String(ejd).padStart(2, '0');
    const tjRow = TORBAT_JAM_EXACT_TIMES[tjKey];
    if (tjRow) {
      const [tjFajr, tjSunrise, tjDhuhr, tjAsr, tjMaghrib, tjIsha] = tjRow;
      const toExactDate = (hhmm) => {
        const [h, m] = hhmm.split(':').map(Number);
        const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        d.setHours(h, m, 0, 0);
        return d;
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

  const exception = findAzanException(ejm, ejd, state.activeCityName);
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
  return list;
}

function computePrayerTimes() {
  if (!state.coords) return;
  const s = state.settings || {};
  const date = new Date();
  const list = buildPrayerListForDate(date);

  const now = new Date();
  let currentKey = list[0].key;
  list.forEach((p) => { if (now >= p.time) currentKey = p.key; });
  const NON_PRAYER_KEYS = ['sunrise', 'sunset'];
  const upcoming = list.find((p) => p.time > now && !NON_PRAYER_KEYS.includes(p.key)) || list.find((p) => !NON_PRAYER_KEYS.includes(p.key));

  lastPrayerList = list;
  lastPrayerCurrentKey = currentKey;
  prepareTodayShareVerse();

  renderPrayerList('home-prayer-list', list, currentKey);
  renderPrayerList('azan-prayer-list', list, currentKey);

  document.getElementById('home-next-prayer-name').textContent = upcoming.label;
  document.getElementById('home-next-prayer-time').textContent = formatTime(upcoming.time);
  updateCountdown(upcoming.time);

  checkAzanAlarm(list, now);
  checkPrayerTimeAlarm(list, now);
  scheduleNextAzanTimer(list, now);
  updateStickyNotification(upcoming);
  syncScheduleToServiceWorker(list);
}

/* ---------- ارسال زمان‌بندی امروز به سرویس‌ورکر (لایهٔ یدکیِ پخش اذان در پس‌زمینه) ----------
   سرویس‌ورکر به localStorage دسترسی ندارد، پس با هر بار محاسبهٔ اوقات شرعی، زمان‌بندی
   امروز + آدرس صدای اذان از اینجا برایش پیام‌رسانی و در IndexedDB خودش ذخیره می‌شود
   تا اگر اپ کاملاً بسته شد و Periodic Background Sync سرویس‌ورکر را بیدار کرد، بتواند
   بدون نیاز به شبکه بفهمد الان وقت کدام اذان است. */
let lastScheduleSyncKey = '';
function syncScheduleToServiceWorker(list) {
  const swReady = ('serviceWorker' in navigator) && !!navigator.serviceWorker.controller;
  if (!swReady && !window.NativeAlarms) return;
  const s = state.settings || {};
  const NON_PRAYER_KEYS = ['sunrise', 'sunset'];
  // امروز + ۳ روز بعد، تا اگر اپ چند روز باز نشد هم اذان‌ها و یادآوری «وقت نماز» آفلاین سر وقت بیایند
  // (هر بار اپ باز شود، همین فهرست با زمان‌های دقیق‌تر دوباره جایگزین می‌شود).
  const allLists = [list];
  try {
    for (let i = 1; i <= 6; i++) {
      const d = new Date(); d.setDate(d.getDate() + i);
      allLists.push(buildPrayerListForDate(d));
    }
  } catch (e) { /* اگر محاسبه برای روزهای بعد شکست خورد، فقط امروز فرستاده می‌شود */ }
  const prayers = [];
  allLists.forEach((dayList) => dayList
    .filter((p) => !NON_PRAYER_KEYS.includes(p.key))
    .forEach((p) => prayers.push({ key: p.key, label: p.label, timeIso: p.time.toISOString() })));
  const enabled = s.azan_enabled !== '';
  const voiceId = s.azan_voice_active || '';
  const key = JSON.stringify(prayers) + '|' + (s.azan_audio_url || '') + '|' + voiceId + '|' + enabled;
  if (key === lastScheduleSyncKey) return; // چیزی تغییر نکرده
  lastScheduleSyncKey = key;
  // نسخهٔ اندروید (Capacitor): آلارم‌ها به سیستم آلارم خود اندروید سپرده می‌شوند
  if (window.NativeAlarms) window.NativeAlarms.syncSchedule(prayers, enabled, s.brand_name || 'عارفان جام', voiceId);
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

  const cal = getCalendarStrings(new Date());
  const brand = s.brand_name || 'عارفان جام';
  const custom = String(s.sticky_custom_text || '').trim(); // متنی که مدیر در پیشخوان سایت نوشته
  const lines = [cal.jalali];
  if (custom) lines.push(custom);
  lines.push(cal.gregorian, cal.hijri);
  if (upcoming) lines.push('اذان بعدی: ' + upcoming.label + ' — ساعت ' + formatTime(upcoming.time));
  const body = lines.join('\n');
  if (body === lastStickyBody) return; // چیزی تغییر نکرده، دوباره ننویس
  lastStickyBody = body;

  // نسخهٔ اندروید (Capacitor): نوتیفیکیشن بومیِ ثابت که روی صفحهٔ قفل هم دیده می‌شود
  if (hasNative) {
    const extra = lines.filter((l) => l !== cal.jalali && l !== custom);
    window.NativeAlarms.syncSticky({
      title: brand + ' — ' + cal.jalali,       // نام اپ + تاریخ امروز
      text: custom || extra[extra.length - 1] || cal.gregorian, // متن مدیر (اگر نبود، اذان بعدی)
      lines: (custom ? [custom] : []).concat(extra),
    });
    return;
  }

  if (!('serviceWorker' in navigator) || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

  navigator.serviceWorker.getRegistration('push-worker.js').then((reg) => {
    if (!reg) return;
    reg.showNotification(brand, {
      body,
      icon: s.logo_url || undefined,
      badge: s.logo_url || undefined,
      image: (s.sticky_info && s.sticky_info.banner_url) || undefined,
      tag: 'arefanejam-sticky',
      silent: true,
      requireInteraction: true,
      renotify: false,
      data: { link: '' },
    }).catch(() => {});
  }).catch(() => {});
}
// هر بار اپ دوباره باز/جلو آمد، تاریخ (و متن) نوتیفیکیشن ثابت دوباره تازه می‌شود (مثلاً بعد از تغییر روز)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { lastStickyBody = ''; updateStickyNotification(lastStickyUpcoming); }
});

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
  if (on) {
    ensureKeepAlive();
    // اجازهٔ اعلان هم برای هشدار یدکی لازم است
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') { try { Notification.requestPermission(); } catch (e) {} }
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
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') { try { Notification.requestPermission(); } catch (e) {} }
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

function renderDailyDeedsWeekReport() {
  const el = document.getElementById('daily-deeds-week-report');
  const totalEl = document.getElementById('daily-deeds-week-total');
  if (!el) return;
  const log = getDailyDeedsLog();
  const counts = {}; // id -> { title, count }
  const currentTitles = {};
  (dailyDeedsItems.length ? dailyDeedsItems : readCachedDailyDeeds()).forEach((it) => {
    currentTitles[it.id] = (it.icon ? it.icon + ' ' : '') + it.title;
  });
  let confirmedDays = 0, totalDeeds = 0;
  for (let i = 0; i < 7; i++) {
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
  // اعمالی که هنوز در فهرست هستند ولی این هفته انجام نشده‌اند هم با عدد صفر نشان داده می‌شوند
  Object.keys(currentTitles).forEach((id) => {
    if (!counts[id]) counts[id] = { title: currentTitles[id], count: 0 };
  });
  const rows = Object.values(counts).sort((a, b) => b.count - a.count);
  el.innerHTML = '';
  if (!rows.length) { totalEl.textContent = ''; return; }
  totalEl.textContent = confirmedDays
    ? 'در این هفته ' + toPersianDigits(totalDeeds) + ' عمل نیک ثبت کرده‌اید (در ' + toPersianDigits(confirmedDays) + ' روز از ۷ روز).'
    : 'در ۷ روز اخیر هنوز عملی ثبت نشده است.';
  rows.forEach((r) => {
    const row = document.createElement('div');
    row.className = 'daily-deeds-history-row is-block' + (r.count ? '' : ' is-empty');
    row.innerHTML = '<div class="deeds-row-top"><span></span><span class="deeds-count"></span></div><div class="deeds-bar"><i></i></div>';
    row.querySelector('span').textContent = r.title;
    row.querySelector('.deeds-count').textContent = toPersianDigits(r.count) + ' بار';
    row.querySelector('i').style.width = Math.round((r.count / 7) * 100) + '%';
    el.appendChild(row);
  });
}

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
  // نگهداری فقط ۶۰ روز اخیر تا حافظه بیهوده پر نشود
  const keys = Object.keys(log).sort();
  while (keys.length > 60) delete log[keys.shift()];
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

/* ---------- قبله‌نما (خودکار، بدون نیاز به دکمه) ---------- */
let qiblaBearing = null;
let qiblaListenerAttached = false;
let calibrationFlipped = localStorage.getItem('arefanejam_qibla_flip') === '1';

function bearingToQibla(lat, lng) {
  const toRad = (d) => d * Math.PI / 180;
  const toDeg = (r) => r * 180 / Math.PI;
  const lat1 = toRad(lat), lat2 = toRad(KAABA.lat);
  const dLng = toRad(KAABA.lng - lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// اجازهٔ دسترسی به سنسور قطب‌نما (iOS) فقط یک‌بار در طول عمر صفحه لازم است؛
// نگه‌داشتن آن در یک متغیر از درخواست تکراری و از تأخیر اضافه (await) جلوگیری می‌کند
// تا در دفعات بعدی، ورود به تب قبله همیشه سریع و بدون پرش انجام شود.
let motionPermissionGranted = false;

async function autoStartQibla() {
  const statusEl = document.getElementById('qibla-status');

  // اگر شهر دستی انتخاب شده یا مختصاتی از قبل (GPS/کش/پیش‌فرض ادمین) موجود است،
  // از همان استفاده می‌شود؛ در غیر این صورت مختصات را (از طریق همان مسیر یکتای
  // resolveCoordinates، بدون تکرار جداگانهٔ GPS) به دست می‌آوریم.
  if (state.manualCity) {
    state.coords = { lat: state.manualCity.lat, lng: state.manualCity.lng };
  } else if (!state.coords) {
    statusEl.textContent = 'در حال یافتن موقعیت دقیق...';
    const coords = await resolveCoordinates();
    if (!coords) {
      statusEl.textContent = 'موقعیت مکانی پیدا نشد. از دکمه‌های بالا شهر خود را انتخاب کنید.';
      return;
    }
  }

  refreshQiblaCompassIfReady();
  statusEl.textContent = 'گوشی را صاف نگه دارید و بچرخانید...';

  if (!motionPermissionGranted) {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const perm = await DeviceOrientationEvent.requestPermission();
        if (perm !== 'granted') { statusEl.textContent = 'اجازه دسترسی به قطب‌نما داده نشد.'; return; }
        motionPermissionGranted = true;
      } catch (e) { statusEl.textContent = 'دستگاه شما از قطب‌نما پشتیبانی نمی‌کند.'; return; }
    } else {
      motionPermissionGranted = true;
    }
  }

  if (!qiblaListenerAttached) {
    qiblaListenerAttached = true;
    window.addEventListener('deviceorientationabsolute', handleOrientation, true);
    window.addEventListener('deviceorientation', handleOrientation, true);
  }
}

let smoothedHeading = null;
function handleOrientation(event) {
  if (qiblaBearing === null) return;
  let heading;
  if (typeof event.webkitCompassHeading === 'number') {
    heading = event.webkitCompassHeading;
  } else if (event.alpha !== null) {
    heading = calibrationFlipped ? event.alpha : (360 - event.alpha);
  } else { return; }

  // فیلتر نرم‌کننده روی زاویه (میانگین دایره‌ای) تا لرزش/پرش قطب‌نما کم شود
  if (smoothedHeading === null) {
    smoothedHeading = heading;
  } else {
    const alphaSmooth = 0.15;
    let diff = heading - smoothedHeading;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    smoothedHeading = (smoothedHeading + alphaSmooth * diff + 360) % 360;
  }

  const rotation = qiblaBearing - smoothedHeading;
  document.getElementById('compass-needle').style.transform = `rotate(${rotation}deg)`;

  // نرمال‌سازی اختلاف به بازهٔ ۱۸۰- تا ۱۸۰ برای تشخیص «رو به قبله بودن»
  let diffFromTarget = ((rotation % 360) + 360) % 360;
  if (diffFromTarget > 180) diffFromTarget -= 360;
  const absDiff = Math.abs(diffFromTarget);

  const kaabaEl = document.getElementById('qibla-kaaba-icon');
  const targetKaabaEl = document.getElementById('qibla-target-kaaba');
  const statusEl = document.getElementById('qibla-status');
  if (absDiff <= 6) {
    kaabaEl.classList.add('is-aligned');
    targetKaabaEl.classList.add('is-aligned');
    kaabaEl.style.opacity = '';
    statusEl.textContent = 'جهت درست کعبه ✓';
  } else {
    kaabaEl.classList.remove('is-aligned');
    targetKaabaEl.classList.remove('is-aligned');
    kaabaEl.style.opacity = '';
    statusEl.textContent = 'در حال یافتن جهت... کمی بچرخانید';
  }
}

document.getElementById('qibla-flip-toggle').checked = calibrationFlipped;
document.getElementById('qibla-flip-toggle').addEventListener('change', (e) => {
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

document.getElementById('note-delete-btn').addEventListener('click', () => {
  if (!state.editingNoteId) return;
  if (!confirm('این یادداشت حذف شود؟')) return;
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
const TASBIH_KEY = 'arefanejam_tasbih_count';
const TASBIH_TARGET_KEY = 'arefanejam_tasbih_target';
let tasbihCount = parseInt(localStorage.getItem(TASBIH_KEY) || '0', 10);
let tasbihTarget = parseInt(localStorage.getItem(TASBIH_TARGET_KEY) || '33', 10);
const TASBIH_RING_CIRC = 2 * Math.PI * 90;
function renderTasbih() {
  document.getElementById('tasbih-count').textContent = toPersianDigits(tasbihCount);
  document.getElementById('tasbih-target-label').textContent = 'هدف: ' + toPersianDigits(tasbihTarget);
  const ring = document.getElementById('tasbih-ring-progress');
  if (ring) {
    const ratio = tasbihTarget > 0 ? Math.min(tasbihCount / tasbihTarget, 1) : 0;
    ring.style.strokeDasharray = String(TASBIH_RING_CIRC);
    ring.style.strokeDashoffset = String(TASBIH_RING_CIRC * (1 - ratio));
  }
}
document.getElementById('tasbih-counter-btn').addEventListener('click', (e) => {
  tasbihCount++;
  const btn = e.currentTarget;
  btn.classList.remove('is-tapped');
  void btn.offsetWidth;
  btn.classList.add('is-tapped');
  if (tasbihCount >= tasbihTarget) {
    if (navigator.vibrate) navigator.vibrate(80);
    btn.classList.add('is-complete');
    setTimeout(() => btn.classList.remove('is-complete'), 700);
    tasbihCount = 0;
  }
  localStorage.setItem(TASBIH_KEY, String(tasbihCount));
  renderTasbih();
});
document.getElementById('tasbih-reset-btn').addEventListener('click', () => {
  tasbihCount = 0; localStorage.setItem(TASBIH_KEY, '0'); renderTasbih();
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

function getQuranMode() { return localStorage.getItem(QURAN_MODE_KEY) === 'text' ? 'text' : 'translation'; }

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
  return null;
}

async function doDownloadQuranText(force) {
  setQuranOfflineState('loading');
  try {
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
  if (getQuranMode() !== 'text') { el.classList.add('hidden'); return; }
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
  else renderContinueReadingButton();
}
document.querySelectorAll('#quran-mode-switch button').forEach((b) => {
  b.addEventListener('click', () => {
    localStorage.setItem(QURAN_MODE_KEY, b.dataset.mode);
    syncQuranModeUi();
    if (b.dataset.mode === 'text') downloadQuranTextForOffline(false);
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
    else alert('دانلود صوت یک بخش دیگر هنوز در حال انجام است.');
    return;
  }
  if (!window.caches) { alert('این مرورگر امکان ذخیرهٔ آفلاین را ندارد.'); return; }
  if (!playbackQueue.length) { alert('متن هنوز در حال بارگذاری است؛ چند لحظه صبر کنید.'); return; }
  if (!navigator.onLine) { alert('برای ذخیرهٔ صوت باید به اینترنت وصل باشید. صوت‌های ذخیره‌شده قبلی بدون اینترنت پخش می‌شوند.'); return; }
  const reciter = currentReciter;
  const list = playbackQueue.slice();
  const have = await getCachedAyahSet(reciter);
  const todo = list.filter((a) => !have.has(a.number));
  if (!todo.length) { refreshAudioOfflineStatus(); return; }
  if (!confirm(`صوت ${toPersianDigits(todo.length)} آیه دانلود و روی گوشی ذخیره می‌شود و ممکن است چند ده مگابایت اینترنت مصرف کند. ادامه می‌دهید؟`)) return;
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
      for (const b of [128, 64]) {
        try {
          const url = buildAudioUrl(reciter, b, ayah.number);
          const res = await fetch(url);
          if (res.ok) {
            const blob = await res.blob();
            if (blob.size > 0) {
              await cache.put(url, new Response(blob, { status: 200, headers: { 'Content-Type': res.headers.get('Content-Type') || 'audio/mpeg' } }));
              ok = true;
              break;
            }
          }
        } catch (e) {}
      }
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
}
document.getElementById('audio-offline-btn').addEventListener('click', downloadAudioForOffline);

async function loadSurahList() {
  const cacheKey = 'arefanejam_surah_list_cache';
  const cached = localStorage.getItem(cacheKey);
  if (cached) { renderSurahList(JSON.parse(cached)); }
  renderContinueReadingButton();
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

function renderContinueReadingButton() {
  const btn = document.getElementById('continue-reading-btn');
  const playbackPos = getPlaybackPosition();
  if (playbackPos && playbackPos.surahName) {
    btn.textContent = `▶ ادامه از: ${playbackPos.surahName} — آیه ${toPersianDigits(playbackPos.numberInSurah)}`;
    btn.classList.remove('hidden');
    btn.onclick = () => openSurahReader(playbackPos.surahNumber, playbackPos.surahName, { skipResumeCheck: true });
    return;
  }
  const last = getLastRead();
  if (last) {
    btn.textContent = '▶ ادامه از: ' + last.name;
    btn.classList.remove('hidden');
    btn.onclick = () => openSurahReader(last.number, last.name, { skipResumeCheck: true });
  } else {
    btn.classList.add('hidden');
  }
}

function renderSurahList(surahs, filter) {
  const el = document.getElementById('quran-surah-list');
  el.innerHTML = '';
  surahs
    .filter((s) => !filter || s.name.includes(filter) || s.englishName.toLowerCase().includes(filter.toLowerCase()))
    .forEach((s) => {
      const row = document.createElement('div');
      row.className = 'city-row';
      row.innerHTML = `<strong>${toPersianDigits(s.number)}.</strong> ${s.name} <span class="muted-text small">(${s.englishName} — ${toPersianDigits(s.numberOfAyahs)} آیه)</span>`;
      row.addEventListener('click', () => openSurahReader(s.number, s.name));
      el.appendChild(row);
    });
}

document.getElementById('quran-search-input').addEventListener('input', (e) => {
  const cached = localStorage.getItem('arefanejam_surah_list_cache');
  if (cached) renderSurahList(JSON.parse(cached), e.target.value.trim());
});

let currentSurahNumber = null;
let currentReciter = localStorage.getItem('arefanejam_reciter') || 'ar.alafasy';
const recitationAudio = new Audio();

document.getElementById('reciter-select').value = currentReciter;
document.getElementById('reciter-select').addEventListener('change', (e) => {
  currentReciter = e.target.value;
  localStorage.setItem('arefanejam_reciter', currentReciter);
  refreshAudioOfflineStatus();
});

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
    } catch (e) {} // در صورت هر خطایی (مثلاً هنوز دادهٔ آفلاین آماده نیست) مستقیم برو سراغ باز کردن سوره
  }
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
    navigator.clipboard.writeText(fullText).then(() => alert('متن آیه کپی شد.'));
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
  // اول: اگر صوت این آیه با قاری انتخاب‌شده روی گوشی ذخیره شده باشد، از همان (بدون اینترنت) پخش می‌شود
  findCachedAyahAudio(currentReciter, globalAyahNumber).then((blob) => {
    if (session !== playbackSession) return;
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
    alert(navigator.onLine === false
      ? 'اتصال اینترنت شما قطع است. لطفاً اتصال را بررسی و دوباره تلاش کنید.'
      : 'در حال حاضر امکان پخش صوت این آیه وجود ندارد. لطفاً کمی بعد دوباره تلاش کنید.');
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
    if (currentSurahNumber && currentSurahNumber < 114) {
      goToNextSurahAfterFinish(currentSurahNumber, playbackSession);
    }
    return;
  }
  const ayah = playbackQueue[playQueueIndex];
  const block = playbackBlocks[playQueueIndex];
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
    alert(navigator.onLine === false
      ? 'اتصال اینترنت شما قطع است. پخش خودکار متوقف شد.'
      : 'پخش این آیه با هیچ‌کدام از منابع صوتی ممکن نشد. لطفاً دوباره روی آیه یا دکمهٔ پخش بزنید.');
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
    alert('متن هنوز در حال بارگذاری است؛ چند لحظه صبر کنید و دوباره روی دکمهٔ پخش بزنید.');
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
      const res = await fetch(`https://api.alquran.cloud/v1/search/${encodeURIComponent(q)}/all/fa.makarem`);
      const json = await res.json();
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
function renderRamadanCountdown() {
  const now = new Date();
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
  document.getElementById('ramadan-days-left').textContent = toPersianDigits(daysLeft) + ' روز';
  document.getElementById('ramadan-date-label').textContent =
    'تخمین شروع رمضان ' + toPersianDigits(targetHy) + ' — تاریخ دقیق بر اساس رؤیت هلال اعلام می‌شود';
  const duaEl = document.getElementById('ramadan-dua-text');
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
document.getElementById('zakat-calc-btn').addEventListener('click', () => {
  const amount = parseFloat(document.getElementById('zakat-amount-input').value);
  const resultEl = document.getElementById('zakat-result');
  if (!amount || amount <= 0) { resultEl.textContent = 'لطفاً مبلغ را وارد کنید.'; return; }
  const zakat = amount * 0.025;
  resultEl.textContent = 'زکات تخمینی: ' + toPersianDigits(zakat.toLocaleString('en-US')) + ' تومان';
});

/* ---------- آیات سجده (فقه حنفی) ---------- */
const SAJDAH_AYAHS_HANAFI = [
  { surah: 'اعراف', ayah: 206 }, { surah: 'رعد', ayah: 15 }, { surah: 'نحل', ayah: 50 },
  { surah: 'اسراء', ayah: 109 }, { surah: 'مریم', ayah: 58 }, { surah: 'حج', ayah: 18 },
  { surah: 'فرقان', ayah: 60 }, { surah: 'نمل', ayah: 26 }, { surah: 'سجده', ayah: 15 },
  { surah: 'ص', ayah: 24 }, { surah: 'فصلت', ayah: 38 }, { surah: 'نجم', ayah: 62 },
  { surah: 'انشقاق', ayah: 21 }, { surah: 'علق', ayah: 19 },
];
function renderSajdahList() {
  const el = document.getElementById('sajdah-list-content');
  if (el.children.length) return;
  el.innerHTML = '';
  SAJDAH_AYAHS_HANAFI.forEach((s, i) => {
    const row = document.createElement('div');
    row.className = 'city-row';
    row.textContent = toPersianDigits(i + 1) + '. سوره ' + s.surah + ' — آیه ' + toPersianDigits(s.ayah);
    el.appendChild(row);
  });
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
async function loadTheme() {
  try {
    const theme = await apiFetch('/theme');
    const root = document.documentElement.style;
    if (theme.primary) { root.setProperty('--emerald', theme.primary); root.setProperty('--emerald-light', theme.primary); }
    if (theme.accent) { root.setProperty('--gold', theme.accent); }
    if (theme.background) { root.setProperty('--paper', theme.background); }
    if (theme.text) { root.setProperty('--ink', theme.text); }
  } catch (e) { /* از رنگ‌های پیش‌فرض استفاده می‌شود */ }
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
function findAzanException(jm, jd, cityName) {
  const specific = azanExceptions.find((e) => Number(e.jalali_month) === jm && Number(e.jalali_day) === jd && e.city_name && cityName && e.city_name === cityName);
  if (specific) return specific;
  return azanExceptions.find((e) => Number(e.jalali_month) === jm && Number(e.jalali_day) === jd && !e.city_name);
}
function applyTimeOverride(date, hhmm) {
  if (!hhmm) return date;
  const [h, m] = hhmm.split(':').map(Number);
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
    { icon: '📖', label: 'گزارش قرآن', goto: 'quran-report' },
  ]},
  ibadah: { title: 'عبادت', items: [
    { icon: '📿', label: 'تسبیح دیجیتال', goto: 'tasbih' },
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
async function loadRamadanPage() {
  renderRamadanCountdown();
  try {
    const r = await apiFetch('/ramadan');
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
    if (r.image_url) html += `<img src="${r.image_url}" style="width:100%;border-radius:10px;margin-bottom:10px">`;
    if (r.video_url) html += `<video id="ramadan-video-el" src="${r.video_url}" controls style="width:100%;border-radius:10px;margin-bottom:10px"></video>`;
    if (r.text) html += `<p class="verse-translation">${r.text}</p>`;
    if (r.link_url) html += `<button class="secondary-btn small-btn" id="ramadan-link-btn" style="margin-top:8px">مشاهده لینک</button>`;
    card.innerHTML = html;
    contentBlock.appendChild(card);
    if (r.link_url) {
      document.getElementById('ramadan-link-btn').addEventListener('click', () => {
        trackClick('ramadan_link');
        window.open(r.link_url, '_blank');
      });
    }
    const ramadanVideoEl = document.getElementById('ramadan-video-el');
    if (ramadanVideoEl) ramadanVideoEl.addEventListener('play', () => trackClick('ramadan_video'), { once: true });
  }

  const specialBlock = document.getElementById('ramadan-special-block');
  specialBlock.innerHTML = '';
  if (r.active === '1') {
    const now = new Date();
    const [hy, hm, hd] = islamicFromJulianDay(julianDayFromGregorian(now.getFullYear(), now.getMonth() + 1, now.getDate()));
    const totalRamadanDays = ramadanTotalDays(hy);
    const days = r.days || {};
    let dayLabel = 'برنامهٔ ویژهٔ رمضان (فعال)';
    if (hm === 9) {
      dayLabel = `امروز روز ${toPersianDigits(hd)} از ${toPersianDigits(totalRamadanDays)} ماه رمضان است`;
    }

    let rowsHtml = '';
    for (let day = 1; day <= totalRamadanDays; day++) {
      const t = days[day] || {};
      const isToday = hm === 9 && day === hd;
      rowsHtml += `
        <tr class="${isToday ? 'is-today' : ''}">
          <td>${isToday ? '<span class="ramadan-day-badge"></span>' : ''}${toPersianDigits(day)}</td>
          <td>${toPersianDigits(t.fajr || '—')}</td>
          <td>${toPersianDigits(t.dhuhr || '—')}</td>
          <td>${toPersianDigits(t.asr || '—')}</td>
          <td>${toPersianDigits(t.maghrib || '—')}</td>
          <td>${toPersianDigits(t.isha || '—')}</td>
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
          <thead><tr><th>روز</th><th>سحر</th><th>ظهر</th><th>عصر</th><th>افطار</th><th>عشاء</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>`;
    specialBlock.appendChild(card);
    const todayRow = card.querySelector('.ramadan-schedule-table tr.is-today');
    if (todayRow) todayRow.scrollIntoView({ block: 'nearest' });
  }
}
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
  })().then(() => { charityRefreshing = null; }, () => { charityRefreshing = null; });
  return charityRefreshing;
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
  (c.cards || []).forEach((card2, i) => {
    html += `<div class="charity-card-number">
      <span>${card2.label || 'کارت ' + toPersianDigits(i + 1)}<br><strong>${card2.number}</strong></span>
      <button class="copy-btn" data-copy="${card2.number}">کپی</button>
    </div>`;
  });
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

  el.querySelectorAll('.copy-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      navigator.clipboard?.writeText(btn.dataset.copy).then(() => { btn.textContent = 'کپی شد'; setTimeout(() => { btn.textContent = 'کپی'; }, 1500); });
    });
  });
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

/* ---------- نوتیفیکیشن واقعی (Web Push) ---------- */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

const pushToggle = document.getElementById('push-notif-toggle');
const pushStatusEl = document.getElementById('push-notif-status');

async function checkPushSubscriptionStatus() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    pushStatusEl.textContent = 'مرورگر شما از نوتیفیکیشن پشتیبانی نمی‌کند.';
    pushToggle.disabled = true;
    return;
  }
  try {
    const reg = await navigator.serviceWorker.getRegistration('push-worker.js');
    const sub = reg && await reg.pushManager.getSubscription();
    pushToggle.checked = !!sub;
  } catch (e) { /* ignore */ }
}

async function enablePushNotifications() {
  pushStatusEl.textContent = 'در حال فعال‌سازی...';
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      pushStatusEl.textContent = 'اجازه داده نشد. از تنظیمات مرورگر/گوشی، دسترسی اعلان را برای این سایت فعال کنید.';
      pushToggle.checked = false;
      return;
    }
    const reg = await navigator.serviceWorker.register('push-worker.js');
    reg.update().catch(() => {}); // چک فوری برای نسخهٔ تازه‌تر سرویس‌ورکر، به‌جای صبر تا ۲۴ ساعت بعد
    await navigator.serviceWorker.ready;
    const { key } = await apiFetch('/vapid-public-key');
    if (!key) { pushStatusEl.textContent = 'سرور هنوز کلید نوتیفیکیشن را آماده نکرده؛ چند دقیقه دیگر دوباره امتحان کنید.'; pushToggle.checked = false; return; }
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
    const device_id = await ensureDeviceId();
    await apiFetch('/push-subscribe', { method: 'POST', body: JSON.stringify(Object.assign(sub.toJSON(), { device_id })) });
    pushStatusEl.textContent = 'نوتیفیکیشن فعال شد ✓';
    lastStickyBody = ''; // اجازه بده نوتیفیکیشن ثابت بلافاصله با اجازهٔ تازه نمایش داده شود
    updateStickyNotification(null);
    if (state.coords) computePrayerTimes();
  } catch (e) {
    pushStatusEl.textContent = 'فعال‌سازی ناموفق بود. دوباره امتحان کنید.';
    pushToggle.checked = false;
  }
}

async function disablePushNotifications() {
  try {
    const reg = await navigator.serviceWorker.getRegistration('push-worker.js');
    const sub = reg && await reg.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
  } catch (e) { /* ignore */ }
  pushStatusEl.textContent = 'نوتیفیکیشن غیرفعال شد.';
}

pushToggle.addEventListener('change', (e) => {
  if (e.target.checked) enablePushNotifications();
  else disablePushNotifications();
});
checkPushSubscriptionStatus();

/* ---------- درخواست اولیهٔ نوتیفیکیشن (اولین باز کردن اپ) ---------- */
function maybeShowOnboardingPushPrompt() {
  if (localStorage.getItem('arefanejam_push_prompted')) return;
  if (!('PushManager' in window) || !('serviceWorker' in navigator)) return;
  if (Notification.permission !== 'default') { localStorage.setItem('arefanejam_push_prompted', '1'); return; }
  setTimeout(() => {
    document.getElementById('onboarding-push-modal').classList.remove('hidden');
  }, 1200);
}
document.getElementById('onboarding-push-yes-btn').addEventListener('click', async () => {
  localStorage.setItem('arefanejam_push_prompted', '1');
  document.getElementById('onboarding-push-modal').classList.add('hidden');
  await enablePushNotifications();
});
document.getElementById('onboarding-push-later-btn').addEventListener('click', () => {
  localStorage.setItem('arefanejam_push_prompted', '1');
  document.getElementById('onboarding-push-modal').classList.add('hidden');
});
maybeShowOnboardingPushPrompt();

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
  if (s.nav_icon_image) return `<img src="${s.nav_icon_image}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  return s.nav_icon_emoji || '❓';
}
async function loadShariqSettings() {
  try {
    const s = await apiFetch('/shariq/settings');
    document.getElementById('shariq-nav-icon').innerHTML = shariqIconMarkup(s);
    document.getElementById('shariq-nav-label').textContent = s.nav_label || 'سوالات شرعی';
    document.getElementById('shariq-tile-badge').innerHTML = shariqIconMarkup(s);
    document.getElementById('shariq-tile-label').textContent = s.nav_label || 'سوالات شرعی';
    document.getElementById('shariq-page-title').textContent = s.nav_label || 'سوالات شرعی';
  } catch (e) { /* ignore */ }
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
    alert('سوال شما ارسال شد. پس از پاسخ‌گویی، پاسخ در بخش «سوالات من» و «سوالات شرعی» نمایش داده می‌شود.');
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

async function loadMokatibIcon() {
  try {
    const { icon } = await apiFetch('/mokatib/icon');
    if (icon) document.getElementById('mokatib-tile-badge').innerHTML = `<img src="${icon}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  } catch (e) { /* ignore */ }
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
    const data = await apiFetch('/mokatib/slider');
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
  } catch (e) {
    holders.forEach((h) => { h.style.display = 'none'; h.innerHTML = ''; });
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
    imgEl.src = popup.image;
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

function renderMokatibBtn2View() {
  const parentId = mokatibBtn2Path.length ? mokatibBtn2Path[mokatibBtn2Path.length - 1] : null;
  const mosques = mokatibState.publicMosques || [];
  const detailBlock = document.getElementById('mokatib-btn2-detail');
  const grid = document.getElementById('mokatib-btn2-buttons');

  if (parentId !== null) {
    const m = mosques.find((x) => Number(x.id) === Number(parentId));
    if (m) {
      detailBlock.classList.remove('hidden');
      document.getElementById('mokatib-btn2-detail-name').textContent = m.name;
      document.getElementById('mokatib-btn2-detail-info').textContent = m.imam_name ? 'امام: ' + m.imam_name : '';
      const imgEl = document.getElementById('mokatib-btn2-detail-img');
      const wrapEl = document.getElementById('mokatib-btn2-detail-imgwrap');
      if (m.image_url) {
        imgEl.src = m.image_url;
        wrapEl.style.display = 'block';
        if (mokatibBtn2ImageViewer) mokatibBtn2ImageViewer.reset();
      } else {
        wrapEl.style.display = 'none';
        imgEl.removeAttribute('src');
      }
    }
  } else {
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
    btn.className = 'secondary-btn';
    const nameEl = document.createElement('span');
    nameEl.className = 'mokatib-btn2-name';
    nameEl.textContent = m.name;
    btn.appendChild(nameEl);
    if (m.imam_name) {
      const imamEl = document.createElement('span');
      imamEl.className = 'mokatib-btn2-imam';
      imamEl.textContent = 'امام: ' + m.imam_name;
      btn.appendChild(imamEl);
    }
    btn.title = m.name + (m.imam_name ? ' — امام: ' + m.imam_name : '');
    if (m.btn_color) btn.style.background = m.btn_color;
    btn.addEventListener('click', () => {
      mokatibBtn2Path.push(m.id);
      renderMokatibBtn2View();
      pushOverlay('btn2', undoMokatibBtn2Step);
    });
    grid.appendChild(btn);
  });
}

function undoMokatibBtn2Step() {
  mokatibBtn2Path.pop();
  renderMokatibBtn2View();
}
function closeMokatibBtn2Popup() {
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
  wrap.innerHTML = '<p class="muted-text small">در حال بارگذاری...</p>';
  try {
    const data = await apiFetch('/mokatib/public-tree');
    try { localStorage.setItem(MOKATIB_PUBLIC_CACHE_KEY, JSON.stringify(data)); } catch (e) {}
    applyMokatibPublicData(data);
    renderMokatibPublicTreeBody(wrap);
  } catch (e) {
    // آفلاین یا خطای شبکه: از آخرین نسخهٔ ذخیره‌شده در دستگاه استفاده می‌کنیم
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem(MOKATIB_PUBLIC_CACHE_KEY) || 'null'); } catch (e2) {}
    if (cached) {
      applyMokatibPublicData(cached);
      renderMokatibPublicTreeBody(wrap);
    } else {
      wrap.innerHTML = '<p class="note-empty">در حال حاضر امکان بارگذاری چارت وجود ندارد.</p>';
    }
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
    if (head.chart) { chartImg.src = head.chart; chartImg.style.display = 'block'; }
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
    row.innerHTML = `<strong>${m.name}</strong>${m.imam_name ? ' — امام: ' + m.imam_name : ''}`;
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
    [m.address, m.imam_name ? 'امام: ' + m.imam_name : '', m.phone, m.extra_info].filter(Boolean).join(' | ');
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
    alert('آدرس ذخیره شد. لطفاً اپ را مجدد باز کنید.');
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
setInterval(sendHeartbeat, 20000);

/* ---------- درخواست اولیهٔ موقعیت مکانی (اولین باز کردن اپ) ----------
   اگر مجوز موقعیت مکانی هنوز مشخص نشده، به‌جای درخواست خاموش (که ممکن است بدون توضیح
   توسط کاربر رد شود)، اول پنجرهٔ خوش‌آمدگویی توضیح می‌دهد که این مجوز برای چیست؛ در همین حین
   اپ با آخرین موقعیت شناخته‌شده یا موقعیت پیش‌فرض ادمین کار می‌کند تا کاربر معطل نماند. */
function initLocationFlow() {
  if (state.manualCity || localStorage.getItem('arefanejam_location_prompted') || !navigator.geolocation) {
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
loadNotes();

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
      if (k !== AZAN_OFFLINE_CACHE_NAME && k !== APP_SHELL_CACHE_NAME && k !== QURAN_AUDIO_CACHE_NAME && k !== ANNOUNCEMENT_AUDIO_CACHE_NAME && k !== CHARITY_MEDIA_CACHE_NAME) caches.delete(k);
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

// نشانهٔ «اجرای کامل app.js» برای بروزرسانی ظاهر اپ از سایت (اگر تا اینجا نرسد، اپ به نسخهٔ داخلی برمی‌گردد)
window.__arefBooted = true;
