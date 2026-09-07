// ترويسة الحساب — علامة نقاط المجرّة واسم المستوى كاملاً.
//
// [CRITICAL] اسم المستوى كان يُقصّ بـ`ellipsis` على سطر واحد، فيقرأ صاحب
// الهاتف الصغير «المستوى ٢ — مستكشفة المج…». الاسم هو المكافأة المعروضة؛
// قصُّه يُفرغها. هذا الاختبار يقيس الاقتطاع الحقيقي على الرسم
// (`didExceedMaxLines`) لا وجود النصّ في الشجرة — فالنصّ موجودٌ في الحالتين.

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get_it/get_it.dart';
import 'package:dio/dio.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/core/network/api_client.dart';
import 'package:otaku_galaxy/features/auth/presentation/cubit/auth_cubit.dart';
import 'package:otaku_galaxy/features/account/presentation/screens/account_screen.dart';
import 'package:otaku_galaxy/features/birthday/data/birthday_storage.dart';
import 'package:otaku_galaxy/features/favorites/presentation/cubit/favorites_cubit.dart';
import 'package:otaku_galaxy/features/points/domain/entities/level_reward.dart';
import 'package:otaku_galaxy/features/points/domain/entities/otaku_level.dart';
import 'package:otaku_galaxy/features/points/domain/entities/points_activity.dart';
import 'package:otaku_galaxy/features/points/domain/repositories/points_repository.dart';
import 'package:otaku_galaxy/features/points/presentation/cubit/points_cubit.dart';
import 'package:otaku_galaxy/features/settings/data/store_settings_repository.dart';

import 'support/auth_stub.dart';
import 'support/render_harness.dart';

/// `Dio` لا يخرج إلى الشبكة: كل طلب يُرفض محلياً قبل أي مقبس.
Dio _offlineDio() {
  final dio = Dio();
  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) => handler.reject(
        DioException.connectionError(
          requestOptions: options,
          reason: 'اختبار بلا شبكة',
        ),
        true,
      ),
    ),
  );
  return dio;
}

/// أطول اسمين في السلّم الثابت — وهما مقياس الاختبار.
const _explorerFemale = 'مستكشفة المجرة';
const _championFemale = 'بطلة المجرة';

OtakuLevel _level({
  int number = 2,
  String male = 'مستكشف المجرة',
  String female = _explorerFemale,
  String neutral = 'مستوى الاستكشاف',
}) => OtakuLevel(
  key: 'explorer',
  number: number,
  nameMale: male,
  nameFemale: female,
  nameNeutral: neutral,
  reward: 'خصم ٣٪',
  rewardKind: 'discount',
  threshold: 100,
);

class _StubPoints implements PointsRepository {
  _StubPoints(this.summary);

  final PointsSummary summary;

  @override
  Future<PointsSummary> fetchSummary() async => summary;

  @override
  Future<LevelReward> claimReward(String levelKey) async =>
      summary.rewards.first;
}

PointsSummary _summary(OtakuLevel level) => PointsSummary(
  balance: 150,
  activity: const <PointsActivity>[],
  levels: [level],
  level: level,
  nextLevel: null,
  pointsToNextLevel: 100,
  levelProgress: 0.4,
  rewards: const <LevelReward>[],
);

