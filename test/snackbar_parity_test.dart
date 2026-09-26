// تكافؤ الأشرطة السفلية — «أُضيف للسلة» و«تنبيه التوفر» و«إلغاء التنبيه».
//
// [CRITICAL] المقارنة على **الكائن المبنيّ** لا على الشكل الظاهر: يُلتقط
// `SnackBar` من الشجرة وتُقارَن حقوله (السلوك، الشكل، الهوامش، المدّة،
// `persist`) بين المسارات الثلاثة. التقاطُ الشكل وحده كان يمرّ على شريطٍ
// يبدو مطابقاً ويختفي بعد أربع ثوانٍ بدل ١٫٥ — أو لا يختفي أصلاً.
//
// الجذر الذي تحرسه هذه الاختبارات: منذ Flutter 3.29 صار `persist` يساوي
// `action != null` افتراضياً، فأي شريط يحمل زرّ إجراء يبقى ظاهراً للأبد.

import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/core/di/injection_container.dart';
import 'package:otaku_galaxy/core/network/api_client.dart';
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
import 'package:otaku_galaxy/features/restock/data/restock_repository.dart';
import 'package:otaku_galaxy/features/restock/presentation/restock_notify_button.dart';

const _user = User(
  id: 'u1',
  username: 'مدقق',
  phone: '+9647701234567',
  role: 'customer',
);

