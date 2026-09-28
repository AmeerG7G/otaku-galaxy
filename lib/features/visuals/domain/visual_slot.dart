/// مواضع رسوم الشخصيات في التطبيق، والصورة الثابتة لكلٍّ منها.
///
/// [PRODUCT] **الشخصيات أصولٌ ثابتة مرقَّمة** (قرار 2026-09-27). كانت «رسوم
/// الشخصيات» تُدار من لوحة التحكم (فتحات بصرية يجلبها التطبيق من
/// `/catalog/visuals`)؛ أُزيلت الميزة من اللوحة والخادم (الهجرة 065). كل
/// صورة شخصية معروضة في التطبيق ملفٌّ مرقَّم في `assets/art/characters/`
/// (`N.png`، صورةٌ فريدة لكل رقم) نُسخ **بايتاً ببايت** من الصورة التي كانت
/// تُعرض. الموضعان اللذان يعرضان الصورة نفسها يشيران إلى الرقم نفسه.
///
/// **تغيير شخصية = استبدال ملفّها بصورةٍ أخرى بالاسم نفسه** (مثلاً `5.png`)
/// — لا كود ولا لوحة ولا خادم ولا قاعدة. الجدول في [CharacterArt].
///
/// [PRODUCT] **الأرقام عناوين ثابتة لا تُعاد** (2026-09-28). حُذفت الصور
/// 2 و4 و9 و10 و14 و22 و27 و36 و37 بطلب المالك، فصارت أرقامها فجواتٍ مقصودة:
/// لا يُعاد ترقيم ما بقي (المالك يسمّي الصور بأرقامها — «38» تبقى 38)، ولا
/// يُملأ رقمٌ محذوف بصورةٍ جديدة. صورةٌ جديدة تأخذ الرقم التالي لأعلى رقم.
/// ومن الأرقام المحذوفة أربعُ نسخٍ لصورٍ موجودة بدقّةٍ أخرى (2≈34، 14≈38،
/// 36≈32، 9 و10≈29): مواضعها تشير الآن إلى النسخة الباقية.
library;

/// مفاتيح مواضع الرسوم — هويّة موضعٍ لا شخصية.
///
/// **الموضع لا الشخصية.** الشخصية نفسها قد تظهر في شاشتين، لكن لكل موضعٍ
/// مفتاحه المستقل: كل ثابت هنا يستهلكه **ملفٌ واحد** في `lib/` (يحرسه
/// `test/visual_slot_contract_test.dart`)، ولا يجوز لمكوّنٍ مشترك في
/// `core/design_system` أن يحمل مفتاحاً افتراضياً — الشاشةُ هي التي تمرّر
/// مفتاحها.
///
/// الاستثناء الوحيد لـ«سطرٍ واحد لكل ثابت»: موضعٌ واحد يُبنى من سطرين في
/// الملف نفسه — بطاقات الترويج من الثانية فصاعداً (بنرٌ مُدار، أو بطاقة
/// «خصومات فعّالة» حين لا بنرات).
///
/// [CRITICAL] ثابتٌ لا يستهلكه أي `CharacterArtwork` في `lib/` هو موضعٌ ميت:
/// حين تُحذف شاشة أو يُحذف رسمها يُحذف مفتاحها من هنا ومن [CharacterArt].
///
/// لا مواضع لشعار المتجر ولا لشاشة البداية ولا لشاشة التحديث الإلزامي (نصٌّ
/// بلا رسم شخصية منذ 2026-09-27)، ولا لأيقونات التواصل (أصولٌ ثابتة).

class VisualSlots {
  VisualSlots._();

  // ── المصادقة ──
  //
  // لا رسم بجوار زرّ الإجراء في بطاقة النموذج (2026-09-28): أُزيلت مواضع
  // `login_cta_character` و`register_cta_character` و`forgot_password_cta_character`.
  /// شاشة تسجيل الدخول — الترويسة.
  static const String login = 'login_character';
  /// شاشة إنشاء الحساب — الترويسة.
  static const String registerHeader = 'register_header_character';
  /// شاشة «بانتظار الموافقة» بعد إرسال طلب إنشاء الحساب.
  static const String registerPending = 'register_pending_character';
  /// شاشة استعادة كلمة المرور — الترويسة.
  static const String forgotPasswordHeader = 'forgot_password_header_character';
  /// شاشة «بانتظار الموافقة» بعد إرسال طلب استعادة كلمة المرور.
  static const String forgotPasswordPending = 'forgot_password_pending_character';

  // ── الرئيسية ──
  //
  // `home_promo_primary_character` أُزيل مع الصورة 4 (2026-09-28): البنر
  // الترويجي الأول بلا صورةٍ مرفوعة لا يعرض شخصية.
  static const String homeHero = 'home_hero_character';
  static const String homePromoSecondary = 'home_promo_secondary_character';
  static const String homeDelivery = 'home_delivery_character';

