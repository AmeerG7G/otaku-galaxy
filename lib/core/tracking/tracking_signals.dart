import 'dart:async';

import 'package:share_plus/share_plus.dart';

import '../../features/settings/data/store_settings_repository.dart';
import '../constants/api_endpoints.dart';
import '../network/api_client.dart';

/// الإشارتان اللتان تُرفقان بطلبٍ قائم في ترويسة `X-OG-Track`.
enum TrackKind {
  /// فتح صفحة منتج — من شاشة التفاصيل وحدها، مرّةً لكل فتح.
  view,

  /// بحثٌ نهائي — إرسالٌ أو اختيارٌ من السجلّ أو استعلامٌ أوّلي، لا إعادةٌ
  /// بتبديل اللغة.
  search,
}

/// إشارات القياس التجميعي (D3) — عدّاداتٌ يومية على الخادم بلا سجلّ أحداث.
///
/// [CRITICAL] **مطفأة ما لم يعلن الخادم `tracking.enabled`** (افتراضياً مطفأ
/// في كل بيئة). والقياس مطفأ لا تُرسَل ترويسةٌ ولا طلب. والإشارة لا تؤثّر في
/// تجربة الزبون أبداً: لا انتظار، ولا خطأ يظهر، ولا إعادة محاولة.
///
/// ما لا يُرسَل أصلاً: معرّف جهاز، موقع، مدّة جلسة، أو أي سجلٍّ لما شاهده
/// زبونٌ بعينه. إضافة السلة تُعدّ على الخادم من `POST /cart` نفسه، فلا إشارة
/// لها هنا.
class TrackingSignals {
  TrackingSignals({
    required this.api,
    required this.settings,
    required this.signedIn,
  });

  final ApiClient api;
  final StoreSettingsRepository settings;

  /// للحساب المسجَّل وحده: مسارا المشاركة والفتح محميّان بالمصادقة.
  final bool Function() signedIn;

  static const headerName = 'X-OG-Track';

  /// ترويسة الإشارة لطلبٍ قائم — `null` والقياس مطفأ.
  Map<String, String>? headerFor(TrackKind kind) =>
      settings.trackingEnabled ? {headerName: kind.name} : null;

  /// نتيجة ورقة المشاركة كما يعيدها النظام. «فُتحت» تُعدّ لكل نتيجة،
  /// و«أُكّدت» للنجاح وحده — لا يُدّعى أن مشاركةً تمّت حين لا يقول النظام ذلك.
  ///
  /// المسار للحساب المسجَّل وحده؛ مشاركة الزائر لا تُعدّ.
  Future<void> share(String productId, ShareResultStatus status) async {
    if (!settings.trackingEnabled || !signedIn()) return;
    await _quietly(
      () => api.post(
        ApiEndpoints.trackingShare,
        body: {'productId': productId, 'result': _shareResult(status)},
      ),
    );
  }

  /// لمسة إشعار دفعٍ فتحت التطبيق — حدٌّ أدنى لا «وصول».
  ///
  /// قد تقع اللمسة عند الإقلاع قبل وصول الإعدادات، فينتظر الجلبَ الجاري أولاً.
  Future<void> notificationOpened(String notificationId) async {
    await settings.settled;
    if (!settings.trackingEnabled || !signedIn()) return;
    await _quietly(
      () => api.post(ApiEndpoints.notificationOpened(notificationId)),
    );
  }

  static String _shareResult(ShareResultStatus status) => switch (status) {
    ShareResultStatus.success => 'success',
    ShareResultStatus.dismissed => 'dismissed',
    ShareResultStatus.unavailable => 'unavailable',
  };

  static Future<void> _quietly(Future<Object?> Function() send) async {
    try {
      await send();
    } catch (_) {
      // إشارةٌ ضائعة أقلّ كلفةً من خطأٍ يراه الزبون: لا رسالة ولا إعادة.
    }
  }
}
