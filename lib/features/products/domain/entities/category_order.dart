import 'category.dart';

/// هوية القسم وترتيبه — مصدر واحد يستعمله كل ما يعرض الأقسام الرئيسية.
///
/// [CRITICAL] المفتاح المستقرّ هنا هو **الاسم بعد التطبيع** لا المعرّف.
/// المعرّف `UUID` يولَّد في كل بيئة على حدة، فقسم «الحقائب» في التطوير غيره
/// في الإنتاج — أي أن أي جدول مكتوب في التطبيق ومربوط بالمعرّفات يصحّ في
/// بيئة ويخطئ في الأخرى. أمّا الاسم فهو `UNIQUE` في الجدول (هجرة ٠٠٢) ولا
/// يتغيّر بين البيئات، فهو المفتاح التجاري الوحيد المتاح.
///
/// والتطبيع ضروري لأن الاسم يُكتب بأشكال إملائية مختلفة: «الحقائب» و«حقائب»،
/// «إكسسوارات» و«اكسسوارات»، «متنوعة» و«متنوعه». مطابقةُ النصّ حرفياً كانت
/// ستفشل على واحدٍ من هذه ويعود القسم إلى الترتيب والّلون الاحتياطيَّين بلا
/// أي خطأ ظاهر.

/// يُرجع المفتاح المستقرّ لاسم قسم.
///
/// يوحّد: همزات الألف (أ إ آ ٱ → ا)، التاء المربوطة (ة → ه)، الألف المقصورة
/// (ى → ي)، ويحذف التشكيل وأداة التعريف والمسافات الزائدة.
String canonicalCategoryKey(String name) {
  var key = name.trim();

  const replacements = {
    'أ': 'ا',
    'إ': 'ا',
    'آ': 'ا',
    'ٱ': 'ا',
    'ة': 'ه',
    'ى': 'ي',
    'ؤ': 'و',
    'ئ': 'ي',
  };
  for (final entry in replacements.entries) {
    key = key.replaceAll(entry.key, entry.value);
  }

  // التشكيل والتطويل — لا يغيّران الكلمة ويكسران المطابقة.
  key = key.replaceAll(RegExp('[ؐ-ًؚ-ْـ]'), '');
  // أداة التعريف: «الحقائب» و«حقائب» قسم واحد.
  if (key.startsWith('ال') && key.length > 3) key = key.substring(2);
  // مسافات متعددة → واحدة.
  key = key.replaceAll(RegExp(r'\s+'), ' ').trim();

  return key;
}

/// الترتيب المعتمد للأقسام الرئيسية الستة، كما يريده صاحب المتجر.
///
/// [CRITICAL] هذا ترتيب **عرض** للعميل لا قيدٌ على اللوحة: المسؤول يبقى
/// حرّاً في `sort_order` وفي إضافة أقسام وحذفها، والأقسام التي لا تظهر هنا
/// تُعرض بعد الستة محتفظةً بترتيب الخادم بينها. فلا تتغيّر تصرفات الـCRUD
/// ولا يحتاج الخادم تعديلاً.
/// [CRITICAL] تُكتب بالإملاء الطبيعي وتُطبَّع عند المقارنة، لا مكتوبةً
/// مطبَّعةً سلفاً. كتابةُ المفتاح المطبَّع يدوياً تعني أن أي تعديل في
/// [canonicalCategoryKey] يفصل القائمة عن الدالة بصمت — وقد وقع ذلك فعلاً:
/// تطبيعُ الهمزة (ئ → ي) يحوّل «حقائب» إلى «حقايب»، فلم تعد تطابق المفتاح
/// المكتوب يدوياً، وسقط القسم من الترتيب ومن جدول الألوان معاً.
const List<String> kMainCategoryOrder = [
  'قرطاسية',
  'الحقائب',
  'إكسسوارات',
  'ملابس',
  'مجسمات وهدايا',
  'منتجات أنمي متنوعة',
];

/// المفاتيح المطبَّعة للترتيب المعتمد — تُشتقّ من [kMainCategoryOrder].
final List<String> _mainKeys = [
  for (final name in kMainCategoryOrder) canonicalCategoryKey(name),
];

/// رتبة القسم في الترتيب المعتمد، أو `kMainCategoryOrder.length` لغيره.
int mainCategoryRank(Category category) {
  final index = _mainKeys.indexOf(canonicalCategoryKey(category.name));
  return index == -1 ? kMainCategoryOrder.length : index;
}

/// هل هذا أحد الأقسام الرئيسية الستة؟
bool isMainCategory(Category category) =>
    mainCategoryRank(category) < kMainCategoryOrder.length;

/// يرتّب قائمة الأقسام بالترتيب المعتمد.
///
/// [CRITICAL] الترتيب **مستقرّ**: ما لا رتبة له يبقى على ترتيب الخادم بينه
/// وبين نظائره (`sort_order` الذي يضبطه المسؤول)، فلا يُعاد ترتيب أقسامٍ
/// جديدة اعتباطاً لمجرد أنها ليست من الستة.
List<Category> sortByCanonicalOrder(List<Category> categories) {
  final indexed = categories.indexed.toList()
    ..sort((a, b) {
      final byRank = mainCategoryRank(a.$2).compareTo(mainCategoryRank(b.$2));
      return byRank != 0 ? byRank : a.$1.compareTo(b.$1);
    });
  return [for (final entry in indexed) entry.$2];
}
