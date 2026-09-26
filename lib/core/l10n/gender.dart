import 'package:flutter/widgets.dart';
import '../../features/settings/presentation/cubit/locale_cubit.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'app_strings.dart' show AppLanguageContext;

import '../../features/auth/presentation/cubit/auth_cubit.dart';

/// جنس صاحب الحساب في طبقة العرض.
///
/// [unknown] ليست حالة خطأ: الحسابات التي أُنشئت قبل إضافة الحقل لم تُسأل،
/// ولا يجوز أن يُخمَّن لها شيء. تُخاطَب بصيغة محايدة.
enum AppGender {
  male,
  female,
  unknown;

  /// يحوّل قيمة الخادم (`male` / `female` / غياب) إلى الحالة المقابلة.
  ///
  /// أي قيمة أخرى تسقط إلى [unknown] بدل أن تُفسَّر: نصٌّ لا نعرفه ليس سبباً
  /// لمخاطبة أحد بصيغة قد لا تكون له.
  static AppGender fromValue(String? value) => switch (value) {
    'male' => AppGender.male,
    'female' => AppGender.female,
    _ => AppGender.unknown,
  };

  /// القيمة كما يفهمها الخادم — `null` لمن لم يختر.
  String? get value => switch (this) {
    AppGender.male => 'male',
    AppGender.female => 'female',
    AppGender.unknown => null,
  };

  bool get isKnown => this != AppGender.unknown;
}

/// نصٌّ عربي بصيغه المصرَّفة.
///
/// [CRITICAL] هذا هو المكان الوحيد الذي يعرف أن العربية تُصرِّف الخطاب. بدونه
/// ينتشر `if (gender == …)` في الودجات، فتُنسى صيغةٌ هنا وتُخطئ أخرى هناك ولا
/// يمكن مراجعة الحصيلة في مكان واحد. الودجة تطلب النصّ ولا تسأل عن الجنس.
///
/// المنطق التجاري لا يمرّ من هنا إطلاقاً: هذه نصوص عرض، والمعرّفات التقنية
/// (`male`, `explorer`, `orderId`) تبقى إنجليزية كما هي.
@immutable
class Gendered {
  const Gendered(this.male, this.female, {this.neutral, this.ckb});

  /// صيغة المخاطَب المذكّر.
  final String male;

  /// صيغة المخاطَبة المؤنّثة.
  final String female;

  /// صيغة محايدة لمن لم يحدّد جنسه.
  ///
  /// [CRITICAL] ليست ترفاً. الرجوع إلى المذكّر لكل مجهول يخاطب نصف الزبائن
  /// بصيغة ليست لهم لمجرّد أنهم لم يُسألوا بعد. حيثما وُجدت صياغة محايدة
  /// طبيعية (المصدر بدل الأمر: «إضافة» بدل «أضف») تُكتب هنا وتُستعمل.
  ///
  /// حين تُترك `null` فذلك إقرارٌ بأن لا صياغة محايدة طبيعية لهذه الجملة،
  /// فتُستعمل المذكّرة كأقل الاحتمالات إرباكاً — لا كخيار افتراضي غافل.
  final String? neutral;

  /// الصيغة الكردية (سوراني) — **واحدة لا ثلاث**.
  ///
  /// [CRITICAL] السوراني لا يصرّف فعل الأمر بجنس المخاطَب: «أضف» و«أضيفي»
  /// كلتاهما «زیادی بکە». نسخُ تفريع العربية إلى الكردية كان سيخترع تمييزاً
  /// لا وجود له في اللغة، ويضاعف ما يُراجَع ثلاث مرّات بلا فائدة.
  ///
  /// ⚠ مسوّدة تنتظر مراجعة ناطق.
  final String? ckb;

  /// النصّ بلغة الواجهة: الكردية لا تسأل عن الجنس، والعربية تسأل.
  String ofLocale(AppGender gender, AppLanguage language) {
    if (language == AppLanguage.kurdish) {
      final value = ckb;
      if (value != null && value.trim().isNotEmpty) return value;
      return neutral ?? male;
    }
    return of(gender);
  }

