import 'package:flutter/animation.dart';

/// مواصفات حركة شاشة البداية مُترجمة ١:١ من مرجع HTML/CSS
/// (`Otaku Galaxy v2.dc.html`).
///
/// كل قيمة هنا تُقرأ مباشرة من مصدر التصميم:
/// - `og-pop .6s ease` — دخول المحتوى المركزي.
/// - `og-pulse 3s ease-in-out infinite` — نبض الهالة البيضاء خلف الشعار.
/// - `og-load` — تعبئة شريط التحميل. **لم تعد حركةً زمنية**: الشريط يتبع
///   [StartupProgress] فيمثّل عملاً منجزاً لا وقتاً مضى. مدة `og-load`
///   ومنحناها حُذفا لأنهما صارا بلا معنى — انظر [progressEase].
/// - `armSplash()` setTimeout(2300) — مدة بقاء الشاشة قبل الانتقال.
final class SplashTiming {
  SplashTiming._();

  /// `og-pop .6s ease` — مدة دخول الشعار والهوية.
  static const Duration pop = Duration(milliseconds: 600);

  /// منحنى `ease` في CSS (`cubic-bezier(0.25,0.1,0.25,1)`) = [Curves.ease].
  static const Curve popCurve = Curves.ease;

  /// `og-pulse 3s ease-in-out infinite` — الدورة الكاملة (صعودٌ ثم هبوط) ٣ ثوانٍ
/// والقمة عند ١·٥ ث. لكن `repeat(reverse:true)` في فلاتر يضاعف المدة الممرَّرة:
/// الدورة الكاملة = ٢ × المدة. لذا نمرّر نصف المدة (١٬٥ ث) لإعادة إنتاج دورة
/// ٣ ثوانٍ تماماً كما `@keyframes og-pulse` (0% → 50% → 100%) في المرجع.
  static const Duration pulseHalf = Duration(milliseconds: 1500);

  /// منحنى `ease-in-out` في CSS (`cubic-bezier(0.42,0,0.58,1)`) =
  /// [Curves.easeInOut] لنبض الهالة.
  static const Curve pulseCurve = Curves.easeInOut;

  /// `armSplash()` في المرجع: `setTimeout(..., 2300)` — تبقى الشاشة ٢٫٣ ث
  /// ثم تنتقل إلى التعريف. نستخدمه كحدٍّ أدنى مدة عرض قبل المصادقة/التنقل.
  static const Duration referenceTransitionDelay = Duration(milliseconds: 2300);

  /// مدة تنعيم انتقال شريط التحميل بين قيمتَي تقدّم متجاورتين.
  ///
  /// [CRITICAL] ليست مدة الإقلاع ولا بديلاً عنها. الشريط يتبع
  /// `StartupProgress.progress`، وهذه المدة تمنع القفز المفاجئ بين الدرجات
  /// فقط — الهدف الذي يتحرّك إليه قيمةٌ حقيقية دائماً، ولا تُخترع نسبةٌ
  /// لملء الوقت. وهي أيضاً سبب وقوع الانتقال بعد بلوغ الشريط نهايته لا عند
  /// تمام آخر خطوة: التمثيل البصري يُكمَل قبل مغادرة الشاشة.
  static const Duration progressEase = Duration(milliseconds: 320);

}
