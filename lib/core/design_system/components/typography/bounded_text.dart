import 'package:flutter/foundation.dart';
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

  @override
  Widget build(BuildContext context) {
    final style = DefaultTextStyle.of(context).style.merge(this.style);
    final scaler = MediaQuery.textScalerOf(context);
    final direction = Directionality.of(context);
    final align = textAlign ?? TextAlign.start;
    final lineHeight = BoundedText.lineHeight(style, scaler, direction);

    return LayoutBuilder(
      builder: (context, constraints) {
        var scale = 1.0;
        var usedLines = lines;
        final maxWidth = constraints.maxWidth;
        if (maxWidth.isFinite) {
          bool fits(double s, int n) => _fits(
            style,
            s,
            n,
            maxWidth: maxWidth,
            maxHeight: lineHeight * n,
            scaler: scaler,
            direction: direction,
            align: align,
          );
          // أقلّ عدد أسطرٍ (من [lines] إلى [maxLines]) يتّسع فيه النصّ عند
          // الحدّ الأدنى؛ وإلا فـ[maxLines] مع إبلاغ.
          while (usedLines < maxLines && !fits(minScale, usedLines)) {
            usedLines++;
          }
          if (!fits(1, usedLines)) {
            if (fits(minScale, usedLines)) {
              // بحثٌ ثنائي عن أكبر مقاسٍ يتّسع — ثمانية تكرارات تكفي لدقّة
              // أقلّ من جزءٍ من مئتين بين الحدّين.
              var low = minScale, high = 1.0;
              for (var i = 0; i < 8; i++) {
                final mid = (low + high) / 2;
                if (fits(mid, usedLines)) {
                  low = mid;
                } else {
                  high = mid;
                }
              }
              scale = low;
            } else {
              scale = minScale;
              _reportUnfit(maxWidth, usedLines);
            }
          }
        }
        final regionHeight = lineHeight * usedLines;

        final fontSize = style.fontSize ?? 14;
        return SizedBox(
          height: regionHeight,
          child: Align(
            alignment: alignment,
            widthFactor: 1,
            child: Text(
              data,
              key: textKey,
              style: scale == 1
                  ? style
                  : style.copyWith(fontSize: fontSize * scale),
              maxLines: usedLines,
              softWrap: usedLines > 1,
              overflow: TextOverflow.clip,
              textAlign: align,
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

  bool _fits(
    TextStyle style,
    double scale,
    int lines, {
    required double maxWidth,
    required double maxHeight,
    required TextScaler scaler,
    required TextDirection direction,
    required TextAlign align,
  }) {
    final painter = TextPainter(
      text: TextSpan(
        text: data,
        style: style.copyWith(fontSize: (style.fontSize ?? 14) * scale),
      ),
      textScaler: scaler,
      textDirection: direction,
      textAlign: align,
      maxLines: lines,
    )..layout(maxWidth: maxWidth);
    final fits =
        !painter.didExceedMaxLines &&
        painter.width <= maxWidth + 0.01 &&
        painter.height <= maxHeight + 0.01;
    painter.dispose();
    return fits;
  }

  void _reportUnfit(double maxWidth, int lines) {
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
