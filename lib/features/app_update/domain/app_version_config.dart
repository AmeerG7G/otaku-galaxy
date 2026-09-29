import 'dart:io' show Platform;

import 'package:flutter/foundation.dart' show kIsWeb;

/// إعدادات إجبار التحديث كما يضبطها المسؤول من لوحة التحكم.
///
/// [CRITICAL] لا قيمة منها مخبوزة في Flutter. الحدّ الأدنى يُرفع من اللوحة
/// بعد نشر نسخة جديدة، فلا يحتاج إجبارُ التحديث بناءَ تطبيقٍ ولا بناءَ خادم
/// — وهو الغرض كلّه.
///
/// [STEP 64 §16] ثلاثة حقول في اللوحة: التفعيل، والحدّ الأدنى، ورابط التحديث
/// الواحد. لا رسالة مسؤول (النصّ المترجَم الافتراضي وحده) ولا «أحدث نسخة».
class AppVersionConfig {
  const AppVersionConfig({
    this.minimumSupportedVersion = '',
    this.updateUrl = '',
  });

  /// الحدّ **الفعّال**: فارغٌ حين يكون الإجبار معطَّلاً.
  final String minimumSupportedVersion;

  /// رابط زرّ «تحديث التطبيق» — واحدٌ للمنصّتين.
  final String updateUrl;

  /// الإعداد الفارغ = «لا حدّ أدنى» = لا حجب. هو حالة ما قبل الضبط وحالة
  /// فشل القراءة معاً، عمداً: كلتاهما «لا أعرف»، و«لا أعرف» لا تحجب.
  static const empty = AppVersionConfig();

  /// يقرأ ردّ `GET /catalog/app-version` — أو ما خُبّئ منه.
  ///
  /// الخادم يرسل الحدّ فعّالاً (فارغاً حين يعطّل المسؤول الإجبار)، ويبقى
  /// `forceUpdateEnabled: false` الصريح معطِّلاً احتياطاً. غيابه — خادمٌ أقدم
  /// أو ردٌّ مخبّأ قبل STEP 64 — يُحكَم فيه بالحدّ وحده كما كان.
  ///
  /// والرابط: `updateUrl`، وإلا رابطُ المتجر القديم لهذه المنصّة ثم الآخر —
  /// زرُّ تحديثٍ يفتح متجراً غير مثالي خيرٌ من زرٍّ لا يفعل شيئاً في شاشة لا
  /// مخرج منها سواه.
  factory AppVersionConfig.fromJson(Map<String, dynamic> json, {bool? isIos}) {
    String read(String key) {
      final value = json[key];
      return value is String ? value.trim() : '';
    }

    final enabled = json['forceUpdateEnabled'] != false;
    final ios = isIos ?? (!kIsWeb && Platform.isIOS);
    final legacyPreferred = read(ios ? 'iosStoreUrl' : 'androidStoreUrl');
    final legacyOther = read(ios ? 'androidStoreUrl' : 'iosStoreUrl');
    final url = read('updateUrl');
    return AppVersionConfig(
      minimumSupportedVersion: enabled ? read('minimumSupportedVersion') : '',
      updateUrl: url.isNotEmpty
          ? url
          : legacyPreferred.isNotEmpty
          ? legacyPreferred
          : legacyOther,
    );
  }

  Map<String, dynamic> toJson() => {
    'minimumSupportedVersion': minimumSupportedVersion,
    'updateUrl': updateUrl,
  };
}
