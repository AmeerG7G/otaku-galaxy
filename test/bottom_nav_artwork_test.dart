// التحقق البرمجي من أن شريط التنقل السفلي يعيد إنتاج الأشكال الهندسية
// من مرجع `Otaku Galaxy v2.dc.html` تماماً (أبعاد، أنصاف أقطار، حواف،
// ألوان) بدل استخدام أيقونات Material.

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
    child: Scaffold(body: child),
  ),
);

List<OtakuNavItem> get _items => const [
  OtakuNavItem(
    icon: Icons.home_outlined,
    activeIcon: Icons.home_rounded,
    label: 'الرئيسية',
  ),
  OtakuNavItem(
    icon: Icons.grid_view_outlined,
    activeIcon: Icons.grid_view_rounded,
    label: 'الأقسام',
    gridIconCount: 4,
  ),
  OtakuNavItem(
    icon: Icons.photo_library_outlined,
    activeIcon: Icons.photo_library_rounded,
    label: 'المجتمع',
  ),
  OtakuNavItem(
    icon: Icons.shopping_bag_outlined,
    activeIcon: Icons.shopping_bag_rounded,
    label: 'السلة',
    badgeCount: 3,
  ),
  OtakuNavItem(
    icon: Icons.person_outline,
    activeIcon: Icons.person_rounded,
    label: 'الحساب',
  ),
];

