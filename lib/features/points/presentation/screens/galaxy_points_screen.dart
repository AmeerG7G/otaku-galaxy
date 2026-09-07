import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/errors/app_exception.dart';
import '../../../../core/l10n/gender.dart';
import '../../domain/entities/level_reward.dart';
import '../../domain/entities/otaku_level.dart';
import '../../domain/entities/points_activity.dart';
import '../cubit/points_cubit.dart';
import '../../../visuals/domain/visual_slot.dart';

/// شاشة نقاط المجرّة.
///
/// الترتيب الرأسي مقصود ولا يُعكس:
///   ١. **المستويات** — أول ما يراه الزبون: أين هو، وما التالي، وبأي مزيّة.
///   ٢. **الشرح** — مباشرةً تحتها، ليفهم كيف يرتقي بعد أن رأى إلى أين.
///   ٣. **السجل** — أخيراً: تفصيلٌ يُراجَع عند الحاجة لا عنوانٌ يتصدّر.
///
/// كان السجل يسبق الشرح والمستويات تأتي في الوسط، فيبدأ الزبون من حركاتٍ لا
/// يعرف بعد ما تعنيه.
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

  Future<void> _claim(String levelKey) async {
    final cubit = context.read<PointsCubit>();
    try {
      await cubit.claimReward(levelKey);
      if (!mounted) return;
      _snack('سُجّلت مزيّتك 🎉', success: true);
    } catch (error) {
      if (!mounted) return;
      _snack(_claimErrorOf(error), success: false);
    }
  }

  /// رسالة الخادم أدقّ من أي نصّ عام — «تحتاج ١٠٠ نقطة» تقول ما ينقص فعلاً.
  String _claimErrorOf(Object error) {
    if (error is AppException && error.message.trim().isNotEmpty) {
      return error.message;
    }
    return 'تعذّرت المطالبة بالمزيّة، حاول مرة أخرى';
  }

  void _snack(String message, {required bool success}) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(message),
          backgroundColor: success
              ? context.themeColors.success
              : context.themeColors.error,
          behavior: SnackBarBehavior.floating,
          margin: EdgeInsets.all(AppDimens.screenHorizontalPadding),
        ),
      );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      // عمودٌ موسَّط بعرض القراءة على اللوح — القائمة الممتدّة بعرض
      // ١٣٦٦ بكسل تصير صفوفاً فارغة الوسط. لا أثر له على الهاتف.
      body: ResponsiveContentFrame(
        maxWidth: kReadingMaxWidth,
        child: Column(
          children: [
            OtakuScreenHeader(
              title: '🌌 نقاط المجرّة',
              subtitle: 'كل نقطة تقربك لمستوى أعلى',
              onBack: () => context.router.maybePop(),
            ),
            Expanded(
              child: BlocBuilder<PointsCubit, PointsState>(
                builder: (context, state) {
                  if (state.loading && !state.hasData) {
                    return const OtakuListSkeleton(count: 4, height: 84);
                  }
                  if (state.error != null && !state.hasData) {
                    return AnimeErrorState(
                      message: state.error!,
                      onAction: () => context.read<PointsCubit>().load(),
                    );
                  }

                  final rewards = {
                    for (final reward in state.rewards) reward.levelKey: reward,
                  };

                  return ListView(
                    padding: const EdgeInsets.fromLTRB(18, 8, 18, 26),
                    children: [
                      // ١) المستويات أولاً.
                      const _BlockTitle('مستوياتك في المجرّة', top: 8),
                      _LevelLadder(
                        levels: state.levels,
                        current: state.level,
                        points: state.balance,
                        rewards: rewards,
                        claimingLevelKey: state.claimingLevelKey,
                        onClaim: _claim,
                      ),

                      // ٢) الشرح ثانياً — تحت المستويات مباشرةً.
                      const _BlockTitle('كيف تعمل النقاط؟'),
                      const _PointsExplainer(),

                      // ٣) السجل أخيراً.
                      const _BlockTitle('سجل النقاط'),
                      if (state.activity.isEmpty)
                        const OtakuEditorialPanel(
                          title: 'لا توجد حركات بعد',
                          body:
                              'ستظهر هنا نقاطك فور استلام أول طلب أو نشر أول تقييم.',
                          artwork: 'assets/art/opt/a-i5.png',
                          artworkSlot: VisualSlots.points,
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
      ),
    );
  }
}

class _BlockTitle extends StatelessWidget {
  const _BlockTitle(this.text, {this.top = 24});

  final String text;
  final double top;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(0, top, 0, 12),
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

/// سلّم المستويات — المستوى الحالي مميّز، والمزيّة المفتوحة تحمل زرّ مطالبة.
class _LevelLadder extends StatelessWidget {
  const _LevelLadder({
    required this.levels,
    required this.current,
    required this.points,
    required this.rewards,
    required this.claimingLevelKey,
    required this.onClaim,
  });

  /// السلّم كما أرسله الخادم — لا قائمة محلية.
  final List<OtakuLevel> levels;
  final OtakuLevel? current;
  final int points;
  final Map<String, LevelReward> rewards;
  final String? claimingLevelKey;
  final ValueChanged<String> onClaim;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    if (levels.isEmpty) {
      // لا سلّم بديل: عرض عتبات محفوظة في التطبيق أسوأ من الصمت.
      return Text(
        'تعذّر تحميل المستويات — حاول مرة أخرى.',
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
          color: Theme.of(context).colorScheme.onSurfaceVariant,
        ),
      );
    }

    // الاسم يُصرَّف مرة واحدة هنا بجنس صاحب الحساب، لا في كل ودجة.
    final gender = context.gender;

    return Column(
      children: [
        for (final level in levels)
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
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
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
                          borderRadius: BorderRadius.circular(
                            AppDimens.radiusXs,
                          ),
                        ),
                        child: Text(
                          '${level.number}',
                          textDirection: TextDirection.ltr,
                          style: Theme.of(context).textTheme.labelLarge
                              ?.copyWith(
                                fontWeight: AppDimens.weightBlack,
                                color: points >= level.threshold
                                    ? Colors.white
                                    : Theme.of(
                                        context,
                                      ).colorScheme.onSurfaceVariant,
                              ),
                        ),
                      ),
                      const SizedBox(width: AppDimens.space4),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'مستوى ${level.number} — ${level.nameFor(gender)}',
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
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                  if (rewards[level.key] case final reward?)
                    _RewardRow(
                      reward: reward,
                      claiming: claimingLevelKey == level.key,
                      onClaim: () => onClaim(level.key),
                    ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

/// حالة مزيّة المستوى وزرّ المطالبة بها.
///
/// الحالات الثلاث ظاهرة للزبون بلا لبس: مغلقة، أو جاهزة للمطالبة، أو
/// مطالَب بها (وتنتظر الطلب القادم أو تسليم المتجر)، أو انتهت. زرّ المطالبة
/// يختفي بعد المطالبة ولا يبقى معطَّلاً يوحي بإمكان التكرار.
class _RewardRow extends StatelessWidget {
  const _RewardRow({
    required this.reward,
    required this.claiming,
    required this.onClaim,
  });

  final LevelReward reward;
  final bool claiming;
  final VoidCallback onClaim;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;

    if (reward.consumed) {
      return _statusPill(
        context,
        icon: Icons.check_circle_outline,
        color: colors.successText,
        label: reward.isGift ? 'سُلّمت الهدية' : 'طُبّق الخصم على طلبك',
      );
    }

    if (reward.claimed) {
      return _statusPill(
        context,
        icon: Icons.schedule_outlined,
        color: colors.infoText,
        label: reward.isGift
            ? 'سُجّلت هديتك — سنتواصل معك لتسليمها'
            : 'جاهزة — ستُطبَّق تلقائياً على طلبك القادم',
      );
    }

    if (!reward.unlocked) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: SizedBox(
        width: double.infinity,
        child: AnimeOutlinedButton(
          label: claiming ? 'جاري التسجيل…' : 'المطالبة بالمزيّة',
          onPressed: claiming ? null : onClaim,
          icon: Icons.redeem_outlined,
          iconPosition: IconPosition.start,
        ),
      ),
    );
  }

  Widget _statusPill(
    BuildContext context, {
    required IconData icon,
    required Color color,
    required String label,
  }) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Row(
        children: [
          Icon(icon, size: 15, color: color),
          const SizedBox(width: 7),
          Expanded(
            child: Text(
              label,
              style: theme.textTheme.labelSmall?.copyWith(
                fontSize: 11.5,
                height: 1.5,
                color: color,
                fontWeight: AppDimens.weightBold,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// شرح نقاط المجرّة — قصير، بالفصحى، وبقواعد النظام الفعلية.
///
/// [CRITICAL] الأرقام مكتوبة هنا **لأنها ثابتة**. كانت تُرسل من الخادم حين
/// كان المسؤول يضبطها من اللوحة — وكان ذلك صحيحاً حينها: شرحٌ يحمل رقماً
/// قابلاً للضبط يصير كاذباً يوم يتغيّر. القواعد الآن قرار تجاري مثبَّت في
/// `domain/galaxyPoints.ts` ولا واجهة تعدّلها، فالنصّ الثابت يطابقها دائماً.
///
/// وما يُذكر هنا هو ما يفعله النظام فعلاً لا غير — لا وعود ولا وصفٌ لآليات
/// داخلية لا تعني الزبون.
///
/// [CRITICAL] ألوان النصّ هنا `onSurfaceVariant` لا `outline`.
///
/// `outline` رمزُ **حدود** لا نصّ، ومعرَّف في الوضع الفاتح بشفافية ١٢٪
/// (`0x1F1C103A`). استعمالُه لوناً لنصّ فوق `surfaceContainerHighest` كان
/// يعطي تبايناً قياسه **1.28:1** — نصٌّ لا يكاد يُرى، وهو بالضبط عطبُ
/// «خلفية فاتحة ونصّ فاتح». البديل يعطي 4.79:1 في الفاتح و6.38:1 في الداكن،
/// وكلاهما يجتاز AA.
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
                  'تجمع النقاط من مشترياتك ومن تقييماتك، وكلما زادت ارتفع مستواك.',
                  style: theme.textTheme.bodySmall?.copyWith(
                    fontSize: 12,
                    height: 1.75,
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: 12),
                const _Rule(points: '٥', label: 'عن كل ١٠٬٠٠٠ دينار من مشترياتك'),
                const _Rule(points: '١', label: 'عند نشر تقييم مكتوب لمنتج'),
                const _Rule(
                  points: '٥',
                  label: 'عند إرفاق صور بالتقييم (من صورة إلى خمس)',
                ),
                const SizedBox(height: 8),
                Text(
                  'لكل منتج تقييم واحد، ويُنشر بعد مراجعته. '
                  'وللتقييمات في الطلب الواحد حدٌّ أعلى من النقاط.',
                  style: theme.textTheme.bodySmall?.copyWith(
                    fontSize: 11.5,
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

/// سطر قاعدة كسب واحد: عدد النقاط ثم سببها.
class _Rule extends StatelessWidget {
  const _Rule({required this.points, required this.label});

  final String points;
  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;

    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 2),
            decoration: BoxDecoration(
              color: colors.successPale,
              borderRadius: BorderRadius.circular(AppDimens.radiusFull),
            ),
            child: Text(
              '+$points',
              style: theme.textTheme.labelSmall?.copyWith(
                fontSize: 11.5,
                // [CRITICAL] الصيغة النصّية لا المؤشِّرة: `success` على
                // `successPale` قياسه 2.48:1 — رقمٌ لا يُقرأ داخل بطاقةٍ
                // موضوعها الشرح.
                color: colors.successText,
                fontWeight: AppDimens.weightBold,
              ),
            ),
          ),
          const SizedBox(width: 9),
          Expanded(
            child: Text(
              label,
              style: theme.textTheme.bodySmall?.copyWith(
                fontSize: 12,
                height: 1.6,
                color: theme.colorScheme.onSurfaceVariant,
              ),
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
    // الحركة قد تكون سحباً (سحب اعتماد تقييم)، فلا تُكتب `+` دائماً.
    final positive = activity.amount >= 0;
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
              color: positive ? colors.successPale : colors.errorPale,
              borderRadius: BorderRadius.circular(AppDimens.radiusFull),
            ),
            child: Text(
              positive ? '+${activity.amount}' : '${activity.amount}',
              textDirection: TextDirection.ltr,
              style: Theme.of(context).textTheme.labelMedium?.copyWith(
                // نصٌّ على شارة باهتة — الصيغة النصّية لا المؤشِّرة.
                color: positive ? colors.successText : colors.errorText,
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
