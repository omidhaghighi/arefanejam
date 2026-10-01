package com.arefanejam.quran;

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