/// يبني شاشة الحساب الحقيقية بجلسةٍ ومستوى معطيين.
Future<void> _pumpAccount(
  WidgetTester tester, {
  required OtakuLevel level,
  String? gender,
  String name = 'مدقق',
  Size size = const Size(390, 844),
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  // الشاشة تقرأ هذين أثناء البناء، وكلاهما يبتلع فشل الجلب فيعمل بلا خادم.
  //
  // [CRITICAL] الشبكة مقطوعة صراحةً لا متروكة للحظّ: لو صادف أن خادم التطوير
  // يعمل على الجهاز لعادت بياناتٌ حقيقية تغيّر ما يُعرض، فيصير نجاح الاختبار
  // تابعاً لما يعمل على المطوِّر لا لما في الشيفرة.
  final offline = ApiClient(dio: _offlineDio());
  if (!GetIt.I.isRegistered<BirthdayStorage>()) {
    GetIt.I.registerLazySingleton<BirthdayStorage>(
      () => BirthdayStorage(api: offline),
    );
  }
  if (!GetIt.I.isRegistered<StoreSettingsRepository>()) {
    GetIt.I.registerLazySingleton<StoreSettingsRepository>(
      () => StoreSettingsRepository(api: offline),
    );
  }
  addTearDown(() => GetIt.I.reset());

  final auth = stubAuthCubit(gender: gender);
  await auth.loadSession();
  auth.state;

  await tester.pumpWidget(
    MultiBlocProvider(
      providers: [
        BlocProvider<AuthCubit>.value(value: auth),
        BlocProvider<PointsCubit>.value(
          value: PointsCubit(_StubPoints(_summary(level))),
        ),
        BlocProvider<FavoritesCubit>(create: (_) => FavoritesCubit()),
      ],
      child: MaterialApp(
        theme: AppTheme.light,
        home: const Directionality(
          textDirection: TextDirection.rtl,
          // لا موجّه: `context.router` لا يُقرأ إلا داخل ردود النقر، والبناء
          // وحده هو موضوع الاختبار.
          child: Scaffold(body: AccountScreen()),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();

  // اسم الحساب يأتي من الجلسة المُستعادة.
  expect(find.textContaining(name), findsWidgets);
}

/// هل اقتُطع نصّ هذا الودجة فعلاً عند الرسم؟
bool _isTruncated(WidgetTester tester, Finder finder) {
  final paragraph = tester.renderObject<RenderParagraph>(finder);
  return paragraph.didExceedMaxLines;
}

void main() {
  setUpAll(loadProjectFonts);

  group('علامة نقاط المجرّة بجانب الاسم', () {
    testWidgets('[CRITICAL] العلامة ظاهرة وملاصقة للاسم', (tester) async {
      await _pumpAccount(tester, level: _level(), gender: 'male');

      final badge = find.text('🌌');
      expect(badge, findsWidgets);

      // ملاصقة أفقياً: على السطر نفسه وعلى بُعد صغير من نهاية الاسم.
      final name = find.text('مدقق');
      final nameBox = tester.getRect(name);
      final badgeBox = tester.getRect(badge.first);
      expect((badgeBox.center.dy - nameBox.center.dy).abs(), lessThan(14));
      // RTL: العلامة إلى يسار الاسم — أي بعده في اتجاه القراءة.
      expect(badgeBox.left, lessThan(nameBox.left));
      expect(nameBox.left - badgeBox.right, lessThan(24));
    });

    testWidgets('معناها معلَن للقارئ الصوتي لا يُترك رمزاً', (tester) async {
      await _pumpAccount(tester, level: _level(), gender: 'male');

      final labelled = tester
          .widgetList<Semantics>(find.byType(Semantics))
          .where((s) => s.properties.label == 'نقاط المجرّة');
      expect(labelled, isNotEmpty);
    });

    testWidgets('العلامة لا تُزيح الاسم خارج البطاقة', (tester) async {
      await _pumpAccount(
        tester,
        level: _level(),
        gender: 'male',
        size: const Size(320, 640),
      );
      expect(tester.takeException(), isNull);
    });
  });

  group('اسم المستوى كاملاً', () {
    for (final size in const {
      'هاتف صغير': Size(320, 640),
      'هاتف عادي': Size(390, 844),
      'لوح': Size(834, 1112),
    }.entries) {
      testWidgets('[CRITICAL] لا اقتطاع على ${size.key}', (tester) async {
        await _pumpAccount(
          tester,
          level: _level(),
          gender: 'female',
          size: size.value,
        );

        final line = find.textContaining(_explorerFemale);
        expect(line, findsOneWidget, reason: 'الاسم المصرَّف كاملاً في النصّ');
        expect(
          _isTruncated(tester, line),
          isFalse,
          reason: 'الاسم لا يُقصّ على ${size.key}',
        );
      });
    }

    testWidgets('[CRITICAL] أطول اسم مؤنّث لا يُقصّ على أضيق هاتف', (tester) async {
      await _pumpAccount(
        tester,
        level: _level(number: 5, male: 'بطل المجرة', female: _championFemale),
        gender: 'female',
        size: const Size(320, 640),
      );

      final line = find.textContaining(_championFemale);
      expect(line, findsOneWidget);
      expect(_isTruncated(tester, line), isFalse);
    });

    testWidgets('الصيغة المحايدة تُعرض لمن لم يختر جنسه', (tester) async {
      await _pumpAccount(tester, level: _level(), gender: null);

      expect(find.textContaining('مستوى الاستكشاف'), findsOneWidget);
      expect(find.textContaining(_explorerFemale), findsNothing);
      expect(find.textContaining('مستكشف المجرة'), findsNothing);
    });

    testWidgets('يسمح بسطرين ولا يقتصر على سطر', (tester) async {
      await _pumpAccount(
        tester,
        level: _level(),
        gender: 'female',
        size: const Size(320, 640),
      );
      final text = tester.widget<Text>(find.textContaining(_explorerFemale));
      expect(text.maxLines, greaterThanOrEqualTo(2));
      expect(text.overflow, isNot(TextOverflow.ellipsis));
    });
  });
}
