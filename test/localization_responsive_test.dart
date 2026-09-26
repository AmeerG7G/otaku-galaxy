// الترجمة × المقاس × حجم الخط — حاصل الضرب الذي تظهر فيه الأعطال.
//
// [CRITICAL] كل بُعدٍ وحده يمرّ: العربية على هاتف معتاد بخطٍّ معتاد سليمة،
// والكردية كذلك. العطل يقع عند التقاطع — أطولُ نصٍّ كردي، على أصغر عرض،
// بأكبر تكبير خط. هذا الملف يقيس التقاطع لا الأضلاع.
//
// المقاسات نفسها المستعملة في `responsive_layout_test.dart` كي لا يتفرّع
// تعريفان للجهاز الواحد.

import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/core/l10n/app_strings.dart';
import 'package:otaku_galaxy/core/utils/formatters.dart';
import 'package:otaku_galaxy/features/settings/presentation/cubit/locale_cubit.dart';

import 'support/render_harness.dart';

const _smallPhone = Size(320, 568); // iPhone SE — أضيق ما ندعمه
const _phone = Size(393, 852);
const _largePhone = Size(430, 932);
const _tabletPortrait = Size(834, 1112);
const _tabletLandscape = Size(1194, 834);

const _sizes = <String, Size>{
  'هاتف صغير': _smallPhone,
  'هاتف': _phone,
  'هاتف كبير': _largePhone,
  'لوح عمودي': _tabletPortrait,
  'لوح أفقي': _tabletLandscape,
};

/// تكبيرات الخط المقيسة — الافتراضي، وأكبر ما تسمح به إعدادات النظام عملياً.
const _textScales = <double>[1.0, 1.3, 2.0];

Future<List<String>> _pumpAt(
  WidgetTester tester,
  Widget child, {
  required Size size,
  required AppLanguage language,
  required double textScale,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  final errors = <String>[];
  final previous = FlutterError.onError;
  FlutterError.onError = (details) {
    final text = details.exceptionAsString();
    if (text.contains('overflowed')) {
      errors.add(text.split('\n').first);
    } else {
      previous?.call(details);
    }
  };

  try {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        locale: language.locale,
        supportedLocales: AppLanguage.values.map((l) => l.locale),
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        // نفس ما يفعله `app.dart:146` بالضبط: Flutter لا يشحن حزمة Material
        // للكردية، والتطبيق يثبّت تعريبات Material على العربية (أقرب بديل
        // RTL) بدل السقوط للإنجليزية. الاختبار يحاكي التطبيق لا يخترع
        // إعداداً أنظف منه — وإلا قاس شيئاً لا يعمل به المستخدم.
        localeResolutionCallback: (locale, supported) => const Locale('ar'),
        builder: (context, widget) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: TextScaler.linear(textScale)),
          child: widget!,
        ),
        home: Directionality(
          // كلتا اللغتين من اليمين لليسار.
          textDirection: TextDirection.rtl,
          child: Scaffold(body: SafeArea(child: child)),
        ),
      ),
    );
    await tester.pump();
  } finally {
    FlutterError.onError = previous;
  }
  return errors;
}

/// أطول النصوص المترجَمة فعلياً — لا نصوص مخترعة: ما يعرضه التطبيق حقاً.
List<String> _longestStrings(AppLanguage language) {
  final strings = AppStrings.of(language);
  final all = AppStrings.keys.map(strings.call).toList()
    ..sort((a, b) => b.length.compareTo(a.length));
  return all.take(5).toList();
}

/// الحروف الناقصة في كل خطّ مضمَّن — يقرأ جدول `cmap` من الملف مباشرةً.
Map<String, List<String>> _missingGlyphs(Map<String, int> letters) {
  final result = <String, List<String>>{};
  for (final file in Directory('fonts').listSync().whereType<File>()) {
    if (!file.path.endsWith('.ttf')) continue;
    final points = _cmapCodePoints(file.readAsBytesSync());
    final missing = [
      for (final entry in letters.entries)
        if (!points.contains(entry.value)) entry.key,
    ];
    if (missing.isNotEmpty) {
      result[file.uri.pathSegments.last] = missing;
    }
  }
  return result;
}

