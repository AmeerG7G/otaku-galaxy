import 'package:flutter/material.dart';

import '../../tokens/app_dimens.dart';
import '../../tokens/app_theme_colors.dart';
import '../buttons/anime_primary_button.dart';

/// ورقة سفلية تُعرض عند محاولة زائر تنفيذ إجراء يحتاج تسجيل دخول
/// (إتمام الطلب، طلباتي، الحساب...). تعيد `true` إذا اختار المستخدم
/// تسجيل الدخول (على المستدعي فتح شاشة الدخول عندها).
Future<bool> showLoginGate(
  BuildContext context, {
  String? title,
  String? body,
}) async {
  final result = await showModalBottomSheet<bool>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (context) => _LoginGateSheet(title: title, body: body),
  );
  return result ?? false;
}

class _LoginGateSheet extends StatelessWidget {
  const _LoginGateSheet({this.title, this.body});

  final String? title;
  final String? body;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    return SafeArea(
      top: false,
      child: Container(
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surface,
          borderRadius: BorderRadius.vertical(
            top: Radius.circular(AppDimens.radiusXl),
          ),
          boxShadow: colors.shadowFloating,
        ),
        clipBehavior: Clip.antiAlias,
        child: Stack(
          children: [
            // هالة لونية خلف المحتوى تعطي عمق الهوية.
            PositionedDirectional(
              top: -60,
              end: -40,
              child: Container(
                width: 180,
                height: 180,
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
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 14, 20, 24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Center(
                    child: Container(
                      width: 40,
                      height: 5,
                      margin: const EdgeInsets.only(bottom: 18),
                      decoration: BoxDecoration(
                        color: Theme.of(context).colorScheme.outlineVariant,
                        borderRadius: BorderRadius.circular(3),
                      ),
                    ),
                  ),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        width: 46,
                        height: 46,
                        decoration: BoxDecoration(
                          gradient: colors.primaryGradient,
                          borderRadius: BorderRadius.circular(
                            AppDimens.radiusXs,
                          ),
                        ),
                        child: const Icon(
                          Icons.lock_outline_rounded,
                          color: Colors.white,
                          size: 22,
                        ),
                      ),
                      const SizedBox(width: AppDimens.space4),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              title ?? 'سجّل دخولك أولاً',
                              style: Theme.of(context).textTheme.titleMedium
                                  ?.copyWith(
                                    fontSize: 19,
                                    fontWeight: AppDimens.weightBlack,
                                  ),
                            ),
                            const SizedBox(height: 6),
                            Text(
                              body ??
                                  'هذه الميزة تحتاج تسجيل الدخول لحسابك في مجرة الأوتاكو.',
                              style: Theme.of(context).textTheme.bodySmall
                                  ?.copyWith(
                                    fontSize: 13,
                                    height: 1.75,
                                    color: Theme.of(
                                      context,
                                    ).colorScheme.onSurfaceVariant,
                                  ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 18),
                  AnimePrimaryButton(
                    label: 'تسجيل الدخول',
                    onPressed: () => Navigator.of(context).pop(true),
                    height: AppDimens.buttonHeightXl,
                  ),
                  const SizedBox(height: AppDimens.space3),
                  SizedBox(
                    width: double.infinity,
                    child: TextButton(
                      onPressed: () => Navigator.of(context).pop(false),
                      style: TextButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 15),
                        backgroundColor: Theme.of(
                          context,
                        ).colorScheme.surfaceContainerHighest,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(
                            AppDimens.radiusMd,
                          ),
                          side: BorderSide(
                            color: Theme.of(context).colorScheme.outlineVariant,
                            width: 1.5,
                          ),
                        ),
                      ),
                      child: Text(
                        'إلغاء',
                        style: Theme.of(context).textTheme.labelLarge?.copyWith(
                          fontWeight: AppDimens.weightBold,
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
