// نصّ البنر بلغتين (هجرة ٠٦٧) — من ردّ الخادم إلى الشاشة.
//
// الخادم يرسل الأربعة صريحة (`titleAr`/`subtitleAr`/`titleCkb`/`subtitleCkb`،
// `null` = لا نصّ بتلك اللغة)، والتطبيق يختار بلغة واجهته **الآن** عبر
// `Banner.titleIn`/`subtitleIn` ← `pickEitherLanguage`. ما يُثبَّت هنا:
//   ١. العربية ← النصّ العربي، والكردية ← النصّ الكردي (البطل والشريط).
//   ٢. تبديل اللغة يبدّل النصّ المعروض بلا جلبٍ ثانٍ.
//   ٣. الكردية الناقصة ← العربية، والعربية الناقصة ← الكردية، لكل حقلٍ وحده.
//   ٤. القراءة: الحقل القديم (`title`) لا يُقرأ إلا حين يغيب الصريح.
//   ٥. الصورة كما كانت — لا تتبدّل بتبديل اللغة ولا بشكل الردّ.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/core/l10n/app_strings.dart';
import 'package:otaku_galaxy/core/l10n/bilingual_text.dart';
import 'package:otaku_galaxy/core/l10n/locale_scope.dart';
import 'package:otaku_galaxy/core/network/media_url.dart';
import 'package:otaku_galaxy/features/home/presentation/widgets/home_compositions.dart';
import 'package:otaku_galaxy/features/products/domain/entities/banner.dart'
    as model;
import 'package:otaku_galaxy/features/products/domain/entities/home_data.dart';
import 'package:otaku_galaxy/features/settings/presentation/cubit/locale_cubit.dart';

const _titleAr = 'عنوان عربي تجريبي';
const _subtitleAr = 'نص عربي تجريبي';
const _titleCkb = 'ناونیشانی تاقیکردنەوە';
const _subtitleCkb = 'دەقی تاقیکردنەوە';

/// بنرٌ كما يرسله الخادم بعد ٠٦٧ — بلغة طلبٍ ما (`title` محسومٌ بها).
Map<String, dynamic> _bannerJson({
  required String id,
  String placement = 'promo',
  String? titleAr = _titleAr,
  String? subtitleAr = _subtitleAr,
  String? titleCkb = _titleCkb,
  String? subtitleCkb = _subtitleCkb,
  String? resolvedTitle,
  String resolvedSubtitle = '',
  String imageUrl = '/uploads/banner/2026/09/bilingual.png',
}) => {
  'id': id,
  'imageUrl': imageUrl,
  'title': resolvedTitle ?? titleAr,
  'subtitle': resolvedSubtitle,
  'titleAr': titleAr,
  'subtitleAr': subtitleAr,
  'titleCkb': titleCkb,
  'subtitleCkb': subtitleCkb,
  'placement': placement,
  'destinationType': 'none',
  'destinationValue': null,
  'sortOrder': 0,
  'isActive': true,
};

HomeData _home({
  Map<String, dynamic>? hero,
  List<Map<String, dynamic>> promos = const [],
}) => HomeData.fromJson({
  'banners': [?hero, ...promos],
  'heroBanner': hero,
  'promoBanners': promos,
});

