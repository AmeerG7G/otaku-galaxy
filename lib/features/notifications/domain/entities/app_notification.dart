/// نوع الإشعار — يحدد الأيقونة واللون في الواجهة.
///
/// [NOTE] لا يوجد نوع لعيد الميلاد عمداً؛ يظهر كتجربة داخل التطبيق لا
/// كإشعار مستقل. ولا نوع لمنح النقاط نفسه: الرصيد يظهر في شاشة النقاط،
/// وإشعارٌ عند كل نقطة ضجيج.
///
/// [rewardClaimed] استثناءٌ مقصود: المطالبة بمزيّة مستوى تُنشئ التزاماً على
/// المتجر يُنفَّذ يدوياً (هدية تُسلَّم، أو خصم ينتظر الطلب القادم)، فلا يجوز
/// أن تمرّ بلا أثر يراه صاحبها. وهو نوع مستقل لا يُحشر في [promotion]: ذاك
/// تصنيف ترويجي معطَّل افتراضياً في تفضيلات الزبون، فكان إخفاءُ تأكيدٍ طلبه
/// بنفسه خلف مفتاح دعايةٍ أغلقه.
enum NotificationType {
  orderAccepted,
  orderRejected,
  deliveryUpdate,
  receiptReminder,
  reviewApproved,
  reviewRejected,
  backInStock,
  promotion,
  rewardClaimed,
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
