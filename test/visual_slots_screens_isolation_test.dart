// عزل الفتحات على مستوى الشاشات الحقيقية — بعد التجزئة (الهجرة ٠٥٤).
//
// [CRITICAL] كانت شاشة «بانتظار الموافقة» تعرض فتحةَ شاشةِ الطلب نفسها
// (`register_character` / `forgot_password_character`)، وكانت زاوية بطاقة
// النموذج في شاشات المصادقة الثلاث فتحةً واحدة. هنا نُقلع بإعدادٍ محفوظ يعطي
// **كل** فتحة رابطاً مختلفاً ونتحقّق، شاشةً شاشة وفي أول إطار، أن كل موضع
// يحمل رابطه هو — ولا رابطَ موضعٍ آخر — وأن التنقّل بين الشاشات لا يورّث رسماً.

import 'dart:async';
import 'dart:convert';

import 'package:auto_route/auto_route.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/config/app_config.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/core/di/injection_container.dart';
import 'package:otaku_galaxy/core/network/media_url.dart';
import 'package:otaku_galaxy/core/router/app_router.dart';
import 'package:otaku_galaxy/features/auth/domain/entities/account_request.dart';
import 'package:otaku_galaxy/features/auth/presentation/cubit/auth_cubit.dart';
import 'package:otaku_galaxy/features/points/domain/entities/otaku_level.dart';
import 'package:otaku_galaxy/features/points/domain/repositories/points_repository.dart';
import 'package:otaku_galaxy/features/visuals/data/visuals_repository.dart';
import 'package:otaku_galaxy/features/visuals/domain/visual_slot.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/auth_stub.dart';

/// رابطٌ فريد لكل فتحة — مشتقٌّ من مفتاحها فلا يتطابق رابطان.
String _refFor(String slot) => '/uploads/slot/2026/09/$slot.png';

/// كل الفتحات مضبوطة، كلٌّ برابطها — الإعداد المحفوظ من تشغيلٍ سابق.
String _snapshotAll() => jsonEncode({
  'version': 'v-all',
  'slots': [
    for (final key in VisualSlots.all) {'slotKey': key, 'currentUrl': _refFor(key)},
  ],
});

class _AuthRouter extends RootStackRouter {
  @override
  List<AutoRoute> get routes => [
    AutoRoute(
      initial: true,
      path: '/home',
      page: PageInfo('HomePlaceholderRoute', builder: (_) => const Scaffold(body: SizedBox.shrink())),
    ),
    AutoRoute(path: '/login', page: LoginRoute.page),
    AutoRoute(path: '/register', page: RegisterRoute.page),
    AutoRoute(path: '/forgot', page: ForgotPasswordRoute.page),
    AutoRoute(path: '/account-pending', page: AccountPendingRoute.page),
  ];

  @override
  RouteType get defaultRouteType => const RouteType.material();
}

/// سلّم لا يصل أبداً — استمارة الاستعادة تبقى في حالة التحميل.
class _PendingLevels implements PointsRepository {
  @override
  Future<List<OtakuLevel>> fetchLevels() => Completer<List<OtakuLevel>>().future;
  @override
  dynamic noSuchMethod(Invocation invocation) => Completer<Object?>().future;
}

/// روابط كل رسمٍ مُدار معروض الآن، بمفتاح فتحته.
Map<String, String> _remoteUrls(WidgetTester tester) {
  final urls = <String, String>{};
  for (final element in find.byType(CachedNetworkImage).evaluate()) {
    final key = element.widget.key;
    if (key is ValueKey<String> && key.value.startsWith('managed-artwork:')) {
      urls[key.value.substring('managed-artwork:'.length)] = (element.widget as CachedNetworkImage).imageUrl;
    }
  }
  return urls;
}

