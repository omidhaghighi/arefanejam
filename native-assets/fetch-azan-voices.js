// دانلود همهٔ صداهای اذانِ تعریف‌شده در پیشخوان سایت و گذاشتنشان داخل اپ اندروید (هنگام ساخت اپ).
// هر صدا به شکل res/raw/azan_<id>.mp3 داخل اپ قرار می‌گیرد و فایل app/js/native-config.js بازنویسی می‌شود.
// اگر در سایت صدایی نبود، از native-assets/azan.mp3 (اگر موجود باشد) استفاده می‌شود.
const fs = require('fs');
const { execFileSync } = require('child_process');

const API = process.env.AZAN_API || 'https://arefanejam.com/wp-json/arefanejam/v1';
const RAW = 'android/app/src/main/res/raw';
const CFG = 'app/js/native-config.js';

function cleanId(x) { return String(x || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

// بعضی هاست‌ها/فایروال‌ها درخواست‌های بدون User-Agent مرورگر (مثل درخواست سرور گیت‌هاب) را رد می‌کنند؛
// برای همین مثل یک مرورگر معمولی درخواست می‌دهیم و هر درخواست را چند بار تلاش می‌کنیم.
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
  'Accept': '*/*',
  'Cache-Control': 'no-cache'
};
const TRIES = 4;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function withRetry(label, fn) {
  let last;
  for (let i = 1; i <= TRIES; i++) {
    try { return await fn(); } catch (e) {
      last = e;
      console.log(label + ': attempt ' + i + '/' + TRIES + ' failed: ' + e.message);
      if (i < TRIES) await sleep(3000 * i);
    }
  }
  throw last;
}

async function getJson(url) {
  return withRetry('settings', async () => {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  });
}

async function convert(id, url) {
  const src = '/tmp/azan_src_' + id;
  const out = RAW + '/azan_' + id + '.mp3';
  await withRetry('download ' + id, async () => {
    const res = await fetch(url, { headers: HEADERS, redirect: 'follow', signal: AbortSignal.timeout(180000) });
    if (!res.ok) throw new Error('download HTTP ' + res.status);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 2000) throw new Error('downloaded file is too small (' + buf.length + ' bytes) - probably not an audio file');
    const head = buf.slice(0, 200).toString('utf8').toLowerCase();
    if (head.indexOf('<html') > -1 || head.indexOf('<!doctype') > -1) throw new Error('server returned a web page instead of the audio file (firewall/challenge?)');
    fs.writeFileSync(src, buf);
  });
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-vn', '-ac', '2', '-b:a', '128k', out], { stdio: 'inherit' });
  if (!fs.existsSync(out) || fs.statSync(out).size === 0) throw new Error('converted file is empty');
  return fs.statSync(out).size;
}

(async () => {
  fs.mkdirSync(RAW, { recursive: true });

  let voices = [];
  let active = '';
  let siteOk = false;
  try {
    const j = await getJson(API + '/settings?t=' + Date.now());
    siteOk = true;
    voices = Array.isArray(j.azan_voices) ? j.azan_voices : [];
    active = cleanId(j.azan_voice_active);
    if (!voices.length && j.azan_audio_url) voices = [{ id: 'v0', name: 'اذان', url: j.azan_audio_url }];
  } catch (e) {
    console.log('could not read settings from the website: ' + e.message);
  }
  console.log('website reachable: ' + siteOk + ' | voices on dashboard: ' + voices.length + ' | active: ' + (active || '-'));

  const done = [];
  for (const v of voices) {
    const id = cleanId(v.id);
    if (!id || !v.url) continue;
    try {
      const size = await convert(id, v.url);
      done.push({ id, name: String(v.name || id) });
      console.log('OK   voice ' + id + ' (' + (v.name || '') + ') -> ' + Math.round(size / 1024) + ' KB');
    } catch (e) {
      console.log('FAIL voice ' + id + ': ' + e.message);
      try { fs.unlinkSync(RAW + '/azan_' + id + '.mp3'); } catch (x) {}
    }
  }

  if (!done.length && fs.existsSync('native-assets/azan.mp3')) {
    fs.copyFileSync('native-assets/azan.mp3', RAW + '/azan_local.mp3');
    done.push({ id: 'local', name: 'اذان' });
    active = 'local';
    console.log('OK   voice local (native-assets/azan.mp3)');
  }
  if (!done.some((d) => d.id === active)) active = done.length ? done[0].id : '';

  if (voices.length && !done.length) {
    console.log('::warning::Azan voices exist on the dashboard but none could be bundled - the app will use the phone default sound.');
  } else if (voices.length && done.length < voices.length) {
    console.log('::warning::Only ' + done.length + ' of ' + voices.length + ' azan voices could be bundled - see FAIL lines above.');
  }
  if (!siteOk && !done.length) {
    console.log('::warning::The website could not be reached from the build server, so NO azan sound is inside this APK (offline azan will use the phone default sound). Put azan.mp3 in native-assets/ as a guaranteed fallback.');
  }
  if (!done.length) console.log('no azan sound found - default phone sound will be used');

  const cfg = [
    '// این فایل هنگام ساخت اپ اندروید به‌صورت خودکار بازنویسی می‌شود.',
    'window.NATIVE_AZAN_SOUND = ' + (done.length ? 'true' : 'false') + ';',
    'window.NATIVE_AZAN_VOICES = ' + JSON.stringify(done) + ';',
    "window.NATIVE_AZAN_DEFAULT = '" + active + "';",
    ''
  ].join('\n');
  fs.writeFileSync(CFG, cfg, 'utf8');
  console.log('AZAN VOICES BUNDLED: ' + done.length + ' | default: ' + (active || '-'));

  // بستهٔ اولیهٔ تنظیمات پیشخوان داخل APK (native-assets/fetch-seed.js). هر خطایی بیلد را خراب نمی‌کند.
  try { await require('./fetch-seed.js').run(API, HEADERS); } catch (e) { console.log('::warning::seed: ' + e.message); }
})();
