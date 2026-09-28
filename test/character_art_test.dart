// رسوم الشخصيات الثابتة المرقَّمة — صورةٌ فريدة لكل رقم، والجدول في الكود.
//
// [CRITICAL] (2026-09-27) كل رسم شخصيةٍ معروضٍ في التطبيق ملفٌّ في
// `assets/art/characters/` باسمٍ رقمي `N.png`، صورةٌ فريدة لكل رقم وكلّها
// مستعملة. المواضع التي تعرض الصورة نفسها تشير إلى الرقم نفسه (لا نسخ
// مكرَّرة)، والجدول موضع ← رقم في `CharacterArt` وحده.
//
// [PRODUCT] (2026-09-28) الأرقام عناوين ثابتة: حُذفت 2 و4 و9 و10 و14 و22 و27
// و36 و37 بطلب المالك وصارت فجواتٍ **موثّقة** ([_retired]) — لا يُعاد ترقيم
// ما بقي (المالك يسمّي الصور بأرقامها) ولا يُملأ رقمٌ محذوف. فجوةٌ غير موثّقة
// ما تزال خطأً. أربعٌ منها كانت نسخاً لصورٍ باقية بدقّةٍ أخرى (2≈34، 14≈38،
// 36≈32، 9 و10≈29) — ولهذا حارسُ التشابه البصري أدناه.
//
// الطريقة المقصودة لتغيير شخصية هي **استبدال محتوى ملفّها** بصورةٍ أخرى
// بالاسم نفسه — لذلك لا يثبّت هذا الاختبار بصمات الصور (كان سيفشل عند كل
// استبدال مقصود)، بل البنية: لا فجوة إلا الموثّقة، كل رقمٍ مستعمل، كل موضعٍ
// يشير إلى ملفٍّ موجود، لا مسار قديم في أي مكان، لا صورتان متطابقتان، وكل
// ملف يُفكّ ترميزه صورةً.

import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/constants/api_endpoints.dart';
import 'package:otaku_galaxy/features/visuals/domain/visual_slot.dart';
import 'package:otaku_galaxy/features/visuals/presentation/character_artwork.dart';

const _dir = 'assets/art/characters';
const _self = 'test/character_art_test.dart';
const _mappingFile = 'lib/features/visuals/domain/visual_slot.dart';

/// رقم ملف كل موضع — ثابت. تبديلُ رقمين هنا أو في [CharacterArt] يعني أن
/// شاشتين تتبادلان صورتيهما بصمت؛ فأيّ تغييرٍ في هذا الجدول قرارٌ مقصود.
/// الأرقام المكرَّرة مقصودة: المواضع التي تعرض الصورة نفسها.
const _slotNumbers = <String, int>{
  'login_character': 1,
  'register_header_character': 3,
  'register_pending_character': 5,
  'forgot_password_header_character': 6,
  'forgot_password_pending_character': 8,
  'home_hero_character': 29,
  'home_promo_secondary_character': 29,
  'home_delivery_character': 11,
  'empty_cart_character': 12,
  'empty_favorites_character': 13,
  'categories_header_character': 38,
  'category_products_header_character': 15,
  'empty_category_products_character': 15,
  'product_detail_character': 16,
  'product_detail_reviews_character': 17,
  'search_header_character': 12,
  'empty_search_character': 18,
  'orders_header_character': 19,
  'empty_orders_character': 20,
  'order_success_character': 21,
  'points_character': 23,
  'community_header_character': 24,
  'community_empty_character': 25,
  'community_gallery_character': 25,
  'product_reviews_character': 26,
  'rate_order_character': 28,
  'review_submitted_character': 29,
  'collections_tab_character': 30,
  'notifications_header_character': 31,
  'onboarding_slide_one_character': 32,
  'onboarding_slide_two_character': 33,
  'onboarding_slide_three_character': 19,
  'personalize_character': 34,
  'offline_gate_character': 35,
};

/// الرسوم الثابتة خارج `VisualSlots` وأرقامها.
const _fixedNumbers = <String, int>{
  CharacterArt.splashBackdrop: 32,
  CharacterArt.onboardingProductPhoto: 7,
  CharacterArt.emptyCollection: 38,
};

