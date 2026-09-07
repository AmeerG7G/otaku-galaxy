// مصادقة وهمية للاختبارات التي تحتاج جلسةً بجنس محدَّد.
//
// موضوعها الوحيد أن تُتيح لـ`context.gender` أن يقرأ شيئاً: الشاشات التي
// تعرض نصّاً مصرَّفاً تحتاج `AuthCubit` في الشجرة ولو لم تكن المصادقة
// موضوع الاختبار.

import 'dart:convert';

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

User stubUser({String? gender}) => User(
  id: 'u1',
  username: 'مدقق',
  phone: '07701234567',
  role: 'customer',
  gender: gender,
);

class StubAuthRepository implements AuthRepository {
  StubAuthRepository(this.user);

  User user;

  @override
  Future<User> me() async => user;
  @override
  Future<AuthSession> login(String phone, String password) async =>
      AuthSession(token: 't', user: user);
  @override
  Future<void> register({
    required String username,
    required String phone,
    required String password,
    required String gender,
  }) async {}
  @override
  Future<AuthSession> verifyOtp(String phone, String code) async =>
      AuthSession(token: 't', user: user);
  @override
  Future<void> sendOtp(String phone) async {}
  @override
  Future<void> forgotPassword(String phone) async {}
  @override
  Future<void> resetPassword(String p, String c, String n) async {}
  @override
  Future<User> updateProfile({
    String? username,
    String? avatarUrl,
    bool clearAvatar = false,
    String? gender,
  }) async {
    user = user.copyWith(gender: gender);
    return user;
  }

  @override
  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {}
}

class InMemoryAuthStorage implements AuthLocalStorage {
  InMemoryAuthStorage(this.user);

  final User user;

  @override
  bool get isLoggedIn => true;
  @override
  String? get token => 't';
  @override
  String? getUserJson() => jsonEncode(user.toJson());
  @override
  Future<void> load() async {}
  @override
  Future<void> saveSession(String token, String userJson) async {}
  @override
  Future<void> updateUser(String userJson) async {}
  @override
  Future<void> logout() async {}
}

/// مكعّب مصادقة جاهز بجلسة صاحبها بالجنس المطلوب (`null` = مجهول).
AuthCubit stubAuthCubit({String? gender}) {
  final user = stubUser(gender: gender);
  final repo = StubAuthRepository(user);
  return AuthCubit(
    localStorage: InMemoryAuthStorage(user),
    loginUsecase: LoginUsecase(repo),
    registerUsecase: RegisterUsecase(repo),
    sendOtpUsecase: SendOtpUsecase(repo),
    forgotPasswordUsecase: ForgotPasswordUsecase(repo),
    verifyOtpUsecase: VerifyOtpUsecase(repo),
    resetPasswordUsecase: ResetPasswordUsecase(repo),
    getMeUsecase: GetMeUsecase(repo),
    updateProfileUsecase: UpdateProfileUsecase(repo),
    changePasswordUsecase: ChangePasswordUsecase(repo),
  );
}
