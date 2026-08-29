// قواعد العمل التي أدخلها تصميم v2 — مطابقة الواجهة لما يحسبه الخادم.
//
// الهدف هنا ليس تكرار حساب الخادم، بل ضمان أن ما يعرضه التطبيق لا يخالفه:
// حدود المستويات، سقف خصم التوصيل، وقراءة الحقول الجديدة من المغلف.

import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/features/cart/domain/entities/cart_item.dart';
import 'package:otaku_galaxy/features/cart/presentation/cubit/cart_state.dart';
import 'package:otaku_galaxy/features/orders/domain/entities/order.dart';
import 'package:otaku_galaxy/features/points/domain/entities/otaku_level.dart';
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
    name: 'منتج',
    description: 'وصف',
    price: price,
    categoryId: 'c1',
    stock: 10,
    images: const [],
    hasDeliveryPromo: promo,
    deliveryPromoAmount: promoAmount,
  );
}

void main() {
  group('otaku levels follow the v2 thresholds', () {
    // حدود التصميم: ‎0 / 30 / 80 / 160.
    test('boundaries land on the expected level', () {
      expect(OtakuLevel.forPoints(0), OtakuLevel.newcomer);
      expect(OtakuLevel.forPoints(29), OtakuLevel.newcomer);
      expect(OtakuLevel.forPoints(30), OtakuLevel.active);
      expect(OtakuLevel.forPoints(79), OtakuLevel.active);
      expect(OtakuLevel.forPoints(80), OtakuLevel.golden);
      expect(OtakuLevel.forPoints(159), OtakuLevel.golden);
      expect(OtakuLevel.forPoints(160), OtakuLevel.legend);
      expect(OtakuLevel.forPoints(10000), OtakuLevel.legend);
    });

    test('a single received order (+20) does not reach level two', () {
      expect(OtakuLevel.forPoints(20), OtakuLevel.newcomer);
      expect(OtakuLevel.forPoints(20).pointsToNext(20), 10);
    });

    test('progress stays within bounds at the top level', () {
      expect(OtakuLevel.legend.progress(1000), lessThanOrEqualTo(1));
      expect(OtakuLevel.legend.pointsToNext(1000), 0);
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
