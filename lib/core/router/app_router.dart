import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';

import '../../features/auth/presentation/screens/forgot_password_screen.dart';
import '../../features/auth/presentation/screens/login_screen.dart';
import '../../features/auth/presentation/screens/otp_verification_screen.dart';
import '../../features/auth/presentation/screens/register_screen.dart';
import '../../features/auth/presentation/screens/reset_password_screen.dart';
import '../../features/account/presentation/screens/account_screen.dart';
import '../../features/cart/presentation/screens/cart_screen.dart';
import '../../features/categories/presentation/screens/categories_screen.dart';
import '../../features/categories/presentation/screens/category_products_screen.dart';
import '../../features/checkout/presentation/screens/order_data_screen.dart';
import '../../features/collections/presentation/screens/collection_detail_screen.dart';
import '../../features/community/presentation/screens/community_screen.dart';
import '../../features/notifications/presentation/screens/notifications_screen.dart';
import '../../features/points/presentation/screens/galaxy_points_screen.dart';
import '../../features/reviews/presentation/screens/rate_order_screen.dart';
import '../../features/reviews/presentation/screens/review_submitted_screen.dart';
import '../../features/reviews/presentation/screens/write_review_screen.dart';
import '../../features/checkout/presentation/screens/order_review_screen.dart';
import '../../features/favorites/presentation/screens/favorites_screen.dart';
import '../../features/home/presentation/screens/home_screen.dart';
import '../../features/main_navigation/presentation/screens/main_navigation_screen.dart';
import '../../features/onboarding/presentation/screens/onboarding_screen.dart';
import '../../features/orders/domain/entities/order.dart';
import '../../features/orders/domain/entities/order_data.dart';
import '../../features/orders/presentation/screens/order_detail_screen.dart';
import '../../features/orders/presentation/screens/orders_screen.dart';
import '../../features/product_detail/presentation/screens/product_detail_screen.dart';
import '../../features/search/presentation/screens/search_screen.dart';
import '../../features/settings/presentation/screens/personalize_screen.dart';
import '../../features/settings/presentation/screens/settings_screen.dart';
import '../../features/splash/presentation/screens/splash_screen.dart';
import 'guards/auth_guard.dart';

part 'app_router.gr.dart';

/// مسارات التطبيق مع اتجاه RTL.
@AutoRouterConfig()
class AppRouter extends RootStackRouter {
  @override
  List<AutoRoute> get routes => [
    // [NOTE]: شاشة البداية هي المقرر الوحيد لمسار بدء التشغيل،
    // تقرر بين الدخول (إن وُجدت جلسة) أو شاشة تسجيل الدخول.
    AutoRoute(
      page: SplashRoute.page,
      path: '/',
      initial: true,
      keepHistory: false,
    ),
    // [NOTE]: تُعرض مرة واحدة فقط (OnboardingStorage) قبل الدخول الأول
    // للتطبيق الرئيسي؛ بلا فاحص مصادقة لأنها تسبق أي حساب.
    AutoRoute(page: OnboardingRoute.page, path: '/onboarding'),
    AutoRoute(page: LoginRoute.page, path: '/login'),
    AutoRoute(page: RegisterRoute.page, path: '/register'),
    AutoRoute(page: ForgotPasswordRoute.page, path: '/forgot-password'),
    // [NOTE]: مسار التحقق من الرمز يسبق تسجيل الدخول (بعد إنشاء الحساب)،
    // لذا لا يُحمى بفاحص المصادقة وإلا أُعيد المستخدم إلى شاشة الدخول.
    AutoRoute(page: OtpVerificationRoute.page, path: '/otp'),
    // إعادة تعيين كلمة المرور — الخطوة الثالثة في مسار الاستعادة، تصلها
    // الشاشة برقم الهاتف ورمز التحقق غير المستهلَك.
    AutoRoute(page: ResetPasswordRoute.page, path: '/reset-password'),
    // الغلاف الرئيسي المضمّن بتبويبات — يدخله الزائر والمسجّل معاً.
    // [NOTE]: التصفح كزائر مسموح بالكامل (الرئيسية/الأقسام)؛ تبويبا
    // المفضلة والحساب يعرضان دعوة لتسجيل الدخول للزائر داخل الشاشة نفسها
    // بدل حجب التبويب على مستوى المسارات.
    AutoRoute(
      page: MainNavigationRoute.page,
      path: '/main',
      children: [
        AutoRoute(page: HomeRoute.page, path: 'home'),
        AutoRoute(page: CategoriesRoute.page, path: 'categories'),
        AutoRoute(page: CartRoute.page, path: 'cart'),
        AutoRoute(page: AccountRoute.page, path: 'account'),
      ],
    ),
    // تصفّح المنتجات (بحث/أقسام فرعية/تفاصيل) متاح للزائر دون قيود —
    // الإجراءات التي تحتاج حساباً فعلياً (الطلب، طلباتي) تبقى محمية أدناه.
    AutoRoute(page: SearchRoute.page, path: '/search'),
    AutoRoute(
      page: CategoryProductsRoute.page,
      path: '/category-products/:categoryId',
    ),
    AutoRoute(page: ProductDetailRoute.page, path: '/product/:productId'),
    AutoRoute(
      page: OrderDataRoute.page,
      path: '/order-data',
      guards: [AuthGuard()],
    ),
    AutoRoute(
      page: OrderReviewRoute.page,
      path: '/order-review',
      guards: [AuthGuard()],
    ),
    AutoRoute(page: OrdersRoute.page, path: '/orders', guards: [AuthGuard()]),
    AutoRoute(
      page: OrderDetailRoute.page,
      path: '/order-detail/:orderId',
      guards: [AuthGuard()],
    ),
    // المفضلة صفحة تُفتح من الحساب (ليست تبويباً)؛ بلا حارس لأن الشاشة
    // نفسها تعرض دعوة تسجيل الدخول للزائر بدل ردّه.
    AutoRoute(page: FavoritesRoute.page, path: '/favorites'),
    // بلا حارس: التخصيص يحفظ تفضيلات الجهاز (لغة/مظهر) لا بيانات حساب،
    // ويصله الزائر عبر «تصفح كزائر» والمسجَّل حديثاً بعد التحقق.
    AutoRoute(page: PersonalizeRoute.page, path: '/personalize'),
    AutoRoute(
      page: SettingsRoute.page,
      path: '/settings',
      guards: [AuthGuard()],
    ),
    // المجتمع: معرض صور العملاء المعتمدة — متاح للزائر (تصفّح فقط).
    AutoRoute(page: CommunityRoute.page, path: '/community'),
    // الإشعارات ونقاط المجرّة والتقييمات والمجموعات: خصائص حساب.
    AutoRoute(
      page: NotificationsRoute.page,
      path: '/notifications',
      guards: [AuthGuard()],
    ),
    AutoRoute(
      page: GalaxyPointsRoute.page,
      path: '/galaxy-points',
      guards: [AuthGuard()],
    ),
    AutoRoute(
      page: RateOrderRoute.page,
      path: '/rate-order',
      guards: [AuthGuard()],
    ),
    // تأكيد «بانتظار المراجعة» بعد إرسال التقييم.
    AutoRoute(
      page: ReviewSubmittedRoute.page,
      path: '/review-submitted',
      guards: [AuthGuard()],
    ),
    AutoRoute(
      page: WriteReviewRoute.page,
      path: '/write-review',
      guards: [AuthGuard()],
    ),
    AutoRoute(
      page: CollectionDetailRoute.page,
      path: '/collection/:collectionId',
      guards: [AuthGuard()],
    ),
  ];
}
