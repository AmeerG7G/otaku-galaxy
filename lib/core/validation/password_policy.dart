import 'dart:convert' show utf8;

import 'password_policy_data.dart';

/// سياسة كلمة المرور في التطبيق — **مرآةٌ** للخادم لا مصدر (STEP 85).
///
/// المصدر: `backend/src/domain/passwordPolicy.ts` وبياناته
/// `passwordPolicy.data.json`. البيانات هنا مولَّدة منه
/// ([password_policy_data.dart])، والقواعد أدناه سطرٌ بسطرٍ كقواعده، ويحرس
/// تطابقَهما ملفُّ المتّجهات المشترك (`test/password_policy_test.dart`).
///
/// الغرض تجربة المستخدم وحدها: رسالةٌ عند الحقل قبل الإرسال. الحكم للخادم،
/// ورفضُه يصل برسالته المترجمة حتى لو فات التطبيقَ شيء.
///
/// فرقٌ واحد مقصود: Dart بلا تطبيع NFKC، فيُطوى هنا ما يكتبه الناس فعلاً —
/// الأرقام والحروف اللاتينية «العريضة» (U+FF01–FF5E) والمسافة العريضة. أشكال
/// العرض العربية (U+FB50–FEFF) لا تُطوى؛ لو كُتبت بها كلمةٌ شائعة لقبلها
/// التطبيق ورفضها الخادم برسالته.
enum PasswordProblem {
  tooShort('passwordMinLength'),
  adminTooShort('passwordAdminMinLength'),
  tooLong('passwordTooLong'),
  blank('passwordBlank'),
  weak('passwordWeak'),
  containsPhone('passwordContainsPhone'),
  containsUsername('passwordContainsUsername');

  const PasswordProblem(this.stringKey);

  /// مفتاح الرسالة في `AppStrings` — نصّها يطابق رسالة الخادم حرفياً.
  final String stringKey;
}

/// أول مشكلة بترتيب الخادم: الطول (نقاط ترميز) ← ٧٢ بايتاً ← النمط ← الهوية؛ `null` = مقبولة.
///
/// [phone] و[username] لصاحب الحساب حين يُعرفان (التسجيل، الإعدادات).
/// [admin]: حدّ المسؤول (١٢) بدل حدّ الزبون (٨).
PasswordProblem? passwordProblem(
  String password, {
  bool admin = false,
  String? phone,
  String? username,
}) {
  final min = admin ? kPolicyAdminMinLength : kPolicyMinLength;
  // [CRITICAL] بنقاط الترميز كما يعدّ zod 4 في الخادم، لا بوحدات UTF-16
  // (`String.length`): ٤ رموز تعبيرية = ٨ وحدات لكنها ٤ أحرف عند الخادم.
  if (password.runes.length < min) {
    return admin ? PasswordProblem.adminTooShort : PasswordProblem.tooShort;
  }
  if (utf8.encode(password).length > kPolicyMaxBytes) {
    return PasswordProblem.tooLong;
  }
  return passwordPatternProblem(password) ??
      passwordIdentityProblem(password, phone: phone, username: username);
}

final List<String> _allSequences = [
  ...kPolicySequences,
  for (final s in kPolicySequences)
    String.fromCharCodes(s.runes.toList().reversed),
];

final RegExp _spacesAndTatweel = RegExp(r'[\sـ]+');
final RegExp _edgeNoise = RegExp(
  r'^[\d\p{P}\p{S}]+|[\d\p{P}\p{S}]+$',
  unicode: true,
);
final RegExp _innerNoise = RegExp(r'[\d\p{P}\p{S}]', unicode: true);
final RegExp _nonDigit = RegExp(r'\D');

/// أرقام عربية-هندية (U+0660) وفارسية (U+06F0) ← لاتينية.
String _asciiDigits(String s) => String.fromCharCodes(
  s.runes.map((r) {
    if (r >= 0x0660 && r <= 0x0669) return r - 0x0660 + 0x30;
    if (r >= 0x06F0 && r <= 0x06F9) return r - 0x06F0 + 0x30;
    return r;
  }),
);

/// بديل NFKC الجزئي — انظر رأس الملف.
String _foldWide(String s) => String.fromCharCodes(
  s.runes.map((r) {
    if (r >= 0xFF01 && r <= 0xFF5E) return r - 0xFEE0;
    if (r == 0x3000) return 0x20;
    return r;
  }),
);

/// كـ`compactForm` في الخادم: مطويّ، أحرف صغيرة، أرقام لاتينية، بلا فراغات ولا تطويل.
String _compactForm(String s) =>
    _asciiDigits(_foldWide(s).toLowerCase()).replaceAll(_spacesAndTatweel, '');

String _unLeet(String s) => s.runes.map((r) {
  final c = String.fromCharCode(r);
  return kPolicyLeet[c] ?? c;
}).join();

bool _isSequenceRun(String s) =>
    s.length >= kPolicyMinRunLength &&
    _allSequences.any((seq) => seq.contains(s));

bool _isCommon(String s) =>
    kPolicyCommonWords.contains(s) || kPolicyCommonWords.contains(_unLeet(s));

int _distinct(String s) => s.runes.toSet().length;

/// هل كلمة المرور سهلة التخمين بذاتها؟ كـ`passwordPatternCode` في الخادم.
PasswordProblem? passwordPatternProblem(String password) {
  if (password.trim().isEmpty) return PasswordProblem.blank;
  final compact = _compactForm(password);

  if (_distinct(compact) < kPolicyMinDistinctChars) return PasswordProblem.weak;
  if (_isSequenceRun(compact)) return PasswordProblem.weak;
  if (_isCommon(compact)) return PasswordProblem.weak;

  final core = compact.replaceAll(_edgeNoise, '');
  if (core.length >= kPolicyMinCoreLength) {
    final joined = _unLeet(core).replaceAll(_innerNoise, '');
    if (_isCommon(core) ||
        _isCommon(joined) ||
        _isSequenceRun(core) ||
        _isSequenceRun(_unLeet(core))) {
      return PasswordProblem.weak;
    }
  } else {
    final digits = compact.replaceAll(_nonDigit, '');
    if (digits.isNotEmpty &&
        (_distinct(digits) < kPolicyMinDistinctChars ||
            _isSequenceRun(digits))) {
      return PasswordProblem.weak;
    }
  }
  return null;
}

/// هل تحوي رقم الهاتف (آخر ثمانية أرقام) أو اسم المستخدم (٣ أحرف فأكثر)؟
PasswordProblem? passwordIdentityProblem(
  String password, {
  String? phone,
  String? username,
}) {
  final compact = _compactForm(password);
  final digits = compact.replaceAll(_nonDigit, '');
  if (phone != null) {
    final all = _asciiDigits(phone).replaceAll(_nonDigit, '');
    if (all.length >= kPolicyPhoneTailDigits) {
      final tail = all.substring(all.length - kPolicyPhoneTailDigits);
      if (digits.contains(tail)) return PasswordProblem.containsPhone;
    }
  }
  if (username != null) {
    final name = _compactForm(username);
    if (name.length >= kPolicyMinUsernameLength && compact.contains(name)) {
      return PasswordProblem.containsUsername;
    }
  }
  return null;
}
