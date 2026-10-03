// حارس: كل مُمرِّرٍ رأسيّ ينتهي فوق ما يغطّي أسفل الشاشة.
//
// [CRITICAL] العطب لم يكن في شاشة: كان نمطاً. كل مُمرِّر كتب حشوته السفلية
// رقماً (١٠٤ تحت الشريط العائم، ٢٦ في الشاشات المدفوعة) بدل ما يغطّي الشاشة
// فعلاً، فاختفى «تسجيل الخروج» تحت الشريط على الأجهزة ذات الأزرار الثلاثة.
// `bottom_inset_layout_test.dart` يقيس النتيجة على الشاشات الموجودة؛ هذا
// الحارس يمنع الشاشة **القادمة** من إعادة النمط.
//
// القاعدة: مُمرِّرٌ رأسيّ في `lib/` إمّا أن يبني حشوته بـ`context.scrollPadding`
// (أو يضيف `context.bottomOverlap` في آخر شرائحه)، وإمّا أن يكون ممّا يكفيه
// فلاتر وحده — `ListView`/`GridView` بلا حشوة صريحة تأخذ حشوة `MediaQuery`
// تلقائياً، والأفقيّ و`shrinkWrap` لا ينتهيان عند حافة الشاشة. وما سوى ذلك
// يُسجَّل هنا بسببه، والعدد لكل ملف **مضبوط**: مُمرِّرٌ جديد بحشوةٍ ثابتة
// يُسقط الاختبار حتى يُصلَح أو يُسجَّل سببه صراحةً.

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// ما يكفيه غيرُ المُمرِّر نفسه — بسببه. العدد هو عدد المُمرِّرات في الملف.
const _handledElsewhere = <String, (int, String)>{
  // داخل `SafeArea` كاملة: الإزاحة مستهلكة قبل المُمرِّر.
  'lib/features/app_update/presentation/screens/force_update_screen.dart': (
    1,
    'SafeArea',
  ),
  'lib/features/auth/presentation/screens/account_pending_screen.dart': (
    1,
    'SafeArea',
  ),
  'lib/features/checkout/presentation/widgets/order_success_view.dart': (
    1,
    'SafeArea',
  ),
  'lib/features/favorites/presentation/screens/favorites_screen.dart': (
    1,
    'SafeArea',
  ),
  'lib/features/reviews/presentation/screens/review_submitted_screen.dart': (
    1,
    'SafeArea',
  ),
  'lib/features/search/presentation/screens/search_screen.dart': (
    2,
    'SafeArea',
  ),
  'lib/features/settings/presentation/screens/personalize_screen.dart': (
    1,
    'SafeArea، وزرّ المتابعة تحت القائمة',
  ),
  // فوق شريطٍ مثبّت في العمود نفسه: `SafeArea` الشريط تحمل الإزاحة.
  'lib/features/product_detail/presentation/screens/product_detail_screen.dart':
      (1, 'فوق شريط «أضف إلى السلة»'),
  'lib/features/checkout/presentation/screens/order_data_screen.dart': (
    1,
    'فوق شريط «مراجعة الطلب»',
  ),
  'lib/features/checkout/presentation/screens/order_review_screen.dart': (
    1,
    'فوق شريط التأكيد',
  ),
  // داخل `OtakuSheet`: `SafeArea` الورقة وحشوة لوحة المفاتيح.
  'lib/features/collections/presentation/widgets/add_to_collection_sheet.dart':
      (1, 'ورقة سفلية'),
  'lib/features/settings/presentation/screens/settings_screen.dart': (
    1,
    'ورقة تغيير كلمة المرور',
  ),
  // يلفّ `AnimeEmptyState` التي تحسب حشوتها بنفسها.
  'lib/features/categories/presentation/screens/category_products_screen.dart':
      (1, 'حالة فارغة تحشو نفسها'),
};

final _scroller = RegExp(
  r'\b(ListView(?:\.builder|\.separated|\.custom)?|'
  r'GridView(?:\.builder|\.count|\.extent|\.custom)?|'
  r'SingleChildScrollView|CustomScrollView)\(',
);

/// نصّ الوسائط بين قوسَي الاستدعاء المفتوح عند [open].
String _argsAt(String src, int open) {
  var depth = 1;
  var i = open;
  while (depth > 0) {
    final c = src[i];
    if (c == '(') depth++;
    if (c == ')') depth--;
    i++;
  }
  return src.substring(open, i - 1);
}

