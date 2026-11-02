/// إيصال طلبٍ يحسمه المسؤول — إنشاء حساب أو إعادة تعيين كلمة مرور.
///
/// ═══ القرار ═══ لا رمز SMS ولا بريد. الخادم يعيد **إيصالاً** لا جلسة:
/// الطلب معلَّق حتى تتحقّق الإدارة من صاحبه عبر واتساب وتحسمه من اللوحة.
/// التطبيق يعرض شاشة انتظار ولا يملك — ولا يجب أن يملك — أي مسار يفعّل
/// الحساب أو يغيّر كلمة المرور من جهته.
class AccountRequestReceipt {
  const AccountRequestReceipt({
    required this.id,
    required this.status,
    required this.createdAt,
  });

  final String id;

  /// `pending` عند الإنشاء دائماً — القيم الأخرى (`approved`/`rejected`)
  /// قرارُ اللوحة ولا تصل التطبيق من هذا المسار.
  final String status;
  final DateTime? createdAt;

  factory AccountRequestReceipt.fromJson(Map<String, dynamic> json) =>
      AccountRequestReceipt(
        id: json['id']?.toString() ?? '',
        status: json['status']?.toString() ?? 'pending',
        createdAt: DateTime.tryParse(json['createdAt']?.toString() ?? ''),
      );
}

/// نوع الطلب — يقرّر نصّ شاشة الانتظار.
enum AccountRequestKind { registration, passwordReset }
