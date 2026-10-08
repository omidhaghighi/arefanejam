package com.arefanejam.quran;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInstaller;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkInfo;
import android.net.NetworkRequest;
import android.os.Build;

import org.json.JSONArray;
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
 * - After the download it tries to INSTALL it silently (Android 12+ only, when the app is the registered installer,
 *   the app is not on screen and no azan is near). If Android wants a confirmation it does NOT show any window:
 *   the file just waits and the in-app updater installs it the next time the app is opened / left.
 * - It runs only if the website has "automatic update" turned on (field "auto" of /app-update).
 * - A half-finished download is kept and continued next time (HTTP Range).
 * - The finished file is checked (package name + newer version) before it is marked as ready.
 */
public class UpdateJobService extends JobService {

    static final int JOB_PERIODIC = 4801;
    static final int JOB_KICK = 4802;
    static final int JOB_NEWS = 4803;   // خبرهای امروز: هر بار که اینترنت وصل شود (حداکثر هر ۱۵ دقیقه یک بار)
    static final long NEWS_PERIOD_MS = 15L * 60L * 1000L;
    static final int JOB_INBOX = 4804;  // «اینترنت وصل شد»: بلافاصله اعلان‌ها/اخبار/مناسبت‌ها را از سایت بگیر
    static final long INBOX_MIN_GAP_MS = 45L * 1000L;   // وصل و قطع‌های پشت‌سرهم، سایت را زیر فشار نگذارند
    static final int INBOX_MAX_SEEN = 300;
    // «پرسش دوره‌ای با آلارم»: حتی با گوشی قفل/اپ بسته/اینترنت از قبل وصل، هر چند دقیقه صندوق را نگاه می‌کند
    static final int POLL_REQ = 4805;
    static final long POLL_MS = 5L * 60L * 1000L;
    static final String INBOX_CH = "arefanejam_inbox";
    static final String INBOX_GROUP = "arefanejam_inbox_group";
    static final String PREFS = "arefanejam_bg_update";
    static final String DEFAULT_API = "https://arefanejam.com/wp-json/arefanejam/v1";
    static final long PERIOD_MS = 1L * 3600L * 1000L;   // قبلاً ۶ ساعت؛ برای رسیدن سریع‌تر بروزرسانی ۱ ساعت
    static final long KICK_EVERY_MS = 1L * 3600L * 1000L;

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
            // کار دوره‌ای قدیمی (۶ ساعته) بعد از بروزرسانی اپ با دورهٔ جدید (۱ ساعت) جایگزین شود
            try {
                List<JobInfo> pend = js.getAllPendingJobs();
                if (pend != null) for (int i = 0; i < pend.size(); i++) {
                    JobInfo pj = pend.get(i);
                    if (pj.getId() == JOB_PERIODIC && pj.isPeriodic() && pj.getIntervalMillis() != PERIOD_MS) js.cancel(JOB_PERIODIC);
                }
            } catch (Throwable ignore) { }
            if (!isPending(js, JOB_PERIODIC)) {
                js.schedule(builder(JOB_PERIODIC, cn).setPeriodic(PERIOD_MS).setPersisted(true).build());
            }
            if (!isPending(js, JOB_NEWS)) {
                js.schedule(builder(JOB_NEWS, cn).setPeriodic(NEWS_PERIOD_MS).setPersisted(true).build());
            }
            long last = prefs(app).getLong("last_run", 0);
            if (System.currentTimeMillis() - last > KICK_EVERY_MS && !isPending(js, JOB_KICK)) {
                js.schedule(builder(JOB_KICK, cn).setPersisted(true).build());
            }
        } catch (Throwable ignore) { }
        // «به‌محض وصل شدن اینترنت» بیدار شو (حتی اگر اپ بسته باشد)
        try { registerNetWake(ctx); } catch (Throwable ignore) { }
        // آلارم تکرارشوندهٔ ۵ دقیقه‌ای برای دریافت اعلان/خبر وقتی گوشی قفل است (JobScheduler در حالت Doze ساعت‌ها دیر اجرا می‌شود)
        try { armPoll(ctx, false); } catch (Throwable ignore) { }
    }

    /**
     * One alarm (AlarmManager.setExactAndAllowWhileIdle) that wakes AzanReceiver every ~5 minutes, even in Doze and with the
     * app closed. Each time it fires it re-arms itself first and then reads the inbox (see AzanReceiver ACTION_POLL).
     * Called from schedule() (app start, boot, app update, after every azan); without force it does nothing while a
     * healthy alarm is already waiting.
     */
    static void armPoll(Context ctx, boolean force) {
        try {
            Context app = ctx.getApplicationContext();
            SharedPreferences sp = prefs(app);
            long now = System.currentTimeMillis();
            long next = sp.getLong("poll_next", 0);
            Intent i = new Intent(app, AzanReceiver.class);
            i.setAction(AzanReceiver.ACTION_POLL);
            int base = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
            if (!force && next > now && next - now <= POLL_MS + 30000L
                    && PendingIntent.getBroadcast(app, POLL_REQ, i, PendingIntent.FLAG_NO_CREATE | base) != null) return;   // already waiting
            PendingIntent pi = PendingIntent.getBroadcast(app, POLL_REQ, i, PendingIntent.FLAG_UPDATE_CURRENT | base);
            AlarmManager am = (AlarmManager) app.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;
            long t = now + POLL_MS;
            try {
                if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, t, pi);
                else if (Build.VERSION.SDK_INT >= 23) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, t, pi);
                else am.set(AlarmManager.RTC_WAKEUP, t, pi);
            } catch (SecurityException se) {
                if (Build.VERSION.SDK_INT >= 23) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, t, pi);
                else am.set(AlarmManager.RTC_WAKEUP, t, pi);
            }
            sp.edit().putLong("poll_next", t).apply();
        } catch (Throwable t) {
            log(ctx, "poll arm error: " + t);
        }
    }

    /**
     * Runs inside AzanReceiver (with goAsync) when the poll alarm fired or internet became available:
     * reads the inbox right now on a worker thread, short timeouts so the broadcast never hangs.
     */
    static void runInboxNow(final Context ctx, final BroadcastReceiver.PendingResult pr, final boolean poll) {
        final Context app = ctx.getApplicationContext();
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    if (poll) armPoll(app, true);   // re-arm FIRST, so a failed check never stops the chain
                    try {
                        checkInbox(app, 8000, 10000);
                        SharedPreferences.Editor e = prefs(app).edit();
                        e.putLong("poll_last", System.currentTimeMillis()).putInt("inbox_fail", 0).apply();
                    } catch (IOException net) {
                        // no internet right now / site not reachable: the next poll tries again; the "internet is back" path also falls back to the job
                        if (!poll) kickInbox(app);
                    } catch (Throwable t) {
                        log(app, "inbox error: " + t);
                    }
                } finally {
                    try { if (pr != null) pr.finish(); } catch (Throwable ignore) { }
                }
            }
        }).start();
    }

    /**
     * Android 8+: the system itself wakes our receiver every time a network with internet becomes available,
     * even when the app process is not running (PendingIntent network callback, needs no extra permission
     * besides ACCESS_NETWORK_STATE). Registering the same PendingIntent again only replaces the old one.
     * It does not survive a reboot / force-stop, so schedule() (called at app start, boot, app update and
     * after every azan) puts it back.
     */
    static void registerNetWake(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return;
        try {
            Context app = ctx.getApplicationContext();
            ConnectivityManager cm = (ConnectivityManager) app.getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return;
            Intent i = new Intent(app, AzanReceiver.class);
            i.setAction(AzanReceiver.ACTION_NET);
            int fl = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= 31) fl |= PendingIntent.FLAG_MUTABLE;   // the system adds the network as an extra
            PendingIntent pi = PendingIntent.getBroadcast(app, JOB_INBOX, i, fl);
            NetworkRequest rq = new NetworkRequest.Builder()
                    .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET).build();
            cm.registerNetworkCallback(rq, pi);
        } catch (Throwable t) {
            log(ctx, "net wake register error: " + t);
        }
    }

    /**
     * Called by AzanReceiver when internet became available: starts a one-shot job that reads the inbox now.
     * The job has NO network constraint on purpose (the network is already up; some networks never pass
     * Android's "validated" test) - checkInbox() tests the connection itself.
     */
    static void kickInbox(Context ctx) {
        try {
            Context app = ctx.getApplicationContext();
            if (System.currentTimeMillis() - prefs(app).getLong("inbox_last", 0) < INBOX_MIN_GAP_MS) return;
            JobScheduler js = (JobScheduler) app.getSystemService(Context.JOB_SCHEDULER_SERVICE);
            if (js == null || isPending(js, JOB_INBOX)) return;
            js.schedule(new JobInfo.Builder(JOB_INBOX, new ComponentName(app, UpdateJobService.class))
                    .setBackoffCriteria(20000L, JobInfo.BACKOFF_POLICY_LINEAR)
                    .setOverrideDeadline(0L)   // run now (also makes the job valid on every Android version)
                    .build());
        } catch (Throwable t) {
            log(ctx, "inbox kick error: " + t);
        }
    }

    /* ------------------------------ the job ------------------------------ */

    @Override
    public boolean onStartJob(final JobParameters params) {
        final int jid = params.getJobId();
        if (jid == JOB_NEWS || jid == JOB_INBOX) {
            // کار «اعلان‌ها و اخبار»: سبک است و منتظر تمام شدن دانلود بروزرسانی نمی‌ماند
            new Thread(new Runnable() {
                @Override
                public void run() {
                    Context ctx = getApplicationContext();
                    boolean retry = false;
                    try {
                        checkInbox(ctx);
                        prefs(ctx).edit().putInt("inbox_fail", 0).apply();
                    } catch (IOException net) {
                        // اتصال تازه وصل شده و هنوز آماده نیست / سایت در دسترس نیست: برای کار «اینترنت وصل شد» چند بار با فاصله دوباره امتحان کن
                        SharedPreferences sp = prefs(ctx);
                        int fails = sp.getInt("inbox_fail", 0) + 1;
                        sp.edit().putInt("inbox_fail", fails).apply();
                        retry = jid == JOB_INBOX && fails < 4;
                    } catch (Throwable t) {
                        log(ctx, "inbox error: " + t);
                    }
                    try { jobFinished(params, retry); } catch (Throwable ignore) { }
                }
            }).start();
            return true;
        }
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
                    // هر بار که کار بروزرسانی هم اجرا می‌شود، اعلان‌ها هم یک‌بار نگاه می‌شود (بی‌ضرر؛ تکراری اعلان نمی‌دهد)
                    try { checkInbox(ctx); } catch (IOException ignoreNet) { /* بدون اینترنت/سایت در دسترس نیست: بی‌صدا رد می‌شود */ } catch (Throwable t) { log(ctx, "inbox error: " + t); }
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
        if (!isNewer(version, cur)) {
            log(ctx, "up to date (" + cur + ")");
            try { File old = apkFile(ctx); if (old.exists()) old.delete(); } catch (Throwable ignore) { }
            return false;
        }
        if (version.equals(readyVersion(ctx))) {
            log(ctx, version + " is already downloaded");
            maybeInstall(ctx, sp, version);
            return false;
        }
        boolean again = download(ctx, sp, apkUrl, version);
        if (!again && version.equals(readyVersion(ctx))) maybeInstall(ctx, sp, version);
        return again;
    }

    /* ------------------------------ اعلان‌ها، اخبار و مناسبت‌ها (صندوق ارسال بومی) ------------------------------ */

    /**
     * Reads GET /inbox from the website (announcements from the dashboard, new news, calendar events, test message).
     * Every item has a unique id (uid). The ids already shown are remembered in SharedPreferences, so
     *  - an item is shown exactly once on this phone,
     *  - an item published while the phone was offline is shown as soon as the phone is online again
     *    (the website only lists items younger than its "max age", default 72 h),
     *  - if the app is on screen the app itself shows the item (in-app popup), so no system notification is made.
     * The very first run only REMEMBERS old items (older than 2 h) so a fresh install / update does not
     * flood the phone. If notifications are not allowed nothing is remembered, so everything arrives
     * after the user allows notifications.
     * Throws IOException when the website cannot be reached (caller may retry).
     */
    private static final Object NEWS_LOCK = new Object();

    static void checkInbox(Context ctx) throws Exception { checkInbox(ctx, 20000, 30000); }

    static void checkInbox(Context ctx, int connectMs, int readMs) throws Exception {
        synchronized (NEWS_LOCK) {
            if (!online(ctx)) return;
            SharedPreferences sp = prefs(ctx);

            String api = sp.getString("api", DEFAULT_API);
            if (api == null || !api.startsWith("http")) api = DEFAULT_API;
            while (api.endsWith("/")) api = api.substring(0, api.length() - 1);

            JSONObject info = new JSONObject(httpText(api + "/inbox?t=" + System.currentTimeMillis(), connectMs, readMs));
            sp.edit().putLong("inbox_last", System.currentTimeMillis()).apply();
            if (!info.optBoolean("enabled", false)) return;
            JSONArray items = info.optJSONArray("items");

            boolean init = sp.getBoolean("inbox_init", false);
            java.util.LinkedHashSet<String> seen = loadSeen(sp);
            if (!init) {
                // خبرهایی که نسخهٔ قبلیِ «خبرهای امروز» همین امروز اعلام کرده بود دوباره اعلام نشوند
                String legacy = sp.getString("news_sent", "");
                if (legacy.length() > 0) for (String x : legacy.split(",")) if (x.length() > 0) seen.add("news:" + x);
            }

            java.util.ArrayList<JSONObject> fresh = new java.util.ArrayList<JSONObject>();
            if (items != null) {
                for (int i = 0; i < items.length(); i++) {
                    JSONObject it = items.optJSONObject(i);
                    if (it == null) continue;
                    String uid = it.optString("uid", "");
                    if (uid.length() == 0 || seen.contains(uid)) continue;
                    if (it.optString("title", "").trim().length() == 0) continue;
                    if (!init && it.optLong("age", 0) >= 2L * 3600L) { seen.add(uid); continue; }   // first run: only remember
                    fresh.add(it);
                }
            }
            if (!init) sp.edit().putBoolean("inbox_init", true).apply();
            if (fresh.isEmpty()) { saveSeen(sp, seen); return; }

            // oldest first, so the newest ends up on top of the notification shade
            java.util.Collections.sort(fresh, new java.util.Comparator<JSONObject>() {
                @Override public int compare(JSONObject a, JSONObject b) { return Long.compare(b.optLong("age", 0), a.optLong("age", 0)); }
            });

            if (MainActivity.inForeground) {
                // the app is open: its own 20-second check shows the popup, a system notification would be a duplicate
                for (JSONObject it : fresh) seen.add(it.optString("uid"));
                saveSeen(sp, seen);
                log(ctx, "inbox: " + fresh.size() + " item(s) - app is on screen, shown inside the app");
                return;
            }

            if (!showInboxNotifications(ctx, fresh)) { saveSeen(sp, seen); return; }   // not allowed now: try again next time
            for (JSONObject it : fresh) seen.add(it.optString("uid"));
            saveSeen(sp, seen);
            log(ctx, "inbox: shown " + fresh.size() + " item(s)");
        }
    }

    private static java.util.LinkedHashSet<String> loadSeen(SharedPreferences sp) {
        java.util.LinkedHashSet<String> set = new java.util.LinkedHashSet<String>();
        String raw = sp.getString("inbox_seen", "");
        if (raw.length() > 0) for (String x : raw.split("\n")) if (x.length() > 0) set.add(x);
        return set;
    }

    private static void saveSeen(SharedPreferences sp, java.util.LinkedHashSet<String> seen) {
        java.util.ArrayList<String> all = new java.util.ArrayList<String>(seen);
        int from = Math.max(0, all.size() - INBOX_MAX_SEEN);
        StringBuilder sb = new StringBuilder();
        for (int i = from; i < all.size(); i++) { if (sb.length() > 0) sb.append('\n'); sb.append(all.get(i)); }
        sp.edit().putString("inbox_seen", sb.toString()).apply();
    }

    /** returns false if nothing could be shown (e.g. notifications are not allowed) */
    private static boolean showInboxNotifications(Context ctx, java.util.List<JSONObject> list) {
        try {
            if (!androidx.core.app.NotificationManagerCompat.from(ctx).areNotificationsEnabled()) {
                log(ctx, "inbox: notifications are not allowed - waits");
                return false;
            }
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return false;
            if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(INBOX_CH) == null) {
                NotificationChannel ch = new NotificationChannel(INBOX_CH, "اعلان‌ها و اخبار", NotificationManager.IMPORTANCE_HIGH);
                ch.setDescription("اعلان‌ها، خبرها و مناسبت‌های عارفان جام");
                nm.createNotificationChannel(ch);
            }
            Intent open = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
            PendingIntent pi = null;
            if (open != null) {
                open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                int fl = PendingIntent.FLAG_UPDATE_CURRENT;
                if (Build.VERSION.SDK_INT >= 23) fl |= PendingIntent.FLAG_IMMUTABLE;
                pi = PendingIntent.getActivity(ctx, 4803, open, fl);
            }
            int icon = ctx.getResources().getIdentifier("ic_stat_azan", "drawable", ctx.getPackageName());
            if (icon == 0) icon = android.R.drawable.ic_dialog_info;

            int n = list.size();
            if (n <= 3) {
                // few items: one notification each, with its own title and text
                for (JSONObject it : list) {
                    String title = it.optString("title", "").trim();
                    String body = it.optString("body", "").trim();
                    long ageMs = Math.max(0L, it.optLong("age", 0)) * 1000L;
                    androidx.core.app.NotificationCompat.Builder b = new androidx.core.app.NotificationCompat.Builder(ctx, INBOX_CH)
                            .setSmallIcon(icon)
                            .setContentTitle(title)
                            .setContentText(body.length() > 0 ? body : title)
                            .setStyle(new androidx.core.app.NotificationCompat.BigTextStyle().bigText(body.length() > 0 ? body : title))
                            .setPriority(androidx.core.app.NotificationCompat.PRIORITY_HIGH)
                            .setCategory(androidx.core.app.NotificationCompat.CATEGORY_MESSAGE)
                            .setDefaults(Notification.DEFAULT_SOUND | Notification.DEFAULT_VIBRATE)
                            .setColor(0xFF143C36)
                            .setGroup(INBOX_GROUP)
                            .setWhen(System.currentTimeMillis() - ageMs)
                            .setShowWhen(true)
                            .setAutoCancel(true);
                    if (pi != null) b.setContentIntent(pi);
                    int id = 20000 + (it.optString("uid", "").hashCode() & 0xFFFFF) % 70000;
                    nm.notify(id, b.build());
                }
            } else {
                // many items (phone was offline for a while): ONE summary notification listing them
                androidx.core.app.NotificationCompat.InboxStyle st = new androidx.core.app.NotificationCompat.InboxStyle();
                int shown = Math.min(n, 6);
                for (int i = n - 1; i >= n - shown; i--) st.addLine(list.get(i).optString("title", "").trim());   // newest first
                if (n > shown) st.setSummaryText("و " + (n - shown) + " مورد دیگر");
                String title = n + " پیام تازه از عارفان جام";
                androidx.core.app.NotificationCompat.Builder b = new androidx.core.app.NotificationCompat.Builder(ctx, INBOX_CH)
                        .setSmallIcon(icon)
                        .setContentTitle(title)
                        .setContentText(list.get(n - 1).optString("title", "").trim())
                        .setStyle(st)
                        .setPriority(androidx.core.app.NotificationCompat.PRIORITY_HIGH)
                        .setCategory(androidx.core.app.NotificationCompat.CATEGORY_MESSAGE)
                        .setDefaults(Notification.DEFAULT_SOUND | Notification.DEFAULT_VIBRATE)
                        .setColor(0xFF143C36)
                        .setAutoCancel(true);
                if (pi != null) b.setContentIntent(pi);
                nm.notify(4803, b.build());
            }
            return true;
        } catch (Throwable t) {
            log(ctx, "inbox notification error: " + t);
            return false;
        }
    }

    /* ------------------------------ silent install ------------------------------ */

    private static boolean selfInstaller(Context ctx) {
        try {
            String inst = "";
            if (Build.VERSION.SDK_INT >= 30) {
                android.content.pm.InstallSourceInfo si = ctx.getPackageManager().getInstallSourceInfo(ctx.getPackageName());
                String p = si.getInstallingPackageName();
                if (p != null) inst = p;
            } else {
                @SuppressWarnings("deprecation")
                String p = ctx.getPackageManager().getInstallerPackageName(ctx.getPackageName());
                if (p != null) inst = p;
            }
            return ctx.getPackageName().equals(inst);
        } catch (Throwable t) {
            return false;
        }
    }

    /** Installs the downloaded APK without any window - only when Android allows it and it is a good moment. */
    private void maybeInstall(Context ctx, SharedPreferences sp, String version) {
        try {
            if (Build.VERSION.SDK_INT < 31) { log(ctx, "silent install needs Android 12+ - waits for the app"); return; }
            if (MainActivity.inForeground) { log(ctx, "app is on screen - not installing now"); return; }
            if (!ctx.getPackageManager().canRequestPackageInstalls()) { log(ctx, "install permission not given - waits for the app"); return; }
            if (!selfInstaller(ctx)) { log(ctx, "app is not its own installer yet - the first update needs one confirmation"); return; }
            if (AzanReceiver.azanNear(ctx, 10L * 60L * 1000L)) { log(ctx, "azan time is near - install later"); return; }
            String key = "inst_" + version;
            int tries = sp.getInt(key + "_n", 0);
            long lastTry = sp.getLong(key + "_t", 0);
            long now = System.currentTimeMillis();
            if (tries >= 4) { log(ctx, "silent install gave up after 4 tries - the app will ask the user"); return; }
            if (now - lastTry < 3L * 3600L * 1000L) { log(ctx, "silent install was tried a short time ago - later"); return; }
            sp.edit().putInt(key + "_n", tries + 1).putLong(key + "_t", now).apply();
            installSilently(ctx, apkFile(ctx), version);
        } catch (Throwable t) {
            log(ctx, "silent install error: " + t);
        }
    }

    private void installSilently(final Context ctx, File apk, String version) throws Exception {
        if (!validApk(ctx, apk)) { log(ctx, "file is not a valid newer APK - not installing"); return; }
        PackageInstaller pi = ctx.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(ctx.getPackageName());
        if (Build.VERSION.SDK_INT >= 31) params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
        final int id = pi.createSession(params);
        PackageInstaller.Session session = pi.openSession(id);
        final java.util.concurrent.CountDownLatch latch = new java.util.concurrent.CountDownLatch(1);
        final String action = "com.arefanejam.quran.BG_INSTALL_RESULT";
        final BroadcastReceiver rcv = new BroadcastReceiver() {
            @Override
            public void onReceive(Context c, Intent intent) {
                try {
                    int st = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, -1);
                    if (st == PackageInstaller.STATUS_PENDING_USER_ACTION) {
                        // Android wants a confirmation: show NOTHING, cancel; the in-app updater will ask when the app is opened
                        try { ctx.getPackageManager().getPackageInstaller().abandonSession(id); } catch (Throwable ignore) { }
                        log(ctx, "Android asked for a confirmation - cancelled, waits for the app");
                    } else if (st == PackageInstaller.STATUS_SUCCESS) {
                        log(ctx, "installed silently");
                    } else {
                        log(ctx, "install failed: status " + st + " " + intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE));
                    }
                } finally {
                    latch.countDown();
                }
            }
        };
        androidx.core.content.ContextCompat.registerReceiver(ctx, rcv, new IntentFilter(action),
                androidx.core.content.ContextCompat.RECEIVER_NOT_EXPORTED);
        try {
            InputStream in = new java.io.FileInputStream(apk);
            OutputStream out = session.openWrite("arefanejam.apk", 0, apk.length());
            try {
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
                session.fsync(out);
            } finally {
                try { in.close(); } catch (Throwable ignore) { }
                try { out.close(); } catch (Throwable ignore) { }
            }
            Intent cb = new Intent(action).setPackage(ctx.getPackageName());
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= 31) flags |= PendingIntent.FLAG_MUTABLE;
            PendingIntent pending = PendingIntent.getBroadcast(ctx, id, cb, flags);
            log(ctx, "installing " + version + " silently...");
            session.commit(pending.getIntentSender());
            latch.await(90, java.util.concurrent.TimeUnit.SECONDS); // on success Android restarts the app process by itself
        } catch (Throwable e) {
            try { session.abandon(); } catch (Throwable ignore) { }
            log(ctx, "install error: " + e);
        } finally {
            try { session.close(); } catch (Throwable ignore) { }
            try { ctx.unregisterReceiver(rcv); } catch (Throwable ignore) { }
        }
    }

    private static String httpText(String url) throws IOException { return httpText(url, 20000, 30000); }

    private static String httpText(String url, int connectMs, int readMs) throws IOException {
        HttpURLConnection c = null;
        InputStream in = null;
        try {
            c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(connectMs);
            c.setReadTimeout(readMs);
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
