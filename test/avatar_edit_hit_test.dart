// [CRITICAL REGRESSION GUARD] زرّ تغيير الصورة في بطاقة الحساب لا يفتح النقاط.
//
// البطاقة المتدرّجة كلّها `InkWell` يفتح شاشة نقاط المجرّة، وزرّ «+» الصغير
// (٢٢ بكسل) موضوعٌ خارج صندوق الصورة (٦٤×٦٤) بخمسة بكسلات من جهتين.
// `RenderBox.hitTest` يرفض ما يقع خارج حجم الصندوق قبل أن ينزل إلى أبنائه،
// فلا يُصيب الزرَّ إلا ١٧×١٧ بكسلاً منه؛ وكل نقرةٍ قريبة تسقط إلى البطاقة —
// أي إلى شاشة النقاط. وهو ما بلّغه المستخدم: «إضافة صورة» تفتح النقاط.
//
// الاختبار ينقر عند أطراف الزرّ المرسوم لا مركزه، ويطالب بورقة اختيار
// الصورة لا بأي انتقال.

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get_it/get_it.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/core/l10n/app_strings.dart';
import 'package:otaku_galaxy/core/network/api_client.dart';
import 'package:otaku_galaxy/features/account/presentation/screens/account_screen.dart';
import 'package:otaku_galaxy/features/auth/presentation/cubit/auth_cubit.dart';
import 'package:otaku_galaxy/features/birthday/data/birthday_storage.dart';
import 'package:otaku_galaxy/features/favorites/presentation/cubit/favorites_cubit.dart';
import 'package:otaku_galaxy/features/points/domain/entities/level_reward.dart';
import 'package:otaku_galaxy/features/points/domain/entities/otaku_level.dart';
import 'package:otaku_galaxy/features/points/domain/entities/points_activity.dart';
import 'package:otaku_galaxy/features/points/domain/repositories/points_repository.dart';
import 'package:otaku_galaxy/features/points/presentation/cubit/points_cubit.dart';
import 'package:otaku_galaxy/features/settings/data/store_settings_repository.dart';

import 'support/auth_stub.dart';

Dio _offlineDio() {
  final dio = Dio();
  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) => handler.reject(
        DioException.connectionError(requestOptions: options, reason: 'offline'),
        true,
      ),
    ),
  );
  return dio;
}

final _level = OtakuLevel(
  key: 'explorer',
  number: 2,
  nameMale: 'مستكشف المجرة',
  nameFemale: 'مستكشفة المجرة',
  nameNeutral: 'مستوى الاستكشاف',
  reward: 'خصم ٣٪',
  rewardKind: 'discount',
  threshold: 100,
);

class _StubPoints implements PointsRepository {
  @override
  Future<List<OtakuLevel>> fetchLevels() async => [_level];
  @override
  Future<PointsSummary> fetchSummary() async => PointsSummary(
    balance: 150,
    activity: const <PointsActivity>[],
    levels: [_level],
    level: _level,
    nextLevel: null,
    pointsToNextLevel: 100,
    levelProgress: 0.4,
    rewards: const <LevelReward>[],
  );
  @override
  Future<LevelReward> claimReward(String levelKey) => throw UnimplementedError();
}

Future<void> _pumpAccount(WidgetTester tester) async {
  tester.view.physicalSize = const Size(390, 844);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  final offline = ApiClient(dio: _offlineDio());
  if (!GetIt.I.isRegistered<BirthdayStorage>()) {
    GetIt.I.registerLazySingleton<BirthdayStorage>(() => BirthdayStorage(api: offline));
  }
  if (!GetIt.I.isRegistered<StoreSettingsRepository>()) {
    GetIt.I.registerLazySingleton<StoreSettingsRepository>(
      () => StoreSettingsRepository(api: offline),
    );
  }
  addTearDown(() => GetIt.I.reset());

  final auth = stubAuthCubit(gender: 'male');
  await auth.loadSession();

  await tester.pumpWidget(
    MultiBlocProvider(
      providers: [
        BlocProvider<AuthCubit>.value(value: auth),
        BlocProvider<PointsCubit>.value(value: PointsCubit(_StubPoints())),
        BlocProvider<FavoritesCubit>(create: (_) => FavoritesCubit()),
      ],
      child: MaterialApp(
        theme: AppTheme.light,
        home: const Directionality(
          textDirection: TextDirection.rtl,
          // بلا موجّه عمداً: أي انتقال (نقاط المجرّة) يفشل باستثناءٍ واضح،
          // فيُميَّز «فتح النقاط» عن «فتح الصورة» بلا لبس.
          child: Scaffold(body: AccountScreen()),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _expectPickerOpens(WidgetTester tester, Offset at, String label) async {
  await tester.tapAt(at);
  await tester.pumpAndSettle();
  final exception = tester.takeException();
  expect(exception, isNull, reason: '$label: النقرة سقطت إلى البطاقة → $exception');
  expect(
    find.text(AppStrings.arabic('profilePhoto')),
    findsOneWidget,
    reason: '$label: يجب أن تظهر ورقة الصورة الشخصية',
  );
  // إغلاق الورقة للجولة التالية.
  await tester.tapAt(const Offset(20, 40));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('[CRITICAL] النقر على أطراف زرّ «+» يفتح ورقة الصورة لا النقاط',
      (tester) async {
    await _pumpAccount(tester);

    final plus = find.byIcon(Icons.add);
    expect(plus, findsOneWidget);
    // مستطيل الأيقونة هو محتوى الزرّ (٢٢ ناقص إطار ٢ من كل جهة = ١٨).
    // نوسّعه بالإطار لنصل إلى حافة الزرّ المرسومة نفسها.
    final badge = tester.getRect(plus).inflate(2);

    // المركز — يعمل اليوم أيضاً.
    await _expectPickerOpens(tester, badge.center, 'المركز');
    // حلقة الإطار عند الزوايا الخارجية: كانت خارج صندوق الصورة (٦٤×٦٤)
    // فتسقط النقرة إلى البطاقة.
    await _expectPickerOpens(tester, badge.bottomLeft + const Offset(1, -1), 'أسفل اليسار');
    await _expectPickerOpens(tester, badge.bottomRight + const Offset(-1, -1), 'أسفل اليمين');
    await _expectPickerOpens(tester, badge.bottomCenter + const Offset(0, -1), 'الحافة السفلى');
    // والصورة نفسها هدفٌ واحد مع الزرّ — أسهل إصابةً من دائرة ٢٢ بكسلاً.
    final avatarImage = tester.getRect(find.byIcon(Icons.person_rounded));
    await _expectPickerOpens(tester, avatarImage.center, 'وسط الصورة');
  });

  testWidgets('لزرّ الصورة وصفٌ للقارئ الصوتي', (tester) async {
    await _pumpAccount(tester);
    final labelled = tester
        .widgetList<Semantics>(find.byType(Semantics))
        .where((s) => s.properties.label == AppStrings.arabic('profilePhoto'));
    expect(labelled, isNotEmpty);
  });
}
