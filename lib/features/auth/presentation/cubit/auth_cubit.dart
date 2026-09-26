import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/errors/app_exception.dart';
import '../../../settings/presentation/cubit/locale_cubit.dart';

import '../../data/datasources/auth_local_storage.dart';
import '../../domain/entities/account_request.dart';
import '../../domain/entities/user.dart';
import '../../domain/usecases/change_password_usecase.dart';
import '../../domain/usecases/get_me_usecase.dart';
import '../../domain/usecases/login_usecase.dart';
import '../../domain/usecases/forgot_password_usecase.dart';
import '../../domain/usecases/register_usecase.dart';
import '../../domain/usecases/update_profile_usecase.dart';
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
    required this.forgotPasswordUsecase,
    required this.getMeUsecase,
    required this.updateProfileUsecase,
    required this.changePasswordUsecase,
    this.languageOf,
  }) : super(const AuthInitializing());

  final AuthLocalStorage localStorage;
  final LoginUsecase loginUsecase;
  final RegisterUsecase registerUsecase;
  final ForgotPasswordUsecase forgotPasswordUsecase;
  final GetMeUsecase getMeUsecase;
  final UpdateProfileUsecase updateProfileUsecase;
  final ChangePasswordUsecase changePasswordUsecase;

  /// لغة الواجهة الحالية — يقرؤها المكعّب عند كل جلسة ليدفعها إلى الخادم.
  ///
  /// دالّةٌ لا قيمة: اللغة تتغيّر بعد بناء المكعّب. و`null` في الاختبارات
  /// التي لا تعنيها اللغة — فلا مزامنة ولا طلب.
  final AppLanguage Function()? languageOf;

  User? _user;
  bool _sessionLoaded = false;

  /// المستخدم الحالي إن وُجدت جلسة.
  User? get user => _user;

  /// هل توجد جلسة محفوظة؟
  bool get isLoggedIn => localStorage.isLoggedIn;

  /// استعادة الجلسة عند بدء التشغيل: قراءة التوكن المحفوظ ثم التحقق منه
  /// لدى الخادم عبر `/auth/me`.
  ///
  /// [CRITICAL]: الجلسة تُمسح فقط حين يرفضها الخادم صراحةً (401). أي فشل
  /// آخر — انقطاع شبكة، مهلة، خادم متوقف — يُبقي التوكن ويستعيد المستخدم
  /// من النسخة المحفوظة، وإلا كان انقطاعٌ لحظي واحد عند الإقلاع يُخرج
  /// المستخدم نهائياً ويحذف توكنه الصالح.
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
      await _syncPreferredLanguage();
    } on AppException catch (e) {
      if (e.isUnauthorized) {
        await _clearSession();
        return;
      }
      _restoreCachedUser();
    } catch (_) {
      // خطأ غير متوقع (تحليل/تسلسل) — نُبقي الجلسة ولا نعاقب المستخدم.
      _restoreCachedUser();
    }
  }

  /// يستعيد آخر مستخدم محفوظ محلياً حين يتعذّر الوصول للخادم.
  ///
  /// التوكن يبقى، فأول طلب ناجح لاحقاً يعمل طبيعياً؛ وإن كان التوكن منتهياً
  /// فعلاً سيردّ الخادم 401 وتُمسح الجلسة عبر [forceLogout].
  void _restoreCachedUser() {
    final cached = localStorage.getUserJson();
    if (cached == null || cached.isEmpty) {
      // لا نسخة محفوظة: نُبقي التوكن لكن نعرض حالة غير مسجّل حتى ينجح طلب.
      emit(const AuthUnauthenticated());
      return;
    }
    try {
      _user = User.fromJson(jsonDecode(cached) as Map<String, dynamic>);
      emit(AuthAuthenticated(user: _user!));
    } catch (_) {
      emit(const AuthUnauthenticated());
    }
  }

  Future<void> _clearSession() async {
    await localStorage.logout();
    _user = null;
    emit(const AuthUnauthenticated());
  }

  /// تسجيل الدخول برقم الهاتف وكلمة المرور.
  Future<void> login(String phone, String password) async {
    final session = await loginUsecase.call(phone, password);
    await _saveSession(session.token, session.user);
  }

  /// إنشاء حساب جديد — يُرسل رمز تحقق للهاتف.
  /// إنشاء حساب — يعيد إيصال طلبٍ معلَّق، لا جلسة.
  ///
  /// ═══ القرار ═══ لا رمز SMS. الحساب يُفعَّل من اللوحة بعد تحقّق واتساب،
  /// ثم يدخل الزبون بكلمته من شاشة الدخول العادية. لا شيء هنا يحفظ جلسة.
  Future<AccountRequestReceipt> register({
    required String username,
    required String phone,
    required String password,
    required String gender,
  }) => registerUsecase.call(
    username: username,
    phone: phone,
    password: password,
    gender: gender,
  );

  /// نسيت كلمة المرور — يعيد إيصال طلبٍ معلَّق تحسمه الإدارة.
  Future<AccountRequestReceipt> forgotPassword({
    required String phone,
    required String username,
    required String gender,
    required String levelKey,
  }) => forgotPasswordUsecase.call(
    phone: phone,
    username: username,
    gender: gender,
    levelKey: levelKey,
  );

  /// تحديث الملف الشخصي (الاسم أو الصورة) عبر `PATCH /auth/me` ثم مزامنة
  /// الحالة المحلية حتى تنعكس التعديلات على بقية الشاشات فوراً.
  Future<void> updateProfile({
    String? username,
    String? avatar,
    bool clearAvatar = false,
    String? gender,
    String? preferredLanguage,
  }) async {
    if (_user == null) return;
    final updated = await updateProfileUsecase.call(
      username: username,
      avatarUrl: avatar,
      clearAvatar: clearAvatar,
      gender: gender,
      preferredLanguage: preferredLanguage,
    );
    _user = updated;
    await localStorage.updateUser(jsonEncode(updated.toJson()));
    emit(AuthAuthenticated(user: updated));
  }

  /// تغيير كلمة المرور من الإعدادات — مستخدم مسجّل دخوله بالفعل، بلا رمز تحقق.
  ///
  /// [CRITICAL] الجلسة العائدة تُحفظ فوراً: الخادم أبطل التوكن القديم برفع
  /// `token_version`، فلو بقي في التخزين لرُفض الطلبُ التالي (أيّاً كان —
  /// تبديل لغة، فتح السلة) بـ`SESSION_REVOKED` وخرج المستخدم بلا سبب ظاهر.
  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    final session = await changePasswordUsecase.call(
      currentPassword: currentPassword,
      newPassword: newPassword,
    );
    await _saveSession(session.token, session.user);
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
    await _syncPreferredLanguage();
  }

  /// يدفع لغة الواجهة إلى الخادم إن خالفت ما يحفظه عن هذا الحساب.
  ///
  /// [CRITICAL] الخادم يحسم لغة كل ردٍّ مصادَق بعمود `preferred_language`
  /// **قبل** ترويسة `Accept-Language`. كان التطبيق لا يرسل الاثنين، فبقي
  /// العمود على `ar` لكل حساب، وبقيت الأقسام والمنتجات ورسائل الخطأ عربيةً
  /// في واجهةٍ كردية لمستخدمٍ مسجَّل. تُستدعى عند كل جلسةٍ يؤكّدها الخادم
  /// (دخول، تسجيل، استعادة) وعند تبديل اللغة من الإعدادات.
  ///
  /// تفشل بصمت: مزامنةُ تفضيلٍ لا يجوز أن تُفشل دخولاً أو تبديلَ لغة.
  /// الفرق يُعاد دفعه في الجلسة التالية.
  Future<void> syncPreferredLanguage() => _syncPreferredLanguage();

  Future<void> _syncPreferredLanguage() async {
    final user = _user;
    final language = languageOf?.call();
    if (user == null || language == null) return;
    if (user.preferredLanguage == language.code) return;
    try {
      await updateProfile(preferredLanguage: language.code);
    } catch (error) {
      // انظر أعلاه — صامتٌ للمستخدم، لا للمطوّر: السبب يُطبع في التطوير حتى
      // لا يضيع خلف «تبديل اللغة أخرجني» بلا أثر.
      if (kDebugMode) debugPrint('[auth] preferred-language sync failed: $error');
    }
  }
}
