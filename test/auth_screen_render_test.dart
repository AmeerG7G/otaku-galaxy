// تجسيم شاشات المصادقة (LOGIN/REGISTER/OTP/FORGOT) بعد إصلاح [AuthScaffold].
//
// الهدف: شاشات المصادقة الأربع تُبنى بلا أي تجاوز تخطيط (ولاسيما خطأ
// `RenderFlex: children have non-zero flex but incoming height constraints
// are unbounded` الذي جعلها بيضاء/فارغة) على كل المقاسات والوضعين وبالـRTL.
//
// هذه اختبارات تجسيم بلا تفاعل: لا ننقر شيئاً، فنكفي ببناء الشاشة داخل
// حامل يحتوي `context.router` وتزويد [AuthCubit] كي يُبنى الجسم كاملاً.

import 'dart:async';

import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/config/app_config.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/core/di/injection_container.dart';
import 'package:otaku_galaxy/core/router/app_router.dart';
import 'package:otaku_galaxy/features/points/domain/repositories/points_repository.dart';
import 'package:otaku_galaxy/features/points/domain/entities/otaku_level.dart';
import 'package:otaku_galaxy/features/auth/data/datasources/auth_local_storage.dart';
import 'package:otaku_galaxy/features/auth/domain/entities/auth_session.dart';
import 'package:otaku_galaxy/features/auth/domain/entities/account_request.dart';
import 'package:otaku_galaxy/features/auth/domain/entities/user.dart';
import 'package:otaku_galaxy/features/auth/domain/repositories/auth_repository.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/change_password_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/forgot_password_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/get_me_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/login_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/register_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/update_profile_usecase.dart';
import 'package:otaku_galaxy/features/auth/presentation/cubit/auth_cubit.dart';

const _user = User(
  id: 'u1',
  username: 'مدقق',
  phone: '07701234567',
  role: 'customer',
);

class _StubAuthRepository implements AuthRepository {
  @override
  Future<User> me() async => _user;
  @override
  Future<AuthSession> login(String phone, String password) async =>
      const AuthSession(token: 't', user: _user);
  @override
  Future<AccountRequestReceipt> register({
    required String username,
    required String phone,
    required String password,
    required String gender,
  }) async => const AccountRequestReceipt(id: 'req-1', status: 'pending', createdAt: null);
  @override
  Future<AccountRequestReceipt> forgotPassword({
    required String phone,
    required String username,
    required String gender,
    required String levelKey,
  }) async => const AccountRequestReceipt(id: 'req-1', status: 'pending', createdAt: null);
  @override
  Future<User> updateProfile({
    String? username,
    String? avatarUrl,
    bool clearAvatar = false,
    String? gender,
    String? preferredLanguage,
  }) async => _user;
  @override
  Future<AuthSession> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async => AuthSession(token: 't', user: await me());
}

class _InMemoryAuthStorage implements AuthLocalStorage {
  @override
  bool get isLoggedIn => false;
  @override
  String? get token => null;
  @override
  String? getUserJson() => null;
  @override
  Future<void> load() async {}
  @override
  Future<void> saveSession(String token, String userJson) async {}
  @override
  Future<void> updateUser(String userJson) async {}
  @override
  Future<void> logout() async {}
}

AuthCubit _cubit() {
  final repo = _StubAuthRepository();
  return AuthCubit(
    localStorage: _InMemoryAuthStorage(),
    loginUsecase: LoginUsecase(repo),
    registerUsecase: RegisterUsecase(repo),
    forgotPasswordUsecase: ForgotPasswordUsecase(repo),
    getMeUsecase: GetMeUsecase(repo),
    updateProfileUsecase: UpdateProfileUsecase(repo),
    changePasswordUsecase: ChangePasswordUsecase(repo),
  );
}

