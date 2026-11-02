package com.arefanejam.quran;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Typeface;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;
import java.util.GregorianCalendar;
import java.util.TimeZone;

/** رسم ابزارک‌ها روی بوم (Canvas)؛ همان روشی که کارت ثابت اعلان‌ها دارد. هیچ فایل XML پیچیده‌ای لازم نیست. */
final class WidgetRender {
    private WidgetRender() { }

    static final String[] TYPES = { "cal", "quran", "wx", "azan", "month", "date", "rem", "count" };
    static final String[] J_MONTHS = { "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند" };
    static final String[] WEEK = { "شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه" };
    static final String[] WEEK1 = { "ش", "ی", "د", "س", "چ", "پ", "ج" };
    static final String[] G_MONTHS = { "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec" };

    /* ---------------- تاریخ جلالی ---------------- */
    static int[] g2j(int gy, int gm, int gd) {
        int[] gdm = { 0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334 };
        int gy2 = gm > 2 ? gy + 1 : gy;
        int days = 355666 + 365 * gy + (gy2 + 3) / 4 - (gy2 + 99) / 100 + (gy2 + 399) / 400 + gd + gdm[gm - 1];
        int jy = -1595 + 33 * (days / 12053);
        days %= 12053;
        jy += 4 * (days / 1461);
        days %= 1461;
        if (days > 365) { jy += (days - 1) / 365; days = (days - 1) % 365; }
        int jm = days < 186 ? 1 + days / 31 : 7 + (days - 186) / 30;
        int jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
        return new int[] { jy, jm, jd };
    }

    static int[] j2g(int jy, int jm, int jd) {
        jy += 1595;
        int days = -355668 + 365 * jy + (jy / 33) * 8 + ((jy % 33) + 3) / 4 + jd + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
        int gy = 400 * (days / 146097);
        days %= 146097;
        if (days > 36524) {
            days--;
            gy += 100 * (days / 36524);
            days %= 36524;
            if (days >= 365) days++;
        }
        gy += 4 * (days / 1461);
        days %= 1461;
        if (days > 365) { gy += (days - 1) / 365; days = (days - 1) % 365; }
        int gd = days + 1;
        int[] sal = { 0, 31, ((gy % 4 == 0 && gy % 100 != 0) || gy % 400 == 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 };
        int gm = 0;
        while (gm < 13 && gd > sal[gm]) { gd -= sal[gm]; gm++; }
        return new int[] { gy, gm, gd };
    }

    static int jMonthLen(int jy, int jm) {
        if (jm <= 6) return 31;
        if (jm <= 11) return 30;
        int[] a = j2g(jy, 12, 1);
        int[] b = j2g(jy + 1, 1, 1);
        GregorianCalendar c1 = new GregorianCalendar(TimeZone.getTimeZone("UTC")); c1.clear(); c1.set(a[0], a[1] - 1, a[2]);
        GregorianCalendar c2 = new GregorianCalendar(TimeZone.getTimeZone("UTC")); c2.clear(); c2.set(b[0], b[1] - 1, b[2]);
        return (int) Math.round((c2.getTimeInMillis() - c1.getTimeInMillis()) / 86400000.0);
    }

    /** ایندکس روز هفته: شنبه = ۰ … جمعه = ۶ */
    static int weekIdx(Calendar c) { return (c.get(Calendar.DAY_OF_WEEK) + 7 - Calendar.SATURDAY) % 7; }

    static String fa(String s) {
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < s.length(); i++) { char ch = s.charAt(i); b.append(ch >= '0' && ch <= '9' ? (char) ('۰' + (ch - '0')) : ch); }
        return b.toString();
    }

    static String hm(long t) {
        Calendar c = Calendar.getInstance(); c.setTimeInMillis(t);
        return fa(String.format("%02d:%02d", c.get(Calendar.HOUR_OF_DAY), c.get(Calendar.MINUTE)));
    }

