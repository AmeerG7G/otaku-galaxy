/// فتحة بصرية كما يرسلها الخادم: مفتاحُ موضعٍ وصورتُه الفعّالة الآن.
///
/// [PRODUCT] موضعٌ واحد = فتحةٌ واحدة = صورةٌ فعّالة واحدة (قرار 2026-09-20،
/// الهجرتان ٠٥٤ و٠٥٥). لا تدوير ولا قائمة صور: الخادم يرسل صورةً واحدة
/// للفتحة أو لا يرسل الفتحة أصلاً — وعندها يُعرض الأصل المضمَّن.
///
/// للموضع في اللوحة صورةٌ دائمة وقد تُوضع فوقها صورةٌ **مؤقّتة** إلى لحظة؛
/// الحكم بينهما على الخادم وحده بساعته، فلا يعرف التطبيق أيّهما وصلته —
/// ولا يحتاج. حين تنتهي المؤقّتة يعيد الخادم الدائمة في الردّ التالي،
/// ويجدول [VisualsRepository] ذلك الردّ لحظةَ الانتهاء نفسها.
class VisualSlot {
  const VisualSlot({required this.slotKey, required this.currentUrl});

  final String slotKey;

  /// الصورة الفعّالة للفتحة كما حسمها الخادم (مرجع نسبي أو رابط مطلق).
  ///
  /// الاسم على السلك بقي `currentUrl` كي تقرأه إصدارات التطبيق المنشورة؛
  /// معناه اليوم: الصورة الوحيدة المعروضة الآن، لا «المختارة» من قائمة.
  final String currentUrl;

  factory VisualSlot.fromJson(Map<String, dynamic> json) => VisualSlot(
    slotKey: json['slotKey']?.toString() ?? '',
    currentUrl: json['currentUrl']?.toString() ?? '',
  );
}

/// مفاتيح الفتحات التي يعرفها التطبيق.
///
/// [CRITICAL] هذه ثوابت لا إعدادات: كل مفتاح هنا يجب أن يطابق `slot_key` في
/// القاعدة حرفياً (تزرعها الهجرات ٠٢٩ و٠٥٤ و٠٥٥). مفتاح لا يقابله صفّ لا يكسر
/// شيئاً — تُعتبر الفتحة غير مضبوطة ويُعرض الأصل المضمَّن.
///
/// **الفتحة موضعٌ لا شخصية.** الشخصية نفسها قد تظهر في شاشتين، لكن لكل
/// موضعٍ مفتاحُه المستقل، فلا يبدّل المسؤول صورةَ شاشةٍ فتتبدّل أخرى. لذلك:
/// كل ثابت هنا يستهلكه **ملفٌ واحد** في `lib/` (يحرسه
/// `test/visual_slot_contract_test.dart` و`tests/visual-catalogue.test.ts`)،
/// ولا يجوز لمكوّنٍ مشترك في `core/design_system` أن يحمل مفتاحاً افتراضياً —
/// الشاشةُ هي التي تمرّر مفتاحها. الفتحات التي كانت مشتركة (`register`،
/// `forgot_password`، `auth_cta`، `guest_prompt`) جُزّئت بالهجرة ٠٥٤
/// ومفاتيحها القديمة متقاعدة لا تعود.
///
/// الاستثناء الوحيد لـ«سطرٍ واحد لكل ثابت»: موضعٌ واحد يُبنى من سطرين في
/// الملف نفسه — البنر الرئيسي (بديلُ فشل صورة البنر، ولا بنر)، وبطاقة الترويج
/// الأولى وبطاقات ما بعدها (بنراتٌ مُدارة، أو البطاقات الافتراضية). البطاقات
/// من الثانية فصاعداً موضعٌ واحد متكرّر لعددٍ يقرّره المسؤول؛ صورةُ بطاقةٍ
/// بعينها هي صورة بنرها لا فتحة.
///
/// [CRITICAL] ثابتٌ لا يستهلكه أي `ManagedArtwork` في `lib/` هو فتحة ميتة:
/// تبقى في اللوحة يرفع إليها المسؤول صورةً لا تظهر عند أحد. حين تُحذف
/// شاشة يُحذف مفتاحها من هنا **ومن القاعدة بهجرة** (كما في ٠٣١ و٠٤٩).
///
/// المستبعَدة عمداً — لا مفاتيح لها ولا صفوف: شعار المتجر، ورسوم شاشة
/// البداية وشاشة التحديث الإلزامي. ثلاثتها تُعرض قبل أن يُسمح للتطبيق
/// بالاتصال أصلاً، فربطها بالخادم يعني شاشةً فارغة في أسوأ لحظة ممكنة.
/// (شاشة انقطاع الاتصال فتحةٌ منذ الهجرة ٠٥٥: صورتها تُقرأ من ذاكرة القرص
/// التي يملؤها الإقلاع، والمضمَّن بديلُها كأي فتحة — فلا تفرغ بلا شبكة.)
/// وأيقونات التواصل (تيك توك، إنستغرام، واتساب) أصولٌ ثابتة بقرار منتج
/// (2026-09-15): كانت فتحاتٍ (`social_*`، الهجرة ٠٣٢) وأُسقطت بالهجرة ٠٥٣؛
/// الرابط وحده يُدار من إعدادات المتجر.
class VisualSlots {
  VisualSlots._();

