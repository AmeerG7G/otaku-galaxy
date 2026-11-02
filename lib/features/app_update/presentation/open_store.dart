import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/l10n/app_strings.dart';
import '../domain/store_url.dart';

/// يفتح صفحة التطبيق في المتجر — لشاشة الحجب ولتنبيه التحديث معاً.
///
/// - رابطٌ غائب أو غير موثوق ([trustedStoreUrl]) ← «رابط التحديث غير متوفر»
///   بدل زرٍّ صامت، ولا يُفتح شيء.
/// - تعذّر الفتح (لا متجر على الجهاز، أو رفض النظام) ← «تعذّر فتح المتجر».
/// - لا يُفتح المتجر تلقائياً أبداً: بضغطة الزبون وحدها.
///
/// [onOpenStore] يُحقن في الاختبارات بدل `launchUrl`.
Future<void> openStoreListing(
  BuildContext context,
  String url, {
  Future<void> Function(String url)? onOpenStore,
}) async {
  final trusted = trustedStoreUrl(url);
  if (trusted == null) {
    _notify(context, context.strings('updateLinkUnavailable'));
    return;
  }
  if (onOpenStore != null) {
    await onOpenStore(trusted);
    return;
  }
  bool opened;
  try {
    opened = await launchUrl(
      Uri.parse(trusted),
      mode: LaunchMode.externalApplication,
    );
  } catch (_) {
    // `PlatformException` حين لا تطبيق يستقبل الرابط — يُعامَل كفشلٍ ظاهر.
    opened = false;
  }
  if (!opened && context.mounted) {
    _notify(context, context.strings('storeOpenFailed'));
  }
}

void _notify(BuildContext context, String message) {
  ScaffoldMessenger.maybeOf(context)?.showSnackBar(
    SnackBar(content: Text(message)),
  );
}
