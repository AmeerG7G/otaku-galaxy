// اختبارات بوابة المصادقة الموحّدة [requireAuthentication].
//
// الهدف: إجراءٌ واحد يحتاج حساباً يسلوك ذات السلوك أينما كان:
//   - زائر  → تظهر ورقة «سجّل دخولك أولاً»، يُمنع الإجراء المحمي،
//     وإن اختار تسجيل الدخول تُفتح شاشة الدخول.
//   - مسجّل → يمضي الإجراء فوراً بلا أي توقف.
//
// هذه الاختبارات تقيس البوابة ذاتها (core/auth/require_auth.dart) التي صارت
// كل الإجراءات المحمية تعتمد عليها: أضف للسلة، المفضلة، الإشعارات، المجموعات.

import 'dart:convert';

import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/auth/require_auth.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
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

/// مستودع مصادقة كافٍ لبناء [AuthCubit] — لا يُستدعى شيء في هذا الاختبار.
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

/// تخزين جلسة في الذاكرة — يميّز من يُعدّ زائراً ومن مسجّلاً عبر [isLoggedIn].
class _InMemoryAuthStorage implements AuthLocalStorage {
  _InMemoryAuthStorage({this.seedToken});

  final String? seedToken;

  @override
  bool get isLoggedIn => seedToken != null && seedToken!.isNotEmpty;
  @override
  String? get token => seedToken;
  @override
  String? getUserJson() => seedToken == null ? null : jsonEncode(_user.toJson());
  @override
  Future<void> load() async {}
  @override
  Future<void> saveSession(String token, String userJson) async {}
  @override
  Future<void> updateUser(String userJson) async {}
  @override
  Future<void> logout() async {}
}

AuthCubit _cubit({required bool loggedIn}) {
  final repo = _StubAuthRepository();
  final storage = _InMemoryAuthStorage(seedToken: loggedIn ? 't' : null);
  return AuthCubit(
    localStorage: storage,
    loginUsecase: LoginUsecase(repo),
    registerUsecase: RegisterUsecase(repo),
    forgotPasswordUsecase: ForgotPasswordUsecase(repo),
    getMeUsecase: GetMeUsecase(repo),
    updateProfileUsecase: UpdateProfileUsecase(repo),
    changePasswordUsecase: ChangePasswordUsecase(repo),
  );
}

/// حامل يُدوّن نتيجة فحص البوابة ليتفحّصها الاختبار.
class _Outcome {
  bool? actionRan;
}

/// صفحة مضيفة تعرض زرّاً يُنفّذ [requireAuthentication] ويدوّن هل سُمح
/// بالإجراء المحمي (أي أعادت البوابة `true`) وهل طُلِب تسجيل الدخول عبر
/// [requireAuthentication.onLoginRequested].
class _HostPage extends StatefulWidget {
  const _HostPage({
    required this.outcome,
    required this.onLoginRequestedCalled,
    this.loginRequested,
  });

  final _Outcome outcome;
  final ValueNotifier<bool> onLoginRequestedCalled;
  final void Function()? loginRequested;

  @override
  State<_HostPage> createState() => _HostPageState();
}

class _HostPageState extends State<_HostPage> {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: ElevatedButton(
          onPressed: () async {
            final ok = await requireAuthentication(
              context,
              title: 'سجّل دخولك أولاً',
              body: 'إجراء محمي يحتاج حساباً.',
              onLoginRequested: () {
                widget.onLoginRequestedCalled.value = true;
                widget.loginRequested?.call();
              },
            );
            widget.outcome.actionRan = ok;
          },
          child: const Text('نفّذ'),
        ),
      ),
    );
  }
}

/// رواتر مصغّر يحوي صفحة المضيف وشاشة الدخول فقط — لإبقاء الاختبار خفيفاً
/// وعدم سحب رواتر التطبيق الكامل (وابتلاع شاشة البداية ومنطقها).
///
/// شاشة الدخول الحقيقية تُستبدل بصفحة خفيفة تحمل الاسم ذاته (`LoginRoute`)
/// كي يبقى التحقق من «فتح شاشة الدخول» ممكناً دون بناء شاشة كاملة تعتمد
/// على بنية لا تُقدَّر في نافذة اختبار صغيرة.
class _TestRouter extends RootStackRouter {
  _TestRouter(
    this._outcome, {
    required this.onLoginRequestedCalled,
    this.loginRequested,
  });

  final _Outcome _outcome;
  final ValueNotifier<bool> onLoginRequestedCalled;
  final bool Function()? loginRequested;

  @override
  List<AutoRoute> get routes => [
    AutoRoute(
      page: PageInfo(
        'HostRoute',
        builder: (_) => _HostPage(
          outcome: _outcome,
          onLoginRequestedCalled: onLoginRequestedCalled,
          loginRequested: loginRequested,
        ),
      ),
      initial: true,
      path: '/host',
    ),
    AutoRoute(
      path: '/login',
      page: PageInfo(
        'LoginRoute',
        builder: (_) => const Scaffold(body: Center(child: Text('شاشة الدخول'))),
      ),
    ),
  ];

  @override
  RouteType get defaultRouteType => const RouteType.material();
}

