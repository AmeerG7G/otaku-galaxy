// مراجع صور التقييم: الخادم يخزّن مرجعاً (`/uploads/…`)، والتطبيق يعرض
// رابطاً مبنياً بأصل بيئته الحالية. الهوية هي المرجع؛ الرابط للعرض وحده.
//
// [CRITICAL] كان `Review` يحمل روابط العرض فقط، وشاشة التعديل تعيد إرسالها
// عند تصحيح تقييمٍ مرفوض. الخادم يرفض أي أصلٍ غير `PUBLIC_BASE_URL`، فمن
// المحاكي (`10.0.2.2`) أو شبكةٍ محلية كانت إعادة الإرسال تفشل بـ
// `INVALID_PHOTO_URL` على صورةٍ يملكها الزبون فعلاً. الآن `photoRefs` تُحفظ
// جنباً إلى جنب مع `photoUrls`، وهي وحدها ما يُرسَل.

import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/core/network/media_url.dart';
import 'package:otaku_galaxy/core/router/app_router.dart';
import 'package:otaku_galaxy/features/auth/presentation/cubit/auth_cubit.dart';
import 'package:otaku_galaxy/features/reviews/domain/entities/review.dart';
import 'package:otaku_galaxy/features/reviews/domain/repositories/review_repository.dart';
import 'package:otaku_galaxy/features/reviews/presentation/cubit/reviews_cubit.dart';

import 'support/auth_stub.dart';

const _ref = '/uploads/review/2026/09/0f1e2d3c-4b5a-4697-8877-665544332211.jpg';
const _external = 'https://cdn.example.com/photo.jpg';

Map<String, dynamic> _reviewJson({List<dynamic> photos = const [_ref]}) => {
  'id': 'r1',
  'productId': 'p1',
  'productName': 'مجسّم لوفي',
  'orderId': 'o1',
  'rating': 2,
  'comment': 'مرفوض سابقاً',
  'photoUrls': photos,
  'status': 'rejected',
  'rejectionReason': 'الصورة غير واضحة',
  'customerName': 'زبون',
  'createdAt': '2026-09-01T00:00:00.000Z',
};

/// مستودع يسجّل ما أُرسل إليه فعلاً.
class _RecordingReviews implements ReviewRepository {
  _RecordingReviews(this.existing);

  final Review existing;
  List<String>? resubmittedPhotos;

  @override
  Future<Review?> findReview({
    required String orderId,
    required String productId,
  }) async => existing;

  @override
  Future<List<Review>> fetchMyReviews() async => [existing];
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
  }) async => throw StateError('التقييم القائم يُعاد إرساله لا يُنشأ');

  @override
  Future<Review> resubmitReview(
    String reviewId, {
    required int rating,
    required String comment,
    List<String> photoUrls = const [],
  }) async {
    resubmittedPhotos = List.of(photoUrls);
    return existing.copyWith(status: ReviewStatus.pending, photoRefs: photoUrls);
  }
}

/// رواتر مصغّر يضم شاشة الكتابة وشاشة التأكيد التي تُستبدل بها بعد الإرسال.
class _ReviewRouter extends RootStackRouter {
  @override
  List<AutoRoute> get routes => [
    AutoRoute(
      initial: true,
      path: '/start',
      page: PageInfo(
        'StartPlaceholderRoute',
        builder: (_) => const Scaffold(body: SizedBox.shrink()),
      ),
    ),
    AutoRoute(path: '/write', page: WriteReviewRoute.page),
    AutoRoute(path: '/submitted', page: ReviewSubmittedRoute.page),
  ];

  @override
  RouteType get defaultRouteType => const RouteType.material();
}

Future<_ReviewRouter> _pumpWriteScreen(
  WidgetTester tester,
  _RecordingReviews repo,
) async {
  tester.view.physicalSize = const Size(390, 1600);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  final auth = stubAuthCubit(gender: 'male');
  await auth.loadSession();
  final router = _ReviewRouter();

  await tester.pumpWidget(
    MultiBlocProvider(
      providers: [
        BlocProvider<ReviewsCubit>(create: (_) => ReviewsCubit(repo)),
        BlocProvider<AuthCubit>.value(value: auth),
      ],
      child: MaterialApp.router(
        theme: AppTheme.light,
        locale: const Locale('ar'),
        supportedLocales: const [Locale('ar')],
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        routerConfig: router.config(),
      ),
    ),
  );
  await tester.pump();
  router.push(
    WriteReviewRoute(orderId: 'o1', productId: 'p1', productName: 'مجسّم لوفي'),
  );
  await tester.pumpAndSettle();
  return router;
}

