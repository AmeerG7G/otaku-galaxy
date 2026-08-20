import 'package:flutter/material.dart';

import '../../tokens/app_colors.dart';
import '../../tokens/app_dimens.dart';
import '../buttons/anime_primary_button.dart';
import '../buttons/button_enums.dart';

class AnimeErrorState extends StatelessWidget {
  const AnimeErrorState({
    super.key,
    required this.message,
    this.title = 'حدث خطأ',
    this.icon,
    this.actionLabel = 'إعادة المحاولة',
    this.onAction,
  });

  final String message;
  final String title;
  final IconData? icon;
  final String actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: EdgeInsets.all(AppDimens.space9),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: AppDimens.iconHero * 1.5,
              height: AppDimens.iconHero * 1.5,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [AppColors.error, AppColors.errorLight],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(AppDimens.radius3xl),
                boxShadow: [
                  BoxShadow(
                    color: AppColors.error.withValues(alpha: 0.3),
                    blurRadius: 20,
                    spreadRadius: 2,
                  ),
                ],
              ),
              child: Icon(
                icon ?? Icons.error_outline,
                size: AppDimens.iconHero,
                color: Colors.white,
              ),
            ),
            SizedBox(height: AppDimens.space6),
            Text(
              title,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                fontWeight: AppDimens.weightBold,
                color: AppColors.error,
              ),
            ),
            SizedBox(height: AppDimens.space3),
            Text(
              message,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
                height: AppDimens.lineHeightRelaxed,
              ),
            ),
            if (onAction != null) ...[
              SizedBox(height: AppDimens.space6),
              AnimePrimaryButton(
                label: actionLabel,
                onPressed: onAction,
                expanded: false,
                icon: Icons.refresh,
                iconPosition: IconPosition.start,
                gradient: LinearGradient(
                  colors: [AppColors.error, AppColors.errorLight],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// بانر إعلاني بتصميم أنمي
