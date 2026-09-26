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
import 'package:cached_network_image/cached_network_image.dart';
import 'package:otaku_galaxy/core/di/injection_container.dart';
import 'package:otaku_galaxy/features/connectivity/presentation/offline_gate.dart';
import 'package:otaku_galaxy/features/visuals/data/visuals_repository.dart';
import 'package:otaku_galaxy/features/visuals/domain/visual_slot.dart';
import 'package:otaku_galaxy/features/visuals/presentation/managed_artwork.dart';

import 'support/render_harness.dart';

/// رسم الشخصية وحده — الشعار في صفّ الهوية `Image.asset` أيضاً.
final Finder _art = find.byWidgetPredicate(
  (w) => w is Image && w.image is AssetImage && (w.image as AssetImage).assetName.startsWith('assets/art/'),
);

Widget _app({required bool dark, required VoidCallback onRetry}) => MaterialApp(
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
  home: Scaffold(body: Stack(children: [OfflineGateScreen(onRetry: onRetry)])),
);

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
    // الرسم فتحةٌ لهذه الشاشة وحدها (٠٥٥)؛ بلا إعدادٍ معروف يُعرض أصلها المضمَّن.
    final artwork = tester.widget<ManagedArtwork>(find.byType(ManagedArtwork));
    expect(artwork.slot, VisualSlots.offlineGate);
    expect(artwork.fallbackAsset, 'assets/art/opt/a-i17.png');
    expect(_art, findsOneWidget);
    expect((tester.widget<Image>(_art).image as AssetImage).assetName, 'assets/art/opt/a-i17.png');
    expect(find.byType(Opacity), findsNothing);
  });

  testWidgets('[CRITICAL] بصورةٍ من اللوحة: تُعرض صورة هذه الفتحة بمفتاحها، والمضمَّن بديلُ التحميل — الشاشة لا تفرغ', (tester) async {
    final repository = VisualsRepository();
    if (sl.isRegistered<VisualsRepository>()) sl.unregister<VisualsRepository>();
    sl.registerSingleton<VisualsRepository>(repository);
    addTearDown(() {
      repository.dispose();
      sl.unregister<VisualsRepository>();
    });
    repository.seed({
      VisualSlots.offlineGate: const VisualSlot(
        slotKey: VisualSlots.offlineGate,
        currentUrl: '/uploads/slot/offline.png',
      ),
      // فتحةٌ أخرى بصورةٍ أخرى — لا تتسرّب إلى هذه الشاشة.
      VisualSlots.emptyCart: const VisualSlot(
        slotKey: VisualSlots.emptyCart,
        currentUrl: '/uploads/slot/cart.png',
      ),
    });

    await tester.pumpWidget(_app(dark: false, onRetry: () {}));
    await tester.pump();
    final remote = tester.widget<CachedNetworkImage>(find.byType(CachedNetworkImage));
    expect(remote.imageUrl, endsWith('/uploads/slot/offline.png'));
    expect(remote.key, const ValueKey<String>('managed-artwork:${VisualSlots.offlineGate}'));
    // بلا شبكة في الاختبار: بديل التحميل هو المضمَّن نفسه، فلا فراغ أبداً.
    expect(_art, findsOneWidget);
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
