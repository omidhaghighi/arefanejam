package com.arefanejam.quran;

import android.app.Activity;
import android.app.PendingIntent;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInstaller;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RadialGradient;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.speech.RecognizerIntent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.annotation.ActivityCallback;
import java.util.ArrayList;
import android.widget.RemoteViews;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Pattern;

import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.res.AssetManager;
import com.getcapacitor.JSArray;
import org.json.JSONObject;

/**
 * دانلود و نصب APK بروزرسانی از داخل خود اپ (بدون مرورگر).
 * متدها: download({url}) ، progress() ، cancel() ، install() ، status() ، cleanup()
 */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {

    private volatile long loaded = 0;
    private volatile long total = 0;
    private volatile String state = "idle"; // idle | downloading | done | error | cancelled
    private volatile String error = "";
    private volatile boolean cancelled = false;

    private File updateDir() {
        File dir = new File(getContext().getCacheDir(), "updates");
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    private File apkFile() {
        return new File(updateDir(), "arefanejam.apk");
    }

    @PluginMethod
    public void download(final PluginCall call) {
        final String url = call.getString("url");
        if (url == null || url.length() == 0) {
            call.reject("no url");
            return;
        }
        if ("downloading".equals(state)) {
            call.reject("busy");
            return;
        }
        if (!UpdateJobService.online(getContext())) {
            call.reject("offline");
            return;
        }
        loaded = 0;
        total = 0;
        error = "";
        cancelled = false;
        state = "downloading";

        new Thread(new Runnable() {
            @Override
            public void run() {
                HttpURLConnection c = null;
                InputStream in = null;
                OutputStream out = null;
                File part = new File(updateDir(), "arefanejam.part");
                try {
                    URL u = new URL(url);
                    int code = 0;
                    // ریدایرکت را دستی دنبال می‌کنیم (گیت‌هاب به یک آدرس دیگر منتقل می‌کند)
                    for (int i = 0; i < 6; i++) {
                        c = (HttpURLConnection) u.openConnection();
                        c.setInstanceFollowRedirects(false);
                        c.setConnectTimeout(20000);
                        c.setReadTimeout(30000);
                        c.setRequestProperty("User-Agent", "ArefanejamApp");
                        code = c.getResponseCode();
                        if (code == 301 || code == 302 || code == 303 || code == 307 || code == 308) {
                            String loc = c.getHeaderField("Location");
                            c.disconnect();
                            if (loc == null) throw new IOException("redirect without location");
                            u = new URL(u, loc);
                            continue;
                        }
                        break;
                    }
                    if (code != 200) throw new IOException("HTTP " + code);

                    total = c.getContentLengthLong();
                    in = c.getInputStream();
                    out = new FileOutputStream(part);
                    byte[] buf = new byte[32 * 1024];
                    int n;
                    while ((n = in.read(buf)) != -1) {
                        if (cancelled) throw new IOException("cancelled");
                        out.write(buf, 0, n);
                        loaded += n;
                    }
                    out.flush();
                    out.close();
                    out = null;

                    if (part.length() < 100 * 1024) throw new IOException("file too small");
                    File dest = apkFile();
                    if (dest.exists()) dest.delete();
                    if (!part.renameTo(dest)) throw new IOException("rename failed");

                    if (total <= 0) total = dest.length();
                    loaded = total;
                    state = "done";
                    JSObject r = new JSObject();
                    r.put("size", dest.length());
                    call.resolve(r);
                } catch (Exception e) {
                    boolean wasCancelled = cancelled;
                    state = wasCancelled ? "cancelled" : "error";
                    error = String.valueOf(e.getMessage());
                    try { part.delete(); } catch (Exception ignore) { }
                    call.reject(wasCancelled ? "cancelled" : error);
                } finally {
                    try { if (in != null) in.close(); } catch (Exception ignore) { }
                    try { if (out != null) out.close(); } catch (Exception ignore) { }
                    try { if (c != null) c.disconnect(); } catch (Exception ignore) { }
                }
            }
        }).start();
    }

    @PluginMethod
    public void progress(PluginCall call) {
        JSObject r = new JSObject();
        r.put("state", state);
        r.put("loaded", loaded);
        r.put("total", total);
        r.put("error", error);
        call.resolve(r);
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        cancelled = true;
        call.resolve();
    }

    @PluginMethod
    public void install(PluginCall call) {
        Context ctx = getContext();
        File f = apkFile();
        if (!f.exists()) {
            call.reject("file not found");
            return;
        }
        JSObject r = new JSObject();
        try {
            if (Build.VERSION.SDK_INT >= 26 && !ctx.getPackageManager().canRequestPackageInstalls()) {
                // اجازهٔ «نصب برنامه از این منبع» هنوز داده نشده؛ صفحهٔ تنظیمات همان را باز می‌کنیم
                Intent s = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + ctx.getPackageName()));
                s.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(s);
                r.put("status", "needs_permission");
                call.resolve(r);
                return;
            }
            boolean done = false;
            if (Build.VERSION.SDK_INT >= 21) {
                // نصب با PackageInstaller روی همهٔ نسخه‌های اندروید: اپ «نصب‌کنندهٔ ثبت‌شده» می‌شود
                // و در اندروید ۱۲ به بالا بروزرسانی‌های بعدی بی‌صدا نصب می‌شوند
                try {
                    installViaSession(ctx, f);
                    done = true;
                } catch (Exception se) {
                    done = false; // اگر روش جدید نشد، همان روش قبلی
                }
            }
            if (!done) installViaIntent(ctx, f);
            r.put("status", "started");
            call.resolve(r);
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
        }
    }

    private static final String ACTION_INSTALL_RESULT = "com.arefanejam.quran.INSTALL_RESULT";

    /** روش قدیمی: باز کردن صفحهٔ نصب‌کنندهٔ اندروید (همیشه یک بار تأیید می‌خواهد). */
    private void installViaIntent(Context ctx, File f) throws Exception {
        Uri uri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".updateprovider", f);
        Intent i = new Intent(Intent.ACTION_VIEW);
        i.setDataAndType(uri, "application/vnd.android.package-archive");
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        ctx.startActivity(i);
    }

    /**
     * روش جدید (اندروید ۱۲+): نصب با PackageInstaller و درخواست «بدون نیاز به اقدام کاربر».
     * اگر اندروید اجازه بدهد بی‌صدا بروزرسانی می‌شود؛ اگر نه، صفحهٔ تأیید عادی را نشان می‌دهد.
     * اگر هر مشکلی پیش بیاید، خودکار به روش قدیمی برمی‌گردد.
     */
    private void installViaSession(final Context appCtx, final File f) throws Exception {
        final Context ctx = appCtx.getApplicationContext();
        PackageInstaller pi = ctx.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams params =
                new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(ctx.getPackageName());
        if (Build.VERSION.SDK_INT >= 31) {
            params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
        }
        int id = pi.createSession(params);
        PackageInstaller.Session session = pi.openSession(id);
        try {
            InputStream in = new java.io.FileInputStream(f);
            OutputStream out = session.openWrite("arefanejam.apk", 0, f.length());
            try {
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
                session.fsync(out);
            } finally {
                try { in.close(); } catch (Exception ignore) { }
                try { out.close(); } catch (Exception ignore) { }
            }

            final BroadcastReceiver receiver = new BroadcastReceiver() {
                @Override
                @SuppressWarnings("deprecation")
                public void onReceive(Context c, Intent intent) {
                    int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, -1);
                    if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
                        if (!MainActivity.inForeground) {
                            // اپ در پس‌زمینه است و اندروید بی‌صدا نصب نکرد: پنجرهٔ تأیید ناگهانی نشان نمی‌دهیم؛
                            // نصب لغو می‌شود و دفعهٔ بعد که کاربر اپ را باز کرد (حداکثر یک بار در روز) درخواست می‌شود
                            try { ctx.unregisterReceiver(this); } catch (Exception ignore) { }
                            try {
                                int sid = intent.getIntExtra(PackageInstaller.EXTRA_SESSION_ID, -1);
                                if (sid > 0) ctx.getPackageManager().getPackageInstaller().abandonSession(sid);
                            } catch (Exception ignore) { }
                            return;
                        }
                        // اندروید تأیید کاربر را لازم دانسته: همان صفحهٔ تأیید را نشان بده
                        Intent confirm = (Intent) intent.getParcelableExtra(Intent.EXTRA_INTENT);
                        if (confirm != null) {
                            confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            try { c.startActivity(confirm); } catch (Exception ignore) { }
                        }
                        return; // منتظر نتیجهٔ نهایی می‌مانیم
                    }
                    try { ctx.unregisterReceiver(this); } catch (Exception ignore) { }
                    if (status != PackageInstaller.STATUS_SUCCESS
                            && status != PackageInstaller.STATUS_FAILURE_ABORTED
                            && MainActivity.inForeground) {
                        // روش جدید شکست خورد (نه اینکه کاربر لغو کرده باشد) → روش قدیمی
                        try { installViaIntent(ctx, f); } catch (Exception ignore) { }
                    }
                }
            };
            ContextCompat.registerReceiver(ctx, receiver, new IntentFilter(ACTION_INSTALL_RESULT),
                    ContextCompat.RECEIVER_NOT_EXPORTED);

            Intent cb = new Intent(ACTION_INSTALL_RESULT).setPackage(ctx.getPackageName());
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= 31) flags |= PendingIntent.FLAG_MUTABLE;
            PendingIntent pending = PendingIntent.getBroadcast(ctx, id, cb, flags);
            try {
                session.commit(pending.getIntentSender());
            } catch (Exception e) {
                try { ctx.unregisterReceiver(receiver); } catch (Exception ignore) { }
                throw e;
            }
        } catch (Exception e) {
            try { session.abandon(); } catch (Exception ignore) { }
            throw e;
        } finally {
            try { session.close(); } catch (Exception ignore) { }
        }
    }

    /**
     * وضعیت برای «بروزرسانی خودکار»: آیا اجازهٔ نصب داده شده؟ آیا فایل APK آماده است؟
     * آیا خود اپ «نصب‌کنندهٔ ثبت‌شده» است (شرط نصب بی‌صدا در اندروید ۱۲ به بالا)؟
     */
    @PluginMethod
    public void status(PluginCall call) {
        Context ctx = getContext();
        JSObject r = new JSObject();
        boolean can = true;
        if (Build.VERSION.SDK_INT >= 26) can = ctx.getPackageManager().canRequestPackageInstalls();
        String inst = "";
        try {
            if (Build.VERSION.SDK_INT >= 30) {
                android.content.pm.InstallSourceInfo si =
                        ctx.getPackageManager().getInstallSourceInfo(ctx.getPackageName());
                String p = si.getInstallingPackageName();
                if (p != null) inst = p;
            } else {
                @SuppressWarnings("deprecation")
                String p = ctx.getPackageManager().getInstallerPackageName(ctx.getPackageName());
                if (p != null) inst = p;
            }
        } catch (Exception ignore) { }
        boolean self = ctx.getPackageName().equals(inst);
        r.put("sdk", Build.VERSION.SDK_INT);
        r.put("canInstall", can);
        r.put("hasApk", apkFile().exists());
        r.put("installer", inst);
        r.put("selfInstaller", self);
        r.put("silentLikely", Build.VERSION.SDK_INT >= 31 && can && self);
        // دانلود پس‌زمینه: نسخه‌ای که خود سیستم (بدون باز بودن اپ) دانلود کرده و آمادهٔ نصب است
        r.put("bgReady", UpdateJobService.readyVersion(ctx));
        r.put("bgJob", UpdateJobService.hasJob(ctx));
        r.put("bgLog", UpdateJobService.prefs(ctx).getString("log", ""));
        r.put("pollLast", UpdateJobService.prefs(ctx).getLong("poll_last", 0));
        r.put("pollNext", UpdateJobService.prefs(ctx).getLong("poll_next", 0));
        r.put("online", UpdateJobService.online(ctx));
        call.resolve(r);
    }

    /** آدرس API سایت را برای کار پس‌زمینه ذخیره می‌کند و کار دانلود را (اگر نبود) می‌چیند. */
    @PluginMethod
    public void bgConfig(PluginCall call) {
        try {
            Context ctx = getContext().getApplicationContext();
            String api = call.getString("api", "");
            if (api != null && api.startsWith("http")) {
                UpdateJobService.prefs(ctx).edit().putString("api", api).apply();
            }
            UpdateJobService.schedule(ctx);
            JSObject r = new JSObject();
            r.put("job", UpdateJobService.hasJob(ctx));
            call.resolve(r);
        } catch (Throwable t) {
            call.reject("bgConfig: " + t);
        }
    }


    /* =====================================================================
     * بروزرسانی «ظاهر اپ» (فایل‌های app/) مستقیم از سایت، بدون ساخت APK جدید
     * ---------------------------------------------------------------------
     * ۱) webSync: فایل‌های جدید از سایت دانلود و با هش SHA-256 بررسی می‌شوند و در پوشهٔ موقت «آماده» می‌مانند.
     * ۲) اعمال: یا هنگام باز شدن بعدی اپ (webBoot از MainActivity) یا با webApply.
     * ۳) webConfirm: اپ بعد از بالا آمدن سالم صدا زده می‌شود؛ اگر دو بار پشت‌هم صدا زده نشود
     *    (یعنی نسخهٔ جدید خراب بوده)، خودکار به نسخهٔ داخلِ APK برمی‌گردیم.
     * با نصب APK جدید، همیشه نسخهٔ داخلِ همان APK ملاک است و OTA پاک می‌شود.
     * ===================================================================== */
    private static final String WB_PREFS = "arefanejam_webbundle";
    private static final String CAP_PREFS = "CapWebViewSettings";
    private static final String CAP_KEY = "serverBasePath";
    private static final Pattern WB_PATH = Pattern.compile("^[A-Za-z0-9_\\-][A-Za-z0-9_\\-./]*$");
    private static final long WB_MAX_TOTAL = 60L * 1024 * 1024;
    private static final long WB_MAX_FILE = 30L * 1024 * 1024;
    private final AtomicBoolean wbBusy = new AtomicBoolean(false);

    private static File wbRoot(Context ctx) {
        File d = new File(ctx.getFilesDir(), "webbundle");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    private static void wbDeleteTree(File f) {
        if (f == null || !f.exists()) return;
        File[] kids = f.isDirectory() ? f.listFiles() : null;
        if (kids != null) for (File k : kids) wbDeleteTree(k);
        try { f.delete(); } catch (Exception ignore) { }
    }

    private static String wbSha256(File f) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        InputStream in = new java.io.FileInputStream(f);
        try {
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) != -1) md.update(buf, 0, n);
        } finally { try { in.close(); } catch (Exception ignore) { } }
        StringBuilder sb = new StringBuilder();
        for (byte b : md.digest()) sb.append(String.format("%02x", b));
        return sb.toString();
    }

    private static void wbCopy(File from, File to) throws IOException {
        File parent = to.getParentFile();
        if (parent != null && !parent.exists()) parent.mkdirs();
        InputStream in = new java.io.FileInputStream(from);
        OutputStream out = new FileOutputStream(to);
        try {
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
        } finally {
            try { in.close(); } catch (Exception ignore) { }
            try { out.close(); } catch (Exception ignore) { }
        }
    }

    /** برمی‌گردد به فایل‌های داخل APK (و اگر markBad باشد، نسخهٔ خراب را برای ۲۴ ساعت نادیده می‌گیرد). */
    private static void wbWipe(Context ctx, SharedPreferences p, boolean markBad, boolean deleteStaged) {
        String activeId = p.getString("active_id", "");
        String activeDir = p.getString("active_dir", "");
        ctx.getSharedPreferences(CAP_PREFS, Context.MODE_PRIVATE).edit().putString(CAP_KEY, "").apply();
        SharedPreferences.Editor e = p.edit();
        e.remove("active_id").remove("active_dir").putInt("unconfirmed", 0);
        if (markBad && activeId.length() > 0) e.putString("bad_id", activeId).putLong("bad_ts", System.currentTimeMillis());
        if (deleteStaged) e.remove("staged_id").remove("staged_dir");
        e.apply();
        if (activeDir.length() > 0) wbDeleteTree(new File(activeDir));
        if (deleteStaged) wbDeleteTree(wbRoot(ctx));
    }

    /**
     * از MainActivity قبل از بالا آمدن Capacitor صدا زده می‌شود:
     * نصب APK جدید ← پاک‌کردن OTA؛ نسخهٔ تأییدنشده ← بازگشت؛ نسخهٔ آماده ← فعال‌سازی.
     */
    public static void webBoot(Context ctx) {
        try {
            SharedPreferences p = ctx.getSharedPreferences(WB_PREFS, Context.MODE_PRIVATE);
            String code = "";
            try {
                PackageInfo pi = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0);
                code = pi.versionCode + ":" + pi.versionName;
            } catch (Exception ignore) { }
            if (!code.equals(p.getString("apk_code", ""))) {
                wbWipe(ctx, p, false, true);
                p.edit().putString("apk_code", code).apply();
            }
            if (p.getString("active_dir", "").length() > 0 && p.getInt("unconfirmed", 0) >= 1) {
                wbWipe(ctx, p, true, false);
            }
            String stagedDir = p.getString("staged_dir", "");
            if (stagedDir.length() > 0) {
                if (new File(stagedDir, "index.html").exists()) {
                    String oldDir = p.getString("active_dir", "");
                    p.edit().putString("active_id", p.getString("staged_id", ""))
                            .putString("active_dir", stagedDir)
                            .remove("staged_id").remove("staged_dir")
                            .putInt("unconfirmed", 0).apply();
                    ctx.getSharedPreferences(CAP_PREFS, Context.MODE_PRIVATE).edit().putString(CAP_KEY, stagedDir).apply();
                    if (oldDir.length() > 0 && !oldDir.equals(stagedDir)) wbDeleteTree(new File(oldDir));
                } else {
                    p.edit().remove("staged_id").remove("staged_dir").apply();
                }
            }
            String active = p.getString("active_dir", "");
            if (active.length() > 0) {
                if (!new File(active, "index.html").exists()) {
                    wbWipe(ctx, p, false, false);
                } else {
                    p.edit().putInt("unconfirmed", p.getInt("unconfirmed", 0) + 1).apply();
                }
            }
            // پوشه‌های اضافه (نسخه‌های قدیمی) پاک شوند
            File[] all = wbRoot(ctx).listFiles();
            String act = p.getString("active_dir", "");
            String stg = p.getString("staged_dir", "");
            if (all != null) for (File f : all) {
                String path = f.getAbsolutePath();
                if (!path.equals(act) && !path.equals(stg)) wbDeleteTree(f);
            }
        } catch (Exception ignore) { }
    }

    private SharedPreferences wbPrefs() {
        return getContext().getSharedPreferences(WB_PREFS, Context.MODE_PRIVATE);
    }

    /* ---------- تشخیص صدا برای بازی «حدس آیه» (🎤 بخوان تا بسنجم) ----------
       از پنجرهٔ تشخیص گفتار خودِ گوگل/گوشی استفاده می‌شود (RecognizerIntent)؛ پس مجوز RECORD_AUDIO و تغییر Manifest/build-apk.yml لازم نیست.
       speechAvailable(): فقط وجود همین متد (APK جدید) را به صفحه می‌فهماند. speechListen({prompt}) ← {results:[...حداکثر ۵ متن...]}
       یا {cancelled:true}؛ اگر گوشی موتور تشخیص گفتار نداشته باشد reject("unavailable"). */
    @PluginMethod
    public void speechAvailable(PluginCall call) {
        JSObject r = new JSObject();
        r.put("ok", true);
        call.resolve(r);
    }

    @PluginMethod
    public void speechListen(PluginCall call) {
        try {
            Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ar-SA");
            i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "ar-SA");
            i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5);
            i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false);
            String prompt = call.getString("prompt", "");
            if (prompt != null && prompt.length() > 0) i.putExtra(RecognizerIntent.EXTRA_PROMPT, prompt);
            startActivityForResult(call, i, "speechResult");
        } catch (Throwable e) {
            call.reject("unavailable");
        }
    }

    @ActivityCallback
    private void speechResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        try {
            JSObject r = new JSObject();
            Intent data = result == null ? null : result.getData();
            if (result != null && result.getResultCode() == Activity.RESULT_OK && data != null) {
                ArrayList<String> list = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
                JSArray arr = new JSArray();
                if (list != null) for (String t : list) arr.put(t);
                r.put("results", arr);
            } else {
                r.put("cancelled", true);
            }
            call.resolve(r);
        } catch (Throwable e) {
            call.reject("error");
        }
    }

    @PluginMethod
    public void webStatus(PluginCall call) {
        SharedPreferences p = wbPrefs();
        JSObject r = new JSObject();
        r.put("activeId", p.getString("active_id", ""));
        r.put("stagedId", p.getString("staged_id", ""));
        r.put("badId", p.getString("bad_id", ""));
        r.put("badTs", p.getLong("bad_ts", 0));
        r.put("unconfirmed", p.getInt("unconfirmed", 0));
        call.resolve(r);
    }

    @PluginMethod
    public void webConfirm(PluginCall call) {
        wbPrefs().edit().putInt("unconfirmed", 0).apply();
        call.resolve();
    }

    /** فعال‌سازی فوری نسخهٔ آماده (صفحه دوباره بارگذاری می‌شود). */
    @PluginMethod
    public void webApply(PluginCall call) {
        SharedPreferences p = wbPrefs();
        String dir = p.getString("staged_dir", "");
        if (dir.length() == 0 || !new File(dir, "index.html").exists()) {
            call.reject("nothing staged");
            return;
        }
        String oldDir = p.getString("active_dir", "");
        p.edit().putString("active_id", p.getString("staged_id", ""))
                .putString("active_dir", dir)
                .remove("staged_id").remove("staged_dir")
                .putInt("unconfirmed", 1).apply();
        getContext().getSharedPreferences(CAP_PREFS, Context.MODE_PRIVATE).edit().putString(CAP_KEY, dir).apply();
        if (oldDir.length() > 0 && !oldDir.equals(dir)) wbDeleteTree(new File(oldDir));
        getBridge().setServerBasePath(dir);
        call.resolve();
    }

    @PluginMethod
    public void webSync(final PluginCall call) {
        final String id = call.getString("id", "");
        final String base = call.getString("base", "");
        final JSArray files = call.getArray("files");
        if (id.length() == 0 || !id.matches("^[A-Za-z0-9]{6,64}$") || !base.startsWith("https://") || files == null || files.length() == 0) {
            call.reject("bad manifest");
            return;
        }
        if (!wbBusy.compareAndSet(false, true)) {
            call.reject("busy");
            return;
        }
        new Thread(new Runnable() {
            @Override
            public void run() {
                Context ctx = getContext();
                File tmp = new File(wbRoot(ctx), id + ".tmp");
                File fin = new File(wbRoot(ctx), id);
                try {
                    SharedPreferences p = wbPrefs();
                    String baseUrl = base.endsWith("/") ? base : base + "/";
                    String activeDir = p.getString("active_dir", "");
                    wbDeleteTree(tmp);
                    tmp.mkdirs();
                    if (files.length() > 500) throw new IOException("too many files");
                    long total = 0;
                    boolean hasIndex = false, hasBridge = false;
                    for (int i = 0; i < files.length(); i++) {
                        JSONObject f = files.getJSONObject(i);
                        String rel = f.getString("p");
                        String hash = f.getString("h").toLowerCase();
                        long size = f.optLong("s", 0);
                        if (!WB_PATH.matcher(rel).matches() || rel.contains("..") || rel.contains("//") || rel.endsWith("/"))
                            throw new IOException("bad path: " + rel);
                        if (!hash.matches("^[0-9a-f]{64}$")) throw new IOException("bad hash");
                        if (size > WB_MAX_FILE) throw new IOException("file too large");
                        total += size;
                        if (total > WB_MAX_TOTAL) throw new IOException("bundle too large");
                        if (rel.equals("index.html")) hasIndex = true;
                        if (rel.equals("js/native-bridge.js")) hasBridge = true;

                        File dest = new File(tmp, rel);
                        // اگر همین فایل (با همان هش) در نسخهٔ فعال هست، دوباره دانلود نمی‌کنیم
                        boolean done = false;
                        if (activeDir.length() > 0) {
                            File old = new File(activeDir, rel);
                            if (old.isFile() && wbSha256(old).equals(hash)) { wbCopy(old, dest); done = true; }
                        }
                        if (!done) wbDownload(baseUrl + rel + "?v=" + hash.substring(0, 10), dest, hash);
                    }
                    if (!hasIndex || !hasBridge) throw new IOException("bundle without index/native-bridge");
                    // فایل‌هایی که فقط داخل APK هستند (مثل native-config.js) از خود APK کپی می‌شوند
                    wbCopyAssets(ctx.getAssets(), "public", tmp);
                    File idx = new File(tmp, "index.html");
                    String html = wbReadText(idx);
                    if (!html.contains("native-bridge.js")) throw new IOException("index.html without native-bridge");

                    wbDeleteTree(fin);
                    if (!tmp.renameTo(fin)) throw new IOException("rename failed");
                    String oldStaged = p.getString("staged_dir", "");
                    p.edit().putString("staged_id", id).putString("staged_dir", fin.getAbsolutePath()).apply();
                    if (oldStaged.length() > 0 && !oldStaged.equals(fin.getAbsolutePath())) wbDeleteTree(new File(oldStaged));
                    JSObject r = new JSObject();
                    r.put("id", id);
                    call.resolve(r);
                } catch (Exception e) {
                    wbDeleteTree(tmp);
                    call.reject(String.valueOf(e.getMessage()));
                } finally {
                    wbBusy.set(false);
                }
            }
        }).start();
    }

    private static String wbReadText(File f) throws IOException {
        InputStream in = new java.io.FileInputStream(f);
        try {
            java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[16 * 1024];
            int n;
            while ((n = in.read(buf)) != -1) bo.write(buf, 0, n);
            return bo.toString("UTF-8");
        } finally { try { in.close(); } catch (Exception ignore) { } }
    }

    private static void wbDownload(String url, File dest, String expectHash) throws Exception {
        File parent = dest.getParentFile();
        if (parent != null && !parent.exists()) parent.mkdirs();
        HttpURLConnection c = null;
        InputStream in = null;
        OutputStream out = null;
        try {
            URL u = new URL(url);
            int code = 0;
            for (int i = 0; i < 5; i++) {
                c = (HttpURLConnection) u.openConnection();
                c.setInstanceFollowRedirects(false);
                c.setConnectTimeout(20000);
                c.setReadTimeout(30000);
                c.setRequestProperty("User-Agent", "ArefanejamApp");
                c.setRequestProperty("Cache-Control", "no-cache");
                code = c.getResponseCode();
                if (code == 301 || code == 302 || code == 303 || code == 307 || code == 308) {
                    String loc = c.getHeaderField("Location");
                    c.disconnect();
                    if (loc == null) throw new IOException("redirect without location");
                    URL nu = new URL(u, loc);
                    if (!"https".equals(nu.getProtocol())) throw new IOException("redirect to non-https");
                    u = nu;
                    continue;
                }
                break;
            }
            if (code != 200) throw new IOException("HTTP " + code + " " + dest.getName());
            in = c.getInputStream();
            out = new FileOutputStream(dest);
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] buf = new byte[32 * 1024];
            long sum = 0;
            int n;
            while ((n = in.read(buf)) != -1) {
                out.write(buf, 0, n);
                md.update(buf, 0, n);
                sum += n;
                if (sum > WB_MAX_FILE) throw new IOException("file too large");
            }
            out.flush();
            out.close();
            out = null;
            StringBuilder sb = new StringBuilder();
            for (byte b : md.digest()) sb.append(String.format("%02x", b));
            if (!sb.toString().equals(expectHash)) throw new IOException("hash mismatch " + dest.getName());
        } finally {
            try { if (in != null) in.close(); } catch (Exception ignore) { }
            try { if (out != null) out.close(); } catch (Exception ignore) { }
            try { if (c != null) c.disconnect(); } catch (Exception ignore) { }
        }
    }

    /** هر فایلی از پوشهٔ public داخل APK که در نسخهٔ جدید نیست، کپی می‌شود. */
    private static void wbCopyAssets(AssetManager am, String assetDir, File targetRoot) throws IOException {
        wbCopyAssetsRec(am, assetDir, "", targetRoot);
    }

    private static void wbCopyAssetsRec(AssetManager am, String assetDir, String rel, File targetRoot) throws IOException {
        String cur = rel.length() == 0 ? assetDir : assetDir + "/" + rel;
        String[] kids = am.list(cur);
        if (kids == null || kids.length == 0) {
            // فایل است (نه پوشه)
            if (rel.length() == 0) return;
            File dest = new File(targetRoot, rel);
            if (dest.exists()) return;
            File parent = dest.getParentFile();
            if (parent != null && !parent.exists()) parent.mkdirs();
            InputStream in;
            try { in = am.open(cur); } catch (IOException notAFile) { return; } // پوشهٔ خالی
            OutputStream out = new FileOutputStream(dest);
            try {
                byte[] buf = new byte[32 * 1024];
                int n;
                while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
            } finally {
                try { in.close(); } catch (Exception ignore) { }
                try { out.close(); } catch (Exception ignore) { }
            }
            return;
        }
        for (String k : kids) wbCopyAssetsRec(am, assetDir, rel.length() == 0 ? k : rel + "/" + k, targetRoot);
    }

    // ===================== نوتیفیکیشن ثابتِ گرافیکی: کارت سه‌بعدیِ تاریخ + اذان بعدی =====================
    // تصویر کارت با Canvas کشیده می‌شود (بدون فایل XML جدید، پس build-apk.yml تغییر نمی‌کند).
    private static final int STK_ID = 777000001;
    private static final String STK_CH = "sticky-v1";
    private static final int STK_GOLD = 0xFFF3D98A;

    // ---------- تصاویر دلخواه مدیر (پس‌زمینهٔ کارت، پس‌زمینهٔ کاشی تاریخ، تصویر ماه) ----------
    private static final java.util.HashMap<String, Long> STK_FAIL = new java.util.HashMap<String, Long>();

    private static String stkImgName(String url) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-1");
            byte[] d = md.digest(url.getBytes("UTF-8"));
            StringBuilder sb = new StringBuilder("img_");
            for (int i = 0; i < d.length; i++) sb.append(String.format("%02x", d[i] & 255));
            return sb.toString();
        } catch (Throwable t) {
            return "img_" + Math.abs(url.hashCode());
        }
    }

    private static String stkNorm(String url) {
        if (url == null) return "";
        url = url.trim();
        if (url.toLowerCase().startsWith("http://")) url = "https://" + url.substring(7);
        return url;
    }

    /** تصویر را از آدرس می‌گیرد و در پوشهٔ خصوصی اپ نگه می‌دارد (بعداً آفلاین هم کار می‌کند). اگر نشد null برمی‌گرداند. */
    private static Bitmap stkLoadImage(Context ctx, String rawUrl, int maxSide) {
        return stkLoadImage(ctx, rawUrl, maxSide, true);
    }

    /** allowNet=false: فقط از تصویرِ ذخیره‌شده روی گوشی می‌خواند و هرگز اینترنت را صدا نمی‌زند (برای به‌روزرسانی بومی کارت) */
    private static Bitmap stkLoadImage(Context ctx, String rawUrl, int maxSide, boolean allowNet) {
        try {
            String url = stkNorm(rawUrl);
            if (url.length() == 0) return null;
            File dir = new File(ctx.getFilesDir(), "sticky");
            if (!dir.exists()) dir.mkdirs();
            File f = new File(dir, stkImgName(url));
            if (!f.exists() || f.length() == 0) {
                if (!allowNet) return null;
                Long failAt = STK_FAIL.get(url);
                if (failAt != null && System.currentTimeMillis() - failAt < 5 * 60 * 1000L) return null;
                File tmp = new File(dir, stkImgName(url) + ".tmp");
                HttpURLConnection conn = null;
                InputStream in = null;
                OutputStream out = null;
                boolean ok = false;
                try {
                    conn = (HttpURLConnection) new URL(url).openConnection();
                    conn.setConnectTimeout(8000);
                    conn.setReadTimeout(12000);
                    conn.setInstanceFollowRedirects(true);
                    if (conn.getResponseCode() == 200) {
                        in = conn.getInputStream();
                        out = new FileOutputStream(tmp);
                        byte[] buf = new byte[16384];
                        long total = 0;
                        int n;
                        while ((n = in.read(buf)) != -1) {
                            total += n;
                            if (total > 12L * 1024 * 1024) throw new IOException("too big");
                            out.write(buf, 0, n);
                        }
                        out.flush();
                        ok = true;
                    }
                } catch (Throwable e) {
                    ok = false;
                } finally {
                    try { if (in != null) in.close(); } catch (Exception ignore) { }
                    try { if (out != null) out.close(); } catch (Exception ignore) { }
                    try { if (conn != null) conn.disconnect(); } catch (Exception ignore) { }
                }
                if (ok && tmp.length() > 0) {
                    tmp.renameTo(f);
                    STK_FAIL.remove(url);
                } else {
                    tmp.delete();
                    STK_FAIL.put(url, System.currentTimeMillis());
                    return null;
                }
            }
            BitmapFactory.Options o = new BitmapFactory.Options();
            o.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(f.getAbsolutePath(), o);
            if (o.outWidth <= 0 || o.outHeight <= 0) { f.delete(); return null; }
            int sample = 1;
            while (o.outWidth / (sample * 2) >= maxSide && o.outHeight / (sample * 2) >= maxSide) sample *= 2;
            BitmapFactory.Options o2 = new BitmapFactory.Options();
            o2.inSampleSize = sample;
            o2.inPreferredConfig = Bitmap.Config.ARGB_8888;
            return BitmapFactory.decodeFile(f.getAbsolutePath(), o2);
        } catch (Throwable t) {
            return null;
        }
    }

    /** فایل‌های تصویرِ قدیمی (که دیگر در تنظیمات نیستند) را پاک می‌کند */
    private static void stkCleanupImages(Context ctx, String... urls) {
        try {
            File dir = new File(ctx.getFilesDir(), "sticky");
            File[] all = dir.listFiles();
            if (all == null) return;
            java.util.HashSet<String> keep = new java.util.HashSet<String>();
            for (int i = 0; i < urls.length; i++) {
                String u = stkNorm(urls[i]);
                if (u.length() > 0) keep.add(stkImgName(u));
            }
            for (int i = 0; i < all.length; i++) {
                if (all[i].getName().startsWith("img_") && !keep.contains(all[i].getName())) all[i].delete();
            }
        } catch (Throwable ignore) { }
    }

    /** تصویر را وسط‌چین و برش‌خورده (cover) داخل مستطیل مقصد می‌کشد */
    private static void stkDrawCover(Canvas c, Bitmap img, RectF dst, Paint p) {
        float sw = img.getWidth(), sh = img.getHeight();
        float dr = dst.width() / dst.height(), sr = sw / sh;
        Rect src;
        if (sr > dr) {
            int w = Math.round(sh * dr);
            int l = (int) ((sw - w) / 2f);
            src = new Rect(l, 0, l + w, (int) sh);
        } else {
            int h = Math.round(sw / dr);
            int t = (int) ((sh - h) / 2f);
            src = new Rect(0, t, (int) sw, t + h);
        }
        c.drawBitmap(img, src, dst, p);
    }

    private static Paint stkImgPaint() {
        return new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
    }

    /**
     * آیکون کوچک اعلان باید یک «شکل» باشد (فقط کانال آلفا مهم است و سفید کشیده می‌شود). اگر تصویر شفافیت دارد،
     * همان شکل شفاف استفاده می‌شود؛ اگر تصویر تمام‌رنگ و بدون شفافیت است، رنگ گوشه‌ها را «زمینه» فرض می‌کنیم و
     * هرچه با زمینه فرق دارد شکل می‌شود. اگر نتیجه خیلی خالی یا خیلی پر بود، null برمی‌گردد (آیکون پیش‌فرض می‌ماند).
     */
    private static Bitmap stkSilhouette(Bitmap img, int size) {
        try {
            Bitmap sq = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
            stkDrawCover(new Canvas(sq), img, new RectF(0f, 0f, size, size), stkImgPaint());
            int n = size * size;
            int[] px = new int[n];
            sq.getPixels(px, 0, size, 0, 0, size, size);
            int translucent = 0;
            for (int i = 0; i < n; i++) if (((px[i] >>> 24) & 255) < 235) translucent++;
            int[] outA = new int[n];
            if (translucent > n * 0.03) {
                for (int i = 0; i < n; i++) outA[i] = (px[i] >>> 24) & 255;
            } else {
                int[] corners = { px[0], px[size - 1], px[n - size], px[n - 1] };
                int br = 0, bg = 0, bb = 0;
                for (int i = 0; i < 4; i++) { br += (corners[i] >> 16) & 255; bg += (corners[i] >> 8) & 255; bb += corners[i] & 255; }
                br /= 4; bg /= 4; bb /= 4;
                for (int i = 0; i < n; i++) {
                    int dr = ((px[i] >> 16) & 255) - br, dg = ((px[i] >> 8) & 255) - bg, db = (px[i] & 255) - bb;
                    float d = (float) Math.sqrt(dr * dr + dg * dg + db * db) / 441f;
                    float t = (d - 0.08f) / (0.30f - 0.08f);
                    if (t < 0f) t = 0f; if (t > 1f) t = 1f;
                    outA[i] = Math.round(t * t * (3f - 2f * t) * 255f);
                }
            }
            long sum = 0;
            for (int i = 0; i < n; i++) sum += outA[i];
            float cover = sum / (255f * n);
            if (cover < 0.03f || cover > 0.92f) return null;
            for (int i = 0; i < n; i++) px[i] = (outA[i] << 24) | 0x00FFFFFF;
            Bitmap out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
            out.setPixels(px, 0, size, 0, 0, size, size);
            return out;
        } catch (Throwable t) {
            return null;
        }
    }

    private static int stkMix(int a, int b, float t) {
        int ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
        int br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
        int r = (int) (ar + (br - ar) * t);
        int g = (int) (ag + (bg - ag) * t);
        int bl = (int) (ab + (bb - ab) * t);
        return 0xFF000000 | (r << 16) | (g << 8) | bl;
    }

    private static Paint stkText(int color, float size, boolean bold) {
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.SUBPIXEL_TEXT_FLAG);
        p.setColor(color);
        p.setTextSize(size);
        p.setTypeface(bold ? Typeface.DEFAULT_BOLD : Typeface.DEFAULT);
        return p;
    }

    private static void stkFit(Paint p, String s, float maxW) {
        float w = p.measureText(s);
        if (w > maxW && w > 0) p.setTextSize(p.getTextSize() * maxW / w);
    }

    /** کاشی تقویمِ سه‌بعدی: سربرگ سبز براق، حلقه‌های طلایی، عدد برجسته با عمق و سایه */
    private static Bitmap stkTile(int s, String day, String month, String weekday, Bitmap img, int imgAlphaPct) {
        Bitmap bmp = Bitmap.createBitmap(s, s, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        float pad = s * 0.07f;
        RectF body = new RectF(pad, pad * 1.6f, s - pad, s - pad * 1.5f);
        float rad = s * 0.13f;

        Paint sh = new Paint(Paint.ANTI_ALIAS_FLAG);
        sh.setColor(0xFF0B2E2A);
        sh.setShadowLayer(s * 0.05f, 0, s * 0.035f, 0x88000000);
        c.drawRoundRect(body, rad, rad, sh);

        Paint bp = new Paint(Paint.ANTI_ALIAS_FLAG);
        bp.setShader(new LinearGradient(0, body.top, 0, body.bottom, 0xFFFFFFFF, 0xFFE4DCC6, Shader.TileMode.CLAMP));
        c.drawRoundRect(body, rad, rad, bp);

        // تصویر دلخواه مدیر، کمرنگ پشت تاریخ (سربرگ سبز و عدد روی آن می‌آیند)
        if (img != null) {
            Path imgClip = new Path();
            imgClip.addRoundRect(body, rad, rad, Path.Direction.CW);
            c.save();
            c.clipPath(imgClip);
            Paint ip = stkImgPaint();
            ip.setAlpha(Math.max(0, Math.min(100, imgAlphaPct)) * 255 / 100);
            stkDrawCover(c, img, body, ip);
            c.restore();
        }

        float headH = body.height() * 0.30f;
        Path clip = new Path();
        clip.addRoundRect(body, rad, rad, Path.Direction.CW);
        c.save();
        c.clipPath(clip);
        Paint hp = new Paint(Paint.ANTI_ALIAS_FLAG);
        hp.setShader(new LinearGradient(0, body.top, 0, body.top + headH, 0xFF2F9A86, 0xFF0F4A40, Shader.TileMode.CLAMP));
        c.drawRect(body.left, body.top, body.right, body.top + headH, hp);
        Paint gl = new Paint(Paint.ANTI_ALIAS_FLAG);
        gl.setShader(new LinearGradient(0, body.top, 0, body.top + headH * 0.55f, 0x66FFFFFF, 0x00FFFFFF, Shader.TileMode.CLAMP));
        c.drawRect(body.left, body.top, body.right, body.top + headH * 0.55f, gl);
        Paint gold = new Paint(Paint.ANTI_ALIAS_FLAG);
        gold.setColor(0xFFE7C46A);
        c.drawRect(body.left, body.top + headH, body.right, body.top + headH + s * 0.012f, gold);
        c.restore();

        Paint mp = stkText(0xFFFFFFFF, headH * 0.58f, true);
        mp.setTextAlign(Paint.Align.CENTER);
        mp.setShadowLayer(s * 0.01f, 0, s * 0.008f, 0xAA000000);
        stkFit(mp, month, body.width() * 0.78f);
        c.drawText(month, body.centerX(), body.top + headH * 0.5f + mp.getTextSize() * 0.33f, mp);

        for (int i = 0; i < 2; i++) {
            float cx = body.left + body.width() * (i == 0 ? 0.28f : 0.72f);
            RectF r = new RectF(cx - s * 0.028f, body.top - s * 0.05f, cx + s * 0.028f, body.top + s * 0.06f);
            Paint rp = new Paint(Paint.ANTI_ALIAS_FLAG);
            rp.setShader(new LinearGradient(r.left, 0, r.right, 0, 0xFFF7E2A0, 0xFFB78A2B, Shader.TileMode.CLAMP));
            rp.setShadowLayer(s * 0.012f, 0, s * 0.01f, 0x66000000);
            c.drawRoundRect(r, s * 0.028f, s * 0.028f, rp);
        }

        float areaTop = body.top + headH + s * 0.02f;
        float areaBottom = body.bottom - s * 0.10f;
        Paint dp = stkText(0xFF0F4A40, (areaBottom - areaTop) * 0.92f, true);
        dp.setTextAlign(Paint.Align.CENTER);
        stkFit(dp, day, body.width() * 0.72f);
        float baseY = areaTop + (areaBottom - areaTop) / 2f + dp.getTextSize() * 0.34f;
        int depth = Math.max(4, (int) (s * 0.03f));
        for (int i = depth; i >= 1; i--) {
            Paint ex = stkText(stkMix(0xFF2B7A6B, 0xFF082822, (float) i / depth), dp.getTextSize(), true);
            ex.setTextAlign(Paint.Align.CENTER);
            c.drawText(day, body.centerX() + i * 0.7f, baseY + i, ex);
        }
        dp.setShader(new LinearGradient(0, baseY - dp.getTextSize() * 0.75f, 0, baseY, 0xFF2FA58E, 0xFF0F5B4E, Shader.TileMode.CLAMP));
        dp.setShadowLayer(s * 0.015f, 0, s * 0.01f, 0x55000000);
        c.drawText(day, body.centerX(), baseY, dp);

        Paint wp = stkText(0xFF5E746F, s * 0.085f, true);
        wp.setTextAlign(Paint.Align.CENTER);
        stkFit(wp, weekday, body.width() * 0.8f);
        c.drawText(weekday, body.centerX(), body.bottom - s * 0.035f, wp);

        Paint ed = new Paint(Paint.ANTI_ALIAS_FLAG);
        ed.setStyle(Paint.Style.STROKE);
        ed.setStrokeWidth(Math.max(1.5f, s * 0.008f));
        ed.setShader(new LinearGradient(0, body.top, 0, body.bottom, 0xCCFFFFFF, 0x33000000, Shader.TileMode.CLAMP));
        c.drawRoundRect(body, rad, rad, ed);
        return bmp;
    }

    // ---------- اجزای تزئینی کارت ----------

    /** ستارهٔ هشت‌پر (خاتم): دو مربع روی هم؛ با Paint از نوع STROKE خطوط ستاره کشیده می‌شود */
    private static void stkStar8(Canvas c, float cx, float cy, float r, Paint p) {
        c.save();
        c.translate(cx, cy);
        RectF sq = new RectF(-r, -r, r, r);
        c.drawRect(sq, p);
        c.rotate(45f);
        c.drawRect(sq, p);
        c.restore();
    }

    /** نقش هندسی اسلامی (ستاره‌های هشت‌پر) به‌صورت شبکهٔ کمرنگ */
    private static void stkPattern(Canvas c, float w, float h, float step, int color) {
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(Math.max(1.2f, step * 0.016f));
        p.setColor(color);
        int row = 0;
        for (float y = step * 0.5f; y < h + step; y += step * 0.5f) {
            float off = (row % 2 == 0) ? 0f : step * 0.5f;
            for (float x = off; x < w + step; x += step) {
                stkStar8(c, x, y, step * 0.17f, p);
            }
            row++;
        }
    }

    /** هلال طلایی براق (با سایه) */
    private static void stkCrescent(Canvas c, float cx, float cy, float r) {
        Path cr = new Path();
        cr.addCircle(cx, cy, r, Path.Direction.CW);
        Path cut = new Path();
        cut.addCircle(cx + r * 0.36f, cy - r * 0.10f, r * 0.84f, Path.Direction.CW);
        cr.op(cut, Path.Op.DIFFERENCE);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setShader(new LinearGradient(cx - r, cy - r, cx + r, cy + r, 0xFFFFF1B8, 0xFFC9A24B, Shader.TileMode.CLAMP));
        p.setShadowLayer(r * 0.25f, 0f, r * 0.08f, 0x99000000);
        c.drawPath(cr, p);
    }

    /** ستارهٔ پنج‌پر طلایی */
    private static void stkStar5(Canvas c, float cx, float cy, float r) {
        Path p = new Path();
        for (int i = 0; i < 10; i++) {
            double a = -Math.PI / 2 + i * Math.PI / 5;
            float rr = (i % 2 == 0) ? r : r * 0.42f;
            float x = cx + (float) (Math.cos(a) * rr);
            float y = cy + (float) (Math.sin(a) * rr);
            if (i == 0) p.moveTo(x, y); else p.lineTo(x, y);
        }
        p.close();
        Paint pt = new Paint(Paint.ANTI_ALIAS_FLAG);
        pt.setShader(new LinearGradient(cx - r, cy - r, cx + r, cy + r, 0xFFFFF1B8, 0xFFC9A24B, Shader.TileMode.CLAMP));
        pt.setShadowLayer(r * 0.3f, 0f, r * 0.1f, 0x88000000);
        c.drawPath(p, pt);
    }

    /** خط آسمانِ مسجد (گنبد و دو مناره) به‌صورت سایه‌روشن کمرنگ */
    private static void stkSkyline(Canvas c, float x0, float baseY, float u, float bottom, int color) {
        Path p = new Path();
        float hallW = u * 6f;
        p.addRect(x0, baseY, x0 + hallW, bottom, Path.Direction.CW);
        float cx = x0 + hallW / 2f;
        p.addCircle(cx, baseY, u * 1.15f, Path.Direction.CW);
        p.addCircle(cx - u * 2.0f, baseY, u * 0.6f, Path.Direction.CW);
        p.addCircle(cx + u * 2.0f, baseY, u * 0.6f, Path.Direction.CW);
        float mw = u * 0.3f;
        float[] mx = new float[] { x0 - u * 0.5f, x0 + hallW + u * 0.2f };
        for (int i = 0; i < mx.length; i++) {
            float top = baseY - u * 2.6f;
            p.addRect(mx[i], top, mx[i] + mw, bottom, Path.Direction.CW);
            p.moveTo(mx[i] - mw * 0.45f, top);
            p.lineTo(mx[i] + mw * 0.5f, top - u * 0.8f);
            p.lineTo(mx[i] + mw * 1.45f, top);
            p.close();
        }
        Paint fp = new Paint(Paint.ANTI_ALIAS_FLAG);
        fp.setColor(color);
        c.drawPath(p, fp);
    }

    /** پس‌زمینهٔ کارت: سبز عمیق، درخشش طلایی، نقش خاتم و لبهٔ طلایی */
    private static void stkBackground(Canvas c, int w, int h, float radius, float patternStep, Bitmap bgImg, int dimPct) {
        RectF r = new RectF(0f, 0f, w, h);
        if (bgImg != null) {
            // تصویر دلخواه مدیر + لایهٔ تیرهٔ ملایم تا نوشته‌ها خوانا بمانند
            Path bclip = new Path();
            bclip.addRoundRect(r, radius, radius, Path.Direction.CW);
            c.save();
            c.clipPath(bclip);
            stkDrawCover(c, bgImg, r, stkImgPaint());
            int d = Math.max(0, Math.min(90, dimPct));
            int a0 = (int) (255 * d / 100f * 0.8f);
            int a1 = Math.min(255, (int) (255 * d / 100f * 1.25f));
            Paint scrim = new Paint(Paint.ANTI_ALIAS_FLAG);
            scrim.setShader(new LinearGradient(0f, 0f, 0f, h, (a0 << 24) | 0x041A16, (a1 << 24) | 0x041A16, Shader.TileMode.CLAMP));
            c.drawRect(r, scrim);
            c.restore();
            Paint bed = new Paint(Paint.ANTI_ALIAS_FLAG);
            bed.setStyle(Paint.Style.STROKE);
            bed.setStrokeWidth(Math.max(2f, h * 0.007f));
            bed.setShader(new LinearGradient(0f, 0f, 0f, h, 0xBBF3D98A, 0x33F3D98A, Shader.TileMode.CLAMP));
            c.drawRoundRect(new RectF(1.5f, 1.5f, w - 1.5f, h - 1.5f), radius, radius, bed);
            return;
        }
        Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
        bg.setShader(new LinearGradient(0f, 0f, w, h,
                new int[] { 0xFF04201B, 0xFF0E5446, 0xFF1D7F6B }, new float[] { 0f, 0.6f, 1f }, Shader.TileMode.CLAMP));
        c.drawRoundRect(r, radius, radius, bg);

        Paint glow = new Paint(Paint.ANTI_ALIAS_FLAG);
        glow.setShader(new RadialGradient(w * 0.18f, 0f, h * 1.25f, 0x55F3D98A, 0x00F3D98A, Shader.TileMode.CLAMP));
        c.drawRoundRect(r, radius, radius, glow);

        Paint glow2 = new Paint(Paint.ANTI_ALIAS_FLAG);
        glow2.setShader(new RadialGradient(w * 0.86f, h * 0.55f, h * 0.9f, 0x4435C9A8, 0x0035C9A8, Shader.TileMode.CLAMP));
        c.drawRoundRect(r, radius, radius, glow2);

        Path clip = new Path();
        clip.addRoundRect(r, radius, radius, Path.Direction.CW);
        c.save();
        c.clipPath(clip);
        stkPattern(c, w, h, patternStep, 0x17F3D98A);
        Paint sheen = new Paint(Paint.ANTI_ALIAS_FLAG);
        sheen.setShader(new LinearGradient(0f, 0f, 0f, h * 0.45f, 0x2AFFFFFF, 0x00FFFFFF, Shader.TileMode.CLAMP));
        c.drawRect(0f, 0f, w, h * 0.45f, sheen);
        c.restore();

        Paint ed = new Paint(Paint.ANTI_ALIAS_FLAG);
        ed.setStyle(Paint.Style.STROKE);
        ed.setStrokeWidth(Math.max(2f, h * 0.007f));
        ed.setShader(new LinearGradient(0f, 0f, 0f, h, 0xBBF3D98A, 0x33F3D98A, Shader.TileMode.CLAMP));
        c.drawRoundRect(new RectF(1.5f, 1.5f, w - 1.5f, h - 1.5f), radius, radius, ed);
    }

    /** کارت بزرگ (حالت بازشدهٔ نوتیفیکیشن): همهٔ اطلاعات داخل خود تصویر است */
    private static Bitmap stkCard(int w, int h, Bitmap tile, String brand, String jalali, String hijri,
                                  String greg, String next, String nextName, String nextTime, String dua,
                                  Bitmap bgImg, int bgDim, Bitmap iconImg) {
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        stkBackground(c, w, h, h * 0.10f, h * 0.2f, bgImg, bgDim);

        // هلال و ستارهٔ بالا-چپ (اگر مدیر تصویر دلخواه گذاشته باشد، همان تصویر به‌جای هلال)
        float mr = h * 0.075f, mcx = h * 0.17f, mcy = h * 0.15f;
        if (iconImg != null) {
            float ir = mr * 1.45f;
            Path cp = new Path();
            cp.addCircle(mcx, mcy, ir, Path.Direction.CW);
            c.save();
            c.clipPath(cp);
            stkDrawCover(c, iconImg, new RectF(mcx - ir, mcy - ir, mcx + ir, mcy + ir), stkImgPaint());
            c.restore();
            Paint ring = new Paint(Paint.ANTI_ALIAS_FLAG);
            ring.setStyle(Paint.Style.STROKE);
            ring.setStrokeWidth(Math.max(2f, h * 0.006f));
            ring.setColor(0xAAF3D98A);
            c.drawCircle(mcx, mcy, ir, ring);
        } else {
            stkCrescent(c, mcx, mcy, mr);
            stkStar5(c, mcx + mr * 0.62f, mcy - mr * 0.12f, mr * 0.28f);
        }

        // خط آسمان مسجد پایین-چپ (کمرنگ؛ با تصویر پس‌زمینهٔ دلخواه نمایش داده نمی‌شود)
        if (bgImg == null) {
            Path clip = new Path();
            clip.addRoundRect(new RectF(0f, 0f, w, h), h * 0.10f, h * 0.10f, Path.Direction.CW);
            c.save();
            c.clipPath(clip);
            stkSkyline(c, w * 0.05f, h * 0.93f, h * 0.05f, h, 0x2A000000);
            c.restore();
        }

        // کاشی سه‌بعدی سمت راست
        int ts = tile.getWidth();
        float tl = w - ts - h * 0.035f;
        float tt = (h - ts) / 2f;
        c.drawBitmap(tile, null, new RectF(tl, tt, tl + ts, tt + ts), new Paint(Paint.FILTER_BITMAP_FLAG));

        float right = tl - h * 0.03f;
        float left = h * 0.09f;
        float maxW = right - left;

        // نام برنامه (بخش بیرون پرانتز طلایی، بخش داخل پرانتز کوچک‌تر)
        String main = brand == null ? "" : brand;
        String sub = "";
        int po = main.indexOf('(');
        if (po > 0) {
            int pc = main.indexOf(')', po);
            sub = main.substring(po + 1, pc > po ? pc : main.length()).trim();
            main = main.substring(0, po).trim();
        }
        Paint pb1 = stkText(STK_GOLD, h * 0.066f, true);
        pb1.setTextAlign(Paint.Align.RIGHT);
        stkFit(pb1, main, maxW);
        c.drawText(main, right, h * 0.105f, pb1);
        if (sub.length() > 0) {
            Paint pb2 = stkText(0xB3FFFFFF, h * 0.045f, false);
            pb2.setTextAlign(Paint.Align.RIGHT);
            stkFit(pb2, sub, maxW);
            c.drawText(sub, right, h * 0.165f, pb2);
        }

        // تاریخ شمسی (درشت)، قمری (طلایی)، میلادی
        Paint p1 = stkText(0xFFFFFFFF, h * 0.125f, true);
        p1.setTextAlign(Paint.Align.RIGHT);
        p1.setShadowLayer(5f, 0f, 3f, 0x99000000);
        stkFit(p1, jalali, maxW);
        c.drawText(jalali, right, h * 0.325f, p1);

        Paint p2 = stkText(STK_GOLD, h * 0.07f, false);
        p2.setTextAlign(Paint.Align.RIGHT);
        stkFit(p2, hijri, maxW);
        c.drawText(hijri, right, h * 0.435f, p2);

        Paint p3 = stkText(0xCCFFFFFF, h * 0.062f, false);
        p3.setTextAlign(Paint.Align.RIGHT);
        stkFit(p3, greg, maxW);
        c.drawText(greg, right, h * 0.515f, p3);

        // قرص شیشه‌ای «اذان بعدی»
        boolean hasNext = (nextName != null && nextName.length() > 0) || (next != null && next.length() > 0);
        if (hasNext) {
            float pt = h * 0.585f, pbm = h * 0.775f;
            float pr = (pbm - pt) / 2f;
            float cy = pt + pr;
            RectF pill = new RectF(left, pt, right, pbm);
            Paint pf = new Paint(Paint.ANTI_ALIAS_FLAG);
            pf.setShader(new LinearGradient(0f, pt, 0f, pbm, 0x55FFFFFF, 0x14FFFFFF, Shader.TileMode.CLAMP));
            pf.setShadowLayer(h * 0.02f, 0f, h * 0.012f, 0x66000000);
            c.drawRoundRect(pill, pr, pr, pf);
            Paint ps = new Paint(Paint.ANTI_ALIAS_FLAG);
            ps.setStyle(Paint.Style.STROKE);
            ps.setStrokeWidth(Math.max(2f, h * 0.006f));
            ps.setColor(0xAAF3D98A);
            c.drawRoundRect(pill, pr, pr, ps);

            Paint dot = new Paint(Paint.ANTI_ALIAS_FLAG);
            dot.setColor(STK_GOLD);
            c.drawCircle(right - pr * 0.8f, cy, pr * 0.2f, dot);

            String nm = (nextName != null && nextName.length() > 0) ? ("اذان بعدی: " + nextName) : next;
            Paint pn = stkText(0xFFFFFFFF, h * 0.072f, true);
            pn.setTextAlign(Paint.Align.RIGHT);
            boolean hasTime = nextTime != null && nextTime.length() > 0;
            stkFit(pn, nm, hasTime ? maxW * 0.58f : maxW - pr * 2.2f);
            c.drawText(nm, right - pr * 1.25f, cy + pn.getTextSize() * 0.34f, pn);

            if (hasTime) {
                Paint pm = stkText(STK_GOLD, h * 0.092f, true);
                pm.setShadowLayer(4f, 0f, 3f, 0x99000000);
                stkFit(pm, nextTime, maxW * 0.3f);
                c.drawText(nextTime, left + pr * 0.75f, cy + pm.getTextSize() * 0.34f, pm);
            }
        }

        // دعا / متن مدیر پایین کارت
        if (dua != null && dua.length() > 0) {
            Paint ln = new Paint(Paint.ANTI_ALIAS_FLAG);
            ln.setStrokeWidth(Math.max(2f, h * 0.004f));
            ln.setShader(new LinearGradient(left, 0f, right, 0f, 0x00F3D98A, 0x99F3D98A, Shader.TileMode.CLAMP));
            c.drawLine(left, h * 0.845f, right, h * 0.845f, ln);
            Paint pd = stkText(STK_GOLD, h * 0.06f, false);
            pd.setTextAlign(Paint.Align.RIGHT);
            stkFit(pd, dua, maxW);
            c.drawText(dua, right, h * 0.915f, pd);
        }
        return bmp;
    }

    /** نوار باریک (حالت بسته‌شدهٔ نوتیفیکیشن): کاشی تاریخ + تاریخ‌ها + اذان بعدی */
    private static Bitmap stkBar(int w, int h, Bitmap tile, String jalali, String hijri,
                                 String next, String nextName, String nextTime, Bitmap bgImg, int bgDim) {
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        stkBackground(c, w, h, h * 0.28f, h * 0.55f, bgImg, bgDim);

        int ts = tile.getWidth();
        float tl = w - ts - h * 0.03f;
        float tt = (h - ts) / 2f;
        c.drawBitmap(tile, null, new RectF(tl, tt, tl + ts, tt + ts), new Paint(Paint.FILTER_BITMAP_FLAG));

        float right = tl - h * 0.08f;
        Paint p1 = stkText(0xFFFFFFFF, h * 0.30f, true);
        p1.setTextAlign(Paint.Align.RIGHT);
        p1.setShadowLayer(4f, 0f, 2f, 0x99000000);
        stkFit(p1, jalali, w * 0.42f);
        c.drawText(jalali, right, h * 0.47f, p1);

        Paint p2 = stkText(STK_GOLD, h * 0.20f, false);
        p2.setTextAlign(Paint.Align.RIGHT);
        stkFit(p2, hijri, w * 0.42f);
        c.drawText(hijri, right, h * 0.80f, p2);

        float left = h * 0.30f;
        boolean hasTime = nextTime != null && nextTime.length() > 0;
        if (hasTime) {
            String nm = (nextName != null && nextName.length() > 0) ? ("اذان بعدی: " + nextName) : "اذان بعدی";
            Paint pn = stkText(0xE6FFFFFF, h * 0.19f, true);
            stkFit(pn, nm, w * 0.30f);
            c.drawText(nm, left, h * 0.36f, pn);
            Paint pm = stkText(STK_GOLD, h * 0.40f, true);
            pm.setShadowLayer(4f, 0f, 3f, 0x99000000);
            stkFit(pm, nextTime, w * 0.30f);
            c.drawText(nextTime, left, h * 0.80f, pm);
        } else if (next != null && next.length() > 0) {
            Paint pn = stkText(STK_GOLD, h * 0.22f, true);
            stkFit(pn, next, w * 0.36f);
            c.drawText(next, left, h * 0.60f, pn);
        }
        return bmp;
    }

    @PluginMethod
    public void showSticky(PluginCall call) {
        try {
            Context ctx = getContext();
            String pkg = ctx.getPackageName();
            String brand = call.getString("brand", "عارفان جام");
            String weekday = call.getString("weekday", "");
            String day = call.getString("day", "");
            String month = call.getString("month", "");
            String jalali = call.getString("jalali", "");
            String hijri = call.getString("hijri", "");
            String greg = call.getString("gregorian", "");
            String custom = call.getString("custom", "");
            String next = call.getString("next", "");
            String nextName = call.getString("nextName", "");
            String nextTime = call.getString("nextTime", "");
            // تصاویر دلخواه مدیر (از پیشخوان سایت)
            String bgUrl = call.getString("bgUrl", "");
            String tileUrl = call.getString("tileUrl", "");
            String iconUrl = call.getString("iconUrl", "");
            String smallIconUrl = call.getString("smallIconUrl", "");
            Integer bgDimV = call.getInt("bgDim", 45);
            Integer tileAlphaV = call.getInt("tileAlpha", 35);
            int bgDim = bgDimV == null ? 45 : bgDimV.intValue();
            int tileAlpha = tileAlphaV == null ? 35 : tileAlphaV.intValue();
            // آخرین مشخصات کارت را نگه می‌داریم تا بعد از هر اذان، بدون باز شدن اپ و بدون اینترنت،
            // «اذان بعدی» روی کارت از فهرست ذخیره‌شدهٔ اذان‌ها به‌روز شود (stkRefreshNext)
            try {
                JSONObject sv = new JSONObject();
                sv.put("brand", brand); sv.put("weekday", weekday); sv.put("day", day); sv.put("month", month);
                sv.put("jalali", jalali); sv.put("hijri", hijri); sv.put("gregorian", greg); sv.put("custom", custom);
                sv.put("next", next); sv.put("nextName", nextName); sv.put("nextTime", nextTime);
                sv.put("bgUrl", bgUrl); sv.put("tileUrl", tileUrl); sv.put("iconUrl", iconUrl); sv.put("smallIconUrl", smallIconUrl);
                sv.put("bgDim", bgDim); sv.put("tileAlpha", tileAlpha);
                ctx.getSharedPreferences(STK_PREFS, Context.MODE_PRIVATE).edit().putString("card", sv.toString()).apply();
            } catch (Throwable ignore) { }
            stkRender(ctx, brand, weekday, day, month, jalali, hijri, greg, custom, next, nextName, nextTime,
                      bgUrl, tileUrl, iconUrl, smallIconUrl, bgDim, tileAlpha, true);
            call.resolve();
        } catch (Throwable t) {
            call.reject("sticky: " + t);
        }
    }

    private static final String STK_PREFS = "arefanejam_sticky_state";

    /** کارت/نوار نوتیفیکیشن ثابت را می‌سازد و نشان می‌دهد. allowNet=false یعنی هیچ دانلودی انجام نشود. */
    private static void stkRender(Context ctx, String brand, String weekday, String day, String month, String jalali,
                                  String hijri, String greg, String custom, String next, String nextName, String nextTime,
                                  String bgUrl, String tileUrl, String iconUrl, String smallIconUrl, int bgDim, int tileAlpha, boolean allowNet) throws Exception {
            String pkg = ctx.getPackageName();
            Bitmap bgImg = stkLoadImage(ctx, bgUrl, 1280, allowNet);
            Bitmap tileImg = stkLoadImage(ctx, tileUrl, 450, allowNet);
            Bitmap iconImg = stkLoadImage(ctx, iconUrl, 256, allowNet);
            Bitmap smallImg = stkLoadImage(ctx, smallIconUrl, 256, allowNet);
            stkCleanupImages(ctx, bgUrl, tileUrl, iconUrl, smallIconUrl);

            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(STK_CH) == null) {
                NotificationChannel ch = new NotificationChannel(STK_CH, "تاریخ و اذان بعدی", NotificationManager.IMPORTANCE_LOW);
                ch.setShowBadge(false);
                ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                nm.createNotificationChannel(ch);
            }

            Intent launch = ctx.getPackageManager().getLaunchIntentForPackage(pkg);
            int piFlags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
            PendingIntent pi = PendingIntent.getActivity(ctx, 0, launch, piFlags);

            int small = ctx.getResources().getIdentifier("ic_stat_azan", "drawable", pkg);
            if (small == 0) small = ctx.getApplicationInfo().icon;

            String line = next.length() > 0 ? next : (custom.length() > 0 ? custom : greg);
            NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, STK_CH)
                .setSmallIcon(small)
                .setColor(0xFF143C36)
                .setContentTitle(brand + " — " + jalali)
                .setContentText(line)
                .setOngoing(true)
                .setAutoCancel(false)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setContentIntent(pi);

            // آیکون کوچک بالای اعلان (دایرهٔ کنار نام اپ): فقط از «آیکون کوچک اعلان» پیشخوان گرفته می‌شود؛ اگر خالی بود آیکون ماهِ پیش‌فرض.
            // اندروید این آیکون را همیشه تک‌رنگ (سفید) نشان می‌دهد؛ پس تصویر قبل از استفاده به یک شکل سفید تبدیل می‌شود (stkSilhouette).
            if (smallImg != null && Build.VERSION.SDK_INT >= 23) {
                try {
                    Bitmap sm = stkSilhouette(smallImg, 96);
                    if (sm != null) {
                        Class<?> iconCompat = Class.forName("androidx.core.graphics.drawable.IconCompat");
                        Object icon = iconCompat.getMethod("createWithBitmap", Bitmap.class).invoke(null, sm);
                        b.getClass().getMethod("setSmallIcon", iconCompat).invoke(b, icon);
                    }
                } catch (Throwable ignore) { }
            }

            Bitmap card = stkCard(1080, 540, stkTile(420, day, month, weekday, tileImg, tileAlpha), brand, jalali, hijri, greg, next, nextName, nextTime, custom, bgImg, bgDim, iconImg);

            int layoutId = ctx.getResources().getIdentifier("sticky_card", "layout", pkg);
            int imgId = ctx.getResources().getIdentifier("sticky_img", "id", pkg);
            if (layoutId != 0 && imgId != 0) {
                // همه‌چیز فقط یک تصویر است: نه عنوان و نه متن جداگانه
                Bitmap bar = stkBar(1280, 240, stkTile(225, day, month, weekday, tileImg, tileAlpha), jalali, hijri, next, nextName, nextTime, bgImg, bgDim);
                RemoteViews rvSmall = new RemoteViews(pkg, layoutId);
                rvSmall.setImageViewBitmap(imgId, bar);
                RemoteViews rvBig = new RemoteViews(pkg, layoutId);
                rvBig.setImageViewBitmap(imgId, card);
                b.setStyle(new NotificationCompat.DecoratedCustomViewStyle())
                 .setCustomContentView(rvSmall)
                 .setCustomBigContentView(rvBig);
            } else {
                // اگر فایل طرح (sticky_card.xml) داخل APK نبود: همان نمایش تصویریِ قبلی
                b.setLargeIcon(stkTile(192, day, month, weekday, tileImg, tileAlpha))
                 .setStyle(new NotificationCompat.BigPictureStyle()
                    .bigPicture(card)
                    .bigLargeIcon((Bitmap) null)
                    .setSummaryText(line));
            }
            nm.notify(STK_ID, b.build());
    }

    private static String stkFa(String s) {
        String fa = "\u06f0\u06f1\u06f2\u06f3\u06f4\u06f5\u06f6\u06f7\u06f8\u06f9";
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            sb.append(c >= '0' && c <= '9' ? fa.charAt(c - '0') : c);
        }
        return sb.toString();
    }

    /**
     * بعد از هر اذان (یا بوت/تغییر ساعت) از AzanReceiver صدا زده می‌شود: «اذان بعدی» کارت را از فهرست اذان‌های
     * ذخیره‌شدهٔ خود گوشی می‌خواند و کارت را دوباره می‌کشد. نه اپ باز لازم است نه اینترنت.
     * فقط وقتی کارت هنوز روی گوشی هست به‌روز می‌کند (اگر کاربر کنارش زده باشد دوباره ساخته نمی‌شود).
     */
    static void stkRefreshNext(Context ctx) { stkRefreshNext(ctx, false); }

    /**
     * force=true (بعد از روشن‌شدن گوشی / بروزرسانی اپ): اعلان بعد از ریبوت از بین رفته است، پس کارت را بدون شرط
     * «هنوز روی گوشی هست» از مشخصات ذخیره‌شده دوباره می‌سازد. اگر مدیر نوتیفیکیشن ثابت را خاموش کرده باشد
     * (hideSticky مشخصات را پاک می‌کند) چیزی ساخته نمی‌شود.
     */
    static void stkRefreshNext(Context ctx, boolean force) {
        try {
            SharedPreferences sp = ctx.getSharedPreferences(STK_PREFS, Context.MODE_PRIVATE);
            String raw = sp.getString("card", "");
            if (raw == null || raw.length() == 0) return;
            if (!force && Build.VERSION.SDK_INT >= 23) {
                try {
                    NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
                    boolean present = false;
                    android.service.notification.StatusBarNotification[] act = nm.getActiveNotifications();
                    for (int i = 0; i < act.length; i++) if (act[i].getId() == STK_ID) present = true;
                    if (!present) return;
                } catch (Throwable ignore) { }
            }
            JSONObject o = new JSONObject(raw);
            long now = System.currentTimeMillis();
            long bestT = 0;
            String bestLabel = "";
            org.json.JSONArray arr = new org.json.JSONArray(AzanReceiver.prefs(ctx).getString("items", "[]"));
            for (int i = 0; i < arr.length(); i++) {
                JSONObject it = arr.getJSONObject(i);
                long t = it.optLong("t", 0);
                if (t > now && (bestT == 0 || t < bestT)) { bestT = t; bestLabel = it.optString("l", ""); }
            }
            String next = o.optString("next", "");
            String nextName = o.optString("nextName", "");
            String nextTime = o.optString("nextTime", "");
            if (bestT > 0) {
                java.util.Calendar cal = java.util.Calendar.getInstance();
                cal.setTimeInMillis(bestT);
                nextTime = stkFa(String.format(java.util.Locale.US, "%02d:%02d", cal.get(java.util.Calendar.HOUR_OF_DAY), cal.get(java.util.Calendar.MINUTE)));
                nextName = bestLabel;
                next = "\u0627\u0630\u0627\u0646 \u0628\u0639\u062f\u06cc: " + bestLabel + " \u2014 \u0633\u0627\u0639\u062a " + nextTime;
                if (!force && nextName.equals(o.optString("nextName", "")) && nextTime.equals(o.optString("nextTime", ""))) return; // تغییری نکرده
                o.put("next", next); o.put("nextName", nextName); o.put("nextTime", nextTime);
                sp.edit().putString("card", o.toString()).apply();
            } else if (!force) {
                return; // فهرستی در گوشی نیست؛ همان کارت قبلی بماند
            }
            stkRender(ctx, o.optString("brand", ""), o.optString("weekday", ""), o.optString("day", ""), o.optString("month", ""),
                      o.optString("jalali", ""), o.optString("hijri", ""), o.optString("gregorian", ""), o.optString("custom", ""),
                      next, nextName, nextTime, o.optString("bgUrl", ""), o.optString("tileUrl", ""), o.optString("iconUrl", ""), o.optString("smallIconUrl", ""),
                      o.optInt("bgDim", 45), o.optInt("tileAlpha", 35), false);
        } catch (Throwable ignore) { }
    }

    @PluginMethod
    public void hideSticky(PluginCall call) {
        try {
            try { getContext().getSharedPreferences(STK_PREFS, Context.MODE_PRIVATE).edit().remove("card").apply(); } catch (Throwable ignore) { }
            NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            nm.cancel(STK_ID);
            call.resolve();
        } catch (Throwable t) {
            call.reject("sticky: " + t);
        }
    }


    /* ====== Battery optimization: asked once at first launch so the phone does not kill the azan alarm ====== */
    static boolean isIgnoringBattery(Context ctx) {
        if (Build.VERSION.SDK_INT < 23) return true;
        android.os.PowerManager pm = (android.os.PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
        return pm != null && pm.isIgnoringBatteryOptimizations(ctx.getPackageName());
    }

    /** Magnetic declination (degrees, east positive) at a location, from Android's own geomagnetic model. Used by the qibla compass to convert magnetic north to true north. */
    @PluginMethod
    public void magneticDeclination(PluginCall call) {
        try {
            Double lat = call.getDouble("lat");
            Double lng = call.getDouble("lng");
            Double alt = call.getDouble("alt");
            if (lat == null || lng == null) { call.reject("no coords"); return; }
            float altitude = (alt == null) ? 0f : alt.floatValue();
            android.hardware.GeomagneticField field = new android.hardware.GeomagneticField(lat.floatValue(), lng.floatValue(), altitude, System.currentTimeMillis());
            JSObject r = new JSObject();
            r.put("declination", (double) field.getDeclination());
            call.resolve(r);
        } catch (Throwable t) {
            call.reject("declination: " + t);
        }
    }

    // ===== Qibla compass: native sensor, works on old phones / old WebView =====
    // Chain with watchdog: rotation vector -> geomagnetic rotation vector -> accelerometer + magnetic field -> legacy orientation sensor.
    // If a sensor exists but sends nothing for ~1.6 s (common on cheap/old phones), the next one in the chain is tried automatically.
    // Emits "qiblaHeading" {heading, source, accuracy} (degrees from MAGNETIC north; JS adds the declination; accuracy 0..3).
    private android.hardware.SensorManager qbSm;
    private android.hardware.SensorEventListener qbListener;
    private final float[] qbAcc = new float[3];
    private final float[] qbMag = new float[3];
    private boolean qbHaveAcc = false, qbHaveMag = false;
    private long qbLastEmit = 0;
    private volatile long qbStageStart = 0;
    private volatile int qbMagAccuracy = 3;
    private int qbStage = 0;
    private final java.util.ArrayList<String> qbChain = new java.util.ArrayList<String>();
    private android.os.Handler qbHandler;
    private Runnable qbWatchdog;

    private void qbEmit(float[] r, String source, int accuracy) {
        // Phone lying flat: direction of the top edge; phone upright: direction of the back camera.
        double east, north;
        if (Math.abs(r[8]) > 0.6) { east = r[1]; north = r[4]; }
        else { east = -r[2]; north = -r[5]; }
        if (Math.abs(east) < 1e-6 && Math.abs(north) < 1e-6) return;
        double h = Math.toDegrees(Math.atan2(east, north));
        h = (h + 360.0) % 360.0;
        long now = System.currentTimeMillis();
        if (now - qbLastEmit < 50) return;
        qbLastEmit = now;
        JSObject o = new JSObject();
        o.put("heading", h);
        o.put("source", source);
        o.put("accuracy", accuracy);
        notifyListeners("qiblaHeading", o);
    }

    /** Registers the sensor(s) of one stage of the chain and arms the watchdog that moves to the next stage if nothing arrives. */
    private void qbRunStage() {
        try {
            if (qbSm == null || qbListener == null || qbStage >= qbChain.size()) return;
            String src = qbChain.get(qbStage);
            qbSm.unregisterListener(qbListener);
            qbHaveAcc = false; qbHaveMag = false;
            qbStageStart = System.currentTimeMillis();
            int delay = android.hardware.SensorManager.SENSOR_DELAY_UI;
            if (src.equals("rotation_vector")) {
                qbSm.registerListener(qbListener, qbSm.getDefaultSensor(android.hardware.Sensor.TYPE_ROTATION_VECTOR), delay);
            } else if (src.equals("geomagnetic_rv")) {
                qbSm.registerListener(qbListener, qbSm.getDefaultSensor(android.hardware.Sensor.TYPE_GEOMAGNETIC_ROTATION_VECTOR), delay);
            } else if (src.equals("accel_mag")) {
                qbSm.registerListener(qbListener, qbSm.getDefaultSensor(android.hardware.Sensor.TYPE_ACCELEROMETER), delay);
                qbSm.registerListener(qbListener, qbSm.getDefaultSensor(android.hardware.Sensor.TYPE_MAGNETIC_FIELD), delay);
            } else {
                @SuppressWarnings("deprecation")
                android.hardware.Sensor ori = qbSm.getDefaultSensor(android.hardware.Sensor.TYPE_ORIENTATION);
                qbSm.registerListener(qbListener, ori, delay);
            }
            // The last stage has nothing to fall back to, so no watchdog is needed there.
            if (qbStage < qbChain.size() - 1) {
                if (qbHandler == null) qbHandler = new android.os.Handler(android.os.Looper.getMainLooper());
                if (qbWatchdog != null) qbHandler.removeCallbacks(qbWatchdog);
                final int myStage = qbStage;
                qbWatchdog = new Runnable() {
                    @Override public void run() {
                        try {
                            synchronized (AppUpdaterPlugin.this) {
                                if (qbListener == null || qbStage != myStage) return;
                                if (qbLastEmit >= qbStageStart) return; // this stage works
                                qbStage++;
                                qbRunStage();
                            }
                        } catch (Throwable ignore) { }
                    }
                };
                qbHandler.postDelayed(qbWatchdog, 1600);
            }
        } catch (Throwable ignore) { }
    }

    @PluginMethod
    public void startQiblaSensor(PluginCall call) {
        try {
            synchronized (this) {
                if (qbListener != null) {
                    JSObject r = new JSObject(); r.put("source", "running"); call.resolve(r); return;
                }
                qbSm = (android.hardware.SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
                if (qbSm == null) { call.reject("no sensor service"); return; }
                final android.hardware.Sensor rv = qbSm.getDefaultSensor(android.hardware.Sensor.TYPE_ROTATION_VECTOR);
                final android.hardware.Sensor grv = (Build.VERSION.SDK_INT >= 19) ? qbSm.getDefaultSensor(android.hardware.Sensor.TYPE_GEOMAGNETIC_ROTATION_VECTOR) : null;
                final android.hardware.Sensor acc = qbSm.getDefaultSensor(android.hardware.Sensor.TYPE_ACCELEROMETER);
                final android.hardware.Sensor mag = qbSm.getDefaultSensor(android.hardware.Sensor.TYPE_MAGNETIC_FIELD);
                @SuppressWarnings("deprecation")
                final android.hardware.Sensor ori = qbSm.getDefaultSensor(android.hardware.Sensor.TYPE_ORIENTATION);
                qbChain.clear();
                if (rv != null) qbChain.add("rotation_vector");
                if (grv != null) qbChain.add("geomagnetic_rv");
                if (acc != null && mag != null) qbChain.add("accel_mag");
                if (ori != null) qbChain.add("orientation");
                if (qbChain.isEmpty()) { call.reject("no compass sensor"); return; }
                qbStage = 0;
                qbMagAccuracy = 3;
                qbListener = new android.hardware.SensorEventListener() {
                    private final float[] R = new float[9];
                    private final float[] rv4 = new float[4];
                    private final float[] rv3 = new float[3];
                    @Override public void onAccuracyChanged(android.hardware.Sensor s, int a) {
                        if (s != null && s.getType() == android.hardware.Sensor.TYPE_MAGNETIC_FIELD) qbMagAccuracy = a;
                    }
                    @Override public void onSensorChanged(android.hardware.SensorEvent e) {
                        try {
                            int t = e.sensor.getType();
                            if (t == android.hardware.Sensor.TYPE_ROTATION_VECTOR || t == android.hardware.Sensor.TYPE_GEOMAGNETIC_ROTATION_VECTOR) {
                                if (e.values.length >= 4) {
                                    System.arraycopy(e.values, 0, rv4, 0, 4);
                                    android.hardware.SensorManager.getRotationMatrixFromVector(R, rv4);
                                } else {
                                    System.arraycopy(e.values, 0, rv3, 0, 3);
                                    android.hardware.SensorManager.getRotationMatrixFromVector(R, rv3);
                                }
                                qbEmit(R, t == android.hardware.Sensor.TYPE_ROTATION_VECTOR ? "rotation_vector" : "geomagnetic_rv", 3);
                            } else if (t == android.hardware.Sensor.TYPE_ACCELEROMETER || t == android.hardware.Sensor.TYPE_MAGNETIC_FIELD) {
                                float[] dst = (t == android.hardware.Sensor.TYPE_ACCELEROMETER) ? qbAcc : qbMag;
                                boolean have = (t == android.hardware.Sensor.TYPE_ACCELEROMETER) ? qbHaveAcc : qbHaveMag;
                                float a = 0.15f;
                                for (int i = 0; i < 3; i++) dst[i] = have ? dst[i] + a * (e.values[i] - dst[i]) : e.values[i];
                                if (t == android.hardware.Sensor.TYPE_ACCELEROMETER) qbHaveAcc = true; else qbHaveMag = true;
                                if (qbHaveAcc && qbHaveMag && android.hardware.SensorManager.getRotationMatrix(R, null, qbAcc, qbMag)) {
                                    qbEmit(R, "accel_mag", qbMagAccuracy);
                                }
                            } else if (t == android.hardware.Sensor.TYPE_ORIENTATION) {
                                long now = System.currentTimeMillis();
                                if (now - qbLastEmit < 50) return;
                                qbLastEmit = now;
                                JSObject o = new JSObject();
                                o.put("heading", (double) ((e.values[0] + 360f) % 360f));
                                o.put("source", "orientation");
                                o.put("accuracy", 3);
                                notifyListeners("qiblaHeading", o);
                            }
                        } catch (Throwable ignore) { }
                    }
                };
                qbRunStage();
                JSObject r = new JSObject(); r.put("source", qbChain.get(0)); r.put("chain", android.text.TextUtils.join(",", qbChain)); call.resolve(r);
            }
        } catch (Throwable t) {
            call.reject("qibla sensor: " + t);
        }
    }

    @PluginMethod
    public void stopQiblaSensor(PluginCall call) {
        try {
            synchronized (this) {
                if (qbHandler != null && qbWatchdog != null) qbHandler.removeCallbacks(qbWatchdog);
                if (qbSm != null && qbListener != null) qbSm.unregisterListener(qbListener);
                qbListener = null;
            }
        } catch (Throwable ignore) { }
        call.resolve();
    }

    /** Qibla: is the phone's Location switch on, and may this app use location? Returns {enabled, granted}. */
    @PluginMethod
    public void locationStatus(PluginCall call) {
        try {
            Context ctx = getContext();
            boolean enabled = false;
            try {
                android.location.LocationManager lm = (android.location.LocationManager) ctx.getSystemService(Context.LOCATION_SERVICE);
                if (lm != null) enabled = androidx.core.location.LocationManagerCompat.isLocationEnabled(lm);
            } catch (Throwable ignore) { }
            boolean granted =
                ContextCompat.checkSelfPermission(ctx, android.Manifest.permission.ACCESS_FINE_LOCATION) == android.content.pm.PackageManager.PERMISSION_GRANTED
                || ContextCompat.checkSelfPermission(ctx, android.Manifest.permission.ACCESS_COARSE_LOCATION) == android.content.pm.PackageManager.PERMISSION_GRANTED;
            JSObject r = new JSObject();
            r.put("enabled", enabled);
            r.put("granted", granted);
            call.resolve(r);
        } catch (Throwable t) {
            call.reject("locationStatus: " + t);
        }
    }

    /** Qibla: opens the phone's Location settings (default) or, with {app:true}, this app's permission settings page. */
    @PluginMethod
    public void openLocationSettings(PluginCall call) {
        try {
            Context ctx = getContext();
            boolean appPage = Boolean.TRUE.equals(call.getBoolean("app", false));
            Intent i;
            if (appPage) {
                i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                i.setData(Uri.parse("package:" + ctx.getPackageName()));
            } else {
                i = new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS);
            }
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(i);
            call.resolve();
        } catch (Throwable t) {
            call.reject("openLocationSettings: " + t);
        }
    }

    @PluginMethod
    public void batteryStatus(PluginCall call) {
        try {
            JSObject r = new JSObject();
            r.put("ignoring", isIgnoringBattery(getContext()));
            call.resolve(r);
        } catch (Throwable t) {
            call.reject("battery: " + t);
        }
    }

    /** Shows the Android dialog "Allow app to always run in the background?". If it cannot be shown, opens the battery settings list. */
    @PluginMethod
    public void requestBatteryExemption(PluginCall call) {
        try {
            Context ctx = getContext();
            JSObject r = new JSObject();
            if (isIgnoringBattery(ctx)) {
                r.put("ignoring", true);
                r.put("opened", false);
                call.resolve(r);
                return;
            }
            boolean opened = false;
            try {
                Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                i.setData(Uri.parse("package:" + ctx.getPackageName()));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(i);
                opened = true;
            } catch (Throwable t) {
                try {
                    Intent i2 = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                    i2.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    ctx.startActivity(i2);
                    opened = true;
                } catch (Throwable ignore) { }
            }
            r.put("ignoring", false);
            r.put("opened", opened);
            call.resolve(r);
        } catch (Throwable t) {
            call.reject("battery: " + t);
        }
    }

    /** Opens the phone's "Install unknown apps" page for this app (so the user can allow silent auto-update). Needs no downloaded APK. */
    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        try {
            Context ctx = getContext();
            JSObject r = new JSObject();
            boolean can = true;
            if (Build.VERSION.SDK_INT >= 26) can = ctx.getPackageManager().canRequestPackageInstalls();
            r.put("canInstall", can);
            if (can) {
                r.put("opened", false);
                call.resolve(r);
                return;
            }
            boolean opened = false;
            try {
                Intent s = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + ctx.getPackageName()));
                s.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(s);
                opened = true;
            } catch (Throwable t) {
                try {
                    Intent s2 = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                            Uri.parse("package:" + ctx.getPackageName()));
                    s2.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    ctx.startActivity(s2);
                    opened = true;
                } catch (Throwable ignore) { }
            }
            r.put("opened", opened);
            call.resolve(r);
        } catch (Throwable t) {
            call.reject("installSettings: " + t);
        }
    }

    /* ====== Native azan (works offline / locked phone / app closed): see AzanReceiver + AzanService ====== */
    @PluginMethod
    public void scheduleAzan(PluginCall call) {
        try {
            Context ctx = getContext().getApplicationContext();
            JSArray items = call.getArray("items");
            Boolean en = call.getBoolean("enabled", true);
            boolean enabled = en == null ? true : en.booleanValue();
            String url = call.getString("url", "");
            String voice = call.getString("voice", "");
            String brand = call.getString("brand", "");
            AzanReceiver.save(ctx, items == null ? "[]" : items.toString(), enabled, url, voice, brand);
            AzanReceiver.arm(ctx);
            if (enabled && url != null && url.length() > 0) AzanReceiver.downloadAsync(ctx, url);
            JSObject r = new JSObject();
            r.put("ok", true);
            call.resolve(r);
        } catch (Throwable t) {
            call.reject("azan: " + t);
        }
    }

    @PluginMethod
    public void azanStatus(PluginCall call) {
        try {
            Context ctx = getContext().getApplicationContext();
            java.io.File f = AzanReceiver.bestAudioFile(ctx);
            JSObject r = new JSObject();
            r.put("hasFile", f != null);
            r.put("native", true);
            call.resolve(r);
        } catch (Throwable t) {
            call.reject("azan: " + t);
        }
    }

    /** Test: arms a one-off azan after N seconds (10..900) through the same native path as a real azan. */
    @PluginMethod
    public void testAzan(PluginCall call) {
        try {
            Context ctx = getContext().getApplicationContext();
            Integer sec = call.getInt("seconds", 60);
            int n = sec == null ? 60 : sec.intValue();
            if (n < 10) n = 10;
            if (n > 900) n = 900;
            long t = AzanReceiver.scheduleTest(ctx, n);
            JSObject r = new JSObject();
            r.put("ok", true);
            r.put("t", t);
            call.resolve(r);
        } catch (Throwable t) {
            call.reject("azan: " + t);
        }
    }

    @PluginMethod
    public void azanDiag(PluginCall call) {
        try {
            Context ctx = getContext().getApplicationContext();
            call.resolve(new JSObject(AzanReceiver.diag(ctx).toString()));
        } catch (Throwable t) {
            call.reject("azan: " + t);
        }
    }

    @PluginMethod
    public void stopAzan(PluginCall call) {
        try {
            Context ctx = getContext().getApplicationContext();
            ctx.stopService(new Intent(ctx, AzanService.class));
            call.resolve();
        } catch (Throwable t) {
            call.reject("azan: " + t);
        }
    }

    @PluginMethod
    public void cleanup(PluginCall call) {
        try {
            File[] files = updateDir().listFiles();
            if (files != null) for (File x : files) x.delete();
        } catch (Exception ignore) { }
        state = "idle";
        call.resolve();
    }
}
