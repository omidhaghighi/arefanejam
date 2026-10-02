package com.arefanejam.quran;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkInfo;
import android.net.NetworkRequest;
import android.os.Build;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.List;

/**
 * Background download of the new APK: only when the phone is online, even if the app is closed
 * (the Android system wakes this service by itself when internet is available).
 *
 * - It only DOWNLOADS the file into cache/updates/arefanejam.apk (the same file the in-app updater uses).
 * - Installing stays as before: the in-app updater installs it the next time the app is opened / left.
 * - It runs only if the website has "automatic update" turned on (field "auto" of /app-update).
 * - A half-finished download is kept and continued next time (HTTP Range).
 * - The finished file is checked (package name + newer version) before it is marked as ready.
 */
public class UpdateJobService extends JobService {

    static final int JOB_PERIODIC = 4801;
    static final int JOB_KICK = 4802;
    static final String PREFS = "arefanejam_bg_update";
    static final String DEFAULT_API = "https://arefanejam.com/wp-json/arefanejam/v1";
    static final long PERIOD_MS = 6L * 3600L * 1000L;
    static final long KICK_EVERY_MS = 3L * 3600L * 1000L;

    private static final Object LOCK = new Object();
    private static boolean running = false;
    private volatile boolean stopped = false;

    /* ------------------------------ helpers ------------------------------ */

    static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** true if the phone has a network with internet (or if Android does not tell us). */
    static boolean online(Context ctx) {
        try {
            ConnectivityManager cm = (ConnectivityManager) ctx.getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return true;
            if (Build.VERSION.SDK_INT >= 23) {
                Network n = cm.getActiveNetwork();
                if (n == null) return false;
                NetworkCapabilities nc = cm.getNetworkCapabilities(n);
                // NOT checking "validated": in some countries the Google connectivity test fails although the site works
                return nc != null && nc.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
            }
            NetworkInfo ni = cm.getActiveNetworkInfo();
            return ni != null && ni.isConnected();
        } catch (Throwable t) {
            return true;
        }
    }

    static synchronized void log(Context ctx, String msg) {
        try {
            String ts = new java.text.SimpleDateFormat("MM-dd HH:mm:ss", java.util.Locale.US).format(new java.util.Date());
            SharedPreferences p = prefs(ctx);
            String old = p.getString("log", "");
            String[] lines = old.length() == 0 ? new String[0] : old.split("\n");
            StringBuilder sb = new StringBuilder();
            for (int i = Math.max(0, lines.length - 7); i < lines.length; i++) sb.append(lines[i]).append("\n");
            sb.append(ts).append("  ").append(msg);
            p.edit().putString("log", sb.toString()).apply();
        } catch (Throwable ignore) { }
    }

    static File apkFile(Context ctx) {
        File dir = new File(ctx.getCacheDir(), "updates");
        if (!dir.exists()) dir.mkdirs();
        return new File(dir, "arefanejam.apk");
    }

