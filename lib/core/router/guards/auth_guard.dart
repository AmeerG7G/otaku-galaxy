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
    } else {
      router.push(const LoginRoute());
    }
  }
}
