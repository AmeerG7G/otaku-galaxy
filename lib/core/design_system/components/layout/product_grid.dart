import 'package:flutter/material.dart';

/// شبكة بطاقات المنتجات في تصميم v2: عمودان بفجوة ١٣.
///
/// الارتفاع ثابت وليس نسبةً من العرض. ارتفاع البطاقة الفعلي *يزداد* كلما
/// ضاقت الشاشة (النصوص تحتاج مساحة أكبر)، بينما `childAspectRatio` يجعله
/// *ينقص* — فينكسر التخطيط على الشاشات الصغيرة. القيمة أدناه تساوي الارتفاع
/// الذي كانت تنتجه النسبة القديمة على شاشة ٤١٢ المرجعية، فلا يتغيّر الشكل
/// على الجهاز المرجعي بينما تختفي التجاوزات على الشاشات الأضيق.
const double kProductCardExtent = 292;

const SliverGridDelegateWithFixedCrossAxisCount kProductGridDelegate =
    SliverGridDelegateWithFixedCrossAxisCount(
      crossAxisCount: 2,
      mainAxisSpacing: 13,
      crossAxisSpacing: 13,
      mainAxisExtent: kProductCardExtent,
    );
