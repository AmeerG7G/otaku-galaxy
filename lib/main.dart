import 'core/config/app_config.dart';
import 'main_common.dart';

/// نقطة الدخول القديمة — تُبقى للتوافق مع الأدوات التي تشير إلى `lib/main.dart`.
///
/// البيئة تُقرأ من `--dart-define=APP_ENV` كما كانت (`dev` / `staging` /
/// `prod`)، والافتراضي هو التطوير. البناءات الجديدة تستعمل نقاط الدخول
/// الصريحة (`main_dev.dart` / `main_staging.dart` / `main_prod.dart`) لأنها
/// تربط النكهة بالبيئة فلا يمكن أن يختارا قيمتين مختلفتين.
Future<void> main() {
  const env = String.fromEnvironment('APP_ENV', defaultValue: 'dev');
  return runOtakuGalaxy(AppConfig.forEnvironment(Environment.fromString(env)));
}
