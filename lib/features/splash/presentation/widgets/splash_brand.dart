import 'package:flutter/material.dart';
import '../../../../core/l10n/app_strings.dart';
import '../../../../core/design_system/themes/app_theme.dart';

import '../../../../core/design_system/components/branding/otaku_store_logo.dart';
import '../../../../core/design_system/tokens/app_dimens.dart';

/// المحتوى المركزي لشاشة البداية: الشعار داخل هالة نابضة ثم الاسم والشعار
/// النصّي — كلّه داخل تأثير دخول `og-pop`.
///
/// يتلقّى قيم الحركة من الوالد (الذي يملك الـ controllers) كي يبقى هذا
/// المكوّن خالصاً للعرض بلا حالة. الألوان ألوان المرجع الثابتة لا ألوان
/// السمة — فالمرجع يحتفظ بها حرفياً في الوضعين الفاتح والداكن.
class SplashBrand extends StatelessWidget {
  const SplashBrand({
    super.key,
    required this.popOpacity,
    required this.popScale,
    required this.pulseOpacity,
    required this.pulseScale,
  });

  /// `og-pop` — تلاشٍ مع تكبير (opacity 0→1، scale .92→1).
  final Animation<double> popOpacity;
  final Animation<double> popScale;

  /// `og-pulse` — نبض الهالة البيضاء (opacity .35→.9، scale .94→1.04).
  final Animation<double> pulseOpacity;
  final Animation<double> pulseScale;

  // ═══ ألوان تتبع المظهر ═══
  //
  // [CRITICAL] كانت الثلاثة مثبَّتة لوضعٍ فاتح: نصٌّ شبه أسود وهالة **بيضاء**
  // خلف الشعار. على خلفية داكنة يختفي النصّ، وتظهر الهالة قرصاً أبيض خلف
  // شعارٍ شفّاف — وهو بالضبط ما يُقرأ «شعار بخلفية».

  static const _titleLight = Color(0xFF1B1036);
  static const _titleDark = Color(0xFFF7F4FF);
  static const _taglineLight = Color(0xFF7A6F9C);
  static const _taglineDark = Color(0xFFB3A9CF);

  /// لون الهالة النابضة خلف الشعار.
  ///
  /// [CRITICAL] ليست خلفيةً للشعار بل توهّجٌ حوله. في الوضع الفاتح تبقى
  /// بيضاء كما في المرجع؛ وفي الداكن تصير توهّجاً نيلياً خافتاً. الشعار
  /// نفسه لا يُعاد تلوينه.
  ///
  /// بعد انتقال الأصل إلى العلامة المربّعة بأرضيتها لم تعد الهالة تُرى
  /// **خلف** العمل الفني بل حوله وحده: البلاطة ١٢٤ معتمة داخل مربّعٍ ١٥٠،
  /// فما يظهر منها إطارٌ رفيع لا قرص. أُبقيت القيم كما هي — تغييرُها
  /// تغييرٌ لسلوك شاشة البداية، وهو خارج نطاق استبدال الأصل.
  ///
  /// [CRITICAL] شدّة الهالة الداكنة مقيسة لا مُقدَّرة. العمل الفني بنفسجي
  /// متوسّط (#A35BBF)، فهالةٌ بنفسجية ساطعة تبتلعه: القياس عند ذروة النبض
  /// أعطى **1.23:1** بين الشعار والهالة — أي شعارٌ يكاد يختفي. النيلي
  /// (`AppColors.indigo`) بنصف شفافية يُبقيها **3.35:1** في أسوأ لحظة،
  /// فيبقى التوهّج محسوساً والشعار مقروءاً.
  static Color _haloColor(bool isDark) =>
      isDark ? const Color(0x803B2FA8) : const Color(0xF2FFFFFF);

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final halo = _haloColor(isDark);
    return FadeTransition(
      opacity: popOpacity,
      child: ScaleTransition(
        scale: popScale,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox.square(
              dimension: 150,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  // هالة نابضة خلف الشعار — بلون يتبع المظهر.
                  FadeTransition(
                    opacity: pulseOpacity,
                    child: ScaleTransition(
                      scale: pulseScale,
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: RadialGradient(
                            colors: [halo, halo.withAlpha(0)],
                            stops: const [0, 0.7],
                          ),
                        ),
                        child: const SizedBox.square(dimension: 150),
                      ),
                    ),
                  ),
                  // الشعار — نفس صورة الترويسة (124px).
                  //
                  // [STAGE 12] أُزيل الظلّ والزوايا المستديرة، وقفل المرحلة ٠١
                  // يمنع الظلّ والهالة على العلامة صراحةً. القرار قائم كما هو
                  // بعد انتقال الأصل إلى العلامة المربّعة بأرضيتها: الأرضية
                  // جزءٌ من العلامة المعتمدة، لا رخصةً لإعادة الظلّ فوقها.
                  const OtakuStoreLogo(size: 124),
                ],
              ),
            ),
            const SizedBox(height: 20),
            Text(
              context.strings('brandName'),
              style: TextStyle(
                fontFamily: 'Tajawal',
                // نصٌّ مترجَم بـTextStyle جديد: لا يرث احتياط الثيم فيُذكر صراحةً.
                fontFamilyFallback: kArabicScriptFallback,
                fontSize: 27,
                fontWeight: AppDimens.weightBlack,
                letterSpacing: -0.5,
                color: isDark ? _titleDark : _titleLight,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              context.strings('splashTagline'),
              style: TextStyle(
                fontSize: 13,
                letterSpacing: 0.26,
                color: isDark ? _taglineDark : _taglineLight,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