/// كل رابطٍ معروض هو رابط فتحته هو — لا رابطَ فتحةٍ أخرى ولا مضمَّن.
///
/// `exact`: بعد انتهاء انتقال الصفحة لا يبقى إلا رسوم الشاشة الحالية. في أول
/// إطارٍ بعد الدفع قد تكون الصفحةُ السابقة ما تزال في الشجرة (انتقالٌ جارٍ)،
/// فيُطلب أن تكون رسوم الجديدة **حاضرةً بروابطها** لا أن تكون وحدها.
void _expectOwnUrls(WidgetTester tester, Set<String> expectedSlots, {bool exact = true, String? reason}) {
  final urls = _remoteUrls(tester);
  if (exact) {
    expect(urls.keys.toSet(), expectedSlots, reason: reason);
  } else {
    expect(urls.keys.toSet(), containsAll(expectedSlots), reason: reason);
  }
  urls.forEach((slot, url) {
    expect(url, resolveMediaUrl(_refFor(slot)), reason: '$slot يحمل رابط غيره');
  });
}

/// أول إطارٍ للصفحة المدفوعة، ثم ما بعد انتهاء انتقالها (انتقال Material 3
/// الافتراضي ٨٠٠ مل ث؛ الصفحة المستبدَلة تُزال حين ينتهي).
Future<void> _firstFrame(WidgetTester tester) async {
  await tester.pump();
  await tester.pump();
}

Future<void> _settleTransition(WidgetTester tester) async {
  await tester.pump(const Duration(milliseconds: 500));
  await tester.pump(const Duration(milliseconds: 500));
  await tester.pump();
}

