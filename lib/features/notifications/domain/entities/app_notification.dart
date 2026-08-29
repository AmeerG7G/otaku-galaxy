/// نوع الإشعار — يحدد الأيقونة واللون في الواجهة.
///
/// [NOTE] لا يوجد نوع لنقاط المجرّة ولا لعيد الميلاد ضمن تصنيفات الإشعارات
/// عمداً؛ عيد الميلاد يظهر كتجربة داخل التطبيق لا كإشعار مستقل.
enum NotificationType {
  orderAccepted,
  orderRejected,
  deliveryUpdate,
  receiptReminder,
  reviewApproved,
  reviewRejected,
  backInStock,
  promotion,
}

/// إشعار داخل التطبيق.
///
/// تُنشئه خدمات الخادم عند تغيّر حالة الطلب أو مراجعة التقييم، ويُقرأ عبر
/// [NotificationRepository]. إشعارات الدفع (push) لم تُفعَّل بعد.
class AppNotification {
  const AppNotification({
    required this.id,
    required this.type,
    required this.title,
    required this.body,
    required this.createdAt,
    this.read = false,
    this.orderId,
    this.reviewId,
    this.productId,
  });

  final String id;
  final NotificationType type;
  final String title;
  final String body;
  final DateTime createdAt;
  final bool read;

  /// وجهة الإشعار — يفتحها التطبيق عند الضغط عليه (طلب/تقييم/منتج).
  final String? orderId;
  final String? reviewId;
  final String? productId;

  AppNotification copyWith({bool? read}) => AppNotification(
    id: id,
    type: type,
    title: title,
    body: body,
    createdAt: createdAt,
    read: read ?? this.read,
    orderId: orderId,
    reviewId: reviewId,
    productId: productId,
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'type': type.name,
    'title': title,
    'body': body,
    'createdAt': createdAt.toIso8601String(),
    'read': read,
  };

  factory AppNotification.fromJson(Map<String, dynamic> json) =>
      AppNotification(
        id: json['id'] as String,
        type: NotificationType.values.byName(json['type'] as String),
        title: json['title'] as String,
        body: json['body'] as String,
        createdAt: DateTime.parse(json['createdAt'] as String),
        read: json['read'] as bool? ?? false,
        orderId: json['orderId'] as String?,
        reviewId: json['reviewId'] as String?,
        productId: json['productId'] as String?,
      );
}