  // ── التسوّق ──
  //
  // بطاقة دعوة الزائر بلا رسم بجوار زرّ الدخول (2026-09-28): أُزيل
  // `cart_guest_prompt_character` و`favorites_guest_prompt_character`.
  static const String emptyCart = 'empty_cart_character';
  static const String emptyFavorites = 'empty_favorites_character';
  static const String categoriesHeader = 'categories_header_character';
  /// شاشة منتجات القسم — حين لا منتجات في القسم كلّه (الترويسة نفسها بلا رسم).
  static const String categoryProductsHeader = 'category_products_header_character';
  /// شاشة منتجات القسم — حين لا منتجات في القسم الفرعي المختار.
  static const String emptyCategoryProducts = 'empty_category_products_character';
  static const String productDetail = 'product_detail_character';
  static const String productDetailReviews = 'product_detail_reviews_character';

  // ── البحث ──
  static const String searchHeader = 'search_header_character';
  static const String emptySearch = 'empty_search_character';

  // ── الطلبات ──
  static const String ordersHeader = 'orders_header_character';
  static const String emptyOrders = 'empty_orders_character';
  static const String orderSuccess = 'order_success_character';
  // `delivery_confirmation_character` أُزيل مع الصورة 22 (2026-09-28).

  // ── المكافآت ──
  static const String points = 'points_character';

  // ── المجتمع والتقييمات ──
  static const String communityHeader = 'community_header_character';
  static const String communityEmpty = 'community_empty_character';
  static const String communityGallery = 'community_gallery_character';
  static const String productReviews = 'product_reviews_character';
  // «قيّم المنتج» بلا رسم: `write_review_character` أُزيل مع الصورة 27.
  static const String rateOrder = 'rate_order_character';
  static const String reviewSubmitted = 'review_submitted_character';

  // ── المجموعات ──
  /// المفضلة ← تبويب «مجموعاتي» — حين لا مجموعات بعد.
  static const String collectionsTab = 'collections_tab_character';

  // ── الحساب والإشعارات ──
  static const String notificationsHeader = 'notifications_header_character';

  // ── الترحيب والتخصيص ──
  static const String onboardingSlideOne = 'onboarding_slide_one_character';
  static const String onboardingSlideTwo = 'onboarding_slide_two_character';
  static const String onboardingSlideThree = 'onboarding_slide_three_character';
  static const String personalize = 'personalize_character';

  // ── انقطاع الاتصال ──
  /// شاشة انقطاع الاتصال — الرسم أعلى اللوحة.
  static const String offlineGate = 'offline_gate_character';

  /// كل المفاتيح — تستعملها الاختبارات للتحقق من مطابقة الفهرس.
  static const List<String> all = [
    login,
    registerHeader,
    registerPending,
    forgotPasswordHeader,
    forgotPasswordPending,
    homeHero,
    homePromoSecondary,
    homeDelivery,
    emptyCart,
    emptyFavorites,
    categoriesHeader,
    categoryProductsHeader,
    emptyCategoryProducts,
    productDetail,
    productDetailReviews,
    searchHeader,
    emptySearch,
    ordersHeader,
    emptyOrders,
    orderSuccess,
    points,
    communityHeader,
    communityEmpty,
    communityGallery,
    productReviews,
    rateOrder,
    reviewSubmitted,
    collectionsTab,
    notificationsHeader,
    onboardingSlideOne,
    onboardingSlideTwo,
    onboardingSlideThree,
    personalize,
    offlineGate,
  ];
}

/// الصورة الثابتة لكل موضع — المصدر الوحيد لـ«أيّ صورة أين».
///
/// [CRITICAL] لا بيانات من الخادم ولا إعداد ولا لوحة. الرقم عنوانُ الصورة لا
/// وصفُها: يُستبدل **محتوى** الملف بحرّية (صورةٌ أخرى باسم `N.png` نفسه ⇒
/// كل موضعٍ يشير إلى `N` يتغيّر)، أما الأرقام فلا يُعاد توزيعها. الأرقام
/// المشتركة هنا مقصودة: المواضع التي تعرض الصورة نفسها تشير إلى ملفٍّ واحد.
///
/// الامتداد `.png` للجميع؛ Flutter يفكّ الصورة من محتواها لا من امتدادها،
/// فـ`7.png` صورة JPEG كما كانت في الأصل.
class CharacterArt {
  CharacterArt._();

