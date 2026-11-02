package com.arefanejam.quran;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

/** پل صفحه ↔ بخش بومی: مرکز اعلان، ابزارک‌ها، باز کردن اپ بازار، مشخصات دستگاه. هیچ مجوز تازه‌ای نمی‌خواهد. */
@CapacitorPlugin(name = "ArefHub")
public class ArefHubPlugin extends Plugin {
    /** مقصدی که از اعلان/ابزارک آمده و صفحه هنوز نگرفته (JSON) */
    static volatile String pendingGo = null;

    /** کلیپ شروع (وب) دیده می‌شود: لایهٔ بومیِ اولین فریم برداشته شود. */
    @PluginMethod
    public void introReady(PluginCall call) {
        try { MainActivity.hideSplashOverlay(); } catch (Throwable ignore) { }
        call.resolve();
    }

    /** صفحه می‌پرسد: کلیپ شروع را بخش بومی پخش می‌کند؟ (اگر بله صفحه کلیپ خودش را نشان نمی‌دهد) */
    @PluginMethod
    public void introMode(PluginCall call) {
        JSObject r = new JSObject();
        boolean n = false;
        try { n = MainActivity.isNativeIntroOn(); } catch (Throwable ignore) { }
        r.put("native", n);
        call.resolve(r);
    }

    /** اپ پشت کلیپ بومی آماده است؛ بعد از پایان کلیپ لایه محو می‌شود. */
    @PluginMethod
    public void introAppReady(PluginCall call) {
        try { MainActivity.introAppReady(); } catch (Throwable ignore) { }
        call.resolve();
    }

    @PluginMethod
    public void openBazaar(PluginCall call) {
        JSObject r = new JSObject();
        boolean ok = false;
        try {
            Context c = getContext();
            Intent it = new Intent(Intent.ACTION_VIEW, Uri.parse("bazaar://details?id=" + c.getPackageName()));
            it.setPackage("com.farsitel.bazaar");
            it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            c.startActivity(it);
            ok = true;
        } catch (Throwable t) { ok = false; }
        r.put("opened", ok);
        call.resolve(r);
    }

    @PluginMethod
    public void deviceInfo(PluginCall call) {
        JSObject r = new JSObject();
        String m = Build.MANUFACTURER == null ? "" : Build.MANUFACTURER;
        String d = Build.MODEL == null ? "" : Build.MODEL;
        if (d.toLowerCase().startsWith(m.toLowerCase())) d = d.substring(m.length()).trim();
        String label = (m.length() > 0 ? m.substring(0, 1).toUpperCase() + m.substring(1) + " " : "") + d + " (Android " + Build.VERSION.RELEASE + ")";
        r.put("label", label.trim());
        call.resolve(r);
    }

    /* ---------- مرکز اعلان ---------- */
    @PluginMethod
    public void notifList(PluginCall call) {
        JSObject r = new JSObject();
        try {
            r.put("items", new com.getcapacitor.JSArray(NotifCenter.listJson(getContext())));
        } catch (Throwable t) { r.put("items", new com.getcapacitor.JSArray()); }
        r.put("unread", NotifCenter.unread(getContext()));
        call.resolve(r);
    }

    @PluginMethod
    public void notifRead(PluginCall call) {
        String id = call.getString("id");
        if (id == null || id.length() == 0) NotifCenter.markAllRead(getContext()); else NotifCenter.markRead(getContext(), id);
        call.resolve();
    }

    @PluginMethod
    public void notifRemove(PluginCall call) {
        String id = call.getString("id");
        if (id == null || id.length() == 0) NotifCenter.clear(getContext()); else NotifCenter.remove(getContext(), id);
        call.resolve();
    }

    @PluginMethod
    public void clearShade(PluginCall call) {
        NotifCenter.clearShade(getContext());
        call.resolve();
    }

    @PluginMethod
    public void takeGo(PluginCall call) {
        JSObject r = new JSObject();
        String g = pendingGo;
        pendingGo = null;
        r.put("go", g == null ? "" : g);
        call.resolve(r);
    }

    /* ---------- ابزارک‌ها ---------- */
    @PluginMethod
    public void widgetSync(PluginCall call) {
        try {
            String json = call.getString("json");
            if (json != null && json.length() > 0) WidgetHub.saveData(getContext(), json);
            WidgetHub.refreshAll(getContext());
            call.resolve();
        } catch (Throwable t) { call.reject("widget sync failed"); }
    }

    @PluginMethod
    public void widgetPin(PluginCall call) {
        JSObject r = new JSObject();
        r.put("result", WidgetHub.pin(getContext(), call.getString("type")));
        call.resolve(r);
    }

    @PluginMethod
    public void widgetPreview(PluginCall call) {
        JSObject r = new JSObject();
        try {
            String type = call.getString("type");
            int w = call.getInt("w", 560);
            int h = call.getInt("h", 300);
            r.put("png", WidgetHub.previewBase64(getContext(), type, w, h));
        } catch (Throwable t) { r.put("png", ""); }
        call.resolve(r);
    }

    @PluginMethod
    public void widgetCount(PluginCall call) {
        JSObject r = new JSObject();
        r.put("count", WidgetHub.installedCount(getContext()));
        call.resolve(r);
    }
}
