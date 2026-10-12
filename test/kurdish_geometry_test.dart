// [CRITICAL] العربية ← الكردية: يتغيّر النصّ، ولا تتغيّر الهندسة.
//
// كل شاشةٍ هنا تُبنى حقيقيةً مرّتين — عربيةً ثم كردية — بالمقاس وتكبير الخط
// نفسيهما، ثم تُقارن مستطيلات كل عنصرٍ غير نصّي (`support/geometry_probe.dart`).
// المسموح: نصٌّ أطول داخل منطقته، وكبسولةٌ/زرٌّ يلتفّ على تسميته فيتّسع
// عرضه وحده («text-region»). الممنوع: أن يتحرّك أو يتغيّر حجم أي شيءٍ آخر
// — رسمٌ، شعار، بطاقة، زرّ، فاصل — لأن نصّاً طال («bug»)، وأن تتجاوز
// الكردية حيث لا تتجاوز العربية.
//
// [RATCHET] `_knownBugs` و`_knownKurdishOverflows` هما الفروق القائمة يوم كُتب
// الاختبار. العدد **دقيق**: يفشل الاختبار إن زاد (تراجع) وإن نقص (إصلاحٌ لم
// يُسجَّل). بعد كل إصلاح: أنقص الرقم أو احذف السطر. لا يُرفع رقمٌ أبداً.
//
// للتشخيص: `GEOMETRY_REPORT=/path/report.txt flutter test test/kurdish_geometry_test.dart`
// يكتب كل فرقٍ بعناصره ومساراته.

import 'dart:io';

import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/router/app_router.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/features/app_update/domain/app_version_config.dart';
import 'package:otaku_galaxy/features/birthday/presentation/birthday_prompt.dart';
import 'package:otaku_galaxy/features/checkout/presentation/screens/order_data_screen.dart';
import 'package:otaku_galaxy/features/checkout/presentation/screens/order_review_screen.dart';
import 'package:otaku_galaxy/features/checkout/presentation/widgets/order_success_view.dart';
import 'package:otaku_galaxy/features/collections/presentation/screens/collection_detail_screen.dart';
import 'package:otaku_galaxy/features/collections/presentation/screens/collections_tab.dart';
import 'package:otaku_galaxy/features/collections/presentation/widgets/add_to_collection_sheet.dart';
import 'package:otaku_galaxy/features/orders/presentation/widgets/delivery_confirmation_sheet.dart';
import 'package:otaku_galaxy/features/splash/presentation/screens/splash_screen.dart';
import 'package:otaku_galaxy/features/app_update/presentation/screens/force_update_screen.dart';
import 'package:otaku_galaxy/features/auth/domain/entities/account_request.dart';
import 'package:otaku_galaxy/features/auth/presentation/screens/account_pending_screen.dart';
import 'package:otaku_galaxy/features/categories/presentation/screens/category_products_screen.dart';
import 'package:otaku_galaxy/features/connectivity/presentation/offline_gate.dart';
import 'package:otaku_galaxy/features/favorites/presentation/screens/favorites_screen.dart';
import 'package:otaku_galaxy/features/main_navigation/presentation/screens/main_navigation_screen.dart';
import 'package:otaku_galaxy/features/notifications/presentation/screens/notifications_screen.dart';
import 'package:otaku_galaxy/features/onboarding/presentation/screens/onboarding_screen.dart';
import 'package:otaku_galaxy/features/orders/domain/entities/order.dart';
import 'package:otaku_galaxy/features/orders/presentation/screens/order_detail_screen.dart';
import 'package:otaku_galaxy/features/orders/presentation/screens/orders_screen.dart';
import 'package:otaku_galaxy/features/points/presentation/screens/galaxy_points_screen.dart';
import 'package:otaku_galaxy/features/product_detail/presentation/screens/product_detail_screen.dart';
import 'package:otaku_galaxy/features/reviews/presentation/screens/rate_order_screen.dart';
import 'package:otaku_galaxy/features/reviews/presentation/screens/review_submitted_screen.dart';
import 'package:otaku_galaxy/features/reviews/presentation/screens/write_review_screen.dart';
import 'package:otaku_galaxy/features/search/presentation/screens/search_screen.dart';
import 'package:otaku_galaxy/features/settings/presentation/cubit/locale_cubit.dart';
import 'package:otaku_galaxy/features/settings/presentation/screens/personalize_screen.dart';
import 'package:otaku_galaxy/features/settings/presentation/screens/settings_screen.dart';

import 'support/geometry_probe.dart';
import 'support/render_harness.dart';
import 'support/screen_fixtures.dart';

typedef _Pump =
    Future<void> Function(
      WidgetTester tester,
      AppLanguage language,
      double textScale,
    );

