class User {
  const User({
    required this.id,
    required this.username,
    required this.phone,
    this.avatarUrl,
    this.role,
    this.createdAt,
  });

  final String id;
  final String username;
  final String phone;
  final String? avatarUrl;

  /// نوع الحساب (`customer` / `admin`) من الخادم.
  final String? role;
  final DateTime? createdAt;

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id']?.toString() ?? '',
      username: json['username'] as String? ?? '',
      phone: json['phone'] as String? ?? '',
      avatarUrl: json['avatarUrl'] as String?,
      role: json['role'] as String?,
      createdAt: DateTime.tryParse(json['createdAt'] as String? ?? ''),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'username': username,
      'phone': phone,
      'avatarUrl': avatarUrl,
      'role': role,
      'createdAt': createdAt?.toIso8601String(),
    };
  }

  User copyWith({String? username, String? avatarUrl}) {
    return User(
      id: id,
      username: username ?? this.username,
      phone: phone,
      avatarUrl: avatarUrl ?? this.avatarUrl,
      role: role,
      createdAt: createdAt,
    );
  }
}