  String of(AppGender gender) => switch (gender) {
    AppGender.male => male,
    AppGender.female => female,
    AppGender.unknown => neutral ?? male,
  };

  @override
  bool operator ==(Object other) =>
      other is Gendered &&
      other.male == male &&
      other.female == female &&
      other.neutral == neutral;

  @override
  int get hashCode => Object.hash(male, female, neutral);
}

/// نصوص الواجهة المصرَّفة حسب الجنس — مجموعة في مكان واحد.
///
/// ما يدخل هنا: ما تتغيّر صياغته العربية فعلاً بتغيّر المخاطَب (أفعال الأمر،
/// أسماء المستويات، الجُمل التي تصف الزبون).
///
/// ما لا يدخل: الأسماء المحايدة أصلاً («السلة»، «المفضلة»، «طلباتي»،
/// «الإعدادات»). تصريفُ ما لا يُصرَّف يُفسد العربية ولا يُصلح شيئاً.
class GenderedStrings {
  const GenderedStrings._();

  // ── أفعال الأمر في الأزرار والدعوات ──
  //
  // الصيغة المحايدة هي المصدر: «إضافة إلى السلة» تصلح للجميع وتبقى عربية
  // سليمة، بخلاف «أضف/أضيفي» اللتين تفترضان مخاطَباً بعينه.

  static const addToCart = Gendered(
    'أضف إلى السلة',
    'أضيفي إلى السلة',
    neutral: 'إضافة إلى السلة',
    ckb: 'زیادی بکە بۆ سەبەتە',
  );

  static const completeOrder = Gendered(
    'أكمل الطلب',
    'أكملي الطلب',
    neutral: 'إكمال الطلب',
    ckb: 'داواکارییەکە تەواو بکە',
  );

  static const chooseGovernorate = Gendered(
    'اختر المحافظة',
    'اختاري المحافظة',
    neutral: 'اختيار المحافظة',
    ckb: 'پارێزگا هەڵبژێرە',
  );

  static const chooseZone = Gendered(
    'اختر منطقة التوصيل',
    'اختاري منطقة التوصيل',
    neutral: 'اختيار منطقة التوصيل',
    ckb: 'ناوچەی گەیاندن هەڵبژێرە',
  );

  static const rateProduct = Gendered(
    'قيّم المنتج',
    'قيّمي المنتج',
    neutral: 'تقييم المنتج',
    ckb: 'بەرهەمەکە هەڵبسەنگێنە',
  );

  static const writeYourOpinion = Gendered(
    'اكتب رأيك في المنتج… الجودة، الحجم، سرعة التوصيل.',
    'اكتبي رأيك في المنتج… الجودة، الحجم، سرعة التوصيل.',
    neutral: 'رأيك في المنتج… الجودة، الحجم، سرعة التوصيل.',
    ckb: 'ڕات دەربارەی بەرهەمەکە بنووسە… جۆرییەت، قەبارە، خێرایی گەیاندن.',
  );

  static const addPhotos = Gendered(
    'أضف صوراً للمنتج',
    'أضيفي صوراً للمنتج',
    neutral: 'إضافة صور للمنتج',
    ckb: 'وێنە بۆ بەرهەمەکە زیاد بکە',
  );

  static const shareYourOpinion = Gendered(
    'شاركنا رأيك',
    'شاركينا رأيك',
    neutral: 'مشاركة رأيك',
    ckb: 'ڕات لەگەڵمان بەشدار بکە',
  );

  /// دعوة الاشتراك بتنبيه التوفر — فعل أمر، فيُصرَّف.
  static const notifyWhenAvailable = Gendered(
    'أعلمني عند توفر المنتج',
    'أعلميني عند توفر المنتج',
    neutral: 'تنبيهي عند توفر المنتج',
    ckb: 'ئاگادارم بکەوە کاتێک بەرهەمەکە بەردەست بوو',
  );

  static const registerCta = Gendered(
    'سجّل الآن',
    'سجّلي الآن',
    neutral: 'إنشاء حساب',
    ckb: 'ئێستا خۆت تۆمار بکە',
  );

