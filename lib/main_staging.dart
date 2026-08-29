import 'core/config/app_config.dart';
import 'main_common.dart';

/// نقطة دخول بيئة الاختبار (ما قبل الإنتاج).
///
///     flutter run --flavor staging -t lib/main_staging.dart
///
/// [CRITICAL] تتصل بخادم الاختبار وقاعدة بياناته — لا بالإنتاج أبداً.
Future<void> main() => runOtakuGalaxy(AppConfig.staging);
