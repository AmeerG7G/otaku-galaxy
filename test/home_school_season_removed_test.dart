// بطاقة «موسم المدرسة» أُزيلت من التطبيق — ولا مرجعَ لها باقٍ في المستودع.
//
// [PRODUCT] المصدر: بطاقةٌ مضمَّنة في `HomePromoRail` تُعرض حين لا بنرات
// `promo` من لوحة التحكم. لم تكن في القاعدة ولا في اللوحة (فُحص تفريغ قاعدة
// التطوير كاملاً: صفر مطابقات)، فظهرت في التطبيق وحده ولم يستطع المسؤول
// إزالتها. أُزيلت مع نصّيها (عربي + كردي) ومدخلَي طابور المراجعة.
//
// هذا الملفّ وحده يحمل النصوص المحذوفة حرفياً — ليبحث عنها.

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/core/l10n/app_strings.dart';
import 'package:otaku_galaxy/core/l10n/locale_scope.dart';
import 'package:otaku_galaxy/features/home/presentation/widgets/home_compositions.dart';
import 'package:otaku_galaxy/features/products/domain/entities/banner.dart' as model;
import 'package:otaku_galaxy/features/products/domain/entities/home_data.dart';
import 'package:otaku_galaxy/features/settings/presentation/cubit/locale_cubit.dart';

import 'support/render_harness.dart';

/// النصوص المحذوفة — العنوان والسطر الفرعي باللغتين.
const _removedText = [
  'موسم المدرسة',
  'دفاتر وأقلام',
  'وەرزی خوێندن',
  'دەفتەر و پێنووس',
];

/// مفتاحا النصّين في `AppStrings`.
const _removedKeys = ['promoSchoolSeason', 'promoSchoolSeasonSub'];

/// بنرٌ كما يقدّمه `toBannerDto` + `localizeBanner` في الخادم.
Map<String, dynamic> _bannerJson({
  required String id,
  required String placement,
  required String title,
  String subtitle = '',
  int sortOrder = 0,
}) => {
  'id': id,
  'imageUrl': '/uploads/banner/2026/09/$id.png',
  'title': title,
  'subtitle': subtitle,
  'placement': placement,
  'destinationType': 'none',
  'destinationValue': null,
  'sortOrder': sortOrder,
  'isActive': true,
};

/// استجابة `/catalog/home` لقاعدة التطوير الحالية: بنرٌ رئيسي واحد، ولا
/// بنرات ترويج — الحالة التي كانت تُظهر البطاقة المضمَّنة.
Map<String, dynamic> _devHome() {
  final hero = _bannerJson(
    id: '1916247f-3c19-4995-9805-f1e43e3f3735',
    placement: 'hero',
    title: 'اكتشف، اجمع، واستمتع!',
  );
  return {
    'banners': [hero],
    'heroBanner': hero,
    'promoBanners': <Object>[],
    'offers': <Object>[],
    'selectedProducts': <Object>[],
    'categories': <Object>[],
    'discover': <Object>[],
  };
}

/// الرئيسية كما تركّبها `HomeScreen`: البطل ثم الشريط.
Future<void> _pumpHome(
  WidgetTester tester,
  HomeData data, {
  int? maxDiscount,
  AppLanguage language = AppLanguage.arabic,
}) async {
  tester.view.physicalSize = const Size(412, 892);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.light,
      home: LocaleScope(
        language: language,
        child: Directionality(
          textDirection: TextDirection.rtl,
          child: Scaffold(
            body: ListView(
              children: [
                HomeHeroCard(onShop: () {}, banner: data.heroBanner),
                HomePromoRail(
                  onTap: () {},
                  maxDiscount: maxDiscount,
                  banners: data.promoBanners,
                ),
              ],
            ),
          ),
        ),
      ),
    ),
  );
  await tester.pump();
}

