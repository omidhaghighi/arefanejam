package com.arefanejam.quran;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /** آیا اپ همین حالا جلوی چشم کاربر است؟ (برای اینکه نصب بی‌صدا هیچ پنجرهٔ ناگهانی نشان ندهد) */
    public static volatile boolean inForeground = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppUpdaterPlugin.class);
        // بروزرسانی ظاهر اپ از سایت: قبل از بالا آمدن Capacitor نسخهٔ آماده فعال یا نسخهٔ خراب برگردانده می‌شود
        AppUpdaterPlugin.webBoot(this);
        super.onCreate(savedInstanceState);
        // دانلود بروزرسانی در پس‌زمینه (فقط با اینترنت، حتی وقتی اپ بسته است)
        UpdateJobService.schedule(this);
        handleAzanLink(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleAzanLink(intent);
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
    }

    @Override
    public void onStop() {
        inForeground = false;
        super.onStop();
    }
}
