import 'package:flutter/foundation.dart';

import 'app/view/app.dart';
import 'bootstrap.dart';
import 'core/config/app_config.dart';

/// نقطة الدخول: تُقرأ البيئة من --dart-define=APP_ENV وتُهيّأ التطبيق.
void main() {
  const env = String.fromEnvironment('APP_ENV', defaultValue: 'development');
  final config = AppConfig.forEnvironment(Environment.fromString(env));
  bootstrap(() async => OtakuGalaxyApp(config: config)).then((_) {
    if (kDebugMode) {
      // [DEBUG]: سجل نجاح بدء التشغيل أثناء التطوير فقط.
      debugPrint('App started with $config');
    }
  });
}
