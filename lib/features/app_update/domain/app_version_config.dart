import 'dart:io' show Platform;

import 'package:flutter/foundation.dart' show kIsWeb;

/// إعدادات نسخة التطبيق كما يضبطها المسؤول من لوحة التحكم.
///
/// [CRITICAL] لا قيمة منها مخبوزة في Flutter. الحدّ الأدنى يُرفع من اللوحة
/// بعد نشر نسخة جديدة، فلا يحتاج إجبارُ التحديث بناءَ تطبيقٍ ولا بناءَ خادم
/// — وهو الغرض كلّه.
class AppVersionConfig {
  const AppVersionConfig({
    this.minimumSupportedVersion = '',
    this.latestVersion = '',
    this.androidStoreUrl = '',
    this.iosStoreUrl = '',
    this.updateMessage = '',
    this.updateMessageCkb = '',
  });

  final String minimumSupportedVersion;
  final String latestVersion;
  final String androidStoreUrl;
  final String iosStoreUrl;
  final String updateMessage;

  /// رسالة المسؤول بالكردية — فارغةً تُعرض الرسالة الكردية الافتراضية، لا
  /// رسالته العربية.
  final String updateMessageCkb;

  /// الإعداد الفارغ = «لا حدّ أدنى» = لا حجب. هو حالة ما قبل الضبط وحالة
  /// فشل القراءة معاً، عمداً: كلتاهما «لا أعرف»، و«لا أعرف» لا تحجب.
  static const empty = AppVersionConfig();

  factory AppVersionConfig.fromJson(Map<String, dynamic> json) {
    String read(String key) => (json[key] as String?)?.trim() ?? '';
    return AppVersionConfig(
      minimumSupportedVersion: read('minimumSupportedVersion'),
      latestVersion: read('latestVersion'),
      androidStoreUrl: read('androidStoreUrl'),
      iosStoreUrl: read('iosStoreUrl'),
      updateMessage: read('updateMessage'),
      updateMessageCkb: read('updateMessageCkb'),
    );
  }

  Map<String, dynamic> toJson() => {
    'minimumSupportedVersion': minimumSupportedVersion,
    'latestVersion': latestVersion,
    'androidStoreUrl': androidStoreUrl,
    'iosStoreUrl': iosStoreUrl,
    'updateMessage': updateMessage,
    'updateMessageCkb': updateMessageCkb,
  };

  /// رابط المتجر الموافق للمنصّة الحالية.
  ///
  /// يرجع إلى الرابط الآخر إن لم يُضبط إلا واحد: زرُّ تحديثٍ يفتح متجراً
  /// غير مثالي خيرٌ من زرٍّ لا يفعل شيئاً في شاشة لا مخرج منها سواه.
  String storeUrlFor({bool? isIos}) {
    final ios = isIos ?? (!kIsWeb && Platform.isIOS);
    final preferred = ios ? iosStoreUrl : androidStoreUrl;
    if (preferred.isNotEmpty) return preferred;
    return ios ? androidStoreUrl : iosStoreUrl;
  }
}