    static String jDateLong(Calendar c) {
        int[] j = g2j(c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH));
        return WEEK[weekIdx(c)] + " " + fa(String.valueOf(j[2])) + " " + J_MONTHS[j[1] - 1] + " " + fa(String.valueOf(j[0]));
    }

    static String remain(long ms) {
        long m = Math.max(0, ms) / 60000L;
        long h = m / 60, mm = m % 60;
        if (h <= 0) return fa(mm + " دقیقه");
        return fa(h + " ساعت" + (mm > 0 ? " و " + mm + " دقیقه" : ""));
    }

    /* ---------------- تم ---------------- */
    static final class Th { int bg, head, fg, sub, accent, hfg, line; }

    static Th theme(String name, int alphaPct) {
        Th t = new Th();
        int a = Math.max(20, Math.min(100, alphaPct)) * 255 / 100;
        if ("light".equals(name)) { t.bg = 0xF8F6EE; t.head = 0x1E7A5F; t.fg = 0xFF1B2B27; t.sub = 0xFF5E6B66; t.accent = 0xFFB8860B; t.hfg = 0xFFFFFFFF; t.line = 0x33000000; }
        else if ("dark".equals(name)) { t.bg = 0x1B1B1F; t.head = 0x2A2A31; t.fg = 0xFFF2F2F2; t.sub = 0xFFA9ADB3; t.accent = 0xFF6FD3A8; t.hfg = 0xFFFFFFFF; t.line = 0x33FFFFFF; }
        else if ("glass".equals(name)) { t.bg = 0x000000; t.head = 0x000000; t.fg = 0xFFFFFFFF; t.sub = 0xFFD8DEDC; t.accent = 0xFFFFD66B; t.hfg = 0xFFFFFFFF; t.line = 0x44FFFFFF; a = Math.min(a, 170); }
        else { t.bg = 0x143C36; t.head = 0x0E2C27; t.fg = 0xFFFFFFFF; t.sub = 0xFFB9D0C9; t.accent = 0xFFE8C872; t.hfg = 0xFFE8C872; t.line = 0x33FFFFFF; }
        t.bg = (a << 24) | t.bg;
        t.head = ("glass".equals(name) ? ((a * 6 / 10) << 24) : (a << 24)) | t.head;
        return t;
    }

    /* ---------------- ابزار رسم ---------------- */
    private static Paint P(int color, float size, boolean bold, Paint.Align al) {
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(color); p.setTextSize(size); p.setTextAlign(al);
        p.setTypeface(bold ? Typeface.DEFAULT_BOLD : Typeface.DEFAULT);
        return p;
    }

    private static void text(Canvas c, String s, float x, float y, float size, int color, boolean bold, Paint.Align al, float maxW) {
        Paint p = P(color, size, bold, al);
        if (maxW > 0) { float w = p.measureText(s); if (w > maxW) p.setTextSize(Math.max(size * 0.55f, size * maxW / w)); w = p.measureText(s); if (w > maxW) { while (s.length() > 2 && p.measureText(s + "…") > maxW) s = s.substring(0, s.length() - 1); s = s + "…"; } }
        c.drawText(s, x, y, p);
    }

    private static void rrect(Canvas c, float l, float t, float r, float b, float rad, int color) {
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG); p.setColor(color);
        c.drawRoundRect(new RectF(l, t, r, b), rad, rad, p);
    }

    private static void line(Canvas c, float x1, float y1, float x2, float y2, int color, float w) {
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG); p.setColor(color); p.setStrokeWidth(w);
        c.drawLine(x1, y1, x2, y2, p);
    }

    private static void base(Canvas c, int w, int h, Th t, float head) {
        float rad = Math.min(w, h) * 0.07f;
        rrect(c, 0, 0, w, h, rad, t.bg);
        if (head > 0) {
            Path path = new Path();
            path.addRoundRect(new RectF(0, 0, w, head), new float[] { rad, rad, rad, rad, 0, 0, 0, 0 }, Path.Direction.CW);
            Paint p = new Paint(Paint.ANTI_ALIAS_FLAG); p.setColor(t.head);
            c.drawPath(path, p);
        }
    }

    /* ---------------- داده ---------------- */
    private static JSONObject o(JSONObject d, String k) { JSONObject x = d.optJSONObject(k); return x == null ? new JSONObject() : x; }
    private static JSONArray arr(JSONObject d, String k) { JSONArray x = d.optJSONArray(k); return x == null ? new JSONArray() : x; }

    /** زمان‌های امروز: ایندکس ۰..۵ برای fajr,sunrise,dhuhr,asr,maghrib,isha (۰ = پیدا نشد) */
    private static final String[] KEYS = { "fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha" };
    private static final String[] LAB = { "صبح", "طلوع", "ظهر", "عصر", "مغرب", "عشا" };

    private static long[] today(JSONObject d, long now) {
        long[] r = new long[6];
        Calendar n = Calendar.getInstance(); n.setTimeInMillis(now);
        JSONArray az = arr(d, "az");
        for (int i = 0; i < az.length(); i++) {
            JSONObject e = az.optJSONObject(i); if (e == null) continue;
            long t = e.optLong("t", 0); if (t <= 0) continue;
            Calendar c = Calendar.getInstance(); c.setTimeInMillis(t);
            if (c.get(Calendar.YEAR) != n.get(Calendar.YEAR) || c.get(Calendar.DAY_OF_YEAR) != n.get(Calendar.DAY_OF_YEAR)) continue;
            String k = e.optString("k");
            for (int j = 0; j < 6; j++) if (KEYS[j].equals(k)) r[j] = t;
        }
        return r;
    }

    /** اذان بعدی (فقط نمازها یا همراه طلوع) */
    private static long[] next(JSONObject d, long now, boolean withSunrise) {
        long best = 0; int bi = -1;
        JSONArray az = arr(d, "az");
        for (int i = 0; i < az.length(); i++) {
            JSONObject e = az.optJSONObject(i); if (e == null) continue;
            long t = e.optLong("t", 0); String k = e.optString("k");
            if (t <= now || (best != 0 && t >= best)) continue;
            int idx = -1; for (int j = 0; j < 6; j++) if (KEYS[j].equals(k)) idx = j;
            if (idx < 0 || (idx == 1 && !withSunrise)) continue;
            best = t; bi = idx;
        }
        return new long[] { best, bi };
    }

    private static String wxText(int code) {
        if (code == 0 || code == 1) return "صاف";
        if (code == 2) return "نیمه‌ابری";
        if (code == 3) return "ابری";
        if (code == 45 || code == 48) return "مه‌آلود";
        if (code >= 51 && code <= 67) return "بارانی";
        if (code >= 71 && code <= 77) return "برفی";
        if (code >= 80 && code <= 82) return "رگبار";
        if (code == 85 || code == 86) return "بارش برف";
        if (code >= 95) return "رعدوبرق";
        return "";
    }

    private static void wxIcon(Canvas c, float cx, float cy, float r, int code, Th t) {
        Paint sun = new Paint(Paint.ANTI_ALIAS_FLAG); sun.setColor(0xFFFFC83D);
        Paint cl = new Paint(Paint.ANTI_ALIAS_FLAG); cl.setColor(0xFFE9EEF2);
        Paint dr = new Paint(Paint.ANTI_ALIAS_FLAG); dr.setColor(0xFF58A6E8); dr.setStrokeWidth(r * 0.12f);
        boolean clear = code <= 1, part = code == 2;
        if (clear || part) c.drawCircle(cx - (part ? r * 0.25f : 0), cy - (part ? r * 0.25f : 0), r * 0.55f, sun);
        if (!clear) {
            c.drawCircle(cx - r * 0.3f, cy + r * 0.1f, r * 0.35f, cl);
            c.drawCircle(cx + r * 0.05f, cy - r * 0.1f, r * 0.42f, cl);
            c.drawCircle(cx + r * 0.4f, cy + r * 0.12f, r * 0.33f, cl);
            c.drawRect(cx - r * 0.3f, cy + r * 0.1f, cx + r * 0.4f, cy + r * 0.45f, cl);
        }
        boolean rain = (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95;
        boolean snow = (code >= 71 && code <= 77) || code == 85 || code == 86;
        if (rain) for (int i = 0; i < 3; i++) c.drawLine(cx - r * 0.3f + i * r * 0.3f, cy + r * 0.55f, cx - r * 0.38f + i * r * 0.3f, cy + r * 0.85f, dr);
        if (snow) { Paint sn = new Paint(Paint.ANTI_ALIAS_FLAG); sn.setColor(0xFFFFFFFF); for (int i = 0; i < 3; i++) c.drawCircle(cx - r * 0.3f + i * r * 0.3f, cy + r * 0.7f, r * 0.07f, sn); }
    }

    /* ---------------- رسم هر نوع ---------------- */
    static Bitmap render(String type, int w, int h, JSONObject data, JSONObject cfg, long now) {
        Bitmap bm = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bm);
        String th = cfg.optString("theme", data.optString("theme", "green"));
        int al = cfg.optInt("alpha", data.optInt("alpha", 100));
        Th t = theme(th, al);
        try {
            if ("cal".equals(type)) cal(c, w, h, t, data, cfg, now);
            else if ("quran".equals(type)) quran(c, w, h, t, data);
            else if ("wx".equals(type)) wx(c, w, h, t, data, now);
            else if ("azan".equals(type)) azan(c, w, h, t, data, now);
            else if ("month".equals(type)) month(c, w, h, t, now);
            else if ("date".equals(type)) date(c, w, h, t, data, now);
            else if ("rem".equals(type)) rem(c, w, h, t, data, cfg, now);
            else if ("count".equals(type)) count(c, w, h, t, data, now);
        } catch (Throwable e) {
            text(c, "ابزارک آماده نیست؛ اپ را یک بار باز کنید", w / 2f, h / 2f, h * 0.12f, t.fg, false, Paint.Align.CENTER, w * 0.9f);
        }
        return bm;
    }

    private static void azanRow(Canvas c, int w, float top, float bot, Th t, long[] td, long now, boolean sun, long nextT) {
        int n = sun ? 6 : 5;
        int[] idx = sun ? new int[] { 0, 1, 2, 3, 4, 5 } : new int[] { 0, 2, 3, 4, 5 };
        float cw = w / (float) n, mid = (top + bot) / 2f, fs = (bot - top) * 0.26f;
        for (int i = 0; i < n; i++) {
            float cx = w - (i + 0.5f) * cw;
            int j = idx[i];
            boolean nx = td[j] > 0 && td[j] == nextT;
            if (nx) rrect(c, cx - cw * 0.46f, top, cx + cw * 0.46f, bot, (bot - top) * 0.2f, (t.accent & 0x00FFFFFF) | 0x33000000);
            text(c, LAB[j], cx, mid - fs * 0.35f, fs, nx ? t.accent : t.sub, nx, Paint.Align.CENTER, cw * 0.9f);
            text(c, td[j] > 0 ? hm(td[j]) : "--:--", cx, mid + fs * 1.15f, fs * 1.1f, nx ? t.accent : t.fg, true, Paint.Align.CENTER, cw * 0.94f);
        }
    }

    private static void cal(Canvas c, int w, int h, Th t, JSONObject d, JSONObject cfg, long now) {
        float head = h * 0.17f;
        base(c, w, h, t, head);
        Calendar n = Calendar.getInstance(); n.setTimeInMillis(now);
        text(c, jDateLong(n), w - w * 0.04f, head * 0.68f, head * 0.5f, t.hfg, true, Paint.Align.RIGHT, w * 0.62f);
        text(c, n.get(Calendar.DAY_OF_MONTH) + " " + G_MONTHS[n.get(Calendar.MONTH)] + " " + n.get(Calendar.YEAR), w * 0.04f, head * 0.68f, head * 0.4f, t.hfg, false, Paint.Align.LEFT, w * 0.3f);
        long[] td = today(d, now);
        long[] nx = next(d, now, false);
        float y1 = head + h * 0.02f, y2 = head + h * 0.27f;
        azanRow(c, w, y1, y2, t, td, now, false, nx[0]);
        if (nx[0] > 0) text(c, remain(nx[0] - now) + " تا اذان " + LAB[(int) nx[1]], w / 2f, y2 + h * 0.065f, h * 0.05f, t.accent, true, Paint.Align.CENTER, w * 0.9f);
        float ly = y2 + h * 0.1f;
        line(c, w * 0.04f, ly, w * 0.96f, ly, t.line, 2);
        text(c, "یادآوری‌ها", w - w * 0.04f, ly + h * 0.07f, h * 0.055f, t.accent, true, Paint.Align.RIGHT, w * 0.5f);
        remList(c, w, ly + h * 0.085f, h - h * 0.02f, t, d, now, 4);
    }

    /** فهرست یادآوری‌ها (امروز و بعد) */
    private static void remList(Canvas c, int w, float top, float bot, Th t, JSONObject d, long now, int maxRows) {
        JSONArray r = arr(d, "rem");
        Calendar n = Calendar.getInstance(); n.setTimeInMillis(now);
        n.set(Calendar.HOUR_OF_DAY, 0); n.set(Calendar.MINUTE, 0); n.set(Calendar.SECOND, 0);
        long day0 = n.getTimeInMillis();
        java.util.ArrayList<JSONObject> use = new java.util.ArrayList<JSONObject>();
        for (int i = 0; i < r.length(); i++) { JSONObject e = r.optJSONObject(i); if (e != null && e.optLong("ts", 0) >= day0) use.add(e); }
        java.util.Collections.sort(use, new java.util.Comparator<JSONObject>() { public int compare(JSONObject a, JSONObject b) { return Long.compare(a.optLong("ts"), b.optLong("ts")); } });
        float rowH = (bot - top) / maxRows;
        if (use.isEmpty()) { text(c, "یادآوری‌ای برای امروز و روزهای بعد ثبت نشده", w / 2f, top + rowH * 0.9f, rowH * 0.5f, t.sub, false, Paint.Align.CENTER, w * 0.9f); return; }
        for (int i = 0; i < use.size() && i < maxRows; i++) {
            JSONObject e = use.get(i);
            long ts = e.optLong("ts");
            long dd = (ts - day0) / 86400000L;
            String when = dd == 0 ? "امروز" : (dd == 1 ? "فردا" : fa(dd + " روز بعد"));
            float y = top + rowH * (i + 0.72f);
            text(c, e.optString("t", "").replace('\n', ' '), w - w * 0.04f, y, rowH * 0.48f, t.fg, false, Paint.Align.RIGHT, w * 0.62f);
            text(c, when + " " + hm(ts), w * 0.04f, y, rowH * 0.42f, t.accent, false, Paint.Align.LEFT, w * 0.3f);
            if (i < maxRows - 1 && i < use.size() - 1) line(c, w * 0.04f, top + rowH * (i + 1), w * 0.96f, top + rowH * (i + 1), t.line, 1);
        }
    }

    private static void quran(Canvas c, int w, int h, Th t, JSONObject d) {
        base(c, w, h, t, 0);
        JSONObject q = o(d, "q");
        String sub = q.optInt("n", 0) > 0 ? q.optString("name", "") : "";
        String[] ic = { "📖", "📚", "🔍", "🔖" };
        String[] l1 = { "ادامه قرائت", "فهرست سوره‌ها", "جست‌وجو", "نشانه‌ها" };
        String[] l2 = { sub.length() > 0 ? "سورهٔ " + sub : "شروع قرائت", "قرآن کامل", "در آیه‌ها", "آیه‌های ذخیره‌شده" };
        float cw = w / 4f, pad = cw * 0.06f;
        for (int i = 0; i < 4; i++) {
            float cx = w - (i + 0.5f) * cw;
            rrect(c, cx - cw / 2 + pad, h * 0.1f, cx + cw / 2 - pad, h * 0.9f, h * 0.16f, (t.accent & 0x00FFFFFF) | 0x22000000);
            text(c, ic[i], cx, h * 0.46f, h * 0.3f, t.fg, false, Paint.Align.CENTER, cw * 0.9f);
            text(c, l1[i], cx, h * 0.68f, h * 0.15f, t.fg, true, Paint.Align.CENTER, cw * 0.88f);
            text(c, l2[i], cx, h * 0.84f, h * 0.11f, t.sub, false, Paint.Align.CENTER, cw * 0.88f);
        }
    }

    private static void wx(Canvas c, int w, int h, Th t, JSONObject d, long now) {
        base(c, w, h, t, 0);
        JSONObject x = o(d, "wx");
        JSONObject j = o(d, "wxj");
        if (j.optLong("ts", 0) > x.optLong("ts", 0)) { x = j; JSONObject w0 = o(d, "wx"); try { x.put("place", w0.optString("place", "")); } catch (Throwable ignore) { } }
        if (x.length() == 0 || !x.has("temp")) { text(c, "آب‌وهوا", w / 2f, h * 0.45f, h * 0.16f, t.fg, true, Paint.Align.CENTER, w * 0.9f); text(c, "اپ را یک بار باز کنید", w / 2f, h * 0.65f, h * 0.11f, t.sub, false, Paint.Align.CENTER, w * 0.9f); return; }
        int code = x.optInt("code", 0);
        wxIcon(c, w * 0.28f, h * 0.42f, Math.min(w, h) * 0.34f, code, t);
        text(c, fa(String.valueOf(Math.round(x.optDouble("temp", 0)))) + "°", w * 0.94f, h * 0.5f, h * 0.34f, t.fg, true, Paint.Align.RIGHT, w * 0.5f);
        text(c, wxText(code), w * 0.94f, h * 0.68f, h * 0.13f, t.accent, true, Paint.Align.RIGHT, w * 0.5f);
        text(c, x.optString("place", d.optString("city", "")), w / 2f, h * 0.89f, h * 0.12f, t.sub, false, Paint.Align.CENTER, w * 0.9f);
    }

    private static void azan(Canvas c, int w, int h, Th t, JSONObject d, long now) {
        float head = h * 0.26f;
        base(c, w, h, t, head);
        Calendar n = Calendar.getInstance(); n.setTimeInMillis(now);
        text(c, jDateLong(n), w * 0.96f, head * 0.66f, head * 0.46f, t.hfg, true, Paint.Align.RIGHT, w * 0.6f);
        text(c, "اوقات شرعی", w * 0.04f, head * 0.66f, head * 0.4f, t.hfg, false, Paint.Align.LEFT, w * 0.32f);
        long[] td = today(d, now);
        long[] nx = next(d, now, true);
        azanRow(c, w, head + h * 0.04f, h * 0.78f, t, td, now, true, nx[0]);
        if (nx[0] > 0) text(c, remain(nx[0] - now) + " تا " + (nx[1] == 1 ? "طلوع آفتاب" : "اذان " + LAB[(int) nx[1]]), w / 2f, h * 0.92f, h * 0.1f, t.accent, true, Paint.Align.CENTER, w * 0.9f);
    }

    private static void month(Canvas c, int w, int h, Th t, long now) {
        float head = h * 0.14f;
        base(c, w, h, t, head);
        Calendar n = Calendar.getInstance(); n.setTimeInMillis(now);
        int[] j = g2j(n.get(Calendar.YEAR), n.get(Calendar.MONTH) + 1, n.get(Calendar.DAY_OF_MONTH));
        text(c, J_MONTHS[j[1] - 1] + " " + fa(String.valueOf(j[0])), w / 2f, head * 0.7f, head * 0.55f, t.hfg, true, Paint.Align.CENTER, w * 0.7f);
        int[] g1 = j2g(j[0], j[1], 1);
        Calendar f = Calendar.getInstance(); f.clear(); f.set(g1[0], g1[1] - 1, g1[2]);
        int off = weekIdx(f), len = jMonthLen(j[0], j[1]);
        float cw = w / 7f, top = head + h * 0.02f, rh = (h - top - h * 0.02f) / 7f;
        for (int i = 0; i < 7; i++) text(c, WEEK1[i], w - (i + 0.5f) * cw, top + rh * 0.7f, rh * 0.5f, i == 6 ? 0xFFFF6B6B : t.sub, true, Paint.Align.CENTER, cw);
        for (int dd = 1; dd <= len; dd++) {
            int pos = off + dd - 1, row = pos / 7 + 1, col = pos % 7;
            float cx = w - (col + 0.5f) * cw, cy = top + rh * row + rh * 0.5f;
            boolean td = dd == j[2];
            if (td) { Paint p = new Paint(Paint.ANTI_ALIAS_FLAG); p.setColor(t.accent); c.drawCircle(cx, cy, Math.min(cw, rh) * 0.46f, p); }
            text(c, fa(String.valueOf(dd)), cx, cy + rh * 0.18f, rh * 0.5f, td ? 0xFF10231F : (col == 6 ? 0xFFFF6B6B : t.fg), td, Paint.Align.CENTER, cw * 0.9f);
        }
    }

    private static void date(Canvas c, int w, int h, Th t, JSONObject d, long now) {
        base(c, w, h, t, 0);
        Calendar n = Calendar.getInstance(); n.setTimeInMillis(now);
        text(c, jDateLong(n), w / 2f, h * 0.2f, h * 0.15f, t.fg, true, Paint.Align.CENTER, w * 0.92f);
        text(c, hm(now), w * 0.96f, h * 0.7f, h * 0.45f, t.accent, true, Paint.Align.RIGHT, w * 0.55f);
        text(c, n.get(Calendar.DAY_OF_MONTH) + " " + G_MONTHS[n.get(Calendar.MONTH)] + " " + n.get(Calendar.YEAR), w * 0.04f, h * 0.4f, h * 0.12f, t.sub, false, Paint.Align.LEFT, w * 0.38f);
        long[] nx = next(d, now, true);
        if (nx[0] > 0) {
            text(c, remain(nx[0] - now), w * 0.04f, h * 0.68f, h * 0.14f, t.fg, true, Paint.Align.LEFT, w * 0.38f);
            text(c, "تا " + (nx[1] == 1 ? "طلوع" : "اذان " + LAB[(int) nx[1]]), w * 0.04f, h * 0.86f, h * 0.11f, t.accent, false, Paint.Align.LEFT, w * 0.38f);
        }
    }

    private static void rem(Canvas c, int w, int h, Th t, JSONObject d, JSONObject cfg, long now) {
        float head = h * 0.16f;
        base(c, w, h, t, head);
        text(c, "یادآوری‌ها", w * 0.96f, head * 0.7f, head * 0.5f, t.hfg, true, Paint.Align.RIGHT, w * 0.6f);
        Calendar n = Calendar.getInstance(); n.setTimeInMillis(now);
        int[] j = g2j(n.get(Calendar.YEAR), n.get(Calendar.MONTH) + 1, n.get(Calendar.DAY_OF_MONTH));
        text(c, fa(j[2] + " " + J_MONTHS[j[1] - 1]), w * 0.04f, head * 0.7f, head * 0.45f, t.hfg, false, Paint.Align.LEFT, w * 0.3f);
        remList(c, w, head + h * 0.02f, h - h * 0.02f, t, d, now, Math.max(3, cfg.optInt("n", 5)));
    }

    private static void count(Canvas c, int w, int h, Th t, JSONObject d, long now) {
        base(c, w, h, t, 0);
        JSONArray a = arr(d, "occ");
        JSONObject best = null;
        for (int i = 0; i < a.length(); i++) { JSONObject e = a.optJSONObject(i); if (e != null && e.optLong("ts", 0) > now - 43200000L && (best == null || e.optLong("ts") < best.optLong("ts"))) best = e; }
        if (best == null) { text(c, "شمارش معکوس مناسبت‌ها", w / 2f, h * 0.55f, h * 0.2f, t.fg, true, Paint.Align.CENTER, w * 0.9f); return; }
        long days = (long) Math.ceil((best.optLong("ts") - now) / 86400000.0);
        if (days < 0) days = 0;
        text(c, fa(String.valueOf(days)), w * 0.2f, h * 0.7f, h * 0.55f, t.accent, true, Paint.Align.CENTER, w * 0.3f);
        text(c, "روز تا", w * 0.2f, h * 0.9f, h * 0.15f, t.sub, false, Paint.Align.CENTER, w * 0.3f);
        text(c, best.optString("t", ""), w * 0.95f, h * 0.55f, h * 0.28f, t.fg, true, Paint.Align.RIGHT, w * 0.62f);
        Calendar e = Calendar.getInstance(); e.setTimeInMillis(best.optLong("ts"));
        text(c, jDateLong(e), w * 0.95f, h * 0.82f, h * 0.14f, t.sub, false, Paint.Align.RIGHT, w * 0.62f);
    }
}
