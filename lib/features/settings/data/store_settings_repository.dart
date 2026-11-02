import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/api_client.dart';

/// روابط المتجر التي يضبطها المسؤول من لوحة التحكم: التواصل، ورابط المتجر
/// في رسالة مشاركة المنتج.
///
/// الرابط الفارغ يعني «غير مضبوط» — التطبيق يُبقي سلوكه الآمن ولا يفتح
/// رابطاً معطّلاً.
class StoreSocialLinks {
  const StoreSocialLinks({
    this.tiktok = '',
    this.instagram = '',
    this.whatsapp = '',
    this.shareUrl = '',
  });

  final String tiktok;
  final String instagram;
  final String whatsapp;

  /// رابط المتجر في رسالة مشاركة المنتج (`share.storeUrl`، STEP 64 §19) —
  /// من الإعدادات لا من الكود، فيغيّره المسؤول بلا إصدار.
  final String shareUrl;

  factory StoreSocialLinks.fromJson(Map<String, dynamic> json) {
    final social = (json['social'] as Map<String, dynamic>?) ?? const {};
    final share = (json['share'] as Map<String, dynamic>?) ?? const {};
    return StoreSocialLinks(
      tiktok: social['tiktok'] as String? ?? '',
      instagram: social['instagram'] as String? ?? '',
      whatsapp: social['whatsapp'] as String? ?? '',
      shareUrl: (share['storeUrl'] as String? ?? '').trim(),
    );
  }
}

/// يقرأ إعدادات المتجر العامة (بلا مصادقة) ويخبّئها لبقية الجلسة.
class StoreSettingsRepository {
  StoreSettingsRepository({ApiClient? api}) : _api = api ?? ApiClient();

  final ApiClient _api;

  StoreSocialLinks _cached = const StoreSocialLinks();
  bool _trackingEnabled = false;
  Future<StoreSocialLinks>? _inflight;

  StoreSocialLinks get links => _cached;

  /// هل يقبل الخادم إشارات القياس التجميعي (`tracking.enabled`، D3)؟
  ///
  /// [CRITICAL] مطفأ حتى يقول الخادم غير ذلك: قبل أول جلبٍ ناجح، وعند فشل
  /// الجلب. لا إشارة تُرسَل على ظنّ.
  bool get trackingEnabled => _trackingEnabled;

  /// يكتمل حين ينتهي الجلب الجاري (أو فوراً إن لم يكن ثمّة جلب) — لإشارةٍ
  /// تقع عند الإقلاع قبل أن تصل الإعدادات (لمسة إشعارٍ تفتح التطبيق).
  Future<void> get settled => _inflight ?? Future<void>.value();

  Future<StoreSocialLinks> refresh() =>
      _inflight ??= _fetch().whenComplete(() => _inflight = null);

  Future<StoreSocialLinks> _fetch() async {
    try {
      final data = await _api.get(ApiEndpoints.storeSettings);
      final json = (data as Map<String, dynamic>?) ?? const {};
      _cached = StoreSocialLinks.fromJson(json);
      final tracking = (json['tracking'] as Map<String, dynamic>?) ?? const {};
      _trackingEnabled = tracking['enabled'] == true;
    } catch (_) {
      // تعذّر الجلب: تبقى الروابط فارغة فيُعرض السلوك الآمن.
    }
    return _cached;
  }
}
