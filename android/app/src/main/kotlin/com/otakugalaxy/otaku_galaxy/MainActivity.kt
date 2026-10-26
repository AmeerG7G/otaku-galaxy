package com.otakugalaxy.otaku_galaxy

import android.os.Bundle
import io.flutter.embedding.android.FlutterActivity

/**
 * نشاط فلاتر — مع تصحيح لون نافذة الإقلاع قبل أول إطار.
 *
 * [CRITICAL] الومضة البيضاء في الوضع الداكن تقع **قبل** أن يعمل أيّ سطر من
 * دارت. تسلسل الإقلاع:
 *
 *   نافذة النظام (LaunchTheme/NormalTheme) → محرّك فلاتر → أول إطار
 *
 * وحتى ذلك الإطار الأول لا يرى المستخدم إلا `windowBackground`. لو كان
 * فاتحاً دائماً رأى مستخدمُ الوضع الداكن ومضةً فاتحة في كل إقلاع.
 *
 * والمظهر ليس مظهر النظام: `ThemeCubit` يحفظ اختيار المستخدم وحده ولا يقرأ
 * تفضيل الجهاز إطلاقاً، فلا يكفي `values-night/`. لكن القيمة المحفوظة
 * متاحة هنا: إضافة `shared_preferences` تكتب في ملف `FlutterSharedPreferences`
 * بمفتاح مسبوق بـ`flutter.`، وقراءتُه قبل `super.onCreate` تجعل لون النافذة
 * يطابق ما سيختاره التطبيق بعد لحظات — فلا انتقال مرئي أصلاً.
 *
 * أول إقلاع بعد التثبيت لا قيمة محفوظة له، فيسقط إلى `values-night/`
 * (مظهر الجهاز) وهو أقرب تخمين متاح.
 */
class MainActivity : FlutterActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        applyPersistedThemeBackground()
        super.onCreate(savedInstanceState)
    }

    private fun applyPersistedThemeBackground() {
        val prefs = getSharedPreferences(FLUTTER_PREFS, MODE_PRIVATE)
        // غياب المفتاح = لا اختيار صريح بعد ⇒ لا نتدخّل، وتتكفّل
        // `values-night/` بمطابقة مظهر الجهاز.
        if (!prefs.contains(THEME_KEY)) return
        val dark = prefs.getBoolean(THEME_KEY, false)
        window.setBackgroundDrawableResource(
            if (dark) R.color.brand_launch_background_dark
            else R.color.brand_launch_background,
        )
    }

    private companion object {
        /** ملف تفضيلات إضافة `shared_preferences` على أندرويد. */
        const val FLUTTER_PREFS = "FlutterSharedPreferences"

        /** `ThemeCubit._prefKey` مسبوقاً بالبادئة التي تضيفها الإضافة. */
        const val THEME_KEY = "flutter.theme_mode_dark"
    }
}
