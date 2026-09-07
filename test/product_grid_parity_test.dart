import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/components/feedback/otaku_skeleton.dart';
import 'package:otaku_galaxy/core/design_system/components/layout/product_grid.dart';

/// تطابق الهيكل مع الشبكة الحقيقية.
///
/// الهيكل يُعرض ثم يُستبدل بالشبكة الحقيقية في المكان نفسه. إن اختلف ارتفاع
/// الخلية بينهما قفز المحتوى لحظةَ وصول البيانات — تحت إصبع المستخدم وهو
/// يهمّ بالنقر. كان الهيكل يستعمل الثابتة (٢٨٨) والشبكة الحقيقية تحسب من
/// عرض العمود ومقياس الخط، فيقفز ١٣ نقطة على هاتف معتاد وأكثر مع تكبير الخط.
///
/// الاختبار يقارن الاثنين عند العرض ومقياس الخط نفسيهما، لا يعيد حساب
/// الرقم المتوقَّع — إعادة الحساب هنا كانت ستنسخ العطب نفسه إلى الاختبار.
Future<double> _skeletonExtent(
  WidgetTester tester, {
  required Size size,
  double textScale = 1,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    MaterialApp(
      home: MediaQuery(
        data: MediaQueryData(
          size: size,
          textScaler: TextScaler.linear(textScale),
        ),
        child: const SingleChildScrollView(
          child: OtakuProductSkeletonGrid(count: 4),
        ),
      ),
    ),
  );

  final grid = tester.widget<GridView>(find.byType(GridView));
  final delegate =
      grid.gridDelegate as SliverGridDelegateWithFixedCrossAxisCount;
  return delegate.mainAxisExtent!;
}

/// عدد الأعمدة صار يتبع العرض المتاح (٢ على الهاتف، أكثر على اللوح)، فلا
/// يجوز أن يبقى النموذج المرجعي هنا مثبَّتاً على عمودين — كان سيقيس تطابقاً
/// مع شبكةٍ لم تعد موجودة.
double _realExtent(Size size, {double textScale = 1}) {
  final content = size.width - kProductGridHorizontalPadding * 2;
  final columns = productGridColumns(content);
  final columnWidth =
      (content - kProductCardCrossSpacing * (columns - 1)) / columns;
  return productCardExtentFor(columnWidth, textScale: textScale);
}

void main() {
  testWidgets('[CRITICAL] ارتفاع خلية الهيكل يساوي ارتفاع خلية الشبكة الحقيقية', (
    tester,
  ) async {
    const size = Size(390, 844); // هاتف معتاد — حيث كانت الفجوة ١٣ نقطة
    expect(await _skeletonExtent(tester, size: size), _realExtent(size));
  });

  testWidgets('التطابق يصمد مع تكبير الخط', (tester) async {
    // هنا كانت الفجوة تتسع أكثر: الثابتة لا ترى مقياس الخط أصلاً.
    const size = Size(390, 844);
    expect(
      await _skeletonExtent(tester, size: size, textScale: 1.6),
      _realExtent(size, textScale: 1.6),
    );
  });

  testWidgets('التطابق يصمد على شاشة عريضة — بعمود ثالث', (tester) async {
    // ٦٠٠ عرضاً = لوح صغير: ثلاثة أعمدة لا اثنان. القفزة تبقى ممنوعة لأن
    // الهيكل والشبكة يقرآن `productGridDelegate` نفسه.
    const size = Size(600, 900);
    expect(
      productGridColumns(size.width - kProductGridHorizontalPadding * 2),
      3,
    );
    expect(await _skeletonExtent(tester, size: size), _realExtent(size));
  });
}
