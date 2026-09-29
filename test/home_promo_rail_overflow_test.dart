// صفّ بطاقات العروض في الرئيسية — بلا تجاوز تخطيط، والرسم داخل البطاقة.
//
// [CRITICAL] الخطوط الحقيقية شرطٌ لصحّة هذا الاختبار. بالخط البديل الذي
// يستعمله `flutter test` افتراضياً — كل محارفه بعرضٍ واحد — قِيس التجاوز
// ٤٤ بكسل، وبالخطوط الحقيقية ٣ بكسل. الرقم الأول لا يصف شيئاً في التطبيق.
//
// الجذر الأول (٣ بكسل): المرجع يحدّد البطاقة `width:196px;height:112px`
// والحشوة العلوية `padding:14px 18px 0` على **الحاوية**. وكان التنفيذ يضع
// ١١٢ ارتفاعاً للصفّ كلّه ثم يقتطع القائمةُ منه ١٤ حشوةً.
//
// الجذر الثاني (١٣ بكسل): صندوق النصّ ١٠٤×٨٠ ثابت، والنصّان بلا حدّ أسطر.
// بنرٌ من اللوحة عنوانه «اكتشف، اجمع، واستمتع!» بلا عنوانٍ فرعي: العنوان
// ثلاثة أسطر (٧٢) + ٤ + سطرٌ فرعي **فارغ** يحجز ١٧ = ٩٣ > ٨٠.

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/core/l10n/locale_scope.dart';
import 'package:otaku_galaxy/features/home/presentation/widgets/home_compositions.dart';
import 'package:otaku_galaxy/features/products/domain/entities/banner.dart' as model;
import 'package:otaku_galaxy/features/settings/presentation/cubit/locale_cubit.dart';
import 'package:otaku_galaxy/features/visuals/domain/visual_slot.dart';
import 'package:otaku_galaxy/features/visuals/presentation/character_artwork.dart';

import 'support/render_harness.dart';

const _sizes = <String, Size>{
  'هاتف صغير': Size(320, 640),
  'هاتف': Size(412, 892),
  'هاتف كبير': Size(430, 932),
  'لوح': Size(834, 1112),
  'لوح عرضي': Size(1194, 834),
};

/// عنوان البنر الذي أظهر التجاوز — كما هو في قاعدة التطوير.
const _reportedTitle = 'اكتشف، اجمع، واستمتع!';

Future<void> _pump(
  WidgetTester tester, {
  required Size size,
  required bool dark,
  required Widget rail,
  double textScale = 1.0,
  AppLanguage language = AppLanguage.arabic,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: dark ? ThemeMode.dark : ThemeMode.light,
      locale: const Locale('ar'),
      home: MediaQuery(
        data: MediaQueryData(
          size: size,
          textScaler: TextScaler.linear(textScale),
        ),
        child: LocaleScope(
          language: language,
          child: Directionality(
            textDirection: TextDirection.rtl,
            child: Scaffold(body: Column(children: [rail])),
          ),
        ),
      ),
    ),
  );
  await tester.pump();
}

/// يفكّ رسوم الشريط كي يكون للرسم عرضٌ حقيقي يُقاس.
Future<void> _loadArt(WidgetTester tester) async {
  await tester.runAsync(() async {
    final context = tester.element(find.byType(Scaffold));
    // البطاقة الأولى بلا شخصية احتياطية منذ حذف الصورة 4 (2026-09-28).
    await precacheImage(
      AssetImage(CharacterArt.forSlot(VisualSlots.homePromoSecondary)!),
      context,
    );
    await Future<void>.delayed(const Duration(milliseconds: 200));
  });
  await tester.pump();
}

Finder _cardOf(String title) => find
    .ancestor(of: find.text(title), matching: find.byType(Container))
    .last;

/// زوايا [art] كلها داخل [card] بزواياه المدوَّرة — أي لا يقصّ منه شيء.
void _expectInsideRoundedCard(Rect art, Rect card, double radius) {
  final rounded = RRect.fromRectAndRadius(card, Radius.circular(radius))
      .inflate(0.5);
  for (final corner in [
    art.topLeft,
    art.topRight,
    art.bottomLeft,
    art.bottomRight,
  ]) {
    expect(
      rounded.contains(corner),
      isTrue,
      reason: 'زاوية الرسم $corner خارج البطاقة $card (نصف قطر $radius)',
    );
  }
}