/// الرئيسية بلغةٍ يتحكّم بها الاختبار — [LocaleScope] كما يضعه الجذر فوق كل شاشة.
Future<ValueNotifier<AppLanguage>> _pumpHome(
  WidgetTester tester,
  HomeData data, {
  AppLanguage language = AppLanguage.arabic,
}) async {
  tester.view.physicalSize = const Size(412, 892);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
  final languageNotifier = ValueNotifier(language);
  addTearDown(languageNotifier.dispose);
  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.light,
      home: ValueListenableBuilder<AppLanguage>(
        valueListenable: languageNotifier,
        builder: (context, current, _) => LocaleScope(
          language: current,
          child: Directionality(
            textDirection: TextDirection.rtl,
            child: Scaffold(
              body: ListView(
                children: [
                  HomeHeroCard(onShop: () {}, banner: data.heroBanner),
                  HomePromoRail(onTap: () {}, banners: data.promoBanners),
                ],
              ),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.pump();
  return languageNotifier;
}

Finder _inHero(String text) =>
    find.descendant(of: find.byType(HomeHeroCard), matching: find.text(text));

Finder _inRail(String text) =>
    find.descendant(of: find.byType(HomePromoRail), matching: find.text(text));

void main() {
  group('[CRITICAL] البطل والشريط بلغة الواجهة', () {
    final data = _home(
      hero: _bannerJson(id: 'hero', placement: 'hero'),
      promos: [_bannerJson(id: 'promo')],
    );

    testWidgets('العربية ← العنوان والسطر العربيان، ولا كردية على الشاشة', (
      tester,
    ) async {
      await _pumpHome(tester, data);
      expect(_inHero(_titleAr), findsOneWidget);
      expect(_inHero(_subtitleAr), findsOneWidget);
      expect(_inRail(_titleAr), findsOneWidget);
      expect(_inRail(_subtitleAr), findsOneWidget);
      expect(find.text(_titleCkb), findsNothing);
      expect(find.text(_subtitleCkb), findsNothing);
      expect(tester.takeException(), isNull);
    });

    testWidgets('الكردية ← العنوان والسطر الكرديان، ولا عربية على الشاشة', (
      tester,
    ) async {
      await _pumpHome(tester, data, language: AppLanguage.kurdish);
      expect(_inHero(_titleCkb), findsOneWidget);
      expect(_inHero(_subtitleCkb), findsOneWidget);
      expect(_inRail(_titleCkb), findsOneWidget);
      expect(_inRail(_subtitleCkb), findsOneWidget);
      expect(find.text(_titleAr), findsNothing);
      expect(find.text(_subtitleAr), findsNothing);
      expect(tester.takeException(), isNull);
    });

    testWidgets(
      'تبديل اللغة يبدّل النصّ المعروض بلا جلبٍ ثانٍ — ذهاباً وإياباً',
      (tester) async {
        final language = await _pumpHome(tester, data);
        expect(_inHero(_titleAr), findsOneWidget);

        language.value = AppLanguage.kurdish;
        await tester.pump();
        expect(_inHero(_titleCkb), findsOneWidget);
        expect(_inRail(_subtitleCkb), findsOneWidget);
        expect(find.text(_titleAr), findsNothing);

        language.value = AppLanguage.arabic;
        await tester.pump();
        expect(_inHero(_titleAr), findsOneWidget);
        expect(_inRail(_subtitleAr), findsOneWidget);
        expect(find.text(_titleCkb), findsNothing);
        expect(tester.takeException(), isNull);
      },
    );
  });

  group('[CRITICAL] الاحتياط متناظر ولكل حقلٍ وحده', () {
    testWidgets('الكردية ناقصة ← العربية تُعرض في الواجهة الكردية', (
      tester,
    ) async {
      await _pumpHome(
        tester,
        _home(
          hero: _bannerJson(
            id: 'hero',
            placement: 'hero',
            titleCkb: null,
            subtitleCkb: null,
          ),
        ),
        language: AppLanguage.kurdish,
      );
      expect(_inHero(_titleAr), findsOneWidget);
      expect(_inHero(_subtitleAr), findsOneWidget);
    });

    testWidgets('العربية ناقصة ← الكردية تُعرض في الواجهة العربية', (
      tester,
    ) async {
      await _pumpHome(
        tester,
        _home(
          promos: [
            _bannerJson(
              id: 'promo',
              titleAr: null,
              subtitleAr: null,
              resolvedTitle: _titleCkb,
            ),
          ],
        ),
      );
      expect(_inRail(_titleCkb), findsOneWidget);
      expect(_inRail(_subtitleCkb), findsOneWidget);
    });

    testWidgets('عنوانٌ كردي حاضر وسطرٌ كردي ناقص ← عنوانٌ كردي وسطرٌ عربي', (
      tester,
    ) async {
      await _pumpHome(
        tester,
        _home(promos: [_bannerJson(id: 'promo', subtitleCkb: null)]),
        language: AppLanguage.kurdish,
      );
      expect(_inRail(_titleCkb), findsOneWidget);
      expect(_inRail(_subtitleAr), findsOneWidget);
    });

    testWidgets(
      'بلا نصٍّ بأي لغة ← النصّ الافتراضي للواجهة بلغتها، لا سطرٌ فارغ',
      (tester) async {
        final data = _home(
          hero: _bannerJson(
            id: 'hero',
            placement: 'hero',
            titleAr: null,
            subtitleAr: null,
            titleCkb: '   ',
            subtitleCkb: null,
          ),
        );
        final language = await _pumpHome(tester, data);
        final ar = AppStrings.of(AppLanguage.arabic);
        expect(_inHero(ar('heroNewSeason')), findsOneWidget);
        expect(_inHero(ar('heroNewCollection')), findsOneWidget);

        language.value = AppLanguage.kurdish;
        await tester.pump();
        final ckb = AppStrings.of(AppLanguage.kurdish);
        expect(_inHero(ckb('heroNewSeason')), findsOneWidget);
        expect(_inHero(ckb('heroNewCollection')), findsOneWidget);
      },
    );

    // نفس جدول الخادم (`bilingual-banner-content.test.ts › pickLocalizedEither`)
    // — القاعدتان متطابقتان فيطابق اختيارُ التطبيق `title` المحسوم في الخادم.
    const table = <(String?, String?, AppLanguage, String?)>[
      ('ع', 'ک', AppLanguage.arabic, 'ع'),
      ('ع', 'ک', AppLanguage.kurdish, 'ک'),
      ('ع', null, AppLanguage.kurdish, 'ع'),
      (null, 'ک', AppLanguage.arabic, 'ک'),
      ('  ', 'ک', AppLanguage.arabic, 'ک'),
      ('ع', '   ', AppLanguage.kurdish, 'ع'),
      ('', '', AppLanguage.arabic, null),
      (null, null, AppLanguage.kurdish, null),
    ];
    for (final (ar, ckb, language, expected) in table) {
      test('pickEitherLanguage($ar, $ckb, ${language.name}) = $expected', () {
        expect(
          pickEitherLanguage(ar: ar, ckb: ckb, language: language),
          expected,
        );
      });
    }
  });

  group('قراءة ردّ الخادم', () {
    test('الردّ الجديد: الأربعة الصريحة، والفراغ يُقرأ null', () {
      final banner = model.Banner.fromJson(
        _bannerJson(id: 'b', titleCkb: '  ', subtitleAr: ''),
      );
      expect(banner.titleAr, _titleAr);
      expect(banner.subtitleAr, isNull);
      expect(banner.titleCkb, isNull);
      expect(banner.subtitleCkb, _subtitleCkb);
    });

    test(
      '[CRITICAL] titleAr: null مع title محسومٍ كردياً — لا يُقرأ الكردي عربياً',
      () {
        final banner = model.Banner.fromJson(
          _bannerJson(
            id: 'b',
            titleAr: null,
            subtitleAr: null,
            resolvedTitle: _titleCkb,
            resolvedSubtitle: _subtitleCkb,
          ),
        );
        expect(banner.titleAr, isNull);
        expect(banner.subtitleAr, isNull);
        expect(banner.titleIn(AppLanguage.arabic), _titleCkb);
      },
    );

    test(
      'الردّ الأقدم من ٠٦٧ (title/subtitle وحدهما) يُقرأ عربياً بلا كردية',
      () {
        final banner = model.Banner.fromJson({
          'id': 'legacy',
          'imageUrl': '/uploads/banner/legacy.png',
          'title': 'اكتشف، اجمع، واستمتع!',
          'subtitle': '',
          'placement': 'hero',
          'destinationType': 'none',
        });
        expect(banner.titleAr, 'اكتشف، اجمع، واستمتع!');
        expect(banner.subtitleAr, isNull);
        expect(banner.titleCkb, isNull);
        expect(banner.titleIn(AppLanguage.kurdish), 'اكتشف، اجمع، واستمتع!');
      },
    );
  });

  group('الصورة كما كانت', () {
    test('imageUrl يُحلّ كما قبل — الردّ الجديد والقديم سواء', () {
      const ref = '/uploads/banner/2026/09/bilingual.png';
      final fresh = model.Banner.fromJson(_bannerJson(id: 'b', imageUrl: ref));
      final legacy = model.Banner.fromJson({
        'id': 'b',
        'imageUrl': ref,
        'title': _titleAr,
      });
      expect(fresh.imageUrl, resolveMediaUrl(ref));
      expect(fresh.imageUrl, legacy.imageUrl);
    });

    testWidgets('تبديل اللغة لا يغيّر صورة البنر المعروضة', (tester) async {
      const url = 'https://example.invalid/banner.png';
      final data = _home(
        hero: _bannerJson(id: 'hero', placement: 'hero', imageUrl: url),
      );
      final language = await _pumpHome(tester, data);

      String? shownUrl() {
        final images = find
            .descendant(
              of: find.byType(HomeHeroCard),
              matching: find.byType(Image),
            )
            .evaluate()
            .map((e) => (e.widget as Image).image)
            .whereType<NetworkImage>()
            .map((image) => image.url)
            .toList();
        return images.isEmpty ? null : images.single;
      }

      expect(shownUrl(), url);
      language.value = AppLanguage.kurdish;
      await tester.pump();
      expect(shownUrl(), url);
      // فشل التحميل في بيئة الاختبار يعود للشخصية المضمَّنة (errorBuilder).
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 100)),
      );
      await tester.pump();
      expect(tester.takeException(), isNull);
    });
  });
}
