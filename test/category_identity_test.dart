// هوية الأقسام الستة — الترتيب واللون، من مفتاحٍ مستقرّ لا من الموضع.
//
// [CRITICAL] العطب الأصلي كان **مضموناً** لا عرضياً: ستة أقسام تُوزَّع على
// خمسة تدرّجات بتجزئة المعرّف، وستةٌ على خمسة لا تتوزّع بلا تكرار (مبدأ
// الحمام). أيُّ قسمين يتصادمان يتبع قيم الـUUID، أي البيئة — ففي قاعدة
// التطوير اصطدمت «قرطاسية» بـ«ملابس»، وعلى جهاز صاحب المتجر «الحقائب»
// بـ«ملابس». لذلك تختبر هذه الملفات **التمايز نفسه** لا زوجاً بعينه.

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/features/products/domain/entities/category.dart';
import 'package:otaku_galaxy/features/products/domain/entities/category_order.dart';

/// الأقسام الستة بأسمائها ومعرّفاتها كما هي في قاعدة التطوير فعلاً.
///
/// المعرّفات حقيقية عمداً: التجزئة القديمة كانت تصطدم على هذه القيم
/// بالذات، فاختبارٌ بمعرّفات مخترعة كان قد يفوّت التصادم.
const _devCategories = <Category>[
  Category(id: 'f88e7757-07b0-4442-b4e3-7558bf0adf93', name: 'قرطاسية'),
  Category(id: '807973f0-4d1e-4230-ac51-463c1064ae6b', name: 'ملابس'),
  Category(id: '55871f9f-cac9-4955-a84f-c8efefafa340', name: 'حقائب'),
  Category(id: 'be9c2eaa-e0f0-44b2-b182-e13d6b6eca57', name: 'إكسسوارات'),
  Category(id: '662b2af0-dd2b-4919-b9e4-6a2864b2870e', name: 'مجسمات وهدايا'),
  Category(id: '01a555f0-21e3-4868-b781-aadc18941e46', name: 'منتجات أنمي متنوعة'),
];

/// الترتيب المطلوب، بأسماء العرض.
const _expectedOrder = [
  'قرطاسية',
  'حقائب',
  'إكسسوارات',
  'ملابس',
  'مجسمات وهدايا',
  'منتجات أنمي متنوعة',
];