  static const chooseZoneBeforeOrder = Gendered(
    'اختر منطقة التوصيل قبل إرسال الطلب.',
    'اختاري منطقة التوصيل قبل إرسال الطلب.',
    neutral: 'اختيار منطقة التوصيل مطلوب قبل إرسال الطلب.',
    ckb: 'پێش ناردنی داواکاری، ناوچەی گەیاندن هەڵبژێرە.',
  );

  static const chooseAllOptions = Gendered(
    'اختر كل الخيارات المطلوبة قبل الإضافة إلى السلة.',
    'اختاري كل الخيارات المطلوبة قبل الإضافة إلى السلة.',
    neutral: 'اختيار كل الخيارات المطلوبة مطلوب قبل الإضافة إلى السلة.',
    ckb: 'پێش زیادکردن بۆ سەبەتە، هەموو بژاردە پێویستەکان هەڵبژێرە.',
  );

  static const enterNewName = Gendered(
    'أدخل اسمك الجديد',
    'أدخلي اسمك الجديد',
    neutral: 'الاسم الجديد',
    ckb: 'ناوی نوێت بنووسە',
  );

  static const rateOrderProducts = Gendered(
    'قيّم منتجات طلبك',
    'قيّمي منتجات طلبك',
    neutral: 'تقييم منتجات طلبك',
    ckb: 'بەرهەمەکانی داواکارییەکەت هەڵبسەنگێنە',
  );

  /// زرّ التقييم داخل بطاقة الطلب — مربوط بذلك الطلب وحده.
  static const rateYourOrder = Gendered(
    'قيّم طلبك',
    'قيّمي طلبك',
    neutral: 'تقييم طلبك',
    ckb: 'داواکارییەکەت هەڵبسەنگێنە',
  );

  static const rateProductsShort = Gendered(
    'قيّم المنتجات',
    'قيّمي المنتجات',
    neutral: 'تقييم المنتجات',
    ckb: 'بەرهەمەکان هەڵبسەنگێنە',
  );

  static const searchHintBody = Gendered(
    'اكتب اسم المنتج أو الأنمي، وسنعرض لك كل المتوفر في المتجر.',
    'اكتبي اسم المنتج أو الأنمي، وسنعرض لك كل المتوفر في المتجر.',
    neutral: 'اسم المنتج أو الأنمي يكفي، وسنعرض كل المتوفر في المتجر.',
    ckb: 'ناوی بەرهەم یان ئەنیمە بنووسە، هەموو ئەوەی لە فرۆشگا بەردەستە پیشانت دەدەین.',
  );

  static const addProductsToCollection = Gendered(
    'أضف منتجات لهذه المجموعة من صفحة المنتج عبر «أضف إلى مجموعتك».',
    'أضيفي منتجات لهذه المجموعة من صفحة المنتج عبر «أضف إلى مجموعتك».',
    neutral:
        'تُضاف المنتجات لهذه المجموعة من صفحة المنتج عبر «أضف إلى مجموعتك».',
    ckb: 'لە پەڕەی بەرهەمەوە بە «زیادی بکە بۆ کۆمەڵەکەت» بەرهەم بۆ ئەم کۆمەڵەیە زیاد بکە.',
  );

  static const tapHeartToSave = Gendered(
    'اضغط القلب على أي منتج يعجبك ليُحفظ هنا.',
    'اضغطي القلب على أي منتج يعجبك ليُحفظ هنا.',
    neutral: 'القلب على أي منتج يعجبك يحفظه هنا.',
    ckb: 'دڵەکە لەسەر هەر بەرهەمێک کە بەدڵتە، لێرە پاشەکەوتی دەکات.',
  );

  static const browseAndPick = Gendered(
    'تصفّح المتجر واختر ما يعجبك — ستنتظرك السلة.',
    'تصفّحي المتجر واختاري ما يعجبك — ستنتظرك السلة.',
    neutral: 'تصفّح المتجر واختيار ما يعجبك — ستنتظرك السلة.',
    ckb: 'فرۆشگاکە بگەڕێ و ئەوەی بەدڵتە هەڵبژێرە — سەبەتەکە چاوەڕێتە.',
  );

