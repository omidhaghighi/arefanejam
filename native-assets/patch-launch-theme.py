# قالب Capacitor: صفحهٔ راه‌اندازی بومی اندروید (قبل از شروع کلیپ) = لوگوی «عارفان جام» روی زمینهٔ سفید، بدون هیچ صفحهٔ آبی.
#  - اندروید ۱۲+: windowSplashScreenBackground = سفید، windowSplashScreenAnimatedIcon = لوگو (@drawable/launch_logo)
#  - اندروید ۶ تا ۱۱: windowBackground = @drawable/launch_bg (سفید + لوگوی وسط، همان اندازهٔ ۲۸۸dp)
#  - لوگو فقط تا لحظهٔ شروع پخش کلیپ دیده می‌شود (MainActivity.dropFirstFrame)؛ هیچ مکث اضافه‌ای ندارد.
# فایل لوگو: native-assets/launch-logo.png (بوم ۲۸۸dp با لوگوی داخل دایرهٔ امن اندروید ۱۲). اگر نبود، همان رنگ ساده می‌ماند.
import os, re, shutil, sys

BG = '#FDFDFD'
RES = 'android/app/src/main/res'
LOGO = 'native-assets/launch-logo.png'
STYLES = RES + '/values/styles.xml'

has_logo = os.path.isfile(LOGO)
if has_logo:
    os.makedirs(RES + '/drawable-nodpi', exist_ok=True)
    shutil.copyfile(LOGO, RES + '/drawable-nodpi/launch_logo.png')
else:
    print('WARNING: %s not found; launch screen will be a plain color without the logo' % LOGO)

# پس‌زمینهٔ پنجره (اندروید ۶ تا ۱۱ و پس از پایان اسپلش سیستمی)
def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, 'w', encoding='utf-8').write(text)

SOLID = '    <item>\n        <shape android:shape="rectangle">\n            <solid android:color="%s" />\n        </shape>\n    </item>\n' % BG
head = '<?xml version="1.0" encoding="utf-8"?>\n<layer-list xmlns:android="http://schemas.android.com/apk/res/android">\n'
write(RES + '/drawable/launch_bg.xml', head + SOLID + '</layer-list>\n')
if has_logo:
    write(RES + '/drawable-v23/launch_bg.xml', head + SOLID +
          '    <item android:width="288dp" android:height="288dp" android:gravity="center">\n'
          '        <bitmap android:src="@drawable/launch_logo" android:gravity="fill" />\n'
          '    </item>\n</layer-list>\n')

s = open(STYLES, encoding='utf-8').read()
# هر تنظیم قبلیِ اسپلش (آبی) پاک شود تا دوباره‌اجرایی بی‌خطر باشد
s = re.sub(r'\s*<item name="windowSplashScreen(Background|AnimatedIcon|AnimationDuration)">[^<]*</item>', '', s)
s = re.sub(r'\s*<item name="android:windowBackground">[^<]*</item>', '', s)
icon = '@drawable/launch_logo' if has_logo else '@android:color/transparent'
add = ('\n        <item name="windowSplashScreenBackground">%s</item>'
       '\n        <item name="windowSplashScreenAnimatedIcon">%s</item>'
       '\n        <item name="windowSplashScreenAnimationDuration">0</item>'
       '\n        <item name="android:windowBackground">@drawable/launch_bg</item>') % (BG, icon)
s2 = re.sub(r'(<style name="AppTheme\.NoActionBarLaunch"[^>]*>)', lambda m: m.group(1) + add, s, count=1)
if s2 == s:
    print('WARNING: launch theme not found; native splash left as is')
else:
    s2 = s2.replace('<item name="android:background">@drawable/splash</item>', '<item name="android:background">@drawable/launch_bg</item>')
    open(STYLES, 'w', encoding='utf-8').write(s2)
print(open(STYLES, encoding='utf-8').read())
