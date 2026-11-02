package com.arefanejam.quran;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** هر ~۱۵ دقیقه و بعد از روشن شدن گوشی، تغییر ساعت/تاریخ یا نصب نسخهٔ تازه، ابزارک‌ها را دوباره می‌کشد. */
public class WidgetTickReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(final Context ctx, Intent intent) {
        final PendingResult pr = goAsync();
        final Context app = ctx.getApplicationContext();
        new Thread(new Runnable() {
            @Override public void run() {
                try {
                    WidgetHub.fetchWeather(app);
                    WidgetHub.refreshAll(app);
                    WidgetHub.scheduleTick(app);
                } catch (Throwable ignore) { }
                try { pr.finish(); } catch (Throwable ignore) { }
            }
        }).start();
    }
}
