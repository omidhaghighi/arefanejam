package com.arefanejam.quran;

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
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
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
    private static Bitmap stkTile(int s, String day, String month, String weekday) {
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
    private static void stkBackground(Canvas c, int w, int h, float radius, float patternStep) {
        RectF r = new RectF(0f, 0f, w, h);
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
                                  String greg, String next, String nextName, String nextTime, String dua) {
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        stkBackground(c, w, h, h * 0.10f, h * 0.2f);

        // هلال و ستارهٔ بالا-چپ
        float mr = h * 0.075f, mcx = h * 0.17f, mcy = h * 0.15f;
        stkCrescent(c, mcx, mcy, mr);
        stkStar5(c, mcx + mr * 0.62f, mcy - mr * 0.12f, mr * 0.28f);

        // خط آسمان مسجد پایین-چپ (کمرنگ)
        Path clip = new Path();
        clip.addRoundRect(new RectF(0f, 0f, w, h), h * 0.10f, h * 0.10f, Path.Direction.CW);
        c.save();
        c.clipPath(clip);
        stkSkyline(c, w * 0.05f, h * 0.93f, h * 0.05f, h, 0x2A000000);
        c.restore();

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
                                 String next, String nextName, String nextTime) {
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        stkBackground(c, w, h, h * 0.28f, h * 0.55f);

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

            Bitmap card = stkCard(1080, 540, stkTile(420, day, month, weekday), brand, jalali, hijri, greg, next, nextName, nextTime, custom);

            int layoutId = ctx.getResources().getIdentifier("sticky_card", "layout", pkg);
            int imgId = ctx.getResources().getIdentifier("sticky_img", "id", pkg);
            if (layoutId != 0 && imgId != 0) {
                // همه‌چیز فقط یک تصویر است: نه عنوان و نه متن جداگانه
                Bitmap bar = stkBar(1280, 240, stkTile(225, day, month, weekday), jalali, hijri, next, nextName, nextTime);
                RemoteViews rvSmall = new RemoteViews(pkg, layoutId);
                rvSmall.setImageViewBitmap(imgId, bar);
                RemoteViews rvBig = new RemoteViews(pkg, layoutId);
                rvBig.setImageViewBitmap(imgId, card);
                b.setStyle(new NotificationCompat.DecoratedCustomViewStyle())
                 .setCustomContentView(rvSmall)
                 .setCustomBigContentView(rvBig);
            } else {
                // اگر فایل طرح (sticky_card.xml) داخل APK نبود: همان نمایش تصویریِ قبلی
                b.setLargeIcon(stkTile(192, day, month, weekday))
                 .setStyle(new NotificationCompat.BigPictureStyle()
                    .bigPicture(card)
                    .bigLargeIcon((Bitmap) null)
                    .setSummaryText(line));
            }
            nm.notify(STK_ID, b.build());
            call.resolve();
        } catch (Throwable t) {
            call.reject("sticky: " + t);
        }
    }

    @PluginMethod
    public void hideSticky(PluginCall call) {
        try {
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
