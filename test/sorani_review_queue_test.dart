// طابور المراجعة الكردية ليس توثيقاً اختيارياً — هو بوّابة.
//
// [CRITICAL] الترجمة السورانية في هذا المستودع صاغها وكيلٌ آلي، لا ناطقٌ
// بالسورانية. كلُّ اختبارٍ آخر يقيس السلامة التقنية: المتغيّرات، الطول،
// المحارف، الاتساق. لا شيء منها يقيس أن الجملة **تُقال** هكذا فعلاً. الخطر
// أن تمرّ 497 جملة خضراء في CI فتُقرأ خضرتُها على أنها موافقة لغوية.
//
// هذا الملفّ يمنع ذلك: لكل مفتاحٍ مترجَم مدخلٌ في الطابور، ولا مدخل يجوز أن
// يحمل `NATIVE_APPROVED` ما دام لم يمرّ على إنسان. تغييرُ الحالة يتطلّب
// تحرير الملفّ بيد مراجعٍ حقيقي — ولا يستطيع اختبارٌ أن يمنحها لنفسه.

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'package:otaku_galaxy/core/l10n/app_strings.dart';

Map<String, dynamic> _queue() {
  final file = File('docs/localization/review-queue.json');
  expect(
    file.existsSync(),
    isTrue,
    reason: 'اختفى طابور المراجعة — الترجمة بلا أثرٍ يُراجَع',
  );
  return jsonDecode(file.readAsStringSync()) as Map<String, dynamic>;
}

