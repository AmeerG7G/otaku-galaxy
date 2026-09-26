// شريط التنقل يوصّل الضغط إلى وجهته — خاصةً السلة والحساب.
//
// [CRITICAL] السلة (٣) والحساب (٤) تبويبان **محميان**: `MainNavigationScreen`
// يمرّرهما عبر `requireAuthentication` قبل تبديل التبويب. فإن بدا أن الزرّ
// «لا يعمل» فالاحتمال الأول أن المستخدم زائر وأن بوابة الدخول ظهرت — سلوكٌ
// مقصود لا عطب. ما يحرسه هذا الملف هو الطبقة التي تحته: أن الضغط يصل
// `onSelected` بفهرسه الصحيح أصلاً. لو انقطع هذا لما نفع أي منطق فوقه.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';

Widget _host(Widget child) => MaterialApp(
      theme: AppTheme.light,
      locale: const Locale('ar'),
      localizationsDelegates: const [
        DefaultMaterialLocalizations.delegate,
        DefaultWidgetsLocalizations.delegate,
      ],
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: Scaffold(bottomNavigationBar: child),
      ),
    );

const _items = [
  OtakuNavItem(icon: Icons.home_outlined, activeIcon: Icons.home_rounded, label: 'الرئيسية'),
  OtakuNavItem(icon: Icons.grid_view_outlined, activeIcon: Icons.grid_view_rounded, label: 'الأقسام', gridIconCount: 4),
  OtakuNavItem(icon: Icons.photo_library_outlined, activeIcon: Icons.photo_library_rounded, label: 'المجتمع'),
  OtakuNavItem(icon: Icons.shopping_bag_outlined, activeIcon: Icons.shopping_bag_rounded, label: 'السلة'),
  OtakuNavItem(icon: Icons.person_outline, activeIcon: Icons.person_rounded, label: 'الحساب'),
];

/// فهارس التبويبات كما يعرّفها `MainTab`.
const _cart = 3;
const _account = 4;

Future<List<int>> _tapSlots(WidgetTester tester, List<int> slots) async {
  tester.view.physicalSize = const Size(400, 800);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  final taps = <int>[];
  await tester.pumpWidget(_host(OtakuBottomNav(
    currentIndex: 0, raisedIndex: 2, onSelected: taps.add, items: _items)));
  await tester.pumpAndSettle();

  final bar = tester.getRect(find.byType(OtakuBottomNav));
  for (final slot in slots) {
    // RTL: التبويب ٠ في أقصى اليمين الفيزيائي.
    final dx = bar.right - (bar.width * (slot + 0.5) / _items.length);
    await tester.tapAt(Offset(dx, bar.top + bar.height * 0.45));
    await tester.pump();
  }
  return taps;
}

void main() {
  testWidgets('[CRITICAL] الضغط على السلة يبلّغ فهرسها', (tester) async {
    expect(await _tapSlots(tester, [_cart]), [_cart]);
  });

  testWidgets('[CRITICAL] الضغط على الحساب يبلّغ فهرسه', (tester) async {
    expect(await _tapSlots(tester, [_account]), [_account]);
  });

  testWidgets('كل تبويب يبلّغ فهرسه هو — لا انزياح', (tester) async {
    expect(await _tapSlots(tester, [0, 1, 2, 3, 4]), [0, 1, 2, 3, 4]);
  });

  testWidgets('لا شيء يحجب اللمس فوق التبويبين المحميّين', (tester) async {
    // حارسٌ ضد `IgnorePointer`/`AbsorbPointer`/طبقةٍ عائمة تبتلع الضغط.
    final taps = await _tapSlots(tester, [_cart, _account]);
    expect(taps, [_cart, _account]);
  });

  group('عدائي: تكرار الضغط', () {
    testWidgets('الضغط المتكرّر على السلة يبلّغ في كل مرة', (tester) async {
      final taps = await _tapSlots(tester, [_cart, _cart, _cart]);
      expect(taps, [_cart, _cart, _cart]);
    });

    testWidgets('التنقّل السريع بين السلة والحساب لا يفقد ضغطة', (tester) async {
      final taps = await _tapSlots(
          tester, [_cart, _account, _cart, _account, _cart]);
      expect(taps, [_cart, _account, _cart, _account, _cart]);
    });
  });
}