void _expectNoRemovedText() {
  for (final text in _removedText) {
    expect(find.text(text), findsNothing, reason: '«$text» ما تزال تُعرض');
    expect(
      find.textContaining(text),
      findsNothing,
      reason: '«$text» ما تزال جزءاً من نصٍّ معروض',
    );
  }
}

/// ملفّات المستودع النصّية تحت [roots]، عدا ما في [excluded].
Iterable<File> _sources(List<String> roots, {Set<String> excluded = const {}}) sync* {
  const extensions = ['.dart', '.ts', '.tsx', '.json', '.md', '.sql', '.yaml', '.arb'];
  for (final root in roots) {
    final dir = Directory(root);
    if (!dir.existsSync()) continue;
    for (final entity in dir.listSync(recursive: true)) {
      if (entity is! File) continue;
      final path = entity.path.replaceAll(r'\', '/');
      if (path.contains('/node_modules/') || path.contains('/dist/')) continue;
      if (excluded.any(path.startsWith)) continue;
      if (!extensions.any(path.endsWith)) continue;
      yield entity;
    }
  }
}

void main() {
  setUpAll(loadProjectFonts);

  group('[CRITICAL] لا تظهر في تطبيق الزبون', () {
    for (final language in AppLanguage.values) {
      for (final maxDiscount in [null, 25]) {
        testWidgets(
          '${language.name} — قاعدة التطوير (بطلٌ بلا ترويج) — خصم $maxDiscount',
          (tester) async {
            await _pumpHome(
              tester,
              HomeData.fromJson(_devHome()),
              maxDiscount: maxDiscount,
              language: language,
            );
            _expectNoRemovedText();
            // البطل ما يزال يُعرض من بياناته.
            expect(find.text('اكتشف، اجمع، واستمتع!'), findsOneWidget);
            expect(tester.takeException(), isNull);
          },
        );
      }
    }
  });

  group('[CRITICAL] البنرات الباقية تُحمَّل وتُعرض', () {
    test('البطل والترويج يُقرآن من الاستجابة بترتيب المسؤول', () {
      final json = _devHome()
        ..['promoBanners'] = [
          _bannerJson(id: 'p1', placement: 'promo', title: 'عرض الصيف', subtitle: 'كل شيء'),
          _bannerJson(id: 'p2', placement: 'promo', title: 'وصل حديثاً', sortOrder: 1),
        ];
      final data = HomeData.fromJson(json);

      expect(data.heroBanner, isNotNull);
      expect(data.heroBanner!.placement, 'hero');
      expect(data.heroBanner!.titleAr, 'اكتشف، اجمع، واستمتع!');
      expect(data.heroBanner!.imageUrl, endsWith('/uploads/banner/2026/09/1916247f-3c19-4995-9805-f1e43e3f3735.png'));
      expect(data.promoBanners.map((b) => b.id), ['p1', 'p2']);
      expect(data.promoBanners.map((b) => b.placement).toSet(), {'promo'});
      expect(data.promoBanners.first.subtitleAr, 'كل شيء');
    });

    testWidgets('بنرات اللوحة تُعرض كلّها، ولا تعود البطاقة المحذوفة بجانبها', (
      tester,
    ) async {
      final json = _devHome()
        ..['promoBanners'] = [
          _bannerJson(id: 'p1', placement: 'promo', title: 'عرض الصيف', subtitle: 'كل شيء'),
          _bannerJson(id: 'p2', placement: 'promo', title: 'وصل حديثاً', sortOrder: 1),
        ];
      await _pumpHome(tester, HomeData.fromJson(json), maxDiscount: 25);

      expect(find.text('اكتشف، اجمع، واستمتع!'), findsOneWidget);
      expect(find.text('عرض الصيف'), findsOneWidget);
      expect(find.text('وصل حديثاً'), findsOneWidget);
      // بنرات اللوحة تحلّ محلّ البطاقة المشتقّة كما كانت.
      expect(find.text('خصومات فعّالة'), findsNothing);
      _expectNoRemovedText();
      expect(tester.takeException(), isNull);
    });

    testWidgets('بلا بنرات: بطاقة الخصومات الحقيقية ما تزال تُعرض', (tester) async {
      await _pumpHome(tester, const HomeData(), maxDiscount: 30);
      expect(find.text('خصومات فعّالة'), findsOneWidget);
      expect(find.text('حتى 30٪'), findsOneWidget);
      _expectNoRemovedText();
    });

    testWidgets('بلا بنرات ولا خصومات: لا شريط — لا بطاقة نائبة', (tester) async {
      await _pumpHome(tester, const HomeData());
      expect(find.byType(ListView), findsOneWidget, reason: 'قائمة الرئيسية وحدها');
      expect(tester.getSize(find.byType(HomePromoRail)).height, 0);
      _expectNoRemovedText();
    });

    test('بنرٌ بلا عنوان يأخذ شارة «عرض» لا نصّ البطاقة المحذوفة', () {
      const banner = model.Banner(id: 'x', placement: 'promo');
      expect(banner.titleIn(AppLanguage.arabic), isNull);
      expect(banner.titleIn(AppLanguage.kurdish), isNull);
      expect(AppStrings.arabic('promoBadge'), 'عرض');
    });
  });

  group('[CRITICAL] لا مرجع باقٍ', () {
    test('لا مفتاح ولا قيمة في AppStrings', () {
      for (final key in _removedKeys) {
        expect(AppStrings.keys, isNot(contains(key)), reason: key);
        expect(AppStrings.translatedKeys, isNot(contains(key)), reason: key);
      }
      for (final key in AppStrings.keys) {
        for (final value in [AppStrings.arabic(key), AppStrings.kurdish(key)]) {
          for (final text in _removedText) {
            expect(value.contains(text), isFalse, reason: '$key → «$value»');
          }
        }
      }
    });

    test('لا ذكر في الكود ولا الاختبارات ولا اللوحة ولا الخادم ولا طابور المراجعة', () {
      final self = 'test/home_school_season_removed_test.dart';
      final offenders = <String>[];
      for (final file in _sources(
        [
          'lib',
          'test',
          'tool',
          'docs/localization',
          'admin/src',
          'backend/src',
          'backend/scripts',
          'backend/tests',
        ],
        // الهجرات تاريخٌ مُطبَّق لا يُعاد كتابته — انظر الاختبار التالي.
        excluded: {'backend/src/database/migrations/'},
      )) {
        final path = file.path.replaceAll(r'\', '/');
        if (path.endsWith(self)) continue;
        final content = file.readAsStringSync();
        for (final needle in [..._removedText, ..._removedKeys]) {
          if (content.contains(needle)) offenders.add('$path: $needle');
        }
      }
      expect(offenders, isEmpty, reason: offenders.join('\n'));
    });

    test('الهجرات: المرجعان التاريخيان وحدهما، على جدولٍ أُسقط', () {
      // 029 أنشأ فتحة `home_promo_primary_character` بوصف موضعها آنذاك،
      // و053 غيّر ذلك الوصف. كلاهما مُطبَّق على كل قاعدة، والجدول نفسه
      // (`visual_slots`) أسقطته 065 — فلا صفّ حيّ يحمل النصّ. أيّ هجرةٍ جديدة
      // تذكره تُسقط هذا الاختبار.
      final mentioning = _sources(['backend/src/database/migrations'])
          .where((f) => _removedText.any(f.readAsStringSync().contains))
          .map((f) => f.uri.pathSegments.last)
          .toSet();
      expect(mentioning, {
        '029_visual_slot_catalogue.sql',
        '053_retire_social_icon_slots.sql',
      });
      final retire = File(
        'backend/src/database/migrations/065_retire_visual_slots.sql',
      ).readAsStringSync();
      expect(retire, contains('DROP TABLE IF EXISTS visual_slots'));
    });
  });
}