/// الأرقام المحذوفة (2026-09-28) — فجواتٌ مقصودة لا تُملأ ولا يُشار إليها.
const _retired = <int, String>{
  2: 'copy of 34; its only location (login form-card corner beside the button) was removed',
  4: 'deleted; register form-card corner, guest prompts, first promo fallback, splash small art removed',
  9: 'copy of 29 (JPEG with a baked checkerboard); home hero now uses 29',
  10: 'copy of 29; promo cards now use 29',
  14: 'copy of 38; categories header now uses 38',
  22: 'deleted; delivery-confirmation sheet has no character',
  27: 'deleted; write-review header has no character',
  36: 'copy of 32; splash backdrop now uses 32',
  37: 'deleted; empty categories state has no character',
};

/// مواضع أُزيلت رسومها (2026-09-28) — لا تعود فتحاتٍ.
const _removedSlots = [
  'login_cta_character',
  'register_cta_character',
  'forgot_password_cta_character',
  'cart_guest_prompt_character',
  'favorites_guest_prompt_character',
  'home_promo_primary_character',
  'delivery_confirmation_character',
  'write_review_character',
];

/// أقصى مسافة هامينغ (من ٢٥٦) بين بصمتَي تدرّجٍ لصورتين تُعدّان نسخةً واحدة.
///
/// مقيسةً بهذه الدالّة نفسها (2026-09-28): النسخ الأربع التي حذفها المالك
/// كانت على بُعد 7 (36↔32) و14 (14↔38) و22 (2↔34) و37 (10↔29، قصٌّ آخر
/// للصورة نفسها) من أصولها، وأقرب صورتين مختلفتين حقّاً في المجلّد على بُعد
/// 51 (16↔38). ٤٠ تلتقط النسخ الأربع كلّها وتبقى دون أقرب صورتين مختلفتين.
/// زُرعت النسخ المحذوفة في المجلّد مؤقّتاً فأفشلت هذا الحارس.
const _nearDuplicateBits = 40;

final _numbered = RegExp(r'^[1-9][0-9]*\.png$');
final _numberedPath = RegExp('^$_dir/[1-9][0-9]*\\.png\$');

/// كل مسارٍ يعرضه التطبيق: مواضع `VisualSlots` + الرسوم الثابتة.
Set<String> _usedPaths() => {...CharacterArt.assets.values, ...CharacterArt.fixed};

Set<String> _fileNames() =>
    Directory(_dir).listSync().whereType<File>().map((f) => f.uri.pathSegments.last).toSet();

int _numberOf(String name) => int.parse(name.substring(0, name.length - 4));

/// بصمة تدرّج (dHash) ١٦×١٦: الصورة مصغّرةً إلى ١٧×١٦ فوق رماديٍّ محايد
/// (للشفافية)، وكل بِتٍّ «أهذا البكسل أفتح من جاره الأيمن؟». تتحمّل تغيير
/// الدقّة وإعادة الضغط وتتغيّر مع المحتوى.
Future<List<bool>> _dHash(Uint8List bytes) async {
  final codec = await ui.instantiateImageCodec(bytes, targetWidth: 17, targetHeight: 16);
  final frame = await codec.getNextFrame();
  final data = (await frame.image.toByteData(format: ui.ImageByteFormat.rawRgba))!;
  frame.image.dispose();
  codec.dispose();
  // `rawRgba` مضروبٌ مسبقاً في الشفافية: التركيب فوق رمادي ١٢٨ جمعٌ فقط.
  double luma(int x, int y) {
    final i = (y * 17 + x) * 4;
    final back = 128 * (255 - data.getUint8(i + 3)) / 255;
    return 0.299 * (data.getUint8(i) + back) +
        0.587 * (data.getUint8(i + 1) + back) +
        0.114 * (data.getUint8(i + 2) + back);
  }

  return [
    for (var y = 0; y < 16; y++)
      for (var x = 0; x < 16; x++) luma(x, y) > luma(x + 1, y),
  ];
}

int _hamming(List<bool> a, List<bool> b) {
  var d = 0;
  for (var i = 0; i < a.length; i++) {
    if (a[i] != b[i]) d++;
  }
  return d;
}

Iterable<File> _dartFiles(String root) => Directory(root)
    .listSync(recursive: true)
    .whereType<File>()
    .where((f) => f.path.endsWith('.dart'));

