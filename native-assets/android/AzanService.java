package com.arefanejam.quran;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.SystemClock;
import android.provider.Settings;

import androidx.core.app.NotificationCompat;

import java.io.File;

/**
 * Foreground service that plays the azan sound.
 * Works with the phone locked, the app closed and NO internet:
 * the audio comes from a file saved on the phone (AzanReceiver.downloadAsync),
 * else from the sound bundled in the APK (res/raw), else the phone default alarm sound.
 */
public class AzanService extends Service {

    static final String CH = "azan-native-v1";
    static final int NID = 777000002;
    static final String ACTION_STOP = "com.arefanejam.quran.AZAN_STOP";

    // pressing the phone's power button while the azan plays stops the azan
    // (the button always produces a SCREEN_OFF if the screen was on, or a SCREEN_ON if it was off)
    private static final long POWER_GUARD_MS = 20000L;  // ignore screen changes in the first 20s (the notification / sticky card often wakes the screen by itself)
    private BroadcastReceiver screenReceiver;
    private long azanStartedAt;
    private long screenOnAt;

    private MediaPlayer player;
    private PowerManager.WakeLock wakeLock;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }
        String label = intent == null ? null : intent.getStringExtra("label");
        if (label == null) label = "";
        try {
            Notification n = buildNotification(label);
            boolean started = false;
            if (Build.VERSION.SDK_INT >= 29) {
                try {
                    startForeground(NID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
                    started = true;
                } catch (Throwable t) {
                    started = false;
                }
            }
            if (!started) startForeground(NID, n);
        } catch (Throwable t) {
            // could not become a foreground service: show a normal loud notification and stop
            AzanReceiver.logEvent(this, "service: could not become foreground -> fallback notification (" + t + ")");
            AzanReceiver.postFallback(this, label);
            stopSelf();
            return START_NOT_STICKY;
        }
        AzanReceiver.logEvent(this, "service: started (foreground ok)");
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "arefanejam:azan");
                wakeLock.acquire(15L * 60L * 1000L);
            }
        } catch (Throwable ignore) { }
        playSound();
        registerPowerButtonStop();
        return START_NOT_STICKY;
    }

    /**
     * Stop the azan when the user presses the power button.
     * - screen was off (locked phone): button -> SCREEN_ON  -> stop
     * - screen was on:                 button -> SCREEN_OFF -> stop
     * A SCREEN_OFF that comes from the normal screen timeout (screen stayed on for the whole timeout) is ignored,
     * and so is any screen change in the first moments after the azan starts.
     */
    private void registerPowerButtonStop() {
        if (screenReceiver != null) return;
        try {
            azanStartedAt = SystemClock.elapsedRealtime();
            screenOnAt = azanStartedAt;
            screenReceiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context c, Intent i) {
                    String a = i == null ? null : i.getAction();
                    if (a == null) return;
                    long now = SystemClock.elapsedRealtime();
                    if (Intent.ACTION_SCREEN_ON.equals(a)) {
                        screenOnAt = now;
                        if (now - azanStartedAt < POWER_GUARD_MS) return;
                        AzanReceiver.logEvent(AzanService.this, "power button/screen on -> azan stopped");
                        stopSelf();
                    } else if (Intent.ACTION_SCREEN_OFF.equals(a)) {
                        if (now - azanStartedAt < POWER_GUARD_MS) return;
                        long timeout = 30000L;
                        try {
                            timeout = Settings.System.getInt(getContentResolver(), Settings.System.SCREEN_OFF_TIMEOUT, 30000);
                        } catch (Throwable ignore) { }
                        if (timeout > 0 && now - screenOnAt >= timeout - 2000L) {
                            AzanReceiver.logEvent(AzanService.this, "screen off by timeout -> azan keeps playing");
                            return;
                        }
                        AzanReceiver.logEvent(AzanService.this, "power button/screen off -> azan stopped");
                        stopSelf();
                    }
                }
            };
            IntentFilter f = new IntentFilter();
            f.addAction(Intent.ACTION_SCREEN_ON);
            f.addAction(Intent.ACTION_SCREEN_OFF);
            if (Build.VERSION.SDK_INT >= 33) {
                registerReceiver(screenReceiver, f, Context.RECEIVER_NOT_EXPORTED);
            } else {
                registerReceiver(screenReceiver, f);
            }
        } catch (Throwable t) {
            screenReceiver = null;
            AzanReceiver.logEvent(this, "power button stop: could not register (" + t + ")");
        }
    }

    private Notification buildNotification(String label) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CH) == null) {
            // silent channel: the sound is played by MediaPlayer, not by the notification
            NotificationChannel ch = new NotificationChannel(CH, "Azan (playing)", NotificationManager.IMPORTANCE_LOW);
            ch.setSound(null, null);
            ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(ch);
        }
        String pkg = getPackageName();
        int small = getResources().getIdentifier("ic_stat_azan", "drawable", pkg);
        if (small == 0) small = getApplicationInfo().icon;
        int pf = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);

        Intent launch = getPackageManager().getLaunchIntentForPackage(pkg);
        PendingIntent open = launch == null ? null : PendingIntent.getActivity(this, 4721, launch, pf);

        Intent stop = new Intent(this, AzanService.class);
        stop.setAction(ACTION_STOP);
        PendingIntent stopPi = PendingIntent.getService(this, 4722, stop, pf);

        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CH)
            .setSmallIcon(small)
            .setColor(0xFF143C36)
            .setContentTitle("\u0627\u0630\u0627\u0646 " + label)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .addAction(0, "\u062a\u0648\u0642\u0641", stopPi);
        if (open != null) b.setContentIntent(open);
        return b.build();
    }

    private void playSound() {
        releasePlayer();
        try {
            MediaPlayer mp = new MediaPlayer();
            player = mp;
            mp.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build());
            if (!setSource(mp)) {
                releasePlayer();
                stopSelf();
                return;
            }
            mp.setOnCompletionListener(new MediaPlayer.OnCompletionListener() {
                @Override
                public void onCompletion(MediaPlayer m) {
                    AzanReceiver.logEvent(AzanService.this, "audio: finished playing");
                    stopSelf();
                }
            });
            mp.setOnErrorListener(new MediaPlayer.OnErrorListener() {
                @Override
                public boolean onError(MediaPlayer m, int what, int extra) {
                    AzanReceiver.logEvent(AzanService.this, "audio: player error what=" + what + " extra=" + extra);
                    stopSelf();
                    return true;
                }
            });
            ensureAlarmVolume();
            mp.prepare();
            mp.start();
            AzanReceiver.logEvent(this, "audio: PLAYING");
        } catch (Throwable t) {
            AzanReceiver.logEvent(this, "audio: failed " + t);
            releasePlayer();
            stopSelf();
        }
    }

    /** 1) downloaded file  2) sound bundled in the APK  3) phone default alarm sound */
    private boolean setSource(MediaPlayer mp) {
        try {
            File f = AzanReceiver.bestAudioFile(this);
            if (f != null) {
                mp.setDataSource(f.getAbsolutePath());
                AzanReceiver.logEvent(this, "audio source: downloaded file " + (f.length() / 1024) + " KB (works offline)");
                return true;
            }
        } catch (Throwable ignore) {
            try { mp.reset(); } catch (Throwable ignore2) { }
        }
        try {
            String voice = AzanReceiver.prefs(this).getString("voice", "");
            String[] names = new String[] { "azan_" + voice, "azan_local", "azan_v0" };
            for (int i = 0; i < names.length; i++) {
                if (voice.length() == 0 && i == 0) continue;
                int id = getResources().getIdentifier(names[i], "raw", getPackageName());
                if (id != 0) {
                    AssetFileDescriptor afd = getResources().openRawResourceFd(id);
                    if (afd != null) {
                        mp.setDataSource(afd.getFileDescriptor(), afd.getStartOffset(), afd.getLength());
                        afd.close();
                        AzanReceiver.logEvent(this, "audio source: bundled in APK (" + names[i] + ")");
                        return true;
                    }
                }
            }
        } catch (Throwable ignore) {
            try { mp.reset(); } catch (Throwable ignore2) { }
        }
        try {
            Uri u = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (u == null) u = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            if (u != null) {
                mp.setDataSource(this, u);
                AzanReceiver.logEvent(this, "audio source: PHONE DEFAULT ringtone (no downloaded/bundled azan found)");
                return true;
            }
        } catch (Throwable ignore) { }
        return false;
    }

    /** The azan is played on the ALARM volume. If that volume is 0 the azan is "playing" but silent: raise it to ~60%. */
    private void ensureAlarmVolume() {
        try {
            AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (am == null) return;
            int max = am.getStreamMaxVolume(AudioManager.STREAM_ALARM);
            int cur = am.getStreamVolume(AudioManager.STREAM_ALARM);
            if (cur <= 0 && max > 0) {
                int target = Math.max(1, (int) Math.round(max * 0.6));
                am.setStreamVolume(AudioManager.STREAM_ALARM, target, 0);
                AzanReceiver.logEvent(this, "alarm volume was 0 -> raised to " + target + "/" + max);
            } else {
                AzanReceiver.logEvent(this, "alarm volume " + cur + "/" + max);
            }
        } catch (Throwable t) {
            AzanReceiver.logEvent(this, "alarm volume check failed: " + t);
        }
    }

    private void releasePlayer() {
        MediaPlayer mp = player;
        player = null;
        if (mp != null) {
            try { mp.stop(); } catch (Throwable ignore) { }
            try { mp.release(); } catch (Throwable ignore) { }
        }
    }

    @Override
    public void onDestroy() {
        try {
            if (screenReceiver != null) unregisterReceiver(screenReceiver);
        } catch (Throwable ignore) { }
        screenReceiver = null;
        releasePlayer();
        try {
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        } catch (Throwable ignore) { }
        try {
            stopForeground(true);
        } catch (Throwable ignore) { }
        super.onDestroy();
    }
}
