// رسم البنر الرئيسي داخل بطاقته — لا يخرج من اليسار ولا من الأسفل ولا يُقصّ.
//
// [CRITICAL] كان الرسم `PositionedDirectional(bottom: -12, end: -34)` بلا عرضٍ
// أقصى. في RTL «end» هو اليسار، فكانت ٣٤ بكسل من الشخصية خارج يسار البطاقة
// و١٢ تحت أسفلها، يقصّها `clipBehavior` فلا تُرى أبداً. الطلب: أقلّ يميناً
// وأعلى، والصورة كاملةً داخل البطاقة على كل مقاس.
//
// الحدّ: الرسم في صندوقٍ داخل البطاقة بإزاحة r·(1 − 1/√2) من كل جهة — أصغر
// إزاحةٍ متساوية تُبقي زاوية الصورة داخل انحناء زاوية البطاقة (r = ٣٨).

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/core/l10n/locale_scope.dart';
import 'package:otaku_galaxy/features/home/presentation/widgets/home_compositions.dart';
import 'package:otaku_galaxy/features/products/domain/entities/banner.dart' as model;
import 'package:otaku_galaxy/features/settings/presentation/cubit/locale_cubit.dart';
import 'package:otaku_galaxy/features/visuals/domain/visual_slot.dart';
import 'package:otaku_galaxy/features/visuals/presentation/character_artwork.dart';

import 'support/render_harness.dart';

const _phones = <String, Size>{
  'هاتف صغير': Size(320, 640),
  'هاتف ٣٦٠': Size(360, 780),
  'هاتف ٣٩٣': Size(393, 852),
  'هاتف': Size(412, 892),
  'هاتف كبير': Size(430, 932),
  'لوح': Size(834, 1112),
};

/// البنر الرئيسي في قاعدة التطوير — عنوانه وبلا عنوانٍ فرعي.
const _devHero = model.Banner(
  id: 'hero',
  titleAr: 'اكتشف، اجمع، واستمتع!',
  placement: 'hero',
);

final double _inset = AppDimens.radiusXl * (1 - 0.7071067811865476);

