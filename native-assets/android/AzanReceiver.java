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
    // fired by the repeating 5-minute alarm (UpdateJobService.armPoll): checks the announcements / news inbox
    public static final String ACTION_POLL = "com.arefanejam.quran.INBOX_POLL";
    // "prayer time has come" reminder, fired PRAYER_REMINDER_MIN minutes after each azan (not Maghrib): works with the app closed, phone locked and offline
    public static final String ACTION_PRAYER = "com.arefanejam.quran.PRAYER_TIME";
    static final long PRAYER_REMINDER_MS = 20L * 60L * 1000L;
    static final long PRAYER_MAX_LATE_MS = 10L * 60L * 1000L;
    static final String PRAYER_CH = "prayer-time-reminder-v1";
    static final int PRAYER_NOTIF_ID = 777000005;
    // short "lesson after prayer" (Quran meaning / hadith meaning, Hanafi-friendly, no references): a normal system notification
    // LESSON_DELAY_MS after each azan (fajr, dhuhr, asr, maghrib, isha). Never opens or shows anything inside the app: the user just swipes it away.
    // Works with the app closed, phone locked and offline. To change the delay or the prayers, edit LESSON_DELAY_MS / lessonKeyIndex().
    public static final String ACTION_LESSON = "com.arefanejam.quran.LESSON";
    static final long LESSON_DELAY_MS = 10L * 60L * 1000L;
    static final long LESSON_MAX_LATE_MS = 10L * 60L * 1000L;
    static final String LESSON_CH = "lesson-after-prayer-v1";
    static final int LESSON_NOTIF_ID = 777000006;
    static final String PREFS = "arefanejam_native_azan";
    static final String FALLBACK_CH = "azan-native-fallback-v1";
    static final int FALLBACK_ID = 777000003;
    // an alarm that fires later than this after its time (phone was off) is skipped
    static final long MAX_LATE_MS = 3L * 60L * 1000L;

    @Override
    public void onReceive(Context ctx, Intent intent) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_NET.equals(action)) {
            // internet is back: read the announcements / news / events inbox right now (only this, nothing else).
            // Done directly here (not through JobScheduler, which Doze can delay for hours); the job is only the fallback.
            if (System.currentTimeMillis() - UpdateJobService.prefs(ctx).getLong("inbox_last", 0) < UpdateJobService.INBOX_MIN_GAP_MS) return;
            BroadcastReceiver.PendingResult prNet = null;
            try { prNet = goAsync(); } catch (Throwable ignore) { }
            try { UpdateJobService.runInboxNow(ctx, prNet, false); }
            catch (Throwable t) { try { if (prNet != null) prNet.finish(); } catch (Throwable ignore) { } try { UpdateJobService.kickInbox(ctx); } catch (Throwable ignore2) { } }
            return;
        }
        if (ACTION_POLL.equals(action)) {
            // the 5-minute alarm: re-arms itself, then reads the inbox (works with the phone locked and the app closed)
            BroadcastReceiver.PendingResult prPoll = null;
            try { prPoll = goAsync(); } catch (Throwable ignore) { }
            try { UpdateJobService.runInboxNow(ctx, prPoll, true); }
            catch (Throwable t) { try { if (prPoll != null) prPoll.finish(); } catch (Throwable ignore) { } }
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
            } else if (ACTION_PRAYER.equals(action)) {
                long t = intent.getLongExtra("t", 0);
                String label = intent.getStringExtra("label");
                if (label == null) label = "";
                SharedPreferences p = prefs(ctx);
                boolean enabled = p.getBoolean("enabled", true);
                long now = System.currentTimeMillis();
                long last = p.getLong("last_pt_fired", 0);
                boolean dup = (t == last);
                boolean late = now - t > PRAYER_MAX_LATE_MS;
                logEvent(ctx, "PRAYER-TIME " + label + " enabled=" + enabled + " late=" + ((now - t) / 1000) + "s" + (dup ? " (duplicate, skipped)" : ""));
                if (enabled && t > 0 && !dup && !late) {
                    p.edit().putLong("last_pt_fired", t).apply();
                    // app on screen: the in-app popup already tells the user, no extra notification
                    if (!MainActivity.inForeground) postPrayerTime(ctx, label);
                }
            } else if (ACTION_LESSON.equals(action)) {
                long t = intent.getLongExtra("t", 0);
                String key = intent.getStringExtra("k");
                if (key == null) key = "";
                SharedPreferences p = prefs(ctx);
                boolean enabled = p.getBoolean("enabled", true);
                long now = System.currentTimeMillis();
                long last = p.getLong("last_lesson_fired", 0);
                boolean dup = (t == last);
                boolean late = now - t > LESSON_MAX_LATE_MS;
                logEvent(ctx, "LESSON " + key + " enabled=" + enabled + " late=" + ((now - t) / 1000) + "s" + (dup ? " (duplicate, skipped)" : ""));
                if (enabled && t > 0 && !dup && !late) {
                    p.edit().putLong("last_lesson_fired", t).apply();
                    postLesson(ctx, key, t);
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
            Object[] ptn = nextPrayerReminder(ctx);
            o.put("prayerTimeNextT", ptn == null ? 0 : ((Long) ptn[0]).longValue());
            o.put("prayerTimeNextLabel", ptn == null ? "" : (String) ptn[1]);
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
        try { armPrayerTime(ctx, am); } catch (Throwable ignore) { }
        try { armLesson(ctx, am); } catch (Throwable ignore) { }
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

    static PendingIntent prayerPending(Context ctx, long t, String label) {
        Intent i = new Intent(ctx, AzanReceiver.class);
        i.setAction(ACTION_PRAYER);
        i.putExtra("t", t);
        i.putExtra("label", label == null ? "" : label);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        return PendingIntent.getBroadcast(ctx, 4733, i, flags);
    }

    /** Next "prayer time has come" moment (azan + 20 min, never for Maghrib) from the saved 30-day list: {time, label}. */
    static Object[] nextPrayerReminder(Context ctx) {
        try {
            SharedPreferences p = prefs(ctx);
            JSONArray arr = new JSONArray(p.getString("items", "[]"));
            long last = p.getLong("last_pt_fired", 0);
            long now = System.currentTimeMillis();
            long bestT = 0;
            String bestLabel = "";
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                String k = o.optString("k", "");
                if ("maghrib".equals(k) || "sunrise".equals(k) || "sunset".equals(k)) continue;
                long az = o.optLong("t", 0);
                if (az <= 0) continue;
                long t = az + PRAYER_REMINDER_MS;
                if (t == last) continue;
                if (t < now - PRAYER_MAX_LATE_MS) continue;
                if (bestT == 0 || t < bestT) { bestT = t; bestLabel = o.optString("l", ""); }
            }
            if (bestT == 0) return null;
            return new Object[] { Long.valueOf(bestT), bestLabel };
        } catch (Throwable ignore) { return null; }
    }

    /** Arms ONE alarm for the next "prayer time has come" reminder (independent of the azan sound; replaces the previous one). */
    static void armPrayerTime(Context ctx, AlarmManager am) {
        try { am.cancel(prayerPending(ctx, 0, "")); } catch (Throwable ignore) { }
        if (!prefs(ctx).getBoolean("enabled", true)) return;
        Object[] nx = nextPrayerReminder(ctx);
        if (nx == null) return;
        long at = ((Long) nx[0]).longValue();
        PendingIntent pi = prayerPending(ctx, at, (String) nx[1]);
        try {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        } catch (Throwable e) {
            try { am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi); } catch (Throwable ignore) { }
        }
    }

    /** Loud heads-up notification (sound + vibration, visible on the lock screen): "it is prayer time". */
    static void postPrayerTime(Context ctx, String label) {
        try {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(PRAYER_CH) == null) {
                NotificationChannel ch = new NotificationChannel(PRAYER_CH, "\u0648\u0642\u062a \u0646\u0645\u0627\u0632", NotificationManager.IMPORTANCE_HIGH);
                ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                ch.enableVibration(true);
                ch.setVibrationPattern(new long[] { 0, 400, 200, 400, 200, 400 });
                nm.createNotificationChannel(ch);
            }
            String pkg = ctx.getPackageName();
            int small = ctx.getResources().getIdentifier("ic_stat_azan", "drawable", pkg);
            if (small == 0) small = ctx.getApplicationInfo().icon;
            Intent launch = ctx.getPackageManager().getLaunchIntentForPackage(pkg);
            int pf = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
            PendingIntent pi = launch == null ? null : PendingIntent.getActivity(ctx, 4734, launch, pf);
            String brand = prefs(ctx).getString("brand", "");
            String title = "\u0648\u0642\u062a \u0646\u0645\u0627\u0632 " + label + " \u0631\u0633\u06cc\u062f\u0647 \u0627\u0633\u062a";
            String body = "\u0648\u0642\u062a \u0646\u0645\u0627\u0632 " + label + " \u0641\u0631\u0627 \u0631\u0633\u06cc\u062f\u0647 \u0627\u0633\u062a." + (brand.length() > 0 ? "  \u2022  " + brand : "");
            NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, PRAYER_CH)
                .setSmallIcon(small)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setDefaults(NotificationCompat.DEFAULT_ALL)
                .setWhen(System.currentTimeMillis())
                .setAutoCancel(true);
            if (pi != null) b.setContentIntent(pi);
            nm.notify(PRAYER_NOTIF_ID, b.build());
            logEvent(ctx, "PRAYER-TIME notification shown: " + label);
        } catch (Throwable t) {
            logEvent(ctx, "PRAYER-TIME notification failed: " + t);
        }
    }


    // ---------- short lesson after prayer ----------
    static final String[] LESSONS = {
        "Q\u062e\u062f\u0627\u0648\u0646\u062f \u0628\u0627 \u0635\u0627\u0628\u0631\u0627\u0646 \u0627\u0633\u062a\u061b \u067e\u0633 \u062f\u0631 \u0633\u062e\u062a\u06cc\u200c\u0647\u0627 \u0635\u0628\u0631 \u0631\u0627 \u0631\u0647\u0627 \u0646\u06a9\u0646.",
        "H\u06a9\u0627\u0631\u0647\u0627 \u0628\u0647 \u0646\u06cc\u062a\u200c\u0647\u0627\u0633\u062a \u0648 \u0628\u0631\u0627\u06cc \u0647\u0631 \u06a9\u0633 \u0647\u0645\u0627\u0646 \u0627\u0633\u062a \u06a9\u0647 \u0646\u06cc\u062a \u06a9\u0631\u062f\u0647 \u0627\u0633\u062a.",
        "Q\u0647\u0631 \u06a9\u0647 \u0627\u0632 \u062e\u062f\u0627 \u0628\u062a\u0631\u0633\u062f\u060c \u062e\u062f\u0627 \u0628\u0631\u0627\u06cc\u0634 \u0631\u0627\u0647 \u062e\u0631\u0648\u062c\u06cc \u0645\u06cc\u200c\u06af\u0634\u0627\u06cc\u062f \u0648 \u0627\u0632 \u062c\u0627\u06cc\u06cc \u06a9\u0647 \u06af\u0645\u0627\u0646 \u0646\u062f\u0627\u0631\u062f \u0631\u0648\u0632\u06cc\u200c\u0627\u0634 \u0645\u06cc\u200c\u062f\u0647\u062f.",
        "H\u0645\u0633\u0644\u0645\u0627\u0646 \u06a9\u0633\u06cc \u0627\u0633\u062a \u06a9\u0647 \u0645\u0633\u0644\u0645\u0627\u0646\u0627\u0646 \u0627\u0632 \u0632\u0628\u0627\u0646 \u0648 \u062f\u0633\u062a\u0634 \u062f\u0631 \u0627\u0645\u0627\u0646 \u0628\u0627\u0634\u0646\u062f.",
        "Q\u0628\u06cc\u200c\u06af\u0645\u0627\u0646 \u0647\u0645\u0631\u0627\u0647 \u0647\u0631 \u0633\u062e\u062a\u06cc\u060c \u0622\u0633\u0627\u0646\u06cc\u200c\u0627\u06cc \u0647\u0633\u062a.",
        "H\u0647\u06cc\u0686\u200c\u06cc\u06a9 \u0627\u0632 \u0634\u0645\u0627 \u0645\u0624\u0645\u0646 \u0646\u06cc\u0633\u062a \u062a\u0627 \u0622\u0646\u0686\u0647 \u0631\u0627 \u0628\u0631\u0627\u06cc \u062e\u0648\u062f \u062f\u0648\u0633\u062a \u062f\u0627\u0631\u062f \u0628\u0631\u0627\u06cc \u0628\u0631\u0627\u062f\u0631\u0634 \u0647\u0645 \u062f\u0648\u0633\u062a \u0628\u062f\u0627\u0631\u062f.",
        "Q\u0645\u0631\u0627 \u06cc\u0627\u062f \u06a9\u0646\u06cc\u062f \u062a\u0627 \u0634\u0645\u0627 \u0631\u0627 \u06cc\u0627\u062f \u06a9\u0646\u0645 \u0648 \u0634\u06a9\u0631\u06af\u0632\u0627\u0631\u0645 \u0628\u0627\u0634\u06cc\u062f \u0648 \u0646\u0627\u0633\u067e\u0627\u0633\u06cc \u0646\u06a9\u0646\u06cc\u062f.",
        "H\u0647\u0631 \u06a9\u0647 \u0628\u0647 \u062e\u062f\u0627 \u0648 \u0631\u0648\u0632 \u0622\u062e\u0631\u062a \u0627\u06cc\u0645\u0627\u0646 \u062f\u0627\u0631\u062f\u060c \u0633\u062e\u0646 \u062e\u0648\u0628 \u0628\u06af\u0648\u06cc\u062f \u06cc\u0627 \u0633\u06a9\u0648\u062a \u06a9\u0646\u062f.",
        "Q\u0622\u06af\u0627\u0647 \u0628\u0627\u0634\u06cc\u062f\u060c \u062a\u0646\u0647\u0627 \u0628\u0627 \u06cc\u0627\u062f \u062e\u062f\u0627 \u062f\u0644\u200c\u0647\u0627 \u0622\u0631\u0627\u0645 \u0645\u06cc\u200c\u06af\u06cc\u0631\u062f.",
        "H\u0647\u0631 \u06a9\u0647 \u0628\u0647 \u062e\u062f\u0627 \u0648 \u0631\u0648\u0632 \u0622\u062e\u0631\u062a \u0627\u06cc\u0645\u0627\u0646 \u062f\u0627\u0631\u062f\u060c \u0645\u0647\u0645\u0627\u0646\u0634 \u0631\u0627 \u06af\u0631\u0627\u0645\u06cc \u0628\u062f\u0627\u0631\u062f.",
        "Q\u062e\u062f\u0627 \u0645\u06cc\u200c\u0641\u0631\u0645\u0627\u06cc\u062f: \u0645\u0646 \u0646\u0632\u062f\u06cc\u06a9\u0645 \u0648 \u062f\u0639\u0627\u06cc \u062f\u0639\u0627\u06a9\u0646\u0646\u062f\u0647 \u0631\u0627 \u0648\u0642\u062a\u06cc \u0645\u0631\u0627 \u0628\u062e\u0648\u0627\u0646\u062f \u0627\u062c\u0627\u0628\u062a \u0645\u06cc\u200c\u06a9\u0646\u0645.",
        "H\u0628\u0647\u062a\u0631\u06cc\u0646 \u0634\u0645\u0627 \u06a9\u0633\u06cc \u0627\u0633\u062a \u06a9\u0647 \u0642\u0631\u0622\u0646 \u0631\u0627 \u0628\u06cc\u0627\u0645\u0648\u0632\u062f \u0648 \u0628\u0647 \u062f\u06cc\u06af\u0631\u0627\u0646 \u0628\u06cc\u0627\u0645\u0648\u0632\u0627\u0646\u062f.",
        "Q\u0627\u06af\u0631 \u0634\u06a9\u0631\u06af\u0632\u0627\u0631 \u0628\u0627\u0634\u06cc\u062f\u060c \u0646\u0639\u0645\u062a \u0631\u0627 \u0628\u0631\u0627\u06cc\u062a\u0627\u0646 \u0628\u06cc\u0634\u062a\u0631 \u0645\u06cc\u200c\u06a9\u0646\u0645.",
        "H\u0644\u0628\u062e\u0646\u062f \u0632\u062f\u0646 \u062a\u0648 \u0628\u0647 \u0631\u0648\u06cc \u0628\u0631\u0627\u062f\u0631\u062a \u0635\u062f\u0642\u0647 \u0627\u0633\u062a.",
        "Q\u062e\u062f\u0627 \u0647\u06cc\u0686\u200c\u06a9\u0633 \u0631\u0627 \u062c\u0632 \u0628\u0647 \u0627\u0646\u062f\u0627\u0632\u0647\u0654 \u062a\u0648\u0627\u0646\u0634 \u062a\u06a9\u0644\u06cc\u0641 \u0646\u0645\u06cc\u200c\u06a9\u0646\u062f.",
        "H\u067e\u0627\u06a9\u06cc\u0632\u06af\u06cc \u0646\u06cc\u0645\u06cc \u0627\u0632 \u0627\u06cc\u0645\u0627\u0646 \u0627\u0633\u062a.",
        "Q\u0628\u0647 \u067e\u062f\u0631 \u0648 \u0645\u0627\u062f\u0631 \u0646\u06cc\u06a9\u06cc \u06a9\u0646\u061b \u0648 \u062d\u062a\u06cc \u00ab\u0627\u0641\u00bb \u0647\u0645 \u0628\u0647 \u0622\u0646\u200c\u0647\u0627 \u0646\u06af\u0648 \u0648 \u0628\u0627 \u0622\u0646\u200c\u0647\u0627 \u0646\u06cc\u06a9\u0648 \u0633\u062e\u0646 \u0628\u06af\u0648.",
        "H\u0628\u0647\u062a\u0631\u06cc\u0646 \u0634\u0645\u0627\u060c \u062e\u0648\u0634\u200c\u0627\u062e\u0644\u0627\u0642\u200c\u062a\u0631\u06cc\u0646 \u0634\u0645\u0627\u0633\u062a.",
        "Q\u0628\u0627 \u0645\u0631\u062f\u0645 \u0646\u06cc\u06a9\u0648 \u0633\u062e\u0646 \u0628\u06af\u0648\u06cc\u06cc\u062f.",
        "H\u0633\u0646\u06af\u06cc\u0646\u200c\u062a\u0631\u06cc\u0646 \u0686\u06cc\u0632 \u062f\u0631 \u062a\u0631\u0627\u0632\u0648\u06cc \u0627\u0639\u0645\u0627\u0644\u060c \u062e\u0648\u0634\u200c\u0627\u062e\u0644\u0627\u0642\u06cc \u0627\u0633\u062a.",
        "Q\u0628\u062f\u06cc \u0631\u0627 \u0628\u0627 \u0646\u06cc\u06a9\u06cc \u062f\u0641\u0639 \u06a9\u0646\u061b \u0622\u0646\u200c\u06af\u0627\u0647 \u06a9\u0633\u06cc \u06a9\u0647 \u0628\u0627 \u062a\u0648 \u062f\u0634\u0645\u0646\u06cc \u062f\u0627\u0634\u062a\u060c \u0686\u0648\u0646 \u062f\u0648\u0633\u062a\u06cc \u06af\u0631\u0645 \u062e\u0648\u0627\u0647\u062f \u0634\u062f.",
        "H\u062e\u062f\u0627 \u0645\u0647\u0631\u0628\u0627\u0646 \u0627\u0633\u062a \u0648 \u0645\u0647\u0631\u0628\u0627\u0646\u06cc \u0631\u0627 \u062f\u0631 \u0647\u0645\u0647\u0654 \u06a9\u0627\u0631\u0647\u0627 \u062f\u0648\u0633\u062a \u062f\u0627\u0631\u062f.",
        "Q\u062e\u062f\u0627 \u0628\u0647 \u0639\u062f\u0627\u0644\u062a \u0648 \u0646\u06cc\u06a9\u06cc \u0648 \u0628\u062e\u0634\u0634 \u0628\u0647 \u062e\u0648\u06cc\u0634\u0627\u0648\u0646\u062f\u0627\u0646 \u0641\u0631\u0645\u0627\u0646 \u0645\u06cc\u200c\u062f\u0647\u062f.",
        "H\u0628\u0647 \u0645\u0647\u0631\u0628\u0627\u0646\u0627\u0646\u060c \u062e\u062f\u0627\u06cc \u0645\u0647\u0631\u0628\u0627\u0646 \u0631\u062d\u0645 \u0645\u06cc\u200c\u06a9\u0646\u062f\u061b \u0628\u0647 \u0627\u0647\u0644 \u0632\u0645\u06cc\u0646 \u0645\u0647\u0631\u0628\u0627\u0646\u06cc \u06a9\u0646\u06cc\u062f \u062a\u0627 \u0622\u0633\u0645\u0627\u0646\u06cc\u0627\u0646 \u0628\u0631 \u0634\u0645\u0627 \u0645\u0647\u0631\u0628\u0627\u0646 \u0628\u0627\u0634\u0646\u062f.",
        "Q\u062f\u0631 \u0646\u06cc\u06a9\u06cc \u0648 \u067e\u0631\u0647\u06cc\u0632\u06af\u0627\u0631\u06cc \u06cc\u06a9\u062f\u06cc\u06af\u0631 \u0631\u0627 \u06cc\u0627\u0631\u06cc \u06a9\u0646\u06cc\u062f\u060c \u0646\u0647 \u062f\u0631 \u06af\u0646\u0627\u0647 \u0648 \u062f\u0634\u0645\u0646\u06cc.",
        "H\u0647\u0631 \u06a9\u0647 \u0628\u0647 \u0645\u0631\u062f\u0645 \u0631\u062d\u0645 \u0646\u06a9\u0646\u062f\u060c \u062e\u062f\u0627 \u0628\u0647 \u0627\u0648 \u0631\u062d\u0645 \u0646\u0645\u06cc\u200c\u06a9\u0646\u062f.",
        "Q\u0645\u0624\u0645\u0646\u0627\u0646 \u0628\u0627 \u0647\u0645 \u0628\u0631\u0627\u062f\u0631\u0646\u062f\u061b \u067e\u0633 \u0645\u06cc\u0627\u0646 \u0628\u0631\u0627\u062f\u0631\u0627\u0646\u062a\u0627\u0646 \u0622\u0634\u062a\u06cc \u0628\u0631\u0642\u0631\u0627\u0631 \u06a9\u0646\u06cc\u062f.",
        "H\u0645\u0624\u0645\u0646 \u0628\u0631\u0627\u06cc \u0645\u0624\u0645\u0646 \u0645\u0627\u0646\u0646\u062f \u0633\u0627\u062e\u062a\u0645\u0627\u0646\u06cc \u0627\u0633\u062a \u06a9\u0647 \u0627\u062c\u0632\u0627\u06cc\u0634 \u06cc\u06a9\u062f\u06cc\u06af\u0631 \u0631\u0627 \u0645\u062d\u06a9\u0645 \u0646\u06af\u0647 \u0645\u06cc\u200c\u062f\u0627\u0631\u0646\u062f.",
        "Q\u0627\u0632 \u0628\u0633\u06cc\u0627\u0631\u06cc \u06af\u0645\u0627\u0646\u200c\u0647\u0627\u06cc \u0628\u062f \u062f\u0648\u0631\u06cc \u06a9\u0646\u06cc\u062f \u0648 \u0627\u0632 \u0639\u06cc\u0628\u200c\u062c\u0648\u06cc\u06cc \u0648 \u063a\u06cc\u0628\u062a \u06cc\u06a9\u062f\u06cc\u06af\u0631 \u0628\u067e\u0631\u0647\u06cc\u0632\u06cc\u062f.",
        "H\u062f\u06cc\u0646\u060c \u062e\u06cc\u0631\u062e\u0648\u0627\u0647\u06cc \u0627\u0633\u062a.",
        "Q\u062f\u0631 \u0631\u0627\u0647 \u062e\u062f\u0627 \u0627\u0646\u0641\u0627\u0642 \u06a9\u0646\u06cc\u062f \u0648 \u0646\u06cc\u06a9\u06cc \u06a9\u0646\u06cc\u062f\u061b \u062e\u062f\u0627 \u0646\u06cc\u06a9\u0648\u06a9\u0627\u0631\u0627\u0646 \u0631\u0627 \u062f\u0648\u0633\u062a \u062f\u0627\u0631\u062f.",
        "H\u062f\u0639\u0627 \u0647\u0645\u0627\u0646 \u0639\u0628\u0627\u062f\u062a \u0627\u0633\u062a.",
        "Q\u0628\u0647 \u0646\u06cc\u06a9\u06cc \u0648\u0627\u0642\u0639\u06cc \u0646\u0645\u06cc\u200c\u0631\u0633\u06cc\u062f \u0645\u06af\u0631 \u0622\u0646\u06a9\u0647 \u0627\u0632 \u0622\u0646\u0686\u0647 \u062f\u0648\u0633\u062a \u062f\u0627\u0631\u06cc\u062f \u0628\u0628\u062e\u0634\u06cc\u062f.",
        "H\u062e\u0634\u0646\u0648\u062f\u06cc \u067e\u0631\u0648\u0631\u062f\u06af\u0627\u0631 \u062f\u0631 \u062e\u0634\u0646\u0648\u062f\u06cc \u067e\u062f\u0631 \u0648 \u0645\u0627\u062f\u0631 \u0627\u0633\u062a.",
        "Q\u0628\u06af\u0648: \u0646\u0645\u0627\u0632 \u0648 \u0639\u0628\u0627\u062f\u062a \u0648 \u0632\u0646\u062f\u06af\u06cc \u0648 \u0645\u0631\u06af \u0645\u0646\u060c \u0647\u0645\u0647 \u0628\u0631\u0627\u06cc \u062e\u062f\u0627\u060c \u067e\u0631\u0648\u0631\u062f\u06af\u0627\u0631 \u062c\u0647\u0627\u0646\u06cc\u0627\u0646 \u0627\u0633\u062a.",
        "H\u0646\u0645\u0627\u0632\u0647\u0627\u06cc \u067e\u0646\u062c\u06af\u0627\u0646\u0647 \u0645\u0627\u0646\u0646\u062f \u0646\u0647\u0631\u06cc \u062c\u0627\u0631\u06cc \u062f\u0631 \u0628\u0631\u0627\u0628\u0631 \u062e\u0627\u0646\u0647\u0654 \u062a\u0648\u0633\u062a \u06a9\u0647 \u0647\u0631 \u0631\u0648\u0632 \u067e\u0646\u062c \u0628\u0627\u0631 \u062f\u0631 \u0622\u0646 \u0634\u0633\u062a\u200c\u0648\u0634\u0648 \u0645\u06cc\u200c\u06a9\u0646\u06cc\u061b \u062f\u06cc\u06af\u0631 \u0686\u0647 \u0622\u0644\u0648\u062f\u06af\u06cc\u200c\u0627\u06cc \u0645\u06cc\u200c\u0645\u0627\u0646\u062f\u061f",
        "Q\u0646\u0645\u0627\u0632 \u0631\u0627 \u0628\u0631\u067e\u0627 \u062f\u0627\u0631\u061b \u0647\u0645\u0627\u0646\u0627 \u0646\u0645\u0627\u0632 \u0627\u0632 \u06a9\u0627\u0631 \u0632\u0634\u062a \u0648 \u0646\u0627\u067e\u0633\u0646\u062f \u0628\u0627\u0632 \u0645\u06cc\u200c\u062f\u0627\u0631\u062f.",
        "H\u0646\u062e\u0633\u062a\u06cc\u0646 \u0686\u06cc\u0632\u06cc \u06a9\u0647 \u062f\u0631 \u0642\u06cc\u0627\u0645\u062a \u0627\u0632 \u0628\u0646\u062f\u0647 \u062d\u0633\u0627\u0628 \u0645\u06cc\u200c\u0634\u0648\u062f\u060c \u0646\u0645\u0627\u0632 \u0627\u0633\u062a.",
        "Q\u0627\u0632 \u0635\u0628\u0631 \u0648 \u0646\u0645\u0627\u0632 \u06a9\u0645\u06a9 \u0628\u06af\u06cc\u0631\u06cc\u062f.",
        "H\u062f\u0648 \u06a9\u0644\u0645\u0647 \u0628\u0631 \u0632\u0628\u0627\u0646 \u0633\u0628\u06a9 \u0648 \u062f\u0631 \u062a\u0631\u0627\u0632\u0648 \u0633\u0646\u06af\u06cc\u0646 \u0648 \u0646\u0632\u062f \u062e\u062f\u0627 \u0645\u062d\u0628\u0648\u0628\u200c\u0627\u0646\u062f: \u00ab\u0633\u0628\u062d\u0627\u0646\u200c\u0627\u0644\u0644\u0647 \u0648 \u0628\u062d\u0645\u062f\u0647\u060c \u0633\u0628\u062d\u0627\u0646\u200c\u0627\u0644\u0644\u0647 \u0627\u0644\u0639\u0638\u06cc\u0645\u00bb.",
        "Q\u062e\u062f\u0627 \u062a\u0648\u0628\u0647\u200c\u06a9\u0646\u0646\u062f\u06af\u0627\u0646 \u0648 \u067e\u0627\u06a9\u06cc\u0632\u06af\u0627\u0646 \u0631\u0627 \u062f\u0648\u0633\u062a \u062f\u0627\u0631\u062f.",
        "H\u0647\u0631 \u06a9\u0647 \u0631\u0627\u0647\u06cc \u0628\u0631\u0627\u06cc \u062f\u0627\u0646\u0634\u200c\u0622\u0645\u0648\u0632\u06cc \u0628\u067e\u06cc\u0645\u0627\u06cc\u062f\u060c \u062e\u062f\u0627 \u0631\u0627\u0647 \u0628\u0647\u0634\u062a \u0631\u0627 \u0628\u0631\u0627\u06cc\u0634 \u0622\u0633\u0627\u0646 \u0645\u06cc\u200c\u06a9\u0646\u062f.",
        "Q\u0627\u06cc \u0628\u0646\u062f\u06af\u0627\u0646 \u0645\u0646 \u06a9\u0647 \u0628\u0631 \u062e\u0648\u062f \u0632\u06cc\u0627\u062f\u0647\u200c\u0631\u0648\u06cc \u06a9\u0631\u062f\u0647\u200c\u0627\u06cc\u062f\u060c \u0627\u0632 \u0631\u062d\u0645\u062a \u062e\u062f\u0627 \u0646\u0627\u0627\u0645\u06cc\u062f \u0646\u0634\u0648\u06cc\u062f\u061b \u0627\u0648 \u0647\u0645\u0647\u0654 \u06af\u0646\u0627\u0647\u0627\u0646 \u0631\u0627 \u0645\u06cc\u200c\u0628\u062e\u0634\u062f.",
        "H\u0647\u0631 \u06a9\u0647 \u0628\u0647 \u06a9\u0627\u0631 \u0646\u06cc\u06a9\u06cc \u0631\u0627\u0647\u0646\u0645\u0627\u06cc\u06cc \u06a9\u0646\u062f\u060c \u0647\u0645\u0627\u0646\u0646\u062f \u0627\u0646\u062c\u0627\u0645\u200c\u062f\u0647\u0646\u062f\u0647\u0654 \u0622\u0646 \u067e\u0627\u062f\u0627\u0634 \u062f\u0627\u0631\u062f.",
        "Q\u0647\u0631 \u06a9\u0647 \u0630\u0631\u0647\u200c\u0627\u06cc \u0646\u06cc\u06a9\u06cc \u06a9\u0646\u062f \u0622\u0646 \u0631\u0627 \u0645\u06cc\u200c\u0628\u06cc\u0646\u062f \u0648 \u0647\u0631 \u06a9\u0647 \u0630\u0631\u0647\u200c\u0627\u06cc \u0628\u062f\u06cc \u06a9\u0646\u062f \u0622\u0646 \u0631\u0627 \u0645\u06cc\u200c\u0628\u06cc\u0646\u062f.",
        "H\u0635\u062f\u0642\u0647 \u0627\u0632 \u0645\u0627\u0644 \u06a9\u0645 \u0646\u0645\u06cc\u200c\u06a9\u0646\u062f.",
        "Q\u067e\u06cc\u0645\u0627\u0646\u0647 \u0648 \u062a\u0631\u0627\u0632\u0648 \u0631\u0627 \u0628\u0627 \u0639\u062f\u0627\u0644\u062a \u062a\u0645\u0627\u0645 \u0628\u062f\u0647\u06cc\u062f.",
        "H\u062f\u0633\u062a \u0628\u062e\u0634\u0646\u062f\u0647 \u0627\u0632 \u062f\u0633\u062a \u06af\u06cc\u0631\u0646\u062f\u0647 \u0628\u0647\u062a\u0631 \u0627\u0633\u062a.",
        "Q\u0628\u0647 \u067e\u06cc\u0645\u0627\u0646 \u062e\u0648\u062f \u0648\u0641\u0627 \u06a9\u0646\u06cc\u062f\u061b \u0632\u06cc\u0631\u0627 \u0627\u0632 \u067e\u06cc\u0645\u0627\u0646 \u067e\u0631\u0633\u06cc\u062f\u0647 \u0645\u06cc\u200c\u0634\u0648\u062f.",
        "H\u0642\u0648\u06cc \u06a9\u0633\u06cc \u0646\u06cc\u0633\u062a \u06a9\u0647 \u062f\u0631 \u06a9\u0634\u062a\u06cc \u067e\u06cc\u0631\u0648\u0632 \u0634\u0648\u062f\u061b \u0642\u0648\u06cc \u06a9\u0633\u06cc \u0627\u0633\u062a \u06a9\u0647 \u0647\u0646\u06af\u0627\u0645 \u062e\u0634\u0645 \u062e\u0648\u062f \u0631\u0627 \u0646\u06af\u0647 \u062f\u0627\u0631\u062f.",
        "Q\u0647\u06cc\u0686\u200c\u06a9\u0633 \u0628\u0627\u0631 \u06af\u0646\u0627\u0647 \u062f\u06cc\u06af\u0631\u06cc \u0631\u0627 \u0628\u0631 \u062f\u0648\u0634 \u0646\u0645\u06cc\u200c\u06a9\u0634\u062f.",
        "H\u0645\u0631\u062f\u06cc \u0627\u0632 \u067e\u06cc\u0627\u0645\u0628\u0631 \u0646\u0635\u06cc\u062d\u062a \u062e\u0648\u0627\u0633\u062a\u061b \u0641\u0631\u0645\u0648\u062f: \u00ab\u062e\u0634\u0645\u06af\u06cc\u0646 \u0645\u0634\u0648\u00bb.",
        "Q\u0647\u0631 \u06a9\u0647 \u0628\u0631 \u062e\u062f\u0627 \u062a\u0648\u06a9\u0644 \u06a9\u0646\u062f\u060c \u062e\u062f\u0627 \u0627\u0648 \u0631\u0627 \u06a9\u0627\u0641\u06cc \u0627\u0633\u062a.",
        "H\u0646\u0634\u0627\u0646\u0647\u0654 \u0645\u0646\u0627\u0641\u0642 \u0633\u0647 \u0686\u06cc\u0632 \u0627\u0633\u062a: \u0633\u062e\u0646 \u0645\u06cc\u200c\u06af\u0648\u06cc\u062f \u062f\u0631\u0648\u063a \u0645\u06cc\u200c\u06af\u0648\u06cc\u062f\u060c \u0648\u0639\u062f\u0647 \u0645\u06cc\u200c\u062f\u0647\u062f \u062e\u0644\u0627\u0641 \u0645\u06cc\u200c\u06a9\u0646\u062f\u060c \u0627\u0645\u0627\u0646\u062a \u0628\u0647 \u0627\u0648 \u0633\u067e\u0631\u062f\u0647 \u0634\u0648\u062f \u062e\u06cc\u0627\u0646\u062a \u0645\u06cc\u200c\u06a9\u0646\u062f.",
        "Q\u062e\u062f\u0627 \u0631\u0627 \u0628\u0633\u06cc\u0627\u0631 \u06cc\u0627\u062f \u06a9\u0646\u06cc\u062f \u062a\u0627 \u0631\u0633\u062a\u06af\u0627\u0631 \u0634\u0648\u06cc\u062f.",
        "H\u0631\u0627\u0633\u062a\u06af\u0648\u06cc\u06cc \u0628\u0647 \u0646\u06cc\u06a9\u06cc \u0631\u0627\u0647 \u0645\u06cc\u200c\u0628\u0631\u062f \u0648 \u0646\u06cc\u06a9\u06cc \u0628\u0647 \u0628\u0647\u0634\u062a \u0645\u06cc\u200c\u0631\u0633\u0627\u0646\u062f.",
        "Q\u0627\u0632 \u0622\u0646\u0686\u0647 \u062f\u0631 \u0632\u0645\u06cc\u0646 \u062d\u0644\u0627\u0644 \u0648 \u067e\u0627\u06a9\u06cc\u0632\u0647 \u0627\u0633\u062a \u0628\u062e\u0648\u0631\u06cc\u062f.",
        "H\u062f\u0631 \u062f\u0646\u06cc\u0627 \u0686\u0646\u0627\u0646 \u0628\u0627\u0634 \u06a9\u0647 \u06af\u0648\u06cc\u06cc \u063a\u0631\u06cc\u0628\u06cc \u06cc\u0627 \u0631\u0647\u06af\u0630\u0631\u06cc.",
        "Q\u0628\u06af\u0648: \u0622\u06cc\u0627 \u0622\u0646\u0627\u0646 \u06a9\u0647 \u0645\u06cc\u200c\u062f\u0627\u0646\u0646\u062f \u0628\u0627 \u0622\u0646\u0627\u0646 \u06a9\u0647 \u0646\u0645\u06cc\u200c\u062f\u0627\u0646\u0646\u062f \u0628\u0631\u0627\u0628\u0631\u0646\u062f\u061f",
        "H\u062f\u0648 \u0646\u0639\u0645\u062a \u0627\u0633\u062a \u06a9\u0647 \u0628\u0633\u06cc\u0627\u0631\u06cc \u0627\u0632 \u0645\u0631\u062f\u0645 \u062f\u0631 \u0622\u0646 \u0632\u06cc\u0627\u0646 \u0645\u06cc\u200c\u0628\u06cc\u0646\u0646\u062f: \u062a\u0646\u062f\u0631\u0633\u062a\u06cc \u0648 \u0641\u0631\u0627\u063a\u062a.",
        "Q\u0628\u06af\u0648: \u067e\u0631\u0648\u0631\u062f\u06af\u0627\u0631\u0627\u060c \u062f\u0627\u0646\u0634\u0645 \u0631\u0627 \u0628\u06cc\u0641\u0632\u0627.",
        "H\u062b\u0631\u0648\u062a \u0648\u0627\u0642\u0639\u06cc \u0628\u0647 \u062f\u0627\u0634\u062a\u0646 \u0645\u0627\u0644 \u0641\u0631\u0627\u0648\u0627\u0646 \u0646\u06cc\u0633\u062a\u061b \u062b\u0631\u0648\u062a \u0648\u0627\u0642\u0639\u06cc \u0628\u06cc\u200c\u0646\u06cc\u0627\u0632\u06cc \u062f\u0644 \u0627\u0633\u062a.",
        "Q\u0628\u0627 \u0631\u0627\u0633\u062a\u06af\u0648\u06cc\u0627\u0646 \u0628\u0627\u0634\u06cc\u062f.",
        "H\u0622\u0646\u0686\u0647 \u062a\u0648 \u0631\u0627 \u0628\u0647 \u062a\u0631\u062f\u06cc\u062f \u0645\u06cc\u200c\u0627\u0646\u062f\u0627\u0632\u062f \u0631\u0647\u0627 \u06a9\u0646 \u0648 \u0628\u0647 \u0633\u0631\u0627\u063a \u0622\u0646\u0686\u0647 \u062f\u0631 \u0622\u0646 \u062a\u0631\u062f\u06cc\u062f \u0646\u06cc\u0633\u062a \u0628\u0631\u0648.",
        "Q\u0622\u0646\u0627\u0646 \u06a9\u0647 \u062e\u0634\u0645 \u062e\u0648\u062f \u0631\u0627 \u0641\u0631\u0648 \u0645\u06cc\u200c\u062e\u0648\u0631\u0646\u062f \u0648 \u0627\u0632 \u0645\u0631\u062f\u0645 \u062f\u0631\u0645\u06cc\u200c\u06af\u0630\u0631\u0646\u062f\u060c \u0646\u06cc\u06a9\u0648\u06a9\u0627\u0631\u0627\u0646\u0646\u062f \u0648 \u062e\u062f\u0627 \u0646\u06cc\u06a9\u0648\u06a9\u0627\u0631\u0627\u0646 \u0631\u0627 \u062f\u0648\u0633\u062a \u062f\u0627\u0631\u062f.",
        "H\u0627\u0632 \u062e\u0648\u0628\u06cc\u0650 \u0627\u0633\u0644\u0627\u0645 \u0622\u062f\u0645\u06cc \u0627\u06cc\u0646 \u0627\u0633\u062a \u06a9\u0647 \u06a9\u0627\u0631\u06cc \u0631\u0627 \u06a9\u0647 \u0628\u0647 \u0627\u0648 \u0645\u0631\u0628\u0648\u0637 \u0646\u06cc\u0633\u062a \u0631\u0647\u0627 \u06a9\u0646\u062f.",
        "Q\u062f\u0631 \u0632\u0645\u06cc\u0646 \u0628\u0627 \u062a\u06a9\u0628\u0631 \u0631\u0627\u0647 \u0645\u0631\u0648\u061b \u062e\u062f\u0627 \u0647\u06cc\u0686 \u0645\u062a\u06a9\u0628\u0631 \u062e\u0648\u062f\u0633\u062a\u0627\u06cc\u06cc \u0631\u0627 \u062f\u0648\u0633\u062a \u0646\u062f\u0627\u0631\u062f.",
        "H\u0645\u062d\u0628\u0648\u0628\u200c\u062a\u0631\u06cc\u0646 \u0639\u0645\u0644 \u0646\u0632\u062f \u062e\u062f\u0627\u060c \u0646\u0645\u0627\u0632 \u062f\u0631 \u0648\u0642\u062a\u0634 \u0627\u0633\u062a.",
        "Q\u0647\u0631 \u06a9\u0647 \u06a9\u0627\u0631 \u0634\u0627\u06cc\u0633\u062a\u0647 \u06a9\u0646\u062f\u060c \u0645\u0631\u062f \u0628\u0627\u0634\u062f \u06cc\u0627 \u0632\u0646\u060c \u062f\u0631 \u062d\u0627\u0644\u06cc \u06a9\u0647 \u0645\u0624\u0645\u0646 \u0627\u0633\u062a\u060c \u0628\u0647 \u0627\u0648 \u0632\u0646\u062f\u06af\u06cc \u067e\u0627\u06a9\u06cc\u0632\u0647 \u0645\u06cc\u200c\u062f\u0647\u06cc\u0645.",
        "H\u0647\u0631 \u06a9\u0647 \u062f\u0631 \u0628\u0631\u0622\u0648\u0631\u062f\u0646 \u0646\u06cc\u0627\u0632 \u0628\u0631\u0627\u062f\u0631\u0634 \u0628\u06a9\u0648\u0634\u062f\u060c \u062e\u062f\u0627 \u0646\u06cc\u0627\u0632 \u0627\u0648 \u0631\u0627 \u0628\u0631\u0622\u0648\u0631\u062f\u0647 \u0645\u06cc\u200c\u06a9\u0646\u062f.",
        "Q\u067e\u0631\u0648\u0631\u062f\u06af\u0627\u0631\u0627\u060c \u062f\u0631 \u062f\u0646\u06cc\u0627 \u0628\u0647 \u0645\u0627 \u0646\u06cc\u06a9\u06cc \u062f\u0647 \u0648 \u062f\u0631 \u0622\u062e\u0631\u062a \u0646\u06cc\u06a9\u06cc \u062f\u0647 \u0648 \u0645\u0627 \u0631\u0627 \u0627\u0632 \u0639\u0630\u0627\u0628 \u0622\u062a\u0634 \u0646\u06af\u0647 \u062f\u0627\u0631.",
        "H\u0647\u0631 \u06a9\u0647 \u0639\u06cc\u0628 \u0645\u0633\u0644\u0645\u0627\u0646\u06cc \u0631\u0627 \u0628\u067e\u0648\u0634\u0627\u0646\u062f\u060c \u062e\u062f\u0627 \u062f\u0631 \u062f\u0646\u06cc\u0627 \u0648 \u0622\u062e\u0631\u062a \u0639\u06cc\u0628 \u0627\u0648 \u0631\u0627 \u0645\u06cc\u200c\u067e\u0648\u0634\u0627\u0646\u062f.",
        "H\u0647\u06cc\u0686 \u06a9\u0627\u0631 \u0646\u06cc\u06a9\u06cc \u0631\u0627 \u06a9\u0648\u0686\u06a9 \u0645\u0634\u0645\u0627\u0631\u060c \u062d\u062a\u06cc \u0627\u06cc\u0646\u06a9\u0647 \u0628\u0631\u0627\u062f\u0631\u062a \u0631\u0627 \u0628\u0627 \u0686\u0647\u0631\u0647\u0654 \u06af\u0634\u0627\u062f\u0647 \u0628\u0628\u06cc\u0646\u06cc.",
        "H\u0627\u06cc\u0645\u0627\u0646 \u0634\u0627\u062e\u0647\u200c\u0647\u0627\u06cc \u0628\u0633\u06cc\u0627\u0631 \u062f\u0627\u0631\u062f\u061b \u0628\u0631\u062a\u0631\u06cc\u0646\u0634 \u06af\u0641\u062a\u0646 \u00ab\u0644\u0627 \u0627\u0644\u0647 \u0627\u0644\u0627 \u0627\u0644\u0644\u0647\u00bb \u0648 \u06a9\u0645\u062a\u0631\u06cc\u0646\u0634 \u0628\u0631\u062f\u0627\u0634\u062a\u0646 \u0622\u0632\u0627\u0631 \u0627\u0632 \u0633\u0631 \u0631\u0627\u0647 \u0627\u0633\u062a \u0648 \u062d\u06cc\u0627 \u0646\u06cc\u0632 \u0634\u0627\u062e\u0647\u200c\u0627\u06cc \u0627\u0632 \u0627\u06cc\u0645\u0627\u0646 \u0627\u0633\u062a.",
        "H\u0633\u062e\u0646 \u067e\u0627\u06a9 \u0648 \u0646\u06cc\u06a9\u0648 \u0635\u062f\u0642\u0647 \u0627\u0633\u062a."
    };

    /** index of the prayer for the lesson (sunrise / sunset have no lesson); -1 = none */
    static int lessonKeyIndex(String k) {
        if ("fajr".equals(k)) return 0;
        if ("dhuhr".equals(k)) return 1;
        if ("asr".equals(k)) return 2;
        if ("maghrib".equals(k)) return 3;
        if ("isha".equals(k)) return 4;
        return -1;
    }

    static PendingIntent lessonPending(Context ctx, long t, String key) {
        Intent i = new Intent(ctx, AzanReceiver.class);
        i.setAction(ACTION_LESSON);
        i.putExtra("t", t);
        i.putExtra("k", key == null ? "" : key);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        return PendingIntent.getBroadcast(ctx, 4736, i, flags);
    }

    /** Next lesson moment (azan + LESSON_DELAY_MS) from the saved 30-day list: {time, key}. */
    static Object[] nextLesson(Context ctx) {
        try {
            SharedPreferences p = prefs(ctx);
            JSONArray arr = new JSONArray(p.getString("items", "[]"));
            long last = p.getLong("last_lesson_fired", 0);
            long now = System.currentTimeMillis();
            long bestT = 0;
            String bestKey = "";
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                String k = o.optString("k", "");
                if (lessonKeyIndex(k) < 0) continue;
                long az = o.optLong("t", 0);
                if (az <= 0) continue;
                long t = az + LESSON_DELAY_MS;
                if (t == last) continue;
                if (t < now - LESSON_MAX_LATE_MS) continue;
                if (bestT == 0 || t < bestT) { bestT = t; bestKey = k; }
            }
            if (bestT == 0) return null;
            return new Object[] { Long.valueOf(bestT), bestKey };
        } catch (Throwable ignore) { return null; }
    }

    /** Arms ONE alarm for the next lesson (independent of the azan sound; replaces the previous one). */
    static void armLesson(Context ctx, AlarmManager am) {
        try { am.cancel(lessonPending(ctx, 0, "")); } catch (Throwable ignore) { }
        if (!prefs(ctx).getBoolean("enabled", true)) return;
        Object[] nx = nextLesson(ctx);
        if (nx == null) return;
        long at = ((Long) nx[0]).longValue();
        PendingIntent pi = lessonPending(ctx, at, (String) nx[1]);
        try {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        } catch (Throwable e) {
            try { am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi); } catch (Throwable ignore) { }
        }
    }

    /** Top-of-screen (heads-up) notification with a very short lesson. No sound, short vibration, no tap action, swipe to dismiss. */
    static void postLesson(Context ctx, String key, long t) {
        try {
            int pidx = lessonKeyIndex(key);
            if (pidx < 0 || LESSONS.length == 0) return;
            long day = (t + java.util.TimeZone.getDefault().getOffset(t)) / 86400000L;
            int idx = (int) ((day * 5L + pidx) % LESSONS.length);
            String raw = LESSONS[idx];
            boolean quran = raw.startsWith("Q");
            String body = raw.substring(1);
            String title = quran ? "\u062f\u0631\u0633\u06cc \u0627\u0632 \u0642\u0631\u0622\u0646" : "\u062f\u0631\u0633\u06cc \u0627\u0632 \u062d\u062f\u06cc\u062b";
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(LESSON_CH) == null) {
                NotificationChannel ch = new NotificationChannel(LESSON_CH, "\u062f\u0631\u0633 \u06a9\u0648\u062a\u0627\u0647 \u0628\u0639\u062f \u0627\u0632 \u0646\u0645\u0627\u0632", NotificationManager.IMPORTANCE_HIGH);
                ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                ch.setSound(null, null);
                ch.enableVibration(true);
                ch.setVibrationPattern(new long[] { 0, 250 });
                nm.createNotificationChannel(ch);
            }
            String pkg = ctx.getPackageName();
            int small = ctx.getResources().getIdentifier("ic_stat_azan", "drawable", pkg);
            if (small == 0) small = ctx.getApplicationInfo().icon;
            NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, LESSON_CH)
                .setSmallIcon(small)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOnlyAlertOnce(true)
                .setWhen(System.currentTimeMillis())
                .setAutoCancel(true)
                .setTimeoutAfter(15L * 60L * 1000L);
            nm.notify(LESSON_NOTIF_ID, b.build());
            logEvent(ctx, "LESSON notification shown: " + key + " #" + idx);
        } catch (Throwable e) {
            logEvent(ctx, "LESSON notification failed: " + e);
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