void main() {
  group('[CRITICAL] بوّابة المراجعة الناطقة', () {
    test('[CRITICAL] القبول الإنتاجي ليس موافقةً لغوية', () {
      // [CRITICAL] «مقبولة للإنتاج مبدئياً» قرارُ منتجٍ يوازن بين حجم
      // الجمهور والجودة. «معتمَدة من ناطق» حكمٌ لغويّ. الأولى لا تُنتج
      // الثانية مهما طال الزمن، والخلطُ بينهما هو الطريق الذي تُنسى به
      // مراجعةٌ لم تحدث: يقرأ أحدهم «ACCEPTED» فيفترض أن أحداً راجع.
      //
      // هذا الاختبار يبقي الحدّ قائماً في الملفّ لا في الذاكرة.
      final file = File('docs/localization/status.json');
      expect(file.existsSync(), isTrue, reason: 'اختفى ملفّ حالة اللغة');
      final status = jsonDecode(file.readAsStringSync()) as Map<String, dynamic>;

      expect(status['locale'], 'ckb');
      expect(
        status['production_status'],
        'PROVISIONALLY_ACCEPTED_FOR_PRODUCTION',
      );
      expect(
        status['native_review_status'],
        'PENDING_NO_HUMAN_NATIVE_REVIEW_PERFORMED',
      );

      // العدد المعلَن يجب أن يطابق الواقع في الطابور، لا أن يُكتب يدوياً.
      final queue = _queue();
      final approved = queue.values
          .where((v) => (v as Map)['native_review'] == 'NATIVE_APPROVED')
          .length;
      expect(
        status['native_approved_count'],
        approved,
        reason: 'الحالة تعلن عدداً معتمَداً يخالف الطابور',
      );
      expect(
        status['needs_native_review_count'],
        queue.length - approved,
        reason: 'عدد المنتظِر في الحالة يخالف الطابور',
      );
      expect(status['total_strings'], queue.length);

      // ولا يجوز أن يتسرّب لفظُ الاعتماد إلى ملفّ القبول.
      final raw = file.readAsStringSync().toUpperCase();
      expect(
        raw.contains('"NATIVE_APPROVED"'),
        isFalse,
        reason: 'ملفّ الحالة يستعمل NATIVE_APPROVED قيمةً — وهو ما لم يحدث',
      );
      expect(
        (status['what_this_status_does_NOT_mean'] as List),
        isNotEmpty,
        reason: 'أُزيل النصّ الذي يمنع قراءة القبول على أنه اعتماد لغوي',
      );
    });

    test('[TRIPWIRE] رأس الطابور المولَّد وREADME يعلنان أعداد الطابور نفسها', () {
      // كان العرض يُكتب باليد فتأخّر عن المصدر (٤٩٧ في العرض مقابل ٥٢٤ في
      // JSON). العرض يُولَّد الآن من JSON، وهذا يمنع عودة التأخّر: مجاميع
      // رأس `sorani-review-queue.md` وصفّ «مفاتيح كردية» في README تُقارن
      // بالطابور، لا تُكتب.
      final queue = _queue();
      int risk(String r) =>
          queue.values.where((v) => (v as Map)['risk'] == r).length;

      final md = File('docs/localization/sorani-review-queue.md');
      expect(md.existsSync(), isTrue, reason: 'اختفى عرض الطابور');
      final header = RegExp(
        r'\*\*المجموع:\*\* (\d+) · عالي (\d+) · متوسّط (\d+) · منخفض (\d+)',
      ).firstMatch(md.readAsStringSync());
      expect(header, isNotNull, reason: 'سطر المجموع مفقود من رأس الطابور');
      expect(int.parse(header!.group(1)!), queue.length);
      expect(int.parse(header.group(2)!), risk('HIGH'));
      expect(int.parse(header.group(3)!), risk('MEDIUM'));
      expect(int.parse(header.group(4)!), risk('LOW'));

      // وكل مفتاحٍ في الطابور صفٌّ في العرض — ولا صفٌّ لمفتاحٍ زال.
      final rows = RegExp(r'^\| \d+ \| `([^`]+)` \|', multiLine: true)
          .allMatches(md.readAsStringSync())
          .map((m) => m.group(1)!)
          .toSet();
      expect(rows, queue.keys.toSet(), reason: 'العرض لا يطابق مفاتيح الطابور — أعد توليده');

      final readme = File('docs/localization/README.md').readAsStringSync();
      final declared = RegExp(r'\| مفاتيح كردية \| (\d+) \|').firstMatch(readme);
      expect(declared, isNotNull, reason: 'صفّ «مفاتيح كردية» مفقود من README');
      expect(int.parse(declared!.group(1)!), queue.length);
    });

    test('لكل مفتاح مترجَم مدخلٌ في الطابور', () {
      final queue = _queue();
      final missing = AppStrings.translatedKeys
          .where((k) => !queue.containsKey(k))
          .toList();
      expect(
        missing,
        isEmpty,
        reason: 'ترجمةٌ بلا مدخل مراجعة — تمرّ إلى الإنتاج بلا أن يراها أحد:\n'
            '${missing.join(', ')}',
      );
    });

    test('لا مدخل يدّعي موافقة ناطق', () {
      // [CRITICAL] هذا هو الاختبار الذي يحرس الصدق لا الصحّة. يسقط في
      // اللحظة التي يكتب فيها أحدٌ — أو وكيلٌ — `NATIVE_APPROVED` بلا
      // مراجعةٍ حقيقية. رفعُه يجب أن يكون قراراً واعياً من إنسان.
      final queue = _queue();
      final claimed = <String>[];
      queue.forEach((key, value) {
        final state = (value as Map<String, dynamic>)['native_review'];
        if (state != 'NEEDS_NATIVE_REVIEW') claimed.add('$key → $state');
      });
      expect(
        claimed,
        isEmpty,
        reason: 'مفاتيح تدّعي موافقةً ناطقة لم تحدث:\n${claimed.join('\n')}',
      );
    });

    test('[TRIPWIRE F] لا موافقة ناطق بلا أثرٍ بشريّ يثبتها', () {
      // [CRITICAL] الاختبار السابق يمنع `NATIVE_APPROVED` منعاً مطلقاً.
      // هذا يذهب أبعد: حين يأتي مراجعٌ حقيقي غداً ويرفع الحالة، لا يجوز أن
      // تُرفع بحقلٍ واحد. الموافقة تتطلّب أثراً: اسمَ مراجعٍ وقراراً صريحاً.
      // بلا ذلك يستطيع وكيلٌ آلي أن يكتب `NATIVE_APPROVED` في سطرٍ واحد
      // ويُحوّل مسوّدةً إلى «معتمَدة» بلا أن يقرأها إنسان.
      final queue = _queue();
      final bogus = <String>[];
      queue.forEach((key, value) {
        final e = value as Map<String, dynamic>;
        final approved = e['native_review'] == 'NATIVE_APPROVED';
        final decision = e['human_decision'] as String? ?? 'PENDING';
        final reviewer = (e['human_reviewer'] as String? ?? '').trim();
        if (approved && (decision != 'APPROVED' || reviewer.isEmpty)) {
          bogus.add('$key: NATIVE_APPROVED بلا مراجعٍ مسمّى أو قرار صريح');
        }
        // والعكس: قرارٌ بشريّ مسجَّل لكن الحالة لم تتحرّك — تناقضٌ يخفي عملاً.
        if (decision == 'APPROVED' && !approved) {
          bogus.add('$key: قرارٌ بالموافقة لكن الحالة ما تزال منتظِرة');
        }
        if (reviewer.isNotEmpty && decision == 'PENDING') {
          bogus.add('$key: مراجعٌ مسمّى بلا قرار');
        }
      });
      expect(bogus, isEmpty, reason: bogus.join('\n'));
    });

    test('نتيجة المراجعة الآلية من المجموعة المعروفة', () {
      const allowed = {
        'NOT_REVIEWED',
        'GOOD',
        'QUESTIONABLE',
        'NEEDS_REVISION',
        'BLOCKED',
      };
      final bad = <String>[];
      _queue().forEach((key, value) {
        final r = (value as Map<String, dynamic>)['ai_pre_review'];
        if (!allowed.contains(r)) bad.add('$key → $r');
        // اقتراحٌ بلا تفسير لا يساعد المراجع على الحكم.
        final proposed = (value['proposed_ckb'] as String? ?? '').trim();
        final why = (value['ai_explanation'] as String? ?? '').trim();
        if (proposed.isNotEmpty && why.isEmpty) {
          bad.add('$key: اقتراحٌ بلا تفسير');
        }
      });
      expect(bad, isEmpty, reason: bad.join('\n'));
    });

    test('كل مدخل يحمل الحقول التي يحتاجها المراجع', () {
      final queue = _queue();
      const required = [
        'ar',
        'ckb',
        'feature',
        'context',
        'risk',
        'placeholders',
        'gender',
        'glossary',
        'self_review',
        'native_review',
      ];
      final broken = <String>[];
      queue.forEach((key, value) {
        final entry = value as Map<String, dynamic>;
        for (final field in required) {
          if (!entry.containsKey(field)) broken.add('$key ينقصه $field');
        }
        if ((entry['context'] as String?)?.trim().isEmpty ?? true) {
          broken.add('$key بلا سياق');
        }
        if (!const ['HIGH', 'MEDIUM', 'LOW'].contains(entry['risk'])) {
          broken.add('$key بأولوية غير معروفة: ${entry['risk']}');
        }
      });
      expect(broken, isEmpty, reason: broken.join('\n'));
    });

    test('نصّ الطابور يطابق ما يُعرض فعلاً', () {
      // طابورٌ يصف نصّاً غير المعروض يجعل المراجعة تُصادق على شيءٍ آخر.
      final queue = _queue();
      final drifted = <String>[];
      queue.forEach((key, value) {
        final entry = value as Map<String, dynamic>;
        if (!AppStrings.keys.contains(key)) {
          drifted.add('$key لم يعد موجوداً في AppStrings');
          return;
        }
        if (entry['ckb'] != AppStrings.kurdish(key)) {
          drifted.add('$key: الطابور «${entry['ckb']}» ≠ المعروض '
              '«${AppStrings.kurdish(key)}»');
        }
        if (entry['ar'] != AppStrings.arabic(key)) {
          drifted.add('$key: العربية في الطابور تخالف المصدر');
        }
      });
      expect(drifted, isEmpty, reason: drifted.join('\n'));
    });

    test('كل مفتاح عالي الخطورة مُعلَّل', () {
      // الأولوية العالية بلا سببٍ مكتوب لا تساعد المراجع على ترتيب وقته.
      final queue = _queue();
      final bare = <String>[];
      queue.forEach((key, value) {
        final entry = value as Map<String, dynamic>;
        if (entry['risk'] != 'HIGH') return;
        final notes = (entry['notes'] as String? ?? '').trim();
        final issues = (entry['issues'] as String? ?? '').trim();
        final context = (entry['context'] as String? ?? '').trim();
        if (notes.isEmpty && issues.isEmpty && context.length < 12) {
          bare.add(key);
        }
      });
      expect(bare, isEmpty, reason: 'HIGH بلا تعليل: ${bare.join(', ')}');
    });
  });
}
