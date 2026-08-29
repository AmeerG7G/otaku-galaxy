import 'package:auto_route/auto_route.dart';

import '../../di/injection_container.dart';
import '../../../features/auth/presentation/cubit/auth_cubit.dart';
import '../app_router.dart';

/// يمنع الوصول إلى الشاشات المحمية دون جلسة نشطة.
class AuthGuard extends AutoRouteGuard {
  @override
  void onNavigation(NavigationResolver resolver, StackRouter router) {
    if (sl<AuthCubit>().isLoggedIn) {
      resolver.next();
      return;
    }
    // حسم التنقّل المرفوض صراحةً قبل عرض شاشة الدخول؛ تركه معلّقاً كان
    // يُبقي الوجهة في الانتظار بلا نتيجة.
    resolver.next(false);
    router.push(const LoginRoute());
  }
}
