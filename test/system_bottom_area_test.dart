// منطقة النظام السفلية — تبقى للنظام، لا تصير سطحاً من التطبيق.
//
// [CRITICAL] العطب كان لوناً صمّاء: `systemNavigationBarColor: Colors.white`
// يُضبط مرة واحدة عند الإقلاع. مع `SystemUiMode.edgeToEdge` — الوضع الذي
// يشغّله التطبيق — لا معنى لطلاء الشريط أصلاً: الوضع موجود ليمتدّ المحتوى
// تحته. فكان الأبيض يظهر شريطاً يبدو جزءاً من التطبيق أسفل شريط تنقّله،
// ويبقى أبيض في الوضع الداكن لأنه ثابت.
//
// وهذه الاختبارات تقيس **الأسلوب المعلَن** لا صورةً: ما يصل إلى النظام هو
// `SystemUiOverlayStyle`، وهو ما يجب أن يكون شفافاً ومتبعاً للمظهر.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';

/// يبني الأسلوب كما يبنيه التطبيق ثم يقرأه من الشجرة.
Future<SystemUiOverlayStyle> _styleFor(
  WidgetTester tester,
  Brightness brightness, {
  Size size = const Size(412, 892),
  double bottomInset = 48,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    MediaQuery(
      // إزاحة سفلية حقيقية — كما تعطيها منطقة الإيماءات أو الأزرار الثلاثة.
      data: MediaQueryData(
        size: size,
        padding: EdgeInsets.only(bottom: bottomInset),
        viewPadding: EdgeInsets.only(bottom: bottomInset),
      ),
      child: Directionality(
        textDirection: TextDirection.rtl,
        child: AnnotatedRegion<SystemUiOverlayStyle>(
          value: otakuSystemOverlay(brightness),
          child: const SizedBox.expand(),
        ),
      ),
    ),
  );
  await tester.pump();

  return tester
      .widget<AnnotatedRegion<SystemUiOverlayStyle>>(
        find.byType(AnnotatedRegion<SystemUiOverlayStyle>),
      )
      .value;
}

void main() {
  group('أسلوب أشرطة النظام', () {
    for (final brightness in Brightness.values) {
      final mode = brightness == Brightness.light ? 'فاتح' : 'داكن';

      testWidgets('[CRITICAL] الشريط السفلي شفاف — $mode', (tester) async {
        // اللون الصمّاء هنا هو المستطيل الفاتح الذي اشتكى منه المستخدم.
        final style = await _styleFor(tester, brightness);

        expect(style.systemNavigationBarColor, Colors.transparent);
        expect(style.systemNavigationBarDividerColor, Colors.transparent);
        expect(style.statusBarColor, Colors.transparent);
      });

      testWidgets('أيقونات النظام معكوسة عن المظهر — $mode', (tester) async {
        // ضبطها ثابتاً — كما كانت — يجعل نصف المستخدمين يرون أيقونات
        // نظامٍ غير مرئية على خلفيتها.
        final style = await _styleFor(tester, brightness);
        final expected = brightness == Brightness.light
            ? Brightness.dark
            : Brightness.light;

        expect(style.systemNavigationBarIconBrightness, expected);
        expect(style.statusBarIconBrightness, expected);
        // iOS يقرأ سطوع **الخلفية** لا الأيقونات.
        expect(style.statusBarBrightness, brightness);
      });

      testWidgets('لا فرض تباين خلف الشريط — $mode', (tester) async {
        // `systemNavigationBarContrastEnforced` يجعل أندرويد يرسم ستارة
        // شبه شفافة خلف الشريط — وهي بالضبط الطبقة الفاتحة غير المرغوبة.
        final style = await _styleFor(tester, brightness);
        expect(style.systemNavigationBarContrastEnforced, isFalse);
      });
    }

    testWidgets('الأسلوب لا يتغيّر بتغيّر المقاس أو الاتجاه', (tester) async {
      // عمودي، أفقي، لوح — الإزاحة تختلف، والأسلوب لا يعتمد عليها.
      for (final size in const [
        Size(412, 892), // هاتف عمودي
        Size(892, 412), // هاتف أفقي
        Size(834, 1112), // لوح
      ]) {
        final style = await _styleFor(
          tester,
          Brightness.light,
          size: size,
          bottomInset: size.width > size.height ? 0 : 48,
        );
        expect(style.systemNavigationBarColor, Colors.transparent, reason: '$size');
      }
    });
  });

  group('المسافة تأتي من إزاحة النظام لا من رقم ثابت', () {
    testWidgets('[CRITICAL] شريط التنقّل يتبع الإزاحة الحقيقية', (tester) async {
      // الأزرار الثلاثة تعطي إزاحة كبيرة، والإيماءات إزاحة صغيرة، وبعض
      // الأجهزة صفراً. أي حشوة ثابتة تكسر واحدةً من الثلاث — فالمقياس أن
      // ارتفاع الشريط يتحرّك مع الإزاحة.
      final heights = <double, double>{};
      for (final inset in const [0.0, 24.0, 48.0]) {
        tester.view.physicalSize = const Size(412, 892);
        tester.view.devicePixelRatio = 1.0;
        addTearDown(tester.view.reset);

        await tester.pumpWidget(
          MaterialApp(
            theme: AppTheme.light,
            locale: const Locale('ar'),
            home: MediaQuery(
              data: MediaQueryData(
                size: const Size(412, 892),
                padding: EdgeInsets.only(bottom: inset),
                viewPadding: EdgeInsets.only(bottom: inset),
              ),
              child: Directionality(
                textDirection: TextDirection.rtl,
                child: Scaffold(
                  extendBody: true,
                  body: const SizedBox.expand(),
                  bottomNavigationBar: OtakuBottomNav(
                    currentIndex: 0,
                    raisedIndex: 2,
                    onSelected: (_) {},
                    items: const [
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
                      ),
                      OtakuNavItem(
                        icon: Icons.person_outline,
                        activeIcon: Icons.person_rounded,
                        label: 'الحساب',
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        );
        await tester.pump();
        heights[inset] = tester.getSize(find.byType(OtakuBottomNav)).height;
      }

      expect(
        heights[24.0]! - heights[0.0]!,
        closeTo(24, 0.5),
        reason: 'الشريط لا يتبع إزاحة النظام — حشوة ثابتة في مكان ما',
      );
      expect(heights[48.0]! - heights[24.0]!, closeTo(24, 0.5));
    });
  });
}
