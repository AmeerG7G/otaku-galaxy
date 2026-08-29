import 'core/config/app_config.dart';
import 'main_common.dart';

/// نقطة دخول بيئة التطوير.
///
///     flutter run --flavor dev -t lib/main_dev.dart
///
/// تتصل بالخادم المحلي: `localhost` على سطح المكتب والويب، و`10.0.2.2` من
/// داخل محاكي أندرويد. للتشغيل على جهاز حقيقي مرّر عنوان الشبكة المحلية:
///
///     --dart-define=API_BASE_URL=http://192.168.1.x:4000/api
Future<void> main() => runOtakuGalaxy(AppConfig.development);
