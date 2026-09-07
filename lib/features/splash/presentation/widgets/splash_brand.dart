import 'package:flutter/material.dart';

import '../../../../core/constants/app_constants.dart';
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

  /// ألوان نصّ المرجع الثابتة (لا تعتمد على السمة).
  static const _titleColor = Color(0xFF1B1036);
  static const _taglineColor = Color(0xFF7A6F9C);

  @override
  Widget build(BuildContext context) {
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
                  // هالة بيضاء نابضة خلف الشعار.
                  FadeTransition(
                    opacity: pulseOpacity,
                    child: ScaleTransition(
                      scale: pulseScale,
                      child: const DecoratedBox(
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: RadialGradient(
                            colors: [
                              Color(0xF2FFFFFF),
                              Color(0x00FFFFFF),
                            ],
                            stops: [0, 0.7],
                          ),
                        ),
                        child: SizedBox.square(dimension: 150),
                      ),
                    ),
                  ),
                  // الشعار — نفس صورة الترويسة (124px، زوايا 34).
                  const DecoratedBox(
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.all(Radius.circular(34)),
                      boxShadow: [
                        BoxShadow(
                          color: Color(0x424A2C8C),
                          blurRadius: 44,
                          offset: Offset(0, 20),
                        ),
                      ],
                    ),
                    child: OtakuStoreLogo(
                      size: 124,
                      cornerRadius: 34,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            Text(
              AppConstants.appName,
              style: TextStyle(
                fontFamily: 'Tajawal',
                fontSize: 27,
                fontWeight: AppDimens.weightBlack,
                letterSpacing: -0.5,
                color: _titleColor,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'عالم الأنمي بين يديك',
              style: TextStyle(
                fontSize: 13,
                letterSpacing: 0.26,
                color: _taglineColor,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
