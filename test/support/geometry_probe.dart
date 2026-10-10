// مقارنة هندسة الشاشة بين لغتين: كل ما ليس نصّاً يجب أن يبقى في مكانه.
//
// [CRITICAL] الفكرة: تُبنى الشاشة الحقيقية نفسها مرّتين — عربيةً ثم كردية —
// بالمقاس نفسه وتكبير الخط نفسه، ثم تُقارن مستطيلات كل عنصرٍ غير نصّي
// (صورة، رسم شخصية، شعار، أيقونة، صندوق مزخرف، زرّ، فاصل، حقل). الشجرتان
// متطابقتان بنيوياً (النصّ وحده يختلف)، فيُقرن العنصر بنظيره بمساره في شجرة
// العناصر: نوع كل سلف وترتيبه بين إخوته من النوع نفسه.
//
// التصنيف:
// - **text-region**: صندوقٌ/زرٌّ يلتفّ على نصّه (كبسولة، شريحة، زرّ بعرض
//   تسميته) تغيّر عرضُه وحده وارتفاعُه ثابت — مسموحٌ بالعقد: النصّ الأطول
//   يأخذ مكاناً أعرض داخل منطقته. ما بداخله يتبعه (النقطة في الكبسولة،
//   أيقونة الزرّ).
// - **button-label**: عنصرٌ داخل زرٍّ لم يتغيّر مستطيله، تحرّك أفقياً وحده —
//   محتوى تسمية الزرّ نفسه (أيقونةٌ بجوار نصٍّ موسَّط فيه).
// - **text-flow**: عنصرٌ تحرّك أفقياً وحده بمقدار ما اتّسعت مناطق النصّ
//   الشقيقة له تماماً (±التسامح) — شريحةٌ تلي شريحةً أطول تسميةً في الصفّ.
// - **bug**: كل ما عدا ذلك — عنصرٌ تحرّك أو تغيّر حجمه لأن نصّاً خارجه طال.
//
// القياس يقع على ما يُرسم فعلاً: عناصر التبويبات المخفية في `IndexedStack`
// وما تحت `Offstage` لا تُعدّ.

import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';

/// مستطيل عنصرٍ غير نصّي، ونوعه، ومساره.
class GeoNode {
  GeoNode(this.kind, this.rect, this.label, {required this.hasText});

  final String kind;
  final Rect rect;
  final String label;

  /// في شجرته نصٌّ (ليس أيقونة) — شرطٌ ليكون «منطقة نصّ».
  final bool hasText;
}

String? _kindOf(Widget w) {
  final type = w.runtimeType.toString();
  if (w is Icon) return 'icon';
  if (w is Image) return 'image';
  if (type == 'CharacterArtwork') return 'art';
  if (type.startsWith('OtakuStoreLogo')) return 'logo';
  if (w is Divider || w is VerticalDivider) return 'divider';
  if (w is DecoratedBox) return 'box';
  if (w is ButtonStyleButton || w is IconButton || w is FloatingActionButton) {
    return 'button';
  }
  if (w is EditableText) return 'input';
  if (w is Switch || w is Checkbox || w is Radio) return 'control';
  return null;
}

/// هل يُرسم [ro] فعلاً؟ (لا تبويب مخفيّ ولا Offstage).
bool _painted(RenderObject ro) {
  RenderObject child = ro;
  var parent = ro.parent;
  while (parent != null) {
    if (parent is RenderIndexedStack) {
      var index = 0;
      RenderBox? sibling = parent.firstChild;
      while (sibling != null && sibling != child) {
        index++;
        sibling = (sibling.parentData! as StackParentData).nextSibling;
      }
      if (index != parent.index) return false;
    }
    if (parent is RenderOffstage && parent.offstage) return false;
    child = parent;
    parent = parent.parent;
  }
  return true;
}

bool _containsText(Element element) {
  var found = false;
  void visit(Element e) {
    if (found) return;
    final w = e.widget;
    if (w is Icon) return;
    if (w is RichText || w is EditableText) {
      found = true;
      return;
    }
    e.visitChildren(visit);
  }

  visit(element);
  return found;
}

