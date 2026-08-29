import 'package:flutter/foundation.dart';

import 'app/view/app.dart';
import 'bootstrap.dart';
import 'core/config/app_config.dart';

/// المُشغّل المشترك لكل نقاط الدخول.
///
/// نقاط الدخول الثلاث (`main_dev` / `main_staging` / `main_prod`) لا تحمل
/// منطقاً خاصاً بها إطلاقاً — تختار البيئة فقط ثم تستدعي هذه الدالة. التطبيق
/// نفسه (`OtakuGalaxyApp`) والتهيئة (`bootstrap`) وحقن الاعتماديات مشتركة
/// كما هي، فلا نسخة ثانية من التطبيق لكل بيئة.
Future<void> runOtakuGalaxy(AppConfig config) {
  return bootstrap(() async => OtakuGalaxyApp(config: config)).then((_) {
    if (kDebugMode) {
      debugPrint('App started [${config.envName}] → ${config.effectiveApiBaseUrl}');
    }

    // القيم النائبة تُقال بصوت عالٍ بدل أن تبدو إعداداً مكتملاً: بناءٌ
    // موجّه إلى `*.otaku-galaxy.example` لن يتصل بشيء.
    if (config.usesPlaceholderApi) {
      debugPrint(
        '⚠  [${config.envName}] عنوان الـAPI ما يزال قيمة نائبة. '
        'مرّر العنوان الحقيقي: --dart-define=API_BASE_URL=https://…/api',
      );
    }
  });
}
