package com.arefanejam.quran;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.ViewGroup;
import android.widget.ImageView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /** آیا اپ همین حالا جلوی چشم کاربر است؟ (برای اینکه نصب بی‌صدا هیچ پنجرهٔ ناگهانی نشان ندهد) */
    public static volatile boolean inForeground = false;
    private static volatile MainActivity current = null;

    /** اعلان اجباری «خواندم» همین حالا رسید و اپ جلوی چشم است: به صفحه می‌گوییم پنجرهٔ «خواندم» را نشان بدهد. */
    static void pokeForceUpdate() {
        final MainActivity a = current;
        if (a == null) return;
        try {
            a.runOnUiThread(new Runnable() {
                @Override public void run() {
                    try { a.getBridge().getWebView().evaluateJavascript("window.arefFuCheck&&window.arefFuCheck()", null); } catch (Throwable ignore) { }
                }
            });
        } catch (Throwable ignore) { }
    }

    /** لایهٔ «اولین فریم کلیپ شروع»: از همان اولین لحظه جای صفحهٔ آبیِ ساده را می‌گیرد تا کلیپ (وب) آماده شود. */
    private static volatile ImageView splashOverlay = null;
    private final Handler splashHandler = new Handler(Looper.getMainLooper());
    private final Runnable splashTimeout = new Runnable() {
        @Override public void run() { hideSplashOverlay(); }
    };

    private void showSplashOverlay() {
        try {
            int id = getResources().getIdentifier("splash", "drawable", getPackageName());
            if (id == 0) return;
            ImageView iv = new ImageView(this);
            iv.setScaleType(ImageView.ScaleType.CENTER_CROP);
            iv.setBackgroundColor(0xFF3E83B3);
            iv.setImageResource(id);
            addContentView(iv, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            splashOverlay = iv;
            splashHandler.postDelayed(splashTimeout, 8000); // اگر صفحه خبر نداد، لایه خودش برداشته می‌شود
        } catch (Throwable ignore) { }
    }

    /** صفحه (کلیپ شروع) می‌گوید ویدیو دیده می‌شود: لایهٔ بومی برداشته می‌شود. از هر نخی صدا زده شود امن است. */
    static void hideSplashOverlay() {
        final ImageView iv = splashOverlay;
        if (iv == null) return;
        splashOverlay = null;
        try {
            iv.post(new Runnable() {
                @Override public void run() {
                    try {
                        if (iv.getParent() instanceof ViewGroup) ((ViewGroup) iv.getParent()).removeView(iv);
                    } catch (Throwable ignore) { }
                }
            });
        } catch (Throwable ignore) { }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        current = this;
        registerPlugin(AppUpdaterPlugin.class);
        registerPlugin(ArefHubPlugin.class);
        // بروزرسانی ظاهر اپ از سایت: قبل از بالا آمدن Capacitor نسخهٔ آماده فعال یا نسخهٔ خراب برگردانده می‌شود
        AppUpdaterPlugin.webBoot(this);
        super.onCreate(savedInstanceState);
        if (savedInstanceState == null) showSplashOverlay();
        // دانلود بروزرسانی در پس‌زمینه (فقط با اینترنت، حتی وقتی اپ بسته است)
        UpdateJobService.schedule(this);
        handleAzanLink(getIntent());
        handleGo(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleAzanLink(intent);
        handleGo(intent);
    }

    /** لمس یک اعلان یا ابزارک: مقصد (extra = aref_go، JSON) را به صفحه می‌دهد تا همان بخش باز شود. */
    private void handleGo(Intent it) {
        try {
            if (it == null) return;
            String go = it.getStringExtra("aref_go");
            if (go == null || go.length() == 0) return;
            it.removeExtra("aref_go");   // فقط یک بار
            ArefHubPlugin.pendingGo = go;
            final String js = "window.arefGoPoll&&window.arefGoPoll()";
            runOnUiThread(new Runnable() {
                @Override public void run() {
                    try { getBridge().getWebView().evaluateJavascript(js, null); } catch (Throwable ignore) { }
                }
            });
        } catch (Throwable ignore) { }
    }

    /**
     * دکمه‌های صفحهٔ «تست اذان» پیشخوان، اگر روی همین گوشی باز باشد، اپ را با لینک
     * arefanejam://azan-test?mode=now|test|stop&sec=N باز می‌کنند و اذان بومی اپ (همان مسیر اذان واقعی:
     * آلارم سیستم ← AzanReceiver ← AzanService) فعال می‌شود. بعد از اجرا اپ به پس‌زمینه می‌رود تا
     * کاربر به صفحهٔ پیشخوان برگردد یا گوشی را قفل کند.
     */
    private void handleAzanLink(Intent it) {
        try {
            if (it == null) return;
            Uri d = it.getData();
            if (d == null || !"arefanejam".equals(d.getScheme()) || !"azan-test".equals(d.getHost())) return;
            it.setData(null); // فقط یک بار اجرا شود (مثلاً با چرخش صفحه دوباره اجرا نشود)
            Context ctx = getApplicationContext();
            String mode = d.getQueryParameter("mode");
            if ("stop".equals(mode)) {
                ctx.stopService(new Intent(ctx, AzanService.class));
            } else {
                int sec = 0;
                if ("test".equals(mode)) {
                    try { sec = Integer.parseInt(d.getQueryParameter("sec")); } catch (Throwable ignore) { sec = 30; }
                    if (sec < 10) sec = 10;
                    if (sec > 900) sec = 900;
                }
                if (sec == 0) {
                    // «پخش همین الان»: آلارم تست با یک ثانیه تأخیر (همان مسیر بومی)
                    AzanReceiver.scheduleTest(ctx, 1);
                } else {
                    AzanReceiver.scheduleTest(ctx, sec);
                }
            }
            moveTaskToBack(true);
        } catch (Throwable ignore) { }
    }

    @Override
    public void onStart() {
        super.onStart();
        inForeground = true;
        // اپ جلوی چشم آمد: اعلان‌های معمولی از پرده پاک می‌شوند (همه داخل «اعلان‌ها»ی اپ می‌مانند) و عدد روی آیکون صفر می‌شود
        try { NotifCenter.clearShade(getApplicationContext()); } catch (Throwable ignore) { }
    }

    @Override
    public void onStop() {
        inForeground = false;
        super.onStop();
        // اگر کاربر «خواندم» را نزده و از اپ بیرون رفت، اعلان ماندگار بالای گوشی بماند
        try { UpdateJobService.ensureForceNotice(getApplicationContext(), false); } catch (Throwable ignore) { }
    }

    @Override
    public void onDestroy() {
        if (current == this) current = null;
        try { splashHandler.removeCallbacks(splashTimeout); } catch (Throwable ignore) { }
        splashOverlay = null;
        super.onDestroy();
    }
}
