package com.arefanejam.quran;

import android.content.Context;
import android.content.Intent;
import android.content.res.AssetFileDescriptor;
import android.graphics.Matrix;
import android.graphics.SurfaceTexture;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Surface;
import android.view.TextureView;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
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

    /**
     * کلیپ شروع به‌صورت بومی: ویدیوی داخل APK (assets/public/intro/intro.mp4) از همان اولین فریم اکتیویتی با MediaPlayer
     * پخش می‌شود و منتظر بالا آمدن وب‌ویو نمی‌ماند. تا شروع پخش، اولین فریم کلیپ (drawable/splash) دیده می‌شود.
     * لایه وقتی برداشته می‌شود که کلیپ تمام شده و صفحه خبر داده اپ آماده است (introAppReady).
     */
    private static volatile FrameLayout splashRoot = null;
    private static volatile boolean nativeIntroOn = false;     // صفحه می‌تواند از پخش بومی استفاده کند
    private static volatile boolean introClipDone = false;
    private static volatile boolean introWebReady = false;
    private ImageView introFrame = null;
    private TextureView introTv = null;
    private MediaPlayer introPlayer = null;
    private boolean introPlaying = false;
    private int vidW = 0, vidH = 0;
    private final Handler splashHandler = new Handler(Looper.getMainLooper());
    private final Runnable splashTimeout = new Runnable() {
        @Override public void run() { removeSplashNow(); }
    };

    /** آیا صفحه باید پخش کلیپ را به بخش بومی بسپارد؟ (برای APKهای قدیمی این متد اصلاً نیست و صفحه خودش کلیپ را پخش می‌کند) */
    static boolean isNativeIntroOn() { return nativeIntroOn && splashRoot != null; }

    private void showSplashOverlay() {
        try {
            FrameLayout root = new FrameLayout(this);
            root.setBackgroundColor(0xFF3E83B3);
            // ویدیو زیر، اولین فریم ثابت روی آن؛ وقتی اولین فریم ویدیو رسم شد ثابت برداشته می‌شود (بدون پرش)
            TextureView tv = new TextureView(this);
            root.addView(tv, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            int id = getResources().getIdentifier("splash", "drawable", getPackageName());
            if (id != 0) {
                ImageView iv = new ImageView(this);
                iv.setScaleType(ImageView.ScaleType.CENTER_CROP);
                iv.setImageResource(id);
                root.addView(iv, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                introFrame = iv;
            }
            introTv = tv;
            introClipDone = false;
            introWebReady = false;
            nativeIntroOn = true;
            tv.setSurfaceTextureListener(new TextureView.SurfaceTextureListener() {
                @Override public void onSurfaceTextureAvailable(SurfaceTexture st, int w, int h) { startIntroPlayer(new Surface(st)); }
                @Override public void onSurfaceTextureSizeChanged(SurfaceTexture st, int w, int h) { fitIntro(); }
                @Override public boolean onSurfaceTextureDestroyed(SurfaceTexture st) { return true; }
                @Override public void onSurfaceTextureUpdated(SurfaceTexture st) { if (introPlaying) dropFirstFrame(); }
            });
            addContentView(root, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            splashRoot = root;
            splashHandler.postDelayed(splashTimeout, 15000); // اگر صفحه خبر نداد، لایه خودش برداشته می‌شود
        } catch (Throwable ignore) { nativeIntroOn = false; }
    }

    // پخش‌کننده از همان ابتدای onCreate (قبل از بالا آمدن وب‌ویو) آماده‌سازی می‌شود تا وقتی صفحه رسم شد کلیپ بدون مکث شروع شود
    private Surface introSurface = null;
    private boolean introPrepared = false;

    private void prewarmIntro() {
        try {
            if (introPlayer != null) return;
            MediaPlayer mp = new MediaPlayer();
            introPlayer = mp;
            AssetFileDescriptor afd = getAssets().openFd("public/intro/intro.mp4");
            try { mp.setDataSource(afd.getFileDescriptor(), afd.getStartOffset(), afd.getLength()); } finally { try { afd.close(); } catch (Throwable ignore) { } }
            mp.setVolume(0f, 0f);
            mp.setLooping(false);
            mp.setOnVideoSizeChangedListener(new MediaPlayer.OnVideoSizeChangedListener() {
                @Override public void onVideoSizeChanged(MediaPlayer p, int w, int h) { vidW = w; vidH = h; fitIntro(); }
            });
            mp.setOnInfoListener(new MediaPlayer.OnInfoListener() {
                @Override public boolean onInfo(MediaPlayer p, int what, int extra) {
                    if (what == MediaPlayer.MEDIA_INFO_VIDEO_RENDERING_START) dropFirstFrame();
                    return false;
                }
            });
            mp.setOnCompletionListener(new MediaPlayer.OnCompletionListener() {
                @Override public void onCompletion(MediaPlayer p) { introClipDone = true; tryFinishIntro(); }
            });
            mp.setOnErrorListener(new MediaPlayer.OnErrorListener() {
                @Override public boolean onError(MediaPlayer p, int what, int extra) {
                    // پخش بومی خراب شد: اولین فریم می‌ماند و با آماده شدن اپ برداشته می‌شود
                    nativeIntroOn = false; introClipDone = true; tryFinishIntro(); return true;
                }
            });
            mp.setOnPreparedListener(new MediaPlayer.OnPreparedListener() {
                @Override public void onPrepared(MediaPlayer p) {
                    try { vidW = p.getVideoWidth(); vidH = p.getVideoHeight(); } catch (Throwable ignore) { }
                    introPrepared = true;
                    tryStartIntro();
                }
            });
            mp.prepareAsync();
        } catch (Throwable t) {
            introPlayer = null;
        }
    }

    /** هم کلیپ آماده است و هم سطح نمایش (TextureView) وجود دارد؟ پس پخش شروع شود. */
    private void tryStartIntro() {
        try {
            MediaPlayer mp = introPlayer;
            Surface sf = introSurface;
            if (mp == null || sf == null || !introPrepared || introPlaying) return;
            fitIntro();
            mp.start();
            introPlaying = true;
        } catch (Throwable ignore) { }
    }

    private void startIntroPlayer(Surface surface) {
        try {
            introSurface = surface;
            if (introPlayer == null) prewarmIntro();   // اگر آماده‌سازی زودهنگام نشده بود، همین حالا
            MediaPlayer mp = introPlayer;
            if (mp == null) { nativeIntroOn = false; introClipDone = true; return; }  // نشد: صفحه خودش کلیپ را پخش می‌کند
            mp.setSurface(surface);
            tryStartIntro();
        } catch (Throwable t) {
            nativeIntroOn = false; introClipDone = true;
        }
    }

    /** کلیپ را تمام‌صفحه و بدون کشیدگی (مثل object-fit: cover) نشان بده. */
    private void fitIntro() {
        try {
            TextureView tv = introTv;
            if (tv == null || vidW <= 0 || vidH <= 0) return;
            float vw = tv.getWidth(), vh = tv.getHeight();
            if (vw <= 0 || vh <= 0) return;
            float viewAspect = vw / vh, vidAspect = (float) vidW / (float) vidH;
            float sx = 1f, sy = 1f;
            if (viewAspect > vidAspect) sy = (vw / vidAspect) / vh; else sx = (vh * vidAspect) / vw;
            Matrix m = new Matrix();
            m.setScale(sx, sy, vw / 2f, vh / 2f);
            tv.setTransform(m);
        } catch (Throwable ignore) { }
    }

    private void dropFirstFrame() {
        final ImageView f = introFrame;
        if (f == null) return;
        introFrame = null;
        f.post(new Runnable() { @Override public void run() { try { f.setVisibility(View.GONE); } catch (Throwable ignore) { } } });
    }

    /** کلیپ تمام شده و اپ هم آماده است؟ پس لایه با محو نرم برداشته شود. */
    private void tryFinishIntro() {
        if (!(introClipDone && introWebReady)) return;
        runOnUiThread(new Runnable() {
            @Override public void run() {
                final FrameLayout root = splashRoot;
                if (root == null) return;
                try {
                    root.animate().alpha(0f).setDuration(300).withEndAction(new Runnable() {
                        @Override public void run() { removeSplashNow(); }
                    }).start();
                } catch (Throwable t) { removeSplashNow(); }
            }
        });
    }

    private void removeSplashNow() {
        final FrameLayout root = splashRoot;
        splashRoot = null;
        nativeIntroOn = false;
        try { splashHandler.removeCallbacks(splashTimeout); } catch (Throwable ignore) { }
        try { if (introPlayer != null) { introPlayer.release(); introPlayer = null; } } catch (Throwable ignore) { }
        introTv = null; introFrame = null; introPlaying = false; introPrepared = false; introSurface = null;
        if (root == null) return;
        try {
            if (root.getParent() instanceof ViewGroup) ((ViewGroup) root.getParent()).removeView(root);
        } catch (Throwable ignore) { }
    }

    /** (حالت قدیمی/جایگزین) صفحه می‌گوید کلیپ خودش دیده می‌شود: لایهٔ بومی همین حالا برداشته شود. از هر نخی امن است. */
    static void hideSplashOverlay() {
        final MainActivity a = current;
        if (a == null || splashRoot == null) return;
        try { a.runOnUiThread(new Runnable() { @Override public void run() { a.removeSplashNow(); } }); } catch (Throwable ignore) { }
    }

    /** صفحه می‌گوید اپ پشت لایه آماده است؛ به‌محض پایان کلیپ لایه محو می‌شود. از هر نخی امن است. */
    static void introAppReady() {
        introWebReady = true;
        final MainActivity a = current;
        if (a != null) a.tryFinishIntro();
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        current = this;
        if (savedInstanceState == null) prewarmIntro();   // کلیپ از همین لحظه آماده می‌شود، موازی با بالا آمدن وب‌ویو
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
        try { if (introPlayer != null) { introPlayer.release(); introPlayer = null; } } catch (Throwable ignore) { }
        splashRoot = null; nativeIntroOn = false;
        super.onDestroy();
    }
}
