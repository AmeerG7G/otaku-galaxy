import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';

/// أصغر نسبةٍ يُصغَّر إليها نصٌّ لا يتّسع لمنطقته — ٠٫٨ من مقاسه الأصلي.
const double kBoundedTextMinScale = 0.8;

/// نصٌّ في منطقةٍ ثابتة الهندسة: لا يحدّد طولُه حجمَ ما حوله.
///
/// [CRITICAL] العقد (2026-10-05):
/// - **المنطقة ثابتة**: ارتفاعها [lines] سطراً بمقاييس النمط ومقياس خطّ
///   النظام — قصُر النصّ أم طال، بأي لغة. عرضها ما يمنحه الأب.
/// - **المقاس الأصلي ما دام النصّ يتّسع**: لا تصغير احتياطي. نصٌّ يتّسع
///   يُرسم كما يرسمه `Text` تماماً.
/// - **التصغير عند الحاجة وحدها**: أكبر مقاسٍ يُدخل النصّ في [lines] سطراً
///   بعرض المنطقة، حتى [minScale] من الأصل.
/// - **لا يعرف اللغة**: يقيس المساحة لا هويّة النصّ — العربية الطويلة
///   تُصغَّر كالكردية الطويلة، والكردية القصيرة لا تُمسّ.
/// - **لا سطر زائد خلسة**: [lines] هو عدد الأسطر المصمَّم. منطقةٌ من سطرين
///   تُعلن `lines: 2` صراحةً، فتحجز سطرين دائماً.
/// - **النموّ قرارٌ صريح**: [maxLines] (افتراضه [lines]) يسمح للمنطقة أن
///   تطول سطراً فسطراً **فقط** حين لا يتّسع النصّ لـ[lines] حتى عند
///   [minScale] — مقاسٌ ضيّق مع خطٍّ مكبَّر. ما دام يتّسع فالمنطقة [lines].
///   ولا تطول أبعد من الارتفاع الذي يمنحه الأب (زرٌّ ثابت الارتفاع): سطرٌ لا
///   يتّسع له الأب ليس نموّاً بل قصّ، فيبقى النصّ «لا يتّسع» ويُبلَّغ.
/// - **لا قطع صامت**: نصٌّ لا يتّسع حتى عند [minScale] يُبلَّغ خطأً في
///   وضع التطوير (`FlutterError.reportError`، كما يُبلَّغ التجاوز) فتلتقطه
///   الاختبارات. يُرسم حينها بالحدّ الأدنى مقصوصاً — ويبقى الإطار ثابتاً.
///
/// يحترم `Directionality` و`MediaQuery.textScaler` ويرث `DefaultTextStyle`.
/// في عرضٍ غير محدود (داخل `Row` بلا `Expanded`) لا مساحة يُقاس عليها:
/// يُرسم بمقاسه الأصلي ويلتفّ عليه عرضه — المنطقة الثابتة تحتاج أباً يحدّ
/// العرض.
class BoundedText extends StatelessWidget {
  const BoundedText(
    this.data, {
    super.key,
    this.style,
    this.lines = 1,
    int? maxLines,
    this.minScale = kBoundedTextMinScale,
    this.textAlign,
    this.alignment = AlignmentDirectional.centerStart,
    this.textKey,
    this.floorAtDesignSize = false,
    this.whenUnfit,
    this.reserveFor = const <String>[],
  }) : maxLines = maxLines ?? lines,
       assert(lines >= 1),
       assert(maxLines == null || maxLines >= lines),
       assert(minScale > 0 && minScale <= 1);

  final String data;
  final TextStyle? style;

  /// عدد الأسطر المصمَّم للمنطقة — يحدّد ارتفاعها، وأقصى ما يلتفّ إليه النصّ.
  final int lines;

  /// أقصى ما تطول إليه المنطقة حين لا يتّسع النصّ لـ[lines] عند [minScale].
  final int maxLines;

  /// أصغر نسبةٍ من المقاس الأصلي يُسمح بها.
  final double minScale;

