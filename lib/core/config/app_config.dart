import 'package:flutter/foundation.dart'
    show TargetPlatform, defaultTargetPlatform, kIsWeb;

/// بيئات التشغيل لتطبيق مجرات الاوتاكو.
enum Environment {
  /// بيئة التطوير المحلي.
  development,

  /// بيئة الاختبار.
  staging,

  /// البيئة الإنتاجية.
  production;

  /// تحويل نص إلى بيئة.
  static Environment fromString(String env) {
    switch (env.toLowerCase()) {
      case 'development':
      case 'dev':
        return Environment.development;
      case 'staging':
      case 'stage':
        return Environment.staging;
      case 'production':
      case 'prod':
        return Environment.production;
      default:
        return Environment.development;
    }
  }

  bool get isDevelopment => this == Environment.development;
  bool get isStaging => this == Environment.staging;
  bool get isProduction => this == Environment.production;
}

/// إعدادات التطبيق لكل بيئة تشغيل.
// [DEV]: يمكن تجاوز العنوان أثناء التطوير دون تعديل الكود:
// flutter run --dart-define=API_BASE_URL=http://192.168.1.x:4000/api
const String _apiBaseUrlOverride = String.fromEnvironment('API_BASE_URL');

enum AppConfig {
  // [DEV]: يمكن تجاوز العنوان أثناء التطوير دون تعديل الكود:
  // flutter run --dart-define=API_BASE_URL=http://192.168.1.x:4000/api
  // [NOTE]: 10.0.2.2 = مضيف الجهاز المحلي من داخل محاكي أندرويد فقط.
  development._(
    environment: Environment.development,
    appName: 'مجرات الاوتاكو (تطوير)',
    enableLogging: true,
  ),

  staging._(
    environment: Environment.staging,
    apiBaseUrl: 'https://api.otaku-galaxy.example/api',
    appName: 'مجرات الاوتاكو (اختبار)',
    enableLogging: true,
  ),

  production._(
    environment: Environment.production,
    apiBaseUrl: 'https://api.otaku-galaxy.example/api',
    appName: 'مجرات الاوتاكو',
    enableLogging: false,
  );

  const AppConfig._({
    required this.environment,
    this.apiBaseUrl,
    required this.appName,
    required this.enableLogging,
  });

  /// بيئة التشغيل الحالية.
  final Environment environment;

  /// عنوان قاعدة الـ API الصريح (للبيئات غير التطويرية)، بلا نسخة.
  final String? apiBaseUrl;

  /// اسم التطبيق للعرض.
  final String appName;

  /// تفعيل التسجيل التفصيلي.
  final bool enableLogging;

  /// عنوان قاعدة الـ API الفعلي المستخدم:
  /// 1) تجاوز صريح عبر `--dart-define=API_BASE_URL` (أجهزة حقيقية / شبكة محلية).
  /// 2) العنوان الصريح للبيئة (staging/production).
  /// 3) افتراضي التطوير حسب المنصة — لا نعتمد على 10.0.2.2 خارج محاكي أندرويد.
  String get effectiveApiBaseUrl {
    if (_apiBaseUrlOverride.isNotEmpty) return _apiBaseUrlOverride;
    final explicit = apiBaseUrl;
    if (explicit != null && explicit.isNotEmpty) return explicit;
    // التطوير: أندرويد (محاكي) → 10.0.2.2، غيره (سطح مكتب/ويب/مادي/iOS) → localhost.
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      return 'http://10.0.2.2:4000/api';
    }
    return 'http://localhost:4000/api';
  }

  /// إرجاع الإعدادات الخاصة بالبيئة.
  static AppConfig forEnvironment(Environment environment) {
    switch (environment) {
      case Environment.development:
        return development;
      case Environment.staging:
        return staging;
      case Environment.production:
        return production;
    }
  }

  @override
  String toString() {
    return 'AppConfig(environment: $environment, appName: $appName, '
        'apiBaseUrl: $effectiveApiBaseUrl, enableLogging: $enableLogging)';
  }
}
