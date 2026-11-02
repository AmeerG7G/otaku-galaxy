// خصم مزيّة المستوى من السلك إلى الشاشة — تحليل ردود الخادم.
//
// [CRITICAL REGRESSION] (2026-09-27) الخادم كان يحفظ `loyaltyDiscount` ويرسله
// مع كل طلب، ولم يقرأه التطبيق قط؛ وملخّص الدفع لم يكن موجوداً. هنا يُثبَت
// أن الحقلين يصلان كما أرسلهما الخادم ولا يُعاد حسابهما على العميل.

import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/features/orders/domain/entities/checkout_quote.dart';
import 'package:otaku_galaxy/features/orders/domain/entities/order.dart';

void main() {
  test('ملخّص الدفع: الخصمان والمزيّة والرسوم والإجمالي كما أرسلها الخادم', () {
    final quote = CheckoutQuote.fromJson({
      'productsTotal': 100000,
      'birthdayDiscount': 5000,
      'loyaltyDiscount': 3000,
      'loyaltyReward': {'levelKey': 'explorer', 'percent': 3, 'capAmount': 5000},
      'discount': 8000,
      'deliveryFee': 5000,
      'deliveryDiscount': 0,
      'total': 97000,
    });
    expect(quote.productsTotal, 100000);
    expect(quote.birthdayDiscount, 5000);
    expect(quote.loyaltyDiscount, 3000);
    expect(quote.loyaltyRewardLevelKey, 'explorer');
    expect(quote.loyaltyRewardPercent, 3);
    expect(quote.discount, 8000);
    expect(quote.deliveryFee, 5000);
    expect(quote.total, 97000);
  });

  test('ملخّص قبل اختيار المحافظة: لا رسوم ولا إجمالي، ولا مزيّة', () {
    final quote = CheckoutQuote.fromJson({
      'productsTotal': 20000,
      'birthdayDiscount': 0,
      'loyaltyDiscount': 0,
      'loyaltyReward': null,
      'discount': 0,
      'deliveryFee': null,
      'deliveryDiscount': 0,
      'total': null,
    });
    expect(quote.deliveryFee, isNull);
    expect(quote.total, isNull);
    expect(quote.loyaltyRewardLevelKey, isNull);
    expect(quote.discount, 0);
  });

  test('الطلب المحفوظ يحمل خصم المزيّة منفصلاً عن باقي الخصم', () {
    final order = Order.fromJson({
      'id': 'o1',
      'number': '1001',
      'status': 'PENDING_ADMIN_CONFIRMATION',
      'province': 'بغداد',
      'deliveryFee': 5000,
      'fullAddress': 'الكرادة',
      'phone': '+9647700000000',
      'productsTotal': 100000,
      'discount': 8000,
      'loyaltyDiscount': 3000,
      'total': 97000,
      'items': const [],
    });
    expect(order.discount, 8000);
    expect(order.loyaltyDiscount, 3000);
    expect(order.otherDiscount, 5000);
  });

  test('طلبٌ من خادمٍ أقدم بلا الحقل: لا مزيّة، والخصم كلّه كما كان', () {
    final order = Order.fromJson({
      'id': 'o1',
      'number': '1001',
      'status': 'PENDING_ADMIN_CONFIRMATION',
      'province': 'بغداد',
      'deliveryFee': 5000,
      'fullAddress': 'الكرادة',
      'phone': '+9647700000000',
      'productsTotal': 100000,
      'discount': 5000,
      'total': 100000,
      'items': const [],
    });
    expect(order.loyaltyDiscount, 0);
    expect(order.otherDiscount, 5000);
  });
}
