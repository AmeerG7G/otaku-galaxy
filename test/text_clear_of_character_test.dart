// النصّ لا يقع على الشخصية — بطاقة البطل وترويستا «تقييم منتجات طلبك» و«طلباتي».
//
// [CRITICAL] (2026-10-12) عند ٣٢٠×٥٦٨ × ١٫٣ كان عنوان البطل («موسم جديد / من /
// عالم الأنمي») مرسوماً على ذراع الشخصية ووجهها، وعنوان «تقييم منتجات طلبك»
// على وجه شخصيته — بالعربية والكردية. وبالكردية وقع العنوانان على الشخصية حتى
// عند ٤١٢×٨٩٢ × ١٫٠. القرار (صاحب المنتج، 2026-10-12): لا تداخل بأي مقاس ولغة،
// وإن تغيّرت العربية عند ٤١٢ (ترويسة التقييم تحجز سطراً ثانياً، والشخصية
// تُصغَّر).
//
// العقد مستطيلات لا بكسلات: صندوق الرسم لا يتقاطع مع صندوق أيّ نصّ (ولا مع
// خلفية كبسولةٍ أو زرٍّ تلتفّ على نصّ). لا يعتمد على شكل الصورة، فيبقى صحيحاً
// حين يستبدل المالك الصورة.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/features/home/presentation/widgets/home_compositions.dart';
import 'package:otaku_galaxy/features/main_navigation/presentation/screens/main_navigation_screen.dart';
import 'package:otaku_galaxy/features/orders/domain/entities/order.dart';
import 'package:otaku_galaxy/features/orders/presentation/screens/orders_screen.dart';
import 'package:otaku_galaxy/features/reviews/presentation/screens/rate_order_screen.dart';
import 'package:otaku_galaxy/features/settings/presentation/cubit/locale_cubit.dart';
import 'package:otaku_galaxy/features/visuals/presentation/character_artwork.dart';

import 'support/render_harness.dart';
import 'support/screen_fixtures.dart';

Rect _rectOf(Element e) {
  final box = e.renderObject! as RenderBox;
  return box.localToGlobal(Offset.zero) & box.size;
}

/// كل نصٍّ في [root]، وخلفية كل كبسولةٍ أو زرٍّ مستدير تلتفّ على نصّ.
Map<String, Rect> _textRects(Finder root) {
  final rects = <String, Rect>{};
  for (final e
      in find
          .descendant(of: root, matching: find.byType(RichText))
          .evaluate()) {
    final text = (e.widget as RichText).text.toPlainText();
    if (text.trim().isNotEmpty) rects['«$text»'] = _rectOf(e);
  }
  for (final e
      in find
          .descendant(
            of: root,
            matching: find.byWidgetPredicate(
              (w) =>
                  w is Container &&
                  w.decoration is BoxDecoration &&
                  (w.decoration! as BoxDecoration).borderRadius ==
                      BorderRadius.circular(AppDimens.radiusFull),
            ),
          )
          .evaluate()) {
    rects['pill ${_rectOf(e)}'] = _rectOf(e);
  }
  return rects;
}

/// النصوص التي يقع عليها الجزء الظاهر من صندوق الرسم.
List<String> _textsOnArt(WidgetTester tester, Finder root, {Finder? artBox}) {
  final clip = tester.getRect(root);
  final art = tester
      .getRect(
        artBox ??
            find.descendant(of: root, matching: find.byType(CharacterArtwork)),
      )
      .intersect(clip);
  return [
    for (final MapEntry(:key, :value) in _textRects(root).entries)
      if (value.intersect(art) case final hit
          when hit.width > 0.5 && hit.height > 0.5)
        '$key ∩ $art = $hit',
  ];
}

void main() {
  setUpAll(loadProjectFonts);

  for (final view in kGeoViews) {
    for (final language in AppLanguage.values) {
      testWidgets('بطاقة البطل — $view ${language.code}', (tester) async {
        useGeoView(tester, view);
        await pumpFixtureShell(
          tester,
          tab: MainTab.home,
          language: language,
          textScale: view.textScale,
        );
        // صندوق صورة البنر (لا شخصية بديلة منذ 2026-10-26): النصّ خارج
        // الصندوق كلّه، فخارج أيّ صورةٍ يرفعها المسؤول.
        final hero = find.byType(HomeHeroCard);
        final art = tester.getRect(find.byKey(HomeHeroCard.artBoxKey));
        expect(art.width, greaterThan(0), reason: 'صندوق الرسم بلا عرض');
        final card = find
            .descendant(of: hero, matching: find.byType(Stack))
            .first;
        expect(
          _textsOnArt(tester, card, artBox: find.byKey(HomeHeroCard.artBoxKey)),
          isEmpty,
        );
      });

      testWidgets('ترويسة تقييم الطلب — $view ${language.code}', (
        tester,
      ) async {
        useGeoView(tester, view);
        await pumpFixtureApp(
          tester,
          home: RateOrderScreen(order: fixtureOrder(OrderStatus.completed)),
          language: language,
          textScale: view.textScale,
        );
        final header = find.byType(OtakuScreenHeader);
        expect(_textsOnArt(tester, header), isEmpty);

        // القصّ (الصف 766 من 820) عند أسفل الترويسة أو تحته — والرسم تحت
        // شريط الحالة لا فوقه، حتى حين تطول الترويسة فينزل معها.
        final art = tester.getRect(
          find.descendant(of: header, matching: find.byType(CharacterArtwork)),
        );
        final bottom = tester.getRect(header).bottom;
        expect(
          art.top + art.height * RateOrderScreen.artCutAt,
          greaterThanOrEqualTo(bottom - 0.5),
          reason: 'قصّ الرسم ظاهرٌ فوق أسفل الترويسة ($bottom)',
        );
        expect(art.top, greaterThanOrEqualTo(kStatusBar - 0.01));
      });

      // [CRITICAL] (2026-10-13) الكردي «هەنگاو بە هەنگاو دۆخی داواکارییەکانت
      // بەدواداچوون بکە» كان يمتدّ تحت صندوق الشخصية 41 عند ×١٫٣ فيلامس قدميها
      // (٦–٢٦ بكسل حبراً).
      testWidgets('ترويسة طلباتي — $view ${language.code}', (tester) async {
        useGeoView(tester, view);
        await pumpFixtureApp(
          tester,
          home: const OrdersScreen(),
          language: language,
          textScale: view.textScale,
        );
        final header = find.byType(OtakuScreenHeader);
        final art = tester.getRect(
          find.descendant(of: header, matching: find.byType(CharacterArtwork)),
        );
        expect(art.height, greaterThan(0), reason: 'الرسم لم يُفكّ');
        expect(_textsOnArt(tester, header), isEmpty);
      });
    }
  }
}