  static const choosePreferences = Gendered(
    'اختر لغتك والمظهر المناسب لك.',
    'اختاري لغتك والمظهر المناسب لك.',
    neutral: 'اختيار اللغة والمظهر المناسبين لك.',
    ckb: 'زمان و ڕووکاری گونجاو بۆ خۆت هەڵبژێرە.',
  );

  static const reachedPhotoLimit = Gendered(
    'وصلت إلى الحد الأقصى',
    'وصلتِ إلى الحد الأقصى',
    neutral: 'بلغت الصور الحد الأقصى',
    ckb: 'وێنەکان گەیشتنە زۆرترین ژمارە',
  );

  // ── نصوص الزائر ──
  //
  // [NOTE] هذه تُعرض لمن لا جلسة له، فجنسه مجهول بالضرورة ولا يمكن أن يكون
  // غير ذلك. الصيغة المحايدة هي المعروضة عملياً دائماً، وتبقى الصيغتان
  // الأخريان لأن نفس النصّ قد يُعرض لمن سجّل ثم خرج.

  static const loginFirst = Gendered(
    'سجّل دخولك أولاً',
    'سجّلي دخولك أولاً',
    neutral: 'تسجيل الدخول أولاً',
    ckb: 'سەرەتا بچۆ ژوورەوە',
  );

  static const loginToFollow = Gendered(
    'سجّل الدخول لتتابع طلباتك وتحفظ مفضلتك ومجموعاتك.',
    'سجّلي الدخول لتتابعي طلباتك وتحفظي مفضلتك ومجموعاتك.',
    neutral: 'تسجيل الدخول يتيح متابعة الطلبات وحفظ المفضلة والمجموعات.',
    ckb: 'چوونەژوورەوە ڕێگەت پێدەدات داواکارییەکان بەدواداچوون بکەیت و دڵخوازەکان و کۆمەڵەکان پاشەکەوت بکەیت.',
  );

  static const loginToSaveFavorites = Gendered(
    'سجّل الدخول لتحفظ ما يعجبك',
    'سجّلي الدخول لتحفظي ما يعجبك',
    neutral: 'تسجيل الدخول لحفظ ما يعجبك',
    ckb: 'بچۆ ژوورەوە بۆ پاشەکەوتکردنی ئەوەی بەدڵتە',
  );

  static const loginToStartCart = Gendered(
    'سجّل الدخول لتبدأ سلتك',
    'سجّلي الدخول لتبدئي سلتك',
    neutral: 'تسجيل الدخول لبدء سلتك',
    ckb: 'بچۆ ژوورەوە بۆ دەستپێکردنی سەبەتەکەت',
  );

  static const loginToAddToCart = Gendered(
    'سجّل الدخول لإضافة منتجات إلى سلتك وإتمام الطلب.',
    'سجّلي الدخول لإضافة منتجات إلى سلتك وإتمام الطلب.',
    neutral: 'تسجيل الدخول يتيح إضافة المنتجات إلى السلة وإتمام الطلب.',
    ckb: 'چوونەژوورەوە ڕێگەت پێدەدات بەرهەم بۆ سەبەتە زیاد بکەیت و داواکارییەکە تەواو بکەیت.',
  );

  static const enterPhoneAndPassword = Gendered(
    'أدخل رقم هاتفك وكلمة المرور للمتابعة إلى حسابك.',
    'أدخلي رقم هاتفك وكلمة المرور للمتابعة إلى حسابك.',
    neutral: 'رقم الهاتف وكلمة المرور للمتابعة إلى حسابك.',
    ckb: 'ژمارەی مۆبایل و وشەی نهێنی بۆ بەردەوامبوون بۆ هەژمارەکەت.',
  );

