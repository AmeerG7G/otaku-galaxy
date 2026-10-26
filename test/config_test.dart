import 'dart:io';

import 'package:flutter/foundation.dart'
    show TargetPlatform, defaultTargetPlatform;
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/config/app_config.dart';
import 'package:otaku_galaxy/core/constants/api_endpoints.dart';

void main() {
  test(
    'بيئة التطوير تتكيف مع المنصة: محاكي أندرويد → 10.0.2.2 وإلا localhost',
    () {
      final expected = defaultTargetPlatform == TargetPlatform.android
          ? 'http://10.0.2.2:4000/api'
          : 'http://localhost:4000/api';
      expect(
        AppConfig.development.effectiveApiBaseUrl,
        expected,
        reason: 'الافتراضي يجب أن يركض محلياً دون الاعتماد على محاكي أندرويد',
      );
    },
  );

  test('مسار تسجيل الدخول ينضاف للعنوان الأساسي بدقة', () {
    expect(ApiEndpoints.login, '/auth/login');
    expect(
      '${AppConfig.development.effectiveApiBaseUrl}${ApiEndpoints.login}',
      '${AppConfig.development.effectiveApiBaseUrl}/auth/login',
    );
  });

  test('بيئات غير التطويرية تستخدم عنواناً صريحاً مستقلاً عن المنصة', () {
    // عنوانٌ صريح (لا اشتقاق من المنصة) لكلتيهما.
    expect(AppConfig.staging.apiBaseUrl, startsWith('https://'));
    expect(AppConfig.production.apiBaseUrl, startsWith('https://'));
  });

  /// [CRITICAL] الاختبار المسبق والإنتاج لا يتشاركان مضيفاً.
  ///
  /// كانا يشيران إلى نفس العنوان حرفياً، أي أن بناء الاختبار كان يكتب في
  /// بيانات الإنتاج بلا أي مؤشّر. هذا الفحص يمنع عودة ذلك.
  test('عنوان الاختبار المسبق يختلف عن عنوان الإنتاج', () {
    expect(
      AppConfig.staging.apiBaseUrl,
      isNot(equals(AppConfig.production.apiBaseUrl)),
      reason: 'staging يجب ألّا يشير إلى خادم الإنتاج',
    );
  });

  test('لكل بيئة اسمها القصير المعتمد', () {
    expect(AppConfig.development.envName, 'dev');
    expect(AppConfig.staging.envName, 'staging');
    expect(AppConfig.production.envName, 'prod');
  });

  // ── STEP 64 — نسخة الاختبار تعمل بإعداداتها لا بإعدادات التطوير ──

  test('[STEP 64] staging يشير إلى مضيفه الحقيقي بلا dart-define', () {
    expect(
      AppConfig.staging.effectiveApiBaseUrl,
      'https://staging-api.otakugalaxystore.com/api',
    );
    expect(AppConfig.staging.usesPlaceholderApi, isFalse);
    expect(AppConfig.staging.envName, 'staging');
  });

  test('[STEP 64][regression] bootstrap يمرّر إعدادات النكهة إلى الحقن', () {
    // كان `di.init()` بلا إعدادات فيسجّل التطوير لكل نكهة: نسخة staging تقول
    // `dev` وتخاطب 10.0.2.2. قراءة المصدر لأن bootstrap يشغّل runApp.
    final bootstrap = File('lib/bootstrap.dart').readAsStringSync();
    expect(bootstrap, contains('await di.init(config: config);'));
    expect(bootstrap, isNot(contains('await di.init();')));
    final common = File('lib/main_common.dart').readAsStringSync();
    expect(common, contains('config: config)'));
    for (final entry in ['lib/main_staging.dart', 'lib/main_prod.dart', 'lib/main_dev.dart']) {
      expect(File(entry).readAsStringSync(), contains('runOtakuGalaxy(AppConfig.'), reason: entry);
    }
  });
}
