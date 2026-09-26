import '../entities/account_request.dart';
import '../repositories/auth_repository.dart';

/// إنشاء حساب جديد — يفتح طلباً تحسمه الإدارة بعد تحقّق واتساب (لا رمز).
class RegisterUsecase {
  const RegisterUsecase(this._repository);

  final AuthRepository _repository;

  Future<AccountRequestReceipt> call({
    required String username,
    required String phone,
    required String password,
    required String gender,
  }) => _repository.register(
    username: username,
    phone: phone,
    password: password,
    gender: gender,
  );
}
