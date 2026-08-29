import 'package:flutter/material.dart';

import '../../tokens/app_colors.dart';
import '../../tokens/app_dimens.dart';
import '../../tokens/app_theme_colors.dart';
import '../buttons/anime_primary_button.dart';

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
  });

  final String title;
  final String? subtitle;
  final IconData? icon;
  final String? actionLabel;
  final VoidCallback? onAction;
  final double iconSize;

  /// رسم شخصية تزييني يظهر أسفل جهة البداية داخل اللوحة.
  final String? artwork;

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
            child: Stack(
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
              if (artwork != null)
                PositionedDirectional(
                  bottom: -10,
                  end: -22,
                  child: Image.asset(
                    artwork!,
                    height: 150,
                    fit: BoxFit.contain,
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
                    if (icon != null && artwork == null) ...[
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
                        child: Icon(icon, color: Colors.white, size: 26),
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
                            style: Theme.of(context).textTheme.titleLarge
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
                              style: Theme.of(context).textTheme.bodyMedium
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
}

/// حالة خطأ بتصميم أنمي