/// رواتر مصغّر يضم شاشات المصادقة الأربع الحقيقية كي يتوفّر `context.router`
/// في شجرة كل شاشة عند بنائها. يبدأ من شاشة محايدة ثم ندفع الشاشة الهدف.
class _AuthRouter extends RootStackRouter {
  @override
  List<AutoRoute> get routes => [
    AutoRoute(
      initial: true,
      path: '/home',
      page: PageInfo(
        'HomePlaceholderRoute',
        builder: (_) => const Scaffold(body: SizedBox.shrink()),
      ),
    ),
    AutoRoute(path: '/login', page: LoginRoute.page),
    AutoRoute(path: '/register', page: RegisterRoute.page),
    AutoRoute(path: '/forgot', page: ForgotPasswordRoute.page),
    AutoRoute(path: '/account-pending', page: AccountPendingRoute.page),
  ];

  @override
  RouteType get defaultRouteType => const RouteType.material();
}

Future<void> _pumpScreen(
  WidgetTester tester, {
  required bool dark,
  required Size size,
  required PageRouteInfo route,
  bool flushTimers = false,
}) async {
  final router = _AuthRouter();
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    BlocProvider<AuthCubit>.value(
      value: _cubit(),
      child: MaterialApp.router(
        theme: AppTheme.light,
        darkTheme: AppTheme.dark,
        themeMode: dark ? ThemeMode.dark : ThemeMode.light,
        locale: const Locale('ar'),
        routerConfig: router.config(),
      ),
    ),
  );
  await tester.pump();

  router.push(route);
  await tester.pump();

  // شاشة الانتظار تحرّك الرسم الطافي بلا نهاية؛ لا مؤقّتات معلّقة تُنتظر.
  if (flushTimers) {
    await tester.pump(const Duration(seconds: 1));
  }
}

/// سلّم لا يصل أبداً — الشاشة تبقى في حالة التحميل وتُقاس هندستها كما هي.
class _PendingLevels implements PointsRepository {
  @override
  Future<List<OtakuLevel>> fetchLevels() => Completer<List<OtakuLevel>>().future;
  @override
  dynamic noSuchMethod(Invocation invocation) => Completer<Object?>().future;
}

void main() {
  setUpAll(() {
    if (!sl.isRegistered<AppConfig>()) {
      sl.registerLazySingleton<AppConfig>(() => AppConfig.development);
    }
    // استمارة نسيان كلمة المرور تقرأ السلّم من `PointsRepository` عبر GetIt.
    if (!sl.isRegistered<PointsRepository>()) {
      sl.registerLazySingleton<PointsRepository>(() => _PendingLevels());
    }
  });

  const sizes = <String, Size>{
    'ref': Size(412, 892),
    'narrow': Size(375, 812),
    'keyboard': Size(412, 450),
    'tiny': Size(320, 560),
    // ألواح: النموذج يبقى محدود العرض وموسَّطاً (`kFormMaxWidth`) بدل أن
    // يصير شريطاً ممتدّاً، والرأس المتدرّج وحده هو ما يملأ العرض.
    'tablet': Size(834, 1112),
    'tablet-landscape': Size(1194, 834),
  };

  group('auth screens render without layout exception', () {
    final routes = <(String, PageRouteInfo)>[
      ('login', const LoginRoute()),
      ('register', const RegisterRoute()),
      ('forgot', const ForgotPasswordRoute()),
      ('pending-registration', AccountPendingRoute(kind: AccountRequestKind.registration)),
      ('pending-reset', AccountPendingRoute(kind: AccountRequestKind.passwordReset)),
    ];

    for (final dark in [false, true]) {
      for (final size in sizes.entries) {
        for (final (name, route) in routes) {
          final mode = dark ? 'داكن' : 'فاتح';
          testWidgets('$name — $mode — ${size.key}', (tester) async {
            await _pumpScreen(
              tester,
              dark: dark,
              size: size.value,
              route: route,
              flushTimers: name.startsWith('pending'),
            );
            expect(
              tester.takeException(),
              isNull,
              reason: '$name انهار على المقاس ${size.key}',
            );
          });
        }
      }
    }
  });
}
