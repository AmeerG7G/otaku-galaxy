import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../domain/whatsapp_signup_models.dart';

/// يحفظ الجلسة الجارية في التخزين الآمن — فلو أغلق النظامُ التطبيقَ وهو في
/// واتساب، تعود الشاشة إلى الجلسة نفسها بدل أن تبدأ من جديد.
///
/// [SECURITY] السرّ في التخزين الآمن وحده (كالتوكن)، ويُمسح عند الإكمال أو
/// الانتهاء أو الإلغاء.
abstract interface class WhatsAppSignupStore {
  Future<WhatsAppSignupSession?> read();
  Future<void> write(WhatsAppSignupSession session);
  Future<void> clear();
}

class SecureWhatsAppSignupStore implements WhatsAppSignupStore {
  const SecureWhatsAppSignupStore();

  static const _key = 'whatsapp_signup_session';
  static const _storage = FlutterSecureStorage();

  @override
  Future<WhatsAppSignupSession?> read() async {
    try {
      final raw = await _storage.read(key: _key);
      if (raw == null) return null;
      final json = jsonDecode(raw) as Map<String, dynamic>;
      final session = WhatsAppSignupSession.fromJson(
        json,
        phone: json['phone'] as String? ?? '',
      );
      return session;
    } catch (_) {
      await clear();
      return null;
    }
  }

  @override
  Future<void> write(WhatsAppSignupSession session) =>
      _storage.write(key: _key, value: jsonEncode(session.toJson()));

  @override
  Future<void> clear() async {
    try {
      await _storage.delete(key: _key);
    } catch (_) {}
  }
}

/// للاختبارات — ذاكرةٌ بلا منصّة.
class MemoryWhatsAppSignupStore implements WhatsAppSignupStore {
  WhatsAppSignupSession? value;

  @override
  Future<WhatsAppSignupSession?> read() async => value;

  @override
  Future<void> write(WhatsAppSignupSession session) async => value = session;

  @override
  Future<void> clear() async => value = null;
}
