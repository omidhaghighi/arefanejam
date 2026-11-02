package com.arefanejam.quran;

import android.app.Notification;
import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.service.notification.StatusBarNotification;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * مرکز اعلان داخل اپ: هر اعلانی که اپ می‌سازد (اعلان‌ها و خبرها، وقت نماز، درس بعد از نماز) همین‌جا هم ثبت می‌شود.
 * وقتی کاربر اپ را باز می‌کند، اعلان‌های معمولیِ باقی‌مانده در پردهٔ اعلان (و در نتیجه عددِ نشان روی آیکون اپ) پاک می‌شوند،
 * ولی همه‌شان در «🔔 اعلان‌ها» داخل اپ می‌مانند و با یک لمس به همان بخش می‌روند.
 */
final class NotifCenter {
    private static final String PREF = "aref_notifc";
    private static final String KEY = "items";
    private static final int MAX = 80;
    private static final long KEEP_MS = 14L * 24L * 3600L * 1000L;

    private NotifCenter() { }

    private static SharedPreferences sp(Context c) { return c.getApplicationContext().getSharedPreferences(PREF, Context.MODE_PRIVATE); }

    private static JSONArray load(Context c) {
        try { return new JSONArray(sp(c).getString(KEY, "[]")); } catch (Throwable t) { return new JSONArray(); }
    }

    private static void save(Context c, JSONArray a) {
        try { sp(c).edit().putString(KEY, a.toString()).apply(); } catch (Throwable ignore) { }
    }

    /** یک اعلان را ثبت می‌کند. uid تکراری دوباره ثبت نمی‌شود. */
    static synchronized void add(Context c, String kind, String uid, String title, String body, String link, long ts) {
        try {
            if (c == null) return;
            if (uid == null || uid.length() == 0) uid = kind + ":" + ts;
            JSONArray old = load(c);
            long now = System.currentTimeMillis();
            JSONArray out = new JSONArray();
            JSONObject it = new JSONObject();
            it.put("id", uid);
            it.put("kind", kind == null ? "other" : kind);
            it.put("title", title == null ? "" : title);
            it.put("body", body == null ? "" : body);
            it.put("link", link == null ? "" : link);
            it.put("ts", ts > 0 ? ts : now);
            it.put("read", false);
            out.put(it);
            for (int i = 0; i < old.length() && out.length() < MAX; i++) {
                JSONObject o = old.optJSONObject(i);
                if (o == null) continue;
                if (uid.equals(o.optString("id"))) continue;
                if (now - o.optLong("ts", 0) > KEEP_MS) continue;
                out.put(o);
            }
            save(c, out);
        } catch (Throwable ignore) { }
    }

    static synchronized String listJson(Context c) { return load(c).toString(); }

    static synchronized int unread(Context c) {
        JSONArray a = load(c);
        int n = 0;
        for (int i = 0; i < a.length(); i++) { JSONObject o = a.optJSONObject(i); if (o != null && !o.optBoolean("read", false)) n++; }
        return n;
    }

    static synchronized void markAllRead(Context c) {
        try {
            JSONArray a = load(c);
            for (int i = 0; i < a.length(); i++) { JSONObject o = a.optJSONObject(i); if (o != null) o.put("read", true); }
            save(c, a);
        } catch (Throwable ignore) { }
    }

    static synchronized void markRead(Context c, String id) {
        try {
            JSONArray a = load(c);
            for (int i = 0; i < a.length(); i++) { JSONObject o = a.optJSONObject(i); if (o != null && id.equals(o.optString("id"))) o.put("read", true); }
            save(c, a);
        } catch (Throwable ignore) { }
    }

    static synchronized void remove(Context c, String id) {
        try {
            JSONArray a = load(c);
            JSONArray out = new JSONArray();
            for (int i = 0; i < a.length(); i++) { JSONObject o = a.optJSONObject(i); if (o != null && !id.equals(o.optString("id"))) out.put(o); }
            save(c, out);
        } catch (Throwable ignore) { }
    }

    static synchronized void clear(Context c) { save(c, new JSONArray()); }

    /**
     * اپ جلوی چشم آمد: اعلان‌های معمولیِ اپ را از پرده برمی‌دارد (عدد نشان آیکون هم صفر می‌شود).
     * اعلان‌های ماندگار (کارت ثابت تاریخ، پخش اذان، اعلان اجباری «خواندم») دست‌نخورده می‌مانند.
     */
    static void clearShade(Context c) {
        try {
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            if (Build.VERSION.SDK_INT < 23) return;
            StatusBarNotification[] act = nm.getActiveNotifications();
            if (act == null) return;
            for (int i = 0; i < act.length; i++) {
                StatusBarNotification s = act[i];
                Notification n = s.getNotification();
                if (n == null) continue;
                if ((n.flags & Notification.FLAG_ONGOING_EVENT) != 0) continue;
                if ((n.flags & Notification.FLAG_FOREGROUND_SERVICE) != 0) continue;
                if (s.getId() == UpdateJobService.FU_NOTIF_ID) continue;
                nm.cancel(s.getTag(), s.getId());
            }
        } catch (Throwable ignore) { }
    }
}