_Pump _tab(int tab, {bool loggedIn = true}) =>
    (tester, language, scale) => pumpFixtureShell(
      tester,
      tab: tab,
      language: language,
      textScale: scale,
      loggedIn: loggedIn,
    );

_Pump _screen(Widget Function() build, {bool loggedIn = true}) =>
    (tester, language, scale) => pumpFixtureApp(
      tester,
      home: build(),
      language: language,
      textScale: scale,
      loggedIn: loggedIn,
    );

_Pump _auth(PageRouteInfo route) =>
    (tester, language, scale) => pumpFixtureAuth(
      tester,
      route: route,
      language: language,
      textScale: scale,
    );

final _cases = <String, _Pump>{
  'home': _tab(MainTab.home),
  'categories': _tab(MainTab.categories),
  'community': _tab(MainTab.community),
  'cart': _tab(MainTab.cart),
  'account': _tab(MainTab.account),
  'cart-guest': _tab(MainTab.cart, loggedIn: false),
  'account-guest': _tab(MainTab.account, loggedIn: false),
  'orders': _screen(() => const OrdersScreen()),
  'order-detail': _screen(() => const OrderDetailScreen(orderId: 'o1')),
  'product-detail': _screen(() => const ProductDetailScreen(productId: 'p3')),
  'settings': _screen(() => const SettingsScreen()),
  'settings-guest': _screen(() => const SettingsScreen(), loggedIn: false),
  'personalize': _screen(() => const PersonalizeScreen()),
  'search': _screen(() => const SearchScreen()),
  'favorites': _screen(() => const FavoritesScreen()),
  'notifications': _screen(() => const NotificationsScreen()),
  'galaxy-points': _screen(() => const GalaxyPointsScreen()),
  'rate-order': _screen(
    () => RateOrderScreen(order: fixtureOrder(OrderStatus.completed)),
  ),
  'write-review': _screen(
    () => const WriteReviewScreen(
      orderId: 'o1',
      productId: 'p1',
      productName: 'منتج 1',
    ),
  ),
  'review-submitted': _screen(
    () => const ReviewSubmittedScreen(
      productName: 'منتج 1',
      rating: 4,
      comment: 'رائع جداً',
    ),
  ),
  'pending-register': _screen(
    () => const AccountPendingScreen(kind: AccountRequestKind.registration),
    loggedIn: false,
  ),
  'pending-reset': _screen(
    () => const AccountPendingScreen(kind: AccountRequestKind.passwordReset),
    loggedIn: false,
  ),
  'onboarding': _screen(() => const OnboardingScreen(), loggedIn: false),
  'offline': _screen(
    () => Scaffold(body: Stack(children: [OfflineGateScreen(onRetry: () {})])),
    loggedIn: false,
  ),
  'force-update': _screen(
    () => ForceUpdateScreen(
      config: const AppVersionConfig(
        minimumSupportedVersion: '1.2.0',
        updateUrl: 'https://example.com',
      ),
      installedVersion: '1.1.0',
      onOpenStore: (_) async {},
    ),
    loggedIn: false,
  ),
  'category-products': _screen(
    () => const CategoryProductsScreen(categoryId: 'c1', categoryName: 'قسم 1'),
  ),
  // [NOTE] (البوّابة ٨، 2026-10-10) شاشاتٌ وأوراق لم تُقَس في التدقيق الأول.
  'order-data': _screen(() => const OrderDataScreen()),
  'order-review': _screen(
    () => OrderReviewScreen(orderData: fixtureOrderData()),
  ),
  'order-success': _screen(
    () => Scaffold(
      body: OrderSuccessView(onOpenOrders: () {}, onKeepShopping: () {}),
    ),
  ),
  'collections': _screen(() => const Scaffold(body: CollectionsTab())),
  'collection-detail': _screen(
    () => const CollectionDetailScreen(
      collectionId: 'col1',
      collectionName: 'مجموعتي',
    ),
  ),
  'splash': _screen(() => const SplashScreen(), loggedIn: false),
  // التوفّر: لا ورقة ولا حوار — زرّ «أعلمني عند توفره» في تفاصيل منتجٍ نافد.
  'product-restock': _screen(
    () => const ProductDetailScreen(productId: fixtureOutOfStockId),
  ),
  'sheet-login-gate': _screen(
    () => FixtureSheetHost(open: (context) => showLoginGate(context)),
    loggedIn: false,
  ),
  'sheet-add-to-collection': _screen(
    () => FixtureSheetHost(
      open: (context) => showAddToCollectionSheet(context, productId: 'p1'),
    ),
  ),
  'sheet-delivery-confirmation': _screen(
    () => FixtureSheetHost(
      open: (context) => showDeliveryConfirmationSheet(
        context,
        order: fixtureOrder(OrderStatus.delivering),
      ),
    ),
  ),
  'sheet-birthday': _screen(
    () => FixtureSheetHost(open: (context) => showBirthdayPrompt(context)),
  ),
  'login': _auth(const LoginRoute()),
  'register': _auth(const RegisterRoute()),
  'forgot-password': _auth(const ForgotPasswordRoute()),
};

