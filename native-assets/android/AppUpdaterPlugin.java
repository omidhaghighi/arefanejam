package com.arefanejam.quran;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInstaller;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

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
            if (Build.VERSION.SDK_INT >= 31) {
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
                            && status != PackageInstaller.STATUS_FAILURE_ABORTED) {
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
        call.resolve(r);
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