Future<_TestRouter> _buildApp(
  WidgetTester tester, {
  required bool loggedIn,
  required _Outcome outcome,
  bool Function()? loginRequested,
  required ValueNotifier<bool> onLoginRequestedCalled,
}) async {
  final router = _TestRouter(
    outcome,
    onLoginRequestedCalled: onLoginRequestedCalled,
    loginRequested: loginRequested,
  );
  tester.view.physicalSize = const Size(1080, 2280);
  tester.view.devicePixelRatio = 3.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    BlocProvider<AuthCubit>.value(
      value: _cubit(loggedIn: loggedIn),
      child: MaterialApp.router(
        theme: AppTheme.light,
        routerConfig: router.config(),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return router;
}

void main() {
  testWidgets('زائر: تظهر ورقة تسجيل الدخول ويُمنع الإجراء', (tester) async {
    final outcome = _Outcome();
    await _buildApp(
      tester,
      loggedIn: false,
      outcome: outcome,
      onLoginRequestedCalled: ValueNotifier(false),
    );
    await tester.tap(find.text('نفّذ'));
    await tester.pumpAndSettle();

    // البوابة توقفت عند ورقة الدخول — الإجراء المحمي ما زال معلّقاً
    // بانتظار قرار المستخدم، ولم يُنفَّذ بعد.
    expect(
      find.text('سجّل دخولك أولاً'),
      findsOneWidget,
      reason: 'ورقة «سجّل دخولك أولاً» لم تظهر للزائر',
    );
    expect(outcome.actionRan, isNot(true), reason: 'الإجراء المحمي نُفّذ رغم الزائر');
  });

  testWidgets('زائر يضغط «إلغاء»: تُغلق الورقة ولا يُنفَّذ الإجراء', (tester) async {
    final outcome = _Outcome();
    await _buildApp(
      tester,
      loggedIn: false,
      outcome: outcome,
      onLoginRequestedCalled: ValueNotifier(false),
    );
    await tester.tap(find.text('نفّذ'));
    await tester.pumpAndSettle();
    expect(find.text('سجّل دخولك أولاً'), findsOneWidget);

    await tester.tap(find.text('إلغاء'));
    await tester.pumpAndSettle();

    expect(find.text('سجّل دخولك أولاً'), findsNothing, reason: 'الورقة لم تُغلق');
    expect(
      outcome.actionRan,
      isFalse,
      reason: 'الإجراء المحمي نُفّذ رغم أن الزائر ألغى تسجيل الدخول',
    );
  });

  testWidgets('زائر يختار «تسجيل الدخول»: تُفتح شاشة الدخول وطُلِب الدخول', (
    tester,
  ) async {
    final outcome = _Outcome();
    final loginRequested = ValueNotifier(false);
    var pendingRecorded = false;
    final router = await _buildApp(
      tester,
      loggedIn: false,
      outcome: outcome,
      onLoginRequestedCalled: loginRequested,
      loginRequested: () => pendingRecorded = true,
    );
    await tester.tap(find.text('نفّذ'));
    await tester.pumpAndSettle();
    expect(find.text('سجّل دخولك أولاً'), findsOneWidget);

    await tester.tap(find.text('تسجيل الدخول').last);
    await tester.pumpAndSettle();

    expect(
      find.text('سجّل دخولك أولاً'),
      findsNothing,
      reason: 'ورقة الدخول لم تُغلق بعد اختيار تسجيل الدخول',
    );
    expect(router.current.name, 'LoginRoute', reason: 'لم تُفتح شاشة الدخول');
    // اختيار «تسجيل الدخول» يُعلم المتصل فوراً، فلا يفقد «الوجهة المحمية».
    expect(
      loginRequested.value,
      isTrue,
      reason: 'onLoginRequested لم يُستدعَ عند اختيار تسجيل الدخول',
    );
    expect(pendingRecorded, isTrue, reason: 'لم تُدوَّن الوجهة المطلوبة');
    expect(
      outcome.actionRan,
      isNot(true),
      reason: 'الإجراء المحمي نُفّذ رغم بقاء المستخدم زائراً',
    );
  });

  testWidgets('زائر يُلغي: لا يُستدعى onLoginRequested إطلاقاً', (tester) async {
    final outcome = _Outcome();
    final loginRequested = ValueNotifier(false);
    await _buildApp(
      tester,
      loggedIn: false,
      outcome: outcome,
      onLoginRequestedCalled: loginRequested,
    );
    await tester.tap(find.text('نفّذ'));
    await tester.pumpAndSettle();
    expect(find.text('سجّل دخولك أولاً'), findsOneWidget);

    await tester.tap(find.text('إلغاء'));
    await tester.pumpAndSettle();

    expect(
      loginRequested.value,
      isFalse,
      reason: 'onLoginRequested استُدعي رغم أن الزائر ألغى',
    );
  });

  testWidgets('مسجّل: يمضي الإجراء فوراً بلا ورقة ولا onLoginRequested', (
    tester,
  ) async {
    final outcome = _Outcome();
    final loginRequested = ValueNotifier(false);
    await _buildApp(
      tester,
      loggedIn: true,
      outcome: outcome,
      onLoginRequestedCalled: loginRequested,
    );
    await tester.tap(find.text('نفّذ'));
    await tester.pumpAndSettle();

    expect(outcome.actionRan, isTrue, reason: 'الإجراء المحمي لم يُنفَّذ لمسجّل');
    expect(find.text('سجّل دخولك أولاً'), findsNothing);
    expect(
      loginRequested.value,
      isFalse,
      reason: 'onLoginRequested استُدعي لمسجّل دخوله فعلاً',
    );
  });
}
