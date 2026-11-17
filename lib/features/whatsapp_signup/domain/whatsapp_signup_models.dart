/// نماذج التسجيل عبر واتساب — كما يرسلها الخادم (`/auth/register/whatsapp/*`).
library;

class WhatsAppSignupOptions {
  const WhatsAppSignupOptions({
    required this.enabled,
    this.businessNumber,
    this.ttlSeconds,
  });

  factory WhatsAppSignupOptions.fromJson(Map<String, dynamic> json) {
    final wa = json['whatsapp'];
    if (wa is! Map<String, dynamic> || wa['enabled'] != true) return disabled;
    return WhatsAppSignupOptions(
      enabled: true,
      businessNumber: wa['businessNumber'] as String?,
      ttlSeconds: (wa['ttlSeconds'] as num?)?.toInt(),
    );
  }

  static const disabled = WhatsAppSignupOptions(enabled: false);

  final bool enabled;
  final String? businessNumber;
  final int? ttlSeconds;
}

/// جلسةٌ بدأها هذا الجهاز. [secret] لا يغادر الجهاز إلا إلى الخادم نفسه.
class WhatsAppSignupSession {
  const WhatsAppSignupSession({
    required this.sessionId,
    required this.secret,
    required this.code,
    required this.waLink,
    required this.businessNumber,
    required this.expiresAt,
    required this.phone,
  });

  factory WhatsAppSignupSession.fromJson(
    Map<String, dynamic> json, {
    required String phone,
  }) => WhatsAppSignupSession(
    sessionId: json['sessionId'] as String,
    secret: json['secret'] as String,
    code: json['code'] as String,
    waLink: json['waLink'] as String,
    businessNumber: json['businessNumber'] as String,
    expiresAt: DateTime.parse(json['expiresAt'] as String),
    phone: (json['phone'] as String?) ?? phone,
  );

  final String sessionId;
  final String secret;
  final String code;
  final String waLink;
  final String businessNumber;
  final DateTime expiresAt;

  /// الرقم كما أدخله الزبون — لعرضه وحده.
  final String phone;

  Map<String, dynamic> toJson() => {
    'sessionId': sessionId,
    'secret': secret,
    'code': code,
    'waLink': waLink,
    'businessNumber': businessNumber,
    'expiresAt': expiresAt.toIso8601String(),
    'phone': phone,
  };
}

/// حالة الجلسة كما يحسمها الخادم — العميل لا يستنتجها من ساعته.
enum WhatsAppSignupPhase {
  pending,
  awaitingContact,
  verified,
  completed,
  expired,
  mismatch,
  phoneTaken,
  dead;

  static WhatsAppSignupPhase parse(Object? raw) => switch (raw) {
    'pending' => pending,
    'awaiting_contact' => awaitingContact,
    'verified' => verified,
    'completed' => completed,
    'expired' => expired,
    'mismatch' => mismatch,
    'phone_taken' => phoneTaken,
    _ => dead,
  };

  /// لا انتظار بعدها — الاستعلام يتوقّف.
  bool get isTerminal => this != pending && this != awaitingContact;
}

class WhatsAppSignupStatus {
  const WhatsAppSignupStatus({
    required this.phase,
    this.lastAttemptMismatched = false,
    this.completeBy,
  });

  factory WhatsAppSignupStatus.fromJson(Map<String, dynamic> json) =>
      WhatsAppSignupStatus(
        phase: WhatsAppSignupPhase.parse(json['status']),
        lastAttemptMismatched: json['lastAttemptMismatched'] == true,
        completeBy: json['completeBy'] is String
            ? DateTime.tryParse(json['completeBy'] as String)
            : null,
      );

  final WhatsAppSignupPhase phase;
  final bool lastAttemptMismatched;
  final DateTime? completeBy;
}