Future<void> _pump(
  WidgetTester tester, {
  required Size size,
  model.Banner? banner,
  double textScale = 1.0,
  AppLanguage language = AppLanguage.arabic,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.light,
      home: MediaQuery(
        data: MediaQueryData(
          size: size,
          textScaler: TextScaler.linear(textScale),
        ),
        child: LocaleScope(
          language: language,
          child: Directionality(
            textDirection: TextDirection.rtl,
            child: Scaffold(
              body: ListView(
                children: [HomeHeroCard(onShop: () {}, banner: banner)],
              ),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.runAsync(() async {
    await precacheImage(
      AssetImage(CharacterArt.forSlot(VisualSlots.homeHero)!),
      tester.element(find.byType(Scaffold)),
    );
    await Future<void>.delayed(const Duration(milliseconds: 200));
  });
  await tester.pump();
}

Rect _card(WidgetTester tester) => tester.getRect(
  find
      .descendant(
        of: find.byType(HomeHeroCard),
        matching: find.byType(Container),
      )
      .first,
);

Rect _art(WidgetTester tester) => tester.getRect(
  find.descendant(
    of: find.byType(HomeHeroCard),
    matching: find.byType(CharacterArtwork),
  ),
);

void _expectInsideRoundedCard(Rect art, Rect card) {
  final rounded = RRect.fromRectAndRadius(
    card,
    const Radius.circular(AppDimens.radiusXl),
  ).inflate(0.5);
  for (final corner in [
    art.topLeft,
    art.topRight,
    art.bottomLeft,
    art.bottomRight,
  ]) {
    expect(
      rounded.contains(corner),
      isTrue,
      reason: 'زاوية الرسم $corner خارج البطاقة $card — تُقصّ',
    );
  }
}

void main() {
  setUpAll(loadProjectFonts);

  group('[CRITICAL] داخل البطاقة على كل مقاس', () {
    for (final language in AppLanguage.values) {
      for (final entry in _phones.entries) {
        for (final banner in [null, _devHero]) {
          final which = banner == null ? 'بلا بنر' : 'بنر التطوير';
          testWidgets('${language.name} — ${entry.key} — $which', (
            tester,
          ) async {
            await _pump(
              tester,
              size: entry.value,
              banner: banner,
              language: language,
            );
            final card = _card(tester);
            final art = _art(tester);
            expect(art.width, greaterThan(0), reason: 'الرسم لم يُفكّ');

            // لا يخرج من اليسار ولا من الأسفل — لا من البطاقة ولا من الشاشة.
            expect(art.left, greaterThanOrEqualTo(card.left));
            expect(art.bottom, lessThanOrEqualTo(card.bottom));
            expect(art.left, greaterThanOrEqualTo(0));
            expect(art.right, lessThanOrEqualTo(entry.value.width));
            // ولا يُقصّ في الزوايا المدوَّرة.
            _expectInsideRoundedCard(art, card);
            expect(tester.takeException(), isNull);
          });
        }
      }
    }
  });

  group('الموضع: جهة اليسار، وموسَّطٌ عمودياً (STEP 64 §17)', () {
    for (final entry in _phones.entries) {
      testWidgets(
        '${entry.key} — يسار البطاقة، والفراغ فوقه يساوي الفراغ تحته',
        (tester) async {
          await _pump(tester, size: entry.value, banner: _devHero);
          final card = _card(tester);
          final art = _art(tester);

          // أفقياً كما كان منذ 2026-09-28: داخل اليسار بإزاحة الزاوية.
          expect(art.left, closeTo(card.left + _inset, 0.5));
          // [STEP 64] عمودياً: موسَّط — كان مثبَّتاً في القاع فيبقى فوقه شريطٌ
          // فارغ يكبر مع ارتفاع البطاقة («الشخصية نازلة»).
          expect(art.top - card.top, closeTo(card.bottom - art.bottom, 0.5));
          // التكوين محفوظ: البطاقة تتّسع للرسم بارتفاعه الأصلي فلا يُصغَّر.
          expect(art.height, closeTo(168, 0.5));
        },
      );
    }

    for (final language in AppLanguage.values) {
      for (final scale in const [1.15, 1.3]) {
        testWidgets(
          '[regression] ${language.name} — خطّ ${scale}x: البطاقة أطول والرسم ما يزال في وسطها لا في قاعها',
          (tester) async {
            // مقيس قبل الإصلاح: بطاقة ٢١٠–٢٨٠ والرسم في القاع بفراغ ٣١–١٠١ فوقه.
            await _pump(
              tester,
              size: const Size(393, 852),
              banner: const model.Banner(
                id: 'hero',
                titleAr: 'اكتشف، اجمع، واستمتع!',
                titleCkb: 'بدۆزەرەوە، کۆبکەرەوە و چێژ وەربگرە!',
                placement: 'hero',
              ),
              textScale: scale,
              language: language,
            );
            final card = _card(tester);
            final art = _art(tester);
            expect(card.height, greaterThan(200));
            final top = art.top - card.top;
            final bottom = card.bottom - art.bottom;
            expect(
              top,
              closeTo(bottom, 0.5),
              reason: 'فوقه $top وتحته $bottom',
            );
            _expectInsideRoundedCard(art, card);
          },
        );
      }
    }
  });

  group('الحدود تحمي حتى حين لا يتّسع المكان', () {
    testWidgets('بطاقة أقصر من الرسم — يُصغَّر ولا يُقصّ', (tester) async {
      // عنوانٌ من سطرٍ واحد على لوحٍ عريض: البطاقة عند حدّها الأدنى (١٧٤)،
      // والرسم ١٦٨ + إزاحتان لا يتّسع — فيُصغَّر إلى المتاح بدل الخروج.
      await _pump(
        tester,
        size: const Size(834, 1112),
        banner: const model.Banner(id: 'h', titleAr: 'عرض', subtitleAr: 'جديد'),
      );
      final card = _card(tester);
      final art = _art(tester);
      expect(art.height, lessThanOrEqualTo(card.height - 2 * _inset + 0.5));
      expect(art.top, greaterThanOrEqualTo(card.top + _inset - 0.5));
      _expectInsideRoundedCard(art, card);
      expect(tester.takeException(), isNull);
    });

    testWidgets('بطاقة أضيق من الرسم — لا يتجاوز عرضها', (tester) async {
      // رسم البطل أفقيّ (أعرض من ارتفاعه): عند ١٦٨ ارتفاعاً يزيد عرضه على
      // بطاقةٍ ضيّقة جداً. العرض يُقصر على البطاقة بدل أن يخرج من يمينها.
      await _pump(tester, size: const Size(240, 640), banner: _devHero);
      final card = _card(tester);
      final art = _art(tester);
      expect(art.width, lessThanOrEqualTo(card.width - 2 * _inset + 0.5));
      _expectInsideRoundedCard(art, card);
      expect(tester.takeException(), isNull);
    });

    testWidgets('خطٌّ مكبَّر ١٫٣ — ما يزال داخل البطاقة', (tester) async {
      await _pump(
        tester,
        size: const Size(360, 780),
        banner: _devHero,
        textScale: 1.3,
      );
      _expectInsideRoundedCard(_art(tester), _card(tester));
      expect(tester.takeException(), isNull);
    });

    testWidgets('صورة المسؤول تفشل — الشخصية البديلة في الحدود نفسها', (
      tester,
    ) async {
      // `flutter test` يجيب كل طلب شبكة بـ٤٠٠، فتعود الصورة إلى البديل عبر
      // `errorBuilder` — المسار نفسه الذي يأخذه جهازٌ بلا اتصال.
      await _pump(
        tester,
        size: const Size(412, 892),
        banner: const model.Banner(
          id: 'h',
          titleAr: 'اكتشف، اجمع، واستمتع!',
          imageUrl: 'https://example.invalid/banner.png',
        ),
      );
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 300)),
      );
      await tester.pump();
      final card = _card(tester);
      final art = _art(tester);
      expect(art.left, closeTo(card.left + _inset, 0.5));
      expect(art.top - card.top, closeTo(card.bottom - art.bottom, 0.5));
      _expectInsideRoundedCard(art, card);
      expect(tester.takeException(), isNull);
    });
  });
}
