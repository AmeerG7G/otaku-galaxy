/// رقم الهاتف العراقي على العميل — مرآةٌ لقاعدة الخادم لا بديلٌ عنها.
///
/// المصدر الوحيد للعقد هو `backend/src/utils/phone.ts`
/// (`normalizeIraqiPhone`) وقيد القاعدة في الهجرة 037:
/// الرقم الوطني `7[5-9]` ثم ثمانية أرقام، يُقبل بصيغة `07…` أو `7…` أو
/// `964…` أو `+964…` أو `00964…`، مع فواصل ` ()-.`، ويُخزَّن `+9647XXXXXXXX`.
/// وهو يغطّي كورك (075) وآسياسيل (077) وزين (078/079) — ويرفض 070–074.
///
/// [CRITICAL] كان التطبيق يتحقّق بـ`length >= 10` فقط ويرسل النصّ كما هو،
/// فيقبل `0770123456` (عشرة أرقام) و`07001234567` ويترك الخادم يرفضهما بعد
/// الإرسال. وكان يرفض ما يقبله الخادم أيضاً: الأرقام الشرقية `٠٧٧…` التي
/// تنتجها بعض لوحات المفاتيح العربية لا تصل الخادم صالحةً — فتُطبَّع هنا
/// إلى الغربية قبل التحقق والإرسال (قرار 2026-09-13: التطبيع على العميل
/// وحده؛ عقد الخادم واختباراته بلا تغيير).
///
/// هذه القيم لا تكون أرخى من الخادم أبداً.
library;

import 'package:flutter/services.dart';

import 'digits.dart';

// تطبيع الأرقام يعيش في `digits.dart` (يستعمله الهاتف واليوم/الشهر معاً)؛
// يُعاد تصديره كي يبقى استيراده من هنا صالحاً.
export 'digits.dart' show normalizeDigits;

final _national = RegExp(r'^7[5-9]\d{8}$');
final _separators = RegExp(r'[ ()\-.]');
final _plusDigits = RegExp(r'^\+?\d+$');

/// يعيد الرقم بصيغة E.164 (`+9647XXXXXXXX`) أو `null` إن لم يكن عراقياً صالحاً.
///
/// نفس خطوات `normalizeIraqiPhone` في الخادم بالترتيب نفسه، مضافاً إليها
/// تطبيع الأرقام الشرقية أولاً.
String? normalizeIraqiPhone(String raw) {
  final trimmed = normalizeDigits(raw.trim()).replaceAll(_separators, '');
  if (!_plusDigits.hasMatch(trimmed)) return null;
  final digits = trimmed.startsWith('+') ? trimmed.substring(1) : trimmed;

  final String national;
  if (digits.startsWith('00964')) {
    national = digits.substring(5);
  } else if (digits.startsWith('964')) {
    national = digits.substring(3);
  } else if (digits.startsWith('0')) {
    national = digits.substring(1);
  } else {
    national = digits;
  }
  if (!_national.hasMatch(national)) return null;
  return '+964$national';
}

bool isValidIraqiPhone(String raw) => normalizeIraqiPhone(raw) != null;

/// طول الرقم كما يكتبه الزبون كاملاً في الحقل: `07` ثم تسعة أرقام.
const int kIraqiLocalPhoneLength = 11;

final _localMobile = RegExp(r'^07[5-9]\d{8}$');

/// هل ما في حقل الهاتف رقمُ موبايلٍ عراقي كاملٌ بصيغته المحلية `07XXXXXXXXX`؟
///
/// [PRODUCT] (2026-09-27) لا بادئة `07` ثابتة في الحقل بعد اليوم: يكتب الزبون
/// الرقم كاملاً بنفسه، `07` ضمناً. القاعدة لم تتغيّر — هي [normalizeIraqiPhone]
/// نفسها (`7[5-9]` ثم ثمانية أرقام) مكتوبةً بالصيغة المحلية التي يعرفها كل
/// زبون؛ فرقمٌ بلا `07` في أوّله لا يمرّ من الحقل.
bool isValidIraqiLocalPhone(String raw) =>
    _localMobile.hasMatch(normalizeDigits(raw.trim()).replaceAll(_separators, ''));

/// ما يبقى في حقل الهاتف من أي نصٍّ يُكتب أو يُلصق.
///
/// يطبّع الأرقام الشرقية ويُسقط كل ما ليس رقماً (فواصل، `+`، حروف)، مقصوصاً
/// على [kIraqiLocalPhoneLength].
///
/// [CRITICAL] لا بادئة تُضاف ولا تُحذف: ما كتبه الزبون يبقى أرقامَه هو —
/// `7` لا تصير `07`. تسهيلُ كتابةٍ لا تحقّق: الحكم لـ[isValidIraqiLocalPhone]
/// ثم للخادم.
String iraqiPhoneInputText(String raw) {
  final digits = normalizeDigits(raw).replaceAll(RegExp(r'[^0-9]'), '');
  return digits.length > kIraqiLocalPhoneLength
      ? digits.substring(0, kIraqiLocalPhoneLength)
      : digits;
}

/// مُنسّق حقل الهاتف: أرقامٌ غربية فقط، حتى أحد عشر رقماً.
class IraqiPhoneInputFormatter extends TextInputFormatter {
  const IraqiPhoneInputFormatter();

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final text = iraqiPhoneInputText(newValue.text);
    if (text == newValue.text) return newValue;
    return TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );
  }
}
