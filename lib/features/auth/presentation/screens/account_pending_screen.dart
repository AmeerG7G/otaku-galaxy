import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/l10n/app_strings.dart';
import '../../../../core/router/app_router.dart';
import '../../../visuals/domain/visual_slot.dart';
import '../../../visuals/presentation/character_artwork.dart';
import '../../domain/entities/account_request.dart';

/// شاشة «طلبك قيد المراجعة» — بعد التسجيل وبعد نسيان كلمة المرور.
///
/// ═══ القرار ═══ لا رمز SMS ولا بريد: الطلب تحسمه الإدارة يدوياً بعد
/// تحقّق واتساب. هذه الشاشة تقول ذلك بوضوح وتنتهي — لا حقل رمز، لا عدّاد
/// إعادة إرسال، لا انتظار داخل التطبيق. الزبون يعود لتسجيل الدخول متى
/// بلّغته الإدارة.
///
/// التصميم هو تصميم شاشة نجاح الطلب نفسه (`OrderSuccessView`): رسمٌ طافٍ،
/// عنوان، كبسولة حالة، ملاحظة، ثم «الخطوات الجاية» — الزبون يعرف هذا
/// النمط من الطلبات، ونفس الوعد: «سنتواصل معك عبر واتساب».
@RoutePage()
class AccountPendingScreen extends StatefulWidget {
  const AccountPendingScreen({super.key, required this.kind});

  final AccountRequestKind kind;

  @override
  State<AccountPendingScreen> createState() => _AccountPendingScreenState();
}

