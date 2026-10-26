/// مسرد المصطلحات — المصدر الوحيد لترجمة مفاهيم المتجر.
///
/// [CRITICAL] الغرض منع تعدّد الترجمات للمفهوم الواحد. «طلب» التي تصير
/// «داواکاری» في شاشة وتصير شيئاً آخر في شاشة ثانية تُربك الزبون وتجعل
/// البحث والدعم مستحيلين. كل نصّ جديد يُترجَم من هنا لا من الذاكرة.
///
/// ⚠ الكردية (سوراني) **مسوّدة تنتظر مراجعة ناطق**. المصطلحات أدناه مبنية
/// على الاستعمال الشائع في العراق، ومطابقة لما اعتُمد في
/// `backend/src/domain/notificationTemplates.ts` — أي مصطلح يُصحَّح يُصحَّح
/// في الملفّين معاً، ويحرس ذلك اختبارُ التطابق في `glossary_test.dart`.
///
/// ما لا يُترجَم عمداً:
/// - «Galaxy Points» هوية برنامج لا وصف — تبقى «خاڵەکانی گەلاکسی» كما
///   اعتُمدت، ولا تُستبدل بمرادف.
/// - أسماء المنتجات والأقسام: محتوى إدارة، تُترجَم في القاعدة لا هنا.
/// - أسماء الأعلام (أنمي، امتيازات) لا تُترجَم.
library;

/// مصطلحٌ واحد بصيغتيه.
class Term {
  const Term(this.ar, this.ckb, {this.note});

  final String ar;
  final String ckb;

  /// متى يُستعمل، وما الذي لا يُخلط به.
  final String? note;
}

/// المسرد المعتمد — مرتّب بمجالات الاستعمال لا أبجدياً.
abstract final class Glossary {
  // ═══ الكتالوج ═══
  static const product = Term('منتج', 'بەرهەم');
  static const products = Term('منتجات', 'بەرهەمەکان');
  static const category = Term('قسم', 'بەش');
  static const categories = Term('الأقسام', 'بەشەکان');
  static const subcategory = Term('قسم فرعي', 'بەشی لاوەکی');
  static const search = Term('بحث', 'گەڕان');
  static const offers = Term('عروض', 'داشکاندنەکان', note: 'العروض التجارية لا خصم المزايا');

  // ═══ التسوّق ═══
  static const cart = Term('السلة', 'سەبەتە');
  static const checkout = Term('إتمام الطلب', 'تەواوکردنی داواکاری');
  static const quantity = Term('الكمية', 'بڕ');
  static const price = Term('السعر', 'نرخ');
  static const total = Term('المجموع', 'کۆی گشتی');
  static const favorites = Term('المفضلة', 'دڵخوازەکان');

  // ═══ الطلب ═══
  static const order = Term('طلب', 'داواکاری');
  static const orders = Term('طلباتي', 'داواکارییەکانم');
  static const delivery = Term('التوصيل', 'گەیاندن');
  static const freeDelivery = Term('توصيل مجاني', 'گەیاندنی بێبەرامبەر');
  static const address = Term('العنوان', 'ناونیشان');
  static const governorate = Term('المحافظة', 'پارێزگا');
  static const phone = Term('رقم الهاتف', 'ژمارەی مۆبایل');

  // ═══ حالات الطلب — معانٍ تجارية، لا مرادفات فضفاضة ═══
  static const pending = Term('بانتظار الموافقة', 'چاوەڕوانی پەسەندکردن');
  static const confirmed = Term('تم قبول طلبك', 'داواکارییەکەت وەرگیرا');
  static const delivering = Term('قيد التوصيل', 'لە ڕێگادایە');
  static const completed = Term('تم الاستلام', 'وەرگیرا');
  static const rejected = Term('مرفوض', 'ڕەتکرایەوە');

  // ═══ المخزون — الفرق بين الحالتين معنى تجاري لا صياغة ═══
  static const available = Term('متوفر', 'بەردەستە');
  static const unavailable = Term('غير متوفر', 'بەردەست نییە');
  static const comingSoon = Term(
    'قريباً يتوفر',
    'بەم زووانە دێتەوە',
    note: 'مخزون صفر **مع** تاريخ متوقَّع — لا تُخلط بـunavailable',
  );
  static const notifyMe = Term('نبّهني عند التوفر', 'ئاگادارم بکەوە کاتێک بەردەست بوو');
  static const stock = Term('المخزون', 'کۆگا');

  // ═══ الولاء ═══
  static const galaxyPoints = Term(
    'نقاط المجرّة',
    'خاڵەکانی گەلاکسی',
    note: 'هوية البرنامج — لا تُستبدل بمرادف ولا تُترجَم حرفياً',
  );
  static const points = Term('نقاط', 'خاڵ');
  static const reward = Term('مزيّة', 'خەڵات');
  static const gift = Term('هدية', 'دیاری');
  static const discount = Term('خصم', 'داشکاندن');
  static const birthdayDiscount = Term('خصم عيد الميلاد', 'داشکاندنی ڕۆژی لەدایکبوون');
  static const deliveryDiscount = Term('خصم التوصيل', 'داشکاندنی گەیاندن');

  // ═══ المجتمع ═══
  static const review = Term('تقييم', 'هەڵسەنگاندن');
  static const rating = Term('التقييم', 'پلەدان', note: 'النجوم لا التعليق');
  static const comment = Term('تعليق', 'لێدوان');

  // ═══ الحساب ═══
  static const account = Term('الحساب', 'هەژمار');
  static const profile = Term('الملف الشخصي', 'پرۆفایل');
  static const settings = Term('الإعدادات', 'ڕێکخستنەکان');
  static const notification = Term('إشعار', 'ئاگادارکردنەوە');
  static const notifications = Term('الإشعارات', 'ئاگادارکردنەوەکان');
  static const login = Term('تسجيل الدخول', 'چوونەژوورەوە');
  static const logout = Term('تسجيل الخروج', 'چوونەدەرەوە');
  static const register = Term('إنشاء حساب', 'دروستکردنی هەژمار');
  static const password = Term('كلمة المرور', 'وشەی نهێنی');
  static const verification = Term('رمز التحقق', 'کۆدی پشتڕاستکردنەوە');

  // ═══ أفعال الواجهة ═══
  static const save = Term('حفظ', 'پاشەکەوتکردن');
  static const cancel = Term('إلغاء', 'پاشگەزبوونەوە');
  static const confirm = Term('تأكيد', 'پشتڕاستکردنەوە');
  static const delete = Term('حذف', 'سڕینەوە');
  static const edit = Term('تعديل', 'دەستکاری');
  static const submit = Term('إرسال', 'ناردن');
  static const retry = Term('إعادة المحاولة', 'دووبارە هەوڵدانەوە');

  // ═══ الحالات ═══
  static const error = Term('حدث خطأ', 'هەڵەیەک ڕوویدا');
  static const success = Term('تم بنجاح', 'بە سەرکەوتوویی ئەنجامدرا');

  /// كل المصطلحات — يستعملها اختبار الاتساق.
  static const all = <Term>[
    product, products, category, categories, subcategory, search, offers,
    cart, checkout, quantity, price, total, favorites,
    order, orders, delivery, freeDelivery, address, governorate, phone,
    pending, confirmed, delivering, completed, rejected,
    available, unavailable, comingSoon, notifyMe, stock,
    galaxyPoints, points, reward, gift, discount, birthdayDiscount,
    deliveryDiscount,
    review, rating, comment,
    account, profile, settings, notification, notifications,
    login, logout, register, password, verification,
    save, cancel, confirm, delete, edit, submit, retry,
    error, success,
  ];
}
