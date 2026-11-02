import '../repositories/auth_repository.dart';

/// إنشاء كلمة مرور جديدة بعد التحقق.
class ResetPasswordUsecase {
  const ResetPasswordUsecase(this._repository);

  final AuthRepository _repository;

  Future<void> call(String phone, String code, String newPassword) =>
      _repository.resetPassword(phone, code, newPassword);
}