/// الوسائط المسمّاة في المستوى الأعلى فقط — لا `padding:` طفلٍ متداخل.
Map<String, String> _topLevelNamed(String args) {
  final starts = <(String, int)>[];
  var depth = 0;
  for (var i = 0; i < args.length; i++) {
    final c = args[i];
    if ('([{'.contains(c)) depth++;
    if (')]}'.contains(c)) depth--;
    if (depth != 0 || (i != 0 && args[i - 1] != ',')) continue;
    final m = RegExp(r'^\s*([A-Za-z_]\w*)\s*:').firstMatch(args.substring(i));
    if (m != null) starts.add((m.group(1)!, i + m.end));
  }
  return {
    for (var k = 0; k < starts.length; k++)
      starts[k].$1: args.substring(
        starts[k].$2,
        k + 1 < starts.length ? starts[k + 1].$2 : args.length,
      ),
  };
}

/// المُمرِّرات الرأسية في الملف التي لا تتجاوز ما يغطّي أسفل الشاشة بنفسها.
List<int> _unhandledLines(String source) {
  // التعليقات تحوي أقواساً ونقطتين (`(extendBody)`) تُربك التحليل.
  final src = source.replaceAll(
    RegExp(r'(^|\s)//[^\n]*', multiLine: true),
    ' ',
  );
  final lines = <int>[];
  for (final m in _scroller.allMatches(src)) {
    final args = _argsAt(src, m.end);
    final named = _topLevelNamed(args);
    if ((named['scrollDirection'] ?? '').contains('Axis.horizontal')) continue;
    if ((named['shrinkWrap'] ?? '').contains('true')) continue;
    if (args.contains('scrollPadding(') ||
        args.contains('bottomOverlap') ||
        args.contains('SliverSafeArea')) {
      continue;
    }
    final isBox =
        m.group(1)!.startsWith('ListView') ||
        m.group(1)!.startsWith('GridView');
    // بلا حشوة صريحة يحشو فلاتر `ListView`/`GridView` بحشوة `MediaQuery`.
    if (isBox && !named.containsKey('padding')) continue;
    lines.add('\n'.allMatches(src.substring(0, m.start)).length + 1);
  }
  return lines;
}

void main() {
  test('[CRITICAL] لا مُمرِّر رأسيّ بحشوة سفلية ثابتة إلا بسببٍ مسجَّل', () {
    final found = <String, List<int>>{};
    for (final file in Directory('lib').listSync(recursive: true)) {
      if (file is! File || !file.path.endsWith('.dart')) continue;
      if (file.path.endsWith('.gr.dart')) continue;
      final lines = _unhandledLines(file.readAsStringSync());
      if (lines.isNotEmpty) found[file.path] = lines;
    }

    final problems = <String>[];
    for (final MapEntry(key: path, value: lines) in found.entries) {
      final allowed = _handledElsewhere[path]?.$1 ?? 0;
      if (lines.length != allowed) {
        problems.add(
          '$path:${lines.join(',')} — ${lines.length} مُمرِّر بحشوة لا تتجاوز '
          'أسفل الشاشة (المسجَّل $allowed). ابنِ الحشوة بـ'
          '`context.scrollPadding(...)`، أو سجّل السبب في `_handledElsewhere`.',
        );
      }
    }
    for (final path in _handledElsewhere.keys) {
      if (!found.containsKey(path)) {
        problems.add('$path — مسجَّل ولم يعد فيه مُمرِّر كهذا؛ احذف السطر.');
      }
    }
    expect(problems, isEmpty, reason: problems.join('\n'));
  });

  test('الحارس نفسه يلتقط النمط القديم ويقبل الصحيح', () {
    // كما كان «الحساب» قبل الإصلاح: حشوة ١٠٤ ثابتة.
    expect(
      _unhandledLines('''
      ListView(
        padding: const EdgeInsets.only(bottom: 104),
        children: [Padding(padding: x, child: y)],
      )'''),
      [1],
    );
    expect(
      _unhandledLines('''
      ListView(
        // ما يغطّي أسفل الجسم (الشريط العائم): يصل من MediaQuery.
        padding: context.scrollPadding(const EdgeInsets.only(bottom: 12)),
        children: const [],
      )'''),
      isEmpty,
    );
    // `padding:` طفلٍ متداخل ليست حشوة المُمرِّر.
    expect(
      _unhandledLines('''
      ListView(children: [Padding(padding: const EdgeInsets.all(8))])'''),
      isEmpty,
    );
    expect(
      _unhandledLines('''
      SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.all(18),
      )'''),
      isEmpty,
    );
    // ذيل شرائحٍ بارتفاعٍ ثابت — عطب «الرئيسية» القديم (٤٠ تحت شريطٍ أطول).
    expect(
      _unhandledLines('''
      CustomScrollView(slivers: [
        SliverToBoxAdapter(child: SizedBox(height: 40)),
      ])'''),
      [1],
    );
  });
}
