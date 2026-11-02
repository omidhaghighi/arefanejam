package com.arefanejam.quran;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.Bundle;
import android.util.Base64;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/** مدیریت ابزارک‌های صفحهٔ اصلی گوشی: داده، تنظیم هر ابزارک، رسم، لمس‌ها و بروزرسانی دوره‌ای. */
final class WidgetHub {
    private WidgetHub() { }

    static final String PREF = "aref_widgets";
    static final String ACTION_TICK = "com.arefanejam.quran.WIDGET_TICK";
    static final String[] NAMES = { "cal", "quran", "wx", "azan", "month", "date", "rem", "count" };
    static final String[] CLS = { "AwCal", "AwQuran", "AwWx", "AwAzan", "AwMonth", "AwDate", "AwRem", "AwCount" };

    static SharedPreferences sp(Context c) { return c.getApplicationContext().getSharedPreferences(PREF, Context.MODE_PRIVATE); }

    static void saveData(Context c, String json) {
        try { new JSONObject(json); sp(c).edit().putString("data", json).apply(); } catch (Throwable ignore) { }
    }

    static JSONObject data(Context c) {
        JSONObject d;
        try { d = new JSONObject(sp(c).getString("data", "{}")); } catch (Throwable t) { d = new JSONObject(); }
        try { String j = sp(c).getString("wxj", ""); if (j.length() > 0) d.put("wxj", new JSONObject(j)); } catch (Throwable ignore) { }
        return d;
    }

    static JSONObject cfg(Context c, int id) {
        try { return new JSONObject(sp(c).getString("cfg_" + id, "{}")); } catch (Throwable t) { return new JSONObject(); }
    }

    static void saveCfg(Context c, int id, JSONObject o) { sp(c).edit().putString("cfg_" + id, o.toString()).apply(); }

    static void dropCfg(Context c, int[] ids) {
        SharedPreferences.Editor e = sp(c).edit();
        for (int i = 0; i < ids.length; i++) e.remove("cfg_" + ids[i]);
        e.apply();
    }

    static String typeOf(Context c, int id) {
        try {
            AppWidgetManager m = AppWidgetManager.getInstance(c);
            String cn = m.getAppWidgetInfo(id).provider.getClassName();
            for (int i = 0; i < CLS.length; i++) if (cn.endsWith("." + CLS[i])) return NAMES[i];
        } catch (Throwable ignore) { }
        return "cal";
    }

    static int installedCount(Context c) {
        int n = 0;
        try {
            AppWidgetManager m = AppWidgetManager.getInstance(c);
            for (int i = 0; i < CLS.length; i++) n += m.getAppWidgetIds(new ComponentName(c.getPackageName(), c.getPackageName() + "." + CLS[i])).length;
        } catch (Throwable ignore) { }
        return n;
    }

    static void refreshAll(Context c) {
        try {
            AppWidgetManager m = AppWidgetManager.getInstance(c);
            for (int i = 0; i < CLS.length; i++) {
                int[] ids = m.getAppWidgetIds(new ComponentName(c.getPackageName(), c.getPackageName() + "." + CLS[i]));
                for (int k = 0; k < ids.length; k++) update(c, m, ids[k], NAMES[i]);
            }
        } catch (Throwable ignore) { }
    }

    /** منطقهٔ لمس: ۱۶ خانه (۴ سطر × ۴ ستون، ستون ۰ = چپ). مقدار هر خانه JSON مقصد است. */
    private static String[] cells(String type) {
        String[] r = new String[16];
        String azan = "{\"tab\":\"azan\"}";
        if ("cal".equals(type)) { for (int i = 0; i < 16; i++) r[i] = i < 8 ? azan : "{\"tab\":\"notes\"}"; }
        else if ("quran".equals(type)) {
            String[] go = { "{\"tab\":\"quran-bookmarks\"}", "{\"tab\":\"quran-search\"}", "{\"tab\":\"quran-list\"}", "{\"q\":\"resume\"}" };
            for (int i = 0; i < 16; i++) r[i] = go[i % 4];
        } else {
            String g = "wx".equals(type) ? "{\"go\":\"weather\"}" : ("rem".equals(type) ? "{\"tab\":\"notes\"}" : ("count".equals(type) ? "{\"tab\":\"ramadan-countdown\"}" : ("month".equals(type) ? "{\"tab\":\"date-converter\"}" : azan)));
            for (int i = 0; i < 16; i++) r[i] = g;
        }
        return r;
    }

    private static int rid(Context c, String name, String kind) { return c.getResources().getIdentifier(name, kind, c.getPackageName()); }

