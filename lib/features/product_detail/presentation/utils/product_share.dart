import '../../../../core/l10n/app_strings.dart';

/// نصّ مشاركة المنتج (STEP 64 §19): اسمه، ثم رابط المتجر في سطرٍ تالٍ.
///
/// [CRITICAL] بلا سعر — السعر يتغيّر (عروض، تخفيضات) ورسالةٌ أُرسلت لا
/// تُحدَّث. والرابط من إعدادات المتجر (`share.storeUrl`) لا من الكود: يضبطه
/// المسؤول من لوحة التحكم. غير مضبوط = الاسم وحده، لا سطرٌ فارغ ولا رابطٌ
/// مختلَق.
///
/// المدخل الوحيد لمشاركة منتج في التطبيق؛ `product_share_test.dart` يحرس
/// أن كل استدعاءٍ لطبقة المشاركة يمرّ من هنا.
String productShareText(
  AppStrings strings, {
  required String name,
  required String storeUrl,
}) {
  final url = storeUrl.trim();
  if (url.isEmpty) return name;
  return strings.p('shareProductText', {'name': name, 'url': url});
}
