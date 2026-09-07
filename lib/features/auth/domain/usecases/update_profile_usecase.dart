import '../entities/user.dart';
import '../repositories/auth_repository.dart';

/// تحديث الملف الشخصي (الاسم / الصورة / الجنس) عبر PATCH /auth/me.
class UpdateProfileUsecase {
  const UpdateProfileUsecase(this._repository);

  final AuthRepository _repository;

  Future<User> call({
    String? username,
    String? avatarUrl,
    bool clearAvatar = false,
    String? gender,
  }) => _repository.updateProfile(
    username: username,
    avatarUrl: avatarUrl,
    clearAvatar: clearAvatar,
    gender: gender,
  );
}
