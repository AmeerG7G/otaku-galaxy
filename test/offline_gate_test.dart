// شاشة انقطاع الاتصال: كل شيء موسَّط، ولا جملة «يحتاج المتجر إلى اتصال».
//
// [PRODUCT] قرار 2026-09-20: الرسم فوق ثم أيقونة الانقطاع ثم العنوان والنصّ،
// كلٌّ على محور اللوحة؛ ومؤشّر «غير متصل» موسَّط تحتها. منطق الكشف وإعادة
// المحاولة في `OfflineGate` لم يُمسّ — هنا الشاشة وحدها. والرسم فتحةٌ
// (`offline_gate_character`، الهجرة ٠٥٥) بأصلٍ مضمَّن إلزامي.

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/core/l10n/app_strings.dart';
import 'package:otaku_galaxy/core/l10n/locale_scope.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:otaku_galaxy/features/connectivity/presentation/offline_gate.dart';
import 'package:otaku_galaxy/features/settings/presentation/cubit/locale_cubit.dart';
import 'package:otaku_galaxy/features/visuals/domain/visual_slot.dart';
import 'package:otaku_galaxy/features/visuals/presentation/character_artwork.dart';

import 'support/render_harness.dart';

/// رسم الشخصية وحده — الشعار في صفّ الهوية `Image.asset` أيضاً.
final Finder _art = find.byWidgetPredicate(
  (w) => w is Image && w.image is AssetImage && (w.image as AssetImage).assetName.startsWith('assets/art/'),
);

Widget _app({
  required bool dark,
  required VoidCallback onRetry,
  AppLanguage language = AppLanguage.arabic,
}) => MaterialApp(
  theme: AppTheme.light,
  darkTheme: AppTheme.dark,
  themeMode: dark ? ThemeMode.dark : ThemeMode.light,
  locale: const Locale('ar'),
  supportedLocales: const [Locale('ar')],
  localizationsDelegates: const [
    GlobalMaterialLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
  ],
  home: LocaleScope(
    language: language,
    child: Scaffold(body: Stack(children: [OfflineGateScreen(onRetry: onRetry)])),
  ),
);

/// المنطقة القابلة للتمرير تحت صفّ الهوية.
ScrollPosition _scroll(WidgetTester tester) => tester
    .state<ScrollableState>(
      find.descendant(of: find.byType(OfflineGateScreen), matching: find.byType(Scrollable)).first,
    )
    .position;