bool _sameBytes(Uint8List a, Uint8List b) {
  if (a.length != b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i] != b[i]) return false;
  }
  return true;
}

void main() {
  group('[CRITICAL] الأرقام: فجواتٌ موثّقة وحدها، صورةٌ فريدة لكل رقم، كلها مستعملة', () {
    test('المجلّد فيه `N.png` وحدها — لا اسم وصفي، ولا فجوة إلا رقمٌ محذوف موثّق', () {
      final names = _fileNames();
      final offenders = names.where((n) => !_numbered.hasMatch(n)).toList();
      expect(offenders, isEmpty, reason: 'non-numbered names: $offenders');
      final numbers = names.map(_numberOf).toSet();
      final max = numbers.reduce((a, b) => a > b ? a : b);
      final gaps = {for (var n = 1; n <= max; n++) n}.difference(numbers);
      expect(gaps, _retired.keys.toSet(), reason: 'every gap must be a documented retired number');
      expect(numbers.intersection(_retired.keys.toSet()), isEmpty, reason: 'a retired number came back');
    });

    test('الأرقام المحذوفة لا يُشار إليها من أي موضع ولا من أي رسمٍ ثابت', () {
      final retiredPaths = {for (final n in _retired.keys) '$_dir/$n.png'};
      expect(_usedPaths().intersection(retiredPaths), isEmpty);
      for (final key in _removedSlots) {
        expect(VisualSlots.all, isNot(contains(key)), reason: key);
        expect(CharacterArt.assets.containsKey(key), isFalse, reason: key);
      }
    });

    test('N = عدد الصور المستعملة: كل ملفٍّ مستعمل، ولا مسار مستعمل بلا ملف', () {
      final used = _usedPaths();
      final files = {for (final n in _fileNames()) '$_dir/$n'};
      expect(files.difference(used), isEmpty, reason: 'ملفات غير مستعملة');
      expect(used.difference(files), isEmpty, reason: 'مسارات بلا ملف');
    });

    test('كل مواضع VisualSlots في الجدول، وكلٌّ يشير إلى رقمه الثابت', () {
      expect(CharacterArt.assets.keys.toSet(), VisualSlots.all.toSet());
      expect(_slotNumbers.keys.toSet(), VisualSlots.all.toSet());
      for (final slot in VisualSlots.all) {
        expect(CharacterArt.forSlot(slot), '$_dir/${_slotNumbers[slot]}.png', reason: slot);
      }
    });

    test('الرسوم الثابتة خارج VisualSlots مرقَّمة ولها أرقامها الثابتة', () {
      expect(CharacterArt.fixed.toSet(), _fixedNumbers.keys.toSet());
      _fixedNumbers.forEach((path, n) {
        expect(path, '$_dir/$n.png');
        expect(File(path).existsSync(), isTrue, reason: path);
      });
    });

    test('الصورة المشتركة رقمٌ واحد — لا نسخ لموضعين', () {
      // المواضع التي تعرض الصورة نفسها.
      for (final group in [
        [VisualSlots.emptyCart, VisualSlots.searchHeader],
        [VisualSlots.categoryProductsHeader, VisualSlots.emptyCategoryProducts],
        [VisualSlots.ordersHeader, VisualSlots.onboardingSlideThree],
        [VisualSlots.communityEmpty, VisualSlots.communityGallery],
        [VisualSlots.homeHero, VisualSlots.homePromoSecondary, VisualSlots.reviewSubmitted],
      ]) {
        expect(group.map(CharacterArt.forSlot).toSet(), hasLength(1), reason: '$group');
      }
      expect(CharacterArt.splashBackdrop, CharacterArt.forSlot(VisualSlots.onboardingSlideOne));
      expect(CharacterArt.emptyCollection, CharacterArt.forSlot(VisualSlots.categoriesHeader));
    });

    test('الاستبدالات (2026-09-28): 14→38، 2→34، 9 و10→29، 36→32 — بلا نسخةٍ ثانية', () {
      // 14 → 38: ترويسة الأقسام تعرض 38 نفسها التي تعرضها المجموعة الفارغة.
      expect(CharacterArt.forSlot(VisualSlots.categoriesHeader), '$_dir/38.png');
      // 9 و10 → 29: البطل وبطاقات الترويج وشاشة «تم إرسال التقييم» ملفٌّ واحد.
      expect(CharacterArt.forSlot(VisualSlots.homeHero), '$_dir/29.png');
      expect(CharacterArt.forSlot(VisualSlots.homePromoSecondary), '$_dir/29.png');
      // 36 → 32: خلفية البداية هي صورة الشريحة الأولى نفسها.
      expect(CharacterArt.splashBackdrop, '$_dir/32.png');
      // 2 → 34: موضع 2 الوحيد (زاوية بطاقة الدخول بجوار الزرّ) أُزيل مع كل
      // رسمٍ مجاورٍ للأزرار، فلا موضع يُنقل؛ 34 تبقى صورة التخصيص وحدها.
      expect(CharacterArt.forSlot(VisualSlots.personalize), '$_dir/34.png');
      // ولا ملفّ جديد: الأهداف هي الملفات القديمة نفسها، وكلٌّ رقمٌ واحد.
      for (final n in [29, 32, 34, 38]) {
        expect(File('$_dir/$n.png').existsSync(), isTrue, reason: '$n.png');
      }
    });

    testWidgets('[CRITICAL] لا صورتان متطابقتان — ولا نسخةٌ بدقّةٍ أخرى تحت رقمٍ آخر', (tester) async {
      await tester.runAsync(() async {
        final names = _fileNames().toList()..sort((a, b) => _numberOf(a) - _numberOf(b));
        final bytes = {for (final n in names) n: File('$_dir/$n').readAsBytesSync()};
        final hashes = {for (final n in names) n: await _dHash(bytes[n]!)};
        final identical = <String>[];
        final similar = <String>[];
        for (var i = 0; i < names.length; i++) {
          for (var j = i + 1; j < names.length; j++) {
            final a = names[i], b = names[j];
            if (_sameBytes(bytes[a]!, bytes[b]!)) identical.add('$a = $b');
            final d = _hamming(hashes[a]!, hashes[b]!);
            if (d <= _nearDuplicateBits) similar.add('$a ≈ $b ($d/256)');
          }
        }
        expect(identical, isEmpty, reason: 'byte-identical copies');
        expect(similar, isEmpty, reason: 'the same picture under two numbers — point both locations at one');
      });
    });

    testWidgets('كل ملفٍّ يُفكّ ترميزه صورةً — PNG أو JPEG، فالامتداد لا يقرّر', (tester) async {
      // Flutter يقرأ الصيغة من المحتوى: `7.png` صورة JPEG كما كانت في الأصل. ملفٌّ بديل تالف أو بصيغة لا تُعرض يفشل هنا لا عند الزبون.
      await tester.runAsync(() async {
        for (final name in _fileNames()) {
          final codec = await ui.instantiateImageCodec(File('$_dir/$name').readAsBytesSync());
          final frame = await codec.getNextFrame();
          expect(frame.image.width, greaterThan(0), reason: name);
          frame.image.dispose();
          codec.dispose();
        }
      });
    });
  });

  group('[CRITICAL] لا مسار قديم في أي مكان', () {
    test('لا رسم شخصيةٍ خارج `assets/art/characters/` — و`assets/art/opt/` لم يعد', () {
      final strays = Directory('assets/art')
          .listSync(recursive: true)
          .whereType<File>()
          .map((f) => f.path)
          .where((p) => !p.startsWith('$_dir/'))
          .toList();
      expect(strays, isEmpty);
      expect(Directory('assets/art/opt').existsSync(), isFalse);
    });

    test('pubspec: الرسوم مجلّدٌ واحد، وكل أصلٍ معلَن موجود', () {
      final lines = File('pubspec.yaml').readAsLinesSync();
      final start = lines.indexWhere((l) => l.trim() == 'assets:');
      expect(start, isNot(-1));
      final declared = <String>[];
      for (final line in lines.skip(start + 1)) {
        final t = line.trim();
        if (t.isEmpty || t.startsWith('#')) continue;
        if (!t.startsWith('- ')) break;
        declared.add(t.substring(2).trim());
      }
      expect(declared, contains('$_dir/'));
      for (final path in declared) {
        final exists = path.endsWith('/') ? Directory(path).existsSync() : File(path).existsSync();
        expect(exists, isTrue, reason: 'أصلٌ معلَن غير موجود: $path');
      }
      expect(declared.where((p) => p.startsWith('assets/art/') && p != '$_dir/'), isEmpty);
    });

    test('lib/ وtest/: لا إشارة إلى رقمٍ محذوف', () {
      // النمط يُبنى من [_retired] فلا يطابق هذا الملف نفسه نصّاً.
      final retired = RegExp('characters/(?:${_retired.keys.join('|')})\\.png');
      final offenders = <String>[];
      for (final file in [..._dartFiles('lib'), ..._dartFiles('test'), File('pubspec.yaml')]) {
        if (file.path == _self) continue;
        final lines = file.readAsLinesSync();
        for (var i = 0; i < lines.length; i++) {
          if (retired.hasMatch(lines[i])) offenders.add('${file.path}:${i + 1}');
        }
      }
      expect(offenders, isEmpty);
    });

    test('lib/: كل مسار رسمٍ نصّاً حرفياً رقميٌّ ويعيش في `CharacterArt` وحده', () {
      final literal = RegExp('[\'"](assets/art/[^\'"]*)[\'"]');
      final offenders = <String>[];
      for (final file in _dartFiles('lib')) {
        for (final m in literal.allMatches(file.readAsStringSync())) {
          final path = m.group(1)!;
          if (!_numberedPath.hasMatch(path) || file.path != _mappingFile) {
            offenders.add('${file.path}: $path');
          }
        }
      }
      expect(offenders, isEmpty);
    });

    test('lib/ وtest/: لا ذكر لـ`opt/` ولا لـ`a-l-detective` ولا للأسماء الوصفية القديمة', () {
      // تُبنى الكلمات هنا بالتقسيم كي لا يطابق هذا الملف نفسه.
      final stale = RegExp(
        [
          'assets/art/' 'opt',
          'a-l-' 'detective',
          r'\ba-i[0-9]+\.png',
          r'\b(?:a-luffy-kid|gojo-l|trio-l|mikasa-l)\.png',
          r'characters/(?![0-9]+\.png)[a-z-]+\.(?:png|jpg)',
        ].join('|'),
      );
      final offenders = <String>[];
      for (final file in [..._dartFiles('lib'), ..._dartFiles('test')]) {
        if (file.path == _self) continue;
        final lines = file.readAsLinesSync();
        for (var i = 0; i < lines.length; i++) {
          if (stale.hasMatch(lines[i])) offenders.add('${file.path}:${i + 1}');
        }
      }
      expect(offenders, isEmpty);
    });
  });

  group('[CRITICAL] لا شيء يُجلب من الشبكة', () {
    test('لا نقطة `/catalog/visuals` ولا مستودع رسوم في الكود', () {
      final endpoints = File('lib/core/constants/api_endpoints.dart').readAsStringSync();
      expect(endpoints, isNot(contains('/catalog/visuals')));
      expect(ApiEndpoints.appVersion, isNot(contains('visuals')));
      final offenders = <String>[];
      for (final file in _dartFiles('lib')) {
        // التعليقات توثّق التاريخ (ما كان يُجلب ومن أين)؛ المفحوص هو الكود.
        final code = file
            .readAsLinesSync()
            .where((line) => !line.trimLeft().startsWith('//'))
            .join('\n');
        if (code.contains('VisualsRepository') || code.contains('catalog/visuals')) {
          offenders.add(file.path);
        }
      }
      expect(offenders, isEmpty);
    });

    testWidgets('`CharacterArtwork` يرسم ملفّ الموضع — والموضعان المشتركان الملفّ نفسه', (tester) async {
      await tester.pumpWidget(
        const Directionality(
          textDirection: TextDirection.rtl,
          child: Column(
            children: [
              CharacterArtwork(slot: VisualSlots.login, width: 40, height: 40),
              CharacterArtwork(slot: VisualSlots.homeHero, width: 40, height: 40),
              CharacterArtwork(slot: VisualSlots.reviewSubmitted, width: 40, height: 40),
            ],
          ),
        ),
      );
      final names = tester
          .widgetList<Image>(find.byType(Image))
          .map((i) => (i.image as AssetImage).assetName)
          .toList();
      expect(names, ['$_dir/1.png', '$_dir/29.png', '$_dir/29.png']);
    });
  });
}
