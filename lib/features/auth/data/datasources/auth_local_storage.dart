import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// تخزين الجلسة: التوكن في التخزين الآمن [FlutterSecureStorage]
/// وصورة المستخدم في ذاكرة التطبيق مع نسخة احتياطية آمنة.
class AuthLocalStorage {
  AuthLocalStorage();

  static const _tokenKey = 'auth_token';
  static const _userKey = 'auth_user';

  final FlutterSecureStorage _storage = const FlutterSecureStorage();

  String? _token;
  String? _userJson;

  /// قراءة الجلسة المحفوظة عند بدء التشغيل (تُستدعى مرة واحدة في DI).
  Future<void> load() async {
    _token = await _storage.read(key: _tokenKey);
    _userJson = await _storage.read(key: _userKey);
  }

  bool get isLoggedIn => _token != null && _token!.isNotEmpty;

  String? get token => _token;

  String? getUserJson() => _userJson;

  Future<void> saveSession(String token, String userJson) async {
    _token = token;
    _userJson = userJson;
    await _storage.write(key: _tokenKey, value: token);
    await _storage.write(key: _userKey, value: userJson);
  }

  Future<void> updateUser(String userJson) async {
    _userJson = userJson;
    await _storage.write(key: _userKey, value: userJson);
  }

  Future<void> logout() async {
    _token = null;
    _userJson = null;
    await _storage.delete(key: _tokenKey);
    await _storage.delete(key: _userKey);
  }
}
