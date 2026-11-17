import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/l10n/app_strings.dart';
import 'package:otaku_galaxy/core/validation/password_policy.dart';
import 'package:otaku_galaxy/core/validation/password_policy_data.dart';
import 'package:otaku_galaxy/features/settings/presentation/cubit/locale_cubit.dart';

/// سياسة كلمة المرور في التطبيق مقابل الخادم (STEP 85).
///
/// [CRITICAL] المصدر في `backend/`: البيانات `passwordPolicy.data.json`، والحكم
/// المتوقَّع لكل حالة في `backend/tests/fixtures/password-policy-vectors.json`
/// الذي يشغّله الخادم نفسه. إن تغيّر أحدهما دون الآخر فشل هذا الاختبار.
Map<String, dynamic> _json(String path) =>
    jsonDecode(File(path).readAsStringSync()) as Map<String, dynamic>;

final _policy = _json('backend/src/domain/passwordPolicy.data.json');
final _vectors =
    (_json('backend/tests/fixtures/password-policy-vectors.json')['cases']
            as List)
        .cast<Map<String, dynamic>>();

/// رمز الخادم ← قيمة التعداد (الأسماء نفسها).
PasswordProblem? _problemOf(String? code) =>
    code == null ? null : PasswordProblem.values.byName(code);

void main() {
  group('البيانات المولَّدة تطابق المصدر', () {
    test('الحدود', () {
      expect(kPolicyMinLength, _policy['minLength']);
      expect(kPolicyAdminMinLength, _policy['adminMinLength']);
      expect(kPolicyMaxBytes, _policy['maxBytes']);
      expect(kPolicyMinDistinctChars, _policy['minDistinctChars']);
      expect(kPolicyMinRunLength, _policy['minRunLength']);
      expect(kPolicyMinCoreLength, _policy['minCoreLength']);
      expect(kPolicyPhoneTailDigits, _policy['phoneTailDigits']);
      expect(kPolicyMinUsernameLength, _policy['minUsernameLength']);
    });

    test(
      'التسلسلات والكلمات الشائعة والاستبدالات — شغّل sync_password_policy.mjs إن فشل',
      () {
        expect(kPolicySequences, (_policy['sequences'] as List).cast<String>());
        expect(
          kPolicyCommonWords,
          (_policy['commonWords'] as List).cast<String>().toSet(),
        );
        expect(kPolicyLeet, (_policy['leet'] as Map).cast<String, String>());
      },
    );
  });

  group('المتّجهات المشتركة — حكم التطبيق هو حكم الخادم', () {
    test('الملف يغطي كل رمز رفض والقبول', () {
      final seen = _vectors.map((v) => v['expect']).toSet();
      for (final p in PasswordProblem.values) {
        expect(seen, contains(p.name));
      }
      expect(seen, contains(null));
    });

    for (final v in _vectors) {
      final password = v['password'] as String;
      final admin = v['admin'] == true;
      test('${jsonEncode(password)}${admin ? ' (مسؤول)' : ''}', () {
        expect(
          passwordProblem(
            password,
            admin: admin,
            phone: v['phone'] as String?,
            username: v['username'] as String?,
          ),
          _problemOf(v['expect'] as String?),
        );
      });
    }
  });

  group('الرسائل نصّ الخادم نفسه بالعربية والكردية', () {
    final messages = (_policy['messages'] as Map).cast<String, dynamic>();

    test('كل رمز له مفتاح، وكل مفتاح بنصّ الخادم حرفياً', () {
      expect(
        messages.keys.toSet(),
        PasswordProblem.values.map((p) => p.name).toSet(),
      );
      for (final p in PasswordProblem.values) {
        final text = (messages[p.name] as Map).cast<String, String>();
        expect(
          AppStrings.of(AppLanguage.arabic)(p.stringKey),
          text['ar'],
          reason: p.stringKey,
        );
        expect(
          AppStrings.of(AppLanguage.kurdish)(p.stringKey),
          text['ckb'],
          reason: p.stringKey,
        );
      }
    });
  });

  group('فروق Dart عن الخادم', () {
    test('الحروف والأرقام العريضة تُطوى كما يطويها NFKC', () {
      expect(passwordPatternProblem('ｐａｓｓｗｏｒｄ１２３'), PasswordProblem.weak);
      expect(passwordPatternProblem('１２３４５６７８'), PasswordProblem.weak);
    });

    test('[CRITICAL] الطول بنقاط الترميز كـzod 4 لا بـString.length', () {
      // ٤ رموز تعبيرية = ٨ وحدات UTF-16: `String.length` كان سيقبلها والخادم يرفضها.
      expect('😀🎉🌙🍵'.length, 8);
      expect(passwordProblem('😀🎉🌙🍵'), PasswordProblem.tooShort);
    });

    test('اسمٌ أو رقمٌ غائب لا يحظر شيئاً', () {
      expect(passwordProblem('quiet-river-731'), isNull);
      expect(
        passwordProblem('quiet-river-731', phone: '', username: ''),
        isNull,
      );
    });
  });
}
