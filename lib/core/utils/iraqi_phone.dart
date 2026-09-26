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

/// بادئة الرقم العراقي المحلّي كما يعرفها كل مستخدم — ثابتة في الحقل.
const String kIraqiLocalPrefix = '07';

/// عدد الأرقام التي يكتبها المستخدم بعد البادئة: ٠٧ + ٩ = ١١ رقماً.
const int kIraqiLocalDigits = 9;

/// الأرقام التسعة التي تلي `07` من أي صيغةٍ يكتبها أو يلصقها المستخدم.
///
/// يطبّع الأرقام الشرقية، يُسقط الفواصل و`+`، ويُسقط البادئات **الصريحة**:
/// الدولية (`00964`، `964` ثم الـ7 التي تليها) والمحلّية (`07`) — فيبقى ما
/// بعد `07` وحده، مقصوصاً على [kIraqiLocalDigits]. `07701234567` و
/// `+9647701234567` و`701234567` تعطي جميعاً `701234567`.
///
/// لا يُستدلّ على البادئة من الطول: رقمٌ عاشر يُكتب سهواً يُقصّ ولا يُزيح
/// ما قبله — فالحقل يبقى مستقرّاً تحت أصابع المستخدم.
///
/// [CRITICAL] تسهيلُ كتابةٍ لا تحقّق: الحكم لـ[isValidIraqiPhone] على الرقم
/// الكامل (`kIraqiLocalPrefix + digits`) ثم للخادم.
String iraqiLocalDigits(String raw) {
  var digits = normalizeDigits(raw).replaceAll(RegExp(r'[^0-9]'), '');
  if (digits.startsWith('009647')) {
    digits = digits.substring(6);
  } else if (digits.startsWith('9647')) {
    digits = digits.substring(4);
  } else if (digits.startsWith('07')) {
    digits = digits.substring(2);
  }
  return digits.length > kIraqiLocalDigits
      ? digits.substring(0, kIraqiLocalDigits)
      : digits;
}

/// الرقم الكامل بصيغته المحلّية من الأرقام المكتوبة بعد البادئة.
String iraqiPhoneFromLocalDigits(String digits) => '$kIraqiLocalPrefix$digits';

/// مُنسّق حقل الهاتف: يحوّل كل إدخالٍ إلى الأرقام التسعة بعد `07`.
///
/// البادئة نفسها تُعرض ثابتةً في الحقل (`prefixText`)، فلا يكتبها المستخدم
/// — وإن كتبها (أو لصق رقماً كاملاً بأي صيغة) أُسقطت عنه بدل أن تُعدّ
/// ضمن الأرقام التسعة. لا حروف، ولا أكثر من تسعة أرقام.
class IraqiLocalDigitsFormatter extends TextInputFormatter {
  const IraqiLocalDigitsFormatter();

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final digits = iraqiLocalDigits(newValue.text);
    if (digits == newValue.text) return newValue;
    return TextEditingValue(
      text: digits,
      selection: TextSelection.collapsed(offset: digits.length),
    );
  }
}
