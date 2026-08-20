import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';

import '../../features/auth/presentation/screens/forgot_password_screen.dart';
import '../../features/auth/presentation/screens/login_screen.dart';
import '../../features/auth/presentation/screens/otp_verification_screen.dart';
import '../../features/auth/presentation/screens/register_screen.dart';
import '../../features/account/presentation/screens/account_screen.dart';
import '../../features/cart/presentation/screens/cart_screen.dart';
import '../../features/categories/presentation/screens/categories_screen.dart';
import '../../features/categories/presentation/screens/category_products_screen.dart';
import '../../features/checkout/presentation/screens/order_data_screen.dart';
import '../../features/checkout/presentation/screens/order_review_screen.dart';
import '../../features/favorites/presentation/screens/favorites_screen.dart';
import '../../features/home/presentation/screens/home_screen.dart';
import '../../features/main_navigation/presentation/screens/main_navigation_screen.dart';
import '../../features/orders/domain/entities/order_data.dart';
import '../../features/orders/presentation/screens/order_detail_screen.dart';
import '../../features/orders/presentation/screens/orders_screen.dart';
import '../../features/product_detail/presentation/screens/product_detail_screen.dart';
import '../../features/search/presentation/screens/search_screen.dart';
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
    AutoRoute(page: LoginRoute.page, path: '/login'),
    AutoRoute(page: RegisterRoute.page, path: '/register'),
    AutoRoute(page: ForgotPasswordRoute.page, path: '/forgot-password'),
    // [NOTE]: مسار التحقق من الرمز يسبق تسجيل الدخول (بعد إنشاء الحساب)،
    // لذا لا يُحمى بفاحص المصادقة وإلا أُعيد المستخدم إلى شاشة الدخول.
    AutoRoute(page: OtpVerificationRoute.page, path: '/otp'),
    // الغلاف الرئيسي المضمّن بتبويبات، محمي بفاحص المصادقة.
    AutoRoute(
      page: MainNavigationRoute.page,
      path: '/main',
      guards: [AuthGuard()],
      children: [
        AutoRoute(page: HomeRoute.page, path: 'home'),
        AutoRoute(page: CategoriesRoute.page, path: 'categories'),
        AutoRoute(page: FavoritesRoute.page, path: 'favorites'),
        AutoRoute(page: CartRoute.page, path: 'cart'),
        AutoRoute(page: AccountRoute.page, path: 'account'),
      ],
    ),
    AutoRoute(page: SearchRoute.page, path: '/search', guards: [AuthGuard()]),
    AutoRoute(
      page: CategoryProductsRoute.page,
      path: '/category-products/:categoryId',
      guards: [AuthGuard()],
    ),
    AutoRoute(
      page: ProductDetailRoute.page,
      path: '/product/:productId',
      guards: [AuthGuard()],
    ),
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
    AutoRoute(
      page: SettingsRoute.page,
      path: '/settings',
      guards: [AuthGuard()],
    ),
  ];
}