  /// مواضع `VisualSlots` ← ملفّاتها.
  static const Map<String, String> assets = {
    VisualSlots.login: 'assets/art/characters/1.png', // تسجيل الدخول — الترويسة
    VisualSlots.registerHeader: 'assets/art/characters/3.png', // إنشاء الحساب — الترويسة
    VisualSlots.registerPending: 'assets/art/characters/5.png', // إنشاء الحساب — «بانتظار الموافقة»
    VisualSlots.forgotPasswordHeader: 'assets/art/characters/6.png', // استعادة كلمة المرور — الترويسة
    VisualSlots.forgotPasswordPending: 'assets/art/characters/8.png', // استعادة كلمة المرور — «بانتظار الموافقة»
    VisualSlots.homeHero: 'assets/art/characters/29.png', // الرئيسية — البنر الرئيسي (كانت 9)
    VisualSlots.homePromoSecondary: 'assets/art/characters/29.png', // الرئيسية — بطاقات الترويج التالية (كانت 10)
    VisualSlots.homeDelivery: 'assets/art/characters/11.png', // الرئيسية — بطاقة التوصيل
    VisualSlots.emptyCart: 'assets/art/characters/12.png', // السلة — فارغة
    VisualSlots.emptyFavorites: 'assets/art/characters/13.png', // المفضلة — فارغة
    VisualSlots.categoriesHeader: 'assets/art/characters/38.png', // الأقسام — الترويسة (كانت 14)
    VisualSlots.categoryProductsHeader: 'assets/art/characters/15.png', // منتجات القسم — لا منتجات في القسم
    VisualSlots.emptyCategoryProducts: 'assets/art/characters/15.png', // منتجات القسم — لا منتجات في القسم الفرعي
    VisualSlots.productDetail: 'assets/art/characters/16.png', // تفاصيل المنتج
    VisualSlots.productDetailReviews: 'assets/art/characters/17.png', // تفاصيل المنتج — التقييمات
    VisualSlots.searchHeader: 'assets/art/characters/12.png', // البحث — الترويسة
    VisualSlots.emptySearch: 'assets/art/characters/18.png', // البحث — لا نتائج
    VisualSlots.ordersHeader: 'assets/art/characters/19.png', // الطلبات — الترويسة
    VisualSlots.emptyOrders: 'assets/art/characters/20.png', // الطلبات — لا طلبات
    VisualSlots.orderSuccess: 'assets/art/characters/21.png', // نجاح الطلب
    VisualSlots.points: 'assets/art/characters/23.png', // نقاط المجرّة
    VisualSlots.communityHeader: 'assets/art/characters/24.png', // المجتمع — الترويسة
    VisualSlots.communityEmpty: 'assets/art/characters/25.png', // المجتمع — فارغ
    VisualSlots.communityGallery: 'assets/art/characters/25.png', // المجتمع — المعرض
    VisualSlots.productReviews: 'assets/art/characters/26.png', // تقييمات المنتج
    VisualSlots.rateOrder: 'assets/art/characters/28.png', // تقييم الطلب
    VisualSlots.reviewSubmitted: 'assets/art/characters/29.png', // تم إرسال التقييم
    VisualSlots.collectionsTab: 'assets/art/characters/30.png', // المفضلة ← «مجموعاتي» — لا مجموعات
    VisualSlots.notificationsHeader: 'assets/art/characters/31.png', // الإشعارات — الترويسة
    VisualSlots.onboardingSlideOne: 'assets/art/characters/32.png', // الترحيب — الشريحة الأولى
    VisualSlots.onboardingSlideTwo: 'assets/art/characters/33.png', // الترحيب — الشريحة الثانية
    VisualSlots.onboardingSlideThree: 'assets/art/characters/19.png', // الترحيب — الشريحة الثالثة
    VisualSlots.personalize: 'assets/art/characters/34.png', // التخصيص
    VisualSlots.offlineGate: 'assets/art/characters/35.png', // انقطاع الاتصال
  };

  // ── رسومٌ ثابتة خارج `VisualSlots` (مواضع بلا مفتاح؛ الشاشة تقرأ الثابت) ──

  /// شاشة البداية — الرسم الكبير الخافت خلف المحتوى (كانت 36، نسخةً من 32).
  ///
  /// والرسم الصغير الخافت أعلى الشاشة (`splashBackdropSmall`، الصورة 4)
  /// أُزيل مع الصورة (2026-09-28).
  static const String splashBackdrop = 'assets/art/characters/32.png';

  /// الترحيب ← الشريحة الثانية — صورة المنتج داخل البطاقة التوضيحية.
  static const String onboardingProductPhoto = 'assets/art/characters/7.png';

  // الأقسام حين لا أقسام إطلاقاً: بلا رسم منذ حذف الصورة 37 (2026-09-28).

  /// تفاصيل مجموعة — حين لا منتجات فيها.
  static const String emptyCollection = 'assets/art/characters/38.png';

  /// كل رسمٍ ثابت خارج [assets] — تستعملها الاختبارات للتحقق من التغطية.
  static const List<String> fixed = [
    splashBackdrop,
    onboardingProductPhoto,
    emptyCollection,
  ];

  /// أصل الموضع الثابت. كل مفاتيح `VisualSlots` في [assets] (يحرسه
  /// `test/character_art_test.dart`)؛ `null` لمفتاحٍ غير معروف وحده.
  static String? forSlot(String slot) => assets[slot];
}