  final TextAlign? textAlign;

  /// موضع النصّ داخل المنطقة حين يقصُر عنها (رأسياً).
  final AlignmentGeometry alignment;

  /// مفتاح `Text` الداخلي — للاختبارات التي تبحث عن النصّ نفسه.
  final Key? textKey;

  /// الحدّ الأدنى نسبةٌ من مقاس **التصميم** لا من المقاس المكبَّر.
  ///
  /// [PRODUCT] (2026-10-05، لتسميات الأزرار ونصوص الترويسة): مع تكبير خطّ النظام ×١٫٣ يصير
  /// الحدّ [minScale] ÷ ١٫٣ من المقاس المكبَّر — فلا يصغر النصّ أبداً عن
  /// [minScale] من مقاسه بلا تكبير. بلا تكبير (أو بتصغير) لا فرق.
  final bool floorAtDesignSize;

  /// ما يُرسم بدل النصّ حين لا يتّسع حتى عند الحدّ الأدنى.
  ///
  /// [PRODUCT] (2026-10-05): بديلٌ مصمَّم (أيقونة الإجراء نفسه) لا نصٌّ مقصوص،
  /// فلا يُبلَّغ خطأ. القرار بالمساحة المقيسة وحدها، لا باللغة. يُرسم داخل
  /// المنطقة نفسها (الارتفاع نفسه)، وعرضه عرضه. الأبعاد الذاتية تبقى أبعاد
  /// منطقة النصّ — البديل لا يُقاس ذاتياً.
  final Widget? whenUnfit;

  /// نصوصٌ أخرى قد تشغل المنطقة نفسها (ترجمات النصّ نفسه عادةً).
  ///
  /// [PRODUCT] (2026-10-05): المنطقة تحجز أكثر ما يحتاجه **أيٌّ** منها (ومن
  /// [data]) من أسطر بقواعدها هي ([lines] و[maxLines] و[minScale]) في العرض
  /// الحالي — فهندستها واحدةٌ أيّاً كان النصّ المعروض، وأقصرُها يترك سطراً
  /// فارغاً. الفقرة تمرّر `minScale: 1` و`maxLines` كبيراً: أسطرٌ طبيعية بلا
  /// تصغير (قرار الفقرات). القيمة ذات السطر تُصغَّر أولاً حتى الحدّ ولا تحجز
  /// سطراً ثانياً إلا لنصٍّ لا يتّسع حتى عنده. لا يعرف اللغة: يقيس نصوصاً.
  final List<String> reserveFor;

  _Fit _fitIn(BuildContext context) {
    final scaler = MediaQuery.textScalerOf(context);
    return _Fit(
      data: data,
      style: DefaultTextStyle.of(context).style.merge(style),
      scaler: scaler,
      direction: Directionality.of(context),
      align: textAlign ?? TextAlign.start,
      lines: lines,
      maxLines: maxLines,
      reserveFor: reserveFor,
      minScale: floorAtDesignSize
          ? math.min(minScale, minScale / scaler.scale(1))
          : minScale,
    );
  }

  /// عدد الأسطر الذي ترسمه المنطقة في عرض [maxWidth] — الحساب نفسه الذي
  /// يجريه `build`، بسياقٍ يرى ما تراه المنطقة (`DefaultTextStyle` نفسه).
  ///
  /// لأبٍ ثابت الارتفاع يحجز مكانها مسبقاً: رأسٌ يطول بقدر أسطرها لا يعرف
  /// كم سطراً تأخذ إلا بالقياس نفسه. لا يعرف اللغة: يقيس [data] وحده.
  int linesAt(BuildContext context, double maxWidth) =>
      _fitIn(context).resolve(maxWidth).lines;

