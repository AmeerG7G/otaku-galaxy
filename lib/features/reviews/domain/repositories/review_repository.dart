import '../entities/review.dart';

/// واجهة مستودع التقييمات (تعريف فقط) — أي تنفيذ (محلي مؤقت أو خادم حقيقي
/// لاحقاً) يلتزم بها فلا تحتاج شاشات العرض أي تعديل عند استبدال المصدر.
abstract class ReviewRepository {
  /// كل تقييمات العميل الحالي (كل الحالات).
  Future<List<Review>> fetchMyReviews();

  /// التقييم الحالي لمنتج ضمن طلب معيّن، إن وُجد (تقييم واحد لكل منتج بكل طلب).
  Future<Review?> findReview({required String orderId, required String productId});

  /// التقييمات المنشورة (المعتمدة) لمنتج معيّن — تُعرض في تفاصيل المنتج.
  Future<List<Review>> fetchApprovedReviewsForProduct(String productId);

  /// كل التقييمات المعتمدة المصحوبة بصورة — تُغذّي شاشة المجتمع.
  /// صور المجتمع المعتمدة، مع فلترة اختيارية بقسم حقيقي.
  ///
  /// الفلترة تتم على الخادم قبل الحدّ الأعلى، فتشمل كامل البيانات لا
  /// الصفحة المحمَّلة فقط.
  Future<List<Review>> fetchApprovedPhotoReviews({String? categoryId});

  /// إرسال تقييم جديد.
  Future<Review> submitReview({
    required String orderId,
    required String productId,
    required String productName,
    required int rating,
    required String comment,
    String? photoUrl,
  });

  /// تعديل وإعادة إرسال تقييم مرفوض — يعود لحالة الانتظار.
  Future<Review> resubmitReview(
    String reviewId, {
    required int rating,
    required String comment,
    String? photoUrl,
  });
}
