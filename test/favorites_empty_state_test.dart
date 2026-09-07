// حالة المفضلة الفارغة — نفس نمط السلة: الرسم فوق ثم الزرّ تحته، موسّطين.
//
// [CRITICAL] القياس هندسي لا بصري. العطب الذي كشفه هذا النمط أول مرة (في
// السلة) لم يكن ليُرى بقراءة الشيفرة: الطفل غير المموضَع في `Stack` يُحاذى
// إلى `AlignmentDirectional.topStart` — أعلى **اليمين** في واجهة عربية —
// فيبدو العمود «موسّطاً» داخل صندوقٍ ملتصقٍ بالحافة. القياس وحده يكشفه،
// ولذلك يُعاد هنا على المفضلة بدل الاكتفاء بأن الخيار مُمرَّر.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';

/// مقاسات مرجعية — هاتف صغير، هاتف، لوح.
const _sizes = <String, Size>{
  'هاتف صغير': Size(320, 640),
  'هاتف': Size(412, 892),
  'لوح': Size(834, 1112),
};

/// نصوص المفضلة الحقيقية كما في `favorites_screen.dart`.
const _artwork = 'assets/art/opt/a-i2.png';
const _action = 'اكتشف منتجات';

Future<void> _pump(WidgetTester tester, Size size) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.light,
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: Scaffold(
          body: AnimeEmptyState(
            title: 'مفضلتك لسه فاضية',
            subtitle: 'اضغط القلب على أي منتج يعجبك، وراح يستناك هنا.',
            artwork: _artwork,
            actionLabel: _action,
            onAction: () {},
            centered: true,
          ),
        ),
      ),
    ),
  );

  // `Image.asset` يفكّ الترميز لا تزامنياً؛ بلا هذا يبقى إطار الصورة فارغاً
  // فيُقاس موضعٌ ليس موضعها.
  await tester.runAsync(() async {
    await precacheImage(
      const AssetImage(_artwork),
      tester.element(find.byType(Scaffold)),
    );
    await Future<void>.delayed(const Duration(milliseconds: 300));
  });
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 200));
}

void main() {
  for (final entry in _sizes.entries) {
    testWidgets('المفضلة الفارغة موسّطة والصورة فوق الزرّ — ${entry.key}', (
      tester,
    ) async {
      await _pump(tester, entry.value);

      final image = tester.getRect(find.byType(Image).first);
      final button = tester.getRect(find.text(_action));
      final panel = tester
          .getRect(
            find
                .descendant(
                  of: find.byType(SingleChildScrollView),
                  matching: find.byType(Container),
                )
                .first,
          );

      expect(
        image.bottom,
        lessThan(button.top),
        reason: 'الصورة يجب أن تعلو الزرّ',
      );
      expect(
        image.center.dx,
        closeTo(panel.center.dx, 6),
        reason: 'الصورة موسّطة داخل اللوحة',
      );
      expect(
        button.center.dx,
        closeTo(panel.center.dx, 6),
        reason: 'الزرّ موسّط داخل اللوحة',
      );
      expect(
        image.center.dx,
        closeTo(button.center.dx, 2),
        reason: 'الصورة والزرّ على المحور نفسه',
      );
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('[CRITICAL] النمط الجانبي يبقى لبقية الشاشات', (tester) async {
    // `centered` خيارٌ صريح لا افتراضي: المكوّن مشترك بين إحدى عشرة شاشة،
    // وقلبُه عامّاً كان سيعيد تصميم تسعٍ لم يطلبها أحد.
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
              title: 'لا نتائج',
              subtitle: 'جرّب كلمة أخرى.',
              actionLabel: 'رجوع',
              onAction: () {},
            ),
          ),
        ),
      ),
    );
    await tester.pump();

    final button = tester.getRect(find.text('رجوع'));
    final panel = tester
        .getRect(
          find
              .descendant(
                of: find.byType(SingleChildScrollView),
                matching: find.byType(Container),
              )
              .first,
        );
    // في التخطيط الجانبي الزرّ مثبّت في جهة البداية (اليمين بالعربية)،
    // فمركزه أبعد من مركز اللوحة.
    expect(
      button.center.dx,
      greaterThan(panel.center.dx + 10),
      reason: 'بلا centered يبقى الزرّ في جهة البداية لا في الوسط',
    );
  });
}