  @override
  Widget build(BuildContext context) {
    final fit = _fitIn(context);

    return _BoundedLayout(
      fit: fit,
      builder: (context, constraints) {
        final result = fit.resolve(constraints.maxWidth, constraints.maxHeight);
        final fallback = result.unfit ? whenUnfit : null;
        if (result.unfit && fallback == null) {
          _reportUnfit(constraints.maxWidth, result.lines, fit.minScale);
        }
        return SizedBox(
          height: fit.lineHeight * result.lines,
          child: Align(
            alignment: alignment,
            widthFactor: 1,
            child:
                fallback ??
                Text(
                  data,
                  key: textKey,
                  style: fit.styleAt(result.scale),
                  maxLines: result.lines,
                  // `softWrap` يبقى مفعّلاً حتى للسطر الواحد: نصٌّ يتّسع يُرسم إذن
                  // كما يرسمه `Text` تماماً (بلا التفافٍ يُطفئه، يُخطَّط السطر بعرضٍ
                  // غير محدود فتنزاح حروف RTL كسرَ بكسل). `maxLines` يحدّ الأسطر.
                  overflow: TextOverflow.clip,
                  textAlign: fit.align,
                ),
          ),
        );
      },
    );
  }

  /// ارتفاع السطر الواحد لنمطٍ ومقياس — ما تحجزه المنطقة لكل سطر.
  static double lineHeight(
    TextStyle style,
    TextScaler scaler,
    TextDirection direction,
  ) {
    final painter = TextPainter(
      text: TextSpan(text: ' ', style: style),
      textScaler: scaler,
      textDirection: direction,
      maxLines: 1,
    )..layout();
    final height = painter.height;
    painter.dispose();
    return height;
  }

  void _reportUnfit(double maxWidth, int lines, double minScale) {
    if (!kDebugMode) return;
    FlutterError.reportError(
      FlutterErrorDetails(
        exception: FlutterError(
          'BoundedText: «$data» does not fit $lines line(s) of '
          '${maxWidth.toStringAsFixed(1)}px even at '
          '${(minScale * 100).round()}% of its size.',
        ),
        library: 'otaku design system',
      ),
    );
  }
}

/// نتيجة القياس لعرضٍ واحد: المقاس، وعدد الأسطر، وهل بقي النصّ لا يتّسع.
typedef _FitResult = ({double scale, int lines, bool unfit});

/// حساب المنطقة كلّه، بلا شجرة: يُستعمل في التخطيط وفي الأبعاد الذاتية معاً
/// فلا يختلف ما تُعلنه المنطقة عمّا ترسمه.
class _Fit {
  _Fit({
    required this.data,
    required this.style,
    required this.scaler,
    required this.direction,
    required this.align,
    required this.lines,
    required this.maxLines,
    required this.minScale,
    this.reserveFor = const <String>[],
  }) : lineHeight = BoundedText.lineHeight(style, scaler, direction);

  final String data;
  final TextStyle style;
  final TextScaler scaler;
  final TextDirection direction;
  final TextAlign align;
  final int lines;
  final int maxLines;
  final double minScale;
  final List<String> reserveFor;
  final double lineHeight;

  TextStyle styleAt(double scale) => scale == 1
      ? style
      : style.copyWith(fontSize: (style.fontSize ?? 14) * scale);

  TextPainter _painter(double scale, int? maxLines, [String? text]) =>
      TextPainter(
        text: TextSpan(text: text ?? data, style: styleAt(scale)),
        textScaler: scaler,
        textDirection: direction,
        textAlign: align,
        maxLines: maxLines,
      );

  bool _fits(double scale, int n, double maxWidth, [String? text]) {
    final painter = _painter(scale, n, text)..layout(maxWidth: maxWidth);
    // [CRITICAL] لا كسر داخل كلمة: كلمةٌ أعرض من المنطقة لا «تتّسع» بالتفافها
    // حرفاً حرفاً («ئاگادارکردنەوە / کان»)، فالتصغير أو البديل أولى.
    final fits =
        !painter.didExceedMaxLines &&
        painter.width <= maxWidth + 0.01 &&
        painter.minIntrinsicWidth <= maxWidth + 0.01 &&
        painter.height <= lineHeight * n + 0.01;
    painter.dispose();
    return fits;
  }