void main() {
  group('المفتاح المستقرّ', () {
    test('[CRITICAL] الاختلافات الإملائية تعطي مفتاحاً واحداً', () {
      // «الحقائب/حقائب»، «إكسسوارات/اكسسوارات»، «متنوعة/متنوعه» — كلها
      // كتابات لنفس القسم. مطابقةُ النصّ حرفياً كانت ستفشل على واحدٍ منها
      // فيسقط القسم إلى الترتيب واللون الاحتياطيَّين بلا خطأ ظاهر.
      expect(canonicalCategoryKey('الحقائب'), canonicalCategoryKey('حقائب'));
      expect(
        canonicalCategoryKey('إكسسوارات'),
        canonicalCategoryKey('اكسسوارات'),
      );
      expect(
        canonicalCategoryKey('منتجات أنمي متنوعة'),
        canonicalCategoryKey('منتجات انمي متنوعه'),
      );
      expect(canonicalCategoryKey('  ملابس  '), canonicalCategoryKey('ملابس'));
      expect(canonicalCategoryKey('قرطاسية'), canonicalCategoryKey('القرطاسية'));
    });

    test('[CRITICAL] كل حرف تطبيع محروسٌ بمفرده', () {
      // [CRITICAL] الاختبار السابق يقارن مفتاحاً بمفتاح، فيمرّ الطرفان
      // بالدالة نفسها: حذفُ قاعدة تطبيع يغيّر الطرفين معاً ويبقى التساوي
      // قائماً. جُرِّب ذلك فعلاً — حُذفت قاعدة «ئ ← ي» فلم يسقط اختبارٌ
      // واحد، بينما هي بالضبط القاعدة التي يحكي `category_order.dart` أن
      // فقدانَها أسقط «الحقائب» من الترتيب واللون معاً.
      //
      // الحارس الصحيح يثبّت **الناتج**: كتابتان مختلفتان لاسمٍ واحد كما
      // قد يكتبهما مسؤولٌ في اللوحة، ولكلٍّ منهما حرفٌ يخصّ قاعدة بعينها.
      const variants = <String, List<String>>{
        // ئ ← ي  (القاعدة التي سقطت تاريخياً)
        'حقائب': ['حقايب'],
        // أ/إ/آ/ٱ ← ا
        'إكسسوارات': ['اكسسوارات', 'أكسسوارات', 'آكسسوارات'],
        // ة ← ه
        'قرطاسية': ['قرطاسيه'],
        // ى ← ي
        'أنمي': ['انمى'],
        // ؤ ← و
        'مؤجل': ['موجل'],
        // التشكيل والتطويل يسقطان
        'ملابس': ['مَلابِس', 'مـلابـس'],
        // «ال» التعريف تسقط
        'مجسمات': ['المجسمات'],
      };

      variants.forEach((canonical, spellings) {
        for (final spelling in spellings) {
          expect(
            canonicalCategoryKey(spelling),
            canonicalCategoryKey(canonical),
            reason: '«$spelling» لم يعد يطابق «$canonical» — سقطت قاعدة تطبيع',
          );
        }
      });
    });

    test('[CRITICAL] الترتيب يصمد أمام كتابات الخادم البديلة', () {
      // نفس الأقسام الستة بكتاباتٍ إملائية أخرى — الترتيب لا يتغيّر.
      // هذا ما يربط التطبيع بالنتيجة المرئية للزبون.
      final misspelled = [
        Category(id: 'a1', name: 'قرطاسيه'),
        Category(id: 'a2', name: 'الحقايب'),
        Category(id: 'a3', name: 'اكسسوارات'),
        Category(id: 'a4', name: 'الملابس'),
        Category(id: 'a5', name: 'مجسمات وهدايا'),
        Category(id: 'a6', name: 'منتجات انمى متنوعه'),
      ];
      final sorted = sortByCanonicalOrder(misspelled);
      expect(
        sorted.map((c) => canonicalCategoryKey(c.name)).toList(),
        kMainCategoryOrder.map(canonicalCategoryKey).toList(),
        reason: 'كتابةٌ بديلة أسقطت قسماً من الترتيب المعتمد',
      );
    });

    test('أقسام مختلفة تبقى مفاتيح مختلفة', () {
      final keys = _devCategories.map((c) => canonicalCategoryKey(c.name));
      expect(keys.toSet(), hasLength(6));
    });

    test('كل الأقسام الستة معروفة بالترتيب المعتمد', () {
      for (final category in _devCategories) {
        expect(isMainCategory(category), isTrue, reason: category.name);
      }
      expect(kMainCategoryOrder, hasLength(6));
    });
  });

  group('الترتيب المعتمد', () {
    test('[CRITICAL] الترتيب هو المطلوب بالضبط', () {
      final sorted = sortByCanonicalOrder(_devCategories);
      expect(sorted.map((c) => c.name).toList(), _expectedOrder);
    });

    test('[CRITICAL] لا يتبع ترتيب الخادم ولا الإدخال', () {
      // نفس الأقسام بترتيبٍ معكوس ثم عشوائيّ الشكل — النتيجة واحدة.
      final reversed = _devCategories.reversed.toList();
      final shuffled = [
        _devCategories[3],
        _devCategories[0],
        _devCategories[5],
        _devCategories[1],
        _devCategories[4],
        _devCategories[2],
      ];
      for (final input in [reversed, shuffled]) {
        expect(
          sortByCanonicalOrder(input).map((c) => c.name).toList(),
          _expectedOrder,
        );
      }
    });

    test('لا يتبع الترتيب الأبجدي', () {
      final alphabetical = [..._devCategories]
        ..sort((a, b) => a.name.compareTo(b.name));
      expect(
        sortByCanonicalOrder(alphabetical).map((c) => c.name).toList(),
        isNot(alphabetical.map((c) => c.name).toList()),
      );
      expect(
        sortByCanonicalOrder(alphabetical).map((c) => c.name).toList(),
        _expectedOrder,
      );
    });

    test('قسم جديد من اللوحة يأتي بعد الستة بترتيب الخادم بينه ونظائره', () {
      // المسؤول يبقى حرّاً في الإضافة؛ الترتيب المعتمد يخصّ الستة وحدها.
      const extraA = Category(id: 'x-1', name: 'ألعاب');
      const extraB = Category(id: 'x-2', name: 'كتب');
      final sorted = sortByCanonicalOrder([extraA, ..._devCategories, extraB]);

      expect(sorted.take(6).map((c) => c.name).toList(), _expectedOrder);
      // وترتيب الخادم بينهما محفوظ (ألعاب وصلت قبل كتب).
      expect(sorted.skip(6).map((c) => c.name).toList(), ['ألعاب', 'كتب']);
    });

    test('قائمة ناقصة تحتفظ بالترتيب النسبي', () {
      final subset = [_devCategories[1], _devCategories[2], _devCategories[0]];
      expect(
        sortByCanonicalOrder(subset).map((c) => c.name).toList(),
        ['قرطاسية', 'حقائب', 'ملابس'],
      );
    });
  });

  group('تدرّجات الأقسام', () {
    test('[CRITICAL] الأقسام الستة بستة تدرّجات متمايزة', () {
      final palettes = _devCategories
          .map((c) => AnimeCategoryCard.gradientForCategory(c).toString())
          .toList();
      expect(
        palettes.toSet(),
        hasLength(6),
        reason: 'قسمان يتشاركان تدرّجاً — التمايز هو المطلوب كله',
      );
    });

    test('[CRITICAL] الحقائب وملابس لونان مختلفان', () {
      // الزوج الذي أبلغ عنه صاحب المتجر بالاسم.
      final bags = AnimeCategoryCard.gradientForCategory(
        const Category(id: '55871f9f-cac9-4955-a84f-c8efefafa340', name: 'حقائب'),
      );
      final clothing = AnimeCategoryCard.gradientForCategory(
        const Category(id: '807973f0-4d1e-4230-ac51-463c1064ae6b', name: 'ملابس'),
      );
      expect(bags, isNot(clothing));
    });

    test('[CRITICAL] اللون لا يتغيّر بإعادة الترتيب', () {
      final before = {
        for (final c in _devCategories)
          c.name: AnimeCategoryCard.gradientForCategory(c).toString(),
      };
      final after = {
        for (final c in _devCategories.reversed)
          c.name: AnimeCategoryCard.gradientForCategory(c).toString(),
      };
      expect(after, before);
    });

    test('[CRITICAL] اللون لا يتغيّر بتغيّر المعرّف — الهوية هي الاسم', () {
      // المعرّف يختلف بين البيئات (UUID لكل قاعدة)، فلو تعلّق اللون به
      // لاختلف لون القسم بين التطوير والإنتاج.
      for (final category in _devCategories) {
        final elsewhere = Category(id: 'other-env-uuid', name: category.name);
        expect(
          AnimeCategoryCard.gradientForCategory(elsewhere),
          AnimeCategoryCard.gradientForCategory(category),
          reason: category.name,
        );
      }
    });

    test('الاختلاف الإملائي لا يغيّر اللون', () {
      expect(
        AnimeCategoryCard.gradientForCategory(
          const Category(id: 'a', name: 'الحقائب'),
        ),
        AnimeCategoryCard.gradientForCategory(
          const Category(id: 'b', name: 'حقائب'),
        ),
      );
      expect(
        AnimeCategoryCard.gradientForCategory(
          const Category(id: 'a', name: 'اكسسوارات'),
        ),
        AnimeCategoryCard.gradientForCategory(
          const Category(id: 'b', name: 'إكسسوارات'),
        ),
      );
    });

    test('اللوحة فيها ستة تدرّجات على الأقل، وكلها متمايزة', () {
      expect(
        AnimeCategoryCard.gradients.length,
        greaterThanOrEqualTo(6),
        reason: 'أقل من ستة يجعل التصادم حتمياً',
      );
      expect(
        AnimeCategoryCard.gradients.map((g) => g.toString()).toSet(),
        hasLength(AnimeCategoryCard.gradients.length),
      );
    });

    test('التوزيع يتبع المرجع حيث يعرفه', () {
      // أربعة من الستة لها لونٌ محدَّد في مرجع التصميم (`CATS[].grad`).
      //
      // [STAGE 12] القيم محدَّثة إلى اللوحة المعتمدة. تُكتب هنا حرفياً عمداً
      // ولا تُقرأ من `AppColors`: اختبارٌ يقرأ المصدر الذي يفحصه لا يحرس
      // شيئاً. «حقائب» كان أخضر→أزرق، والأخضر لونٌ وظيفي لا لون علامة.
      const fromReference = {
        'قرطاسية': [Color(0xFFE09A3E), Color(0xFFF0459B)],
        'ملابس': [Color(0xFF4FA3F0), Color(0xFF8B5CF6)],
        'حقائب': [Color(0xFF4FA3F0), Color(0xFF3B2FA8)],
        'إكسسوارات': [Color(0xFFF0459B), Color(0xFF8B5CF6)],
        'منتجات أنمي متنوعة': [Color(0xFFF6C144), Color(0xFFF573B3)],
      };
      for (final entry in fromReference.entries) {
        expect(
          AnimeCategoryCard.gradientForCategory(
            Category(id: 'any', name: entry.key),
          ),
          entry.value,
          reason: entry.key,
        );
      }
    });
  });

  group('البطاقة والترويسة تستعملان المصدر نفسه', () {
    for (final dark in [false, true]) {
      final mode = dark ? 'داكن' : 'فاتح';
      for (final size in const <String, Size>{
        'هاتف': Size(412, 892),
        'لوح': Size(834, 1112),
      }.entries) {
        testWidgets('البطاقات الستة تُبنى بترتيبها — $mode — ${size.key}', (
          tester,
        ) async {
          tester.view.physicalSize = size.value;
          tester.view.devicePixelRatio = 1.0;
          addTearDown(tester.view.reset);

          final ordered = sortByCanonicalOrder(_devCategories);
          await tester.pumpWidget(
            MaterialApp(
              theme: AppTheme.light,
              darkTheme: AppTheme.dark,
              themeMode: dark ? ThemeMode.dark : ThemeMode.light,
              locale: const Locale('ar'),
              supportedLocales: const [Locale('ar')],
              localizationsDelegates: const [
                GlobalMaterialLocalizations.delegate,
                GlobalWidgetsLocalizations.delegate,
                GlobalCupertinoLocalizations.delegate,
              ],
              home: Scaffold(
                body: ListView(
                  children: [
                    for (final category in ordered)
                      AnimeCategoryCard(category: category),
                  ],
                ),
              ),
            ),
          );
          await tester.pump();

          // الستة كلها موجودة.
          for (final name in _expectedOrder) {
            expect(find.text(name), findsOneWidget, reason: name);
          }

          // وبالترتيب المطلوب رأسياً — لا مجرد وجود ستة نصوص.
          final tops = [
            for (final name in _expectedOrder)
              tester.getRect(find.text(name)).top,
          ];
          for (var i = 1; i < tops.length; i++) {
            expect(
              tops[i],
              greaterThan(tops[i - 1]),
              reason: '«${_expectedOrder[i]}» يجب أن تلي «${_expectedOrder[i - 1]}»',
            );
          }

          // RTL: البطاقة تبدأ من اليمين.
          expect(
            tester.getRect(find.text(_expectedOrder.first)).right,
            greaterThan(size.value.width / 2),
          );

          expect(tester.takeException(), isNull);
        });
      }
    }

    test('[CRITICAL] الترويسة تقرأ نفس الدالة التي تقرؤها البطاقة', () {
      // شاشة منتجات القسم تبني تدرّجها من `gradientForCategory` نفسها؛
      // هذا الاختبار يثبّت أن المصدر واحد فلا ينفصل اللونان.
      for (final category in _devCategories) {
        final fromCard = AnimeCategoryCard.gradientForCategory(category);
        final fromHeader = AnimeCategoryCard.gradientForCategory(
          Category(id: category.id, name: category.name),
        );
        expect(fromHeader, fromCard, reason: category.name);
      }
    });
  });
}