class _AccountPendingScreenState extends State<AccountPendingScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _float = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 4600),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _float.dispose();
    super.dispose();
  }

  bool get _isRegistration => widget.kind == AccountRequestKind.registration;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final steps = _isRegistration
        ? [
            context.strings('stepAdminContactsWhatsapp'),
            context.strings('stepAdminApprovesAccount'),
            context.strings('stepLoginWithPassword'),
          ]
        : [
            context.strings('stepAdminContactsWhatsapp'),
            context.strings('stepAdminSetsPassword'),
            context.strings('stepLoginWithNewPassword'),
          ];

    return Scaffold(
      body: Stack(
        children: [
          PositionedDirectional(
            top: -90,
            start: -70,
            child: _Glow(color: AppColors.secondary, size: 280, opacity: 0.24),
          ),
          PositionedDirectional(
            bottom: -60,
            end: -80,
            child: _Glow(color: AppColors.primary, size: 260, opacity: 0.22),
          ),
          SafeArea(
            child: Column(
              children: [
                Expanded(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.fromLTRB(22, 36, 22, 12),
                    child: Column(
                      children: [
                        AnimatedBuilder(
                          animation: _float,
                          builder: (context, child) => Transform.translate(
                            offset: Offset(0, -10 * _float.value),
                            child: child,
                          ),
                          // موضعان مستقلّان لا فتحةُ شاشةِ الطلب: تبديل
                          // شخصية الانتظار لا يمسّ ترويسة إنشاء الحساب أو
                          // الاستعادة، والعكس (الهجرة ٠٥٤).
                          child: CharacterArtwork(
                            slot: _isRegistration
                                ? VisualSlots.registerPending
                                : VisualSlots.forgotPasswordPending,
                            width: 235,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          context.strings(
                            _isRegistration
                                ? 'accountPendingTitle'
                                : 'resetPendingTitle',
                          ),
                          textAlign: TextAlign.center,
                          style: theme.textTheme.headlineSmall?.copyWith(
                            fontFamily: 'Tajawal',
                            fontWeight: AppDimens.weightBlack,
                            fontSize: 22,
                            letterSpacing: -0.4,
                          ),
                        ),
                        const SizedBox(height: 14),
                        _StatusCapsule(
                          label: context.strings('pendingAdminReview'),
                        ),
                        const SizedBox(height: 16),
                        ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 300),
                          child: Text(
                            context.strings(
                              _isRegistration
                                  ? 'accountPendingBody'
                                  : 'resetPendingBody',
                            ),
                            textAlign: TextAlign.center,
                            style: theme.textTheme.bodyMedium?.copyWith(
                              fontSize: 13.5,
                              height: 1.9,
                              color: theme.colorScheme.onSurfaceVariant,
                            ),
                          ),
                        ),
                        // لا جملة عن «رمز التحقق» هنا: لا رمز أصلاً، وذكرُ
                        // غيابه يُدخل المفهوم الذي أُزيل. أُزيلت بطلب المنتج.
                        const SizedBox(height: 22),
                        OtakuPanel(
                          padding: const EdgeInsets.all(18),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                context.strings('nextSteps'),
                                style: theme.textTheme.titleSmall?.copyWith(
                                  fontFamily: 'Tajawal',
                                  fontSize: 14.5,
                                  fontWeight: AppDimens.weightExtraBold,
                                ),
                              ),
                              const SizedBox(height: 14),
                              for (final (index, label) in steps.indexed) ...[
                                if (index > 0) const SizedBox(height: 13),
                                _StepRow(number: index + 1, label: label),
                              ],
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(22, 12, 22, 20),
                  child: Column(
                    children: [
                      AnimePrimaryButton(
                        label: context.strings('backToLogin'),
                        onPressed: () =>
                            context.router.replaceAll([const LoginRoute()]),
                        height: AppDimens.buttonHeightXl,
                        borderRadius: AppDimens.radiusMd,
                        gradient: AppColors.ctaGradient,
                      ),
                      const SizedBox(height: 10),
                      AnimeTextButton(
                        label: context.strings('continueShopping'),
                        onPressed: () => context.router.replaceAll([
                          const MainNavigationRoute(),
                        ]),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusCapsule extends StatelessWidget {
  const _StatusCapsule({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    // [CRITICAL] `Flexible` + التفاف: الكبسولة نفسها في شاشة الطلب تحمل
    // «بانتظار الموافقة» القصيرة، أمّا «چاوەڕوانی پێداچوونەوەی بەڕێوەبەرایەتی»
    // فتفيض عن عرض الهاتف لو بقي الصفّ صلباً — وقد فاض فعلاً في الاختبار.
    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 320),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
        decoration: BoxDecoration(
          color: AppColors.accent.withValues(alpha: 0.15),
          borderRadius: BorderRadius.circular(AppDimens.radiusLg),
          border: Border.all(color: AppColors.accent.withValues(alpha: 0.32)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 7,
              height: 7,
              decoration: const BoxDecoration(
                color: AppColors.accent,
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: 9),
            Flexible(
              child: Text(
                label,
                textAlign: TextAlign.center,
                softWrap: true,
                style: theme.textTheme.labelMedium?.copyWith(
                  fontSize: 12.5,
                  fontWeight: AppDimens.weightBold,
                  color: AppColors.accent,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StepRow extends StatelessWidget {
  const _StepRow({required this.number, required this.label});

  final int number;
  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      children: [
        Container(
          width: 26,
          height: 26,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: theme.colorScheme.surfaceContainerHighest,
            borderRadius: BorderRadius.circular(9),
            border: Border.all(color: theme.colorScheme.outlineVariant),
          ),
          child: Text(
            context.strings(
              ['stepNumeral1', 'stepNumeral2', 'stepNumeral3'][number - 1],
            ),
            style: theme.textTheme.labelSmall?.copyWith(
              fontSize: 12,
              fontWeight: AppDimens.weightExtraBold,
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            label,
            style: theme.textTheme.bodyMedium?.copyWith(
              fontSize: 13,
              height: 1.5,
            ),
          ),
        ),
      ],
    );
  }
}

class _Glow extends StatelessWidget {
  const _Glow({required this.color, required this.size, required this.opacity});

  final Color color;
  final double size;
  final double opacity;

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: RadialGradient(
            colors: [
              color.withValues(alpha: opacity),
              color.withValues(alpha: 0),
            ],
            stops: const [0, 0.68],
          ),
        ),
      ),
    );
  }
}
