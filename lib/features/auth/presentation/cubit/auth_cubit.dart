import 'dart:convert';

import 'package:flutter_bloc/flutter_bloc.dart';

import '../../data/datasources/auth_local_storage.dart';
import '../../domain/entities/user.dart';
import '../../domain/usecases/get_me_usecase.dart';
import '../../domain/usecases/login_usecase.dart';
import '../../domain/usecases/forgot_password_usecase.dart';
import '../../domain/usecases/register_usecase.dart';
import '../../domain/usecases/reset_password_usecase.dart';
import '../../domain/usecases/send_otp_usecase.dart';
import '../../domain/usecases/update_profile_usecase.dart';
import '../../domain/usecases/verify_otp_usecase.dart';
import 'auth_state.dart';

/// يدير جلسة المستخدم: تسجيل الدخول، إنشاء الحساب، تسجيل الخروج،
/// واستعادة الجلسة عبر `/auth/me`.
///
/// مسجّل كـ singleton في get_it لأن بيانات الجلسة مشتركة بين عدة شاشات.
class AuthCubit extends Cubit<AuthState> {
  AuthCubit({
    required this.localStorage,
    required this.loginUsecase,
    required this.registerUsecase,
    required this.sendOtpUsecase,
    required this.forgotPasswordUsecase,
    required this.verifyOtpUsecase,
    required this.resetPasswordUsecase,
    required this.getMeUsecase,
    required this.updateProfileUsecase,
  }) : super(const AuthInitializing());

  final AuthLocalStorage localStorage;
  final LoginUsecase loginUsecase;
  final RegisterUsecase registerUsecase;
  final SendOtpUsecase sendOtpUsecase;
  final ForgotPasswordUsecase forgotPasswordUsecase;
  final VerifyOtpUsecase verifyOtpUsecase;
  final ResetPasswordUsecase resetPasswordUsecase;
  final GetMeUsecase getMeUsecase;
  final UpdateProfileUsecase updateProfileUsecase;

  User? _user;
  bool _sessionLoaded = false;

  /// المستخدم الحالي إن وُجدت جلسة.
  User? get user => _user;

  /// هل توجد جلسة محفوظة؟
  bool get isLoggedIn => localStorage.isLoggedIn;

  /// استعادة الجلسة عند بدء التشغيل: قراءة التوكن المحفوظ ثم التحقق
  /// منه لدى الخادم عبر `/auth/me`؛ إن فشل التحقق تُمسح الجلسة.
  Future<void> loadSession() async {
    if (_sessionLoaded) return;
    _sessionLoaded = true;

    if (!localStorage.isLoggedIn) {
      emit(const AuthUnauthenticated());
      return;
    }

    try {
      final user = await getMeUsecase.call();
      _user = user;
      await localStorage.updateUser(jsonEncode(user.toJson()));
      emit(AuthAuthenticated(user: user));
    } catch (_) {
      await localStorage.logout();
      _user = null;
      emit(const AuthUnauthenticated());
    }
  }

  /// تسجيل الدخول برقم الهاتف وكلمة المرور.
  Future<void> login(String phone, String password) async {
    final session = await loginUsecase.call(phone, password);
    await _saveSession(session.token, session.user);
  }

  /// إنشاء حساب جديد — يُرسل رمز تحقق للهاتف.
  Future<void> register({
    required String username,
    required String phone,
    required String password,
  }) => registerUsecase.call(
    username: username,
    phone: phone,
    password: password,
  );

  /// إرسال رمز التحقق إلى رقم الهاتف.
  Future<void> sendOtp(String phone) => sendOtpUsecase.call(phone);

  /// إرسال رمز إعادة تعيين كلمة المرور (Purpose: password_reset).
  Future<void> forgotPassword(String phone) =>
      forgotPasswordUsecase.call(phone);

  /// التحقق من رمز التحقق.
  Future<void> verifyOtp(String phone, String code) =>
      verifyOtpUsecase.call(phone, code);

  /// إعادة تعيين كلمة المرور.
  Future<void> resetPassword(String phone, String code, String newPassword) =>
      resetPasswordUsecase.call(phone, code, newPassword);

  /// تحديث الملف الشخصي (الاسم أو الصورة) عبر `PATCH /auth/me` ثم مزامنة
  /// الحالة المحلية حتى تنعكس التعديلات على بقية الشاشات فوراً.
  Future<void> updateProfile({String? username, String? avatar}) async {
    if (_user == null) return;
    final updated = await updateProfileUsecase.call(
      username: username,
      avatarUrl: avatar,
    );
    _user = updated;
    await localStorage.updateUser(jsonEncode(updated.toJson()));
    emit(AuthAuthenticated(user: updated));
  }

  /// مسح الجلسة بشكل إجباري (انتهاء صلاحية التوكن / استجابة 401).
  Future<void> forceLogout() async {
    if (!isLoggedIn && _user == null) return;
    await localStorage.logout();
    _user = null;
    emit(const AuthUnauthenticated());
  }

  /// تسجيل الخروج ومسح الجلسة.
  Future<void> logout() => forceLogout();

  Future<void> _saveSession(String token, User user) async {
    await localStorage.saveSession(token, jsonEncode(user.toJson()));
    _user = user;
    emit(AuthAuthenticated(user: user));
  }
}
