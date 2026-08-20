import 'package:equatable/equatable.dart';

import '../../domain/entities/user.dart';

/// الحالات الممكنة لجلسة المستخدم.
sealed class AuthState extends Equatable {
  const AuthState();
}

/// جاري تحميل الجلسة المحفوظة عند بدء التشغيل.
final class AuthInitializing extends AuthState {
  const AuthInitializing();

  @override
  List<Object?> get props => const [];
}

/// لا توجد جلسة نشطة.
final class AuthUnauthenticated extends AuthState {
  const AuthUnauthenticated();

  @override
  List<Object?> get props => const [];
}

/// توجد جلسة نشطة.
final class AuthAuthenticated extends AuthState {
  const AuthAuthenticated({required this.user});

  final User user;

  @override
  List<Object?> get props => [user];
}
