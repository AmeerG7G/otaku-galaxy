// [CRITICAL REGRESSION] نصوص رأس شاشات المصادقة بالكردية (2026-09-27).
//
// العطل: بالكردية كان النصّ التوضيحي تحت العنوان ينزل أدنى مما في المرجع —
// وفي «نسيت كلمة المرور» تحت حافة بطاقة النموذج التي تتداخل مع الرأس. القياس
// بالخطوط الحقيقية: العنوان الكردي «وشەی نهێنی لەبیرچوو» يلتفّ سطرين بـ٢٦
// (العربي سطرٌ واحد)، والجمل الكردية الثلاث سطران بـ١٣ مع احتياط
// NotoSansArabic الأطول سطراً. كان الإصلاح الأول كردياً وحده (مقاسٌ أصغر).
//
// العقد الآن (2026-10-05) واحدٌ للّغتين: احتياط `AppFonts` المطابق يجعل
// السطر الكردي بارتفاع العربي، والعنوان والتوضيح منطقتا `BoundedText` ثابتتان
// (سطر / سطران) تُصغّران النصّ عند الحاجة وحدها — في الموضع نفسه باللغتين.
//
// [CRITICAL] الخطوط الحقيقية شرطٌ لا تفصيل (`loadProjectFonts`): بالخط البديل
// المتساوي العرض تُقاس الكردية بعرضٍ لا علاقة له بالجهاز.

import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/config/app_config.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
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

Future<void> _pump(WidgetTester tester, PageRouteInfo route, AppLanguage language, Size size,
    {double textScale = 1.0}) async {
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
    child: MaterialApp.router(
      theme: AppTheme.light,
      locale: language.locale,
      routerConfig: router.config(),
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(textScale)),
        child: child!,
      ),
    ),
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
  const sizes = [
    Size(320, 568),
    Size(360, 640),
    Size(390, 844),
    Size(412, 915),
  ];

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

  /// منطقة `BoundedText` التي تحمل النصّ ذا المفتاح [key].
  Rect region(WidgetTester tester, Key key) => tester.getRect(
    find.ancestor(of: find.byKey(key), matching: find.byType(BoundedText)).first,
  );

  // ×١٫٣: كان سطر التوضيح الثاني تحت البطاقة بكل لغة — الرأس الآن يطول بقدر
  // ما يضيفه التكبير إلى منطقتيه.
  const scales = [1.0, 1.3];

  for (final scale in scales) {
  for (final size in sizes) {
    for (final (name, route) in screens) {
      for (final language in AppLanguage.values) {
        testWidgets('[CRITICAL] ${language.code} — $name ${size.width.toInt()} ×$scale: '
            'العنوان سطرٌ واحد، والتوضيح سطران فوق البطاقة، ولا قصّ', (tester) async {
          // شريط حالة نموذجي: الرأس ثابت الارتفاع، فالمحتوى ينزل معه.
          tester.view.padding = const FakeViewPadding(top: 24);
          await _pump(tester, route, language, size, textScale: scale);

          final subtitle = paragraph(tester, const Key('auth_header_subtitle'));
          expect(subtitle.didExceedMaxLines, isFalse, reason: 'النصّ التوضيحي مقصوص');
          expect(subtitle.maxLines, 2);
          expect(subtitle.text.style?.height, 1.7);
          expect(subtitle.text.style!.fontSize!, inInclusiveRange(13 * kBoundedTextMinScale, 13));
          final bottom = region(tester, const Key('auth_header_subtitle')).bottom;
          expect(bottom, lessThanOrEqualTo(cardTop(tester) - 4),
              reason: 'أسفل منطقة التوضيح ($bottom) تحت حافة البطاقة (${cardTop(tester)})');

          final title = paragraph(tester, const Key('auth_header_title'));
          expect(title.maxLines, 1);
          expect(title.didExceedMaxLines, isFalse);
          expect(title.text.style!.fontSize!, inInclusiveRange(26 * 0.65, 26));
          // (البوّابة ١٣، 2026-10-12) حدّ عناوين الشاشات: ٠٫٨ من مقاس التصميم.
          expect(
            title.text.style!.fontSize! * scale,
            greaterThanOrEqualTo(26 * kBoundedTextMinScale - 0.01),
          );
        });
      }
    }
  }
  }

  testWidgets('[CRITICAL] الرأس ٢١٤ تماماً عند ×١٫٠ — يطول بالتكبير وحده', (tester) async {
    double headerHeight() => tester
        .getRect(find.ancestor(of: find.byKey(const Key('auth_header_subtitle')), matching: find.byType(ClipRRect)).first)
        .height;
    for (final language in AppLanguage.values) {
      await _pump(tester, const LoginRoute(), language, const Size(390, 844));
      expect(headerHeight(), 214, reason: language.code);
      await _pump(tester, const LoginRoute(), language, const Size(390, 844), textScale: 1.3);
      expect(headerHeight(), greaterThan(214), reason: language.code);
    }
  });

  testWidgets('[CRITICAL] منطقتا العنوان والتوضيح في الموضع نفسه باللغتين', (tester) async {
    // الموضع = الأعلى والأسفل وحافة البداية؛ العرض يتبع النصّ داخل منطقته
    // (نصٌّ أطول يأخذ مكاناً أعرض) فلا يُقارَن.
    List<double> anchor(Key key) {
      final finder = find.ancestor(of: find.byKey(key), matching: find.byType(BoundedText)).first;
      final rect = tester.getRect(finder);
      final rtl = Directionality.of(tester.element(finder)) == TextDirection.rtl;
      return [rect.top, rect.bottom, rtl ? rect.right : rect.left];
    }

    for (final (name, route) in screens) {
      tester.view.padding = const FakeViewPadding(top: 24);
      await _pump(tester, route, AppLanguage.arabic, const Size(390, 844));
      final arTitle = anchor(const Key('auth_header_title'));
      final arSubtitle = anchor(const Key('auth_header_subtitle'));
      await _pump(tester, route, AppLanguage.kurdish, const Size(390, 844));
      expect(anchor(const Key('auth_header_title')), arTitle, reason: '$name: العنوان');
      expect(anchor(const Key('auth_header_subtitle')), arSubtitle, reason: '$name: التوضيح');
    }
  });
}
