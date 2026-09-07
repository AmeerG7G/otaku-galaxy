// صفّ بطاقات العروض في الرئيسية — بلا تجاوز تخطيط، بالنصّ كاملاً.
//
// [CRITICAL] الخطوط الحقيقية شرطٌ لصحّة هذا الاختبار. بالخط البديل الذي
// يستعمله `flutter test` افتراضياً — كل محارفه بعرضٍ واحد — قِيس التجاوز
// ٤٤ بكسل، وبالخطوط الحقيقية ٣ بكسل. الرقم الأول لا يصف شيئاً في التطبيق.
//
// الجذر: المرجع يحدّد البطاقة `width:196px;height:112px` والحشوة العلوية
// `padding:14px 18px 0` على **الحاوية**. وكان التنفيذ يضع ١١٢ ارتفاعاً
// للصفّ كلّه ثم يقتطع القائمةُ منه ١٤ حشوةً، فتبقى للبطاقة ٩٨ ولمحتواها ٦٦
// — والنصّان يحتاجان ٦٩.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/features/home/presentation/widgets/home_compositions.dart';
import 'package:otaku_galaxy/features/products/domain/entities/banner.dart' as model;

import 'support/render_harness.dart';

const _sizes = <String, Size>{
  'هاتف صغير': Size(320, 640),
  'هاتف': Size(412, 892),
  'هاتف كبير': Size(430, 932),
  'لوح': Size(834, 1112),
  'لوح عرضي': Size(1194, 834),
};

Future<void> _pump(
  WidgetTester tester, {
  required Size size,
  required bool dark,
  required Widget rail,
  double textScale = 1.0,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: dark ? ThemeMode.dark : ThemeMode.light,
      locale: const Locale('ar'),
      home: MediaQuery(
        data: MediaQueryData(
          size: size,
          textScaler: TextScaler.linear(textScale),
        ),
        child: Directionality(
          textDirection: TextDirection.rtl,
          child: Scaffold(body: Column(children: [rail])),
        ),
      ),
    ),
  );
  await tester.pump();
}

void main() {
  setUpAll(loadProjectFonts);

  group('بلا لافتات مضبوطة — البطاقتان المضمَّنتان', () {
    for (final entry in _sizes.entries) {
      for (final dark in [false, true]) {
        final mode = dark ? 'داكن' : 'فاتح';
        testWidgets('[CRITICAL] بلا تجاوز — ${entry.key} — $mode', (
          tester,
        ) async {
          await _pump(
            tester,
            size: entry.value,
            dark: dark,
            rail: HomePromoRail(onTap: () {}, maxDiscount: 25),
          );
          expect(tester.takeException(), isNull);
        });
      }
    }

    testWidgets('بلا خصومات — بطاقة واحدة فقط، وبلا تجاوز', (tester) async {
      // `maxDiscount: null` يعني لا خصومات فعلية، فتُعرض بطاقة واحدة.
      await _pump(
        tester,
        size: const Size(412, 892),
        dark: false,
        rail: HomePromoRail(onTap: () {}),
      );
      expect(find.text('موسم المدرسة'), findsOneWidget);
      expect(find.text('خصومات فعّالة'), findsNothing);
      expect(tester.takeException(), isNull);
    });
  });

  group('مع لافتات من لوحة التحكم', () {
    testWidgets('[CRITICAL] المسار الآخر لم ينكسر', (tester) async {
      await _pump(
        tester,
        size: const Size(412, 892),
        dark: false,
        rail: HomePromoRail(
          onTap: () {},
          banners: const [
            model.Banner(
              id: 'b1',
              title: 'عرض الصيف',
              subtitle: 'خصومات على كل شيء',
              imageUrl: '',
            ),
            model.Banner(
              id: 'b2',
              title: 'وصل حديثاً',
              subtitle: 'مجسّمات جديدة',
              imageUrl: '',
            ),
          ],
        ),
      );
      expect(find.text('عرض الصيف'), findsOneWidget);
      expect(find.text('وصل حديثاً'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  group('هندسة المرجع', () {
    testWidgets('[CRITICAL] البطاقة ١١٢ ارتفاعاً و١٩٦ عرضاً كما في المرجع', (
      tester,
    ) async {
      // المرجع: `width:196px;height:112px` للبطاقة، والحشوة ١٤ فوقها على
      // الحاوية. الاختبار يقيس البطاقة نفسها لا الصفّ، فلا يمرّ إصلاحٌ
      // يزيد ارتفاع الصفّ ويترك البطاقة مضغوطة.
      await _pump(
        tester,
        size: const Size(412, 892),
        dark: false,
        rail: HomePromoRail(onTap: () {}, maxDiscount: 25),
      );

      final card = tester.getRect(
        find
            .ancestor(
              of: find.text('موسم المدرسة'),
              matching: find.byType(Container),
            )
            .last,
      );
      expect(card.width, 196);
      expect(card.height, 112);
      // والفراغ فوقها ١٤ كما في المرجع.
      expect(card.top, 14);
    });
  });

  group('تكبير الخط', () {
    testWidgets('النصّ الأكبر لا يفيض ولا يُقصّ', (tester) async {
      // الهامش الذي أعاده الإصلاح (٨٠ بدل ٦٦) هو ما يحتمل التكبير.
      await _pump(
        tester,
        size: const Size(412, 892),
        dark: false,
        textScale: 1.2,
        rail: HomePromoRail(onTap: () {}, maxDiscount: 25),
      );
      expect(tester.takeException(), isNull);
    });
  });
}
