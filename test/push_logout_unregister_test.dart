// الخروج يُلغي ربط الجهاز بالحساب على الخادم — بالسلسلة الحقيقية:
// AuthCubit → PushRegistrar → PushTokenRepository → ApiClient (ترويسة التوكن).
//
// [CRITICAL] كان `logout()` يمسح التوكن ثم يبثّ `AuthUnauthenticated`، ومستمعُ
// التطبيق يستدعي `PushRegistrar.onLogout()` بعدها — فيخرج
// `POST /devices/unregister` بلا ترويسة Authorization، يرتدّ بـ401 ويُبتلع،
// ويبقى الهاتف يستقبل إشعارات طلبات من خرج. الاختبارات السابقة كانت تستعمل
// مستودعاً وهمياً فلا ترى الترتيب.

import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/config/app_config.dart';
import 'package:otaku_galaxy/core/network/api_client.dart';
import 'package:otaku_galaxy/features/auth/data/datasources/auth_local_storage.dart';
import 'package:otaku_galaxy/features/auth/data/repositories/auth_repository_impl.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/change_password_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/forgot_password_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/get_me_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/login_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/register_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/update_profile_usecase.dart';
import 'package:otaku_galaxy/features/auth/presentation/cubit/auth_cubit.dart';
import 'package:otaku_galaxy/features/auth/presentation/cubit/auth_state.dart';
import 'package:otaku_galaxy/features/notifications/data/push_registrar.dart';
import 'package:otaku_galaxy/features/notifications/data/push_token_repository.dart';

class _Adapter implements HttpClientAdapter {
  final List<RequestOptions> requests = [];

  /// يُكمَل حين يريد الاختبار أن يردّ الخادم على إلغاء التسجيل.
  Completer<void>? holdUnregister;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    final path = options.uri.path;
    if (path == '/api/devices/unregister') await holdUnregister?.future;
    final authorized = options.headers['Authorization'] == 'Bearer t0';
    final body = switch (path) {
      '/api/auth/me' => {'success': true, 'data': {'user': _user}, 'message': 'ok'},
      _ => {'success': true, 'data': <String, Object?>{}, 'message': 'ok'},
    };
    return ResponseBody.fromString(
      jsonEncode(authorized ? body : {'success': false, 'message': 'unauthorized'}),
      authorized ? 200 : 401,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}

  List<RequestOptions> to(String path) =>
      requests.where((r) => r.uri.path == path).toList();
}

const _user = {
  'id': 'u1',
  'username': 'زبون',
  'phone': '+9647701234567',
  'role': 'customer',
  'gender': 'male',
  'preferredLanguage': 'ar',
  'isPhoneVerified': true,
};

class _Storage implements AuthLocalStorage {
  String? _token = 't0';
  String? _userJson;
  @override
  bool get isLoggedIn => _token != null;
  @override
  String? get token => _token;
  @override
  String? getUserJson() => _userJson;
  @override
  Future<void> load() async {}
  @override
  Future<void> saveSession(String token, String userJson) async {
    _token = token;
    _userJson = userJson;
  }

  @override
  Future<void> updateUser(String userJson) async => _userJson = userJson;
  @override
  Future<void> logout() async => _token = _userJson = null;
}

class _Source implements PushTokenSource {
  @override
  Future<String?> requestPermissionAndGetToken() async => 'fcm-token-1';
  @override
  Stream<String> get onTokenRefresh => const Stream<String>.empty();
}

({AuthCubit auth, PushRegistrar registrar, _Adapter adapter, _Storage storage})
_wire({Duration? beforeLogoutTimeout}) {
  final adapter = _Adapter();
  final storage = _Storage();
  final api = ApiClient(
    config: AppConfig.development,
    dio: Dio(BaseOptions(baseUrl: 'http://stub.invalid/api'))
      ..httpClientAdapter = adapter,
    tokenProvider: () => storage.token,
  );
  final repo = AuthRepositoryImpl(api: api);
  final registrar = PushRegistrar(_Source(), PushTokenRepository(api));
  final auth = AuthCubit(
    localStorage: storage,
    loginUsecase: LoginUsecase(repo),
    registerUsecase: RegisterUsecase(repo),
    forgotPasswordUsecase: ForgotPasswordUsecase(repo),
    getMeUsecase: GetMeUsecase(repo),
    updateProfileUsecase: UpdateProfileUsecase(repo),
    changePasswordUsecase: ChangePasswordUsecase(repo),
    beforeLogout: registrar.onLogout,
    beforeLogoutTimeout: beforeLogoutTimeout ?? const Duration(seconds: 5),
  );
  // كما يفعل مستمع التطبيق (`app.dart`): الحالة غير المسجَّلة تستدعي onLogout.
  auth.stream.listen((state) {
    if (state is AuthUnauthenticated) unawaited(registrar.onLogout());
  });
  return (auth: auth, registrar: registrar, adapter: adapter, storage: storage);
}

