package com.arefanejam.quran;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;

/**
 * Azan that does NOT depend on the WebView, on the internet or on the sound bundled at build time.
 *
 * How it works:
 *  1) The web app (native-bridge.js) hands over the list of prayer times for the next days
 *     (AppUpdater.scheduleAzan). They are saved in SharedPreferences, so they survive app close and reboot.
 *  2) ONE alarm (AlarmManager.setAlarmClock) is always armed for the next prayer time.
 *     When it fires, this receiver starts AzanService (a foreground service that plays the sound)
 *     and arms the alarm for the following prayer.
 *  3) The azan audio file is downloaded once while the phone is online and kept in the app private storage,
 *     so later it plays with NO internet and with the phone locked.
 *  4) After reboot / app update / time change the alarm is armed again from the saved list.
 */
public class AzanReceiver extends BroadcastReceiver {

    public static final String ACTION_FIRE = "com.arefanejam.quran.AZAN_FIRE";
    public static final String ACTION_TEST = "com.arefanejam.quran.AZAN_TEST";
    public static final String ACTION_STICKY = "com.arefanejam.quran.STICKY_REFRESH";
    // sent by the system itself every time a network with internet becomes available (see UpdateJobService.registerNetWake)
    public static final String ACTION_NET = "com.arefanejam.quran.NET_AVAILABLE";
    static final String PREFS = "arefanejam_native_azan";
    static final String FALLBACK_CH = "azan-native-fallback-v1";
    static final int FALLBACK_ID = 777000003;
    // an alarm that fires later than this after its time (phone was off) is skipped
    static final long MAX_LATE_MS = 3L * 60L * 1000L;

