// فائض خصم التوصيل من جهة التطبيق.
//
// الفائض مفهومٌ محاسبي للمتجر: ما تجاوز رسوم التوصيل من ترويج المنتجات.
// التطبيق لا يعرفه ولا يعرضه ولا يستفيد منه الزبون بأي صورة. ما يخصّ التطبيق
// أمران فقط:
//
//   ١. المعاينة تعرض الخصم **مسقوفاً** لا الخام — وإلا وعد الزبون بخصمٍ
//      أكبر مما سيناله فعلاً، وهو أسوأ من ألّا يُعرض شيء.
//   ٢. الإجمالي المعروض لا يُنقص بالخام أبداً.
//
// [CRITICAL] المعاينة ليست مصدر الحقيقة: الخادم يعيد الحساب عند الإنشاء
// (`orderRepo.create`)، وجسم الطلب لا يحمل مبلغاً واحداً. هذه الاختبارات
// تحرس تطابق المعاينة مع قاعدة الخادم، لا صلاحيتها بديلاً عنه.

import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/features/cart/domain/entities/cart_item.dart';
import 'package:otaku_galaxy/features/cart/presentation/cubit/cart_state.dart';
import 'package:otaku_galaxy/features/orders/domain/entities/order.dart';
import 'package:otaku_galaxy/features/orders/domain/entities/order_data.dart';
import 'package:otaku_galaxy/features/products/domain/entities/product.dart';

/// رسوم مثال العمل.
const _fee = 5000.0;
const _price = 15000.0;

Product _product({
  String id = 'p1',
  double price = _price,
  bool promo = false,
  double promoAmount = 0,
}) => Product(
  id: id,
  nameAr: 'منتج',
  descriptionAr: 'وصف',
  price: price,
  categoryId: 'c1',
  stock: 500,
  images: const [],
  hasDeliveryPromo: promo,
  deliveryPromoAmount: promoAmount,
);

CartLoaded _cart(List<CartItem> items) => CartLoaded(items: items);

OrderData _orderData(CartLoaded cart, {double fee = _fee}) => OrderData(
  governorateId: 'g1',
  province: 'بغداد',
  deliveryCost: fee,
  fullAddress: 'الكرادة',
  phone: '07700000000',
  items: cart.items,
  deliveryDiscount: cart.deliveryDiscountFor(fee),
);

