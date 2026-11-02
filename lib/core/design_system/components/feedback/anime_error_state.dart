import 'package:flutter/material.dart';
import '../../../l10n/app_strings.dart';

import '../../tokens/app_colors.dart';
import '../../tokens/app_theme_colors.dart';
import '../../tokens/app_dimens.dart';
import '../buttons/anime_primary_button.dart';
import '../buttons/button_enums.dart';
import '../layout/scroll_insets.dart';

class AnimeErrorState extends StatelessWidget {
  const AnimeErrorState({
    super.key,
    required this.message,
    this.title,
    this.icon,
    this.actionLabel,
    this.onAction,
  });

  final String message;
  /// افتراضيّها يُصرَّف عند البناء لا في المُنشئ: الوسيط الافتراضي
  /// يجب أن يكون ثابتاً، والنصّ المصرَّف ليس ثابتاً.
  final String? title;
  final IconData? icon;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    // [CRITICAL] مُمرِّرٌ بحشوةٍ تشمل ما يغطّي أسفل الجسم، لا `Padding` ثابتة.
    // الحالة تظهر في التبويبات أيضاً (الرئيسية، الأقسام، المجتمع)، وجسمها
    // يمتدّ خلف الشريط العائم: عمودٌ يتوسّط المساحة كلّها يضع «إعادة
    // المحاولة» تحت الشريط على الهاتف القصير، ويفيض بلا تمرير حين لا يتّسع.
    return Center(
      child: SingleChildScrollView(
        padding: context.scrollPadding(EdgeInsets.all(AppDimens.space9)),
        child: Column(
          mainAxisSize: MainAxisSize.min,
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
              title ?? context.strings('genericError'),
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                fontWeight: AppDimens.weightBold,
                color: context.themeColors.errorText,
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
                label: actionLabel ?? context.strings('retry'),
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
