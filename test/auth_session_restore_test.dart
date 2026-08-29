// [CRITICAL REGRESSION GUARD]
//
// استعادة الجلسة عند الإقلاع كانت تمسح التوكن عند *أي* فشل في `/auth/me`.
// ولأن كل الطلبات كانت تخرج بلا ترويسة Authorization فترد 401، كان كل
// تشغيل للتطبيق يحذف توكناً صالحاً ويحوّل المستخدم إلى زائر.
//
// القاعدة الصحيحة: تُمسح الجلسة فقط حين يرفضها الخادم صراحةً (401).
// انقطاع الشبكة أو توقّف الخادم يجب أن يُبقي التوكن.

import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/errors/app_exception.dart';
import 'package:otaku_galaxy/features/auth/data/datasources/auth_local_storage.dart';
import 'package:otaku_galaxy/features/auth/domain/entities/auth_session.dart';
import 'package:otaku_galaxy/features/auth/domain/entities/user.dart';
import 'package:otaku_galaxy/features/auth/domain/repositories/auth_repository.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/change_password_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/forgot_password_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/get_me_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/login_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/register_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/reset_password_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/send_otp_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/update_profile_usecase.dart';
import 'package:otaku_galaxy/features/auth/domain/usecases/verify_otp_usecase.dart';
import 'package:otaku_galaxy/features/auth/presentation/cubit/auth_cubit.dart';
import 'package:otaku_galaxy/features/auth/presentation/cubit/auth_state.dart';

const _user = User(
  id: 'u1',
  username: 'مدقق',
  phone: '07701234567',
  role: 'customer',
);

/// مستودع مصادقة يرمي ما نحدّده عند `me()` فقط.
class _FailingAuthRepository implements AuthRepository {
  _FailingAuthRepository(this.error);

  final Object error;

  @override
  Future<User> me() async => throw error;

  @override
  Future<void> register({
    required String username,
    required String phone,
    required String password,
  }) async {}
  @override
  Future<AuthSession> verifyOtp(String phone, String code) async =>
      const AuthSession(token: 't', user: _user);
  @override
  Future<void> sendOtp(String phone) async {}
  @override
  Future<AuthSession> login(String phone, String password) async =>
      const AuthSession(token: 't', user: _user);
  @override
  Future<void> forgotPassword(String phone) async {}
  @override
  Future<void> resetPassword(String p, String c, String n) async {}
  @override
  Future<User> updateProfile({
    String? username,
    String? avatarUrl,
    bool clearAvatar = false,
  }) async => _user;
  @override
  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {}
}

/// تخزين جلسة في الذاكرة — يتيح فحص ما إذا مُسح التوكن فعلاً.
class _InMemoryAuthStorage implements AuthLocalStorage {
  String? _token;
  String? _userJson;

  void seed(String token, String userJson) {
    _token = token;
    _userJson = userJson;
  }

  @override
  bool get isLoggedIn => _token != null && _token!.isNotEmpty;
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
  Future<void> logout() async {
    _token = null;
    _userJson = null;
  }
}

AuthCubit _cubitWith(_InMemoryAuthStorage storage, Object meError) {
  final repository = _FailingAuthRepository(meError);
  return AuthCubit(
    localStorage: storage,
    loginUsecase: LoginUsecase(repository),
    registerUsecase: RegisterUsecase(repository),
    sendOtpUsecase: SendOtpUsecase(repository),
    forgotPasswordUsecase: ForgotPasswordUsecase(repository),
    verifyOtpUsecase: VerifyOtpUsecase(repository),
    resetPasswordUsecase: ResetPasswordUsecase(repository),
    getMeUsecase: GetMeUsecase(repository),
    updateProfileUsecase: UpdateProfileUsecase(repository),
    changePasswordUsecase: ChangePasswordUsecase(repository),
  );
}

void main() {
  late _InMemoryAuthStorage storage;

  setUp(() {
    storage = _InMemoryAuthStorage()
      ..seed('valid-token', jsonEncode(_user.toJson()));
  });

  test('a network failure keeps the token and restores the cached user', () async {
    final cubit = _cubitWith(
      storage,
      const AppException('تعذر الاتصال بالخادم'), // بلا statusCode
    );
    addTearDown(cubit.close);

    await cubit.loadSession();

    expect(
      storage.token,
      'valid-token',
      reason: 'انقطاع الشبكة يجب ألا يحذف توكناً صالحاً',
    );
    expect(cubit.state, isA<AuthAuthenticated>());
    expect(cubit.user?.id, 'u1');
  });

  test('a 500 from the server also keeps the token', () async {
    final cubit = _cubitWith(
      storage,
      const AppException('خطأ من الخادم', statusCode: 500),
    );
    addTearDown(cubit.close);

    await cubit.loadSession();

    expect(storage.token, 'valid-token');
    expect(cubit.state, isA<AuthAuthenticated>());
  });

  test('a real 401 clears the session', () async {
    final cubit = _cubitWith(
      storage,
      const AppException('مطلوب تسجيل الدخول', statusCode: 401),
    );
    addTearDown(cubit.close);

    await cubit.loadSession();

    expect(
      storage.token,
      isNull,
      reason: 'رفض الخادم الصريح للجلسة يجب أن يمسحها',
    );
    expect(cubit.state, isA<AuthUnauthenticated>());
  });

  test('no stored token means guest, without calling the server', () async {
    final empty = _InMemoryAuthStorage();
    final cubit = _cubitWith(
      empty,
      const AppException('يجب ألا يُستدعى', statusCode: 401),
    );
    addTearDown(cubit.close);

    await cubit.loadSession();

    expect(cubit.state, isA<AuthUnauthenticated>());
  });
}
