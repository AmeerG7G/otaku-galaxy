import '../repositories/auth_repository.dart';

/// إرسال رمز تحقق إلى رقم الهاتف.
class SendOtpUsecase {
  const SendOtpUsecase(this._repository);

  final AuthRepository _repository;

  Future<void> call(String phone) => _repository.sendOtp(phone);
}
