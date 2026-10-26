// يولّد `docs/localization/sorani-review-queue.md` من `review-queue.json`.
//
// التشغيل من جذر المشروع:
//   dart run tool/l10n/render_sorani_review_queue.dart
//   dart run tool/l10n/render_sorani_review_queue.dart --check   # يفشل إن كان الملفّ قديماً
//
// [CRITICAL] المصدر الوحيد هو JSON؛ هذا الملفّ **عرضٌ** لا مصدر. كان العرض
// يُكتب باليد فتأخّر عن المصدر (٤٩٧ مفتاحاً في العرض مقابل ٥٢٤ في المصدر،
// وقيمٌ تغيّرت في التدقيق بقيت بصيغتها القديمة). الترتيب: نتيجة المراجعة
// الآلية (BLOCKED أولاً) ثم الخطورة (HIGH أولاً) ثم ترتيب المفتاح في JSON.
// يحرس التطابقَ `test/sorani_review_queue_test.dart` (مجاميع الرأس).

import 'dart:convert';
import 'dart:io';

const _queuePath = 'docs/localization/review-queue.json';
const _outputPath = 'docs/localization/sorani-review-queue.md';

const _aiOrder = ['BLOCKED', 'NEEDS_REVISION', 'QUESTIONABLE', 'GOOD', 'NOT_REVIEWED'];
const _riskOrder = ['HIGH', 'MEDIUM', 'LOW'];

const _aiMeaning = {
  'BLOCKED': 'لا يُحسم لغوياً — يحتاج قرار منتج',
  'NEEDS_REVISION': 'عطبٌ موضوعي (نحو/صرف/إملاء/معنى)',
  'QUESTIONABLE': 'صحيح لكن قابل للتحسين أو مقيَّد بقرار خارجي',
  'GOOD': 'لا مأخذ في المراجعة الآلية',
  'NOT_REVIEWED': 'خارج نطاق الجولة الآلية (لم يُقرأ آلياً بعد)',
};

String _cell(Object? value) {
  final text = (value?.toString() ?? '').trim();
  if (text.isEmpty) return '—';
  return text.replaceAll('|', r'\|').replaceAll('\n', '<br>');
}

String render(Map<String, dynamic> queue) {
  final keys = queue.keys.toList();
  final index = {for (var i = 0; i < keys.length; i++) keys[i]: i};
  Map<String, dynamic> entry(String k) => queue[k] as Map<String, dynamic>;

  final sorted = List<String>.of(keys)
    ..sort((a, b) {
      final ea = entry(a);
      final eb = entry(b);
      final ai = _aiOrder.indexOf(ea['ai_pre_review'] as String) -
          _aiOrder.indexOf(eb['ai_pre_review'] as String);
      if (ai != 0) return ai;
      final risk = _riskOrder.indexOf(ea['risk'] as String) -
          _riskOrder.indexOf(eb['risk'] as String);
      if (risk != 0) return risk;
      return index[a]! - index[b]!;
    });

  int countRisk(String r) => keys.where((k) => entry(k)['risk'] == r).length;
  int countAi(String a) => keys.where((k) => entry(k)['ai_pre_review'] == a).length;
  final approved = keys.where((k) => entry(k)['native_review'] == 'NATIVE_APPROVED').length;

  final out = StringBuffer()
    ..writeln('# طابور المراجعة الكردية · Sorani Native-Review Queue')
    ..writeln()
    ..writeln('> ## الحالة الإنتاجية: `PROVISIONALLY ACCEPTED FOR PRODUCTION`')
    ..writeln('> ## حالة المراجعة الناطقة: `PENDING — NO HUMAN NATIVE REVIEW PERFORMED`')
    ..writeln('>')
    ..writeln('> القبول الإنتاجي قرارُ منتج (الجمهور الكردي صغير في هذه المرحلة)، لا حكمٌ')
    ..writeln('> لغويّ. لا يُلغي هذا الطابور ولا يُقلّل أولويّته — يُبقيه مفتوحاً.')
    ..writeln('> التفاصيل في [`README.md`](README.md) و[`status.json`](status.json).')
    ..writeln('>')
    ..writeln('> ## ⚠ لا توجد موافقة ناطق')
    ..writeln('>')
    ..writeln('> كل مفتاح أدناه حالته `NEEDS_NATIVE_REVIEW`، و`NATIVE_APPROVED = $approved`.')
    ..writeln('> ما جرى هو **مراجعة آلية تمهيدية** (`AI PRE-REVIEW`) قام بها الوكيل نفسه')
    ..writeln('> الذي صاغ الترجمة — وهي ليست بديلاً عن ناطقٍ بالسورانية ولا تُقرأ كذلك.')
    ..writeln('> يحرس ذلك `sorani_review_queue_test.dart` (بما فيه Tripwire F).')
    ..writeln('>')
    ..writeln('> **مولَّد** من [`review-queue.json`](review-queue.json) بـ')
    ..writeln('> `dart run tool/l10n/render_sorani_review_queue.dart` — لا يُحرَّر باليد.')
    ..writeln()
    ..writeln()
    ..writeln(
      '**المجموع:** ${keys.length} · عالي ${countRisk('HIGH')} · '
      'متوسّط ${countRisk('MEDIUM')} · منخفض ${countRisk('LOW')}',
    )
    ..writeln()
    ..writeln()
    ..writeln('## نتيجة المراجعة الآلية')
    ..writeln()
    ..writeln('| النتيجة | العدد | المعنى |')
    ..writeln('|---|---:|---|');
  for (final ai in _aiOrder) {
    out.writeln('| $ai | ${countAi(ai)} | ${_aiMeaning[ai]} |');
  }
  out
    ..writeln()
    ..writeln('## الطابور')
    ..writeln()
    ..writeln(
      '| # | المفتاح | خطورة | آلي | العربية | الكردية الحالية | اقتراح | السبب | '
      'السياق | متغيّرات | ناطق | قرار بشري |',
    )
    ..writeln('|---:|---|---|---|---|---|---|---|---|---|---|---|');

  var n = 0;
  for (final key in sorted) {
    final e = entry(key);
    n += 1;
    final reason = (e['ai_explanation'] as String?)?.trim().isNotEmpty == true
        ? e['ai_explanation']
        : e['notes'];
    final placeholders = (e['placeholders'] as List? ?? const []).join(', ');
    out.writeln(
      '| $n | `$key` | ${e['risk']} | **${e['ai_pre_review']}** | ${_cell(e['ar'])} | '
      '${_cell(e['ckb'])} | ${_cell(e['proposed_ckb'])} | ${_cell(reason)} | '
      '${_cell(e['context'])} | ${_cell(placeholders)} | **${e['native_review']}** | '
      '${e['human_decision'] ?? 'PENDING'} |',
    );
  }
  return out.toString();
}

void main(List<String> args) {
  final queue = jsonDecode(File(_queuePath).readAsStringSync()) as Map<String, dynamic>;
  final rendered = render(queue);
  final output = File(_outputPath);
  if (args.contains('--check')) {
    if (!output.existsSync() || output.readAsStringSync() != rendered) {
      stderr.writeln('$_outputPath قديم — شغّل: dart run tool/l10n/render_sorani_review_queue.dart');
      exitCode = 1;
      return;
    }
    stdout.writeln('$_outputPath مطابق للمصدر (${queue.length} مفتاحاً).');
    return;
  }
  output.writeAsStringSync(rendered);
  stdout.writeln('كُتب $_outputPath — ${queue.length} مفتاحاً.');
}
