import 'user.dart';

/// جلسة مصادقة ناجحة: التوكن + بيانات المستخدم من الخادم.
class AuthSession {
  const AuthSession({required this.token, required this.user});

  final String token;
  final User user;
}