import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

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
  const Gendered(this.male, this.female, {this.neutral});

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
  );

  static const completeOrder = Gendered(
    'أكمل الطلب',
    'أكملي الطلب',
    neutral: 'إكمال الطلب',
  );

  static const chooseGovernorate = Gendered(
    'اختر المحافظة',
    'اختاري المحافظة',
    neutral: 'اختيار المحافظة',
  );

  static const chooseZone = Gendered(
    'اختر منطقة التوصيل',
    'اختاري منطقة التوصيل',
    neutral: 'اختيار منطقة التوصيل',
  );

  static const rateProduct = Gendered(
    'قيّم المنتج',
    'قيّمي المنتج',
    neutral: 'تقييم المنتج',
  );

  static const writeYourOpinion = Gendered(
    'اكتب رأيك في المنتج… الجودة، الحجم، سرعة التوصيل.',
    'اكتبي رأيك في المنتج… الجودة، الحجم، سرعة التوصيل.',
    neutral: 'رأيك في المنتج… الجودة، الحجم، سرعة التوصيل.',
  );

  static const addPhotos = Gendered(
    'أضف صوراً للمنتج',
    'أضيفي صوراً للمنتج',
    neutral: 'إضافة صور للمنتج',
  );

  static const shareYourOpinion = Gendered(
    'شاركنا رأيك',
    'شاركينا رأيك',
    neutral: 'مشاركة رأيك',
  );

  /// دعوة الاشتراك بتنبيه التوفر — فعل أمر، فيُصرَّف.
  static const notifyWhenAvailable = Gendered(
    'أعلمني عند توفر المنتج',
    'أعلميني عند توفر المنتج',
    neutral: 'تنبيهي عند توفر المنتج',
  );

  static const registerCta = Gendered(
    'سجّل الآن',
    'سجّلي الآن',
    neutral: 'إنشاء حساب',
  );

  static const chooseZoneBeforeOrder = Gendered(
    'اختر منطقة التوصيل قبل إرسال الطلب.',
    'اختاري منطقة التوصيل قبل إرسال الطلب.',
    neutral: 'اختيار منطقة التوصيل مطلوب قبل إرسال الطلب.',
  );

  static const chooseAllOptions = Gendered(
    'اختر كل الخيارات المطلوبة قبل الإضافة إلى السلة.',
    'اختاري كل الخيارات المطلوبة قبل الإضافة إلى السلة.',
    neutral: 'اختيار كل الخيارات المطلوبة مطلوب قبل الإضافة إلى السلة.',
  );

  static const enterNewName = Gendered(
    'أدخل اسمك الجديد',
    'أدخلي اسمك الجديد',
    neutral: 'الاسم الجديد',
  );

  static const rateOrderProducts = Gendered(
    'قيّم منتجات طلبك',
    'قيّمي منتجات طلبك',
    neutral: 'تقييم منتجات طلبك',
  );

  /// زرّ التقييم داخل بطاقة الطلب — مربوط بذلك الطلب وحده.
  static const rateYourOrder = Gendered(
    'قيّم طلبك',
    'قيّمي طلبك',
    neutral: 'تقييم طلبك',
  );

  static const rateProductsShort = Gendered(
    'قيّم المنتجات',
    'قيّمي المنتجات',
    neutral: 'تقييم المنتجات',
  );

  static const searchHintBody = Gendered(
    'اكتب اسم المنتج أو الأنمي، وسنعرض لك كل المتوفر في المتجر.',
    'اكتبي اسم المنتج أو الأنمي، وسنعرض لك كل المتوفر في المتجر.',
    neutral: 'اسم المنتج أو الأنمي يكفي، وسنعرض كل المتوفر في المتجر.',
  );

  static const addProductsToCollection = Gendered(
    'أضف منتجات لهذه المجموعة من صفحة المنتج عبر «أضف إلى مجموعتك».',
    'أضيفي منتجات لهذه المجموعة من صفحة المنتج عبر «أضف إلى مجموعتك».',
    neutral:
        'تُضاف المنتجات لهذه المجموعة من صفحة المنتج عبر «أضف إلى مجموعتك».',
  );

  static const tapHeartToSave = Gendered(
    'اضغط القلب على أي منتج يعجبك ليُحفظ هنا.',
    'اضغطي القلب على أي منتج يعجبك ليُحفظ هنا.',
    neutral: 'القلب على أي منتج يعجبك يحفظه هنا.',
  );

  static const browseAndPick = Gendered(
    'تصفّح المتجر واختر ما يعجبك — ستنتظرك السلة.',
    'تصفّحي المتجر واختاري ما يعجبك — ستنتظرك السلة.',
    neutral: 'تصفّح المتجر واختيار ما يعجبك — ستنتظرك السلة.',
  );

  static const choosePreferences = Gendered(
    'اختر لغتك والمظهر المناسب لك.',
    'اختاري لغتك والمظهر المناسب لك.',
    neutral: 'اختيار اللغة والمظهر المناسبين لك.',
  );

  static const reachedPhotoLimit = Gendered(
    'وصلت إلى الحد الأقصى',
    'وصلتِ إلى الحد الأقصى',
    neutral: 'بلغت الصور الحد الأقصى',
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
  );

  static const loginToFollow = Gendered(
    'سجّل الدخول لتتابع طلباتك وتحفظ مفضلتك ومجموعاتك.',
    'سجّلي الدخول لتتابعي طلباتك وتحفظي مفضلتك ومجموعاتك.',
    neutral: 'تسجيل الدخول يتيح متابعة الطلبات وحفظ المفضلة والمجموعات.',
  );

  static const loginToSaveFavorites = Gendered(
    'سجّل الدخول لتحفظ ما يعجبك',
    'سجّلي الدخول لتحفظي ما يعجبك',
    neutral: 'تسجيل الدخول لحفظ ما يعجبك',
  );

  static const loginToStartCart = Gendered(
    'سجّل الدخول لتبدأ سلتك',
    'سجّلي الدخول لتبدئي سلتك',
    neutral: 'تسجيل الدخول لبدء سلتك',
  );

  static const loginToAddToCart = Gendered(
    'سجّل الدخول لإضافة منتجات إلى سلتك وإتمام الطلب.',
    'سجّلي الدخول لإضافة منتجات إلى سلتك وإتمام الطلب.',
    neutral: 'تسجيل الدخول يتيح إضافة المنتجات إلى السلة وإتمام الطلب.',
  );

  static const enterPhoneAndPassword = Gendered(
    'أدخل رقم هاتفك وكلمة المرور للمتابعة إلى حسابك.',
    'أدخلي رقم هاتفك وكلمة المرور للمتابعة إلى حسابك.',
    neutral: 'رقم الهاتف وكلمة المرور للمتابعة إلى حسابك.',
  );

  static const enterPhoneForReset = Gendered(
    'أدخل رقم هاتفك وسنرسل إليك رمز تحقق لإعادة التعيين.',
    'أدخلي رقم هاتفك وسنرسل إليك رمز تحقق لإعادة التعيين.',
    neutral: 'رقم هاتفك يكفي، وسنرسل إليك رمز تحقق لإعادة التعيين.',
  );

  // ── جُمل تصف الزبون ──

  static const welcomeBack = Gendered(
    'أهلاً بك',
    'أهلاً بكِ',
    // «أهلاً بك» بالسكون صالحة للجميع في الفصحى المكتوبة بلا تشكيل.
    neutral: 'أهلاً بك',
  );

  static const galaxyResident = Gendered(
    'خطوة واحدة وتصبح من سكّان مجرة الأوتاكو.',
    'خطوة واحدة وتصبحين من سكّان مجرة الأوتاكو.',
    neutral: 'خطوة واحدة وتنضمّ إلى سكّان مجرة الأوتاكو.',
  );

  static const reachedTopLevel = Gendered(
    'وصلت لأعلى مستوى 🎉',
    'وصلتِ لأعلى مستوى 🎉',
    neutral: 'أعلى مستوى 🎉',
  );

  /// شرط الاشتراك عند إنشاء الحساب.
  static const termsNotice = Gendered(
    'بإنشائك حساباً فأنت توافق على شروط الاستخدام وسياسة الخصوصية.',
    'بإنشائكِ حساباً فأنتِ توافقين على شروط الاستخدام وسياسة الخصوصية.',
    neutral: 'إنشاء الحساب يعني الموافقة على شروط الاستخدام وسياسة الخصوصية.',
  );

  // ── اختيار الجنس نفسه ──

  static const genderLabel = 'الجنس';
  static const male = 'ذكر';
  static const female = 'أنثى';
  static const genderRequired = 'يرجى اختيار الجنس';
  static const genderNotSet = 'لم يُحدَّد';
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

  /// النصّ بالصيغة المناسبة لصاحب الجلسة.
  String g(Gendered text) => text.of(gender);
}