  static const enterPhoneForReset = Gendered(
    'أدخل رقم هاتفك وسنرسل إليك رمز تحقق لإعادة التعيين.',
    'أدخلي رقم هاتفك وسنرسل إليك رمز تحقق لإعادة التعيين.',
    neutral: 'رقم هاتفك يكفي، وسنرسل إليك رمز تحقق لإعادة التعيين.',
    ckb: 'تەنها ژمارەی مۆبایلت پێویستە، کۆدی پشتڕاستکردنەوەت بۆ دەنێرین.',
  );

  // ── جُمل تصف الزبون ──

  static const welcomeBack = Gendered(
    'أهلاً بك',
    'أهلاً بكِ',
    // «أهلاً بك» بالسكون صالحة للجميع في الفصحى المكتوبة بلا تشكيل.
    neutral: 'أهلاً بك',
    ckb: 'بەخێربێیتەوە',
  );

  static const galaxyResident = Gendered(
    'خطوة واحدة وتصبح من سكّان مجرة الأوتاكو.',
    'خطوة واحدة وتصبحين من سكّان مجرة الأوتاكو.',
    neutral: 'خطوة واحدة وتنضمّ إلى سكّان مجرة الأوتاكو.',
    ckb: 'یەک هەنگاو و دەبیتە یەکێک لە دانیشتووانی گەلاکسی ئۆتاکو.',
  );

  static const reachedTopLevel = Gendered(
    'وصلت لأعلى مستوى 🎉',
    'وصلتِ لأعلى مستوى 🎉',
    neutral: 'أعلى مستوى 🎉',
    ckb: 'بەرزترین ئاست 🎉',
  );

  /// شرط الاشتراك عند إنشاء الحساب.
  static const termsNotice = Gendered(
    'بإنشائك حساباً فأنت توافق على شروط الاستخدام وسياسة الخصوصية.',
    'بإنشائكِ حساباً فأنتِ توافقين على شروط الاستخدام وسياسة الخصوصية.',
    neutral: 'إنشاء الحساب يعني الموافقة على شروط الاستخدام وسياسة الخصوصية.',
    ckb: 'دروستکردنی هەژمار واتە ڕەزامەندی لەسەر مەرجەکانی بەکارهێنان و سیاسەتی تایبەتمەندی.',
  );

  // ── اختيار الجنس نفسه ──
  //
  // [CRITICAL] كانت هنا خمسة ثوابت عربية («الجنس»، «ذكر»، «أنثى»…) بلا أي
  // مسارٍ كردي، فظهرت عربيةً في مُنتقي الجنس والإعدادات في الواجهة الكردية.
  // ليست خطاباً مصرَّفاً بل أسماءَ خيارات، فموضعها `AppStrings`:
  // `gender` · `genderMale` · `genderFemale` · `genderRequired` · `genderNotSet`.

  /// كل المفاهيم المصرَّفة — يستعملها اختبار تغطية الترجمة.
  ///
  /// [CRITICAL] خريطةٌ لا قائمة: الاختبار يسمّي المفهوم الناقص بدل أن يقول
  /// «واحدٌ منها ناقص» ويترك من يبحث يقرأ ثلاثاً وثلاثين إدخالاً.
  static const Map<String, Gendered> all = <String, Gendered>{
    'addToCart': addToCart,
    'completeOrder': completeOrder,
    'chooseGovernorate': chooseGovernorate,
    'chooseZone': chooseZone,
    'rateProduct': rateProduct,
    'writeYourOpinion': writeYourOpinion,
    'addPhotos': addPhotos,
    'shareYourOpinion': shareYourOpinion,
    'notifyWhenAvailable': notifyWhenAvailable,
    'registerCta': registerCta,
    'chooseZoneBeforeOrder': chooseZoneBeforeOrder,
    'chooseAllOptions': chooseAllOptions,
    'enterNewName': enterNewName,
    'rateOrderProducts': rateOrderProducts,
    'rateYourOrder': rateYourOrder,
    'rateProductsShort': rateProductsShort,
    'searchHintBody': searchHintBody,
    'addProductsToCollection': addProductsToCollection,
    'tapHeartToSave': tapHeartToSave,
    'browseAndPick': browseAndPick,
    'choosePreferences': choosePreferences,
    'reachedPhotoLimit': reachedPhotoLimit,
    'loginFirst': loginFirst,
    'loginToFollow': loginToFollow,
    'loginToSaveFavorites': loginToSaveFavorites,
    'loginToStartCart': loginToStartCart,
    'loginToAddToCart': loginToAddToCart,
    'enterPhoneAndPassword': enterPhoneAndPassword,
    'enterPhoneForReset': enterPhoneForReset,
    'welcomeBack': welcomeBack,
    'galaxyResident': galaxyResident,
    'reachedTopLevel': reachedTopLevel,
    'termsNotice': termsNotice,
  };
}

