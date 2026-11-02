package com.arefanejam.quran;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.TextView;

import org.json.JSONObject;

/** تنظیمات هر ابزارک (هنگام افزودن، و بعدها از تنظیمات خود گوشی: نگه داشتن روی ابزارک ← تنظیم). */
public class WidgetConfigActivity extends Activity {
    private int wid = AppWidgetManager.INVALID_APPWIDGET_ID;
    private String type = "cal";
    private String theme = "green";
    private int alpha = 100;
    private int rows = 5;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        setResult(RESULT_CANCELED);
        Intent it = getIntent();
        if (it != null && it.getExtras() != null) wid = it.getExtras().getInt(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        if (wid == AppWidgetManager.INVALID_APPWIDGET_ID) { finish(); return; }
        type = WidgetHub.typeOf(this, wid);
        try {
            JSONObject d = WidgetHub.data(this);
            JSONObject c = WidgetHub.cfg(this, wid);
            theme = c.optString("theme", d.optString("theme", "green"));
            alpha = c.optInt("alpha", d.optInt("alpha", 100));
            rows = c.optInt("n", 5);
        } catch (Throwable ignore) { }
        build();
    }

    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }

    private TextView label(String s) {
        TextView t = new TextView(this);
        t.setText(s); t.setTextSize(15); t.setTextColor(Color.parseColor("#143C36")); t.setPadding(0, dp(14), 0, dp(6));
        t.setGravity(Gravity.RIGHT);
        return t;
    }

    private void build() {
        ScrollView sv = new ScrollView(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(20), dp(20), dp(20), dp(20));
        root.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        sv.addView(root);
        sv.setBackgroundColor(Color.parseColor("#FAF8F1"));

        TextView h = new TextView(this);
        h.setText("تنظیم ابزارک");
        h.setTextSize(20); h.setTextColor(Color.parseColor("#143C36")); h.setTypeface(null, android.graphics.Typeface.BOLD);
        root.addView(h);

        root.addView(label("رنگ و ظاهر"));
        final RadioGroup g = new RadioGroup(this);
        final String[] ids = { "green", "dark", "light", "glass" };
        String[] names = { "سبز و طلایی (پیش‌فرض)", "تیره", "روشن", "شیشه‌ای (شفاف روی تصویر زمینه)" };
        for (int i = 0; i < ids.length; i++) {
            RadioButton rb = new RadioButton(this);
            rb.setText(names[i]); rb.setId(1000 + i); rb.setTextSize(15);
            g.addView(rb);
            if (ids[i].equals(theme)) rb.setChecked(true);
        }
        root.addView(g);
        g.setOnCheckedChangeListener(new RadioGroup.OnCheckedChangeListener() {
            @Override public void onCheckedChanged(RadioGroup r, int id) { theme = ids[Math.max(0, Math.min(3, id - 1000))]; }
        });

        root.addView(label("شفافیت پس‌زمینه"));
        SeekBar sb = new SeekBar(this);
        sb.setMax(80); sb.setProgress(alpha - 20);
        sb.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar s, int p, boolean u) { alpha = 20 + p; }
            @Override public void onStartTrackingTouch(SeekBar s) { }
            @Override public void onStopTrackingTouch(SeekBar s) { }
        });
        root.addView(sb);

        if ("rem".equals(type)) {
            root.addView(label("تعداد یادآوریِ نمایش‌داده‌شده (۳ تا ۸)"));
            SeekBar rs = new SeekBar(this);
            rs.setMax(5); rs.setProgress(Math.max(0, Math.min(5, rows - 3)));
            rs.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
                @Override public void onProgressChanged(SeekBar s, int p, boolean u) { rows = 3 + p; }
                @Override public void onStartTrackingTouch(SeekBar s) { }
                @Override public void onStopTrackingTouch(SeekBar s) { }
            });
            root.addView(rs);
        }

        TextView hint = new TextView(this);
        hint.setText("محتوای ابزارک (اوقات اذان، یادآوری‌ها، آب‌وهوا و …) از خود اپ می‌آید و با هر بار باز شدن اپ و هر ۱۵ دقیقه بروز می‌شود.");
        hint.setTextSize(13); hint.setTextColor(Color.parseColor("#5E6B66")); hint.setPadding(0, dp(16), 0, dp(10));
        root.addView(hint);

        Button ok = new Button(this);
        ok.setText("ذخیره");
        ok.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { save(); }
        });
        root.addView(ok);
        setContentView(sv);
    }

    private void save() {
        try {
            JSONObject c = new JSONObject();
            c.put("theme", theme); c.put("alpha", alpha); c.put("n", rows);
            WidgetHub.saveCfg(this, wid, c);
            WidgetHub.update(this, AppWidgetManager.getInstance(this), wid, type);
            WidgetHub.scheduleTick(this);
        } catch (Throwable ignore) { }
        Intent r = new Intent();
        r.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, wid);
        setResult(RESULT_OK, r);
        finish();
    }
}
