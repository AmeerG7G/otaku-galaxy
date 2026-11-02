// رموز ألوان النصّ — حارسُ انحدارٍ على مستوى النظام لا على مستوى الشاشات.
//
// [CRITICAL] العطب المتكرّر الذي يحرسه هذا الملف: استعمال رمزٍ **مؤشِّر**
// (حدود أو أيقونة أو شارة) لوناً لنصٍّ يُقرأ. رموز المؤشِّرات مضبوطة لحدّ
// 3:1، وبعضها شفّاف أصلاً — و`colorScheme.outline` في الوضع الفاتح شفافية
// ١٢٪ تعطي **1.29:1**، أي نصّاً لا يكاد يُرى.
//
// الاختبارات هنا لا تتشبّث بتفاصيل الشاشات (أي ودجة تستعمل أي لون)؛ تلك
// تتغيّر بتغيّر التصميم فتصير هشّة. تحرس بدلاً من ذلك أمرين ثابتين:
//
//   ١. المسح: لا ملفّ في `lib/` يستعمل رمزاً غير نصّي لوناً لنصّ.
//   ٢. القياس: كل رمز نصّي يجتاز AA على كل سطحٍ يُرسم عليه، في الوضعين.

import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';

// ═══════════════ قياس التباين (WCAG 2.1) ═══════════════

double _channel(double v) =>
    v <= 0.03928 ? v / 12.92 : math.pow((v + 0.055) / 1.055, 2.4) as double;

double _luminance(Color c) =>
    0.2126 * _channel(c.r) + 0.7152 * _channel(c.g) + 0.0722 * _channel(c.b);

/// نسبة التباين بين لونٍ وخلفية — يُمزج الشفّاف على خلفيته أولاً.
double contrast(Color fg, Color bg) {
  final blended = Color.alphaBlend(fg, bg);
  final a = _luminance(blended);
  final b = _luminance(bg);
  return (math.max(a, b) + 0.05) / (math.min(a, b) + 0.05);
}

// ═══════════════ المسح على المصدر ═══════════════

/// أسطر `lib/` التي تُسند لوناً، مع رقم السطر ومساره.
Iterable<({String path, int line, String text, String before})> _colorLines() sync* {
  for (final entity in Directory('lib').listSync(recursive: true)) {
    if (entity is! File || !entity.path.endsWith('.dart')) continue;
    final lines = entity.readAsLinesSync();
    for (var i = 0; i < lines.length; i++) {
      final line = lines[i];
      if (!line.contains('color:') && !line.contains('color ')) continue;
      // التعليقات ليست شيفرة.
      if (line.trimLeft().startsWith('//')) continue;
      // لون الظلّ يقع داخل `TextStyle` لكنه ليس لون الحروف — يُرسم خلفها.
      // البانية متعدّدة الأسطر، فيُفحص السطران السابقان لا السطر وحده.
      final enclosing = lines.sublist(math.max(0, i - 2), i).join(' ');
      if (line.contains('Shadow(') ||
          line.contains('shadows:') ||
          enclosing.contains('Shadow(') ||
          enclosing.contains('BoxShadow(')) {
        continue;
      }
      final start = math.max(0, i - 8);
      yield (
        path: entity.path,
        line: i + 1,
        text: line,
        before: lines.sublist(start, i).join(' '),
      );
    }
  }
}

/// هل يقع هذا الإسناد داخل نمط نصّي؟
bool _isTextContext(String before) =>
    before.contains('TextStyle') ||
    before.contains('textTheme') ||
    before.contains('hintStyle') ||
    before.contains('labelStyle');

