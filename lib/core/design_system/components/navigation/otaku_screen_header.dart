import 'dart:ui';

import 'package:flutter/material.dart';

import '../../tokens/app_dimens.dart';
import '../../tokens/app_theme_colors.dart';
import '../../../../features/visuals/presentation/character_artwork.dart';

/// نمط ترويسة الشاشة في تصميم Otaku Galaxy v2.
enum OtakuHeaderVariant {
  /// ترويسة على خلفية الصفحة مع عنوان كبير وسطر وصفي.
  plain,

  /// ترويسة مضغوطة بعنوان في سطر واحد مع إجراء جانبي.
  compact,

  /// ترويسة تبويب رئيسي — عنوان تحريري كبير بلا زر رجوع.
  tab,

  /// ترويسة متدرّجة اللون بحبر أبيض وعنوان تحريري كبير.
  gradient,
}

/// ترويسة الشاشات في Otaku Galaxy v2 — تحلّ محل `AppBar` تماماً.
  ///
  /// لا يوجد في التصميم أي شريط تطبيق مادي: الشاشات تبدأ بترويسة
  /// مؤلَّفة من زر رجوع مربّع مستدير، عنوان بخط Tajawal ثقيل، وسطر
  /// وصفي، مع هالة لونية أو رسم شخصية تزييني خلف المحتوى.
  class OtakuScreenHeader extends StatelessWidget {
    const OtakuScreenHeader({
      super.key,
      required this.title,
      this.subtitle,
      this.onBack,
      this.actions = const [],
      this.trailing,
      this.artwork,
      this.artworkSlot,
      this.artworkWidth,
      this.artworkEnd,
    this.artworkBelowStatusBar = false,
      this.gradient,
      this.variant = OtakuHeaderVariant.plain,
      this.leading,
      this.bottom,
    });

  /// ترويسة متدرّجة اللون — تُستخدم لشاشات الأقسام وصفحات البطل.
  const OtakuScreenHeader.gradient({
    super.key,
    required this.title,
    required Gradient this.gradient,
    this.subtitle,
    this.onBack,
    this.actions = const [],
    this.trailing,
    this.artwork,
    this.artworkSlot,
    this.artworkWidth,
    this.artworkEnd,
    this.artworkBelowStatusBar = false,
    this.leading,
    this.bottom,
  }) : variant = OtakuHeaderVariant.gradient;

  /// ترويسة تبويب رئيسي — عنوان بحجم ٢٦ بلا زر رجوع.
  const OtakuScreenHeader.tab({
    super.key,
    required this.title,
    this.subtitle,
    this.actions = const [],
    this.trailing,
    this.artwork,
    this.artworkSlot,
    this.artworkWidth,
    this.artworkEnd,
    this.artworkBelowStatusBar = false,
    this.bottom,
  }) : variant = OtakuHeaderVariant.tab,
       onBack = null,
       leading = null,
       gradient = null;

  /// ترويسة مضغوطة بسطر واحد — للشاشات ذات الإجراء الجانبي.
  const OtakuScreenHeader.compact({
    super.key,
    required this.title,
    this.onBack,
    this.actions = const [],
    this.trailing,
    this.artwork,
    this.artworkSlot,
    this.artworkWidth,
    this.artworkEnd,
    this.artworkBelowStatusBar = false,
    this.leading,
    this.bottom,
  }) : variant = OtakuHeaderVariant.compact,
       subtitle = null,
       gradient = null;

  final String title;
  final String? subtitle;
  final VoidCallback? onBack;

  /// أزرار أيقونية تظهر بجوار زر الرجوع.
  final List<Widget> actions;

  /// عنصر يظهر في نهاية سطر العنوان (نص إجراء عادةً).
  final Widget? trailing;

  /// رسم شخصية تزييني خلف الترويسة.
  final String? artwork;

  /// مفتاح موضع الرسم (`VisualSlots`) — صورته الثابتة في `CharacterArt`.
  ///
  /// حين يُمرَّر يحدّد الموضعُ صورته ولا يلزم [artwork] (المسار المباشر لرسمٍ
  /// ليس موضعاً). المقاس والموضع كما هما.
  final String? artworkSlot;

  /// رسمٌ يُعرض: موضعٌ بصورته الثابتة، أو مسارٌ مباشر.
  bool get _hasArtwork => artworkSlot != null || artwork != null;

  /// عرض الرسم التزييني (الشخصية). الافتراضي [defaultArtworkWidth].
  final double? artworkWidth;

  /// إزاحة الرسم من جهة النهاية (RTL: اليسار). الافتراضي [defaultArtworkEnd].
  final double? artworkEnd;

  /// يبدأ الرسم تحت شريط الحالة لا فوقه.
  ///
  /// الافتراضي `false`: الرسم يبدأ ١٤ فوق حافة الترويسة العليا كما في المرجع
  /// — وحين تكون الترويسة أعلى الشاشة (بلا `SafeArea` خارجها) يقع رأس
  /// الشخصية تحت أيقونات البطارية والشبكة ويُقصّ طرفه عند حافة الشاشة. `true`
  /// يضع حافة الرسم العليا عند أسفل شريط الحالة تماماً
  /// (`MediaQuery.paddingOf(context).top`)، فلا تداخل ولا قصّ من الأعلى. تختاره
  /// الشاشة التي تحتاجه؛ لا يتغيّر شيءٌ لغيرها.
  final bool artworkBelowStatusBar;

  /// عرض الرسم حين لا تحدّد الشاشة [artworkWidth].
  static const double defaultArtworkWidth = 126;

  /// إزاحة الرسم من جهة النهاية حين لا تحدّد الشاشة [artworkEnd].
  static const double defaultArtworkEnd = -40;

  /// حافة الرسم العليا الافتراضية — ١٤ فوق حافة الترويسة.
  static const double defaultArtworkTop = -14;

  final Gradient? gradient;
  final OtakuHeaderVariant variant;

  /// بديل زر الرجوع (شعار مثلاً).
  final Widget? leading;

  /// محتوى إضافي أسفل العنوان داخل الترويسة.
  final Widget? bottom;

  bool get _onGradient => variant == OtakuHeaderVariant.gradient;

  // [CRITICAL] لا ستارة داكنة فوق التدرّج — أُزيلت عمداً.
  //
  // كانت `ColoredBox(Colors.black @ 0.28)` تملأ الترويسة فوق تدرّج القسم،
  // فيظهر لون القسم داخل ترويسته أغمقَ وأبهتَ من اللون نفسه خارجها (في
  // بطاقة القسم وشريط الرئيسية). التدرّج الآن هو تدرّج الهوية كما هو،
  // مطابقاً لمصدر التصميم الذي لا يعرف هذه الستارة أصلاً:
  // `catHeadStyle: background:${grad}` وحده (المرجع، سطر ٤٣٤٥).
  //
  // [NOTE] الستارة كانت مضافةً لسبب: التباين. الحبر أبيض، وأفتحُ تدرّجات
  // الأقسام (الكهرماني `#FFB02E`) يعطي مع الأبيض **1.83:1**، وكانت الستارة
  // ترفعه إلى **3.46:1** أي فوق حدّ WCAG AA للنص الكبير (3:1). بإزالتها
  // يعود الأسوأ إلى 1.83:1 — دون الحدّ. القرار صريح من صاحب المنتج
  // (اللون الحيّ أولى)، والمرجع نفسه على هذا. ولو أُريد التباين لاحقاً بلا
  // إعادة التبهيت فالمخرج ظلٌّ على النصّ أو ستارةٌ محصورة خلف سطر العنوان
  // وحده، لا طبقةٌ تغطّي التدرّج كلّه.

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final onInk = _onGradient ? Colors.white : theme.colorScheme.onSurface;
    final onInk2 = _onGradient
        // يخفت قليلاً فقط؛ التخفيت الشديد كان يهبط بتباين العنوان الفرعي.
        ? Colors.white.withValues(alpha: 0.94)
        : theme.colorScheme.onSurfaceVariant;

    final padding = switch (variant) {
      OtakuHeaderVariant.gradient => const EdgeInsets.fromLTRB(18, 18, 18, 22),
      OtakuHeaderVariant.compact => const EdgeInsets.fromLTRB(18, 18, 18, 10),
      OtakuHeaderVariant.tab => const EdgeInsets.fromLTRB(18, 26, 18, 6),
      OtakuHeaderVariant.plain => const EdgeInsets.fromLTRB(18, 18, 18, 6),
    };

    final hasControls = onBack != null || leading != null || actions.isNotEmpty;

    return Container(
      decoration: BoxDecoration(gradient: gradient),
      clipBehavior: gradient != null || _hasArtwork
          ? Clip.hardEdge
          : Clip.none,
      child: Stack(
        children: [
          // هالة بيضاء ناعمة خلف الترويسة المتدرّجة.
          if (_onGradient)
            PositionedDirectional(
              top: -60,
              end: -40,
              child: Container(
                width: 190,
                height: 190,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.white.withValues(alpha: 0.14),
                ),
              ),
            ),
          // رسم الشخصية خلف الترويسة — بلا شفافية (قرار 2026-09-15): كان
          // يُرسم بـ١٦٪ كما في المرجع لرسمٍ مضمَّن، فبدت الشخصيةُ التي يرفعها
          // المسؤول باهتةً كأنها معطوبة. تُعرض الآن كصورتها الأصلية.
          if (_hasArtwork)
            PositionedDirectional(
              top: artworkBelowStatusBar
                  ? MediaQuery.paddingOf(context).top
                  : defaultArtworkTop,
              end: artworkEnd ?? defaultArtworkEnd,
              child: IgnorePointer(
                child: artworkSlot == null
                    ? Image.asset(
                        artwork!,
                        width: artworkWidth ?? defaultArtworkWidth,
                      )
                    : CharacterArtwork(
                        slot: artworkSlot!,
                        width: artworkWidth ?? defaultArtworkWidth,
                      ),
              ),
            ),
          Padding(
            padding: padding,
            child: SafeArea(
              bottom: false,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (variant == OtakuHeaderVariant.compact)
                    _buildCompactRow(context, onInk)
                  else ...[
                    if (hasControls) ...[
                      Row(
                        children: [
                          if (leading != null)
                            leading!
                          else if (onBack != null)
                            OtakuHeaderButton.back(
                              onTap: onBack!,
                              onGradient: _onGradient,
                            ),
                          for (final action in actions) ...[
                            const SizedBox(width: 10),
                            action,
                          ],
                        ],
                      ),
                      const SizedBox(height: 16),
                    ],
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                title,
                                style: theme.textTheme.titleLarge?.copyWith(
                                  fontFamily: 'Tajawal',
                                  fontWeight: AppDimens.weightBlack,
                                  fontSize: switch (variant) {
                                    OtakuHeaderVariant.gradient => 25,
                                    OtakuHeaderVariant.tab => 26,
                                    _ => 20,
                                  },
                                  height: 1.25,
                                  letterSpacing:
                                      variant == OtakuHeaderVariant.tab
                                      ? -0.5
                                      : -0.3,
                                  color: onInk,
                                ),
                              ),
                              if (subtitle != null) ...[
                                SizedBox(
                                  height: switch (variant) {
                                    OtakuHeaderVariant.gradient => 4,
                                    OtakuHeaderVariant.tab => 6,
                                    _ => 2,
                                  },
                                ),
                                Text(
                                  subtitle!,
                                  style: theme.textTheme.bodySmall?.copyWith(
                                    fontSize: switch (variant) {
                                      OtakuHeaderVariant.gradient => 12.5,
                                      OtakuHeaderVariant.tab => 13.5,
                                      _ => 11.5,
                                    },
                                    height: 1.5,
                                    color: onInk2,
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                        ?trailing,
                      ],
                    ),
                  ],
                  ?bottom,
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCompactRow(BuildContext context, Color onInk) {
    final theme = Theme.of(context);
    return Row(
      children: [
        if (leading != null)
          leading!
        else if (onBack != null)
          OtakuHeaderButton.back(onTap: onBack!, onGradient: _onGradient),
        if (onBack != null || leading != null) const SizedBox(width: 12),
        Expanded(
          child: Text(
            title,
            style: theme.textTheme.titleLarge?.copyWith(
              fontFamily: 'Tajawal',
              fontWeight: AppDimens.weightExtraBold,
              fontSize: 19,
              height: 1.3,
              color: onInk,
            ),
          ),
        ),
        for (final action in actions) ...[const SizedBox(width: 8), action],
        ?trailing,
      ],
    );
  }
}

/// زر أيقوني مربّع مستدير (٣٨×٣٨، نصف قطر ١٣) داخل ترويسات v2.
class OtakuHeaderButton extends StatelessWidget {
  const OtakuHeaderButton({
    super.key,
    required this.icon,
    required this.onTap,
    this.onGradient = false,
    this.badgeCount = 0,
    this.tooltip,
  });

  /// زر الرجوع — يتّجه تلقائياً حسب اتجاه النص.
  const OtakuHeaderButton.back({
    super.key,
    required this.onTap,
    this.onGradient = false,
    this.tooltip,
  }) : icon = null,
       badgeCount = 0;

  final IconData? icon;
  final VoidCallback onTap;
  final bool onGradient;
  final int badgeCount;
  final String? tooltip;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    final isRtl = Directionality.of(context) == TextDirection.rtl;

    final resolved =
        icon ??
        (isRtl
            ? Icons.arrow_forward_ios_rounded
            : Icons.arrow_back_ios_new_rounded);

    Widget button = Container(
      width: 38,
      height: 38,
      decoration: BoxDecoration(
        color: onGradient
            ? Colors.black.withValues(alpha: 0.24)
            : theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(13),
        border: onGradient
            ? null
            : Border.all(color: theme.colorScheme.outlineVariant),
        boxShadow: onGradient ? null : colors.shadowXSoft,
      ),
      child: Icon(
        resolved,
        size: 16,
        color: onGradient ? Colors.white : theme.colorScheme.onSurface,
      ),
    );

    // الترويسة المتدرّجة تستخدم زجاجاً ضبابياً خلف الزر.
    if (onGradient) {
      button = ClipRRect(
        borderRadius: BorderRadius.circular(13),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 8, sigmaY: 8),
          child: button,
        ),
      );
    }

    if (badgeCount > 0) {
      button = Stack(
        clipBehavior: Clip.none,
        children: [
          button,
          PositionedDirectional(
            top: -4,
            end: -4,
            child: OtakuCountBadge(count: badgeCount),
          ),
        ],
      );
    }

    return Semantics(
      button: true,
      label: tooltip,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(13),
        child: button,
      ),
    );
  }
}

/// شارة عدّاد وردية دائرية تُستخدم فوق الأيقونات.
class OtakuCountBadge extends StatelessWidget {
  const OtakuCountBadge({super.key, required this.count, this.bordered = true});

  final int count;
  final bool bordered;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      constraints: const BoxConstraints(minWidth: 17, minHeight: 17),
      padding: const EdgeInsets.symmetric(horizontal: 4),
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: theme.colorScheme.secondary,
        borderRadius: BorderRadius.circular(AppDimens.radiusFull),
        border: bordered
            ? Border.all(color: theme.scaffoldBackgroundColor, width: 2)
            : null,
      ),
      child: Text(
        count > 99 ? '99+' : '$count',
        textDirection: TextDirection.ltr,
        style: theme.textTheme.labelSmall?.copyWith(
          color: Colors.white,
          fontSize: 10,
          height: 1,
          fontWeight: AppDimens.weightExtraBold,
        ),
      ),
    );
  }
}
