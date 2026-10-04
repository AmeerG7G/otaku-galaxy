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
import 'package:otaku_galaxy/features/app_update/domain/app_version_config.dart';
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
  'login': _auth(const LoginRoute()),
  'register': _auth(const RegisterRoute()),
  'forgot-password': _auth(const ForgotPasswordRoute()),
};

/// [RATCHET] عدد فروق «bug» القائمة لكل شاشة×مقاس. الغائب = صفر.
const _knownBugs = <String, int>{
  'account-guest@320x3000@1.3': 18,
  'account-guest@320x568@1.3': 10,
  'account-guest@375x812@1.0': 18,
  'account-guest@412x3000@1.3': 18,
  'account-guest@412x892@1.0': 18,
  'account-guest@412x892@1.3': 18,
  'account@320x3000@1.3': 32,
  'account@320x568@1.3': 19,
  'account@375x812@1.0': 13,
  'account@412x3000@1.3': 13,
  'account@412x892@1.0': 13,
  'account@412x892@1.3': 13,
  'cart-guest@320x3000@1.3': 7,
  'cart-guest@320x568@1.3': 7,
  'cart-guest@375x812@1.0': 4,
  'cart-guest@412x3000@1.3': 4,
  'cart-guest@412x892@1.0': 4,
  'cart-guest@412x892@1.3': 4,
  'cart@320x3000@1.3': 22,
  'cart@320x568@1.3': 20,
  'cart@375x812@1.0': 22,
  'cart@412x3000@1.3': 22,
  'cart@412x892@1.0': 22,
  'cart@412x892@1.3': 22,
  'categories@320x3000@1.3': 7,
  'categories@320x568@1.3': 5,
  'categories@375x812@1.0': 7,
  'categories@412x3000@1.3': 7,
  'categories@412x892@1.0': 7,
  'categories@412x892@1.3': 7,
  'category-products@320x3000@1.3': 5,
  'category-products@412x3000@1.3': 5,
  'community@320x3000@1.3': 21,
  'community@320x568@1.3': 18,
  'community@375x812@1.0': 21,
  'community@412x3000@1.3': 21,
  'community@412x892@1.0': 21,
  'community@412x892@1.3': 21,
  'favorites@320x3000@1.3': 10,
  'favorites@320x568@1.3': 8,
  'favorites@375x812@1.0': 10,
  'favorites@412x3000@1.3': 10,
  'favorites@412x892@1.0': 10,
  'favorites@412x892@1.3': 10,
  'force-update@320x3000@1.3': 3,
  'force-update@320x568@1.3': 1,
  'force-update@375x812@1.0': 3,
  'force-update@412x3000@1.3': 3,
  'force-update@412x892@1.0': 3,
  'force-update@412x892@1.3': 3,
  'forgot-password@320x3000@1.3': 10,
  'forgot-password@320x568@1.3': 6,
  'forgot-password@375x812@1.0': 8,
  'forgot-password@412x3000@1.3': 10,
  'forgot-password@412x892@1.0': 7,
  'forgot-password@412x892@1.3': 11,
  'galaxy-points@320x3000@1.3': 10,
  'galaxy-points@320x568@1.3': 6,
  'galaxy-points@375x812@1.0': 10,
  'galaxy-points@412x3000@1.3': 10,
  'galaxy-points@412x892@1.0': 10,
  'galaxy-points@412x892@1.3': 8,
  'home@320x3000@1.3': 92,
  'home@320x568@1.3': 17,
  'home@375x812@1.0': 36,
  'home@412x3000@1.3': 92,
  'home@412x892@1.0': 40,
  'home@412x892@1.3': 37,
  'login@320x3000@1.3': 9,
  'login@320x568@1.3': 8,
  'login@412x3000@1.3': 8,
  'login@412x892@1.3': 8,
  'notifications@320x3000@1.3': 8,
  'notifications@320x568@1.3': 4,
  'notifications@375x812@1.0': 8,
  'notifications@412x3000@1.3': 8,
  'notifications@412x892@1.0': 8,
  'notifications@412x892@1.3': 8,
  'offline@320x3000@1.3': 7,
  'offline@320x568@1.3': 1,
  'offline@375x812@1.0': 7,
  'offline@412x3000@1.3': 7,
  'offline@412x892@1.0': 7,
  'offline@412x892@1.3': 7,
  'onboarding@320x3000@1.3': 2,
  'onboarding@320x568@1.3': 2,
  'onboarding@375x812@1.0': 2,
  'onboarding@412x3000@1.3': 2,
  'onboarding@412x892@1.0': 2,
  'onboarding@412x892@1.3': 2,
  'order-detail@320x3000@1.3': 33,
  'order-detail@320x568@1.3': 8,
  'order-detail@375x812@1.0': 16,
  'order-detail@412x3000@1.3': 33,
  'order-detail@412x892@1.0': 21,
  'order-detail@412x892@1.3': 14,
  'orders@320x3000@1.3': 31,
  'orders@320x568@1.3': 14,
  'orders@375x812@1.0': 31,
  'orders@412x3000@1.3': 31,
  'orders@412x892@1.0': 31,
  'orders@412x892@1.3': 31,
  'pending-register@320x3000@1.3': 6,
  'pending-register@320x568@1.3': 2,
  'pending-register@375x812@1.0': 6,
  'pending-register@412x3000@1.3': 6,
  'pending-register@412x892@1.0': 6,
  'pending-register@412x892@1.3': 6,
  'pending-reset@320x3000@1.3': 6,
  'pending-reset@320x568@1.3': 3,
  'pending-reset@375x812@1.0': 6,
  'pending-reset@412x3000@1.3': 6,
  'pending-reset@412x892@1.0': 6,
  'pending-reset@412x892@1.3': 6,
  'personalize@320x3000@1.3': 37,
  'personalize@320x568@1.3': 20,
  'personalize@375x812@1.0': 32,
  'personalize@412x3000@1.3': 37,
  'personalize@412x892@1.0': 32,
  'personalize@412x892@1.3': 37,
  'product-detail@320x3000@1.3': 16,
  'product-detail@320x568@1.3': 1,
  'product-detail@375x812@1.0': 13,
  'product-detail@412x3000@1.3': 16,
  'product-detail@412x892@1.0': 13,
  'product-detail@412x892@1.3': 13,
  'rate-order@320x3000@1.3': 13,
  'rate-order@320x568@1.3': 13,
  'rate-order@375x812@1.0': 13,
  'rate-order@412x3000@1.3': 13,
  'rate-order@412x892@1.0': 13,
  'rate-order@412x892@1.3': 13,
  'register@320x3000@1.3': 13,
  'register@320x568@1.3': 11,
  'register@375x812@1.0': 1,
  'register@412x3000@1.3': 13,
  'register@412x892@1.0': 2,
  'register@412x892@1.3': 13,
  'review-submitted@320x3000@1.3': 6,
  'review-submitted@320x568@1.3': 6,
  'review-submitted@375x812@1.0': 6,
  'review-submitted@412x3000@1.3': 6,
  'review-submitted@412x892@1.0': 6,
  'review-submitted@412x892@1.3': 6,
  'search@320x3000@1.3': 9,
  'search@320x568@1.3': 9,
  'search@375x812@1.0': 9,
  'search@412x3000@1.3': 9,
  'search@412x892@1.0': 9,
  'search@412x892@1.3': 9,
  'settings-guest@320x3000@1.3': 26,
  'settings-guest@320x568@1.3': 11,
  'settings-guest@375x812@1.0': 16,
  'settings-guest@412x3000@1.3': 18,
  'settings-guest@412x892@1.0': 18,
  'settings-guest@412x892@1.3': 18,
  'settings@320x3000@1.3': 26,
  'settings@320x568@1.3': 11,
  'settings@375x812@1.0': 16,
  'settings@412x3000@1.3': 18,
  'settings@412x892@1.0': 18,
  'settings@412x892@1.3': 18,
  'write-review@320x3000@1.3': 11,
  'write-review@320x568@1.3': 7,
  'write-review@375x812@1.0': 11,
  'write-review@412x3000@1.3': 11,
  'write-review@412x892@1.0': 11,
  'write-review@412x892@1.3': 11,
};

