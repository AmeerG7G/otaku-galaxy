import 'package:flutter/material.dart';

import '../../../../core/design_system/design_system.dart';

/// صفحة نجاح الطلب بتصميم Otaku Galaxy v2.
///
/// رسم شخصية طافٍ في المنتصف، عنوان تحريري، كبسولة حالة ذهبية، ثم بطاقة
/// «الخطوات الجاية» مرقّمة — بديل حوار التأكيد المادي بالكامل.
class OrderSuccessView extends StatefulWidget {
  const OrderSuccessView({
    super.key,
    required this.onOpenOrders,
    required this.onKeepShopping,
  });

  final VoidCallback onOpenOrders;
  final VoidCallback onKeepShopping;

  @override
  State<OrderSuccessView> createState() => _OrderSuccessViewState();
}

class _OrderSuccessViewState extends State<OrderSuccessView>
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

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Stack(
      children: [
        // هالتان لونيتان في زاويتين متقابلتين.
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
                        child: Image.asset(
                          'assets/art/opt/a-i6.png',
                          width: 196,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'تم إرسال طلبك',
                        textAlign: TextAlign.center,
                        style: theme.textTheme.headlineSmall?.copyWith(
                          fontFamily: 'Tajawal',
                          fontWeight: AppDimens.weightBlack,
                          fontSize: 24,
                          letterSpacing: -0.4,
                        ),
                      ),
                      const SizedBox(height: 14),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 9,
                        ),
                        decoration: BoxDecoration(
                          color: AppColors.accent.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(
                            AppDimens.radiusFull,
                          ),
                          border: Border.all(
                            color: AppColors.accent.withValues(alpha: 0.32),
                          ),
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
                            Text(
                              'بانتظار الموافقة',
                              style: theme.textTheme.labelMedium?.copyWith(
                                fontSize: 12.5,
                                fontWeight: AppDimens.weightBold,
                                color: AppColors.accent,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),
                      ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 290),
                        child: Text(
                          'راح نتواصل معك عبر واتساب لتأكيد التفاصيل، وبعد '
                          'الموافقة يصير الطلب قيد التجهيز.',
                          textAlign: TextAlign.center,
                          style: theme.textTheme.bodyMedium?.copyWith(
                            fontSize: 13.5,
                            height: 1.9,
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                      ),
                      const SizedBox(height: 22),
                      OtakuPanel(
                        padding: const EdgeInsets.all(18),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'الخطوات الجاية',
                              style: theme.textTheme.titleSmall?.copyWith(
                                fontFamily: 'Tajawal',
                                fontSize: 14.5,
                                fontWeight: AppDimens.weightExtraBold,
                              ),
                            ),
                            const SizedBox(height: 14),
                            for (final (index, label) in const [
                              'مراجعة الطلب من الإدارة',
                              'تأكيد عبر واتساب',
                              'التجهيز والتوصيل',
                            ].indexed) ...[
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
                      label: 'طلباتي',
                      onPressed: widget.onOpenOrders,
                      height: AppDimens.buttonHeightXl,
                      borderRadius: AppDimens.radiusMd,
                      gradient: AppColors.ctaGradient,
                    ),
                    const SizedBox(height: 10),
                    AnimeTextButton(
                      label: 'متابعة التسوق',
                      onPressed: widget.onKeepShopping,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
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
            // المرجع يستخدم الأرقام العربية-الهندية: ١ ٢ ٣.
            const ['١', '٢', '٣'][number - 1],
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
