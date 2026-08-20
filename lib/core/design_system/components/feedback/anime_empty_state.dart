import 'package:flutter/material.dart';

import '../../tokens/app_dimens.dart';
import '../../tokens/app_theme_colors.dart';
import '../buttons/anime_primary_button.dart';
import '../buttons/button_enums.dart';

class AnimeEmptyState extends StatelessWidget {
  const AnimeEmptyState({
    super.key,
    required this.title,
    this.subtitle,
    this.icon,
    this.actionLabel,
    this.onAction,
    this.iconSize = AppDimens.iconHero,
  });

  final String title;
  final String? subtitle;
  final IconData? icon;
  final String? actionLabel;
  final VoidCallback? onAction;
  final double iconSize;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return Center(
      child: Padding(
        padding: EdgeInsets.all(AppDimens.space9),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: iconSize * 1.5,
              height: iconSize * 1.5,
              decoration: BoxDecoration(
                gradient: colors.primaryGradient,
                borderRadius: BorderRadius.circular(AppDimens.radius3xl),
                boxShadow: [
                  BoxShadow(
                    color: colors.glowPrimary,
                    blurRadius: 20,
                    spreadRadius: 2,
                  ),
                ],
              ),
              child: Icon(
                icon ?? Icons.inbox_outlined,
                size: iconSize,
                color: Colors.white,
              ),
            ),
            SizedBox(height: AppDimens.space6),
            Text(
              title,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                fontWeight: AppDimens.weightBold,
                color: Theme.of(context).colorScheme.onSurface,
              ),
            ),
            if (subtitle != null) ...[
              SizedBox(height: AppDimens.space3),
              Text(
                subtitle!,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                  height: AppDimens.lineHeightRelaxed,
                ),
              ),
            ],
            if (actionLabel != null && onAction != null) ...[
              SizedBox(height: AppDimens.space6),
              AnimePrimaryButton(
                label: actionLabel!,
                onPressed: onAction,
                expanded: false,
                icon: Icons.arrow_forward,
                iconPosition: IconPosition.end,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// حالة خطأ بتصميم أنمي
