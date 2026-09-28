import 'package:flutter/material.dart';

import '../../tokens/app_colors.dart';
import '../../tokens/app_dimens.dart';
import '../../tokens/app_theme_colors.dart';
import '../buttons/anime_primary_button.dart';
import '../../../../features/visuals/presentation/character_artwork.dart';

/// حالة فارغة بتصميم Otaku Galaxy v2 — لوحة تحريرية مستديرة مع هالة لونية
/// ورسم شخصية اختياري يخرج من حافة اللوحة، بدل أيقونة وسط الشاشة.
class AnimeEmptyState extends StatelessWidget {
  const AnimeEmptyState({
    super.key,
    required this.title,
    this.subtitle,
    this.icon,
    this.actionLabel,
    this.onAction,
    this.iconSize = AppDimens.iconHero,
    this.artwork,
    this.artworkSlot,
    this.centered = false,
    this.artworkHeight = 150,
  });

  final String title;
  final String? subtitle;
  final IconData? icon;
  final String? actionLabel;
  final VoidCallback? onAction;
  final double iconSize;

  /// رسم شخصية تزييني يظهر أسفل جهة البداية داخل اللوحة.
  final String? artwork;

  /// مفتاح موضع الرسم (`VisualSlots`) — صورته الثابتة في `CharacterArt`.
  ///
  /// حين يُمرَّر يحدّد الموضعُ صورته ولا يلزم [artwork] (المسار المباشر لرسمٍ
  /// ليس موضعاً). المقاس والموضع كما هما.
  final String? artworkSlot;

  /// رسمٌ يُعرض: موضعٌ بصورته الثابتة، أو مسارٌ مباشر.
  bool get _hasArtwork => artworkSlot != null || artwork != null;

  /// تركيب موسّط: الرسم فوق، ثم النصّ، ثم الإجراء — كلٌّ في وسط اللوحة.
  ///
  /// [CRITICAL] خيارٌ اختياري لا تغييرٌ افتراضي. هذا المكوّن مشترك بين إحدى
  /// عشرة شاشة، وتوسيطُه للجميع كان سيعيد تصميم عشر شاشات لم يُطلب تغييرها
  /// — بينما التخطيط الجانبي (رسمٌ يخرج من الحافة وإجراءٌ أسفل جهة البداية)
  /// هو ما يصفه مرجع التصميم لبقيتها. السلة وحدها تطلبه اليوم.
  final bool centered;

