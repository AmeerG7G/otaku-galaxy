import 'package:flutter/material.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/l10n/app_strings.dart';

/// تنبيه «نسخة جديدة متوفّرة» — التحديث **الاختياري** (STEP 70).
///
/// [CRITICAL] نقيض شاشة الحجب عمداً: يطفو فوق التطبيق ولا يستبدله، وله
/// «لاحقاً» وضغطةٌ خارج البطاقة تُغلقه. يظهر مرّةً لكل «أحدث إصدار» —
/// `ForceUpdateGate` يحفظ الإغلاق. لا يفتح المتجر إلا بضغطة «تحديث التطبيق».
///
/// النصّ نصّ التطبيق المترجَم (لا رسالة مسؤول)، والتصميم من لغة شاشة الحجب:
/// سطحٌ عائم، أيقونة التحديث، زرّ التدرّج.
class OptionalUpdatePrompt extends StatelessWidget {
  const OptionalUpdatePrompt({
    super.key,
    required this.installedVersion,
    required this.latestVersion,
    required this.onUpdate,
    required this.onLater,
  });

  final String installedVersion;
  final String latestVersion;
  final VoidCallback onUpdate;
  final VoidCallback onLater;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    final versions = <String>[
      if (installedVersion.isNotEmpty)
        context.strings.p('yourVersion', {'version': installedVersion}),
      if (latestVersion.isNotEmpty)
        context.strings.p('latestVersion', {'version': latestVersion}),
    ];

    return Material(
      type: MaterialType.transparency,
      child: Stack(
        children: [
          Positioned.fill(
            child: GestureDetector(
              key: const Key('optional_update_scrim'),
              behavior: HitTestBehavior.opaque,
              onTap: onLater,
              child: ColoredBox(color: theme.colorScheme.scrim.withValues(alpha: 0.45)),
            ),
          ),
          SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: ResponsiveContentFrame(
                  maxWidth: kFormMaxWidth,
                  child: Semantics(
                    container: true,
                    explicitChildNodes: true,
                    label: context.strings('updateAvailableTitle'),
                    child: Container(
                      key: const Key('optional_update_card'),
                      decoration: BoxDecoration(
                        color: theme.colorScheme.surface,
                        borderRadius: BorderRadius.circular(AppDimens.radiusXl),
                        border: Border.all(color: theme.colorScheme.outlineVariant),
                        boxShadow: colors.shadowFloating,
                      ),
                      padding: const EdgeInsets.fromLTRB(22, 26, 22, 22),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Align(
                            alignment: AlignmentDirectional.centerStart,
                            child: Icon(
                              Icons.system_update_rounded,
                              size: 44,
                              color: AppColors.secondary,
                            ),
                          ),
                          const SizedBox(height: 16),
                          Text(
                            context.strings('updateAvailableTitle'),
                            style: theme.textTheme.titleLarge?.copyWith(
                              fontFamily: AppFonts.heading,
                              fontFamilyFallback: AppFonts.headingFallback,
                              fontSize: 20,
                              height: 1.35,
                              fontWeight: AppDimens.weightBlack,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            context.strings('updateAvailableMessage'),
                            style: theme.textTheme.bodyMedium?.copyWith(
                              fontSize: 14,
                              height: 1.8,
                              color: theme.colorScheme.onSurfaceVariant,
                            ),
                          ),
                          if (versions.isNotEmpty) ...[
                            const SizedBox(height: 12),
                            Text(
                              versions.join('  ·  '),
                              style: theme.textTheme.bodySmall?.copyWith(
                                fontSize: 12.5,
                                color: theme.colorScheme.onSurfaceVariant,
                              ),
                            ),
                          ],
                          const SizedBox(height: 18),
                          AnimePrimaryButton(
                            key: const Key('optional_update_button'),
                            label: context.strings('updateApp'),
                            onPressed: onUpdate,
                          ),
                          const SizedBox(height: 10),
                          AnimeOutlinedButton(
                            key: const Key('optional_update_later'),
                            label: context.strings('updateLater'),
                            onPressed: onLater,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
