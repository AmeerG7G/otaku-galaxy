import 'package:flutter/material.dart';

/// شبكة بطاقات المنتجات في تصميم v2: عمودان بفجوة ١٣.
///
/// الارتفاع ثابت وليس نسبةً من العرض. ارتفاع البطاقة الفعلي *يزداد* كلما
/// ضاق العمود (النصوص تحتاج أسطراً أكثر)، بينما `childAspectRatio` يجعله
/// *ينقص* — فينكسر التخطيط على الشاشات الصغيرة.
///
/// [CRITICAL] لكنّ ارتفاعاً واحداً لكل الشاشات كان يعني أن الجميع يدفع ثمن
/// أضيقها. القياس الفعلي لمحتوى البطاقة:
///
/// ```
/// عرض العمود ١٩٠ → المحتوى ٢٥٩
/// عرض العمود ١٦٥ → المحتوى ٢٧٢
/// عرض العمود ١٣٢ → المحتوى ٢٨٥
/// ```
///
/// والثابت القديم كان ٢٩٢ للجميع، فبقي أسفل كل بطاقة على هاتف عادي
/// (عمود ١٩٠) **٣٣ بكسل فارغة** — وهو بالضبط الامتداد الزائد الذي يُرى
/// أسفل البطاقات. الارتفاع الآن يتبع عرض العمود ومقياس الخط معاً.
const double kProductCardCrossSpacing = 13;
const double kProductCardMainSpacing = 13;

/// الحشوة الأفقية المعتادة حول شبكات المنتجات في التطبيق.
const double kProductGridHorizontalPadding = 18;

/// ارتفاع البطاقة لعرض عمود معلوم — من القياس أعلاه مع هامش صغير.
double productCardExtentFor(double columnWidth, {double textScale = 1}) {
  final base = columnWidth >= 180
      ? 262.0
      : columnWidth >= 140
      ? 275.0
      : 288.0;
  // النصوص وحدها تكبر مع مقياس الخط؛ الصورة (١٣٠) لا تتأثر، فلا نضاعف
  // الارتفاع كله. الزيادة تُحسب على الجزء النصّي فقط.
  final textPart = base - 130;
  return 130 + textPart * textScale.clamp(1.0, 1.6);
}

// ── عدد الأعمدة ────────────────────────────────────────────────────────
//
// مشتقّ من عرض البطاقة لا من أسماء الأجهزة. الأرقام من التصميم المرجعي:
// على شاشة ٣٩٣ بحشوة ١٨ وفجوة ١٣ يكون العمود ١٧٢ — وهو عرض البطاقة الذي
// رُسم عليه كل شيء. فالحدّ الأعلى يُختار ليبقى العمود قريباً من ذلك.

/// أضيق عرض تبقى عنده أسماء المنتجات وأسعارها مقروءة.
const double kProductCardMinWidth = 150;

/// أوسع عرض قبل أن تصير البطاقة مفرطة الاتّساع ويتفكّك التسلسل البصري.
const double kProductCardMaxWidth = 230;

/// أقصى عدد أعمدة — ما بعده تصير الشبكة جرداً لا معرضاً.
const int kProductGridMaxColumns = 5;

/// عدد الأعمدة لعرضٍ متاح معلوم (بعد طرح الحشوة الأفقية).
///
/// [CRITICAL] يُحسب من **العرض المتاح** لا من صنف الجهاز. الشبكة قد تُعرض
/// داخل لوحٍ نصفَ الشاشة أو داخل إطارٍ محدود العرض، فقياسُ الجهاز يعطي
/// عمودَين على لوحٍ عرضه ٤٠٠ أو خمسةَ أعمدة في عمودٍ عرضه ٣٠٠.
///
/// النتيجة على الهاتف عمودان دائماً وبعرض بطاقةٍ مطابقٍ للمرجع بالبكسل —
/// فلا يتغيّر شيء ممّا رُسم أصلاً.
int productGridColumns(double availableWidth) {
  if (availableWidth <= 0) return 2;
  const gap = kProductCardCrossSpacing;
  // أقلّ عدد أعمدة يُبقي البطاقة تحت الحدّ الأعلى.
  var columns = ((availableWidth + gap) / (kProductCardMaxWidth + gap)).ceil();
  columns = columns.clamp(2, kProductGridMaxColumns);
  // ثم نتراجع عموداً عموداً ما دامت البطاقة أضيق من المقروء — عمودان هما
  // الحدّ الأدنى دائماً لأنهما تخطيط المرجع.
  while (columns > 2 &&
      (availableWidth - gap * (columns - 1)) / columns < kProductCardMinWidth) {
    columns -= 1;
  }
  return columns;
}

/// شبكة المنتجات المعتمدة — تتبع العرض المتاح بعدد أعمدةٍ وارتفاعِ بطاقة.
SliverGridDelegateWithFixedCrossAxisCount productGridDelegate(
  BuildContext context, {
  double horizontalPadding = kProductGridHorizontalPadding,
  double? availableWidth,
}) {
  final width = availableWidth ?? MediaQuery.sizeOf(context).width;
  final content = width - horizontalPadding * 2;
  final columns = productGridColumns(content);
  final columnWidth =
      (content - kProductCardCrossSpacing * (columns - 1)) / columns;
  final scale = MediaQuery.textScalerOf(context).scale(14) / 14;
  return SliverGridDelegateWithFixedCrossAxisCount(
    crossAxisCount: columns,
    mainAxisSpacing: kProductCardMainSpacing,
    crossAxisSpacing: kProductCardCrossSpacing,
    mainAxisExtent: productCardExtentFor(columnWidth, textScale: scale),
  );
}

/// ارتفاع البطاقة على الشاشة المرجعية — يبقى للاختبارات والهياكل الساكنة
/// التي لا تملك `BuildContext` وقت البناء.
const double kProductCardExtent = 288;

/// الشبكة الثابتة — للاستعمالات التي لا سياق فيها.
const SliverGridDelegateWithFixedCrossAxisCount kProductGridDelegate =
    SliverGridDelegateWithFixedCrossAxisCount(
      crossAxisCount: 2,
      mainAxisSpacing: kProductCardMainSpacing,
      crossAxisSpacing: kProductCardCrossSpacing,
      mainAxisExtent: kProductCardExtent,
    );
