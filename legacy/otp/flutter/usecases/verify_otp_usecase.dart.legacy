import '../entities/auth_session.dart';
import '../repositories/auth_repository.dart';

/// التحقق من رمز التأكيد.
class VerifyOtpUsecase {
  const VerifyOtpUsecase(this._repository);

  final AuthRepository _repository;

  Future<AuthSession> call(String phone, String code) =>
      _repository.verifyOtp(phone, code);
}
