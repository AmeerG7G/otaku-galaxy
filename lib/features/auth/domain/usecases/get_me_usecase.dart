import '../entities/user.dart';
import '../repositories/auth_repository.dart';

/// جلب بيانات المستخدم الحالي عبر `/auth/me` (استعادة الجلسة).
class GetMeUsecase {
  const GetMeUsecase(this._repository);

  final AuthRepository _repository;

  Future<User> call() => _repository.me();
}