import '../../../core/network/api_client.dart';
import '../../auth/domain/entities/auth_session.dart';
import '../../auth/domain/entities/user.dart';
import '../domain/whatsapp_signup_models.dart';

/// نقاط التسجيل عبر واتساب — هنا لا في `ApiEndpoints`.
///
/// [CRITICAL] `test/admin_managed_account_flows_test.dart` (TRIPWIRE D) يمنع
/// نقاط «الرمز» في `api_endpoints.dart` و`auth_repository.dart` و`auth_cubit.dart`.
/// هذا المسار ليس رمز SMS — رسالةٌ يرسلها الزبون من واتسابه — لكنه يعيش في
/// ميزته المستقلة كي يبقى ذلك الحارس كما هو بلا تعديل.
abstract final class WhatsAppSignupEndpoints {
  static const options = '/auth/registration-options';
  static const start = '/auth/register/whatsapp/start';
  static const status = '/auth/register/whatsapp/status';
  static const complete = '/auth/register/whatsapp/complete';
}

abstract interface class WhatsAppSignupRepository {
  /// هل التحقق عبر واتساب مفعَّل على هذا الخادم؟ الفشل = غير مفعَّل.
  Future<WhatsAppSignupOptions> options();
  Future<WhatsAppSignupSession> start(String phone);
  Future<WhatsAppSignupStatus> status(WhatsAppSignupSession session);
  Future<AuthSession> complete(
    WhatsAppSignupSession session, {
    required String username,
    required String gender,
    required String password,
  });
}

class WhatsAppSignupRepositoryImpl implements WhatsAppSignupRepository {
  WhatsAppSignupRepositoryImpl({ApiClient? api}) : _api = api ?? ApiClient();

  final ApiClient _api;

  @override
  Future<WhatsAppSignupOptions> options() async {
    try {
      final data =
          await _api.get(WhatsAppSignupEndpoints.options)
              as Map<String, dynamic>;
      return WhatsAppSignupOptions.fromJson(data);
    } catch (_) {
      // خادمٌ أقدم بلا هذه النقطة، أو انقطاع: الشاشة تبقى كما كانت تماماً.
      return WhatsAppSignupOptions.disabled;
    }
  }

  @override
  Future<WhatsAppSignupSession> start(String phone) async {
    final data =
        await _api.post(WhatsAppSignupEndpoints.start, body: {'phone': phone})
            as Map<String, dynamic>;
    return WhatsAppSignupSession.fromJson(data, phone: phone);
  }

  @override
  Future<WhatsAppSignupStatus> status(WhatsAppSignupSession session) async {
    final data =
        await _api.post(
              WhatsAppSignupEndpoints.status,
              body: {'sessionId': session.sessionId, 'secret': session.secret},
            )
            as Map<String, dynamic>;
    return WhatsAppSignupStatus.fromJson(data);
  }

  @override
  Future<AuthSession> complete(
    WhatsAppSignupSession session, {
    required String username,
    required String gender,
    required String password,
  }) async {
    final data =
        await _api.post(
              WhatsAppSignupEndpoints.complete,
              body: {
                'sessionId': session.sessionId,
                'secret': session.secret,
                'username': username,
                'gender': gender,
                'password': password,
              },
            )
            as Map<String, dynamic>;
    return AuthSession(
      token: data['token'] as String,
      user: User.fromJson(data['user'] as Map<String, dynamic>),
    );
  }
}
