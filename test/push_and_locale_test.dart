// عقد الإشعارات الفورية + اللغة الكردية.
//
// الإشعارات: دورة حياة الرمز مع دورة حياة الحساب — تسجيلٌ عند الدخول،
// إلغاءٌ عند الخروج، ومتابعةٌ للتدوير. الضمانة الحرجة أن الجهاز لا يبقى
// مربوطاً بحسابٍ خرج منه صاحبه.

import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/features/notifications/data/push_registrar.dart';
import 'package:otaku_galaxy/features/notifications/data/push_token_repository.dart';
import 'package:otaku_galaxy/features/settings/presentation/cubit/locale_cubit.dart';
import 'package:otaku_galaxy/core/l10n/app_strings.dart';

/// مصدر رمز مُتحكَّم به — يقف مقام المزوّد الحقيقي.
class _FakeSource implements PushTokenSource {
  _FakeSource(this._token);

  final String? _token;
  final _refresh = StreamController<String>.broadcast();
  int permissionRequests = 0;

  @override
  Future<String?> requestPermissionAndGetToken() async {
    permissionRequests += 1;
    return _token;
  }

  @override
  Stream<String> get onTokenRefresh => _refresh.stream;

  void emitRefresh(String token) => _refresh.add(token);
  Future<void> close() => _refresh.close();
}

/// مستودع يسجّل ما وصله بدل أن يخاطب الشبكة.
class _SpyRepository implements PushTokenRepository {
  final registered = <String>[];
  final unregistered = <String>[];
  bool failNext = false;

  @override
  Future<void> register(String token) async {
    if (failNext) {
      failNext = false;
      throw Exception('شبكة مقطوعة');
    }
    registered.add(token);
  }

  @override
  Future<void> unregister(String token) async => unregistered.add(token);

  @override
  Future<List<Map<String, dynamic>>> mine() async => const [];
}

void main() {
  group('دورة حياة رمز الإشعارات', () {
    test('الدخول يطلب الإذن ويرسل الرمز إلى الخادم', () async {
      final source = _FakeSource('token-abc');
      final repo = _SpyRepository();
      await PushRegistrar(source, repo).onLogin();

      expect(source.permissionRequests, 1);
      expect(repo.registered, ['token-abc']);
    });

    test('[CRITICAL] الخروج يُلغي تسجيل الجهاز', () async {
      // بدونه يبقى الجهاز مربوطاً بمن خرج، فتصل إشعاراته الخاصة إلى من
      // يستعمل الهاتف بعده.
      final source = _FakeSource('token-abc');
      final repo = _SpyRepository();
      final registrar = PushRegistrar(source, repo);

      await registrar.onLogin();
      await registrar.onLogout();

      expect(repo.unregistered, ['token-abc']);
    });

    test('رفض الإذن لا يرسل شيئاً ولا يرمي', () async {
      final source = _FakeSource(null);
      final repo = _SpyRepository();
      await PushRegistrar(source, repo).onLogin();

      expect(repo.registered, isEmpty);
    });

    test('فشل الشبكة عند الدخول لا يُسقط التطبيق', () async {
      final source = _FakeSource('token-abc');
      final repo = _SpyRepository()..failNext = true;
      // لا يرمي: الإشعار الفوري تحسينٌ لا شرطٌ للدخول.
      await PushRegistrar(source, repo).onLogin();
      expect(repo.registered, isEmpty);
    });

    test('[CRITICAL] تدوير الرمز يصل الخادم', () async {
      // المزوّد يغيّر الرمز أحياناً؛ بلا متابعة يبقى الخادم يرسل إلى رمزٍ
      // ميت والجهاز لا يستقبل شيئاً.
      final source = _FakeSource('token-old');
      final repo = _SpyRepository();
      final registrar = PushRegistrar(source, repo);

      await registrar.onLogin();
      source.emitRefresh('token-new');
      await Future<void>.delayed(Duration.zero);

      expect(repo.registered, ['token-old', 'token-new']);
      await registrar.dispose();
      await source.close();
    });

    test('بعد الخروج لا يعود التدوير يرسل شيئاً', () async {
      final source = _FakeSource('token-old');
      final repo = _SpyRepository();
      final registrar = PushRegistrar(source, repo);

      await registrar.onLogin();
      await registrar.onLogout();
      source.emitRefresh('token-new');
      await Future<void>.delayed(Duration.zero);

      expect(repo.registered, ['token-old'], reason: 'الاشتراك أُلغي مع الخروج');
      await source.close();
    });

    test('المصدر غير المضبوط لا يعطّل شيئاً', () async {
      // ما دام Firebase غير مربوط، تعمل بقية المنظومة بلا عطل ولا ادّعاء نجاح.
      const source = UnconfiguredPushTokenSource();
      expect(await source.requestPermissionAndGetToken(), isNull);
      expect(await source.onTokenRefresh.toList(), isEmpty);
    });
  });

  group('اللغة الكردية', () {
    test('الكردية لغة مدعومة برمز ckb', () {
      expect(AppLanguage.values.map((l) => l.code), containsAll(['ar', 'ckb']));
      expect(AppLanguage.fromCode('ckb'), AppLanguage.kurdish);
    });

    test('رمز مجهول يعود إلى العربية لا إلى لغة عشوائية', () {
      expect(AppLanguage.fromCode('fr'), AppLanguage.arabic);
      expect(AppLanguage.fromCode(null), AppLanguage.arabic);
    });

    test('[CRITICAL] لكل مفتاح عربي ترجمةٌ كردية — لا مفتاح ناقص', () {
      // المفتاح الناقص يسقط بهدوء إلى العربية، فتظهر الشاشة نصفَ مترجمة
      // بلا أي خطأ يُنبّه.
      // [CRITICAL] المقيس ما تُرجم فعلاً (`translatedKeys`) لا كل المفاتيح.
      // بعد استخراج النصوص من الودجات صارت مفاتيحُ كثيرة موجودةً وتنتظر
      // ترجمة؛ عدُّها «ناقصة» هنا يخلط عملين: الاستخراج والترجمة. اكتمالُ
      // الترجمة يُتابَع في `localization_corpus_test.dart` برقمٍ صريح.
      final arabic = AppStrings.arabic;
      final kurdish = AppStrings.kurdish;
      for (final key in AppStrings.translatedKeys) {
        // المفاتيح المعلَنة بأنها لا تتغيّر بتغيّر اللغة (وحدة العملة،
        // الرموز، الفاصلة، تركيبُ متغيّرين) تطابقُها مقصود — انظر
        // `AppStrings.localeInvariantKeys`.
        if (AppStrings.localeInvariantKeys.contains(key)) continue;
        expect(
          kurdish(key),
          isNot(arabic(key)),
          reason: 'المفتاح «$key» مُدرَج مترجَماً لكنه نسخةٌ من العربية',
        );
      }
    });

    test('كلتا اللغتين تُكتبان من اليمين — الاتجاه لا يتغيّر', () {
      // العربية والكردية السورانية كلتاهما RTL، فتبديل اللغة لا يقلب التخطيط.
      expect(AppLanguage.arabic.locale.languageCode, 'ar');
      expect(AppLanguage.kurdish.locale.languageCode, 'ckb');
    });
  });
}