  /// ارتفاع الرسم التزييني (الشخصية). الافتراضي 150.
  final double artworkHeight;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    // المصدر يثبّت اللوحة أعلى المساحة المتاحة بارتفاع ثابت (~٣٨٠)، لا
    // يوسّطها عمودياً. على الشاشات القصيرة تتقلّص حتى ٢٦٠ بدل أن تفيض.
    return LayoutBuilder(
      builder: (context, constraints) {
        final panelHeight = constraints.hasBoundedHeight
            ? (constraints.maxHeight - 36).clamp(260.0, 380.0)
            : 380.0;
        return SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(18, 14, 18, 18),
          child: Container(
            width: double.infinity,
            height: panelHeight,
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surfaceContainerHighest,
              borderRadius: BorderRadius.circular(AppDimens.radiusXl),
              border: Border.all(
                color: Theme.of(context).colorScheme.outlineVariant,
              ),
            ),
            clipBehavior: Clip.antiAlias,
            child: centered
                ? _buildCentered(context, colors)
                : Stack(
                    children: [
                      // المصدر: الهالة أعلى اليمين الفيزيائي (right) والرسم أسفل
                      // اليسار (left) — أي `start` و`end` في واجهة عربية.
                      PositionedDirectional(
                        top: -40,
                        start: -50,
                        child: Container(
                          width: 200,
                          height: 200,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: RadialGradient(
                              colors: [
                                colors.glowSecondary,
                                colors.glowSecondary.withValues(alpha: 0),
                              ],
                            ),
                          ),
                        ),
                      ),
                      if (_hasArtwork)
                        PositionedDirectional(
                          bottom: -10,
                          end: -22,
                          child: artworkSlot == null
                              ? Image.asset(
                                  artwork!,
                                  height: artworkHeight,
                                  fit: BoxFit.contain,
                                )
                              : CharacterArtwork(
                                  slot: artworkSlot!,
                                  height: artworkHeight,
                                ),
                        ),
                      Padding(
                        padding: EdgeInsetsDirectional.fromSTEB(
                          24,
                          30,
                          24,
                          onAction != null ? 24 : 30,
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            if (icon != null && !_hasArtwork) ...[
                              Container(
                                width: 52,
                                height: 52,
                                decoration: BoxDecoration(
                                  gradient: colors.primaryGradient,
                                  borderRadius: BorderRadius.circular(
                                    AppDimens.radiusMd,
                                  ),
                                  boxShadow: [
                                    BoxShadow(
                                      color: colors.glowPrimary,
                                      blurRadius: 18,
                                      offset: const Offset(0, 6),
                                    ),
                                  ],
                                ),
                                child: Icon(
                                  icon,
                                  color: Colors.white,
                                  size: 26,
                                ),
                              ),
                              const SizedBox(height: AppDimens.space5),
                            ],
                            ConstrainedBox(
                              constraints: const BoxConstraints(maxWidth: 260),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Text(
                                    title,
                                    style: Theme.of(context)
                                        .textTheme
                                        .titleLarge
                                        ?.copyWith(
                                          fontSize: 20,
                                          height: 1.4,
                                          fontWeight: AppDimens.weightBlack,
                                        ),
                                  ),
                                  if (subtitle != null) ...[
                                    const SizedBox(height: AppDimens.space3),
                                    Text(
                                      subtitle!,
                                      style: Theme.of(context)
                                          .textTheme
                                          .bodyMedium
                                          ?.copyWith(
                                            height: 1.8,
                                            color: Theme.of(
                                              context,
                                            ).colorScheme.onSurfaceVariant,
                                          ),
                                    ),
                                  ],
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                      // المصدر يثبّت الإجراء أسفل جهة البداية داخل اللوحة، لا تحت
                      // النصّ مباشرةً.
                      if (actionLabel != null && onAction != null)
                        PositionedDirectional(
                          bottom: 26,
                          start: 24,
                          child: AnimePrimaryButton(
                            label: actionLabel!,
                            onPressed: onAction,
                            expanded: false,
                            borderRadius: AppDimens.radiusFull,
                            gradient: AppColors.ctaGradient,
                          ),
                        ),
                    ],
                  ),
          ),
        );
      },
    );
  }

  /// التركيب الموسّط — الرسم فوق، ثم النصّ، ثم الإجراء، كلٌّ في المنتصف.
  ///
  /// الهالة تبقى كما هي في التخطيط الجانبي (عنصر هوية لا تخطيط)، ويبقى كل
  /// شيء داخل اللوحة نفسها بمقاسها وحدودها ونصف قطرها — لا إعادة تصميم،
  /// إعادةُ ترتيبٍ فقط.
  Widget _buildCentered(BuildContext context, AppThemeColors colors) {
    final theme = Theme.of(context);
    return Stack(
      children: [
        PositionedDirectional(
          top: -40,
          start: -50,
          child: IgnorePointer(
            child: Container(
              width: 200,
              height: 200,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [
                    colors.glowSecondary,
                    colors.glowSecondary.withValues(alpha: 0),
                  ],
                ),
              ),
            ),
          ),
        ),
        // [CRITICAL] `Positioned.fill` لا طفلٌ حرّ في `Stack`.
        //
        // الطفل غير المموضَع في `Stack` يُحاذى افتراضياً إلى
        // `AlignmentDirectional.topStart`، وهي في واجهة عربية أعلى **اليمين**،
        // ويُمنح قيوداً مرنة فيأخذ عرض أوسع أبنائه لا عرض اللوحة. النتيجة أن
        // العمود «الموسّط» كان يلتصق بالحافة اليمنى: توسيطٌ داخل صندوقٍ
        // ملتصقٍ بالحافة ليس توسيطاً في اللوحة. المِلء يجعل العمود يمتدّ على
        // عرض اللوحة كاملاً فيصير مركزه مركزها. (رُصد بالقياس لا بالقراءة.)
        Positioned.fill(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                // الرسم **فوق** الإجراء — وهو جوهر الطلب.
                if (_hasArtwork)
                  Flexible(
                    child: artworkSlot == null
                        ? Image.asset(
                            artwork!,
                            height: artworkHeight,
                            fit: BoxFit.contain,
                          )
                        : CharacterArtwork(
                            slot: artworkSlot!,
                            height: artworkHeight,
                          ),
                  ),
                const SizedBox(height: AppDimens.space4),
                Text(
                  title,
                  textAlign: TextAlign.center,
                  style: theme.textTheme.titleLarge?.copyWith(
                    fontSize: 20,
                    height: 1.4,
                    fontWeight: AppDimens.weightBlack,
                  ),
                ),
                if (subtitle != null) ...[
                  const SizedBox(height: AppDimens.space3),
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 280),
                    child: Text(
                      subtitle!,
                      textAlign: TextAlign.center,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        height: 1.8,
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ),
                ],
                if (actionLabel != null && onAction != null) ...[
                  const SizedBox(height: AppDimens.space5),
                  AnimePrimaryButton(
                    label: actionLabel!,
                    onPressed: onAction,
                    expanded: false,
                    borderRadius: AppDimens.radiusFull,
                    gradient: AppColors.ctaGradient,
                  ),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }
}

/// حالة خطأ بتصميم أنمي
