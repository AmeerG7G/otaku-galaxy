// بلا بنر بطلٍ نشط ← لا بطاقة بطل (قرار المالك، 2026-10-26).
//
// [CRITICAL REGRESSION GUARD] حذف المسؤول كل البنرات فعاد «موسم جديد من عالم
// الأنمي» مع الشخصية 29: لم يكن صفّاً في القاعدة (الخادم يرسل `heroBanner: null`)
// بل بطلاً مضمَّناً في التطبيق يُرسم حين لا بنر. أُزيل؛ والبنر النشط يُعرض كما هو.

import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/features/home/presentation/widgets/home_compositions.dart';
import 'package:otaku_galaxy/features/main_navigation/presentation/screens/main_navigation_screen.dart';
import 'package:otaku_galaxy/features/products/domain/entities/home_data.dart';
import 'package:otaku_galaxy/features/settings/presentation/cubit/locale_cubit.dart';
import 'package:otaku_galaxy/features/visuals/presentation/character_artwork.dart';

import 'dart:io';

import 'support/render_harness.dart';
import 'support/screen_fixtures.dart';

const _oldHeroTitles = ['موسم جديد من\nعالم الأنمي', 'وەرزێکی نوێ لە\nجیهانی ئەنیمە'];

HomeData _withoutHero() => HomeData(
  categories: fixtureCategories(6),
  offers: [for (var i = 0; i < 4; i++) fixtureProduct(i)],
  discover: [for (var i = 0; i < 6; i++) fixtureProduct(i)],
);

void main() {
  setUpAll(loadProjectFonts);

  group('تحليل الاستجابة — heroBanner', () {
    test('null من الخادم (لا بنر نشط) ← null', () {
      expect(HomeData.fromJson({'heroBanner': null}).heroBanner, isNull);
    });
    test('المفتاح غائب (خادمٌ أقدم) ← null', () {
      expect(HomeData.fromJson(<String, dynamic>{}).heroBanner, isNull);
    });
    test('قيمة ليست كائناً ← null لا انهيار', () {
      expect(HomeData.fromJson({'heroBanner': 'hero'}).heroBanner, isNull);
      expect(HomeData.fromJson({'heroBanner': <dynamic>[]}).heroBanner, isNull);
    });
    test('بنرٌ صالح ← يُقرأ بنصوصه وصورته', () {
      final data = HomeData.fromJson({
        'heroBanner': {
          'id': 'h1',
          'imageUrl': 'https://cdn.test/uploads/banner/h1.png',
          'titleAr': 'عرض الشتاء',
          'subtitleAr': null,
          'titleCkb': null,
          'subtitleCkb': null,
          'placement': 'hero',
          'destinationType': 'none',
        },
      });
      expect(data.heroBanner?.titleAr, 'عرض الشتاء');
      expect(data.heroBanner?.imageUrl, 'https://cdn.test/uploads/banner/h1.png');
    });
  });

  for (final language in AppLanguage.values) {
    testWidgets('${language.code} — لا بنر ← لا بطاقة، لا نصّ، لا شخصية', (
      tester,
    ) async {
      useGeoView(tester, kGeoViews.first);
      await pumpFixtureShell(
        tester,
        tab: MainTab.home,
        language: language,
        textScale: 1.0,
        homeData: _withoutHero(),
      );
      expect(find.byType(HomeHeroCard), findsNothing);
      for (final title in _oldHeroTitles) {
        expect(find.text(title), findsNothing);
      }
      // الرئيسية ما تزال تُرسم (الأقسام، العروض) — لا فراغ ولا خطأ.
      expect(find.byType(DeliveryAssuranceStrip), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('${language.code} — بنرٌ نشط ← يُعرض بنصّه', (tester) async {
      useGeoView(tester, kGeoViews.first);
      await pumpFixtureShell(
        tester,
        tab: MainTab.home,
        language: language,
        textScale: 1.0,
      );
      expect(find.byType(HomeHeroCard), findsOneWidget);
      final title = language == AppLanguage.arabic
          ? fixtureHeroBanner.titleAr!
          : fixtureHeroBanner.titleCkb!;
      expect(
        find.descendant(of: find.byType(HomeHeroCard), matching: find.text(title)),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: find.byType(HomeHeroCard),
          matching: find.byType(CharacterArtwork),
        ),
        findsNothing,
        reason: 'صورة البنر وحدها — لا شخصية بديلة',
      );
    });
  }

  test('لا نصّ للبطل المضمَّن في شيفرة التطبيق', () {
    for (final entity in Directory('lib').listSync(recursive: true)) {
      if (entity is! File || !entity.path.endsWith('.dart')) continue;
      final code = entity.readAsStringSync();
      for (final marker in ['heroNewSeason', 'heroNewCollection', 'موسم جديد من']) {
        expect(code.contains(marker), isFalse, reason: '${entity.path}: $marker');
      }
    }
  });
}