/// نقاط الترميز التي يغطّيها الخط (صيغة cmap رقم ٤ — الشائعة في TTF).
Set<int> _cmapCodePoints(Uint8List bytes) {
  final data = ByteData.sublistView(bytes);
  final tableCount = data.getUint16(4);
  var cmapOffset = -1;
  for (var i = 0; i < tableCount; i++) {
    final record = 12 + i * 16;
    final tag = String.fromCharCodes(bytes.sublist(record, record + 4));
    if (tag == 'cmap') cmapOffset = data.getUint32(record + 8);
  }
  if (cmapOffset < 0) return const {};

  final points = <int>{};
  final subtableCount = data.getUint16(cmapOffset + 2);
  for (var i = 0; i < subtableCount; i++) {
    final record = cmapOffset + 4 + i * 8;
    final subtable = cmapOffset + data.getUint32(record + 4);
    if (data.getUint16(subtable) != 4) continue;
    final segCountX2 = data.getUint16(subtable + 6);
    final segCount = segCountX2 ~/ 2;
    final startBase = subtable + 16 + segCountX2;
    for (var s = 0; s < segCount; s++) {
      final end = data.getUint16(subtable + 14 + s * 2);
      final start = data.getUint16(startBase + s * 2);
      if (end == 0xFFFF) continue;
      for (var c = start; c <= end; c++) {
        points.add(c);
      }
    }
  }
  return points;
}