void main() {
  final originalOrigin = mediaOrigin;
  tearDown(() => configureMediaOriginFromBaseUrl('$originalOrigin/api'));

  group('Review.fromJson يفصل المرجع عن رابط العرض', () {
    test('المرجع النسبي يُحفظ كما هو، والرابط يُحلّ بأصل الوسائط', () {
      final review = Review.fromJson(_reviewJson());
      expect(review.photoRefs, [_ref]);
      expect(review.photoUrls, ['$mediaOrigin$_ref']);
      expect(review.photoUrl, '$mediaOrigin$_ref');
    });

    test('الرابط الخارجي الكامل يمرّ في الاثنين بلا تغيير', () {
      final review = Review.fromJson(_reviewJson(photos: [_external, _ref]));
      expect(review.photoRefs, [_external, _ref]);
      expect(review.photoUrls, [_external, '$mediaOrigin$_ref']);
    });

    test('الفارغ يسقط من الاثنين فيبقى الترتيب واحداً', () {
      final review = Review.fromJson(_reviewJson(photos: ['', null, _ref, '  ']));
      expect(review.photoRefs, [_ref]);
      expect(review.photoUrls, ['$mediaOrigin$_ref']);
    });

    test('toJson يُخرج المراجع لا روابط العرض', () {
      final review = Review.fromJson(_reviewJson());
      expect(review.toJson()['photoUrls'], [_ref]);
    });

    test('[CRITICAL] تغيّر أصل البيئة يغيّر رابط العرض ولا يمسّ المرجع', () {
      configureMediaOriginFromBaseUrl('http://localhost:4000/api');
      final desktop = Review.fromJson(_reviewJson());
      configureMediaOriginFromBaseUrl('http://10.0.2.2:4000/api');
      final emulator = Review.fromJson(_reviewJson());

      expect(desktop.photoUrls, ['http://localhost:4000$_ref']);
      expect(emulator.photoUrls, ['http://10.0.2.2:4000$_ref']);
      expect(emulator.photoUrls, isNot(desktop.photoUrls));
      expect(emulator.photoRefs, desktop.photoRefs);
      expect(emulator.photoRefs, [_ref]);
    });

    test('المُنشئ بلا photoRefs يستعمل photoUrls — توافق مع المستدعين القدامى', () {
      final review = Review(
        id: 'r',
        productId: 'p',
        productName: 'n',
        orderId: 'o',
        rating: 5,
        comment: 'c',
        photoUrls: [_ref],
        status: ReviewStatus.pending,
        customerName: 'z',
        createdAt: DateTime(2026, 9, 1),
      );
      expect(review.photoRefs, [_ref]);
    });
  });

  group('شاشة التعديل تعرض بالرابط وتُرسل بالمرجع', () {
    testWidgets('[CRITICAL] من المحاكي: المعاينة بأصل 10.0.2.2 والإرسال بالمرجع النسبي', (
      tester,
    ) async {
      configureMediaOriginFromBaseUrl('http://10.0.2.2:4000/api');
      final repo = _RecordingReviews(Review.fromJson(_reviewJson()));
      final router = await _pumpWriteScreen(tester, repo);

      // الصورة القائمة تُعرض عبر رابطٍ محلولٍ بأصل هذه البيئة.
      final thumb = tester.widget<CustomerPhoto>(find.byType(CustomerPhoto));
      expect(thumb.url, 'http://10.0.2.2:4000$_ref');
      expect(find.text('تعديل التقييم'), findsOneWidget);

      // الزبون يعدّل التعليق ويعيد الإرسال.
      await tester.enterText(find.byType(TextField).first, 'صورة أوضح هذه المرة');
      await tester.tap(find.widgetWithText(AnimePrimaryButton, 'إعادة الإرسال'));
      await tester.pumpAndSettle();

      expect(repo.resubmittedPhotos, [_ref],
          reason: 'ما يُرسَل هو مرجع الخادم لا رابط العرض');
      expect(repo.resubmittedPhotos!.first, isNot(startsWith('http')));
      // وانتقلت الشاشة إلى تأكيد «بانتظار المراجعة».
      expect(router.current.name, ReviewSubmittedRoute.name);
    });
  });
}
