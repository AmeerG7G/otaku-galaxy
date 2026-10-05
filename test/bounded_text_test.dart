// [CRITICAL] BoundedText — منطقة نصٍّ ثابتة لا يحدّد طولُ النصّ حجمَ ما حولها.
//
// العقد في `lib/core/design_system/components/typography/bounded_text.dart`:
// المقاس الأصلي ما دام النصّ يتّسع، تصغيرٌ عند الحاجة وحدها حتى ٠٫٨،
// ارتفاعٌ محجوز بعدد الأسطر المصمَّم، لا معرفة باللغة، ولا قطعٌ صامت.
//
// كل الأطوال هنا من نصوص التطبيق الفعلية أو بحجمها، والخطوط حقيقية
// (`loadProjectFonts`): بالخط البديل في الاختبار تُقاس الكلمات بعرضٍ لا
// علاقة له بالجهاز.

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';

import 'support/render_harness.dart';

const _shortArabic = 'لنُهيّئ تجربتك';
const _longKurdish = 'با ئەزموونەکەت ڕێک بخەین بۆ ئەوەی هەموو شتێک گونجاو بێت';
const _longArabic = 'لنُهيّئ تجربتك في المتجر كي يناسبك كل شيء من البداية';

const _base = TextStyle(
  fontFamily: AppFonts.heading,
  fontFamilyFallback: AppFonts.headingFallback,
  fontSize: 25,
  height: 1.1,
);

final _probe = GlobalKey();
final _below = GlobalKey();

