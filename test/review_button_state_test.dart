// حالة زرّ «قيّم المنتج» — مشتقّة من حالة التقييم على الخادم.
//
// آلة الحالة المطلوبة:
//   لا تقييم  → الزرّ مفتوح («قيّم المنتج»)
//   pending   → مغلق («تقييمك قيد المراجعة»)
//   approved  → مغلق نهائياً («تقييمك منشور»)
//   rejected  → مفتوح من جديد («عدّل وأعد الإرسال»)
//
// [CRITICAL] كل حالة تُقرأ من المستودع عند فتح الشاشة، لا من علمٍ محليّ.
// الاختبار يُثبت ذلك بإعادة بناء الشاشة من الصفر لكل حالة: لا شيء يُحمل من
// تشغيلٍ سابق، تماماً كما يحدث بعد إعادة تشغيل التطبيق أو تسجيل خروجٍ
// ودخول. والحارس الأخير على الخادم — انظر `tests/review-eligibility-16h`.

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/features/cart/domain/entities/cart_item.dart';
import 'package:otaku_galaxy/features/orders/domain/entities/order.dart';
import 'package:otaku_galaxy/features/products/domain/entities/product.dart';
import 'package:otaku_galaxy/features/reviews/domain/entities/review.dart';
import 'package:otaku_galaxy/features/reviews/domain/repositories/review_repository.dart';
import 'package:otaku_galaxy/features/reviews/presentation/cubit/reviews_cubit.dart';
import 'package:otaku_galaxy/features/reviews/presentation/screens/rate_order_screen.dart';
import 'package:otaku_galaxy/features/auth/presentation/cubit/auth_cubit.dart';

import 'support/auth_stub.dart';

const _product = Product(
  id: 'p1',
  nameAr: 'مجسّم لوفي',
  descriptionAr: 'وصف',
  images: [],
  price: 25000,
);

final _order = Order(
  id: 'o1',
  number: '1001',
  province: 'بغداد',
  deliveryCost: 5000,
  fullAddress: 'الكرادة',
  phone: '+9647701234567',
  total: 30000,
  status: OrderStatus.completed,
  items: const [CartItem(product: _product)],
  canReview: true,
  reviewableProductCount: 1,
);

Review _review(ReviewStatus status) => Review(
  id: 'r1',
  productId: _product.id,
  productNames: _product.names,
  orderId: _order.id,
  rating: 5,
  comment: 'ممتاز',
  status: status,
  customerName: 'مدقق',
  createdAt: DateTime(2026, 9, 1),
);

/// مستودع يردّ بحالةٍ معلومة — يقف مقام الخادم.
class _StubReviews implements ReviewRepository {
  _StubReviews(this.current);

  Review? current;
  int findCalls = 0;

  /// عدد مرات تحميل تقييمات الحساب — الشاشة تقرأ حالتها من هنا الآن
  /// (`ReviewsCubit.load`) لا من `findReview` لكل منتج.
  int loadCalls = 0;

  @override
  Future<Review?> findReview({
    required String orderId,
    required String productId,
  }) async {
    findCalls += 1;
    return current;
  }

  @override
  Future<List<Review>> fetchMyReviews() async {
    loadCalls += 1;
    return current == null ? const [] : [current!];
  }
  @override
  Future<List<Review>> fetchApprovedReviewsForProduct(String productId) async =>
      const [];
  @override
  Future<List<Review>> fetchApprovedPhotoReviews({String? categoryId}) async =>
      const [];
  @override
  Future<Review> submitReview({
    required String orderId,
    required String productId,
    required String productName,
    required int rating,
    required String comment,
    List<String> photoUrls = const [],
  }) async => _review(ReviewStatus.pending);
  @override
  Future<Review> resubmitReview(
    String reviewId, {
    required int rating,
    required String comment,
    List<String> photoUrls = const [],
  }) async => _review(ReviewStatus.pending);
}