void main() {
  setUpAll(loadProjectFonts);

  for (final dark in [false, true]) {
    final mode = dark ? 'داكن' : 'فاتح';

    testWidgets('[CRITICAL] الرسم والأيقونة والعنوان والنصّ موسَّطة، والرسم فوق الأيقونة فوق النصّ ($mode)', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(412, 892);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(_app(dark: dark, onRetry: () {}));
      await tester.pump();

      final screen = tester.getRect(find.byType(OfflineGateScreen));
      final art = tester.getRect(_art);
      final icon = tester.getRect(find.byIcon(Icons.wifi_off_rounded));
      final title = tester.getRect(find.text(AppStrings.arabic('offlineTitle')));
      final body = tester.getRect(find.text(AppStrings.arabic('offlineBody')));
      final status = tester.getRect(find.text(AppStrings.arabic('offlineShort')));

      for (final (name, rect) in [('الرسم', art), ('الأيقونة', icon), ('العنوان', title), ('النصّ', body)]) {
        expect(rect.center.dx, closeTo(screen.center.dx, 4), reason: '$name ليس موسَّطاً');
      }
      expect(art.bottom, lessThanOrEqualTo(icon.top + 1), reason: 'الرسم فوق الأيقونة');
      expect(icon.bottom, lessThanOrEqualTo(title.top + 1), reason: 'الأيقونة فوق العنوان');
      expect(title.bottom, lessThanOrEqualTo(body.top + 1), reason: 'العنوان فوق النصّ');
      // مؤشّر الحالة (نقطة + «غير متصل») موسَّط: الصفّ يبدأ ويُختم على مسافة
      // متساوية من الحافتين، لا ملتصقاً بجهة البداية.
      final dot = tester.getRect(
        find.descendant(
          of: find.byType(OfflineGateScreen),
          matching: find.byWidgetPredicate(
            (w) => w is Container && w.decoration is BoxDecoration && (w.decoration as BoxDecoration).shape == BoxShape.circle && w.constraints?.maxWidth == 8,
          ),
        ),
      );
      final row = Rect.fromLTRB(
        [dot.left, status.left].reduce((a, b) => a < b ? a : b),
        dot.top,
        [dot.right, status.right].reduce((a, b) => a > b ? a : b),
        dot.bottom,
      );
      expect(row.center.dx, closeTo(screen.center.dx, 8), reason: 'مؤشّر الحالة ليس موسَّطاً');
      for (final finder in [find.text(AppStrings.arabic('offlineTitle')), find.text(AppStrings.arabic('offlineBody'))]) {
        expect(tester.widget<Text>(finder).textAlign, TextAlign.center);
      }
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('النصوص المطلوبة حاضرة، والجملة المحذوفة غائبة، والرسم فتحةٌ مستقلّة بأصلها المضمَّن', (tester) async {
    await tester.pumpWidget(_app(dark: false, onRetry: () {}));
    await tester.pump();
    expect(find.text('لا يوجد اتصال بالإنترنت'), findsOneWidget);
    expect(find.text('تحقّق من اتصالك وحاول مرة أخرى.'), findsOneWidget);
    expect(find.text('غير متصل بالإنترنت'), findsOneWidget);
    expect(find.textContaining('يحتاج المتجر'), findsNothing);
    // الرسم موضعٌ لهذه الشاشة وحدها (٠٥٥) بملفّه المرقَّم الثابت.
    final artwork = tester.widget<CharacterArtwork>(find.byType(CharacterArtwork));
    expect(artwork.slot, VisualSlots.offlineGate);
    expect(_art, findsOneWidget);
    expect((tester.widget<Image>(_art).image as AssetImage).assetName, 'assets/art/characters/35.png');
    expect(find.byType(Opacity), findsNothing);
  });

  testWidgets('[CRITICAL] الرسم أصلٌ ثابت بلا شبكة — الصورة التي كانت مختارةً في اللوحة نفسها', (tester) async {
    // اختيار اللوحة لهذا الموضع نُسخ بايتاً ببايت إلى `35.png` — سطرُه في
    // `CharacterArt`، لا `CachedNetworkImage` ولا انتظار شبكة.
    await tester.pumpWidget(_app(dark: false, onRetry: () {}));
    await tester.pump();
    expect(CharacterArt.forSlot(VisualSlots.offlineGate), 'assets/art/characters/35.png');
    expect(find.byType(CachedNetworkImage), findsNothing);
    expect((tester.widget<Image>(_art).image as AssetImage).assetName, 'assets/art/characters/35.png');
  });

  // [CRITICAL] (البوّابة ٩، 2026-10-12) أصغر هاتفٍ بخطٍّ مكبَّر: البطاقة والحالة
  // والزرّ أطول من الشاشة. كان العمود الموسَّط يتجاوز أسفله (٧٢ بالعربية)
  // والزرّ خارجها بلا وصول؛ الآن يُمرَّر — وحين يتّسع لا تمرير ولا تغيير.
  for (final language in AppLanguage.values) {
    testWidgets('[CRITICAL] ٣٢٠×٥٦٨ ×١٫٣ (${language.code}): بلا تجاوز، والزرّ يُبلَغ بالتمرير', (tester) async {
      tester.view.physicalSize = const Size(320, 568);
      tester.view.devicePixelRatio = 1.0;
      tester.platformDispatcher.textScaleFactorTestValue = 1.3;
      addTearDown(tester.view.reset);
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      var retries = 0;
      await tester.pumpWidget(_app(dark: false, onRetry: () => retries++, language: language));
      await tester.pump();
      expect(tester.takeException(), isNull);
      expect(_scroll(tester).maxScrollExtent, greaterThan(0));

      final retry = find.text(AppStrings.of(language)('retry'));
      await tester.scrollUntilVisible(
        retry,
        100,
        scrollable: find.descendant(of: find.byType(OfflineGateScreen), matching: find.byType(Scrollable)).first,
      );
      await tester.tap(retry);
      await tester.pump();
      expect(retries, 1);
    });
  }

  // [CRITICAL] (البوّابة ١٥، 2026-10-17) ×٢٫٠ من مصفوفة القياس الموثّقة: اسم
  // المتجر في صفّ الهوية كان `Text` بلا حدّ فيتجاوز «گەلاکسی ئۆتاکو» يميناً
  // ١٧. الآن منطقةٌ تُصغَّر حتى ٠٫٨ من مقاس التصميم، والصفّ بالارتفاع نفسه
  // باللغتين. (عنوان الحالة الكردي لا يتّسع بعدُ لأسطره الثلاثة عند ×٢٫٠ —
  // مسجَّلٌ في تقرير البوّابة ١٥؛ هذا الاختبار يحرس التجاوز وصفّ الهوية.)
  testWidgets('[CRITICAL] ٣٢٠×٥٦٨ ×٢٫٠: صفّ الهوية بلا تجاوز وبالارتفاع نفسه باللغتين', (tester) async {
    tester.view.physicalSize = const Size(320, 568);
    tester.view.devicePixelRatio = 1.0;
    tester.platformDispatcher.textScaleFactorTestValue = 2.0;
    addTearDown(tester.view.reset);
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    final rows = <double>[];
    for (final language in AppLanguage.values) {
      final overflows = <String>[];
      final previous = FlutterError.onError;
      FlutterError.onError = (details) {
        final text = details.exceptionAsString();
        if (text.contains('overflowed')) overflows.add(text.split('\n').first);
      };
      try {
        await tester.pumpWidget(_app(dark: false, onRetry: () {}, language: language));
        await tester.pump();
      } finally {
        FlutterError.onError = previous;
      }
      expect(overflows, isEmpty, reason: language.code);
      final brand = find.ancestor(
        of: find.text(AppStrings.of(language)('brandName')),
        matching: find.byType(Row),
      );
      rows.add(tester.getSize(brand.first).height);
    }
    expect(rows.toSet(), hasLength(1), reason: 'صفّ الهوية: $rows');
  });

  testWidgets('يتّسع (٤١٢×٨٩٢ ×١٫٠): لا تمرير، والمحتوى موسَّط كما كان', (tester) async {
    tester.view.physicalSize = const Size(412, 892);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(_app(dark: false, onRetry: () {}));
    await tester.pump();
    expect(_scroll(tester).maxScrollExtent, 0);
  });

  testWidgets('زرّ إعادة المحاولة يستدعي المعاود — منطق الكشف كما هو', (tester) async {
    var retries = 0;
    await tester.pumpWidget(_app(dark: false, onRetry: () => retries++));
    await tester.pump();
    await tester.tap(find.text(AppStrings.arabic('retry')));
    await tester.pump();
    expect(retries, 1);
  });
}