/// منطقةٌ بعرض [width] داخل عمود، وتحتها فاصلٌ يكشف أي نموّ.
Future<List<FlutterErrorDetails>> _pump(
  WidgetTester tester,
  String text, {
  double width = 140,
  int lines = 1,
  double textScale = 1,
  TextDirection direction = TextDirection.rtl,
  double minScale = kBoundedTextMinScale,
  int? maxLines,
  TextStyle style = _base,
}) async {
  final errors = <FlutterErrorDetails>[];
  final previous = FlutterError.onError;
  FlutterError.onError = errors.add;
  try {
    await tester.pumpWidget(
      MediaQuery(
        data: MediaQueryData(textScaler: TextScaler.linear(textScale)),
        child: Directionality(
          textDirection: direction,
          child: Align(
            alignment: Alignment.topCenter,
            child: SizedBox(
              width: width,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  BoundedText(
                    text,
                    key: _probe,
                    style: style,
                    lines: lines,
                    maxLines: maxLines,
                    minScale: minScale,
                  ),
                  Container(key: _below, height: 1, color: const Color(0xFF000000)),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  } finally {
    FlutterError.onError = previous;
  }
  return errors;
}

/// المقاس الذي رُسم به النصّ فعلاً.
double _renderedSize(WidgetTester tester) => tester
    .widget<Text>(find.descendant(of: find.byKey(_probe), matching: find.byType(Text)))
    .style!
    .fontSize!;

RenderParagraph _paragraph(WidgetTester tester) => tester.renderObject(
  find.descendant(of: find.byKey(_probe), matching: find.byType(RichText)),
);

double _lineHeight(double textScale) => BoundedText.lineHeight(
  _base,
  TextScaler.linear(textScale),
  TextDirection.rtl,
);

void main() {
  setUpAll(loadProjectFonts);

  group('سطرٌ واحد', () {
    testWidgets('نصٌّ قصير: المقاس الأصلي، والمنطقة سطرٌ واحد', (tester) async {
      final errors = await _pump(tester, _shortArabic);
      expect(errors, isEmpty);
      expect(_renderedSize(tester), 25);
      expect(tester.getSize(find.byKey(_probe)).height, _lineHeight(1));
    });

    testWidgets('كردي طويل: يُصغَّر حتى يتّسع، لا تحت ٠٫٨، والمنطقة كما هي', (tester) async {
      // العربي ١٣٥٫٤ بكسل يتّسع في ١٤٠؛ الكردي ١٥٠٫٢ لا يتّسع.
      await _pump(tester, _shortArabic);
      final arabicBelow = tester.getTopLeft(find.byKey(_below)).dy;

      final errors = await _pump(tester, 'بۆ ئەزموونەکەت');
      expect(errors, isEmpty);
      final size = _renderedSize(tester);
      expect(size, lessThan(25));
      expect(size, greaterThanOrEqualTo(25 * kBoundedTextMinScale));
      expect(_paragraph(tester).didExceedMaxLines, isFalse);
      expect(_paragraph(tester).size.width, lessThanOrEqualTo(140.01));
      // [CRITICAL] ما تحت المنطقة لا يتحرّك.
      expect(tester.getTopLeft(find.byKey(_below)).dy, arabicBelow);
    });

    testWidgets('عربي طويل: يُصغَّر كذلك — المعيار المساحة لا اللغة', (tester) async {
      // ١٤١٫٦ بكسل طبيعياً في منطقةٍ من ١٣٥.
      final errors = await _pump(tester, 'لنُهيّئ تجربتكم', width: 135);
      expect(errors, isEmpty);
      expect(_renderedSize(tester), lessThan(25));
      expect(_paragraph(tester).didExceedMaxLines, isFalse);
    });

    testWidgets('كردي قصير يتّسع: لا يُمسّ', (tester) async {
      final errors = await _pump(tester, 'سڵاو');
      expect(errors, isEmpty);
      expect(_renderedSize(tester), 25);
    });
  });

  group('حين لا يتّسع حتى عند الحدّ الأدنى', () {
    testWidgets('يُبلَّغ خطأً (لا قطع صامت)، بالحدّ الأدنى، والإطار ثابت', (tester) async {
      await _pump(tester, _shortArabic);
      final arabicBelow = tester.getTopLeft(find.byKey(_below)).dy;

      final errors = await _pump(tester, _longKurdish);
      expect(
        errors.map((e) => e.exceptionAsString()),
        [contains('does not fit 1 line(s)')],
      );
      expect(_renderedSize(tester), closeTo(25 * kBoundedTextMinScale, 1e-9));
      expect(tester.getTopLeft(find.byKey(_below)).dy, arabicBelow);
    });

    testWidgets('minScale قابلٌ للضبط ويُحترم', (tester) async {
      // يحتاج ~٠٫٩٣ ليتّسع — تحت حدٍّ أدنى من ٠٫٩٥.
      final errors = await _pump(tester, 'بۆ ئەزموونەکەت', minScale: 0.95);
      expect(errors, hasLength(1));
      expect(_renderedSize(tester), closeTo(25 * 0.95, 1e-9));
    });
  });

  group('سطران مصمَّمان', () {
    testWidgets('المنطقة سطران دائماً — قصُر النصّ أم طال', (tester) async {
      await _pump(tester, _shortArabic, lines: 2, width: 200);
      final short = tester.getSize(find.byKey(_probe)).height;
      final shortBelow = tester.getTopLeft(find.byKey(_below)).dy;
      expect(short, 2 * _lineHeight(1));

      // ٢٧٠ بكسل طبيعياً: يلتفّ سطرين في ٢٠٠ بلا تصغير.
      final errors = await _pump(tester, 'با ئەزموونەکەت ڕێک بخەین', lines: 2, width: 200);
      expect(errors, isEmpty);
      expect(tester.getSize(find.byKey(_probe)).height, short);
      expect(tester.getTopLeft(find.byKey(_below)).dy, shortBelow);
      // يلتفّ إلى سطرين بمقاسه الأصلي قبل أي تصغير.
      expect(_renderedSize(tester), 25);
      expect(_paragraph(tester).size.height, closeTo(2 * _lineHeight(1), 0.5));
    });

    testWidgets('نصٌّ أطول من سطرين يُصغَّر داخل السطرين، لا سطرٌ ثالث', (tester) async {
      final errors = await _pump(tester, _longArabic, lines: 2, width: 260);
      expect(errors, isEmpty);
      expect(_renderedSize(tester), lessThan(25));
      expect(_paragraph(tester).didExceedMaxLines, isFalse);
      expect(tester.getSize(find.byKey(_probe)).height, 2 * _lineHeight(1));
    });
  });

  group('maxLines — نموٌّ صريح عند الضرورة وحدها', () {
    testWidgets('يتّسع عند الحدّ الأدنى: لا نموّ ولو سُمح به', (tester) async {
      final errors = await _pump(tester, 'بۆ ئەزموونەکەت', maxLines: 3);
      expect(errors, isEmpty);
      expect(tester.getSize(find.byKey(_probe)).height, _lineHeight(1));
      expect(_renderedSize(tester), lessThan(25));
    });

    testWidgets('لا يتّسع عند الحدّ الأدنى: يطول بأقلّ عدد أسطر يكفي', (tester) async {
      final errors = await _pump(tester, _longKurdish, maxLines: 8);
      expect(errors, isEmpty);
      final height = tester.getSize(find.byKey(_probe)).height;
      final n = (height / _lineHeight(1)).round();
      expect(height, closeTo(n * _lineHeight(1), 0.01));
      expect(n, inInclusiveRange(2, 8));
      expect(_renderedSize(tester), greaterThanOrEqualTo(25 * kBoundedTextMinScale));
      expect(_paragraph(tester).didExceedMaxLines, isFalse);
      // سطرٌ أقلّ ما كان ليكفي عند الحدّ الأدنى.
      final fewer = TextPainter(
        text: TextSpan(
          text: _longKurdish,
          style: _base.copyWith(fontSize: 25 * kBoundedTextMinScale),
        ),
        textDirection: TextDirection.rtl,
        maxLines: n - 1,
      )..layout(maxWidth: 140);
      expect(fewer.didExceedMaxLines, isTrue);
      fewer.dispose();
    });

    testWidgets('لا يتجاوز maxLines: ما لا يتّسع فيه يُبلَّغ', (tester) async {
      final errors = await _pump(tester, _longKurdish, maxLines: 2);
      expect(errors, hasLength(1));
      expect(tester.getSize(find.byKey(_probe)).height, 2 * _lineHeight(1));
    });
  });

  group('تكبير خطّ النظام', () {
    testWidgets('×1.3: المنطقة تكبر مع التكبير، والتصغير يحسب المقاس المكبَّر', (tester) async {
      // ١٩٥ بكسل طبيعياً عند ×1.3 في منطقةٍ من ١٨٠.
      final errors = await _pump(tester, 'بۆ ئەزموونەکەت', textScale: 1.3, width: 180);
      expect(errors, isEmpty);
      expect(tester.getSize(find.byKey(_probe)).height, _lineHeight(1.3));
      expect(_renderedSize(tester), lessThan(25));
      expect(_renderedSize(tester), greaterThanOrEqualTo(25 * kBoundedTextMinScale));
      expect(_paragraph(tester).didExceedMaxLines, isFalse);
      expect(_paragraph(tester).textScaler, const TextScaler.linear(1.3));
    });

    testWidgets('×1.3 لنصٍّ قصير: لا تصغير', (tester) async {
      final errors = await _pump(tester, _shortArabic, textScale: 1.3, width: 180);
      expect(errors, isEmpty);
      expect(_renderedSize(tester), 25);
    });
  });

  group('الاتجاه', () {
    for (final direction in TextDirection.values) {
      testWidgets('$direction: النصّ عند بداية المنطقة', (tester) async {
        await _pump(tester, _shortArabic, direction: direction);
        final region = tester.getRect(find.byKey(_probe));
        final text = tester.getRect(
          find.descendant(of: find.byKey(_probe), matching: find.byType(RichText)),
        );
        expect(_paragraph(tester).textDirection, direction);
        if (direction == TextDirection.rtl) {
          expect(text.right, closeTo(region.right, 0.01));
        } else {
          expect(text.left, closeTo(region.left, 0.01));
        }
      });
    }
  });

  testWidgets('عرضٌ غير محدود: المقاس الأصلي وعرضٌ ملتفّ — لا قياس بلا مساحة', (tester) async {
    await tester.pumpWidget(
      const Directionality(
        textDirection: TextDirection.rtl,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [BoundedText(_longKurdish, key: Key('free'), style: _base)],
        ),
      ),
    );
    final text = tester.widget<Text>(
      find.descendant(of: find.byKey(const Key('free')), matching: find.byType(Text)),
    );
    expect(text.style!.fontSize, 25);
  });

  test('[TRIPWIRE] BoundedText لا يعرف اللغة', () {
    final source = File(
      'lib/core/design_system/components/typography/bounded_text.dart',
    ).readAsStringSync();
    final code = source
        .split('\n')
        .where((l) => !l.trimLeft().startsWith('//'))
        .join('\n');
    for (final forbidden in ['AppLanguage', 'kurdish', 'Kurdish', 'arabic', 'locale', 'context.language']) {
      expect(code, isNot(contains(forbidden)), reason: 'BoundedText يقيس المساحة لا اللغة');
    }
  });
}