/// كل العناصر غير النصّية المرسومة داخل الإطار [view]، مفهرسةً بمسارها.
Map<String, GeoNode> collectGeometry(WidgetTester tester, {required Size view}) {
  final out = <String, GeoNode>{};
  void visit(Element element, String path) {
    final counts = <String, int>{};
    element.visitChildren((child) {
      final type = child.widget.runtimeType.toString();
      final n = counts[type] = (counts[type] ?? -1) + 1;
      final childPath = '$path/$type#$n';
      final kind = _kindOf(child.widget);
      if (kind != null) {
        final ro = child.renderObject;
        if (ro is RenderBox && ro.attached && ro.hasSize && _painted(ro)) {
          final rect = MatrixUtils.transformRect(
            ro.getTransformTo(null),
            Offset.zero & ro.size,
          );
          if (rect.bottom > 0 && rect.top < view.height && rect.width > 0) {
            final w = child.widget;
            var label = '';
            if (w is Icon) label = w.icon?.codePoint.toRadixString(16) ?? '';
            if (kind == 'art') label = '${(w as dynamic).slot}';
            out[childPath] = GeoNode(
              kind,
              rect,
              label,
              hasText: kind == 'box' || kind == 'button'
                  ? _containsText(child)
                  : false,
            );
          }
        }
      }
      visit(child, childPath);
    });
  }

  visit(tester.binding.rootElement!, '');
  return out;
}

/// فرقٌ واحد بين اللغتين.
class GeoDiff {
  GeoDiff(this.path, this.a, this.b, this.category);

  final String path;
  final GeoNode a;
  final GeoNode b;

  /// `text-region` أو `button-label` أو `text-flow` أو `bug`.
  final String category;

  double get dTop => b.rect.top - a.rect.top;
  double get dLeft => b.rect.left - a.rect.left;
  double get dWidth => b.rect.width - a.rect.width;
  double get dHeight => b.rect.height - a.rect.height;

  @override
  String toString() {
    String f(double v) => v.toStringAsFixed(1).padLeft(6);
    return '${category.padRight(11)} ${a.kind.padRight(7)} ${a.label.padRight(12)} '
        'dTop=${f(dTop)} dLeft=${f(dLeft)} dW=${f(dWidth)} dH=${f(dHeight)} '
        'at ${a.rect.top.toStringAsFixed(0)},${a.rect.left.toStringAsFixed(0)} '
        '${a.rect.width.toStringAsFixed(0)}×${a.rect.height.toStringAsFixed(0)}  '
        '${shortPath(path)}';
  }
}

/// نتيجة مقارنة شاشة.
class GeoComparison {
  GeoComparison(this.diffs, {required this.unmatched});

  final List<GeoDiff> diffs;

  /// عناصر في لغةٍ دون الأخرى (بنية الشجرة اختلفت).
  final int unmatched;

  Iterable<GeoDiff> get bugs => diffs.where((d) => d.category == 'bug');
  Iterable<GeoDiff> get textRegions =>
      diffs.where((d) => d.category == 'text-region');
  Iterable<GeoDiff> get buttonLabels =>
      diffs.where((d) => d.category == 'button-label');
  Iterable<GeoDiff> get textFlows =>
      diffs.where((d) => d.category == 'text-flow');
}

/// يقارن [ar] بـ[ckb] ويصنّف كل فرقٍ أكبر من [tolerance].
GeoComparison compareGeometry(
  Map<String, GeoNode> ar,
  Map<String, GeoNode> ckb, {
  double tolerance = 1.0,
}) {
  bool changed(GeoNode a, GeoNode b) =>
      (b.rect.top - a.rect.top).abs() > tolerance ||
      (b.rect.left - a.rect.left).abs() > tolerance ||
      (b.rect.width - a.rect.width).abs() > tolerance ||
      (b.rect.height - a.rect.height).abs() > tolerance;

  // مناطق النصّ: صندوقٌ/زرٌّ فيه نصّ، تغيّر عرضه وحده.
  final regions = <String>{};
  for (final entry in ar.entries) {
    final a = entry.value;
    final b = ckb[entry.key];
    if (b == null || !a.hasText) continue;
    if ((b.rect.height - a.rect.height).abs() > tolerance) continue;
    if ((b.rect.top - a.rect.top).abs() > tolerance) continue;
    if ((b.rect.width - a.rect.width).abs() > tolerance) regions.add(entry.key);
  }

  // أزرارٌ لم يتغيّر مستطيلها: ما يتحرّك داخلها أفقياً محتوى تسميتها.
  final steadyButtons = <String>[
    for (final entry in ar.entries)
      if (entry.value.kind == 'button' &&
          ckb[entry.key] != null &&
          !changed(entry.value, ckb[entry.key]!))
        entry.key,
  ];

  bool near(double v, double target) => (v - target).abs() <= tolerance;

  // انزياحٌ أفقي بحت = مجموع اتّساع مناطق النصّ الشقيقة (أكبرها في كل شقيق).
  bool isTextFlow(String path, double dLeft) {
    final segments = path.split('/');
    for (var i = segments.length - 1; i > 0; i--) {
      final parent = segments.sublist(0, i).join('/');
      final own = segments[i];
      final perSibling = <String, double>{};
      for (final r in regions) {
        if (!r.startsWith('$parent/')) continue;
        final sibling = r.substring(parent.length + 1).split('/').first;
        if (sibling == own) continue;
        final dw = (ckb[r]!.rect.width - ar[r]!.rect.width).abs();
        perSibling[sibling] = math.max(perSibling[sibling] ?? 0, dw);
      }
      final total = perSibling.values.fold<double>(0, (a, b) => a + b);
      if (total > tolerance && near(dLeft.abs(), total)) return true;
    }
    return false;
  }

  final diffs = <GeoDiff>[];
  var unmatched = 0;
  for (final entry in ar.entries) {
    final a = entry.value;
    final b = ckb[entry.key];
    if (b == null) {
      unmatched++;
      continue;
    }
    if (!changed(a, b)) continue;
    final insideRegion = regions.any(
      (r) => entry.key == r || entry.key.startsWith('$r/'),
    );
    final dLeft = b.rect.left - a.rect.left;
    final horizontalOnly =
        near(b.rect.top, a.rect.top) &&
        near(b.rect.width, a.rect.width) &&
        near(b.rect.height, a.rect.height);
    final category = insideRegion
        ? 'text-region'
        : horizontalOnly &&
              steadyButtons.any((btn) => entry.key.startsWith('$btn/'))
        ? 'button-label'
        : horizontalOnly && isTextFlow(entry.key, dLeft)
        ? 'text-flow'
        : 'bug';
    diffs.add(GeoDiff(entry.key, a, b, category));
  }
  unmatched += ckb.keys.where((k) => !ar.containsKey(k)).length;
  return GeoComparison(diffs, unmatched: unmatched);
}

