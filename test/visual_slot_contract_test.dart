// عقد مواضع الرسوم: موضعٌ واحد = مفتاحٌ واحد = صورةٌ واحدة.
//
// [PRODUCT] منذ 2026-09-27 لا تُدار الرسوم من اللوحة: الصورة لكل موضع أصلٌ
// ثابت في `CharacterArt` (يحرس أصولها `character_art_test.dart`). العقد هنا
// باقٍ لأن المفتاح ما زال هويّة الموضع التي يُقرأ بها أصله.
//
// [CRITICAL] المفتاح موضعٌ لا شخصية. مفتاحٌ يستهلكه ملفان هو موضعان تحت
// مفتاحٍ واحد: تُبدَّل شخصية شاشةٍ فتتبدّل في أخرى. هكذا كانت
// `register_character` (إنشاء الحساب + شاشة الانتظار) و`auth_cta_character`
// (ثلاث شاشات) و`guest_prompt_character` (السلة + المفضلة) قبل الهجرة ٠٥٤.
// هذا الملف يمنع عودة الاشتراك من أي باب: مكوّنٌ مشترك بمفتاحٍ افتراضي، مفتاحٌ
// حرفيٌّ خارج الثوابت، ثابتٌ يذكره أكثر من ملف، أو مفتاحٌ متقاعد يعود.
//
// (كان للعقد ضلعٌ خادمي — الثوابت == صفوف القاعدة == اللوحة — أُزيل مع
// جدول `visual_slots` في الهجرة 065.)

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/l10n/app_strings.dart';
import 'package:otaku_galaxy/features/visuals/domain/visual_slot.dart';

const _slotsFile = 'lib/features/visuals/domain/visual_slot.dart';

/// `اسم الثابت → قيمته` من ملف الثوابت نفسه (لا من `all`، كي يُقارَنا).
Map<String, String> _declared() {
  final source = File(_slotsFile).readAsStringSync();
  return {
    for (final m in RegExp(r"static const String (\w+) = '([a-z0-9_]+)';").allMatches(source))
      m.group(1)!: m.group(2)!,
  };
}

/// ملفات دارت في lib/ عدا ملف الثوابت، بنصّها **بلا تعليقات** — التعليق يذكر
/// مفتاحاً للشرح لا للاستهلاك.
Map<String, String> _libSources() {
  final files = <String, String>{};
  for (final entity in Directory('lib').listSync(recursive: true)) {
    if (entity is! File || !entity.path.endsWith('.dart')) continue;
    if (entity.path.endsWith('visual_slot.dart')) continue;
    final code = entity
        .readAsLinesSync()
        .where((line) => !line.trimLeft().startsWith('//'))
        .join('\n');
    files[entity.path] = code;
  }
  return files;
}

/// ثوابت يُبنى موضعُها الواحد من سطرين في الملف نفسه — مع السبب.
//
// `homeHero` و`homePromoPrimary` خرجا منها (2026-09-28): رسم البنر صار
// مكوّناً واحداً (`_BannerArt`) يأخذ الفتحة مرّة، والبطاقة الترويجية الأولى
// المضمَّنة — السطر الثاني لـ`homePromoPrimary` — أُزيلت.
const _twoSitesOneLocation = <String, String>{
  'homePromoSecondary': 'البطاقات من الثانية فصاعداً: بنرات مُدارة أو بطاقة «خصومات فعّالة»',
};

/// من يستهلك فتحات التجزئة — كل مفتاحٍ ملفُه هو.
//
// فتحات زاوية بطاقة النموذج (`loginCta`، `registerCta`، `forgotPasswordCta`)
// ودعوة الزائر (`cartGuestPrompt`، `favoritesGuestPrompt`) خرجت (2026-09-28):
// أُزيلت رسومها مع كل رسمٍ مجاورٍ للأزرار، فصارت مفاتيح متقاعدة أدناه.
const _splitOwners = <String, String>{
  'registerHeader': 'register_screen.dart',
  'registerPending': 'account_pending_screen.dart',
  'forgotPasswordHeader': 'forgot_password_screen.dart',
  'forgotPasswordPending': 'account_pending_screen.dart',
};

