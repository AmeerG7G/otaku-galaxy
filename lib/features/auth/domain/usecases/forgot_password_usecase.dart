import '../entities/account_request.dart';
import '../repositories/auth_repository.dart';

/// نسيت كلمة المرور — يفتح طلباً للإدارة بمعلومات تعريف (لا رمز).
///
/// المعلومات الأربع للمسؤول ليقارنها بالحساب المخزَّن؛ لا تصادق ولا تغيّر
/// شيئاً بنفسها. الإدارة تتحقّق عبر واتساب ثم تضع كلمة مرور جديدة دائمة.
class ForgotPasswordUsecase {
  const ForgotPasswordUsecase(this._repository);

  final AuthRepository _repository;

  Future<AccountRequestReceipt> call({
    required String phone,
    required String username,
    required String gender,
    required String levelKey,
  }) => _repository.forgotPassword(
    phone: phone,
    username: username,
    gender: gender,
    levelKey: levelKey,
  );
}
