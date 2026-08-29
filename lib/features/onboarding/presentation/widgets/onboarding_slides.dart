import 'package:flutter/material.dart';

import '../../../../core/design_system/design_system.dart';

/// تركيبات شرائح التعريف الثلاث.
///
/// كل شريحة مبنيّة على حدة لأن مصدر التصميم يعطي كلاً منها تخطيطاً مختلفاً:
/// الأولى نصّها أسفل الشريحة فوق تدرّج، والثانية والثالثة نصّهما أعلاها.
/// العناصر الطافية تختلف أيضاً: بطاقة نصّية، بطاقة منتج مصغّرة وكبسولة،
/// ثم بطاقة بأيقونة وفاصل.
///
/// المواضع في المصدر فيزيائية (`left`/`right`) ولا تنعكس مع اتجاه النص،
/// لذا تُترجم هنا: `right` ← `start` و`left` ← `end` في واجهة عربية.

// ═══════════════ عناصر مشتركة ═══════════════

/// سطح أبيض عائم بحافة وظلّ — أساس كل العناصر الطافية في التعريف.
class OnboardingFloatingSurface extends StatefulWidget {
  const OnboardingFloatingSurface({
    super.key,
    required this.child,
    required this.padding,
    required this.radius,
    this.width,
    this.floatSeconds = 5,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final double radius;
  final double? width;

  /// مدّة دورة الطفو — تختلف لكل عنصر في المصدر حتى لا تتزامن.
  final int floatSeconds;

  @override
  State<OnboardingFloatingSurface> createState() =>
      _OnboardingFloatingSurfaceState();
}

class _OnboardingFloatingSurfaceState extends State<OnboardingFloatingSurface>
    with SingleTickerProviderStateMixin {
  late final AnimationController _float = AnimationController(
    vsync: this,
    duration: Duration(seconds: widget.floatSeconds),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _float.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;

    return AnimatedBuilder(
      animation: _float,
      builder: (context, child) => Transform.translate(
        offset: Offset(0, -10 * _float.value),
        child: child,
      ),
      child: Container(
        width: widget.width,
        padding: widget.padding,
        decoration: BoxDecoration(
          color: theme.colorScheme.surface,
          borderRadius: BorderRadius.circular(widget.radius),
          border: Border.all(color: theme.colorScheme.outlineVariant),
          boxShadow: colors.shadowFloating,
        ),
        child: widget.child,
      ),
    );
  }
}

/// كتلة العنوان والوصف. المصدر يستخدم ٣٠px للشريحة الأولى و٢٩px للأخريين.
class OnboardingSlideText extends StatelessWidget {
  const OnboardingSlideText({
    super.key,
    required this.title,
    required this.body,
    this.titleSize = 29,
    this.titleWidthFactor = 0.86,
    this.bodyWidthFactor = 0.88,
    this.gap = 10,
  });

  final String title;
  final String body;
  final double titleSize;
  final double titleWidthFactor;
  final double bodyWidthFactor;
  final double gap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        FractionallySizedBox(
          widthFactor: titleWidthFactor,
          child: Text(
            title,
            style: theme.textTheme.headlineMedium?.copyWith(
              fontFamily: 'Tajawal',
              fontSize: titleSize,
              height: 1.3,
              letterSpacing: -0.6,
              fontWeight: AppDimens.weightBlack,
              color: theme.colorScheme.onSurface,
            ),
          ),
        ),
        SizedBox(height: gap),
        FractionallySizedBox(
          widthFactor: bodyWidthFactor,
          child: Text(
            body,
            style: theme.textTheme.bodyMedium?.copyWith(
              fontSize: 14.5,
              height: 1.85,
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ),
      ],
    );
  }
}

/// رسم تزييني — يختفي بهدوء إن تعذّر تحميله بدل كسر الشاشة.
class _Art extends StatelessWidget {
  const _Art({required this.asset, this.height, this.width});

  final String asset;
  final double? height;
  final double? width;

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Image.asset(
        asset,
        height: height,
        width: width,
        fit: BoxFit.contain,
        errorBuilder: (_, _, _) => const SizedBox.shrink(),
      ),
    );
  }
}

/// دائرة توهّج خلف الرسم. زوايا CSS فيزيائية، فالتدرّج فيزيائي هنا أيضاً.
class _Glow extends StatelessWidget {
  const _Glow({required this.size, required this.from, required this.to});

  final double size;
  final Color from;
  final Color to;

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: LinearGradient(
            colors: [from, to],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
      ),
    );
  }
}

// ═══════════════ الشريحة ١ ═══════════════

