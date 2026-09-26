// شاشة نقاط المجرّة — الترتيب الرأسي وحالات المزايا.
//
// [CRITICAL] الترتيب مطلوبٌ صراحةً ولا يُعكس:
//   المستويات ← الشرح ← السجل.
// كان السجل يسبق الشرح، فيبدأ الزبون من حركاتٍ لا يعرف بعد ما تعنيها. هذا
// الاختبار يقيس المواضع الرأسية الحقيقية على الشاشة لا مجرّد وجود النصوص.

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:otaku_galaxy/features/auth/presentation/cubit/auth_cubit.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/features/points/domain/entities/level_reward.dart';
import 'package:otaku_galaxy/features/points/domain/entities/otaku_level.dart';
import 'package:otaku_galaxy/features/points/domain/entities/points_activity.dart';
import 'package:otaku_galaxy/features/points/domain/repositories/points_repository.dart';
import 'package:otaku_galaxy/features/points/presentation/cubit/points_cubit.dart';
import 'package:otaku_galaxy/features/points/presentation/screens/galaxy_points_screen.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';

import 'support/auth_stub.dart';

/// سلّم مطابق للسلّم الثابت على الخادم.
final _ladder = [
  OtakuLevel(
    key: 'beginner',
    number: 1,
    nameMale: 'مبتدئ المجرة',
    nameFemale: 'مبتدئة المجرة',
    nameNeutral: 'المستوى المبتدئ',
    reward: 'بداية الرحلة',
    rewardKind: 'none',
    threshold: 0,
  ),
  OtakuLevel(
    key: 'explorer',
    number: 2,
    nameMale: 'مستكشف المجرة',
    nameFemale: 'مستكشفة المجرة',
    nameNeutral: 'مستوى الاستكشاف',
    reward: 'خصم ٣٪ — مرة واحدة',
    rewardKind: 'discount',
    threshold: 100,
  ),
  OtakuLevel(
    key: 'champion',
    number: 5,
    nameMale: 'بطل المجرة',
    nameFemale: 'بطلة المجرة',
    nameNeutral: 'مستوى البطولة',
    reward: 'هدية من المتجر بقيمة ١٠٬٠٠٠ دينار — مرة واحدة',
    rewardKind: 'gift',
    threshold: 600,
  ),
];

LevelReward _reward(
  String key, {
  required String kind,
  bool unlocked = false,
  bool claimed = false,
  bool consumed = false,
}) => LevelReward(
  levelKey: key,
  requiredPoints: key == 'explorer' ? 100 : 600,
  kind: kind,
  unlocked: unlocked,
  claimed: claimed,
  consumed: consumed,
  claimable: unlocked && !claimed,
);

class _StubPoints implements PointsRepository {
  @override
  Future<List<OtakuLevel>> fetchLevels() async => summary.levels;

  _StubPoints(this.summary);

  PointsSummary summary;
  final claimed = <String>[];

  @override
  Future<PointsSummary> fetchSummary() async => summary;

  @override
  Future<LevelReward> claimReward(String levelKey) async {
    claimed.add(levelKey);
    // الخادم يعيد المزيّة بحالتها الجديدة، والملخّص يُعاد تحميله بعدها.
    summary = PointsSummary(
      balance: summary.balance,
      activity: summary.activity,
      levels: summary.levels,
      level: summary.level,
      nextLevel: summary.nextLevel,
      pointsToNextLevel: summary.pointsToNextLevel,
      levelProgress: summary.levelProgress,
      rewards: [
        for (final r in summary.rewards)
          if (r.levelKey == levelKey)
            _reward(r.levelKey, kind: r.kind, unlocked: true, claimed: true)
          else
            r,
      ],
    );
    return summary.rewards.firstWhere((r) => r.levelKey == levelKey);
  }
}

PointsSummary _summary({
  int balance = 150,
  List<PointsActivity> activity = const [],
  List<LevelReward> rewards = const [],
}) => PointsSummary(
  balance: balance,
  activity: activity,
  levels: _ladder,
  level: _ladder[1],
  nextLevel: _ladder[2],
  pointsToNextLevel: 450,
  levelProgress: 0.1,
  rewards: rewards,
);