void main() {
  setUpAll(loadProjectFonts);

  // [FIXED] الكردية عادت إلى المصفوفة بعد إضافة احتياط الخط في `AppTheme`.
  //
  // كانت مستثناة لأن خطّي العلامة لا يملكان حروفها، فكان القياس يقع على
  // بديل النظام. الآن يرسمها المحرّك بـNotoSansArabic للمحرف الناقص وحده،
  // فصار القياس حقيقياً. إخراجُها من هذه القائمة ثانيةً يُسقط
  // «الكردية ما تزال مقيسة» أدناه عمداً.
  const layoutLanguages = AppLanguage.values;

  group('[CRITICAL] النصّ المترجَم لا يتجاوز على أي مقاس', () {
    for (final language in layoutLanguages) {
      for (final entry in _sizes.entries) {
        testWidgets('${language.code} — ${entry.key}', (tester) async {
          final longest = _longestStrings(language).first;
          final errors = await _pumpAt(
            tester,
            Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                AnimePrimaryButton(label: longest, onPressed: () {}),
                const SizedBox(height: 8),
                AnimeSecondaryButton(label: longest, onPressed: () {}),
                const SizedBox(height: 8),
                AnimeOutlinedButton(label: longest, onPressed: () {}),
              ],
            ),
            size: entry.value,
            language: language,
            textScale: 1.0,
          );
          expect(errors, isEmpty, reason: '${entry.key} / ${language.code}');
        });
      }
    }
  });

  group('[CRITICAL] الترجمة مع تكبير الخط — التقاطع', () {
    for (final language in layoutLanguages) {
      for (final scale in _textScales) {
        testWidgets('${language.code} — تكبير ×$scale على أصغر هاتف', (
          tester,
        ) async {
          final longest = _longestStrings(language);
          final errors = await _pumpAt(
            tester,
            ListView(
              children: [
                for (final label in longest) ...[
                  AnimePrimaryButton(label: label, onPressed: () {}),
                  const SizedBox(height: 6),
                ],
              ],
            ),
            // أضيق عرض × أكبر خط — أسوأ حالة ممكنة.
            size: _smallPhone,
            language: language,
            textScale: scale,
          );
          expect(
            errors,
            isEmpty,
            reason: 'أطول نصوص ${language.code} بتكبير $scale',
          );
        });
      }
    }
  });

  group('الأرقام تبقى غربية في اللغتين', () {
    testWidgets('[CRITICAL] لا رقم عربي-هندي في نصوص الواجهة المترجَمة', (
      tester,
    ) async {
      // متطلَّب منتج صريح: ٥٠٠٠ ممنوعة، 5000 هي الصحيحة.
      final arabicIndic = RegExp(r'[٠-٩۰-۹]');
      for (final language in AppLanguage.values) {
        final strings = AppStrings.of(language);
        for (final key in AppStrings.keys) {
          if (kPreexistingArabicIndicKeys.contains(key)) continue;
          expect(
            arabicIndic.hasMatch(strings(key)),
            isFalse,
            reason: '$key (${language.code}) يحمل رقماً عربياً-هندياً',
          );
        }
      }
    });

    testWidgets('تنسيق السعر يستعمل أرقاماً غربية', (tester) async {
      late BuildContext context;
      await tester.pumpWidget(
        Builder(
          builder: (c) {
            context = c;
            return const SizedBox.shrink();
          },
        ),
      );
      final rendered = formatPrice(context, 25000);
      expect(rendered, contains('25000'));
      expect(RegExp(r'[٠-٩]').hasMatch(rendered), isFalse);
    });
  });

  group('[CRITICAL] تغطية الخطوط — هل يستطيع خطّ العلامة رسم الكردية؟', () {
    /// حروف كردية أساسية غائبة عن الخطوط العربية الشائعة.
    const kurdishLetters = <String, int>{
      'ک': 0x06A9,
      'ێ': 0x06CE,
      'ۆ': 0x06C6,
      'ڕ': 0x0695,
      'ڵ': 0x06B5,
      'ژ': 0x0698,
      'گ': 0x06AF,
    };

    test('[CRITICAL] كل محرف في الترجمة الكردية مغطّى بخطٍّ ما', () {
      // [CRITICAL] القائمة الثابتة أعلاه كُتبت قبل الترجمة، حين كانت
      // المفاتيح الكردية ١٧. بعد اكتمال الـ٤٩٧ صار المقيسُ الصحيح هو
      // **ما في النصّ فعلاً** لا ما توقّعناه: محرفٌ واحد خارج التغطية يعني
      // مربّعاً أسود في جملةٍ يقرؤها زبون. هذا الاختبار يشتقّ المجموعة من
      // القيم نفسها، فينمو معها تلقائياً.
      final used = <int>{};
      final strings = AppStrings.of(AppLanguage.kurdish);
      for (final key in AppStrings.keys) {
        for (final rune in strings(key).runes) {
          // المسافات والترقيم اللاتيني والأرقام والإيموجي خارج النطاق:
          // الأول يغطّيه كل خط، والأخير يرسمه النظام لا خطُّ التطبيق.
          if (rune > 0x0600 && rune < 0x0700) used.add(rune);
        }
      }
      expect(used, isNotEmpty, reason: 'لا حرف عربيّ-الرسم في الترجمة الكردية');

      final fonts = Directory('fonts')
          .listSync()
          .whereType<File>()
          .where((f) => f.path.endsWith('.ttf'))
          .toList();
      expect(fonts, isNotEmpty, reason: 'لا خطوط مضمَّنة');

      final covered = <int>{};
      for (final file in fonts) {
        covered.addAll(_cmapCodePoints(file.readAsBytesSync()));
      }
      final uncovered = used.difference(covered);
      expect(
        uncovered,
        isEmpty,
        reason: 'محارف بلا خط — ستُرسم مربّعات فارغة: '
            '${uncovered.map((c) => '${String.fromCharCode(c)} '
                'U+${c.toRadixString(16).toUpperCase()}').join(', ')}',
      );
    });

    test('نصوص الكردية المستعملة فعلاً تحتاج حروفاً خارج العربية', () {
      // يوثّق سبب الفحص: ليست حالةً نظرية.
      final strings = AppStrings.of(AppLanguage.kurdish);
      final used = <String>{};
      for (final key in AppStrings.keys) {
        for (final ch in strings(key).split('')) {
          if (kurdishLetters.containsKey(ch)) used.add(ch);
        }
      }
      expect(
        used,
        isNotEmpty,
        reason: 'لو خلت النصوص الكردية من هذه الحروف لما كان للفحص معنى',
      );
    });

    test('[CRITICAL] كل حرف كردي يجده خطُّ العلامة أو احتياطُه', () {
      // الحارس الصحيح ليس «هل Cairo يملك الحرف؟» — لن يملكه أبداً، وليس
      // مطلوباً منه: خطّ العلامة مقفل بالمرحلة ٠٣. الحارس هو «هل يجد
      // المحرّك الحرف في مكانٍ ما؟»، أي خطّ العلامة أو الاحتياط المسجَّل.
      //
      // إسقاط الاحتياط من `pubspec` أو من `AppTheme` يُسقط هذا الاختبار.
      final missingFromBrand = _missingGlyphs(kurdishLetters);
      expect(
        missingFromBrand,
        isNotEmpty,
        reason: 'لو صار خطّ العلامة يغطّي الكردية فالاحتياط لم يعد لازماً — '
            'راجع هذا الاختبار بدل حذفه',
      );

      // والاحتياط يغطّي كل ما نقص.
      final fallbackFiles = Directory('fonts')
          .listSync()
          .whereType<File>()
          .where((f) => f.path.contains('NotoSansArabic'))
          .toList();
      expect(
        fallbackFiles,
        isNotEmpty,
        reason: 'خطّ احتياط الكردية غير مضمَّن في fonts/',
      );
      for (final file in fallbackFiles) {
        final points = _cmapCodePoints(file.readAsBytesSync());
        final missing = [
          for (final entry in kurdishLetters.entries)
            if (!points.contains(entry.value)) entry.key,
        ];
        expect(
          missing,
          isEmpty,
          reason: '${file.uri.pathSegments.last} ينقصه ${missing.join()}',
        );
      }
    });

    test('[CRITICAL] الاحتياط مسجَّل في طبقة الثيم لا في الودجات', () {
      // لو سُجِّل على ودجات مفردة لعادت المشكلة عند أول نصٍّ جديد.
      final theme = AppTheme.light;
      expect(theme.textTheme.bodyMedium?.fontFamilyFallback, contains('NotoSansArabic'));
      expect(theme.textTheme.titleLarge?.fontFamilyFallback, contains('NotoSansArabic'));
      // والعربية ما تزال على خطّ العلامة — الاحتياط لم يزحه.
      expect(theme.textTheme.bodyMedium?.fontFamily, 'Cairo');
      expect(theme.textTheme.headlineLarge?.fontFamily, 'Tajawal');
    });
  });

  group('[TRIPWIRE] المصفوفة نفسها لا تُقلَّص بهدوء', () {
    test('كل لغة مدعومة مقيسة في مصفوفة التخطيط', () {
      // [CRITICAL] أسهل «إصلاح» لسقوط كردي هو إخراج الكردية من المصفوفة.
      // هذا الاختبار يجعل ذلك سقوطاً بذاته: من يقلّصها يكسر هذا الحارس.
      expect(
        layoutLanguages.toSet(),
        AppLanguage.values.toSet(),
        reason: 'لغة مدعومة خرجت من قياس التخطيط — أعِدها أو وثّق السبب',
      );
    });

    test('المقاسات تغطّي من أصغر هاتف إلى لوحٍ أفقي', () {
      expect(_sizes.values.map((s) => s.width).reduce((a, b) => a < b ? a : b), 320);
      expect(_sizes.values.map((s) => s.width).reduce((a, b) => a > b ? a : b), 1194);
      expect(_sizes.length, greaterThanOrEqualTo(5));
    });
  });

  group('[TRIPWIRE] لا نصّ يفلت من احتياط الخط', () {
    test('كل TextStyle جديد بخطّ علامة يحمل الاحتياط', () {
      // [CRITICAL] `copyWith` على أنماط الثيم يرث الاحتياط تلقائياً (٤٩
      // موضعاً). الخطر في `TextStyle(...)` المبني من الصفر: يفقد الاحتياط
      // بصمت، فيظهر نصّه الكردي مربّعات بينما بقية الشاشة سليمة.
      final offenders = <String>[];
      for (final entity in Directory('lib').listSync(recursive: true)) {
        if (entity is! File || !entity.path.endsWith('.dart')) continue;
        final lines = entity.readAsLinesSync();
        for (var i = 0; i < lines.length; i++) {
          final isBrandFamily = RegExp(
            r"^\s*fontFamily: '(Cairo|Tajawal)',\s*$",
          ).hasMatch(lines[i]);
          if (!isBrandFamily) continue;
          final back = lines.sublist(i < 3 ? 0 : i - 3, i).join('\n');
          if (back.contains('copyWith')) continue; // يرث من الثيم
          final ahead = lines
              .sublist(i, i + 4 > lines.length ? lines.length : i + 4)
              .join('\n');
          if (!ahead.contains('fontFamilyFallback')) {
            offenders.add('${entity.path}:${i + 1}');
          }
        }
      }
      expect(
        offenders,
        isEmpty,
        reason: 'TextStyle بلا احتياط خط — الكردية ستظهر مربّعات:\n'
            '${offenders.join('\n')}',
      );
    });
  });

  group('اكتمال الترجمة', () {
    test('[CRITICAL] لكل مفتاح عربي مقابلٌ كردي غيرُ فارغ وغيرُ مطابق', () {
      final ar = AppStrings.arabic;
      final ckb = AppStrings.kurdish;
      final untranslated = <String>[];
      // ما تُرجم فعلاً فقط — المفاتيح المنتظِرة تُتابَع بعدّادٍ صريح في
      // `localization_corpus_test.dart` بدل أن تُعلَن أعطالاً هنا.
      for (final key in AppStrings.translatedKeys) {
        final a = ar(key);
        final k = ckb(key);
        if (k.trim().isEmpty) {
          untranslated.add('$key — فارغ');
        } else if (k == a && !AppStrings.localeInvariantKeys.contains(key)) {
          // نصٌّ مطابق للعربية يعني أن الاحتياط عمل ولم تُكتب ترجمة —
          // إلّا في المفاتيح المعلَنة بأنها لا تتغيّر بتغيّر اللغة
          // (وحدة العملة، الرموز، الفاصلة).
          untranslated.add('$key — لم يُترجَم');
        }
      }
      expect(untranslated, isEmpty);
    });

    test('كلتا اللغتين تُكتبان من اليمين لليسار', () {
      for (final language in AppLanguage.values) {
        expect(
          language.locale.languageCode,
          anyOf('ar', 'ckb'),
          reason: 'لغة غير متوقّعة',
        );
      }
    });
  });
}


