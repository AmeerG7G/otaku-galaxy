import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../l10n/app_strings.dart';

/// صفحات الموقع العامّة التي يفتحها التطبيق (STEP 78).
///
/// ثابتة عمداً لا من إعدادات الخادم: رابط سياسة الخصوصية وحذف الحساب هو
/// نفسه المسجَّل في Google Play Console، ويجب أن يُفتح ولو تعذّر الوصول إلى
/// الخادم (شاشة الدخول قبل أي جلسة). الصفحتان على الموقع لا تحتاجان جلسة.
abstract final class PublicPages {
  static const privacyPolicy = 'https://otakugalaxystore.com/privacy-policy';
  static const deleteAccount = 'https://otakugalaxystore.com/delete-account';

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