/// [CRITICAL] `runId` يجب أن يختلف بين «فتحتين» في اختبار واحد: بلا مفتاح
/// مختلف يعيد فلاتر استعمال نفس `State`، فلا يُستدعى `initState` ولا تُقرأ
/// الحالة من جديد — فيمرّ الاختبار لأن شيئاً لم يُعَد بناؤه، لا لأن الشاشة
/// سألت الخادم فعلاً.
Future<void> _pump(
  WidgetTester tester,
  _StubReviews repo, {
  String runId = 'run',
  String gender = 'male',
}) async {
  // `AuthCubit` موفَّر كما في جذر التطبيق: نصّ الزرّ يُصرَّف بجنس صاحب
  // الجلسة («قيّم» / «قيّمي»)، فبناءُ الشاشة بلا جلسة كان سيقيس صيغةً محايدة
  // لا يراها زبونٌ مسجَّل.
  final auth = stubAuthCubit(gender: gender);
  await auth.loadSession();

  await tester.pumpWidget(
    MultiBlocProvider(
      providers: [
        BlocProvider<ReviewsCubit>(create: (_) => ReviewsCubit(repo)),
        BlocProvider<AuthCubit>.value(value: auth),
      ],
      child: MaterialApp(
        theme: AppTheme.light,
        locale: const Locale('ar'),
        supportedLocales: const [Locale('ar')],
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        home: RateOrderScreen(key: ValueKey(runId), order: _order),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('لا تقييم بعد ← الزرّ مفتوح', (tester) async {
    await _pump(tester, _StubReviews(null));

    expect(find.text('قيّم المنتج'), findsOneWidget);
    expect(find.text('لم يُقيَّم بعد'), findsOneWidget);
    expect(find.text('تقييمك قيد المراجعة'), findsNothing);
  });

  testWidgets('[CRITICAL] قيد المراجعة ← الزرّ مغلق ولا إرسال ثانٍ', (
    tester,
  ) async {
    await _pump(tester, _StubReviews(_review(ReviewStatus.pending)));

    expect(find.text('تقييمك قيد المراجعة'), findsOneWidget);
    expect(find.text('قيّم المنتج'), findsNothing);
    expect(find.text('عدّل وأعد الإرسال'), findsNothing);
    // ولا زرّ إجراء أصلاً في البطاقة — لا شيء يُضغط ليُنشئ تقييماً ثانياً.
    expect(find.byType(AnimePrimaryButton), findsNothing);
  });

  testWidgets('[CRITICAL] معتمَد ← مغلق نهائياً', (tester) async {
    await _pump(tester, _StubReviews(_review(ReviewStatus.approved)));

    expect(find.text('تقييمك منشور — شكراً 💜'), findsOneWidget);
    expect(find.byType(AnimePrimaryButton), findsNothing);
  });

  testWidgets('[CRITICAL] مرفوض ← يُفتح من جديد', (tester) async {
    await _pump(tester, _StubReviews(_review(ReviewStatus.rejected)));

    expect(find.text('عدّل وأعد الإرسال'), findsOneWidget);
    expect(find.byType(AnimePrimaryButton), findsOneWidget);
    expect(find.text('تقييمك قيد المراجعة'), findsNothing);
  });

  testWidgets('[CRITICAL] الحالة تُقرأ من المستودع عند كل فتح', (tester) async {
    // لا علم محلي: نفس الشاشة تُبنى مرتين وتُسأل مرتين، والنتيجة تتبع
    // ما يقوله المستودع لا ما رآه المستخدم قبل قليل.
    final repo = _StubReviews(_review(ReviewStatus.pending));
    await _pump(tester, repo);
    expect(find.text('تقييمك قيد المراجعة'), findsOneWidget);
    expect(repo.loadCalls, 1);

    // «إعادة تشغيل»: المسؤول رفض التقييم بين الفتحتين.
    repo.current = _review(ReviewStatus.rejected);
    await _pump(tester, repo, runId: 'restart');

    expect(repo.loadCalls, 2, reason: 'الشاشة سألت الخادم من جديد');
    expect(find.text('عدّل وأعد الإرسال'), findsOneWidget);
    expect(find.text('تقييمك قيد المراجعة'), findsNothing);
  });

  testWidgets('الاعتماد بعد المراجعة يُغلق الزرّ في الفتحة التالية', (
    tester,
  ) async {
    final repo = _StubReviews(_review(ReviewStatus.pending));
    await _pump(tester, repo);
    expect(find.text('تقييمك قيد المراجعة'), findsOneWidget);

    repo.current = _review(ReviewStatus.approved);
    await _pump(tester, repo, runId: 'restart');
    expect(find.text('تقييمك منشور — شكراً 💜'), findsOneWidget);
    expect(find.byType(AnimePrimaryButton), findsNothing);
  });
}
