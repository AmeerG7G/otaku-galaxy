import '../repositories/auth_repository.dart';

/// إرسال رمز التحقق لإعادة تعيين كلمة المرور (Purpose: password_reset).
class ForgotPasswordUsecase {
  const ForgotPasswordUsecase(this._repository);

  final AuthRepository _repository;

  Future<void> call(String phone) => _repository.forgotPassword(phone);
}
