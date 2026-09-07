import '../../../../core/constants/api_endpoints.dart';
import '../../../../core/network/api_client.dart';
import '../../domain/entities/auth_session.dart';
import '../../domain/entities/user.dart';
import '../../domain/repositories/auth_repository.dart';

/// تنفيذ مستودع المصادقة عبر الـ API الحقيقي.
class AuthRepositoryImpl implements AuthRepository {
  AuthRepositoryImpl({ApiClient? api}) : _api = api ?? ApiClient();

  final ApiClient _api;

  @override
  Future<void> register({
    required String username,
    required String phone,
    required String password,
    required String gender,
  }) async {
    await _api.post(
      ApiEndpoints.register,
      body: {
        'username': username,
        'phone': phone,
        'password': password,
        'gender': gender,
      },
    );
  }

  @override
  Future<AuthSession> verifyOtp(String phone, String code) async {
    final data =
        await _api.post(
              ApiEndpoints.verifyOtp,
              body: {'phone': phone, 'code': code},
            )
            as Map<String, dynamic>;
    // نفس شكل استجابة تسجيل الدخول: { token, user }.
    return AuthSession(
      token: data['token'] as String,
      user: User.fromJson(data['user'] as Map<String, dynamic>),
    );
  }

  @override
  Future<void> sendOtp(String phone) async {
    await _api.post(ApiEndpoints.sendOtp, body: {'phone': phone});
  }

  @override
  Future<AuthSession> login(String phone, String password) async {
    final data =
        await _api.post(
              ApiEndpoints.login,
              body: {'phone': phone, 'password': password},
            )
            as Map<String, dynamic>;
    return AuthSession(
      token: data['token'] as String,
      user: User.fromJson(data['user'] as Map<String, dynamic>),
    );
  }

  @override
  Future<void> forgotPassword(String phone) async {
    await _api.post(ApiEndpoints.forgotPassword, body: {'phone': phone});
  }

  @override
  Future<void> resetPassword(
    String phone,
    String code,
    String newPassword,
  ) async {
    await _api.post(
      ApiEndpoints.resetPassword,
      body: {'phone': phone, 'code': code, 'newPassword': newPassword},
    );
  }

  @override
  Future<User> me() async {
    final data = await _api.get(ApiEndpoints.me) as Map<String, dynamic>;
    return User.fromJson(data['user'] as Map<String, dynamic>);
  }

  @override
  Future<User> updateProfile({
    String? username,
    String? avatarUrl,
    bool clearAvatar = false,
    String? gender,
  }) async {
    // الخادم يميّز الحقل الغائب (لا تغيير) عن null الصريحة (امسح الصورة).
    // لذلك نبني الجسم صراحةً: استخدام المعامل `?` هنا كان يُسقط المفتاح
    // عند null فلا تصل نية المسح للخادم إطلاقاً.
    final body = <String, dynamic>{};
    if (username != null) body['username'] = username;
    // الغائب يعني «لا تغيّر»؛ ولا مسار يعيد الحساب إلى «مجهول» بعد الاختيار.
    if (gender != null) body['gender'] = gender;
    if (clearAvatar) {
      body['avatarUrl'] = null;
    } else if (avatarUrl != null) {
      body['avatarUrl'] = avatarUrl;
    }
    final data =
        await _api.patch(ApiEndpoints.me, body: body) as Map<String, dynamic>;
    return User.fromJson(data['user'] as Map<String, dynamic>);
  }

  @override
  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    await _api.patch(
      ApiEndpoints.changePassword,
      body: {'currentPassword': currentPassword, 'newPassword': newPassword},
    );
  }
}
