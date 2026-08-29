import 'package:flutter_bloc/flutter_bloc.dart';

import '../../domain/entities/review.dart';
import '../../domain/repositories/review_repository.dart';

/// حالة شاشات التقييمات.
class ReviewsState {
  const ReviewsState({
    this.reviews = const [],
    this.loading = false,
    this.error,
  });

  final List<Review> reviews;
  final bool loading;
  final String? error;

  ReviewsState copyWith({
    List<Review>? reviews,
    bool? loading,
    String? error,
    bool clearError = false,
  }) => ReviewsState(
    reviews: reviews ?? this.reviews,
    loading: loading ?? this.loading,
    error: clearError ? null : (error ?? this.error),
  );
}

/// يدير تقييمات العميل: الإرسال، إعادة الإرسال بعد الرفض، وقراءة الحالات.
///
/// نقاط المجرّة تُمنح عند اعتماد التقييم فقط: تقييم منشور = +١، ومع صورة
/// = +٥ إجمالاً (وليس ١+٥). المنح يتم مرة واحدة لكل تقييم.
class ReviewsCubit extends Cubit<ReviewsState> {
  ReviewsCubit(this._reviews) : super(const ReviewsState());

  final ReviewRepository _reviews;

  /// معرّفات التقييمات التي مُنحت نقاطها بالفعل (حماية من المنح المكرر).

  Future<void> load() async {
    emit(state.copyWith(loading: true, clearError: true));
    try {
      final all = await _reviews.fetchMyReviews();
      emit(state.copyWith(reviews: all, loading: false));
    } catch (e) {
      emit(state.copyWith(loading: false, error: e.toString()));
    }
  }

  /// يمسح تقييمات الحساب عند تسجيل الخروج.
  ///
  /// الـCubit مفرد (singleton)، فبقاء التقييمات بعد الخروج يعرضها لحساب
  /// آخر يسجّل الدخول بعده — خصوصاً لافتات حالة الصور في شاشة المجتمع.
  void clear() => emit(const ReviewsState());

  Future<Review?> reviewFor({
    required String orderId,
    required String productId,
  }) => _reviews.findReview(orderId: orderId, productId: productId);

  Future<void> submit({
    required String orderId,
    required String productId,
    required String productName,
    required int rating,
    required String comment,
    String? photoUrl,
  }) async {
    await _reviews.submitReview(
      orderId: orderId,
      productId: productId,
      productName: productName,
      rating: rating,
      comment: comment,
      photoUrl: photoUrl,
    );
    await load();
  }

  Future<void> resubmit(
    String reviewId, {
    required int rating,
    required String comment,
    String? photoUrl,
  }) async {
    await _reviews.resubmitReview(
      reviewId,
      rating: rating,
      comment: comment,
      photoUrl: photoUrl,
    );
    await load();
  }

}