/// محوّل يردّ على مسارات إعادة التوفر بلا شبكة.
class _RestockAdapter implements HttpClientAdapter {
  bool subscribed = false;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final path = options.path;
    String body;
    if (path.contains('/mine')) {
      body = subscribed
          ? '{"success":true,"data":[{"productId":"p1"}],"message":null}'
          : '{"success":true,"data":[],"message":null}';
    } else if (options.method == 'POST') {
      subscribed = true;
      body =
          '{"success":true,"data":{"subscribed":true,"alreadySubscribed":false},'
          '"message":null}';
    } else {
      subscribed = false;
      body = '{"success":true,"data":null,"message":null}';
    }
    return ResponseBody.fromString(
      body,
      200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

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

/// تخزين يبلّغ عن جلسة قائمة — الزرّ يمرّ ببوابة المصادقة قبل الاشتراك.
class _LoggedInStorage implements AuthLocalStorage {
  @override
  bool get isLoggedIn => true;
  @override
  String? get token => 't';
  @override
  String? getUserJson() =>
      '{"id":"u1","username":"مدقق","phone":"+9647701234567","role":"customer"}';
  @override
  Future<void> load() async {}
  @override
  Future<void> saveSession(String token, String userJson) async {}
  @override
  Future<void> updateUser(String userJson) async {}
  @override
  Future<void> logout() async {}
}

AuthCubit _authCubit() {
  final repo = _StubAuthRepository();
  return AuthCubit(
    localStorage: _LoggedInStorage(),
    loginUsecase: LoginUsecase(repo),
    registerUsecase: RegisterUsecase(repo),
    forgotPasswordUsecase: ForgotPasswordUsecase(repo),
    getMeUsecase: GetMeUsecase(repo),
    updateProfileUsecase: UpdateProfileUsecase(repo),
    changePasswordUsecase: ChangePasswordUsecase(repo),
  );
}

/// بصمة إعدادات الشريط — ما يجب أن يتطابق بين المسارات الثلاثة.
({
  SnackBarBehavior? behavior,
  ShapeBorder? shape,
  EdgeInsetsGeometry? margin,
  Duration duration,
  bool? persist,
  Color? background,
})
_config(WidgetTester tester) {
  final bar = tester.widget<SnackBar>(find.byType(SnackBar));
  return (
    behavior: bar.behavior,
    shape: bar.shape,
    margin: bar.margin,
    duration: bar.duration,
    persist: bar.persist,
    background: bar.backgroundColor,
  );
}

Widget _host(Widget child, {AuthCubit? auth}) => MaterialApp(
  theme: AppTheme.light,
  locale: const Locale('ar'),
  home: BlocProvider<AuthCubit>.value(
    value: auth ?? _authCubit(),
    child: Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(body: Center(child: child)),
    ),
  ),
);

void main() {
  final adapter = _RestockAdapter();

  setUpAll(() {
    final dio = Dio(BaseOptions(baseUrl: 'https://test.local/api'))
      ..httpClientAdapter = adapter;
    if (!sl.isRegistered<RestockRepository>()) {
      sl.registerLazySingleton<RestockRepository>(
        () => RestockRepository(ApiClient(dio: dio)),
      );
    }
  });

  // [CRITICAL] المستودع مفردة في حاوية الاعتماديات، فحالة «مشترك» تعبر من
  // اختبار إلى آخر: يبدأ التالي والزرّ يقول «إلغاء التنبيه» فتُقاس رسالةٌ
  // غير المقصودة. الإعادة هنا تجعل كل اختبار يبدأ من حالة معلومة.
  setUp(() => adapter.subscribed = false);

  /// يضغط زرّ التنبيه وينتظر اكتمال حركة دخول الشريط.
  Future<void> tapRestock(WidgetTester tester) async {
    await tester.tap(find.byType(AnimePrimaryButton));
    await tester.pumpAndSettle();
  }

  testWidgets('[CRITICAL] الاشتراك والإلغاء والسلة — إعدادات شريط واحدة', (
    tester,
  ) async {
    // المرجع: شريط «تمت إضافة المنتج إلى السلة».
    await tester.pumpWidget(
      _host(
        Builder(
          builder: (ctx) => ElevatedButton(
            onPressed: () => showOtakuSnack(
              ctx,
              message: 'تمت إضافة المنتج إلى السلة',
              action: SnackBarAction(label: 'عرض السلة', onPressed: () {}),
            ),
            child: const Text('cart'),
          ),
        ),
      ),
    );
    await tester.tap(find.text('cart'));
    await tester.pumpAndSettle();
    final cart = _config(tester);

    // نجاح الاشتراك.
    await tester.pumpWidget(_host(const RestockNotifyButton(productId: 'p1')));
    await tester.pumpAndSettle();
    await tapRestock(tester);
    expect(find.text('سنُعلمك فور توفّره 🔔'), findsOneWidget);
    final subscribe = _config(tester);

    // إلغاء الاشتراك — الزرّ صار «بانتظار التوفر».
    await tapRestock(tester);
    expect(find.text('أُلغي التنبيه'), findsOneWidget);
    final cancel = _config(tester);

    for (final other in [subscribe, cancel]) {
      expect(other.behavior, cart.behavior, reason: 'السلوك/الموضع');
      expect(other.shape, cart.shape, reason: 'الشكل ونصف القطر والحدّ');
      expect(other.margin, cart.margin, reason: 'الهوامش الأفقية والرأسية');
      expect(other.duration, cart.duration, reason: 'المدّة');
      expect(other.persist, cart.persist, reason: 'سلوك البقاء/الاختفاء');
      expect(other.background, cart.background, reason: 'الخلفية');
    }
  });

  testWidgets('[CRITICAL] شريط الاشتراك يختفي وحده كشريط السلة', (
    tester,
  ) async {
    await tester.pumpWidget(_host(const RestockNotifyButton(productId: 'p1')));
    await tester.pumpAndSettle();
    await tapRestock(tester);

    const message = 'سنُعلمك فور توفّره 🔔';
    expect(find.text(message), findsOneWidget);

    await tester.pump(const Duration(milliseconds: 600));
    expect(find.text(message), findsOneWidget, reason: 'اختفى مبكراً جداً');

    await tester.pump(const Duration(seconds: 4));
    await tester.pumpAndSettle();
    expect(find.text(message), findsNothing, reason: 'الرسالة علقت على الشاشة');
  });

  testWidgets('[CRITICAL] شريط الإلغاء يختفي وحده كذلك', (tester) async {
    await tester.pumpWidget(_host(const RestockNotifyButton(productId: 'p1')));
    await tester.pumpAndSettle();
    await tapRestock(tester);
    await tester.pump(const Duration(seconds: 4));
    await tester.pumpAndSettle();

    await tapRestock(tester);
    const message = 'أُلغي التنبيه';
    expect(find.text(message), findsOneWidget);

    await tester.pump(const Duration(seconds: 4));
    await tester.pumpAndSettle();
    expect(find.text(message), findsNothing);
  });

  testWidgets('[CRITICAL] الضغط على الشريط يُخفيه فوراً — في المسارين', (
    tester,
  ) async {
    // نفس إيماءة الإخفاء التي يوفّرها شريط السلة.
    await tester.pumpWidget(_host(const RestockNotifyButton(productId: 'p1')));
    await tester.pumpAndSettle();
    await tapRestock(tester);

    const message = 'سنُعلمك فور توفّره 🔔';
    expect(find.text(message), findsOneWidget);
    await tester.tap(find.text(message));
    await tester.pumpAndSettle();
    expect(find.text(message), findsNothing, reason: 'الضغط لم يُخفِ الشريط');
  });

  testWidgets('نبرة الخطأ تغيّر الأيقونة وحدها لا الإعدادات', (tester) async {
    // «فقط الرسالة والأيقونة تختلفان» — بقية الإعدادات واحدة.
    await tester.pumpWidget(
      _host(
        Builder(
          builder: (ctx) => Column(
            children: [
              ElevatedButton(
                onPressed: () =>
                    showOtakuSnack(ctx, message: 'نجاح'),
                child: const Text('ok'),
              ),
              ElevatedButton(
                onPressed: () => showOtakuSnack(
                  ctx,
                  message: 'خطأ',
                  tone: OtakuSnackTone.error,
                ),
                child: const Text('bad'),
              ),
            ],
          ),
        ),
      ),
    );

    await tester.tap(find.text('ok'));
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.check), findsOneWidget);
    final success = _config(tester);

    await tester.tap(find.text('bad'));
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.error_outline), findsOneWidget);
    final failure = _config(tester);

    expect(failure.behavior, success.behavior);
    expect(failure.shape, success.shape);
    expect(failure.margin, success.margin);
    expect(failure.duration, success.duration);
    expect(failure.persist, success.persist);
    expect(failure.background, success.background);
  });
}