/// مخالفاتٌ **قائمة قبل الاستخراج**، لا استثناءات ممنوحة.
///
/// [CRITICAL] هذه النصوص العشرة كانت محفورةً في الودجات، خارج مرمى هذا
/// الاختبار تماماً، فمرّت سنواتٍ بلا رصد. نقلُها إلى `AppStrings` لم يُنشئ
/// المخالفة — كشفها. وقاعدةُ «الأرقام غربية» ما تزال تحرس كل مفتاح آخر،
/// وكل مفتاح جديد، بلا تهاون.
///
/// لم تُصحَّح هنا عمداً: مهمّة الاستخراج تنقل النصّ حرفاً بحرف ولا تحرّره.
/// تغييرُ «الخطوة ١ من ٢» إلى «الخطوة 1 من 2» قرارُ محتوى يخصّ صاحب
/// المنتج، ويُتخذ في مهمّةٍ مستقلّة — وحينها تُحذف الأسماء من هنا وتعود
/// تحت الحراسة.
///
/// القائمة **لا تنمو**: أي مفتاح جديد يحمل رقماً عربياً-هندياً يسقط
/// الاختبار كما ينبغي.
const kPreexistingArabicIndicKeys = <String>{
  'stepOneOfTwo', // «الخطوة ١ من ٢» — ترويسة إتمام الطلب
  'stepTwoOfTwo', // «الخطوة ٢ من ٢» — ترويسة مراجعة الطلب
  'stepNumeral1', // أرقام خطوات شاشة نجاح الطلب
  'stepNumeral2',
  'stepNumeral3',
  'etaTwoToFourDays', // «٢–٤ أيام» — مدى لا رقم مفرد
  'pointsNumeral5', // أرقام قواعد نقاط المجرّة
  'pointsNumeral1',
  'rulePerPurchase', // «١٠٬٠٠٠ دينار» — مبلغ داخل قاعدة
  'birthdayDiscountToday', // «١١:٥٩ مساءً» — وقت انتهاء الصلاحية
};
