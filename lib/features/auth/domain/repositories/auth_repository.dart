import '../entities/auth_session.dart';
import '../entities/user.dart';

/// واجهة مستودع المصادقة (تعريف فقط).
abstract class AuthRepository {
  /// إنشاء حساب — يُرسل رمز تحقق للهاتف (الحساب يُفعَّل بعد التحقق).
  Future<void> register({
    required String username,
    required String phone,
    required String password,
  });

  /// التحقق من رمز التسجيل — يعيد جلسة جاهزة.
  ///
  /// الحساب أُنشئ عند التسجيل والتحقق يثبت ملكية الرقم، فيُصبح المستخدم
  /// مصادَقاً مباشرةً بلا مطالبته بتسجيل دخول يدوي بعده.
  Future<AuthSession> verifyOtp(String phone, String code);

  /// إعادة إرسال رمز التحقق.
  Future<void> sendOtp(String phone);

  Future<AuthSession> login(String phone, String password);

  Future<void> forgotPassword(String phone);

  Future<void> resetPassword(String phone, String code, String newPassword);

  /// جلب بيانات المستخدم الحالي (استعادة الجلسة عبر /me).
  Future<User> me();

  /// تحديث الملف الشخصي (الاسم أو الصورة).
  /// تحديث الملف الشخصي.
  ///
  /// [avatarUrl] الفارغ يعني «لا تغيّر الصورة»؛ لمسحها فعلياً يجب تمرير
  /// [clearAvatar] لأن الحقل الغائب عن الطلب يُبقي القيمة الحالية على الخادم.
  Future<User> updateProfile({
    String? username,
    String? avatarUrl,
    bool clearAvatar = false,
  });

  /// تغيير كلمة المرور من الإعدادات — مستخدم مسجّل دخوله، بلا رمز تحقق.
  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  });
}