// قواعد العمل التي أدخلها تصميم v2 — مطابقة الواجهة لما يحسبه الخادم.
//
// الهدف هنا ليس تكرار حساب الخادم، بل ضمان أن ما يعرضه التطبيق لا يخالفه:
// حدود المستويات، سقف خصم التوصيل، وقراءة الحقول الجديدة من المغلف.

import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/features/cart/domain/entities/cart_item.dart';
import 'package:otaku_galaxy/features/cart/presentation/cubit/cart_state.dart';
import 'package:otaku_galaxy/features/orders/domain/entities/order.dart';
import 'package:otaku_galaxy/core/l10n/gender.dart';
import 'package:otaku_galaxy/features/points/domain/entities/otaku_level.dart';
import 'package:otaku_galaxy/features/points/domain/repositories/points_repository.dart';
import 'package:otaku_galaxy/features/products/domain/entities/product.dart';
import 'package:otaku_galaxy/features/reviews/domain/entities/review.dart';
import 'package:otaku_galaxy/features/notifications/domain/entities/app_notification.dart';

Product _product({
  String id = 'p1',
  double price = 15000,
  bool promo = false,
  double promoAmount = 0,
}) {
  return Product(
    id: id,
    nameAr: 'منتج',
    descriptionAr: 'وصف',
    price: price,
    categoryId: 'c1',
    stock: 10,
    images: const [],
    hasDeliveryPromo: promo,
    deliveryPromoAmount: promoAmount,
  );
}