/// [RATCHET] تجاوزاتٌ كردية لا تقع بالعربية: «شاشة@مقاس: جهة @ موضع».
const _knownKurdishOverflows = <String>{
  'account-guest@320x3000@1.3: right @ lib/features/home/presentation/screens/home_screen.dart:368',
  'account-guest@320x568@1.3: right @ lib/features/home/presentation/screens/home_screen.dart:368',
  'account@320x3000@1.3: right @ lib/features/home/presentation/screens/home_screen.dart:368',
  'account@320x568@1.3: right @ lib/features/home/presentation/screens/home_screen.dart:368',
  'cart-guest@320x3000@1.3: right @ lib/features/home/presentation/screens/home_screen.dart:368',
  'cart-guest@320x568@1.3: right @ lib/features/home/presentation/screens/home_screen.dart:368',
  'cart@320x3000@1.3: right @ lib/features/cart/presentation/screens/cart_screen.dart:217',
  'cart@320x3000@1.3: right @ lib/features/home/presentation/screens/home_screen.dart:368',
  'cart@320x568@1.3: right @ lib/features/cart/presentation/screens/cart_screen.dart:217',
  'cart@320x568@1.3: right @ lib/features/home/presentation/screens/home_screen.dart:368',
  'categories@320x3000@1.3: right @ lib/features/home/presentation/screens/home_screen.dart:368',
  'categories@320x568@1.3: right @ lib/features/home/presentation/screens/home_screen.dart:368',
  'community@320x3000@1.3: right @ lib/features/home/presentation/screens/home_screen.dart:368',
  'community@320x568@1.3: right @ lib/features/home/presentation/screens/home_screen.dart:368',
  'home@320x3000@1.3: right @ lib/features/home/presentation/screens/home_screen.dart:368',
  'home@320x568@1.3: right @ lib/features/home/presentation/screens/home_screen.dart:368',
  'notifications@320x3000@1.3: right @ lib/core/design_system/components/navigation/otaku_screen_header.dart:331',
  'notifications@320x568@1.3: bottom @ lib/features/notifications/presentation/screens/notifications_screen.dart:83',
  'notifications@320x568@1.3: right @ lib/core/design_system/components/navigation/otaku_screen_header.dart:331',
  'order-detail@320x3000@1.3: right @ lib/features/orders/presentation/screens/order_detail_screen.dart:531',
  'orders@320x3000@1.3: right @ lib/core/design_system/components/buttons/anime_primary_button.dart:109',
  'orders@320x3000@1.3: right @ lib/core/design_system/components/cards/anime_order_card.dart:49',
  'orders@320x568@1.3: right @ lib/core/design_system/components/buttons/anime_primary_button.dart:109',
  'orders@320x568@1.3: right @ lib/core/design_system/components/cards/anime_order_card.dart:49',
};

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
