/// رابط المتجر الذي يُسمح لزرّ «تحديث التطبيق» بفتحه.
///
/// [SECURITY] الرابط يأتي من الخادم ويُفتح خارج التطبيق بضغطة واحدة — ومن
/// شاشةٍ لا مخرج منها سواه حين يكون التحديث إجبارياً. الخادم يقبل صفحة
/// تطبيقنا على Google Play وحدها (`backend/src/utils/playStoreUrl.ts`، STEP 70)؛
/// وهذا الفحص يكرّرها هنا لما قد يصل من غير ذلك الطريق (ردٌّ مخبّأ من خادمٍ
/// أقدم، أو قاعدةٌ عُدّلت خارج اللوحة): متجرٌ رسمي فقط، وإلا فلا رابط.
///
/// المقبول:
/// - `https://play.google.com/store/apps/details?id=<إحدى حِزمنا>` — يُعاد
///   بشكله القانوني (تُسقَط المعاملات الأخرى).
/// - `https://apps.apple.com/...` — متجر آبل الرسمي لردودٍ قديمة على iOS (لا
///   إصدار iOS اليوم؛ الخادم لا يرسله بعد STEP 70).
library;

/// معرّفات تطبيقنا على أندرويد — نظير `APP_PACKAGE_IDS` في الخادم، ويحرس
/// تطابقهما `test/app_update_policy_test.dart`.
const appPackageIds = <String>{
  'com.otakugalaxy.otaku_galaxy',
  'com.otakugalaxy.otaku_galaxy.staging',
  'com.otakugalaxy.otaku_galaxy.dev',
};

/// الرابط الموثوق بشكله القانوني، أو `null`.
String? trustedStoreUrl(String? raw) {
  final text = raw?.trim() ?? '';
  if (text.isEmpty) return null;
  final uri = Uri.tryParse(text);
  if (uri == null ||
      uri.scheme != 'https' ||
      uri.userInfo.isNotEmpty ||
      uri.hasPort) {
    return null;
  }
  if (uri.host == 'play.google.com') {
    if (uri.path != '/store/apps/details') return null;
    final ids = uri.queryParametersAll['id'] ?? const <String>[];
    if (ids.length != 1 || !appPackageIds.contains(ids.single)) return null;
    return 'https://play.google.com/store/apps/details?id=${ids.single}';
  }
  if (uri.host == 'apps.apple.com') return uri.removeFragment().toString();
  return null;
}
