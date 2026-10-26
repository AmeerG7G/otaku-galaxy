import 'dart:async';
import 'dart:convert';
import 'dart:developer';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../data/push_token_repository.dart';
import 'firebase_push_config.dart';
import 'push_tap_router.dart';

/// قناة أندرويد الوحيدة لإشعارات المتجر. الخادم يرسل إليها
/// (`android.notification.channel_id`)، والبيان يجعلها الافتراضية لما يعرضه
/// النظام والتطبيق في الخلفية.
const String kPushChannelId = 'otaku_default';

/// هل هيّأ [initPushNotifications] Firebase في هذا التشغيل؟ يقرؤه الحقن
/// ليختار مصدر الرمز — `false` يُبقي [UnconfiguredPushTokenSource].
bool pushNotificationsReady = false;

/// ما يحتاجه [FirebasePushTokenSource] من FCM — واجهةٌ كي يُختبر بلا منصّة.
abstract interface class PushMessaging {
  /// `true` إن أُذن (أو أُذن مؤقّتاً على iOS). على أندرويد 13+ هو ما يطلب
  /// `POST_NOTIFICATIONS`.
  Future<bool> requestPermission();

  Future<String?> getToken();

  Stream<String> get onTokenRefresh;
}

class _FirebaseMessagingAdapter implements PushMessaging {
  FirebaseMessaging get _fcm => FirebaseMessaging.instance;

  @override
  Future<bool> requestPermission() async {
    final settings = await _fcm.requestPermission();
    return settings.authorizationStatus == AuthorizationStatus.authorized ||
        settings.authorizationStatus == AuthorizationStatus.provisional;
  }

  @override
  Future<String?> getToken() => _fcm.getToken();

  @override
  Stream<String> get onTokenRefresh => _fcm.onTokenRefresh;
}

/// مصدر رمز FCM الحقيقي — نقطة الوصل التي تركها [PushTokenSource] مفتوحة.
///
/// رفض الإذن أو فشل الجلب = `null`: [PushRegistrar] يفشل بهدوء ولا يمنع
/// الدخول.
class FirebasePushTokenSource implements PushTokenSource {
  FirebasePushTokenSource([PushMessaging? messaging])
    : _messaging = messaging ?? _FirebaseMessagingAdapter();

  final PushMessaging _messaging;

  @override
  Future<String?> requestPermissionAndGetToken() async {
    try {
      if (!await _messaging.requestPermission()) return null;
      final token = await _messaging.getToken();
      return token == null || token.isEmpty ? null : token;
    } catch (error) {
      log('FCM token unavailable: $error');
      return null;
    }
  }

  @override
  Stream<String> get onTokenRefresh => _messaging.onTokenRefresh;
}

/// ما يُعرض لرسالةٍ وصلت والتطبيق في المقدّمة — أو `null` إن لم يكن فيها ما
/// يُعرض. FCM لا يعرض شيئاً بنفسه في المقدّمة على أندرويد.
({int id, String title, String body, String payload})?
foregroundNotificationFor(RemoteMessage message) {
  final title = message.notification?.title?.trim() ?? '';
  final body = message.notification?.body?.trim() ?? '';
  if (title.isEmpty && body.isEmpty) return null;
  final key = message.messageId ?? message.data['notificationId']?.toString();
  return (
    id: (key ?? '$title|$body').hashCode & 0x7fffffff,
    title: title,
    body: body,
    payload: jsonEncode(message.data),
  );
}

Map<String, Object?> _decodePayload(String? payload) {
  if (payload == null || payload.isEmpty) return const {};
  try {
    final decoded = jsonDecode(payload);
    return decoded is Map<String, Object?> ? decoded : const {};
  } catch (_) {
    return const {};
  }
}

/// رسائل الخلفية: الإشعار ذو `notification` يعرضه النظام نفسه على القناة
/// الافتراضية؛ المعزول الخلفي لا يحتاج إلا Firebase مهيّأً.
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp(
    options: FirebasePushConfig.fromEnvironment.toOptions(),
  );
}

/// يهيّئ الإشعارات الفورية إن كانت مضبوطة، ويعيد إن نجح.
///
/// [CRITICAL] لا يرمي ولا يطلب إذناً: الإذن يُطلب عند الدخول
/// ([PushRegistrar.onLogin])، وأيّ فشلٍ هنا يُبقي التطبيق يعمل بلا إشعارات
/// فورية — تماماً كبناءٍ بلا إعداد.
Future<bool> initPushNotifications({
  required PushTapRouter tapRouter,
  FirebasePushConfig config = FirebasePushConfig.fromEnvironment,
}) async {
  if (kIsWeb || !config.isConfigured) return false;
  try {
    await Firebase.initializeApp(options: config.toOptions());
    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

    final local = FlutterLocalNotificationsPlugin();
    await local.initialize(
      settings: const InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
        iOS: DarwinInitializationSettings(
          requestAlertPermission: false,
          requestBadgePermission: false,
          requestSoundPermission: false,
        ),
      ),
      onDidReceiveNotificationResponse: (response) =>
          tapRouter.handle(_decodePayload(response.payload)),
    );
    await local
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >()
        ?.createNotificationChannel(
          const AndroidNotificationChannel(
            kPushChannelId,
            'Otaku Galaxy',
            importance: Importance.high,
          ),
        );

    // المقدّمة: أندرويد لا يعرض شيئاً بنفسه فيعرضه التطبيق على القناة
    // نفسها؛ iOS يعرضه النظام بخيارات العرض.
    await FirebaseMessaging.instance
        .setForegroundNotificationPresentationOptions(
          alert: true,
          badge: true,
          sound: true,
        );
    FirebaseMessaging.onMessage.listen((message) {
      if (defaultTargetPlatform != TargetPlatform.android) return;
      final shown = foregroundNotificationFor(message);
      if (shown == null) return;
      unawaited(
        local.show(
          id: shown.id,
          title: shown.title,
          body: shown.body,
          payload: shown.payload,
          notificationDetails: const NotificationDetails(
            android: AndroidNotificationDetails(
              kPushChannelId,
              'Otaku Galaxy',
              importance: Importance.high,
              priority: Priority.high,
            ),
          ),
        ),
      );
    });

    // اللمس: من الخلفية، ومن إطلاقٍ من العدم (بإشعار FCM أو بإشعارٍ محلي).
    FirebaseMessaging.onMessageOpenedApp.listen(
      (message) => tapRouter.handle(message.data),
    );
    final initial = await FirebaseMessaging.instance.getInitialMessage();
    if (initial != null) tapRouter.handle(initial.data);
    final launch = await local.getNotificationAppLaunchDetails();
    if (launch?.didNotificationLaunchApp ?? false) {
      tapRouter.handle(_decodePayload(launch!.notificationResponse?.payload));
    }

    return pushNotificationsReady = true;
  } catch (error, stack) {
    log('Push notifications disabled: $error', stackTrace: stack);
    return pushNotificationsReady = false;
  }
}