Future<PointsCubit> _pumpScreen(
  WidgetTester tester,
  PointsSummary summary, {
  Size size = const Size(390, 844),
  _StubPoints? repo,
  String? gender,
  AuthCubit? authCubit,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  final cubit = PointsCubit(repo ?? _StubPoints(summary));

  // الجلسة تُستعاد قبل العرض كما يفعل الإقلاع الحقيقي: `AuthCubit` يبدأ بلا
  // مستخدم، فالشاشة كانت ستقرأ «مجهولاً» دائماً لو لم تُحمَّل.
  final auth = authCubit ?? stubAuthCubit(gender: gender);
  await auth.loadSession();

  await tester.pumpWidget(
    MultiBlocProvider(
      providers: [
        BlocProvider<PointsCubit>.value(value: cubit),
        // شريط المستويات يقرأ جنس صاحب الجلسة لتصريف الأسماء.
        BlocProvider<AuthCubit>.value(value: auth),
      ],
      child: MaterialApp(
        theme: AppTheme.light,
        home: const Directionality(
          textDirection: TextDirection.rtl,
          // الشاشة الحقيقية لا نسخةً منها: الترتيب هو موضوع الاختبار، ونسخةٌ
          // معادة البناء كانت ستؤكّد ترتيب الاختبار لا ترتيب الشاشة.
          child: GalaxyPointsScreen(),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return cubit;
}

void main() {
  group('ترتيب أقسام الشاشة', () {
    testWidgets('[CRITICAL] المستويات ثم الشرح ثم السجل', (tester) async {
      // نافذة عالية عمداً: `ListView` يبني المرئي فقط، والقياس يحتاج
      // الأقسام الثلاثة مخطَّطةً معاً. الترتيب هو المقيس لا ما يسع الشاشة.
      await _pumpScreen(
        tester,
        size: const Size(390, 2600),
        _summary(
          activity: [
            PointsActivity(
              id: 'a1',
              label: 'نقاط شراء',
              amount: 5,
              occurredAt: DateTime(2026, 1, 1),
            ),
          ],
        ),
      );

      final levels = tester.getTopLeft(find.text('مستوياتك في المجرّة')).dy;
      final explainer = tester.getTopLeft(find.text('كيف تعمل النقاط؟')).dy;
      final history = tester.getTopLeft(find.text('سجل النقاط')).dy;

      expect(levels, lessThan(explainer));
      expect(explainer, lessThan(history));
      // والمستوى نفسه معروض بين العنوانين لا بعد السجل.
      final firstLevel = tester.getTopLeft(find.textContaining('مستوى 1')).dy;
      expect(firstLevel, greaterThan(levels));
      expect(firstLevel, lessThan(explainer));
    });

    testWidgets('الشرح يذكر القواعد الثابتة بأرقامها', (tester) async {
      await _pumpScreen(tester, _summary());
      expect(find.text('عن كل ١٠٬٠٠٠ دينار من مشترياتك'), findsOneWidget);
      expect(find.text('عند نشر تقييم مكتوب لمنتج'), findsOneWidget);
      expect(
        find.text('عند إرفاق صور بالتقييم (من صورة إلى خمس)'),
        findsOneWidget,
      );
      // [CRITICAL] لا أثر للنصّ القديم الذي يصف آلية إدارية لا تعني الزبون.
      expect(find.textContaining('لوحة الإدارة'), findsNothing);
    });
  });

  group('المبلغ في وصف المزيّة — خصمٌ بلا سقف وهديةٌ بقيمتها', () {
    /// المطلوب تمييزٌ لا حذفٌ شامل: سقف الخصم يختفي، وقيمة الهدية تبقى.
    ///
    /// [CRITICAL] هذا الاختبار يحرس **الجيران والتمييز على الشاشة**، لا الحذف
    /// نفسه: النصّ يأتي من الخادم (`rewardLabel`)، وحارسُ الحذف اختبارُ
    /// `galaxy-levels.test.ts` في الخلفية حيث يُشتقّ الرقم من البيانات.
    /// ما يُقاس هنا أن التمييز يصل إلى البطاقة، وأن إزالة السقف لم تأخذ معها
    /// اسمَ المستوى ولا عتبة النقاط ولا النصّ التفسيري المالي المشروع.
    testWidgets('سقف الخصم يغيب وقيمة الهدية تظهر — والجيران باقون', (
      tester,
    ) async {
      await _pumpScreen(tester, _summary(), size: const Size(390, 2600));

      // خصم: النسبة بلا سقف.
      expect(find.text('خصم ٣٪ — مرة واحدة'), findsOneWidget);
      expect(find.textContaining('حتى ٥٬٠٠٠ دينار'), findsNothing);

      // هدية: القيمة مذكورة — هي المزيّة نفسها.
      expect(
        find.text('هدية من المتجر بقيمة ١٠٬٠٠٠ دينار — مرة واحدة'),
        findsOneWidget,
      );

      // مستوى بلا مزيّة — نصّه كما هو.
      expect(find.text('بداية الرحلة'), findsOneWidget);

      // الجيران في البطاقة نفسها: الاسم وعتبة النقاط.
      // بلا جنس محدَّد تُعرض الصيغة المحايدة — كما يحرسه اختبار التصريف.
      expect(find.textContaining('مستوى الاستكشاف'), findsOneWidget);
      expect(find.textContaining('مستوى البطولة'), findsOneWidget);
      expect(find.text('0+'), findsOneWidget);
      expect(find.text('100+'), findsOneWidget);
      expect(find.text('600+'), findsOneWidget);

      // نصٌّ ماليّ مشروع — معدّل الكسب لا سقف مزيّة. يبقى.
      expect(find.text('عن كل ١٠٬٠٠٠ دينار من مشترياتك'), findsOneWidget);
    });
  });

  group('الاستجابة على المقاسات', () {
    for (final entry in const {
      'هاتف صغير': Size(320, 640),
      'هاتف عادي': Size(390, 844),
      'هاتف كبير': Size(430, 932),
      'لوح': Size(834, 1112),
    }.entries) {
      testWidgets('يعرض الأقسام الثلاثة على ${entry.key}', (tester) async {
        await _pumpScreen(tester, _summary(), size: entry.value);

        // الأقسام تحت الطيّة على الشاشات القصيرة — يُمرَّر إلى كلٍّ منها بدل
        // افتراض أنه ظاهر، فيبقى الاختبار عن وجودها لا عن طول الجهاز.
        for (final heading in const [
          'مستوياتك في المجرّة',
          'كيف تعمل النقاط؟',
          'سجل النقاط',
        ]) {
          await tester.scrollUntilVisible(
            find.text(heading),
            240,
            scrollable: find.byType(Scrollable).first,
          );
          expect(find.text(heading), findsOneWidget, reason: heading);
        }
        expect(tester.takeException(), isNull);
      });
    }
  });

  group('أسماء المستويات مصرَّفة على الشاشة', () {
    testWidgets('صاحب الحساب الذكر يقرأ الصيغة المذكّرة', (tester) async {
      await _pumpScreen(
        tester,
        _summary(),
        size: const Size(390, 2600),
        gender: 'male',
      );
      expect(find.textContaining('مستكشف المجرة'), findsOneWidget);
      expect(find.textContaining('بطل المجرة'), findsOneWidget);
    });

    testWidgets('صاحبة الحساب تقرأ الصيغة المؤنّثة', (tester) async {
      await _pumpScreen(
        tester,
        _summary(),
        size: const Size(390, 2600),
        gender: 'female',
      );
      expect(find.textContaining('مستكشفة المجرة'), findsOneWidget);
      expect(find.textContaining('بطلة المجرة'), findsOneWidget);
      expect(find.textContaining('بطل المجرة —'), findsNothing);
    });

    testWidgets('[CRITICAL] الحساب بلا جنس يقرأ صيغة محايدة', (tester) async {
      await _pumpScreen(
        tester,
        _summary(),
        size: const Size(390, 2600),
        gender: null,
      );
      expect(find.textContaining('مستوى الاستكشاف'), findsOneWidget);
      expect(find.textContaining('مستوى البطولة'), findsOneWidget);
      // ولا يُخاطَب بالمذكّر لمجرّد أنه لم يُسأل.
      expect(find.textContaining('مستكشف المجرة'), findsNothing);
    });
  });

  group('حالات المزايا في المكعّب', () {
    test('المطالبة ترسل مفتاح المستوى ولا شيء غيره', () async {
      final repo = _StubPoints(
        _summary(
          rewards: [_reward('explorer', kind: 'discount', unlocked: true)],
        ),
      );
      final cubit = PointsCubit(repo);
      await cubit.load();
      expect(cubit.state.rewards.single.claimable, isTrue);

      await cubit.claimReward('explorer');
      expect(repo.claimed, ['explorer']);
      // بعد المطالبة لم تعد قابلة للمطالبة — لا زرّ ثانٍ.
      expect(cubit.state.rewards.single.claimed, isTrue);
      expect(cubit.state.rewards.single.claimable, isFalse);
    });

    test('[CRITICAL] المطالبة الجارية تمنع طلباً ثانياً متزامناً', () async {
      final repo = _StubPoints(
        _summary(
          rewards: [_reward('explorer', kind: 'discount', unlocked: true)],
        ),
      );
      final cubit = PointsCubit(repo);
      await cubit.load();

      // ضغطتان في نفس اللحظة: الثانية تُهمَل في الواجهة. الحارس الحقيقي يبقى
      // القيد الفريد في القاعدة — هذا يوفّر نداءً لا أكثر.
      await Future.wait([
        cubit.claimReward('explorer'),
        cubit.claimReward('explorer'),
      ]);
      expect(repo.claimed, hasLength(1));
    });

    test('المزيّة المغلقة ليست قابلة للمطالبة', () async {
      final repo = _StubPoints(
        _summary(rewards: [_reward('champion', kind: 'gift')]),
      );
      final cubit = PointsCubit(repo);
      await cubit.load();
      expect(cubit.state.rewards.single.unlocked, isFalse);
      expect(cubit.state.rewards.single.claimable, isFalse);
    });

    test('المزيّة المستهلَكة تبقى منتهية', () async {
      final repo = _StubPoints(
        _summary(
          rewards: [
            _reward(
              'explorer',
              kind: 'discount',
              unlocked: true,
              claimed: true,
              consumed: true,
            ),
          ],
        ),
      );
      final cubit = PointsCubit(repo);
      await cubit.load();
      final reward = cubit.state.rewards.single;
      expect(reward.consumed, isTrue);
      expect(reward.isReady, isFalse);
      expect(reward.claimable, isFalse);
    });
  });
}
