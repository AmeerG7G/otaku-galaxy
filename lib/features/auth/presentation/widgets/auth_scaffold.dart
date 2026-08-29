import 'package:flutter/material.dart';

import '../../../../core/design_system/design_system.dart';

/// هيكل شاشات المصادقة بتصميم Otaku Galaxy v2.
///
/// رأس متدرّج (وردي → بنفسجي → أزرق فاتح) بزوايا سفلية كبيرة، يحمل الشعار
/// والعنوان، تعلوه بطاقة نموذج بيضاء عائمة تتداخل مع الرأس. المحتوى يتدفّق
/// من الأعلى فلا تبقى مساحة فارغة كبيرة أسفل الشاشة.
class AuthScaffold extends StatelessWidget {
  const AuthScaffold({
    super.key,
    required this.title,
    required this.subtitle,
    required this.form,
    this.footer,
    this.showBack = false,
    this.artwork,
    this.artworkHeight = 190,
    this.artworkWidth = 142,
    this.artworkBottom = -12,
    this.ctaArtWidth = 84,
  });

  final String title;
  final String subtitle;

  /// محتوى بطاقة النموذج العائمة.
  final Widget form;

  /// إجراءات أسفل البطاقة (تبديل تسجيل/دخول، تصفح كزائر...).
  final Widget? footer;

  final bool showBack;

  /// رسم شخصية اختياري داخل الرأس — يُقصّ بحافة الرأس ويبقى خلف المحتوى.
  ///
  /// المصدر يضعه دائماً على اليسار الفيزيائي (`left`)، أي جهة النهاية في
  /// واجهة عربية.
  final String? artwork;

  /// صندوق رسم الرأس وإزاحته السفلية — تختلف لكل شاشة في المصدر.
  ///
  /// المصدر يحدّد `width` و`height` معاً مع `background-size:contain`، فلا
  /// يكفي تقييد الارتفاع وحده وإلا اتّسع الرسم أفقياً وطغى على العنوان.
  final double artworkHeight;
  final double artworkWidth;
  final double artworkBottom;

  /// عرض الرسم الصغير المتدلّي من زاوية بطاقة النموذج (٩٦ لشاشة الرمز).
  final double ctaArtWidth;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final headerInk = isDark ? const Color(0xFFF9F6FF) : const Color(0xFF22133F);
    final headerInk2 = isDark
        ? const Color(0xFFBCB0E2)
        : const Color(0xFF5A4A7D);

    return Scaffold(
      body: Container(
        decoration: BoxDecoration(gradient: colors.surfaceGradient),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // ── الرأس المتدرّج ──
              ClipRRect(
                borderRadius: const BorderRadius.only(
                  bottomLeft: Radius.circular(42),
                  bottomRight: Radius.circular(42),
                ),
                child: Container(
                  height: 214,
                  decoration: BoxDecoration(
                    gradient: isDark
                        ? AppThemeColors.authGradientDark
                        : AppThemeColors.authGradientLight,
                  ),
                  child: Stack(
                    children: [
                      // هالة ناعمة أعلى جهة النهاية.
                      PositionedDirectional(
                        top: -70,
                        end: -50,
                        child: Container(
                          width: 210,
                          height: 210,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: RadialGradient(
                              colors: [
                                Colors.white.withValues(alpha: 0.35),
                                Colors.white.withValues(alpha: 0),
                              ],
                            ),
                          ),
                        ),
                      ),
                      // رسم الشخصية يُقصّ بحافة الرأس ويبقى خلف النص.
                      if (artwork != null)
                        PositionedDirectional(
                          bottom: artworkBottom,
                          end: -34,
                          child: SizedBox(
                            width: artworkWidth,
                            height: artworkHeight,
                            child: Image.asset(
                              artwork!,
                              fit: BoxFit.contain,
                              alignment: Alignment.bottomCenter,
                            ),
                          ),
                        ),
                      SafeArea(
                        bottom: false,
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(22, 16, 22, 0),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  if (showBack)
                                    _GlassIconButton(
                                      icon: Icons.arrow_forward,
                                      onTap: () => Navigator.of(context).pop(),
                                    ),
                                  if (showBack)
                                    const SizedBox(width: AppDimens.space3),
                                  const OtakuStoreLogoSimple(size: 38),
                                ],
                              ),
                              const SizedBox(height: AppDimens.space5),
                              ConstrainedBox(
                                constraints: const BoxConstraints(maxWidth: 240),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      title,
                                      style: Theme.of(context)
                                          .textTheme
                                          .headlineSmall
                                          ?.copyWith(
                                            fontSize: 26,
                                            fontWeight: AppDimens.weightBlack,
                                            color: headerInk,
                                          ),
                                    ),
                                    const SizedBox(height: AppDimens.space2),
                                    Text(
                                      subtitle,
                                      style: Theme.of(context)
                                          .textTheme
                                          .bodySmall
                                          ?.copyWith(
                                            fontSize: 13,
                                            height: 1.7,
                                            color: headerInk2,
                                          ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),

              // ── بطاقة النموذج العائمة (تتداخل مع الرأس) ──
              Transform.translate(
                offset: const Offset(0, -28),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 18),
                  child: Stack(
                    clipBehavior: Clip.none,
                    children: [
                      Container(
                        padding: const EdgeInsets.fromLTRB(20, 24, 20, 22),
                        decoration: BoxDecoration(
                          color: Theme.of(context).colorScheme.surface,
                          borderRadius: BorderRadius.circular(
                            AppDimens.radiusLg,
                          ),
                          border: Border.all(
                            color: Theme.of(context).colorScheme.outlineVariant,
                          ),
                          boxShadow: colors.shadowFloating,
                        ),
                        child: form,
                      ),
                      // رسم صغير يتدلّى من زاوية البطاقة فوق زر الإجراء،
                      // كما في `ctaArtStyle` بالمصدر.
                      PositionedDirectional(
                        bottom: -26,
                        end: -18,
                        child: IgnorePointer(
                          child: Opacity(
                            opacity: 0.95,
                            child: Image.asset(
                              'assets/art/opt/a-i3.png',
                              width: ctaArtWidth,
                              fit: BoxFit.contain,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),

              if (footer != null)
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 26),
                  child: footer!,
                )
              else
                const SizedBox(height: AppDimens.space6),
            ],
          ),
        ),
      ),
    );
  }
}

class _GlassIconButton extends StatelessWidget {
  const _GlassIconButton({required this.icon, required this.onTap});

  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white.withValues(alpha: 0.28),
      borderRadius: BorderRadius.circular(AppDimens.radiusXs),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppDimens.radiusXs),
        child: SizedBox(
          width: 38,
          height: 38,
          child: Icon(
            icon,
            size: AppDimens.iconMd,
            color: Theme.of(context).brightness == Brightness.dark
                ? const Color(0xFFF3EFFF)
                : const Color(0xFF2A1A4D),
          ),
        ),
      ),
    );
  }
}
