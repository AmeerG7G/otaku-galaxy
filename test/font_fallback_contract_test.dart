// [CRITICAL] احتياط الكردية بمقاييس خطّ العلامة — العقد كاملاً.
//
// العطل الذي يحرسه هذا الملف (2026-10-05): Cairo وTajawal لا يملكان حروف
// الكردية، فيأخذها المحرّك من الاحتياط، والسطر يأخذ ارتفاع أطول خطٍّ عليه.
// Noto Sans Arabic الأصلي أطول سطراً من خطّي العلامة، فكان السطر الكردي
// أطول من العربي (Tajawal ١٤: ١٧ ← ٣٠ بكسل) وتكبر كل حاويةٍ فيها كردية
// وتدفع ما تحتها — أكبر مصدرٍ منفرد لاختلاف هندسة الشاشات بين اللغتين.
//
// الإصلاح: احتياطٌ لكلّ خطّ علامة بمقاييسه هو (`AppFonts`)، مولَّدٌ من Noto
// بلا مسّ حروفه (`tool/fonts/make_metric_fallbacks.py`). هنا:
// - الخطوط المولَّدة: مقاييس المانح، وحروف Noto كاملة.
// - التسجيل في pubspec والثيم: كل عائلةٍ مع احتياطها هي.
// - كل `fontFamily:` في `lib/` من `AppFonts` ومعه احتياطه المطابق.
// - القياس الفعلي: السطر الكردي = السطر العربي بكل مقاس و`height`.
// - العربية لا تمرّ بالاحتياط أصلاً — فالتغيير لا يمسّها.

import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/core/l10n/app_strings.dart';
import 'package:otaku_galaxy/features/settings/presentation/cubit/locale_cubit.dart';

import 'support/render_harness.dart';

/// جدول من ملف TTF: إزاحته داخل الملف.
int _table(ByteData data, Uint8List bytes, String tag) {
  final count = data.getUint16(4);
  for (var i = 0; i < count; i++) {
    final record = 12 + i * 16;
    if (String.fromCharCodes(bytes.sublist(record, record + 4)) == tag) {
      return data.getUint32(record + 8);
    }
  }
  throw StateError('لا جدول $tag');
}

/// (ascent, descent, lineGap) من جدول hhea.
(int, int, int) _hhea(String path) {
  final bytes = File(path).readAsBytesSync();
  final data = ByteData.sublistView(bytes);
  final at = _table(data, bytes, 'hhea');
  return (data.getInt16(at + 4), data.getInt16(at + 6), data.getInt16(at + 8));
}

/// نقاط الترميز في cmap (الصيغتان ٤ و١٢).
Set<int> _cmap(String path) {
  final bytes = File(path).readAsBytesSync();
  final data = ByteData.sublistView(bytes);
  final cmap = _table(data, bytes, 'cmap');
  final points = <int>{};
  for (var i = 0; i < data.getUint16(cmap + 2); i++) {
    final sub = cmap + data.getUint32(cmap + 4 + i * 8 + 4);
    final format = data.getUint16(sub);
    if (format == 4) {
      final segX2 = data.getUint16(sub + 6);
      for (var s = 0; s < segX2 ~/ 2; s++) {
        final end = data.getUint16(sub + 14 + s * 2);
        final start = data.getUint16(sub + 16 + segX2 + s * 2);
        if (end == 0xFFFF) continue;
        for (var c = start; c <= end; c++) {
          points.add(c);
        }
      }
    } else if (format == 12) {
      final groups = data.getUint32(sub + 12);
      for (var g = 0; g < groups; g++) {
        final start = data.getUint32(sub + 16 + g * 12);
        final end = data.getUint32(sub + 20 + g * 12);
        for (var c = start; c <= end; c++) {
          points.add(c);
        }
      }
    }
  }
  return points;
}

/// المانح لكلّ احتياط: الملف الذي أُخذت منه مقاييسه.
const _donors = <String, String>{
  'NotoSansArabicCairoMetrics': 'fonts/Cairo-Regular.ttf',
  'NotoSansArabicTajawalMetrics': 'fonts/Tajawal-Regular.ttf',
};

