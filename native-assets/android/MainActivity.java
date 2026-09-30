package com.arefanejam.quran;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppUpdaterPlugin.class);
        // بروزرسانی ظاهر اپ از سایت: قبل از بالا آمدن Capacitor نسخهٔ آماده فعال یا نسخهٔ خراب برگردانده می‌شود
        AppUpdaterPlugin.webBoot(this);
        super.onCreate(savedInstanceState);
    }
}
