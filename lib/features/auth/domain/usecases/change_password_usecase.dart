import '../entities/auth_session.dart';
import '../repositories/auth_repository.dart';

/// تغيير كلمة المرور من الإعدادات عبر PATCH /auth/me/password (بلا رمز تحقق).
class ChangePasswordUsecase {
  const ChangePasswordUsecase(this._repository);

  final AuthRepository _repository;

  Future<AuthSession> call({
    required String currentPassword,
    required String newPassword,
  }) => _repository.changePassword(
    currentPassword: currentPassword,
    newPassword: newPassword,
  );
}
