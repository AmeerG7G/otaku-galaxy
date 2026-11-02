import 'dart:io' show Platform;

import 'package:flutter/foundation.dart' show kIsWeb;

import 'store_url.dart';

/// إعدادات إجبار التحديث كما يضبطها المسؤول من لوحة التحكم.
///
/// [CRITICAL] لا قيمة منها مخبوزة في Flutter. الحدّ الأدنى يُرفع من اللوحة
/// بعد نشر نسخة جديدة، فلا يحتاج إجبارُ التحديث بناءَ تطبيقٍ ولا بناءَ خادم
/// — وهو الغرض كلّه.
///
/// [STEP 64 §16] التفعيل، والحدّ الأدنى، ورابط التحديث الواحد. لا رسالة
/// مسؤول (النصّ المترجَم الافتراضي وحده).
///
/// [STEP 70] و«أحدث إصدار» (قرار المالك 2026-10-24): نسخةٌ دونه وليست دون
/// الحدّ ترى تنبيهاً اختيارياً يُغلق (`OptionalUpdatePrompt`) — لا حجب.
class AppVersionConfig {
  const AppVersionConfig({
    this.minimumSupportedVersion = '',
    this.latestVersion = '',
    this.updateUrl = '',
  });

  /// الحدّ **الفعّال**: فارغٌ حين يكون الإجبار معطَّلاً.
  final String minimumSupportedVersion;

  /// أحدث إصدار منشور — فارغٌ حين لا تنبيه.
  final String latestVersion;

  /// رابط زرّ «تحديث التطبيق» — واحدٌ للمنصّتين، ومتجرٌ رسمي دائماً
  /// ([trustedStoreUrl])؛ فارغٌ إن لم يصل رابطٌ موثوق.
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
  /// مخرج منها سواه. وأوّلُها **الموثوق**: رابطٌ ليس متجراً رسمياً لا يُفتح.
  ///
  /// و`latestVersion`: يُقرأ ما لم يقل الخادم `updateMode: none` (خادمٌ قبل
  /// STEP 70 يرسله فارغاً).
  factory AppVersionConfig.fromJson(Map<String, dynamic> json, {bool? isIos}) {
    String read(String key) {
      final value = json[key];
      return value is String ? value.trim() : '';
    }

    final enabled = json['forceUpdateEnabled'] != false;
    final ios = isIos ?? (!kIsWeb && Platform.isIOS);
    final legacyPreferred = read(ios ? 'iosStoreUrl' : 'androidStoreUrl');
    final legacyOther = read(ios ? 'androidStoreUrl' : 'iosStoreUrl');
    final url =
        trustedStoreUrl(read('updateUrl')) ??
        trustedStoreUrl(legacyPreferred) ??
        trustedStoreUrl(legacyOther) ??
        '';
    return AppVersionConfig(
      minimumSupportedVersion: enabled ? read('minimumSupportedVersion') : '',
      latestVersion: json['updateMode'] == 'none' ? '' : read('latestVersion'),
      updateUrl: url,
    );
  }

  Map<String, dynamic> toJson() => {
    'minimumSupportedVersion': minimumSupportedVersion,
    'latestVersion': latestVersion,
    'updateUrl': updateUrl,
  };
}
