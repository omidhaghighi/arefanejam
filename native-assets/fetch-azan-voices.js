// دانلود همهٔ صداهای اذانِ تعریف‌شده در پیشخوان سایت و گذاشتنشان داخل اپ اندروید (هنگام ساخت اپ).
// هر صدا به شکل res/raw/azan_<id>.mp3 داخل اپ قرار می‌گیرد و فایل app/js/native-config.js بازنویسی می‌شود.
// اگر در سایت صدایی نبود، از native-assets/azan.mp3 (اگر موجود باشد) استفاده می‌شود.
const fs = require('fs');
const { execFileSync } = require('child_process');

const API = process.env.AZAN_API || 'https://arefanejam.com/wp-json/arefanejam/v1';
const RAW = 'android/app/src/main/res/raw';
const CFG = 'app/js/native-config.js';

function cleanId(x) { return String(x || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

async function getJson(url) {
  const res = await fetch(url, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

async function convert(id, url) {
  const src = '/tmp/azan_src_' + id;
  const out = RAW + '/azan_' + id + '.mp3';
  const res = await fetch(url, { signal: AbortSignal.timeout(180000) });
  if (!res.ok) throw new Error('download HTTP ' + res.status);
  fs.writeFileSync(src, Buffer.from(await res.arrayBuffer()));
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
})();