void main() {
  group('الحالة الإلزامية في المعاينة', () {
    test('[CRITICAL] ٦ قطع × ١٬٠٠٠ ورسوم ٥٬٠٠٠ ⇒ تُعرض ٥٬٠٠٠ لا ٦٬٠٠٠', () {
      final cart = _cart([
        CartItem(
          product: _product(promo: true, promoAmount: 1000),
          quantity: 6,
        ),
      ]);

      // الخام موجودٌ في الحالة، لكنه ليس ما يُعرض.
      expect(cart.deliveryPromoTotal, 6000);
      expect(cart.deliveryDiscountFor(_fee), 5000);

      final data = _orderData(cart);
      expect(data.deliveryDiscount, 5000);
      expect(data.payableDelivery, 0);
      // [CRITICAL] الفائض (١٬٠٠٠) لم ينزل عن سعر المنتجات ولا عن الإجمالي.
      expect(data.productsTotal, _price * 6);
      expect(data.total, _price * 6);
    });
  });

  group('تركيبات المنتجات المتعددة', () {
    test('أ×٤ + ب×٢ ⇒ الخام ٥٬٠٠٠ بالضبط، توصيل صفر بلا فائض', () {
      final cart = _cart([
        CartItem(
          product: _product(id: 'a', promo: true, promoAmount: 1000),
          quantity: 4,
        ),
        CartItem(
          product: _product(id: 'b', promo: true, promoAmount: 500),
          quantity: 2,
        ),
      ]);
      expect(cart.deliveryPromoTotal, 5000);
      expect(cart.deliveryDiscountFor(_fee), 5000);
      expect(_orderData(cart).payableDelivery, 0);
    });

    test('أ×٦ + ب×٢ ⇒ الخام ٧٬٠٠٠، والمعروض ٥٬٠٠٠', () {
      final cart = _cart([
        CartItem(
          product: _product(id: 'a', promo: true, promoAmount: 1000),
          quantity: 6,
        ),
        CartItem(
          product: _product(id: 'b', promo: true, promoAmount: 500),
          quantity: 2,
        ),
      ]);
      expect(cart.deliveryPromoTotal, 7000);
      expect(cart.deliveryDiscountFor(_fee), 5000);

      final data = _orderData(cart);
      expect(data.payableDelivery, 0);
      // الفائض ٢٬٠٠٠ لا أثر له على ما يدفعه الزبون.
      expect(data.total, _price * 8);
    });

    test('منتج بلا ترويج مع آخر مروَّج — المساهمة من المروَّج وحده', () {
      final cart = _cart([
        CartItem(
          product: _product(id: 'a', promo: true, promoAmount: 1000),
          quantity: 2,
        ),
        CartItem(product: _product(id: 'plain'), quantity: 9),
      ]);
      expect(cart.deliveryPromoTotal, 2000);
      expect(_orderData(cart).payableDelivery, _fee - 2000);
    });
  });

  group('ثوابت المعاينة', () {
    for (final qty in const [0, 1, 5, 6, 50, 1000]) {
      test('[CRITICAL] الثوابت تصمد عند $qty قطعة', () {
        final cart = _cart([
          if (qty > 0)
            CartItem(
              product: _product(promo: true, promoAmount: 1000),
              quantity: qty,
            ),
        ]);
        final shown = cart.deliveryDiscountFor(_fee);
        final data = _orderData(cart);

        expect(shown, lessThanOrEqualTo(_fee));
        expect(data.payableDelivery, greaterThanOrEqualTo(0));
        // الإجمالي لا يقلّ عن سعر المنتجات: الفائض لا يخصم منه شيئاً.
        expect(data.total, greaterThanOrEqualTo(data.productsTotal));
        expect(data.productsTotal, _price * qty);
      });
    }

    test('رسوم صفر ⇒ لا خصم ولا توصيل سالب', () {
      final cart = _cart([
        CartItem(
          product: _product(promo: true, promoAmount: 1000),
          quantity: 6,
        ),
      ]);
      final data = _orderData(cart, fee: 0);
      expect(data.deliveryDiscount, 0);
      expect(data.payableDelivery, 0);
      expect(data.total, _price * 6);
    });
  });

  group('جسم الطلب لا يحمل مالاً', () {
    test('[CRITICAL] لا مبلغ يُرسل إلى الخادم — لا خصم ولا إجمالي', () {
      final cart = _cart([
        CartItem(
          product: _product(promo: true, promoAmount: 1000),
          quantity: 6,
        ),
      ]);
      final body = _orderData(cart).toJson();

      for (final key in const [
        'deliveryDiscount',
        'deliveryDiscountExcess',
        'excessDeliveryDiscount',
        'finalDeliveryCharge',
        'deliveryFee',
        'deliveryCost',
        'discount',
        'total',
        'productsTotal',
        'items',
      ]) {
        expect(body.containsKey(key), isFalse, reason: '$key لا يُرسَل');
      }
      // ما يُرسل: العنوان والمحافظة والهاتف، وأسعار الوحدة التي راجعها الزبون
      // (CA-14، الخيار أ) — فحصٌ يرفض به الخادم سعراً تغيّر، لا مبلغٌ يُحتسب منه
      // شيء: السعر المحفوظ سعر الخادم.
      expect(body.keys.toSet(), {'governorateId', 'fullAddress', 'phone', 'expectedPrices'});
      expect(body['expectedPrices'], [
        {'productId': 'p1', 'unitPrice': _price},
      ]);
    });
  });

  group('الطلب المُعاد من الخادم', () {
    Order parse(Map<String, dynamic> extra) => Order.fromJson({
      'id': 'o1',
      'number': '1001',
      'status': 'PENDING_ADMIN_CONFIRMATION',
      'province': 'بغداد',
      'deliveryFee': _fee,
      'fullAddress': 'الكرادة',
      'phone': '07700000000',
      'productsTotal': _price * 6,
      'discount': 0,
      'total': _price * 6,
      'createdAt': '2026-01-01T00:00:00Z',
      'items': const [],
      ...extra,
    });

    test('يقرأ خصم التوصيل المسقوف كما أرسله الخادم', () {
      final order = parse({'deliveryDiscount': 5000});
      expect(order.deliveryDiscount, 5000);
    });

    test('[CRITICAL] حقل الفائض — إن ظهر يوماً — يُتجاهل ولا يمسّ الإجمالي', () {
      // حارسُ انحدار: لو سُرّب الحقل يوماً إلى استجابة العميل، فلا يجوز أن
      // يجد التطبيق طريقاً يحوّله إلى خصمٍ للزبون.
      final order = parse({
        'deliveryDiscount': 5000,
        'deliveryDiscountExcess': 1000,
      });
      expect(order.deliveryDiscount, 5000);
      expect(order.total, _price * 6);
      expect(order.productsTotal, _price * 6);
    });
  });
}
