/// خطأ موحّد يصل للواجهة برسالة جاهزة للعرض.
///
/// [statusCode] يميّز رفض المصادقة (401) عن أعطال الشبكة المؤقتة، وهو ما
/// تعتمد عليه استعادة الجلسة كي لا تمسح توكناً صالحاً عند انقطاع مؤقت.
/// يبقى `null` حين لا توجد استجابة من الخادم أصلاً (انقطاع/مهلة).
class AppException implements Exception {
  const AppException(this.message, {this.statusCode, this.code});

  final String message;
  final int? statusCode;

  /// رمز الخطأ الذي يرسله الخادم في `error.code` (مثل ALREADY_CONFIRMED).
  ///
  /// يسمح للشاشات بالتفريق بين أسباب الرفض بدل مطابقة نصوص الرسائل.
  final String? code;

  /// هل رفض الخادم الجلسة فعلاً؟ (بخلاف تعذّر الوصول إليه)
  bool get isUnauthorized => statusCode == 401;

  @override
  String toString() => message;
}