/// [RATCHET] عدد فروق «bug» القائمة لكل شاشة×مقاس. الغائب = صفر.
const _knownBugs = <String, int>{};

/// [RATCHET] تجاوزاتٌ كردية لا تقع بالعربية: «شاشة@مقاس: جهة @ ملف».
const _knownKurdishOverflows = <String>{};

final _geometry = <String, Map<String, GeoNode>>{};
final _errors = <String, List<String>>{};

void main() {
  setUpAll(loadProjectFonts);

  final views = [...kGeoViews, ...kGeoFullContentViews];
  for (final view in views) {
    for (final entry in _cases.entries) {
      for (final language in AppLanguage.values) {
        testWidgets('${entry.key} $view ${language.code}', (tester) async {
          useGeoView(tester, view);
          final key = '${entry.key}@$view@${language.code}';
          _errors[key] = await captureLayoutErrors(
            () => entry.value(tester, language, view.textScale),
          );
          _geometry[key] = collectGeometry(tester, view: view.size);
          // تفكيك الشجرة قبل `tearDown` يُنهي مؤقّتات الشاشة داخل الاختبار.
          await tester.pumpWidget(const SizedBox.shrink());
          await tester.pump(const Duration(seconds: 2));
        });
      }
    }
  }

  test('[CRITICAL] العقد: لا هندسة غير نصّية تتغيّر بتغيّر اللغة', () {
    final report = StringBuffer();
    final actualBugs = <String, int>{};
    final actualOverflows = <String>{};
    final failures = <String>[];

    for (final view in views) {
      for (final name in _cases.keys) {
        final caseKey = '$name@$view';
        final ar = _geometry['$caseKey@ar'];
        final ckb = _geometry['$caseKey@ckb'];
        if (ar == null || ckb == null) {
          failures.add('$caseKey: لم تُبنَ الشاشة');
          continue;
        }
        final comparison = compareGeometry(ar, ckb);
        final bugs = comparison.bugs.toList();
        if (bugs.isNotEmpty) actualBugs[caseKey] = bugs.length;

        Set<String> overflows(String code) => {
          for (final e in _errors['$caseKey@$code'] ?? const <String>[])
            if (e.contains('overflowed')) overflowKey(e),
        };
        final arOverflows = overflows('ar');
        for (final o in overflows('ckb').difference(arOverflows)) {
          actualOverflows.add('$caseKey: $o');
        }
        final otherErrors = {
          for (final code in ['ar', 'ckb'])
            for (final e in _errors['$caseKey@$code'] ?? const <String>[])
              if (!e.contains('overflowed')) '[$code] $e',
        };

        report.writeln(
          '== $caseKey: bugs=${bugs.length} '
          'text-region=${comparison.textRegions.length} '
          'unmatched=${comparison.unmatched}',
        );
        for (final d in comparison.diffs) {
          report.writeln('  $d');
        }
        for (final o in overflows('ckb').union(arOverflows)) {
          report.writeln('  overflow $o');
        }
        for (final e in otherErrors) {
          report.writeln('  error $e');
        }
        if (otherErrors.isNotEmpty) {
          failures.add('$caseKey: أخطاء غير التجاوز: $otherErrors');
        }

        final known = _knownBugs[caseKey] ?? 0;
        if (bugs.length != known) {
          failures.add(
            '$caseKey: فروق bug = ${bugs.length}، المسجَّل $known'
            '${bugs.length < known ? ' — تحسُّن: أنقص الرقم' : ''}\n'
            '${bugs.map((d) => '    $d').join('\n')}',
          );
        }
      }
    }

    final newOverflows = actualOverflows.difference(_knownKurdishOverflows);
    final fixedOverflows = _knownKurdishOverflows.difference(actualOverflows);
    if (newOverflows.isNotEmpty) {
      failures.add('تجاوزٌ كردي جديد: $newOverflows');
    }
    if (fixedOverflows.isNotEmpty) {
      failures.add('تجاوزٌ كردي زال — احذفه من القائمة: $fixedOverflows');
    }

    final path = Platform.environment['GEOMETRY_REPORT'];
    if (path != null) {
      report
        ..writeln('\n// _knownBugs')
        ..writeln(
          (actualBugs.entries.toList()..sort((a, b) => a.key.compareTo(b.key)))
              .map((e) => "  '${e.key}': ${e.value},")
              .join('\n'),
        )
        ..writeln('\n// _knownKurdishOverflows')
        ..writeln((actualOverflows.toList()..sort()).map((o) => "  '$o',").join('\n'));
      File(path).writeAsStringSync(report.toString());
    }

    expect(failures, isEmpty, reason: failures.join('\n'));
  });
}