  /// أسطر [text] بمقاسه الأصلي في [maxWidth] بلا حدّ.
  int _naturalLines(String text, double maxWidth) {
    final painter = _painter(1, null, text)..layout(maxWidth: maxWidth);
    final count = painter.computeLineMetrics().length;
    painter.dispose();
    return count;
  }

  /// أقصى ما تطوله المنطقة: [maxLines]، ولا أكثر مما يتّسع له [maxHeight]
  /// (ولا أقلّ من [lines] — المنطقة المصمَّمة لا تُقصّ).
  int _capFor(double maxHeight) {
    if (!maxHeight.isFinite) return maxLines;
    final room = (maxHeight / lineHeight + 0.001).floor();
    return math.max(lines, math.min(maxLines, room));
  }

  /// أقلّ عدد أسطرٍ (من [lines] إلى [cap]) يتّسع فيه [text] عند الحدّ
  /// الأدنى؛ وإلا فـ[cap].
  int _linesFor(String? text, double maxWidth, int cap) {
    var used = lines;
    while (used < cap && !_fits(minScale, used, maxWidth, text)) {
      used++;
    }
    return used;
  }

  /// المقاس وعدد الأسطر لعرض [maxWidth]. عرضٌ غير محدود: المقاس الأصلي.
  ///
  /// مع [reserveFor]: عدد الأسطر أكثرُ ما يحتاجه أيٌّ من النصوص بقواعد المنطقة
  /// نفسها، ولا يقلّ عن أسطر **أقصرها** بمقاسه الأصلي — ثم يُوضَع [data] فيه
  /// كالمعتاد (أصلياً إن اتّسع، وإلا مصغَّراً).
  ///
  /// [CRITICAL] (2026-10-10) الحدّ الأدنى «أسطر الأقصر الطبيعية»: بدونه تُحسب
  /// المنطقة بالمقاس الأدنى لكل نصّ، فعنوانٌ يلتفّ طبيعياً ثلاثة أسطر ويتّسع
  /// لسطرين عند ٠٫٨ كان سيُصغَّر إلى سطرين وإن لم تحتج أيّ ترجمة إلى ذلك. الآن
  /// لا يُصغَّر إلا النصّ الأطول من أقصر الترجمات، ولا يُحجز سطرٌ زائد إلا لما
  /// لا يتّسع حتى عند الحدّ. للفقرة (`minScale: 1`) لا فرق: أسطرها الطبيعية.
  ///
  /// [maxHeight] (ما يمنحه الأب) يحدّ النموّ: انظر [_capFor].
  _FitResult resolve(double maxWidth, [double maxHeight = double.infinity]) {
    if (!maxWidth.isFinite) return (scale: 1.0, lines: lines, unfit: false);
    final cap = _capFor(maxHeight);
    var used = _linesFor(null, maxWidth, cap);
    if (reserveFor.isNotEmpty) {
      var shortest = cap;
      for (final text in [data, ...reserveFor]) {
        shortest = math.min(shortest, _naturalLines(text, maxWidth));
      }
      used = math.max(used, shortest);
    }
    for (final text in reserveFor) {
      used = math.max(used, _linesFor(text, maxWidth, cap));
    }
    if (_fits(1, used, maxWidth)) {
      return (scale: 1.0, lines: used, unfit: false);
    }
    if (!_fits(minScale, used, maxWidth)) {
      return (scale: minScale, lines: used, unfit: true);
    }
    // بحثٌ ثنائي عن أكبر مقاسٍ يتّسع — ثمانية تكرارات تكفي لدقّة أقلّ من
    // جزءٍ من مئتين بين الحدّين.
    var low = minScale, high = 1.0;
    for (var i = 0; i < 8; i++) {
      final mid = (low + high) / 2;
      if (_fits(mid, used, maxWidth)) {
        low = mid;
      } else {
        high = mid;
      }
    }
    return (scale: low, lines: used, unfit: false);
  }

