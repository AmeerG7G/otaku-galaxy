import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../l10n/app_strings.dart';
import 'app_config.dart';

/// صفحات الموقع العامّة التي يفتحها التطبيق (STEP 78).
///
/// من إعدادات النكهة لا من إعدادات الخادم: يجب أن يُفتح الرابط ولو تعذّر
/// الوصول إلى الخادم (شاشة الدخول قبل أي جلسة). الصفحتان على الموقع لا
/// تحتاجان جلسة. الإنتاج على الرابط المسجَّل في Google Play Console، والاختبار
/// على موقع الاختبار — [AppConfig.publicSiteOrigin].
abstract final class PublicPages {
  static String _origin = AppConfig.production.publicSiteOrigin;

  /// يربط الروابط ببيئة التشغيل. يُستدعى من حقن الاعتماديات.
  static void configure(AppConfig config) => _origin = config.publicSiteOrigin;

  static String get privacyPolicy => '$_origin/privacy-policy';
  static String get deleteAccount => '$_origin/delete-account';

  /// يُستبدل في الاختبارات بدل `launchUrl` — لا مكوّن منصّة في `flutter test`.
  @visibleForTesting
  static Future<bool> Function(Uri uri) launcher = _launchExternal;

  static Future<bool> _launchExternal(Uri uri) =>
      launchUrl(uri, mode: LaunchMode.externalApplication);

  /// يفتح [url] في المتصفح خارج التطبيق. تعذّر الفتح ← «تعذّر فتح الرابط».
  static Future<void> open(BuildContext context, String url) async {
    bool opened;
    try {
      opened = await launcher(Uri.parse(url));
    } catch (_) {
      // `PlatformException` حين لا متصفح يستقبل الرابط — فشلٌ ظاهر لا صامت.
      opened = false;
    }
    if (!opened && context.mounted) {
      ScaffoldMessenger.maybeOf(context)?.showSnackBar(
        SnackBar(content: Text(context.strings('linkOpenFailed'))),
      );
    }
  }
}
