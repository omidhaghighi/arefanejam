// «بستهٔ اولیهٔ» تنظیمات پیشخوان داخل APK (هنگام ساخت اپ).
// هدف: کسی که APK را (از دست شما یا از لینک دانلود) نصب می‌کند، همان لحظهٔ اولِ باز شدن، بدون اینترنت، همهٔ تغییرات پیشخوان را ببیند
// (نام و آیکون کاشی‌ها، منوی پایین، منوی همبرگری، رنگ‌ها، مکاتب، و ...). قرآن و صوت‌ها حجم زیادی دارند و جدا دانلود می‌شوند.
// خروجی: app/js/native-seed.js  ←  window.NATIVE_SEED = { id, items: { <کلید localStorage>: <متن JSON> } }
// اپ (index.html) فقط کلیدهایی را که روی گوشی هنوز نیستند پر می‌کند؛ پس هیچ‌وقت داده‌ٔ تازه‌تر را خراب نمی‌کند.
// هر خطایی بیلد را قرمز نمی‌کند؛ در بدترین حالت فایل خالی می‌ماند و اپ مثل قبل با اینترنت تنظیمات را می‌گیرد.
const fs = require('fs');

const OUT = 'app/js/native-seed.js';
const MAX_ITEM_BYTES = 1400000;      // هر مسیر (کمتر از سقف 1.5MB خود اپ)
const MAX_TOTAL_BYTES = 3600000;     // کل بسته (حافظهٔ localStorage محدود است)
const MAX_IMG_BYTES = 220000;        // هر تصویر که داخل بسته می‌رود
const MAX_IMG_TOTAL = 2000000;       // مجموع تصویرها
const MAX_IMAGES = 60;

// مسیرهایی که اپ آفلاین ذخیره می‌کند (API_OFFLINE_CACHE_RE در app.js)
const PATHS = [
  '/theme', '/shariq/settings', '/mokatib/icon', '/mokatib/slider', '/mokatib/public-tree',
  '/hamburger-menu', '/bottom-nav', '/more-icons', '/social-links', '/zakat', '/activities', '/ads-page', '/ad-banners',
  '/ramadan', '/events', '/azan-exceptions', '/dhikrs', '/daily-deeds', '/khatm/settings', '/feedback/settings',
  '/books', '/gallery', '/news'
];

exports.run = async function run(API, HEADERS) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function getJson(url) {
    let last;
    for (let i = 1; i <= 3; i++) {
      try {
        const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(25000) });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return await res.json();
      } catch (e) { last = e; if (i < 3) await sleep(1500 * i); }
    }
    throw last;
  }

  const items = {};
  let total = 0;
  const jsons = {};

  // تنظیمات اصلی (متن ساده، بدون پوشش {t,data}) — تصویرهایش عمداً به همان آدرس می‌مانند (بخش بومی اندروید آدرس می‌خواهد)
  try {
    const st = await getJson(API + '/settings?t=' + Date.now());
    const txt = JSON.stringify(st);
    if (txt.length <= MAX_ITEM_BYTES) { items['arefanejam_settings_cache'] = txt; total += txt.length; console.log('SEED settings ' + Math.round(txt.length / 1024) + ' KB'); }
  } catch (e) { console.log('SEED settings: ' + e.message); }

  for (const p of PATHS) {
    try { jsons[p] = await getJson(API + p + '?t=' + Date.now()); } catch (e) { console.log('SEED skip ' + p + ': ' + e.message); }
  }

  // تصویرها را (کوچک‌ها) به‌صورت data: داخل بسته می‌گذاریم تا بدون اینترنت دیده شوند
  const urls = [];
  (function walk(v, d) {
    if (d > 9 || v == null) return;
    if (typeof v === 'string') { if (/^https?:\/\/\S+\.(png|jpe?g|gif|webp|svg)(\?\S*)?$/i.test(v) && urls.indexOf(v) < 0) urls.push(v); }
    else if (Array.isArray(v)) v.forEach((x) => walk(x, d + 1));
    else if (typeof v === 'object') Object.keys(v).forEach((k) => walk(v[k], d + 1));
  })(jsons, 0);

  const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' };
  const dataUri = {};
  let imgTotal = 0, imgOk = 0;
  for (const u of urls.slice(0, MAX_IMAGES)) {
    if (imgTotal >= MAX_IMG_TOTAL) break;
    try {
      const res = await fetch(u, { headers: HEADERS, redirect: 'follow', signal: AbortSignal.timeout(25000) });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 50 || buf.length > MAX_IMG_BYTES || imgTotal + buf.length > MAX_IMG_TOTAL) continue;
      const head = buf.slice(0, 60).toString('utf8').toLowerCase();
      if (head.indexOf('<html') > -1 || head.indexOf('<!doctype html') > -1) continue;
      const ext = (u.split('?')[0].split('.').pop() || '').toLowerCase();
      dataUri[u] = 'data:' + (MIME[ext] || 'image/png') + ';base64,' + buf.toString('base64');
      imgTotal += buf.length; imgOk++;
    } catch (e) { /* همان آدرس می‌ماند */ }
  }
  console.log('SEED images embedded: ' + imgOk + '/' + urls.length + ' (' + Math.round(imgTotal / 1024) + ' KB)');

  function embed(v) {
    if (typeof v === 'string') return dataUri[v] || v;
    if (Array.isArray(v)) return v.map(embed);
    if (v && typeof v === 'object') { const o = {}; Object.keys(v).forEach((k) => { o[k] = embed(v[k]); }); return o; }
    return v;
  }

  const now = Date.now();
  for (const p of PATHS) {
    if (!(p in jsons)) continue;
    let txt = JSON.stringify({ t: now, data: embed(jsons[p]) });
    if (txt.length > MAX_ITEM_BYTES) txt = JSON.stringify({ t: now, data: jsons[p] });      // با تصویر خیلی بزرگ شد: بدون تصویرها
    if (txt.length > MAX_ITEM_BYTES) { console.log('SEED skip ' + p + ' (too big)'); continue; }
    if (total + txt.length > MAX_TOTAL_BYTES) { console.log('SEED skip ' + p + ' (total limit)'); continue; }
    items['arefanejam_api_cache:' + p] = txt; total += txt.length;
  }

  const count = Object.keys(items).length;
  if (!count) { console.log('::warning::Seed is empty (website not reachable?) - new users will need internet once to get dashboard settings.'); return; }
  const body = 'window.NATIVE_SEED = ' + JSON.stringify({ id: String(now), items }).replace(/<\/script/gi, '<\\/script') + ';\n';
  fs.writeFileSync(OUT, '// این فایل هنگام ساخت اپ اندروید خودکار بازنویسی می‌شود (native-assets/fetch-seed.js).\n' + body, 'utf8');
  console.log('SEED BUNDLED: ' + count + ' items, ' + Math.round(total / 1024) + ' KB');
};