  /// حجم المنطقة كما ترسمها الشجرة: ارتفاعها ثابت، وعرضها عرض النصّ.
  Size sizeFor(BoxConstraints constraints) {
    final result = resolve(constraints.maxWidth, constraints.maxHeight);
    final painter = _painter(result.scale, result.lines)
      ..layout(maxWidth: constraints.maxWidth);
    final width = painter.width;
    painter.dispose();
    return constraints.constrain(Size(width, lineHeight * result.lines));
  }

  /// أعرض ما يأخذه النصّ: سطره الطبيعي بمقاسه الأصلي.
  double get maxIntrinsicWidth {
    final painter = _painter(1, null)..layout();
    final width = painter.maxIntrinsicWidth;
    painter.dispose();
    return width;
  }

  /// أضيق ما يتّسع فيه: أطول كلمةٍ عند الحدّ الأدنى (أو السطر كلّه عند
  /// الحدّ الأدنى إن كانت المنطقة سطراً واحداً لا يلتفّ).
  double get minIntrinsicWidth {
    final painter = _painter(minScale, null)..layout();
    final width = maxLines > 1
        ? painter.minIntrinsicWidth
        : painter.maxIntrinsicWidth;
    painter.dispose();
    return width;
  }

  double heightFor(double width) => lineHeight * resolve(width).lines;
}

/// `LayoutBuilder` يُجيب عن الأبعاد الذاتية من [_Fit].
///
/// [CRITICAL] `LayoutBuilder` العادي يرمي حين يُسأل عن أبعاده الذاتية
/// (`IntrinsicHeight` حول نموذج المصادقة كلّه)، فكانت المنطقة تُسقط أيّ
/// شاشةٍ تقيس محتواها ذاتياً. الحساب نفسه بلا شجرة يكفي للإجابة.
class _BoundedLayout extends ConstrainedLayoutBuilder<BoxConstraints> {
  const _BoundedLayout({required this.fit, required super.builder});

  final _Fit fit;

  @override
  _RenderBoundedLayout createRenderObject(BuildContext context) =>
      _RenderBoundedLayout(fit);

  @override
  void updateRenderObject(
    BuildContext context,
    _RenderBoundedLayout renderObject,
  ) => renderObject.fit = fit;
}

class _RenderBoundedLayout extends RenderBox
    with
        RenderObjectWithChildMixin<RenderBox>,
        RenderObjectWithLayoutCallbackMixin,
        RenderAbstractLayoutBuilderMixin<BoxConstraints, RenderBox> {
  _RenderBoundedLayout(this._fit);

  _Fit _fit;
  set fit(_Fit value) {
    if (identical(value, _fit)) return;
    _fit = value;
    markNeedsLayout();
  }

  @override
  double computeMinIntrinsicWidth(double height) => _fit.minIntrinsicWidth;

  @override
  double computeMaxIntrinsicWidth(double height) => _fit.maxIntrinsicWidth;

  @override
  double computeMinIntrinsicHeight(double width) => _fit.heightFor(width);

  @override
  double computeMaxIntrinsicHeight(double width) => _fit.heightFor(width);

  @override
  Size computeDryLayout(BoxConstraints constraints) =>
      _fit.sizeFor(constraints);

  @override
  void performLayout() {
    runLayoutCallback();
    if (child != null) {
      child!.layout(constraints, parentUsesSize: true);
      size = constraints.constrain(child!.size);
    } else {
      size = constraints.biggest;
    }
  }

  @override
  double? computeDistanceToActualBaseline(TextBaseline baseline) =>
      child?.getDistanceToActualBaseline(baseline) ??
      super.computeDistanceToActualBaseline(baseline);

  @override
  bool hitTestChildren(BoxHitTestResult result, {required Offset position}) =>
      child?.hitTest(result, position: position) ?? false;

  @override
  void paint(PaintingContext context, Offset offset) {
    if (child != null) context.paintChild(child!, offset);
  }
}
