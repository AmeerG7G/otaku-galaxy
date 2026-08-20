import '../repositories/auth_repository.dart';

/// إنشاء حساب جديد — يُرسل رمز تحقق لهاتف الزبون.
class RegisterUsecase {
  const RegisterUsecase(this._repository);

  final AuthRepository _repository;

  Future<void> call({
    required String username,
    required String phone,
    required String password,
  }) => _repository.register(username: username, phone: phone, password: password);
}