void main() {
  group('الخطوط المولَّدة', () {
    test('مقاييس السطر من خطّ العلامة، والحروف كلها من Noto بلا نقص', () {
      final noto = _cmap('fonts/NotoSansArabic-Regular.ttf');
      final families = pubspecFontFamilies();
      for (final entry in _donors.entries) {
        final files = families[entry.key];
        expect(files, isNotNull, reason: '${entry.key} غير مسجَّل في pubspec');
        expect(files, hasLength(2), reason: '${entry.key}: عادي وعريض');
        for (final file in files!) {
          expect(
            _hhea(file),
            _hhea(entry.value),
            reason: '$file: مقاييس السطر يجب أن تطابق ${entry.value}',
          );
          expect(
            _cmap(file),
            noto,
            reason: '$file: الحروف يجب أن تطابق Noto Sans Arabic الأصلي',
          );
        }
      }
    });

    test('الأصل محفوظ للتوليد ورخصته مرفقة، وغير مسجَّل عائلةً تُستعمل', () {
      expect(File('fonts/NotoSansArabic-Regular.ttf').existsSync(), isTrue);
      expect(File('fonts/NotoSansArabic-Bold.ttf').existsSync(), isTrue);
      expect(
        File('fonts/NotoSansArabic-OFL.txt').readAsStringSync(),
        contains('SIL OPEN FONT LICENSE Version 1.1'),
      );
      // عائلة باسم الأصل = احتياطٌ بمقاييسه الطويلة متاحٌ لمن يكتبه بالخطأ.
      expect(pubspecFontFamilies().keys, isNot(contains('NotoSansArabic')));
    });
  });

  group('الربط', () {
    test('كل أنماط الثيم: العائلة مع احتياطها هي', () {
      for (final theme in [AppTheme.light, AppTheme.dark]) {
        final t = theme.textTheme;
        final styles = {
          'headlineLarge': t.headlineLarge,
          'headlineMedium': t.headlineMedium,
          'headlineSmall': t.headlineSmall,
          'titleLarge': t.titleLarge,
          'titleMedium': t.titleMedium,
          'titleSmall': t.titleSmall,
          'bodyLarge': t.bodyLarge,
          'bodyMedium': t.bodyMedium,
          'bodySmall': t.bodySmall,
          'labelLarge': t.labelLarge,
          'labelMedium': t.labelMedium,
          'labelSmall': t.labelSmall,
        };
        for (final entry in styles.entries) {
          final style = entry.value!;
          expect(
            style.fontFamilyFallback,
            AppFonts.fallbackFor(style.fontFamily),
            reason: '${entry.key} (${style.fontFamily})',
          );
        }
        expect(theme.textTheme.bodyMedium?.fontFamily, AppFonts.body);
        expect(theme.textTheme.headlineLarge?.fontFamily, AppFonts.heading);
      }
    });

    test('[TRIPWIRE] كل fontFamily في lib/ من AppFonts ومعه احتياطه المطابق', () {
      // [CRITICAL] `copyWith(fontFamily: 'Tajawal')` على نمط متنٍ يرث احتياط
      // Cairo — والسطر الكردي يعود أطول من العربي بصمت. لا اسم عائلةٍ حرفي
      // في التطبيق، وكل عائلةٍ في سطرها التالي (غير التعليقي) احتياطها.
      final offenders = <String>[];
      const pairs = {
        'AppFonts.body': 'AppFonts.bodyFallback',
        'AppFonts.heading': 'AppFonts.headingFallback',
      };
      for (final entity in Directory('lib').listSync(recursive: true)) {
        if (entity is! File || !entity.path.endsWith('.dart')) continue;
        if (entity.path.endsWith('app_fonts.dart')) continue;
        final lines = entity.readAsLinesSync();
        for (var i = 0; i < lines.length; i++) {
          final line = lines[i];
          if (line.trimLeft().startsWith('//')) continue;
          final m = RegExp(r'\bfontFamily:\s*(.+?),?\s*$').firstMatch(line);
          if (m == null) continue;
          final where = '${entity.path}:${i + 1}';
          final value = m.group(1)!;
          final families = RegExp(r'AppFonts\.(body|heading)\b')
              .allMatches(value)
              .map((x) => x.group(0)!)
              .toList();
          if (families.isEmpty || value.contains("'")) {
            offenders.add('$where — اسم عائلة خارج AppFonts: $value');
            continue;
          }
          // السطر التالي غير التعليقي (تعليقٌ بينهما مسموح).
          var j = i + 1;
          while (j < lines.length && lines[j].trimLeft().startsWith('//')) {
            j++;
          }
          var next = j < lines.length ? lines[j] : '';
          // المُنسِّق يلفّ القيمة الطويلة إلى السطر الذي يليه:
          // `fontFamilyFallback:` وحدها ثم `AppFonts.headingFallback,`.
          if (RegExp(r'fontFamilyFallback:\s*$').hasMatch(next) &&
              j + 1 < lines.length) {
            next += lines[j + 1];
          }
          for (final family in families) {
            if (!next.contains('fontFamilyFallback:') ||
                !next.contains(pairs[family]!)) {
              offenders.add('$where — $family بلا ${pairs[family]} في السطر التالي غير التعليقي');
            }
          }
        }
      }
      expect(offenders, isEmpty, reason: offenders.join('\n'));
    });
  });

  group('القياس', () {
    setUpAll(loadProjectFonts);

    test('[CRITICAL] السطر الكردي بارتفاع العربي — كل مقاس و`height`', () {
      // نصّان بالطول نفسه تقريباً؛ الكردي فيه ڕ ێ ک ە (من الاحتياط حتماً).
      const arabic = 'الإعدادات العامة';
      const kurdish = 'ڕێکخستنە گشتییەکان';
      final failures = <String>[];
      for (final family in [AppFonts.body, AppFonts.heading]) {
        for (final size in [11.0, 12.0, 13.0, 14.0, 16.0, 18.0, 21.0, 24.0, 26.0]) {
          for (final height in <double?>[null, 1.1, 1.3, 1.5, 1.7]) {
            for (final weight in [FontWeight.w400, FontWeight.w800]) {
              double measure(String text) {
                final painter = TextPainter(
                  text: TextSpan(
                    text: '$text\n$text\n$text',
                    style: TextStyle(
                      fontFamily: family,
                      fontFamilyFallback: AppFonts.fallbackFor(family),
                      fontSize: size,
                      height: height,
                      fontWeight: weight,
                    ),
                  ),
                  textDirection: TextDirection.rtl,
                )..layout();
                final h = painter.height;
                painter.dispose();
                return h;
              }

              final a = measure(arabic);
              final k = measure(kurdish);
              if (a != k) {
                failures.add('$family $size h=$height w=${weight.value}: عربي $a كردي $k');
              }
            }
          }
        }
      }
      expect(failures, isEmpty, reason: failures.join('\n'));
    });
  });

  group('العربية لا تمرّ بالاحتياط', () {
    test('[CRITICAL] كل حرفٍ في نصوص الواجهة العربية في خطّي العلامة', () {
      // لو احتاجت العربية الاحتياط لصار تغيير مقاييسه تغييراً للعربية.
      // الاستثناءات موثّقة ولا تزيد:
      // - الرموز التعبيرية: ليست في Noto أيضاً — يرسمها خطّ النظام كما كانت.
      // - `٬` (فاصل الآلاف العربي) غير موجود في Tajawal وحده؛ نصّه الوحيد
      //   `rulePerPurchase` يُرسم بـbodySmall (Cairo) الذي يملكه.
      final cairo = _cmap('fonts/Cairo-Regular.ttf');
      final tajawal = _cmap('fonts/Tajawal-Regular.ttf');
      final noto = _cmap('fonts/NotoSansArabic-Regular.ttf');
      final arabic = AppStrings.of(AppLanguage.arabic);
      final chars = <int>{
        for (final key in AppStrings.keys) ...arabic(key).runes,
      };
      String hex(int c) => 'U+${c.toRadixString(16).toUpperCase()} ${String.fromCharCode(c)}';
      final viaFallbackInCairo = [
        for (final c in chars)
          if (c > 0x7F && !cairo.contains(c) && noto.contains(c)) hex(c),
      ];
      final viaFallbackInTajawal = [
        for (final c in chars)
          if (c > 0x7F && !tajawal.contains(c) && noto.contains(c)) hex(c),
      ];
      expect(viaFallbackInCairo, isEmpty);
      expect(viaFallbackInTajawal, ['U+66C ٬']);
    });
  });
}