    @Override
    public void onReceive(Context ctx, Intent intent) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_NET.equals(action)) {
            // internet is back: read the announcements / news / events inbox right now (only this, nothing else)
            try { UpdateJobService.kickInbox(ctx); } catch (Throwable ignore) { }
            return;
        }
        // بعد از روشن‌شدن گوشی یا بروزرسانی اپ، اعلان‌ها پاک شده‌اند: کارت ثابت باید بدون باز شدن اپ دوباره ساخته شود
        final boolean restoreCard = "android.intent.action.BOOT_COMPLETED".equals(action)
                || "android.intent.action.MY_PACKAGE_REPLACED".equals(action)
                || "android.intent.action.QUICKBOOT_POWERON".equals(action)
                || "com.htc.intent.action.QUICKBOOT_POWERON".equals(action);
        try {
            if (ACTION_TEST.equals(action)) {
                logEvent(ctx, "TEST: alarm fired -> starting azan service");
                startAzan(ctx, "\u0622\u0632\u0645\u0627\u06cc\u0634\u06cc");
            } else if (ACTION_FIRE.equals(action)) {
                long t = intent.getLongExtra("t", 0);
                String label = intent.getStringExtra("label");
                if (label == null) label = "";
                SharedPreferences p = prefs(ctx);
                boolean enabled = p.getBoolean("enabled", true);
                long now = System.currentTimeMillis();
                long last = p.getLong("last_fired", 0);
                logEvent(ctx, "FIRE " + label + " enabled=" + enabled + " late=" + ((now - t) / 1000) + "s" + (t == last ? " (duplicate, skipped)" : ""));
                if (enabled && t > 0 && t != last && now - t <= MAX_LATE_MS) {
                    p.edit().putLong("last_fired", t).apply();
                    startAzan(ctx, label);
                }
            } else if (ACTION_STICKY.equals(action)) {
                // فقط تازه‌کردن کارت اذان بعدی (پایین انجام می‌شود)
            } else if (action != null) {
                logEvent(ctx, "re-armed after " + action);
            }
        } catch (Throwable ignore) { }
        // in every case (fire / boot / app update / time change) arm the next alarm
        try { arm(ctx); } catch (Throwable ignore) { }
        // «اذان بعدی» روی کارت نوتیفیکیشن ثابت را از فهرست داخل گوشی تازه کن (بدون اپ و بدون اینترنت)
        BroadcastReceiver.PendingResult pending = null;
        try { pending = goAsync(); } catch (Throwable ignore) { }
        refreshStickyAsync(ctx, pending, restoreCard);
        // jobs are wiped by an app update: put the background update download job back
        try { UpdateJobService.schedule(ctx); } catch (Throwable ignore) { }
    }

    /** Small on-phone diagnostic log (last 20 lines), shown in the hidden test panel. */
    static synchronized void logEvent(Context ctx, String msg) {
        try {
            String ts = new java.text.SimpleDateFormat("MM-dd HH:mm:ss", java.util.Locale.US).format(new java.util.Date());
            SharedPreferences p = prefs(ctx);
            String old = p.getString("dlog", "");
            String[] lines = old.length() == 0 ? new String[0] : old.split("\n");
            StringBuilder sb = new StringBuilder();
            for (int i = Math.max(0, lines.length - 19); i < lines.length; i++) sb.append(lines[i]).append("\n");
            sb.append(ts).append("  ").append(msg);
            p.edit().putString("dlog", sb.toString()).apply();
        } catch (Throwable ignore) { }
    }

    /** One-off test alarm (does NOT touch the real prayer alarm). Same mechanism: setAlarmClock -> receiver -> service. */
    static long scheduleTest(Context ctx, int seconds) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        long t = System.currentTimeMillis() + seconds * 1000L;
        Intent i = new Intent(ctx, AzanReceiver.class);
        i.setAction(ACTION_TEST);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent pi = PendingIntent.getBroadcast(ctx, 4731, i, flags);
        Intent launch = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        PendingIntent show = launch == null ? pi : PendingIntent.getActivity(ctx, 4732, launch, flags);
        am.setAlarmClock(new AlarmManager.AlarmClockInfo(t, show), pi);
        logEvent(ctx, "TEST scheduled in " + seconds + "s");
        return t;
    }

    /** Everything needed to understand why the azan did or did not play. */
    static JSONObject diag(Context ctx) {
        JSONObject o = new JSONObject();
        try {
            SharedPreferences p = prefs(ctx);
            o.put("sdk", Build.VERSION.SDK_INT);
            o.put("enabled", p.getBoolean("enabled", true));
            JSONArray arr = new JSONArray(p.getString("items", "[]"));
            o.put("items", arr.length());
            long now = System.currentTimeMillis();
            long last = p.getLong("last_fired", 0);
            long bestT = 0;
            String bestLabel = "";
            for (int i = 0; i < arr.length(); i++) {
                JSONObject it = arr.getJSONObject(i);
                long t = it.optLong("t", 0);
                if (t <= 0 || t == last || t < now - MAX_LATE_MS) continue;
                if (bestT == 0 || t < bestT) { bestT = t; bestLabel = it.optString("l", ""); }
            }
            o.put("nextT", bestT);
            o.put("nextLabel", bestLabel);
            o.put("lastFired", last);
            File f = bestAudioFile(ctx);
            o.put("fileKb", f == null ? 0 : (int) (f.length() / 1024));
            o.put("hasUrl", p.getString("url", "").length() > 0);
            String voice = p.getString("voice", "");
            o.put("voice", voice);
            String pkg = ctx.getPackageName();
            boolean bundled = ctx.getResources().getIdentifier("azan_local", "raw", pkg) != 0
                    || ctx.getResources().getIdentifier("azan_v0", "raw", pkg) != 0
                    || (voice.length() > 0 && ctx.getResources().getIdentifier("azan_" + voice, "raw", pkg) != 0);
            o.put("bundled", bundled);
            o.put("notif", androidx.core.app.NotificationManagerCompat.from(ctx).areNotificationsEnabled());
            boolean ign = true;
            if (Build.VERSION.SDK_INT >= 23) {
                android.os.PowerManager pm = (android.os.PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
                ign = pm != null && pm.isIgnoringBatteryOptimizations(pkg);
            }
            o.put("batteryFree", ign);
            o.put("log", p.getString("dlog", ""));
        } catch (Throwable ignore) { }
        return o;
    }

    static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Saves what the web app sent. */
    static void save(Context ctx, String itemsJson, boolean enabled, String url, String voice, String brand) {
        prefs(ctx).edit()
            .putString("items", itemsJson == null ? "[]" : itemsJson)
            .putBoolean("enabled", enabled)
            .putString("url", url == null ? "" : url)
            .putString("voice", voice == null ? "" : voice)
            .putString("brand", brand == null ? "" : brand)
            .apply();
    }

    static PendingIntent firePending(Context ctx, long t, String label) {
        Intent i = new Intent(ctx, AzanReceiver.class);
        i.setAction(ACTION_FIRE);
        i.putExtra("t", t);
        i.putExtra("label", label == null ? "" : label);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        return PendingIntent.getBroadcast(ctx, 4711, i, flags);
    }

    /** true if a real azan is about to play (within aheadMs) or has just played (last 6 minutes): do not restart the app now. */
    static boolean azanNear(Context ctx, long aheadMs) {
        try {
            SharedPreferences p = prefs(ctx);
            if (!p.getBoolean("enabled", true)) return false;
            JSONArray arr = new JSONArray(p.getString("items", "[]"));
            long now = System.currentTimeMillis();
            for (int i = 0; i < arr.length(); i++) {
                long t = arr.getJSONObject(i).optLong("t", 0);
                if (t > 0 && t >= now - 6L * 60L * 1000L && t <= now + aheadMs) return true;
            }
        } catch (Throwable ignore) { }
        return false;
    }

    /** Arms ONE alarm for the next prayer time in the saved list (replaces the previous one). */
    static void arm(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        try { armSticky(ctx, am); } catch (Throwable ignore) { }
        SharedPreferences p = prefs(ctx);
        boolean enabled = p.getBoolean("enabled", true);
        long now = System.currentTimeMillis();
        long bestT = 0;
        String bestLabel = "";
        if (enabled) {
            try {
                JSONArray arr = new JSONArray(p.getString("items", "[]"));
                long last = p.getLong("last_fired", 0);
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject o = arr.getJSONObject(i);
                    long t = o.optLong("t", 0);
                    if (t <= 0 || t == last) continue;
                    if (t < now - MAX_LATE_MS) continue;       // too old
                    if (bestT == 0 || t < bestT) { bestT = t; bestLabel = o.optString("l", ""); }
                }
            } catch (Throwable ignore) { }
        }
        // cancel the old alarm first
        try { am.cancel(firePending(ctx, 0, "")); } catch (Throwable ignore) { }
        if (bestT == 0) return;
        PendingIntent fire = firePending(ctx, bestT, bestLabel);
        Intent launch = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        int sf = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent show = launch == null ? fire : PendingIntent.getActivity(ctx, 4712, launch, sf);
        try {
            // setAlarmClock = the most reliable alarm (works in Doze / locked phone, no extra permission)
            am.setAlarmClock(new AlarmManager.AlarmClockInfo(bestT, show), fire);
        } catch (Throwable t) {
            try {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, bestT, fire);
            } catch (Throwable ignore) { }
        }
    }

    /** Runs the sticky-card refresh off the main thread (the receiver is kept alive with goAsync). */
    static void refreshStickyAsync(final Context ctx, final BroadcastReceiver.PendingResult pr, final boolean restore) {
        try {
            new Thread(new Runnable() {
                @Override public void run() {
                    try { AppUpdaterPlugin.stkRefreshNext(ctx.getApplicationContext(), restore); } catch (Throwable ignore) { }
                    try { if (pr != null) pr.finish(); } catch (Throwable ignore) { }
                }
            }).start();
        } catch (Throwable e) {
            try { if (pr != null) pr.finish(); } catch (Throwable ignore) { }
        }
    }

    /**
     * One extra alarm (independent of the azan on/off switch): 3 seconds after the next prayer time it wakes the
     * receiver so the "next azan" on the sticky card moves on to the following prayer, even with the app closed
     * and no internet.
     */
    static void armSticky(Context ctx, AlarmManager am) {
        int sf = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        Intent i = new Intent(ctx, AzanReceiver.class);
        i.setAction(ACTION_STICKY);
        PendingIntent pi = PendingIntent.getBroadcast(ctx, 4732, i, sf);
        try { am.cancel(pi); } catch (Throwable ignore) { }
        long now = System.currentTimeMillis();
        long bestT = 0;
        try {
            JSONArray arr = new JSONArray(prefs(ctx).getString("items", "[]"));
            for (int k = 0; k < arr.length(); k++) {
                long t = arr.getJSONObject(k).optLong("t", 0);
                if (t > now && (bestT == 0 || t < bestT)) bestT = t;
            }
        } catch (Throwable ignore) { }
        if (bestT == 0) return;
        long at = bestT + 3000L;
        try {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        } catch (Throwable e) {
            try { am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi); } catch (Throwable ignore) { }
        }
    }

    /** Starts the sound service. If Android refuses, shows a normal loud notification instead. */
    static void startAzan(Context ctx, String label) {
        Intent si = new Intent(ctx, AzanService.class);
        si.putExtra("label", label);
        try {
            if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(si);
            else ctx.startService(si);
        } catch (Throwable t) {
            postFallback(ctx, label);
        }
    }

    static void postFallback(Context ctx, String label) {
        try {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(FALLBACK_CH) == null) {
                NotificationChannel ch = new NotificationChannel(FALLBACK_CH, "Azan", NotificationManager.IMPORTANCE_HIGH);
                ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                nm.createNotificationChannel(ch);
            }
            String pkg = ctx.getPackageName();
            int small = ctx.getResources().getIdentifier("ic_stat_azan", "drawable", pkg);
            if (small == 0) small = ctx.getApplicationInfo().icon;
            Intent launch = ctx.getPackageManager().getLaunchIntentForPackage(pkg);
            int pf = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
            PendingIntent pi = launch == null ? null : PendingIntent.getActivity(ctx, 4713, launch, pf);
            NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, FALLBACK_CH)
                .setSmallIcon(small)
                .setContentTitle("\u0627\u0630\u0627\u0646 " + label)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setAutoCancel(true);
            if (pi != null) b.setContentIntent(pi);
            nm.notify(FALLBACK_ID, b.build());
        } catch (Throwable ignore) { }
    }

    /* ---------------- audio file kept for offline use ---------------- */

    static File audioDir(Context ctx) {
        File d = new File(ctx.getFilesDir(), "azan");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    static String sha1(String s) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-1");
            byte[] h = md.digest(s.getBytes("UTF-8"));
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < h.length; i++) sb.append(String.format("%02x", h[i]));
            return sb.toString();
        } catch (Throwable t) {
            return "azan";
        }
    }

    /** The saved audio file for this url (may not exist yet). */
    static File fileForUrl(Context ctx, String url) {
        return new File(audioDir(ctx), "azan_" + sha1(url) + ".mp3");
    }

    /** Best audio file we have: the one for the current url, else any downloaded file. */
    static File bestAudioFile(Context ctx) {
        String url = prefs(ctx).getString("url", "");
        if (url.length() > 0) {
            File f = fileForUrl(ctx, url);
            if (f.isFile() && f.length() > 2000) return f;
        }
        File[] all = audioDir(ctx).listFiles();
        if (all != null) {
            for (int i = 0; i < all.length; i++) {
                File f = all[i];
                if (f.isFile() && f.getName().endsWith(".mp3") && f.length() > 2000) return f;
            }
        }
        return null;
    }

    private static volatile boolean downloading = false;
    private static volatile String pendingUrl = null;

    /** Downloads the azan audio (if we do not have it yet) in a background thread. Silent on failure. */
    static void downloadAsync(final Context appCtx, final String url) {
        if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) return;
        final File target = fileForUrl(appCtx, url);
        if (target.isFile() && target.length() > 2000) return;
        if (downloading) { pendingUrl = url; return; } // a download is running: remember the newest url, retry after it
        downloading = true;
        new Thread(new Runnable() {
            @Override
            public void run() {
                HttpURLConnection c = null;
                InputStream in = null;
                OutputStream out = null;
                File part = new File(target.getParentFile(), target.getName() + ".part");
                try {
                    URL u = new URL(url);
                    int code = 0;
                    for (int i = 0; i < 6; i++) {
                        c = (HttpURLConnection) u.openConnection();
                        c.setInstanceFollowRedirects(false);
                        c.setConnectTimeout(20000);
                        c.setReadTimeout(60000);
                        c.setRequestProperty("User-Agent", "ArefanejamApp");
                        code = c.getResponseCode();
                        if (code == 301 || code == 302 || code == 303 || code == 307 || code == 308) {
                            String loc = c.getHeaderField("Location");
                            c.disconnect();
                            if (loc == null) throw new Exception("redirect without location");
                            u = new URL(u, loc);
                            continue;
                        }
                        break;
                    }
                    if (code != 200) throw new Exception("HTTP " + code);
                    in = c.getInputStream();
                    out = new FileOutputStream(part);
                    byte[] buf = new byte[32 * 1024];
                    int n;
                    long size = 0;
                    while ((n = in.read(buf)) != -1) {
                        out.write(buf, 0, n);
                        size += n;
                        if (size > 25L * 1024L * 1024L) throw new Exception("file too large");
                    }
                    out.flush();
                    out.close();
                    out = null;
                    if (size < 2000) throw new Exception("too small");
                    // make sure it is not a web page (firewall / error page)
                    byte[] head = new byte[64];
                    FileInputStream fi = new FileInputStream(part);
                    int hn = fi.read(head);
                    fi.close();
                    String hs = new String(head, 0, Math.max(hn, 0), "ISO-8859-1").toLowerCase();
                    if (hs.indexOf("<html") >= 0 || hs.indexOf("<!doctype") >= 0) throw new Exception("not audio");
                    if (target.exists()) target.delete();
                    if (!part.renameTo(target)) throw new Exception("rename failed");
                    // keep only the newest file
                    File[] all = target.getParentFile().listFiles();
                    if (all != null) {
                        for (int i = 0; i < all.length; i++) {
                            File f = all[i];
                            if (f.isFile() && !f.getName().equals(target.getName())) f.delete();
                        }
                    }
                } catch (Throwable t) {
                    try { part.delete(); } catch (Throwable ignore) { }
                } finally {
                    try { if (in != null) in.close(); } catch (Throwable ignore) { }
                    try { if (out != null) out.close(); } catch (Throwable ignore) { }
                    try { if (c != null) c.disconnect(); } catch (Throwable ignore) { }
                    downloading = false;
                    String next = pendingUrl;
                    pendingUrl = null;
                    if (next != null && !next.equals(url)) downloadAsync(appCtx, next);
                }
            }
        }).start();
    }
}
