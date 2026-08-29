import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../../domain/entities/otaku_level.dart';
import '../../domain/entities/points_activity.dart';
import '../cubit/points_cubit.dart';

/// مستوى الأوتاكو + نقاط المجرّة + سجل النقاط — شاشة واحدة متدرّجة:
/// المستوى الحالي وتقدّمه، ثم سلّم المستويات، ثم شرح النقاط، ثم السجل.
@RoutePage()
class GalaxyPointsScreen extends StatefulWidget {
  const GalaxyPointsScreen({super.key});

  @override
  State<GalaxyPointsScreen> createState() => _GalaxyPointsScreenState();
}

class _GalaxyPointsScreenState extends State<GalaxyPointsScreen> {
  @override
  void initState() {
    super.initState();
    context.read<PointsCubit>().load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          OtakuScreenHeader(
            title: '🌌 نقاط المجرّة',
            subtitle: 'كل نقطة تقربك لمستوى أعلى',
            onBack: () => context.router.maybePop(),
          ),
          Expanded(
            child: BlocBuilder<PointsCubit, PointsState>(
              builder: (context, state) {
                if (state.loading && state.activity.isEmpty) {
                  return const OtakuListSkeleton(count: 4, height: 84);
                }
                if (state.error != null && state.activity.isEmpty) {
                  return AnimeErrorState(
                    message: state.error!,
                    onAction: () => context.read<PointsCubit>().load(),
                  );
                }
                final level = OtakuLevel.forPoints(state.balance);

                return ListView(
                  padding: const EdgeInsets.fromLTRB(18, 8, 18, 26),
                  children: [
                    const _PointsExplainer(),
                    const _BlockTitle('المستويات القادمة'),
                    _LevelLadder(current: level, points: state.balance),
                    const _BlockTitle('سجل النقاط'),
                    if (state.activity.isEmpty)
                      const OtakuEditorialPanel(
                        title: 'ما بيه حركة نقاط بعد',
                        body:
                            'أول طلب تستلمه أو تقييم يُنشر راح يفتح لك النقاط.',
                        artwork: 'assets/art/opt/a-i5.png',
                        margin: EdgeInsets.zero,
                        minHeight: 170,
                        artHeight: 130,
                        contentWidthFactor: 0.68,
                      )
                    else
                      for (final activity in state.activity) ...[
                        _ActivityRow(activity: activity),
                        const SizedBox(height: 10),
                      ],
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

/// ملخّص المستوى الحالي — بطاقة متدرّجة مضغوطة بدل رأس ينهار.
class _BlockTitle extends StatelessWidget {
  const _BlockTitle(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(0, 24, 0, 12),
      child: Text(
        text,
        style: Theme.of(context).textTheme.titleMedium?.copyWith(
          fontFamily: 'Tajawal',
          fontSize: 16,
          fontWeight: AppDimens.weightExtraBold,
        ),
      ),
    );
  }
}

/// سلّم المستويات — المستوى الحالي مميّز، والباقي هادئ.
class _LevelLadder extends StatelessWidget {
  const _LevelLadder({required this.current, required this.points});

  final OtakuLevel current;
  final int points;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Column(
      children: [
        for (final level in OtakuLevel.values)
          Padding(
            padding: const EdgeInsets.only(bottom: AppDimens.space3),
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                // المصدر: خلفية وردية ٨٪ فوق السطح وحافة وردية ١٫٥ للمستوى
                // الحالي — لا تدرّج كامل.
                color: level == current
                    ? Color.alphaBlend(
                        AppColors.secondary.withValues(alpha: 0.08),
                        Theme.of(context).colorScheme.surface,
                      )
                    : Theme.of(context).colorScheme.surface,
                borderRadius: BorderRadius.circular(AppDimens.radiusMd),
                border: Border.all(
                  width: level == current ? 1.5 : 1,
                  color: level == current
                      ? AppColors.secondary
                      : Theme.of(context).colorScheme.outlineVariant,
                ),
              ),
              child: Row(
                children: [
                  Container(
                    width: 34,
                    height: 34,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      // الشارة متدرّجة لكل مستوى بلغه العميل.
                      gradient: points >= level.threshold
                          ? colors.primaryGradient
                          : null,
                      color: points >= level.threshold
                          ? null
                          : Theme.of(
                              context,
                            ).colorScheme.surfaceContainerHighest,
                      borderRadius: BorderRadius.circular(AppDimens.radiusXs),
                    ),
                    child: Text(
                      '${level.number}',
                      textDirection: TextDirection.ltr,
                      style: Theme.of(context).textTheme.labelLarge?.copyWith(
                        fontWeight: AppDimens.weightBlack,
                        color: points >= level.threshold
                            ? Colors.white
                            : Theme.of(context).colorScheme.outline,
                      ),
                    ),
                  ),
                  const SizedBox(width: AppDimens.space4),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'مستوى ${level.number} — ${level.title}',
                          style: Theme.of(context).textTheme.bodyMedium
                              ?.copyWith(
                                fontSize: 13.5,
                                fontWeight: AppDimens.weightBold,
                              ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          level.reward,
                          style: Theme.of(context).textTheme.labelSmall
                              ?.copyWith(
                                fontSize: 11.5,
                                color: Theme.of(
                                  context,
                                ).colorScheme.onSurfaceVariant,
                              ),
                        ),
                      ],
                    ),
                  ),
                  Text(
                    '${level.threshold}+',
                    textDirection: TextDirection.ltr,
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      fontSize: 11,
                      fontWeight: AppDimens.weightBold,
                      color: Theme.of(context).colorScheme.outline,
                    ),
                  ),
                ],
              ),
            ),
          ),
        Text(
          'المزايا مثال، والمتجر يحددها لاحقاً من لوحة الإدارة.',
          style: Theme.of(context).textTheme.labelSmall?.copyWith(
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
        ),
      ],
    );
  }
}

class _PointsExplainer extends StatelessWidget {
  const _PointsExplainer();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(AppDimens.radiusMd),
        border: Border.all(color: theme.colorScheme.outlineVariant),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 32,
            height: 32,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: colors.info.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(11),
            ),
            child: Icon(Icons.info_outline, size: 16, color: colors.info),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'شنو هي نقاط المجرّة؟',
                  style: theme.textTheme.labelMedium?.copyWith(
                    fontSize: 13,
                    fontWeight: AppDimens.weightBold,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  'تجمع نقاط من كل طلب تستلمه ومن كل تقييم يُنشر. التقييم '
                  'المصوّر يعطيك ٥ نقاط بدل نقطة واحدة.',
                  style: theme.textTheme.bodySmall?.copyWith(
                    fontSize: 12,
                    height: 1.75,
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ActivityRow extends StatelessWidget {
  const _ActivityRow({required this.activity});

  final PointsActivity activity;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(AppDimens.radiusMd),
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: colors.successPale,
              borderRadius: BorderRadius.circular(AppDimens.radiusFull),
            ),
            child: Text(
              '+${activity.amount}',
              textDirection: TextDirection.ltr,
              style: Theme.of(context).textTheme.labelMedium?.copyWith(
                color: colors.success,
                fontWeight: AppDimens.weightBlack,
              ),
            ),
          ),
          const SizedBox(width: AppDimens.space4),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  activity.label,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    fontSize: 14,
                    fontWeight: AppDimens.weightSemiBold,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  '${activity.occurredAt.day}/${activity.occurredAt.month}/'
                  '${activity.occurredAt.year}',
                  textDirection: TextDirection.ltr,
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
