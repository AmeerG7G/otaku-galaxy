// [CRITICAL] المكوّنات المشتركة ذات النصّ المحدود (البوّابة ٤، 2026-10-05).
//
// كل مكوّنٍ هنا كان يترك نصّه يحدّد هندسته: كبسولةٌ أعرض من بطاقتها، إجراءٌ
// جانبيٌّ يعتصر العنوان حتى يلتفّ حرفاً حرفاً، تسميةٌ تتجاوز زرّها. العقد:
// النصّ يُصغَّر داخل منطقته أو يُستبدل ببديلٍ مصمَّم، ولا يتحرّك ما حوله.
// القياس بالخطوط الحقيقية (`loadProjectFonts`).

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';

import 'support/render_harness.dart';

const _longKurdish = 'چاوەڕوانی پەسەندکردنی بەڕێوەبەرایەتی';
const _arabic = 'بانتظار تأكيد الإدارة';

Future<List<FlutterErrorDetails>> _pump(
  WidgetTester tester,
  Widget child, {
  double textScale = 1,
}) async {
  final errors = <FlutterErrorDetails>[];
  final previous = FlutterError.onError;
  FlutterError.onError = errors.add;
  try {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: MediaQuery(
          data: MediaQueryData(textScaler: TextScaler.linear(textScale)),
          child: Directionality(
            textDirection: TextDirection.rtl,
            child: Scaffold(body: Align(alignment: Alignment.topRight, child: child)),
          ),
        ),
      ),
    );
  } finally {
    FlutterError.onError = previous;
  }
  return errors;
}

