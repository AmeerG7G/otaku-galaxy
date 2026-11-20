import 'package:flutter/widgets.dart';

import '../l10n/app_strings.dart';

/// خطأ موحّد يصل للواجهة برسالة جاهزة للعرض.
///
/// [statusCode] يميّز رفض المصادقة (401) عن أعطال الشبكة المؤقتة، وهو ما
/// تعتمد عليه استعادة الجلسة كي لا تمسح توكناً صالحاً عند انقطاع مؤقت.
/// يبقى `null` حين لا توجد استجابة من الخادم أصلاً (انقطاع/مهلة).
class AppException implements Exception {
  const AppException(
    this.message, {
    this.statusCode,
    this.code,
    this.messageKey,
  });

  final String message;
  final int? statusCode;

  /// رمز الخطأ الذي يرسله الخادم في `error.code` (مثل ALREADY_CONFIRMED).
  ///
  /// يسمح للشاشات بالتفريق بين أسباب الرفض بدل مطابقة نصوص الرسائل.
  final String? code;

  /// مفتاح `AppStrings` حين يكون النصّ **من التطبيق** لا من الخادم.
  ///
  /// [CRITICAL] طبقة الشبكة بلا `BuildContext`، فلا تستطيع تصريف نصّ.
  /// رسائلُها الاحتياطية كانت عربيةً محفورة، فكانت واجهةٌ كردية تعرض عربياً
  /// عند أول انقطاع. المفتاح يسافر مع الخطأ ويُصرَّف عند العرض. رسالةُ
  /// الخادم نفسها (`data.message`) تبقى كما هي: الخادم يعرف لغة صاحبها
  /// ويرسلها مصرَّفةً، وترجمتُها هنا تحريف.
  final String? messageKey;

  /// هل رفض الخادم الجلسة فعلاً؟ (بخلاف تعذّر الوصول إليه)
  bool get isUnauthorized => statusCode == 401;

  @override
  String toString() => message;
}

/// النصّ المعروض لهذا الخطأ بلغة المستخدم.
///
/// يقدّم [AppException.messageKey] حين وُجد — وهو نصُّ التطبيق — وإلّا
/// [AppException.message] كما وصل من الخادم.
extension AppExceptionText on AppException {
  String localizedMessage(BuildContext context) {
    if (messageKey == null) return message;
    // `p` لا يستبدل إلّا ما وُجد فعلاً في النصّ، فالمفاتيح بلا متغيّرات
    // لا تتأثّر بتمرير هذين.
    return context.strings.p(messageKey!, {
      'status': '${statusCode ?? ''}',
      'detail': message,
    });
  }
}