/// وصول الودجات إلى جنس صاحب الجلسة وإلى النصّ المصرَّف.
///
/// `watch` لا `read`: تغيير الجنس من الإعدادات يجب أن يُعيد بناء ما يعتمد
/// عليه فوراً، لا عند الفتح التالي للشاشة.
extension GenderedContext on BuildContext {
  /// جنس صاحب الجلسة، أو [AppGender.unknown] إن لم تكن هناك جلسة.
  ///
  /// [CRITICAL] غياب `AuthCubit` من الشجرة لا يرمي استثناءً.
  ///
  /// المكعّب موفَّر في جذر التطبيق فعلاً، لكن هذا الاستدعاء يقع في **نصوص
  /// عرض**: شجرةٌ معزولة (حوار بمُنقِّله الخاص، أو شاشة تُبنى في اختبار) كانت
  /// ستنهار على وسمٍ نصّي لا غير — عقوبةٌ لا تناسب الخطأ. البديل هنا صيغةٌ
  /// محايدة صحيحة نحوياً للجميع، فأسوأ ما يحدث أن يُخاطَب أحدهم بحياد.
  ///
  /// هذا التساهل مقصورٌ على العرض: لا قرار تجاري يمرّ من هنا ليُخفيه.
  AppGender get gender {
    try {
      return AppGender.fromValue(watch<AuthCubit>().user?.gender);
    } on ProviderNotFoundException {
      return AppGender.unknown;
    }
  }

  /// النصّ بالصيغة المناسبة لصاحب الجلسة **وبلغة واجهته**.
  ///
  /// اللغة تأتي من `AppLanguageContext.language` (في `app_strings.dart`):
  /// اعتمادٌ موروث على `LocaleScope` يعيد رسم القارئ عند التبديل، ثم
  /// `LocaleCubit`، ثم العربية — مصدر واحد للنصوص المصرَّفة وغير المصرَّفة.
  ///
  /// [CRITICAL] `ofLocale` لا `of`. كانت هذه تستدعي `of(gender)` — وهي
  /// تعرف الجنس ولا تعرف اللغة، فتُرجع العربية دائماً. الصيغ الكردية
  /// الثلاث والثلاثون كانت موجودةً ومراجَعة ولا تصل الشاشة قط: واجهةٌ
  /// كردية تعرض «اختر كل الخيارات المطلوبة…» بالعربية. والاختبار كان يمرّ
  /// لأنه يستدعي `ofLocale` مباشرةً — المسار الذي لا تسلكه الودجات.
  String g(Gendered text) => text.ofLocale(gender, language);

  /// جنس صاحب الجلسة بلا إصغاء — للاستعمال **خارج** `build`.
  ///
  /// [CRITICAL] `watch` خارج `build` يرمي. معالِجُ الضغط الذي يفتح بوابة
  /// «سجّل دخولك أولاً» يحتاج الصيغة المصرَّفة وهو ليس بناءً، فيقرأ بلا
  /// اشتراك. الفرق سلوكيّاً معدوم: النصّ يُقرأ مرّةً ليُعرض في حوار.
  AppGender get genderNow {
    try {
      return AppGender.fromValue(read<AuthCubit>().user?.gender);
    } on ProviderNotFoundException {
      return AppGender.unknown;
    }
  }

  /// [g] بلا إصغاء — للاستعمال خارج `build`.
  String gNow(Gendered text) => text.ofLocale(genderNow, language);
}