    static String currentVersion(Context ctx) {
        try {
            PackageInfo pi = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0);
            return pi.versionName == null ? "0" : pi.versionName;
        } catch (Throwable t) {
            return "0";
        }
    }

    /** numeric compare like 1.10.0 vs 1.9.3 (same rule as the web part) */
    static boolean isNewer(String remote, String local) {
        String[] a = String.valueOf(remote).split("\\.");
        String[] b = String.valueOf(local).split("\\.");
        for (int i = 0; i < Math.max(a.length, b.length); i++) {
            int x = i < a.length ? num(a[i]) : 0;
            int y = i < b.length ? num(b[i]) : 0;
            if (x > y) return true;
            if (x < y) return false;
        }
        return false;
    }

    private static int num(String s) {
        try {
            StringBuilder d = new StringBuilder();
            for (int i = 0; i < s.length(); i++) {
                char c = s.charAt(i);
                if (c >= '0' && c <= '9') d.append(c); else break;
            }
            return d.length() == 0 ? 0 : Integer.parseInt(d.toString());
        } catch (Throwable t) {
            return 0;
        }
    }

    /** version of a fully downloaded, still-newer APK that is waiting in the cache ("" if none) */
    static String readyVersion(Context ctx) {
        try {
            String v = prefs(ctx).getString("ready_version", "");
            if (v.length() == 0) return "";
            File f = apkFile(ctx);
            if (!f.isFile() || f.length() < 100 * 1024) return "";
            if (!isNewer(v, currentVersion(ctx))) return "";
            return v;
        } catch (Throwable t) {
            return "";
        }
    }

    private static boolean validApk(Context ctx, File f) {
        try {
            PackageInfo pi = ctx.getPackageManager().getPackageArchiveInfo(f.getAbsolutePath(), 0);
            if (pi == null) return false;
            if (!ctx.getPackageName().equals(pi.packageName)) return false;
            return pi.versionName != null && isNewer(pi.versionName, currentVersion(ctx));
        } catch (Throwable t) {
            return false;
        }
    }

    /* ------------------------------ scheduling ------------------------------ */

    private static JobInfo.Builder builder(int id, ComponentName cn) {
        JobInfo.Builder b = new JobInfo.Builder(id, cn);
        if (Build.VERSION.SDK_INT >= 28) {
            b.setRequiredNetwork(new NetworkRequest.Builder()
                    .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET).build());
        } else {
            b.setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY);
        }
        return b;
    }

    private static boolean isPending(JobScheduler js, int id) {
        try {
            List<JobInfo> all = js.getAllPendingJobs();
            if (all != null) for (int i = 0; i < all.size(); i++) if (all.get(i).getId() == id) return true;
        } catch (Throwable ignore) { }
        return false;
    }

    static boolean hasJob(Context ctx) {
        try {
            JobScheduler js = (JobScheduler) ctx.getSystemService(Context.JOB_SCHEDULER_SERVICE);
            return js != null && isPending(js, JOB_PERIODIC);
        } catch (Throwable t) {
            return false;
        }
    }

    /**
     * Makes sure the system has our jobs: a periodic one (every ~6h, only when online, survives reboot)
     * and a one-shot "check soon" one if the last check is old. Cheap: safe to call often.
     */
    static void schedule(Context ctx) {
        try {
            Context app = ctx.getApplicationContext();
            JobScheduler js = (JobScheduler) app.getSystemService(Context.JOB_SCHEDULER_SERVICE);
            if (js == null) return;
            ComponentName cn = new ComponentName(app, UpdateJobService.class);
            if (!isPending(js, JOB_PERIODIC)) {
                js.schedule(builder(JOB_PERIODIC, cn).setPeriodic(PERIOD_MS).setPersisted(true).build());
            }
            long last = prefs(app).getLong("last_run", 0);
            if (System.currentTimeMillis() - last > KICK_EVERY_MS && !isPending(js, JOB_KICK)) {
                js.schedule(builder(JOB_KICK, cn).setPersisted(true).build());
            }
        } catch (Throwable ignore) { }
    }

    /* ------------------------------ the job ------------------------------ */

    @Override
    public boolean onStartJob(final JobParameters params) {
        synchronized (LOCK) {
            if (running) return false;
            running = true;
        }
        stopped = false;
        new Thread(new Runnable() {
            @Override
            public void run() {
                boolean retry = false;
                Context ctx = getApplicationContext();
                try {
                    retry = doUpdate(ctx);
                } catch (Throwable t) {
                    log(ctx, "error: " + t);
                    retry = true;
                } finally {
                    synchronized (LOCK) { running = false; }
                }
                if (!stopped) {
                    try { jobFinished(params, retry); } catch (Throwable ignore) { }
                }
            }
        }).start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        stopped = true;   // Android wants the job to stop (no internet any more / low battery): the part file is kept
        return true;      // run it again later
    }

    /** returns true if it should be retried soon (network problem / unfinished download) */
    private boolean doUpdate(Context ctx) throws Exception {
        SharedPreferences sp = prefs(ctx);
        sp.edit().putLong("last_run", System.currentTimeMillis()).apply();
        if (!online(ctx)) { log(ctx, "no internet - skipped"); return false; }

        String api = sp.getString("api", DEFAULT_API);
        if (api == null || !api.startsWith("http")) api = DEFAULT_API;
        while (api.endsWith("/")) api = api.substring(0, api.length() - 1);

        JSONObject info = new JSONObject(httpText(api + "/app-update?t=" + System.currentTimeMillis()));
        boolean enabled = info.optBoolean("enabled", false);
        boolean auto = info.optBoolean("auto", false);
        String version = info.optString("version", "");
        String apkUrl = info.optString("apk_url", "");
        if (!enabled || !auto || version.length() == 0 || !apkUrl.startsWith("http")) {
            log(ctx, "site: automatic update is off - nothing to do");
            return false;
        }
        String cur = currentVersion(ctx);
        if (!isNewer(version, cur)) { log(ctx, "up to date (" + cur + ")"); return false; }
        if (version.equals(readyVersion(ctx))) { log(ctx, version + " is already downloaded"); return false; }
        return download(ctx, sp, apkUrl, version);
    }

    private static String httpText(String url) throws IOException {
        HttpURLConnection c = null;
        InputStream in = null;
        try {
            c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(20000);
            c.setReadTimeout(30000);
            c.setRequestProperty("User-Agent", "ArefanejamApp");
            c.setRequestProperty("Cache-Control", "no-cache");
            if (c.getResponseCode() != 200) throw new IOException("HTTP " + c.getResponseCode());
            in = c.getInputStream();
            java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = in.read(buf)) != -1) {
                bo.write(buf, 0, n);
                if (bo.size() > 256 * 1024) throw new IOException("answer too large");
            }
            return bo.toString("UTF-8");
        } finally {
            try { if (in != null) in.close(); } catch (Throwable ignore) { }
            try { if (c != null) c.disconnect(); } catch (Throwable ignore) { }
        }
    }

    private boolean download(Context ctx, SharedPreferences sp, String apkUrl, String version) throws Exception {
        File dest = apkFile(ctx);
        File dir = dest.getParentFile();
        File part = new File(dir, "bg.part");
        File check = new File(dir, "bg_check.apk");

        // a half file belongs to one exact version/url; anything else starts from zero
        String tag = version + "|" + apkUrl;
        if (!tag.equals(sp.getString("part_tag", ""))) {
            part.delete();
            sp.edit().putString("part_tag", tag).apply();
        }
        long have = part.exists() ? part.length() : 0;

        HttpURLConnection c = null;
        InputStream in = null;
        OutputStream out = null;
        long total = -1;
        try {
            URL u = new URL(apkUrl);
            int code = 0;
            for (int i = 0; i < 6; i++) {
                c = (HttpURLConnection) u.openConnection();
                c.setInstanceFollowRedirects(false);
                c.setConnectTimeout(20000);
                c.setReadTimeout(30000);
                c.setRequestProperty("User-Agent", "ArefanejamApp");
                if (have > 0) c.setRequestProperty("Range", "bytes=" + have + "-");
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
            if (code == 416) { // our half file does not fit the server file: start again next time
                part.delete();
                log(ctx, "half file rejected (416) - will restart");
                return true;
            }
            if (code != 200 && code != 206) throw new IOException("HTTP " + code);

            boolean append = (code == 206 && have > 0);
            if (!append) have = 0;
            if (code == 206) {
                String cr = c.getHeaderField("Content-Range"); // bytes a-b/total
                int s = cr == null ? -1 : cr.lastIndexOf('/');
                if (s > 0) { try { total = Long.parseLong(cr.substring(s + 1).trim()); } catch (Throwable ignore) { } }
            } else {
                int cl = c.getContentLength();
                if (cl > 0) total = cl;
            }
            if (total > 300L * 1024L * 1024L) throw new IOException("file too large");

            log(ctx, "downloading " + version + (append ? " (continuing from " + (have / 1024) + " KB)" : ""));
            in = c.getInputStream();
            out = new FileOutputStream(part, append);
            byte[] buf = new byte[32 * 1024];
            int n;
            while ((n = in.read(buf)) != -1) {
                if (stopped) {
                    out.flush();
                    log(ctx, "stopped by Android - will continue later");
                    return true;
                }
                out.write(buf, 0, n);
            }
            out.flush();
            out.close();
            out = null;
        } finally {
            try { if (in != null) in.close(); } catch (Throwable ignore) { }
            try { if (out != null) out.close(); } catch (Throwable ignore) { }
            try { if (c != null) c.disconnect(); } catch (Throwable ignore) { }
        }

        long size = part.length();
        if (total > 0 && size < total) { log(ctx, "incomplete (" + (size / 1024) + " of " + (total / 1024) + " KB) - will continue"); return true; }
        if (total > 0 && size > total) { part.delete(); throw new IOException("file bigger than expected"); }
        if (size < 100 * 1024) { part.delete(); throw new IOException("file too small"); }

        if (check.exists()) check.delete();
        if (!part.renameTo(check)) throw new IOException("rename failed");
        if (!validApk(ctx, check)) {
            check.delete();
            sp.edit().remove("part_tag").apply();
            log(ctx, "downloaded file is not a valid newer APK - deleted");
            return true;
        }
        if (dest.exists()) dest.delete();
        if (!check.renameTo(dest)) throw new IOException("rename failed");
        sp.edit().putString("ready_version", version).remove("part_tag").apply();
        log(ctx, "READY: " + version + " (" + (dest.length() / 1024) + " KB) - installs when the app is opened");
        return false;
    }
}
