// [CRITICAL REGRESSION GUARD]
//
// مرجع الوسائط المحفوظ محلياً يجب أن يبقى **نسبياً**.
//
// هذا هو بالضبط العطل الذي أُصلح في قاعدة البيانات (هجرة 021): خبْزُ الأصل
// المطلق في القيمة المخزَّنة. الأصل يختلف باختلاف العميل والشبكة —
// `10.0.2.2` من محاكي أندرويد، وعنوان الشبكة المحلية من هاتف حقيقي، ونطاقٌ
// آخر في الإنتاج — فأي قيمة مطلقة تُحفظ اليوم تصير رابطاً ميتاً غداً.
//
// `User.toJson()` كان يكتب `avatarUrl` بعد تحويله إلى مطلق، و`AuthCubit`
// يحفظ الناتج في التخزين الآمن. النتيجة: صورةٌ شخصية مكسورة تنجو من إعادة
// تشغيل التطبيق ومن إعادة تسجيل الدخول، لأن الأصل القديم محفوظ على القرص.

import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/config/app_config.dart';
import 'package:otaku_galaxy/core/network/media_url.dart';
import 'package:otaku_galaxy/features/auth/domain/entities/user.dart';

/// حمولة المستخدم كما يعيدها الخادم — مرجع نسبي دائماً.
Map<String, dynamic> serverUserJson() => {
  'id': 'u1',
  'username': 'مستخدم',
  'phone': '07701234567',
  'avatarUrl': '/uploads/avatar/2026/08/abc.png',
  'role': 'customer',
  'isPhoneVerified': true,
  'createdAt': '2026-08-25T00:00:00.000Z',
};

void main() {
  setUp(() {
    // نبدأ كل حالة من أصل معروف.
    configureMediaOrigin(AppConfig.development);
  });

  group('مرجع الوسائط المحفوظ', () {
    test('التحويل للعرض يبني رابطاً مطلقاً من الأصل الحالي', () {
      final user = User.fromJson(serverUserJson());
      expect(user.avatarUrl, '$mediaOrigin/uploads/avatar/2026/08/abc.png');
    });

    test('[CRITICAL] toJson يحفظ المرجع النسبي لا الرابط المطلق', () {
      final user = User.fromJson(serverUserJson());
      final persisted = user.toJson();

      expect(
        persisted['avatarUrl'],
        '/uploads/avatar/2026/08/abc.png',
        reason: 'حفظ الرابط المطلق يخبز الأصل في التخزين المحلي',
      );
      expect(
        jsonEncode(persisted),
        isNot(contains(mediaOrigin)),
        reason: 'لا يجوز أن يظهر أي أصل مطلق في ما يُحفظ على الجهاز',
      );
    });

    test('[CRITICAL] الجلسة المحفوظة تتبع الأصل الجديد بعد تغيّر الشبكة', () {
      // جلسة حُفظت على المحاكي…
      final saved = jsonEncode(User.fromJson(serverUserJson()).toJson());

      // …ثم فُتح التطبيق على جهاز حقيقي بعنوان مختلف.
      configureMediaOrigin(AppConfig.staging);
      final restored = User.fromJson(
        jsonDecode(saved) as Map<String, dynamic>,
      );

      expect(
        restored.avatarUrl,
        '$mediaOrigin/uploads/avatar/2026/08/abc.png',
        reason: 'الصورة يجب أن تُحمَّل من الأصل الحالي لا من أصل الحفظ',
      );
    });

    test('الروابط الخارجية الكاملة تُحفظ وتُعاد كما هي', () {
      final external = serverUserJson()
        ..['avatarUrl'] = 'https://cdn.example.com/a.png';
      final user = User.fromJson(external);

      expect(user.avatarUrl, 'https://cdn.example.com/a.png');
      expect(user.toJson()['avatarUrl'], 'https://cdn.example.com/a.png');
    });

    test('غياب الصورة يبقى غياباً عبر الحفظ والاستعادة', () {
      final none = serverUserJson()..['avatarUrl'] = null;
      final user = User.fromJson(none);

      expect(user.avatarUrl, isNull);
      expect(user.toJson()['avatarUrl'], isNull);
      expect(
        User.fromJson(user.toJson()).avatarUrl,
        isNull,
      );
    });

    test('دورة حفظ/استعادة متكررة لا تراكم أصولاً', () {
      var json = serverUserJson();
      for (var i = 0; i < 3; i += 1) {
        json = User.fromJson(json).toJson();
      }
      expect(json['avatarUrl'], '/uploads/avatar/2026/08/abc.png');
    });
  });
}
