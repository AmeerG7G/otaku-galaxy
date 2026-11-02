import '../../../../core/constants/api_endpoints.dart';
import '../../../../core/network/api_client.dart';
import '../../domain/entities/account_request.dart';
import '../../domain/entities/auth_session.dart';
import '../../domain/entities/user.dart';
import '../../domain/repositories/auth_repository.dart';

/// تنفيذ مستودع المصادقة عبر الـ API الحقيقي.
class AuthRepositoryImpl implements AuthRepository {
  AuthRepositoryImpl({ApiClient? api}) : _api = api ?? ApiClient();

  final ApiClient _api;

  @override
  Future<AccountRequestReceipt> register({
    required String username,
    required String phone,
    required String password,
    required String gender,
  }) async {
    final data =
        await _api.post(
              ApiEndpoints.register,
              body: {
                'username': username,
                'phone': phone,
                'password': password,
                'gender': gender,
              },
            )
            as Map<String, dynamic>;
    // لا توكن في الردّ عمداً — الحساب معلَّق حتى موافقة الإدارة.
    return AccountRequestReceipt.fromJson(
      data['request'] as Map<String, dynamic>,
    );
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
  Future<AccountRequestReceipt> forgotPassword({
    required String phone,
    required String username,
    required String gender,
    required String levelKey,
  }) async {
    final data =
        await _api.post(
              ApiEndpoints.forgotPassword,
              body: {
                'phone': phone,
                'username': username,
                'gender': gender,
                'levelKey': levelKey,
              },
            )
            as Map<String, dynamic>;
    return AccountRequestReceipt.fromJson(
      data['request'] as Map<String, dynamic>,
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
    String? preferredLanguage,
  }) async {
    // الخادم يميّز الحقل الغائب (لا تغيير) عن null الصريحة (امسح الصورة).
    // لذلك نبني الجسم صراحةً: استخدام المعامل `?` هنا كان يُسقط المفتاح
    // عند null فلا تصل نية المسح للخادم إطلاقاً.
    final body = <String, dynamic>{};
    if (username != null) body['username'] = username;
    // الغائب يعني «لا تغيّر»؛ ولا مسار يعيد الحساب إلى «مجهول» بعد الاختيار.
    if (gender != null) body['gender'] = gender;
    // تُرسَل مع بقية الملف لا في نقطةٍ خاصة — انظر `updateProfileSchema`
    // في الخادم: تفضيلُ مستخدمٍ كالجنس، ونقطةٌ ثانية مسارٌ ثانٍ للجدول نفسه.
    if (preferredLanguage != null) body['preferredLanguage'] = preferredLanguage;
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
  Future<AuthSession> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    // الردّ `{ token, user }` كردّ الدخول: التوكن الجديد هو الوحيد الذي يقبله
    // الخادم بعد رفع `token_version` — انظر `AuthRepository.changePassword`.
    final data = await _api.patch(
      ApiEndpoints.changePassword,
      body: {'currentPassword': currentPassword, 'newPassword': newPassword},
    ) as Map<String, dynamic>;
    return AuthSession(
      token: data['token'] as String,
      user: User.fromJson(data['user'] as Map<String, dynamic>),
    );
  }
}