const _retiredKeys = [
  'home_categories_backdrop',
  'otp_character',
  'social_tiktok',
  'social_instagram',
  'social_whatsapp',
  'register_character',
  'forgot_password_character',
  'auth_cta_character',
  'guest_prompt_character',
  'account_character',
  // زاوية زرّ الدفع في السلة: أُزيل رسمها (2026-09-27) فلا موضع له.
  'cart_checkout_character',
  // رسومٌ بجوار الأزرار — أُزيلت (2026-09-28).
  'login_cta_character',
  'register_cta_character',
  'forgot_password_cta_character',
  'cart_guest_prompt_character',
  'favorites_guest_prompt_character',
  // صورٌ حذفها المالك (2026-09-28): 4 (البطاقة الترويجية الأولى)، 22 (تأكيد
  // الاستلام)، 27 («قيّم المنتج»).
  'home_promo_primary_character',
  'delivery_confirmation_character',
  'write_review_character',
];

void main() {
  final declared = _declared();
  final sources = _libSources();

  group('الفهرس المعلَن', () {
    test('`all` هي الثوابت المعلَنة حرفياً — لا مفتاح خارجها ولا مكرّر', () {
      expect(VisualSlots.all.toSet(), declared.values.toSet());
      expect(VisualSlots.all.length, declared.length);
      expect(VisualSlots.all.toSet().length, VisualSlots.all.length);
    });

    test('كل مفتاح بصيغة موحّدة وينتهي بـ`_character` — مواضعُ شخصيات لا غير', () {
      final pattern = RegExp(r'^[a-z][a-z0-9_]{2,48}$');
      for (final key in VisualSlots.all) {
        expect(pattern.hasMatch(key), isTrue, reason: 'مفتاح غير صالح: $key');
        expect(key.endsWith('_character'), isTrue, reason: 'ليس فتحة شخصية: $key');
      }
    });

    test('[CRITICAL] المفاتيح المتقاعدة — ومنها المشتركة القديمة — لا تعود', () {
      for (final key in _retiredKeys) {
        expect(VisualSlots.all, isNot(contains(key)), reason: key);
      }
      final splitKeys = [
        'register_header_character',
        'register_pending_character',
        'forgot_password_header_character',
        'forgot_password_pending_character',
      ];
      for (final key in splitKeys) {
        expect(VisualSlots.all, contains(key), reason: key);
      }
    });
  });

  group('[CRITICAL] موضعٌ واحد لكل فتحة', () {
    test('كل ثابت يستهلكه ملفٌ واحد في lib/ — ولا ثابت بلا مستهلك', () {
      final offenders = <String>[];
      for (final name in declared.keys) {
        final pattern = RegExp('\\bVisualSlots\\.$name\\b');
        final consumers = sources.entries.where((e) => pattern.hasMatch(e.value)).map((e) => e.key).toList()
          ..sort();
        if (consumers.length != 1) {
          offenders.add('$name → ${consumers.isEmpty ? 'بلا مستهلك' : consumers.join(' · ')}');
        }
      }
      expect(
        offenders,
        isEmpty,
        reason: 'فتحة بغير ملفٍ واحد (موضعان تحت مفتاح، أو فتحة ميتة):\n${offenders.join('\n')}',
      );
    });

    test('داخل الملف الواحد: سطرٌ واحد لكل ثابت إلا ما وُثّق كموضعٍ واحدٍ بسطرين', () {
      final offenders = <String>[];
      for (final name in declared.keys) {
        final pattern = RegExp('\\bVisualSlots\\.$name\\b');
        final hits = sources.values.fold<int>(0, (n, code) => n + pattern.allMatches(code).length);
        final allowed = _twoSitesOneLocation.containsKey(name) ? 2 : 1;
        if (hits != allowed) offenders.add('$name: $hits مواضع (المسموح $allowed)');
      }
      expect(offenders, isEmpty, reason: offenders.join('\n'));
      // والاستثناءات مسمّاةٌ وموجودة — لا استثناء لثابتٍ زال.
      for (final name in _twoSitesOneLocation.keys) {
        expect(declared, contains(name), reason: name);
      }
    });

    test('[CRITICAL] لا مفتاح افتراضي في مكوّنٍ مشترك — الشاشة هي التي تمرّر فتحتها', () {
      // كان `AnimeGuestPrompt` يحمل `artworkSlot = VisualSlots.guestPrompt`
      // فخدم السلة والمفضلة بفتحةٍ واحدة. المكوّن لا يعرف موضعه.
      final shared = sources.entries
          .where((e) => e.key.contains('/core/design_system/'))
          .where((e) => e.value.contains('VisualSlots.'))
          .map((e) => e.key)
          .toList();
      expect(shared, isEmpty, reason: 'مكوّنات مشتركة تحمل مفتاح فتحة:\n${shared.join('\n')}');
    });

    test('لا مفتاح فتحة حرفيٌّ خارج ملف الثوابت — لا التفاف على الثوابت', () {
      final literal = RegExp(r"'[a-z0-9_]+_character'");
      final offenders = <String>[];
      sources.forEach((path, code) {
        for (final m in literal.allMatches(code)) {
          offenders.add('$path: ${m.group(0)}');
        }
      });
      expect(offenders, isEmpty, reason: offenders.join('\n'));
      // ولا مفتاح متقاعد كنصّ في أي مكان من lib/.
      for (final key in _retiredKeys) {
        final users = sources.entries.where((e) => e.value.contains("'$key'")).map((e) => e.key);
        expect(users, isEmpty, reason: 'مفتاح متقاعد ما يزال في: ${users.join(', ')}');
      }
    });

    test('فتحات التجزئة يملكها كلٌّ ملفُه المتوقَّع', () {
      _splitOwners.forEach((name, file) {
        final pattern = RegExp('\\bVisualSlots\\.$name\\b');
        final owners = sources.entries.where((e) => pattern.hasMatch(e.value)).map((e) => e.key).toList();
        expect(owners, hasLength(1), reason: name);
        expect(owners.single.endsWith(file), isTrue, reason: '$name في ${owners.single} لا $file');
      });
    });
  });

  group('الأصول المضمَّنة', () {
    test('كل أصل رسمٍ مذكور في lib/ موجودٌ في الحزمة — لا بديلَ يترك فراغاً', () {
      final asset = RegExp(r"'(assets/art/[^']+\.(?:png|jpg|webp))'");
      final missing = <String>{};
      for (final code in sources.values) {
        for (final m in asset.allMatches(code)) {
          final path = m.group(1)!;
          if (!File(path).existsSync()) missing.add(path);
        }
      }
      expect(missing, isEmpty, reason: 'أصول مفقودة: ${missing.join(', ')}');
    });

    test('الشاشات التي تسبق الاتصال أصولُها مضمَّنة بلا فتحات: التحديث الإلزامي، البداية', () {
      for (final path in [
        'lib/features/app_update/presentation/screens/force_update_screen.dart',
        'lib/features/splash/presentation/widgets/splash_backdrop.dart',
      ]) {
        final code = sources[path];
        expect(code, isNotNull, reason: path);
        expect(code, isNot(contains('CharacterArtwork')), reason: path);
        expect(code, isNot(contains('VisualSlots.')), reason: path);
        // [PRODUCT] شاشة التحديث الإلزامي نصٌّ وواجهة فقط — لا رسم شخصية أصلاً.
        if (path.contains('force_update')) {
          expect(code, isNot(contains('assets/art/')), reason: path);
        }
      }
      for (final key in VisualSlots.all) {
        for (final word in ['splash', 'logo', 'brand', 'update', 'social']) {
          expect(key.contains(word), isFalse, reason: 'فتحة ممنوعة: $key');
        }
      }
    });

    test('شاشة انقطاع الاتصال موضعٌ (٠٥٥) بأصلٍ مضمَّن — لا شبكة ولا فراغ', () {
      final code = sources['lib/features/connectivity/presentation/offline_gate.dart'];
      expect(code, isNotNull);
      expect(code, contains('VisualSlots.offlineGate'));
      // الموضع وحده يحدّد الصورة (`CharacterArt`) — لا أصلَ احتياطياً ثانياً.
      expect(code, isNot(contains('fallbackAsset')));
      expect(CharacterArt.forSlot(VisualSlots.offlineGate), isNotNull);
      expect(VisualSlots.all, contains(VisualSlots.offlineGate));
    });
  });

  group('النصوص التي أُزيلت لا تعود', () {
    test('لا جملة «مجموعاتك خاصة بك…» ولا «يحتاج المتجر إلى اتصال»', () {
      expect(AppStrings.keys, isNot(contains('collectionsArePrivate')));
      for (final key in AppStrings.keys) {
        expect(AppStrings.arabic(key), isNot(contains('خاصة بك ولا تظهر')), reason: key);
        expect(AppStrings.arabic(key), isNot(contains('يحتاج المتجر')), reason: key);
      }
      sources.forEach((path, code) {
        expect(code, isNot(contains('خاصة بك ولا تظهر')), reason: path);
        expect(code, isNot(contains('يحتاج المتجر')), reason: path);
        expect(code, isNot(contains('collectionsArePrivate')), reason: path);
      });
    });
  });
}
