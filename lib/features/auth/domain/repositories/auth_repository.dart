import '../entities/account_request.dart';
import '../entities/auth_session.dart';
import '../entities/user.dart';

/// واجهة مستودع المصادقة (تعريف فقط).
abstract class AuthRepository {
  /// إنشاء حساب — يُنشئ **طلباً** تحسمه الإدارة (لا رمز تحقق).
  ///
  /// الاستمارة كما كانت: الاسم والرقم وكلمة المرور والجنس. الخادم ينشئ
  /// الحساب غير مفعَّل ويفتح طلباً تراه اللوحة؛ الإدارة تتحقّق عبر واتساب
  /// ثم توافق فيدخل الزبون بكلمته — أو ترفض.
  ///
  /// [gender] مطلوب: الخادم يرفض التسجيل بدونه. الغرض نحويّ بحت — توافق
  /// الخطاب العربي مع صاحب الحساب.
  Future<AccountRequestReceipt> register({
    required String username,
    required String phone,
    required String password,
    required String gender,
  });

  Future<AuthSession> login(String phone, String password);

  /// نسيت كلمة المرور — طلبٌ للإدارة بمعلومات تعريف، لا رمز.
  ///
  /// الأربعة معلوماتٌ يقارنها المسؤول بالمخزَّن ليحكم إن كان الطالب صاحب
  /// الحساب؛ تطابقُها **لا** يغيّر كلمة المرور. الإدارة تتحقّق عبر واتساب
  /// ثم تضع كلمة مرور جديدة دائمة وتبلّغها الزبون فيدخل بها عادياً.
  Future<AccountRequestReceipt> forgotPassword({
    required String phone,
    required String username,
    required String gender,
    required String levelKey,
  });

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
    String? gender,
    String? preferredLanguage,
  });

  /// تغيير كلمة المرور من الإعدادات — مستخدم مسجّل دخوله، بلا رمز تحقق.
  ///
  /// يعيد **جلسةً جديدة**: الخادم يرفع `token_version` ليُسقط الأجهزة الأخرى
  /// ويعيد توكناً لهذا الجهاز. إهمالُه كان يترك توكناً قديماً فيرفض الخادمُ
  /// الطلبَ التالي بـ`SESSION_REVOKED` ويخرج صاحبُ التغيير من التطبيق.
  Future<AuthSession> changePassword({
    required String currentPassword,
    required String newPassword,
  });
}