void main() {
  // عتبات المستويات (‎0/30/80/160) لم تعد تُحسب هنا.
  //
  // كانت `OtakuLevel` تحمل العتبات وتشتقّ المستوى من الرصيد، فكانت هذه
  // المجموعة تختبر منطق أعمال داخل التطبيق. بعد نقل السلّم إلى القاعدة صار
  // الخادم هو من يضع الزبون على السلّم، وحدودُ العتبات تُختبر هناك
  // (`backend/tests/galaxy-levels.test.ts`) على القيم الحقيقية.
  //
  // ما بقي مسؤوليةَ التطبيق شيئان: أن يقرأ ما أرسله الخادم كما هو، وأن
  // يختار صيغة الاسم العربية المناسبة لجنس القارئ — وهو قرار عرضٍ محض.
  group('otaku level is read from the server, not derived', () {
    Map<String, dynamic> levelJson(
      int number,
      String key,
      int points, {
      String? male,
      String? female,
      String? neutral,
    }) => {
      'key': key,
      'number': number,
      'nameMale': male ?? 'مستوى $number',
      'nameFemale': female ?? 'مستوى $number',
      'nameNeutral': neutral ?? 'مستوى $number',
      'requiredPoints': points,
      'reward': 'مزية $number',
      'rewardKind': 'gift',
    };

    test('parses a level exactly as the server sent it', () {
      final level = OtakuLevel.fromJson(
        levelJson(
          5,
          'champion',
          600,
          male: 'بطل المجرة',
          female: 'بطلة المجرة',
          neutral: 'مستوى البطولة',
        ),
      );
      expect(level.key, 'champion');
      expect(level.number, 5);
      expect(level.threshold, 600);
      expect(level.reward, 'مزية 5');
      expect(level.nameMale, 'بطل المجرة');
      expect(level.nameFemale, 'بطلة المجرة');
      expect(level.nameNeutral, 'مستوى البطولة');
    });

    test('picks the Arabic form that matches the reader', () {
      final level = OtakuLevel.fromJson(
        levelJson(
          5,
          'champion',
          600,
          male: 'بطل المجرة',
          female: 'بطلة المجرة',
          neutral: 'مستوى البطولة',
        ),
      );
      expect(level.nameFor(AppGender.male), 'بطل المجرة');
      expect(level.nameFor(AppGender.female), 'بطلة المجرة');
      // [CRITICAL] المجهول لا يُخاطَب بالمذكّر — له صيغته المحايدة.
      expect(level.nameFor(AppGender.unknown), 'مستوى البطولة');
    });

    test('falls back to the masculine form when the others are missing', () {
      // ردٌّ قديم بلا الصيغتين: نصٌّ ظاهر أفضل من فراغ.
      final level = OtakuLevel.fromJson({
        'key': 'legend',
        'number': 7,
        'nameMale': 'أسطورة المجرة',
        'requiredPoints': 1000,
      });
      expect(level.nameFor(AppGender.female), 'أسطورة المجرة');
      expect(level.nameFor(AppGender.unknown), 'أسطورة المجرة');
    });

    test('summary carries the ladder and the server-computed placement', () {
      final summary = PointsSummary.fromJson({
        'balance': 150,
        'activity': const [],
        'levels': [
          levelJson(1, 'beginner', 0),
          levelJson(2, 'explorer', 100),
          levelJson(3, 'voyager', 250),
        ],
        'level': levelJson(2, 'explorer', 100),
        'nextLevel': levelJson(3, 'voyager', 250),
        'pointsToNextLevel': 100,
        'levelProgress': 0.33,
      });

      expect(summary.balance, 150);
      expect(summary.levels, hasLength(3));
      expect(summary.level?.threshold, 100);
      expect(summary.nextLevel?.threshold, 250);
      expect(summary.pointsToNextLevel, 100);
      expect(summary.levelProgress, closeTo(0.33, 1e-9));
    });

    test('a top-level customer has no next level', () {
      final summary = PointsSummary.fromJson({
        'balance': 1000,
        'levels': [levelJson(7, 'legend', 1000)],
        'level': levelJson(7, 'legend', 1000),
        'nextLevel': null,
        'pointsToNextLevel': 0,
        'levelProgress': 1,
      });
      expect(summary.nextLevel, isNull);
      expect(summary.pointsToNextLevel, 0);
      expect(summary.levelProgress, 1);
    });

    test('an empty payload yields no level instead of an invented one', () {
      final summary = PointsSummary.fromJson(const {});
      expect(summary.level, isNull);
      expect(summary.levels, isEmpty);
      expect(summary.balance, 0);
      expect(summary.rewards, isEmpty);
    });

    test('reward state is read from the server, never derived locally', () {
      final summary = PointsSummary.fromJson({
        'balance': 500,
        'levels': const [],
        'rewards': [
          {
            'levelKey': 'explorer',
            'requiredPoints': 100,
            'kind': 'discount',
            'percent': 3,
            'capAmount': 5000,
            'unlocked': true,
            'claimed': true,
            'consumed': false,
            'claimable': false,
            'claimedAt': '2026-01-01T00:00:00.000Z',
          },
          {
            'levelKey': 'legend',
            'requiredPoints': 1000,
            'kind': 'gift',
            'giftAmount': 25000,
            'unlocked': false,
            'claimed': false,
            'consumed': false,
            'claimable': false,
          },
        ],
      });

      final explorer = summary.rewards.first;
      expect(explorer.isDiscount, isTrue);
      expect(explorer.percent, 3);
      expect(explorer.capAmount, 5000);
      // مطالَب بها ولم تُصرف — «جاهزة»، ولا زرّ مطالبة ثانٍ.
      expect(explorer.isReady, isTrue);
      expect(explorer.claimable, isFalse);

      final legend = summary.rewards.last;
      expect(legend.isGift, isTrue);
      expect(legend.giftAmount, 25000);
      // [CRITICAL] مغلقة: التطبيق لا يقرّر الأهلية ولو كان الرصيد أمامه.
      expect(legend.unlocked, isFalse);
      expect(legend.claimable, isFalse);
    });
  });

  group('cart mirrors the server delivery-promo rule', () {
    test('no promo products means no discount', () {
      const state = CartLoaded(items: []);
      expect(state.deliveryPromoTotal, 0);
      expect(state.deliveryDiscountFor(4000), 0);
    });

    test('promo is multiplied by quantity', () {
      final state = CartLoaded(
        items: [
          CartItem(
            product: _product(promo: true, promoAmount: 1000),
            quantity: 3,
          ),
        ],
      );
      expect(state.deliveryPromoTotal, 3000);
      expect(state.deliveryDiscountFor(4000), 3000);
    });

    test('ineligible products contribute nothing', () {
      final state = CartLoaded(
        items: [CartItem(product: _product(), quantity: 5)],
      );
      expect(state.deliveryDiscountFor(4000), 0);
    });

    test('discount is capped at the delivery fee', () {
      final state = CartLoaded(
        items: [
          CartItem(
            product: _product(promo: true, promoAmount: 1000),
            quantity: 9,
          ),
        ],
      );
      expect(state.deliveryPromoTotal, 9000);
      expect(state.deliveryDiscountFor(4000), 4000);
    });

    test('a zero delivery fee yields no discount', () {
      final state = CartLoaded(
        items: [
          CartItem(
            product: _product(promo: true, promoAmount: 1000),
            quantity: 2,
          ),
        ],
      );
      expect(state.deliveryDiscountFor(0), 0);
    });
  });

  group('order reads the server delivery discount', () {
    Order parse(Map<String, dynamic> extra) => Order.fromJson({
      'id': 'o1',
      'status': 'COMPLETED',
      'deliveryFee': 4000,
      'total': 16000,
      'items': <dynamic>[],
      ...extra,
    });

    test('free delivery when the discount covers the fee', () {
      final order = parse({'deliveryDiscount': 4000});
      expect(order.deliveryDiscount, 4000);
      expect(order.payableDelivery, 0);
      expect(order.isFreeDelivery, isTrue);
    });

    test('partial discount leaves a payable remainder', () {
      final order = parse({'deliveryDiscount': 1000});
      expect(order.payableDelivery, 3000);
      expect(order.isFreeDelivery, isFalse);
    });

    test('a missing field defaults to no discount', () {
      final order = parse({});
      expect(order.deliveryDiscount, 0);
      expect(order.payableDelivery, 4000);
      expect(order.isFreeDelivery, isFalse);
    });

    test('a zero-fee order is not reported as free delivery', () {
      final order = parse({'deliveryFee': 0, 'deliveryDiscount': 0});
      expect(order.isFreeDelivery, isFalse);
    });
  });

  group('community photos carry their category', () {
    Review parse(Map<String, dynamic> extra) => Review.fromJson({
      'id': 'r1',
      'productId': 'p1',
      'productName': 'منتج',
      'orderId': 'o1',
      'rating': 5,
      'comment': 'ممتاز',
      'status': 'approved',
      'customerName': 'عميل',
      'createdAt': '2026-08-24T00:00:00.000Z',
      ...extra,
    });

    test('category id and name are read from the envelope', () {
      final review = parse({'categoryId': 'c9', 'categoryName': 'حقائب'});
      expect(review.categoryId, 'c9');
      expect(review.categoryName, 'حقائب');
    });

    test('reviews outside the community feed simply have no category', () {
      final review = parse({});
      expect(review.categoryId, isNull);
      expect(review.categoryName, isNull);
    });
  });

  group('notifications carry a destination', () {
    test('order notifications expose the order id', () {
      final n = AppNotification.fromJson({
        'id': 'n1',
        'type': 'receiptReminder',
        'title': 'تم استلام طلبك',
        'body': 'شاركنا رأيك',
        'createdAt': '2026-08-24T00:00:00.000Z',
        'read': false,
        'orderId': 'o7',
      });
      expect(n.orderId, 'o7');
      expect(n.productId, isNull);
      // الوجهة تبقى بعد تعليمه مقروءاً.
      expect(n.copyWith(read: true).orderId, 'o7');
    });

    test('a notification without a destination stays null', () {
      final n = AppNotification.fromJson({
        'id': 'n2',
        'type': 'promotion',
        'title': 'خصومات',
        'body': 'تشكيلة جديدة',
        'createdAt': '2026-08-24T00:00:00.000Z',
        'read': false,
      });
      expect(n.orderId, isNull);
      expect(n.productId, isNull);
      expect(n.reviewId, isNull);
    });
  });
}
