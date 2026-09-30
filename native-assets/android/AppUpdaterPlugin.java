package com.arefanejam.quran;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

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

/**
 * دانلود و نصب APK بروزرسانی از داخل خود اپ (بدون مرورگر).
 * متدها: download({url}) ، progress() ، cancel() ، install() ، cleanup()
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
            Uri uri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".updateprovider", f);
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(uri, "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(i);
            r.put("status", "started");
            call.resolve(r);
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
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
