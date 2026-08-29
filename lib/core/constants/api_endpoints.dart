/// مسارات الـ API الخلفي — تُضاف إلى [AppConfig.apiBaseUrl].
class ApiEndpoints {
  ApiEndpoints._();

  // المصادقة.
  static const String login = '/auth/login';
  static const String register = '/auth/register';
  static const String sendOtp = '/auth/resend-code';
  static const String verifyOtp = '/auth/verify';
  static const String forgotPassword = '/auth/forgot-password';
  static const String resetPassword = '/auth/reset-password';
  static const String me = '/auth/me';
  static const String changePassword = '/auth/me/password';

  // الكتالوج.
  static const String homeData = '/catalog/home';
  static const String products = '/catalog/products';
  static const String productDetails = '/catalog/products/';
  static const String categories = '/catalog/categories';
  static const String categoryProducts = '/catalog/products';
  static const String search = '/catalog/products/search';
  static const String governorates = '/catalog/governorates';

  // العميل: مفضلة + عربة + طلبات.
  static const String favorites = '/favorites';
  static const String favoriteItem = '/favorites/';
  static const String cart = '/cart';
  static const String cartItem = '/cart/';
  static const String orders = '/orders';
  static const String orderDetails = '/orders/';
  static const String cancelOrder = '/orders/';
  /// تأكيد العميل استلام طلبه: ‎/orders/{id}/confirm-receipt
  static const String confirmReceiptSuffix = '/confirm-receipt';
  /// الطلب المنتظر تأكيد استلامه — يقرؤه التطبيق عند كل فتح.
  static const String pendingConfirmation = '/orders/pending-confirmation';

  // التقييمات (عميل).
  static const String reviews = '/reviews';
  static const String findReview = '/reviews/find';
  static const String reviewItem = '/reviews/';

  // التقييمات والمجتمع (عام، بلا مصادقة).
  static const String productReviews = '/catalog/products/';
  static const String communityPhotos = '/catalog/community/photos';

  // نقاط المجرّة.
  static const String points = '/points';

  // المجموعات.
  static const String collections = '/collections';
  static const String collectionItem = '/collections/';

  // الإشعارات.
  static const String notifications = '/notifications';
  static const String notificationsReadAll = '/notifications/read-all';

  // عيد الميلاد.
  static const String birthday = '/birthday';

  // مناطق التوصيل داخل المحافظة.
  static const String governorateZones = '/catalog/governorates/';

  // إعدادات المتجر العامة (روابط التواصل).
  static const String storeSettings = '/catalog/settings';

  // رفع صور تقييمات العملاء.
  static const String uploads = '/uploads';
}