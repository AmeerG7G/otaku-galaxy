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
    expect(
      AppConfig.staging.apiBaseUrl,
      'https://api.otaku-galaxy.example/api',
    );
    expect(
      AppConfig.production.apiBaseUrl,
      'https://api.otaku-galaxy.example/api',
    );
  });
}
