import '../entities/user.dart';
import '../repositories/auth_repository.dart';

/// تحديث الملف الشخصي (الاسم / الصورة) عبر PATCH /auth/me.
class UpdateProfileUsecase {
  const UpdateProfileUsecase(this._repository);

  final AuthRepository _repository;

  Future<User> call({String? username, String? avatarUrl}) =>
      _repository.updateProfile(username: username, avatarUrl: avatarUrl);
}
