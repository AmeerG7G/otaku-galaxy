import '../../../../core/network/media_url.dart';

/// حالة التقييم — يبدأ دائماً بانتظار المراجعة، ثم يُنشر أو يُرفض.
enum ReviewStatus { pending, approved, rejected }

/// تقييم عميل لمنتج ضمن طلب مكتمل.
///
/// يأتي من جدول التقييمات على الخادم عبر [ReviewRepository]. لا يُنشر
/// التقييم قبل اعتماده من لوحة التحكم، والمرفوض يحمل سبباً يظهر للعميل
/// ليعدّله ويعيد إرساله.
class Review {
  const Review({
    required this.id,
    required this.productId,
    required this.productName,
    required this.orderId,
    required this.rating,
    required this.comment,
    this.photoUrl,
    required this.status,
    this.rejectionReason,
    required this.customerName,
    required this.createdAt,
    this.categoryId,
    this.categoryName,
  });

  final String id;
  final String productId;
  final String productName;
  final String orderId;

  /// من ١ إلى ٥.
  final int rating;
  final String comment;

  /// صورة اختيارية أرفقها العميل مع التقييم.
  final String? photoUrl;

  final ReviewStatus status;

  /// سبب الرفض — غير فارغ فقط عندما تكون الحالة [ReviewStatus.rejected].
  final String? rejectionReason;

  final String customerName;
  final DateTime createdAt;

  /// قسم المنتج — يرسله الخادم مع صور المجتمع فقط، ومفتاح الفلترة المستقر.
  final String? categoryId;
  final String? categoryName;

  bool get hasPhoto => photoUrl != null && photoUrl!.trim().isNotEmpty;

  Review copyWith({
    int? rating,
    String? comment,
    String? photoUrl,
    bool clearPhoto = false,
    ReviewStatus? status,
    String? rejectionReason,
    bool clearRejectionReason = false,
  }) {
    return Review(
      id: id,
      productId: productId,
      productName: productName,
      orderId: orderId,
      rating: rating ?? this.rating,
      comment: comment ?? this.comment,
      photoUrl: clearPhoto ? null : (photoUrl ?? this.photoUrl),
      status: status ?? this.status,
      rejectionReason: clearRejectionReason
          ? null
          : (rejectionReason ?? this.rejectionReason),
      customerName: customerName,
      createdAt: createdAt,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'productId': productId,
    'productName': productName,
    'orderId': orderId,
    'rating': rating,
    'comment': comment,
    'photoUrl': photoUrl,
    'status': status.name,
    'rejectionReason': rejectionReason,
    'customerName': customerName,
    'createdAt': createdAt.toIso8601String(),
  };

  factory Review.fromJson(Map<String, dynamic> json) => Review(
    id: json['id'] as String,
    productId: json['productId'] as String,
    productName: json['productName'] as String,
    orderId: json['orderId'] as String,
    rating: json['rating'] as int,
    comment: json['comment'] as String,
    photoUrl: resolveMediaUrl(json['photoUrl'] as String?),
    status: ReviewStatus.values.byName(json['status'] as String),
    rejectionReason: json['rejectionReason'] as String?,
    customerName: json['customerName'] as String,
    createdAt: DateTime.parse(json['createdAt'] as String),
    categoryId: json['categoryId'] as String?,
    categoryName: json['categoryName'] as String?,
  );
}