    static void update(Context c, AppWidgetManager m, int id, String type) {
        try {
            Bundle o = m.getAppWidgetOptions(id);
            float dens = c.getResources().getDisplayMetrics().density;
            int wdp = o != null ? o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0) : 0;
            int hdp = o != null ? o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0) : 0;
            if (wdp < 40) wdp = 250;
            if (hdp < 40) hdp = 110;
            float w = wdp * dens, h = hdp * dens;
            float k = Math.min(1f, 720f / Math.max(w, h));
            int wi = Math.max(160, Math.round(w * k)), hi = Math.max(80, Math.round(h * k));
            Bitmap bm = WidgetRender.render(type, wi, hi, data(c), cfg(c, id), System.currentTimeMillis());
            RemoteViews rv = new RemoteViews(c.getPackageName(), rid(c, "aref_widget", "layout"));
            rv.setImageViewBitmap(rid(c, "aw_img", "id"), bm);
            Intent launch = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
            String[] cl = cells(type);
            if (launch != null) {
                int fl = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
                for (int i = 0; i < 16; i++) {
                    Intent it = new Intent(launch);
                    it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                    it.putExtra("aref_go", cl[i]);
                    PendingIntent pi = PendingIntent.getActivity(c, 100000 + (id % 5000) * 20 + i, it, fl);
                    int vid = rid(c, "aw_c" + (i / 4) + (i % 4), "id");
                    if (vid != 0) rv.setOnClickPendingIntent(vid, pi);
                }
            }
            m.updateAppWidget(id, rv);
        } catch (Throwable ignore) { }
    }

    /* ---------- بروزرسانی دوره‌ای (هر ~۱۵ دقیقه، بدون نیاز به باز بودن اپ) ---------- */
    static void scheduleTick(Context c) {
        try {
            AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
            if (am == null || installedCount(c) == 0) return;
            Intent it = new Intent(c, WidgetTickReceiver.class);
            it.setAction(ACTION_TICK);
            int fl = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
            PendingIntent pi = PendingIntent.getBroadcast(c, 7311, it, fl);
            long at = System.currentTimeMillis() + 15L * 60L * 1000L;
            if (Build.VERSION.SDK_INT >= 23) am.setAndAllowWhileIdle(AlarmManager.RTC, at, pi); else am.set(AlarmManager.RTC, at, pi);
        } catch (Throwable ignore) { }
    }

    /** آب‌وهوا را (حداکثر ساعتی یک بار) از Open-Meteo می‌گیرد؛ از همان مختصات اپ. باید روی رشتهٔ پس‌زمینه صدا زده شود. */
    static void fetchWeather(Context c) {
        try {
            JSONObject d = data(c);
            JSONObject w = d.optJSONObject("wx");
            if (w == null || !w.has("lat") || !w.has("lng")) return;
            long last = sp(c).getLong("wx_try", 0);
            if (System.currentTimeMillis() - last < 50L * 60L * 1000L) return;
            sp(c).edit().putLong("wx_try", System.currentTimeMillis()).apply();
            URL u = new URL("https://api.open-meteo.com/v1/forecast?latitude=" + w.optDouble("lat") + "&longitude=" + w.optDouble("lng") + "&current=temperature_2m,weather_code&timezone=auto");
            HttpURLConnection cn = (HttpURLConnection) u.openConnection();
            cn.setConnectTimeout(8000); cn.setReadTimeout(10000);
            if (cn.getResponseCode() != 200) return;
            InputStream in = cn.getInputStream();
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[4096]; int n;
            while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
            in.close();
            JSONObject cur = new JSONObject(bo.toString("UTF-8")).optJSONObject("current");
            if (cur == null) return;
            JSONObject out = new JSONObject();
            out.put("temp", cur.optDouble("temperature_2m", 0));
            out.put("code", cur.optInt("weather_code", 0));
            out.put("ts", System.currentTimeMillis());
            sp(c).edit().putString("wxj", out.toString()).apply();
        } catch (Throwable ignore) { }
    }

    /* ---------- افزودن به صفحهٔ اصلی ---------- */
    static String pin(Context c, String type) {
        try {
            int idx = -1;
            for (int i = 0; i < NAMES.length; i++) if (NAMES[i].equals(type)) idx = i;
            if (idx < 0) return "bad";
            if (Build.VERSION.SDK_INT < 26) return "unsupported";
            AppWidgetManager m = AppWidgetManager.getInstance(c);
            if (!m.isRequestPinAppWidgetSupported()) return "unsupported";
            m.requestPinAppWidget(new ComponentName(c.getPackageName(), c.getPackageName() + "." + CLS[idx]), null, null);
            return "requested";
        } catch (Throwable t) { return "unsupported"; }
    }

    static String previewBase64(Context c, String type, int w, int h) {
        try {
            JSONObject cf = new JSONObject();
            Bitmap bm = WidgetRender.render(type, w, h, data(c), cf, System.currentTimeMillis());
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            bm.compress(Bitmap.CompressFormat.PNG, 90, bo);
            return "data:image/png;base64," + Base64.encodeToString(bo.toByteArray(), Base64.NO_WRAP);
        } catch (Throwable t) { return ""; }
    }
}
