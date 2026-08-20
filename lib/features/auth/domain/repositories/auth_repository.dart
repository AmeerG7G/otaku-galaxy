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

  /// التحقق من رمز التسجيل.
  Future<void> verifyOtp(String phone, String code);

  /// إعادة إرسال رمز التحقق.
  Future<void> sendOtp(String phone);

  Future<AuthSession> login(String phone, String password);

  Future<void> forgotPassword(String phone);

  Future<void> resetPassword(String phone, String code, String newPassword);

  /// جلب بيانات المستخدم الحالي (استعادة الجلسة عبر /me).
  Future<User> me();

  /// تحديث الملف الشخصي (الاسم أو الصورة).
  Future<User> updateProfile({String? username, String? avatarUrl});
}