void main() {
  setUpAll(loadProjectFonts);

  group('بلا لافتات مضبوطة — بطاقة الخصومات وحدها', () {
    for (final entry in _sizes.entries) {
      for (final dark in [false, true]) {
        final mode = dark ? 'داكن' : 'فاتح';
        testWidgets('[CRITICAL] بلا تجاوز — ${entry.key} — $mode', (
          tester,
        ) async {
          await _pump(
            tester,
            size: entry.value,
            dark: dark,
            rail: HomePromoRail(onTap: () {}, maxDiscount: 25),
          );
          expect(tester.takeException(), isNull);
          expect(find.text('خصومات فعّالة'), findsOneWidget);
          expect(find.text('حتى 25٪'), findsOneWidget);
        });
      }
    }

    testWidgets('بلا خصومات ولا لافتات — لا شريط ولا فراغٌ بارتفاعه', (
      tester,
    ) async {
      // `maxDiscount: null` يعني لا خصومات فعلية. قبل إزالة البطاقة
      // المضمَّنة الأولى كان هذا يعرض بطاقتها وحدها؛ الآن لا شيء يُعرض،
      // ويجب ألّا يبقى صفٌّ فارغ بارتفاع ١٢٦ بين البطل وما تحته.
      await _pump(
        tester,
        size: const Size(412, 892),
        dark: false,
        rail: HomePromoRail(onTap: () {}),
      );
      expect(find.byType(ListView), findsNothing);
      expect(tester.getSize(find.byType(HomePromoRail)).height, 0);
      expect(tester.takeException(), isNull);
    });
  });

  group('مع لافتات من لوحة التحكم', () {
    testWidgets('[CRITICAL] المسار الآخر لم ينكسر', (tester) async {
      await _pump(
        tester,
        size: const Size(412, 892),
        dark: false,
        rail: HomePromoRail(
          onTap: () {},
          banners: const [
            model.Banner(
              id: 'b1',
              titleAr: 'عرض الصيف',
              subtitleAr: 'خصومات على كل شيء',
              imageUrl: '',
            ),
            model.Banner(
              id: 'b2',
              titleAr: 'وصل حديثاً',
              subtitleAr: 'مجسّمات جديدة',
              imageUrl: '',
            ),
          ],
        ),
      );
      expect(find.text('عرض الصيف'), findsOneWidget);
      expect(find.text('وصل حديثاً'), findsOneWidget);
      // اللافتات المُدارة تحلّ محلّ البطاقة المشتقّة — لا تُضاف إليها.
      expect(find.text('خصومات فعّالة'), findsNothing);
      expect(tester.takeException(), isNull);
    });
  });

  group('[CRITICAL] تجاوز ١٣ بكسل — عنوان بنرٍ طويل', () {
    for (final language in AppLanguage.values) {
      for (final scale in [1.0, 1.3, 1.6, 2.0]) {
        testWidgets('${language.name} — مقياس $scale — بلا تجاوز', (
          tester,
        ) async {
          await _pump(
            tester,
            size: const Size(412, 892),
            dark: false,
            textScale: scale,
            language: language,
            rail: HomePromoRail(
              onTap: () {},
              banners: const [
                // البنر المبلَّغ عنه: عنوانٌ يلتفّ ثلاثة أسطر، وفرعيّ فارغ.
                model.Banner(id: 'reported', titleAr: _reportedTitle),
                // والأسوأ: عنوانٌ وفرعيّ طويلان معاً، بالكردية.
                model.Banner(
                  id: 'long',
                  titleCkb: 'وەرزی نوێی ئەنیمە و فیگەری جوان و زۆر شتی تر',
                  subtitleCkb: 'فیگەر و پۆستەر و جلوبەرگ و زۆر شتی تری جوان',
                ),
              ],
            ),
          );
          expect(tester.takeException(), isNull);
          expect(find.text(_reportedTitle), findsOneWidget);
        });
      }
    }

    testWidgets('الفرعيّ الفارغ لا يحجز سطراً', (tester) async {
      await _pump(
        tester,
        size: const Size(412, 892),
        dark: false,
        rail: HomePromoRail(
          onTap: () {},
          banners: const [model.Banner(id: 'reported', titleAr: _reportedTitle)],
        ),
      );
      final texts = find.descendant(
        of: _cardOf(_reportedTitle),
        matching: find.byType(Text),
      );
      expect(texts, findsOneWidget, reason: 'نصٌّ فارغ ما يزال يُرسم تحت العنوان');
      expect(tester.takeException(), isNull);
    });

    testWidgets('العنوان يُحدّ بسطرين والفرعيّ بسطر — ما يتّسع له الارتفاع', (
      tester,
    ) async {
      await _pump(
        tester,
        size: const Size(412, 892),
        dark: false,
        rail: HomePromoRail(
          onTap: () {},
          banners: const [
            model.Banner(
              id: 'long',
              titleAr: 'عنوانٌ طويلٌ جداً لبنرٍ من لوحة التحكم يلتفّ أسطراً كثيرة',
              subtitleAr: 'وسطرٌ فرعيّ طويلٌ هو الآخر يلتفّ لو تُرك بلا حدّ',
            ),
          ],
        ),
      );
      final paragraphs = tester
          .renderObjectList<RenderParagraph>(
            find.descendant(
              of: find.byType(HomePromoRail),
              matching: find.byType(RichText),
            ),
          )
          .toList();
      expect(paragraphs, hasLength(2));
      expect(paragraphs[0].maxLines, 2);
      expect(paragraphs[1].maxLines, 1);
      expect(tester.takeException(), isNull);
    });
  });

  group('هندسة المرجع', () {
    testWidgets('[CRITICAL] البطاقة ١١٢ ارتفاعاً و١٩٦ عرضاً كما في المرجع', (
      tester,
    ) async {
      // المرجع: `width:196px;height:112px` للبطاقة، والحشوة ١٤ فوقها على
      // الحاوية. الاختبار يقيس البطاقة نفسها لا الصفّ، فلا يمرّ إصلاحٌ
      // يزيد ارتفاع الصفّ ويترك البطاقة مضغوطة.
      await _pump(
        tester,
        size: const Size(412, 892),
        dark: false,
        rail: HomePromoRail(onTap: () {}, maxDiscount: 25),
      );

      final card = tester.getRect(_cardOf('خصومات فعّالة'));
      expect(card.width, 196);
      expect(card.height, 112);
      // والفراغ فوقها ١٤ كما في المرجع.
      expect(card.top, 14);
    });
  });

  group('تكبير الخط', () {
    for (final language in AppLanguage.values) {
      // مقاييس أندرويد الشائعة (عادي، كبير، أكبر): النصّ كاملٌ بلا حذف.
      for (final scale in [1.0, 1.15, 1.2, 1.3]) {
        testWidgets(
          '${language.name} — مقياس $scale — النصّ كاملٌ بلا تجاوزٍ ولا قصّ',
          (tester) async {
            await _pump(
              tester,
              size: const Size(412, 892),
              dark: false,
              textScale: scale,
              language: language,
              rail: HomePromoRail(onTap: () {}, maxDiscount: 25),
            );
            expect(tester.takeException(), isNull);
            for (final p in tester.renderObjectList<RenderParagraph>(
              find.descendant(
                of: find.byType(HomePromoRail),
                matching: find.byType(RichText),
              ),
            )) {
              expect(
                p.didExceedMaxLines,
                isFalse,
                reason: 'قُصّ «${p.text.toPlainText()}» عند المقياس $scale',
              );
            }
          },
        );
      }
      // فوق ذلك: «داشکاندنی» وحدها أعرض من عمود النصّ (١٠٤) عند ١٫٦، فتنكسر
      // الكلمة ويُحذف ما زاد على سطرين — لكن لا تجاوز. كانت هنا تفيض.
      for (final scale in [1.6, 2.0]) {
        testWidgets('${language.name} — مقياس $scale — بلا تجاوز', (
          tester,
        ) async {
          await _pump(
            tester,
            size: const Size(412, 892),
            dark: false,
            textScale: scale,
            language: language,
            rail: HomePromoRail(onTap: () {}, maxDiscount: 25),
          );
          expect(tester.takeException(), isNull);
        });
      }
    }
  });

  group('[CRITICAL] رسم البطاقة داخل حدودها', () {
    final inset = AppDimens.radiusLg * (1 - 0.7071067811865476);

    for (final entry in _sizes.entries) {
      testWidgets('${entry.key} — لا يخرج من اليسار ولا من الأسفل ولا يُقصّ', (
        tester,
      ) async {
        await _pump(
          tester,
          size: entry.value,
          dark: false,
          rail: HomePromoRail(
            onTap: () {},
            banners: const [
              model.Banner(id: 'a', titleAr: 'عرض الصيف', subtitleAr: 'كل شيء'),
              model.Banner(id: 'b', titleAr: 'وصل حديثاً', subtitleAr: 'جديد'),
            ],
          ),
        );
        await _loadArt(tester);

        // الأولى بلا صورة مرفوعة لا تعرض شخصية: احتياطيّها كان الصورة 4.
        expect(
          find.descendant(
            of: _cardOf('عرض الصيف'),
            matching: find.byType(CharacterArtwork),
          ),
          findsNothing,
        );
        for (final title in ['وصل حديثاً']) {
          final cardFinder = _cardOf(title);
          final card = tester.getRect(cardFinder);
          final art = tester.getRect(
            find.descendant(
              of: cardFinder,
              matching: find.byType(CharacterArtwork),
            ),
          );
          expect(art.width, greaterThan(0), reason: 'الرسم لم يُفكّ');
          // الطلب: يمين وأعلى من موضعه القديم (`end: -18`, `bottom: -8`)،
          // أي داخل البطاقة من اليسار ومن الأسفل.
          expect(art.left, greaterThanOrEqualTo(card.left));
          expect(art.bottom, lessThanOrEqualTo(card.bottom));
          expect(art.left, closeTo(card.left + inset, 0.5));
          expect(art.bottom, closeTo(card.bottom - inset, 0.5));
          _expectInsideRoundedCard(art, card, AppDimens.radiusLg);
        }
        expect(tester.takeException(), isNull);
      });
    }
  });
}
