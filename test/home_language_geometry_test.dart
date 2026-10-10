// [CRITICAL] الرئيسية: تغيير اللغة لا يحرّك البطل ولا شخصيته ولا بطاقة
// التوصيل ولا الرسم 11 ونسخته العلوية ولا صفّ الترويسة (البوّابة ٥،
// 2026-10-10).
//
// قيس قبل الإصلاح (عند ×١٫٣): البطل +٣٩ وشخصيته ١٩٫٥، بطاقة التوصيل +٥٩
// والرسم 11 ٩٨ بكسل؛ وعلى ٣٢٠×١٫٣ الصفّ العلوي +٣٥ (الشعار والجرس ١٧٫٥)
// وتسمية البحث تتجاوز يميناً. `kurdish_geometry_test` لا يرى بطاقة التوصيل
// عند ×١٫٠ (تحت الطيّة)، فهنا إطاراتٌ بطول ٣٠٠٠ عند المقاسات الأربعة.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/features/home/presentation/widgets/home_compositions.dart';
import 'package:otaku_galaxy/features/main_navigation/presentation/screens/main_navigation_screen.dart';
import 'package:otaku_galaxy/features/settings/presentation/cubit/locale_cubit.dart';
import 'package:otaku_galaxy/features/visuals/domain/visual_slot.dart';
import 'package:otaku_galaxy/features/visuals/presentation/character_artwork.dart';

import 'support/geometry_probe.dart';
import 'support/render_harness.dart';
import 'support/screen_fixtures.dart';

/// المقاسات الأربعة المستهدفة، بطولٍ يُظهر بطاقة التوصيل.
const _views = [
  GeoView(Size(412, 3000), 1.0),
  GeoView(Size(412, 3000), 1.3),
  GeoView(Size(375, 3000), 1.0),
  GeoView(Size(320, 3000), 1.3),
];

Finder _art(String slot) => find.byWidgetPredicate(
  (w) => w is CharacterArtwork && w.slot == slot,
);

/// العناصر غير النصّية التي يجب ألّا تتحرّك.
final _anchors = <String, Finder Function()>{
  'logo': () => find.byType(OtakuStoreLogoSimple),
  'search-cta': () => find
      .ancestor(of: find.byIcon(AppIcons.search), matching: find.byType(InkWell))
      .first,
  'search-icon': () => find.byIcon(AppIcons.search),
  'hero-card': () => find.byType(HomeHeroCard),
  'hero-character': () => _art(VisualSlots.homeHero),
  'delivery-strip': () => find.byType(DeliveryAssuranceStrip),
  'character-11': () => _art(VisualSlots.homeDelivery),
  'character-11-overlay': () => find.byKey(deliveryOverlayKey),
};

final _rects = <String, Map<String, Rect>>{};

void main() {
  setUpAll(loadProjectFonts);

  // بناءٌ واحد لكل لغة×مقاس (الحاضنة تسجّل خدماتها مرّةً لكل اختبار)، ثم مقارنة.
  for (final view in _views) {
    for (final language in AppLanguage.values) {
      testWidgets('$view ${language.code}', (tester) async {
        useGeoView(tester, view);
        final errors = await captureLayoutErrors(
          () => pumpFixtureShell(
            tester,
            tab: MainTab.home,
            language: language,
            textScale: view.textScale,
          ),
        );
        // تجاوز بطاقة المنتج (`anime_product_card.dart`) قائمٌ باللغتين —
        // البوّابة ٩. ما عداه في الرئيسية: لا تجاوز ولا بلاغ `BoundedText`.
        final relevant = errors
            .where((e) => !e.contains('anime_product_card.dart'))
            .toList();
        expect(relevant, isEmpty, reason: '${language.code}: $relevant');
        _rects['$view ${language.code}'] = {
          for (final e in _anchors.entries)
            e.key: tester.getRect(e.value().first),
        };
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump(const Duration(seconds: 2));
      });
    }
  }

  test('[CRITICAL] لا شيء غير نصّي يتحرّك بين العربية والكردية (≤١ بكسل)', () {
    final failures = <String>[];
    for (final view in _views) {
      final ar = _rects['$view ar'];
      final ckb = _rects['$view ckb'];
      if (ar == null || ckb == null) {
        failures.add('$view: لم تُبنَ');
        continue;
      }
      for (final name in _anchors.keys) {
        final a = ar[name]!, b = ckb[name]!;
        for (final (edge, x, y) in [
          ('top', a.top, b.top),
          ('left', a.left, b.left),
          ('width', a.width, b.width),
          ('height', a.height, b.height),
        ]) {
          if ((x - y).abs() > 1.0) {
            failures.add('$view $name.$edge: ar ${x.toStringAsFixed(1)} · ckb ${y.toStringAsFixed(1)}');
          }
        }
      }
    }
    expect(failures, isEmpty, reason: failures.join('\n'));
  });
}
