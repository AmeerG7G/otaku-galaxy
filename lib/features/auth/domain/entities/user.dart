import '../../../../core/network/media_url.dart';

class User {
  const User({
    required this.id,
    required this.username,
    required this.phone,
    this.avatarRef,
    this.role,
    this.isPhoneVerified = true,
    this.createdAt,
  });

  final String id;
  final String username;
  final String phone;

  /// مرجع الصورة **كما يخزّنه الخادم** — نسبي (`/uploads/...`) أو رابط
  /// خارجي كامل.
  ///
  /// [CRITICAL] هذا ما يُحفَظ ويُنقَل، لا الرابط المطلق.
  ///
  /// خبْزُ الأصل في القيمة المحفوظة هو نفس العطل الذي أُصلح في قاعدة
  /// البيانات (هجرة 021): الأصل يختلف باختلاف العميل والشبكة، فقيمةٌ مطلقة
  /// تُحفظ على المحاكي اليوم تصير رابطاً ميتاً على هاتف حقيقي غداً — وتنجو
  /// من إعادة التشغيل لأنها على القرص.
  final String? avatarRef;

  /// الرابط الجاهز للتحميل — يُبنى من الأصل الحالي عند كل قراءة.
  ///
  /// الاشتقاق عند القراءة لا عند التحليل: هكذا تتبع الصورةُ الأصلَ الفعّال
  /// الآن، حتى لو حُفظت الجلسة على شبكة أخرى.
  String? get avatarUrl => resolveMediaUrl(avatarRef);

  /// نوع الحساب (`customer` / `admin`) من الخادم.
  final String? role;

  /// هل أثبت المستخدم ملكية رقمه؟
  ///
  /// الافتراضي `true` لأن الجلسات المحفوظة قبل إضافة الحقل لا تحمله، ووجود
  /// جلسة أصلاً يعني أن الخادم قبِلها — فلا نُخرج مستخدماً قائماً لغياب حقل.
  final bool isPhoneVerified;

  final DateTime? createdAt;

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id']?.toString() ?? '',
      username: json['username'] as String? ?? '',
      phone: json['phone'] as String? ?? '',
      // يُخزَّن كما وصل — التحويل للعرض يقع في `avatarUrl`.
      avatarRef: json['avatarUrl'] as String?,
      role: json['role'] as String?,
      isPhoneVerified: json['isPhoneVerified'] as bool? ?? true,
      createdAt: DateTime.tryParse(json['createdAt'] as String? ?? ''),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'username': username,
      'phone': phone,
      // المرجع النسبي هو ما يُحفظ؛ لا أصل مطلق يدخل التخزين المحلي.
      'avatarUrl': avatarRef,
      'role': role,
      'isPhoneVerified': isPhoneVerified,
      'createdAt': createdAt?.toIso8601String(),
    };
  }

  /// [avatarRef] هو المرجع كما يعيده الخادم — لا رابط معروض.
  User copyWith({String? username, String? avatarRef}) {
    return User(
      id: id,
      username: username ?? this.username,
      phone: phone,
      avatarRef: avatarRef ?? this.avatarRef,
      role: role,
      isPhoneVerified: isPhoneVerified,
      createdAt: createdAt,
    );
  }
}

