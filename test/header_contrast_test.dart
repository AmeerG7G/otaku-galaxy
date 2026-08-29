// §14 — عنوان ترويسة القسم كان أبيض ثابتاً مهما كان التدرّج، فتهبط نسبة
// التباين إلى ~1.8:1 على التدرّجات الفاتحة (الكهرماني) ويصير غير مقروء.
// هذا الاختبار يقيس التباين الفعلي لكل تدرّج في لوحة الأقسام.

import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';

/// نسبة التباين حسب WCAG بين لونين معتمين.
double _contrast(Color a, Color b) {
  final la = a.computeLuminance();
  final lb = b.computeLuminance();
  final light = math.max(la, lb);
  final dark = math.min(la, lb);
  return (light + 0.05) / (dark + 0.05);
}

/// نفس ستارة الترويسة المتدرّجة.
const _scrim = 0.28;

Color _withScrim(Color c) =>
    Color.alphaBlend(Colors.black.withValues(alpha: _scrim), c);

void main() {
  // عتبة WCAG AA للنص الكبير (العنوان 25px بوزن 900).
  const largeTextAA = 3.0;

  test('every category gradient gives the title readable contrast', () {
    final failures = <String>[];

    for (var index = 0; index < 8; index++) {
      final colors = AnimeCategoryCard.gradientFor(index);

      // الأسوأ هو أفتح لون في التدرّج بعد الستارة، مقابل الأبيض.
      final worst = colors
          .map((c) => _contrast(Colors.white, _withScrim(c)))
          .reduce((a, b) => a < b ? a : b);

      if (worst < largeTextAA) {
        failures.add('palette $index → ${worst.toStringAsFixed(2)}:1');
      }
    }

    expect(
      failures,
      isEmpty,
      reason: 'تدرّجات لا تحقق تباين WCAG AA للنص الكبير:\n${failures.join("\n")}',
    );
  });

  test('without the scrim the gradients would still fail — the fix is needed', () {
    // يوثّق الخلل الأصلي: بلا ستارة تفشل لوحة واحدة على الأقل.
    final failing = <int>[];
    for (var index = 0; index < 8; index++) {
      final colors = AnimeCategoryCard.gradientFor(index);
      final worst = colors
          .map((c) => _contrast(Colors.white, c))
          .reduce((a, b) => a < b ? a : b);
      if (worst < largeTextAA) failing.add(index);
    }

    expect(
      failing,
      isNotEmpty,
      reason: 'إن لم تفشل أي لوحة بالأبيض الثابت فالاختبار لا يحرس شيئاً',
    );
  });
}
