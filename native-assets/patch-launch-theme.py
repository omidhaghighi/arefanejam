# قالب Capacitor: تم راه‌اندازی (AppTheme.NoActionBarLaunch) را طوری تنظیم می‌کند که اسپلش بومیِ اندروید ۱۲+ فقط یک رنگ ساده
# (هم‌رنگ آسمان اولین فریم ویدیو) و بدون آیکون باشد؛ پس هیچ لوگو/تصویر دیگری قبل از ویدیو دیده نمی‌شود.
import re, sys
p = 'android/app/src/main/res/values/styles.xml'
s = open(p, encoding='utf-8').read()
add = ('\n        <item name="windowSplashScreenBackground">#3E83B3</item>'
       '\n        <item name="windowSplashScreenAnimatedIcon">@android:color/transparent</item>'
       '\n        <item name="windowSplashScreenAnimationDuration">0</item>')
if 'windowSplashScreenBackground' not in s:
    s2 = re.sub(r'(<style name="AppTheme\.NoActionBarLaunch"[^>]*>)', lambda m: m.group(1) + add, s, count=1)
    if s2 == s:
        print('WARNING: launch theme not found; native splash left as is')
    else:
        open(p, 'w', encoding='utf-8').write(s2)
print(open(p, encoding='utf-8').read())
