import '../entities/auth_session.dart';
import '../repositories/auth_repository.dart';

/// تسجيل الدخول برقم الهاتف وكلمة المرور.
class LoginUsecase {
  const LoginUsecase(this._repository);

  final AuthRepository _repository;

  Future<AuthSession> call(String phone, String password) =>
      _repository.login(phone, password);
}