void main() {
  test('[CRITICAL] الخروج يُلغي تسجيل الجهاز بتوكن الجلسة قبل مسحه', () async {
    final w = _wire();
    await w.auth.loadSession();
    await w.registrar.onLogin();
    expect(w.adapter.to('/api/devices'), hasLength(1));

    await w.auth.logout();
    await pumpEventQueue();

    final unregister = w.adapter.to('/api/devices/unregister');
    expect(unregister, hasLength(1), reason: 'طلبٌ واحد — لا تكرار من المستمع');
    expect(unregister.single.headers['Authorization'], 'Bearer t0');
    expect(unregister.single.data, {'token': 'fcm-token-1'});
    expect(w.storage.token, isNull);
    expect(w.auth.state, isA<AuthUnauthenticated>());
    await w.auth.close();
  });

  test('خادمٌ بطيء لا يحبس الخروج — المهلة تمضي والجلسة تُمسح', () async {
    final w = _wire(beforeLogoutTimeout: const Duration(milliseconds: 50));
    await w.auth.loadSession();
    await w.registrar.onLogin();
    w.adapter.holdUnregister = Completer<void>();

    await w.auth.logout();

    expect(w.storage.token, isNull);
    expect(w.auth.state, isA<AuthUnauthenticated>());
    // الطلب خرج بالترويسة قبل المسح، ويكمل في الخلفية.
    final unregister = w.adapter.to('/api/devices/unregister');
    expect(unregister.single.headers['Authorization'], 'Bearer t0');
    w.adapter.holdUnregister!.complete();
    await pumpEventQueue();
    await w.auth.close();
  });

  test('فشلُ إلغاء التسجيل لا يمنع الخروج', () async {
    final storage = _Storage();
    final api = ApiClient(
      config: AppConfig.development,
      dio: Dio(BaseOptions(baseUrl: 'http://stub.invalid/api'))
        ..httpClientAdapter = _Adapter(),
      tokenProvider: () => storage.token,
    );
    final repo = AuthRepositoryImpl(api: api);
    final auth = AuthCubit(
      localStorage: storage,
      loginUsecase: LoginUsecase(repo),
      registerUsecase: RegisterUsecase(repo),
      forgotPasswordUsecase: ForgotPasswordUsecase(repo),
      getMeUsecase: GetMeUsecase(repo),
      updateProfileUsecase: UpdateProfileUsecase(repo),
      changePasswordUsecase: ChangePasswordUsecase(repo),
      beforeLogout: () async => throw StateError('شبكة'),
    );
    await auth.loadSession();
    await auth.logout();
    expect(storage.token, isNull);
    expect(auth.state, isA<AuthUnauthenticated>());
    await auth.close();
  });

  test('forceLogout (‏401) لا يستدعي beforeLogout — التوكن ميّت أصلاً', () async {
    var called = 0;
    final storage = _Storage();
    final api = ApiClient(
      config: AppConfig.development,
      dio: Dio(BaseOptions(baseUrl: 'http://stub.invalid/api'))
        ..httpClientAdapter = _Adapter(),
      tokenProvider: () => storage.token,
    );
    final repo = AuthRepositoryImpl(api: api);
    final auth = AuthCubit(
      localStorage: storage,
      loginUsecase: LoginUsecase(repo),
      registerUsecase: RegisterUsecase(repo),
      forgotPasswordUsecase: ForgotPasswordUsecase(repo),
      getMeUsecase: GetMeUsecase(repo),
      updateProfileUsecase: UpdateProfileUsecase(repo),
      changePasswordUsecase: ChangePasswordUsecase(repo),
      beforeLogout: () async => called += 1,
    );
    await auth.loadSession();
    await auth.forceLogout();
    expect(called, 0);
    expect(storage.token, isNull);
    await auth.close();
  });
}