void main() {
  testWidgets('لا تُستخدم أي أيقونات Material في الشريط', (tester) async {
    await tester.pumpWidget(_host(OtakuBottomNav(
      currentIndex: 0,
      raisedIndex: 2,
      onSelected: (_) {},
      items: _items,
    )));
    await tester.pump(const Duration(milliseconds: 300));
    expect(tester.takeException(), isNull);

    final icons = find.byType(Icon);
    // يجب ألّا يُرسم أي Icon من Material في الجسم (نجده في كل عنصر).
    expect(tester.widgetList<Icon>(icons).length, 0,
        reason: 'يجب إعادة إنتاج الأشكال عبر Container لا أيقونات Material');
  });

  testWidgets('أشكال Home/Account/Cart مطابقة لأبعاد وحدود المرجع',
      (tester) async {
    tester.view.physicalSize = const Size(412, 892);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(_host(OtakuBottomNav(
      currentIndex: 0,
      raisedIndex: 2,
      onSelected: (_) {},
      items: _items,
    )));
    await tester.pump(const Duration(milliseconds: 300));

    // HOME النشط: 19×19, radius 7, border 2.2, خلفية وردية.
    final homeContainer = tester.widget<Container>(
      find.byKey(const Key('nav_shape_home')),
    );
    final homeDeco = homeContainer.decoration! as BoxDecoration;
    expect(homeContainer.constraints!.maxWidth, 19);
    expect(homeContainer.constraints!.maxHeight, 19);
    expect((homeDeco.borderRadius as BorderRadius).topLeft.x, 7);
    expect(homeDeco.border!.top.width, 2.2);
    expect(homeDeco.color, AppColors.secondary);

    // ACCOUNT غير النشط: 19×19, دائرة, border 2.2, بلا خلفية.
    final accContainer = tester.widget<Container>(
      find.byKey(const Key('nav_shape_account')),
    );
    final accDeco = accContainer.decoration! as BoxDecoration;
    expect(accDeco.shape, BoxShape.circle);
    expect(accContainer.constraints!.maxWidth, 19);
    expect(accContainer.constraints!.maxHeight, 19);
    expect(accDeco.border!.top.width, 2.2);
    expect(accDeco.color, Colors.transparent);

    // CART: عرض 19, ارتفاع 17, radius سفلي 8, border 2.2.
    final cartContainer = tester.widget<Container>(
      find.byKey(const Key('nav_shape_cart')),
    );
    final cartDeco = cartContainer.decoration! as BoxDecoration;
    expect(cartContainer.constraints!.maxWidth, 19);
    expect(cartContainer.constraints!.maxHeight, 17);
    expect((cartDeco.borderRadius as BorderRadius).bottomLeft.x, 8);
    expect(cartDeco.border!.top.width, 2.2);
  });

  testWidgets('آخر: مربّعات الأقسام 2×2 موزعة 7.5×7.5', (tester) async {
    tester.view.physicalSize = const Size(412, 892);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(_host(OtakuBottomNav(
      currentIndex: 0,
      raisedIndex: 2,
      onSelected: (_) {},
      items: _items,
    )));
    await tester.pump(const Duration(milliseconds: 300));

    final cells = find.byKey(const Key('nav_shape_categories_cell'));
    expect(cells, findsNWidgets(4));
    for (final e in tester.widgetList<Container>(cells)) {
      final deco = e.decoration! as BoxDecoration;
      expect(e.constraints!.maxWidth, 7.5);
      expect(e.constraints!.maxHeight, 7.5);
      expect(deco.borderRadius is BorderRadius, true,
          reason: 'radius 2.5 على شكل BorderRadius');
      expect((deco.borderRadius as BorderRadius).topLeft.x, 2.5);
    }
  });

  testWidgets('زر المجتمع: 50×50, radius 19, border 3, تدرّج وردي→بنفسجي',
      (tester) async {
    tester.view.physicalSize = const Size(412, 892);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(_host(OtakuBottomNav(
      currentIndex: 0,
      raisedIndex: 2,
      onSelected: (_) {},
      items: _items,
    )));
    await tester.pump(const Duration(milliseconds: 300));

    final comm =
        tester.widget<Container>(find.byKey(const Key('nav_shape_community')));
    final deco = comm.decoration! as BoxDecoration;
    expect(comm.constraints!.maxWidth, 50);
    expect(comm.constraints!.maxHeight, 50);
    expect((deco.borderRadius as BorderRadius).topLeft.x, 19);
    expect(deco.border!.top.width, 3);
    final g = deco.gradient! as LinearGradient;
    expect(g.colors.length, 2);
    expect(g.colors[0], AppColors.secondary); // pink
    expect(g.colors[1], AppColors.primary); // violet

    // الشبكة الداخلية 2×2: أربع مستطيلات بيضاء.
    expect(
      find.byKey(const Key('nav_shape_community_cell')),
      findsNWidgets(4),
    );
  });

  testWidgets(
      'الأقسام غير النشطة: المربّعات الأربعة بلون --txt3، والنشطة بلون --pink',
      (tester) async {
    tester.view.physicalSize = const Size(412, 892);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    // الحالة غير النشطة: currentIndex=0 (الرئيسية مفعّلة).
    await tester.pumpWidget(_host(OtakuBottomNav(
      currentIndex: 0,
      raisedIndex: 2,
      onSelected: (_) {},
      items: _items,
    )));
    await tester.pump(const Duration(milliseconds: 300));

    var cells = tester.widgetList<Container>(
      find.byKey(const Key('nav_shape_categories_cell')),
    );
    expect(cells.length, 4);
    for (final c in cells) {
      final deco = c.decoration! as BoxDecoration;
      expect(deco.color, AppColors.onSurfaceDisabled,
          reason: 'غير النشطة يجب أن تكون بلون --txt3 (#9c94b8)');
    }

    // الحالة النشطة: currentIndex=1 (الأقسام مفعّلة).
    await tester.pumpWidget(_host(OtakuBottomNav(
      currentIndex: 1,
      raisedIndex: 2,
      onSelected: (_) {},
      items: _items,
    )));
    await tester.pump(const Duration(milliseconds: 300));

    cells = tester.widgetList<Container>(
      find.byKey(const Key('nav_shape_categories_cell')),
    );
    expect(cells.length, 4);
    for (final c in cells) {
      final deco = c.decoration! as BoxDecoration;
      expect(deco.color, AppColors.secondary,
          reason: 'النشطة يجب أن تكون بلون --pink (#ff3d8f)');
    }
  });
}
