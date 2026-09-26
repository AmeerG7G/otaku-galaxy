// رسوم الشخصيات المُدارة تُعرض كصورتها — لا شفافية عليها في أي شاشة.
//
// [PRODUCT] قرار 2026-09-15. كان مرجع التصميم يرسم رسماً مضمَّناً باهتاً
// (١٣–٢٢٪) خلف الترويسات وبعض اللوحات، وطُبّق الخفوت نفسه على الفتحات التي
// يرفع المسؤول صورَها — فبدت الشخصية المختارة شبه شفّافة كأنها معطوبة. الهالات
// والظلال حول الرسم تبقى؛ ما زال هو الخفوت الواقع على الشخصية نفسها.

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/features/visuals/domain/visual_slot.dart';
import 'package:otaku_galaxy/features/visuals/presentation/managed_artwork.dart';

/// هل يقع أي `ManagedArtwork` تحت مُخفٍّ (شفافية، مرشِّح لوني، قناع)؟
List<String> _fadedArtworks(WidgetTester tester) {
  final faded = <String>[];
  for (final element in find.byType(ManagedArtwork).evaluate()) {
    final artwork = element.widget as ManagedArtwork;
    Widget? offender;
    element.visitAncestorElements((ancestor) {
      final w = ancestor.widget;
      if ((w is Opacity && w.opacity < 1) || w is ColorFiltered || w is ShaderMask) {
        offender = w;
        return false;
      }
      return true;
    });
    if (offender != null) faded.add('${artwork.slot} ← ${offender.runtimeType}');
  }
  return faded;
}

Widget _host(Widget child, {required bool dark}) => MaterialApp(
  theme: AppTheme.light,
  darkTheme: AppTheme.dark,
  themeMode: dark ? ThemeMode.dark : ThemeMode.light,
  home: Directionality(
    textDirection: TextDirection.rtl,
    child: Scaffold(body: SizedBox(width: 390, height: 700, child: child)),
  ),
);

void main() {
  for (final dark in [false, true]) {
    final mode = dark ? 'داكن' : 'فاتح';

    testWidgets('[CRITICAL] ترويسة الشاشة — الرسم بلا شفافية ($mode)', (tester) async {
      await tester.pumpWidget(
        _host(
          dark: dark,
          OtakuScreenHeader(
            title: 'الطلبات',
            artwork: 'assets/art/opt/a-i4.png',
            artworkSlot: VisualSlots.ordersHeader,
          ),
        ),
      );
      expect(find.byType(ManagedArtwork), findsOneWidget);
      expect(_fadedArtworks(tester), isEmpty);
    });

    testWidgets('اللوحة التحريرية والحالة الفارغة ودعوة الزائر — بلا شفافية ($mode)', (tester) async {
      await tester.pumpWidget(
        _host(
          dark: dark,
          ListView(
            children: const [
              OtakuEditorialPanel(
                title: 'عنوان',
                body: 'نصّ',
                artwork: 'assets/art/opt/a-i5.png',
                artworkSlot: VisualSlots.points,
              ),
              SizedBox(
                height: 300,
                child: AnimeEmptyState(
                  title: 'فارغ',
                  artwork: 'assets/art/opt/a-i2.png',
                  artworkSlot: VisualSlots.emptyCart,
                  centered: true,
                ),
              ),
              SizedBox(
                height: 300,
                child: AnimeEmptyState(
                  title: 'فارغ جانبي',
                  artwork: 'assets/art/opt/a-i1.png',
                  artworkSlot: VisualSlots.emptySearch,
                ),
              ),
            ],
          ),
        ),
      );
      expect(find.byType(ManagedArtwork), findsNWidgets(3));
      expect(_fadedArtworks(tester), isEmpty);
    });
  }

  test('[TRIPWIRE] لا `Opacity` ولا `opacity:` حول أي ManagedArtwork في lib/', () {
    final offenders = <String>[];
    for (final file in Directory('lib').listSync(recursive: true)) {
      if (file is! File || !file.path.endsWith('.dart')) continue;
      final lines = file.readAsLinesSync();
      for (var i = 0; i < lines.length; i++) {
        if (!lines[i].contains('ManagedArtwork(')) continue;
        final start = (i - 6).clamp(0, lines.length);
        final end = (i + 8).clamp(0, lines.length);
        final window = lines.sublist(start, end).where((l) => !l.trimLeft().startsWith('//')).join('\n');
        if (RegExp(r'\bOpacity\(|\bopacity:\s*0?\.\d|\bColorFiltered\(|\bShaderMask\(').hasMatch(window)) {
          offenders.add('${file.path}:${i + 1}');
        }
      }
    }
    expect(offenders, isEmpty, reason: 'رسمٌ مُدار تحت شفافية:\n${offenders.join('\n')}');
    // والمكوّن نفسه لا يعرض معاملاً للشفافية.
    final source = File('lib/features/visuals/presentation/managed_artwork.dart').readAsStringSync();
    expect(source.contains('this.opacity'), isFalse);
  });
}
