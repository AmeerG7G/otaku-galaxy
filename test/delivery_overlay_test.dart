// طبقة النسخة العلوية لبطاقة التوصيل (الصورة 11): نسخةٌ مشتقّة من `11.png`
// نصفها السفليّ شفّاف، تُرسم فوق كل شيء بالموضع والمقاس نفسيهما.
// `11.png` للقراءة فقط — هذا الاختبار لا يكتب فيه ولا يثبّت بصمته (المالك يستبدله).

import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/core/l10n/locale_scope.dart';
import 'package:otaku_galaxy/features/settings/presentation/cubit/locale_cubit.dart';
import 'package:otaku_galaxy/features/home/presentation/widgets/home_compositions.dart';
import 'package:otaku_galaxy/features/visuals/domain/visual_slot.dart';
import 'package:otaku_galaxy/features/visuals/presentation/character_artwork.dart';

const _eraseFromRow = 232;

Future<({int w, int h, ByteData rgba})> _decodeFile(String path) async {
  final codec = await ui.instantiateImageCodec(File(path).readAsBytesSync());
  final image = (await codec.getNextFrame()).image;
  final data = (await image.toByteData(format: ui.ImageByteFormat.rawRgba))!;
  final r = (w: image.width, h: image.height, rgba: data);
  image.dispose();
  codec.dispose();
  return r;
}

Widget _app() => MaterialApp(
  theme: AppTheme.light,
  locale: const Locale('ar'),
  builder: (context, child) => LocaleScope(language: AppLanguage.arabic, child: child!),
  home: const Scaffold(body: SingleChildScrollView(child: DeliveryAssuranceStrip())),
);

void main() {
  test('asset: same size as 11.png, top half identical, ONLY the bottom half transparent', () async {
    late ({int w, int h, ByteData rgba}) orig, over;
    await TestWidgetsFlutterBinding.ensureInitialized().runAsync(() async {
      orig = await _decodeFile(CharacterArt.forSlot(VisualSlots.homeDelivery)!);
      over = await _decodeFile(CharacterArt.homeDeliveryOverlay);
    });
    expect((over.w, over.h), (orig.w, orig.h));
    expect(over.h, greaterThan(_eraseFromRow));

    var topDiff = 0;
    var bottomOpaque = 0;
    for (var y = 0; y < over.h; y++) {
      for (var x = 0; x < over.w; x++) {
        final i = (y * over.w + x) * 4;
        if (y < _eraseFromRow) {
          for (var c = 0; c < 4; c++) {
            if (orig.rgba.getUint8(i + c) != over.rgba.getUint8(i + c)) topDiff++;
          }
        } else if (over.rgba.getUint8(i + 3) != 0) {
          bottomOpaque++;
        }
      }
    }
    expect(topDiff, 0,
        reason: '11.png changed since the overlay was made — run '
            '`python3 tool/art/make_overlay_11.py`');
    expect(bottomOpaque, 0, reason: 'the erased band must be fully transparent');
  });

  testWidgets('overlay sits exactly on the original artwork (same rect) and is the last, unclipped layer', (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(_app());

    final original = find.byWidgetPredicate((w) => w is CharacterArtwork && w.slot == VisualSlots.homeDelivery);
    final overlay = find.byKey(deliveryOverlayKey);
    expect(original, findsOneWidget);
    expect(overlay, findsOneWidget);

    // Same geometry, to the pixel.
    final a = tester.getRect(original);
    final b = tester.getRect(overlay);
    expect(b.left, closeTo(a.left, 0.001));
    expect(b.top, closeTo(a.top, 0.001));
    expect(b.size, a.size);

    // Layer order: the overlay is the LAST child of the strip's outermost Stack,
    // so it paints after the card, its border and the original.
    final strip = find.byType(DeliveryAssuranceStrip);
    final outer = tester.widget<Stack>(find.descendant(of: strip, matching: find.byType(Stack)).first);
    final last = outer.children.last;
    expect(last, isA<PositionedDirectional>());
    expect(find.descendant(of: find.byWidget(last), matching: overlay), findsOneWidget);
    expect(find.descendant(of: find.byWidget(last), matching: original), findsNothing);
    expect(
      find.descendant(of: find.byType(Container), matching: overlay),
      findsNothing,
      reason: 'the overlay must not live inside the card (its clip and border would sit above it)',
    );

    // Not clipped by anything inside the strip.
    for (final clip in [find.byType(ClipPath), find.byType(ClipRect), find.byType(ClipRRect)]) {
      expect(find.descendant(of: find.descendant(of: strip, matching: clip), matching: overlay), findsNothing);
    }
  });

  testWidgets('original artwork keeps its own geometry (still inside the clipped card)', (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(_app());

    final original = find.byWidgetPredicate((w) => w is CharacterArtwork && w.slot == VisualSlots.homeDelivery);
    expect(tester.widget<CharacterArtwork>(original).height, 220);
    expect(find.descendant(of: find.byType(Container), matching: original), findsOneWidget);
  });
}
