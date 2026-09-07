import 'dart:io' show Platform;

import 'package:flutter/foundation.dart' show kIsWeb;

import '../../../core/network/api_client.dart';

/// منصّة الجهاز كما يعرفها الخادم (`device_tokens.platform`).
String currentDevicePlatform() {
  if (kIsWeb) return 'web';
  return Platform.isIOS ? 'ios' : 'android';
}

/// مصدر رمز الإشعارات الفورية.
///
/// [CRITICAL] الفصل مقصود بين **الشيفرة** و**اعتماد المزوّد**.
///
/// إضافة `firebase_messaging` تجرّ معها مُلحق Gradle الذي يشترط وجود
/// `android/app/google-services.json`. الملف غير موجود في المستودع (ولا
/// يجوز أن يوجد: هو إعداد مشروع Firebase حقيقي، والتطبيق له ثلاث نكهات
/// بمعرّفات مختلفة `.dev`/`.staging`/الإنتاج فيحتاج ملفاً لكلٍّ منها).
/// إضافتها الآن كانت **ستكسر بناء أندرويد فوراً** لكل من يسحب المستودع.
///
/// لذلك: كل ما لا يعتمد على المزوّد منفَّذ ومختبَر (التسجيل، التحديث،
/// دورة الدخول والخروج، عقد الخادم)، وهذه الواجهة هي نقطة الوصل الوحيدة
/// المتبقّية. من يضبط Firebase ينفّذ [FirebasePushTokenSource] ولا يلمس
/// شيئاً آخر.
abstract interface class PushTokenSource {
  /// يطلب إذن الإشعارات ويعيد الرمز، أو `null` إن رُفض الإذن أو تعذّر.
  Future<String?> requestPermissionAndGetToken();

  /// يبثّ الرمز الجديد عند تدويره من المزوّد.
  Stream<String> get onTokenRefresh;
}

/// المصدر الافتراضي ما دام Firebase غير مضبوط: لا إذن، ولا رمز، ولا عطل.
///
/// وجودُه يجعل بقية المنظومة تعمل وتُختبر بلا مزوّد: التطبيق يستدعي
/// [PushRegistrar] عند الدخول والخروج كالمعتاد، ولا يحدث شيء — بدل أن
/// يسقط أو يتظاهر بالنجاح.
class UnconfiguredPushTokenSource implements PushTokenSource {
  const UnconfiguredPushTokenSource();

  @override
  Future<String?> requestPermissionAndGetToken() async => null;

  @override
  Stream<String> get onTokenRefresh => const Stream<String>.empty();
}

/// يربط رمز الجهاز بالحساب على الخادم.
///
/// [CRITICAL] الرمز لا يُخزَّن محلياً كمرجع. الخادم هو من يملك الربط بين
/// الحساب والجهاز؛ تخزينه محلياً وحده كان سيعني أن الخادم لا يعرف إلى أين
/// يرسل — وهو بالضبط ما يجعل الإشعار لا يصل والتطبيق مغلق.
class PushTokenRepository {
  PushTokenRepository(this._api);

  final ApiClient _api;

  Future<void> register(String token) async {
    await _api.post(
      '/devices',
      body: {'token': token, 'platform': currentDevicePlatform()},
    );
  }

  /// يُستدعى عند تسجيل الخروج — الجهاز يتوقّف عن استقبال إشعارات هذا الحساب.
  ///
  /// بدونه يبقى الجهاز مسجَّلاً باسم من خرج، فتصل إشعاراته الخاصة إلى من
  /// يستعمل الهاتف بعده.
  Future<void> unregister(String token) async {
    await _api.post('/devices/unregister', body: {'token': token});
  }

  /// الأجهزة النشطة لهذا الحساب — بلا الرمز نفسه (الخادم لا يعيده).
  Future<List<Map<String, dynamic>>> mine() async {
    final data = await _api.get('/devices');
    if (data is! List) return const [];
    return data.whereType<Map<String, dynamic>>().toList();
  }
}
