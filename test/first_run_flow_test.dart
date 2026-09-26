// [CRITICAL REGRESSION GUARD] أول تشغيل: التعريف ← التخصيص ← المتجر.
//
// شاشة التخصيص صارت محطةً إلزامية بعد التعريف لكل زائر جديد (كانت تُتخطّى
// إلى المتجر مباشرة)، وفي التغيير نفسه انكسر تخطيط ترويستها فظهرت بيضاء.
// اختبارات الشاشتين كلٌّ على حدة لم ترَ ذلك: الأولى بنت نسخةً من جسم
// التخصيص لا الشاشة. هنا الشاشتان الحقيقيتان عبر موجّه حقيقي، والمتجر وحده
// صفحةٌ خفيفة تحمل اسمه.

import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/core/di/injection_container.dart';
import 'package:otaku_galaxy/core/l10n/app_strings.dart';
import 'package:otaku_galaxy/core/router/app_router.dart';
import 'package:otaku_galaxy/features/onboarding/data/onboarding_storage.dart';
import 'package:otaku_galaxy/features/settings/data/personalize_storage.dart';
import 'package:otaku_galaxy/features/settings/presentation/cubit/locale_cubit.dart';
import 'package:otaku_galaxy/features/settings/presentation/cubit/theme_cubit.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _FirstRunRouter extends RootStackRouter {
  @override
  List<AutoRoute> get routes => [
    AutoRoute(page: OnboardingRoute.page, path: '/', initial: true),
    AutoRoute(page: PersonalizeRoute.page, path: '/personalize'),
    AutoRoute(
      path: '/main',
      page: PageInfo(
        MainNavigationRoute.name,
        builder: (_) => const Scaffold(body: Center(child: Text('MAIN'))),
      ),
    ),
  ];

  @override
  RouteType get defaultRouteType => const RouteType.material();
}

/// التعريف يحمل حركةً محيطة مستمرة فلا يستقرّ `pumpAndSettle` أبداً — نضخّ
/// مدداً ثابتة كما يفعل `onboarding_screen_test.dart`.
Future<void> _advance(WidgetTester tester) async {
  await tester.pump();
  for (var i = 0; i < 6; i++) {
    await tester.pump(const Duration(milliseconds: 200));
  }
}

void _registerOrReplace<T extends Object>(T value) {
  if (sl.isRegistered<T>()) sl.unregister<T>();
  sl.registerSingleton<T>(value);
}

void main() {
  for (final dark in [false, true]) {
    testWidgets(
      'onboarding → personalize (real screens, painted) → main — '
      '${dark ? 'داكن' : 'فاتح'}',
      (tester) async {
        tester.view.physicalSize = const Size(412, 892);
        tester.view.devicePixelRatio = 1.0;
        addTearDown(tester.view.reset);

        SharedPreferences.setMockInitialValues({});
        final prefs = await SharedPreferences.getInstance();
        final onboarding = OnboardingStorage(prefs);
        final personalize = PersonalizeStorage(prefs);
        _registerOrReplace<OnboardingStorage>(onboarding);
        _registerOrReplace<PersonalizeStorage>(personalize);
        addTearDown(() {
          sl.unregister<OnboardingStorage>();
          sl.unregister<PersonalizeStorage>();
        });

        final router = _FirstRunRouter();
        await tester.pumpWidget(
          MultiBlocProvider(
            providers: [
              BlocProvider(create: (_) => LocaleCubit(prefs)),
              BlocProvider(create: (_) => ThemeCubit(prefs)),
            ],
            child: MaterialApp.router(
              theme: AppTheme.light,
              darkTheme: AppTheme.dark,
              themeMode: dark ? ThemeMode.dark : ThemeMode.light,
              routerConfig: router.config(),
              builder: (context, child) =>
                  Directionality(textDirection: TextDirection.rtl, child: child!),
            ),
          ),
        );
        await _advance(tester);
        expect(router.current.name, OnboardingRoute.name);

        // الشرائح الثلاث بزرّها الأساسي — كما يفعل الزائر.
        for (final cta in ['ctaLetsStart', 'ctaContinue', 'startShopping']) {
          await tester.tap(find.text(AppStrings.arabic(cta)));
          await _advance(tester);
        }
        expect(tester.takeException(), isNull);
        expect(onboarding.hasSeenOnboarding, isTrue);

        // التخصيص: شاشةٌ مرسومة فعلاً لا بيضاء — العنوان والوصف ومتابعة.
        expect(router.current.name, PersonalizeRoute.name);
        final title = find.text(AppStrings.arabic('personalizeTitle'));
        final body = find.text(AppStrings.arabic('personalizeBody'));
        expect(title, findsOneWidget);
        expect(body, findsOneWidget);
        expect(tester.getSize(body).width, greaterThan(0));
        expect(tester.getSize(title).height, greaterThan(0));

        await tester.tap(find.text(AppStrings.arabic('continueLabel')));
        await _advance(tester);
        expect(tester.takeException(), isNull);
        expect(personalize.isDone, isTrue);
        expect(router.current.name, MainNavigationRoute.name);
        expect(find.text('MAIN'), findsOneWidget);
      },
    );
  }
}