void main() {
  group('[CRITICAL] لا رمز غير نصّي لوناً لنصّ', () {
    test('`colorScheme.outline` لا يُستعمل لوناً لنصّ في أي ملف', () {
      // `outline` رمز **حدود**. في الوضع الفاتح شفافيته ١٢٪، فنصّه 1.29:1.
      final offenders = <String>[];
      for (final hit in _colorLines()) {
        final isOutline = RegExp(r'colorScheme\.outline\b').hasMatch(hit.text);
        if (isOutline && _isTextContext(hit.before)) {
          offenders.add('${hit.path}:${hit.line}');
        }
      }
      expect(
        offenders,
        isEmpty,
        reason:
            'استعمل `onSurfaceVariant` للنصّ الثانوي أو `onSurface` للأساسي — '
            'لا `outline`. المخالفات: $offenders',
      );
    });

    test('`success`/`error`/`info` المؤشِّرة لا تُستعمل لوناً لنصّ', () {
      // لهذه الرموز صيغٌ نصّية (`successText` وأخواتها) أُضيفت لهذا الغرض.
      final indicator = RegExp(
        r'color:\s*(AppColors|colors|context\.themeColors|theme\.themeColors)'
        r'\.(success|error|info)\b(?!Text|Light|Pale)',
      );
      final offenders = <String>[];
      for (final hit in _colorLines()) {
        if (indicator.hasMatch(hit.text) && _isTextContext(hit.before)) {
          offenders.add('${hit.path}:${hit.line}');
        }
      }
      expect(
        offenders,
        isEmpty,
        reason:
            'استعمل `successText`/`errorText`/`infoText` للنصّ. المخالفات: $offenders',
      );
    });

    test('لا لون نصٍّ مكتوب بالسداسي خارج رموز النظام', () {
      // الألوان المكتوبة تتجمّد على وضعٍ واحد: تبقى كما هي حين ينقلب
      // الوضع الداكن، فيصير النصّ الفاتح على سطحٍ فاتح.
      final literal = RegExp(r'color:\s*Color\(0x[0-9A-Fa-f]{8}\)');
      final offenders = <String>[];
      for (final hit in _colorLines()) {
        if (literal.hasMatch(hit.text) && _isTextContext(hit.before)) {
          offenders.add('${hit.path}:${hit.line}');
        }
      }
      expect(offenders, isEmpty, reason: 'المخالفات: $offenders');
    });
  });

  group('رموز النصّ تجتاز AA في الوضعين', () {
    for (final entry in {'الفاتح': AppTheme.light, 'الداكن': AppTheme.dark}.entries) {
      final theme = entry.value;
      final scheme = theme.colorScheme;
      final colors = theme.extension<AppThemeColors>()!;

      // كل سطحٍ يُرسم عليه نصّ في التطبيق.
      final surfaces = <String, Color>{
        'surface': scheme.surface,
        'surfaceContainerHighest': scheme.surfaceContainerHighest,
      };

      test('${entry.key}: النصّ الأساسي والثانوي على كل سطح', () {
        surfaces.forEach((name, bg) {
          expect(
            contrast(scheme.onSurface, bg),
            greaterThanOrEqualTo(4.5),
            reason: 'onSurface على $name',
          );
          expect(
            contrast(scheme.onSurfaceVariant, bg),
            greaterThanOrEqualTo(4.5),
            reason: 'onSurfaceVariant على $name',
          );
        });
      });

      test('${entry.key}: النجاح والخطأ نصّاً على سطوحهما الباهتة', () {
        expect(
          contrast(colors.successText, colors.successPale),
          greaterThanOrEqualTo(4.5),
        );
        expect(
          contrast(colors.errorText, colors.errorPale),
          greaterThanOrEqualTo(4.5),
        );
        expect(contrast(colors.infoText, scheme.surface), greaterThanOrEqualTo(4.5));
        surfaces.forEach((name, bg) {
          expect(
            contrast(colors.successText, bg),
            greaterThanOrEqualTo(4.5),
            reason: 'successText على $name',
          );
          expect(
            contrast(colors.errorText, bg),
            greaterThanOrEqualTo(4.5),
            reason: 'errorText على $name',
          );
        });
      });

      test('[CRITICAL] ${entry.key}: `outline` يرسب نصّاً — سببُ منعه', () {
        // القيمة التي تجعل القاعدة أعلاه ضرورية، موثَّقة بالرقم.
        expect(
          contrast(scheme.outline, scheme.surface),
          lessThan(4.5),
          reason: '`outline` ليس رمز نصّ',
        );
      });

      test('${entry.key}: الأيقونات الدالّة تجتاز 3:1', () {
        // 1.4.11: العناصر غير النصّية التي تحمل معنى — أزرارٌ وأسهم وحالات.
        surfaces.forEach((name, bg) {
          expect(
            contrast(scheme.onSurfaceVariant, bg),
            greaterThanOrEqualTo(3.0),
            reason: 'أيقونة ثانوية على $name',
          );
        });
      });
    }

    test('[CRITICAL] الوضع الداكن ليس نسخةً من الفاتح', () {
      // لونٌ مكتوب بدل الرمز كان سيجعلهما متطابقين — وهو العطب نفسه من جهة
      // أخرى: نصٌّ داكن على سطحٍ داكن.
      final light = AppTheme.light.extension<AppThemeColors>()!;
      final dark = AppTheme.dark.extension<AppThemeColors>()!;
      expect(dark.successText, isNot(light.successText));
      expect(dark.errorText, isNot(light.errorText));
      expect(
        AppTheme.dark.colorScheme.onSurfaceVariant,
        isNot(AppTheme.light.colorScheme.onSurfaceVariant),
      );
    });
  });
}