  // ── المصادقة ──
  /// شاشة تسجيل الدخول — الترويسة.
  static const String login = 'login_character';
  /// شاشة تسجيل الدخول — زاوية بطاقة النموذج فوق زر الإجراء.
  static const String loginCta = 'login_cta_character';
  /// شاشة إنشاء الحساب — الترويسة.
  static const String registerHeader = 'register_header_character';
  /// شاشة إنشاء الحساب — زاوية بطاقة النموذج.
  static const String registerCta = 'register_cta_character';
  /// شاشة «بانتظار الموافقة» بعد إرسال طلب إنشاء الحساب.
  static const String registerPending = 'register_pending_character';
  /// شاشة استعادة كلمة المرور — الترويسة.
  static const String forgotPasswordHeader = 'forgot_password_header_character';
  /// شاشة استعادة كلمة المرور — زاوية بطاقة النموذج.
  static const String forgotPasswordCta = 'forgot_password_cta_character';
  /// شاشة «بانتظار الموافقة» بعد إرسال طلب استعادة كلمة المرور.
  static const String forgotPasswordPending = 'forgot_password_pending_character';

  // ── الرئيسية ──
  static const String homeHero = 'home_hero_character';
  static const String homePromoPrimary = 'home_promo_primary_character';
  static const String homePromoSecondary = 'home_promo_secondary_character';
  static const String homeDelivery = 'home_delivery_character';

  // ── التسوّق ──
  static const String emptyCart = 'empty_cart_character';
  /// تبويب السلة — بطاقة دعوة الزائر لتسجيل الدخول.
  static const String cartGuestPrompt = 'cart_guest_prompt_character';
  static const String cartCheckout = 'cart_checkout_character';
  static const String emptyFavorites = 'empty_favorites_character';
  /// تبويب المفضلة — بطاقة دعوة الزائر لتسجيل الدخول.
  static const String favoritesGuestPrompt = 'favorites_guest_prompt_character';
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
  static const String deliveryConfirmation = 'delivery_confirmation_character';

  // ── المكافآت ──
  static const String points = 'points_character';

  // ── المجتمع والتقييمات ──
  static const String communityHeader = 'community_header_character';
  static const String communityEmpty = 'community_empty_character';
  static const String communityGallery = 'community_gallery_character';
  static const String productReviews = 'product_reviews_character';
  static const String writeReview = 'write_review_character';
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
  /// شاشة انقطاع الاتصال — الرسم أعلى اللوحة (تُقرأ من ذاكرة القرص).
  static const String offlineGate = 'offline_gate_character';

  /// كل المفاتيح — تستعملها الاختبارات للتحقق من مطابقة الفهرس.
  static const List<String> all = [
    login,
    loginCta,
    registerHeader,
    registerCta,
    registerPending,
    forgotPasswordHeader,
    forgotPasswordCta,
    forgotPasswordPending,
    homeHero,
    homePromoPrimary,
    homePromoSecondary,
    homeDelivery,
    emptyCart,
    cartGuestPrompt,
    cartCheckout,
    emptyFavorites,
    favoritesGuestPrompt,
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
    deliveryConfirmation,
    points,
    communityHeader,
    communityEmpty,
    communityGallery,
    productReviews,
    writeReview,
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
