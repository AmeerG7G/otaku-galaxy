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
}