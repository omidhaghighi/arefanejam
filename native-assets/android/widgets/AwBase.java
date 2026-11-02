package com.arefanejam.quran;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;

public abstract class AwBase extends AppWidgetProvider {
    abstract String type();

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int i = 0; i < ids.length; i++) WidgetHub.update(c, m, ids[i], type());
        WidgetHub.scheduleTick(c);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context c, AppWidgetManager m, int id, Bundle o) {
        WidgetHub.update(c, m, id, type());
    }

    @Override
    public void onDeleted(Context c, int[] ids) { WidgetHub.dropCfg(c, ids); }

    @Override
    public void onEnabled(Context c) { WidgetHub.scheduleTick(c); }
}
