// أدوات مشتركة للاختبارات البكسلية.
//
// [CRITICAL] تحميل خطوط المشروع ليس تفصيلاً: بلا `FontLoader` يرسم
// `flutter test` بخطٍّ بديل كل محارفه بعرضٍ واحد، فتُقاس النصوص العربية
// بعرضٍ لا علاقة له بالواقع. الفرق مقيس: تجاوزُ بطاقة العروض ظهر ٤٤ بكسلاً
// بالخط البديل و٣ بكسل بالخط الحقيقي — والثاني وحده هو العطب الحقيقي.

import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter/services.dart' show FontLoader;
import 'package:flutter_test/flutter_test.dart';

/// يحمّل Tajawal وCairo من `fonts/` داخل بيئة الاختبار.
Future<void> loadProjectFonts() async {
  for (final family in ['Tajawal', 'Cairo']) {
    final loader = FontLoader(family);
    for (final file in Directory('fonts').listSync().whereType<File>()) {
      if (!file.path.contains(family)) continue;
      loader.addFont(
        file.readAsBytes().then(
          (bytes) => ByteData.view(Uint8List.fromList(bytes).buffer),
        ),
      );
    }
    await loader.load();
  }
}

/// لقطة بكسلية لشجرة تحت [key].
class Snapshot {
  const Snapshot(this._data, this.width, this.height);

  final ByteData _data;
  final int width;
  final int height;

  /// لون البكسل بصيغة RGBA معبّأة.
  int at(int x, int y) => _data.getUint32((y * width + x) * 4);

  /// كل الألوان المتمايزة في مستطيل — بخطوة عيّنة.
  Set<int> distinctIn(
    int left,
    int top,
    int right,
    int bottom, {
    int step = 1,
  }) {
    final seen = <int>{};
    for (var y = top; y < bottom; y += step) {
      for (var x = left; x < right; x += step) {
        seen.add(at(x, y));
      }
    }
    return seen;
  }
}

Future<Snapshot> snapshot(WidgetTester tester, GlobalKey key) async {
  final boundary = key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
  late ByteData data;
  late int width;
  late int height;
  await tester.runAsync(() async {
    final image = await boundary.toImage();
    width = image.width;
    height = image.height;
    data = (await image.toByteData(format: ui.ImageByteFormat.rawRgba))!;
  });
  return Snapshot(data, width, height);
}

/// يحفظ اللقطة صورةً للفحص اليدوي عند التشخيص.
Future<void> savePng(
  WidgetTester tester,
  GlobalKey key,
  String path,
) async {
  final boundary = key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
  await tester.runAsync(() async {
    final image = await boundary.toImage();
    final png = await image.toByteData(format: ui.ImageByteFormat.png);
    File(path).writeAsBytesSync(png!.buffer.asUint8List());
  });
}