void main() {
  late _AuthRouter router;

  setUpAll(() {
    if (!sl.isRegistered<AppConfig>()) sl.registerLazySingleton<AppConfig>(() => AppConfig.development);
    if (!sl.isRegistered<PointsRepository>()) {
      sl.registerLazySingleton<PointsRepository>(() => _PendingLevels());
    }
  });

  setUp(() async {
    SharedPreferences.setMockInitialValues({VisualsRepository.snapshotKey: _snapshotAll()});
    final prefs = await SharedPreferences.getInstance();
    if (sl.isRegistered<VisualsRepository>()) sl.unregister<VisualsRepository>();
    // بلا `api`: لا شبكة في هذه الاختبارات — المحفوظ وحده، كما في أول إطارٍ بعد الإقلاع.
    sl.registerSingleton<VisualsRepository>(VisualsRepository(prefs: prefs));
    router = _AuthRouter();
  });

  tearDown(() {
    if (sl.isRegistered<VisualsRepository>()) sl.unregister<VisualsRepository>();
  });

  Future<void> pumpApp(WidgetTester tester) async {
    tester.view.physicalSize = const Size(412, 892);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      BlocProvider<AuthCubit>.value(
        value: stubAuthCubit(),
        child: MaterialApp.router(
          theme: AppTheme.light,
          locale: const Locale('ar'),
          routerConfig: router.config(),
        ),
      ),
    );
    await tester.pump();
  }

  testWidgets('[CRITICAL] شاشة تسجيل الدخول: الترويسة وزاوية البطاقة فتحتان مستقلّتان برابطيهما', (tester) async {
    await pumpApp(tester);
    router.push(const LoginRoute());
    await _firstFrame(tester);
    _expectOwnUrls(tester, {VisualSlots.login, VisualSlots.loginCta}, exact: false, reason: 'أول إطار');
    await _settleTransition(tester);
    _expectOwnUrls(tester, {VisualSlots.login, VisualSlots.loginCta});
  });

  testWidgets('[CRITICAL] إنشاء الحساب واستعادة كلمة المرور: كلٌّ بترويستها وزاويتها — لا فتحة الدخول', (
    tester,
  ) async {
    await pumpApp(tester);
    router.push(const RegisterRoute());
    await _firstFrame(tester);
    _expectOwnUrls(tester, {VisualSlots.registerHeader, VisualSlots.registerCta}, exact: false, reason: 'أول إطار');
    await _settleTransition(tester);
    _expectOwnUrls(tester, {VisualSlots.registerHeader, VisualSlots.registerCta});

    router.replace(const ForgotPasswordRoute());
    await _firstFrame(tester);
    // أثناء الانتقال: أي رسمٍ معروض — من الصفحتين — يحمل رابطه هو.
    _expectOwnUrls(tester, const {}, exact: false, reason: 'أثناء الانتقال');
    await _settleTransition(tester);
    _expectOwnUrls(
      tester,
      {VisualSlots.forgotPasswordHeader, VisualSlots.forgotPasswordCta},
      reason: 'بعد التنقّل لا يبقى رسمٌ من شاشة إنشاء الحساب',
    );
  });

  testWidgets('[CRITICAL] «بانتظار الموافقة» فتحتها هي لكل نوع طلب — لا فتحة شاشة الطلب ولا نوع الطلب الآخر', (
    tester,
  ) async {
    await pumpApp(tester);
    router.push(AccountPendingRoute(kind: AccountRequestKind.registration));
    await _firstFrame(tester);
    _expectOwnUrls(tester, {VisualSlots.registerPending}, exact: false, reason: 'أول إطار');
    await _settleTransition(tester);
    _expectOwnUrls(tester, {VisualSlots.registerPending});
    expect(_remoteUrls(tester).values, isNot(contains(resolveMediaUrl(_refFor(VisualSlots.registerHeader)))));

    router.replace(AccountPendingRoute(kind: AccountRequestKind.passwordReset));
    await _firstFrame(tester);
    await _settleTransition(tester);
    _expectOwnUrls(tester, {VisualSlots.forgotPasswordPending}, reason: 'نوع الطلب تبدّل ⇒ الفتحة تبدّلت');
    // المؤقّت الطافي في الشاشة لا يُنتظر.
    await tester.pump(const Duration(seconds: 1));
  });

  testWidgets('التنقّل دخول ← إنشاء ← انتظار ← دخول: كل شاشة برسومها هي، ولا رسمٌ أجنبي أثناء الانتقال', (
    tester,
  ) async {
    await pumpApp(tester);
    final journey = <(PageRouteInfo, Set<String>)>[
      (const LoginRoute(), {VisualSlots.login, VisualSlots.loginCta}),
      (const RegisterRoute(), {VisualSlots.registerHeader, VisualSlots.registerCta}),
      (AccountPendingRoute(kind: AccountRequestKind.registration), {VisualSlots.registerPending}),
      (const LoginRoute(), {VisualSlots.login, VisualSlots.loginCta}),
    ];
    for (final (route, slots) in journey) {
      router.replaceAll([route]);
      await _firstFrame(tester);
      _expectOwnUrls(tester, const {}, exact: false, reason: '${route.routeName} — أثناء الانتقال');
      await _settleTransition(tester);
      _expectOwnUrls(tester, slots, reason: route.routeName);
    }
    await tester.pump(const Duration(seconds: 1));
  });

  testWidgets('فتحتان بالصورة الابتدائية نفسها تبقيان مستقلّتين: تغيير إحداهما لا يمسّ الأخرى', (tester) async {
    // الهجرة نسخت صورة الأصل إلى الشقيقة؛ التطابق الابتدائي لا يعني اشتراكاً.
    final repo = sl<VisualsRepository>();
    const same = '/uploads/slot/2026/09/same-initial.png';
    repo.seed({
      VisualSlots.registerPending: const VisualSlot(slotKey: VisualSlots.registerPending, currentUrl: same),
      VisualSlots.forgotPasswordPending: const VisualSlot(slotKey: VisualSlots.forgotPasswordPending, currentUrl: same),
    });
    await pumpApp(tester);
    router.push(AccountPendingRoute(kind: AccountRequestKind.passwordReset));
    await _firstFrame(tester);
    await _settleTransition(tester);
    expect(_remoteUrls(tester)[VisualSlots.forgotPasswordPending], resolveMediaUrl(same));

    // المسؤول بدّل شخصية انتظار **التسجيل** وحدها.
    const changed = '/uploads/slot/2026/09/changed.png';
    repo.seed({
      VisualSlots.registerPending: const VisualSlot(slotKey: VisualSlots.registerPending, currentUrl: changed),
      VisualSlots.forgotPasswordPending: const VisualSlot(slotKey: VisualSlots.forgotPasswordPending, currentUrl: same),
    });
    await tester.pump();
    expect(_remoteUrls(tester)[VisualSlots.forgotPasswordPending], resolveMediaUrl(same), reason: 'لم تتغيّر');

    router.replace(AccountPendingRoute(kind: AccountRequestKind.registration));
    await _firstFrame(tester);
    await _settleTransition(tester);
    expect(_remoteUrls(tester)[VisualSlots.registerPending], resolveMediaUrl(changed));
    await tester.pump(const Duration(seconds: 1));
  });
}
