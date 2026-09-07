// شاشة التعريف (ONBOARDING) — إعادة بناء بصرية على مرجع التصميم.
//
// الشاشة محلّية بالكامل (لا شبكة ولا خادم)، فالتحقّق هنا بصري/سلوكي:
// البناء بلا تجاوز تخطيط على كل المقاسات والوضعين وبالـRTL، صحّة النصوص،
// حالة المؤشّرات، وأن الإجراء الوحيد في الشريحة الأخيرة هو «ابدأ التسوق»
// (بلا رابط «لدي حساب» — التسجيل يكون من شاشة الدخول عند الحاجة).

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
    // ألواح: الطرف الآخر من المدى.
    'tablet': Size(834, 1112),
    'tablet-landscape': Size(1194, 834),
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

    // [NOTE] هيكل الشريحة من المرجع؛ أمّا نصوصها فتطوّرت عنه عمداً (متجر
    // «عراقي» لا «عربي»، وسطرٌ أطول في البطاقة). العنوان وحده كان يخالف
    // المرجع **خطأً** — «أهلاً بك في متجر مجرة الأوتاكو» بينما المرجع
    // والتعليق الموثِّق للعنصر نفسه يقولان «أهلاً بك في مجرة الأوتاكو» —
    // فأُصلحت الشاشة لا الاختبار.
    testWidgets('shows the brand header, title, body, chip and CTA', (
      tester,
    ) async {
      await pumpRef(tester);

      expect(find.text('مجرة الأوتاكو'), findsOneWidget);
      expect(find.text('أهلاً بك في مجرة الأوتاكو'), findsOneWidget);
      // [NOTE] «عراقي» لا «عربي» كما في المرجع: المتجر عراقي فعلاً — أرقام
      // هواتف عراقية، محافظات، دينار، ولهجة عراقية في كل الشاشات. صياغة
      // المرجع هي القديمة، والنصّ في الشاشة هو المصطلح المعتمد. الشرط يبقى
      // على العبارة المميّزة كاملةً، لم يُضعَّف.
      expect(
        find.textContaining('متجر عراقي متكامل لعشّاق الأنمي'),
        findsOneWidget,
      );
      // البطاقة الطافية بسطريها. السطر الثاني يزيد «، وأكثر.» على صياغة
      // المرجع — امتدادٌ مقصود في نصّ المنتج، والشرط يبقى مطابقةً تامّة
      // للسطر كاملاً لا احتواءً جزئياً.
      expect(find.text('منتجات حصرية'), findsOneWidget);
      expect(find.text('حقائب، اكسسوارات، ملابس، وأكثر.'), findsOneWidget);
      expect(find.text('لنبدأ'), findsOneWidget);
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

    testWidgets('no login link on the first slide', (tester) async {
      await pumpRef(tester);

      // الشريحة الأولى تعرض الإجراء الرئيسي فقط — لا رابط «لدي حساب».
      expect(find.text('لدي حساب — تسجيل الدخول'), findsNothing);
      expect(find.text('لنبدأ'), findsOneWidget);
    });

    testWidgets('advancing reveals the next slide and its CTA', (tester) async {
      await pumpRef(tester);

      // البطاقة الطافية تتحرّك بلا توقّف، فلا يستقرّ الشجر أبداً:
      // نضخّ مدداً ثابتة بدل pumpAndSettle.
      await tester.tap(find.text('لنبدأ'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));

      expect(find.text('كل ما يخص عالمك، بمكان واحد'), findsOneWidget);
      expect(find.text('متابعة'), findsOneWidget);

      await tester.tap(find.text('متابعة'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));

      expect(find.text('ابدأ التسوق'), findsOneWidget);
      // «ابدأ التسوق» هو الإجراء الوحيد في الشريحة الأخيرة — لا رابط «لدي
      // حساب»، والمستخدم يدخل المتجر مباشرة.
      expect(find.text('لدي حساب — تسجيل الدخول'), findsNothing);
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
