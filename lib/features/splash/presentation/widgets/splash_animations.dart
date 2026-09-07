import 'package:flutter/animation.dart';

/// مواصفات حركة شاشة البداية مُترجمة ١:١ من مرجع HTML/CSS
/// (`Otaku Galaxy v2.dc.html`).
///
/// كل قيمة هنا تُقرأ مباشرة من مصدر التصميم:
/// - `og-pop .6s ease` — دخول المحتوى المركزي.
/// - `og-pulse 3s ease-in-out infinite` — نبض الهالة البيضاء خلف الشعار.
/// - `og-load` — تعبئة شريط التحميل. ثلاثة تعديلات مقصودة عن المصدر بطلب
///   المستخدم: البداية من ٠٪ لا ٦٪ (انظر `SplashLoader.widthFactor`)،
///   والمدة مشتقّة من مدة الشاشة لا ٢٫١ث ثابتة، والمنحنى خطّي لا `ease`
///   — التفصيل والقياس على [SplashTiming.load] و[SplashTiming.loadCurve].
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

  /// مدة تعبئة شريط التحميل — **مشتقّة** من مدة بقاء الشاشة لا مستقلّة عنها.
  ///
  /// [مخالفة مقصودة للمرجع] المصدر يقول `og-load 2.1s`، أي أن الشريط يمتلئ
  /// قبل انتهاء الشاشة (٢٫٣ث) بمئتَي مللي ثانية: يبلغ ١٠٠٪ ثم يجلس ساكناً
  /// والمستخدم ما زال ينتظر. اشتقاقُها من [referenceTransitionDelay] يجعل
  /// الامتلاء ينتهي مع نهاية الانتظار بالضبط، ويمنع القيمتين من التباعد إن
  /// عُدّلت إحداهما لاحقاً.
  static const Duration load = referenceTransitionDelay;

  /// منحنى شريط التحميل — **خطّي** لا `ease`.
  ///
  /// [مخالفة مقصودة للمرجع] المصدر يستعمل `ease`
  /// (`cubic-bezier(0.25,0.1,0.25,1)`)، وقياسُه إطاراً بإطار يكشف لماذا بدا
  /// الشريط «يمتلئ بسرعة ثم يتجمّد»: يبلغ ٧٢٪ في الثانية الأولى و٩٠٪ عند
  /// ١٫٤ث، ثم يزحف العشرة بالمئة الباقية على مدى ٩٠٠ مللي ثانية — حركةٌ لا
  /// تكاد تُدرَك بالعين. كل الإحساس بالتقدّم يُستهلك في أقل من نصف المدة.
  ///
  /// الخطّي يوزّع التقدّم بالتساوي (١٠٪ لكل ٢٣٠ مللي ثانية تقريباً) فيُرى
  /// الشريط متحرّكاً طوال مدة الشاشة — وهو السلوك المطلوب صراحةً:
  /// ٠٪ → ١٠٪ → ٢٠٪ → … → ٩٠٪ → ١٠٠٪.
  static const Curve loadCurve = Curves.linear;
}