/// آخر أجزاء المسار ذات المعنى — للتقارير.
String shortPath(String path) {
  final noise = RegExp(
    r'^(Semantics|MergeSemantics|ExcludeSemantics|Padding|Align|Center|'
    r'SizedBox|ConstrainedBox|Expanded|Flexible|Builder|KeyedSubtree|'
    r'RepaintBoundary|Listener|MouseRegion|GestureDetector|RawGestureDetector|'
    r'DefaultTextStyle|IconTheme|AnimatedDefaultTextStyle|IgnorePointer|'
    r'AbsorbPointer|Material|InkWell|InkResponse|Actions|Focus|Shortcuts|'
    r'Container|DecoratedBox|LimitedBox|Stack|Positioned|PositionedDirectional|'
    r'Row|Column|Flex|NotificationListener.*|ClipRRect|ClipRect|ClipPath|'
    r'ColoredBox|Opacity|Transform|FadeTransition|IntrinsicHeight|'
    r'LayoutBuilder|Visibility|TickerMode|Offstage|Directionality|MediaQuery|'
    r'Theme|AnimatedTheme|Bloc.*|Provider.*|ValueListenableBuilder.*|'
    r'StreamBuilder.*|FutureBuilder.*|AnimatedBuilder|ListenableBuilder|'
    r'SafeArea|Scrollable|Viewport|Sliver.*|CustomScrollView|'
    r'SingleChildScrollView|ListView|GridView|Wrap|StretchEffect|'
    r'StretchingOverscrollIndicator|DefaultSelectionStyle|IndexedSemantics|'
    r'KeepAlive|AutomaticKeepAlive|PhysicalModel|PhysicalShape|CustomPaint|'
    r'AnimatedPhysicalModel|InheritedCupertinoTheme|LayoutId|'
    r'CustomMultiChildLayout|ExcludeFocus|IndexedStack)#',
  );
  final keep = path
      .split('/')
      .where((s) => s.isNotEmpty && !s.startsWith('_') && !noise.hasMatch(s))
      .toList();
  return keep.length <= 3 ? keep.join('/') : keep.sublist(keep.length - 3).join('/');
}

/// يلتقط أخطاء التخطيط (التجاوز خصوصاً) أثناء [body] بدل إسقاط الاختبار،
/// مع موضعها في `lib/`.
Future<List<String>> captureLayoutErrors(Future<void> Function() body) async {
  final errors = <String>[];
  final previous = FlutterError.onError;
  FlutterError.onError = (details) {
    final first = details.exceptionAsString().split('\n').first;
    final where = RegExp(r'lib/[^ :]+\.dart:\d+').firstMatch(details.toString());
    errors.add('$first @ ${where?.group(0) ?? '?'}');
  };
  try {
    await body();
  } finally {
    FlutterError.onError = previous;
  }
  return errors;
}

/// تجاوزٌ مختصر: «right @ lib/x.dart» — الجهة والملف، بلا المقدار ولا رقم
/// السطر: المقدار يتغيّر بلا معنى، ورقم السطر يتحرّك مع أي تعديلٍ فوقه.
String overflowKey(String error) {
  final m = RegExp(r'overflowed by ([\d.]+) pixels on the (\w+)\. @ ([^:\s]+)')
      .firstMatch(error);
  if (m == null) return error;
  return '${m.group(2)} @ ${m.group(3)}';
}
