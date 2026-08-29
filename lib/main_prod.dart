import 'core/config/app_config.dart';
import 'main_common.dart';

/// نقطة دخول الإنتاج.
///
///     flutter build appbundle --flavor prod -t lib/main_prod.dart
///
/// [CRITICAL] هذه النقطة وحدها هي التي تُبنى للنشر على المتجر.
Future<void> main() => runOtakuGalaxy(AppConfig.production);
