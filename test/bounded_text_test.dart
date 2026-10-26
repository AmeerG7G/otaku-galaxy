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
  bool floorAtDesignSize = false,
  Widget? whenUnfit,
  List<String> reserveFor = const [],
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
                    floorAtDesignSize: floorAtDesignSize,
                    whenUnfit: whenUnfit,
                    reserveFor: reserveFor,
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

    testWidgets('لا كسر داخل كلمة: كلمةٌ أعرض من المنطقة لا تلتفّ حرفاً حرفاً', (tester) async {
      // كلمةٌ واحدة أعرض من ١٠٠ حتى عند ٠٫٨: النموّ لا يُنقذها.
      final errors = await _pump(tester, 'ئاگادارکردنەوەکان', width: 100, maxLines: 3);
      expect(errors, hasLength(1), reason: 'يُبلَّغ بدل أن يُكسر داخل الكلمة');
    });

    testWidgets('لا يطول أبعد مما يمنحه الأب: سطرٌ لا يتّسع له يُبلَّغ لا يُقصّ', (tester) async {
      final lineHeight = _lineHeight(1);
      final free = await _pump(tester, _longKurdish, maxLines: 8);
      expect(free, isEmpty);
      final n = (tester.getSize(find.byKey(_probe)).height / lineHeight).round();

      Future<List<FlutterErrorDetails>> inParent(double height) async {
        final errors = <FlutterErrorDetails>[];
        final previous = FlutterError.onError;
        FlutterError.onError = errors.add;
        try {
          await tester.pumpWidget(
            Directionality(
              textDirection: TextDirection.rtl,
              child: Align(
                alignment: Alignment.topCenter,
                child: SizedBox(
                  width: 140,
                  height: height,
                  child: Align(
                    child: BoundedText(
                      _longKurdish,
                      key: _probe,
                      style: _base,
                      maxLines: 8,
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

      // أبٌ يتّسع لـn سطراً: النموّ نفسه.
      expect(await inParent(n * lineHeight), isEmpty);
      expect(tester.getSize(find.byKey(_probe)).height, closeTo(n * lineHeight, 0.01));
      // أبٌ أقصر بنصف سطر: يقف عند n − 1، ولا يتّسع فيه النصّ فيُبلَّغ.
      expect(await inParent((n - 0.5) * lineHeight), hasLength(1));
      expect(tester.getSize(find.byKey(_probe)).height, closeTo((n - 1) * lineHeight, 0.01));
      expect(_paragraph(tester).maxLines, n - 1);
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

  group('floorAtDesignSize — الحدّ من مقاس التصميم', () {
    // «بۆ ئەزموونەکەت» ×١٫٣ في ١٤٠: يحتاج أقلّ من ٠٫٨ من المقاس المكبَّر،
    // ولا يحتاج أقلّ من ٠٫٨ من مقاس التصميم.
    testWidgets('×1.3: يُصغَّر تحت ٠٫٨ من المكبَّر، لا تحت ٠٫٨ من التصميم', (tester) async {
      final strict = await _pump(tester, 'بۆ ئەزموونەکەت', textScale: 1.3);
      expect(strict, hasLength(1), reason: 'بالحدّ العادي لا يتّسع');

      final errors = await _pump(tester, 'بۆ ئەزموونەکەت', textScale: 1.3, floorAtDesignSize: true);
      expect(errors, isEmpty);
      final size = _renderedSize(tester);
      expect(size, lessThan(25 * kBoundedTextMinScale));
      // المقاس المرسوم فعلاً (بعد التكبير) لا يقلّ عن ٠٫٨ من التصميم.
      expect(size * 1.3, greaterThanOrEqualTo(25 * kBoundedTextMinScale - 0.01));
      expect(tester.getSize(find.byKey(_probe)).height, _lineHeight(1.3));
    });

    testWidgets('×1.0: لا فرق — الحدّ ٠٫٨ كما هو', (tester) async {
      final errors = await _pump(tester, _longKurdish, floorAtDesignSize: true);
      expect(errors, hasLength(1));
      expect(_renderedSize(tester), 25 * kBoundedTextMinScale);
    });
  });

  group('whenUnfit — بديلٌ مصمَّم بدل النصّ المقصوص', () {
    const fallback = SizedBox(key: Key('fallback'), width: 20, height: 20);

    testWidgets('لا يتّسع: البديل داخل المنطقة نفسها، بلا خطأ', (tester) async {
      final errors = await _pump(tester, _longKurdish, whenUnfit: fallback);
      expect(errors, isEmpty);
      expect(find.byKey(const Key('fallback')), findsOneWidget);
      expect(find.descendant(of: find.byKey(_probe), matching: find.byType(Text)), findsNothing);
      expect(tester.getSize(find.byKey(_probe)).height, _lineHeight(1));
    });

    testWidgets('يتّسع (ولو مصغَّراً): النصّ لا البديل', (tester) async {
      final errors = await _pump(tester, 'بۆ ئەزموونەکەت', whenUnfit: fallback);
      expect(errors, isEmpty);
      expect(find.byKey(const Key('fallback')), findsNothing);
      expect(_renderedSize(tester), lessThan(25));
    });
  });

  group('reserveFor — فقرةٌ تحجز أسطر أطول نصوصها', () {
    // قصيرٌ (سطر) وطويلٌ (عدّة أسطر) في المنطقة نفسها: الهندسة واحدة.
    testWidgets('القصير يحجز أسطر الطويل، بمقاسه الأصلي، والطويل كذلك', (tester) async {
      final errors = await _pump(tester, _shortArabic, width: 200, reserveFor: [_longKurdish], maxLines: 8, minScale: 1);
      expect(errors, isEmpty);
      final shortRegion = tester.getSize(find.byKey(_probe)).height;
      final shortBelow = tester.getTopLeft(find.byKey(_below)).dy;
      expect(_renderedSize(tester), 25);
      expect(shortRegion, greaterThan(_lineHeight(1) * 1.5));

      await _pump(tester, _longKurdish, width: 200, reserveFor: [_shortArabic], maxLines: 8, minScale: 1);
      expect(tester.getSize(find.byKey(_probe)).height, shortRegion);
      expect(tester.getTopLeft(find.byKey(_below)).dy, shortBelow);
      expect(_renderedSize(tester), 25, reason: 'الفقرة لا تُصغَّر');
      expect(_paragraph(tester).didExceedMaxLines, isFalse);
    });

    testWidgets('قيمةٌ ذات سطر: يُصغَّر الطويل أولاً، ولا سطر محجوز ما دام يتّسع', (tester) async {
      // «بۆ ئەزموونەکەت» يتّسع لسطرٍ عند ≥٠٫٨ في ١٤٠: لا حجز.
      await _pump(tester, _shortArabic, maxLines: 2, reserveFor: ['بۆ ئەزموونەکەت']);
      expect(tester.getSize(find.byKey(_probe)).height, _lineHeight(1));
      expect(_renderedSize(tester), 25);
      // _longKurdish لا يتّسع لسطر حتى عند ٠٫٨: السطران محجوزان للعربي أيضاً.
      await _pump(tester, _shortArabic, maxLines: 2, reserveFor: ['با ئەزموونەکەت ڕێک بخەین بۆ']);
      expect(tester.getSize(find.byKey(_probe)).height, 2 * _lineHeight(1));
      expect(_renderedSize(tester), 25);
    });

    testWidgets('لا تصغير بلا داعٍ: المنطقة لا تقلّ عن أسطر أقصر النصوص الطبيعية', (tester) async {
      // كلاهما يلتفّ سطرين بمقاسه في ١٣٥، وكلاهما يتّسع لسطرٍ عند ٠٫٨: لا نصّ
      // أطول من أقصرهما، فلا يُصغَّر أيٌّ منهما.
      final errors = await _pump(tester, 'لنُهيّئ تجربتكم', width: 135, maxLines: 3, reserveFor: ['بۆ ئەزموونەکەت']);
      expect(errors, isEmpty);
      expect(_renderedSize(tester), 25);
      expect(tester.getSize(find.byKey(_probe)).height, 2 * _lineHeight(1));
    });

    testWidgets('نصوصٌ بالطول نفسه: لا سطر زائد', (tester) async {
      await _pump(tester, _shortArabic, reserveFor: ['لنُهيّئ تجربتك']);
      expect(tester.getSize(find.byKey(_probe)).height, _lineHeight(1));
    });
  });

  group('الأبعاد الذاتية — تحت IntrinsicHeight', () {
    // [CRITICAL] نموذج المصادقة كلّه داخل `IntrinsicHeight`؛ بـ`LayoutBuilder`
    // العادي كانت المنطقة ترمي («does not support returning intrinsic
    // dimensions») فتسقط الشاشة. ما تُعلنه يجب أن يساوي ما ترسمه.
    for (final (name, text, maxLines) in [
      ('يتّسع', _shortArabic, null),
      ('يُصغَّر', 'بۆ ئەزموونەکەت', null),
      ('يطول', _longKurdish, 8),
    ]) {
      testWidgets('$name: الحجم الذاتي والجافّ = الحجم المرسوم', (tester) async {
        final errors = await _pump(tester, text, maxLines: maxLines);
        expect(errors, isEmpty);
        final box = tester.renderObject<RenderBox>(find.byKey(_probe));
        final size = box.size;
        expect(box.getMaxIntrinsicHeight(140), closeTo(size.height, 0.01));
        expect(box.getMinIntrinsicHeight(140), closeTo(size.height, 0.01));
        final dry = box.getDryLayout(box.constraints);
        final loose = box.getDryLayout(const BoxConstraints(maxWidth: 140));
        expect(loose.width, lessThanOrEqualTo(140));
        expect(loose.height, closeTo(size.height, 0.01));
        expect(dry.height, closeTo(size.height, 0.01));
        expect(dry.width, closeTo(size.width, 0.5));
      });
    }

    testWidgets('داخل IntrinsicHeight: لا خطأ، والصفّ بارتفاع المنطقة', (tester) async {
      final errors = <FlutterErrorDetails>[];
      final previous = FlutterError.onError;
      FlutterError.onError = errors.add;
      try {
        await tester.pumpWidget(
          const Directionality(
            textDirection: TextDirection.rtl,
            child: Align(
              alignment: Alignment.topCenter,
              child: SizedBox(
                width: 140,
                child: IntrinsicHeight(
                  key: Key('row'),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Expanded(
                        child: BoundedText(_longKurdish, key: Key('in'), style: _base, maxLines: 8),
                      ),
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
      expect(errors, isEmpty);
      final region = tester.getSize(find.byKey(const Key('in')));
      expect(region.height, greaterThan(_lineHeight(1)));
      expect(tester.getSize(find.byKey(const Key('row'))).height, closeTo(region.height, 0.01));
    });
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

  // (البوّابة ١٥، 2026-10-17) أبٌ ثابت الارتفاع (رأس المصادقة) يحجز مكان
  // المنطقة مسبقاً بـ`linesAt`: إن اختلف عمّا ترسمه المنطقة وقع سطرها الأخير
  // تحت البطاقة العائمة أو بقي في الرأس فراغ.
  group('linesAt — ما ترسمه المنطقة بالضبط', () {
    final configs = <String, ({String text, int lines, int? maxLines, double scale, List<String> reserve})>{
      'قصيرٌ يتّسع': (text: _shortArabic, lines: 1, maxLines: null, scale: 1, reserve: const []),
      'طويلٌ ينمو': (text: _longKurdish, lines: 1, maxLines: 8, scale: 1, reserve: const []),
      'سطران مكبَّران ينموان': (text: _longKurdish, lines: 2, maxLines: 10, scale: 1.3, reserve: const []),
      'قصيرٌ يحجز للطويل': (text: _shortArabic, lines: 1, maxLines: 8, scale: 1, reserve: const [_longKurdish]),
    };
    for (final entry in configs.entries) {
      testWidgets(entry.key, (tester) async {
        final c = entry.value;
        final errors = await _pump(
          tester,
          c.text,
          lines: c.lines,
          maxLines: c.maxLines,
          textScale: c.scale,
          reserveFor: c.reserve,
        );
        expect(errors, isEmpty);
        final drawn = tester.getSize(find.byKey(_probe)).height / _lineHeight(c.scale);
        final measured = BoundedText(
          c.text,
          style: _base,
          lines: c.lines,
          maxLines: c.maxLines,
          reserveFor: c.reserve,
        ).linesAt(tester.element(find.byKey(_probe)), 140);
        expect(measured, drawn.round());
        expect(drawn, closeTo(drawn.round(), 0.001));
        if (entry.key != 'قصيرٌ يتّسع') expect(measured, greaterThan(c.lines));
      });
    }
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
