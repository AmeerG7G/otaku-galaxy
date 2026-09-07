/// فتحة بصرية كما يرسلها الخادم.
///
/// «الفتحة» دورٌ في الواجهة لا موضعٌ بعينه: «الحالة الفارغة للسلة» فتحة
/// واحدة مهما تعدّدت الشاشات التي تعرضها. المفتاح عقدٌ ثابت بين الخادم
/// وكود التطبيق — يُكتب حرفياً في [VisualSlots].
class VisualSlot {
  const VisualSlot({
    required this.slotKey,
    required this.currentUrl,
    this.urls = const [],
    this.rotationMode = 'fixed',
    this.validUntil,
  });

  final String slotKey;

  /// الرابط الذي **اختاره الخادم** للعرض الآن.
  ///
  /// الاختيار على الخادم لا في التطبيق: لو اختار التطبيق لتبدّلت الشخصية
  /// مع كل إعادة بناء لعنصر الواجهة، ولاختلفت بين جهازين بحسب ساعتيهما.
  final String currentUrl;

  /// كل الروابط النشطة — للتحميل المسبق فقط، لا للاختيار.
  final List<String> urls;

  final String rotationMode;

  /// متى يتبدّل الاختيار (تدوير يومي)، أو null للثابت.
  final DateTime? validUntil;

  factory VisualSlot.fromJson(Map<String, dynamic> json) {
    final raw = json['validUntil'] as String?;
    return VisualSlot(
      slotKey: json['slotKey']?.toString() ?? '',
      currentUrl: json['currentUrl']?.toString() ?? '',
      urls: (json['urls'] as List? ?? const [])
          .map((e) => e?.toString() ?? '')
          .where((e) => e.isNotEmpty)
          .toList(),
      rotationMode: json['rotationMode']?.toString() ?? 'fixed',
      validUntil: raw == null ? null : DateTime.tryParse(raw),
    );
  }
}

/// مفاتيح الفتحات التي يعرفها التطبيق.
///
/// [CRITICAL] هذه ثوابت لا إعدادات: كل مفتاح هنا يجب أن يطابق `slot_key` في
/// القاعدة حرفياً (تزرعها الهجرة ٠٢٩). مفتاح لا يقابله صفّ لا يكسر شيئاً —
/// تُعتبر الفتحة غير مضبوطة ويُعرض الأصل المضمَّن.
///
/// التجزئة: **فتحة لكل موضع** يريد صاحب المتجر تغييره وحده. «شخصية تسجيل
/// الدخول» و«شخصية إنشاء الحساب» شاشتان مختلفتان عنده وإن تشابه الرسم.
/// الاستثناءان الوحيدان موضعان مشتركان في الكود نفسه لا في التصميم:
/// [authCta] (لوحة واحدة في `AuthScaffold` تخدم شاشات المصادقة الأربع)،
/// و[guestPrompt] (قيمة افتراضية واحدة تخدم السلة والمفضلة).
///
/// المستبعَدة عمداً — لا مفاتيح لها ولا صفوف: شعار المتجر، رسوم شاشة
/// البداية، ورسم شاشة انقطاع الاتصال. ثلاثتها تُعرض قبل وجود شبكة أو
/// أثناء غيابها، فربطها بالخادم يعني شاشةً فارغة في أسوأ لحظة ممكنة.
class VisualSlots {
  VisualSlots._();

  // ── المصادقة ──
  static const String login = 'login_character';
  static const String register = 'register_character';
  static const String otp = 'otp_character';
  static const String forgotPassword = 'forgot_password_character';
  static const String authCta = 'auth_cta_character';
  static const String guestPrompt = 'guest_prompt_character';

  // ── الرئيسية ──
  static const String homeHero = 'home_hero_character';
  static const String homePromoPrimary = 'home_promo_primary_character';
  static const String homePromoSecondary = 'home_promo_secondary_character';
  static const String homeDelivery = 'home_delivery_character';

  // ── التسوّق ──
  static const String emptyCart = 'empty_cart_character';
  static const String cartCheckout = 'cart_checkout_character';
  static const String emptyFavorites = 'empty_favorites_character';
  static const String categoriesHeader = 'categories_header_character';
  static const String emptyCategories = 'empty_categories_character';
  static const String categoryProductsHeader = 'category_products_header_character';
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
  static const String collectionsTab = 'collections_tab_character';
  static const String emptyCollection = 'empty_collection_character';

  // ── الحساب والإشعارات ──
  static const String account = 'account_character';
  static const String notificationsHeader = 'notifications_header_character';

  // ── أيقونات التواصل ──
  // ليست شخصيات، لكنها صور واجهة يديرها المسؤول: لا شعار مضمَّن في الحزمة
  // (علامات تجارية)، ولا حزمة أيقونات مرخَّصة في المشروع تحملها.
  static const String socialTiktok = 'social_tiktok';
  static const String socialInstagram = 'social_instagram';
  static const String socialWhatsapp = 'social_whatsapp';

  // ── الترحيب والتخصيص ──
  static const String onboardingSlideOne = 'onboarding_slide_one_character';
  static const String onboardingSlideTwo = 'onboarding_slide_two_character';
  static const String onboardingSlideThree = 'onboarding_slide_three_character';
  static const String personalize = 'personalize_character';

  /// كل المفاتيح — تستعملها الاختبارات للتحقق من مطابقة الفهرس.
  static const List<String> all = [
    login,
    register,
    otp,
    forgotPassword,
    authCta,
    guestPrompt,
    homeHero,
    homePromoPrimary,
    homePromoSecondary,
    homeDelivery,
    emptyCart,
    cartCheckout,
    emptyFavorites,
    categoriesHeader,
    emptyCategories,
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
    emptyCollection,
    account,
    notificationsHeader,
    socialTiktok,
    socialInstagram,
    socialWhatsapp,
    onboardingSlideOne,
    onboardingSlideTwo,
    onboardingSlideThree,
    personalize,
  ];
}
