import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/api_client.dart';

/// روابط التواصل التي يضبطها المسؤول من لوحة التحكم.
///
/// الرابط الفارغ يعني «غير مضبوط» — التطبيق يُبقي سلوكه الآمن ولا يفتح
/// رابطاً معطّلاً.
class StoreSocialLinks {
  const StoreSocialLinks({
    this.tiktok = '',
    this.instagram = '',
    this.whatsapp = '',
  });

  final String tiktok;
  final String instagram;
  final String whatsapp;

  factory StoreSocialLinks.fromJson(Map<String, dynamic> json) {
    final social = (json['social'] as Map<String, dynamic>?) ?? const {};
    return StoreSocialLinks(
      tiktok: social['tiktok'] as String? ?? '',
      instagram: social['instagram'] as String? ?? '',
      whatsapp: social['whatsapp'] as String? ?? '',
    );
  }
}

/// يقرأ إعدادات المتجر العامة (بلا مصادقة) ويخبّئها لبقية الجلسة.
class StoreSettingsRepository {
  StoreSettingsRepository({ApiClient? api}) : _api = api ?? ApiClient();

  final ApiClient _api;

  StoreSocialLinks _cached = const StoreSocialLinks();

  StoreSocialLinks get links => _cached;

  Future<StoreSocialLinks> refresh() async {
    try {
      final data = await _api.get(ApiEndpoints.storeSettings);
      _cached = StoreSocialLinks.fromJson(
        (data as Map<String, dynamic>?) ?? const {},
      );
    } catch (_) {
      // تعذّر الجلب: تبقى الروابط فارغة فيُعرض السلوك الآمن.
    }
    return _cached;
  }
}
