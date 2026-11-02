import 'package:firebase_core/firebase_core.dart';

/// إعداد مشروع Firebase من `--dart-define` (STEP 64 §13).
///
/// [CRITICAL] لا `google-services.json` في المستودع ولا ملحق Gradle: القيم
/// تُمرَّر عند البناء لكل نكهة، فيبقى البناء بلا إعداد يعمل — والإشعارات
/// الفورية معطّلة فيه بهدوء (`UnconfiguredPushTokenSource`). هذه القيم ليست
/// أسراراً (تُشحن داخل كل APK)؛ السرّ الوحيد — مفتاح حساب الخدمة — على الخادم.
///
/// ```
/// flutter build apk --flavor staging -t lib/main_staging.dart \
///   --dart-define=FIREBASE_API_KEY=… --dart-define=FIREBASE_APP_ID=… \
///   --dart-define=FIREBASE_PROJECT_ID=… --dart-define=FIREBASE_MESSAGING_SENDER_ID=…
/// ```
class FirebasePushConfig {
  const FirebasePushConfig({
    required this.apiKey,
    required this.appId,
    required this.projectId,
    required this.messagingSenderId,
  });

  static const fromEnvironment = FirebasePushConfig(
    apiKey: String.fromEnvironment('FIREBASE_API_KEY'),
    appId: String.fromEnvironment('FIREBASE_APP_ID'),
    projectId: String.fromEnvironment('FIREBASE_PROJECT_ID'),
    messagingSenderId: String.fromEnvironment('FIREBASE_MESSAGING_SENDER_ID'),
  );

  final String apiKey;
  final String appId;
  final String projectId;
  final String messagingSenderId;

  /// الأربعة كلّها أو لا شيء — إعدادٌ ناقص يعني «غير مضبوط»، لا تهيئةً تفشل.
  bool get isConfigured => [
    apiKey,
    appId,
    projectId,
    messagingSenderId,
  ].every((value) => value.trim().isNotEmpty);

  FirebaseOptions toOptions() => FirebaseOptions(
    apiKey: apiKey.trim(),
    appId: appId.trim(),
    projectId: projectId.trim(),
    messagingSenderId: messagingSenderId.trim(),
  );
}