void main() {
  setUpAll(loadProjectFonts);

  group('OtakuStatusPill', () {
    testWidgets('في صفٍّ بلا حدّ: نصٌّ كما كان، بلا خطأ', (tester) async {
      final errors = await _pump(
        tester,
        const Row(
          mainAxisSize: MainAxisSize.min,
          children: [OtakuStatusPill(label: _longKurdish, color: Colors.orange)],
        ),
      );
      expect(errors, isEmpty);
      expect(find.byType(BoundedText), findsNothing);
    });

    testWidgets('محدودةٌ أضيق من تسميتها: تُصغَّر داخل الحدّ، بلا تجاوز', (tester) async {
      final errors = await _pump(
        tester,
        ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 170),
          child: const OtakuStatusPill(label: _longKurdish, color: Colors.orange),
        ),
      );
      expect(errors, isEmpty);
      expect(tester.getSize(find.byType(OtakuStatusPill)).width, lessThanOrEqualTo(170));
    });

    testWidgets('الترجمة الأطول لا تتّسع لسطر: السطر الثاني محجوز بكل لغة', (tester) async {
      Widget pill(String label) => ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 150),
        child: OtakuStatusPill(
          label: label,
          labelTranslations: const [_arabic, _longKurdish],
          color: Colors.orange,
        ),
      );
      expect(await _pump(tester, pill(_arabic)), isEmpty);
      final arabic = tester.getSize(find.byType(OtakuStatusPill)).height;
      expect(await _pump(tester, pill(_longKurdish)), isEmpty);
      expect(tester.getSize(find.byType(OtakuStatusPill)).height, arabic);
      // السطر محجوزٌ فعلاً (لا كبسولةٌ بسطرٍ واحد في اللغتين).
      expect(find.byType(BoundedText), findsOneWidget);
      expect(arabic, greaterThan(30));
    });
  });

  group('AnimeTextButton.fallbackIcon', () {
    Widget button(double width) => SizedBox(
      width: width,
      child: AnimeTextButton(
        label: 'هەمووی وەک خوێندراوە نیشان بکە',
        onPressed: () {},
        fallbackIcon: Icons.done_all_rounded,
      ),
    );

    testWidgets('لا تتّسع التسمية حتى عند الحدّ: الأيقونة، والتسمية تلميحٌ', (tester) async {
      final errors = await _pump(tester, button(90));
      expect(errors, isEmpty);
      expect(find.byIcon(Icons.done_all_rounded), findsOneWidget);
      expect(
        find.byWidgetPredicate((w) => w is Tooltip && w.message == 'هەمووی وەک خوێندراوە نیشان بکە'),
        findsOneWidget,
      );
    });

    testWidgets('تتّسع: التسمية لا الأيقونة', (tester) async {
      final errors = await _pump(tester, button(320));
      expect(errors, isEmpty);
      expect(find.byIcon(Icons.done_all_rounded), findsNothing);
      expect(find.text('هەمووی وەک خوێندراوە نیشان بکە'), findsOneWidget);
    });
  });

  group('AnimePrimaryButton — الحدّ من مقاس التصميم', () {
    testWidgets('×1.3: تسميةٌ تحتاج أقلّ من ٠٫٨ من المكبَّر تتّسع بلا خطأ', (tester) async {
      // «داواکارییەکەت هەڵبسەنگێنە» ×١٫٣ في ٢٥٢ مع الأيقونة: تحتاج ~٠٫٧٤.
      final errors = await _pump(
        tester,
        SizedBox(
          width: 252,
          child: AnimePrimaryButton(
            label: 'داواکارییەکەت هەڵبسەنگێنە',
            onPressed: () {},
            icon: Icons.star_rounded,
          ),
        ),
        textScale: 1.3,
      );
      expect(errors, isEmpty);
      final size = tester.widget<Text>(
        find.descendant(of: find.byType(BoundedText), matching: find.byType(Text)),
      ).style!.fontSize!;
      final base = AppTheme.light.textTheme.labelLarge!.fontSize!;
      expect(size, lessThan(base * kBoundedTextMinScale));
      expect(size * 1.3, greaterThanOrEqualTo(base * kBoundedTextMinScale - 0.01));
    });

    // (2026-10-12) تسميةٌ لا تتّسع لسطرٍ حتى عند الحدّ تأخذ سطراً ثانياً —
    // داخل ارتفاع الزرّ الثابت وحده. ١٦٠ عرضاً: ١١٢ للتسمية، وهي ~١٤١ عند ٠٫٨.
    const longLabel = 'إتمام الطلب الآن مع التوصيل';
    Finder labelText() => find.descendant(
      of: find.byType(BoundedText),
      matching: find.byType(RichText),
    );

    testWidgets('لا تتّسع لسطرٍ عند الحدّ: سطران موسَّطان والزرّ بارتفاعه', (tester) async {
      final errors = await _pump(
        tester,
        SizedBox(
          width: 160,
          child: AnimePrimaryButton(label: longLabel, onPressed: () {}),
        ),
      );
      expect(errors, isEmpty);
      final button = tester.getRect(find.byType(AnimePrimaryButton));
      expect(button.height, AppDimens.buttonHeightLg);
      final paragraph = tester.renderObject<RenderParagraph>(labelText());
      expect(paragraph.maxLines, 2);
      expect(paragraph.textAlign, TextAlign.center);
      expect(paragraph.didExceedMaxLines, isFalse);
      final label = tester.getRect(find.byType(BoundedText));
      expect(button.intersect(label), label, reason: 'التسمية داخل الزرّ');
    });

    testWidgets('×1.3: سطران أطول من ارتفاع الزرّ — يُبلَّغ ولا يُقصّ خلسة', (tester) async {
      // سطران بـ×١٫٣ = ٥٤ > ٥٢: لا نموّ، فيبقى سطراً واحداً لا يتّسع.
      final errors = await _pump(
        tester,
        SizedBox(
          width: 160,
          child: AnimePrimaryButton(label: longLabel, onPressed: () {}),
        ),
        textScale: 1.3,
      );
      expect(errors, hasLength(1));
      expect(tester.renderObject<RenderParagraph>(labelText()).maxLines, 1);
      expect(
        tester.getSize(find.byType(AnimePrimaryButton)).height,
        AppDimens.buttonHeightLg,
      );
    });

    testWidgets('تتّسع لسطر: سطرٌ واحد كما كان', (tester) async {
      final errors = await _pump(
        tester,
        SizedBox(
          width: 284,
          child: AnimePrimaryButton(label: longLabel, onPressed: () {}),
        ),
      );
      expect(errors, isEmpty);
      expect(tester.renderObject<RenderParagraph>(labelText()).maxLines, 1);
    });
  });

  group('OtakuScreenHeader.compact', () {
    testWidgets('إجراءٌ جانبي طويل لا يُطيل الترويسة ولا يلفّ العنوان', (tester) async {
      Widget header(String action) => SizedBox(
        width: 412,
        child: OtakuScreenHeader.compact(
          title: 'ئاگادارکردنەوەکان',
          onBack: () {},
          trailing: AnimeTextButton(
            label: action,
            onPressed: () {},
            fallbackIcon: Icons.done_all_rounded,
          ),
        ),
      );
      expect(await _pump(tester, header('خوێندراوە')), isEmpty);
      final short = tester.getSize(find.byType(OtakuScreenHeader)).height;
      expect(await _pump(tester, header('هەمووی وەک خوێندراوە نیشان بکە')), isEmpty);
      expect(tester.getSize(find.byType(OtakuScreenHeader)).height, short);
    });
  });
}
