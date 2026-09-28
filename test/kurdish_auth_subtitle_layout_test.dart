// [CRITICAL REGRESSION] نصوص رأس شاشات المصادقة بالكردية (2026-09-27).
//
// العطل: بالكردية كان النصّ التوضيحي تحت العنوان ينزل أدنى مما في المرجع —
// وفي «نسيت كلمة المرور» تحت حافة بطاقة النموذج التي تتداخل مع الرأس. القياس
// بالخطوط الحقيقية: العنوان الكردي «وشەی نهێنی لەبیرچوو» يلتفّ سطرين بـ٢٦
// (العربي سطرٌ واحد)، والجمل الكردية الثلاث سطران بـ١٣ مع احتياط
// NotoSansArabic الأطول سطراً. الإصلاح كردي وحده في `AuthScaffold`؛ العربية
// لا تُمسّ — وهذا الاختبار يحرس الاتجاهين.
//
// [CRITICAL] الخطوط الحقيقية شرطٌ لا تفصيل (`loadProjectFonts`): بالخط البديل
// المتساوي العرض تُقاس الكردية بعرضٍ لا علاقة له بالجهاز.

import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/config/app_config.dart';
import 'package:otaku_galaxy/core/design_system/themes/app_theme.dart';
import 'package:otaku_galaxy/core/di/injection_container.dart';
import 'package:otaku_galaxy/core/router/app_router.dart';
import 'package:otaku_galaxy/features/auth/presentation/cubit/auth_cubit.dart';
import 'package:otaku_galaxy/features/settings/presentation/cubit/locale_cubit.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/auth_stub.dart';
import 'support/render_harness.dart';

class _Router extends RootStackRouter {
  @override
  List<AutoRoute> get routes => [
    AutoRoute(initial: true, path: '/home', page: PageInfo('HomePlaceholderRoute', builder: (_) => const Scaffold(body: SizedBox.shrink()))),
    AutoRoute(path: '/login', page: LoginRoute.page),
    AutoRoute(path: '/register', page: RegisterRoute.page),
    AutoRoute(path: '/forgot', page: ForgotPasswordRoute.page),
  ];
  @override
  RouteType get defaultRouteType => const RouteType.material();
}

Future<void> _pump(WidgetTester tester, PageRouteInfo route, AppLanguage language, Size size) async {
  SharedPreferences.setMockInitialValues({'app_language_code': language.code});
  final prefs = await SharedPreferences.getInstance();
  final locale = LocaleCubit(prefs)..loadPreference();
  final auth = stubAuthCubit();
  addTearDown(locale.close);
  addTearDown(auth.close);
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
  final router = _Router();
  await tester.pumpWidget(MultiBlocProvider(
    providers: [
      BlocProvider<LocaleCubit>.value(value: locale),
      BlocProvider<AuthCubit>.value(value: auth),
    ],
    child: MaterialApp.router(theme: AppTheme.light, locale: language.locale, routerConfig: router.config()),
  ));
  await tester.pump();
  router.push(route);
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 900));
}

void main() {
  setUpAll(() async {
    await loadProjectFonts();
    if (!sl.isRegistered<AppConfig>()) sl.registerLazySingleton<AppConfig>(() => AppConfig.development);
  });

  const screens = <(String, PageRouteInfo)>[
    ('الدخول', LoginRoute()),
    ('إنشاء الحساب', RegisterRoute()),
    ('نسيت كلمة المرور', ForgotPasswordRoute()),
  ];
  const sizes = [Size(360, 640), Size(390, 844), Size(412, 915)];

  RenderParagraph paragraph(WidgetTester tester, Key key) =>
      tester.renderObject<RenderParagraph>(
        find.descendant(of: find.byKey(key), matching: find.byType(RichText)).first,
      );

  /// الحافة العليا لبطاقة النموذج: أسفل الرأس ناقص تداخل البطاقة (٢٨).
  double cardTop(WidgetTester tester) {
    final header = find
        .ancestor(of: find.byKey(const Key('auth_header_subtitle')), matching: find.byType(ClipRRect))
        .first;
    return tester.getRect(header).bottom - 28;
  }

  for (final size in sizes) {
    for (final (name, route) in screens) {
      testWidgets('[CRITICAL] كردي — $name ${size.width.toInt()}: النصّ التوضيحي فوق البطاقة ولا يُقصّ', (tester) async {
        // شريط حالة نموذجي: الرأس ثابت الارتفاع، فالمحتوى ينزل معه.
        tester.view.padding = const FakeViewPadding(top: 24);
        await _pump(tester, route, AppLanguage.kurdish, size);

        final subtitle = paragraph(tester, const Key('auth_header_subtitle'));
        expect(subtitle.didExceedMaxLines, isFalse, reason: 'النصّ الكردي مقصوص بعلامة حذف');
        expect(subtitle.text.style?.fontSize, 11.5);
        final bottom = tester.getRect(find.byKey(const Key('auth_header_subtitle'))).bottom;
        expect(bottom, lessThanOrEqualTo(cardTop(tester) - 4),
            reason: 'أسفل النصّ ($bottom) تحت حافة البطاقة (${cardTop(tester)})');

        // العنوان الكردي سطرٌ واحد (يُصغَّر عند الحاجة وحدها).
        final title = paragraph(tester, const Key('auth_header_title'));
        expect(title.maxLines, 1);
        expect(title.didExceedMaxLines, isFalse);
      });

      testWidgets('العربية كما كانت — $name ${size.width.toInt()}', (tester) async {
        tester.view.padding = const FakeViewPadding(top: 24);
        await _pump(tester, route, AppLanguage.arabic, size);

        final subtitle = paragraph(tester, const Key('auth_header_subtitle'));
        expect(subtitle.text.style?.fontSize, 13, reason: 'لا تصغير للعربية');
        expect(subtitle.text.style?.height, 1.7);
        expect(subtitle.didExceedMaxLines, isFalse);
        final title = paragraph(tester, const Key('auth_header_title'));
        expect(title.maxLines, 2, reason: 'عنوان العربية بسطرين كما في المرجع');
        expect(title.text.style?.fontSize, 26);
        final bottom = tester.getRect(find.byKey(const Key('auth_header_subtitle'))).bottom;
        expect(bottom, lessThanOrEqualTo(cardTop(tester) - 4));
      });
    }
  }

  testWidgets('[CRITICAL] الكردية لا تنزل أدنى من العربية في أيّ شاشة', (tester) async {
    Future<double> bottomOf(PageRouteInfo route, AppLanguage language) async {
      await _pump(tester, route, language, const Size(390, 844));
      return tester.getRect(find.byKey(const Key('auth_header_subtitle'))).bottom;
    }

    var arabicLowest = 0.0;
    for (final (_, route) in screens) {
      final b = await bottomOf(route, AppLanguage.arabic);
      if (b > arabicLowest) arabicLowest = b;
    }
    for (final (name, route) in screens) {
      final b = await bottomOf(route, AppLanguage.kurdish);
      expect(b, lessThanOrEqualTo(arabicLowest), reason: '$name: $b > $arabicLowest');
    }
  });
}