/// «أهلاً بك في مجرة الأوتاكو» — الرسم أعلى جهة البداية والنصّ أسفل الشريحة.
class OnboardingSlideOne extends StatelessWidget {
  const OnboardingSlideOne({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return LayoutBuilder(
      builder: (context, constraints) {
        return Stack(
          clipBehavior: Clip.hardEdge,
          children: [
            const PositionedDirectional(
              top: 24,
              start: -64,
              child: _Glow(
                size: 270,
                from: Color(0x33FF3D8F),
                to: Color(0x297C5CFF),
              ),
            ),
            PositionedDirectional(
              top: 6,
              start: -30,
              child: _Art(
                asset: 'assets/art/opt/gojo-l.png',
                height: constraints.maxHeight * 0.78,
              ),
            ),
            PositionedDirectional(
              top: 122,
              end: 15,
              child: OnboardingFloatingSurface(
                padding: const EdgeInsets.symmetric(
                  horizontal: 15,
                  vertical: 12,
                ),
                radius: 18,
                child: ConstrainedBox(
                  constraints: BoxConstraints(
                    maxWidth: (constraints.maxWidth * 0.62).clamp(150.0, 215.0),
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'منتجات حصرية',
                        style: theme.textTheme.labelLarge?.copyWith(
                          fontSize: 15,
                          height: 1.35,
                          fontWeight: AppDimens.weightExtraBold,
                          color: theme.colorScheme.onSurface,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'حقائب، اكسسوارات، ملابس',
                        style: theme.textTheme.bodyMedium?.copyWith(
                          fontSize: 15,
                          height: 1.35,
                          // يقابل ‎font-weight:200 في المصدر.
                          fontWeight: FontWeight.w300,
                          color: theme.colorScheme.onSurface,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            // النصّ أسفل الشريحة فوق تدرّج يفصله عن الرسم.
            PositionedDirectional(
              start: 0,
              end: 0,
              bottom: 0,
              child: Container(
                padding: const EdgeInsets.fromLTRB(24, 26, 24, 8),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [
                      theme.colorScheme.surfaceContainerLowest.withValues(
                        alpha: 0,
                      ),
                      theme.colorScheme.surfaceContainerLowest,
                    ],
                    stops: const [0, 0.34],
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                  ),
                ),
                child: const OnboardingSlideText(
                  title: 'أهلاً بك في مجرة الأوتاكو',
                  body:
                      'متجر عربي متكامل لعشّاق الأنمي: ملابس، إكسسوارات، حقائب '
                      'وقرطاسية بتصاميم مختارة.',
                  titleSize: 30,
                  titleWidthFactor: 0.88,
                  bodyWidthFactor: 0.9,
                  gap: 12,
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

// ═══════════════ الشريحة ٢ ═══════════════

/// «كل ما يخص عالمك، بمكان واحد» — النصّ أعلى الشريحة، والرسم يملأ أسفلها،
/// مع بطاقة منتج مصغّرة في جهة البداية وكبسولة جودة في جهة النهاية.
class OnboardingSlideTwo extends StatelessWidget {
  const OnboardingSlideTwo({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return LayoutBuilder(
      builder: (context, constraints) {
        return Stack(
          clipBehavior: Clip.hardEdge,
          children: [
            // توهّج ثم حلقة منقّطة، كلاهما في وسط الشريحة أفقياً.
            Positioned(
              top: 96,
              left: 0,
              right: 0,
              child: Center(
                child: _Glow(
                  size: 300,
                  from: const Color(0x337C5CFF),
                  to: const Color(0x244EA8FF),
                ),
              ),
            ),
            Positioned(
              top: 150,
              left: 0,
              right: 0,
              child: Center(
                child: IgnorePointer(
                  child: CustomPaint(
                    size: const Size.square(206),
                    painter: _DashedCirclePainter(
                      color: AppColors.primary.withValues(alpha: 0.30),
                    ),
                  ),
                ),
              ),
            ),

            // النصّ أعلى الشريحة.
            const PositionedDirectional(
              top: 30,
              start: 24,
              end: 24,
              child: OnboardingSlideText(
                title: 'كل ما يخص عالمك، بمكان واحد',
                body:
                    'منتجات حصرية ومبتكرة تلبي تطلعات كل أوتاكو يبحث عن التميز '
                    'والفرادة.',
              ),
            ),

            // الرسم يتجاوز عرض الشريحة (‎132%‎) ويثبت في الأسفل.
            Positioned(
              bottom: -6,
              left: 0,
              right: 0,
              child: Center(
                // المصدر يحكم هذا الرسم بالعرض (‎132%) ويترك الارتفاع طبيعياً،
                // فيملأ أسفل الشريحة ويُقصّ من الأعلى.
                child: _Art(
                  asset: 'assets/art/opt/trio-l.png',
                  width: constraints.maxWidth * 1.32,
                ),
              ),
            ),

            // بطاقة منتج مصغّرة — تلميح بصري لبطاقة المتجر الحقيقية.
            PositionedDirectional(
              bottom: 214,
              start: 10,
              child: OnboardingFloatingSurface(
                padding: const EdgeInsets.all(9),
                radius: 20,
                width: 112,
                floatSeconds: 6,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      height: 52,
                      decoration: BoxDecoration(
                        color: context.themeColors.photoSlot,
                        borderRadius: BorderRadius.circular(13),
                        border: Border.all(
                          color: theme.colorScheme.outlineVariant,
                        ),
                      ),
                      child: Center(
                        child: Icon(
                          Icons.image_outlined,
                          size: 20,
                          color: context.themeColors.photoSlotInk,
                        ),
                      ),
                    ),
                    const SizedBox(height: 9),
                    _Bar(widthFactor: 0.8, color: theme.colorScheme.outlineVariant),
                    const SizedBox(height: 6),
                    const _Bar(widthFactor: 0.44, color: AppColors.secondary),
                  ],
                ),
              ),
            ),

            // كبسولة الجودة بنقطة خضراء.
            PositionedDirectional(
              bottom: 150,
              end: 12,
              child: OnboardingFloatingSurface(
                padding: const EdgeInsets.symmetric(
                  horizontal: 13,
                  vertical: 9,
                ),
                radius: AppDimens.radiusFull,
                floatSeconds: 5,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 7,
                      height: 7,
                      decoration: const BoxDecoration(
                        shape: BoxShape.circle,
                        color: AppColors.success,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      'منتجات بجودة عالية',
                      style: theme.textTheme.labelSmall?.copyWith(
                        fontSize: 11.5,
                        fontWeight: AppDimens.weightSemiBold,
                        color: theme.colorScheme.onSurface,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

/// شريط رمادي/وردي صغير داخل بطاقة المنتج المصغّرة.
class _Bar extends StatelessWidget {
  const _Bar({required this.widthFactor, required this.color});

  final double widthFactor;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: AlignmentDirectional.centerStart,
      child: FractionallySizedBox(
        widthFactor: widthFactor,
        child: Container(
          height: 7,
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(4),
          ),
        ),
      ),
    );
  }
}

/// حلقة منقّطة — `border:1.5px dashed` في المصدر.
class _DashedCirclePainter extends CustomPainter {
  const _DashedCirclePainter({required this.color});

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5;

    final radius = size.width / 2;
    final center = Offset(radius, radius);
    // ‎36 شرطة بفجوات متساوية تعطي إيقاع dashed في المتصفّح.
    const dashes = 36;
    const sweep = 6.2831853 / dashes;
    for (var i = 0; i < dashes; i++) {
      final start = i * sweep;
      canvas.drawArc(
        Rect.fromCircle(center: center, radius: radius),
        start,
        sweep * 0.55,
        false,
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(_DashedCirclePainter oldDelegate) =>
      oldDelegate.color != color;
}

// ═══════════════ الشريحة ٣ ═══════════════

/// «اطلب اليوم، وادفع عند الاستلام» — النصّ أعلى الشريحة، الرسم أسفل جهة
/// النهاية، وبطاقة التوصيل في جهة البداية.
class OnboardingSlideThree extends StatelessWidget {
  const OnboardingSlideThree({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return LayoutBuilder(
      builder: (context, constraints) {
        return Stack(
          clipBehavior: Clip.hardEdge,
          children: [
            const PositionedDirectional(
              bottom: 20,
              end: -80,
              child: _Glow(
                size: 300,
                from: Color(0x334EA8FF),
                to: Color(0x297C5CFF),
              ),
            ),
            PositionedDirectional(
              bottom: -10,
              end: -30,
              child: _Art(
                asset: 'assets/art/opt/a-i0.png',
                height: constraints.maxHeight * 0.70,
              ),
            ),

            const PositionedDirectional(
              top: 28,
              start: 24,
              end: 24,
              child: OnboardingSlideText(
                title: 'اطلب اليوم، وادفع عند الاستلام',
                body:
                    'توصيل لكل المحافظات، والدفع نقداً عند وصول الطلب '
                    'لباب البيت.',
                titleWidthFactor: 0.84,
                bodyWidthFactor: 0.76,
              ),
            ),

            // بطاقة التوصيل: أيقونة وعنوان، فاصل، ثم سطر شرح.
            PositionedDirectional(
              top: 212,
              start: 18,
              child: OnboardingFloatingSurface(
                padding: const EdgeInsets.symmetric(
                  horizontal: 15,
                  vertical: 14,
                ),
                radius: 22,
                width: 172,
                floatSeconds: 6,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          width: 30,
                          height: 30,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: AppColors.success.withValues(alpha: 0.16),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: const Icon(
                            Icons.check_rounded,
                            size: 16,
                            color: AppColors.success,
                          ),
                        ),
                        const SizedBox(width: 9),
                        Expanded(
                          child: Text(
                            'توصيل لكل المحافظات',
                            style: theme.textTheme.labelMedium?.copyWith(
                              fontSize: 12,
                              height: 1.35,
                              fontWeight: AppDimens.weightBold,
                              color: theme.colorScheme.onSurface,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 11),
                    Container(
                      height: 1,
                      color: theme.colorScheme.outlineVariant,
                    ),
                    const SizedBox(height: 11),
                    Text(
                      'الدفع عند الاستلام، وتأكيد الطلب عبر واتساب.',
                      style: theme.textTheme.labelSmall?.copyWith(
                        fontSize: 11.5,
                        height: 1.6,
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}
