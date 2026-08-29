// شاشة التعريف (ONBOARDING) — إعادة بناء بصرية على مرجع التصميم.
//
// الشاشة محلّية بالكامل (لا شبكة ولا خادم)، فالتحقّق هنا بصري/سلوكي:
// البناء بلا تجاوز تخطيط على كل المقاسات والوضعين وبالـRTL، صحّة النصوص،
// حالة المؤشّرات، وأن رابط «لدي حساب» لا يعمل إلا في الشريحة الأخيرة.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/features/onboarding/data/onboarding_storage.dart';
import 'package:otaku_galaxy/features/onboarding/presentation/screens/onboarding_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  Widget host({required bool dark}) => MaterialApp(
    theme: AppTheme.light,
    darkTheme: AppTheme.dark,
    themeMode: dark ? ThemeMode.dark : ThemeMode.light,
    locale: const Locale('ar'),
    home: const Directionality(
      textDirection: TextDirection.rtl,
      child: OnboardingScreen(),
    ),
  );

  const sizes = <String, Size>{
    'ref': Size(412, 892),
    'narrow': Size(375, 812),
    'tiny': Size(320, 640),
  };

  group('renders without overflow', () {
    for (final dark in [false, true]) {
      for (final size in sizes.entries) {
        final mode = dark ? 'داكن' : 'فاتح';
        testWidgets('onboarding — $mode — ${size.key}', (tester) async {
          tester.view.physicalSize = size.value;
          tester.view.devicePixelRatio = 1.0;
          addTearDown(tester.view.reset);

          await tester.pumpWidget(host(dark: dark));
          await tester.pump(const Duration(milliseconds: 300));

          expect(tester.takeException(), isNull);
        });
      }
    }
  });

  group('slide one matches the reference', () {
    setUp(() {
      SharedPreferences.setMockInitialValues({});
    });

    Future<void> pumpRef(WidgetTester tester) async {
      tester.view.physicalSize = const Size(412, 892);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(host(dark: false));
      await tester.pump(const Duration(milliseconds: 300));
    }

    testWidgets('shows the brand header, title, body, chip and CTA', (
      tester,
    ) async {
      await pumpRef(tester);

      expect(find.text('مجرة الأوتاكو'), findsOneWidget);
      expect(find.text('أهلاً بك في مجرة الأوتاكو'), findsOneWidget);
      expect(
        find.textContaining('متجر عربي متكامل لعشّاق الأنمي'),
        findsOneWidget,
      );
      // البطاقة الطافية بسطريها كما في المرجع.
      expect(find.text('منتجات حصرية'), findsOneWidget);
      expect(find.text('حقائب، اكسسوارات، ملابس'), findsOneWidget);
      expect(find.text('يلا نبدأ'), findsOneWidget);
    });

    testWidgets('shows three indicators with the first one active', (
      tester,
    ) async {
      await pumpRef(tester);

      final indicators = tester.widgetList<AnimatedContainer>(
        find.byType(AnimatedContainer),
      );
      final widths = indicators
          .map((c) => (c.constraints?.maxWidth) ?? double.nan)
          .toList();
      // ثلاثة مؤشّرات: النشط ٢٨ والباقيان ٨.
      expect(widths.where((w) => w == 28).length, 1);
      expect(widths.where((w) => w == 8).length, 2);
    });

    testWidgets('the login link is inert on the first slide', (tester) async {
      await pumpRef(tester);

      // موجود في الشجرة (يحجز مساحته كما في المصدر) لكنه شفاف وغير نشط.
      final link = find.text('لدي حساب — تسجيل الدخول');
      expect(link, findsOneWidget);

      final ignore = tester.widget<IgnorePointer>(
        find
            .ancestor(of: link, matching: find.byType(IgnorePointer))
            .first,
      );
      expect(ignore.ignoring, isTrue);

      final fade = tester.widget<AnimatedOpacity>(
        find.ancestor(of: link, matching: find.byType(AnimatedOpacity)).first,
      );
      expect(fade.opacity, 0);
    });

    testWidgets('advancing reveals the next slide and its CTA', (tester) async {
      await pumpRef(tester);

      // البطاقة الطافية تتحرّك بلا توقّف، فلا يستقرّ الشجر أبداً:
      // نضخّ مدداً ثابتة بدل pumpAndSettle.
      await tester.tap(find.text('يلا نبدأ'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));

      expect(find.text('كل ما يخص عالمك، بمكان واحد'), findsOneWidget);
      expect(find.text('كمّل'), findsOneWidget);

      await tester.tap(find.text('كمّل'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));

      expect(find.text('ابدأ التسوق'), findsOneWidget);
      // في الشريحة الأخيرة يصبح الرابط مرئياً ونشطاً.
      final link = find.text('لدي حساب — تسجيل الدخول');
      final fade = tester.widget<AnimatedOpacity>(
        find.ancestor(of: link, matching: find.byType(AnimatedOpacity)).first,
      );
      expect(fade.opacity, 1);
    });
  });

  group('onboarding is shown once', () {
    testWidgets('markSeen persists across a fresh storage instance', (
      tester,
    ) async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();

      final first = OnboardingStorage(prefs);
      expect(first.hasSeenOnboarding, isFalse);
      await first.markSeen();

      // «إقلاع جديد» فوق نفس التخزين.
      final second = OnboardingStorage(prefs);
      expect(second.hasSeenOnboarding, isTrue);
    });
  });
}
