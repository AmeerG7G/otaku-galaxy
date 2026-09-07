// حالة السلة الفارغة — تركيبٌ موسّط: الرسم فوق ثم الزرّ تحته.
//
// [CRITICAL] هذا الاختبار هندسي لا بصري: يقيس مواضع الصورة والزرّ فعلياً.
// العطل الذي كشفه أول تشغيل لم يكن ليُرى بقراءة الشيفرة — الطفل غير
// المموضَع في `Stack` يُحاذى إلى `AlignmentDirectional.topStart`، وهي في
// واجهة عربية أعلى اليمين، فكان العمود «الموسّط» ملتصقاً بالحافة اليمنى
// (مركزه ٢٢٩ بدل ٢٠٦). القياس هو ما أظهره.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';

void main() {
  testWidgets('cart empty state is centered, image above button', (tester) async {
    tester.view.physicalSize = const Size(412, 892);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: Directionality(
          textDirection: TextDirection.rtl,
          child: Scaffold(
              body: AnimeEmptyState(
                title: 'السلة فاضية',
                subtitle: 'خذ جولة بالمتجر واختار اللي يعجبك، السلة راح تنتظرك.',
                artwork: 'assets/art/opt/a-luffy-kid.png',
                actionLabel: 'استكشف المنتجات',
                onAction: () {},
                centered: true,
              ),
          ),
        ),
      ),
    );
    await tester.runAsync(() async {
      await precacheImage(const AssetImage('assets/art/opt/a-luffy-kid.png'),
          tester.element(find.byType(Scaffold)));
      await Future<void>.delayed(const Duration(milliseconds: 300));
    });
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));

    final img = tester.getRect(find.byType(Image).first);
    final btn = tester.getRect(find.text('استكشف المنتجات'));
    // اللوحة الفعلية: أول Container له ارتفاع محدَّد داخل المكوّن.
    final panel = tester.getRect(find.descendant(
      of: find.byType(SingleChildScrollView),
      matching: find.byType(Container),
    ).first);
    // الصورة فوق الزرّ
    expect(img.bottom, lessThan(btn.top), reason: 'الصورة يجب أن تعلو الزرّ');
    // كلاهما موسّط أفقياً
    expect(img.center.dx, closeTo(panel.center.dx, 6));
    expect(btn.center.dx, closeTo(panel.center.dx, 6));
    expect(img.center.dx, closeTo(btn.center.dx, 2),
        reason: 'الصورة والزرّ على المحور نفسه');

    expect(tester.takeException(), isNull);
  });
}
