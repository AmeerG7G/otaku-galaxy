import '../../../../core/constants/api_endpoints.dart';
import '../../../../core/network/api_client.dart';
import '../../domain/entities/review.dart';
import '../../domain/repositories/review_repository.dart';

/// تنفيذ [ReviewRepository] عبر الـ API الحقيقي.
///
/// يحلّ محل التخزين المحلي: التقييمات تُحفظ على الخادم وتمرّ بمراجعة إدارية
/// قبل النشر، وشاشة المجتمع تقرأ الصور المعتمدة من الخادم مباشرة.
class ApiReviewRepository implements ReviewRepository {
  ApiReviewRepository({ApiClient? api}) : _api = api ?? ApiClient();

  final ApiClient _api;

  List<Review> _mapList(dynamic data) {
    return (data as List? ?? const [])
        .map((e) => Review.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  @override
  Future<List<Review>> fetchMyReviews() async {
    return _mapList(await _api.get(ApiEndpoints.reviews));
  }

  @override
  Future<Review?> findReview({
    required String orderId,
    required String productId,
  }) async {
    final data = await _api.get(
      ApiEndpoints.findReview,
      query: {'orderId': orderId, 'productId': productId},
    );
    if (data == null) return null;
    return Review.fromJson(data as Map<String, dynamic>);
  }

  @override
  Future<List<Review>> fetchApprovedReviewsForProduct(String productId) async {
    return _mapList(
      await _api.get('${ApiEndpoints.productReviews}$productId/reviews'),
    );
  }

  @override
  Future<List<Review>> fetchApprovedPhotoReviews({String? categoryId}) async {
    return _mapList(
      await _api.get(
        ApiEndpoints.communityPhotos,
        query: categoryId == null ? null : {'categoryId': categoryId},
      ),
    );
  }

  @override
  Future<Review> submitReview({
    required String orderId,
    required String productId,
    required String productName,
    required int rating,
    required String comment,
    List<String> photoUrls = const [],
  }) async {
    // اسم المنتج لقطة يأخذها الخادم من الطلب نفسه، فلا نرسله.
    final data = await _api.post(
      ApiEndpoints.reviews,
      body: {
        'orderId': orderId,
        'productId': productId,
        'rating': rating,
        'comment': comment,
        // تُرسل دائماً — المصفوفة الفارغة في إعادة الإرسال تعني «أزل الصور»،
        // وإسقاط المفتاح كان سيُبقي الصور القديمة على الخادم.
        'photoUrls': photoUrls,
      },
    );
    return Review.fromJson(data as Map<String, dynamic>);
  }

  @override
  Future<Review> resubmitReview(
    String reviewId, {
    required int rating,
    required String comment,
    List<String> photoUrls = const [],
  }) async {
    final data = await _api.patch(
      '${ApiEndpoints.reviewItem}$reviewId',
      body: {
        'rating': rating,
        'comment': comment,
        // تُرسل دائماً — المصفوفة الفارغة في إعادة الإرسال تعني «أزل الصور»،
        // وإسقاط المفتاح كان سيُبقي الصور القديمة على الخادم.
        'photoUrls': photoUrls,
      },
    );
    return Review.fromJson(data as Map<String, dynamic>);
  }
}
